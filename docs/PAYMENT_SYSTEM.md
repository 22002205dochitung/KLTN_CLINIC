# 💰 Hệ Thống Thanh Toán - Payment System

## 📋 Tổng Quan

Hệ thống thanh toán bao gồm 2 loại:
1. **Thanh toán phí khám** - Khi đặt lịch hẹn
2. **Thanh toán tiền thuốc** - Sau khi bác sĩ kê đơn

---

## 🗄️ Database Schema

### 1. Bảng `consultation_fees` - Bảng giá khám
Lưu giá khám theo từng chuyên khoa.

```sql
CREATE TABLE consultation_fees (
    id INT PRIMARY KEY AUTO_INCREMENT,
    department_id INT NOT NULL,
    fee_amount DECIMAL(10, 2) NOT NULL,  -- Phí khám (VNĐ)
    description VARCHAR(255),
    effective_from DATE NOT NULL,         -- Ngày áp dụng
    effective_to DATE NULL,               -- Ngày hết hạn
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);
```

**Giá mặc định:**
- Nội khoa: 150,000 VNĐ
- Ngoại khoa: 200,000 VNĐ
- Nhi khoa: 180,000 VNĐ
- Sản khoa: 250,000 VNĐ
- Tai Mũi Họng: 200,000 VNĐ
- Mắt: 200,000 VNĐ
- Da liễu: 180,000 VNĐ
- Răng Hàm Mặt: 220,000 VNĐ

### 2. Bảng `payment_transactions` - Giao dịch thanh toán
Lưu tất cả giao dịch thanh toán trong hệ thống.

```sql
CREATE TABLE payment_transactions (
    id INT PRIMARY KEY AUTO_INCREMENT,
    transaction_type ENUM('consultation', 'medication', 'other'),
    reference_id INT NOT NULL,            -- appointment_id hoặc medical_record_id
    patient_id INT NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    payment_method ENUM('cash', 'bank_transfer', 'card', 'momo', 'vnpay'),
    payment_status ENUM('pending', 'completed', 'failed', 'refunded'),
    paid_at TIMESTAMP NULL,
    notes TEXT,
    created_by INT NULL,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);
```

### 3. Cập nhật bảng `appointments`
Thêm thông tin thanh toán phí khám:

```sql
ALTER TABLE appointments ADD COLUMN:
- consultation_fee DECIMAL(10, 2)        -- Phí khám
- payment_status ENUM('unpaid', 'paid', 'refunded')
- payment_method ENUM('cash', 'bank_transfer', 'card', 'momo', 'vnpay')
```

### 4. Cập nhật bảng `medical_records`
Thêm thông tin thanh toán thuốc:

```sql
ALTER TABLE medical_records ADD COLUMN:
- medication_total DECIMAL(10, 2)        -- Tổng tiền thuốc
- medication_payment_status ENUM('unpaid', 'paid', 'partial')
- medication_payment_method ENUM('cash', 'bank_transfer', 'card', 'momo', 'vnpay')
- medication_paid_at TIMESTAMP
```

---

## 🔄 Flow Thanh Toán

### Flow 1: Thanh Toán Phí Khám

```
1. Bệnh nhân đặt lịch khám
   ↓
2. Hệ thống tự động lấy giá khám từ consultation_fees theo department_id
   ↓
3. Hiển thị form thanh toán:
   - Phí khám: 150,000 VNĐ
   - Phương thức: [Tiền mặt] [Chuyển khoản] [Thẻ]
   ↓
4. Bệnh nhân chọn phương thức và xác nhận
   ↓
5. Tạo appointment với:
   - consultation_fee = 150000
   - payment_status = 'paid' (nếu thanh toán ngay) hoặc 'unpaid'
   - payment_method = 'cash'
   ↓
6. Tạo payment_transaction:
   - transaction_type = 'consultation'
   - reference_id = appointment.id
   - amount = 150000
   - payment_status = 'completed'
```

### Flow 2: Thanh Toán Tiền Thuốc

```
1. Bác sĩ khám và kê đơn thuốc
   ↓
2. Tính tổng tiền thuốc (có thể manual hoặc tự động từ drug database)
   ↓
3. Lưu medical_record với:
   - prescription = "Thuốc A: 50,000 VNĐ\nThuốc B: 30,000 VNĐ"
   - medication_total = 80000
   - medication_payment_status = 'unpaid'
   ↓
4. Bệnh nhân đến quầy lễ tân thanh toán
   ↓
5. Lễ tân xác nhận thanh toán:
   - Update medical_record:
     * medication_payment_status = 'paid'
     * medication_payment_method = 'cash'
     * medication_paid_at = NOW()
   ↓
6. Tạo payment_transaction:
   - transaction_type = 'medication'
   - reference_id = medical_record.id
   - amount = 80000
   - payment_status = 'completed'
```

