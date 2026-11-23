# 🔐 DANH SÁCH TÀI KHOẢN TEST - THCT CLINIC

## 📌 Thông Tin Chung

**Password chung cho TẤT CẢ tài khoản:**
```
Password123!
```

**Lưu ý:** Tất cả mật khẩu đã được mã hóa bằng bcrypt với salt rounds 12

---

## 👥 CÁC TÀI KHOẢN THEO VAI TRÒ

### 1. 👑 ADMIN (Quản Trị Viên)

| Họ Tên | Email | Số điện thoại | Username | Password |
|--------|-------|---------------|----------|----------|
| Quản Trị Viên | admin@clinic.com | 0901234571 | admin@clinic.com | Password123! |

**Quyền hạn:**
- Quản lý toàn bộ hệ thống
- Xem tất cả báo cáo thống kê
- Quản lý người dùng (User Management)
- Xem lịch sử audit logs
- Quản lý lịch hẹn toàn bộ
- Xem báo cáo doanh thu

---

### 2. 👔 LỄ TÂN (Receptionist)

| Họ Tên | Email | Số điện thoại | Username | Password |
|--------|-------|---------------|----------|----------|
| Lễ Tân 01 | letan@gmail.com | 0901234568 | letan@gmail.com | Password123! |

**Quyền hạn:**
- Quét QR Code check-in bệnh nhân
- Đặt lịch hẹn cho bệnh nhân (hỗ trợ đặt lịch)
- Tìm kiếm bệnh nhân (theo tên/SĐT)
- Xem lịch hẹn hôm nay
- Xử lý thanh toán tiền thuốc

---

### 3. 👨‍⚕️ BÁC SĨ (Doctor)

| STT | Họ Tên | Email | Số điện thoại | Chuyên Khoa | Học vị |
|-----|--------|-------|---------------|-------------|---------|
| 1 | BS. Nguyễn Văn Phong | bsphong@clinic.com | 0967890123 | Nội Tổng Quát | BS Chuyên khoa I |
| 2 | BS. Trần Thị Giang | bsgiang@clinic.com | 0978901234 | Tim Mạch | BS Chuyên khoa II |
| 3 | BS. Lê Minh Hiếu | bshieu@clinic.com | 0989012345 | Ngoại Tổng Quát | BS Đa khoa |
| 4 | ThS.BS. Phạm Thị Hoa | bshoa@clinic.com | 0990123456 | Tim Mạch | Thạc sĩ - Bác sĩ |
| 5 | BS. Võ Văn Khánh | bskhanh@clinic.com | 0901234572 | Nội Tổng Quát | BS Chuyên khoa I |
| 6 | BS. Hoàng Thị Lan | bslan@clinic.com | 0901234573 | Nội Tổng Quát | BS Đa khoa |
| 7 | BS. Nguyễn Thị Hương | bs.huong@clinic.com | 0909876543 | Nhi | BS Chuyên khoa I |
| 8 | BS. Lê Hoàng Nam | bs.nam@clinic.com | 0909876544 | Sản - Phụ Khoa | BS Sản phụ khoa |
| 9 | BS. Phan Thị Bích | bs.bich@clinic.com | 0909876545 | Mắt | Thạc sĩ - Bác sĩ |
| 10 | BS. Dương Minh Anh | bs.anh@clinic.com | 0909876546 | Tai - Mũi - Họng | BS Tai mũi họng |

**Password chung:** `Password123!`

**Quyền hạn:**
- Xem danh sách bệnh nhân chờ khám
- Xem hồ sơ bệnh án
- Tạo/Cập nhật hồ sơ khám bệnh
- Kê đơn thuốc
- KHÔNG được đặt lịch khám (bác sĩ không đặt lịch)

---

### 4. 👤 BỆNH NHÂN (Patient)

#### Bệnh nhân chính (trong database gốc):

| STT | Họ Tên | Email | Số điện thoại | Username | Password |
|-----|--------|-------|---------------|----------|----------|
| 1 | Đỗ Chí Tùng | chitung@gmail.com | 0901234567 | chitung@gmail.com | Password123! |
| 2 | Nguyễn Văn An | vanan@gmail.com | 0912345678 | vanan@gmail.com | Password123! |
| 3 | Trần Thị Bình | thibinh@gmail.com | 0923456789 | thibinh@gmail.com | Password123! |
| 4 | Lê Minh Châu | minhchau@gmail.com | 0934567890 | minhchau@gmail.com | Password123! |

#### Bệnh nhân demo bổ sung:

