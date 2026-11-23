-- Bác sĩ cho các chuyên khoa còn trống (Sản - Phụ khoa, Nhi, Da liễu, Mắt, Tai - Mũi - Họng)
-- và thêm 1 bác sĩ Ngoại. Chạy sau doctor_profiles.sql. Idempotent: chạy lại không tạo trùng.
-- Mật khẩu mọi tài khoản: Password123!  (bcrypt, cost 12)

CREATE TEMPORARY TABLE tmp_new_doctors (
  email VARCHAR(100) PRIMARY KEY,
  fullname VARCHAR(100),
  phone VARCHAR(15),
  gender ENUM('male', 'female', 'other'),
  department_name VARCHAR(100),
  degree VARCHAR(50),
  room VARCHAR(20),
  experience_years INT,
  expertise VARCHAR(255),
  bio TEXT
) DEFAULT CHARSET = utf8mb4;

INSERT INTO tmp_new_doctors VALUES
('bsthao@clinic.com', 'BS. Nguyễn Thị Thảo', '0912000201', 'female', 'Khoa Sản - Phụ Khoa', 'Bác sĩ Chuyên khoa I', '201', 11,
 'Khám thai định kỳ, Siêu âm thai, Phụ khoa, Kế hoạch hoá gia đình',
 'Hơn 10 năm theo dõi thai kỳ và điều trị bệnh phụ khoa; tư vấn tiền sản, sau sinh và tránh thai an toàn.'),
('bsmai@clinic.com', 'ThS.BS. Lê Thị Mai', '0912000202', 'female', 'Khoa Sản - Phụ Khoa', 'Thạc sĩ - Bác sĩ', '202', 14,
 'Thai kỳ nguy cơ cao, Vô sinh - hiếm muộn, Rối loạn kinh nguyệt, Tầm soát ung thư cổ tử cung',
 'Thạc sĩ Sản phụ khoa, chuyên quản lý thai kỳ nguy cơ cao và điều trị hiếm muộn.'),
('bsnam@clinic.com', 'BS. Trần Hoài Nam', '0912000203', 'male', 'Khoa Nhi', 'Bác sĩ Chuyên khoa I', '203', 9,
 'Hô hấp trẻ em, Sốt - nhiễm trùng, Tiêu chảy, Tiêm chủng',
 'Khám và điều trị các bệnh thường gặp ở trẻ em; tư vấn lịch tiêm chủng và chăm sóc trẻ tại nhà.'),
('bsngoc@clinic.com', 'BS. Phan Bảo Ngọc', '0912000204', 'female', 'Khoa Nhi', 'Bác sĩ Chuyên khoa II', '204', 13,
 'Dinh dưỡng trẻ em, Biếng ăn - chậm tăng cân, Dị ứng ở trẻ, Sơ sinh',
 'Chuyên dinh dưỡng và phát triển trẻ em, theo dõi trẻ sơ sinh và trẻ biếng ăn, chậm lớn.'),
('bsquan@clinic.com', 'BS. Đặng Minh Quân', '0912000205', 'male', 'Khoa Da Liễu', 'Bác sĩ Chuyên khoa I', '205', 8,
 'Mụn trứng cá, Viêm da cơ địa, Nấm da, Dị ứng - mề đay',
 'Điều trị mụn, viêm da và các bệnh da do nấm, dị ứng; hướng dẫn chăm sóc da đúng cách.'),
('bslinh@clinic.com', 'BS. Võ Thùy Linh', '0912000206', 'female', 'Khoa Da Liễu', 'Bác sĩ Đa khoa', '206', 6,
 'Vảy nến, Rụng tóc, Nám - tàn nhang, Chăm sóc da',
 'Khám và tư vấn điều trị vảy nến, rụng tóc, rối loạn sắc tố da.'),
('bstuan@clinic.com', 'BS. Huỳnh Anh Tuấn', '0912000207', 'male', 'Khoa Mắt', 'Bác sĩ Chuyên khoa I', '207', 12,
 'Tật khúc xạ (cận, viễn, loạn), Đục thuỷ tinh thể, Glôcôm',
 'Đo khúc xạ, khám và theo dõi đục thuỷ tinh thể, glôcôm; tư vấn kính phù hợp.'),
('bsyen@clinic.com', 'BS. Ngô Hải Yến', '0912000208', 'female', 'Khoa Mắt', 'Bác sĩ Đa khoa', '208', 7,
 'Viêm kết mạc, Khô mắt, Mắt trẻ em, Chấn thương mắt nhẹ',
 'Khám và điều trị đỏ mắt, khô mắt, các bệnh mắt thường gặp ở người lớn và trẻ em.'),
('bsduc@clinic.com', 'BS. Bùi Văn Đức', '0912000209', 'male', 'Khoa Tai - Mũi - Họng', 'Bác sĩ Chuyên khoa II', '209', 15,
 'Viêm xoang, Viêm mũi dị ứng, Nội soi tai mũi họng, Ngủ ngáy',
 'Hơn 15 năm khám và nội soi tai mũi họng; điều trị viêm xoang, viêm mũi dị ứng.'),
('bshang@clinic.com', 'BS. Lý Thanh Hằng', '0912000210', 'female', 'Khoa Tai - Mũi - Họng', 'Bác sĩ Chuyên khoa I', '210', 9,
 'Viêm họng - amidan, Viêm tai giữa, Ù tai, Khàn tiếng',
 'Điều trị viêm họng, viêm amidan, viêm tai giữa ở người lớn và trẻ em.'),
('bsvinh@clinic.com', 'BS. Đỗ Quang Vinh', '0912000211', 'male', 'Khoa Ngoại Tổng Quát', 'Bác sĩ Chuyên khoa I', '211', 10,
 'Chấn thương phần mềm, Khâu vết thương, Áp xe, U bã đậu',
 'Xử trí chấn thương, vết thương và các tiểu phẫu ngoại khoa thường gặp.');

-- tài khoản đăng nhập
INSERT INTO users (fullname, email, phone, password, role, email_verified, gender)
SELECT t.fullname, t.email, t.phone,
       '$2b$12$qE2jIPV/DXJu5II5Ci8PwudLWn3JSfI0MkLPvxKHu5TAMhxStlmDa',
       'doctor', 1, t.gender
FROM tmp_new_doctors t
WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.email = t.email);

-- hồ sơ bác sĩ, gắn vào chuyên khoa theo tên
INSERT INTO doctors (user_id, department_id, degree, room, bio, experience_years, expertise)
SELECT u.id, dep.id, t.degree, t.room, t.bio, t.experience_years, t.expertise
FROM tmp_new_doctors t
JOIN users u ON u.email = t.email
JOIN departments dep ON dep.name = t.department_name
WHERE NOT EXISTS (SELECT 1 FROM doctors d WHERE d.user_id = u.id);

DROP TEMPORARY TABLE tmp_new_doctors;
