-- Doctor days off. Idempotent: safe to run more than once. Run after bank_transfer.sql.
-- Bookings and reschedules are refused on these days; existing bookings are NOT cancelled
-- automatically (the API lists them so the front desk can call the patients).

CREATE TABLE IF NOT EXISTS doctor_leaves (
  id INT AUTO_INCREMENT PRIMARY KEY,
  doctor_id INT NOT NULL,
  leave_date DATE NOT NULL,
  reason VARCHAR(255) NULL,
  created_by INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_doctor_leave (doctor_id, leave_date),
  KEY idx_leave_date (leave_date),
  CONSTRAINT fk_leave_doctor FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
