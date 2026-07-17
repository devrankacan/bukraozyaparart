"use strict";

const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");

const ASSETS_DIR = path.join(__dirname, "..", "assets");
const FONTS_DIR = path.join(__dirname, "fonts");
const FONT_REGULAR = path.join(FONTS_DIR, "LiberationSerif-Regular.ttf");
const FONT_BOLD = path.join(FONTS_DIR, "LiberationSerif-Bold.ttf");
const TEMPLATE_CANDIDATES = ["certificate-template.png", "certificate-template.jpg", "certificate-template.jpeg"];

function findTemplate() {
  for (const name of TEMPLATE_CANDIDATES) {
    const p = path.join(ASSETS_DIR, name);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function formatDateLong(iso) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d)) return iso;
  return d.toLocaleDateString("tr-TR", { day: "2-digit", month: "long", year: "numeric" });
}

// Şablon görseli olmadığında da makul görünen, sade bir çerçeve çizer;
// gerçek şablon assets/certificate-template.(png|jpg) olarak eklenince
// otomatik olarak onu kullanmaya geçer.
function drawFallbackFrame(doc, width, height) {
  doc.rect(0, 0, width, height).fill("#faf6ec");
  doc.rect(24, 24, width - 48, height - 48).lineWidth(2).stroke("#b8892f");
  doc.rect(34, 34, width - 68, height - 68).lineWidth(0.75).stroke("#1f3a5f");
}

function streamCertificate({ name, eventTitle, eventDate, eventTime, brandName, certificateNo }, writableStream) {
  const templatePath = findTemplate();
  const brand = brandName || "BÜKÜ ART";

  let width = 841.89;
  let height = 595.28;

  if (templatePath) {
    const probe = new PDFDocument({ autoFirstPage: false });
    const img = probe.openImage(templatePath);
    const maxDim = 1100;
    const scale = Math.min(maxDim / img.width, maxDim / img.height);
    width = img.width * scale;
    height = img.height * scale;
  }

  const doc = new PDFDocument({ size: [width, height], margin: 0 });
  doc.registerFont("Serif", FONT_REGULAR);
  doc.registerFont("Serif-Bold", FONT_BOLD);
  doc.pipe(writableStream);

  return new Promise((resolve, reject) => {
    writableStream.on("finish", resolve);
    writableStream.on("error", reject);
    doc.on("error", reject);

    if (templatePath) {
      doc.image(templatePath, 0, 0, { width, height });
    } else {
      drawFallbackFrame(doc, width, height);
    }

    doc
      .font("Serif-Bold")
      .fontSize(Math.round(height * 0.085))
      .fillColor("#8a6520")
      .text("KATILIM SERTİFİKASI", 0, height * 0.095, { align: "center", width, characterSpacing: 1.5 });

    const ruleY = height * 0.205;
    doc.moveTo(width * 0.42, ruleY).lineTo(width * 0.58, ruleY).lineWidth(1).stroke("#b8892f");

    doc
      .font("Serif")
      .fontSize(Math.round(height * 0.024))
      .fillColor("#6f6a5c")
      .text("Bu sertifika, aşağıda bilgileri yer alan katılımcıya takdim edilmiştir:", 0, height * 0.235, { align: "center", width });

    doc
      .font("Serif-Bold")
      .fontSize(Math.round(height * 0.065))
      .fillColor("#1f3a5f")
      .text(name || "", 0, height * 0.3, { align: "center", width });

    const underlineY = height * 0.375;
    doc.moveTo(width * 0.4, underlineY).lineTo(width * 0.6, underlineY).lineWidth(0.75).stroke("#b8892f");

    const timePart = eventTime ? `, ${eventTime} saatleri arasında` : "";
    const eventLine = eventTitle
      ? `Katılımcı, "${eventTitle}" başlıklı atölye çalışmasına${eventDate ? ` ${formatDateLong(eventDate)} tarihinde` : ""}${timePart} katılmış; çalışma süresince gösterdiği emek, özen ve sanatsal duyarlılıkla belirlenen tüm uygulamaları başarıyla tamamlamıştır. İşbu sertifika, söz konusu katılımı ve gösterilen başarıyı belgelemek amacıyla ${brand} tarafından düzenlenmiştir.`
      : `Katılımcı, atölye çalışmasına katılmış; çalışma süresince gösterdiği emek, özen ve sanatsal duyarlılıkla belirlenen tüm uygulamaları başarıyla tamamlamıştır. İşbu sertifika, söz konusu katılımı ve gösterilen başarıyı belgelemek amacıyla ${brand} tarafından düzenlenmiştir.`;

    doc
      .font("Serif")
      .fontSize(Math.round(height * 0.028))
      .fillColor("#2c2a24")
      .text(eventLine, width * 0.14, height * 0.42, { align: "center", width: width * 0.72, lineGap: height * 0.006 });

    doc
      .font("Serif")
      .fontSize(Math.round(height * 0.02))
      .fillColor("#8a6520")
      .text("Başarılarının devamını dileriz.", 0, height * 0.68, { align: "center", width });

    doc
      .font("Serif")
      .fontSize(Math.round(height * 0.019))
      .fillColor("#6f6a5c")
      .text(`Sertifika No: ${certificateNo || "—"}`, width * 0.08, height * 0.885, { align: "left", width: width * 0.28 });

    doc
      .font("Serif")
      .fontSize(Math.round(height * 0.019))
      .fillColor("#6f6a5c")
      .text(`Düzenlenme Tarihi: ${formatDateLong(new Date().toISOString().slice(0, 10))}`, width * 0.66, height * 0.885, { align: "right", width: width * 0.26 });

    doc.end();
  });
}

module.exports = { streamCertificate, findTemplate };
