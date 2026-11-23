const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const sepayGateway = require('../controllers/sepayGatewayController');
const { verifyToken, requireRole } = require('../middleware/authMiddleware');
const { globalRateLimit } = require('../middleware/rateLimitMiddleware');

/**
 * Payment Routes (mounted at /api/payments)
 *
 * Public:
 *   GET  /consultation-fees
 *   GET  /consultation-fees/:departmentId
 *   GET  /bank-transfer/:appointmentId       (VietQR transfer info for a booking)
 * Authenticated:
 *   GET  /my-history
 * Cashier (receptionist/admin):
 *   POST /consultation
 *   GET  /cashier/pending
 *   GET  /medication/:medicalRecordId
 *   POST /medication
 *   GET  /admin/payments
 * Admin:
 *   PUT  /consultation-fees/:departmentId
 *   GET  /admin/payments/revenue
 *   POST /admin/payments/:id/refund
 */

const cashier = [verifyToken, requireRole(['receptionist', 'admin'])];
const adminOnly = [verifyToken, requireRole(['admin'])];

// ============ PUBLIC ============
router.get('/consultation-fees', globalRateLimit, paymentController.getConsultationFees);
router.get('/consultation-fees/:departmentId', globalRateLimit, paymentController.getConsultationFeeByDepartment);

// ============ AUTHENTICATED ============
// Recording a payment marks money as received, so only the cashier (receptionist/admin) may do it.
// (It used to accept patients too, which let a patient mark their own booking "paid" without paying.)
router.post('/consultation', ...cashier, globalRateLimit, paymentController.processConsultationPayment);

// Bank-transfer (VietQR) details for one appointment - public so a guest sees it right after booking.
// Returns only amount, transfer description and the clinic's account; no patient data.
router.get('/bank-transfer/:appointmentId', globalRateLimit, paymentController.getBankTransferInfo);

// Patient presses "Tôi đã chuyển khoản": only flags the booking for the cashier to verify
router.post('/bank-transfer/:appointmentId/report', globalRateLimit, paymentController.reportBankTransfer);

// SePay incoming-transfer webhook (authenticated by API key, enabled only when SEPAY_API_KEY is set)
router.post('/webhook/sepay', paymentController.sepayWebhook);

// SePay Payment Gateway (cổng thanh toán): checkout form, return check, IPN.
// IPN URL to enter in SePay: https://<tên-miền>/api/payments/sepay/ipn
router.get('/sepay/status', sepayGateway.status);
router.post('/sepay/checkout/:appointmentId', globalRateLimit, sepayGateway.checkout);
router.post('/sepay/confirm', globalRateLimit, sepayGateway.confirm);
router.post('/sepay/ipn', sepayGateway.ipn);
router.get('/my-history', verifyToken, paymentController.getMyPaymentHistory);

// ============ CASHIER (RECEPTIONIST / ADMIN) ============
router.get('/cashier/pending', ...cashier, paymentController.getPendingPayments);
router.get('/medication/:medicalRecordId', ...cashier, paymentController.getMedicationBill);
router.post('/medication', ...cashier, paymentController.processMedicationPayment);
router.get('/admin/payments', ...cashier, paymentController.getAllTransactions);

// ============ ADMIN ============
router.put('/consultation-fees/:departmentId', ...adminOnly, paymentController.updateConsultationFee);
router.get('/admin/payments/revenue', ...adminOnly, paymentController.getRevenueStatistics);
router.post('/admin/payments/:id/refund', ...adminOnly, paymentController.refundTransaction);

module.exports = router;
