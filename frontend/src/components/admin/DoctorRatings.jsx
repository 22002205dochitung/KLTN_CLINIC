import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { API_BASE } from '../../config/api';
import '../dashboards/Dashboard.css';
import './DoctorRatings.css';

const Stars = ({ value }) => {
  const full = Math.round(value || 0);
  return (
    <span className="dr-stars" aria-label={`${value ?? 0} trên 5 sao`}>
      {'★'.repeat(full)}<span className="dr-off">{'★'.repeat(5 - full)}</span>
    </span>
  );
};

/**
 * DoctorRatings - patient reviews.
 *  admin:  every doctor ranked by average rating, recent comments with patient names
 *  doctor: own rating and comments (patients shown as initials)
 */
const DoctorRatings = ({ role, onBack }) => {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [filterDoctor, setFilterDoctor] = useState('');

  useEffect(() => {
    axios.get(`${API_BASE}/reviews/summary`, { headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` } })
      .then((res) => setData(res.data.data))
      .catch((err) => setError(err.response?.data?.error?.message || 'Không thể tải đánh giá'));
  }, []);

  const doctors = data?.doctors || [];
  const nameOf = (id) => doctors.find((d) => d.doctor_id === id)?.doctor_name || '';
  const recent = (data?.recent || []).filter((r) => !filterDoctor || r.doctor_id === Number(filterDoctor));
  const rated = doctors.filter((d) => d.review_count > 0);
  const totalReviews = rated.reduce((s, d) => s + d.review_count, 0);
  const overall = totalReviews
    ? rated.reduce((s, d) => s + d.avg_rating * d.review_count, 0) / totalReviews
    : null;

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <div className="dashboard-welcome">
          <h1>⭐ {role === 'doctor' ? 'Đánh giá của bệnh nhân' : 'Đánh giá bác sĩ'}</h1>
          <p className="dashboard-subtitle">Bệnh nhân đánh giá sau khi khám xong (trong vòng 30 ngày)</p>
        </div>
        {onBack && <button className="btn btn-secondary" onClick={onBack}>← Về Dashboard</button>}
      </div>

      {error && <div className="dashboard-section" style={{ color: '#b91c1c' }}>{error}</div>}
      {!data && !error && <div className="loading-stats">Đang tải…</div>}

      {data && (
        <>
          <div className="dashboard-stats">
            <div className="stat-card">
              <div className="stat-icon" style={{ backgroundColor: '#f59e0b20', color: '#f59e0b' }}>⭐</div>
              <div className="stat-content">
                <div className="stat-value">{overall ? overall.toFixed(1) : '—'}</div>
                <div className="stat-label">{role === 'doctor' ? 'Điểm trung bình của bạn' : 'Điểm trung bình toàn phòng khám'}</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon" style={{ backgroundColor: '#667eea20', color: '#26a69a' }}>📝</div>
              <div className="stat-content">
                <div className="stat-value">{totalReviews}</div>
                <div className="stat-label">Lượt đánh giá</div>
              </div>
            </div>
          </div>

          <div className="dashboard-section">
            <h2 className="section-title">{role === 'doctor' ? 'Phân bố số sao' : 'Xếp hạng bác sĩ'}</h2>
            <div className="dr-list">
              {doctors.map((d, idx) => (
                <div key={d.doctor_id} className="dr-item">
                  {role !== 'doctor' && <div className="dr-rank">{d.review_count ? `#${idx + 1}` : '—'}</div>}
                  <div className="dr-who">
                    <div className="dr-name">{d.doctor_name}</div>
                    <div className="dr-dept">{d.department_name}</div>
                  </div>
                  <div className="dr-score">
                    {d.review_count ? (
                      <>
                        <strong>{d.avg_rating.toFixed(1)}</strong>
                        <Stars value={d.avg_rating} />
                        <span>{d.review_count} lượt</span>
                      </>
                    ) : (
                      <span className="dr-none">Chưa có đánh giá</span>
                    )}
                  </div>
                  {d.review_count > 0 && (
                    <div className="dr-dist" aria-label="Phân bố số sao">
                      {[5, 4, 3, 2, 1].map((n) => (
                        <div key={n} className="dr-row">
                          <span>{n}★</span>
                          <div className="dr-bar"><i style={{ width: `${(d.distribution[n] / d.review_count) * 100}%` }} /></div>
                          <span>{d.distribution[n]}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="dashboard-section">
            <div className="dr-recent-head">
              <h2 className="section-title">Nhận xét gần đây</h2>
              {role !== 'doctor' && (
                <select value={filterDoctor} onChange={(e) => setFilterDoctor(e.target.value)} aria-label="Lọc theo bác sĩ">
                  <option value="">Tất cả bác sĩ</option>
                  {rated.map((d) => <option key={d.doctor_id} value={d.doctor_id}>{d.doctor_name}</option>)}
                </select>
              )}
            </div>
            {recent.length === 0 ? (
              <p style={{ color: '#6b7280' }}>Chưa có nhận xét nào.</p>
            ) : (
              <ul className="dr-comments">
                {recent.map((r, i) => (
                  <li key={i}>
                    <div className="dr-comment-head">
                      <Stars value={r.rating} />
                      <span>{r.patient}</span>
                      {role !== 'doctor' && <span>· {nameOf(r.doctor_id)}</span>}
                      <span>· khám {r.visit_date.split('-').reverse().join('/')}</span>
                    </div>
                    <div className="dr-comment">{r.comment || <em>(không có nhận xét)</em>}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default DoctorRatings;
