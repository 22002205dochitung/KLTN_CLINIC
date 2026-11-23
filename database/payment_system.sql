-- ============================================
-- PAYMENT SYSTEM FOR CLINIC
-- ============================================

-- 1. Consultation Fees Table (Bảng giá khám theo chuyên khoa)
CREATE TABLE IF NOT EXISTS consultation_fees (
    id INT PRIMARY KEY AUTO_INCREMENT,
    department_id INT NOT NULL,
    fee_amount DECIMAL(10, 2) NOT NULL COMMENT 'Phí khám (VNĐ)',
    description VARCHAR(255),
    effective_from DATE NOT NULL DEFAULT (CURRENT_DATE),
    effective_to DATE NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Bảng giá khám theo chuyên khoa';

-- 2. Payment Transactions Table
CREATE TABLE IF NOT EXISTS payment_transactions (
    id INT PRIMARY KEY AUTO_INCREMENT,
    transaction_type ENUM('consultation', 'medication', 'other') NOT NULL COMMENT 'Loại thanh toán',
    reference_id INT NOT NULL COMMENT 'ID tham chiếu (appointment_id hoặc medical_record_id)',
    patient_id INT NOT NULL,
    amount DECIMAL(10, 2) NOT NULL COMMENT 'Số tiền',
    payment_method ENUM('cash', 'bank_transfer', 'card', 'momo', 'vnpay') NOT NULL DEFAULT 'cash',
    payment_status ENUM('pending', 'completed', 'failed', 'refunded') NOT NULL DEFAULT 'pending',
    paid_at TIMESTAMP NULL,
    notes TEXT,
    created_by INT NULL COMMENT 'Người tạo giao dịch (receptionist/admin)',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_reference (transaction_type, reference_id),
    INDEX idx_patient (patient_id),
    INDEX idx_status (payment_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Giao dịch thanh toán';

-- 3. Add payment columns to appointments table
ALTER TABLE appointments 
ADD COLUMN consultation_fee DECIMAL(10, 2) NULL COMMENT 'Phí khám' AFTER symptoms,
ADD COLUMN payment_status ENUM('unpaid', 'paid', 'refunded') DEFAULT 'unpaid' COMMENT 'Trạng thái thanh toán phí khám' AFTER consultation_fee,
ADD COLUMN payment_method ENUM('cash', 'bank_transfer', 'card', 'momo', 'vnpay') NULL COMMENT 'Phương thức thanh toán' AFTER payment_status;

-- 4. Add medication payment columns to medical_records table
ALTER TABLE medical_records
ADD COLUMN medication_total DECIMAL(10, 2) DEFAULT 0.00 COMMENT 'Tổng tiền thuốc',
ADD COLUMN medication_payment_status ENUM('unpaid', 'paid', 'partial') DEFAULT 'unpaid' COMMENT 'Trạng thái thanh toán thuốc' AFTER medication_total,
ADD COLUMN medication_payment_method ENUM('cash', 'bank_transfer', 'card', 'momo', 'vnpay') NULL AFTER medication_payment_status,
ADD COLUMN medication_paid_at TIMESTAMP NULL AFTER medication_payment_method;

-- ============================================
-- INSERT DEFAULT CONSULTATION FEES
-- ============================================

-- Giả sử bạn đã có departments với các ID
-- Thêm giá khám cho từng chuyên khoa

INSERT INTO consultation_fees (department_id, fee_amount, description, is_active) VALUES
(1, 150000.00, 'Khám Nội khoa', TRUE),
(2, 200000.00, 'Khám Ngoại khoa', TRUE),
(3, 180000.00, 'Khám Nhi khoa', TRUE),
(4, 250000.00, 'Khám Sản khoa', TRUE),
(5, 200000.00, 'Khám Tai Mũi Họng', TRUE),
(6, 200000.00, 'Khám Mắt', TRUE),
(7, 180000.00, 'Khám Da liễu', TRUE),
(8, 220000.00, 'Khám Răng Hàm Mặt', TRUE);

-- Note: Chạy tiếp database/payment_system_fix.sql để bổ sung đơn giá thuốc và chuẩn hoá bảng giá

-- ============================================
-- CREATE INDEXES FOR PERFORMANCE
-- ============================================

-- Index for faster fee lookup
CREATE INDEX idx_consultation_fees_dept ON consultation_fees(department_id, is_active);

-- Index for payment queries (only create if not exists)
CREATE INDEX idx_appointments_payment ON appointments(payment_status, created_at);
CREATE INDEX idx_medical_payment ON medical_records(medication_payment_status, created_at);

-- ============================================
-- SAMPLE QUERIES
-- ============================================

-- Get consultation fee for a department
-- SELECT fee_amount FROM consultation_fees 
-- WHERE department_id = 1 AND is_active = TRUE 
-- ORDER BY effective_from DESC LIMIT 1;

-- Get all unpaid appointments
-- SELECT * FROM appointments 
-- WHERE payment_status = 'unpaid' 
-- ORDER BY appointment_date DESC;

-- Get payment history for a patient
-- SELECT * FROM payment_transactions 
-- WHERE patient_id = 1 
-- ORDER BY created_at DESC;

-- Get total revenue by payment method
-- SELECT payment_method, SUM(amount) as total
-- FROM payment_transactions
-- WHERE payment_status = 'completed'
-- GROUP BY payment_method;
