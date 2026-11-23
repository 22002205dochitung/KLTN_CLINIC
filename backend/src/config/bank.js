/**
 * Bank account that receives consultation-fee transfers (VietQR).
 *
 * VietQR is the NAPAS standard QR every Vietnamese banking app can scan.
 * No merchant account is needed - only the receiving account:
 *   BANK_BIN           6-digit NAPAS bank code, e.g. 970436 (Vietcombank), 970422 (MB), 970415 (VietinBank),
 *                      970418 (BIDV), 970405 (Agribank), 970407 (Techcombank), 970416 (ACB), 970423 (TPBank)
 *   BANK_ACCOUNT_NO    receiving account number
 *   BANK_ACCOUNT_NAME  account holder, upper case without accents (e.g. NGUYEN VAN A)
 *   BANK_NAME          display name only (optional)
 *
 * The QR image is rendered by the free img.vietqr.io service (needs internet, no API key).
 * Money arriving is NOT detected automatically: the cashier confirms it in "Thu ngân".
 */
const clean = (v) => (v || '').toString().trim();

// NAPAS BIN -> VietQR bank code (used by the dl.vietqr.io bank-app deeplinks)
const BIN_TO_CODE = {
  970422: 'mb', 970436: 'vcb', 970407: 'tcb', 970418: 'bidv', 970415: 'icb', 970405: 'vba',
  970416: 'acb', 970423: 'tpb', 970432: 'vpb', 970403: 'stb', 970437: 'hdb', 970441: 'vib',
  970443: 'shb', 970431: 'eib', 970448: 'ocb', 970426: 'msb', 970454: 'vccb', 970440: 'seab'
};

const BANK = {
  bin: clean(process.env.BANK_BIN),
  accountNo: clean(process.env.BANK_ACCOUNT_NO),
  accountName: clean(process.env.BANK_ACCOUNT_NAME).toUpperCase(),
  bankName: clean(process.env.BANK_NAME)
};
BANK.code = (clean(process.env.BANK_CODE) || BIN_TO_CODE[BANK.bin] || '').toLowerCase();

const isConfigured = () => /^\d{6}$/.test(BANK.bin) && /^\d{4,19}$/.test(BANK.accountNo);

/** Transfer description the cashier matches against the bank statement */
const transferContent = (appointmentId) => `THCT${appointmentId}`;

/** VietQR image URL with amount and description pre-filled */
const vietQrUrl = (amount, content) => {
  const params = new URLSearchParams({
    amount: String(Math.round(Number(amount) || 0)),
    addInfo: content
  });
  if (BANK.accountName) params.set('accountName', BANK.accountName);
  return `https://img.vietqr.io/image/${BANK.bin}-${BANK.accountNo}-compact2.png?${params.toString()}`;
};

/** THCT<id> anywhere in a bank description (banks may add prefixes, spaces or upper-case it) */
const parseTransferContent = (content) => {
  const match = String(content || '').match(/THCT\s*(\d{1,10})/i);
  return match ? parseInt(match[1], 10) : null;
};

/**
 * Optional automatic confirmation through SePay (https://sepay.vn, free tier supports MB Bank).
 * SEPAY_API_KEY  the key you enter in SePay's webhook settings ("Authorization: Apikey <key>").
 * Needs a public URL for the backend (deploy it, or use a tunnel such as ngrok during a demo).
 */
const SEPAY_API_KEY = clean(process.env.SEPAY_API_KEY);
const isWebhookEnabled = () => SEPAY_API_KEY.length >= 16;
const checkWebhookKey = (authorizationHeader) => {
  const given = String(authorizationHeader || '').replace(/^Apikey\s+/i, '').trim();
  if (!isWebhookEnabled() || given.length !== SEPAY_API_KEY.length) return false;
  return require('crypto').timingSafeEqual(Buffer.from(given), Buffer.from(SEPAY_API_KEY));
};

module.exports = {
  BANK,
  isConfigured,
  transferContent,
  vietQrUrl,
  parseTransferContent,
  isWebhookEnabled,
  checkWebhookKey
};
