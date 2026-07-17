#!/usr/bin/env bash
# BÜKÜ ART sitesini VPS'e kurar: bukraozyaparart.taslak.site alan adına,
# ücretsiz Let's Encrypt sertifikasıyla (HTTPS). Panel aynı alan adının
# /admin yolunda çalışır (ayrı bir port numarası gerekmez). Mevcut
# sitelere dokunmaz: kendi dizinine, kendi nginx server block'larına ve
# kendi systemd servisine kurulum yapar. Ubuntu/Debian tabanlı sunucular
# için tasarlanmıştır. root olarak çalıştırın:
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

echo "== 1/8: Gerekli paketler kontrol ediliyor =="
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

echo "== 2/8: Dahili panel portu belirleniyor =="
is_port_free() { ! ss -ltn 2>/dev/null | awk '{print $4}' | grep -qE "[:.]$1\$"; }

find_free_port() {
  local port=$1
  while ! is_port_free "$port"; do
    port=$((port + 1))
  done
  echo "$port"
}

ENV_FILE="$SITE_DIR/server/.env"

# Panel artık ayrı bir dış port değil, aynı alan adının /admin yolu
# üzerinden erişiliyor (nginx buradan dahili Node sürecine proxy yapar).
# Bu dahili port her çalıştırmada yeniden bulunur; .env aşağıda her
# zaman aynı değerle yeniden yazılır, bu yüzden nginx <-> Node arasında
# sürüm farkı/uyumsuzluk oluşamaz.
NODE_PORT=$(find_free_port 4001)
echo "Dahili panel süreci: 127.0.0.1:$NODE_PORT (dışarıya kapalı, sadece nginx erişir)"

echo "== 3/8: Site dosyaları çekiliyor =="
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
  cp "$SITE_DIR/content/gallery.json" "$CONTENT_BACKUP_DIR/" 2>/dev/null || true
  git -C "$SITE_DIR" fetch origin "$BRANCH" --quiet
  git -C "$SITE_DIR" checkout "$BRANCH" --quiet
  git -C "$SITE_DIR" reset --hard "origin/$BRANCH" --quiet
  [ -f "$CONTENT_BACKUP_DIR/settings.json" ] && cp "$CONTENT_BACKUP_DIR/settings.json" "$SITE_DIR/content/settings.json"
  [ -f "$CONTENT_BACKUP_DIR/events.json" ] && cp "$CONTENT_BACKUP_DIR/events.json" "$SITE_DIR/content/events.json"
  [ -f "$CONTENT_BACKUP_DIR/gallery.json" ] && cp "$CONTENT_BACKUP_DIR/gallery.json" "$SITE_DIR/content/gallery.json"
else
  git clone --branch "$BRANCH" --single-branch "$REPO_URL" "$SITE_DIR"
fi
rm -rf "$CONTENT_BACKUP_DIR"

echo "== 4/8: Panel bağımlılıkları kuruluyor =="
cd "$SITE_DIR/server"
npm install --omit=dev --silent

echo "== 5/8: Panel giriş bilgileri =="
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

echo "== 6/8: systemd servisi oluşturuluyor =="
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

echo "== 7/8: Nginx (geçici HTTP yapılandırması) =="
# Let's Encrypt doğrulaması için önce düz HTTP üzerinden alan adına yanıt
# verilmesi gerekiyor; sertifika alındıktan sonra bu dosyayı HTTPS'li
# haliyle (ve /admin proxy'siyle) yeniden yazacağız.
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
EOF

ln -sf /etc/nginx/sites-available/bukuart /etc/nginx/sites-enabled/bukuart
nginx -t
systemctl reload nginx

echo "== 8/8: HTTPS sertifikası (Let's Encrypt) ve nihai yapılandırma =="
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

    # Yönetim paneli: aynı alan adı, /admin yolu -> dahili Node süreci.
    location /admin {
        proxy_pass http://127.0.0.1:$NODE_PORT;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # Sitenin geri kalanı: statik dosyalar.
    location / {
        try_files \$uri \$uri/ =404;
    }
}
EOF
  nginx -t
  systemctl reload nginx
else
  echo "Nginx yapılandırması HTTP olarak bırakıldı (sertifika yok); /admin proxy'si"
  echo "sertifika alınana kadar eklenmedi, script'i tekrar çalıştırınca eklenecek."
fi

echo "== Güvenlik duvarı =="
if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
  ufw allow 80/tcp >/dev/null
  ufw allow 443/tcp >/dev/null
  echo "ufw üzerinden 80 ve 443 portları açıldı."
else
  echo "ufw aktif değil ya da kurulu değil; 80 ve 443 portlarını sağlayıcınızın"
  echo "(VPS panelinin) güvenlik duvarından da açmanız gerekebilir."
fi

echo ""
echo "======================================================"
echo " Kurulum tamamlandı!"
if [ "$HAVE_CERT" -eq 1 ]; then
  echo " Site   : https://$DOMAIN"
  echo " Panel  : https://$DOMAIN/admin"
else
  echo " Site   : http://$DOMAIN  (HTTPS henüz kurulamadı, yukarıdaki uyarıya bakın)"
  echo " Panel  : sertifika alındıktan sonra https://$DOMAIN/admin"
fi
echo "======================================================"
