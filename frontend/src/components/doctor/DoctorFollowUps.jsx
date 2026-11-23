import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { API_BASE } from '../../config/api';
import '../dashboards/Dashboard.css';
import './DoctorFollowUps.css';

const STATES = {
  pending: { label: 'Chưa đặt lịch', className: 'is-pending' },
  overdue: { label: 'Quá hạn, chưa đặt', className: 'is-overdue' },
  booked: { label: 'Đã đặt lịch', className: 'is-booked' },
  done: { label: 'Đã tái khám', className: 'is-done' }
};

const FILTERS = [
  { key: 'all', label: 'Tất cả' },
  { key: 'pending', label: 'Chưa đặt lịch' },
  { key: 'overdue', label: 'Quá hạn' },
  { key: 'booked', label: 'Đã đặt lịch' },
  { key: 'done', label: 'Đã tái khám' }
];

const formatDay = (ymd) => (ymd ? ymd.split('-').reverse().join('/') : '');

const daysBetween = (fromYmd, toYmd) =>
  Math.round((new Date(`${toYmd}T00:00:00`) - new Date(`${fromYmd}T00:00:00`)) / 86400000);

/**
 * DoctorFollowUps - patients this doctor asked to come back, with whether they have booked yet.
 */
const DoctorFollowUps = ({ onBack }) => {
  const [days, setDays] = useState(30);
  const [filter, setFilter] = useState('all');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    axios.get(`${API_BASE}/medical-records/doctor/follow-ups`, {
      params: { days },
      headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
    })
      .then((res) => { if (!cancelled) setData(res.data.data); })
      .catch((err) => {
        if (!cancelled) setError(err.response?.data?.error?.message || 'Không thể tải danh sách hẹn tái khám');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [days]);

  const items = (data?.items || []).filter((i) => filter === 'all' || i.state === filter);
  const summary = data?.summary || { total: 0, pending: 0, overdue: 0, booked: 0, done: 0 };

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <div className="dashboard-welcome">
          <h1>🔁 Bệnh nhân hẹn tái khám</h1>
          <p className="dashboard-subtitle">Theo ngày hẹn bác sĩ ghi trong hồ sơ khám</p>
        </div>
        {onBack && <button className="btn btn-secondary" onClick={onBack}>← Về Dashboard</button>}
      </div>

      <div className="dashboard-stats">
        {[
          { key: 'pending', icon: '🕒', label: 'Chưa đặt lịch', color: '#f59e0b' },
          { key: 'overdue', icon: '⚠️', label: 'Quá hạn', color: '#ef4444' },
          { key: 'booked', icon: '📅', label: 'Đã đặt lịch', color: '#3b82f6' },
          { key: 'done', icon: '✅', label: 'Đã tái khám', color: '#10b981' }
        ].map((s) => (
          <div
            key={s.key}
            className="stat-card"
            role="button"
            tabIndex={0}
            onClick={() => setFilter(filter === s.key ? 'all' : s.key)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setFilter(filter === s.key ? 'all' : s.key); } }}
            style={{ cursor: 'pointer', outline: filter === s.key ? `2px solid ${s.color}` : 'none' }}
          >
            <div className="stat-icon" style={{ backgroundColor: `${s.color}20`, color: s.color }}>{s.icon}</div>
            <div className="stat-content">
              <div className="stat-value">{summary[s.key]}</div>
              <div className="stat-label">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="dashboard-section">
        <div className="fu-toolbar">
          <div className="fu-filters" role="tablist" aria-label="Lọc theo trạng thái">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                role="tab"
                aria-selected={filter === f.key}
                className={`fu-filter ${filter === f.key ? 'active' : ''}`}
                onClick={() => setFilter(f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>
          <label className="fu-range">
            Hẹn trong
            <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
              <option value={7}>7 ngày tới</option>
              <option value={30}>30 ngày tới</option>
              <option value={90}>90 ngày tới</option>
            </select>
            <span className="fu-range-note">(kèm 30 ngày đã qua)</span>
          </label>
        </div>

        {loading && <div className="loading-stats">Đang tải…</div>}
        {!loading && error && <p style={{ color: '#b91c1c' }}>{error}</p>}
        {!loading && !error && items.length === 0 && (
          <p style={{ color: '#6b7280' }}>📭 Không có bệnh nhân nào trong mục này.</p>
        )}
        {!loading && !error && items.length > 0 && (
          <div className="fu-list">
            {items.map((i) => {
              const st = STATES[i.state];
              const diff = daysBetween(data.today, i.reexamination_date);
              return (
                <div key={i.medical_record_id} className={`fu-item ${st.className}`}>
                  <div className="fu-date">
                    <strong>{formatDay(i.reexamination_date)}</strong>
                    <span>{diff === 0 ? 'Hôm nay' : diff > 0 ? `Còn ${diff} ngày` : `Quá ${-diff} ngày`}</span>
                  </div>
                  <div className="fu-info">
                    <div className="fu-name">{i.patient_name}</div>
                    <div className="fu-meta">
                      Khám ngày {formatDay(i.visit_date)} · Chẩn đoán: {i.diagnosis || '—'}
                    </div>
                    {i.followup && (
                      <div className="fu-meta">
                        Lịch tái khám: {formatDay(i.followup.appointment_date)} · {i.followup.time_slot}
                      </div>
                    )}
                  </div>
                  <div className="fu-actions">
                    <span className={`fu-chip ${st.className}`}>{st.label}</span>
                    {i.patient_phone && (i.state === 'pending' || i.state === 'overdue') && (
                      <a className="fu-call" href={`tel:${i.patient_phone}`}>📞 {i.patient_phone}</a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default DoctorFollowUps;
