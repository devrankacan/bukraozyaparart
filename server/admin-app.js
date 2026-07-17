"use strict";

require("dotenv").config();

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const rateLimit = require("express-rate-limit");

const PORT = process.env.NODE_PORT || 4001;
const SITE_URL = process.env.SITE_URL || "/";
const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH;
const SESSION_SECRET = process.env.SESSION_SECRET;
const BASE = "/admin";

if (!ADMIN_USERNAME || !ADMIN_PASSWORD_HASH || !SESSION_SECRET) {
  console.error("ADMIN_USERNAME, ADMIN_PASSWORD_HASH ve SESSION_SECRET .env içinde tanımlı olmalı.");
  process.exit(1);
}

const SETTINGS_PATH = path.join(__dirname, "..", "content", "settings.json");
const EVENTS_PATH = path.join(__dirname, "..", "content", "events.json");
const GALLERY_PATH = path.join(__dirname, "..", "content", "gallery.json");
const UPLOAD_DIR = path.join(__dirname, "..", "images", "uploads");

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const app = express();
app.set("trust proxy", 1);
app.use(express.urlencoded({ extended: true }));

// Statik varlıklar (/assets, /images/uploads) bu uygulamaya hiç gelmez;
// nginx bunları /admin dışındaki her şey gibi doğrudan siteden sunar.

app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "lax", maxAge: 8 * 60 * 60 * 1000 },
}));

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: "Çok fazla başarısız giriş denemesi. Lütfen 15 dakika sonra tekrar deneyin.",
});

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${Date.now()}-${crypto.randomBytes(4).toString("hex")}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /^image\/(png|jpe?g|webp|gif|svg\+xml)$/.test(file.mimetype);
    cb(ok ? null : new Error("Sadece görsel dosyaları yüklenebilir."), ok);
  },
});

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function layout(title, body) {
  return `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)} | BÜKÜ ART Panel</title>
<style>
  :root { --bg:#0b0d12; --card:#151922; --border:rgba(201,151,31,.3); --gold:#c9971f; --gold-l:#e8c96b; --text:#eee6d6; --muted:#a9a6a0; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--text); font-family: system-ui, -apple-system, sans-serif; line-height:1.55; }
  .wrap { max-width: 920px; margin: 0 auto; padding: 32px 20px 80px; }
  h1 { font-size: 1.4rem; color: var(--gold-l); }
  h2 { font-size: 1.1rem; color: var(--gold-l); border-bottom: 1px solid var(--border); padding-bottom: 8px; }
  .card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 24px; margin-bottom: 24px; }
  label { display:block; font-size: .82rem; color: var(--muted); margin: 12px 0 4px; }
  input[type=text], input[type=password], input[type=date], textarea, input[type=file] {
    width: 100%; padding: 10px 12px; border-radius: 8px; border: 1px solid var(--border);
    background: #0e1119; color: var(--text); font-size: .92rem; font-family: inherit;
  }
  textarea { min-height: 70px; resize: vertical; }
  .row { display: flex; gap: 16px; flex-wrap: wrap; }
  .row > * { flex: 1; min-width: 160px; }
  .checkbox { display:flex; align-items:center; gap:8px; margin-top:14px; }
  .checkbox input { width:auto; }
  button, .btn { display:inline-block; margin-top:16px; padding: 10px 22px; border-radius: 999px; border:none;
    background: linear-gradient(135deg, var(--gold-l), var(--gold)); color:#1a1305; font-weight:600; cursor:pointer; font-size:.9rem; text-decoration:none; }
  button.danger { background: #b6435a; color:#fff; }
  .event-item { border-top: 1px solid var(--border); padding-top: 18px; margin-top: 18px; }
  .event-item:first-of-type { border-top:none; padding-top:0; margin-top:0; }
  .gallery-grid-admin { display:flex; flex-wrap:wrap; gap:16px; }
  .gallery-item-admin { width: 140px; }
  .gallery-item-admin img { width:140px; height:140px; object-fit:cover; border-radius:8px; border:1px solid var(--border); }
  .gallery-item-admin form { margin-top:6px; }
  .gallery-item-admin button { margin-top:6px; padding:6px 14px; font-size:.78rem; width:100%; }
  .top-bar { display:flex; justify-content:space-between; align-items:center; margin-bottom:24px; }
  .top-bar a { color: var(--gold); font-size:.85rem; }
  .flash { background:#1c2c1c; border:1px solid #3a6b3a; color:#bfe6bf; padding:10px 16px; border-radius:8px; margin-bottom:20px; font-size:.9rem; }
  .thumb { max-width: 120px; border-radius: 6px; border:1px solid var(--border); display:block; margin-top:8px; }
  .site-link { font-size:.82rem; color: var(--muted); }
  .panel-logo { display:block; height: 96px; width:auto; margin: 0 auto; }
  .panel-logo-row { text-align:center; margin-bottom: 8px; }
  .top-bar .panel-logo { height: 64px; margin: 0; }
</style>
</head>
<body>
<div class="wrap">
${body}
</div>
</body>
</html>`;
}

