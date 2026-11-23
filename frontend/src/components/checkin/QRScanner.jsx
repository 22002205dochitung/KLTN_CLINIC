import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import axios from 'axios';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import './QRScanner.css';
import { API_BASE } from '../../config/api';
import { playCheckinFeedback, prepareCheckinSound, stopCheckinSound } from './checkinFeedback';

/*
 * html5-qrcode calls video.play() without handling its promise. When the camera is turned off
 * before the video starts playing (code read instantly, "Dừng" pressed, page left, React dev
 * double-mount) the browser rejects that promise with "The play() request was interrupted
 * because the media was removed from the document" -> uncaught error overlay.
 * Attach a handler to play() promises of camera videos only; whoever awaits play() still gets
 * the rejection, it just no longer counts as "uncaught".
 */
if (typeof window !== 'undefined' && window.HTMLMediaElement && !window.HTMLMediaElement.prototype.__cameraPlaySafe) {
  const originalPlay = window.HTMLMediaElement.prototype.play;
  window.HTMLMediaElement.prototype.play = function playSafe(...args) {
    const result = originalPlay.apply(this, args);
    if (result && typeof result.catch === 'function' && typeof MediaStream !== 'undefined' && this.srcObject instanceof MediaStream) {
      result.catch(() => {});
    }
    return result;
  };
  window.HTMLMediaElement.prototype.__cameraPlaySafe = true;
}

// Seconds the result stays on screen before the camera opens again for the next patient
const SHOW_SECONDS = { ok: 8, already: 6, fail: 4 };
// The same (bad) code still in front of the camera right after "quét lại" is ignored for a moment
const SAME_CODE_PAUSE_MS = 5000;
const SOUND_KEY = 'checkin_sound';

const readSoundPref = () => {
  try { return localStorage.getItem(SOUND_KEY) !== 'off'; } catch (e) { return true; }
};
const pad2 = (n) => String(n).padStart(2, '0');

/**
 * QRScanner – reception check-in.
 * Scan (or type) the code -> check-in straight away -> a full-screen result with sound:
 *   ok      green, ticket number + room, "mời ngồi chờ gọi số"
 *   already amber, already checked in, ticket number
 *   fail    red, the reason, "vui lòng quét lại"
 * then the camera re-opens by itself for the next patient.
 */
