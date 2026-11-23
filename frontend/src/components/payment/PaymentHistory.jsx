import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import axios from 'axios';
import './PaymentHistory.css';

import { API_BASE } from '../../config/api';

/**
 * PaymentHistory Component
 * Displays patient's payment history
 */
const PaymentHistory = () => {
  const { user } = useAuth();
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadPaymentHistory();
  }, []);

  const loadPaymentHistory = async () => {
    try {
      setLoading(true);
      setError('');

      const token = localStorage.getItem('auth_token');
      const response = await axios.get(`${API_BASE}/payments/my-history`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.data.success) {
        setPayments(response.data.data || []);
      }
    } catch (err) {
      console.error('Error loading payment history:', err);
      setError('Không thể tải lịch sử thanh toán. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

  const getTransactionTypeLabel = (type) => {
    const types = {
      consultation: '💊 Phí khám',
      medication: '💉 Tiền thuốc',
      other: '📄 Khác'
    };
    return types[type] || type;
  };

  const getPaymentMethodLabel = (method) => {
    const methods = {
      cash: '💵 Tiền mặt',
      bank_transfer: '🏦 Chuyển khoản',
      card: '💳 Thẻ',
      momo: '📱 MoMo',
      vnpay: '🔷 VNPay'
    };
    return methods[method] || method;
  };

  const getPaymentStatusBadge = (status) => {
    const statusConfig = {
      completed: { label: 'Đã thanh toán', class: 'status-completed' },
      pending: { label: 'Chờ thanh toán', class: 'status-pending' },
      failed: { label: 'Thất bại', class: 'status-failed' },
      refunded: { label: 'Đã hoàn tiền', class: 'status-refunded' }
    };
    const config = statusConfig[status] || { label: status, class: '' };
    return <span className={`status-badge ${config.class}`}>{config.label}</span>;
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleString('vi-VN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const calculateTotal = () => {
    return payments
      .filter(p => p.payment_status === 'completed')
      .reduce((sum, p) => sum + parseFloat(p.amount), 0);
  };

  if (loading) {
    return (
      <div className="payment-history-container">
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Đang tải lịch sử thanh toán...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="payment-history-container">
        <div className="error-state">
          <span className="error-icon">⚠️</span>
          <p>{error}</p>
          <button className="btn-retry" onClick={loadPaymentHistory}>
            Thử lại
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="payment-history-container">
      <div className="history-header">
        <h1>💳 Lịch sử thanh toán</h1>
        <div className="header-stats">
          <div className="stat-card">
            <span className="stat-label">Tổng giao dịch</span>
            <span className="stat-value">{payments.length}</span>
          </div>
          <div className="stat-card highlight">
            <span className="stat-label">Tổng chi</span>
            <span className="stat-value">{calculateTotal().toLocaleString('vi-VN')} đ</span>
          </div>
        </div>
      </div>

      {payments.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon">📭</span>
          <h3>Chưa có lịch sử thanh toán</h3>
          <p>Bạn chưa có giao dịch thanh toán nào trong hệ thống</p>
        </div>
      ) : (
        <div className="payments-list">
          {payments.map((payment) => (
            <div key={payment.id} className="payment-card">
              <div className="payment-header">
                <div className="payment-type">
                  {getTransactionTypeLabel(payment.transaction_type)}
                </div>
                {getPaymentStatusBadge(payment.payment_status)}
              </div>

              <div className="payment-body">
                <div className="payment-info">
                  {payment.department_name && (
                    <div className="info-row">
                      <span className="info-label">Khoa:</span>
                      <span className="info-value">{payment.department_name}</span>
                    </div>
                  )}
                  {payment.service_date && (
                    <div className="info-row">
                      <span className="info-label">Ngày khám:</span>
                      <span className="info-value">
                        {new Date(payment.service_date).toLocaleDateString('vi-VN')}
                      </span>
                    </div>
                  )}
                  <div className="info-row">
                    <span className="info-label">Phương thức:</span>
                    <span className="info-value">
                      {getPaymentMethodLabel(payment.payment_method)}
                    </span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Thời gian:</span>
                    <span className="info-value">{formatDate(payment.created_at)}</span>
                  </div>
                  {payment.notes && (
                    <div className="info-row">
                      <span className="info-label">Ghi chú:</span>
                      <span className="info-value">{payment.notes}</span>
                    </div>
                  )}
                </div>

                <div className="payment-amount">
                  <span className="amount-label">Số tiền</span>
                  <span className="amount-value">
                    {parseFloat(payment.amount).toLocaleString('vi-VN')} đ
                  </span>
                </div>
              </div>

              <div className="payment-footer">
                <span className="transaction-id">Mã GD: #{payment.id}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default PaymentHistory;
