#!/usr/bin/env bash
# BÜKÜ ART sitesini VPS'e kurar. Mevcut sitelere/portlara dokunmaz:
# yeni bir dizine, yeni (boş) portlara ve yeni bir systemd servisine kurulum yapar.
# Ubuntu/Debian tabanlı sunucular için tasarlanmıştır. root olarak çalıştırın:
#   sudo bash setup-vps.sh
set -euo pipefail

REPO_URL="https://github.com/devrankacan/bukraozyaparart.git"
BRANCH="claude/workshop-events-website-p4wwtb"
SITE_DIR="/var/www/bukuart"
SERVICE_NAME="bukuart-admin"

if [ "$(id -u)" -ne 0 ]; then
  echo "Bu script root olarak çalıştırılmalı: sudo bash setup-vps.sh" >&2
  exit 1
fi

echo "== 1/8: Gerekli paketler kontrol ediliyor =="
apt-get update -qq
apt-get install -y -qq git curl ca-certificates >/dev/null

if ! command -v nginx >/dev/null 2>&1; then
  echo "Nginx bulunamadı, kuruluyor..."
  NGINX_FRESH_INSTALL=1
  apt-get install -y -qq nginx >/dev/null
  # Diğer bir web sunucusuyla (ör. Apache) port 80 çakışmasın diye
  # nginx'in varsayılan sitesini devre dışı bırakıyoruz; sadece kendi portumuzu kullanacağız.
  rm -f /etc/nginx/sites-enabled/default
else
  echo "Nginx zaten kurulu, mevcut ayarlara dokunulmayacak."
  NGINX_FRESH_INSTALL=0
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js bulunamadı, kuruluyor (NodeSource, Node 20 LTS)..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
else
  echo "Node.js zaten kurulu: $(node -v)"
fi

echo "== 2/8: Boş portlar seçiliyor =="
is_port_free() { ! ss -ltn 2>/dev/null | awk '{print $4}' | grep -qE "[:.]$1\$"; }

find_free_port() {
  local port=$1
  while ! is_port_free "$port"; do
    port=$((port + 1))
  done
  echo "$port"
}

SITE_PORT=$(find_free_port 8081)
ADMIN_PORT=$(find_free_port $((SITE_PORT + 1)))
NODE_PORT=$(find_free_port 4001)
echo "Site portu: $SITE_PORT | Panel portu: $ADMIN_PORT | Dahili panel süreci: 127.0.0.1:$NODE_PORT"

echo "== 3/8: Site dosyaları çekiliyor =="
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

echo "== 4/8: Panel bağımlılıkları kuruluyor =="
cd "$SITE_DIR/server"
npm install --omit=dev --silent

echo "== 5/8: Panel giriş bilgileri =="
if [ -f "$SITE_DIR/server/.env" ]; then
  echo ".env dosyası zaten var, mevcut giriş bilgileri korunacak."
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
  VPS_IP=$(curl -fsSL -4 ifconfig.me || hostname -I | awk '{print $1}')

  cat > "$SITE_DIR/server/.env" <<EOF
ADMIN_USERNAME=$ADMIN_USERNAME
ADMIN_PASSWORD_HASH=$ADMIN_PASSWORD_HASH
SESSION_SECRET=$SESSION_SECRET
ADMIN_PORT=$NODE_PORT
SITE_URL=http://$VPS_IP:$SITE_PORT/
EOF
  chmod 600 "$SITE_DIR/server/.env"
  unset ADMIN_PASSWORD ADMIN_PASSWORD_CONFIRM
fi

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

echo "== 7/8: Nginx yapılandırması ekleniyor (izole, yeni dosya) =="
cat > "/etc/nginx/sites-available/bukuart" <<EOF
# BÜKÜ ART - statik site (yeni, izole port; mevcut sitelere dokunmaz)
server {
    listen $SITE_PORT;
    listen [::]:$SITE_PORT;
    server_name _;
    root $SITE_DIR;
    index index.html;

    location / {
        try_files \$uri \$uri/ =404;
    }
}

# BÜKÜ ART - yönetim paneli (ayrı port, dahili Node servisine proxy)
server {
    listen $ADMIN_PORT;
    listen [::]:$ADMIN_PORT;
    server_name _;

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

echo "== 8/8: Güvenlik duvarı =="
if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
  ufw allow "$SITE_PORT"/tcp >/dev/null
  ufw allow "$ADMIN_PORT"/tcp >/dev/null
  echo "ufw üzerinden $SITE_PORT ve $ADMIN_PORT portları açıldı."
else
  echo "ufw aktif değil ya da kurulu değil; portları sağlayıcınızın (VPS panelinin)"
  echo "güvenlik duvarından da açmanız gerekebilir."
fi

VPS_IP=${VPS_IP:-$(curl -fsSL -4 ifconfig.me || hostname -I | awk '{print $1}')}
echo ""
echo "======================================================"
echo " Kurulum tamamlandı!"
echo " Site   : http://$VPS_IP:$SITE_PORT"
echo " Panel  : http://$VPS_IP:$ADMIN_PORT"
echo "======================================================"
echo " Not: Panel şu an düz HTTP üzerinden çalışıyor (alan adınız olmadığı"
echo " için TLS sertifikası kurulamıyor). Bir alan adı bağladığınızda"
echo " certbot ile HTTPS eklenmesini önemle tavsiye ederiz."
echo "======================================================"
