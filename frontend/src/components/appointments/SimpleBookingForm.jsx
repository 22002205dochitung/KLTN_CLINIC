import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import QRCodeDisplay from './QRCodeDisplay';
import BankTransferQR from '../payment/BankTransferQR';
import CalendarPicker from '../common/CalendarPicker';
import SearchSelect from '../common/SearchSelect';
import SmartSuggestions from './SmartSuggestions';
import HoldCountdown from './HoldCountdown';
import { printAppointmentSlip } from './printSlip';
import { bookingCodeOf } from './bookingCode';
import { useAuth } from '../../contexts/AuthContext';
import './SimpleBookingForm.css';

import { API_BASE } from '../../config/api';

const formatCurrency = (amount) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 })
    .format(Number(amount) || 0);

/** YYYY-MM-DD in local time (toISOString() would give yesterday before 7am in Vietnam) */
const localDaysFromNow = (days) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const localToday = () => localDaysFromNow(0);

const formatDate = (value) => {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString('vi-VN');
};

/**
 * SimpleBookingForm - Form đăng ký khám
 *
 * - Bệnh nhân đã đăng nhập: tự điền thông tin của mình, lịch hẹn gắn vào tài khoản.
 * - Khách / lễ tân đặt hộ: nhập họ tên + SĐT của người khám.
 * - Chọn khung giờ thật (đã ẩn giờ kín / đã qua). Phí khám trả tại quầy hoặc chuyển khoản VietQR.
 */
/**
 * prefill (optional): { departmentId, doctorId, appointmentDate, symptoms, reason }
 * e.g. a follow-up visit opened from "Lịch tái khám" on the patient dashboard.
 */
// Thẻ BHYT 15 ký tự: 2 chữ + mức hưởng (1–5) + 2 số tỉnh + 10 số BHXH
const INSURANCE_REGEX = /^[A-Z]{2}[1-5]\d{12}$/;
const COVERAGE = { 1: 100, 2: 100, 3: 95, 4: 80, 5: 100 };

