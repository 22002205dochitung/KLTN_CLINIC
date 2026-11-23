-- Ca trực bác sĩ (use case Quản lý ca trực). Chạy sau smart_recommendation.sql. Idempotent.
-- weekday  : ca lặp lại hằng tuần (0 = Chủ nhật ... 6 = Thứ bảy)
-- work_date: ca của một ngày cụ thể – nếu ngày đó có ca riêng thì dùng ca riêng thay cho lịch tuần
-- Bác sĩ chưa có ca nào => làm theo giờ mặc định của phòng khám (tương thích dữ liệu cũ).
CREATE TABLE IF NOT EXISTS doctor_shifts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  doctor_id INT NOT NULL,
  weekday TINYINT NULL,
  work_date DATE NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  note VARCHAR(255) NULL,
  created_by INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_shift_doctor (doctor_id, weekday, work_date),
  CONSTRAINT fk_shift_doctor FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE CASCADE,
  CONSTRAINT chk_shift_kind CHECK ((weekday IS NULL) <> (work_date IS NULL)),
  CONSTRAINT chk_shift_weekday CHECK (weekday IS NULL OR weekday BETWEEN 0 AND 6),
  CONSTRAINT chk_shift_time CHECK (start_time < end_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
