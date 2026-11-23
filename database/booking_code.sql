-- Booking number shown to the patient (mã lịch hẹn / số thứ tự đặt lịch).
-- Format: YYMMDD-<department code>-<running number of that department on that day>
--   e.g. 25/11/2026, Tai - Mũi - Họng (TMH), 1st booking  ->  261125-TMH-001
-- Idempotent: safe to run more than once. Run after prescription_templates.sql.

-- 1. Department code (editable by the admin)
ALTER TABLE departments ADD COLUMN IF NOT EXISTS code VARCHAR(10) NULL AFTER name;

-- Initials of the department name (Vietnamese: "Ngoại" -> NG, one-word names kept whole)
UPDATE departments SET code = CASE id
  WHEN 1 THEN 'NTQ'   -- (Khám bệnh -) Nội Tổng Quát
  WHEN 2 THEN 'TM'    -- Tim Mạch
  WHEN 3 THEN 'NGTQ'  -- Ngoại Tổng Quát
  WHEN 4 THEN 'SPK'   -- Sản - Phụ Khoa
  WHEN 5 THEN 'NHI'   -- Nhi
  WHEN 6 THEN 'DL'    -- Da Liễu
  WHEN 7 THEN 'MAT'   -- Mắt
  WHEN 8 THEN 'TMH'   -- Tai - Mũi - Họng
END
WHERE id BETWEEN 1 AND 8 AND (code IS NULL OR code IN ('U1','U2','U3','U4','U5','U6','U7','U8'));

-- any other department: K<id>
UPDATE departments SET code = CONCAT('K', id) WHERE code IS NULL OR code = '';

-- 2. Running number per department and exam day (row lock = no duplicates under load)
CREATE TABLE IF NOT EXISTS booking_counters (
  department_id INT NOT NULL,
  visit_date DATE NOT NULL,
  last_no INT NOT NULL DEFAULT 0,
  PRIMARY KEY (department_id, visit_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. The code on each appointment
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS booking_code VARCHAR(32) NULL AFTER qr_code_token;
SET @has_idx := (SELECT COUNT(*) FROM information_schema.statistics
                 WHERE table_schema = DATABASE() AND table_name = 'appointments' AND index_name = 'uq_booking_code');
SET @sql := IF(@has_idx = 0, 'ALTER TABLE appointments ADD UNIQUE KEY uq_booking_code (booking_code)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3b. Department code changed (e.g. the first U1..U8 codes): keep the number, swap the code part
UPDATE appointments a
JOIN doctors d ON d.id = a.doctor_id
JOIN departments dep ON dep.id = d.department_id
SET a.booking_code = CONCAT(SUBSTRING_INDEX(a.booking_code, '-', 1), '-', dep.code, '-', SUBSTRING_INDEX(a.booking_code, '-', -1))
WHERE a.booking_code IS NOT NULL
  AND SUBSTRING_INDEX(SUBSTRING_INDEX(a.booking_code, '-', 2), '-', -1) <> dep.code;

-- 4. Number the appointments that exist already (in booking order), continuing any counter
UPDATE appointments a
JOIN (
  SELECT x.id,
         CONCAT(DATE_FORMAT(x.appointment_date, '%y%m%d'), '-', dep.code, '-',
                LPAD(COALESCE(c.last_no, 0) + ROW_NUMBER() OVER (PARTITION BY d.department_id, x.appointment_date ORDER BY x.created_at, x.id), 3, '0')) AS code
  FROM appointments x
  JOIN doctors d ON d.id = x.doctor_id
  JOIN departments dep ON dep.id = d.department_id
  LEFT JOIN booking_counters c ON c.department_id = d.department_id AND c.visit_date = x.appointment_date
  WHERE x.booking_code IS NULL
) n ON n.id = a.id
SET a.booking_code = n.code;

-- 5. Counters start after the numbers given above
INSERT INTO booking_counters (department_id, visit_date, last_no)
SELECT d.department_id, a.appointment_date, MAX(CAST(SUBSTRING_INDEX(a.booking_code, '-', -1) AS UNSIGNED))
FROM appointments a
JOIN doctors d ON d.id = a.doctor_id
WHERE a.booking_code IS NOT NULL
GROUP BY d.department_id, a.appointment_date
ON DUPLICATE KEY UPDATE last_no = GREATEST(last_no, VALUES(last_no));
