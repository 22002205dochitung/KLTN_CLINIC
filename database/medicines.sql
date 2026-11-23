-- Medicine catalogue, stock and patient health info. Idempotent: safe to run more than once.
-- Run after reviews.sql.

CREATE TABLE IF NOT EXISTS medicines (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  unit VARCHAR(30) NOT NULL DEFAULT 'viên',
  price DECIMAL(10,2) NOT NULL DEFAULT 0,
  stock INT NOT NULL DEFAULT 0,
  min_stock INT NOT NULL DEFAULT 20,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_medicine_name (name),
  CONSTRAINT chk_medicine_stock CHECK (stock >= 0),
  CONSTRAINT chk_medicine_price CHECK (price >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Every stock change (import, dispensing at the cashier, manual adjustment)
CREATE TABLE IF NOT EXISTS stock_movements (
  id INT AUTO_INCREMENT PRIMARY KEY,
  medicine_id INT NOT NULL,
  quantity_change INT NOT NULL,
  stock_after INT NOT NULL,
  reason ENUM('import', 'dispense', 'adjust') NOT NULL,
  medical_record_id INT NULL,
  note VARCHAR(255) NULL,
  created_by INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_movement_medicine (medicine_id, created_at),
  CONSTRAINT fk_movement_medicine FOREIGN KEY (medicine_id) REFERENCES medicines(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Prescription line -> catalogue item (NULL = written by hand, not stock-tracked)
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS medicine_id INT NULL DEFAULT NULL AFTER medical_record_id;
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS unit VARCHAR(30) NULL DEFAULT NULL AFTER quantity;

-- Patient health info shown to the doctor during the visit
ALTER TABLE users ADD COLUMN IF NOT EXISTS blood_type VARCHAR(5) NULL DEFAULT NULL AFTER date_of_birth;
ALTER TABLE users ADD COLUMN IF NOT EXISTS allergies VARCHAR(500) NULL DEFAULT NULL AFTER blood_type;
ALTER TABLE users ADD COLUMN IF NOT EXISTS chronic_conditions VARCHAR(500) NULL DEFAULT NULL AFTER allergies;

-- Demo catalogue (kept when it already exists)
INSERT IGNORE INTO medicines (name, unit, price, stock, min_stock) VALUES
  ('Paracetamol 500mg', 'viên', 1000, 500, 100),
  ('Ibuprofen 400mg', 'viên', 2000, 300, 60),
  ('Amoxicillin 500mg', 'viên', 2500, 400, 80),
  ('Cefuroxime 500mg', 'viên', 8000, 150, 40),
  ('Azithromycin 250mg', 'viên', 9000, 120, 30),
  ('Loratadine 10mg', 'viên', 1500, 200, 40),
  ('Cetirizine 10mg', 'viên', 1200, 200, 40),
  ('Omeprazole 20mg', 'viên', 3000, 250, 50),
  ('Domperidone 10mg', 'viên', 1500, 180, 40),
  ('Vitamin C 500mg', 'viên', 800, 600, 100),
  ('Oresol', 'gói', 2000, 150, 30),
  ('Siro ho Prospan 100ml', 'chai', 85000, 40, 10),
  ('Nước muối sinh lý 0.9%', 'chai', 5000, 100, 20),
  ('Metformin 500mg', 'viên', 1500, 300, 60),
  ('Amlodipine 5mg', 'viên', 2000, 300, 60);