const QRScanner = () => {
  const { user } = useAuth();
  const isStaff = ['receptionist', 'admin'].includes(user?.role);
  // The camera opens by itself when the page opens (staff who may scan only)
  const [scanning, setScanning] = useState(() => isStaff);
  const [error, setError] = useState('');        // camera problems
  const [loading, setLoading] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [feedback, setFeedback] = useState(null); // { kind, reason, queue, appointment }
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [sound, setSound] = useState(readSoundPref);
  const [history, setHistory] = useState([]);     // check-ins of this session (newest first)
  const cameraQueue = useRef(Promise.resolve());
  const lastCode = useRef({ code: '', at: 0 });
  const soundRef = useRef(sound);
  // Front camera (laptop webcam / selfie) is shown mirrored like a mirror; back/external cameras are not
  const [mirror, setMirror] = useState(true);

  useEffect(() => { soundRef.current = sound; }, [sound]);
  useEffect(() => { prepareCheckinSound(); return () => stopCheckinSound(); }, []);

  // If the signed-in user is only known after the first render, still open the camera once
  const autoStarted = useRef(scanning);
  useEffect(() => {
    if (!autoStarted.current && isStaff) {
      autoStarted.current = true;
      setScanning(true);
    }
  }, [isStaff]);

  const toggleSound = () => {
    setSound((on) => {
      const next = !on;
      try { localStorage.setItem(SOUND_KEY, next ? 'on' : 'off'); } catch (e) { /* private mode */ }
      if (next) playCheckinFeedback('ok', {}); // lets staff hear the volume right away
      else stopCheckinSound();
      return next;
    });
  };

  const handleCheckIn = useCallback(async (code) => {
    const qrCode = String(code || '').trim();
    if (!qrCode) return;
    setLoading(true);
    setError('');
    let next;
    try {
      const response = await axios.post(
        `${API_BASE}/appointments/checkin`,
        { qrCodeToken: qrCode },
        { headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` } }
      );
      next = { kind: 'ok', queue: response.data.queue || null, appointment: response.data.appointment || null };
    } catch (err) {
      const e = err.response?.data?.error;
      if (e?.code === 'ALREADY_CHECKED_IN') {
        next = { kind: 'already', reason: e.message, queue: e.queue || null, appointment: e.details || null };
      } else {
        let reason = e?.message || err.response?.data?.message;
        if (!err.response) reason = 'Không kết nối được máy chủ. Kiểm tra mạng rồi quét lại.';
        else if (err.response.status === 401) reason = 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
        next = { kind: 'fail', reason: reason || 'Mã không hợp lệ.', appointment: e?.details || null };
      }
    }
    lastCode.current = { code: qrCode, at: Date.now() };
    setLoading(false);
    setManualCode('');
    setFeedback(next);
    setSecondsLeft(SHOW_SECONDS[next.kind]);
    if (next.kind === 'ok') {
      setHistory((h) => [{
        at: new Date(),
        name: next.appointment?.patient_name || '',
        number: next.queue?.ticket_number,
        room: next.queue?.room
      }, ...h].slice(0, 8));
    }
    if (soundRef.current) {
      playCheckinFeedback(next.kind, { number: next.queue?.ticket_number, room: next.queue?.room });
    }
  }, []);

  // Close the result and go back to the camera for the next patient
  const nextPatient = useCallback(() => {
    setFeedback(null);
    setSecondsLeft(0);
    setError('');
    lastCode.current = { ...lastCode.current, at: Date.now() };
    setScanning(true);
  }, []);

  // Count down, then re-open the camera by itself
  useEffect(() => {
    if (!feedback) return undefined;
    if (secondsLeft <= 0) { nextPatient(); return undefined; }
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [feedback, secondsLeft, nextPatient]);

  // Enter / Space / Esc on the result screen = next patient at once
  useEffect(() => {
    if (!feedback) return undefined;
    const onKey = (e) => {
      if (['Enter', ' ', 'Escape'].includes(e.key)) { e.preventDefault(); nextPatient(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [feedback, nextPatient]);

  // Start the camera directly with Html5Qrcode. (Html5QrcodeScanner only drew its own
  // "Request Camera Permissions" / "Start Scanning" buttons, so the camera stayed off.)
  useEffect(() => {
    if (!scanning) return undefined;

    let cancelled = false;
    const qr = new Html5Qrcode('qr-reader', {
      verbose: false,
      formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
      // native BarcodeDetector (Chrome/Edge/Android) reads small, far-away codes much better
      experimentalFeatures: { useBarCodeDetectorIfSupported: true }
    });

    let decoded = false;
    const onDecoded = (decodedText) => {
      // the decoder can fire several times for one code before the camera stops
      if (decoded || cancelled) return;
      const code = String(decodedText || '').trim();
      // the code that was just handled is still in front of the camera: wait for a new one
      if (code === lastCode.current.code && Date.now() - lastCode.current.at < SAME_CODE_PAUSE_MS) return;
      decoded = true;
      setScanning(false);
      handleCheckIn(code);
    };

    // Scan almost the whole picture (85%) so the code can be held further from the camera
    const qrbox = (w, h) => {
      const side = Math.max(160, Math.floor(Math.min(w, h) * 0.85));
      return { width: side, height: side };
    };
    // Ask for HD video: more pixels per QR module = readable from further away
    const hd = { width: { ideal: 1920 }, height: { ideal: 1080 } };
    const configFor = (source) => ({
      fps: 15,
      qrbox,
      aspectRatio: 1.0,
      disableFlip: false,
      videoConstraints: typeof source === 'string'
        ? { deviceId: { exact: source }, ...hd }
        : { ...source, ...hd }
    });

    // Start/stop calls are chained: a new camera only starts after the previous one is fully
    // stopped and its <video> removed. (React StrictMode runs this effect twice in development,
    // which used to leave two camera views stacked in the box.)
    cameraQueue.current = cameraQueue.current.then(async () => {
      if (cancelled) return;
      try {
        // Prefer the back camera on phones; laptops just use their only camera
        try {
          await qr.start({ facingMode: 'environment' }, configFor({ facingMode: 'environment' }), onDecoded, () => {});
        } catch (firstError) {
          if (cancelled) return;
          const cameras = await Html5Qrcode.getCameras();
          if (!cameras || cameras.length === 0) throw firstError;
          const camId = cameras[cameras.length - 1].id;
          await qr.start(camId, configFor(camId), onDecoded, () => {});
        }
        // Mirror unless the browser reports a back camera (phones: facingMode 'environment')
        try {
          const facing = qr.getRunningTrackSettings?.().facingMode;
          if (!cancelled) setMirror(facing !== 'environment');
        } catch (e) { /* keep default */ }
      } catch (err) {
        if (cancelled) return;
        const name = err?.name || '';
        const text = String(err?.message || err || '');
        let message = 'Không thể bật camera. Bạn có thể nhập mã thủ công bên dưới.';
        if (name === 'NotAllowedError' || /permission|denied|notallowed/i.test(text)) {
          message = 'Trình duyệt đang chặn camera. Bấm biểu tượng 🔒 trên thanh địa chỉ → cho phép Camera, rồi bật lại.';
        } else if (name === 'NotFoundError' || /not ?found|no camera|requested device/i.test(text)) {
          message = 'Không tìm thấy camera trên máy này. Hãy nhập mã thủ công bên dưới.';
        } else if (name === 'NotReadableError' || /in use|could not start|notreadable/i.test(text)) {
          message = 'Camera đang được ứng dụng khác sử dụng (Zoom, Meet, Camera...). Đóng ứng dụng đó rồi thử lại.';
        } else if (!window.isSecureContext) {
          message = 'Camera chỉ hoạt động trên localhost hoặc https. Hãy mở bằng http://localhost:3000.';
        }
        setError(message);
        setScanning(false);
      }
    });

    return () => {
      cancelled = true;
      // runs after this effect's start finished (or was skipped)
      cameraQueue.current = cameraQueue.current.then(async () => {
        try { if (qr.isScanning) await qr.stop(); } catch (e) { /* already stopped */ }
        try { qr.clear(); } catch (e) { /* element already gone */ }
      });
    };
  }, [scanning, handleCheckIn]);

  const handleManualCheckIn = (e) => {
    e.preventDefault();
    if (manualCode.trim() && !loading) {
      setScanning(false);
      handleCheckIn(manualCode);
    }
  };

  // Check role - Only Receptionist and Admin can scan
  if (!user || !isStaff) {
    return (
      <div className="qr-scanner-container">
        <div className="access-denied">
          <h2>⛔ Không có quyền truy cập</h2>
          <p>
            {!user && 'Vui lòng đăng nhập để sử dụng chức năng này.'}
            {user && user.role === 'patient' && 'Bệnh nhân vui lòng vào menu "Mã QR của tôi" để hiển thị mã QR cho lễ tân quét.'}
            {user && user.role === 'doctor' && 'Bác sĩ không cần quét QR. Xem danh sách bệnh nhân đã check-in trong Dashboard.'}
          </p>
        </div>
      </div>
    );
  }

  const fb = feedback;
  const ticket = fb?.queue?.ticket_number;
  const patientName = fb?.appointment?.patient_name;

  return (
    <div className="qr-scanner-container">
      <div className="scanner-card">
        <div className="scanner-header">
          <h1>📱 Quét Mã QR Check-in</h1>
          <button
            type="button"
            className={`ck-sound ${sound ? 'is-on' : ''}`}
            onClick={toggleSound}
            aria-pressed={sound}
            title="Bật/tắt chuông và giọng đọc kết quả"
          >
            {sound ? '🔊 Âm thanh: Bật' : '🔇 Âm thanh: Tắt'}
          </button>
          <p>Đưa mã QR của bệnh nhân vào camera – hệ thống check-in ngay và báo kết quả bằng màn hình và loa.</p>
        </div>

        {/* Camera Scanner */}
        <div className="scanner-section">
          {loading ? (
            <div className="scanner-placeholder" role="status">
              <div className="ck-spinner" aria-hidden="true" />
              <p>Đang check-in…</p>
            </div>
          ) : !scanning ? (
            <div className="scanner-placeholder">
              <div className="scanner-icon">📷</div>
              <p>Camera đang tắt – bấm để bật lại</p>
              <button className="btn btn-primary" onClick={() => { setError(''); setScanning(true); }}>
                🎥 Bật Camera Quét QR
              </button>
            </div>
          ) : (
            <div className="scanner-active">
              <div id="qr-reader" className={`qr-reader-container ${mirror ? 'is-mirrored' : ''}`}></div>
              <div className="scanner-instructions">
                <p>📱 Đưa mã QR vào khung quét</p>
                <p className="scanner-tip">Giữ camera ổn định và đảm bảo đủ ánh sáng</p>
              </div>
              <button className="btn btn-secondary" onClick={() => setScanning(false)}>
                ⏸️ Dừng quét
              </button>
            </div>
          )}
        </div>

        {/* Manual Input Alternative */}
        <div className="manual-input-section">
          <h3>Hoặc nhập mã thủ công</h3>
          <form onSubmit={handleManualCheckIn}>
            <div className="input-group">
              <input
                type="text"
                className="form-control"
                placeholder="Nhập mã lịch hẹn (VD: 261125-TMH-001)"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                disabled={loading}
                aria-label="Mã lịch hẹn"
              />
              <button type="submit" className="btn btn-primary" disabled={loading || !manualCode.trim()}>
                {loading ? 'Đang xử lý...' : 'Check-in'}
              </button>
            </div>
          </form>
        </div>

        {error && (
          <div className="alert alert-error">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {/* Check-ins done at this desk since the page was opened */}
        <div className="ck-history">
          <div className="ck-history-title">Đã check-in trong phiên này: <b>{history.length}</b></div>
          {history.length > 0 && (
            <ul>
              {history.map((h, i) => (
                <li key={`${h.at.getTime()}-${i}`}>
                  <span className="ck-history-time">{pad2(h.at.getHours())}:{pad2(h.at.getMinutes())}</span>
                  <span className="ck-history-name">{h.name || 'Bệnh nhân'}</span>
                  {h.number != null && <span className="ck-history-no">Số {pad2(h.number)}{h.room ? ` · P.${h.room}` : ''}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Full-screen result: big enough for the patient standing at the desk to read */}
      {fb && (
        <div className={`ck-result is-${fb.kind}`} role="alertdialog" aria-live="assertive" aria-labelledby="ck-result-title">
          <div className="ck-result-box">
            <div className="ck-result-icon" aria-hidden="true">{fb.kind === 'fail' ? '✕' : fb.kind === 'already' ? 'ℹ' : '✓'}</div>
            <h2 id="ck-result-title">
              {fb.kind === 'ok' && 'Check-in thành công!'}
              {fb.kind === 'already' && 'Bạn đã check-in rồi'}
              {fb.kind === 'fail' && 'Quét không thành công'}
            </h2>
            {patientName && fb.kind !== 'fail' && <div className="ck-result-name">{patientName}</div>}
            {fb.appointment?.booking_code && fb.kind !== 'fail' && <div className="ck-result-code">Mã lịch hẹn: <b>{fb.appointment.booking_code}</b></div>}

            {fb.kind !== 'fail' && ticket != null && (
              <div className="ck-result-ticket">
                <span>SỐ THỨ TỰ</span>
                <strong>{pad2(ticket)}</strong>
                {fb.queue.room && <em>Phòng khám {fb.queue.room}</em>}
              </div>
            )}

            {fb.kind === 'ok' && (
              <p className="ck-result-msg">
                Mời bạn <b>ngồi chờ</b>, hệ thống sẽ <b>gọi số thứ tự</b> trên loa và màn hình để vào khám.
                {fb.queue && (fb.queue.patients_ahead > 0
                  ? <> Còn <b>{fb.queue.patients_ahead}</b> người trước bạn.</>
                  : <> Không có ai chờ trước bạn.</>)}
              </p>
            )}
            {fb.kind === 'already' && (
              <p className="ck-result-msg">Không cần quét lại. Mời bạn <b>ngồi chờ</b> hệ thống gọi số.</p>
            )}
            {fb.kind === 'fail' && (
              <>
                <p className="ck-result-reason">{fb.reason}</p>
                <p className="ck-result-msg">Vui lòng <b>quét lại mã QR</b>. Nếu vẫn không được, hãy đưa mã cho lễ tân hỗ trợ.</p>
              </>
            )}

            <button type="button" className="ck-result-btn" onClick={nextPatient} autoFocus>
              {fb.kind === 'fail' ? '↻ Quét lại' : 'Quét người tiếp theo'} ({secondsLeft}s)
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default QRScanner;
