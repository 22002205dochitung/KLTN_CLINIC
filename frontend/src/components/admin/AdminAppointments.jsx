import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import './AdminAppointments.css';
import AppointmentEditModal from './AppointmentEditModal';

import { API_BASE } from '../../config/api';

/**
 * AdminAppointments Component - Full appointment management for admin
 * 
 * Features:
 * - View all appointments in a table
 * - Filter by status, date, doctor
 * - Search functionality
 * - View appointment details
 * - Update appointment status
 */
const AdminAppointments = ({ onNavigate, initialFilters }) => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [activeTab, setActiveTab] = useState('appointments'); // 'appointments' or 'audit-logs'
  const [appointments, setAppointments] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // Dashboard counters can open this page pre-filtered (e.g. today, status=booked)
  const [filters, setFilters] = useState({
    status: '',
    date: '',
    doctorId: '',
    ...(initialFilters || {})
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [editing, setEditing] = useState(null);
  const [notice, setNotice] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const handleDelete = async (apt) => {
    const ok = window.confirm(
      `Xoá vĩnh viễn lịch hẹn ${apt.booking_code || `#${apt.id}`} của ${apt.patient_name} (${apt.time_slot}, ${formatDate(apt.appointment_date)})?

` +
      'Chỉ xoá được lịch chưa check-in và chưa thanh toán. Thao tác này không thể hoàn tác.'
    );
    if (!ok) return;
    setDeletingId(apt.id);
    setNotice(null);
    try {
      const res = await axios.delete(`${API_BASE}/admin/appointments/${apt.id}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
      });
      setNotice({ type: 'success', text: res.data.message });
      setAppointments((list) => list.filter((a) => a.id !== apt.id));
    } catch (err) {
      setNotice({ type: 'error', text: err.response?.data?.error?.message || 'Không thể xoá lịch hẹn' });
    } finally {
      setDeletingId(null);
    }
  };

  useEffect(() => {
    if (activeTab === 'appointments') {
      loadAppointments();
    } else if (activeTab === 'audit-logs') {
      loadAuditLogs();
    }
  }, [filters, activeTab]);

  const loadAppointments = async () => {
    try {
      setLoading(true);
      setError('');

      const token = localStorage.getItem('auth_token');
      const params = new URLSearchParams();
      
      if (filters.status) params.append('status', filters.status);
      if (filters.date) params.append('date', filters.date);
      if (filters.doctorId) params.append('doctorId', filters.doctorId);

      const response = await axios.get(
        `${API_BASE}/admin/appointments?${params.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      if (response.data.success) {
        setAppointments(response.data.appointments || []);
      }
    } catch (err) {
      console.error('Error loading appointments:', err);
      setError('Không thể tải danh sách lịch hẹn');
    } finally {
      setLoading(false);
    }
  };

  const loadAuditLogs = async () => {
    try {
      setLoading(true);
      setError('');

      const token = localStorage.getItem('auth_token');
      const params = new URLSearchParams();
      
      // Filter for appointment-related events only
      params.append('eventTypes', 'appointment_created,public_appointment_created,appointment_cancelled,appointment_rescheduled,appointment_checkin');
      
      if (filters.date) params.append('date', filters.date);

      const response = await axios.get(
        `${API_BASE}/admin/audit-logs?${params.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      if (response.data.success) {
        setAuditLogs(response.data.data || []);
      }
    } catch (err) {
      console.error('Error loading audit logs:', err);
      setError('Không thể tải nhật ký hoạt động');
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadgeClass = (status) => {
    const statusMap = {
      'booked': 'status-booked',
      'checked_in': 'status-checked-in',
      'completed': 'status-completed',
      'cancelled': 'status-cancelled'
    };
    return statusMap[status] || 'status-default';
  };

  const getStatusText = (status) => {
    const statusMap = {
      'booked': 'Đã xác nhận – chờ check-in',
      'checked_in': 'Đã check-in',
      'completed': 'Hoàn thành',
      'cancelled': 'Đã hủy'
    };
    return statusMap[status] || status;
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('vi-VN');
  };

  const formatDateTime = (dateString) => {
    return new Date(dateString).toLocaleString('vi-VN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const getEventTypeLabel = (eventType) => {
    const labels = {
      'appointment_created': 'Đặt lịch (Đã đăng nhập)',
      'public_appointment_created': 'Đặt lịch (Công khai)',
      'appointment_cancelled': 'Hủy lịch',
      'appointment_rescheduled': 'Đổi lịch',
      'appointment_checkin': 'Check-in'
    };
    return labels[eventType] || eventType;
  };

  const getEventIcon = (eventType) => {
    const icons = {
      'appointment_created': '📅',
      'public_appointment_created': '🌐',
      'appointment_cancelled': '❌',
      'appointment_rescheduled': '🔄',
      'appointment_checkin': '✅'
    };
    return icons[eventType] || '📋';
  };

  const filteredAppointments = appointments.filter(apt => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      apt.patient_name?.toLowerCase().includes(search) ||
      apt.patient_phone?.includes(search) ||
      apt.doctor_name?.toLowerCase().includes(search) ||
      apt.department_name?.toLowerCase().includes(search)
    );
  });

  return (
    <div className="admin-appointments-container">
      {/* Header */}
      <div className="appointments-header">
        <div className="header-content">
          <button className="btn-back" onClick={() => onNavigate && onNavigate('dashboard')}>
            ← Quay lại
          </button>
          <div className="header-title">
            <h1>Quản lý lịch hẹn</h1>
            <p className="subtitle">Xem và quản lý tất cả lịch hẹn trong hệ thống</p>
          </div>
        </div>
      </div>

      {/* Breadcrumb */}
      <nav className="breadcrumb">
        <span className="breadcrumb-item" onClick={() => onNavigate && onNavigate('home')}>
          Trang chủ
        </span>
        <span className="breadcrumb-separator">›</span>
        <span className="breadcrumb-item" onClick={() => onNavigate && onNavigate('dashboard')}>
          {isAdmin ? 'Dashboard Quản trị' : 'Dashboard Lễ tân'}
        </span>
        <span className="breadcrumb-separator">›</span>
        <span className="breadcrumb-item active">Quản lý lịch hẹn</span>
      </nav>

      {/* Tab Navigation */}
      <div className="tabs-navigation">
        <button
          className={`tab-button ${activeTab === 'appointments' ? 'active' : ''}`}
          onClick={() => setActiveTab('appointments')}
        >
          📋 Tất cả ({appointments.length})
        </button>
        {isAdmin && (
          <button
            className={`tab-button ${activeTab === 'audit-logs' ? 'active' : ''}`}
            onClick={() => setActiveTab('audit-logs')}
          >
            📝 Nhật ký hoạt động ({auditLogs.length})
          </button>
        )}
      </div>

      {/* Filters and Search */}
      {activeTab === 'appointments' && (
        <div className="appointments-controls">
          <div className="search-box">
            <input
              type="text"
              placeholder="🔍 Tìm kiếm theo tên, SĐT, bác sĩ..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="filters">
            <select
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
            >
              <option value="">Tất cả trạng thái</option>
              <option value="booked">Chờ check-in (đã xác nhận)</option>
              <option value="checked_in">Đã check-in</option>
              <option value="completed">Hoàn thành</option>
              <option value="cancelled">Đã hủy</option>
            </select>

            <input
              type="date"
              value={filters.date}
              onChange={(e) => setFilters({ ...filters, date: e.target.value })}
            />

            <button className="btn-refresh" onClick={loadAppointments}>
              🔄 Làm mới
            </button>
          </div>
        </div>
      )}

      {activeTab === 'audit-logs' && (
        <div className="appointments-controls">
          <div className="filters">
            <input
              type="date"
              value={filters.date}
              onChange={(e) => setFilters({ ...filters, date: e.target.value })}
              placeholder="Lọc theo ngày"
            />

            <button className="btn-refresh" onClick={loadAuditLogs}>
              🔄 Làm mới
            </button>
          </div>
        </div>
      )}

      {/* Statistics Summary */}
      {activeTab === 'appointments' && (
        <div className="appointments-summary">
          <div className="summary-card">
            <span className="summary-label">Tổng số:</span>
            <span className="summary-value">{filteredAppointments.length}</span>
          </div>
          <div className="summary-card booked">
            <span className="summary-label">Chờ check-in:</span>
            <span className="summary-value">
              {filteredAppointments.filter(a => a.status === 'booked').length}
            </span>
          </div>
          <div className="summary-card checked-in">
            <span className="summary-label">Đã check-in:</span>
            <span className="summary-value">
              {filteredAppointments.filter(a => a.status === 'checked_in').length}
            </span>
          </div>
          <div className="summary-card completed">
            <span className="summary-label">Hoàn thành:</span>
            <span className="summary-value">
              {filteredAppointments.filter(a => a.status === 'completed').length}
            </span>
          </div>
        </div>
      )}

      {notice && (
        <div className={`admin-notice is-${notice.type}`} role="status">
          <span>{notice.text}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Đóng thông báo">×</button>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="error-message">
          <span className="error-icon">⚠️</span>
          {error}
        </div>
      )}

      {/* Tab Content */}
      {activeTab === 'appointments' && (
        <>
          {/* Loading State */}
          {loading ? (
            <div className="loading-container">
              <div className="spinner"></div>
              <p>Đang tải danh sách lịch hẹn...</p>
            </div>
          ) : filteredAppointments.length === 0 ? (
            <div className="no-data">
              <div className="no-data-icon">📅</div>
              <h3>Không có lịch hẹn nào</h3>
              <p>Chưa có lịch hẹn nào trong hệ thống</p>
            </div>
          ) : (
            <div className="appointments-table-container">
              <table className="appointments-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Bệnh nhân</th>
                    <th>Số điện thoại</th>
                    <th>Bác sĩ</th>
                    <th>Chuyên khoa</th>
                    <th>Ngày khám</th>
                    <th>Giờ khám</th>
                    <th>Trạng thái</th>
                    <th>Ngày tạo</th>
                    {isAdmin && <th>Thao tác</th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredAppointments.map((apt) => (
                    <tr key={apt.id}>
                      <td className="apt-id">{apt.booking_code || `#${apt.id}`}</td>
                      <td className="patient-name">
                        <strong>{apt.patient_name}</strong>
                      </td>
                      <td className="patient-phone">{apt.patient_phone}</td>
                      <td className="doctor-name">{apt.doctor_name}</td>
                      <td className="department">{apt.department_name}</td>
                      <td className="apt-date">{formatDate(apt.appointment_date)}</td>
                      <td className="time-slot">{apt.time_slot}</td>
                      <td>
                        <span className={`status-badge ${getStatusBadgeClass(apt.status)}`}>
                          {getStatusText(apt.status)}
                        </span>
                      </td>
                      <td className="created-date">{formatDate(apt.created_at)}</td>
                      {isAdmin && (
                        <td className="row-actions">
                          <button
                            type="button"
                            className="btn-row is-edit"
                            onClick={() => setEditing(apt)}
                            title={apt.status === 'completed' ? 'Xem (đã khám – không sửa được)' : 'Sửa lịch hẹn'}
                          >
                            ✏️ {apt.status === 'completed' ? 'Xem' : 'Sửa'}
                          </button>
                          <button
                            type="button"
                            className="btn-row is-delete"
                            onClick={() => handleDelete(apt)}
                            disabled={deletingId === apt.id || ['checked_in', 'completed'].includes(apt.status) || (apt.payment_status && apt.payment_status !== 'unpaid')}
                            title={['checked_in', 'completed'].includes(apt.status)
                              ? 'Đã check-in/khám – không xoá được'
                              : apt.payment_status && apt.payment_status !== 'unpaid'
                                ? 'Đã thanh toán – không xoá được, hãy huỷ lịch'
                                : 'Xoá lịch hẹn'}
                          >
                            🗑️ Xoá
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {activeTab === 'audit-logs' && (
        <>
          {/* Loading State */}
          {loading ? (
            <div className="loading-container">
              <div className="spinner"></div>
              <p>Đang tải nhật ký hoạt động...</p>
            </div>
          ) : auditLogs.length === 0 ? (
            <div className="no-data">
              <div className="no-data-icon">📝</div>
              <h3>Không có nhật ký nào</h3>
              <p>Chưa có hoạt động đặt lịch nào trong hệ thống</p>
            </div>
          ) : (
            <div className="audit-logs-table-container">
              <table className="audit-logs-table">
                <thead>
                  <tr>
                    <th>Thời gian</th>
                    <th>Loại hoạt động</th>
                    <th>Người dùng</th>
                    <th>Chi tiết</th>
                    <th>Địa chỉ IP</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.map((log) => {
                    let details = {};
                    try {
                      details = JSON.parse(log.event_details || '{}');
                    } catch (e) {
                      details = {};
                    }

                    return (
                      <tr key={log.log_id}>
                        <td className="timestamp-cell">
                          {formatDateTime(log.timestamp)}
                        </td>
                        <td className="event-cell">
                          <span className="event-icon">{getEventIcon(log.event_type)}</span>
                          <span className="event-label">{getEventTypeLabel(log.event_type)}</span>
                        </td>
                        <td className="user-cell">
                          User #{log.user_id}
                        </td>
                        <td className="details-cell">
                          <div className="details-content">
                            {details.appointmentId && (
                              <div><strong>Lịch hẹn:</strong> #{details.appointmentId}</div>
                            )}
                            {details.patientName && (
                              <div><strong>Bệnh nhân:</strong> {details.patientName}</div>
                            )}
                            {details.doctorName && (
                              <div><strong>Bác sĩ:</strong> {details.doctorName}</div>
                            )}
                            {details.appointmentDate && (
                              <div><strong>Ngày:</strong> {formatDate(details.appointmentDate)}</div>
                            )}
                            {details.timeSlot && (
                              <div><strong>Giờ:</strong> {details.timeSlot}</div>
                            )}
                            {details.oldDate && details.newDate && (
                              <div>
                                <strong>Từ:</strong> {formatDate(details.oldDate)} {details.oldTimeSlot} 
                                <br />
                                <strong>Sang:</strong> {formatDate(details.newDate)} {details.newTimeSlot}
                              </div>
                            )}
                            {details.checkedInBy && (
                              <div><strong>Check-in bởi:</strong> {details.checkedInBy}</div>
                            )}
                          </div>
                        </td>
                        <td className="ip-cell">
                          <code>{log.ip_address}</code>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      {editing && (
        <AppointmentEditModal
          appointment={editing}
          onClose={() => setEditing(null)}
          onSaved={(message) => {
            setEditing(null);
            setNotice({ type: 'success', text: message });
            loadAppointments();
          }}
        />
      )}
    </div>
  );
};

export default AdminAppointments;
