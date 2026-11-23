import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { CheckedInPatientsList } from '../medical-records';
import { ScheduleItem, fetchDoctorSchedule, localYMD } from '../doctor/DoctorSchedule';
import './Dashboard.css';

/**
 * DoctorDashboard Component - Dashboard for doctor role
 * 
 * Features:
 * - View doctor queue
 * - Access assigned patient records
 * - Manage schedule
 * - View appointments
 * - View checked-in patients (Medical Records Integration)
 * 
 * Requirements Validation:
 * - Requirement 3.2: Doctor can access doctor queue and assigned patient records
 * - Medical Records System - Requirements: 1.1, 2.1, 3.1, 4.1, 5.1
 */
const DoctorDashboard = ({ onNavigate }) => {
  const { user } = useAuth();
  const [showCheckedInPatients, setShowCheckedInPatients] = useState(false);
  const [schedule, setSchedule] = useState(null);
  const [scheduleLoading, setScheduleLoading] = useState(true);
  const [scheduleError, setScheduleError] = useState(null);

  useEffect(() => {
    if (showCheckedInPatients) return undefined;
    let cancelled = false;
    fetchDoctorSchedule(localYMD(), 1)
      .then((res) => { if (!cancelled) setSchedule(res); })
      .catch((err) => {
        if (!cancelled) setScheduleError(err.response?.data?.error?.message || 'Không thể tải lịch khám hôm nay');
      })
      .finally(() => { if (!cancelled) setScheduleLoading(false); });
    return () => { cancelled = true; };
  }, [showCheckedInPatients]);

  const [todayFilter, setTodayFilter] = useState('all');
  // Seeded names already start with "BS." - avoid "BS. BS. ..."
  const doctorName = (user.fullName || '').replace(/^\s*bs\.?\s+/i, '');
  const todayAppointments = (schedule?.appointments || [])
    .filter((a) => a.status !== 'cancelled')
    .filter((a) => todayFilter === 'all' || a.status === todayFilter);

  // Clicking a counter filters today's list and scrolls to it; "waiting" also offers the queue
  const showStat = (key) => {
    setTodayFilter(key);
    setTimeout(() => {
      const el = document.getElementById('doctor-today');
      if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
  };
  const FILTER_LABELS = { booked: 'Chưa đến', checked_in: 'Đang chờ khám', completed: 'Đã khám xong' };
  const counts = schedule?.today || {};
  const todayStats = {
    booked: counts.booked || 0,
    checked_in: counts.checked_in || 0,
    completed: counts.completed || 0,
    total: (counts.booked || 0) + (counts.checked_in || 0) + (counts.completed || 0)
  };

  const dashboardCards = [
    {
      id: 'checked-in-patients',
      title: 'Bệnh nhân đã check-in',
      description: 'Xem danh sách bệnh nhân đã check-in hôm nay',
      icon: '✅',
      color: '#10b981',
      action: () => setShowCheckedInPatients(true)
    },
    {
      id: 'doctor-queue',
      title: 'Gọi số khám bệnh',
      description: 'Gọi số tiếp theo, gọi lại, đánh dấu vắng mặt – hiện trên màn hình sảnh',
      icon: '📢',
      color: '#26a69a',
      action: () => onNavigate && onNavigate('doctor-queue')
    },
    {
      id: 'save-medical-record',
      title: 'Khám bệnh & kê đơn',
      description: 'Tạo hồ sơ khám, kê đơn thuốc, hoàn tất lịch hẹn',
      icon: '📝',
      color: '#ef4444',
      action: () => onNavigate && onNavigate('save-medical-record')
    },
    {
      id: 'doctor-schedule',
      title: 'Lịch làm việc',
      description: 'Xem lịch hẹn của bệnh nhân theo ngày',
      icon: '🗓️',
      color: '#26a69a',
      action: () => onNavigate && onNavigate('doctor-schedule')
    },
    {
      id: 'doctor-ratings',
      title: 'Đánh giá của bệnh nhân',
      description: 'Điểm trung bình và nhận xét sau khám',
      icon: '⭐',
      color: '#f59e0b',
      action: () => onNavigate && onNavigate('doctor-ratings')
    },
    {
      id: 'doctor-leaves',
      title: 'Lịch nghỉ của tôi',
      description: 'Khai báo ngày nghỉ để bệnh nhân không đặt trùng',
      icon: '🌴',
      color: '#64748b',
      action: () => onNavigate && onNavigate('doctor-leaves')
    },
    {
      id: 'doctor-follow-ups',
      title: 'Bệnh nhân hẹn tái khám',
      description: 'Ai sắp đến hẹn, ai chưa đặt lịch, ai đã quá hạn',
      icon: '🔁',
      color: '#f59e0b',
      action: () => onNavigate && onNavigate('doctor-follow-ups')
    },
    {
      id: 'patients',
      title: 'Tra cứu hồ sơ bệnh nhân',
      description: 'Xem tiền sử khám của bệnh nhân mình điều trị',
      icon: '📋',
      color: '#8b5cf6',
      action: () => onNavigate && onNavigate('doctor-patients')
    },
    {
      id: 'profile',
      title: 'Thông tin cá nhân',
      description: 'Cập nhật thông tin tài khoản',
      icon: '👤',
      color: '#f59e0b',
      action: () => onNavigate && onNavigate('profile')
    }
  ];

  // Show checked-in patients view if active
  if (showCheckedInPatients) {
    return (
      <CheckedInPatientsList 
        onBack={() => setShowCheckedInPatients(false)}
        onSelectPatient={(patient) => {
          // Navigate to create medical record form for selected patient
          onNavigate && onNavigate('create-medical-record', { patient });
        }}
      />
    );
  }

  return (
    <div className="dashboard-container">
      {/* Dashboard Header */}
      <div className="dashboard-header">
        <div className="dashboard-welcome">
          <h1>Xin chào, BS. {doctorName}! 👨‍⚕️</h1>
          <p className="dashboard-subtitle">Chúc bác sĩ một ngày làm việc hiệu quả</p>
        </div>
        <div className="dashboard-user-info">
          <div className="user-avatar doctor">{user.fullName.charAt(0).toUpperCase()}</div>
          <div className="user-details">
            <span className="user-name">BS. {doctorName}</span>
            <span className="user-role">Bác sĩ</span>
          </div>
        </div>
      </div>

      {/* Breadcrumb Navigation */}
      <nav className="dashboard-breadcrumb">
        <span className="breadcrumb-item" onClick={() => onNavigate && onNavigate('home')}>
          Trang chủ
        </span>
        <span className="breadcrumb-separator">›</span>
        <span className="breadcrumb-item active">Dashboard Bác sĩ</span>
      </nav>

      {/* Today's counters */}
      {!scheduleLoading && !scheduleError && (
        <div className="dashboard-stats">
          {[
            { key: 'all', icon: '📅', label: 'Lịch hẹn hôm nay', value: todayStats.total, color: '#26a69a' },
            { key: 'checked_in', icon: '⏳', label: 'Đang chờ khám', value: todayStats.checked_in, color: '#3b82f6' },
            { key: 'booked', icon: '🕒', label: 'Chưa đến', value: todayStats.booked, color: '#f59e0b' },
            { key: 'completed', icon: '✅', label: 'Đã khám xong', value: todayStats.completed, color: '#10b981' }
          ].map((s) => (
            <div
              className="stat-card"
              key={s.label}
              role="button"
              tabIndex={0}
              title={`Xem danh sách: ${s.label}`}
              onClick={() => showStat(s.key)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showStat(s.key); } }}
              style={{ cursor: 'pointer', outline: todayFilter === s.key && s.key !== 'all' ? `2px solid ${s.color}` : 'none' }}
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

      {/* Today's Schedule (real data from /appointments/doctor/schedule) */}
      <div className="dashboard-section" id="doctor-today">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <h2 className="section-title">
            Lịch khám hôm nay
            {todayFilter !== 'all' && (
              <span style={{ fontWeight: 400, fontSize: 15, color: '#6b7280' }}> · {FILTER_LABELS[todayFilter]} ({todayAppointments.length})</span>
            )}
          </h2>
          <div style={{ display: 'flex', gap: 8 }}>
            {todayFilter === 'checked_in' && todayAppointments.length > 0 && (
              <button
                onClick={() => onNavigate && onNavigate('doctor-queue')}
                style={{ padding: '8px 14px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}
              >
                📢 Gọi số khám bệnh
              </button>
            )}
            {todayFilter !== 'all' && (
              <button
                onClick={() => setTodayFilter('all')}
                style={{ padding: '8px 14px', background: '#e2e8f0', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}
              >
                Xem tất cả
              </button>
            )}
          </div>
        </div>
        {scheduleLoading ? (
          <div className="loading-stats">Đang tải lịch khám...</div>
        ) : scheduleError ? (
          <p style={{ color: '#b91c1c' }}>{scheduleError}</p>
        ) : todayAppointments.length === 0 ? (
          <p style={{ color: '#6b7280' }}>
            📭 {todayFilter === 'all' ? 'Hôm nay chưa có lịch hẹn nào.' : `Không có lịch hẹn nào ở mục "${FILTER_LABELS[todayFilter]}".`}
          </p>
        ) : (
          <div className="schedule-list">
            {todayAppointments.map((a) => <ScheduleItem key={a.id} appointment={a} />)}
          </div>
        )}
      </div>
    </div>
  );
};

export default DoctorDashboard;
