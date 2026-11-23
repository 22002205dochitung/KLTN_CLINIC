import React, { useEffect, useRef, useState } from 'react';
import authAPI from '../../services/authAPI';
import './OtpVerify.css';

/**
 * OtpVerify - step "Nhập mã OTP" of registration (also shown when an unverified account logs in).
 * In demo mode (no SMTP configured on the server) the code is shown on screen.
 */
const OtpVerify = ({ email, initialOtp = null, intro = null, onVerified, onBack }) => {
  const [code, setCode] = useState('');
  const [info, setInfo] = useState(initialOtp);
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(initialOtp?.resendSeconds || 0);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const verify = async (e) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      setMessage({ type: 'error', text: 'Mã OTP gồm 6 chữ số' });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const res = await authAPI.verifyOtp(email, code);
      setMessage({ type: 'success', text: res.message });
      setTimeout(() => onVerified && onVerified(), 900);
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Mã OTP không đúng' });
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await authAPI.resendOtp(email);
      setInfo(res.otp || null);
      setCooldown(res.otp?.resendSeconds || 60);
      setCode('');
      setMessage({ type: 'success', text: res.message });
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Không gửi lại được mã' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="otp-box" onSubmit={verify}>
      <div className="otp-icon" aria-hidden="true">✉️</div>
      <h3>Xác thực email</h3>
      <p className="otp-intro">
        {intro || 'Nhập mã gồm 6 chữ số vừa được gửi tới'} <b>{email}</b>
        {info?.ttlMinutes ? ` (hiệu lực ${info.ttlMinutes} phút)` : ''}.
      </p>
      {info?.devCode && (
        <p className="otp-demo" role="note">
          🧪 Chế độ thử nghiệm (máy chủ chưa cấu hình gửi email): mã OTP là <b>{info.devCode}</b>
        </p>
      )}
      <input
        ref={inputRef}
        className="otp-input"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
        aria-label="Mã OTP 6 chữ số"
        placeholder="••••••"
      />
      {message && <div className={`otp-msg is-${message.type}`} role="alert">{message.text}</div>}
      <button type="submit" className="otp-submit" disabled={busy || code.length !== 6}>
        {busy ? 'Đang xử lý…' : 'Xác nhận'}
      </button>
      <div className="otp-links">
        <button type="button" onClick={resend} disabled={busy || cooldown > 0}>
          {cooldown > 0 ? `Gửi lại mã sau ${cooldown}s` : 'Gửi lại mã'}
        </button>
        {onBack && <button type="button" onClick={onBack}>← Quay lại</button>}
      </div>
    </form>
  );
};

export default OtpVerify;
