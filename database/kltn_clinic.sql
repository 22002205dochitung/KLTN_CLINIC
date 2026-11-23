-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: Sep 17, 2026 at 03:43 AM
-- Server version: 10.4.32-MariaDB
-- PHP Version: 8.1.25

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `kltn_clinic`
--

-- --------------------------------------------------------

--
-- Table structure for table `appointments`
--

CREATE TABLE `appointments` (
  `id` int(11) NOT NULL,
  `patient_id` int(11) DEFAULT NULL,
  `doctor_id` int(11) DEFAULT NULL,
  `appointment_date` date NOT NULL,
  `time_slot` varchar(20) NOT NULL,
  `qr_code_token` varchar(255) NOT NULL,
  `status` enum('booked','checked_in','completed','cancelled') DEFAULT 'booked',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `symptoms` text DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `auth_audit_logs`
--

CREATE TABLE `auth_audit_logs` (
  `log_id` int(11) NOT NULL,
  `user_id` int(11) DEFAULT NULL,
  `action` varchar(50) NOT NULL,
  `ip_address` varchar(45) NOT NULL,
  `user_agent` text DEFAULT NULL,
  `success` tinyint(1) NOT NULL,
  `failure_reason` varchar(255) DEFAULT NULL,
  `timestamp` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `departments`
--

CREATE TABLE `departments` (
  `id` int(11) NOT NULL,
  `name` varchar(150) NOT NULL,
  `description` text DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_unicode_ci;

--
-- Dumping data for table `departments`
--

INSERT INTO `departments` (`id`, `name`, `description`) VALUES
(1, 'Khoa Khám Bệnh - Nội Tổng Quát', 'Khám và điều trị các bệnh lý nội khoa tổng quát.'),
(2, 'Khoa Tim Mạch', 'Chuyên khoa sâu về tim mạch và huyết áp.'),
(3, 'Khoa Ngoại Tổng Quát', 'Phẫu thuật và điều trị các bệnh lý ngoại khoa.'),
(4, 'Khoa Sản - Phụ Khoa', 'Chăm sóc sức khỏe phụ nữ, thai sản.'),
(5, 'Khoa Nhi', 'Khám và điều trị bệnh cho trẻ em.'),
(6, 'Khoa Da Liễu', 'Điều trị các bệnh về da, tóc, móng.'),
(7, 'Khoa Mắt', 'Khám và điều trị các bệnh về mắt.'),
(8, 'Khoa Tai - Mũi - Họng', 'Điều trị các bệnh lý về tai, mũi, họng.');

-- --------------------------------------------------------

--
-- Table structure for table `doctors`
--

CREATE TABLE `doctors` (
  `id` int(11) NOT NULL,
  `user_id` int(11) DEFAULT NULL,
  `department_id` int(11) DEFAULT NULL,
  `degree` varchar(50) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `medical_records`
--

CREATE TABLE `medical_records` (
  `id` int(11) NOT NULL,
  `appointment_id` int(11) DEFAULT NULL,
  `symptoms` text DEFAULT NULL,
  `diagnosis` text DEFAULT NULL,
  `note` text DEFAULT NULL,
  `reexamination_date` date DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `prescriptions`
--

CREATE TABLE `prescriptions` (
  `id` int(11) NOT NULL,
  `medical_record_id` int(11) DEFAULT NULL,
  `medicine_name` varchar(150) NOT NULL,
  `dosage` varchar(100) NOT NULL,
  `quantity` int(11) NOT NULL,
  `instructions` text DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `users`
--

CREATE TABLE `users` (
  `id` int(11) NOT NULL,
  `fullname` varchar(100) NOT NULL,
  `email` varchar(100) NOT NULL,
  `phone` varchar(15) NOT NULL,
  `password` varchar(255) NOT NULL,
  `role` enum('patient','receptionist','doctor','admin') DEFAULT 'patient',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `email_verified` tinyint(1) DEFAULT 0,
  `last_login` timestamp NULL DEFAULT NULL,
  `login_attempts` int(11) DEFAULT 0,
  `locked_until` timestamp NULL DEFAULT NULL,
  `password_reset_token` varchar(255) DEFAULT NULL,
  `password_reset_expires` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_unicode_ci;

--
-- Dumping data for table `users`
--
-- Password cho tất cả users: "Password123!" (đã hash bằng bcrypt với salt rounds 12)
--

INSERT INTO `users` (`id`, `fullname`, `email`, `phone`, `password`, `role`, `created_at`, `email_verified`, `last_login`, `login_attempts`, `locked_until`, `password_reset_token`, `password_reset_expires`, `updated_at`) VALUES
(1, 'Đỗ Chí Tùng', 'chitung@gmail.com', '0901234567', '$2b$12$m8XsEbIy76eOnFYdJMyZiO5idMbVCF.56x6lZ.mlB5u8jamCo2DQ.', 'patient', '2026-09-15 02:17:20', 1, NULL, 0, NULL, NULL, NULL, '2026-09-15 07:11:12'),
(2, 'Lễ Tân 01', 'letan@gmail.com', '0901234568', '$2b$12$m8XsEbIy76eOnFYdJMyZiO5idMbVCF.56x6lZ.mlB5u8jamCo2DQ.', 'receptionist', '2026-09-15 02:17:20', 1, NULL, 0, NULL, NULL, NULL, '2026-09-15 07:11:12'),
(3, 'Nguyễn Văn An', 'vanan@gmail.com', '0912345678', '$2b$12$m8XsEbIy76eOnFYdJMyZiO5idMbVCF.56x6lZ.mlB5u8jamCo2DQ.', 'patient', '2026-09-16 03:00:00', 1, '2026-09-17 02:30:00', 0, NULL, NULL, NULL, '2026-09-17 02:30:00'),
(4, 'Trần Thị Bình', 'thibinh@gmail.com', '0923456789', '$2b$12$m8XsEbIy76eOnFYdJMyZiO5idMbVCF.56x6lZ.mlB5u8jamCo2DQ.', 'patient', '2026-09-16 04:00:00', 1, '2026-09-17 01:15:00', 0, NULL, NULL, NULL, '2026-09-17 01:15:00'),
(5, 'Lê Minh Châu', 'minhchau@gmail.com', '0934567890', '$2b$12$m8XsEbIy76eOnFYdJMyZiO5idMbVCF.56x6lZ.mlB5u8jamCo2DQ.', 'patient', '2026-09-16 05:00:00', 1, NULL, 0, NULL, NULL, NULL, '2026-09-16 05:00:00'),
(6, 'BS. Nguyễn Văn Phong', 'bsphong@clinic.com', '0967890123', '$2b$12$m8XsEbIy76eOnFYdJMyZiO5idMbVCF.56x6lZ.mlB5u8jamCo2DQ.', 'doctor', '2026-09-14 01:00:00', 1, '2026-09-17 00:30:00', 0, NULL, NULL, NULL, '2026-09-17 00:30:00'),
(7, 'BS. Trần Thị Giang', 'bsgiang@clinic.com', '0978901234', '$2b$12$m8XsEbIy76eOnFYdJMyZiO5idMbVCF.56x6lZ.mlB5u8jamCo2DQ.', 'doctor', '2026-09-14 02:00:00', 1, '2026-09-17 01:45:00', 0, NULL, NULL, NULL, '2026-09-17 01:45:00'),
(8, 'BS. Lê Minh Hiếu', 'bshieu@clinic.com', '0989012345', '$2b$12$m8XsEbIy76eOnFYdJMyZiO5idMbVCF.56x6lZ.mlB5u8jamCo2DQ.', 'doctor', '2026-09-14 03:00:00', 1, '2026-09-16 09:00:00', 0, NULL, NULL, NULL, '2026-09-16 09:00:00'),
(9, 'ThS.BS. Phạm Thị Hoa', 'bshoa@clinic.com', '0990123456', '$2b$12$m8XsEbIy76eOnFYdJMyZiO5idMbVCF.56x6lZ.mlB5u8jamCo2DQ.', 'doctor', '2026-09-14 04:00:00', 1, '2026-09-17 02:00:00', 0, NULL, NULL, NULL, '2026-09-17 02:00:00'),
(10, 'BS. Võ Văn Khánh', 'bskhanh@clinic.com', '0901234572', '$2b$12$m8XsEbIy76eOnFYdJMyZiO5idMbVCF.56x6lZ.mlB5u8jamCo2DQ.', 'doctor', '2026-09-14 05:00:00', 1, '2026-09-16 08:00:00', 0, NULL, NULL, NULL, '2026-09-16 08:00:00'),
(11, 'BS. Hoàng Thị Lan', 'bslan@clinic.com', '0901234573', '$2b$12$m8XsEbIy76eOnFYdJMyZiO5idMbVCF.56x6lZ.mlB5u8jamCo2DQ.', 'doctor', '2026-09-14 06:00:00', 1, '2026-09-16 07:00:00', 0, NULL, NULL, NULL, '2026-09-16 07:00:00'),
(12, 'Quản Trị Viên', 'admin@clinic.com', '0901234571', '$2b$12$m8XsEbIy76eOnFYdJMyZiO5idMbVCF.56x6lZ.mlB5u8jamCo2DQ.', 'admin', '2026-09-15 01:00:00', 1, '2026-09-17 03:00:00', 0, NULL, NULL, NULL, '2026-09-17 03:00:00');

-- --------------------------------------------------------

--
-- Dumping data for table `doctors`
--

INSERT INTO `doctors` (`id`, `user_id`, `department_id`, `degree`) VALUES
(1, 6, 1, 'Bác sĩ Chuyên khoa I'),
(2, 7, 2, 'Bác sĩ Chuyên khoa II'),
(3, 8, 3, 'Bác sĩ Đa khoa'),
(4, 9, 2, 'Thạc sĩ - Bác sĩ'),
(5, 10, 1, 'Bác sĩ Chuyên khoa I'),
(6, 11, 1, 'Bác sĩ Đa khoa');

-- --------------------------------------------------------

--
-- Table structure for table `user_sessions`
--

CREATE TABLE `user_sessions` (
  `session_id` varchar(255) NOT NULL,
  `user_id` int(11) NOT NULL,
  `token_hash` varchar(255) NOT NULL,
  `expires_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `is_active` tinyint(1) DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_unicode_ci;

--
-- Indexes for dumped tables
--

--
-- Indexes for table `appointments`
--
ALTER TABLE `appointments`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `qr_code_token` (`qr_code_token`),
  ADD KEY `patient_id` (`patient_id`),
  ADD KEY `doctor_id` (`doctor_id`);

--
-- Indexes for table `auth_audit_logs`
--
ALTER TABLE `auth_audit_logs`
  ADD PRIMARY KEY (`log_id`),
  ADD KEY `idx_audit_user` (`user_id`),
  ADD KEY `idx_audit_action` (`action`),
  ADD KEY `idx_audit_timestamp` (`timestamp`),
  ADD KEY `idx_audit_ip` (`ip_address`);

--
-- Indexes for table `departments`
--
ALTER TABLE `departments`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `doctors`
--
ALTER TABLE `doctors`
  ADD PRIMARY KEY (`id`),
  ADD KEY `user_id` (`user_id`),
  ADD KEY `department_id` (`department_id`);

--
-- Indexes for table `medical_records`
--
ALTER TABLE `medical_records`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `appointment_id` (`appointment_id`);

--
-- Indexes for table `prescriptions`
--
ALTER TABLE `prescriptions`
  ADD PRIMARY KEY (`id`),
  ADD KEY `medical_record_id` (`medical_record_id`);

--
-- Indexes for table `users`
--
ALTER TABLE `users`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `email` (`email`),
  ADD UNIQUE KEY `phone` (`phone`),
  ADD KEY `idx_users_email_verified` (`email`,`email_verified`),
  ADD KEY `idx_users_reset_token` (`password_reset_token`),
  ADD KEY `idx_users_locked_until` (`locked_until`);

--
-- Indexes for table `user_sessions`
--
ALTER TABLE `user_sessions`
  ADD PRIMARY KEY (`session_id`),
  ADD KEY `idx_user_sessions_user` (`user_id`),
  ADD KEY `idx_user_sessions_expires` (`expires_at`),
  ADD KEY `idx_user_sessions_token` (`token_hash`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `appointments`
--
ALTER TABLE `appointments`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `auth_audit_logs`
--
ALTER TABLE `auth_audit_logs`
  MODIFY `log_id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `departments`
--
ALTER TABLE `departments`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=9;

--
-- AUTO_INCREMENT for table `doctors`
--
ALTER TABLE `doctors`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=7;

--
-- AUTO_INCREMENT for table `medical_records`
--
ALTER TABLE `medical_records`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `prescriptions`
--
ALTER TABLE `prescriptions`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `users`
--
ALTER TABLE `users`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=13;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `appointments`
--
ALTER TABLE `appointments`
  ADD CONSTRAINT `appointments_ibfk_1` FOREIGN KEY (`patient_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `appointments_ibfk_2` FOREIGN KEY (`doctor_id`) REFERENCES `doctors` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `auth_audit_logs`
--
ALTER TABLE `auth_audit_logs`
  ADD CONSTRAINT `auth_audit_logs_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `doctors`
--
ALTER TABLE `doctors`
  ADD CONSTRAINT `doctors_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `doctors_ibfk_2` FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `medical_records`
--
ALTER TABLE `medical_records`
  ADD CONSTRAINT `medical_records_ibfk_1` FOREIGN KEY (`appointment_id`) REFERENCES `appointments` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `prescriptions`
--
ALTER TABLE `prescriptions`
  ADD CONSTRAINT `prescriptions_ibfk_1` FOREIGN KEY (`medical_record_id`) REFERENCES `medical_records` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `user_sessions`
--
ALTER TABLE `user_sessions`
  ADD CONSTRAINT `user_sessions_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;

-- --------------------------------------------------------
-- Demo data bổ sung cho THCT Clinic System
-- --------------------------------------------------------

INSERT INTO `users` (`id`, `fullname`, `email`, `phone`, `password`, `role`, `created_at`, `email_verified`, `last_login`, `login_attempts`, `locked_until`, `password_reset_token`, `password_reset_expires`, `updated_at`) VALUES
(13, 'Nguyễn Thị Mai', 'mai.nguyen@gmail.com', '0907654321', '$2b$12$m8XsEbIy76eOnFYdJMyZiO5idMbVCF.56x6lZ.mlB5u8jamCo2DQ.', 'patient', '2026-10-10 08:00:00', 1, '2026-11-01 08:30:00', 0, NULL, NULL, NULL, '2026-11-01 08:30:00'),
(14, 'Phạm Quốc Huy', 'huy.pham@gmail.com', '0907654322', '$2b$12$m8XsEbIy76eOnFYdJMyZiO5idMbVCF.56x6lZ.mlB5u8jamCo2DQ.', 'patient', '2026-10-11 09:15:00', 1, '2026-11-02 09:20:00', 0, NULL, NULL, NULL, '2026-11-02 09:20:00'),
(15, 'Trần Thanh Lan', 'lan.tran@gmail.com', '0907654323', '$2b$12$m8XsEbIy76eOnFYdJMyZiO5idMbVCF.56x6lZ.mlB5u8jamCo2DQ.', 'patient', '2026-10-12 10:20:00', 1, '2026-11-03 10:25:00', 0, NULL, NULL, NULL, '2026-11-03 10:25:00'),
(16, 'Võ Minh Tâm', 'tam.vo@gmail.com', '0907654324', '$2b$12$m8XsEbIy76eOnFYdJMyZiO5idMbVCF.56x6lZ.mlB5u8jamCo2DQ.', 'patient', '2026-10-13 11:00:00', 1, '2026-11-04 11:15:00', 0, NULL, NULL, NULL, '2026-11-04 11:15:00'),
(17, 'Hoàng Nhật Anh', 'nhatan.hoang@gmail.com', '0907654325', '$2b$12$m8XsEbIy76eOnFYdJMyZiO5idMbVCF.56x6lZ.mlB5u8jamCo2DQ.', 'patient', '2026-10-14 14:20:00', 1, '2026-11-05 14:30:00', 0, NULL, NULL, NULL, '2026-11-05 14:30:00'),
(18, 'Đặng Hồng Nhung', 'nhung.dang@gmail.com', '0907654326', '$2b$12$m8XsEbIy76eOnFYdJMyZiO5idMbVCF.56x6lZ.mlB5u8jamCo2DQ.', 'patient', '2026-10-15 15:35:00', 1, '2026-11-06 16:00:00', 0, NULL, NULL, NULL, '2026-11-06 16:00:00'),
(19, 'Bùi Văn Dũng', 'dung.bui@gmail.com', '0907654327', '$2b$12$m8XsEbIy76eOnFYdJMyZiO5idMbVCF.56x6lZ.mlB5u8jamCo2DQ.', 'patient', '2026-10-16 07:40:00', 1, '2026-11-07 07:50:00', 0, NULL, NULL, NULL, '2026-11-07 07:50:00'),
(20, 'Lý Thu Hà', 'ha.ly@gmail.com', '0907654328', '$2b$12$m8XsEbIy76eOnFYdJMyZiO5idMbVCF.56x6lZ.mlB5u8jamCo2DQ.', 'patient', '2026-10-17 08:00:00', 1, '2026-11-08 08:20:00', 0, NULL, NULL, NULL, '2026-11-08 08:20:00'),
(21, 'BS. Nguyễn Thị Hương', 'bs.huong@clinic.com', '0909876543', '$2b$12$m8XsEbIy76eOnFYdJMyZiO5idMbVCF.56x6lZ.mlB5u8jamCo2DQ.', 'doctor', '2026-10-18 08:00:00', 1, '2026-11-01 08:40:00', 0, NULL, NULL, NULL, '2026-11-01 08:40:00'),
(22, 'BS. Lê Hoàng Nam', 'bs.nam@clinic.com', '0909876544', '$2b$12$m8XsEbIy76eOnFYdJMyZiO5idMbVCF.56x6lZ.mlB5u8jamCo2DQ.', 'doctor', '2026-10-19 09:00:00', 1, '2026-11-02 09:10:00', 0, NULL, NULL, NULL, '2026-11-02 09:10:00'),
(23, 'BS. Phan Thị Bích', 'bs.bich@clinic.com', '0909876545', '$2b$12$m8XsEbIy76eOnFYdJMyZiO5idMbVCF.56x6lZ.mlB5u8jamCo2DQ.', 'doctor', '2026-10-20 10:00:00', 1, '2026-11-03 10:15:00', 0, NULL, NULL, NULL, '2026-11-03 10:15:00'),
(24, 'BS. Dương Minh Anh', 'bs.anh@clinic.com', '0909876546', '$2b$12$m8XsEbIy76eOnFYdJMyZiO5idMbVCF.56x6lZ.mlB5u8jamCo2DQ.', 'doctor', '2026-10-21 11:00:00', 1, '2026-11-04 11:20:00', 0, NULL, NULL, NULL, '2026-11-04 11:20:00');

INSERT INTO `doctors` (`id`, `user_id`, `department_id`, `degree`) VALUES
(7, 21, 5, 'Bác sĩ Chuyên khoa I'),
(8, 22, 4, 'Bác sĩ Sản phụ khoa'),
(9, 23, 7, 'Thạc sĩ - Bác sĩ'),
(10, 24, 8, 'Bác sĩ Tai mũi họng');

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

INSERT INTO `medical_records` (`id`, `appointment_id`, `symptoms`, `diagnosis`, `note`, `reexamination_date`, `created_at`) VALUES
(1, 1, 'Đau đầu, buồn nôn, chóng mặt trong 2 ngày', 'Căng thẳng thần kinh, viêm xoang cấp', 'Khuyên nghỉ ngơi, uống đủ nước và theo dõi', '2026-11-15', '2026-11-01 09:00:00'),
(2, 2, 'Sốt nhẹ, ho có đờm, đau họng', 'Viêm họng, cảm cúm nhẹ', 'Dùng thuốc giảm đau, nghỉ ngơi 3 ngày', '2026-11-16', '2026-11-02 09:45:00'),
(3, 5, 'Sốt cao, ăn uống kém, quấy khóc', 'Viêm đường hô hấp cấp ở trẻ em', 'Theo dõi nhiệt độ, uống thuốc theo đơn, tái khám nếu sốt kéo dài', '2026-11-18', '2026-11-05 10:45:00'),
(4, 7, 'Nhìn mờ, đau mắt, chảy nước mắt', 'Căng thẳng thị lực, viêm kết mạc nhẹ', 'Hạn chế màn hình, dùng thuốc nhỏ mắt theo đơn', '2026-11-20', '2026-11-07 10:15:00'),
(5, 12, 'Đau bụng vùng hạ sườn, buồn nôn', 'Viêm loét dạ dày nhẹ', 'Ăn nhạt, không uống rượu bia, uống thuốc sau ăn', '2026-11-22', '2026-11-12 11:15:00');

INSERT INTO `prescriptions` (`id`, `medical_record_id`, `medicine_name`, `dosage`, `quantity`, `instructions`) VALUES
(1, 1, 'Paracetamol 500mg', '1 viên/lần', 10, 'Uống sau ăn 1 lần mỗi 8 giờ khi đau'),
(2, 1, 'Vitamin C', '1 viên/ngày', 14, 'Uống vào buổi sáng sau ăn'),
(3, 2, 'Amoxicillin 500mg', '1 viên/lần', 10, 'Uống 2 lần/ngày sau ăn trong 5 ngày'),
(4, 3, 'Ibuprofen 200mg', '1 viên/lần', 12, 'Uống khi sốt hoặc đau đầu, tối đa 3 lần/ngày'),
(5, 4, 'Tobramycin Eye Drop', '2 giọt/mắt', 1, 'Nhỏ mắt 2 lần/ngày, dùng hàng ngày trong 5 ngày'),
(6, 5, 'Omeprazole 20mg', '1 viên/ngày', 14, 'Uống trước bữa sáng 30 phút');