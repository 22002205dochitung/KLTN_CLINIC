import React from 'react';
import './PaymentSummary.css';

/**
 * PaymentSummary Component
 * Displays payment summary before confirmation
 */
const PaymentSummary = ({ 
  appointmentDetails,
  consultationFee,
  paymentMethod,
  showDetails = true
}) => {
  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('vi-VN', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const getPaymentMethodLabel = (method) => {
    const methods = {
      cash: '💵 Tiền mặt',
      bank_transfer: '🏦 Chuyển khoản',
      card: '💳 Thẻ',
      momo: '📱 Ví MoMo',
      vnpay: '🔷 VNPay'
    };
    return methods[method] || method;
  };

  return (
    <div className="payment-summary">
      <div className="summary-header">
        <h3>📋 Tóm tắt thanh toán</h3>
      </div>

      {showDetails && appointmentDetails && (
        <div className="summary-section">
          <h4>Thông tin lịch khám</h4>
          <div className="summary-row">
            <span className="label">Bệnh nhân:</span>
            <span className="value">{appointmentDetails.patientName}</span>
          </div>
          {appointmentDetails.phone && (
            <div className="summary-row">
              <span className="label">Số điện thoại:</span>
              <span className="value">{appointmentDetails.phone}</span>
            </div>
          )}
          <div className="summary-row">
            <span className="label">Bác sĩ:</span>
            <span className="value">{appointmentDetails.doctorName}</span>
          </div>
          <div className="summary-row">
            <span className="label">Chuyên khoa:</span>
            <span className="value">{appointmentDetails.departmentName}</span>
          </div>
          <div className="summary-row">
            <span className="label">Ngày khám:</span>
            <span className="value">{formatDate(appointmentDetails.appointmentDate)}</span>
          </div>
          <div className="summary-row">
            <span className="label">Giờ khám:</span>
            <span className="value">{appointmentDetails.timeSlot}</span>
          </div>
        </div>
      )}

      <div className="summary-section">
        <h4>Chi tiết thanh toán</h4>
        <div className="summary-row">
          <span className="label">Phí khám bệnh:</span>
          <span className="value">{consultationFee.toLocaleString('vi-VN')} đ</span>
        </div>
        {paymentMethod && (
          <div className="summary-row highlight">
            <span className="label">Phương thức:</span>
            <span className="value">{getPaymentMethodLabel(paymentMethod)}</span>
          </div>
        )}
      </div>

      <div className="summary-total">
        <span className="total-label">Tổng cần thanh toán:</span>
        <span className="total-amount">{consultationFee.toLocaleString('vi-VN')} đ</span>
      </div>

      <div className="payment-note">
        <strong>📌 Lưu ý:</strong>
        <ul>
          <li>Vui lòng mang theo CMND/CCCD khi đến khám</li>
          <li>Đến trước giờ hẹn 15 phút để làm thủ tục</li>
          <li>Sau khi thanh toán, vui lòng giữ biên lai</li>
        </ul>
      </div>
    </div>
  );
};

export default PaymentSummary;
