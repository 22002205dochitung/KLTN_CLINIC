-- Thêm 50 bác sĩ chia đều cho 8 chuyên khoa (6 mỗi khoa, Nội Tổng Quát và Nhi thêm 1).
-- Chạy sau more_doctors.sql. Idempotent: chạy lại không tạo trùng.
-- Mật khẩu mọi tài khoản: Password123!  (bcrypt, cost 12). Phòng khám 301-350.
-- File được sinh tự động; sửa thông tin từng bác sĩ trong Quản trị > Quản lý bác sĩ.

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
('bs.hanh01@clinic.com', 'BS. Nguyễn Thị Hạnh', '0913000301', 'female', 'Khoa Khám Bệnh - Nội Tổng Quát', 'Bác sĩ Đa khoa', '301', 3, 'Khám tổng quát, Tiêu hoá, Đái tháo đường', '3 năm kinh nghiệm khám, chẩn đoán và theo dõi các bệnh nội khoa thường gặp. Tận tâm, giải thích rõ ràng và theo dõi người bệnh sau khám.'),
('bs.danh02@clinic.com', 'TS.BS. Phạm Công Danh', '0913000302', 'male', 'Khoa Khám Bệnh - Nội Tổng Quát', 'Tiến sĩ - Bác sĩ', '302', 10, 'Đái tháo đường, Rối loạn mỡ máu, Bệnh gan', '10 năm kinh nghiệm khám, chẩn đoán và theo dõi các bệnh nội khoa thường gặp. Tận tâm, giải thích rõ ràng và theo dõi người bệnh sau khám.'),
('bs.thuong03@clinic.com', 'ThS.BS. Phan Hoài Thương', '0913000303', 'female', 'Khoa Khám Bệnh - Nội Tổng Quát', 'Thạc sĩ - Bác sĩ', '303', 17, 'Bệnh gan, Viêm dạ dày, Bệnh tuyến giáp', '17 năm kinh nghiệm khám, chẩn đoán và theo dõi các bệnh nội khoa thường gặp. Tận tâm, giải thích rõ ràng và theo dõi người bệnh sau khám.'),
('bs.tam04@clinic.com', 'BS. Đặng Hữu Tâm', '0913000304', 'male', 'Khoa Khám Bệnh - Nội Tổng Quát', 'Bác sĩ Chuyên khoa II', '304', 24, 'Bệnh tuyến giáp, Gout, Khám tổng quát', '24 năm kinh nghiệm khám, chẩn đoán và theo dõi các bệnh nội khoa thường gặp. Tận tâm, giải thích rõ ràng và theo dõi người bệnh sau khám.'),
('bs.ngan05@clinic.com', 'BS. Hồ Bích Ngân', '0913000305', 'female', 'Khoa Khám Bệnh - Nội Tổng Quát', 'Bác sĩ Chuyên khoa I', '305', 8, 'Khám tổng quát, Tiêu hoá, Đái tháo đường', '8 năm kinh nghiệm khám, chẩn đoán và theo dõi các bệnh nội khoa thường gặp. Tận tâm, giải thích rõ ràng và theo dõi người bệnh sau khám.'),
('bs.minh06@clinic.com', 'BS. Lý Nhật Minh', '0913000306', 'male', 'Khoa Khám Bệnh - Nội Tổng Quát', 'Bác sĩ Chuyên khoa I', '306', 15, 'Đái tháo đường, Rối loạn mỡ máu, Bệnh gan', '15 năm kinh nghiệm khám, chẩn đoán và theo dõi các bệnh nội khoa thường gặp. Tận tâm, giải thích rõ ràng và theo dõi người bệnh sau khám.'),
('bs.lien07@clinic.com', 'BS. Mai Thị Liên', '0913000307', 'female', 'Khoa Khám Bệnh - Nội Tổng Quát', 'Bác sĩ Đa khoa', '307', 22, 'Bệnh gan, Viêm dạ dày, Bệnh tuyến giáp', '22 năm kinh nghiệm khám, chẩn đoán và theo dõi các bệnh nội khoa thường gặp. Tận tâm, giải thích rõ ràng và theo dõi người bệnh sau khám.'),
('bs.hanh08@clinic.com', 'BS. Phan Thị Hạnh', '0913000308', 'female', 'Khoa Tim Mạch', 'Bác sĩ Đa khoa', '308', 9, 'Tăng huyết áp, Rối loạn nhịp tim, Suy tim', '9 năm kinh nghiệm khám, tầm soát và điều trị bệnh tim mạch. Tận tâm, giải thích rõ ràng và theo dõi người bệnh sau khám.'),
('bs.danh09@clinic.com', 'TS.BS. Đặng Công Danh', '0913000309', 'male', 'Khoa Tim Mạch', 'Tiến sĩ - Bác sĩ', '309', 16, 'Suy tim, Tầm soát tim mạch, Bệnh mạch vành', '16 năm kinh nghiệm khám, tầm soát và điều trị bệnh tim mạch. Tận tâm, giải thích rõ ràng và theo dõi người bệnh sau khám.'),
('bs.thuong10@clinic.com', 'ThS.BS. Hồ Hoài Thương', '0913000310', 'female', 'Khoa Tim Mạch', 'Thạc sĩ - Bác sĩ', '310', 23, 'Bệnh mạch vành, Siêu âm tim, Điện tâm đồ', '23 năm kinh nghiệm khám, tầm soát và điều trị bệnh tim mạch. Tận tâm, giải thích rõ ràng và theo dõi người bệnh sau khám.'),
('bs.tam11@clinic.com', 'BS. Lý Hữu Tâm', '0913000311', 'male', 'Khoa Tim Mạch', 'Bác sĩ Chuyên khoa II', '311', 7, 'Điện tâm đồ, Tăng huyết áp, Rối loạn nhịp tim', '7 năm kinh nghiệm khám, tầm soát và điều trị bệnh tim mạch. Tận tâm, giải thích rõ ràng và theo dõi người bệnh sau khám.'),
('bs.ngan12@clinic.com', 'BS. Mai Bích Ngân', '0913000312', 'female', 'Khoa Tim Mạch', 'Bác sĩ Chuyên khoa I', '312', 14, 'Rối loạn nhịp tim, Suy tim, Tầm soát tim mạch', '14 năm kinh nghiệm khám, tầm soát và điều trị bệnh tim mạch. Tận tâm, giải thích rõ ràng và theo dõi người bệnh sau khám.'),
('bs.minh13@clinic.com', 'BS. Trần Nhật Minh', '0913000313', 'male', 'Khoa Tim Mạch', 'Bác sĩ Chuyên khoa I', '313', 21, 'Tầm soát tim mạch, Bệnh mạch vành, Siêu âm tim', '21 năm kinh nghiệm khám, tầm soát và điều trị bệnh tim mạch. Tận tâm, giải thích rõ ràng và theo dõi người bệnh sau khám.'),
('bs.tri14@clinic.com', 'BS. Đặng Minh Trí', '0913000314', 'male', 'Khoa Ngoại Tổng Quát', 'Bác sĩ Chuyên khoa I', '314', 8, 'Chấn thương, Phẫu thuật tiêu hoá, Thoát vị', '8 năm kinh nghiệm xử trí chấn thương và điều trị bệnh ngoại khoa. Tận tâm, giải thích rõ ràng và theo dõi người bệnh sau khám.'),
('bs.hanh15@clinic.com', 'BS. Hồ Thị Hạnh', '0913000315', 'female', 'Khoa Ngoại Tổng Quát', 'Bác sĩ Đa khoa', '315', 15, 'Thoát vị, Sỏi mật, Tiểu phẫu', '15 năm kinh nghiệm xử trí chấn thương và điều trị bệnh ngoại khoa. Tận tâm, giải thích rõ ràng và theo dõi người bệnh sau khám.'),
('bs.danh16@clinic.com', 'TS.BS. Lý Công Danh', '0913000316', 'male', 'Khoa Ngoại Tổng Quát', 'Tiến sĩ - Bác sĩ', '316', 22, 'Tiểu phẫu, Khâu vết thương, Trĩ', '22 năm kinh nghiệm xử trí chấn thương và điều trị bệnh ngoại khoa. Tận tâm, giải thích rõ ràng và theo dõi người bệnh sau khám.'),
('bs.thuong17@clinic.com', 'ThS.BS. Mai Hoài Thương', '0913000317', 'female', 'Khoa Ngoại Tổng Quát', 'Thạc sĩ - Bác sĩ', '317', 6, 'Trĩ, Chấn thương, Phẫu thuật tiêu hoá', '6 năm kinh nghiệm xử trí chấn thương và điều trị bệnh ngoại khoa. Tận tâm, giải thích rõ ràng và theo dõi người bệnh sau khám.'),
('bs.tam18@clinic.com', 'BS. Trần Hữu Tâm', '0913000318', 'male', 'Khoa Ngoại Tổng Quát', 'Bác sĩ Chuyên khoa II', '318', 13, 'Phẫu thuật tiêu hoá, Thoát vị, Sỏi mật', '13 năm kinh nghiệm xử trí chấn thương và điều trị bệnh ngoại khoa. Tận tâm, giải thích rõ ràng và theo dõi người bệnh sau khám.'),
('bs.ngan19@clinic.com', 'BS. Hoàng Bích Ngân', '0913000319', 'female', 'Khoa Ngoại Tổng Quát', 'Bác sĩ Chuyên khoa I', '319', 20, 'Sỏi mật, Tiểu phẫu, Khâu vết thương', '20 năm kinh nghiệm xử trí chấn thương và điều trị bệnh ngoại khoa. Tận tâm, giải thích rõ ràng và theo dõi người bệnh sau khám.'),
('bs.han20@clinic.com', 'BS. Hồ Ngọc Hân', '0913000320', 'female', 'Khoa Sản - Phụ Khoa', 'Bác sĩ Chuyên khoa I', '320', 7, 'Khám thai định kỳ, Siêu âm thai, Phụ khoa', '7 năm kinh nghiệm theo dõi thai kỳ và chăm sóc sức khoẻ phụ nữ. Tận tâm, giải thích rõ ràng và theo dõi người bệnh sau khám.'),
('bs.tri21@clinic.com', 'BS. Lý Minh Trí', '0913000321', 'male', 'Khoa Sản - Phụ Khoa', 'Bác sĩ Chuyên khoa I', '321', 14, 'Phụ khoa, Kế hoạch hoá gia đình, Hiếm muộn', '14 năm kinh nghiệm theo dõi thai kỳ và chăm sóc sức khoẻ phụ nữ. Tận tâm, giải thích rõ ràng và theo dõi người bệnh sau khám.'),
('bs.hanh22@clinic.com', 'BS. Mai Thị Hạnh', '0913000322', 'female', 'Khoa Sản - Phụ Khoa', 'Bác sĩ Đa khoa', '322', 21, 'Hiếm muộn, Rối loạn kinh nguyệt, Tầm soát ung thư cổ tử cung', '21 năm kinh nghiệm theo dõi thai kỳ và chăm sóc sức khoẻ phụ nữ. Tận tâm, giải thích rõ ràng và theo dõi người bệnh sau khám.'),
('bs.danh23@clinic.com', 'TS.BS. Trần Công Danh', '0913000323', 'male', 'Khoa Sản - Phụ Khoa', 'Tiến sĩ - Bác sĩ', '323', 5, 'Tầm soát ung thư cổ tử cung, Khám thai định kỳ, Siêu âm thai', '5 năm kinh nghiệm theo dõi thai kỳ và chăm sóc sức khoẻ phụ nữ. Tận tâm, giải thích rõ ràng và theo dõi người bệnh sau khám.'),
('bs.thuong24@clinic.com', 'ThS.BS. Hoàng Hoài Thương', '0913000324', 'female', 'Khoa Sản - Phụ Khoa', 'Thạc sĩ - Bác sĩ', '324', 12, 'Siêu âm thai, Phụ khoa, Kế hoạch hoá gia đình', '12 năm kinh nghiệm theo dõi thai kỳ và chăm sóc sức khoẻ phụ nữ. Tận tâm, giải thích rõ ràng và theo dõi người bệnh sau khám.'),
('bs.tam25@clinic.com', 'BS. Vũ Hữu Tâm', '0913000325', 'male', 'Khoa Sản - Phụ Khoa', 'Bác sĩ Chuyên khoa II', '325', 19, 'Kế hoạch hoá gia đình, Hiếm muộn, Rối loạn kinh nguyệt', '19 năm kinh nghiệm theo dõi thai kỳ và chăm sóc sức khoẻ phụ nữ. Tận tâm, giải thích rõ ràng và theo dõi người bệnh sau khám.'),
('bs.long26@clinic.com', 'BS. Lý Thành Long', '0913000326', 'male', 'Khoa Nhi', 'Bác sĩ Chuyên khoa II', '326', 6, 'Hô hấp trẻ em, Sốt - nhiễm trùng, Tiêu chảy', '6 năm kinh nghiệm khám và điều trị bệnh thường gặp ở trẻ em. Tận tâm, giải thích rõ ràng và theo dõi người bệnh sau khám.'),
('bs.han27@clinic.com', 'BS. Mai Ngọc Hân', '0913000327', 'female', 'Khoa Nhi', 'Bác sĩ Chuyên khoa I', '327', 13, 'Tiêu chảy, Tiêm chủng, Dinh dưỡng trẻ em', '13 năm kinh nghiệm khám và điều trị bệnh thường gặp ở trẻ em. Tận tâm, giải thích rõ ràng và theo dõi người bệnh sau khám.'),
('bs.tri28@clinic.com', 'BS. Trần Minh Trí', '0913000328', 'male', 'Khoa Nhi', 'Bác sĩ Chuyên khoa I', '328', 20, 'Dinh dưỡng trẻ em, Sơ sinh, Dị ứng ở trẻ', '20 năm kinh nghiệm khám và điều trị bệnh thường gặp ở trẻ em. Tận tâm, giải thích rõ ràng và theo dõi người bệnh sau khám.'),
('bs.hanh29@clinic.com', 'BS. Hoàng Thị Hạnh', '0913000329', 'female', 'Khoa Nhi', 'Bác sĩ Đa khoa', '329', 4, 'Dị ứng ở trẻ, Hô hấp trẻ em, Sốt - nhiễm trùng', '4 năm kinh nghiệm khám và điều trị bệnh thường gặp ở trẻ em. Tận tâm, giải thích rõ ràng và theo dõi người bệnh sau khám.'),
('bs.danh30@clinic.com', 'TS.BS. Vũ Công Danh', '0913000330', 'male', 'Khoa Nhi', 'Tiến sĩ - Bác sĩ', '330', 11, 'Sốt - nhiễm trùng, Tiêu chảy, Tiêm chủng', '11 năm kinh nghiệm khám và điều trị bệnh thường gặp ở trẻ em. Tận tâm, giải thích rõ ràng và theo dõi người bệnh sau khám.'),
('bs.thuong31@clinic.com', 'ThS.BS. Bùi Hoài Thương', '0913000331', 'female', 'Khoa Nhi', 'Thạc sĩ - Bác sĩ', '331', 18, 'Tiêm chủng, Dinh dưỡng trẻ em, Sơ sinh', '18 năm kinh nghiệm khám và điều trị bệnh thường gặp ở trẻ em. Tận tâm, giải thích rõ ràng và theo dõi người bệnh sau khám.'),
('bs.tam32@clinic.com', 'BS. Ngô Hữu Tâm', '0913000332', 'male', 'Khoa Nhi', 'Bác sĩ Chuyên khoa II', '332', 25, 'Sơ sinh, Dị ứng ở trẻ, Hô hấp trẻ em', '25 năm kinh nghiệm khám và điều trị bệnh thường gặp ở trẻ em. Tận tâm, giải thích rõ ràng và theo dõi người bệnh sau khám.'),
('bs.long33@clinic.com', 'BS. Trần Thành Long', '0913000333', 'male', 'Khoa Da Liễu', 'Bác sĩ Chuyên khoa II', '333', 12, 'Mụn trứng cá, Viêm da cơ địa, Nấm da', '12 năm kinh nghiệm điều trị bệnh da, tóc và móng. Tận tâm, giải thích rõ ràng và theo dõi người bệnh sau khám.'),
('bs.han34@clinic.com', 'BS. Hoàng Ngọc Hân', '0913000334', 'female', 'Khoa Da Liễu', 'Bác sĩ Chuyên khoa I', '334', 19, 'Nấm da, Dị ứng - mề đay, Vảy nến', '19 năm kinh nghiệm điều trị bệnh da, tóc và móng. Tận tâm, giải thích rõ ràng và theo dõi người bệnh sau khám.'),
('bs.tri35@clinic.com', 'BS. Vũ Minh Trí', '0913000335', 'male', 'Khoa Da Liễu', 'Bác sĩ Chuyên khoa I', '335', 3, 'Vảy nến, Rụng tóc, Nám - tàn nhang', '3 năm kinh nghiệm điều trị bệnh da, tóc và móng. Tận tâm, giải thích rõ ràng và theo dõi người bệnh sau khám.'),
('bs.hanh36@clinic.com', 'BS. Bùi Thị Hạnh', '0913000336', 'female', 'Khoa Da Liễu', 'Bác sĩ Đa khoa', '336', 10, 'Nám - tàn nhang, Mụn trứng cá, Viêm da cơ địa', '10 năm kinh nghiệm điều trị bệnh da, tóc và móng. Tận tâm, giải thích rõ ràng và theo dõi người bệnh sau khám.'),
('bs.danh37@clinic.com', 'TS.BS. Ngô Công Danh', '0913000337', 'male', 'Khoa Da Liễu', 'Tiến sĩ - Bác sĩ', '337', 17, 'Viêm da cơ địa, Nấm da, Dị ứng - mề đay', '17 năm kinh nghiệm điều trị bệnh da, tóc và móng. Tận tâm, giải thích rõ ràng và theo dõi người bệnh sau khám.'),
('bs.thuong38@clinic.com', 'ThS.BS. Trương Hoài Thương', '0913000338', 'female', 'Khoa Da Liễu', 'Thạc sĩ - Bác sĩ', '338', 24, 'Dị ứng - mề đay, Vảy nến, Rụng tóc', '24 năm kinh nghiệm điều trị bệnh da, tóc và móng. Tận tâm, giải thích rõ ràng và theo dõi người bệnh sau khám.'),
('bs.anh39@clinic.com', 'ThS.BS. Hoàng Lan Anh', '0913000339', 'female', 'Khoa Mắt', 'Thạc sĩ - Bác sĩ', '339', 11, 'Tật khúc xạ, Đục thuỷ tinh thể, Glôcôm', '11 năm kinh nghiệm khám và điều trị các bệnh về mắt. Tận tâm, giải thích rõ ràng và theo dõi người bệnh sau khám.'),
('bs.long40@clinic.com', 'BS. Vũ Thành Long', '0913000340', 'male', 'Khoa Mắt', 'Bác sĩ Chuyên khoa II', '340', 18, 'Glôcôm, Viêm kết mạc, Khô mắt', '18 năm kinh nghiệm khám và điều trị các bệnh về mắt. Tận tâm, giải thích rõ ràng và theo dõi người bệnh sau khám.'),
('bs.han41@clinic.com', 'BS. Bùi Ngọc Hân', '0913000341', 'female', 'Khoa Mắt', 'Bác sĩ Chuyên khoa I', '341', 25, 'Khô mắt, Mắt trẻ em, Đáy mắt', '25 năm kinh nghiệm khám và điều trị các bệnh về mắt. Tận tâm, giải thích rõ ràng và theo dõi người bệnh sau khám.'),
('bs.tri42@clinic.com', 'BS. Ngô Minh Trí', '0913000342', 'male', 'Khoa Mắt', 'Bác sĩ Chuyên khoa I', '342', 9, 'Đáy mắt, Tật khúc xạ, Đục thuỷ tinh thể', '9 năm kinh nghiệm khám và điều trị các bệnh về mắt. Tận tâm, giải thích rõ ràng và theo dõi người bệnh sau khám.'),
('bs.hanh43@clinic.com', 'BS. Trương Thị Hạnh', '0913000343', 'female', 'Khoa Mắt', 'Bác sĩ Đa khoa', '343', 16, 'Đục thuỷ tinh thể, Glôcôm, Viêm kết mạc', '16 năm kinh nghiệm khám và điều trị các bệnh về mắt. Tận tâm, giải thích rõ ràng và theo dõi người bệnh sau khám.'),
('bs.danh44@clinic.com', 'TS.BS. Tô Công Danh', '0913000344', 'male', 'Khoa Mắt', 'Tiến sĩ - Bác sĩ', '344', 23, 'Viêm kết mạc, Khô mắt, Mắt trẻ em', '23 năm kinh nghiệm khám và điều trị các bệnh về mắt. Tận tâm, giải thích rõ ràng và theo dõi người bệnh sau khám.'),
('bs.trung45@clinic.com', 'TS.BS. Vũ Đình Trung', '0913000345', 'male', 'Khoa Tai - Mũi - Họng', 'Tiến sĩ - Bác sĩ', '345', 10, 'Viêm xoang, Viêm mũi dị ứng, Nội soi tai mũi họng', '10 năm kinh nghiệm khám, nội soi và điều trị bệnh tai mũi họng. Tận tâm, giải thích rõ ràng và theo dõi người bệnh sau khám.'),
('bs.anh46@clinic.com', 'ThS.BS. Bùi Lan Anh', '0913000346', 'female', 'Khoa Tai - Mũi - Họng', 'Thạc sĩ - Bác sĩ', '346', 17, 'Nội soi tai mũi họng, Viêm họng - amidan, Viêm tai giữa', '17 năm kinh nghiệm khám, nội soi và điều trị bệnh tai mũi họng. Tận tâm, giải thích rõ ràng và theo dõi người bệnh sau khám.'),
('bs.long47@clinic.com', 'BS. Ngô Thành Long', '0913000347', 'male', 'Khoa Tai - Mũi - Họng', 'Bác sĩ Chuyên khoa II', '347', 24, 'Viêm tai giữa, Ù tai, Khàn tiếng', '24 năm kinh nghiệm khám, nội soi và điều trị bệnh tai mũi họng. Tận tâm, giải thích rõ ràng và theo dõi người bệnh sau khám.'),
('bs.han48@clinic.com', 'BS. Trương Ngọc Hân', '0913000348', 'female', 'Khoa Tai - Mũi - Họng', 'Bác sĩ Chuyên khoa I', '348', 8, 'Khàn tiếng, Viêm xoang, Viêm mũi dị ứng', '8 năm kinh nghiệm khám, nội soi và điều trị bệnh tai mũi họng. Tận tâm, giải thích rõ ràng và theo dõi người bệnh sau khám.'),
('bs.tri49@clinic.com', 'BS. Tô Minh Trí', '0913000349', 'male', 'Khoa Tai - Mũi - Họng', 'Bác sĩ Chuyên khoa I', '349', 15, 'Viêm mũi dị ứng, Nội soi tai mũi họng, Viêm họng - amidan', '15 năm kinh nghiệm khám, nội soi và điều trị bệnh tai mũi họng. Tận tâm, giải thích rõ ràng và theo dõi người bệnh sau khám.'),
('bs.hanh50@clinic.com', 'BS. Lê Thị Hạnh', '0913000350', 'female', 'Khoa Tai - Mũi - Họng', 'Bác sĩ Đa khoa', '350', 22, 'Viêm họng - amidan, Viêm tai giữa, Ù tai', '22 năm kinh nghiệm khám, nội soi và điều trị bệnh tai mũi họng. Tận tâm, giải thích rõ ràng và theo dõi người bệnh sau khám.');

INSERT INTO users (fullname, email, phone, password, role, email_verified, gender)
SELECT t.fullname, t.email, t.phone,
       '$2b$12$qE2jIPV/DXJu5II5Ci8PwudLWn3JSfI0MkLPvxKHu5TAMhxStlmDa',
       'doctor', 1, t.gender
FROM tmp_new_doctors t
WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.email = t.email);

INSERT INTO doctors (user_id, department_id, degree, room, bio, experience_years, expertise)
SELECT u.id, dep.id, t.degree, t.room, t.bio, t.experience_years, t.expertise
FROM tmp_new_doctors t
JOIN users u ON u.email = t.email
JOIN departments dep ON dep.name = t.department_name
WHERE NOT EXISTS (SELECT 1 FROM doctors d WHERE d.user_id = u.id);

DROP TEMPORARY TABLE tmp_new_doctors;
