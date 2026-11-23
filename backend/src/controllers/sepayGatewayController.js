const gateway = require('../services/sepayGatewayService');
const { PaymentError } = require('../services/paymentService');

/**
 * SePay Payment Gateway endpoints (mounted under /api/payments/sepay)
 *  GET  /status                    - is the gateway configured (button shown or not)
 *  POST /checkout/:appointmentId   - signed form fields for SePay's checkout page (public, like the VietQR info)
 *  POST /confirm                   - browser came back from SePay: re-check the order with SePay's API
 *  POST /ipn                       - SePay's server-to-server notification (IPN URL to set in SePay)
 */

// Where SePay sends the browser back: APP_URL on the host, otherwise the local frontend that asked
const returnBase = (req) => {
  const appUrl = String(process.env.APP_URL || '').trim().replace(/\/+$/, '');
  if (appUrl) return appUrl;
  const origin = String(req.get('origin') || '').replace(/\/+$/, '');
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return origin;
  return 'http://localhost:3000';
};

const sendError = (res, error, context) => {
  if (error instanceof gateway.GatewayError || error instanceof PaymentError) {
    return res.status(error.status).json({ success: false, error: { code: error.code, message: error.message } });
  }
  console.error(`SePay gateway ${context} error:`, error);
  return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Lỗi khi xử lý thanh toán qua SePay' } });
};

module.exports = {
  status(req, res) {
    res.json({ success: true, data: { enabled: gateway.isEnabled(), env: gateway.ENV } });
  },

  async checkout(req, res) {
    try {
      const appointmentId = parseInt(req.params.appointmentId, 10);
      if (!appointmentId || appointmentId <= 0) {
        return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Mã lịch hẹn không hợp lệ' } });
      }
      const data = await gateway.createCheckout(appointmentId, returnBase(req));
      res.json({ success: true, data });
    } catch (error) {
      sendError(res, error, 'checkout');
    }
  },

  async confirm(req, res) {
    try {
      const result = await gateway.confirmInvoice(String(req.body?.invoice || ''), 'return');
      res.json({ success: true, data: result });
    } catch (error) {
      sendError(res, error, 'confirm');
    }
  },

  async ipn(req, res) {
    if (!gateway.checkIpnSecret(req.get('x-secret-key'))) {
      return res.status(401).json({ success: false, message: 'Invalid secret key' });
    }
    const body = req.body || {};
    const invoice = body.order?.order_invoice_number;
    const type = String(body.notification_type || '').toUpperCase();

    // only paid orders change anything; other notifications (or SePay's "Gửi test") are acknowledged
    if (type !== 'ORDER_PAID' || !gateway.appointmentIdFromInvoice(invoice)) {
      return res.status(200).json({ success: true, handled: false });
    }
    try {
      // the body is not trusted: the order is re-read from SePay before anything is marked paid
      const result = await gateway.confirmInvoice(invoice, 'ipn');
      return res.status(200).json({ success: true, handled: true, state: result.state });
    } catch (error) {
      if (error instanceof gateway.GatewayError && ['GATEWAY_UNREACHABLE'].includes(error.code)) {
        // temporary: answer with an error so SePay retries later
        return res.status(503).json({ success: false, message: error.message });
      }
      console.error('SePay IPN error:', error.code || '', error.message);
      // permanent problem (amount mismatch, cancelled booking...): acknowledge, staff sees it in the log
      return res.status(200).json({ success: true, handled: false, error: error.code || 'ERROR' });
    }
  }
};
