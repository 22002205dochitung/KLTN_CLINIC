const { SePayPgClient } = require('sepay-pg-node');
const { pool } = require('../config/database');
const paymentService = require('./paymentService');

/**
 * SePay Payment Gateway (cổng thanh toán: VietQR / Napas / thẻ) for the consultation fee.
 *
 * Flow
 *  1. POST /api/payments/sepay/checkout/:appointmentId -> signed form fields; the browser posts them
 *     to SePay's checkout page (the secret key never leaves the server).
 *  2. SePay calls our IPN (POST /api/payments/sepay/ipn) when the order is paid, and redirects the
 *     browser back to success_url.
 *  3. Neither the IPN body nor the redirect is trusted on its own: the order is always re-read from
 *     SePay's API (Basic auth merchant_id:secret_key) before the appointment is marked paid.
 *     This also makes local testing work, where SePay cannot reach the IPN on localhost.
 *
 * .env
 *  SEPAY_PG_ENV          sandbox | production   (default sandbox)
 *  SEPAY_PG_MERCHANT_ID  e.g. SP-TEST-XXXXXXX
 *  SEPAY_PG_SECRET_KEY   spsk_test_... / spsk_live_...
 *  SEPAY_PG_IPN_SECRET   optional: the key chosen in SePay > IPN (Auth type SECRET_KEY), sent as X-Secret-Key
 */
const clean = (v) => String(v || '').trim();
const ENV = clean(process.env.SEPAY_PG_ENV).toLowerCase() === 'production' ? 'production' : 'sandbox';
const MERCHANT_ID = clean(process.env.SEPAY_PG_MERCHANT_ID);
const SECRET_KEY = clean(process.env.SEPAY_PG_SECRET_KEY);
const IPN_SECRET = clean(process.env.SEPAY_PG_IPN_SECRET);
const HOLD_EXTEND_MINUTES = 20;

const isEnabled = () => Boolean(MERCHANT_ID && SECRET_KEY);

let client = null;
const getClient = () => {
  if (!client) client = new SePayPgClient({ env: ENV, merchant_id: MERCHANT_ID, secret_key: SECRET_KEY });
  return client;
};

class GatewayError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

// THCT<appointmentId>T<time> : unique per attempt, letters/digits only, and maps back to the booking
const newInvoiceNumber = (appointmentId) => `THCT${appointmentId}T${Date.now().toString(36).toUpperCase()}`;
const appointmentIdFromInvoice = (invoice) => {
  const m = String(invoice || '').match(/^THCT(\d{1,10})T[0-9A-Z]+$/);
  return m ? parseInt(m[1], 10) : null;
};

const loadAppointment = async (appointmentId) => {
  const [rows] = await pool.execute(
    `SELECT a.id, a.doctor_id, a.status, a.payment_status, a.consultation_fee, a.exam_type,
            p.fullname AS patient_name, p.phone AS patient_phone
     FROM appointments a LEFT JOIN users p ON p.id = a.patient_id
     WHERE a.id = ?`,
    [appointmentId]
  );
  return rows[0] || null;
};

const feeOf = async (appointment) => {
  let fee = Number(appointment.consultation_fee);
  if (!fee || fee <= 0) fee = Number(await paymentService.getConsultationFeeByDoctor(appointment.doctor_id));
  return Math.round(fee);
};

/** Signed fields for SePay's checkout form */
const createCheckout = async (appointmentId, returnBase) => {
  if (!isEnabled()) throw new GatewayError('GATEWAY_DISABLED', 'Cổng thanh toán SePay chưa được cấu hình', 503);
  const appointment = await loadAppointment(appointmentId);
  if (!appointment) throw new GatewayError('APPOINTMENT_NOT_FOUND', 'Không tìm thấy lịch hẹn', 404);
  if (appointment.status === 'cancelled') throw new GatewayError('APPOINTMENT_CANCELLED', 'Lịch hẹn đã huỷ', 409);
  if (appointment.payment_status === 'paid') throw new GatewayError('ALREADY_PAID', 'Lịch hẹn đã được thanh toán', 409);

  const amount = await feeOf(appointment);
  if (!amount || amount <= 0) throw new GatewayError('NO_FEE', 'Lịch hẹn này không có phí cần thanh toán', 409);

  const invoice = newInvoiceNumber(appointment.id);
  const back = (result) => `${returnBase}/?sepay=${result}&inv=${encodeURIComponent(invoice)}`;
  const sdk = getClient();

  // Key order = SePay's signing order (merchant, operation, payment_method, order_amount, currency,
  // order_invoice_number, order_description, customer_id, success_url, error_url, cancel_url)
  const fields = sdk.checkout.initOneTimePaymentFields({
    merchant: MERCHANT_ID,
    operation: 'PURCHASE',
    order_amount: amount,
    currency: 'VND',
    order_invoice_number: invoice,
    order_description: `Thanh toan phi kham lich hen ${appointment.id}`,
    success_url: back('success'),
    error_url: back('error'),
    cancel_url: back('cancel')
  });

  // the patient is paying right now: do not let the unpaid-booking job cancel the slot meanwhile
  await pool.execute(
    `UPDATE appointments
     SET hold_expires_at = GREATEST(COALESCE(hold_expires_at, NOW()), DATE_ADD(NOW(), INTERVAL ? MINUTE))
     WHERE id = ? AND payment_status = 'unpaid' AND hold_expires_at IS NOT NULL`,
    [HOLD_EXTEND_MINUTES, appointment.id]
  );

  return { action: sdk.checkout.initCheckoutUrl(), fields, invoice, amount, env: ENV };
};

