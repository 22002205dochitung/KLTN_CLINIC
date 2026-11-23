const paymentService = require('../services/paymentService');
const { pool } = require('../config/database');
const bank = require('../config/bank');

const { PaymentError } = paymentService;

/**
 * Payment Controller
 * Handles HTTP requests for payment operations
 *
 * Endpoints (mounted at /api/payments):
 * - GET    /consultation-fees                 - Current fee of every department (public)
 * - GET    /consultation-fees/:departmentId   - Fee of one department (public)
 * - PUT    /consultation-fees/:departmentId   - Update fee (admin)
 * - GET    /bank-transfer/:appointmentId      - VietQR transfer info for a booking (public)
 * - POST   /consultation                      - Record consultation fee received (cashier)
 * - GET    /medication/:medicalRecordId       - Medication bill (cashier)
 * - POST   /medication                        - Pay medication (cashier)
 * - GET    /cashier/pending                   - Pending payments (cashier)
 * - GET    /my-history                        - Patient's payment history
 * - GET    /admin/payments                    - All transactions (admin / receptionist)
 * - GET    /admin/payments/revenue            - Revenue statistics (admin)
 * - POST   /admin/payments/:id/refund         - Refund a transaction (admin)
 */

const clientInfo = (req) => ({
    ipAddress: req.ip || req.connection?.remoteAddress || 'unknown',
    userAgent: req.get ? req.get('User-Agent') : null
});

/**
 * Send a consistent error response. PaymentError carries its own status/code;
 * anything else is treated as an internal error.
 */
const handleError = (res, error, context, fallbackMessage) => {
    if (error instanceof PaymentError) {
        return res.status(error.status).json({
            success: false,
            error: { code: error.code, message: error.message }
        });
    }
    console.error(`${context} error:`, error);
    return res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: fallbackMessage }
    });
};

class PaymentController {
    /**
     * GET /api/payments/bank-transfer/:appointmentId
     * VietQR details to pay one booking's consultation fee by bank transfer.
     * The cashier confirms receipt later; this endpoint never changes payment state.
     */
    async getBankTransferInfo(req, res) {
        try {
            const appointmentId = parseInt(req.params.appointmentId, 10);
            if (!appointmentId || appointmentId <= 0) {
                return res.status(400).json({
                    success: false,
                    error: { code: 'VALIDATION_ERROR', message: 'Mã lịch hẹn không hợp lệ' }
                });
            }

            const [rows] = await pool.execute(
                'SELECT id, doctor_id, status, consultation_fee, payment_status, transfer_reported_at FROM appointments WHERE id = ?',
                [appointmentId]
            );
            if (rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: { code: 'APPOINTMENT_NOT_FOUND', message: 'Không tìm thấy lịch hẹn' }
                });
            }
            const appointment = rows[0];

            let amount = Number(appointment.consultation_fee);
            if (!amount || amount <= 0) {
                amount = Number(await paymentService.getConsultationFeeByDoctor(appointment.doctor_id));
            }

            const content = bank.transferContent(appointment.id);
            const configured = bank.isConfigured();

