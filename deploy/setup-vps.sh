#!/usr/bin/env bash
# BÜKÜ ART sitesini VPS'e kurar: bukraozyaparart.taslak.site alan adına,
# ücretsiz Let's Encrypt sertifikasıyla (HTTPS). Mevcut sitelere dokunmaz:
# kendi dizinine, kendi nginx server block'larına ve kendi systemd
# servisine kurulum yapar. Ubuntu/Debian tabanlı sunucular için
# tasarlanmıştır. root olarak çalıştırın:
#   sudo bash setup-vps.sh
set -euo pipefail

REPO_URL="https://github.com/devrankacan/bukraozyaparart.git"
BRANCH="claude/workshop-events-website-p4wwtb"
SITE_DIR="/var/www/bukuart"
SERVICE_NAME="bukuart-admin"
DOMAIN="bukraozyaparart.taslak.site"
LETSENCRYPT_EMAIL="devrankacan9@gmail.com"

if [ "$(id -u)" -ne 0 ]; then
  echo "Bu script root olarak çalıştırılmalı: sudo bash setup-vps.sh" >&2
  exit 1
fi

echo "== 1/9: Gerekli paketler kontrol ediliyor =="
apt-get update -qq
apt-get install -y -qq git curl ca-certificates certbot python3-certbot-nginx >/dev/null

if ! command -v nginx >/dev/null 2>&1; then
  echo "Nginx bulunamadı, kuruluyor..."
  apt-get install -y -qq nginx >/dev/null
  # Diğer bir web sunucusuyla (ör. Apache) port 80 çakışmasın diye
  # nginx'in varsayılan sitesini devre dışı bırakıyoruz.
  rm -f /etc/nginx/sites-enabled/default
else
  echo "Nginx zaten kurulu, mevcut ayarlara dokunulmayacak."
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js bulunamadı, kuruluyor (NodeSource, Node 20 LTS)..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
else
  echo "Node.js zaten kurulu: $(node -v)"
fi

echo "== 2/9: Panel portu belirleniyor =="
is_port_free() { ! ss -ltn 2>/dev/null | awk '{print $4}' | grep -qE "[:.]$1\$"; }

find_free_port() {
  local port=$1
  while ! is_port_free "$port"; do
    port=$((port + 1))
  done
  echo "$port"
}

# Site artık 80/443 üzerinden alan adıyla yayınlanıyor; sadece panelin
# ayrı bir portu var. Daha önce kurulmuşsa aynı portu koru (80 ve 443
# hariç ilk bulunan "listen" portu).
NGINX_CONF_PATH="/etc/nginx/sites-available/bukuart"
ENV_FILE="$SITE_DIR/server/.env"

EXISTING_ADMIN_PORT=""
if [ -f "$NGINX_CONF_PATH" ]; then
  EXISTING_ADMIN_PORT=$(grep -oE '^[[:space:]]*listen [0-9]+' "$NGINX_CONF_PATH" \
    | grep -oE '[0-9]+' | uniq | grep -vE '^(80|443)$' | head -1 || true)
fi

if [ -n "$EXISTING_ADMIN_PORT" ]; then
  ADMIN_PORT="$EXISTING_ADMIN_PORT"
  echo "Daha önce kurulmuş panel portu tekrar kullanılıyor: $ADMIN_PORT"
else
  ADMIN_PORT=$(find_free_port 8082)
fi

# Dahili Node portu her çalıştırmada yeniden bulunur; .env ve nginx'in
# proxy_pass hedefi aşağıda her zaman birlikte, aynı değerle yazılır, bu
# yüzden aralarında sürüm farkı/uyumsuzluk oluşamaz.
NODE_PORT=$(find_free_port 4001)

echo "Panel portu: $ADMIN_PORT | Dahili panel süreci: 127.0.0.1:$NODE_PORT"

echo "== 3/9: Site dosyaları çekiliyor =="
# Önceki çalıştırmada $SITE_DIR www-data'ya devredildiği için root olarak
# çalışan git burayı "güvensiz" sayıp işlemi reddedebilir; buna izin veriyoruz.
git config --global --get-all safe.directory 2>/dev/null | grep -qxF "$SITE_DIR" \
  || git config --global --add safe.directory "$SITE_DIR"