const PAID_ORDER_STATUSES = ['CAPTURED', 'PAID', 'COMPLETED', 'SUCCESS'];
const PAID_TX_STATUSES = ['APPROVED', 'SUCCESS', 'CAPTURED'];

/** Normalise SePay's order detail (the API wraps it in { data }) */
const readOrder = (payload) => {
  const o = payload?.data?.data || payload?.data || payload || {};
  const order = o.order || o;
  const txList = Array.isArray(o.transactions) ? o.transactions : (o.transaction ? [o.transaction] : []);
  const tx = txList.find((t) => PAID_TX_STATUSES.includes(String(t.transaction_status || '').toUpperCase())) || txList[0] || null;
  return {
    invoice: order.order_invoice_number,
    status: String(order.order_status || '').toUpperCase(),
    amount: Number(order.order_amount),
    currency: order.order_currency || order.currency,
    tx
  };
};

/**
 * Ask SePay for the order and, when it is paid, record the consultation payment (idempotent).
 * Returns { state: 'paid' | 'already_paid' | 'pending' | 'not_found', appointment_id }
 */
const confirmInvoice = async (invoice, source = 'confirm') => {
  if (!isEnabled()) throw new GatewayError('GATEWAY_DISABLED', 'Cổng thanh toán SePay chưa được cấu hình', 503);
  const appointmentId = appointmentIdFromInvoice(invoice);
  if (!appointmentId) throw new GatewayError('INVALID_INVOICE', 'Mã đơn thanh toán không hợp lệ');

  let detail;
  try {
    detail = await getClient().order.retrieve(invoice);
  } catch (error) {
    const status = error?.response?.status;
    if (status === 404) return { state: 'not_found', appointment_id: appointmentId };
    if (status === 401 || status === 403) throw new GatewayError('GATEWAY_AUTH', 'Sai MERCHANT ID / SECRET KEY của SePay', 502);
    throw new GatewayError('GATEWAY_UNREACHABLE', 'Không kết nối được cổng SePay, thử lại sau', 502);
  }

  const order = readOrder(detail);
  if (order.invoice && order.invoice !== invoice) throw new GatewayError('INVOICE_MISMATCH', 'Đơn thanh toán không khớp', 409);
  if (!PAID_ORDER_STATUSES.includes(order.status)) {
    return { state: 'pending', appointment_id: appointmentId, order_status: order.status || null };
  }

  const appointment = await loadAppointment(appointmentId);
  if (!appointment) throw new GatewayError('APPOINTMENT_NOT_FOUND', 'Không tìm thấy lịch hẹn', 404);
  if (appointment.payment_status === 'paid') return { state: 'already_paid', appointment_id: appointmentId };

  const fee = await feeOf(appointment);
  if (order.currency && String(order.currency).toUpperCase() !== 'VND') {
    throw new GatewayError('CURRENCY_MISMATCH', 'Đơn thanh toán không phải VND', 409);
  }
  if (!(order.amount >= fee)) {
    throw new GatewayError('AMOUNT_MISMATCH', `Số tiền đã trả (${order.amount}) nhỏ hơn phí khám (${fee})`, 409);
  }

  const method = String(order.tx?.payment_method || '').toUpperCase() === 'CARD' ? 'card' : 'bank_transfer';
  const reference = `SEPAYPG-${order.tx?.transaction_id || order.tx?.id || invoice}`;
  try {
    const result = await paymentService.processConsultationPayment({
      appointment_id: appointmentId,
      amount: order.amount,
      payment_method: method,
      notes: `Cổng SePay (${source}) · đơn ${invoice}${order.tx?.transaction_id ? ` · GD ${order.tx.transaction_id}` : ''}`,
      bank_reference: reference.slice(0, 100),
      user_id: null,
      ipAddress: 'sepay-gateway',
      userAgent: `sepay-${source}`
    });
    return { state: 'paid', appointment_id: appointmentId, transaction_id: result.transaction_id, amount: order.amount };
  } catch (error) {
    // the IPN and the browser return can arrive together: the second one finds it already recorded
    if (error.code === 'ER_DUP_ENTRY' || error.code === 'ALREADY_PAID') return { state: 'already_paid', appointment_id: appointmentId };
    throw error;
  }
};

/** X-Secret-Key check, only when an IPN secret is configured (constant-time compare) */
const checkIpnSecret = (header) => {
  if (!IPN_SECRET) return true;
  const given = Buffer.from(String(header || ''));
  const expected = Buffer.from(IPN_SECRET);
  return given.length === expected.length && require('crypto').timingSafeEqual(given, expected);
};

module.exports = {
  isEnabled,
  createCheckout,
  confirmInvoice,
  checkIpnSecret,
  appointmentIdFromInvoice,
  GatewayError,
  ENV
};