function requireAuth(req, res, next) {
  if (req.session && req.session.authed) return next();
  res.redirect(`${BASE}/login`);
}

app.get(`${BASE}/login`, (req, res) => {
  const error = req.query.error ? `<div class="flash" style="background:#2c1c1c;border-color:#6b3a3a;color:#e6bfbf;">Kullanıcı adı veya şifre hatalı.</div>` : "";
  res.send(layout("Giriş", `
    <div class="panel-logo-row">
      <img class="panel-logo" src="/assets/logo-full.png" alt="Büku Art">
    </div>
    <div class="card" style="max-width:360px;margin:24px auto 0;">
      ${error}
      <form method="POST" action="${BASE}/login">
        <label for="username">Kullanıcı Adı</label>
        <input type="text" id="username" name="username" required autofocus>
        <label for="password">Şifre</label>
        <input type="password" id="password" name="password" required>
        <button type="submit">Giriş Yap</button>
      </form>
    </div>
  `));
});

app.post(`${BASE}/login`, loginLimiter, (req, res) => {
  const { username, password } = req.body;
  const validUser = username === ADMIN_USERNAME;
  const validPass = validUser && bcrypt.compareSync(password || "", ADMIN_PASSWORD_HASH);
  if (validUser && validPass) {
    req.session.authed = true;
    return res.redirect(BASE);
  }
  res.redirect(`${BASE}/login?error=1`);
});

app.post(`${BASE}/logout`, (req, res) => {
  req.session.destroy(() => res.redirect(`${BASE}/login`));
});

