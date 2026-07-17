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

function streamCertificate({ name, eventTitle, eventDate, brandName }, writableStream) {
  const templatePath = findTemplate();

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
      .font("Serif")
      .fontSize(Math.round(height * 0.042))
      .fillColor("#8a6520")
      .text("KATILIM SERTİFİKASI", 0, height * 0.16, { align: "center", width, characterSpacing: 1 });

    doc
      .font("Serif-Bold")
      .fontSize(Math.round(height * 0.07))
      .fillColor("#1f3a5f")
      .text(name || "", 0, height * 0.29, { align: "center", width });

    const eventLine = eventTitle
      ? `"${eventTitle}" atölyesine${eventDate ? ` ${formatDateLong(eventDate)} tarihinde` : ""} katılarak emek ve özenle tamamladığı çalışmaları onurlandırmak amacıyla düzenlenmiştir.`
      : "atölyeye katılarak emek ve özenle tamamladığı çalışmaları onurlandırmak amacıyla düzenlenmiştir.";

    doc
      .font("Serif")
      .fontSize(Math.round(height * 0.03))
      .fillColor("#2c2a24")
      .text(eventLine, width * 0.16, height * 0.44, { align: "center", width: width * 0.68 });

    doc
      .font("Serif")
      .fontSize(Math.round(height * 0.022))
      .fillColor("#8a6520")
      .text(`Düzenlenme Tarihi: ${formatDateLong(new Date().toISOString().slice(0, 10))}`, width * 0.55, height * 0.9, { align: "right", width: width * 0.37 });

    doc.end();
  });
}

module.exports = { streamCertificate, findTemplate };
