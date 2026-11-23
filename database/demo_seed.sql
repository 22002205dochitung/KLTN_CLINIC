-- --------------------------------------------------------
-- Demo data cho THCT Clinic System
-- Chạy sau khi database chính đã được tạo xong
-- --------------------------------------------------------

SET FOREIGN_KEY_CHECKS = 0;

-- Thêm bệnh nhân mới cho demo
INSERT INTO `users` (`id`, `fullname`, `email`, `phone`, `password`, `role`, `created_at`, `email_verified`, `last_login`, `login_attempts`, `locked_until`, `password_reset_token`, `password_reset_expires`, `updated_at`) VALUES
(13, 'Nguyễn Thị Mai', 'mai.nguyen@gmail.com', '0907654321', '$2b$12$m8XsEbIy76eOnFYdJMyZiO5idMbVCF.56x6lZ.mlB5u8jamCo2DQ.', 'patient', '2026-10-10 08:00:00', 1, '2026-11-01 08:30:00', 0, NULL, NULL, NULL, '2026-11-01 08:30:00'),
(14, 'Phạm Quốc Huy', 'huy.pham@gmail.com', '0907654322', '$2b$12$m8XsEbIy76eOnFYdJMyZiO5idMbVCF.56x6lZ.mlB5u8jamCo2DQ.', 'patient', '2026-10-11 09:15:00', 1, '2026-11-02 09:20:00', 0, NULL, NULL, NULL, '2026-11-02 09:20:00'),
(15, 'Trần Thanh Lan', 'lan.tran@gmail.com', '0907654323', '$2b$12$m8XsEbIy76eOnFYdJMyZiO5idMbVCF.56x6lZ.mlB5u8jamCo2DQ.', 'patient', '2026-10-12 10:20:00', 1, '2026-11-03 10:25:00', 0, NULL, NULL, NULL, '2026-11-03 10:25:00'),
(16, 'Võ Minh Tâm', 'tam.vo@gmail.com', '0907654324', '$2b$12$m8XsEbIy76eOnFYdJMyZiO5idMbVCF.56x6lZ.mlB5u8jamCo2DQ.', 'patient', '2026-10-13 11:00:00', 1, '2026-11-04 11:15:00', 0, NULL, NULL, NULL, '2026-11-04 11:15:00'),
(17, 'Hoàng Nhật Anh', 'nhatan.hoang@gmail.com', '0907654325', '$2b$12$m8XsEbIy76eOnFYdJMyZiO5idMbVCF.56x6lZ.mlB5u8jamCo2DQ.', 'patient', '2026-10-14 14:20:00', 1, '2026-11-05 14:30:00', 0, NULL, NULL, NULL, '2026-11-05 14:30:00'),
(18, 'Đặng Hồng Nhung', 'nhung.dang@gmail.com', '0907654326', '$2b$12$m8XsEbIy76eOnFYdJMyZiO5idMbVCF.56x6lZ.mlB5u8jamCo2DQ.', 'patient', '2026-10-15 15:35:00', 1, '2026-11-06 16:00:00', 0, NULL, NULL, NULL, '2026-11-06 16:00:00'),
(19, 'Bùi Văn Dũng', 'dung.bui@gmail.com', '0907654327', '$2b$12$m8XsEbIy76eOnFYdJMyZiO5idMbVCF.56x6lZ.mlB5u8jamCo2DQ.', 'patient', '2026-10-16 07:40:00', 1, '2026-11-07 07:50:00', 0, NULL, NULL, NULL, '2026-11-07 07:50:00'),
(20, 'Lý Thu Hà', 'ha.ly@gmail.com', '0907654328', '$2b$12$m8XsEbIy76eOnFYdJMyZiO5idMbVCF.56x6lZ.mlB5u8jamCo2DQ.', 'patient', '2026-10-17 08:00:00', 1, '2026-11-08 08:20:00', 0, NULL, NULL, NULL, '2026-11-08 08:20:00');

-- Thêm bác sĩ chuyên khoa bổ sung để demo phong phú hơn
INSERT INTO `users` (`id`, `fullname`, `email`, `phone`, `password`, `role`, `created_at`, `email_verified`, `last_login`, `login_attempts`, `locked_until`, `password_reset_token`, `password_reset_expires`, `updated_at`) VALUES
(21, 'BS. Nguyễn Thị Hương', 'bs.huong@clinic.com', '0909876543', '$2b$12$m8XsEbIy76eOnFYdJMyZiO5idMbVCF.56x6lZ.mlB5u8jamCo2DQ.', 'doctor', '2026-10-18 08:00:00', 1, '2026-11-01 08:40:00', 0, NULL, NULL, NULL, '2026-11-01 08:40:00'),
(22, 'BS. Lê Hoàng Nam', 'bs.nam@clinic.com', '0909876544', '$2b$12$m8XsEbIy76eOnFYdJMyZiO5idMbVCF.56x6lZ.mlB5u8jamCo2DQ.', 'doctor', '2026-10-19 09:00:00', 1, '2026-11-02 09:10:00', 0, NULL, NULL, NULL, '2026-11-02 09:10:00'),
(23, 'BS. Phan Thị Bích', 'bs.bich@clinic.com', '0909876545', '$2b$12$m8XsEbIy76eOnFYdJMyZiO5idMbVCF.56x6lZ.mlB5u8jamCo2DQ.', 'doctor', '2026-10-20 10:00:00', 1, '2026-11-03 10:15:00', 0, NULL, NULL, NULL, '2026-11-03 10:15:00'),
(24, 'BS. Dương Minh Anh', 'bs.anh@clinic.com', '0909876546', '$2b$12$m8XsEbIy76eOnFYdJMyZiO5idMbVCF.56x6lZ.mlB5u8jamCo2DQ.', 'doctor', '2026-10-21 11:00:00', 1, '2026-11-04 11:20:00', 0, NULL, NULL, NULL, '2026-11-04 11:20:00');

