@echo off
chcp 65001 >nul
REM ===============================================================
REM  Đóng gói THCT Clinic để tải lên VPS (chạy trên máy Windows có XAMPP)
REM   1. Build giao diện (bản production)
REM   2. Xuất database hiện tại (MySQL XAMPP cổng 3307 phải đang chạy)
REM   3. Nén thành deploy\thct-clinic-deploy.zip (không kèm node_modules, .env)
REM ===============================================================
cd /d "%~dp0.."

echo [1/3] Build giao dien...
call npm --prefix frontend run build
if errorlevel 1 (echo Build that bai & pause & exit /b 1)

echo [2/3] Xuat database...
"C:\xampp\mysql\bin\mysqldump.exe" -u root -P 3307 -h 127.0.0.1 --single-transaction --default-character-set=utf8mb4 --skip-triggers --no-tablespaces kltn_clinic > deploy\thct_clinic_full.sql
if errorlevel 1 (echo Xuat database that bai - hay bat MySQL trong XAMPP & pause & exit /b 1)

echo [3/3] Nen file...
REM File chay tren Linux phai co xuong dong kieu Linux (LF), khong phai CRLF cua Windows
node -e "const fs=require('fs');for(const f of ['deploy/setup-vps.sh','deploy/nginx-thctclinic.conf','deploy/env.production.example','deploy/ecosystem.config.js','database/migrations.txt'])fs.writeFileSync(f,fs.readFileSync(f,'utf8').replace(/\r\n/g,'\n'))"
if errorlevel 1 (echo Khong chuyen duoc xuong dong & pause & exit /b 1)
if exist deploy\thct-clinic-deploy.zip del deploy\thct-clinic-deploy.zip
REM tar.exe cua Windows can duong dan dung dau "/"
tar -a -c -f deploy/thct-clinic-deploy.zip --exclude=node_modules --exclude=.env --exclude=coverage --exclude=storage --exclude=logs backend frontend/build frontend/package.json frontend/package-lock.json database deploy/setup-vps.sh deploy/ecosystem.config.js deploy/nginx-thctclinic.conf deploy/env.production.example deploy/thct_clinic_full.sql deploy/HUONG_DAN_DEPLOY.md README.md
if errorlevel 1 (echo Nen that bai & pause & exit /b 1)

echo.
echo Xong! File can tai len VPS: deploy\thct-clinic-deploy.zip
echo Xem huong dan: deploy\HUONG_DAN_DEPLOY.md
pause