CONTENT_BACKUP_DIR=$(mktemp -d)
if [ -d "$SITE_DIR/.git" ]; then
  echo "$SITE_DIR zaten mevcut, güncelleniyor..."
  # Panelden yapılan içerik değişikliklerinin (etkinlikler, ayarlar) kod
  # güncellemesiyle ezilmemesi için önce yedekleyip sonra geri koyuyoruz.
  cp "$SITE_DIR/content/settings.json" "$CONTENT_BACKUP_DIR/" 2>/dev/null || true
  cp "$SITE_DIR/content/events.json" "$CONTENT_BACKUP_DIR/" 2>/dev/null || true
  git -C "$SITE_DIR" fetch origin "$BRANCH" --quiet
  git -C "$SITE_DIR" checkout "$BRANCH" --quiet
  git -C "$SITE_DIR" reset --hard "origin/$BRANCH" --quiet
  [ -f "$CONTENT_BACKUP_DIR/settings.json" ] && cp "$CONTENT_BACKUP_DIR/settings.json" "$SITE_DIR/content/settings.json"
  [ -f "$CONTENT_BACKUP_DIR/events.json" ] && cp "$CONTENT_BACKUP_DIR/events.json" "$SITE_DIR/content/events.json"
else
  git clone --branch "$BRANCH" --single-branch "$REPO_URL" "$SITE_DIR"
fi
rm -rf "$CONTENT_BACKUP_DIR"

echo "== 4/9: Panel bağımlılıkları kuruluyor =="
cd "$SITE_DIR/server"
npm install --omit=dev --silent

echo "== 5/9: Panel giriş bilgileri =="
if [ -f "$ENV_FILE" ]; then
  echo "Mevcut giriş bilgileri korunacak, port ayarları güncelleniyor."
  ADMIN_USERNAME=$(grep -oP '(?<=^ADMIN_USERNAME=).*' "$ENV_FILE")
  ADMIN_PASSWORD_HASH=$(grep -oP '(?<=^ADMIN_PASSWORD_HASH=).*' "$ENV_FILE")
  SESSION_SECRET=$(grep -oP '(?<=^SESSION_SECRET=).*' "$ENV_FILE")
else
  read -rp "Panel için kullanıcı adı belirleyin [admin]: " ADMIN_USERNAME
  ADMIN_USERNAME=${ADMIN_USERNAME:-admin}
  while true; do
    read -rsp "Panel için şifre belirleyin: " ADMIN_PASSWORD
    echo
    read -rsp "Şifreyi tekrar girin: " ADMIN_PASSWORD_CONFIRM
    echo
    [ "$ADMIN_PASSWORD" = "$ADMIN_PASSWORD_CONFIRM" ] && [ -n "$ADMIN_PASSWORD" ] && break
    echo "Şifreler eşleşmedi ya da boş, tekrar deneyin."
  done

  ADMIN_PASSWORD_HASH=$(node -e "console.log(require('bcryptjs').hashSync(process.argv[1], 10))" "$ADMIN_PASSWORD")
  SESSION_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
  unset ADMIN_PASSWORD ADMIN_PASSWORD_CONFIRM
fi

# Kimlik bilgileri korunur; port ve URL bilgisi her çalıştırmada güncel
# nginx yapılandırmasıyla aynı kalması için baştan yazılır.
cat > "$ENV_FILE" <<EOF
ADMIN_USERNAME=$ADMIN_USERNAME
ADMIN_PASSWORD_HASH=$ADMIN_PASSWORD_HASH
SESSION_SECRET=$SESSION_SECRET
NODE_PORT=$NODE_PORT
SITE_URL=https://$DOMAIN/
EOF
chmod 600 "$ENV_FILE"

echo "== 6/9: systemd servisi oluşturuluyor =="
cat > "/etc/systemd/system/${SERVICE_NAME}.service" <<EOF
[Unit]
Description=BÜKÜ ART yönetim paneli
After=network.target