INSERT INTO `doctors` (`id`, `user_id`, `department_id`, `degree`) VALUES
(7, 21, 5, 'Bác sĩ Chuyên khoa I'),
(8, 22, 4, 'Bác sĩ Sản phụ khoa'),
(9, 23, 7, 'Thạc sĩ - Bác sĩ'),
(10, 24, 8, 'Bác sĩ Tai mũi họng');

-- Lịch hẹn demo (có trạng thái khác nhau)
INSERT INTO `appointments` (`id`, `patient_id`, `doctor_id`, `appointment_date`, `time_slot`, `qr_code_token`, `status`, `created_at`) VALUES
(1, 1, 2, '2026-11-01', '08:00-08:30', 'QR-20261101-001', 'completed', '2026-10-29 08:00:00'),
(2, 3, 1, '2026-11-02', '09:00-09:30', 'QR-20261102-002', 'completed', '2026-10-30 09:00:00'),
(3, 4, 4, '2026-11-03', '14:00-14:30', 'QR-20261103-003', 'checked_in', '2026-10-31 14:00:00'),
(4, 5, 2, '2026-11-04', '15:30-16:00', 'QR-20261104-004', 'booked', '2026-11-01 15:30:00'),
(5, 13, 7, '2026-11-05', '10:00-10:30', 'QR-20261105-005', 'completed', '2026-11-02 10:00:00'),
(6, 14, 8, '2026-11-06', '08:30-09:00', 'QR-20261106-006', 'booked', '2026-11-03 08:30:00'),
(7, 15, 9, '2026-11-07', '09:30-10:00', 'QR-20261107-007', 'completed', '2026-11-04 09:30:00'),
(8, 16, 10, '2026-11-08', '11:00-11:30', 'QR-20261108-008', 'checked_in', '2026-11-05 11:00:00'),
(9, 17, 6, '2026-11-09', '13:30-14:00', 'QR-20261109-009', 'cancelled', '2026-11-06 13:30:00'),
(10, 18, 3, '2026-11-10', '16:00-16:30', 'QR-20261110-010', 'booked', '2026-11-07 16:00:00'),
(11, 19, 5, '2026-11-11', '08:00-08:30', 'QR-20261111-011', 'booked', '2026-11-08 08:00:00'),
(12, 20, 3, '2026-11-12', '10:30-11:00', 'QR-20261112-012', 'completed', '2026-11-09 10:30:00');

-- Hồ sơ bệnh án demo
INSERT INTO `medical_records` (`id`, `appointment_id`, `symptoms`, `diagnosis`, `note`, `reexamination_date`, `created_at`) VALUES
(1, 1, 'Đau đầu, buồn nôn, chóng mặt trong 2 ngày', 'Căng thẳng thần kinh, viêm xoang cấp', 'Khuyên nghỉ ngơi, uống đủ nước và theo dõi', '2026-11-15', '2026-11-01 09:00:00'),
(2, 2, 'Sốt nhẹ, ho có đờm, đau họng', 'Viêm họng, cảm cúm nhẹ', 'Dùng thuốc giảm đau, nghỉ ngơi 3 ngày', '2026-11-16', '2026-11-02 09:45:00'),
(3, 5, 'Sốt cao, ăn uống kém, quấy khóc', 'Viêm đường hô hấp cấp ở trẻ em', 'Theo dõi nhiệt độ, uống thuốc theo đơn, tái khám nếu sốt kéo dài', '2026-11-18', '2026-11-05 10:45:00'),
(4, 7, 'Nhìn mờ, đau mắt, chảy nước mắt', 'Căng thẳng thị lực, viêm kết mạc nhẹ', 'Hạn chế màn hình, dùng thuốc nhỏ mắt theo đơn', '2026-11-20', '2026-11-07 10:15:00'),
(5, 12, 'Đau bụng vùng hạ sườn, buồn nôn', 'Viêm loét dạ dày nhẹ', 'Ăn nhạt, không uống rượu bia, uống thuốc sau ăn', '2026-11-22', '2026-11-12 11:15:00');

-- Đơn thuốc mẫu
INSERT INTO `prescriptions` (`id`, `medical_record_id`, `medicine_name`, `dosage`, `quantity`, `instructions`) VALUES
(1, 1, 'Paracetamol 500mg', '1 viên/lần', 10, 'Uống sau ăn 1 lần mỗi 8 giờ khi đau'),
(2, 1, 'Vitamin C', '1 viên/ngày', 14, 'Uống vào buổi sáng sau ăn'),
(3, 2, 'Amoxicillin 500mg', '1 viên/lần', 10, 'Uống 2 lần/ngày sau ăn trong 5 ngày'),
(4, 3, 'Ibuprofen 200mg', '1 viên/lần', 12, 'Uống khi sốt hoặc đau đầu, tối đa 3 lần/ngày'),
(5, 4, 'Tobramycin Eye Drop', '2 giọt/mắt', 1, 'Nhỏ mắt 2 lần/ngày, dùng hàng ngày trong 5 ngày'),
(6, 5, 'Omeprazole 20mg', '1 viên/ngày', 14, 'Uống trước bữa sáng 30 phút');

SET FOREIGN_KEY_CHECKS = 1;
