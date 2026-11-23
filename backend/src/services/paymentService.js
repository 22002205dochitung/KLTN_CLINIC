const db = require('../config/database');
const AuditLogService = require('./auditLogService');

/**
 * Payment Service
 * Handles all payment-related business logic
 *
 * Features:
 * - Consultation fees by department (read + admin management)
 * - Consultation payments (online at booking, or at the cashier desk)
 * - Medication payments (cashier, priced per prescription item)
 * - Refunds
 * - Payment history, transaction listing and revenue reports
 */

const PAYMENT_METHODS = ['cash', 'bank_transfer', 'card', 'momo', 'vnpay'];
const DEFAULT_CONSULTATION_FEE = 150000;

/**
 * Business error carrying an HTTP status and machine-readable code,
 * so the controller can map it to a proper response.
 */
class PaymentError extends Error {
    constructor(code, message, status = 400) {
        super(message);
        this.name = 'PaymentError';
        this.code = code;
        this.status = status;
    }
}

const toInt = (value, fallback) => {
    const n = parseInt(value, 10);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
};

const assertPaymentMethod = (method) => {
    if (!PAYMENT_METHODS.includes(method)) {
        throw new PaymentError('INVALID_PAYMENT_METHOD', 'Phương thức thanh toán không hợp lệ');
    }
};

const audit = (userId, eventType, ipAddress, userAgent, details = null) =>
    AuditLogService.logActivity({
        userId: userId || null,
        eventType,
        eventDetails: details,
        ipAddress: ipAddress || 'system',
        userAgent: userAgent || 'payment-service'
    });

class PaymentService {
    // ===================== CONSULTATION FEES =====================

    /**
     * Get consultation fee for a department
     * @param {Number} departmentId
     * @returns {Promise<Number>} Fee amount (falls back to default fee)
     */
    async getConsultationFee(departmentId) {
        const [rows] = await db.pool.execute(
            `SELECT fee_amount
             FROM consultation_fees
             WHERE department_id = ?
               AND is_active = TRUE
               AND (effective_to IS NULL OR effective_to >= CURDATE())
             ORDER BY effective_from DESC, id DESC
             LIMIT 1`,
            [departmentId]
        );

        if (rows.length === 0) {
            return DEFAULT_CONSULTATION_FEE;
        }
        return parseFloat(rows[0].fee_amount);
    }

    /**
     * Get the consultation fee for a doctor (via their department)
     */
    async getConsultationFeeByDoctor(doctorId) {
        const [rows] = await db.pool.execute(
            'SELECT department_id FROM doctors WHERE id = ?',
            [doctorId]
        );
        if (rows.length === 0 || !rows[0].department_id) {
            return DEFAULT_CONSULTATION_FEE;
        }
        return this.getConsultationFee(rows[0].department_id);
    }

    /**
     * Get the current fee of every department.
     * Departments without a configured fee are returned with the default fee
     * and `is_default = 1`, so admins can see and fix them.
     */
    async getAllConsultationFees() {
        const [rows] = await db.pool.execute(
            `SELECT
                d.id AS department_id,
                d.name AS department_name,
                cf.id,
                COALESCE(cf.fee_amount, ?) AS fee_amount,
                cf.description,
                cf.effective_from,
                cf.effective_to,
                cf.updated_at,
                CASE WHEN cf.id IS NULL THEN 1 ELSE 0 END AS is_default
             FROM departments d
             LEFT JOIN consultation_fees cf ON cf.id = (
                SELECT cf2.id FROM consultation_fees cf2
                WHERE cf2.department_id = d.id
                  AND cf2.is_active = TRUE
                  AND (cf2.effective_to IS NULL OR cf2.effective_to >= CURDATE())
                ORDER BY cf2.effective_from DESC, cf2.id DESC
                LIMIT 1
             )
             ORDER BY d.id`,
            [DEFAULT_CONSULTATION_FEE]
        );

        return rows.map(r => ({ ...r, fee_amount: parseFloat(r.fee_amount), is_active: true }));
    }

