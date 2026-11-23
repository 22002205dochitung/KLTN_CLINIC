import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import authAPI from '../../services/authAPI';
import OtpVerify from './OtpVerify';
import './LoginForm.css';

const REMEMBER_KEY = 'rememberedEmail';
const DEMO_PASSWORD = 'Password123!';
// quick-fill buttons, only in development (never shipped to the host build)
const DEMO_ACCOUNTS = process.env.NODE_ENV === 'development' ? [
  ['Bệnh nhân', 'chitung@gmail.com'],
  ['Bác sĩ', 'bsphong@clinic.com'],
  ['Lễ tân', 'letan@gmail.com'],
  ['Quản trị', 'admin@clinic.com']
] : [];

const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const isPhone = (v) => /^(\+?84|0)\d{9,10}$/.test(v.replace(/[\s.\-()]/g, ''));

const readRemembered = () => {
  try { return localStorage.getItem(REMEMBER_KEY) || ''; } catch { return ''; }
};

/** Turn an API error into one clear Vietnamese sentence */
const explain = (err) => {
  if (!err) return '';
  if (err.code === 'NETWORK_ERROR') return 'Không kết nối được máy chủ. Kiểm tra mạng (hoặc backend cổng 5000 khi chạy thử) rồi thử lại.';
  if (err.status === 429) return 'Bạn đã thử quá nhiều lần. Vui lòng đợi vài phút rồi thử lại.';
  if (err.status >= 500) return 'Máy chủ đang bận, vui lòng thử lại sau ít phút.';
  return err.message || 'Đăng nhập không thành công';
};

/**
 * LoginForm - đăng nhập bằng email hoặc số điện thoại.
 *  - lỗi hiển thị rõ (sai mật khẩu, còn bao nhiêu lần thử, tài khoản tạm khoá, mất kết nối)
 *  - "Ghi nhớ đăng nhập" giữ phiên 7 ngày và nhớ email
 *  - Quên mật khẩu: nhận mã 6 số qua email, đặt mật khẩu mới ngay trong hộp thoại
 */
