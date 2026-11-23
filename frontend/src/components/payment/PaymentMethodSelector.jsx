import React from 'react';
import './PaymentMethodSelector.css';

/**
 * PaymentMethodSelector Component
 * Allows users to select payment method
 * 
 * Methods:
 * - cash: Tiền mặt tại quầy
 * - bank_transfer: Chuyển khoản ngân hàng
 * - card: Thẻ tín dụng/ghi nợ
 * - momo: Ví MoMo
 * - vnpay: VNPay
 */
const PaymentMethodSelector = ({ selectedMethod, onSelect, disabled = false }) => {
  const paymentMethods = [
    {
      value: 'cash',
      label: 'Tiền mặt',
      icon: '💵',
      description: 'Thanh toán tại quầy lễ tân',
      popular: true
    },
    {
      value: 'bank_transfer',
      label: 'Chuyển khoản',
      icon: '🏦',
      description: 'Chuyển khoản ngân hàng'
    },
    {
      value: 'momo',
      label: 'Ví MoMo',
      icon: '📱',
      description: 'Thanh toán qua ví MoMo',
      popular: true
    },
    {
      value: 'card',
      label: 'Thẻ',
      icon: '💳',
      description: 'Thẻ tín dụng/ghi nợ'
    },
    {
      value: 'vnpay',
      label: 'VNPay',
      icon: '🔷',
      description: 'Cổng thanh toán VNPay'
    }
  ];

  return (
    <div className="payment-method-selector">
      <div className="payment-methods-grid">
        {paymentMethods.map(method => (
          <button
            key={method.value}
            type="button"
            className={`payment-method-card ${selectedMethod === method.value ? 'selected' : ''} ${method.popular ? 'popular' : ''}`}
            onClick={() => !disabled && onSelect(method.value)}
            disabled={disabled}
          >
            {method.popular && <span className="popular-badge">Phổ biến</span>}
            <div className="method-icon">{method.icon}</div>
            <div className="method-label">{method.label}</div>
            <div className="method-description">{method.description}</div>
            {selectedMethod === method.value && (
              <div className="selected-check">✓</div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
};

export default PaymentMethodSelector;
