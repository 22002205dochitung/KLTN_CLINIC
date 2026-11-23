#!/usr/bin/env bash
# ==================================================================================
#  THCT Clinic – cài đặt tự động trên VPS Ubuntu 22.04 / 24.04 (Mắt Bão hoặc bất kỳ)
#
#  Cách dùng (đăng nhập VPS bằng tài khoản root):
#     cd /var/www/thct-clinic
#     bash deploy/setup-vps.sh tenmien.vn email@cua-ban.com
#  Chưa có tên miền: bash deploy/setup-vps.sh <IP-cua-VPS>   (chạy http, bỏ qua SSL)
#
#  Chạy lại nhiều lần được: database và .env đã có sẽ được giữ nguyên.
# ==================================================================================
set -euo pipefail

DOMAIN="${1:-}"
EMAIL="${2:-}"
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DB_NAME="kltn_clinic"
DB_USER="thct"
ENV_FILE="$APP_DIR/backend/.env"

if [[ -z "$DOMAIN" ]]; then
  echo "Thiếu tên miền. Ví dụ: bash deploy/setup-vps.sh thctclinic.vn email@gmail.com"
  exit 1
fi
if [[ $EUID -ne 0 ]]; then
  echo "Hãy chạy bằng tài khoản root (hoặc: sudo bash deploy/setup-vps.sh ...)"
  exit 1