const LoginForm = ({ onSuccess, onSwitchToRegister }) => {
  const { login } = useAuth();
  const [view, setView] = useState('login'); // login | forgot | otp
  const [identifier, setIdentifier] = useState(readRemembered);
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null); // { text, code }
  const [notice, setNotice] = useState('');
  const idRef = useRef(null);
  const pwRef = useRef(null);

  useEffect(() => {
    if (view !== 'login') return;
    (identifier ? pwRef : idRef).current?.focus();
  }, [view]);

  const doLogin = async (id = identifier, pw = password) => {
    const cleanId = id.trim();
    if (!cleanId) { setError({ text: 'Vui lòng nhập email hoặc số điện thoại' }); idRef.current?.focus(); return; }
    if (!isEmail(cleanId) && !isPhone(cleanId)) { setError({ text: 'Email hoặc số điện thoại chưa đúng định dạng' }); idRef.current?.focus(); return; }
    if (!pw) { setError({ text: 'Vui lòng nhập mật khẩu' }); pwRef.current?.focus(); return; }

    setLoading(true);
    setError(null);
    setNotice('');
    try {
      await login({ email: cleanId, password: pw, rememberMe: remember });
      try {
        if (remember) localStorage.setItem(REMEMBER_KEY, cleanId);
        else localStorage.removeItem(REMEMBER_KEY);
      } catch { /* storage blocked: nothing to remember */ }
      if (onSuccess) onSuccess();
    } catch (err) {
      if (err.code === 'EMAIL_NOT_VERIFIED') { setView('otp'); return; }
      setError({ text: explain(err), code: err.code });
      if (err.code === 'INVALID_CREDENTIALS') { setPassword(''); pwRef.current?.focus(); }
    } finally {
      setLoading(false);
    }
  };

  const submit = (e) => { e.preventDefault(); doLogin(); };
  const onPwKey = (e) => setCapsLock(Boolean(e.getModifierState && e.getModifierState('CapsLock')));

  if (view === 'otp') {
    return (
      <div className="lg">
        <OtpVerify
          email={identifier.trim()}
          intro="Tài khoản chưa xác thực email. Nhập mã OTP đã gửi tới (hoặc bấm Gửi lại mã)"
          onBack={() => setView('login')}
          onVerified={() => { setView('login'); doLogin(); }}
        />
      </div>
    );
  }

  if (view === 'forgot') {
    return (
      <ForgotPassword
        initialEmail={isEmail(identifier.trim()) ? identifier.trim() : ''}
        onBack={() => setView('login')}
        onDone={(email) => {
          setIdentifier(email);
          setPassword('');
          setError(null);
          setNotice('Đã đổi mật khẩu. Đăng nhập bằng mật khẩu mới nhé.');
          setView('login');
        }}
      />
    );
  }

  return (
    <form className="lg" onSubmit={submit} noValidate aria-labelledby="lg-title">
      <div className="lg-head">
        <img src={`${process.env.PUBLIC_URL}/img/logo.png`} alt="" className="lg-logo" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
        <h2 id="lg-title">Đăng nhập</h2>
        <p>Chào mừng bạn quay lại THCT Clinic</p>
      </div>

      {notice && <div className="lg-alert is-ok" role="status">✅ {notice}</div>}
      {error && (
        <div className="lg-alert is-err" role="alert">
          <span>⚠️ {error.text}</span>
          {error.code === 'ACCOUNT_LOCKED' && (
            <button type="button" className="lg-link" onClick={() => setView('forgot')}>Đặt lại mật khẩu ngay →</button>
          )}
        </div>
      )}

      <label className="lg-field">
        <span>Email hoặc số điện thoại</span>
        <input
          ref={idRef}
          type="text"
          inputMode="email"
          name="username" aria-label="Email hoặc số điện thoại"
          autoComplete="username"
          placeholder="vd: ten@gmail.com hoặc 0901234567"
          value={identifier}
          onChange={(e) => { setIdentifier(e.target.value); setError(null); }}
          disabled={loading}
          aria-invalid={Boolean(error && !password)}
        />
      </label>

      <label className="lg-field">
        <span>Mật khẩu</span>
        <div className="lg-pw">
          <input
            ref={pwRef}
            type={showPassword ? 'text' : 'password'}
            name="password" aria-label="Mật khẩu"
            autoComplete="current-password"
            placeholder="Nhập mật khẩu"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(null); }}
            onKeyUp={onPwKey}
            onKeyDown={onPwKey}
            onBlur={() => setCapsLock(false)}
            disabled={loading}
          />
          <button type="button" className="lg-eye" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} tabIndex={-1}>
            {showPassword ? '🙈' : '👁️'}
          </button>
        </div>
        {capsLock && <small className="lg-caps">⇪ Caps Lock đang bật</small>}
      </label>

      <div className="lg-row">
        <label className="lg-check">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} disabled={loading} />
          Ghi nhớ đăng nhập (7 ngày)
        </label>
        <button type="button" className="lg-link" onClick={() => setView('forgot')}>Quên mật khẩu?</button>
      </div>

      <button type="submit" className="lg-submit" disabled={loading}>
        {loading ? <><span className="lg-spin" aria-hidden="true" /> Đang đăng nhập…</> : 'Đăng nhập'}
      </button>

      <p className="lg-foot">
        Chưa có tài khoản?{' '}
        <button type="button" className="lg-link" onClick={() => onSwitchToRegister && onSwitchToRegister()}>Đăng ký ngay</button>
      </p>

      {DEMO_ACCOUNTS.length > 0 && (
        <div className="lg-demo">
          <span>Tài khoản demo (chỉ hiện khi chạy thử):</span>
          <div>
            {DEMO_ACCOUNTS.map(([label, email]) => (
              <button
                key={email}
                type="button"
                disabled={loading}
                onClick={() => { setIdentifier(email); setPassword(DEMO_PASSWORD); doLogin(email, DEMO_PASSWORD); }}
                title={email}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
    </form>
  );
};

/** Quên mật khẩu: email -> mã 6 số + mật khẩu mới */
const ForgotPassword = ({ initialEmail, onBack, onDone }) => {
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null); // { type, text }
  const [devCode, setDevCode] = useState('');
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const send = async (e) => {
    if (e) e.preventDefault();
    if (!isEmail(email.trim())) { setMsg({ type: 'err', text: 'Nhập email đã dùng để đăng ký tài khoản' }); return; }
    setBusy(true);
    setMsg(null);
    try {
      const res = await authAPI.forgotPassword(email.trim());
      setDevCode(res.devCode || '');
      setStep(2);
      setCooldown(60);
      setMsg({ type: 'ok', text: res.message });
    } catch (err) {
      setMsg({ type: 'err', text: explain(err) });
    } finally {
      setBusy(false);
    }
  };

  const reset = async (e) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(code)) { setMsg({ type: 'err', text: 'Mã xác nhận gồm 6 chữ số' }); return; }
    if (pw.length < 8 || !/[a-z]/.test(pw) || !/[A-Z]/.test(pw) || !/\d/.test(pw)) {
      setMsg({ type: 'err', text: 'Mật khẩu mới cần ít nhất 8 ký tự, có chữ hoa, chữ thường và chữ số' });
      return;
    }
    if (pw !== pw2) { setMsg({ type: 'err', text: 'Hai mật khẩu chưa khớp' }); return; }
    setBusy(true);
    setMsg(null);
    try {
      await authAPI.resetPasswordWithCode(email.trim(), code, pw);
      onDone(email.trim());
    } catch (err) {
      setMsg({ type: 'err', text: explain(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="lg" onSubmit={step === 1 ? send : reset} noValidate>
      <div className="lg-head">
        <h2>Quên mật khẩu</h2>
        <p>{step === 1 ? 'Nhập email tài khoản, chúng tôi gửi mã xác nhận 6 số.' : `Nhập mã đã gửi tới ${email.trim()} và mật khẩu mới.`}</p>
      </div>

      {msg && <div className={`lg-alert ${msg.type === 'ok' ? 'is-ok' : 'is-err'}`} role={msg.type === 'ok' ? 'status' : 'alert'}>{msg.text}</div>}
      {devCode && step === 2 && <div className="lg-alert is-demo">🧪 Chế độ demo (chưa cấu hình email): mã là <b>{devCode}</b></div>}

      {step === 1 ? (
        <label className="lg-field">
          <span>Email</span>
          <input type="email" autoComplete="email" aria-label="Email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ten@gmail.com" autoFocus disabled={busy} />
        </label>
      ) : (
        <>
          <label className="lg-field">
            <span>Mã xác nhận</span>
            <input
              className="lg-code" aria-label="Mã xác nhận"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              placeholder="••••••"
              autoFocus
              disabled={busy}
            />
          </label>
          <label className="lg-field">
            <span>Mật khẩu mới</span>
            <div className="lg-pw">
              <input type={show ? 'text' : 'password'} autoComplete="new-password" value={pw}  aria-label="Mật khẩu mới"onChange={(e) => setPw(e.target.value)} placeholder="Ít nhất 8 ký tự, có chữ hoa và số" disabled={busy} />
              <button type="button" className="lg-eye" onClick={() => setShow((v) => !v)} aria-label={show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} tabIndex={-1}>{show ? '🙈' : '👁️'}</button>
            </div>
          </label>
          <label className="lg-field">
            <span>Nhập lại mật khẩu mới</span>
            <input type={show ? 'text' : 'password'} autoComplete="new-password" value={pw2} aria-label="Nhập lại mật khẩu mới" onChange={(e) => setPw2(e.target.value)} disabled={busy} />
          </label>
        </>
      )}

      <button type="submit" className="lg-submit" disabled={busy}>
        {busy ? <><span className="lg-spin" aria-hidden="true" /> Đang xử lý…</> : (step === 1 ? 'Gửi mã xác nhận' : 'Đổi mật khẩu')}
      </button>

      <div className="lg-row">
        <button type="button" className="lg-link" onClick={onBack}>← Quay lại đăng nhập</button>
        {step === 2 && (
          <button type="button" className="lg-link" onClick={() => send()} disabled={busy || cooldown > 0}>
            {cooldown > 0 ? `Gửi lại mã (${cooldown}s)` : 'Gửi lại mã'}
          </button>
        )}
      </div>
    </form>
  );
};

export default LoginForm;
