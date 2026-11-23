const { pool } = require('../config/database');

/**
 * Payment hold (giữ chỗ 15 phút – use case "Thanh toán phí khám", alternative flow 2.1).
 * A booking paid by online bank transfer keeps its place until hold_expires_at. When the time
 * is over, the booking is still unpaid and the patient has not reported a transfer, it is
 * cancelled automatically so the place goes back to other patients.
 */
const releaseExpiredHolds = async () => {
  try {
    const [expired] = await pool.execute(
      `SELECT id FROM appointments
       WHERE status = 'booked' AND payment_status = 'unpaid'
         AND hold_expires_at IS NOT NULL AND hold_expires_at < NOW()
         AND transfer_reported_at IS NULL`
    );
    if (!expired.length) return 0;
    const ids = expired.map((r) => r.id);
    await pool.execute(
      `UPDATE appointments SET status = 'cancelled'
       WHERE id IN (${ids.map(() => '?').join(',')}) AND status = 'booked' AND payment_status = 'unpaid'`,
      ids
    );
    await pool.execute(
      `INSERT INTO audit_logs (user_id, event_type, event_details, ip_address, user_agent)
       VALUES (NULL, 'appointment_hold_expired', ?, 'system', 'payment-hold-job')`,
      [JSON.stringify({ appointmentIds: ids })]
    ).catch(() => undefined);
    console.log(`⏱️  Payment hold expired – cancelled appointments: ${ids.join(', ')}`);
    return ids.length;
  } catch (error) {
    console.error('Payment hold job failed:', error.message);
    return 0;
  }
};

const startPaymentHoldJob = (intervalMs = 60000) => {
  releaseExpiredHolds();
  const timer = setInterval(releaseExpiredHolds, intervalMs);
  if (timer.unref) timer.unref();
  return timer;
};

module.exports = { startPaymentHoldJob, releaseExpiredHolds };
