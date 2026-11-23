import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { API_BASE } from '../../config/api';
import './QueueBoard.css';
import {
  speakVi, loadVoices, vietnameseVoices, voiceGender, getSavedVoiceName, saveVoiceName, hasFemaleVoice,
  SPEEDS, getSavedRate, saveRate
} from '../../utils/viVoice';

const pad = (n) => String(n).padStart(2, '0');
const hhmm = (v) => {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '' : `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const POLL_MS = 4000;
const CALL_SHOW_MS = 9000;
const GENDER_LABEL = { female: 'nữ', male: 'nam', unknown: '?' };

// Loudspeaker is ON by default; turning it off is remembered on this device until turned on again
const SOUND_KEY = 'queue_sound';
const readSoundPref = () => {
  try { return localStorage.getItem(SOUND_KEY) !== 'off'; } catch (e) { return true; }
};
const saveSoundPref = (on) => {
  try { localStorage.setItem(SOUND_KEY, on ? 'on' : 'off'); } catch (e) { /* private mode */ }
};
// Browsers only play sound after the page got a click/tap (opened straight from a link or on a TV)
const hasUserGesture = () => navigator.userActivation?.hasBeenActive ?? true;

/** Two-tone "ding-dong" like a hospital paging system (Web Audio, no sound file needed). */
const playChime = (ctx) => {
  if (!ctx) return;
  const now = ctx.currentTime;
  [[880, 0], [659, 0.45]].forEach(([freq, at]) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, now + at);
    gain.gain.exponentialRampToValueAtTime(0.4, now + at + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + at + 0.9);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now + at);
    osc.stop(now + at + 0.95);
  });
};

/**
 * QueueBoard - lobby screen (TV), hospital style. Public (no login).
 * When a doctor presses "Gọi số" (or "Gọi lại") the number is shown full screen with the room,
 * a chime plays and the call is read out twice in Vietnamese (after "Bật loa" was pressed once).
 */
const QueueBoard = ({ onExit }) => {
  const [doctors, setDoctors] = useState([]);
  const [recent, setRecent] = useState([]);
  const [error, setError] = useState('');
  const [now, setNow] = useState(new Date());
  const [sound, setSound] = useState(readSoundPref);
  const [locked, setLocked] = useState(() => readSoundPref() && !hasUserGesture());
  const [calling, setCalling] = useState(null); // call shown full screen
  const lastCalls = useRef(null);               // doctor_id -> "number|called_at"
  const pending = useRef([]);                   // calls waiting to be shown/announced
  const showing = useRef(false);
  const soundRef = useRef(readSoundPref());
  const audioCtx = useRef(null);
  const voiceMode = useRef('browser'); // 'fpt' when the server has an FPT.AI key (nữ miền Nam)
  const player = useRef(null);
  const [serverVoice, setServerVoice] = useState('browser');
  const [voices, setVoices] = useState([]);          // Vietnamese voices of this device
  const [voiceName, setVoiceName] = useState(getSavedVoiceName);

  // the browser fills its voice list a moment after the page opens
  useEffect(() => {
    const refresh = () => setVoices(vietnameseVoices());
    loadVoices().then(refresh);
    window.speechSynthesis?.addEventListener?.('voiceschanged', refresh);
    return () => window.speechSynthesis?.removeEventListener?.('voiceschanged', refresh);
  }, []);

  const chooseVoice = (name) => {
    setVoiceName(name);
    saveVoiceName(name);
    speakVi('Kính mời bệnh nhân số 5, vào phòng khám số 101.', { pitch: 1.1, cancel: true });
  };

  const [rate, setRate] = useState(getSavedRate);
  const chooseRate = (value) => {
    const r = parseFloat(value);
    setRate(r);
    saveRate(r);
    if (serverVoice !== 'fpt') {
      speakVi('Kính mời bệnh nhân số 5, vào phòng khám số 101.', { rate: r, pitch: 1.1, cancel: true });
    }
  };

  useEffect(() => { soundRef.current = sound; }, [sound]);

  // TV screen: hide app-wide overlays such as the "install the app" banner
  useEffect(() => {
    document.body.classList.add('is-queue-board');
    return () => document.body.classList.remove('is-queue-board');
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let hideTimer = null;

    // browser voice: waits for the voice list, female Vietnamese voice (or the one picked below)
    const speak = (text) => {
      if (!soundRef.current) return;
      speakVi(text, { pitch: 1.1 });
    };

    // FPT.AI voice from the server, played twice; any failure falls back to the browser voice
    const announce = (call) => {
      if (voiceMode.current !== 'fpt') {
        speak(call.announce);
        speak(call.announce);
        return;
      }
      const audio = player.current || new Audio();
      player.current = audio;
      let played = 0;
      const fallback = () => { if (played === 0) { speak(call.announce); speak(call.announce); } };
      audio.onended = () => {
        played += 1;
        if (played < 2) setTimeout(() => audio.play().catch(() => {}), 350);
      };
      audio.onerror = fallback;
      audio.src = `${API_BASE}/queue/call-audio/${call.doctor_id}?k=${encodeURIComponent(call.key)}`;
      audio.defaultPlaybackRate = getSavedRate(); // FPT.AI voice follows the chosen speed too
      audio.playbackRate = audio.defaultPlaybackRate;
      audio.play().catch(fallback);
    };

    // show calls one after another, like a paging system
    const showNext = () => {
      if (cancelled) return;
      const call = pending.current.shift();
      if (!call) {
        showing.current = false;
        setCalling(null);
        return;
      }
      showing.current = true;
      setCalling(call);
      if (soundRef.current) {
        playChime(audioCtx.current);
        const who = call.speak_name ? `, ${call.speak_name}` : '';
        const text = call.announce || `${call.recall ? 'Kính mời lại' : 'Kính mời'} bệnh nhân số ${call.number}${who}, vào phòng khám số ${call.room}`;
        setTimeout(() => announce({ ...call, announce: text }), 950);
      }
      hideTimer = setTimeout(showNext, CALL_SHOW_MS);
    };

    const load = () => {
      axios.get(`${API_BASE}/queue/board`)
        .then((res) => {
          if (cancelled) return;
          const list = res.data?.data?.doctors || [];
          setDoctors(list);
          setRecent(res.data?.data?.recent_calls || []);
          voiceMode.current = res.data?.data?.voice === 'fpt' ? 'fpt' : 'browser';
          setServerVoice(voiceMode.current);
          setError('');

          const current = {};
          list.forEach((d) => { current[d.doctor_id] = d.serving ? `${d.serving.number}|${d.serving.called_at}` : null; });
          // announce new calls / recalls (not the ones already on screen when the TV was opened)
          if (lastCalls.current) {
            list.forEach((d) => {
              const key = current[d.doctor_id];
              if (key && lastCalls.current[d.doctor_id] !== key) {
                pending.current.push({
                  key: `${d.doctor_id}|${key}`,
                  number: d.serving.number,
                  name: d.serving.name,
                  speak_name: d.serving.speak_name || '',
                  announce: d.serving.announce || '',
                  doctor_id: d.doctor_id,
                  room: d.room,
                  doctor_name: d.doctor_name,
                  recall: d.serving.call_count > 1
                });
              }
            });
            if (pending.current.length && !showing.current) showNext();
          }
          lastCalls.current = current;
        })
        .catch(() => { if (!cancelled) setError('Mất kết nối máy chủ – đang thử lại…'); });
    };

    load();
    const t = setInterval(load, POLL_MS);
    return () => { cancelled = true; clearInterval(t); clearTimeout(hideTimer); };
  }, []);

  const goFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else document.documentElement.requestFullscreen?.();
  };

  const ensureAudio = () => {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx && !audioCtx.current) audioCtx.current = new Ctx();
      audioCtx.current?.resume?.();
    } catch (e) { /* no audio device */ }
  };

  // Speaker on (default): prepare audio now, or at the first tap when the browser still blocks sound
  useEffect(() => {
    if (!sound) { setLocked(false); return undefined; }
    ensureAudio();
    if (hasUserGesture()) { setLocked(false); return undefined; }
    setLocked(true);
    const unlock = () => {
      ensureAudio();
      setLocked(false);
      if (voiceMode.current !== 'fpt') speakVi('Đã bật loa gọi số', { pitch: 1.1 });
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, [sound]);

  const toggleSound = () => {
    const next = !sound;
    if (next) {
      // audio must be unlocked inside a click
      ensureAudio();
      playChime(audioCtx.current);
      if (serverVoice !== 'fpt') speakVi('Đã bật loa gọi số', { pitch: 1.1 });
    } else {
      window.speechSynthesis?.cancel();
      player.current?.pause();
    }
    saveSoundPref(next);
    setSound(next);
  };

  const days = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];

  return (
    <div className="qb">
      <header className="qb-head">
        <div className="qb-brand">
          <img src={`${process.env.PUBLIC_URL}/icons/icon-192.png`} alt="" width="56" height="56" />
          <div>
            <div className="qb-title">THCT CLINIC</div>
            <div className="qb-sub">Hệ thống gọi số khám bệnh</div>
          </div>
        </div>
        <div className="qb-clock" aria-live="off">
          <div className="qb-time">{pad(now.getHours())}:{pad(now.getMinutes())}<span>:{pad(now.getSeconds())}</span></div>
          <div className="qb-date">{days[now.getDay()]}, {pad(now.getDate())}/{pad(now.getMonth() + 1)}/{now.getFullYear()}</div>
        </div>
        <div className="qb-tools">
          <button type="button" onClick={toggleSound} aria-pressed={sound}>{sound ? '🔊 Loa đang bật' : '🔇 Bật loa gọi số'}</button>
          {serverVoice === 'fpt' ? (
            <span className="qb-voice-tag" title="Giọng FPT.AI từ máy chủ – mọi thiết bị đọc giống nhau">🎙 Giọng nữ FPT.AI</span>
          ) : voices.length > 0 && (
            <label className="qb-voice">
              <span className="qb-voice-label">Giọng đọc</span>
              <select value={voiceName} onChange={(e) => chooseVoice(e.target.value)} aria-label="Chọn giọng đọc">
                <option value="">Tự động (ưu tiên giọng nữ)</option>
                {voices.map((v) => (
                  <option key={v.name} value={v.name}>
                    {v.name.replace(/^Microsoft\s+/, '').replace(/\s*-\s*Vietnamese.*$/i, '')} ({GENDER_LABEL[voiceGender(v)]})
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="qb-voice">
            <span className="qb-voice-label">Tốc độ</span>
            <select value={String(rate)} onChange={(e) => chooseRate(e.target.value)} aria-label="Tốc độ đọc">
              {SPEEDS.some((s) => s.value === rate) ? null : <option value={String(rate)}>{rate}×</option>}
              {SPEEDS.map((s) => (
                <option key={s.value} value={String(s.value)}>{s.label}</option>
              ))}
            </select>
          </label>
          <button type="button" onClick={goFullscreen}>⛶ Toàn màn hình</button>
          {onExit && <button type="button" onClick={onExit}>← Thoát</button>}
        </div>
      </header>

      {error && <div className="qb-error" role="status">{error}</div>}
      {locked && (
        <div className="qb-voice-note is-tap" role="note">
          🔈 Loa gọi số đang bật – chạm hoặc bấm phím bất kỳ một lần để trình duyệt cho phát âm thanh.
        </div>
      )}
      {serverVoice !== 'fpt' && voices.length > 0 && !hasFemaleVoice() && (
        <div className="qb-voice-note" role="note">
          Máy này chỉ có giọng đọc nam tiếng Việt. Muốn giọng nữ: mở màn hình bằng Chrome hoặc Edge,
          hoặc thêm khoá FPT.AI (FPT_TTS_API_KEY) để mọi thiết bị dùng cùng giọng nữ.
        </div>
      )}

      <div className="qb-body">
        {doctors.length === 0 ? (
          <div className="qb-empty">
            <div className="qb-empty-icon">🏥</div>
            <div>Chưa có bệnh nhân check-in hôm nay</div>
            <small>Quét mã QR tại quầy lễ tân để nhận số thứ tự</small>
          </div>
        ) : (
          <main className="qb-grid">
            {doctors.map((d) => (
              <section
                key={d.doctor_id}
                className={`qb-card ${calling && calling.key.startsWith(`${d.doctor_id}|`) ? 'is-flash' : ''}`}
                aria-label={`Phòng ${d.room} – ${d.doctor_name}`}
              >
                <div className="qb-doctor">
                  <div className="qb-room">PHÒNG<b>{d.room || '—'}</b></div>
                  <div>
                    <div className="qb-doctor-name">{d.doctor_name}</div>
                    <div className="qb-dept">{d.department_name}</div>
                  </div>
                </div>
                <div className="qb-serving">
                  <div className="qb-label">ĐANG MỜI VÀO KHÁM</div>
                  {d.serving ? (
                    <>
                      <div className="qb-number">{pad(d.serving.number)}</div>
                      <div className="qb-name">{d.serving.name}</div>
                    </>
                  ) : (
                    <div className="qb-idle">{d.waiting_count ? 'Vui lòng chờ bác sĩ gọi số' : 'Không còn ai chờ'}</div>
                  )}
                </div>
                <div className="qb-next">
                  <div className="qb-label">SỐ TIẾP THEO</div>
                  {d.waiting.length === 0 ? (
                    <div className="qb-none">—</div>
                  ) : (
                    <ol>
                      {d.waiting.slice(0, 4).map((t) => (
                        <li key={t.number}><b>{pad(t.number)}</b> {t.name}</li>
                      ))}
                      {d.waiting.length > 4 && <li className="qb-more">+{d.waiting.length - 4} người nữa</li>}
                    </ol>
                  )}
                  {d.missed.length > 0 && (
                    <div className="qb-missed">
                      <span>Lỡ lượt – vui lòng báo bác sĩ/lễ tân:</span>
                      {d.missed.map((t) => <b key={t.number}>{pad(t.number)}</b>)}
                    </div>
                  )}
                </div>
                <footer className="qb-stats">
                  <span>Đang chờ: <b>{d.waiting_count}</b></span>
                  <span>Đã khám: <b>{d.done_count}</b></span>
                </footer>
              </section>
            ))}
          </main>
        )}

        <aside className="qb-recent" aria-label="Số vừa gọi">
          <div className="qb-recent-title">VỪA GỌI</div>
          {recent.length === 0 ? (
            <div className="qb-none">—</div>
          ) : (
            <ul>
              {recent.map((c) => (
                <li key={`${c.room}-${c.number}-${c.called_at}`} className={c.state === 'serving' ? 'is-live' : ''}>
                  <b>{pad(c.number)}</b>
                  <span>→ Phòng {c.room}</span>
                  <small>{hhmm(c.called_at)}</small>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>

      <div className="qb-ticker">
        Khi nghe gọi số, mời quý khách vào đúng phòng khám · Nếu lỡ lượt, vui lòng báo bác sĩ hoặc quầy lễ tân để được gọi lại
      </div>

      {calling && (
        <div className="qb-call" role="alert" aria-live="assertive">
          <div className="qb-call-box">
            <div className="qb-call-label">{calling.recall ? 'KÍNH MỜI LẠI BỆNH NHÂN SỐ' : 'KÍNH MỜI BỆNH NHÂN SỐ'}</div>
            <div className="qb-call-number">{pad(calling.number)}</div>
            <div className="qb-call-name">{calling.name}</div>
            <div className="qb-call-room">VÀO PHÒNG KHÁM <b>{calling.room}</b></div>
            <div className="qb-call-doctor">{calling.doctor_name}</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default QueueBoard;
