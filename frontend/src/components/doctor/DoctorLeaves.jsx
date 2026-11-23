import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { API_BASE } from '../../config/api';
import CalendarPicker, { formatVietnameseDate } from '../common/CalendarPicker';
import '../dashboards/Dashboard.css';
import './DoctorLeaves.css';

const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('auth_token')}` });

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/**
 * DoctorLeaves - days off.
 *  doctor:       add / remove own days off
 *  admin:        pick a doctor, add / remove for them
 *  receptionist: read only - sees which booked patients must be called to move their visit
 */
const DoctorLeaves = ({ role, onBack }) => {
  const canEdit = role === 'doctor' || role === 'admin';
  const pickDoctor = role !== 'doctor';

  const [doctors, setDoctors] = useState([]);
  const [doctorId, setDoctorId] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [date, setDate] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  useEffect(() => {
    if (!pickDoctor) return;
    axios.get(`${API_BASE}/appointments/doctors`)
      .then((res) => setDoctors(res.data?.doctors || []))
      .catch(() => setDoctors([]));
  }, [pickDoctor]);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    axios.get(`${API_BASE}/doctor-leaves`, { params: doctorId ? { doctorId } : {}, headers: authHeaders() })
      .then((res) => setData(res.data.data))
      .catch((err) => setError(err.response?.data?.error?.message || 'Không thể tải lịch nghỉ'))
      .finally(() => setLoading(false));
  }, [doctorId]);

  useEffect(() => { load(); }, [load]);

  const leaves = data?.leaves || [];
  const today = data?.today || ymd(new Date());
  const upcoming = leaves.filter((l) => l.leave_date >= today);
  const past = leaves.filter((l) => l.leave_date < today);
  // Days already taken by the selected doctor (or by me) cannot be picked again
  const takenDates = leaves
    .filter((l) => role === 'doctor' || (doctorId && Number(l.doctor_id) === Number(doctorId)))
    .map((l) => l.leave_date);
  const toCall = upcoming.reduce((n, l) => n + l.affected_count, 0);

  const addLeave = async () => {
    if (!date) return setMessage({ type: 'error', text: 'Hãy chọn ngày nghỉ' });
    if (pickDoctor && !doctorId) return setMessage({ type: 'error', text: 'Hãy chọn bác sĩ' });
    try {
      setSaving(true);
      setMessage(null);
      const res = await axios.post(`${API_BASE}/doctor-leaves`, {
        date,
        reason: reason.trim() || null,
        ...(pickDoctor ? { doctorId: Number(doctorId) } : {})
      }, { headers: authHeaders() });
      setMessage({ type: res.data.data.affected.length ? 'warn' : 'success', text: res.data.message });
      setDate('');
      setReason('');
      load();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error?.message || 'Không thể lưu ngày nghỉ' });
    } finally {
      setSaving(false);
    }
  };

  const removeLeave = async (leave) => {
    try {
      await axios.delete(`${API_BASE}/doctor-leaves/${leave.id}`, { headers: authHeaders() });
      setMessage({ type: 'success', text: `Đã xoá ngày nghỉ ${formatVietnameseDate(leave.leave_date)}` });
      setConfirmDelete(null);
      load();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error?.message || 'Không thể xoá ngày nghỉ' });
    }
  };

  const renderLeave = (l, isPast) => (
    <div key={l.id} className={`lv-item ${isPast ? 'is-past' : ''} ${l.affected_count ? 'has-affected' : ''}`}>
      <div className="lv-date">
        <strong>{l.leave_date.split('-').reverse().join('/')}</strong>
        <span>{formatVietnameseDate(l.leave_date).split(',')[0]}</span>
      </div>
      <div className="lv-info">
        {pickDoctor && <div className="lv-doctor">{l.doctor_name} · {l.department_name}</div>}
        <div className="lv-reason">{l.reason || 'Không ghi lý do'}</div>
        {!isPast && l.affected_count > 0 && (
          <div className="lv-affected">
            <div className="lv-affected-title">⚠️ {l.affected_count} lịch hẹn cần liên hệ đổi lịch:</div>
            <ul>
              {l.affected.map((a) => (
                <li key={a.id}>
                  <span>{a.time_slot} · {a.patient_name}</span>
                  {a.patient_phone && <a href={`tel:${a.patient_phone}`}>📞 {a.patient_phone}</a>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      {canEdit && (
        confirmDelete === l.id ? (
          <div className="lv-actions">
            <button type="button" className="lv-btn" onClick={() => setConfirmDelete(null)}>Không</button>
            <button type="button" className="lv-btn is-danger" onClick={() => removeLeave(l)}>Xoá</button>
          </div>
        ) : (
          <div className="lv-actions">
            <button type="button" className="lv-btn" onClick={() => setConfirmDelete(l.id)}>Xoá</button>
          </div>
        )
      )}
    </div>
  );

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <div className="dashboard-welcome">
          <h1>🗓️ {role === 'doctor' ? 'Lịch nghỉ của tôi' : 'Lịch nghỉ bác sĩ'}</h1>
          <p className="dashboard-subtitle">
            Ngày nghỉ sẽ bị khoá khi bệnh nhân đặt hoặc đổi lịch. Phòng khám nghỉ
            {data?.closed_weekdays?.length
              ? ` ${data.closed_weekdays.map((w) => ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'][w]).join(', ')}`
              : ': không'}.
          </p>
        </div>
        {onBack && <button className="btn btn-secondary" onClick={onBack}>← Về Dashboard</button>}
      </div>

      {toCall > 0 && (
        <div className="lv-banner" role="status">
          ⚠️ Có <strong>{toCall}</strong> lịch hẹn rơi vào ngày bác sĩ nghỉ. Lịch không tự huỷ – hãy gọi bệnh nhân để đổi sang ngày khác.
        </div>
      )}

      <div className="dashboard-section">
        {pickDoctor && (
          <label className="lv-field">
            <span>Bác sĩ</span>
            <select value={doctorId} onChange={(e) => { setDoctorId(e.target.value); setDate(''); setMessage(null); }}>
              <option value="">{canEdit ? '— Chọn bác sĩ —' : 'Tất cả bác sĩ'}</option>
              {doctors.map((d) => (
                <option key={d.doctor_id} value={d.doctor_id}>{d.full_name}{d.department_name ? ` – ${d.department_name}` : ''}</option>
              ))}
            </select>
          </label>
        )}

        {canEdit && (
          <div className="lv-form">
            <div className="lv-field">
              <span>Ngày nghỉ</span>
              <CalendarPicker
                id="leave-date"
                placeholder="Chọn ngày nghỉ"
                value={date}
                onChange={setDate}
                min={today}
                max={ymd(new Date(Date.now() + 365 * 86400000))}
                disabledWeekdays={data?.closed_weekdays || []}
                disabledDates={takenDates}
              />
            </div>
            <label className="lv-field lv-reason-field">
              <span>Lý do (không bắt buộc)</span>
              <input
                type="text"
                value={reason}
                maxLength={255}
                placeholder="VD: Đi hội thảo, nghỉ phép…"
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            <button type="button" className="lv-add" onClick={addLeave} disabled={saving || (pickDoctor && !doctorId)}>
              {saving ? 'Đang lưu…' : '+ Thêm ngày nghỉ'}
            </button>
          </div>
        )}

        {message && <div className={`lv-msg is-${message.type}`} role="status">{message.text}</div>}
      </div>

      <div className="dashboard-section">
        <h2 className="section-title">Ngày nghỉ sắp tới</h2>
        {loading && <div className="loading-stats">Đang tải…</div>}
        {!loading && error && <p style={{ color: '#b91c1c' }}>{error}</p>}
        {!loading && !error && upcoming.length === 0 && <p style={{ color: '#6b7280' }}>Chưa có ngày nghỉ nào.</p>}
        {!loading && !error && upcoming.length > 0 && <div className="lv-list">{upcoming.map((l) => renderLeave(l, false))}</div>}
        {!loading && !error && past.length > 0 && (
          <details className="lv-past">
            <summary>Đã qua (30 ngày gần đây) – {past.length}</summary>
            <div className="lv-list">{past.map((l) => renderLeave(l, true))}</div>
          </details>
        )}
      </div>
    </div>
  );
};

export default DoctorLeaves;
