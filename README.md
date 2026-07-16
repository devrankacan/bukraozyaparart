# BÜKÜ ART — Workshop & Etkinlik Sitesi

Instagram sayfanız (**bukraozyapar.art**) temalı, çini/tezhip workshop etkinliklerini
duyurabileceğiniz ve rezervasyonları WhatsApp üzerinden alabileceğiniz statik bir site.
Etkinlikleri ve site bilgilerini kod yazmadan düzenleyebilmeniz için `/admin` adresinde
bir yönetim paneli (Decap CMS) bulunuyor.

## Klasör Yapısı

```
index.html            → Ana sayfa
css/style.css          → Site teması
js/main.js              → İçeriği JSON'dan okuyup sayfaya basan script
content/settings.json  → Marka adı, slogan, WhatsApp numarası, Instagram, vb.
content/events.json    → Etkinlik listesi
assets/                → Logo ve dekoratif görseller
images/uploads/         → Panelden yüklenen etkinlik görselleri buraya gelir
admin/                 → Yönetim paneli (Decap CMS)
```

## 1. Siteyi Yayına Alma (Netlify — önerilen, ücretsiz)

Panelin çalışabilmesi için (giriş yapıp etkinlik ekleyebilmeniz için) siteyi
**Netlify** üzerinden yayınlamanız gerekiyor. Netlify, statik siteler için "Identity"
(kullanıcı girişi) ve "Git Gateway" (paneldeki değişiklikleri otomatik olarak bu
GitHub deposuna kaydetme) özelliklerini ücretsiz sunar.

1. [netlify.com](https://netlify.com) üzerinde ücretsiz bir hesap açın.
2. "Add new site" → "Import an existing project" → GitHub'ı seçip bu depoyu
   (`devrankacan/bukraozyaparart`) bağlayın.
3. Branch olarak yayınlamak istediğiniz branch'i seçin (build ayarı gerekmez,
   "Build command" boş, "Publish directory" `.` olmalı — `netlify.toml` bunu
   otomatik ayarlar).
4. Site yayınlandıktan sonra Netlify panelinde **Site configuration → Identity**
   bölümüne gidip "Enable Identity" butonuna basın.
5. Aynı sayfada **Registration** ayarını "Invite only" yapın (herkesin kayıt
   olmasını istemezsiniz).
6. **Identity → Services → Git Gateway** bölümünden "Enable Git Gateway"e basın.
7. **Identity → Invite users** ile kendi e-posta adresinizi davet edin
   (devrankacan9@gmail.com). Gelen davet e-postasındaki linke tıklayıp şifre
   belirleyin.
8. `admin/config.yml` içindeki `branch:` değerinin, Netlify'da yayınladığınız
   branch adıyla aynı olduğundan emin olun (varsayılan `main`).
9. Artık `https://siteniz.netlify.app/admin/` adresinden giriş yapıp panele
   erişebilirsiniz.

> Not: Panel olmadan da site normal şekilde çalışır — sadece içerik değişikliği
> için `content/settings.json` ve `content/events.json` dosyalarını elle
> düzenlemeniz gerekir.

## 2. WhatsApp Numarasını Ayarlama

Şu an `content/settings.json` içinde **placeholder** bir numara var
(`905555555555`). Gerçek numaranızı girmeden rezervasyon linkleri çalışmaz.

- **Panel üzerinden:** `/admin` → Site Ayarları → "WhatsApp Numarası" alanını
  gerçek numaranızla güncelleyip kaydedin (ülke koduyla, başında `+` ya da
  boşluk olmadan — örn. `905321234567`).
- **Elle:** `content/settings.json` dosyasında `"whatsapp"` değerini değiştirin.

## 3. Etkinlik Ekleme / Düzenleme

- **Panel üzerinden:** `/admin` → Etkinlikler → "Etkinlik Listesi" içinden yeni
  satır ekleyin veya mevcut bir etkinliği düzenleyin. "Sitede Göster (Aktif)"
  kutusunu kapatırsanız etkinlik yayından kalkar ama silinmez.
- **Elle:** `content/events.json` dosyasına yeni bir obje ekleyin.

Her etkinlik kartındaki "WhatsApp ile Rezervasyon Yap" butonu, etkinliğin
başlığı ve tarihiyle otomatik doldurulmuş bir WhatsApp mesajı açar. İsterseniz
her etkinlik için "Özel WhatsApp Mesajı" alanına kendi metninizi yazabilirsiniz.

## 4. Görselleri Değiştirme

- Instagram gönderilerinizdeki gerçek fotoğrafları kullanmak için panelden
  (Etkinlikler → ilgili etkinlik → "Görsel") veya doğrudan `images/uploads/`
  klasörüne dosya ekleyerek `content/events.json` içindeki `image` alanına
  yolunu yazabilirsiniz.
- `assets/` klasöründeki logo ve dekoratif çini/tabak illüstrasyonları kendi
  tasarımlarınızla değiştirilebilir (aynı dosya adlarını koruyarak).

## 5. Lokal Önizleme

Herhangi bir kurulum gerekmez, sadece statik dosyaları bir sunucudan servis
etmeniz yeterli (tarayıcıda doğrudan `index.html` açarsanız `fetch()` ile JSON
yükleme CORS nedeniyle çalışmayabilir):

```bash
python3 -m http.server 8080
# veya
npx serve .
```

Sonra `http://localhost:8080` adresini açın.

## 6. Alan Adı Bağlama

Netlify'da **Domain settings** üzerinden kendi alan adınızı (örn.
`bukuart.com`) siteye bağlayabilirsiniz. GitHub Pages, Vercel gibi başka statik
hosting servisleri de kullanılabilir; ancak `/admin` panelinin çalışması için
Netlify Identity + Git Gateway (ya da Decap CMS'in desteklediği alternatif bir
backend, örn. GitHub OAuth) gerekir.
