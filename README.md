# 🏥 HỆ THỐNG QUẢN LÝ PHÒNG KHÁM THCT CLINIC

> Website đặt lịch khám online + QR check-in + Hồ sơ y tế điện tử

**Khóa luận tốt nghiệp 2026**  
**SV:** Nguyễn Thu Hằng, Đỗ Chí Tùng | **GVHD:** TS. Ngô Hữu Dũng

[![Status](https://img.shields.io/badge/status-active-success.svg)]()
[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)]()
[![Completion](https://img.shields.io/badge/completion-77%25-yellow.svg)]()

---

## 📌 HỆ THỐNG LÀM GÌ?

Website quản lý phòng khám giúp:
- 👤 **Bệnh nhân:** Đặt lịch online, nhận QR code, xem hồ sơ bệnh án
- 👔 **Lễ tân:** Quét QR để check-in bệnh nhân
- 👨‍⚕️ **Bác sĩ:** Khám bệnh, kê đơn thuốc, lưu hồ sơ điện tử
- 👑 **Admin:** Quản lý toàn bộ hệ thống

**Giải quyết vấn đề:** Không còn xếp hàng, hồ sơ giấy thất lạc, đặt lịch phức tạp!

---

## 💻 CÔNG NGHỆ SỬ DỤNG (NGẮN GỌN)

### **3 Thành phần chính:**

```
[TRÌNH DUYỆT]          [SERVER]              [DATABASE]
   React      ←HTTP→   Node.js    ←Query→     MySQL
 (Giao diện)         (Xử lý logic)        (Lưu dữ liệu)
```

### **Ngôn ngữ lập trình:**
- 🟨 **JavaScript** - Ngôn ngữ duy nhất cho cả Frontend & Backend
  - Frontend: React (làm giao diện web động)
  - Backend: Node.js + Express (xây dựng API server)

### **Cơ sở dữ liệu:**
- 🗄️ **MySQL** - Lưu trữ dữ liệu (bệnh nhân, lịch hẹn, hồ sơ...)

### **Thư viện quan trọng:**
| Thư viện | Công dụng |
|----------|-----------|
| **axios** | Gọi API từ Frontend sang Backend |
| **jsonwebtoken** | Xác thực đăng nhập (JWT) |
| **bcryptjs** | Mã hóa mật khẩu |
| **qrcode** | Tạo mã QR |
| **html5-qrcode** | Quét mã QR bằng camera |
| **helmet** | Bảo mật HTTP headers |

### **Phương pháp phát triển:**
- 🏗️ **Kiến trúc:** Client-Server (3-tier)
- 🔐 **Bảo mật:** JWT Authentication + Role-based Authorization
- 🧪 **Testing:** Jest (Unit tests) + Supertest (API tests)
- � **Spec-driven:** Requirements → Design → Tasks → Code

---

## 🔄 QUY TRÌNH HOẠT ĐỘNG (VÍ DỤ)

**Một bệnh nhân đi khám:**

```
1. ĐẶT LỊCH (Ở nhà)
   → Vào website → Chọn bác sĩ + ngày + giờ
   → Hệ thống gửi email kèm QR code

2. CHECK-IN (Tại phòng khám)
   → Bệnh nhân đến → Mở app hiện QR
   → Lễ tân quét QR → Check-in xong!

3. KHÁM BỆNH
   → Bác sĩ khám → Nhập triệu chứng + chẩn đoán
   → Kê đơn thuốc → Đặt lịch tái khám (nếu cần)

4. XEM HỒ SƠ (Về nhà)
   → Login website → Xem lại đơn thuốc, chẩn đoán
   → In đơn → Mua thuốc ở nhà thuốc
```

---

## 📊 DỮ LIỆU LƯU TRỮ

**10 bảng trong MySQL:**

1. **users** - Người dùng (bệnh nhân, bác sĩ, lễ tân, admin)
2. **departments** - 8 chuyên khoa (Tim Mạch, Nhi, Sản...)
3. **doctors** - Thông tin bác sĩ
4. **appointments** - Lịch hẹn (có mã QR)
5. **medical_records** - Hồ sơ bệnh án
6. **prescriptions** - Đơn thuốc
7. **auth_audit_logs** - Nhật ký đăng nhập
8. **user_sessions** - Phiên đăng nhập
9-10. *(Các bảng hỗ trợ khác)*

---

## 🎯 TÍNH NĂNG NỔI BẬT

### 1. 📱 QR Check-in (Tính năng ngầu nhất!)
- Tạo QR tự động khi đặt lịch
- Quét QR = check-in ngay, không cần form giấy
- **Công nghệ:** qrcode (Node.js) + html5-qrcode (React)

### 2. 📋 Hồ sơ y tế điện tử
- Lưu trọn đời, xem mọi lúc mọi nơi
- Bác sĩ xem lịch sử để chẩn đoán chính xác

### 3. 🔐 Bảo mật cao
- Mật khẩu mã hóa bcrypt (không ai xem được)
- JWT token hết hạn sau 24h
- Giới hạn 5 lần đăng nhập sai → khóa tài khoản

---

## 🚀 CÁCH CHẠY HỆ THỐNG

### Bước 1: Cài XAMPP + Node.js
- Tải XAMPP: https://www.apachefriends.org/
- Tải Node.js: https://nodejs.org/

### Bước 2: Tạo Database
1. Mở XAMPP → Start MySQL (MySQL của dự án chạy ở **port 3307**, khớp với `DB_PORT` trong `backend/.env`)
2. Tạo database `kltn_clinic` rồi import **lần lượt đúng thứ tự** 7 file trong thư mục `database/`:

| # | File | Nội dung |
|---|------|----------|
| 1 | `kltn_clinic.sql` | Bảng chính + dữ liệu mẫu (24 tài khoản, 8 khoa, 10 bác sĩ, lịch hẹn, hồ sơ) |
| 2 | `payment_system.sql` | Bảng giá khám, giao dịch thanh toán |
| 3 | `payment_system_fix.sql` | Cột tiền thuốc, đơn giá thuốc, chuẩn hoá bảng giá |
| 4 | `logic_fixes.sql` | Nhật ký hoạt động, giờ check-in, ngày sinh, chuẩn hoá SĐT/khung giờ |
| 5 | `bank_transfer.sql` | Xác nhận chuyển khoản (bệnh nhân báo đã chuyển, mã giao dịch ngân hàng) |
| 6 | `doctor_leaves.sql` | Lịch nghỉ của bác sĩ (khoá đặt lịch ngày nghỉ) |
| 7 | `reviews.sql` | Bệnh nhân đánh giá sau khi khám |
| 8 | `medicines.sql` | Danh mục thuốc, tồn kho, thông tin sức khoẻ bệnh nhân |
| 9 | `queue_calling.sql` | Phòng khám của bác sĩ + gọi số kiểu bệnh viện |
| 10 | `pharmacy_stock.sql` | Xuất kho khi thu tiền thuốc, nhập lại kho khi hoàn tiền |
| 11 | `smart_recommendation.sql` | Gợi ý lịch khám thông minh: từ khoá triệu chứng, tham số, nguồn đặt lịch |
| 12 | `doctor_shifts.sql` | Ca trực bác sĩ (lịch tuần + theo ngày) |
| 13 | `exam_type_payment_hold.sql` | Khám dịch vụ/BHYT, giữ chỗ 15 phút khi chuyển khoản |
| 14 | `registration_otp.sql` | Xác thực OTP khi đăng ký |
| 15 | `doctor_profiles.sql` | Hồ sơ bác sĩ (giới thiệu, kinh nghiệm, chuyên môn) cho trang tìm bác sĩ |

Bằng phpMyAdmin (http://localhost/phpmyadmin): chọn database `kltn_clinic` → tab **Import** → import từng file theo thứ tự trên.

Hoặc bằng dòng lệnh (mở **Command Prompt / cmd**, không dùng pipe của PowerShell vì có thể làm lỗi font tiếng Việt):
```bat
cd /d C:\xampp\htdocs\KLTN\database
set MYSQL=C:\xampp\mysql\bin\mysql.exe -u root -P 3307 --default-character-set=utf8mb4
%MYSQL% -e "CREATE DATABASE IF NOT EXISTS kltn_clinic CHARACTER SET utf8 COLLATE utf8_unicode_ci"
%MYSQL% kltn_clinic < kltn_clinic.sql
%MYSQL% kltn_clinic < payment_system.sql
%MYSQL% kltn_clinic < payment_system_fix.sql
%MYSQL% kltn_clinic < logic_fixes.sql
%MYSQL% kltn_clinic < bank_transfer.sql
%MYSQL% kltn_clinic < doctor_leaves.sql
%MYSQL% kltn_clinic < reviews.sql
%MYSQL% kltn_clinic < medicines.sql
%MYSQL% kltn_clinic < queue_calling.sql
%MYSQL% kltn_clinic < pharmacy_stock.sql
%MYSQL% kltn_clinic < smart_recommendation.sql
%MYSQL% kltn_clinic < doctor_shifts.sql
%MYSQL% kltn_clinic < exam_type_payment_hold.sql
%MYSQL% kltn_clinic < registration_otp.sql
%MYSQL% kltn_clinic < doctor_profiles.sql
```
File 3 đến 7 chạy lại nhiều lần vẫn an toàn. Không cần import `demo_seed.sql` (dữ liệu này đã có trong file 1).

### Bước 3: Chạy Backend
```bash
cd backend
npm install
npm run dev     # Server chạy ở port 5000, tự khởi động lại khi sửa code (npm start: không tự khởi động lại)
```

**Thanh toán chuyển khoản (VietQR) – không bắt buộc.** Thêm vào `backend/.env` tài khoản nhận tiền của phòng khám, rồi khởi động lại backend:
```
BANK_BIN=970436                 # mã NAPAS của ngân hàng (6 số), xem bảng dưới
BANK_ACCOUNT_NO=0123456789      # số tài khoản nhận tiền
BANK_ACCOUNT_NAME=NGUYEN VAN A  # tên chủ tài khoản, IN HOA không dấu
BANK_NAME=Vietcombank           # tên hiển thị
```
Mã BIN thường dùng: Vietcombank `970436` · VietinBank `970415` · BIDV `970418` · Agribank `970405` · MB `970422` · Techcombank `970407` · ACB `970416` · TPBank `970423` · Sacombank `970403` · VPBank `970432`.
Không cần đăng ký merchant hay API key: mã QR theo chuẩn VietQR/NAPAS, app ngân hàng nào cũng quét được (ảnh QR tạo bởi img.vietqr.io nên máy cần có internet).
Bệnh nhân chọn **Chuyển khoản ngân hàng** khi đặt lịch (hoặc bấm **🏦 Chuyển khoản** trong "Lịch hẹn của tôi") → quét QR, nội dung chuyển khoản là `THCT<mã lịch hẹn>`.
Chưa cấu hình thì trang chỉ báo "thanh toán tại quầy".

**Xác nhận đã chuyển khoản** – có 2 cách:
1. *Thủ công (mặc định):* bệnh nhân bấm **✅ Tôi đã chuyển khoản** → ở trang **Thu ngân** lịch đó lên đầu danh sách với nhãn 🔔 "BN báo đã chuyển". Thu ngân mở app ngân hàng thấy tiền về đúng nội dung `THCT…` thì bấm **Xác nhận đã nhận**. Bệnh nhân thấy "Đã thanh toán" sau vài giây (trang tự cập nhật).
2. *Tự động (SePay):* đăng ký https://sepay.vn (gói miễn phí, hỗ trợ MB Bank), liên kết tài khoản nhận tiền, tạo Webhook trỏ về `https://<địa-chỉ-backend>/api/payments/webhook/sepay`, kiểu xác thực **API Key**, rồi thêm vào `backend/.env`:
   ```
   SEPAY_API_KEY=<chuỗi bí mật tối thiểu 16 ký tự, giống ô API Key trong SePay>
   ```
   Tiền vào đúng tài khoản, đủ số tiền, nội dung có `THCT<mã lịch>` → lịch tự chuyển "Đã thanh toán", không cần thu ngân. Chuyển thiếu, sai tài khoản hay không có mã thì bỏ qua để thu ngân xử lý; SePay gửi lại cùng giao dịch cũng không bị ghi 2 lần. Backend phải có địa chỉ public (deploy, hoặc dùng `ngrok http 5000` khi demo).

### Tuỳ chỉnh lịch khám (không bắt buộc, thêm vào `backend/.env`)
```
SLOT_CAPACITY=10       # số bệnh nhân tối đa mỗi khung 30 phút của 1 bác sĩ (mặc định 10)
AVG_EXAM_MINUTES=10    # thời gian khám ước tính/người khi bác sĩ chưa khám đủ người trong ngày để đo thực tế
CLINIC_CLOSED_WEEKDAYS=0   # ngày phòng khám nghỉ: 0=CN,1=T2..6=T7, cách nhau dấu phẩy (mặc định nghỉ Chủ nhật; để trống = mở cả tuần)
```
Đặt lịch xong là **tự xác nhận**, không cần duyệt: bệnh nhân đến quét QR (hoặc đưa **phiếu khám in sẵn**) để vào hàng đợi, ai check-in trước khám trước. Bệnh nhân xem **giờ khám dự kiến** trên Dashboard; bác sĩ xem **Bệnh nhân hẹn tái khám**; admin **xuất báo cáo Excel** (lịch hẹn, doanh thu) ở trang Thống kê.

### Gọi số khám bệnh (kiểu bệnh viện)
- Mỗi bác sĩ có **phòng khám** (cột `doctors.room`, mặc định 100 + mã bác sĩ: 101, 102…).
- Bác sĩ vào Dashboard → **📢 Gọi số khám bệnh**: *Gọi số tiếp theo* → TV ở sảnh hiện số toàn màn hình, chuông "ding-dong" và đọc loa 2 lần "Kính mời bệnh nhân số 5, Nguyễn Văn An, vào phòng khám số 101" (loa đọc họ tên đầy đủ, màn hình vẫn che tên); *Gọi lại* để đọc lại; *Vắng mặt* để chuyển sang danh sách **lỡ lượt** (gọi lại được khi bệnh nhân quay lại); *Gọi ưu tiên* cho người già/trẻ nhỏ; *Bắt đầu khám* mở hồ sơ khám của bệnh nhân đang được gọi.
- Mỗi lần chỉ mời **một** bệnh nhân vào phòng; khám xong (hoàn tất) hoặc bấm *Vắng mặt* mới gọi được số khác.
- Điện thoại bệnh nhân: khi được gọi hiện **"ĐẾN LƯỢT BẠN – mời vào phòng 101"** và rung máy.

### Chức năng bổ sung theo khoá luận
- **Gợi ý lịch khám thông minh** (rule-based + content-based): form đặt lịch hiện "✨ Gợi ý cho bạn" – chuyên khoa kèm lý do (hẹn tái khám, khám nhiều lần, khám gần đây, triệu chứng khớp từ khoá, giống lần khám trước, bệnh nền, độ tuổi/giới tính), bác sĩ phù hợp và lịch trống gần nhất; khung giờ gợi ý có ⭐ (buổi bệnh nhân hay khám, ít người đặt, sớm nhất). Admin → **Gợi ý lịch khám thông minh**: trọng số, từ khoá theo khoa, chạy thử và tỉ lệ đặt lịch từ gợi ý.
- **Ca trực bác sĩ**: Admin → **Ca trực bác sĩ** (lịch tuần + ca theo ngày). Bác sĩ chưa khai báo ca dùng giờ mặc định 08:00–12:00, 14:00–17:00.
- **Khám dịch vụ / BHYT**: BHYT nhập số thẻ 15 ký tự + hạn thẻ, hệ thống tính mức hưởng và đồng chi trả (thu tại quầy).
- **Giữ chỗ khi chuyển khoản**: chọn chuyển khoản VietQR thì giữ chỗ `PAYMENT_HOLD_MINUTES` phút (mặc định 15); quá hạn chưa thanh toán và chưa báo chuyển khoản → tự huỷ, trả chỗ. Trả tại quầy vẫn xác nhận ngay.
- **OTP khi đăng ký**: tài khoản mới phải nhập mã 6 số gửi qua email (hiệu lực 10 phút). Cấu hình `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` để gửi mail thật; chưa cấu hình thì mã hiện trên màn hình (chế độ thử nghiệm). Tắt bằng `REGISTRATION_OTP=0`.
- **Báo sắp đến lượt**: còn ≤ 2 người phía trước → thẻ số thứ tự đổi màu, rung máy, thông báo hệ thống (nếu cho phép) và chuông.
- **Tìm bác sĩ & chuyên khoa** (menu "Bác sĩ", không cần đăng nhập): tìm theo tên, chuyên khoa hoặc triệu chứng (không cần gõ dấu), xem giới thiệu, lịch làm việc, chỗ trống 7 ngày tới và nhận xét; bấm một ngày để đặt lịch. Admin sửa hồ sơ ở Quản lý bác sĩ → "Hồ sơ".
- **Kê đơn từ danh mục thuốc** (giá, tồn kho), thu ngân bỏ chọn thuốc bệnh nhân không lấy; **báo cáo Excel (CSV) và PDF**, lọc thống kê theo khoa/bác sĩ.

#### Giới hạn đăng nhập sai
- Chạy dev (`npm run dev`): cho phép tới 1000 lần sai / 15 phút, không khoá tài khoản – thoải mái test.
- Chạy thật (`NODE_ENV=production`): chặn IP sau 5 lần sai trong 15 phút và khoá tài khoản 15 phút sau 5 lần sai mật khẩu.
- Đổi bằng `AUTH_RATE_LIMIT_MAX` và `ACCOUNT_LOCK_MAX_ATTEMPTS` trong `backend/.env`. Mở khoá thủ công: admin → Giám sát bảo mật, hoặc khởi động lại backend (xoá bộ đếm theo IP).

#### Giọng đọc nữ miền Nam (FPT.AI)
Thêm vào `backend/.env` rồi khởi động lại backend:
```
FPT_TTS_API_KEY=<khoá lấy tại https://console.fpt.ai>
TTS_VOICE=lannhi      # lannhi / linhsan = nữ miền Nam · banmai / thuminh = nữ miền Bắc · myan = nữ miền Trung
TTS_SPEED=0           # -3 (chậm) … +3 (nhanh)
```
Mỗi câu gọi số chỉ tạo âm thanh một lần rồi lưu ở `backend/storage/tts/` (tự xoá sau 7 ngày). Chưa có khoá hoặc mất mạng: TV tự dùng giọng nữ tiếng Việt có sẵn của trình duyệt (Edge: HoaiMy, Chrome: Google Tiếng Việt – giọng Bắc).

### Màn hình hàng đợi (TV ở sảnh)
Mở `http://<IP máy tính>:3000/?page=queue-board` trên TV/màn hình lớn (không cần đăng nhập), hoặc lễ tân bấm menu **Màn hình hàng đợi**. Bấm **⛶ Toàn màn hình** và **🔇 Bật loa gọi số** (trình duyệt cần một lần bấm mới cho phát tiếng). Mỗi bệnh nhân check-in nhận **số thứ tự trong ngày theo từng bác sĩ** (không đổi suốt ngày); màn hình tự cập nhật 4 giây/lần, hiện số bác sĩ đang mời, các số tiếp theo, tên đã che (VD "Đ. C. Tùng").

### Dùng trên điện thoại (cài như app)
- Điện thoại và máy tính **cùng Wi-Fi**. Trên máy tính chạy `ipconfig` lấy địa chỉ IPv4 (ví dụ `192.168.1.5`), trên điện thoại mở `http://192.168.1.5:3000`. App tự gọi backend ở `192.168.1.5:5000` (cho phép port 3000 và 5000 qua Windows Firewall nếu không vào được).
- **Cài lên màn hình chính:** Android (Chrome) bấm **Cài đặt** ở thanh gợi ý dưới màn hình; iPhone (Safari) bấm **Chia sẻ → Thêm vào MH chính**. App mở toàn màn hình, có icon THCT, nhấn giữ icon có lối tắt *Đặt lịch* / *Lịch hẹn*.
- Trình duyệt chỉ cho cài app và bật camera quét QR khi trang chạy **https** (hoặc `localhost`). Qua `http://192.168...` vẫn dùng web bình thường, nhưng muốn cài app / quét QR trên điện thoại thì cần https: deploy lên hosting, hoặc khi demo dùng tunnel cho cả frontend và backend (`cloudflared tunnel --url http://localhost:3000` và `... http://localhost:5000`), rồi đặt `REACT_APP_API_BASE=<địa chỉ https của tunnel backend>/api` trong `frontend/.env` và chạy lại `npm start`.
- Khung thanh toán trên điện thoại có nút mở thẳng app **MB, Vietcombank, Techcombank, BIDV, VietinBank, Agribank, ACB, TPBank** với số tiền và nội dung điền sẵn.

### Bước 4: Chạy Frontend
```bash
cd frontend
npm install
npm start       # Website mở ở port 3000
```

### Bước 5: Đăng nhập thử
```
Bệnh nhân: chitung@gmail.com / Password123!
Bác sĩ: bsphong@clinic.com / Password123!
Lễ tân: letan@gmail.com / Password123!
Admin: admin@clinic.com / Password123!
```
Nhập sai mật khẩu 5 lần trong 15 phút sẽ bị tạm khoá đăng nhập theo IP (chống dò mật khẩu) – khởi động lại backend để mở khoá khi demo.

### Quy trình demo đầy đủ
Bệnh nhân đặt lịch hôm nay → Lễ tân **Quét QR Check-in** → Bác sĩ **Khám bệnh & kê đơn** → Lễ tân **Thu ngân** (phí khám + tiền thuốc) → Admin xem **Doanh thu**.
Camera chỉ hoạt động khi mở bằng `http://localhost:3000` (hoặc https); nếu không có camera, dán mã QR vào ô nhập tay.

---

## 📁 CẤU TRÚC DỰ ÁN (ĐƠN GIẢN)

```
KLTN/
├── backend/              # Server (Node.js + Express)
│   ├── src/
│   │   ├── controllers/     # Xử lý logic (auth, appointments, medical records...)
│   │   ├── routes/          # Định nghĩa API (25+ endpoints)
│   │   ├── middleware/      # Xác thực JWT, bảo mật
│   │   └── server.js        # File chạy server
│   └── .env              # Config: database password, JWT secret...
│
├── frontend/             # Website (React)
│   ├── src/
│   │   ├── components/      # Giao diện (Login, Dashboard, QR Scanner...)
│   │   ├── contexts/        # AuthContext (quản lý đăng nhập)
│   │   └── App.js           # File chính
│   └── public/           # Images, logo
│
├── database/             # SQL scripts
│   └── kltn_clinic.sql   # Schema + dữ liệu mẫu (24 users, 8 khoa, 10 bác sĩ)
│
├── docs/                 # Tài liệu
└── README.md             # File này
```

---

## 📊 THỐNG KÊ

- **Số dòng code:** ~15,000 dòng
- **Số file:** ~150 files
- **API endpoints:** 25+ endpoints
- **Màn hình:** 10+ screens
- **Thời gian:** 3-4 tháng
- **Người làm:** 2 sinh viên

---

## 🎓 TÓM TẮT

### Công nghệ:
- **Ngôn ngữ:** JavaScript (100%)
- **Frontend:** React 18.2.0
- **Backend:** Node.js + Express 4.19.2
- **Database:** MySQL 8.0

### Phương pháp:
- **Kiến trúc:** Client-Server (3-tier)
- **Bảo mật:** JWT + bcrypt + Rate Limiting
- **Testing:** Jest + Supertest
- **Phát triển:** Spec-driven (Requirements → Design → Tasks → Code)

### Tính năng đặc biệt:
- ✅ QR Check-in (html5-qrcode)
- ✅ Hồ sơ y tế điện tử
- ✅ Đặt lịch thông minh
- ✅ 4 vai trò phân quyền rõ ràng

---

**💡 MÔ TẢ 1 DÒNG:**  
*"Website quản lý phòng khám với đặt lịch online, QR check-in và hồ sơ điện tử - React + Node.js + MySQL"*

---

**Made with ❤️ by THCT Clinic Team | Version 1.0.0 | 2026**
