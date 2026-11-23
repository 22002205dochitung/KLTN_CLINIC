-- Prescription templates (đơn thuốc mẫu). Idempotent: safe to run more than once. Run after more_doctors_50.sql.
-- A doctor saves a list of medicines + quantities under a name (e.g. "Viêm họng người lớn")
-- and applies it to later patients, then edits it before saving the real prescription.
-- items = JSON array of {medicine_id, medicine_name, unit, dosage, quantity, instructions}.

CREATE TABLE IF NOT EXISTS prescription_templates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  doctor_id INT NOT NULL,
  name VARCHAR(120) NOT NULL,
  diagnosis VARCHAR(255) NULL,
  items LONGTEXT NOT NULL,
  use_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_template_name (doctor_id, name),
  CONSTRAINT fk_template_doctor FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
