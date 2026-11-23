# Đưa THCT Clinic lên host (VPS Mắt Bão)

Hệ thống gồm **giao diện React + backend Node.js + database MariaDB**. Trên host, backend phục vụ luôn giao diện,
nên cả hệ thống chạy trên **một tên miền có https** (cần https để quét QR bằng camera và cài app lên điện thoại).

## 1. Mua gì ở Mắt Bão

| Cần mua | Ghi chú |
|---|---|
| **Cloud VPS / VPS Linux** | Hệ điều hành **Ubuntu 22.04 hoặc 24.04**, tối thiểu **2 GB RAM, 1–2 CPU, 20 GB SSD** |
| **Tên miền** | Ví dụ `thctclinic.vn` hoặc `.com` |

> ❌ Không mua gói **"Hosting"** thường (cPanel/DirectAdmin cho WordPress, PHP) – gói này không chạy được backend Node.js,
> trừ khi trang sản phẩm ghi rõ hỗ trợ **Node.js** (xem mục 7).

Sau khi mua, Mắt Bão gửi email gồm: **IP của VPS**, tài khoản **root** và **mật khẩu**.

## 2. Trỏ tên miền về VPS

Vào trang quản lý tên miền của Mắt Bão → **Quản lý DNS** → thêm 2 bản ghi:

| Loại | Tên (Host) | Giá trị | TTL |
|---|---|---|---|
| A | `@` | IP của VPS | 300 |
| A | `www` | IP của VPS | 300 |

Thường mất 5–30 phút để có hiệu lực. Kiểm tra: mở CMD, gõ `ping thctclinic.vn` → phải ra đúng IP của VPS.

## 3. Đóng gói trên máy bạn

1. Bật **MySQL** trong XAMPP.
2. Bấm đúp file **`deploy\dong-goi.bat`**.
3. Được file **`deploy\thct-clinic-deploy.zip`** (đã gồm giao diện đã build, backend, database hiện tại và các file cấu hình).

## 4. Tải file lên VPS

Cài **WinSCP** (miễn phí) → New Site:
- File protocol: **SFTP**, Host name: **IP VPS**, Port: **22**, User: **root**, Password: mật khẩu Mắt Bão gửi.

Kéo file `thct-clinic-deploy.zip` vào thư mục **`/root`** trên VPS.

## 5. Cài đặt (chỉ 3 lệnh)

Mở **PowerShell** trên máy bạn và đăng nhập VPS:

```bash
ssh root@<IP-VPS>
```

Chạy lần lượt (thay `thctclinic.vn` và email của bạn):

```bash
apt-get update && apt-get install -y unzip
mkdir -p /var/www/thct-clinic && unzip -o /root/thct-clinic-deploy.zip -d /var/www/thct-clinic
cd /var/www/thct-clinic && sed -i 's/\r$//' deploy/*.sh deploy/*.conf deploy/env.production.example
cd /var/www/thct-clinic && bash deploy/setup-vps.sh thctclinic.vn email-cua-ban@gmail.com
```

Script tự làm mọi việc (khoảng 5–10 phút):
múi giờ Việt Nam → cài Nginx, MariaDB, Node.js 20, PM2 → tạo database + nhập dữ liệu → tạo `backend/.env`
(mật khẩu database, JWT ngẫu nhiên) → chạy ứng dụng → cấu hình tên miền → **cấp SSL https miễn phí**.

Xong, mở **https://thctclinic.vn** 🎉

> Chưa có tên miền? Chạy `bash deploy/setup-vps.sh <IP-VPS>` để dùng thử bằng `http://<IP-VPS>`
> (chưa có https nên chưa quét QR bằng camera được). Khi có tên miền, chạy lại script với tên miền.

## 6. Việc cần làm sau khi cài

1. **Đổi mật khẩu tài khoản demo** (`admin@clinic.com / Password123!` và các tài khoản mẫu) trong trang quản trị.
2. **Email OTP đăng ký** – bắt buộc để người dùng mới đăng ký được. Mở file cấu hình:
   ```bash
   nano /var/www/thct-clinic/backend/.env
   ```
   Điền `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` (Gmail: bật xác minh 2 bước → tạo **Mật khẩu ứng dụng**).
   Chưa có email thì đặt `REGISTRATION_OTP=0`. Lưu (Ctrl+O, Enter, Ctrl+X) rồi chạy: `pm2 restart thct-clinic --update-env`
3. (Tuỳ chọn) `SEPAY_API_KEY` để tự xác nhận chuyển khoản – webhook: `https://thctclinic.vn/api/payments/webhook/sepay`.
4. (Tuỳ chọn) `FPT_TTS_API_KEY` để loa gọi số dùng giọng nữ miền Nam.

## 7. Nếu bạn mua "Hosting có Node.js" (cPanel) thay vì VPS

1. cPanel → **MySQL Databases**: tạo database + user → **phpMyAdmin** → Import file `deploy/thct_clinic_full.sql`.
2. **File Manager**: tải zip lên và giải nén.
3. **Setup Node.js App**: Node 18/20, Application root = thư mục `backend`, Startup file = `src/server.js`,
   thêm biến môi trường theo `deploy/env.production.example` (DB_HOST=localhost, DB_PORT=3306, …) → **Run NPM Install** → **Start**.
4. Bật SSL (AutoSSL / Let's Encrypt) trong cPanel. Lưu ý: gói hosting có thể giới hạn RAM và tự dừng ứng dụng.

## 8. Sửa / nâng cấp sau khi đã lên host

Đưa lên host rồi vẫn sửa bình thường – **dữ liệu trên host (bệnh nhân, lịch hẹn, bệnh án) không bị mất**:

1. Sửa và chạy thử trên máy bạn như bây giờ (XAMPP + `npm start`).
2. Nếu thay đổi cần **thêm bảng / thêm cột**: tạo file `database/<ten>.sql` (dùng `IF NOT EXISTS`) và thêm tên file vào **cuối** `database/migrations.txt`.
3. Bấm đúp `deploy\dong-goi.bat` → tải `thct-clinic-deploy.zip` mới lên `/root` bằng WinSCP.
4. Trên VPS:
   ```bash
   unzip -o /root/thct-clinic-deploy.zip -d /var/www/thct-clinic
   cd /var/www/thct-clinic && bash deploy/setup-vps.sh thctclinic.vn
   ```
   Script tự **sao lưu database** (`/root/backup-truoc-cap-nhat-...sql`), chỉ chạy các migration **mới**
   (ghi nhớ trong bảng `schema_migrations`), giữ nguyên `backend/.env`, rồi khởi động lại ứng dụng.

> Chỉ đổi cấu hình (email SMTP, SePay, …)? Không cần tải lại: `nano /var/www/thct-clinic/backend/.env` → lưu → `pm2 restart thct-clinic --update-env`.

## Lệnh hữu ích trên VPS

| Việc | Lệnh |
|---|---|
| Xem trạng thái / nhật ký | `pm2 status` · `pm2 logs thct-clinic` |
| Khởi động lại sau khi sửa `.env` | `pm2 restart thct-clinic --update-env` |
| Cập nhật phiên bản mới | Xem mục 8 |
| Sao lưu database | `mysqldump kltn_clinic > /root/backup-$(date +%F).sql` |
| Gia hạn SSL | Tự động (certbot) |
