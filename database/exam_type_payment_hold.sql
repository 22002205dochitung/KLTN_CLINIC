-- Loại hình khám (dịch vụ / BHYT) + giữ chỗ khi thanh toán online. Chạy sau doctor_shifts.sql. Idempotent.
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS exam_type ENUM('service', 'insurance') NOT NULL DEFAULT 'service' COMMENT 'Khám dịch vụ / khám BHYT',
  ADD COLUMN IF NOT EXISTS insurance_number VARCHAR(15) NULL COMMENT 'Số thẻ BHYT (15 ký tự)',
  ADD COLUMN IF NOT EXISTS insurance_expiry DATE NULL COMMENT 'Hạn sử dụng thẻ BHYT',
  ADD COLUMN IF NOT EXISTS hold_expires_at DATETIME NULL COMMENT 'Chuyển khoản online: hết hạn giữ chỗ nếu chưa thanh toán';

CREATE INDEX IF NOT EXISTS idx_appt_hold ON appointments (hold_expires_at, payment_status, status);
