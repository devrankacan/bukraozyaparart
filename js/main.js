(function () {
  "use strict";

  const $ = (sel) => document.querySelector(sel);

  function waLink(phone, message) {
    const digits = String(phone || "").replace(/[^0-9]/g, "");
    const text = encodeURIComponent(message || "");
    return `https://wa.me/${digits}${text ? `?text=${text}` : ""}`;
  }

  function formatDate(iso) {
    if (!iso) return "";
    const d = new Date(iso + "T00:00:00");
    if (isNaN(d)) return iso;
    return d.toLocaleDateString("tr-TR", { day: "2-digit", month: "long", year: "numeric" });
  }

  function shortDate(iso) {
    if (!iso) return "";
    const d = new Date(iso + "T00:00:00");
    if (isNaN(d)) return iso;
    return d.toLocaleDateString("tr-TR", { day: "2-digit", month: "short" });
  }

  function escapeHtml(str) {
    return String(str || "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  async function loadJson(path) {
    const res = await fetch(path, { cache: "no-store" });
    if (!res.ok) throw new Error(`${path} yüklenemedi (${res.status})`);
    return res.json();
  }

  function applySettings(settings) {
    document.title = `${settings.brandName || "BÜKÜ ART"} | Çini & Tezhip Workshop`;

    document.querySelectorAll("#brand-name, #footer-brand").forEach((el) => {
      el.textContent = settings.brandName || "BÜKÜ ART";
    });

    const tagline = $("#hero-tagline");
    if (tagline) tagline.textContent = settings.tagline || "";

    document.querySelectorAll("#hero-about, #about-text").forEach((el) => {
      el.textContent = settings.about || "";
    });

    const footerNote = $("#footer-note");
    if (footerNote) footerNote.textContent = settings.footerNote || "";

    const igHandle = settings.instagram || "";
    const igUrl = igHandle ? `https://instagram.com/${igHandle.replace(/^@/, "")}` : "#";
    document.querySelectorAll("#instagram-link, #contact-instagram, #gallery-instagram-link").forEach((el) => {
      el.href = igUrl;
    });
    const igHandleLabel = $("#gallery-instagram-handle");
    if (igHandleLabel && igHandle) igHandleLabel.textContent = igHandle.replace(/^@/, "");

    const defaultMessage = `Merhaba, ${settings.brandName || "atölyeniz"} hakkında bilgi almak istiyorum.`;
    const generalWaLink = waLink(settings.whatsapp, defaultMessage);
    document.querySelectorAll("#header-whatsapp, #hero-whatsapp, #contact-whatsapp, #floating-whatsapp").forEach((el) => {
      el.href = generalWaLink;
    });

    const loc = $("#contact-location");
    if (loc) loc.textContent = settings.location || "";

    const email = $("#contact-email");
    if (email) email.textContent = settings.email || "";

    const heroBtn = document.querySelector(".hero-actions .btn-gold");
    if (heroBtn && settings.heroButtonText) heroBtn.textContent = settings.heroButtonText;

    document.querySelectorAll("#header-whatsapp, #hero-whatsapp, #contact-whatsapp").forEach((el) => {
      if (settings.whatsappButtonText) el.textContent = settings.whatsappButtonText;
    });

    return settings;
  }

  function renderEvents(eventsData, settings) {
    const grid = $("#events-grid");
    if (!grid) return;

    const events = (eventsData.events || [])
      .filter((e) => e.active !== false)
      .sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));

    if (events.length === 0) {
      grid.innerHTML = `<div class="empty-state">Şu anda planlanmış bir workshop bulunmuyor. Yeni tarihler için WhatsApp'tan bize ulaşabilirsiniz.</div>`;
      return;
    }

    grid.innerHTML = events.map((ev) => {
      const message = ev.whatsappMessage
        || `Merhaba, "${ev.title}" (${formatDate(ev.date)}) etkinliği için rezervasyon yaptırmak istiyorum.`;
      const link = waLink(settings.whatsapp, message);
      const image = ev.image || "/assets/placeholder-event.svg";

      return `
        <article class="event-card">
          <div class="event-image">
            <img src="${escapeHtml(image)}" alt="${escapeHtml(ev.title)}" loading="lazy">
            <span class="event-date-badge">${escapeHtml(shortDate(ev.date))}</span>
          </div>
          <div class="event-body">
            <h3>${escapeHtml(ev.title)}</h3>
            <div class="event-meta">
              ${ev.time ? `<span>${escapeHtml(ev.time)}</span>` : ""}
              ${ev.location ? `<span>${escapeHtml(ev.location)}</span>` : ""}
              ${ev.capacity ? `<span>${escapeHtml(ev.capacity)}</span>` : ""}
            </div>
            <p class="desc">${escapeHtml(ev.description || "")}</p>
            <a class="btn btn-whatsapp" href="${link}" target="_blank" rel="noopener">WhatsApp ile Rezervasyon Yap</a>
          </div>
        </article>
      `;
    }).join("");
  }

  function setupNav() {
    const toggle = $("#menu-toggle");
    const nav = $("#nav-links");
    if (!toggle || !nav) return;
    toggle.addEventListener("click", () => nav.classList.toggle("open"));
    nav.querySelectorAll("a").forEach((a) => a.addEventListener("click", () => nav.classList.remove("open")));
  }

  async function init() {
    setupNav();
    $("#year").textContent = new Date().getFullYear();

    try {
      const [settings, eventsData] = await Promise.all([
        loadJson("/content/settings.json"),
        loadJson("/content/events.json"),
      ]);
      applySettings(settings);
      renderEvents(eventsData, settings);
    } catch (err) {
      console.error("İçerik yüklenirken hata oluştu:", err);
      const grid = $("#events-grid");
      if (grid) grid.innerHTML = `<div class="empty-state">Etkinlikler yüklenemedi. Lütfen sayfayı yenileyin.</div>`;
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