    /**
     * Set a new consultation fee for a department (admin).
     * The previous fee is closed (effective_to = yesterday, is_active = false)
     * so the price history is preserved.
     */
    async updateConsultationFee({ departmentId, feeAmount, description = null, userId = null, ipAddress, userAgent }) {
        const fee = Number(feeAmount);
        if (!Number.isFinite(fee) || fee <= 0 || fee > 100000000) {
            throw new PaymentError('INVALID_AMOUNT', 'Giá khám phải là số dương hợp lệ');
        }

        const connection = await db.pool.getConnection();
        try {
            await connection.beginTransaction();

            const [dept] = await connection.execute('SELECT id, name FROM departments WHERE id = ?', [departmentId]);
            if (dept.length === 0) {
                throw new PaymentError('DEPARTMENT_NOT_FOUND', 'Không tìm thấy chuyên khoa', 404);
            }

            await connection.execute(
                `UPDATE consultation_fees
                 SET is_active = FALSE, effective_to = DATE_SUB(CURDATE(), INTERVAL 1 DAY)
                 WHERE department_id = ? AND is_active = TRUE`,
                [departmentId]
            );

            const [result] = await connection.execute(
                `INSERT INTO consultation_fees (department_id, fee_amount, description, effective_from, is_active)
                 VALUES (?, ?, ?, CURDATE(), TRUE)`,
                [departmentId, fee, description || `Phí khám ${dept[0].name}`]
            );

            await connection.commit();
            audit(userId, 'consultation_fee_update', ipAddress, userAgent, { departmentId: Number(departmentId), feeAmount: fee });

            return { id: result.insertId, department_id: Number(departmentId), fee_amount: fee };
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    // ===================== TRANSACTIONS =====================

    /**
     * Create a payment transaction (generic)
     */
    async createTransaction(paymentData) {
        const {
            transaction_type,
            reference_id,
            patient_id,
            amount,
            payment_method,
            payment_status = 'completed',
            notes = null,
            created_by = null
        } = paymentData;

        if (!transaction_type || !reference_id || !patient_id || !amount) {
            throw new PaymentError('VALIDATION_ERROR', 'Thiếu thông tin giao dịch');
        }
        if (amount <= 0) {
            throw new PaymentError('INVALID_AMOUNT', 'Số tiền phải lớn hơn 0');
        }
        assertPaymentMethod(payment_method);

        const paid_at = payment_status === 'completed' ? new Date() : null;

        const [result] = await db.pool.execute(
            `INSERT INTO payment_transactions
             (transaction_type, reference_id, patient_id, amount,
              payment_method, payment_status, paid_at, notes, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [transaction_type, reference_id, patient_id, amount,
             payment_method, payment_status, paid_at, notes, created_by]
        );

        const [transaction] = await db.pool.execute(
            'SELECT * FROM payment_transactions WHERE id = ?',
            [result.insertId]
        );
        return transaction[0];
    }

    /**
     * Process consultation payment (online at booking or at the cashier desk).
     * Rejects double payment and cancelled appointments.
     */
    async processConsultationPayment(paymentInfo) {
        const {
            appointment_id,
            amount,
            payment_method,
            user_id = null,
            notes = null,
            bank_reference = null, // set by the bank webhook; unique per transfer
            ipAddress,
            userAgent
        } = paymentInfo;

        assertPaymentMethod(payment_method);

        const connection = await db.pool.getConnection();
        try {
            await connection.beginTransaction();

            const [rows] = await connection.execute(
                `SELECT a.id, a.patient_id, a.doctor_id, a.status, a.payment_status, a.consultation_fee
                 FROM appointments a WHERE a.id = ? FOR UPDATE`,
                [appointment_id]
            );
            if (rows.length === 0) {
                throw new PaymentError('APPOINTMENT_NOT_FOUND', 'Không tìm thấy lịch hẹn', 404);
            }
            const appointment = rows[0];

            if (appointment.status === 'cancelled') {
                throw new PaymentError('APPOINTMENT_CANCELLED', 'Lịch hẹn đã bị hủy, không thể thanh toán', 409);
            }
            if (appointment.payment_status === 'paid') {
                throw new PaymentError('ALREADY_PAID', 'Lịch hẹn này đã được thanh toán', 409);
            }

            // Amount: explicit > stored fee > department fee
            let finalAmount = Number(amount);
            if (!Number.isFinite(finalAmount) || finalAmount <= 0) {
                finalAmount = appointment.consultation_fee
                    ? parseFloat(appointment.consultation_fee)
                    : await this.getConsultationFeeByDoctor(appointment.doctor_id);
            }

            await connection.execute(
                `UPDATE appointments
                 SET consultation_fee = ?, payment_status = 'paid', payment_method = ?
                 WHERE id = ?`,
                [finalAmount, payment_method, appointment_id]
            );

            const [transactionResult] = await connection.execute(
                `INSERT INTO payment_transactions
                 (transaction_type, reference_id, patient_id, amount,
                  payment_method, payment_status, paid_at, notes, created_by, bank_reference)
                 VALUES ('consultation', ?, ?, ?, ?, 'completed', NOW(), ?, ?, ?)`,
                [appointment_id, appointment.patient_id, finalAmount, payment_method, notes, user_id, bank_reference]
            );

            await connection.commit();
            audit(user_id, 'consultation_payment', ipAddress, userAgent, { appointmentId: Number(appointment_id), amount: finalAmount, paymentMethod: payment_method, transactionId: transactionResult.insertId });

            return {
                success: true,
                transaction_id: transactionResult.insertId,
                patient_id: appointment.patient_id,
                amount: finalAmount
            };
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    /**
     * Get the medication bill of a medical record:
     * record + patient/doctor info + prescription items with unit prices.
     */
    async getMedicationBill(medicalRecordId) {
        const [records] = await db.pool.execute(
            `SELECT
                mr.id, mr.appointment_id, mr.diagnosis, mr.created_at,
                mr.medication_total, mr.medication_payment_status,
                mr.medication_payment_method, mr.medication_paid_at,
                a.patient_id, a.appointment_date, a.time_slot,
                p.fullname AS patient_name, p.phone AS patient_phone,
                du.fullname AS doctor_name, dep.name AS department_name
             FROM medical_records mr
             JOIN appointments a ON mr.appointment_id = a.id
             LEFT JOIN users p ON a.patient_id = p.id
             LEFT JOIN doctors doc ON a.doctor_id = doc.id
             LEFT JOIN users du ON doc.user_id = du.id
             LEFT JOIN departments dep ON doc.department_id = dep.id
             WHERE mr.id = ?`,
            [medicalRecordId]
        );
        if (records.length === 0) {
            throw new PaymentError('RECORD_NOT_FOUND', 'Không tìm thấy hồ sơ khám', 404);
        }

        const [items] = await db.pool.execute(
            `SELECT pr.id, pr.medicine_id, pr.medicine_name, pr.dosage, pr.quantity, pr.unit,
                    pr.instructions, pr.unit_price, pr.dispensed_quantity,
                    m.price AS catalogue_price, m.stock AS stock, m.unit AS catalogue_unit
             FROM prescriptions pr
             LEFT JOIN medicines m ON m.id = pr.medicine_id
             WHERE pr.medical_record_id = ? ORDER BY pr.id`,
            [medicalRecordId]
        );

        const record = records[0];
        const normalizedItems = items.map(i => {
            // price written on the prescription (snapshot), else today's catalogue price
            const price = i.unit_price !== null ? parseFloat(i.unit_price)
                : i.catalogue_price !== null && i.catalogue_price !== undefined ? parseFloat(i.catalogue_price) : null;
            const inCatalogue = i.medicine_id !== null && i.medicine_id !== undefined;
            return {
                id: i.id,
                medicine_id: i.medicine_id,
                medicine_name: i.medicine_name,
                dosage: i.dosage,
                quantity: i.quantity,
                unit: i.unit || i.catalogue_unit || null,
                instructions: i.instructions,
                unit_price: price,
                dispensed_quantity: i.dispensed_quantity,
                in_catalogue: inCatalogue,
                stock: inCatalogue && i.stock !== null ? Number(i.stock) : null,
                enough_stock: inCatalogue && i.stock !== null ? Number(i.stock) >= i.quantity : null,
                line_total: price === null ? 0 : price * i.quantity
            };
        });

        return {
            ...record,
            medication_total: parseFloat(record.medication_total || 0),
            items: normalizedItems,
            computed_total: normalizedItems.reduce((sum, i) => sum + i.line_total, 0)
        };
    }

    /**
     * Process medication payment at the cashier desk.
     * If `items` ([{ prescription_id, unit_price }]) are given, unit prices are saved
     * and the total is computed server-side; otherwise `amount` is used.
     */
    async processMedicationPayment(paymentInfo) {
        const {
            medical_record_id,
            items = null,
            amount = null,
            payment_method,
            created_by,
            notes = null,
            ipAddress,
            userAgent
        } = paymentInfo;

        assertPaymentMethod(payment_method);

        const connection = await db.pool.getConnection();
        try {
            await connection.beginTransaction();

            const [records] = await connection.execute(
                `SELECT mr.id, mr.medication_payment_status, a.patient_id
                 FROM medical_records mr
                 JOIN appointments a ON mr.appointment_id = a.id
                 WHERE mr.id = ? FOR UPDATE`,
                [medical_record_id]
            );
            if (records.length === 0) {
                throw new PaymentError('RECORD_NOT_FOUND', 'Không tìm thấy hồ sơ khám', 404);
            }
            const record = records[0];
            if (record.medication_payment_status === 'paid') {
                throw new PaymentError('ALREADY_PAID', 'Đơn thuốc này đã được thanh toán', 409);
            }

            const [lines] = await connection.execute(
                `SELECT id, medicine_id, medicine_name, quantity, unit, unit_price
                 FROM prescriptions WHERE medical_record_id = ? ORDER BY id`,
                [medical_record_id]
            );
            if (lines.length === 0) {
                throw new PaymentError('NO_ITEMS', 'Hồ sơ này không có đơn thuốc');
            }
            const byId = new Map(lines.map(l => [l.id, l]));
            const given = new Map();
            if (Array.isArray(items)) {
                for (const item of items) {
                    const id = Number(item.prescription_id);
                    if (!byId.has(id)) {
                        throw new PaymentError('INVALID_ITEM', 'Thuốc không thuộc đơn này');
                    }
                    given.set(id, item);
                }
            }

            // Lines the patient takes (skip = buys elsewhere / does not want it)
            const taken = [];
            for (const line of lines) {
                const item = given.get(line.id);
                if (item && item.skip) continue;
                let price = item && item.unit_price !== undefined && item.unit_price !== null && item.unit_price !== ''
                    ? Number(item.unit_price)
                    : (line.unit_price === null ? null : Number(line.unit_price));
                if (price === null && line.medicine_id) {
                    const [[med]] = await connection.execute('SELECT price FROM medicines WHERE id = ?', [line.medicine_id]);
                    price = med ? Number(med.price) : null;
                }
                if (price === null && given.size === 0 && amount) {
                    price = 0; // legacy call with a single total amount
                }
                if (price === null || !Number.isFinite(price) || price < 0) {
                    throw new PaymentError('INVALID_AMOUNT', `Chưa có đơn giá hợp lệ cho "${line.medicine_name}"`);
                }
                taken.push({ ...line, price });
            }
            if (taken.length === 0) {
                throw new PaymentError('NO_ITEMS', 'Bệnh nhân không lấy thuốc nào – không có gì để thu');
            }

            // Stock: lock catalogue rows in id order (no deadlocks), check everything, then deduct
            const need = new Map();
            taken.filter(l => l.medicine_id).forEach(l => need.set(l.medicine_id, (need.get(l.medicine_id) || 0) + l.quantity));
            const medIds = [...need.keys()].sort((a, b) => a - b);
            const stockRows = new Map();
            for (const id of medIds) {
                const [[med]] = await connection.execute('SELECT id, name, unit, stock FROM medicines WHERE id = ? FOR UPDATE', [id]);
                if (med) stockRows.set(id, med);
            }
            const short = medIds
                .filter(id => stockRows.has(id) && Number(stockRows.get(id).stock) < need.get(id))
                .map(id => {
                    const med = stockRows.get(id);
                    return `${med.name} (cần ${need.get(id)}, kho còn ${med.stock} ${med.unit})`;
                });
            if (short.length > 0) {
                throw new PaymentError('OUT_OF_STOCK', `Không đủ thuốc trong kho: ${short.join('; ')}. Bỏ chọn thuốc đó (bệnh nhân mua ngoài) hoặc nhập thêm kho.`, 409);
            }
            for (const id of medIds) {
                const med = stockRows.get(id);
                if (!med) continue;
                const after = Number(med.stock) - need.get(id);
                await connection.execute('UPDATE medicines SET stock = ? WHERE id = ?', [after, id]);
                await connection.execute(
                    `INSERT INTO stock_movements (medicine_id, quantity_change, stock_after, reason, medical_record_id, note, created_by)
                     VALUES (?, ?, ?, 'dispense', ?, ?, ?)`,
                    [id, -need.get(id), after, medical_record_id, `Xuất bán – hồ sơ #${medical_record_id}`, created_by]
                );
            }

            // Save prices and what was actually handed over
            const takenIds = new Set(taken.map(l => l.id));
            for (const line of lines) {
                const t = taken.find(x => x.id === line.id);
                await connection.execute(
                    'UPDATE prescriptions SET unit_price = COALESCE(?, unit_price), dispensed_quantity = ? WHERE id = ?',
                    [t ? t.price : null, takenIds.has(line.id) ? line.quantity : 0, line.id]
                );
            }

            let total = taken.reduce((sum, l) => sum + l.price * l.quantity, 0);
            if (given.size === 0 && amount && total === 0) {
                total = Number(amount);
            }

            if (!Number.isFinite(total) || total <= 0) {
                throw new PaymentError('INVALID_AMOUNT', 'Tổng tiền thuốc phải lớn hơn 0');
            }

            await connection.execute(
                `UPDATE medical_records
                 SET medication_total = ?,
                     medication_payment_status = 'paid',
                     medication_payment_method = ?,
                     medication_paid_at = NOW()
                 WHERE id = ?`,
                [total, payment_method, medical_record_id]
            );

            const [transactionResult] = await connection.execute(
                `INSERT INTO payment_transactions
                 (transaction_type, reference_id, patient_id, amount,
                  payment_method, payment_status, paid_at, notes, created_by)
                 VALUES ('medication', ?, ?, ?, ?, 'completed', NOW(), ?, ?)`,
                [medical_record_id, record.patient_id, total, payment_method, notes, created_by]
            );

            await connection.commit();
            audit(created_by, 'medication_payment', ipAddress, userAgent, { medicalRecordId: Number(medical_record_id), amount: total, paymentMethod: payment_method, transactionId: transactionResult.insertId });

            return {
                success: true,
                transaction_id: transactionResult.insertId,
                patient_id: record.patient_id,
                amount: total
            };
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    /**
     * Refund a completed transaction (admin).
     * Also resets the payment status of the related appointment / medical record.
     */
    async refundTransaction({ transactionId, reason = null, userId = null, ipAddress, userAgent }) {
        const connection = await db.pool.getConnection();
        try {
            await connection.beginTransaction();

            const [rows] = await connection.execute(
                'SELECT * FROM payment_transactions WHERE id = ? FOR UPDATE',
                [transactionId]
            );
            if (rows.length === 0) {
                throw new PaymentError('TRANSACTION_NOT_FOUND', 'Không tìm thấy giao dịch', 404);
            }
            const tx = rows[0];
            if (tx.payment_status !== 'completed') {
                throw new PaymentError('INVALID_STATE', 'Chỉ có thể hoàn tiền giao dịch đã thanh toán', 409);
            }

            const note = [tx.notes, `Hoàn tiền${reason ? ': ' + reason : ''}`].filter(Boolean).join(' | ');
            await connection.execute(
                `UPDATE payment_transactions SET payment_status = 'refunded', notes = ? WHERE id = ?`,
                [note, transactionId]
            );

            if (tx.transaction_type === 'consultation') {
                await connection.execute(
                    `UPDATE appointments SET payment_status = 'refunded' WHERE id = ?`,
                    [tx.reference_id]
                );
            } else if (tx.transaction_type === 'medication') {
                await connection.execute(
                    `UPDATE medical_records SET medication_payment_status = 'refunded' WHERE id = ?`,
                    [tx.reference_id]
                );
                // medicines handed back -> return them to stock
                const [given] = await connection.execute(
                    `SELECT medicine_id, SUM(dispensed_quantity) AS qty
                     FROM prescriptions
                     WHERE medical_record_id = ? AND medicine_id IS NOT NULL AND dispensed_quantity > 0
                     GROUP BY medicine_id ORDER BY medicine_id`,
                    [tx.reference_id]
                );
                for (const g of given) {
                    const [[med]] = await connection.execute('SELECT stock FROM medicines WHERE id = ? FOR UPDATE', [g.medicine_id]);
                    if (!med) continue;
                    const after = Number(med.stock) + Number(g.qty);
                    await connection.execute('UPDATE medicines SET stock = ? WHERE id = ?', [after, g.medicine_id]);
                    await connection.execute(
                        `INSERT INTO stock_movements (medicine_id, quantity_change, stock_after, reason, medical_record_id, note, created_by)
                         VALUES (?, ?, ?, 'return', ?, ?, ?)`,
                        [g.medicine_id, Number(g.qty), after, tx.reference_id, `Hoàn tiền – nhập lại kho (hồ sơ #${tx.reference_id})`, userId]
                    );
                }
                await connection.execute(
                    'UPDATE prescriptions SET dispensed_quantity = 0 WHERE medical_record_id = ?',
                    [tx.reference_id]
                );
            }

            await connection.commit();
            audit(userId, 'payment_refund', ipAddress, userAgent, { transactionId: tx.id, amount: parseFloat(tx.amount), reason });

            return { success: true, transaction_id: tx.id, amount: parseFloat(tx.amount) };
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    // ===================== CASHIER =====================

    /**
     * Pending payments for the cashier desk:
     * - consultations: unpaid, non-cancelled appointments
     * - medications: medical records with prescriptions not yet paid
     * @param {Object} filters - { search, date }
     */
    async getPendingPayments(filters = {}) {
        const { search, date } = filters;
        const like = search ? `%${search.trim()}%` : null;

        // ---- Consultations ----
        let consultationWhere = `WHERE a.status <> 'cancelled' AND a.payment_status = 'unpaid'`;
        const consultationParams = [];
        if (date) {
            consultationWhere += ' AND a.appointment_date = ?';
            consultationParams.push(date);
        }
        if (like) {
            consultationWhere += ' AND (p.fullname LIKE ? OR p.phone LIKE ? OR a.id = ?)';
            consultationParams.push(like, like, toInt(search, 0));
        }

        const [consultations] = await db.pool.execute(
            `SELECT
                a.id AS appointment_id, a.appointment_date, a.time_slot, a.status,
                a.consultation_fee, a.patient_id, a.payment_method, a.transfer_reported_at,
                CONCAT('THCT', a.id) AS transfer_content,
                p.fullname AS patient_name, p.phone AS patient_phone,
                du.fullname AS doctor_name,
                dep.id AS department_id, dep.name AS department_name
             FROM appointments a
             LEFT JOIN users p ON a.patient_id = p.id
             LEFT JOIN doctors doc ON a.doctor_id = doc.id
             LEFT JOIN users du ON doc.user_id = du.id
             LEFT JOIN departments dep ON doc.department_id = dep.id
             ${consultationWhere}
             ORDER BY (a.transfer_reported_at IS NULL) ASC, a.transfer_reported_at ASC,
                      a.appointment_date ASC, a.time_slot ASC
             LIMIT 200`,
            consultationParams
        );

        // Fill in the fee for appointments booked without one
        const feeCache = new Map();
        for (const c of consultations) {
            if (c.consultation_fee && parseFloat(c.consultation_fee) > 0) {
                c.consultation_fee = parseFloat(c.consultation_fee);
                continue;
            }
            const key = c.department_id || 0;
            if (!feeCache.has(key)) {
                feeCache.set(key, c.department_id
                    ? await this.getConsultationFee(c.department_id)
                    : DEFAULT_CONSULTATION_FEE);
            }
            c.consultation_fee = feeCache.get(key);
        }

        // ---- Medications ----
        let medicationWhere = `WHERE mr.medication_payment_status IN ('unpaid', 'partial')`;
        const medicationParams = [];
        if (date) {
            medicationWhere += ' AND DATE(mr.created_at) = ?';
            medicationParams.push(date);
        }
        if (like) {
            medicationWhere += ' AND (p.fullname LIKE ? OR p.phone LIKE ? OR mr.id = ?)';
            medicationParams.push(like, like, toInt(search, 0));
        }

        const [medications] = await db.pool.execute(
            `SELECT
                mr.id AS medical_record_id, mr.appointment_id, mr.diagnosis, mr.created_at,
                mr.medication_payment_status, a.patient_id,
                p.fullname AS patient_name, p.phone AS patient_phone,
                du.fullname AS doctor_name, dep.name AS department_name,
                COUNT(pr.id) AS item_count,
                SUM(COALESCE(pr.unit_price, 0) * pr.quantity) AS estimated_total,
                SUM(pr.unit_price IS NULL) AS unpriced_items
             FROM medical_records mr
             JOIN appointments a ON mr.appointment_id = a.id
             JOIN prescriptions pr ON pr.medical_record_id = mr.id
             LEFT JOIN users p ON a.patient_id = p.id
             LEFT JOIN doctors doc ON a.doctor_id = doc.id
             LEFT JOIN users du ON doc.user_id = du.id
             LEFT JOIN departments dep ON doc.department_id = dep.id
             ${medicationWhere}
             GROUP BY mr.id
             ORDER BY mr.created_at DESC
             LIMIT 200`,
            medicationParams
        );

        return {
            consultations,
            medications: medications.map(m => ({
                ...m,
                item_count: Number(m.item_count),
                unpriced_items: Number(m.unpriced_items || 0),
                estimated_total: parseFloat(m.estimated_total || 0)
            }))
        };
    }

    // ===================== HISTORY & REPORTS =====================

    /**
     * Payment history for a patient
     */
    async getPatientPaymentHistory(patientId, options = {}) {
        const limit = Math.min(toInt(options.limit, 50), 200);
        const offset = toInt(options.offset, 0);

        const [rows] = await db.pool.execute(
            `SELECT
                pt.*,
                COALESCE(a.appointment_date, DATE(mr.created_at)) AS service_date,
                d.name AS department_name,
                du.fullname AS doctor_name
             FROM payment_transactions pt
             LEFT JOIN medical_records mr
                ON pt.transaction_type = 'medication' AND pt.reference_id = mr.id
             LEFT JOIN appointments a ON a.id = CASE
                    WHEN pt.transaction_type = 'consultation' THEN pt.reference_id
                    WHEN pt.transaction_type = 'medication' THEN mr.appointment_id
                END
             LEFT JOIN doctors doc ON a.doctor_id = doc.id
             LEFT JOIN users du ON doc.user_id = du.id
             LEFT JOIN departments d ON doc.department_id = d.id
             WHERE pt.patient_id = ?
             ORDER BY pt.created_at DESC
             LIMIT ${limit} OFFSET ${offset}`,
            [patientId]
        );

        return rows;
    }

    /**
     * All transactions with filters and pagination (admin/receptionist)
     */
    async getAllTransactions(filters = {}) {
        const { transaction_type, payment_status, payment_method, start_date, end_date, search } = filters;
        const page = Math.max(toInt(filters.page, 1), 1);
        const limit = Math.min(Math.max(toInt(filters.limit, 20), 1), 200);

        let whereClause = 'WHERE 1=1';
        const params = [];

        if (transaction_type) {
            whereClause += ' AND pt.transaction_type = ?';
            params.push(transaction_type);
        }
        if (payment_status) {
            whereClause += ' AND pt.payment_status = ?';
            params.push(payment_status);
        }
        if (payment_method) {
            whereClause += ' AND pt.payment_method = ?';
            params.push(payment_method);
        }
        if (start_date) {
            whereClause += ' AND DATE(pt.created_at) >= ?';
            params.push(start_date);
        }
        if (end_date) {
            whereClause += ' AND DATE(pt.created_at) <= ?';
            params.push(end_date);
        }
        if (search && search.trim()) {
            const like = `%${search.trim()}%`;
            whereClause += ' AND (u.fullname LIKE ? OR u.phone LIKE ? OR pt.id = ?)';
            params.push(like, like, toInt(search, 0));
        }

        const [countResult] = await db.pool.execute(
            `SELECT COUNT(*) AS total, COALESCE(SUM(pt.amount), 0) AS total_amount
             FROM payment_transactions pt
             LEFT JOIN users u ON pt.patient_id = u.id
             ${whereClause}`,
            params
        );

        const total = Number(countResult[0].total);
        const offset = (page - 1) * limit;

        const [rows] = await db.pool.execute(
            `SELECT
                pt.*,
                u.fullname AS patient_name,
                u.phone AS patient_phone,
                cb.fullname AS created_by_name,
                cb.role AS created_by_role
             FROM payment_transactions pt
             LEFT JOIN users u ON pt.patient_id = u.id
             LEFT JOIN users cb ON pt.created_by = cb.id
             ${whereClause}
             ORDER BY pt.created_at DESC, pt.id DESC
             LIMIT ${limit} OFFSET ${offset}`,
            params
        );

        return {
            success: true,
            data: rows.map(r => ({ ...r, amount: parseFloat(r.amount) })),
            summary: { total_amount: parseFloat(countResult[0].total_amount) },
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.max(Math.ceil(total / limit), 1)
            }
        };
    }

    /**
     * Revenue statistics (completed transactions only)
     * @param {Object} filters - { start_date, end_date }
     */
    async getRevenueStatistics(filters = {}) {
        const { start_date, end_date } = filters;

        let whereClause = "WHERE pt.payment_status = 'completed'";
        const params = [];
        if (start_date) {
            whereClause += ' AND DATE(pt.paid_at) >= ?';
            params.push(start_date);
        }
        if (end_date) {
            whereClause += ' AND DATE(pt.paid_at) <= ?';
            params.push(end_date);
        }

        const [[totals]] = await db.pool.execute(
            `SELECT COALESCE(SUM(pt.amount), 0) AS revenue, COUNT(*) AS transactions
             FROM payment_transactions pt ${whereClause}`,
            params
        );

        const [byType] = await db.pool.execute(
            `SELECT pt.transaction_type, SUM(pt.amount) AS revenue, COUNT(*) AS count
             FROM payment_transactions pt ${whereClause}
             GROUP BY pt.transaction_type`,
            params
        );

        const [byMethod] = await db.pool.execute(
            `SELECT pt.payment_method, SUM(pt.amount) AS revenue, COUNT(*) AS count
             FROM payment_transactions pt ${whereClause}
             GROUP BY pt.payment_method
             ORDER BY revenue DESC`,
            params
        );

        const [byDay] = await db.pool.execute(
            `SELECT DATE_FORMAT(pt.paid_at, '%Y-%m-%d') AS date,
                    SUM(CASE WHEN pt.transaction_type = 'consultation' THEN pt.amount ELSE 0 END) AS consultation,
                    SUM(CASE WHEN pt.transaction_type = 'medication' THEN pt.amount ELSE 0 END) AS medication,
                    SUM(pt.amount) AS revenue,
                    COUNT(*) AS count
             FROM payment_transactions pt ${whereClause}
             GROUP BY DATE(pt.paid_at)
             ORDER BY date ASC`,
            params
        );

        const [byDepartment] = await db.pool.execute(
            `SELECT COALESCE(d.name, 'Khác') AS department_name, SUM(pt.amount) AS revenue, COUNT(*) AS count
             FROM payment_transactions pt
             LEFT JOIN medical_records mr
                ON pt.transaction_type = 'medication' AND pt.reference_id = mr.id
             LEFT JOIN appointments a ON a.id = CASE
                    WHEN pt.transaction_type = 'consultation' THEN pt.reference_id
                    WHEN pt.transaction_type = 'medication' THEN mr.appointment_id
                END
             LEFT JOIN doctors doc ON a.doctor_id = doc.id
             LEFT JOIN departments d ON doc.department_id = d.id
             ${whereClause}
             GROUP BY d.id, d.name
             ORDER BY revenue DESC`,
            params
        );

        const [[refunds]] = await db.pool.execute(
            `SELECT COALESCE(SUM(amount), 0) AS amount, COUNT(*) AS count
             FROM payment_transactions WHERE payment_status = 'refunded'
             ${start_date ? 'AND DATE(updated_at) >= ?' : ''}
             ${end_date ? 'AND DATE(updated_at) <= ?' : ''}`,
            params
        );

        const num = rows => rows.map(r => ({
            ...r,
            revenue: parseFloat(r.revenue || 0),
            count: Number(r.count),
            ...(r.consultation !== undefined && {
                consultation: parseFloat(r.consultation || 0),
                medication: parseFloat(r.medication || 0)
            })
        }));

        return {
            success: true,
            total: {
                revenue: parseFloat(totals.revenue),
                transactions: Number(totals.transactions)
            },
            refunds: {
                amount: parseFloat(refunds.amount),
                count: Number(refunds.count)
            },
            by_type: num(byType),
            by_method: num(byMethod),
            by_day: num(byDay),
            by_department: num(byDepartment)
        };
    }
}

const paymentService = new PaymentService();
paymentService.PaymentError = PaymentError;
paymentService.PAYMENT_METHODS = PAYMENT_METHODS;

module.exports = paymentService;
