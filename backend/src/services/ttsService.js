const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/**
 * Text-to-speech for the queue loudspeaker (FPT.AI TTS v5).
 *
 * backend/.env:
 *   FPT_TTS_API_KEY=<key from https://console.fpt.ai>
 *   TTS_VOICE=lannhi        # lannhi | linhsan = nữ miền Nam, banmai | thuminh = nữ miền Bắc, myan = nữ miền Trung
 *   TTS_SPEED=0             # -3 .. +3 (0 = normal)
 *
 * FPT returns a link to the MP3 that may only exist a few seconds later, so the file is polled,
 * downloaded once and cached on disk: the same sentence is never synthesized (or paid for) twice.
 */
const API_URL = 'https://api.fpt.ai/hmi/tts/v5';
const CACHE_DIR = path.join(__dirname, '..', '..', 'storage', 'tts');
const VOICES = ['lannhi', 'linhsan', 'banmai', 'thuminh', 'myan', 'leminh', 'giahuy'];
const MAX_WAIT_MS = 25000;
const MAX_CACHE_AGE_MS = 7 * 24 * 3600 * 1000;

const config = () => {
  const speed = parseInt(process.env.TTS_SPEED, 10);
  return {
    apiKey: (process.env.FPT_TTS_API_KEY || '').trim(),
    voice: VOICES.includes(process.env.TTS_VOICE) ? process.env.TTS_VOICE : 'lannhi',
    speed: Number.isInteger(speed) && speed >= -3 && speed <= 3 ? speed : 0
  };
};

const isConfigured = () => Boolean(config().apiKey);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const inflight = new Map(); // cache key -> Promise<filePath>

const cleanOldFiles = () => {
  fs.readdir(CACHE_DIR, (err, files) => {
    if (err) return;
    const now = Date.now();
    files.forEach((f) => {
      const p = path.join(CACHE_DIR, f);
      fs.stat(p, (e, st) => { if (!e && now - st.mtimeMs > MAX_CACHE_AGE_MS) fs.unlink(p, () => {}); });
    });
  });
};

const synthesizeToFile = async (text, file) => {
  const { apiKey, voice, speed } = config();
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { api_key: apiKey, voice, speed: String(speed), format: 'mp3', 'Content-Type': 'text/plain; charset=utf-8' },
    body: text
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || Number(data.error) !== 0 || !data.async) {
    throw new Error(`TTS_FAILED: ${data.message || res.status}`);
  }
  // the MP3 appears at data.async after a short delay
  const started = Date.now();
  let wait = 700;
  while (Date.now() - started < MAX_WAIT_MS) {
    await sleep(wait);
    const audio = await fetch(data.async).catch(() => null);
    if (audio && audio.ok) {
      const buf = Buffer.from(await audio.arrayBuffer());
      if (buf.length > 500) {
        fs.mkdirSync(CACHE_DIR, { recursive: true });
        const tmp = `${file}.${process.pid}.tmp`;
        fs.writeFileSync(tmp, buf);
        fs.renameSync(tmp, file);
        cleanOldFiles();
        return file;
      }
    }
    wait = Math.min(wait + 300, 1500);
  }
  throw new Error('TTS_TIMEOUT');
};

/** Path of an MP3 with `text` read out; synthesized on first use, then served from cache. */
const getAudioFile = (text) => {
  const { voice, speed } = config();
  const key = crypto.createHash('sha1').update(`${voice}|${speed}|${text}`).digest('hex');
  const file = path.join(CACHE_DIR, `${key}.mp3`);
  if (fs.existsSync(file)) return Promise.resolve(file);
  if (!inflight.has(key)) {
    const job = synthesizeToFile(text, file).finally(() => inflight.delete(key));
    inflight.set(key, job);
  }
  return inflight.get(key);
};

/** Start synthesis in the background (e.g. right when the doctor presses "Gọi số"). */
const prefetch = (text) => {
  if (!isConfigured() || !text) return;
  getAudioFile(text).catch((e) => console.warn('TTS prefetch failed:', e.message));
};

module.exports = { isConfigured, getAudioFile, prefetch, config };
