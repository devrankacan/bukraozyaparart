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

    document.querySelectorAll("#brand-name, #footer-brand, #footer-brand-name").forEach((el) => {
      el.textContent = settings.brandName || "BÜKÜ ART";
    });

    document.querySelectorAll("#hero-tagline, #footer-tagline-text").forEach((el) => {
      el.textContent = settings.tagline || "";
    });

    document.querySelectorAll("#hero-about, #about-text").forEach((el) => {
      el.textContent = settings.about || "";
    });

    const footerNote = $("#footer-note");
    if (footerNote) footerNote.textContent = settings.footerNote || "";

    const igHandle = settings.instagram || "";
    const igUrl = igHandle ? `https://instagram.com/${igHandle.replace(/^@/, "")}` : "#";
    document.querySelectorAll("#instagram-link, #contact-instagram, #gallery-instagram-link, #footer-instagram").forEach((el) => {
      el.href = igUrl;
    });
    const igHandleLabel = $("#gallery-instagram-handle");
    if (igHandleLabel && igHandle) igHandleLabel.textContent = igHandle.replace(/^@/, "");

    const defaultMessage = `Merhaba, ${settings.brandName || "atölyeniz"} hakkında bilgi almak istiyorum.`;
    const generalWaLink = waLink(settings.whatsapp, defaultMessage);
    document.querySelectorAll("#header-whatsapp, #hero-whatsapp, #contact-whatsapp, #floating-whatsapp, #footer-whatsapp").forEach((el) => {
      el.href = generalWaLink;
    });

    document.querySelectorAll("#contact-location, #footer-location").forEach((el) => {
      el.textContent = settings.location || "";
    });

    document.querySelectorAll("#contact-email, #footer-email").forEach((el) => {
      el.textContent = settings.email || "";
    });

    const heroBtn = document.querySelector(".hero-actions .btn-gold");
    if (heroBtn && settings.heroButtonText) heroBtn.textContent = settings.heroButtonText;

    document.querySelectorAll("#header-whatsapp, #hero-whatsapp, #contact-whatsapp").forEach((el) => {
      const label = el.querySelector(".btn-label");
      if (label && settings.whatsappButtonText) label.textContent = settings.whatsappButtonText;
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
            <a class="btn btn-whatsapp" href="${link}" target="_blank" rel="noopener">
              <svg class="whatsapp-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12.004 2c-5.514 0-9.997 4.478-9.997 9.997 0 1.763.463 3.483 1.343 4.997L2 22l5.146-1.35a9.96 9.96 0 0 0 4.858 1.237h.004c5.514 0 9.996-4.479 9.996-9.998C21.996 6.478 17.518 2 12.004 2Zm0 18.15h-.003a8.13 8.13 0 0 1-4.15-1.135l-.298-.177-3.06.803.817-2.982-.194-.306a8.12 8.12 0 0 1-1.246-4.356c0-4.49 3.653-8.144 8.14-8.144 2.175 0 4.219.848 5.756 2.388a8.086 8.086 0 0 1 2.383 5.76c0 4.49-3.653 8.15-8.145 8.15Z"/></svg>
              <span class="btn-label">Rezervasyon Oluştur</span>
            </a>
          </div>
        </article>
      `;
    }).join("");
  }

  function renderGallery(galleryData, settings) {
    const grid = $("#about-gallery");
    if (!grid) return;

    const images = galleryData.images || [];
    const igHandle = (settings.instagram || "").replace(/^@/, "");
    const igUrl = igHandle ? `https://instagram.com/${igHandle}` : "#";

    if (images.length === 0) {
      grid.innerHTML = `
        <div class="about-gallery-empty">
          <p>Instagram gönderilerimiz yakında burada.</p>
          <a href="${igUrl}" class="btn btn-outline" target="_blank" rel="noopener">Instagram'ı Ziyaret Et</a>
        </div>
      `;
      return;
    }

    grid.innerHTML = images.slice(0, 9).map((img) => `
      <a href="${igUrl}" target="_blank" rel="noopener">
        <img src="${escapeHtml(img.image)}" alt="${escapeHtml(img.caption || "")}" loading="lazy">
      </a>
    `).join("");
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
      const [settings, eventsData, galleryData] = await Promise.all([
        loadJson("/content/settings.json"),
        loadJson("/content/events.json"),
        loadJson("/content/gallery.json"),
      ]);
      applySettings(settings);
      renderEvents(eventsData, settings);
      renderGallery(galleryData, settings);
    } catch (err) {
      console.error("İçerik yüklenirken hata oluştu:", err);
      const grid = $("#events-grid");
      if (grid) grid.innerHTML = `<div class="empty-state">Etkinlikler yüklenemedi. Lütfen sayfayı yenileyin.</div>`;
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
