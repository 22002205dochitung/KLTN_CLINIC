import { API_BASE } from '../../config/api';
import { speakVi, loadVoices, getSavedRate } from '../../utils/viVoice';

/**
 * Sound for the check-in desk: a short tone (always works, no file needed) followed by a spoken
 * sentence – the clinic's FPT.AI voice when the server has a key, else the browser's Vietnamese voice.
 */

/** Same sentences as the server (queueController.checkinAnnounceText) */
export const announceText = (result, number, room) => {
  const n = Number.isInteger(number) && number > 0 ? `Số thứ tự của bạn là số ${number}. ` : '';
  const where = room ? `vào phòng khám số ${room}` : 'vào khám';
  if (result === 'ok') return `Check-in thành công. ${n}Mời bạn ngồi chờ, hệ thống sẽ gọi số thứ tự để ${where}.`;
  if (result === 'already') return `Bạn đã check-in rồi. ${n}Mời bạn ngồi chờ hệ thống gọi số.`;
  return 'Quét mã không thành công. Vui lòng quét lại.';
};

let ctx = null;
const audioCtx = () => {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!ctx) ctx = new AC();
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  } catch (e) {
    return null;
  }
};

/** ok/already: bright rising "ting-ting"; fail: two low buzzes */
const playTone = (result) => {
  const c = audioCtx();
  if (!c) return;
  const now = c.currentTime;
  const notes = result === 'fail'
    ? [[220, 0, 0.22, 'square'], [196, 0.3, 0.32, 'square']]
    : [[784, 0, 0.18, 'sine'], [1175, 0.16, 0.35, 'sine']];
  notes.forEach(([freq, at, len, type]) => {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    const peak = type === 'square' ? 0.12 : 0.35;
    gain.gain.setValueAtTime(0.0001, now + at);
    gain.gain.exponentialRampToValueAtTime(peak, now + at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + at + len);
    osc.connect(gain).connect(c.destination);
    osc.start(now + at);
    osc.stop(now + at + len + 0.05);
  });
};

// Same female voice as the lobby screen (waits for the voice list; uses the voice picked there)
const speakBrowser = (text) => speakVi(text, { cancel: true });

let voiceMode = null; // 'fpt' | 'browser'
let player = null;
const loadVoiceMode = () => {
  if (voiceMode) return Promise.resolve(voiceMode);
  return fetch(`${API_BASE}/queue/voice`)
    .then((r) => r.json())
    .then((j) => { voiceMode = j?.data?.voice === 'fpt' ? 'fpt' : 'browser'; return voiceMode; })
    .catch(() => { voiceMode = 'browser'; return voiceMode; });
};

/** Call once when the page opens: loads the voice list / voice mode so the first scan speaks at once */
export const prepareCheckinSound = () => {
  loadVoiceMode();
  loadVoices();
};

/** Stop whatever is being said (e.g. the next patient scans before the sentence ends) */
export const stopCheckinSound = () => {
  try { window.speechSynthesis?.cancel(); } catch (e) { /* ignore */ }
  if (player) { player.pause(); player.onerror = null; }
};

/** Tone + spoken result. result = 'ok' | 'already' | 'fail' */
export const playCheckinFeedback = async (result, { number, room } = {}) => {
  stopCheckinSound();
  playTone(result);
  const text = announceText(result, number, room);
  const mode = await loadVoiceMode();
  setTimeout(() => {
    if (mode !== 'fpt') { speakBrowser(text); return; }
    const params = new URLSearchParams({ result });
    if (number) params.set('number', String(number));
    if (room) params.set('room', String(room));
    player = player || new Audio();
    let fellBack = false;
    const fallback = () => { if (!fellBack) { fellBack = true; speakBrowser(text); } };
    player.onerror = fallback;
    player.src = `${API_BASE}/queue/checkin-audio?${params.toString()}`;
    player.defaultPlaybackRate = getSavedRate();
    player.playbackRate = player.defaultPlaybackRate;
    player.play().catch(fallback);
  }, 450);
};
