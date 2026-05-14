/**
 * generateGapPdf.js
 * Generates a NIS2 Gap Analysis PDF that mirrors the web report:
 * - Score summary
 * - Domain coverage with risk levels
 * - Prioritized gap recommendations (KRITISK / FÖRBÄTTRA)
 */

const PDFDocument = require('pdfkit');
const { DOMAINS } = require('./nis2Domains');

function riskLabel(pct) {
  if (pct >= 75) return 'God täckning';
  if (pct >= 50) return 'Medel';
  if (pct >= 25) return 'Hög risk';
  return 'Kritisk';
}

function riskHex(pct) {
  if (pct >= 75) return '#2a8a2a';
  if (pct >= 50) return '#cc7700';
  return '#cc0000';
}

function wrapText(text) {
  return text.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ');
}

/**
 * @param {object} opts
 * @param {string} opts.company
 * @param {string} opts.name
 * @param {number} opts.score        0–50
 * @param {number} opts.scorePct     0–100
 * @param {string} opts.riskLevel    'red'|'amber'|'green'
 * @param {number} opts.criticalGaps
 * @param {number} opts.partialGaps
 * @param {object} opts.domains      { "Styrning & Ledning": 60, ... }
 * @param {object} opts.answers      { "d0_q0": 2, ... }
 * @returns {Promise<Buffer>}
 */
function generateGapPdf(opts) {
  return new Promise((resolve, reject) => {
    const { company, name, score, scorePct, riskLevel, criticalGaps, partialGaps, domains, answers } = opts;
    const chunks = [];

    const doc = new PDFDocument({ margin: 50, size: 'A4', bufferPages: true });
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end',  () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const W     = doc.page.width - 100;
    const LEFT  = 50;
    const rColor = riskLevel === 'red' ? '#cc0000' : riskLevel === 'amber' ? '#cc7700' : '#2a8a2a';
    const rLabelText = riskLevel === 'red' ? 'HOG RISK' : riskLevel === 'amber' ? 'MEDELHOG RISK' : 'GOD TACKNING';
    const totalGaps  = criticalGaps + partialGaps;
    const onPlaceCount = 25 - totalGaps;

    // ── Header bar ───────────────────────────────────────────────────────
    doc.rect(LEFT, 45, W, 52).fill(rColor);
    doc.fontSize(28).font('Helvetica-Bold').fillColor('#fff')
       .text(`${scorePct}%`, LEFT + 12, 52, { continued: true });
    doc.fontSize(11).font('Helvetica').fillColor('rgba(255,255,255,0.85)')
       .text(`  NIS2-tackning  *  ${criticalGaps} kritiska gap  *  ${partialGaps} forbattringsomraden  *  ${onPlaceCount} kontroller pa plats`, { baseline: 'middle' });
    doc.fontSize(14).font('Helvetica-Bold').fillColor('#fff')
       .text(rLabelText, LEFT + 12, 74);

    doc.fillColor('#000');
    doc.moveDown(0.5);

    // ── Subtitle ──────────────────────────────────────────────────────────
    doc.fontSize(9).font('Helvetica').fillColor('#555')
       .text(`${company}  *  ${name}  *  ${new Date().toLocaleDateString('sv-SE')}`, LEFT, doc.y + 6);
    doc.moveDown(1.2);

    // ── Domain coverage ───────────────────────────────────────────────────
    doc.fontSize(12).font('Helvetica-Bold').fillColor('#111').text('Tackning per NIS2-doman', LEFT);
    doc.moveDown(0.4);

    DOMAINS.forEach(d => {
      const pct      = domains?.[d.name] ?? 0;
      const barColor = riskHex(pct);
      const barW     = Math.round(W * pct / 100);
      const label    = riskLabel(pct);

      if (doc.y > doc.page.height - 80) doc.addPage();

      doc.fontSize(10).font('Helvetica').fillColor('#222')
         .text(d.name, LEFT, doc.y, { continued: true });
      doc.font('Helvetica-Bold').fillColor(barColor)
         .text(`  ${pct}% -- ${label}`, { continued: false });

      const barY = doc.y + 2;
      doc.rect(LEFT, barY, W, 6).fillColor('#eee').fill();
      doc.rect(LEFT, barY, barW, 6).fillColor(barColor).fill();
      doc.fillColor('#000');
      doc.moveDown(0.85);
    });

    // ── Gap recommendations ───────────────────────────────────────────────
    if (totalGaps > 0) {
      doc.addPage();
      doc.fontSize(13).font('Helvetica-Bold').fillColor('#111')
         .text(`Era ${totalGaps} NIS2-gap att atgarda`, LEFT);
      doc.fontSize(9).font('Helvetica').fillColor('#666')
         .text('Prioriterade efter allvarlighetsgrad -- KRITISK (Nej) fore FORBATTRA (Delvis).', LEFT);
      doc.moveDown(0.8);

      // Collect gaps: 0=KRITISK, 1=FÖRBÄTTRA
      const kritiska = [];
      const forbattra = [];
      DOMAINS.forEach((d, di) => {
        d.recs.forEach((rec, qi) => {
          const val = answers?.[`d${di}_q${qi}`];
          if (val === 0)      kritiska.push({ ...rec, domain: d.name });
          else if (val === 1) forbattra.push({ ...rec, domain: d.name });
        });
      });

      const allGaps = [
        ...kritiska.map(g => ({ ...g, severity: 'KRITISK', color: '#cc0000' })),
        ...forbattra.map(g => ({ ...g, severity: 'FORBATTRA', color: '#cc7700' })),
      ];

      allGaps.forEach(gap => {
        if (doc.y > doc.page.height - 130) doc.addPage();

        const boxY = doc.y;

        // Severity badge
        doc.fontSize(8).font('Helvetica-Bold').fillColor('#fff')
           .rect(LEFT, boxY, 70, 14).fill(gap.color);
        doc.fillColor('#fff').text(gap.severity, LEFT + 3, boxY + 3);

        // Title
        doc.fontSize(11).font('Helvetica-Bold').fillColor('#111')
           .text(gap.title, LEFT + 76, boxY + 1, { width: W - 76 });
        doc.moveDown(0.3);

        // Why
        doc.fontSize(9).font('Helvetica').fillColor('#555')
           .text(wrapText(gap.why), LEFT, doc.y, { width: W });
        doc.moveDown(0.25);

        // Action
        doc.fontSize(9).font('Helvetica-Bold').fillColor('#333')
           .text('Atgard: ', LEFT, doc.y, { continued: true });
        doc.font('Helvetica').fillColor('#444')
           .text(wrapText(gap.action), { width: W - 45, continued: false });
        doc.moveDown(0.9);

        // Separator line
        doc.moveTo(LEFT, doc.y).lineTo(LEFT + W, doc.y).strokeColor('#ddd').lineWidth(0.5).stroke();
        doc.moveDown(0.5);
      });
    }

    // ── Footer on all pages ────────────────────────────────────────────────
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      doc.fontSize(8).font('Helvetica').fillColor('#bbb')
         .text(`NIS2Klar * nis2klar.se * Sida ${i + 1} av ${range.count}`,
               LEFT, doc.page.height - 38, { align: 'center', width: W });
    }

    doc.end();
  });
}

module.exports = { generateGapPdf };
