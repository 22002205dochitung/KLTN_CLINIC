import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { API_BASE } from '../../config/api';
import './QueueEstimate.css';

/**
 * QueueEstimate - "when will I be seen?" for an appointment today (refreshes every 30s).
 * Checked in: place in the queue and expected time. Booked: people waiting now and
 * the expected time if the patient checked in right away.
 */
// "Sắp đến lượt" when at most this many people are still ahead (use case 3.2.2.15, step 6)
const NEAR_AHEAD = 2;

/** System notification (works while the app is in the background; needs permission) */
const notify = (title, body) => {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const options = { body, icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', tag: 'thct-queue', renotify: true, vibrate: [300, 150, 300] };
    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
      navigator.serviceWorker.ready.then((reg) => reg.showNotification(title, options)).catch(() => {});
    } else {
      // eslint-disable-next-line no-new
      new Notification(title, options);
    }
  } catch (e) { /* notifications not available */ }
};

const QueueEstimate = ({ appointmentId, compact = false }) => {
  const [data, setData] = useState(null);
  const [permission, setPermission] = useState(() => ('Notification' in window ? Notification.permission : 'unsupported'));
  const wasServing = useRef(false);

  // vibrate + notify once when the doctor calls this patient in
  useEffect(() => {
    const serving = data?.queue_state === 'serving';
    if (serving && !wasServing.current) {
      if (navigator.vibrate) navigator.vibrate([400, 200, 400, 200, 400]);
      notify(`🔔 Đến lượt bạn – số ${String(data.ticket_number).padStart(2, '0')}`, `Mời vào phòng khám ${data.room} (${data.doctor_name})`);
    }
    wasServing.current = serving;
  }, [data]);

  // once per appointment: warn when only 1–2 people are left before the patient
  useEffect(() => {
    if (!data || data.state !== 'checked_in' || data.queue_state !== 'waiting') return;
    if (data.patients_ahead > NEAR_AHEAD) return;
    const key = `qe-near-${appointmentId}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, '1');
    } catch (e) { /* private mode: may repeat, harmless */ }
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    notify('⏰ Sắp đến lượt bạn', data.patients_ahead === 0
      ? `Bạn là người tiếp theo – vui lòng ngồi trước phòng khám ${data.room}`
      : `Còn ${data.patients_ahead} người nữa – vui lòng ngồi gần phòng khám ${data.room}`);
  }, [data, appointmentId]);

  const askPermission = () => {
    if (!('Notification' in window)) return;
    Notification.requestPermission().then(setPermission).catch(() => {});
  };

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      axios.get(`${API_BASE}/queue/estimate/${appointmentId}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
      })
        .then((res) => { if (!cancelled) setData(res.data.data); })
        .catch(() => { if (!cancelled) setData(null); });
    };
    load();
    const timer = setInterval(load, 15000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [appointmentId]);

  if (!data || !['checked_in', 'booked'].includes(data.state)) return null;

  const pace = data.pace_source === 'today'
    ? `theo tốc độ khám hôm nay, ~${data.minutes_per_patient} phút/người`
    : `ước tính ~${data.minutes_per_patient} phút/người`;

  const num = String(data.ticket_number || data.queue_position).padStart(2, '0');

  if (data.state === 'checked_in' && data.queue_state === 'serving') {
    return (
      <div className={`qe ${compact ? 'is-compact' : ''} is-called`} role="alert">
        <div className="qe-number">
          <span>Số của bạn</span>
          <strong>{num}</strong>
        </div>
        <div className="qe-text">
          <strong>🔔 ĐẾN LƯỢT BẠN – mời vào phòng khám {data.room}</strong>
          <span>{data.doctor_name} đang gọi số {num}{data.call_count > 1 ? ` (lần ${data.call_count})` : ''}. Vui lòng vào phòng ngay.</span>
        </div>
      </div>
    );
  }

  if (data.state === 'checked_in' && data.queue_state === 'missed') {
    return (
      <div className={`qe ${compact ? 'is-compact' : ''} is-missed`} role="alert">
        <div className="qe-number">
          <span>Số của bạn</span>
          <strong>{num}</strong>
        </div>
        <div className="qe-text">
          <strong>Bạn đã lỡ lượt khi được gọi</strong>
          <span>Vui lòng đến phòng khám {data.room} báo bác sĩ hoặc báo quầy lễ tân để được gọi lại.</span>
        </div>
      </div>
    );
  }

  if (data.state === 'checked_in') {
    const near = data.patients_ahead <= NEAR_AHEAD;
    return (
      <div className={`qe ${compact ? 'is-compact' : ''} is-in-queue ${near ? 'is-near' : ''}`} role="status">
        <div className="qe-number">
          <span>Số thứ tự</span>
          <strong>{num}</strong>
        </div>
        <div className="qe-text">
          {data.patients_ahead === 0 ? (
            <strong>⏰ Bạn là người tiếp theo – vui lòng ngồi chờ trước phòng khám {data.room}</strong>
          ) : near ? (
            <strong>⏰ Sắp đến lượt – còn {data.patients_ahead} người, vui lòng ngồi gần phòng khám {data.room}</strong>
          ) : (
            <strong>Dự kiến khám lúc {data.estimated_time} (khoảng {data.estimated_wait_minutes} phút nữa)</strong>
          )}
          <span>
            Còn {data.patients_ahead} người trước bạn{data.serving_number ? ` · đang khám số ${String(data.serving_number).padStart(2, '0')}` : ''} · Phòng {data.room} · {data.doctor_name} · {pace}
          </span>
          {permission === 'default' && (
            <button type="button" className="qe-notify" onClick={askPermission}>🔔 Bật thông báo khi sắp đến lượt</button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`qe ${compact ? 'is-compact' : ''}`} role="status">
      <div className="qe-number">
        <span>Đang chờ</span>
        <strong>{data.waiting_now}</strong>
      </div>
      <div className="qe-text">
        <strong>
          {data.waiting_now === 0
            ? 'Chưa có ai chờ – check-in là được khám ngay'
            : `Nếu check-in bây giờ, dự kiến khám lúc ${data.estimated_time}`}
        </strong>
        <span>
          {data.waiting_now} người đang chờ {data.doctor_name} · {pace}. Quét mã QR tại quầy để vào hàng đợi.
        </span>
      </div>
    </div>
  );
};

export default QueueEstimate;
