# BÜKÜ ART — Workshop & Etkinlik Sitesi

Instagram sayfanız (**bukraozyapar.art**) temalı, çini/tezhip workshop etkinliklerini
duyurabileceğiniz ve rezervasyonları WhatsApp üzerinden alabileceğiniz statik bir site.
Etkinlikleri ve site bilgilerini kod yazmadan düzenleyebilmeniz için şifre korumalı
küçük bir yönetim paneli bulunuyor.

## Klasör Yapısı

```
index.html              → Ana sayfa
css/style.css           → Site teması
js/main.js               → İçeriği JSON'dan okuyup sayfaya basan script
content/settings.json   → Marka adı, slogan, WhatsApp numarası, Instagram, vb.
content/events.json     → Etkinlik listesi
content/gallery.json    → "Hakkımızda" bölümündeki galeri görselleri
assets/                  → Logo ve dekoratif görseller
images/uploads/          → Panelden yüklenen görseller buraya gelir
server/                  → Yönetim paneli (Node.js + Express, şifre korumalı)
deploy/setup-vps.sh      → VPS'e tek komutla kurulum script'i
```

## 1. VPS'e Kurulum

`deploy/setup-vps.sh` script'i, **Ubuntu/Debian tabanlı** bir VPS'te siteyi ve
yönetim panelini `bukraozyaparart.taslak.site` alan adında, ücretsiz Let's
Encrypt sertifikasıyla (HTTPS) otomatik olarak kurar. Script şunları yapar:

- Eksikse Nginx, Node.js ve certbot'u kurar (mevcut kuruluysa dokunmaz).
- Bu deponun ilgili branch'ini `/var/www/bukuart` altına indirir.
- Site standart 80/443 portlarında, panel ise **aynı alan adının `/admin`
  yolunda** yayınlanır — ayrı bir port numarası hatırlamanıza gerek kalmaz
  (nginx `/admin` isteklerini dahili bir Node sürecine yönlendirir, geri kalan
  her şeyi statik dosya olarak sunar). Sunucudaki diğer sitelere/portlara
  dokunulmaz.
- Panel için kullanıcı adı/şifre belirlemenizi ister, güvenli bir oturum anahtarı
  üretir.
- Paneli `systemd` servisi olarak kurar (sunucu yeniden başlasa da otomatik ayağa
  kalkar).
- `certbot` ile `bukraozyaparart.taslak.site` için ücretsiz bir HTTPS
  sertifikası alır ve otomatik yenileme kurar.
- Nginx'e **yeni ve izole** bir site tanımı ekler (mevcut `sites-available` /
  `sites-enabled` dosyalarınızın hiçbirini değiştirmez).

### Kurulum adımları

VPS'inize SSH ile bağlanıp şu komutları çalıştırın:

```bash
git clone --branch claude/workshop-events-website-p4wwtb --single-branch \
  https://github.com/devrankacan/bukraozyaparart.git /tmp/bukuart-setup
sudo bash /tmp/bukuart-setup/deploy/setup-vps.sh
```

Script size sırasıyla:
1. Panel için bir **kullanıcı adı** soracak (boş bırakırsanız `admin` olur).
2. Panel için bir **şifre** soracak (ekranda görünmez, iki kez girmeniz istenir).

Kurulum bitince ekranda şöyle bir özet göreceksiniz:

```
Site   : https://bukraozyaparart.taslak.site
Panel  : https://bukraozyaparart.taslak.site/admin
```

> **Not:** DNS kaydı (`bukraozyaparart` → sunucunuzun IP'si) henüz yayılmamışsa
> certbot sertifika alamaz; script bu durumda siteyi geçici olarak düz HTTP ile
> ayakta tutar ve `/admin` proxy'sini henüz eklemez (sertifikasız panel şifre
> trafiğini şifrelenmemiş göndermemek için). DNS yayıldıktan sonra script'i
> tekrar çalıştırmanız yeterli, panel de o zaman eklenir.

### Script'i tekrar çalıştırma (güncelleme)

