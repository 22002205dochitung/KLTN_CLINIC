/**
 * Vietnamese browser voice (used when the server has no FPT.AI key).
 *
 * Why this exists: browsers load their voice list a moment after the page opens (installed apps
 * even later). Speaking before that used the system default – on Windows "Microsoft An", a male
 * voice – so the lobby screen sometimes spoke with a man's voice. Here we wait for the list and
 * always prefer a female Vietnamese voice (or the one chosen by hand, remembered per device).
 */
const KEY = 'tts_voice_name';

// Known female Vietnamese voices: Edge "HoaiMy", Chrome "Google Tiếng Việt", Apple "Linh",
// Android "vi-vn-x-gft/vic/vie..." (Google female set)
const FEMALE = ['hoaimy', 'hoài my', 'google tiếng việt', 'google vietnamese', 'linh', 'mai', 'female', 'nữ', 'x-gft', 'x-vic', 'x-vie'];
// Known male ones: Windows "An", Edge "NamMinh", Android "x-vif / x-vid / x-gfm"
// (not plain "nam": most names end with "Vietnamese (Vietnam)")
const MALE = ['namminh', 'nam minh', 'male', 'x-vif', 'x-vid', 'x-gfm'];

const nameOf = (v) => String(v?.name || '').toLowerCase();
const isMaleName = (n) => /\ban\b/.test(n.replace(/[^a-zà-ỹ0-9 ]/g, ' ')) || MALE.some((h) => n.includes(h) && !n.includes('female'));
const isFemaleName = (n) => FEMALE.some((h) => n.includes(h));

/** 'female' | 'male' | 'unknown' guessed from the voice name */
export const voiceGender = (v) => {
  const n = nameOf(v);
  if (isFemaleName(n)) return 'female';
  if (isMaleName(n)) return 'male';
  return 'unknown';
};

const synth = () => (typeof window !== 'undefined' ? window.speechSynthesis : null);

export const vietnameseVoices = () => (synth()?.getVoices() || [])
  .filter((v) => v.lang && v.lang.toLowerCase().replace('_', '-').startsWith('vi'));

let ready = null;
/** Resolves once the browser has loaded its voices (or after 2 s, whatever comes first) */
export const loadVoices = () => {
  const s = synth();
  if (!s) return Promise.resolve([]);
  if (s.getVoices().length) return Promise.resolve(vietnameseVoices());
  if (!ready) {
    ready = new Promise((resolve) => {
      const done = () => { s.removeEventListener?.('voiceschanged', done); resolve(vietnameseVoices()); };
      s.addEventListener?.('voiceschanged', done);
      setTimeout(done, 2000);
    }).then((list) => { ready = null; return list; });
  }
  return ready;
};

export const getSavedVoiceName = () => {
  try { return localStorage.getItem(KEY) || ''; } catch (e) { return ''; }
};
export const saveVoiceName = (name) => {
  try { if (name) localStorage.setItem(KEY, name); else localStorage.removeItem(KEY); } catch (e) { /* private mode */ }
};

/** The voice to use: the one picked by hand, else the best female voice, else any non-male one */
export const pickVoice = () => {
  const list = vietnameseVoices();
  if (!list.length) return null;
  const saved = getSavedVoiceName();
  const chosen = saved && list.find((v) => v.name === saved);
  if (chosen) return chosen;
  const female = list.filter((v) => voiceGender(v) === 'female');
  // online/natural voices sound much better than the old offline ones
  const natural = female.find((v) => /natural|online|google/i.test(v.name));
  return natural || female[0] || list.find((v) => voiceGender(v) !== 'male') || list[0];
};

/** Reading speed, chosen on the lobby screen and remembered per device (1 = the voice's normal speed) */
const RATE_KEY = 'tts_rate';
export const SPEEDS = [
  { value: 0.9, label: 'Chậm' },
  { value: 1.1, label: 'Vừa' },
  { value: 1.3, label: 'Nhanh' },
  { value: 1.5, label: 'Rất nhanh' }
];
export const DEFAULT_RATE = 1.1;
export const getSavedRate = () => {
  try {
    const r = parseFloat(localStorage.getItem(RATE_KEY));
    return r >= 0.5 && r <= 2 ? r : DEFAULT_RATE;
  } catch (e) {
    return DEFAULT_RATE;
  }
};
export const saveRate = (rate) => {
  try { localStorage.setItem(RATE_KEY, String(rate)); } catch (e) { /* private mode */ }
};

/** Speak Vietnamese text with the chosen/female voice at the chosen speed. Resolves when queued. */
export const speakVi = async (text, { rate = getSavedRate(), pitch = 1.05, cancel = false } = {}) => {
  const s = synth();
  if (!s || typeof window.SpeechSynthesisUtterance === 'undefined') return;
  await loadVoices();
  if (cancel) s.cancel();
  const u = new window.SpeechSynthesisUtterance(text);
  u.lang = 'vi-VN';
  u.rate = rate;
  u.pitch = pitch;
  const v = pickVoice();
  if (v) u.voice = v;
  s.speak(u);
};

/** true when this device has at least one female Vietnamese voice */
export const hasFemaleVoice = () => vietnameseVoices().some((v) => voiceGender(v) === 'female');