| STT | Họ Tên | Email | Số điện thoại | Username | Password |
|-----|--------|-------|---------------|----------|----------|
| 5 | Nguyễn Thị Mai | mai.nguyen@gmail.com | 0907654321 | mai.nguyen@gmail.com | Password123! |
| 6 | Phạm Quốc Huy | huy.pham@gmail.com | 0907654322 | huy.pham@gmail.com | Password123! |
| 7 | Trần Thanh Lan | lan.tran@gmail.com | 0907654323 | lan.tran@gmail.com | Password123! |
| 8 | Võ Minh Tâm | tam.vo@gmail.com | 0907654324 | tam.vo@gmail.com | Password123! |
| 9 | Hoàng Nhật Anh | nhatan.hoang@gmail.com | 0907654325 | nhatan.hoang@gmail.com | Password123! |
| 10 | Đặng Hồng Nhung | nhung.dang@gmail.com | 0907654326 | nhung.dang@gmail.com | Password123! |
| 11 | Bùi Văn Dũng | dung.bui@gmail.com | 0907654327 | dung.bui@gmail.com | Password123! |
| 12 | Lý Thu Hà | ha.ly@gmail.com | 0907654328 | ha.ly@gmail.com | Password123! |

**Quyền hạn:**
- Đặt lịch khám (với thanh toán)
- Xem lịch sử lịch hẹn
- Xem hồ sơ y tế của mình
- Hủy/Đổi lịch hẹn
- Xem Mã QR của mình
- Xem lịch sử thanh toán

---

## 🏥 CHUYÊN KHOA TRONG HỆ THỐNG

| ID | Tên Chuyên Khoa | Phí khám |
|----|-----------------|----------|
| 1 | Nội Tổng Quát | 150,000đ |
| 2 | Tim Mạch | 220,000đ |
| 3 | Ngoại Tổng Quát | 200,000đ |
| 4 | Sản - Phụ Khoa | 250,000đ |
| 5 | Nhi | 180,000đ |
| 6 | Da Liễu | 170,000đ |
| 7 | Mắt | 180,000đ |
| 8 | Tai - Mũi - Họng | 200,000đ |

---

## 🧪 HƯỚNG DẪN TEST

### Test Case 1: Đặt lịch khám (Bệnh nhân)
1. Đăng nhập với: `chitung@gmail.com` / `Password123!`
2. Click "Đặt lịch khám"
3. Chọn chuyên khoa → Xem giá khám tự động hiển thị
4. Chọn bác sĩ, ngày, giờ
5. Click "Tiếp tục thanh toán"
6. Chọn phương thức thanh toán
7. Xác nhận và xem QR Code

### Test Case 2: Xem lịch sử thanh toán (Bệnh nhân)
1. Đăng nhập với: `mai.nguyen@gmail.com` / `Password123!`
2. Click "Lịch sử thanh toán" trong menu
3. Xem danh sách giao dịch
4. Kiểm tra thống kê tổng chi

### Test Case 3: Quét QR Check-in (Lễ tân)
1. Đăng nhập với: `letan@gmail.com` / `Password123!`
2. Click "Quét QR Check-in"
3. Quét mã QR của bệnh nhân
4. Xác nhận check-in thành công

### Test Case 4: Khám bệnh và kê đơn (Bác sĩ)
1. Đăng nhập với: `bsphong@clinic.com` / `Password123!`
2. Xem danh sách bệnh nhân chờ khám
3. Chọn bệnh nhân và tạo hồ sơ khám
4. Nhập chẩn đoán, kê đơn thuốc
5. Lưu hồ sơ

### Test Case 5: Quản lý hệ thống (Admin)
1. Đăng nhập với: `admin@clinic.com` / `Password123!`
2. Xem Dashboard với đầy đủ thống kê
3. Vào "User Management" để quản lý người dùng
4. Xem "Quản lý lịch hẹn" với audit logs
5. Xem báo cáo doanh thu (API đã có)

---

## 📝 GHI CHÚ QUAN TRỌNG

1. **Email = Username**: Sử dụng email để đăng nhập
2. **Password chung**: Tất cả tài khoản đều dùng `Password123!`
3. **Đã verify email**: Tất cả tài khoản đều đã xác thực email (`email_verified = 1`)
4. **Database**: `kltn_clinic`
5. **Cổng backend**: `http://localhost:5000`
6. **Cổng frontend**: `http://localhost:3000`

---

## 🔄 RESET TÀI KHOẢN

Nếu muốn reset tất cả về trạng thái ban đầu:

```sql
-- 1. Xóa dữ liệu cũ
TRUNCATE TABLE appointments;
TRUNCATE TABLE medical_records;
TRUNCATE TABLE prescriptions;
TRUNCATE TABLE auth_audit_logs;
TRUNCATE TABLE payment_transactions;

-- 2. Chạy lại file SQL
SOURCE database/kltn_clinic.sql;
SOURCE database/payment_system.sql;
SOURCE database/demo_seed.sql;
```

---

## 📞 LIÊN HỆ HỖ TRỢ

- Sinh viên thực hiện: Nguyễn Thu Hằng, Đỗ Chí Tùng
- GVHD: TS. Ngô Hữu Dũng
- Năm: 2026

---

**📅 Ngày cập nhật:** 09/11/2026  
**🔖 Phiên bản:** 1.0 - Payment System Integrated
