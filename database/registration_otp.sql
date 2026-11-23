-- Xác thực OTP khi đăng ký (use case Đăng ký tài khoản). Chạy sau exam_type_payment_hold.sql. Idempotent.
-- otp_required = 1: tài khoản đăng ký sau khi bật OTP, phải xác thực email trước khi đăng nhập.
-- Tài khoản cũ giữ otp_required = 0 nên không bị ảnh hưởng.
ALTER TABLE users ADD COLUMN IF NOT EXISTS otp_required TINYINT(1) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS otp_codes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  purpose VARCHAR(20) NOT NULL DEFAULT 'register',
  code_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  consumed_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_otp_user (user_id, purpose, created_at),
  CONSTRAINT fk_otp_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