Siteye yeni bir özellik/tasarım güncellemesi geldiğinde script'i tekrar
çalıştırabilirsiniz; panelden girdiğiniz etkinlikler ve ayarlar **otomatik
olarak yedeklenip geri yüklenir**, kaybolmaz:

```bash
sudo bash /tmp/bukuart-setup/deploy/setup-vps.sh
```

## 2. Panel Kullanımı

**`https://bukraozyaparart.taslak.site/admin`** adresine gidip belirlediğiniz
kullanıcı adı/şifre ile giriş yapın. Panelden:

- Marka adı, slogan, hakkımızda metni, **WhatsApp numarası**, Instagram
  kullanıcı adı gibi genel ayarları güncelleyebilirsiniz.
- Etkinlik ekleyebilir, düzenleyebilir, görsel yükleyebilir, silebilir veya
  "Sitede Göster" kutusunu kapatarak yayından geçici olarak kaldırabilirsiniz.
- "Hakkımızda" bölümündeki galeriye fotoğraf ekleyip silebilirsiniz.

Değişiklikler kaydedildiği anda ana sitede görünür — ayrıca bir yayınlama/build
adımı gerekmez.

Şifrenizi unutursanız, VPS'te şunu çalıştırarak sıfırlayabilirsiniz:

```bash
cd /var/www/bukuart/server
NEW_HASH=$(node -e "console.log(require('bcryptjs').hashSync('YENI_SIFRENIZ', 10))")
sed -i "s|^ADMIN_PASSWORD_HASH=.*|ADMIN_PASSWORD_HASH=$NEW_HASH|" .env
sudo systemctl restart bukuart-admin
```

## 3. WhatsApp Numarasını Ayarlama

Kurulumda `content/settings.json` içinde **placeholder** bir numara bulunur
(`905555555555`). Gerçek numaranızı girmeden rezervasyon linkleri çalışmaz.

- **Panel üzerinden:** Giriş yapıp "Site Ayarları" → "WhatsApp Numarası"
  alanını gerçek numaranızla güncelleyip kaydedin (ülke koduyla, başında `+`
  ya da boşluk olmadan — örn. `905321234567`).

## 4. Etkinlik Ekleme / Düzenleme

Panelde "Yeni Etkinlik Ekle" formunu kullanın veya mevcut bir etkinliğin
altındaki formdan düzenleyin. Her etkinlik kartındaki "Rezervasyon Oluştur"
butonu, etkinliğin başlığı ve tarihiyle otomatik doldurulmuş bir WhatsApp
mesajı açar; isterseniz "Özel WhatsApp Mesajı" alanına kendi metninizi
yazabilirsiniz.

## 5. Görselleri Değiştirme

- Etkinlik veya galeri görsellerini panelden ilgili "Görsel" yükleme
  formuyla ekleyebilir/değiştirebilirsiniz.
- `assets/` klasöründeki logo ve dekoratif görseller kendi tasarımlarınızla
  değiştirilebilir (aynı dosya adlarını koruyarak, sunucuda
  `/var/www/bukuart/assets/` altında).

## 6. Alan Adı ve HTTPS

Site, `bukraozyaparart.taslak.site` alan adı ve HTTPS ile kurulacak şekilde
yapılandırıldı — `deploy/setup-vps.sh` içindeki `DOMAIN` değişkeni bunu
belirler. Farklı bir alan adına geçmek isterseniz:

1. Yeni alan adının DNS **A kaydını** VPS'inizin IP adresine yönlendirin.
2. `deploy/setup-vps.sh` dosyasındaki `DOMAIN="bukraozyaparart.taslak.site"`
   satırını yeni alan adınızla değiştirin.
3. Script'i tekrar çalıştırın; certbot yeni alan adı için otomatik olarak
   sertifika alır.

HTTPS sertifikası Let's Encrypt tarafından 90 günde bir otomatik yenilenir
(certbot kurulumla birlikte gelen sistem zamanlayıcısı üzerinden), elle bir
şey yapmanız gerekmez.

## 7. Lokal Önizleme (geliştirme amaçlı)

```bash
python3 -m http.server 8080
```

Sonra `http://localhost:8080` adresini açın (panel olmadan, sadece statik
siteyi görürsünüz).
