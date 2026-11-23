import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import { MedicalHistory } from '../medical-records';
import { API_BASE } from '../../config/api';
import QueueEstimate from '../appointments/QueueEstimate';
import './Dashboard.css';

/**
 * PatientDashboard Component - Dashboard for patient role
 * 
 * Features:
 * - Quick access to booking appointments
 * - View upcoming appointments
 * - Access medical records (Medical Records Integration)
 * - Profile management
 * 
 * Requirements Validation:
 * - Requirement 3.1: Patient can access booking and their own medical records
 * - Medical Records System - Requirements: 6.1, 7.1, 8.1
 */
const toYMD = (value) => {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = new Date(value);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const formatDay = (ymd) => (ymd ? ymd.split('-').reverse().join('/') : '');

/** A booked appointment whose day has passed was never attended */
const effectiveStatus = (a) => (a.status === 'booked' && toYMD(a.appointment_date) < toYMD(new Date()) ? 'no_show' : a.status);

const STATUS_TEXT = {
  booked: { icon: '📅', text: 'Đã xác nhận' },
  checked_in: { icon: '⏳', text: 'Đã check-in' },
  completed: { icon: '✅', text: 'Đã khám' },
  cancelled: { icon: '✕', text: 'Đã huỷ' },
  no_show: { icon: '⚠️', text: 'Không đến' }
};

const PatientDashboard = ({ onNavigate }) => {
  const { user } = useAuth();
  const [showMedicalHistory, setShowMedicalHistory] = useState(false);
  const [myAppointments, setMyAppointments] = useState(null);

  useEffect(() => {
    let cancelled = false;
    axios.get(`${API_BASE}/appointments/my-appointments`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
    })
      .then((res) => {
        if (cancelled) return;
        const data = res.data.appointments || {};
        const list = Array.isArray(data) ? data : [...(data.upcoming || []), ...(data.past || [])];
        setMyAppointments(list);
      })
      .catch(() => { if (!cancelled) setMyAppointments(null); });
    return () => { cancelled = true; };
  }, []);

  const [records, setRecords] = useState([]);

  useEffect(() => {
    let cancelled = false;
    axios.get(`${API_BASE}/medical-records/patient/history`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
    })
      .then((res) => { if (!cancelled) setRecords(res.data?.data?.records || []); })
      .catch(() => { if (!cancelled) setRecords([]); });
    return () => { cancelled = true; };
  }, []);

  const mine = myAppointments || [];
  const todayYMD = toYMD(new Date());

  // Re-exam dates from the last 30 days onward; "booked" when an active appointment with that doctor exists
  const followUps = records
    .filter((r) => r.reexamination_ymd)
    .map((r) => {
      const daysLeft = Math.round((new Date(`${r.reexamination_ymd}T00:00:00`) - new Date(`${todayYMD}T00:00:00`)) / 86400000);
      const booked = mine.some((a) => Number(a.doctor_id) === Number(r.doctor_id)
        && ['booked', 'checked_in'].includes(a.status)
        && toYMD(a.appointment_date) >= todayYMD
        // only a booking made after this visit counts as the follow-up
        && new Date(a.created_at) >= new Date(r.created_at));
      return { ...r, daysLeft, overdue: daysLeft < 0, booked };
    })
    .filter((f) => f.daysLeft >= -30)
    .sort((a, b) => a.daysLeft - b.daysLeft)
    .slice(0, 3);

  const todayVisits = mine
    .filter((a) => ['booked', 'checked_in'].includes(a.status) && toYMD(a.appointment_date) === todayYMD)
    .sort((a, b) => String(a.time_slot).localeCompare(String(b.time_slot)));

  const recent = [...mine]
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
    .slice(0, 4);
  // Each counter opens the page that lists what it counts
  const statCards = [
    {
      icon: '📅', label: 'Lịch hẹn sắp tới', color: '#26a69a',
      value: mine.filter((a) => {
        if (a.status !== 'booked') return false;
        const d = new Date(a.appointment_date);
        const t = new Date();
        d.setHours(0, 0, 0, 0);
        t.setHours(0, 0, 0, 0);
        return d >= t;
      }).length,
      action: () => onNavigate && onNavigate('appointment-history', { filter: 'pending' })
    },
    {
      icon: '⏳', label: 'Đã check-in, chờ khám', color: '#3b82f6',
      value: mine.filter((a) => a.status === 'checked_in').length,
      action: () => onNavigate && onNavigate('appointment-history', { filter: 'pending' })
    },
    {
      icon: '✅', label: 'Lần khám đã hoàn thành', color: '#10b981',
      value: mine.filter((a) => a.status === 'completed').length,
      action: () => onNavigate && onNavigate('appointment-history', { filter: 'completed' })
    },
    {
      icon: '💰', label: 'Phí khám chưa thanh toán', color: '#ef4444',
      value: mine.filter((a) => a.status !== 'cancelled' && a.payment_status === 'unpaid').length,
      action: () => onNavigate && onNavigate('payment-history')
    }
  ];

  const dashboardCards = [
    {
      id: 'booking',
      title: 'Đặt lịch khám',
      description: 'Đặt lịch khám bệnh với bác sĩ',
      icon: '📅',
      color: '#26a69a',
      action: () => onNavigate && onNavigate('booking')
    },
    {
      id: 'appointment-history',
      title: 'Lịch hẹn của tôi',
      description: 'Xem, đổi lịch, huỷ lịch và theo dõi số thứ tự',
      icon: '📋',
      color: '#108578',
      action: () => onNavigate && onNavigate('appointment-history')
    },
    {
      id: 'my-qr',
      title: 'Mã QR check-in',
      description: 'Đưa mã QR cho lễ tân quét khi đến khám',
      icon: '📱',
      color: '#108578',
      action: () => onNavigate && onNavigate('my-qr')
    },
    {
      id: 'payment-history',
      title: 'Lịch sử thanh toán',
      description: 'Xem các khoản phí khám và tiền thuốc đã trả',
      icon: '💳',
      color: '#f59e0b',
      action: () => onNavigate && onNavigate('payment-history')
    },
    {
      id: 'medical-records',
      title: 'Hồ sơ y tế',
      description: 'Xem hồ sơ và kết quả khám',
      icon: '📁',
      color: '#f093fb',
      action: () => setShowMedicalHistory(true)
    },
    {
      id: 'profile',
      title: 'Thông tin cá nhân',
      description: 'Cập nhật thông tin tài khoản',
      icon: '👤',
      color: '#4facfe',
      action: () => onNavigate && onNavigate('profile')
    }
  ];

  // Show medical history view if active
  if (showMedicalHistory) {
    return (
      <MedicalHistory 
        onBack={() => setShowMedicalHistory(false)}
        onViewRecord={(recordId) => {
          // Navigate to medical record details
          onNavigate && onNavigate('medical-record-details', { recordId });
        }}
      />
    );
  }

  return (
    <div className="dashboard-container">
      {/* Dashboard Header */}
      <div className="dashboard-header">
        <div className="dashboard-welcome">
          <h1>Xin chào, {user.fullName}! 👋</h1>
          <p className="dashboard-subtitle">Chào mừng bạn đến với THCT Clinic</p>
        </div>
        <div className="dashboard-user-info">
          <div className="user-avatar">{user.fullName.charAt(0).toUpperCase()}</div>
          <div className="user-details">
            <span className="user-name">{user.fullName}</span>
            <span className="user-role">Bệnh nhân</span>
          </div>
        </div>
      </div>

      {/* Breadcrumb Navigation */}
      <nav className="dashboard-breadcrumb">
        <span className="breadcrumb-item" onClick={() => onNavigate && onNavigate('home')}>
          Trang chủ
        </span>
        <span className="breadcrumb-separator">›</span>
        <span className="breadcrumb-item active">Dashboard Bệnh nhân</span>
      </nav>

      {/* Quick Stats (real data, clickable) */}
      {myAppointments && (
        <div className="dashboard-stats">
          {statCards.map((s) => (
            <div
              className="stat-card"
              key={s.label}
              role="button"
              tabIndex={0}
              title={`Xem chi tiết: ${s.label}`}
              onClick={s.action}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); s.action(); } }}
              style={{ cursor: 'pointer' }}
            >
              <div className="stat-icon" style={{ backgroundColor: `${s.color}20`, color: s.color }}>{s.icon}</div>
              <div className="stat-content">
                <div className="stat-value">{s.value}</div>
                <div className="stat-label">{s.label}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Today's visits: queue place / expected time (live) */}
      {todayVisits.length > 0 && (
        <div className="dashboard-section today-visit">
          <h2 className="section-title">🏥 Lượt khám hôm nay</h2>
          {todayVisits.map((a) => (
            <div key={a.id} className="today-visit-item">
              <div className="today-visit-meta">
                <strong>{a.time_slot}</strong> · {a.doctor_name} · {a.department_name}
              </div>
              <QueueEstimate appointmentId={a.id} />
            </div>
          ))}
        </div>
      )}

      {/* Dashboard Cards */}
      <div className="dashboard-cards">
        {dashboardCards.map((card) => (
          <div
            key={card.id}
            className="dashboard-card"
            onClick={card.action}
            style={{ borderTopColor: card.color }}
          >
            <div className="card-icon" style={{ backgroundColor: `${card.color}20`, color: card.color }}>
              {card.icon}
            </div>
            <h3 className="card-title">{card.title}</h3>
            <p className="card-description">{card.description}</p>
            <button className="card-action" style={{ backgroundColor: card.color }}>
              Xem chi tiết →
            </button>
          </div>
        ))}
      </div>

      {/* Follow-up visits the doctor asked for (real data from medical records) */}
      {followUps.length > 0 && (
        <div className="dashboard-section">
          <h2 className="section-title">🔁 Lịch tái khám</h2>
          <div className="followup-list">
            {followUps.map((f) => (
              <div key={f.medical_record_id} className={`followup-item ${f.overdue ? 'is-overdue' : ''}`}>
                <div className="followup-date">
                  <strong>{formatDay(f.reexamination_ymd)}</strong>
                  <span>{f.overdue ? 'Đã quá hạn' : f.daysLeft === 0 ? 'Hôm nay' : `Còn ${f.daysLeft} ngày`}</span>
                </div>
                <div className="followup-info">
                  <div className="followup-doctor">{f.doctor_fullname} · {f.department_name}</div>
                  <div className="followup-diagnosis">Chẩn đoán lần trước: {f.diagnosis || '—'}</div>
                </div>
                {f.booked ? (
                  <span className="followup-booked">✓ Đã đặt lịch</span>
                ) : (
                  <button
                    type="button"
                    className="followup-btn"
                    onClick={() => onNavigate && onNavigate('booking', {
                      prefill: {
                        departmentId: f.department_id,
                        doctorId: f.doctor_id,
                        appointmentDate: f.overdue ? '' : f.reexamination_ymd,
                        symptoms: `Tái khám theo hẹn (${f.diagnosis || 'lần khám trước'})`,
                        reason: `Đặt lịch tái khám với ${f.doctor_fullname}`
                      }
                    })}
                  >
                    Đặt lịch tái khám
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent appointments (real data) */}
      <div className="dashboard-section">
        <h2 className="section-title">Lịch hẹn gần đây</h2>
        {myAppointments === null ? (
          <p style={{ color: '#6b7280' }}>Đang tải…</p>
        ) : recent.length === 0 ? (
          <p style={{ color: '#6b7280' }}>📭 Bạn chưa có lịch hẹn nào. Bấm <strong>Đặt lịch khám</strong> để bắt đầu.</p>
        ) : (
          <div className="activity-list">
            {recent.map((a) => {
              const st = STATUS_TEXT[effectiveStatus(a)] || STATUS_TEXT.booked;
              return (
                <div
                  key={a.id}
                  className="activity-item"
                  role="button"
                  tabIndex={0}
                  style={{ cursor: 'pointer' }}
                  onClick={() => onNavigate && onNavigate('appointment-history')}
                  onKeyDown={(e) => { if (e.key === 'Enter') onNavigate && onNavigate('appointment-history'); }}
                >
                  <div className="activity-icon">{st.icon}</div>
                  <div className="activity-content">
                    <div className="activity-title">{a.doctor_name} · {a.department_name}</div>
                    <div className="activity-time">{formatDay(toYMD(a.appointment_date))} · {a.time_slot} · {st.text}</div>
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

export default PatientDashboard;