const SimpleBookingForm = ({ isModal = false, onClose = null, prefill = null }) => {
  const { user } = useAuth();
  const isPatient = user?.role === 'patient';
  const isStaff = user && ['receptionist', 'admin'].includes(user.role);

  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    birthDate: '',
    phone: '',
    gender: '',
    address: '',
    departmentId: '',
    doctorId: '',
    appointmentDate: '',
    timeSlot: '',
    symptoms: '',
    paymentMethod: 'cash', // 'cash' = pay at the counter, 'bank_transfer' = VietQR after booking
    examType: 'service', // 'service' = khám dịch vụ, 'insurance' = khám BHYT
    insuranceNumber: '',
    insuranceExpiry: ''
  });

  const [departments, setDepartments] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [prefillApplied, setPrefillApplied] = useState(false);
  // Smart recommendation: which suggestion the patient applied (sent with the booking)
  const [suggestion, setSuggestion] = useState(null); // { key, departmentId, source }
  const [slotRecs, setSlotRecs] = useState([]);

  // Apply the prefill once departments/doctors are loaded (so the selects have those options)
  useEffect(() => {
    if (!prefill || prefillApplied || doctors.length === 0) return;
    const doctor = doctors.find((d) => Number(d.doctor_id ?? d.id) === Number(prefill.doctorId));
    const departmentId = prefill.departmentId || doctor?.department_id || '';
    const today = localToday();
    const date = prefill.appointmentDate && prefill.appointmentDate >= today && prefill.appointmentDate <= localDaysFromNow(90)
      ? prefill.appointmentDate
      : '';
    setFormData((prev) => ({
      ...prev,
      departmentId: departmentId ? String(departmentId) : prev.departmentId,
      doctorId: doctor ? String(doctor.doctor_id ?? doctor.id) : prev.doctorId,
      appointmentDate: date || prev.appointmentDate,
      timeSlot: '',
      symptoms: prefill.symptoms || prev.symptoms
    }));
    if (prefill.reason && departmentId) {
      setSuggestion({ key: `${departmentId}-`, departmentId: String(departmentId), source: 'followup' });
    }
    setPrefillApplied(true);
  }, [prefill, prefillApplied, doctors]);
  const [slots, setSlots] = useState([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  // Why the chosen day has no slots (clinic closed / doctor on leave), from the slots API
  const [dayClosed, setDayClosed] = useState(null);
  // Days to grey out in the calendar
  const [offDays, setOffDays] = useState({ weekdays: [0], dates: [] });

  // Clinic closing weekdays + the chosen doctor's days off
  useEffect(() => {
    let cancelled = false;
    axios.get(`${API_BASE}/doctor-leaves/public`, { params: formData.doctorId ? { doctorId: formData.doctorId } : {} })
      .then((res) => {
        if (cancelled) return;
        const d = res.data?.data || {};
        setOffDays({ weekdays: d.closed_weekdays || [], dates: d.leave_dates || [] });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [formData.doctorId]);

  // A date chosen before picking the doctor may be one of the doctor's days off
  useEffect(() => {
    const ymd = formData.appointmentDate;
    if (!ymd) return;
    const [y, m, d] = ymd.split('-').map(Number);
    const weekday = new Date(y, m - 1, d).getDay();
    if (offDays.weekdays.includes(weekday) || offDays.dates.includes(ymd)) {
      setFormData((prev) => ({ ...prev, appointmentDate: '', timeSlot: '' }));
    }
  }, [offDays, formData.appointmentDate]);
  const [fee, setFee] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [appointmentResult, setAppointmentResult] = useState(null);
  const payRef = useRef(null);

  // Bank transfer chosen: bring the payment panel into view as soon as the booking succeeds
  useEffect(() => {
    if (success && payRef.current && payRef.current.scrollIntoView) {
      payRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [success]);

  const filteredDoctors = formData.departmentId
    ? doctors.filter(doc => Number(doc.department_id) === Number(formData.departmentId))
    : [];

  useEffect(() => {
    loadDepartments();
    // Only a patient books for themselves; staff fill in the patient's details
    if (isPatient) {
      setFormData(prev => ({
        ...prev,
        fullName: user.fullName || '',
        email: user.email || '',
        phone: user.phone || ''
      }));
    }
  }, [user, isPatient]);

  // Consultation fee of the selected department
  useEffect(() => {
    if (!formData.departmentId) {
      setFee(null);
      return;
    }
    axios.get(`${API_BASE}/payments/consultation-fees/${formData.departmentId}`)
      .then(res => setFee(res.data?.fee_amount ?? null))
      .catch(() => setFee(null));
  }, [formData.departmentId]);

  // Available time slots for the selected doctor + date
  useEffect(() => {
    if (!formData.doctorId || !formData.appointmentDate) {
      setSlots([]);
      return;
    }
    let cancelled = false;
    setSlotsLoading(true);
    axios.get(`${API_BASE}/appointments/slots`, {
      params: { doctorId: formData.doctorId, date: formData.appointmentDate }
    })
      .then(res => {
        if (!cancelled) {
          setSlots(res.data?.slots || []);
          setDayClosed(res.data?.closed || null);
        }
      })
      .catch(err => {
        if (!cancelled) {
          setSlots([]);
          setError(err.response?.data?.error?.message || 'Không thể tải khung giờ');
        }
      })
      .finally(() => { if (!cancelled) setSlotsLoading(false); });
    return () => { cancelled = true; };
  }, [formData.doctorId, formData.appointmentDate]);

  // Recommended slots for the chosen doctor/day (patient habit, fewer people, earliest)
  useEffect(() => {
    if (!formData.doctorId || !formData.appointmentDate) {
      setSlotRecs([]);
      return;
    }
    let cancelled = false;
    const token = localStorage.getItem('auth_token');
    const params = { doctorId: formData.doctorId, date: formData.appointmentDate };
    if (isStaff && /^0\d{9}$/.test(formData.phone)) params.phone = formData.phone;
    axios.get(`${API_BASE}/recommendations/slots`, { params, headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then((res) => { if (!cancelled) setSlotRecs(res.data?.data?.slots || []); })
      .catch(() => { if (!cancelled) setSlotRecs([]); });
    return () => { cancelled = true; };
  }, [formData.doctorId, formData.appointmentDate, formData.phone, isStaff]);

  const applySuggestion = (s) => {
    setFormData((prev) => ({
      ...prev,
      departmentId: String(s.departmentId),
      doctorId: s.doctorId ? String(s.doctorId) : '',
      appointmentDate: s.appointmentDate || prev.appointmentDate,
      timeSlot: s.timeSlot || ''
    }));
    setSuggestion({ key: s.key, departmentId: String(s.departmentId), source: s.source });
    setError('');
  };

  const loadDepartments = async () => {
    try {
      const response = await axios.get(`${API_BASE}/appointments/doctors`);
      if (response.data.success) {
        // Only departments that actually have doctors can be booked
        setDepartments((response.data.departments || []).filter(d => d.doctor_count > 0));
        setDoctors(response.data.doctors || []);
      }
    } catch (err) {
      setError('Không thể tải danh sách chuyên khoa. Vui lòng thử lại.');
    }
  };

  const handleChange = (field, value) => {
    setFormData(prev => {
      const next = { ...prev, [field]: value };
      if (field === 'departmentId' && suggestion && String(value) !== suggestion.departmentId) {
        setSuggestion(null); // patient moved away from the suggested specialty
      }
      if (field === 'departmentId') {
        next.doctorId = '';
        next.timeSlot = '';
      }
      if (field === 'doctorId' || field === 'appointmentDate') {
        next.timeSlot = '';
      }
      return next;
    });
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.fullName.trim()) return setError('Vui lòng nhập họ tên');
    if (!/^0[0-9]{9}$/.test(formData.phone.trim())) return setError('Số điện thoại không hợp lệ (10 chữ số, bắt đầu bằng 0)');
    if (!formData.departmentId) return setError('Vui lòng chọn chuyên khoa');
    if (!formData.doctorId) return setError('Vui lòng chọn bác sĩ');
    if (!formData.appointmentDate) return setError('Vui lòng chọn ngày khám');
    if (!formData.timeSlot) return setError('Vui lòng chọn khung giờ khám');
    if (formData.examType === 'insurance') {
      if (!INSURANCE_REGEX.test(formData.insuranceNumber)) return setError('Số thẻ BHYT không hợp lệ (15 ký tự, VD: DN4797915396725)');
      if (!formData.insuranceExpiry) return setError('Vui lòng nhập hạn sử dụng thẻ BHYT');
      if (formData.insuranceExpiry < formData.appointmentDate) return setError('Thẻ BHYT hết hạn trước ngày khám');
    }

    try {
      setLoading(true);
      setError('');

      const token = localStorage.getItem('auth_token');
      const response = await axios.post(
        `${API_BASE}/appointments/public/create`,
        {
          fullName: formData.fullName.trim(),
          phone: formData.phone.trim(),
          doctorId: Number(formData.doctorId),
          appointmentDate: formData.appointmentDate,
          timeSlot: formData.timeSlot,
          symptoms: formData.symptoms.trim() || null,
          paymentMethod: formData.examType === 'insurance' ? 'cash' : formData.paymentMethod,
          examType: formData.examType,
          insuranceNumber: formData.examType === 'insurance' ? formData.insuranceNumber : undefined,
          insuranceExpiry: formData.examType === 'insurance' ? formData.insuranceExpiry : undefined,
          bookingSource: suggestion && suggestion.departmentId === String(formData.departmentId)
            ? suggestion.source
            : (slotRecs.some((r) => r.time_slot === formData.timeSlot) ? 'slot' : undefined)
        },
        // Sending the token lets the server attach the booking to the logged-in patient
        token ? { headers: { Authorization: `Bearer ${token}` } } : {}
      );

      if (response.data.success) {
        setAppointmentResult(response.data.appointment);
        setSuccess(true);
      } else {
        setError(response.data.message || 'Đặt lịch không thành công');
      }
    } catch (err) {
      const data = err.response?.data;
      setError(data?.message || data?.error?.message || 'Có lỗi xảy ra. Vui lòng thử lại.');
      if (err.response?.status === 409) {
        // Slot was taken meanwhile: refresh the slot list
        setFormData(prev => ({ ...prev, timeSlot: '' }));
        axios.get(`${API_BASE}/appointments/slots`, {
          params: { doctorId: formData.doctorId, date: formData.appointmentDate }
        }).then(res => setSlots(res.data?.slots || [])).catch(() => {});
      }
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setSuccess(false);
    setAppointmentResult(null);
    setFormData(prev => ({
      ...prev,
      ...(isPatient ? {} : { fullName: '', email: '', phone: '', birthDate: '', gender: '', address: '' }),
      doctorId: '',
      appointmentDate: '',
      timeSlot: '',
      symptoms: '',
      paymentMethod: 'cash'
    }));
  };

  if (success && appointmentResult) {
    const fee = Number(appointmentResult.consultation_fee ?? appointmentResult.consultationFee ?? 0);
    const paidByTransfer = (appointmentResult.payment_method || appointmentResult.paymentMethod) === 'bank_transfer';
    return (
      <div className={`simple-booking-form ${isModal ? 'modal-style' : ''}`}>
        <div className="success-message">
          <div className="success-icon">✓</div>
          <h2>Đặt lịch thành công!</h2>
          {appointmentResult.booking_code && (
            <div className="booking-code-ticket" role="status">
              <span>MÃ LỊCH HẸN CỦA BẠN</span>
              <strong>{appointmentResult.booking_code}</strong>
              <small>
                Số thứ tự đặt lịch <b>{Number(appointmentResult.booking_code.split('-').pop())}</b> của {appointmentResult.department || appointmentResult.department_name || 'khoa'} trong ngày ·
                đọc mã này cho lễ tân nếu không quét được QR
              </small>
            </div>
          )}
          {paidByTransfer ? (
            <>
              <p>Thanh toán phí khám ngay bằng mã QR bên dưới. Sau đó đưa mã QR check-in cho lễ tân khi đến khám.</p>
              {appointmentResult.hold_seconds_left > 0 && <HoldCountdown seconds={appointmentResult.hold_seconds_left} />}
              <div ref={payRef} style={{ scrollMarginTop: 90 }}>
                <BankTransferQR appointmentId={appointmentResult.id} />
              </div>
            </>
          ) : (
            <p>
              Lịch hẹn đã được <strong>xác nhận tự động</strong>. Đến phòng khám đúng giờ và quét mã QR bên dưới tại quầy để check-in, không cần chờ duyệt.
              {appointmentResult.exam_type === 'insurance' && (
                <> Khám <strong>BHYT</strong> (thẻ {appointmentResult.insurance_number}) – nhớ mang thẻ BHYT/CCCD, phần đồng chi trả thanh toán tại quầy.</>
              )}
            </p>
          )}

          <div className="appointment-details">
            <h3>📋 Thông tin lịch hẹn</h3>
            <div className="detail-row">
              <span className="detail-label">Mã lịch hẹn:</span>
              <span className="detail-value booking-code-value">{bookingCodeOf(appointmentResult)}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Họ tên:</span>
              <span className="detail-value">{appointmentResult.patient_name}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Số điện thoại:</span>
              <span className="detail-value">{appointmentResult.patient_phone}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Bác sĩ:</span>
              <span className="detail-value">{appointmentResult.doctor_name} – {appointmentResult.department_name}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Ngày khám:</span>
              <span className="detail-value">{formatDate(appointmentResult.appointment_date)}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Giờ khám:</span>
              <span className="detail-value">{appointmentResult.time_slot}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Phí khám:</span>
              <span className="detail-value">
                {formatCurrency(fee)} – {paidByTransfer ? 'chuyển khoản ngân hàng' : 'thanh toán tại quầy'}
              </span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Trạng thái:</span>
              <span className="detail-value status-pending">Đã xác nhận – đến khám và quét QR</span>
            </div>
          </div>

          <div className="qr-section">
            <h3>📱 Mã QR Check-in</h3>
            <p className="qr-instruction">Quét mã này tại quầy lễ tân để check-in nhanh</p>
            <QRCodeDisplay appointment={appointmentResult} size={200} />
          </div>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              className="btn-close-success"
              onClick={() => {
                if (!printAppointmentSlip(appointmentResult)) {
                  setError('Trình duyệt đang chặn cửa sổ in. Hãy cho phép pop-up rồi bấm lại.');
                }
              }}
            >
              🖨 In phiếu khám
            </button>
            {isStaff && (
              <button className="btn-close-success" onClick={resetForm}>Đặt lịch cho bệnh nhân khác</button>
            )}
            {isModal && (
              <button className="btn-close-success" onClick={onClose}>Đóng</button>
            )}
          </div>
        </div>
      </div>
    );
  }

  const availableCount = slots.filter(s => s.available).length;
  // Why nothing can be picked: day off, today's hours are over, or every slot is full
  const allOver = slots.length > 0 && slots.every((s) => s.past);
  const nextOpenDay = (() => {
    for (let i = 1; i <= 14; i++) {
      const ymd = localDaysFromNow(i);
      const [y, m, d] = ymd.split('-').map(Number);
      if (!offDays.weekdays.includes(new Date(y, m - 1, d).getDay()) && !offDays.dates.includes(ymd)) return ymd;
    }
    return null;
  })();

  return (
    <div className={`simple-booking-form ${isModal ? 'modal-style' : ''}`}>
      {isModal && (
        <button className="btn-close-modal" onClick={onClose}>✕</button>
      )}

      <div className="booking-container">
        {/* Left Panel - Instructions */}
        <div className="instructions-panel">
          <h3>Lưu ý:</h3>
          <div className="instruction-item">
            <span className="instruction-icon">📋</span>
            <p>Chọn chuyên khoa, bác sĩ, ngày và khung giờ còn trống. Mỗi khung giờ 30 phút nhận tối đa 10 bệnh nhân; đến nơi quét QR, ai check-in trước được khám trước.</p>
          </div>
          <div className="instruction-item">
            <span className="instruction-icon">📱</span>
            <p>Sau khi đặt lịch, bạn nhận được mã QR. Đưa mã này cho lễ tân khi đến khám để check-in và vào hàng đợi.</p>
          </div>
          <div className="instruction-item">
            <span className="instruction-icon">💳</span>
            <p>Phí khám theo bảng giá của từng chuyên khoa. Bạn chọn thanh toán tại quầy hoặc chuyển khoản qua mã VietQR (quét bằng app ngân hàng bất kỳ).</p>
          </div>
          <div className="instruction-item">
            <span className="instruction-icon">⏰</span>
            <p>Vui lòng đến trước giờ hẹn 10–15 phút. Trường hợp khẩn cấp, gọi hotline 1900-1234 để được hỗ trợ ngay.</p>
          </div>
        </div>

        {/* Right Panel - Form */}
        <div className="form-panel">
          <div className="form-header">
            <h2>ĐĂNG KÝ KHÁM</h2>
            <p>
              {isStaff
                ? 'Đặt lịch hộ bệnh nhân: nhập họ tên và số điện thoại của người đến khám.'
                : 'Vui lòng điền thông tin vào form dưới đây để đăng ký khám bệnh.'}
            </p>
          </div>

          {prefill && prefill.reason && (
            <div className="booking-prefill-note" role="status">
              🔁 {prefill.reason}. Khoa, bác sĩ và ngày đã được điền sẵn – bạn chỉ cần chọn khung giờ.
            </div>
          )}

          {error && (
            <div className="alert-error">
              <span className="alert-icon">⚠️</span>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label" htmlFor="booking-fullname">Họ và tên <span className="required">*</span></label>
                <input
                  id="booking-fullname"
                  type="text"
                  placeholder="Họ và tên"
                  value={formData.fullName}
                  onChange={(e) => handleChange('fullName', e.target.value)}
                  readOnly={isPatient}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="booking-phone">Số điện thoại <span className="required">*</span></label>
                <input
                  id="booking-phone"
                  type="tel"
                  placeholder="0xxxxxxxxx"
                  value={formData.phone}
                  onChange={(e) => handleChange('phone', e.target.value.replace(/\D/g, '').slice(0, 10))}
                  readOnly={isPatient}
                  pattern="0[0-9]{9}"
                  required
                />
              </div>
            </div>

            <div className="form-group full-width">
              <label className="form-label" htmlFor="booking-symptoms">Bạn đang gặp triệu chứng gì?</label>
              <textarea
                id="booking-symptoms"
                placeholder="VD: ho, đau họng, sốt nhẹ 2 ngày… (không bắt buộc – giúp hệ thống gợi ý chuyên khoa)"
                value={formData.symptoms}
                onChange={(e) => handleChange('symptoms', e.target.value)}
                rows="3"
                maxLength="500"
              />
            </div>

            <SmartSuggestions
              symptoms={formData.symptoms}
              patientPhone={isStaff ? formData.phone : ''}
              appliedKey={suggestion ? suggestion.key : null}
              onApply={applySuggestion}
            />

            <div className="form-group full-width">
              <label className="form-label" htmlFor="booking-department">Chuyên khoa <span className="required">*</span></label>
              <SearchSelect
                id="booking-department"
                value={formData.departmentId}
                onChange={(v) => handleChange('departmentId', v)}
                options={departments.map((dept) => ({ value: dept.id, label: dept.name }))}
                placeholder="Gõ để tìm chuyên khoa (VD: tim, nhi, mắt…)"
                emptyText="Không có chuyên khoa phù hợp"
                required
              />
              {fee !== null && (
                <small style={{ display: 'block', marginTop: 6, color: '#4b5563' }}>
                  Phí khám: <strong>{formatCurrency(fee)}</strong>
                  {formData.paymentMethod === 'bank_transfer' ? ' (chuyển khoản VietQR sau khi đặt)' : ' (thanh toán tại quầy)'}
                </small>
              )}
            </div>

            {formData.departmentId && (
              <div className="form-group full-width">
                <label className="form-label" htmlFor="booking-doctor">Bác sĩ <span className="required">*</span></label>
                <SearchSelect
                  id="booking-doctor"
                  value={formData.doctorId}
                  onChange={(v) => handleChange('doctorId', v)}
                  options={filteredDoctors.map((doctor) => ({
                    value: doctor.doctor_id,
                    label: doctor.full_name,
                    hint: [
                      doctor.degree,
                      Number(doctor.review_count) > 0 ? `★${Number(doctor.avg_rating).toFixed(1)} (${doctor.review_count} đánh giá)` : null
                    ].filter(Boolean).join(' · ')
                  }))}
                  placeholder={`Gõ tên bác sĩ (${filteredDoctors.length} bác sĩ)`}
                  emptyText="Không có bác sĩ phù hợp"
                  required
                />
              </div>
            )}

            <div className="form-group full-width">
              <label className="form-label" htmlFor="booking-date">
                Ngày khám <span className="required">*</span>
              </label>
              <CalendarPicker
                id="booking-date"
                placeholder="Bấm để chọn ngày khám"
                value={formData.appointmentDate}
                onChange={(ymd) => handleChange('appointmentDate', ymd)}
                min={localToday()}
                max={localDaysFromNow(90)}
                disabledWeekdays={offDays.weekdays}
                disabledDates={offDays.dates}
              />
            </div>

            {formData.doctorId && formData.appointmentDate && (
              <div className="form-group full-width">
                <label className="form-label">
                  Khung giờ <span className="required">*</span>
                  {!slotsLoading && slots.length > 0 && (
                    <span style={{ fontWeight: 400, color: '#6b7280' }}> – còn {availableCount} khung trống</span>
                  )}
                </label>
                {slotsLoading ? (
                  <p style={{ color: '#6b7280', margin: '6px 0' }}>Đang tải khung giờ…</p>
                ) : availableCount === 0 ? (
                  <div style={{ margin: '6px 0' }}>
                    <p style={{ color: '#b91c1c', margin: '0 0 8px' }}>
                      {dayClosed
                        ? dayClosed.message
                        : allOver
                          ? `Hôm nay đã hết giờ nhận khám (ca cuối kết thúc lúc ${slots[slots.length - 1].time_slot.split('-')[1]}). Vui lòng chọn ngày khác.`
                          : 'Bác sĩ đã kín lịch ngày này (mỗi khung giờ tối đa đủ người). Vui lòng chọn ngày khác.'}
                    </p>
                    {nextOpenDay && nextOpenDay !== formData.appointmentDate && (
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => handleChange('appointmentDate', nextOpenDay)}
                      >
                        📅 Chọn ngày {formatDate(nextOpenDay)}
                      </button>
                    )}
                  </div>
                ) : (
                  <>
                  {slotRecs.length > 0 && (
                    <p className="slot-rec-note">
                      ⭐ Gợi ý <b>{slotRecs[0].time_slot}</b>: {slotRecs[0].reasons.join(' · ') || 'khung giờ phù hợp'}
                    </p>
                  )}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 8 }}>
                    {slots.map(slot => {
                      const selected = formData.timeSlot === slot.time_slot;
                      return (
                        <button
                          key={slot.time_slot}
                          type="button"
                          disabled={!slot.available}
                          onClick={() => handleChange('timeSlot', slot.time_slot)}
                          title={slot.past ? 'Đã qua' : slot.full || slot.booked ? 'Đã đủ người' : slot.capacity ? `Còn ${slot.remaining}/${slot.capacity} chỗ` : 'Còn trống'}
                          style={{
                            padding: '8px 6px',
                            borderRadius: 8,
                            border: selected ? '2px solid #108578' : '1px solid #d1d5db',
                            background: selected ? '#d9f5f0' : slot.available ? '#fff' : '#f3f4f6',
                            color: slot.available ? '#111827' : '#9ca3af',
                            textDecoration: slot.available ? 'none' : 'line-through',
                            cursor: slot.available ? 'pointer' : 'not-allowed',
                            fontWeight: selected ? 700 : 500,
                            fontSize: 14
                          }}
                        >
                          {slotRecs.some((r) => r.time_slot === slot.time_slot) && slot.available && (
                            <span className="slot-star">⭐ Gợi ý</span>
                          )}
                          {slot.time_slot}
                          {slot.capacity > 1 && !slot.past && (
                            <span className="slot-remaining">
                              {slot.full ? 'Đã đủ' : `còn ${slot.remaining}/${slot.capacity}`}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  </>
                )}
              </div>
            )}


            <fieldset className="form-group full-width" style={{ border: 'none', padding: 0, margin: 0 }}>
              <legend className="form-label">Loại hình khám</legend>
              <div className="payment-options">
                {[
                  { value: 'service', icon: '🩺', title: 'Khám dịch vụ', desc: fee != null ? `Phí khám ${formatCurrency(fee)}` : 'Theo bảng giá chuyên khoa' },
                  { value: 'insurance', icon: '💳', title: 'Khám bảo hiểm y tế', desc: 'Nhập số thẻ BHYT – BHYT chi trả theo mức hưởng' }
                ].map((opt) => {
                  const selected = formData.examType === opt.value;
                  return (
                    <label key={opt.value} className={`payment-option ${selected ? 'is-selected' : ''}`}>
                      <input
                        type="radio"
                        name="booking-exam-type"
                        value={opt.value}
                        checked={selected}
                        onChange={() => handleChange('examType', opt.value)}
                        className="payment-option-input"
                      />
                      <span className="payment-option-icon" aria-hidden="true">{opt.icon}</span>
                      <span className="payment-option-text">
                        <span className="payment-option-title">{opt.title}</span>
                        <span className="payment-option-desc">{opt.desc}</span>
                      </span>
                      <span className="payment-option-check" aria-hidden="true">{selected ? '✓' : ''}</span>
                    </label>
                  );
                })}
              </div>
              {formData.examType === 'insurance' && (
                <div className="insurance-fields">
                  <div className="form-group">
                    <label className="form-label" htmlFor="booking-insurance">Số thẻ BHYT <span className="required">*</span></label>
                    <input
                      id="booking-insurance"
                      type="text"
                      placeholder="VD: DN4797915396725"
                      value={formData.insuranceNumber}
                      onChange={(e) => handleChange('insuranceNumber', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 15))}
                      maxLength={15}
                      autoComplete="off"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="booking-insurance-expiry">Hạn sử dụng thẻ <span className="required">*</span></label>
                    <input
                      id="booking-insurance-expiry"
                      type="date"
                      value={formData.insuranceExpiry}
                      min={formData.appointmentDate || localToday()}
                      onChange={(e) => handleChange('insuranceExpiry', e.target.value)}
                    />
                  </div>
                  {INSURANCE_REGEX.test(formData.insuranceNumber) ? (
                    <p className="insurance-note">
                      ✓ Mức hưởng {COVERAGE[Number(formData.insuranceNumber[2])]}% (đúng tuyến)
                      {fee != null && ` – dự kiến đồng chi trả ${formatCurrency(fee * (100 - COVERAGE[Number(formData.insuranceNumber[2])]) / 100)}, thanh toán tại quầy`}
                    </p>
                  ) : formData.insuranceNumber ? (
                    <p className="insurance-note is-error">Số thẻ gồm 15 ký tự: 2 chữ cái, 1 số mức hưởng (1–5), 12 chữ số.</p>
                  ) : null}
                </div>
              )}
            </fieldset>

            {formData.examType === 'insurance' ? (
              <p className="insurance-note">💵 Khám BHYT: thanh toán phần đồng chi trả tại quầy khi đến khám (mang theo thẻ BHYT hoặc CCCD gắn chip).</p>
            ) : (
            <fieldset className="form-group full-width" style={{ border: 'none', padding: 0, margin: 0 }}>
              <legend className="form-label">
                Hình thức thanh toán phí khám
                {fee != null && (
                  <span style={{ fontWeight: 400, color: '#6b7280' }}> – {formatCurrency(fee)}</span>
                )}
              </legend>
              <div className="payment-options">
                {[
                  { value: 'cash', icon: '💵', title: 'Thanh toán tại quầy', desc: 'Tiền mặt hoặc thẻ khi đến khám' },
                  { value: 'bank_transfer', icon: '🏦', title: 'Chuyển khoản VietQR', desc: 'Quét mã bằng app ngân hàng ngay sau khi đặt – giữ chỗ 15 phút, quá hạn chưa thanh toán lịch tự huỷ', badge: 'Nhanh' }
                ].map((opt) => {
                  const selected = formData.paymentMethod === opt.value;
                  return (
                    <label key={opt.value} className={`payment-option ${selected ? 'is-selected' : ''}`}>
                      <input
                        type="radio"
                        name="booking-payment-method"
                        value={opt.value}
                        checked={selected}
                        onChange={() => handleChange('paymentMethod', opt.value)}
                        className="payment-option-input"
                      />
                      <span className="payment-option-icon" aria-hidden="true">{opt.icon}</span>
                      <span className="payment-option-text">
                        <span className="payment-option-title">
                          {opt.title}
                          {opt.badge && <span className="payment-option-badge">{opt.badge}</span>}
                        </span>
                        <span className="payment-option-desc">{opt.desc}</span>
                      </span>
                      <span className="payment-option-check" aria-hidden="true">{selected ? '✓' : ''}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
            )}

            <button type="submit" className="btn-submit" disabled={loading}>
              {loading ? 'Đang gửi...' : 'ĐẶT LỊCH'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default SimpleBookingForm;