            res.json({
                success: true,
                data: {
                    appointment_id: appointment.id,
                    appointment_status: appointment.status,
                    payment_status: appointment.payment_status,
                    transfer_reported_at: appointment.transfer_reported_at,
                    auto_confirm: bank.isWebhookEnabled(),
                    amount,
                    content,
                    configured,
                    bank: configured
                        ? {
                            bin: bank.BANK.bin,
                            code: bank.BANK.code,
                            bank_name: bank.BANK.bankName,
                            account_no: bank.BANK.accountNo,
                            account_name: bank.BANK.accountName
                        }
                        : null,
                    qr_url: configured ? bank.vietQrUrl(amount, content) : null
                }
            });
        } catch (error) {
            handleError(res, error, 'Get bank transfer info', 'Không thể tải thông tin chuyển khoản');
        }
    }

    /**
     * POST /api/payments/bank-transfer/:appointmentId/report
     * Patient says "I have transferred". Only flags the booking for the cashier, who checks the
     * bank account and confirms; it never marks the booking paid by itself.
     */
    async reportBankTransfer(req, res) {
        try {
            const appointmentId = parseInt(req.params.appointmentId, 10);
            if (!appointmentId || appointmentId <= 0) {
                return res.status(400).json({
                    success: false,
                    error: { code: 'VALIDATION_ERROR', message: 'Mã lịch hẹn không hợp lệ' }
                });
            }

            const [rows] = await pool.execute(
                'SELECT id, status, payment_status, transfer_reported_at FROM appointments WHERE id = ?',
                [appointmentId]
            );
            if (rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: { code: 'APPOINTMENT_NOT_FOUND', message: 'Không tìm thấy lịch hẹn' }
                });
            }
            const appointment = rows[0];
            if (appointment.status === 'cancelled') {
                return res.status(409).json({
                    success: false,
                    error: { code: 'APPOINTMENT_CANCELLED', message: 'Lịch hẹn đã huỷ' }
                });
            }
            if (appointment.payment_status === 'paid') {
                return res.json({ success: true, already_paid: true, message: 'Lịch hẹn đã được thanh toán' });
            }

            // Keep the first report time; re-pressing the button does not move it
            await pool.execute(
                `UPDATE appointments
                 SET transfer_reported_at = COALESCE(transfer_reported_at, NOW()),
                     payment_method = 'bank_transfer'
                 WHERE id = ? AND payment_status = 'unpaid'`,
                [appointmentId]
            );
            const [[updated]] = await pool.execute(
                'SELECT transfer_reported_at FROM appointments WHERE id = ?',
                [appointmentId]
            );

            res.json({
                success: true,
                message: 'Đã ghi nhận. Thu ngân sẽ kiểm tra tài khoản và xác nhận.',
                transfer_reported_at: updated.transfer_reported_at
            });
        } catch (error) {
            handleError(res, error, 'Report bank transfer', 'Không thể ghi nhận chuyển khoản');
        }
    }

    /**
     * POST /api/payments/webhook/sepay
     * SePay (https://sepay.vn) calls this for every incoming transfer on the linked account.
     * Header: "Authorization: Apikey <SEPAY_API_KEY>". A transfer whose description contains
     * THCT<appointmentId> and whose amount covers the fee marks that booking paid automatically.
     * Always answers 200 for well-formed calls so SePay does not retry ignored transfers.
     */
    async sepayWebhook(req, res) {
        try {
            if (!bank.isWebhookEnabled()) {
                return res.status(404).json({ success: false, error: { code: 'WEBHOOK_DISABLED', message: 'Webhook chưa được bật' } });
            }
            const auth = String(req.get('authorization') || '');
            if (!bank.checkWebhookKey(auth)) {
                return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Sai API key' } });
            }

            const body = req.body || {};
            const transferType = String(body.transferType || '').toLowerCase();
            const amount = Number(body.transferAmount);
            const content = String(body.content || body.description || '');
            const accountNumber = String(body.accountNumber || '');
            const reference = String(body.referenceCode || body.id || '').trim() || null;

            const ignore = (reason) => res.json({ success: true, matched: false, reason });

            if (transferType !== 'in') return ignore('not an incoming transfer');
            if (accountNumber && accountNumber !== bank.BANK.accountNo) return ignore('different account');
            if (!Number.isFinite(amount) || amount <= 0) return ignore('invalid amount');

            const appointmentId = bank.parseTransferContent(content);
            if (!appointmentId) return ignore('no THCT code in description');

            const [rows] = await pool.execute(
                'SELECT id, doctor_id, status, payment_status, consultation_fee FROM appointments WHERE id = ?',
                [appointmentId]
            );
            if (rows.length === 0) return ignore('unknown appointment');
            const appointment = rows[0];
            if (appointment.payment_status === 'paid') return ignore('already paid');
            if (appointment.status === 'cancelled') return ignore('appointment cancelled');

            let fee = Number(appointment.consultation_fee);
            if (!fee || fee <= 0) fee = Number(await paymentService.getConsultationFeeByDoctor(appointment.doctor_id));
            if (amount < fee) return ignore(`amount ${amount} is less than fee ${fee}`);

            const result = await paymentService.processConsultationPayment({
                appointment_id: appointmentId,
                amount,
                payment_method: 'bank_transfer',
                notes: `Tự động xác nhận qua SePay · ref ${reference || 'n/a'} · "${content.slice(0, 120)}"`,
                bank_reference: reference,
                user_id: null,
                ...clientInfo(req)
            });

            res.json({ success: true, matched: true, appointment_id: appointmentId, transaction_id: result.transaction_id });
        } catch (error) {
            // Same bank reference delivered twice, or a race with the cashier: already recorded
            if (error.code === 'ER_DUP_ENTRY' || (error instanceof PaymentError && error.code === 'ALREADY_PAID')) {
                return res.json({ success: true, matched: false, reason: 'already recorded' });
            }
            handleError(res, error, 'SePay webhook', 'Không thể xử lý webhook');
        }
    }

    /**
     * GET /api/payments/consultation-fees
     */
    async getConsultationFees(req, res) {
        try {
            const fees = await paymentService.getAllConsultationFees();
            res.json({ success: true, data: fees });
        } catch (error) {
            handleError(res, error, 'Get consultation fees', 'Không thể tải bảng giá khám');
        }
    }

    /**
     * GET /api/payments/consultation-fees/:departmentId
     */
    async getConsultationFeeByDepartment(req, res) {
        try {
            const feeAmount = await paymentService.getConsultationFee(req.params.departmentId);
            res.json({ success: true, fee_amount: feeAmount });
        } catch (error) {
            handleError(res, error, 'Get consultation fee', 'Không thể lấy giá khám');
        }
    }

    /**
     * PUT /api/payments/consultation-fees/:departmentId
     * Body: { fee_amount: Number, description?: String }
     */
    async updateConsultationFee(req, res) {
        try {
            const { fee_amount, description } = req.body;
            const result = await paymentService.updateConsultationFee({
                departmentId: req.params.departmentId,
                feeAmount: fee_amount,
                description,
                userId: req.user.id,
                ...clientInfo(req)
            });
            res.json({ success: true, message: 'Cập nhật giá khám thành công', data: result });
        } catch (error) {
            handleError(res, error, 'Update consultation fee', 'Không thể cập nhật giá khám');
        }
    }

    /**
     * POST /api/payments/consultation
     * Body: { appointment_id, amount?, payment_method, notes? }
     * Patients may only pay their own appointments; receptionist/admin may pay any.
     */
    async processConsultationPayment(req, res) {
        try {
            const { appointment_id, amount, payment_method, notes } = req.body;

            if (!appointment_id || !payment_method) {
                return res.status(400).json({
                    success: false,
                    error: { code: 'VALIDATION_ERROR', message: 'Thiếu thông tin thanh toán' }
                });
            }
            if (amount !== undefined && amount !== null && Number(amount) <= 0) {
                return res.status(400).json({
                    success: false,
                    error: { code: 'INVALID_AMOUNT', message: 'Số tiền phải lớn hơn 0' }
                });
            }

            // Only the cashier confirms money received (route also enforces this)
            if (!['receptionist', 'admin'].includes(req.user.role)) {
                return res.status(403).json({
                    success: false,
                    error: { code: 'FORBIDDEN', message: 'Chỉ thu ngân mới được xác nhận thanh toán' }
                });
            }

            const result = await paymentService.processConsultationPayment({
                appointment_id,
                amount,
                payment_method,
                notes: notes || null,
                user_id: req.user.id,
                ...clientInfo(req)
            });

            res.json({
                success: true,
                message: 'Thanh toán phí khám thành công',
                transaction_id: result.transaction_id,
                amount: result.amount
            });
        } catch (error) {
            handleError(res, error, 'Process consultation payment', 'Không thể xử lý thanh toán. Vui lòng thử lại sau.');
        }
    }

    /**
     * GET /api/payments/medication/:medicalRecordId
     */
    async getMedicationBill(req, res) {
        try {
            const bill = await paymentService.getMedicationBill(req.params.medicalRecordId);
            res.json({ success: true, data: bill });
        } catch (error) {
            handleError(res, error, 'Get medication bill', 'Không thể tải đơn thuốc');
        }
    }

    /**
     * POST /api/payments/medication
     * Body: {
     *   medical_record_id: Number,
     *   payment_method: String,
     *   items?: [{ prescription_id, unit_price }],   // preferred: total computed server-side
     *   amount?: Number,                             // used when no items are given
     *   notes?: String
     * }
     */
    async processMedicationPayment(req, res) {
        try {
            const { medical_record_id, amount, payment_method, items, notes } = req.body;

            if (!medical_record_id || !payment_method || (!amount && !(Array.isArray(items) && items.length))) {
                return res.status(400).json({
                    success: false,
                    error: { code: 'VALIDATION_ERROR', message: 'Thiếu thông tin thanh toán' }
                });
            }

            const result = await paymentService.processMedicationPayment({
                medical_record_id,
                items,
                amount,
                payment_method,
                notes: notes || null,
                created_by: req.user.id,
                ...clientInfo(req)
            });

            res.json({
                success: true,
                message: 'Thanh toán tiền thuốc thành công',
                transaction_id: result.transaction_id,
                amount: result.amount
            });
        } catch (error) {
            handleError(res, error, 'Process medication payment', 'Không thể xử lý thanh toán. Vui lòng thử lại sau.');
        }
    }

    /**
     * GET /api/payments/cashier/pending?search=&date=YYYY-MM-DD
     */
    async getPendingPayments(req, res) {
        try {
            const data = await paymentService.getPendingPayments({
                search: req.query.search,
                date: req.query.date
            });
            res.json({ success: true, data });
        } catch (error) {
            handleError(res, error, 'Get pending payments', 'Không thể tải danh sách chờ thanh toán');
        }
    }

    /**
     * GET /api/payments/my-history
     */
    async getMyPaymentHistory(req, res) {
        try {
            const payments = await paymentService.getPatientPaymentHistory(req.user.id, {
                limit: req.query.limit,
                offset: req.query.offset
            });
            res.json({ success: true, data: payments, total: payments.length });
        } catch (error) {
            handleError(res, error, 'Get my payment history', 'Không thể tải lịch sử thanh toán');
        }
    }

    /**
     * GET /api/payments/admin/payments
     */
    async getAllTransactions(req, res) {
        try {
            const result = await paymentService.getAllTransactions({
                transaction_type: req.query.transaction_type,
                payment_status: req.query.payment_status,
                payment_method: req.query.payment_method,
                start_date: req.query.start_date,
                end_date: req.query.end_date,
                search: req.query.search,
                page: req.query.page,
                limit: req.query.limit
            });
            res.json(result);
        } catch (error) {
            handleError(res, error, 'Get all transactions', 'Không thể tải danh sách giao dịch');
        }
    }

    /**
     * GET /api/payments/admin/payments/revenue?start_date=&end_date=
     */
    async getRevenueStatistics(req, res) {
        try {
            const stats = await paymentService.getRevenueStatistics({
                start_date: req.query.start_date,
                end_date: req.query.end_date
            });
            res.json(stats);
        } catch (error) {
            handleError(res, error, 'Get revenue statistics', 'Không thể tải thống kê doanh thu');
        }
    }

    /**
     * POST /api/payments/admin/payments/:id/refund
     * Body: { reason?: String }
     */
    async refundTransaction(req, res) {
        try {
            const result = await paymentService.refundTransaction({
                transactionId: req.params.id,
                reason: req.body?.reason,
                userId: req.user.id,
                ...clientInfo(req)
            });
            res.json({ success: true, message: 'Hoàn tiền thành công', ...result });
        } catch (error) {
            handleError(res, error, 'Refund transaction', 'Không thể hoàn tiền giao dịch');
        }
    }
}

module.exports = new PaymentController();
