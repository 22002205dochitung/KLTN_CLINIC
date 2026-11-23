-- Gợi ý lịch khám thông minh (rule-based + content-based). Chạy sau pharmacy_stock.sql. Idempotent.

-- Content-based: từ khoá triệu chứng của từng chuyên khoa (admin sửa được)
ALTER TABLE departments ADD COLUMN IF NOT EXISTS keywords VARCHAR(1000) NULL DEFAULT NULL;

UPDATE departments SET keywords = 'sốt, mệt mỏi, đau đầu, chóng mặt, tiêu hoá, đau bụng, tiêu chảy, táo bón, buồn nôn, dạ dày, tiểu đường, đường huyết, mỡ máu, gan, thận, khám tổng quát, kiểm tra sức khoẻ'
  WHERE keywords IS NULL AND (name LIKE '%Nội%' OR name LIKE '%Khám Bệnh%');
UPDATE departments SET keywords = 'đau ngực, tức ngực, hồi hộp, đánh trống ngực, tim đập nhanh, khó thở, huyết áp, tăng huyết áp, cao huyết áp, tim, mạch vành, phù chân'
  WHERE keywords IS NULL AND name LIKE '%Tim%';
UPDATE departments SET keywords = 'vết thương, chấn thương, gãy xương, khối u, u cục, thoát vị, ruột thừa, sỏi, trĩ, áp xe, phẫu thuật, mổ'
  WHERE keywords IS NULL AND name LIKE '%Ngoại%';
UPDATE departments SET keywords = 'mang thai, có thai, thai, trễ kinh, kinh nguyệt, rong kinh, đau bụng kinh, khí hư, phụ khoa, tiền sản, sau sinh, tránh thai'
  WHERE keywords IS NULL AND (name LIKE '%Sản%' OR name LIKE '%Phụ%');
UPDATE departments SET keywords = 'trẻ em, bé, con tôi, sơ sinh, tiêm chủng, biếng ăn, chậm lớn, sốt ở trẻ, ho ở trẻ'
  WHERE keywords IS NULL AND name LIKE '%Nhi%';
UPDATE departments SET keywords = 'ngứa, nổi mẩn, mẩn đỏ, dị ứng da, mụn, nám, rụng tóc, nấm da, chàm, vảy nến, phát ban, móng'
  WHERE keywords IS NULL AND name LIKE '%Da%';
UPDATE departments SET keywords = 'mắt, mờ mắt, nhìn mờ, đỏ mắt, đau mắt, khô mắt, cận thị, viễn thị, chảy nước mắt, mắt nhức'
  WHERE keywords IS NULL AND name LIKE '%Mắt%';
UPDATE departments SET keywords = 'ho, đau họng, viêm họng, sổ mũi, nghẹt mũi, chảy mũi, viêm xoang, xoang, ù tai, đau tai, nghe kém, khàn tiếng, amidan, chảy máu cam'
  WHERE keywords IS NULL AND (name LIKE '%Tai%' OR name LIKE '%Họng%');

-- Rule-based: giới tính dùng cho luật Sản - Phụ khoa (thông tin cá nhân của bệnh nhân)
ALTER TABLE users ADD COLUMN IF NOT EXISTS gender ENUM('male', 'female', 'other') NULL DEFAULT NULL;

-- Tham số của bộ gợi ý (admin cấu hình)
CREATE TABLE IF NOT EXISTS recommendation_settings (
  setting_key VARCHAR(50) PRIMARY KEY,
  setting_value VARCHAR(100) NOT NULL,
  label VARCHAR(200) NOT NULL,
  updated_by INT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO recommendation_settings (setting_key, setting_value, label) VALUES
  ('enabled', '1', 'Bật chức năng gợi ý lịch khám'),
  ('history_months', '12', 'Khoảng lịch sử khám được phân tích (tháng)'),
  ('w_followup', '100', 'Điểm: có hẹn tái khám từ bác sĩ'),
  ('w_frequency', '25', 'Điểm cho mỗi lần đã khám ở chuyên khoa'),
  ('w_recency', '20', 'Điểm: vừa khám chuyên khoa này gần đây'),
  ('recency_days', '90', 'Thế nào là "gần đây" (ngày)'),
  ('w_symptom', '30', 'Điểm cho mỗi từ khoá triệu chứng khớp'),
  ('w_chronic', '35', 'Điểm: bệnh mạn tính liên quan chuyên khoa'),
  ('w_profile', '25', 'Điểm: phù hợp độ tuổi / giới tính'),
  ('child_age', '16', 'Dưới tuổi này gợi ý Khoa Nhi'),
  ('min_score', '20', 'Điểm tối thiểu để hiển thị gợi ý'),
  ('max_suggestions', '3', 'Số chuyên khoa gợi ý tối đa'),
  ('slot_suggestions', '3', 'Số khung giờ gợi ý tối đa');

-- Đánh giá hiệu quả gợi ý: lịch hẹn nào được đặt từ gợi ý
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS booking_source VARCHAR(30) NULL DEFAULT NULL
  COMMENT 'NULL = tự chọn; specialty / slot / followup = đặt từ gợi ý';