app.get(BASE, requireAuth, (req, res) => {
  const settings = readJson(SETTINGS_PATH);
  const eventsData = readJson(EVENTS_PATH);
  const galleryData = readJson(GALLERY_PATH);
  const saved = req.query.saved ? `<div class="flash">Değişiklikler kaydedildi.</div>` : "";

  const eventsHtml = (eventsData.events || []).map((ev, i) => `
    <div class="event-item">
      <form method="POST" action="${BASE}/events/${i}">
        <div class="row">
          <div><label>Başlık</label><input type="text" name="title" value="${escapeHtml(ev.title)}" required></div>
          <div><label>Tarih</label><input type="date" name="date" value="${escapeHtml(ev.date)}" required></div>
        </div>
        <div class="row">
          <div><label>Saat</label><input type="text" name="time" value="${escapeHtml(ev.time)}"></div>
          <div><label>Konum</label><input type="text" name="location" value="${escapeHtml(ev.location)}"></div>
        </div>
        <div class="row">
          <div><label>Kontenjan</label><input type="text" name="capacity" value="${escapeHtml(ev.capacity)}"></div>
          <div><label>Ücret</label><input type="text" name="price" value="${escapeHtml(ev.price)}"></div>
        </div>
        <label>Açıklama</label>
        <textarea name="description">${escapeHtml(ev.description)}</textarea>
        <label>Özel WhatsApp Mesajı (boş bırakılırsa otomatik oluşur)</label>
        <input type="text" name="whatsappMessage" value="${escapeHtml(ev.whatsappMessage)}">
        <input type="hidden" name="image" value="${escapeHtml(ev.image)}">
        ${ev.image ? `<img class="thumb" src="${escapeHtml(ev.image)}" alt="">` : ""}
        <div class="checkbox"><input type="checkbox" name="active" id="active-${i}" ${ev.active !== false ? "checked" : ""}><label for="active-${i}" style="margin:0;">Sitede göster (aktif)</label></div>
        <button type="submit">Kaydet</button>
      </form>
      <form method="POST" action="${BASE}/events/${i}/image" enctype="multipart/form-data" style="margin-top:10px;">
        <label>Görsel Değiştir</label>
        <input type="file" name="image" accept="image/*">
        <button type="submit">Görseli Yükle</button>
      </form>
      <form method="POST" action="${BASE}/events/${i}/delete" style="margin-top:6px;" onsubmit="return confirm('Bu etkinliği silmek istediğinize emin misiniz?');">
        <button type="submit" class="danger">Etkinliği Sil</button>
      </form>
    </div>
  `).join("") || "<p>Henüz etkinlik eklenmemiş.</p>";

  const galleryHtml = (galleryData.images || []).map((img, i) => `
    <div class="gallery-item-admin">
      <img src="${escapeHtml(img.image)}" alt="${escapeHtml(img.caption || "")}">
      <form method="POST" action="${BASE}/gallery/${i}/delete" onsubmit="return confirm('Bu görseli silmek istediğinize emin misiniz?');">
        <button type="submit" class="danger">Sil</button>
      </form>
    </div>
  `).join("") || "<p>Henüz galeri görseli eklenmemiş. Anasayfadaki \"Hakkımızda\" bölümünde bu görseller Instagram gönderileriniz gibi gösterilir.</p>";

  res.send(layout("Panel", `
    <div class="top-bar">
      <img class="panel-logo" src="/assets/logo-full.png" alt="Büku Art">
      <div>
        <a class="site-link" href="${escapeHtml(SITE_URL)}" target="_blank">Siteyi Görüntüle ↗</a>
        &nbsp;·&nbsp;
        <form method="POST" action="${BASE}/logout" style="display:inline;"><button type="submit" style="margin:0;padding:6px 16px;">Çıkış</button></form>
      </div>
    </div>
    ${saved}

    <div class="card">
      <h2>Site Ayarları</h2>
      <form method="POST" action="${BASE}/settings">
        <div class="row">
          <div><label>Marka Adı</label><input type="text" name="brandName" value="${escapeHtml(settings.brandName)}"></div>
          <div><label>WhatsApp Numarası</label><input type="text" name="whatsapp" value="${escapeHtml(settings.whatsapp)}" placeholder="905XXXXXXXXX"></div>
        </div>
        <label>Slogan</label>
        <input type="text" name="tagline" value="${escapeHtml(settings.tagline)}">
        <label>Hakkımızda Metni</label>
        <textarea name="about">${escapeHtml(settings.about)}</textarea>
        <div class="row">
          <div><label>Instagram Kullanıcı Adı</label><input type="text" name="instagram" value="${escapeHtml(settings.instagram)}"></div>
          <div><label>E-posta</label><input type="text" name="email" value="${escapeHtml(settings.email)}"></div>
        </div>
        <label>Konum</label>
        <input type="text" name="location" value="${escapeHtml(settings.location)}">
        <label>İletişim Bölümü Notu</label>
        <textarea name="footerNote">${escapeHtml(settings.footerNote)}</textarea>
        <button type="submit">Ayarları Kaydet</button>
      </form>
    </div>

    <div class="card">
      <h2>Etkinlikler</h2>
      ${eventsHtml}
    </div>

    <div class="card">
      <h2>Galeri (Anasayfa "Hakkımızda" Bölümü)</h2>
      <div class="gallery-grid-admin">${galleryHtml}</div>
      <form method="POST" action="${BASE}/gallery" enctype="multipart/form-data" style="margin-top:20px;">
        <label>Yeni Görsel</label>
        <input type="file" name="image" accept="image/*" required>
        <label>Açıklama (opsiyonel, alt metin olarak kullanılır)</label>
        <input type="text" name="caption">
        <button type="submit">Galeriye Ekle</button>
      </form>
    </div>

    <div class="card">
      <h2>Yeni Etkinlik Ekle</h2>
      <form method="POST" action="${BASE}/events">
        <div class="row">
          <div><label>Başlık</label><input type="text" name="title" required></div>
          <div><label>Tarih</label><input type="date" name="date" required></div>
        </div>
        <div class="row">
          <div><label>Saat</label><input type="text" name="time" placeholder="12:00 - 16:00"></div>
          <div><label>Konum</label><input type="text" name="location"></div>
        </div>
        <div class="row">
          <div><label>Kontenjan</label><input type="text" name="capacity"></div>
          <div><label>Ücret</label><input type="text" name="price"></div>
        </div>
        <label>Açıklama</label>
        <textarea name="description"></textarea>
        <label>Görsel (opsiyonel)</label>
        <input type="file" name="image" accept="image/*">
        <button type="submit">Etkinliği Ekle</button>
      </form>
    </div>
  `));
});