---

## 🎯 Tính Năng Cần Implement

### Backend API

#### 1. Consultation Fees
- `GET /api/consultation-fees` - Lấy bảng giá
- `GET /api/consultation-fees/department/:id` - Lấy giá theo chuyên khoa
- `POST /api/admin/consultation-fees` - Tạo giá mới (admin)
- `PUT /api/admin/consultation-fees/:id` - Cập nhật giá (admin)

#### 2. Payments
- `POST /api/payments/consultation` - Thanh toán phí khám
- `POST /api/payments/medication` - Thanh toán tiền thuốc
- `GET /api/payments/my-payments` - Lịch sử thanh toán của bệnh nhân
- `GET /api/admin/payments` - Tất cả giao dịch (admin)
- `GET /api/admin/payments/revenue` - Báo cáo doanh thu (admin)

#### 3. Update Existing APIs
- `POST /api/appointments/create` - Thêm xử lý thanh toán
- `POST /api/appointments/public/create` - Thêm xử lý thanh toán
- `POST /api/medical-records` - Thêm tính tổng tiền thuốc

### Frontend Components

#### 1. Payment Form
- `PaymentForm.jsx` - Form nhập thông tin thanh toán
- `PaymentMethod.jsx` - Chọn phương thức thanh toán
- `PaymentSummary.jsx` - Tóm tắt thanh toán

#### 2. Booking Enhancement
- Update `BookingForm.jsx` - Thêm bước thanh toán
- Update `PublicBookingForm.jsx` - Thêm bước thanh toán

#### 3. Medical Records Enhancement
- Update `MedicalRecordsForm.jsx` - Thêm trường tổng tiền thuốc
- `MedicationPayment.jsx` - Form thanh toán thuốc cho lễ tân

#### 4. Admin Dashboard
- `PaymentManagement.jsx` - Quản lý giao dịch
- `RevenueReport.jsx` - Báo cáo doanh thu
- `ConsultationFeeManagement.jsx` - Quản lý bảng giá

---

## 📊 Reports & Analytics

### Báo cáo cần có:

1. **Doanh thu theo ngày/tháng/năm**
2. **Doanh thu theo chuyên khoa**
3. **Doanh thu theo phương thức thanh toán**
4. **Tỷ lệ thanh toán trước/sau**
5. **Danh sách nợ (unpaid appointments)**
6. **Lịch sử thanh toán của bệnh nhân**

---

## 🔐 Security & Validation

### Backend Validation:
- ✅ Validate amount > 0
- ✅ Validate payment_method in allowed list
- ✅ Check patient owns the appointment
- ✅ Prevent duplicate payment
- ✅ Log all payment transactions to audit_logs

### Frontend Validation:
- ✅ Require payment method selection
- ✅ Confirm payment before submit
- ✅ Show payment summary
- ✅ Handle payment errors gracefully

---

## 🚀 Implementation Priority

### Phase 1: Basic Payment (High Priority)
1. ✅ Create database tables
2. ⏳ API for consultation fees
3. ⏳ Update booking form with payment
4. ⏳ Create payment transactions

### Phase 2: Medication Payment (Medium Priority)
1. ⏳ Add medication total to medical records
2. ⏳ Create medication payment form for receptionist
3. ⏳ Payment history for patients

### Phase 3: Reports & Management (Low Priority)
1. ⏳ Revenue reports
2. ⏳ Payment management for admin
3. ⏳ Consultation fee management

---

## 📝 Notes

- Tất cả số tiền lưu theo VNĐ (không lưu đơn vị)
- Payment status mặc định là 'unpaid' khi đặt lịch
- Cho phép đặt lịch trước, thanh toán sau
- Admin có thể xem/chỉnh sửa tất cả giao dịch
- Bệnh nhân chỉ xem được lịch sử thanh toán của mình

---

## 🔗 Related Files

- `database/payment_system.sql` - SQL migration
- `backend/src/controllers/paymentController.js` - Payment API (to be created)
- `backend/src/services/paymentService.js` - Payment business logic (to be created)
- `frontend/src/components/payment/` - Payment components (to be created)
