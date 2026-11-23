import axios from 'axios';

import { API_BASE } from '../../config/api';

export { API_BASE };

/** Axios instance for /api/payments with the auth token attached */
export const paymentApi = axios.create({ baseURL: `${API_BASE}/payments` });
paymentApi.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export const getErrorMessage = (err, fallback = 'Đã xảy ra lỗi. Vui lòng thử lại.') =>
  err?.response?.data?.error?.message || err?.response?.data?.message || fallback;

export const formatCurrency = (amount) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 })
    .format(Number(amount) || 0);

/** Compact money label for chart axes: 1.2tr, 350k */
export const formatCompact = (amount) => {
  const n = Number(amount) || 0;
  if (n >= 1e9) return `${(n / 1e9).toFixed(1).replace(/\.0$/, '')} tỷ`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}tr`;
  if (n >= 1e3) return `${Math.round(n / 1e3)}k`;
  return String(n);
};

export const formatDate = (value) => {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString('vi-VN');
};

export const formatDateTime = (value) => {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? String(value)
    : d.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

/** YYYY-MM-DD in local time (input[type=date] value) */
export const toInputDate = (d = new Date()) => {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export const PAYMENT_METHOD_LABELS = {
  cash: 'Tiền mặt',
  bank_transfer: 'Chuyển khoản',
  card: 'Thẻ',
  momo: 'Ví MoMo',
  vnpay: 'VNPay'
};

export const TRANSACTION_TYPE_LABELS = {
  consultation: 'Phí khám',
  medication: 'Tiền thuốc',
  other: 'Khác'
};

export const TRANSACTION_STATUS = {
  completed: { label: 'Đã thanh toán', className: 'pm-status-completed', icon: '✓' },
  pending: { label: 'Chờ thanh toán', className: 'pm-status-pending', icon: '…' },
  failed: { label: 'Thất bại', className: 'pm-status-failed', icon: '✕' },
  refunded: { label: 'Đã hoàn tiền', className: 'pm-status-refunded', icon: '↺' }
};
