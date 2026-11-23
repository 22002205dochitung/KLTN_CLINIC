import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import axios from 'axios';
import './Dashboard.css';
import { API_BASE } from '../../config/api';
import { printAppointmentSlip } from '../appointments/printSlip';

const localYMD = (d = new Date()) => {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const STATUS_LABELS = {
  booked: { text: 'Chưa đến', bg: '#fef3c7', color: '#92400e' },
  checked_in: { text: 'Đã check-in', bg: '#dbeafe', color: '#1e40af' },
  completed: { text: 'Đã khám', bg: '#d1fae5', color: '#065f46' },
  cancelled: { text: 'Đã huỷ', bg: '#fee2e2', color: '#991b1b' }
};

/**
 * ReceptionistDashboard Component - Dashboard for receptionist role
 * 
 * Features:
 * - QR check-in for patients
 * - Appointment management
 * - Patient registration
 * - Patient medical records lookup (Medical Records Integration)
 * - Today's schedule overview
 * 
 * Requirements Validation:
 * - Requirement 3.3: Receptionist can access check-in QR and appointment management
 * - Medical Records System - Requirements: 9.1, 9.2, 9.3, 9.4
 */
const ReceptionistDashboard = ({ onNavigate }) => {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [todayList, setTodayList] = useState([]);
  const [todayLoading, setTodayLoading] = useState(true);
  const [todayError, setTodayError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [checkingIn, setCheckingIn] = useState(null);
  const [checkinMessage, setCheckinMessage] = useState(null);

  // Check a patient in straight from today's list (no QR needed, e.g. phone forgotten)
  const quickCheckIn = async (a) => {
    try {
      setCheckingIn(a.id);
      setCheckinMessage(null);
      const token = localStorage.getItem('auth_token');
      const res = await axios.post(`${API_BASE}/appointments/checkin`, { qrCodeToken: a.qr_code_token }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const ticket = res.data?.queue?.ticket_number;
      const room = res.data?.queue?.room;
      setCheckinMessage({ type: 'success', text: `${ticket ? `Số thứ tự ${String(ticket).padStart(2, '0')} – ` : ''}Đã check-in ${a.patient_name} (${a.time_slot}) vào hàng đợi ${/^\s*bs\.?\s/i.test(a.doctor_name || '') ? a.doctor_name : `BS. ${a.doctor_name}`}${room ? ` · Phòng ${room}` : ''}` });
      setReloadKey((k) => k + 1);
    } catch (err) {
      setCheckinMessage({ type: 'error', text: err.response?.data?.error?.message || 'Check-in thất bại' });
    } finally {
      setCheckingIn(null);
    }
  };

  // Today's front-desk overview (refreshed every 60s)
  useEffect(() => {
    let cancelled = false;
    const load = () => {
      const token = localStorage.getItem('auth_token');
      axios.get(`${API_BASE}/admin/appointments`, {
        params: { date: localYMD(), limit: 500 },
        headers: { Authorization: `Bearer ${token}` }
      })
        .then((res) => {
          if (cancelled) return;
          const list = [...(res.data.appointments || [])].sort((a, b) => a.time_slot.localeCompare(b.time_slot));
          setTodayList(list);
          setTodayError(null);
        })
        .catch((err) => {
          if (!cancelled) setTodayError(err.response?.data?.error?.message || 'Không thể tải lịch hẹn hôm nay');
        })
        .finally(() => { if (!cancelled) setTodayLoading(false); });
    };
    load();
    const timer = setInterval(load, 60000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [reloadKey]);

  const [todayFilter, setTodayFilter] = useState('all');

  const FILTERS = {
    all: (a) => a.status !== 'cancelled',
    booked: (a) => a.status === 'booked',
    checked_in: (a) => a.status === 'checked_in',
    unpaid: (a) => a.status !== 'cancelled' && a.payment_status === 'unpaid'
  };
  const todayStats = [
    { key: 'all', icon: '📅', label: 'Lịch hẹn hôm nay', color: '#26a69a' },
    { key: 'booked', icon: '🕒', label: 'Chưa đến', color: '#f59e0b' },
    { key: 'checked_in', icon: '⏳', label: 'Đang chờ khám', color: '#3b82f6' },
    { key: 'unpaid', icon: '💰', label: 'Chưa thu phí khám', color: '#ef4444' }
  ].map((s) => ({ ...s, value: todayList.filter(FILTERS[s.key]).length }));
  const filteredToday = todayList.filter(FILTERS[todayFilter]);
  const currentFilterLabel = todayStats.find((s) => s.key === todayFilter)?.label;

  // Clicking a counter filters the list below and scrolls to it
  const showStat = (key) => {
    setTodayFilter(key);
    setTimeout(() => {
      const el = document.getElementById('today-appointments');
      if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
  };

  // Search for patient medical records
  const handleSearchPatient = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    try {
      const token = localStorage.getItem('auth_token');
      // Search for users/patients first
      const response = await axios.get(`${API_BASE}/users/search`, {
        params: { query: searchQuery },
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.data.success) {
        setSearchResults(response.data.users || []);
        setShowSearchResults(true);
      }
    } catch (err) {
      console.error('Error searching patients:', err);
      alert('Không thể tìm kiếm bệnh nhân. Vui lòng thử lại.');
    } finally {
      setIsSearching(false);
    }
  };

  // View patient medical records
  // Open the staff records lookup for this patient (records are loaded there)
  const handleViewPatientRecords = (patient) => {
    onNavigate && onNavigate('patient-medical-records', { patient });
  };


  const dashboardCards = [
    {
      id: 'qr-checkin',
      title: 'QR Check-in',
      description: 'Quét mã QR check-in bệnh nhân',
      icon: '📱',
      color: '#f59e0b',
      action: () => onNavigate && onNavigate('qr-checkin')
    },
    {
      id: 'cashier',
      title: 'Thu ngân',
      description: 'Thu phí khám và tiền thuốc tại quầy',
      icon: '💰',
      color: '#5ec9bc',
      action: () => onNavigate && onNavigate('cashier')
    },
    {
      id: 'appointment-management',
      title: 'Quản lý lịch hẹn',
      description: 'Xem và quản lý các lịch hẹn',
      icon: '📅',
      color: '#3b82f6',
      action: () => onNavigate && onNavigate('appointment-management')
    },
    {
      id: 'patient-records-lookup',
      title: 'Tra cứu hồ sơ bệnh nhân',
      description: 'Tìm kiếm và xem hồ sơ y tế bệnh nhân',
      icon: '🔍',
      color: '#ec4899',
      action: () => setShowSearchResults(true)
    },
    {
      id: 'doctor-leaves',
      title: 'Lịch nghỉ bác sĩ',
      description: 'Bác sĩ nào nghỉ, bệnh nhân nào cần gọi đổi lịch',
      icon: '🌴',
      color: '#64748b',
      action: () => onNavigate && onNavigate('doctor-leaves')
    },
    {
      id: 'patient-registration',
      title: 'Đặt lịch cho bệnh nhân',
      description: 'Đặt lịch hộ bệnh nhân đến quầy / gọi điện',
      icon: '➕',
      color: '#10b981',
      action: () => onNavigate && onNavigate('booking')
    },
    {
      id: 'profile',
      title: 'Thông tin cá nhân',
      description: 'Cập nhật thông tin tài khoản',
      icon: '👤',
      color: '#8b5cf6',
      action: () => onNavigate && onNavigate('profile')
    }
  ];

  return (
    <div className="dashboard-container">
      {/* Dashboard Header */}
      <div className="dashboard-header">
        <div className="dashboard-welcome">
          <h1>Xin chào, {user.fullName}! 💼</h1>
          <p className="dashboard-subtitle">Chúc bạn một ngày làm việc vui vẻ</p>
        </div>
        <div className="dashboard-user-info">
          <div className="user-avatar receptionist">{user.fullName.charAt(0).toUpperCase()}</div>
          <div className="user-details">
            <span className="user-name">{user.fullName}</span>
            <span className="user-role">Lễ tân</span>
          </div>
        </div>
      </div>

      {/* Breadcrumb Navigation */}
      <nav className="dashboard-breadcrumb">
        <span className="breadcrumb-item" onClick={() => onNavigate && onNavigate('home')}>
          Trang chủ
        </span>
        <span className="breadcrumb-separator">›</span>
        <span className="breadcrumb-item active">Dashboard Lễ tân</span>
      </nav>

      {/* Today's counters */}
      {!todayLoading && !todayError && (
        <div className="dashboard-stats">
          {todayStats.map((s) => (
            <div
              className="stat-card"
              key={s.label}
              role="button"
              tabIndex={0}
              title={`Xem danh sách: ${s.label}`}
              onClick={() => showStat(s.key)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showStat(s.key); } }}
              style={{
                cursor: 'pointer',
                outline: todayFilter === s.key && s.key !== 'all' ? `2px solid ${s.color}` : 'none'
              }}
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

      {/* Patient Search Section */}
      {showSearchResults && (
        <div className="dashboard-section">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h2 className="section-title">🔍 Tra cứu hồ sơ bệnh nhân</h2>
            <button 
              onClick={() => setShowSearchResults(false)}
              style={{
                padding: '8px 16px',
                background: '#e2e8f0',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 600
              }}
            >
              Đóng
            </button>
          </div>
          
          <form onSubmit={handleSearchPatient} style={{ marginBottom: '20px' }}>
            <div style={{ display: 'flex', gap: '12px' }}>
              <input
                type="text"
                placeholder="Nhập tên hoặc số điện thoại bệnh nhân..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  flex: 1,
                  padding: '12px 16px',
                  border: '2px solid #e2e8f0',
                  borderRadius: '8px',
                  fontSize: '14px'
                }}
              />
              <button
                type="submit"
                disabled={isSearching}
                style={{
                  padding: '12px 30px',
                  background: 'linear-gradient(135deg, #ec4899 0%, #db2777 100%)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '15px',
                  fontWeight: 600,
                  cursor: isSearching ? 'not-allowed' : 'pointer',
                  opacity: isSearching ? 0.6 : 1
                }}
              >
                {isSearching ? 'Đang tìm...' : 'Tìm kiếm'}
              </button>
            </div>
          </form>

          {searchResults.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {searchResults.map((patient) => (
                <div
                  key={patient.id}
                  style={{
                    background: 'white',
                    padding: '20px',
                    borderRadius: '12px',
                    borderLeft: '4px solid #ec4899',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.05)'
                  }}
                >
                  <div>
                    <h4 style={{ margin: '0 0 8px 0', fontSize: '16px', fontWeight: 700 }}>
                      {patient.fullName}
                    </h4>
                    <p style={{ margin: '0', fontSize: '14px', color: '#718096' }}>
                      📞 {patient.phone}{patient.email ? ` | 📧 ${patient.email}` : ''}
                    </p>
                  </div>
                  <button
                    onClick={() => handleViewPatientRecords(patient)}
                    style={{
                      padding: '10px 24px',
                      background: 'linear-gradient(135deg, #ec4899 0%, #db2777 100%)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '14px',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    Xem hồ sơ →
                  </button>
                </div>
              ))}
            </div>
          ) : searchQuery && !isSearching ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#718096' }}>
              <p>Không tìm thấy bệnh nhân nào</p>
            </div>
          ) : null}
        </div>
      )}

      {/* Today's appointments (real data) */}
      <div className="dashboard-section" id="today-appointments">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <h2 className="section-title">
            Lịch hẹn hôm nay
            {todayFilter !== 'all' && (
              <span style={{ fontWeight: 400, fontSize: 15, color: '#6b7280' }}> · {currentFilterLabel} ({filteredToday.length})</span>
            )}
          </h2>
          <div style={{ display: 'flex', gap: 8 }}>
            {todayFilter === 'unpaid' && filteredToday.length > 0 && (
              <button
                onClick={() => onNavigate && onNavigate('cashier')}
                style={{ padding: '8px 14px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}
              >
                💰 Mở quầy thu ngân
              </button>
            )}
            {todayFilter === 'booked' && filteredToday.length > 0 && (
              <button
                onClick={() => onNavigate && onNavigate('qr-checkin')}
                style={{ padding: '8px 14px', background: '#f59e0b', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}
              >
                📷 Quét QR check-in
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
        {checkinMessage && (
          <div className={`quick-checkin-msg ${checkinMessage.type === 'error' ? 'is-error' : ''}`} role="status">
            {checkinMessage.type === 'error' ? '⚠️ ' : '✅ '}{checkinMessage.text}
          </div>
        )}
        {todayLoading ? (
          <div className="loading-stats">Đang tải lịch hẹn...</div>
        ) : todayError ? (
          <p style={{ color: '#b91c1c' }}>{todayError}</p>
        ) : filteredToday.length === 0 ? (
          <p style={{ color: '#6b7280' }}>
            📭 {todayFilter === 'all' ? 'Hôm nay chưa có lịch hẹn nào.' : `Không có lịch hẹn nào ở mục "${currentFilterLabel}".`}
          </p>
        ) : (
          <div className="checkin-list">
            {filteredToday.map((a) => {
              const st = STATUS_LABELS[a.status] || STATUS_LABELS.booked;
              return (
                <div className="checkin-item" key={a.id}>
                  <div className="checkin-time">{a.time_slot}</div>
                  <div className="checkin-content">
                    <div className="checkin-patient">{a.patient_name} · {a.patient_phone}{a.booking_code ? <span className="checkin-code"> · {a.booking_code}</span> : null}</div>
                    <div className="checkin-doctor">
                      BS. {a.doctor_name} – {a.department_name}
                      {a.status !== 'cancelled' && a.payment_status === 'unpaid' ? ' · 💰 chưa thu phí' : ''}
                    </div>
                  </div>
                  {a.status !== 'cancelled' && (
                    <button
                      type="button"
                      className="slip-print-btn"
                      title="In phiếu khám có mã QR"
                      aria-label={`In phiếu khám cho ${a.patient_name}`}
                      onClick={() => {
                        if (!printAppointmentSlip(a)) {
                          setCheckinMessage({ type: 'error', text: 'Trình duyệt đang chặn cửa sổ in. Hãy cho phép pop-up cho trang này rồi bấm lại.' });
                        }
                      }}
                    >
                      🖨
                    </button>
                  )}
                  {a.status === 'booked' && a.qr_code_token ? (
                    <button
                      type="button"
                      className="quick-checkin-btn"
                      onClick={() => quickCheckIn(a)}
                      disabled={checkingIn === a.id}
                    >
                      {checkingIn === a.id ? 'Đang check-in…' : '✓ Check-in'}
                    </button>
                  ) : (
                    <div className="checkin-status" style={{ background: st.bg, color: st.color }}>{st.text}</div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default ReceptionistDashboard;
