const crypto = require('crypto');
const { pool } = require('../config/database');
const mailService = require('./mailService');

/**
 * One-time codes for account registration (use case "Đăng ký tài khoản", steps 5–7).
 *  - 6 digits, valid OTP_TTL_MINUTES (10), at most MAX_ATTEMPTS (5) wrong tries per code
 *  - a new code at most every RESEND_SECONDS (60) and MAX_PER_HOUR (5) per account
 *  - only a SHA-256 hash of the code is stored
 * REGISTRATION_OTP=0 turns the feature off (it is also off in the automated test run).
 */
const OTP_TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;
const RESEND_SECONDS = 60;
const MAX_PER_HOUR = 5;

const isEnabled = () => {
  const flag = String(process.env.REGISTRATION_OTP ?? '').trim();
  if (flag === '0' || flag.toLowerCase() === 'false') return false;
  if (flag === '1' || flag.toLowerCase() === 'true') return true;
  return process.env.NODE_ENV !== 'test';
};

const hash = (userId, code) => crypto.createHash('sha256').update(`${userId}:${code}`).digest('hex');

const otpError = (code, message, status = 400, extra = {}) => Object.assign(new Error(message), { code, status, ...extra });

const MAIL_TEXT = {
  register: { subject: 'THCT Clinic – Mã xác thực đăng ký tài khoản', what: 'xác thực đăng ký tài khoản' },
  reset: { subject: 'THCT Clinic – Mã đặt lại mật khẩu', what: 'đặt lại mật khẩu' }
};

/** Create a code for the user and send it. Returns { delivery: 'email' | 'demo', devCode? } */
const issue = async (user, purpose = 'register') => {
  const [[recent]] = await pool.execute(
    `SELECT TIMESTAMPDIFF(SECOND, MAX(created_at), NOW()) AS since_last,
            SUM(created_at > NOW() - INTERVAL 1 HOUR) AS last_hour
     FROM otp_codes WHERE user_id = ? AND purpose = ?`,
    [user.id, purpose]
  );
  if (recent && recent.since_last !== null && Number(recent.since_last) < RESEND_SECONDS) {
    throw otpError('OTP_TOO_SOON', `Vui lòng chờ ${RESEND_SECONDS - Number(recent.since_last)} giây trước khi gửi lại mã`, 429,
      { retryAfter: RESEND_SECONDS - Number(recent.since_last) });
  }
  if (recent && Number(recent.last_hour) >= MAX_PER_HOUR) {
    throw otpError('OTP_LIMIT', 'Bạn đã yêu cầu quá nhiều mã trong 1 giờ. Vui lòng thử lại sau.', 429);
  }

  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  // older codes stop working as soon as a new one is issued
  await pool.execute('UPDATE otp_codes SET consumed_at = NOW() WHERE user_id = ? AND purpose = ? AND consumed_at IS NULL', [user.id, purpose]);
  await pool.execute(
    `INSERT INTO otp_codes (user_id, purpose, code_hash, expires_at) VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE))`,
    [user.id, purpose, hash(user.id, code), OTP_TTL_MINUTES]
  );

  const mail = MAIL_TEXT[purpose] || MAIL_TEXT.register;
  const sent = await mailService.sendMail({
    to: user.email,
    subject: mail.subject,
    text: `Mã ${mail.what} của bạn là ${code}. Mã có hiệu lực ${OTP_TTL_MINUTES} phút. Không chia sẻ mã này cho bất kỳ ai.`,
    html: `<p>Xin chào ${user.fullname || ''},</p><p>Mã ${mail.what} THCT Clinic của bạn là:</p>
           <p style="font-size:28px;font-weight:700;letter-spacing:6px">${code}</p>
           <p>Mã có hiệu lực ${OTP_TTL_MINUTES} phút. Không chia sẻ mã này cho bất kỳ ai.</p>`
  });
  // Demo mode (no SMTP configured, never in production): hand the code back so the flow can be shown
  const demo = sent.mode === 'demo' && process.env.NODE_ENV !== 'production';
  return { delivery: sent.mode, ttlMinutes: OTP_TTL_MINUTES, resendSeconds: RESEND_SECONDS, ...(demo ? { devCode: code } : {}) };
};

/** Check a code for (user, purpose) and consume it. Throws OTP_* errors. */
const consume = async (user, code, purpose) => {
  const clean = String(code || '').trim();

  const [[otp]] = await pool.execute(
    `SELECT id, code_hash, attempts, (expires_at < NOW()) AS expired FROM otp_codes
     WHERE user_id = ? AND purpose = ? AND consumed_at IS NULL ORDER BY id DESC LIMIT 1`,
    [user.id, purpose]
  );
  if (!otp) throw otpError('OTP_EXPIRED', 'Mã OTP đã hết hiệu lực – bấm "Gửi lại mã"');
  if (Number(otp.expired)) throw otpError('OTP_EXPIRED', 'Mã OTP đã hết hạn – bấm "Gửi lại mã"');
  if (Number(otp.attempts) >= MAX_ATTEMPTS) throw otpError('OTP_LOCKED', 'Nhập sai quá nhiều lần – bấm "Gửi lại mã" để nhận mã mới');

  if (otp.code_hash !== hash(user.id, clean)) {
    await pool.execute('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?', [otp.id]);
    const left = MAX_ATTEMPTS - Number(otp.attempts) - 1;
    throw otpError('OTP_WRONG', left > 0 ? `Mã OTP không đúng – còn ${left} lần thử` : 'Nhập sai quá nhiều lần – bấm "Gửi lại mã"');
  }
  await pool.execute('UPDATE otp_codes SET consumed_at = NOW() WHERE id = ?', [otp.id]);
};

const findByEmail = async (email) => {
  const [[user]] = await pool.execute('SELECT id, email, fullname, email_verified FROM users WHERE email = ?', [String(email || '').trim().toLowerCase()]);
  return user;
};

/** Check a registration code; on success the e-mail is marked verified */
const verify = async (email, code, purpose = 'register') => {
  if (!/^\d{6}$/.test(String(code || '').trim())) throw otpError('OTP_INVALID', 'Mã OTP gồm 6 chữ số');
  const user = await findByEmail(email);
  if (!user) throw otpError('OTP_INVALID', 'Mã OTP không đúng');
  if (Number(user.email_verified) === 1) return { alreadyVerified: true, userId: user.id };
  await consume(user, code, purpose);
  await pool.execute('UPDATE users SET email_verified = 1 WHERE id = ?', [user.id]);
  return { verified: true, userId: user.id };
};

/** Check a password-reset code; returns the user (the caller sets the new password) */
const verifyReset = async (email, code) => {
  if (!/^\d{6}$/.test(String(code || '').trim())) throw otpError('OTP_INVALID', 'Mã xác nhận gồm 6 chữ số');
  const user = await findByEmail(email);
  if (!user) throw otpError('OTP_INVALID', 'Mã xác nhận không đúng');
  await consume(user, code, 'reset');
  return user;
};

module.exports = { isEnabled, issue, verify, verifyReset, OTP_TTL_MINUTES };