app.post(`${BASE}/settings`, requireAuth, (req, res) => {
  const current = readJson(SETTINGS_PATH);
  const updated = {
    ...current,
    brandName: req.body.brandName || "",
    tagline: req.body.tagline || "",
    about: req.body.about || "",
    whatsapp: req.body.whatsapp || "",
    instagram: req.body.instagram || "",
    email: req.body.email || "",
    location: req.body.location || "",
    footerNote: req.body.footerNote || "",
  };
  writeJson(SETTINGS_PATH, updated);
  res.redirect(`${BASE}?saved=1`);
});

app.post(`${BASE}/events`, requireAuth, upload.single("image"), (req, res) => {
  const eventsData = readJson(EVENTS_PATH);
  const image = req.file ? `/images/uploads/${req.file.filename}` : "/assets/placeholder-event.svg";
  eventsData.events = eventsData.events || [];
  eventsData.events.push({
    title: req.body.title || "",
    date: req.body.date || "",
    time: req.body.time || "",
    location: req.body.location || "",
    capacity: req.body.capacity || "",
    price: req.body.price || "",
    description: req.body.description || "",
    image,
    active: true,
    whatsappMessage: "",
  });
  writeJson(EVENTS_PATH, eventsData);
  res.redirect(`${BASE}?saved=1`);
});

app.post(`${BASE}/events/:index`, requireAuth, (req, res) => {
  const idx = Number(req.params.index);
  const eventsData = readJson(EVENTS_PATH);
  if (!eventsData.events || !eventsData.events[idx]) return res.redirect(BASE);
  eventsData.events[idx] = {
    ...eventsData.events[idx],
    title: req.body.title || "",
    date: req.body.date || "",
    time: req.body.time || "",
    location: req.body.location || "",
    capacity: req.body.capacity || "",
    price: req.body.price || "",
    description: req.body.description || "",
    whatsappMessage: req.body.whatsappMessage || "",
    active: req.body.active === "on",
  };
  writeJson(EVENTS_PATH, eventsData);
  res.redirect(`${BASE}?saved=1`);
});

app.post(`${BASE}/events/:index/image`, requireAuth, upload.single("image"), (req, res) => {
  const idx = Number(req.params.index);
  const eventsData = readJson(EVENTS_PATH);
  if (!eventsData.events || !eventsData.events[idx]) return res.redirect(BASE);
  if (req.file) {
    eventsData.events[idx].image = `/images/uploads/${req.file.filename}`;
    writeJson(EVENTS_PATH, eventsData);
  }
  res.redirect(`${BASE}?saved=1`);
});

app.post(`${BASE}/events/:index/delete`, requireAuth, (req, res) => {
  const idx = Number(req.params.index);
  const eventsData = readJson(EVENTS_PATH);
  if (eventsData.events && eventsData.events[idx]) {
    eventsData.events.splice(idx, 1);
    writeJson(EVENTS_PATH, eventsData);
  }
  res.redirect(`${BASE}?saved=1`);
});

app.post(`${BASE}/gallery`, requireAuth, upload.single("image"), (req, res) => {
  if (!req.file) return res.redirect(BASE);
  const galleryData = readJson(GALLERY_PATH);
  galleryData.images = galleryData.images || [];
  galleryData.images.push({
    image: `/images/uploads/${req.file.filename}`,
    caption: req.body.caption || "",
  });
  writeJson(GALLERY_PATH, galleryData);
  res.redirect(`${BASE}?saved=1`);
});

app.post(`${BASE}/gallery/:index/delete`, requireAuth, (req, res) => {
  const idx = Number(req.params.index);
  const galleryData = readJson(GALLERY_PATH);
  if (galleryData.images && galleryData.images[idx]) {
    galleryData.images.splice(idx, 1);
    writeJson(GALLERY_PATH, galleryData);
  }
  res.redirect(`${BASE}?saved=1`);
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(400).send(layout("Hata", `<div class="flash" style="background:#2c1c1c;border-color:#6b3a3a;color:#e6bfbf;">${escapeHtml(err.message)}</div><a class="btn" href="${BASE}">Geri Dön</a>`));
});

app.listen(PORT, "127.0.0.1", () => {
  console.log(`Admin panel 127.0.0.1:${PORT} adresinde (nginx üzerinden ${BASE}) çalışıyor.`);
});
