import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import './Dashboard.css';

import { API_BASE } from '../../config/api';

/**
 * AdminDashboard Component - Dashboard for admin role
 * 
 * Features:
 * - System overview and statistics
 * - User management
 * - Appointment management
 * - Security monitoring
 * - All system management functions
 * 
 * Requirements Validation:
 * - Requirement 3.4: Admin can access all system management functions
 */
const AdminDashboard = ({ onNavigate }) => {
  const { user } = useAuth();
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalAppointments: 0,
    todayAppointments: 0,
    pendingAppointments: 0
  });
  const [recentAppointments, setRecentAppointments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      // Fetch appointments from database
      // Note: We'll need to add admin endpoints later, for now query directly
      const response = await axios.get(`${API_BASE}/admin/dashboard-stats`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('auth_token')}`
        }
      });
      
      if (response.data.success) {
        setStats(response.data.stats);
        setRecentAppointments(response.data.recentAppointments || []);
      }
    } catch (error) {
      console.error('Error loading dashboard data:', error);
      // For now, show zero stats if endpoint doesn't exist yet
      setStats({
        totalUsers: 0,
        totalAppointments: 0,
        todayAppointments: 0,
        pendingAppointments: 0
      });
    } finally {
      setLoading(false);
    }
  };

  const dashboardCards = [
    {
      id: 'user-management',
      title: 'Quản lý người dùng',
      description: 'Quản lý tài khoản và phân quyền',
      icon: '👥',
      color: '#ef4444',
      action: () => onNavigate && onNavigate('user-management')
    },
    {
      id: 'appointment-management',
      title: 'Quản lý lịch hẹn',
      description: 'Xem và quản lý tất cả lịch hẹn',
      icon: '📅',
      color: '#f59e0b',
      action: () => onNavigate && onNavigate('appointment-management')
    },
    {
      id: 'payment-management',
      title: 'Doanh thu & Thanh toán',
      description: 'Thống kê doanh thu, giao dịch, bảng giá khám',
      icon: '📊',
      color: '#26a69a',
      action: () => onNavigate && onNavigate('payment-management')
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
      id: 'doctor-management',
      title: 'Quản lý bác sĩ',
      description: 'Quản lý thông tin bác sĩ',
      icon: '👨‍⚕️',
      color: '#10b981',
      action: () => onNavigate && onNavigate('doctor-management')
    },
    {
      id: 'department-management',        
      title: 'Quản lý chuyên khoa',
      description: 'Quản lý khoa phòng',
      icon: '🏥',
      color: '#3b82f6',
      action: () => onNavigate && onNavigate('department-management')
    },
    {
      id: 'security-monitoring',
      title: 'Giám sát bảo mật',
      description: 'Theo dõi hoạt động đăng nhập',
      icon: '🔒',
      color: '#8b5cf6',
      action: () => onNavigate && onNavigate('security-monitoring')
    },
    {
      id: 'doctor-ratings',
      title: 'Đánh giá bác sĩ',
      description: 'Xếp hạng theo điểm bệnh nhân chấm sau khi khám',
      icon: '⭐',
      color: '#f59e0b',
      action: () => onNavigate && onNavigate('doctor-ratings')
    },
    {
      id: 'doctor-leaves',
      title: 'Lịch nghỉ bác sĩ',
      description: 'Khai báo ngày nghỉ, xem lịch hẹn bị ảnh hưởng',
      icon: '🌴',
      color: '#64748b',
      action: () => onNavigate && onNavigate('doctor-leaves')
    },
    {
      id: 'admin-statistics',
      title: 'Thống kê lịch hẹn',
      description: 'Báo cáo lịch hẹn theo khoa, bác sĩ và tỉ lệ vắng mặt',
      icon: '📊',
      color: '#26a69a',
      action: () => onNavigate && onNavigate('admin-statistics')
    },
    {
      id: 'doctor-shifts',
      title: 'Ca trực bác sĩ',
      description: 'Lịch trực hằng tuần và theo ngày – quyết định khung giờ đặt khám',
      icon: '🗓️',
      color: '#6366f1',
      action: () => onNavigate && onNavigate('doctor-shifts')
    },
    {
      id: 'recommendation-settings',
      title: 'Gợi ý lịch khám thông minh',
      description: 'Cấu hình luật gợi ý, từ khoá triệu chứng, chạy thử và đo hiệu quả',
      icon: '✨',
      color: '#5ec9bc',
      action: () => onNavigate && onNavigate('recommendation-settings')
    },
    {
      id: 'medicine-management',
      title: 'Danh mục thuốc',
      description: 'Thuốc để bác sĩ kê đơn, giá bán và tồn kho',
      icon: '💊',
      color: '#a855f7',
      action: () => onNavigate && onNavigate('medicine-management')
    }
  ];

  const pad = (n) => String(n).padStart(2, '0');
  const now = new Date();
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const go = (page, data) => onNavigate && onNavigate(page, data);

  // Each counter opens the page that lists what it counts
  const statCards = [
    {
      icon: '👥', label: 'Tổng người dùng', value: stats.totalUsers, color: '#ef4444',
      hint: 'Xem danh sách người dùng', action: () => go('user-management')
    },
    {
      icon: '📅', label: 'Tổng lịch hẹn', value: stats.totalAppointments, color: '#f59e0b',
      hint: 'Xem tất cả lịch hẹn', action: () => go('appointment-management', { filters: {} })
    },
    {
      icon: '📋', label: 'Lịch hôm nay', value: stats.todayAppointments, color: '#10b981',
      hint: 'Xem lịch hẹn hôm nay', action: () => go('appointment-management', { filters: { date: today } })
    },
    {
      icon: '⏳', label: 'Chờ check-in', value: stats.pendingAppointments, color: '#3b82f6',
      hint: 'Xem lịch hẹn chưa check-in', action: () => go('appointment-management', { filters: { status: 'booked' } })
    }
  ];

  return (
    <div className="dashboard-container">
      {/* Dashboard Header */}
      <div className="dashboard-header">
        <div className="dashboard-welcome">
          <h1>Xin chào, {user.fullName}! 👨‍💼</h1>
          <p className="dashboard-subtitle">Bảng điều khiển quản trị hệ thống</p>
        </div>
        <div className="dashboard-user-info">
          <div className="user-avatar admin">{user.fullName.charAt(0).toUpperCase()}</div>
          <div className="user-details">
            <span className="user-name">{user.fullName}</span>
            <span className="user-role">Quản trị viên</span>
          </div>
        </div>
      </div>

      {/* Breadcrumb Navigation */}
      <nav className="dashboard-breadcrumb">
        <span className="breadcrumb-item" onClick={() => onNavigate && onNavigate('home')}>
          Trang chủ
        </span>
        <span className="breadcrumb-separator">›</span>
        <span className="breadcrumb-item active">Dashboard Quản trị</span>
      </nav>

      {/* Quick Stats */}
      {loading ? (
        <div className="loading-stats">Đang tải thống kê...</div>
      ) : (
        <div className="dashboard-stats">
          {statCards.map((s) => (
            <div
              className="stat-card"
              key={s.label}
              role="button"
              tabIndex={0}
              title={s.hint}
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

      {/* System Status */}
      <div className="dashboard-section">
        <h2 className="section-title">Trạng thái hệ thống</h2>
        <div className="system-status">
          <div className="status-item">
            <div className="status-indicator online"></div>
            <div className="status-label">Backend API</div>
            <div className="status-value">Hoạt động bình thường</div>
          </div>
          <div className="status-item">
            <div className="status-indicator online"></div>
            <div className="status-label">Database</div>
            <div className="status-value">Kết nối tốt</div>
          </div>
          <div className="status-item">
            <div className="status-indicator online"></div>
            <div className="status-label">Authentication</div>
            <div className="status-value">Hoạt động bình thường</div>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="dashboard-section">
        <h2 className="section-title">Lịch hẹn gần đây</h2>
        {loading ? (
          <div className="loading-activity">Đang tải...</div>
        ) : recentAppointments.length > 0 ? (
          <div className="activity-list">
            {recentAppointments.map((apt, index) => (
              <div key={index} className="activity-item">
                <div className="activity-icon">📅</div>
                <div className="activity-content">
                  <div className="activity-title">
                    Lịch hẹn #{apt.id} - {apt.patient_name || 'N/A'}
                  </div>
                  <div className="activity-description">
                    {apt.doctor_name} - {apt.department_name}
                  </div>
                  <div className="activity-time">
                    {new Date(apt.appointment_date).toLocaleDateString('vi-VN')} - {apt.time_slot}
                  </div>
                  <div className={`activity-status status-${apt.status}`}>
                    {apt.status === 'booked' ? 'Chờ check-in' : 
                     apt.status === 'checked_in' ? 'Đã check-in' :
                     apt.status === 'completed' ? 'Hoàn thành' : 'Đã hủy'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="no-activity">Chưa có lịch hẹn nào</div>
        )}
      </div>
    </div>
  );
};

export default AdminDashboard;
