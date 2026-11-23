-- ============================================
-- PAYMENT SYSTEM - FIX / PHASE 2 MIGRATION
-- An toàn khi chạy nhiều lần (idempotent, MariaDB 10.0+)
--
-- Sửa lỗi của payment_system.sql:
--  * medical_records không có cột `prescription` nên ALTER ... AFTER prescription bị lỗi
--    => các cột medication_* chưa được tạo
--  * consultation_fees chưa có dữ liệu / mô tả lệch với tên khoa
-- Bổ sung:
--  * prescriptions.unit_price để tính tiền thuốc theo từng loại
-- ============================================

-- 1. Cột thanh toán tiền thuốc cho medical_records
ALTER TABLE medical_records
    ADD COLUMN IF NOT EXISTS medication_total DECIMAL(10, 2) NOT NULL DEFAULT 0.00 COMMENT 'Tổng tiền thuốc',
    ADD COLUMN IF NOT EXISTS medication_payment_status ENUM('unpaid', 'paid', 'partial', 'refunded') NOT NULL DEFAULT 'unpaid' COMMENT 'Trạng thái thanh toán thuốc',
    ADD COLUMN IF NOT EXISTS medication_payment_method ENUM('cash', 'bank_transfer', 'card', 'momo', 'vnpay') NULL,
    ADD COLUMN IF NOT EXISTS medication_paid_at TIMESTAMP NULL DEFAULT NULL;

-- 2. Đơn giá thuốc
ALTER TABLE prescriptions
    ADD COLUMN IF NOT EXISTS unit_price DECIMAL(10, 2) NULL DEFAULT NULL COMMENT 'Đơn giá (VNĐ)';

-- 3. Cho phép trạng thái hoàn tiền trên appointments (đã có sẵn 'refunded')
ALTER TABLE appointments
    MODIFY COLUMN payment_status ENUM('unpaid', 'paid', 'refunded') NOT NULL DEFAULT 'unpaid';

-- 4. Bảng giá khám: mỗi khoa một dòng đang hoạt động
INSERT INTO consultation_fees (department_id, fee_amount, description, is_active)
SELECT d.id, f.fee, CONCAT('Phí khám ', d.name), TRUE
FROM departments d
JOIN (
    SELECT 1 AS dept_id, 150000.00 AS fee UNION ALL  -- Nội Tổng Quát
    SELECT 2, 250000.00 UNION ALL                     -- Tim Mạch
    SELECT 3, 200000.00 UNION ALL                     -- Ngoại Tổng Quát
    SELECT 4, 220000.00 UNION ALL                     -- Sản - Phụ Khoa
    SELECT 5, 180000.00 UNION ALL                     -- Nhi
    SELECT 6, 180000.00 UNION ALL                     -- Da Liễu
    SELECT 7, 200000.00 UNION ALL                     -- Mắt
    SELECT 8, 200000.00                               -- Tai - Mũi - Họng
) f ON f.dept_id = d.id
WHERE NOT EXISTS (
    SELECT 1 FROM consultation_fees cf WHERE cf.department_id = d.id AND cf.is_active = TRUE
);

-- 5. Index
CREATE INDEX IF NOT EXISTS idx_consultation_fees_dept ON consultation_fees(department_id, is_active);
CREATE INDEX IF NOT EXISTS idx_appointments_payment ON appointments(payment_status, created_at);
CREATE INDEX IF NOT EXISTS idx_medical_payment ON medical_records(medication_payment_status, created_at);
