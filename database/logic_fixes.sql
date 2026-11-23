-- ============================================
-- LOGIC FIXES - schema bổ sung cho code hiện tại
-- An toàn khi chạy nhiều lần (MariaDB 10.0+)
-- Chạy sau: kltn_clinic.sql, payment_system.sql, payment_system_fix.sql
-- ============================================

-- 1. Nhật ký hoạt động nghiệp vụ (đặt lịch, huỷ, check-in, thanh toán...)
--    Code đã ghi/đọc bảng này (event_type, event_details) nhưng bảng chưa từng được tạo,
--    nên tab "Nhật ký hoạt động" luôn lỗi và mọi log lịch hẹn bị mất.
CREATE TABLE IF NOT EXISTS audit_logs (
    log_id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NULL,
    event_type VARCHAR(50) NOT NULL,
    event_details TEXT NULL,
    ip_address VARCHAR(45) NULL,
    user_agent TEXT NULL,
    timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_audit_event (event_type, timestamp),
    INDEX idx_audit_user (user_id, timestamp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Nhật ký hoạt động nghiệp vụ';

-- 2. Ngày sinh người dùng (form đăng ký / hồ sơ cá nhân có trường này)
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS date_of_birth DATE NULL DEFAULT NULL AFTER phone;

-- 3. Thời điểm check-in thực tế -> sắp xếp hàng đợi đúng thứ tự đến
ALTER TABLE appointments
    ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMP NULL DEFAULT NULL AFTER status;

CREATE INDEX IF NOT EXISTS idx_appointments_queue ON appointments(doctor_id, appointment_date, status, checked_in_at);

-- 4. Chuẩn hoá khung giờ cũ dạng 'HH:MM' -> 'HH:MM-HH:MM' (30 phút)
--    (dữ liệu cũ do form đặt lịch nhanh gửi '08:00' / '14:00' / '17:00')
UPDATE appointments
SET time_slot = CONCAT(time_slot, '-', DATE_FORMAT(ADDTIME(CONCAT(time_slot, ':00'), '00:30:00'), '%H:%i'))
WHERE time_slot REGEXP '^[0-9]{2}:[0-9]{2}$';

-- 5. Chuẩn hoá số điện thoại về dạng 0xxxxxxxxx
--    (validator cũ lưu '84xxxxxxxxx' khi đăng ký, còn đặt lịch lưu '0xxxxxxxxx' -> cùng một người
--     bị tách thành 2 tài khoản). Gộp tài khoản khách vào tài khoản đã đăng ký rồi đổi định dạng.
UPDATE appointments a
JOIN users g ON a.patient_id = g.id
JOIN users r ON r.phone = CONCAT('84', SUBSTRING(g.phone, 2))
SET a.patient_id = r.id
WHERE g.password = 'N/A' AND g.email LIKE 'guest\_%@temp.com';

UPDATE payment_transactions t
JOIN users g ON t.patient_id = g.id
JOIN users r ON r.phone = CONCAT('84', SUBSTRING(g.phone, 2))
SET t.patient_id = r.id
WHERE g.password = 'N/A' AND g.email LIKE 'guest\_%@temp.com';

DELETE g FROM users g
JOIN users r ON r.phone = CONCAT('84', SUBSTRING(g.phone, 2))
WHERE g.password = 'N/A' AND g.email LIKE 'guest\_%@temp.com';

UPDATE users
SET phone = CONCAT('0', SUBSTRING(phone, 3))
WHERE phone LIKE '84%' AND LENGTH(phone) = 11;
