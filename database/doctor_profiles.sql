-- Hồ sơ bác sĩ cho trang tìm kiếm chuyên khoa/bác sĩ (use case 3.2.2.3). Chạy sau registration_otp.sql. Idempotent.
ALTER TABLE doctors
  ADD COLUMN IF NOT EXISTS bio TEXT NULL COMMENT 'Giới thiệu bác sĩ',
  ADD COLUMN IF NOT EXISTS experience_years INT NULL COMMENT 'Số năm kinh nghiệm',
  ADD COLUMN IF NOT EXISTS expertise VARCHAR(255) NULL COMMENT 'Thế mạnh chuyên môn, cách nhau dấu phẩy';

-- Nội dung mẫu (chỉ điền khi còn trống – admin sửa lại trong Quản lý bác sĩ)
UPDATE doctors d JOIN departments dep ON dep.id = d.department_id
SET d.bio = CONCAT('Bác sĩ công tác tại ', dep.name, ', tận tâm thăm khám, tư vấn và theo dõi điều trị lâu dài cho người bệnh.'),
    d.experience_years = COALESCE(d.experience_years, 8 + (d.id MOD 7)),
    d.expertise = COALESCE(d.expertise, CASE
      WHEN dep.name LIKE '%Tim%' THEN 'Tăng huyết áp, Rối loạn nhịp tim, Suy tim, Tầm soát tim mạch'
      WHEN dep.name LIKE '%Ngoại%' THEN 'Chấn thương, Phẫu thuật tiêu hoá, Thoát vị, Sỏi mật'
      WHEN dep.name LIKE '%Sản%' OR dep.name LIKE '%Phụ%' THEN 'Khám thai, Phụ khoa, Kế hoạch hoá gia đình'
      WHEN dep.name LIKE '%Nhi%' THEN 'Hô hấp trẻ em, Dinh dưỡng, Tiêm chủng'
      WHEN dep.name LIKE '%Da%' THEN 'Mụn, Viêm da, Dị ứng da, Nấm da'
      WHEN dep.name LIKE '%Mắt%' THEN 'Tật khúc xạ, Viêm kết mạc, Khô mắt'
      WHEN dep.name LIKE '%Tai%' THEN 'Viêm xoang, Viêm họng, Viêm tai giữa'
      ELSE 'Khám tổng quát, Tiêu hoá, Đái tháo đường, Rối loạn mỡ máu'
    END)
WHERE d.bio IS NULL;
