import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { API_BASE } from '../../config/api';
import './SepayGateway.css';

let statusPromise = null;
const gatewayStatus = () => {
  if (!statusPromise) {
    statusPromise = axios.get(`${API_BASE}/payments/sepay/status`)
      .then((r) => r.data?.data || { enabled: false })
      .catch(() => ({ enabled: false }));
  }
  return statusPromise;
};

/** Post the signed fields to SePay's checkout page (a normal form POST, like the SDK sample) */
const submitToSepay = ({ action, fields }) => {
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = action;
  Object.entries(fields).forEach(([name, value]) => {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = value;
    form.appendChild(input);
  });
  document.body.appendChild(form);
  form.submit();
};

/**
 * "Thanh toán online qua SePay" – card / VietQR / NAPAS on SePay's page, confirmed automatically.
 * Renders nothing when the gateway is not configured on the server.
 */
export const SepayPayButton = ({ appointmentId }) => {
  const [enabled, setEnabled] = useState(false);
  const [sandbox, setSandbox] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    gatewayStatus().then((s) => { if (alive) { setEnabled(Boolean(s.enabled)); setSandbox(s.env === 'sandbox'); } });
    return () => { alive = false; };
  }, []);

  if (!enabled) return null;

  const pay = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await axios.post(`${API_BASE}/payments/sepay/checkout/${appointmentId}`);
      submitToSepay(res.data.data);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Không mở được cổng thanh toán, vui lòng thử lại.');
      setBusy(false);
    }
  };

  return (
    <div className="sgw">
      <button type="button" className="sgw-btn" onClick={pay} disabled={busy}>
        {busy ? 'Đang mở cổng thanh toán…' : '💳 Thanh toán online qua SePay'}
      </button>
      <div className="sgw-sub">
        Thẻ ATM / Visa / Master, VietQR hoặc NAPAS · xác nhận tự động, không cần chờ thu ngân
        {sandbox && <span className="sgw-test">Chế độ thử nghiệm</span>}
      </div>
      {error && <div className="sgw-error" role="alert">{error}</div>}
    </div>
  );
};

const RESULT_TEXT = {
  paid: ['✅', 'Thanh toán thành công', 'Phí khám đã được ghi nhận. Bạn không cần thanh toán lại tại quầy.'],
  already_paid: ['✅', 'Lịch hẹn đã được thanh toán', 'Phí khám đã được ghi nhận trước đó.'],
  pending: ['⏳', 'Đang chờ SePay xác nhận', 'Giao dịch chưa hoàn tất. Nếu bạn đã trả tiền, hệ thống sẽ tự cập nhật trong ít phút.'],
  cancel: ['↩️', 'Bạn đã huỷ thanh toán', 'Lịch hẹn vẫn được giữ. Bạn có thể thanh toán lại trong "Lịch hẹn của tôi" hoặc trả tại quầy.'],
  error: ['⚠️', 'Thanh toán không thành công', 'Giao dịch bị lỗi hoặc bị từ chối. Bạn có thể thử lại hoặc thanh toán tại quầy.']
};

/**
 * Shown when SePay sends the browser back (/?sepay=success|error|cancel&inv=...).
 * The result shown comes from the server, which re-checks the order with SePay.
 */
export const SepayReturn = () => {
  const [state, setState] = useState(null); // key of RESULT_TEXT, or 'checking'
  const [detail, setDetail] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get('sepay');
    const invoice = params.get('inv');
    if (!result) return;
    // clean the address bar so a refresh does not show the dialog again
    window.history.replaceState(null, '', window.location.pathname + window.location.hash);
    if (result === 'cancel') { setState('cancel'); return; }
    if (result === 'error' || !invoice) { setState('error'); return; }

    setState('checking');
    let tries = 0;
    const check = async () => {
      tries += 1;
      try {
        const res = await axios.post(`${API_BASE}/payments/sepay/confirm`, { invoice });
        const s = res.data?.data?.state;
        if (s === 'paid' || s === 'already_paid') { setState(s); return; }
        // SePay may need a few seconds to finalise the order after redirecting
        if (tries < 5) { setTimeout(check, 2500); return; }
        setState('pending');
      } catch (err) {
        setDetail(err.response?.data?.error?.message || '');
        setState('error');
      }
    };
    check();
  }, []);

  if (!state) return null;
  const [icon, title, text] = RESULT_TEXT[state] || ['⏳', 'Đang kiểm tra thanh toán…', 'Vui lòng chờ trong giây lát.'];

  return (
    <div className="sgw-overlay" role="dialog" aria-modal="true" aria-label={title}>
      <div className="sgw-modal">
        <div className="sgw-icon" aria-hidden="true">{state === 'checking' ? <span className="sgw-spin" /> : icon}</div>
        <h2>{state === 'checking' ? 'Đang kiểm tra thanh toán…' : title}</h2>
        <p>{state === 'checking' ? 'Hệ thống đang xác nhận giao dịch với SePay.' : text}</p>
        {detail && <p className="sgw-detail">{detail}</p>}
        {state !== 'checking' && <button type="button" className="sgw-btn" onClick={() => setState(null)}>Đóng</button>}
      </div>
    </div>
  );
};
