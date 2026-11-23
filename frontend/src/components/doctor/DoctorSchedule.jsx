import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { API_BASE } from '../../config/api';
import '../dashboards/Dashboard.css';

/** YYYY-MM-DD in local time */
export const localYMD = (d = new Date()) => {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export const APPOINTMENT_STATUS = {
  booked: { label: 'Chưa đến', className: 'waiting' },
  checked_in: { label: 'Đang chờ khám', className: 'waiting' },
  completed: { label: 'Đã khám', className: 'completed' },
  cancelled: { label: 'Đã huỷ', className: 'cancelled' }
};

const cancelledStyle = { background: '#fee2e2', color: '#b91c1c' };

/** Fetch the logged-in doctor's schedule: { today, appointments } */
export const fetchDoctorSchedule = async (from, days) => {
  const token = localStorage.getItem('auth_token');
  const res = await axios.get(`${API_BASE}/appointments/doctor/schedule`, {
    params: { from, days },
    headers: { Authorization: `Bearer ${token}` }
  });
  return res.data;
};

/** One appointment row, shared with the doctor dashboard */
export const ScheduleItem = ({ appointment }) => {
  const status = APPOINTMENT_STATUS[appointment.status] || APPOINTMENT_STATUS.booked;
  return (
    <div className="schedule-item">
      <div className="schedule-time">{appointment.time_slot}</div>
      <div className="schedule-content">
        <div>
          <div className="schedule-patient">{appointment.patient_name}</div>
          <small style={{ color: '#6b7280' }}>
            {appointment.patient_phone}
            {appointment.symptoms ? ` · ${appointment.symptoms}` : ''}
          </small>
        </div>
        <div
          className={`schedule-status ${status.className}`}
          style={appointment.status === 'cancelled' ? cancelledStyle : undefined}
        >
          {status.label}
        </div>
      </div>
    </div>
  );
};

/**
 * DoctorSchedule - the doctor's appointments for the next N days, grouped by date.
 */
const DoctorSchedule = ({ onBack }) => {
  const [from, setFrom] = useState(localYMD());
  const [days, setDays] = useState(7);
  const [showCancelled, setShowCancelled] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchDoctorSchedule(from, days)
      .then((res) => { if (!cancelled) setData(res); })
      .catch((err) => {
        if (!cancelled) setError(err.response?.data?.error?.message || 'Không thể tải lịch làm việc');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [from, days]);

  const appointments = (data?.appointments || []).filter((a) => showCancelled || a.status !== 'cancelled');
  const byDate = appointments.reduce((acc, a) => {
    (acc[a.appointment_date] = acc[a.appointment_date] || []).push(a);
    return acc;
  }, {});
  const dates = Object.keys(byDate).sort();

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <div className="dashboard-welcome">
          <h1>🗓️ Lịch làm việc</h1>
          <p className="dashboard-subtitle">Các lịch hẹn bệnh nhân đã đặt với bác sĩ</p>
        </div>
        {onBack && (
          <button className="btn btn-secondary" onClick={onBack}>← Về Dashboard</button>
        )}
      </div>

      <div className="dashboard-section" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <label htmlFor="schedule-from"><strong>Từ ngày</strong></label>
        <input
          id="schedule-from"
          type="date"
          value={from}
          onChange={(e) => e.target.value && setFrom(e.target.value)}
          style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #d1d5db' }}
        />
        <label htmlFor="schedule-days"><strong>Xem</strong></label>
        <select
          id="schedule-days"
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #d1d5db' }}
        >
          <option value={1}>1 ngày</option>
          <option value={7}>7 ngày</option>
          <option value={14}>14 ngày</option>
          <option value={30}>30 ngày</option>
        </select>
        <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          <input type="checkbox" checked={showCancelled} onChange={(e) => setShowCancelled(e.target.checked)} />
          Hiện lịch đã huỷ
        </label>
        <span style={{ marginLeft: 'auto', color: '#6b7280' }}>
          {loading ? '' : `${appointments.length} lịch hẹn`}
        </span>
      </div>

      {loading && <div className="loading-stats">Đang tải lịch làm việc...</div>}
      {!loading && error && (
        <div className="dashboard-section" style={{ color: '#b91c1c' }}>{error}</div>
      )}
      {!loading && !error && dates.length === 0 && (
        <div className="dashboard-section" style={{ textAlign: 'center', color: '#6b7280' }}>
          📭 Không có lịch hẹn nào trong khoảng thời gian này
        </div>
      )}
      {!loading && !error && dates.map((date) => (
        <div className="dashboard-section" key={date}>
          <h2 className="section-title">
            {new Date(`${date}T00:00:00`).toLocaleDateString('vi-VN', {
              weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric'
            })}
            {date === localYMD() ? ' (hôm nay)' : ''}
            <span style={{ fontWeight: 400, fontSize: 14, color: '#6b7280' }}> · {byDate[date].length} lịch</span>
          </h2>
          <div className="schedule-list">
            {byDate[date].map((a) => <ScheduleItem key={a.id} appointment={a} />)}
          </div>
        </div>
      ))}
    </div>
  );
};

export default DoctorSchedule;