fi
IS_IP=0
[[ "$DOMAIN" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] && IS_IP=1

step() { echo -e "\n\033[1;36m==> $*\033[0m"; }

step "1/9 Múi giờ Việt Nam (lịch khám, giờ hẹn dùng giờ địa phương)"
timedatectl set-timezone Asia/Ho_Chi_Minh || true

step "2/9 Cài gói hệ thống: Nginx, MariaDB, Certbot"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl ca-certificates gnupg nginx mariadb-server certbot python3-certbot-nginx unzip ufw

step "3/9 Cài Node.js 20 LTS và PM2"
if ! command -v node >/dev/null || [[ "$(node -v | cut -d. -f1 | tr -d v)" -lt 18 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
command -v pm2 >/dev/null || npm install -g pm2
node -v

step "4/9 Tạo database và nhập dữ liệu"
systemctl enable --now mariadb
if [[ -f "$ENV_FILE" ]] && grep -q '^DB_PASSWORD=' "$ENV_FILE" && ! grep -q '<mat-khau-database>' "$ENV_FILE"; then
  DB_PASS="$(grep '^DB_PASSWORD=' "$ENV_FILE" | cut -d= -f2-)"
else
  DB_PASS="$(openssl rand -hex 16)"
fi
mysql -u root <<SQL
CREATE DATABASE IF NOT EXISTS \`$DB_NAME\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '$DB_USER'@'localhost' IDENTIFIED BY '$DB_PASS';
ALTER USER '$DB_USER'@'localhost' IDENTIFIED BY '$DB_PASS';
GRANT ALL PRIVILEGES ON \`$DB_NAME\`.* TO '$DB_USER'@'localhost';
FLUSH PRIVILEGES;
SQL
TABLES="$(mysql -u root -N -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$DB_NAME'")"
MIGRATION_LIST="$APP_DIR/database/migrations.txt"
mysql -u root "$DB_NAME" -e "CREATE TABLE IF NOT EXISTS schema_migrations (filename VARCHAR(255) PRIMARY KEY, applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)"
if [[ "$TABLES" == "0" ]]; then
  mysql -u root --default-character-set=utf8mb4 "$DB_NAME" < "$APP_DIR/deploy/thct_clinic_full.sql"
  echo "Đã nhập dữ liệu từ deploy/thct_clinic_full.sql"
  # the dump already contains every migration listed so far -> mark them as applied
  while IFS= read -r f; do
    f="${f%$'\r'}"; f="${f%%#*}"; f="$(echo "$f" | xargs)"; [[ -z "$f" ]] && continue
    mysql -u root "$DB_NAME" -e "INSERT IGNORE INTO schema_migrations (filename) VALUES ('$f')"
  done < "$MIGRATION_LIST"
else
  echo "Database đã có $TABLES bảng – giữ nguyên dữ liệu, chỉ chạy các migration mới (nếu có)"
  # Bản cập nhật: chạy các file trong database/migrations.txt chưa từng chạy trên host này
  mysqldump -u root --single-transaction "$DB_NAME" > "/root/backup-truoc-cap-nhat-$(date +%F-%H%M).sql" && echo "Đã sao lưu database vào /root"
  while IFS= read -r f; do
    f="${f%$'\r'}"; f="${f%%#*}"; f="$(echo "$f" | xargs)"; [[ -z "$f" ]] && continue
    DONE="$(mysql -u root -N "$DB_NAME" -e "SELECT COUNT(*) FROM schema_migrations WHERE filename='$f'")"
    if [[ "$DONE" == "0" ]]; then
      echo "  → chạy migration $f"
      mysql -u root --default-character-set=utf8mb4 "$DB_NAME" < "$APP_DIR/database/$f"
      mysql -u root "$DB_NAME" -e "INSERT INTO schema_migrations (filename) VALUES ('$f')"
    fi
  done < "$MIGRATION_LIST"
fi

step "5/9 Tạo file cấu hình backend/.env"
if [[ ! -f "$ENV_FILE" ]]; then
  cp "$APP_DIR/deploy/env.production.example" "$ENV_FILE"
  JWT="$(openssl rand -hex 48)"
  if [[ $IS_IP -eq 1 ]]; then ORIGINS="http://$DOMAIN"; else ORIGINS="https://$DOMAIN,https://www.$DOMAIN,http://$DOMAIN"; fi
  sed -i "s#^CORS_ORIGINS=.*#CORS_ORIGINS=$ORIGINS#" "$ENV_FILE"
  sed -i "s#^DB_PASSWORD=.*#DB_PASSWORD=$DB_PASS#" "$ENV_FILE"
  sed -i "s#^JWT_SECRET=.*#JWT_SECRET=$JWT#" "$ENV_FILE"
  sed -i "s#https://<ten-mien>#https://$DOMAIN#g" "$ENV_FILE"
  echo "Đã tạo $ENV_FILE (mở file này để điền SMTP, SePay, FPT nếu có)"
else
  echo "Giữ nguyên $ENV_FILE đã có"
fi
sed -i "s/\r$//" "$ENV_FILE"   # file tạo trên Windows có thể còn ký tự \r
chmod 600 "$ENV_FILE"

step "6/9 Cài thư viện backend"
cd "$APP_DIR/backend"
npm ci --omit=dev
mkdir -p "$APP_DIR/logs" "$APP_DIR/backend/storage/tts"
if [[ ! -f "$APP_DIR/frontend/build/index.html" ]]; then
  echo "Không thấy frontend/build – build giao diện trên VPS (mất vài phút)"
  cd "$APP_DIR/frontend" && npm ci && npm run build
fi

step "7/9 Chạy ứng dụng bằng PM2"
cd "$APP_DIR"
pm2 startOrReload deploy/ecosystem.config.js --update-env
pm2 save
pm2 startup systemd -u root --hp /root >/dev/null || true
sleep 3
curl -fsS http://127.0.0.1:5000/api/health >/dev/null && echo "Backend đang chạy" || { echo "Backend chưa chạy – xem: pm2 logs thct-clinic"; exit 1; }

step "8/9 Cấu hình Nginx cho $DOMAIN"
NGINX_SITE="/etc/nginx/sites-available/thct-clinic"
sed "s/__DOMAIN__/$DOMAIN/g" "$APP_DIR/deploy/nginx-thctclinic.conf" > "$NGINX_SITE"
[[ $IS_IP -eq 1 ]] && sed -i "s/ www\.$DOMAIN//" "$NGINX_SITE"
ln -sf "$NGINX_SITE" /etc/nginx/sites-enabled/thct-clinic
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
ufw allow OpenSSH >/dev/null; ufw allow 'Nginx Full' >/dev/null; ufw --force enable >/dev/null

step "9/9 Chứng chỉ SSL (https) miễn phí – Let's Encrypt"
if [[ $IS_IP -eq 1 ]]; then
  echo "Đang dùng IP – bỏ qua SSL. Khi có tên miền, chạy lại: bash deploy/setup-vps.sh <ten-mien> <email>"
  echo -e "\n✅ Xong! Mở thử: http://$DOMAIN"
  exit 0
fi
CERT_ARGS=(--nginx -d "$DOMAIN" --redirect --agree-tos -n)
getent hosts "www.$DOMAIN" >/dev/null 2>&1 && CERT_ARGS+=(-d "www.$DOMAIN")
if [[ -n "$EMAIL" ]]; then CERT_ARGS+=(-m "$EMAIL"); else CERT_ARGS+=(--register-unsafely-without-email); fi
if certbot "${CERT_ARGS[@]}"; then
  sed -i 's/^HTTPS_ONLY=.*/HTTPS_ONLY=true/' "$ENV_FILE"
  pm2 restart thct-clinic --update-env >/dev/null
  echo -e "\n✅ Xong! Mở: https://$DOMAIN"
else
  echo -e "\n⚠️  Chưa cấp được SSL – kiểm tra tên miền đã trỏ về IP VPS chưa (bản ghi A), rồi chạy lại script."
  echo "   Tạm thời mở: http://$DOMAIN"
fi
echo "Tài khoản admin demo: admin@clinic.com / Password123!  – hãy đổi mật khẩu ngay sau khi đăng nhập."