[Service]
Type=simple
WorkingDirectory=$SITE_DIR/server
EnvironmentFile=$SITE_DIR/server/.env
ExecStart=$(command -v node) $SITE_DIR/server/admin-app.js
Restart=on-failure
User=www-data
Group=www-data

[Install]
WantedBy=multi-user.target
EOF

chown -R www-data:www-data "$SITE_DIR"
systemctl daemon-reload
systemctl enable "$SERVICE_NAME" >/dev/null
systemctl restart "$SERVICE_NAME"

echo "== 7/9: Nginx (geçici HTTP yapılandırması) =="
# Let's Encrypt doğrulaması için önce düz HTTP üzerinden alan adına yanıt
# verilmesi gerekiyor; sertifika alındıktan sonra bu dosyayı HTTPS'li
# haliyle yeniden yazacağız.
cat > "/etc/nginx/sites-available/bukuart" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;
    root $SITE_DIR;
    index index.html;

    location / {
        try_files \$uri \$uri/ =404;
    }
}

server {
    listen $ADMIN_PORT;
    listen [::]:$ADMIN_PORT;
    server_name $DOMAIN;

    location / {
        proxy_pass http://127.0.0.1:$NODE_PORT;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

ln -sf /etc/nginx/sites-available/bukuart /etc/nginx/sites-enabled/bukuart
nginx -t
systemctl reload nginx

echo "== 8/9: HTTPS sertifikası (Let's Encrypt) =="
HAVE_CERT=0
if certbot certonly --nginx -d "$DOMAIN" --non-interactive --agree-tos \
    -m "$LETSENCRYPT_EMAIL" --no-eff-email \
    --deploy-hook "systemctl reload nginx"; then
  HAVE_CERT=1
else
  echo "UYARI: Sertifika alınamadı. DNS kaydının (bukraozyaparart -> bu sunucunun IP'si)"
  echo "yayılmış olduğundan emin olun ve script'i daha sonra tekrar çalıştırın."
  echo "Site şimdilik düz HTTP üzerinden yayında kalacak."
fi

CERT_DIR="/etc/letsencrypt/live/$DOMAIN"
if [ "$HAVE_CERT" -eq 1 ] && [ -f "$CERT_DIR/fullchain.pem" ]; then
  echo "== 9/9: Nginx (HTTPS yapılandırması uygulanıyor) =="
  cat > "/etc/nginx/sites-available/bukuart" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name $DOMAIN;
    root $SITE_DIR;
    index index.html;

    ssl_certificate $CERT_DIR/fullchain.pem;
    ssl_certificate_key $CERT_DIR/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    location / {
        try_files \$uri \$uri/ =404;
    }
}

server {
    listen $ADMIN_PORT ssl;
    listen [::]:$ADMIN_PORT ssl;
    server_name $DOMAIN;

    ssl_certificate $CERT_DIR/fullchain.pem;
    ssl_certificate_key $CERT_DIR/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    location / {
        proxy_pass http://127.0.0.1:$NODE_PORT;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF
  nginx -t
  systemctl reload nginx
else
  echo "== 9/9: Nginx yapılandırması HTTP olarak bırakıldı (sertifika yok) =="
fi

echo "== Güvenlik duvarı =="
if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
  ufw allow 80/tcp >/dev/null
  ufw allow 443/tcp >/dev/null
  ufw allow "$ADMIN_PORT"/tcp >/dev/null
  echo "ufw üzerinden 80, 443 ve $ADMIN_PORT portları açıldı."
else
  echo "ufw aktif değil ya da kurulu değil; portları sağlayıcınızın (VPS panelinin)"
  echo "güvenlik duvarından da açmanız gerekebilir (80, 443, $ADMIN_PORT)."
fi

echo ""
echo "======================================================"
echo " Kurulum tamamlandı!"
if [ "$HAVE_CERT" -eq 1 ]; then
  echo " Site   : https://$DOMAIN"
  echo " Panel  : https://$DOMAIN:$ADMIN_PORT"
else
  echo " Site   : http://$DOMAIN  (HTTPS henüz kurulamadı, yukarıdaki uyarıya bakın)"
  echo " Panel  : http://$DOMAIN:$ADMIN_PORT"
fi
echo "======================================================"
