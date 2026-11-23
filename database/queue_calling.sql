-- Gọi số kiểu bệnh viện: phòng khám của bác sĩ + trạng thái gọi số của lượt khám
-- Chạy sau medicines.sql

ALTER TABLE `doctors`
  ADD COLUMN IF NOT EXISTS `room` VARCHAR(20) NULL COMMENT 'Số phòng khám, VD 101';

UPDATE `doctors` SET `room` = CAST(100 + `id` AS CHAR) WHERE `room` IS NULL OR `room` = '';

ALTER TABLE `appointments`
  ADD COLUMN IF NOT EXISTS `called_at` DATETIME NULL COMMENT 'Lần gọi số gần nhất',
  ADD COLUMN IF NOT EXISTS `call_count` INT NOT NULL DEFAULT 0 COMMENT 'Số lần đã gọi',
  ADD COLUMN IF NOT EXISTS `skipped_at` DATETIME NULL COMMENT 'Bác sĩ đánh dấu vắng mặt khi gọi';

CREATE INDEX IF NOT EXISTS `idx_appt_queue_call` ON `appointments` (`doctor_id`, `appointment_date`, `status`, `called_at`);
