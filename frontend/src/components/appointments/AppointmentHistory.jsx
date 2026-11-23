import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './AppointmentHistory.css';
import { API_BASE } from '../../config/api';
import BankTransferQR from '../payment/BankTransferQR';
import HoldCountdown from './HoldCountdown';
import CalendarPicker from '../common/CalendarPicker';
import QueueEstimate from './QueueEstimate';
import ReviewBox from './ReviewBox';
import { printAppointmentSlip } from './printSlip';
import { bookingCodeOf } from './bookingCode';
import { useAuth } from '../../contexts/AuthContext';

/** YYYY-MM-DD in the viewer's local time (the API sends DATE columns as ISO timestamps) */
const toLocalYMD = (value) => {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = new Date(value);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** A booked appointment whose day has passed was never attended (no check-in) */
const effectiveStatus = (apt) => (
  apt.status === 'booked' && toLocalYMD(apt.appointmentDate || apt.appointment_date) < toLocalYMD(new Date()) ? 'no_show' : apt.status
);
const isPending = (apt) => ['booked', 'checked_in'].includes(effectiveStatus(apt));

const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('auth_token')}` });

const slotButtonStyle = (selected, available) => ({
  padding: '6px 4px',
  borderRadius: 6,
  border: selected ? '2px solid #108578' : '1px solid #d1d5db',
  background: selected ? '#d9f5f0' : available ? '#fff' : '#f3f4f6',
  color: available ? '#111827' : '#9ca3af',
  textDecoration: available ? 'none' : 'line-through',
  cursor: available ? 'pointer' : 'not-allowed',
  fontSize: 13
});

const AppointmentHistory = ({ onBack, initialFilter }) => {
  const { user } = useAuth();
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState(initialFilter || 'all'); // all, pending, completed, cancelled
  const [confirmingId, setConfirmingId] = useState(null);
  const [cancellingId, setCancellingId] = useState(null);
  const [message, setMessage] = useState(null); // { type: 'success' | 'error', text }
  // Reschedule panel: { id, doctorId, date, timeSlot, saving }
  const [reschedule, setReschedule] = useState(null);
  const [rescheduleSlots, setRescheduleSlots] = useState({ loading: false, slots: [], closed: null });
  const [rescheduleOff, setRescheduleOff] = useState({ weekdays: [0], dates: [] });
  // Appointment whose VietQR transfer panel is open
  const [transferId, setTransferId] = useState(null);
  // Reviews of finished visits, keyed by appointment id
  const [reviews, setReviews] = useState({});
  const [reviewWindow, setReviewWindow] = useState(30);

  useEffect(() => {
    axios.get(`${API_BASE}/reviews/mine`, { headers: authHeaders() })
      .then((res) => {
        const map = {};
        (res.data?.data?.reviews || []).forEach((r) => { map[r.appointment_id] = r; });
        setReviews(map);
        setReviewWindow(res.data?.data?.window_days || 30);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchAppointments();
  }, []);

  const rescheduleId = reschedule ? reschedule.id : null;
  const rescheduleDoctor = reschedule ? reschedule.doctorId : null;
  const rescheduleDate = reschedule ? reschedule.date : null;

  // Slots for the reschedule panel whenever its date changes
  useEffect(() => {
    if (!rescheduleId || !rescheduleDate) return undefined;
    let cancelled = false;
    setRescheduleSlots({ loading: true, slots: [] });
    axios.get(`${API_BASE}/appointments/slots`, {
      params: { doctorId: rescheduleDoctor, date: rescheduleDate }
    })
      .then((res) => { if (!cancelled) setRescheduleSlots({ loading: false, slots: res.data?.slots || [], closed: res.data?.closed || null }); })
      .catch(() => { if (!cancelled) setRescheduleSlots({ loading: false, slots: [], closed: null }); });
    return () => { cancelled = true; };
  }, [rescheduleId, rescheduleDoctor, rescheduleDate]);

  // Clinic closing weekdays + this doctor's days off, greyed out in the reschedule calendar
  useEffect(() => {
    if (!rescheduleDoctor) return undefined;
    let cancelled = false;
    axios.get(`${API_BASE}/doctor-leaves/public`, { params: { doctorId: rescheduleDoctor } })
      .then((res) => {
        if (cancelled) return;
        const d = res.data?.data || {};
        setRescheduleOff({ weekdays: d.closed_weekdays || [], dates: d.leave_dates || [] });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [rescheduleDoctor]);

  const openReschedule = (apt) => {
    setConfirmingId(null);
    setMessage(null);
    const today = toLocalYMD(new Date());
    const current = toLocalYMD(apt.appointmentDate);
    setReschedule({
      id: apt.id,
      doctorId: apt.doctor_id,
      date: current >= today ? current : today,
      timeSlot: '',
      saving: false
    });
  };

  const submitReschedule = async () => {
    if (!reschedule?.timeSlot) return;
    try {
      setReschedule((r) => ({ ...r, saving: true }));
      await axios.put(`${API_BASE}/appointments/${reschedule.id}/reschedule`, {
        appointmentDate: reschedule.date,
        timeSlot: reschedule.timeSlot
      }, { headers: authHeaders() });
      setMessage({
        type: 'success',
        text: `Đã đổi lịch hẹn #${reschedule.id} sang ${reschedule.timeSlot} ngày ${reschedule.date.split('-').reverse().join('/')}`
      });
      setReschedule(null);
      fetchAppointments();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error?.message || 'Không thể đổi lịch hẹn' });
      setReschedule((r) => r && { ...r, saving: false });
    }
  };

  /** Only a booked, not-yet-paid appointment from today onward can be cancelled online */
  const canCancel = (apt) => {
    if (apt.status !== 'booked' || apt.payment_status === 'paid') return false;
    const d = new Date(apt.appointmentDate);
    const today = new Date();
    d.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);
    return d >= today;
  };

  const handleCancel = async (id) => {
    try {
      setCancellingId(id);
      setMessage(null);
      await axios.put(`${API_BASE}/appointments/${id}/cancel`, {}, { headers: authHeaders() });
      setMessage({ type: 'success', text: `Đã huỷ lịch hẹn ${bookingCodeOf(appointments.find((x) => x.id === id) || { id })}` });
      setConfirmingId(null);
      fetchAppointments();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error?.message || 'Không thể huỷ lịch hẹn' });
    } finally {
      setCancellingId(null);
    }
  };

  const normalizeAppointment = (apt) => {
    const appointmentDate = apt.appointment_date || apt.appointmentDate || apt.date;
    const appointmentTime = apt.time_slot || apt.appointmentTime || apt.timeSlot || 'N/A';
    const doctorName = apt.doctor_name || apt.doctorName || 'Chưa xác định';
    const departmentName = apt.department_name || apt.departmentName || 'Chưa xác định';

    return {
      ...apt,
      id: apt.id,
      status: apt.status,
      appointment_date: appointmentDate,
      appointmentDate: appointmentDate,
      time_slot: appointmentTime,
      appointmentTime: appointmentTime,
      doctor_name: doctorName,
      doctorName: doctorName,
      department_name: departmentName,
      departmentName: departmentName,
      created_at: apt.created_at || apt.createdAt,
      createdAt: apt.created_at || apt.createdAt,
      symptoms: apt.symptoms || apt.note || '',
      notes: apt.notes || apt.symptoms || ''
    };
  };

  const fetchAppointments = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('auth_token');
      const response = await axios.get(`${API_BASE}/appointments/my-appointments`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.data.success) {
        const data = response.data.appointments || {};
        const upcoming = Array.isArray(data.upcoming) ? data.upcoming : [];
        const past = Array.isArray(data.past) ? data.past : [];
        const flat = Array.isArray(data) ? data : [...upcoming, ...past];
        setAppointments(flat.map(normalizeAppointment));
      }
    } catch (err) {
      console.error('Error fetching appointments:', err);
      // Don't silently show "no appointments" when loading actually failed
      setMessage({
        type: 'error',
        text: err.response?.status === 401
          ? 'Phiên đăng nhập đã hết hạn. Vui lòng đăng xuất và đăng nhập lại.'
          : err.response?.data?.error?.message || 'Không thể tải lịch hẹn. Kiểm tra backend đang chạy rồi tải lại trang.'
      });
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status) => {
    const statusConfig = {
      booked: { label: 'Đã xác nhận', color: '#108578', icon: '✓' },
      checked_in: { label: 'Đã check-in', color: '#3b82f6', icon: '✅' },
      completed: { label: 'Hoàn thành', color: '#10b981', icon: '✓' },
      cancelled: { label: 'Đã hủy', color: '#ef4444', icon: '✕' },
      no_show: { label: 'Không đến', color: '#b45309', icon: '⚠️' }
    };
    
    const config = statusConfig[status] || statusConfig.booked;
    return (
      <span className="status-badge" style={{ backgroundColor: `${config.color}20`, color: config.color }}>
        {config.icon} {config.label}
      </span>
    );
  };

  const filteredAppointments = appointments.filter(apt => {
    if (filter === 'all') return true;
    // Map filter values to backend status values
    if (filter === 'pending') return isPending(apt);
    if (filter === 'no_show') return effectiveStatus(apt) === 'no_show';
    return apt.status === filter;
  });

  if (loading) {
    return <div className="loading">Đang tải...</div>;
  }

  return (
    <div className="appointment-history-container">
      <div className="history-header">
        {onBack && (
          <button className="btn-back" onClick={onBack}>← Quay lại</button>
        )}
        <h1>📅 Lịch Sử Đặt Khám</h1>
        <p>Xem lại tất cả lịch hẹn của bạn</p>
      </div>

      {message && (
        <div
          role="status"
          style={{
            margin: '0 0 12px',
            padding: '10px 14px',
            borderRadius: 8,
            background: message.type === 'success' ? '#ecfdf5' : '#fef2f2',
            color: message.type === 'success' ? '#065f46' : '#991b1b',
            border: `1px solid ${message.type === 'success' ? '#a7f3d0' : '#fecaca'}`
          }}
        >
          {message.text}
        </div>
      )}

      <div className="filter-tabs">
        <button 
          className={filter === 'all' ? 'active' : ''}
          onClick={() => setFilter('all')}
        >
          Tất cả ({appointments.length})
        </button>
        <button 
          className={filter === 'pending' ? 'active' : ''}
          onClick={() => setFilter('pending')}
        >
          ⏳ Chờ khám ({appointments.filter(isPending).length})
        </button>
        <button 
          className={filter === 'completed' ? 'active' : ''}
          onClick={() => setFilter('completed')}
        >
          ✓ Hoàn thành ({appointments.filter(a => a.status === 'completed').length})
        </button>
        <button 
          className={filter === 'cancelled' ? 'active' : ''}
          onClick={() => setFilter('cancelled')}
        >
          ✕ Đã hủy ({appointments.filter(a => a.status === 'cancelled').length})
        </button>
        {appointments.some((a) => effectiveStatus(a) === 'no_show') && (
          <button
            className={filter === 'no_show' ? 'active' : ''}
            onClick={() => setFilter('no_show')}
          >
            ⚠️ Không đến ({appointments.filter((a) => effectiveStatus(a) === 'no_show').length})
          </button>
        )}
      </div>

      {filteredAppointments.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📋</div>
          <h3>Không có lịch hẹn nào</h3>
          <p>Bạn chưa có lịch hẹn {filter !== 'all' ? 'ở trạng thái này' : 'nào'}</p>
        </div>
      ) : (
        <div className="appointments-list">
          {filteredAppointments.map(appointment => (
            <div key={appointment.id} className="appointment-card">
              <div className="card-header">
                <div className="appointment-date">
                  <span className="date-icon">📅</span>
                  <div>
                    <strong>{new Date(appointment.appointmentDate).toLocaleDateString('vi-VN', {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}</strong>
                    <p className="time">⏰ {appointment.appointmentTime}</p>
                    <p className="booking-code-chip" title="Mã lịch hẹn – đọc mã này cho lễ tân nếu không quét được QR">🎫 {bookingCodeOf(appointment)}</p>
                  </div>
                </div>
                {getStatusBadge(effectiveStatus(appointment))}
              </div>

              <div className="card-body">
                <div className="info-row">
                  <span className="label">👨‍⚕️ Bác sĩ:</span>
                  <span className="value">{appointment.doctorName || 'Chưa xác định'}</span>
                </div>
                <div className="info-row">
                  <span className="label">🏥 Chuyên khoa:</span>
                  <span className="value">{appointment.departmentName}</span>
                </div>
                {appointment.symptoms && (
                  <div className="info-row">
                    <span className="label">🤒 Triệu chứng:</span>
                    <span className="value">{appointment.symptoms}</span>
                  </div>
                )}
                {appointment.consultation_fee != null && (
                  <div className="info-row">
                    <span className="label">💳 Phí khám:</span>
                    <span className="value">
                      {Number(appointment.consultation_fee).toLocaleString('vi-VN')} đ ·{' '}
                      {appointment.payment_status === 'paid'
                        ? 'Đã thanh toán'
                        : appointment.payment_status === 'refunded'
                          ? 'Đã hoàn tiền'
                          : appointment.payment_method === 'bank_transfer'
                            ? 'Chưa thanh toán · chuyển khoản'
                            : 'Chưa thanh toán · tại quầy'}
                    </span>
                  </div>
                )}
                {appointment.exam_type === 'insurance' && (
                  <div className="info-row">
                    <span className="label">🪪 Loại hình:</span>
                    <span className="value">Khám BHYT · thẻ {appointment.insurance_number}{appointment.insurance_expiry ? ` (HSD ${appointment.insurance_expiry.split('-').reverse().join('/')})` : ''}</span>
                  </div>
                )}
                {appointment.status === 'booked' && appointment.payment_status === 'unpaid' && Number(appointment.hold_seconds_left) > 0 && (
                  <HoldCountdown seconds={appointment.hold_seconds_left} />
                )}
                {['booked', 'checked_in'].includes(appointment.status)
                  && toLocalYMD(appointment.appointmentDate) === toLocalYMD(new Date()) && (
                  <QueueEstimate appointmentId={appointment.id} compact />
                )}
              </div>

              <div className="card-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <small>Đặt lúc: {new Date(appointment.createdAt).toLocaleString('vi-VN')}</small>
                {['booked', 'checked_in'].includes(effectiveStatus(appointment)) && (
                  <button type="button" onClick={() => printAppointmentSlip({
                    ...appointment,
                    patient_name: appointment.patient_name || user?.fullName,
                    patient_phone: appointment.patient_phone || user?.phone
                  })}
                    style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff', color: '#334155', cursor: 'pointer' }}>
                    🖨 In phiếu
                  </button>
                )}
                {appointment.status !== 'cancelled' && appointment.payment_status === 'unpaid' && (
                  <button type="button" onClick={() => setTransferId(transferId === appointment.id ? null : appointment.id)}
                    style={{ marginLeft: 'auto', padding: '4px 12px', borderRadius: 6, border: '1px solid #8edfd4', background: transferId === appointment.id ? '#d9f5f0' : '#fff', color: '#108578', cursor: 'pointer' }}>
                    {transferId === appointment.id ? 'Ẩn mã chuyển khoản' : '🏦 Chuyển khoản'}
                  </button>
                )}
                {canCancel(appointment) && rescheduleId !== appointment.id && confirmingId !== appointment.id && (
                  <button type="button" onClick={() => openReschedule(appointment)}
                    style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid #b9ece5', background: '#fff', color: '#108578', cursor: 'pointer' }}>
                    Đổi lịch
                  </button>
                )}
                {canCancel(appointment) && rescheduleId !== appointment.id && (
                  confirmingId === appointment.id ? (
                    <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                      <small>Huỷ lịch hẹn này?</small>
                      <button type="button" onClick={() => setConfirmingId(null)} disabled={cancellingId === appointment.id}
                        style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer' }}>
                        Không
                      </button>
                      <button type="button" onClick={() => handleCancel(appointment.id)} disabled={cancellingId === appointment.id}
                        style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: '#dc2626', color: '#fff', cursor: 'pointer' }}>
                        {cancellingId === appointment.id ? 'Đang huỷ…' : 'Xác nhận huỷ'}
                      </button>
                    </span>
                  ) : (
                    <button type="button" onClick={() => setConfirmingId(appointment.id)}
                      style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid #fca5a5', background: '#fff', color: '#dc2626', cursor: 'pointer' }}>
                      Huỷ lịch
                    </button>
                  )
                )}
              </div>

              {appointment.status === 'completed' && (() => {
                const days = Math.floor((new Date(toLocalYMD(new Date())) - new Date(toLocalYMD(appointment.appointmentDate))) / 86400000);
                const canEdit = days <= reviewWindow;
                if (!canEdit && !reviews[appointment.id]) return null;
                return (
                  <div style={{ padding: '0 16px 12px' }}>
                    <ReviewBox
                      appointmentId={appointment.id}
                      review={reviews[appointment.id]}
                      canEdit={canEdit}
                      onSaved={(r) => setReviews((m) => ({ ...m, [appointment.id]: r }))}
                    />
                  </div>
                );
              })()}

              {transferId === appointment.id && (
                <div className="transfer-wrap">
                  <BankTransferQR appointmentId={appointment.id} />
                </div>
              )}

              {rescheduleId === appointment.id && (
                <div style={{ borderTop: '1px solid #e5e7eb', padding: '12px 16px', background: '#f9fafb' }}>
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ marginBottom: 8 }}><strong>Ngày mới:</strong></div>
                    <CalendarPicker
                      id={`reschedule-date-${appointment.id}`}
                      value={reschedule.date}
                      min={toLocalYMD(new Date())}
                      max={toLocalYMD(new Date(Date.now() + 90 * 86400000))}
                      onChange={(ymd) => setReschedule((r) => ({ ...r, date: ymd, timeSlot: '' }))}
                      disabledWeekdays={rescheduleOff.weekdays}
                      disabledDates={rescheduleOff.dates}
                    />
                  </div>
                  <div style={{ marginBottom: 8 }}><strong>Khung giờ còn trống:</strong></div>
                  {rescheduleSlots.loading ? (
                    <small>Đang tải khung giờ…</small>
                  ) : rescheduleSlots.slots.filter((s) => s.available).length === 0 ? (
                    <small style={{ color: '#b91c1c' }}>
                      {rescheduleSlots.closed ? rescheduleSlots.closed.message : 'Bác sĩ không còn khung trống ngày này, vui lòng chọn ngày khác.'}
                    </small>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 6 }}>
                      {rescheduleSlots.slots.map((slot) => (
                        <button
                          key={slot.time_slot}
                          type="button"
                          disabled={!slot.available}
                          onClick={() => setReschedule((r) => ({ ...r, timeSlot: slot.time_slot }))}
                          style={slotButtonStyle(reschedule.timeSlot === slot.time_slot, slot.available)}
                        >
                          {slot.time_slot}
                          {slot.capacity > 1 && !slot.past && (
                            <span className="slot-remaining">
                              {slot.full ? 'Đã đủ' : `còn ${slot.remaining}/${slot.capacity}`}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
                    <button type="button" onClick={() => setReschedule(null)} disabled={reschedule.saving}
                      style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer' }}>
                      Đóng
                    </button>
                    <button type="button" onClick={submitReschedule} disabled={!reschedule.timeSlot || reschedule.saving}
                      style={{ padding: '6px 12px', borderRadius: 6, border: 'none', background: reschedule.timeSlot ? '#108578' : '#9ca3af', color: '#fff', cursor: reschedule.timeSlot ? 'pointer' : 'not-allowed' }}>
                      {reschedule.saving ? 'Đang lưu…' : 'Xác nhận đổi lịch'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AppointmentHistory;
