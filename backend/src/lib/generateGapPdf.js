/**
 * generateGapPdf.js
 * Generates a NIS2 Gap Analysis PDF report from submission data.
 * Returns a Buffer.
 */

const PDFDocument = require('pdfkit');

const DOMAIN_NAMES = [
  'Styrning & Ledning',
  'Riskhantering',
  'Incidentrespons',
  'Leverantörskedja',
  'Tekniska kontroller',
];

const QUESTIONS = [
  [
    'Har er organisation en utsedd NIS2-ansvarig (CISO eller motsvarande)?',
    'Har ledningen formellt beslutat om och godkänt en informationssäkerhetspolicy?',
    'Ingår cybersäkerhet och NIS2-efterlevnad regelbundet på styrelsens agenda?',
    'Har ni dokumenterade roller och ansvarsfördelning för informationssäkerhet?',
    'Genomför ni regelbundna säkerhetsutbildningar för all personal?',
  ],
  [
    'Har ni ett uppdaterat riskregister för IT och cybersäkerhet?',
    'Genomför ni formella riskbedömningar minst en gång per år?',
    'Är era kritiska IT-system och informationstillgångar inventerade och klassificerade?',
    'Har ni implementerat MFA (multifaktorautentisering) för alla användare?',
    'Hanterar ni sårbarheter systematiskt — t.ex. patchning inom 30 dagar för kritiska brister?',
  ],
  [
    'Har ni en dokumenterad och testad incidentresponsplan?',
    'Kan ni identifiera och klassificera en säkerhetsincident inom 4 timmar?',
    'Kan ni rapportera en incident till MSB inom 24 timmar (NIS2:s initialkrav)?',
    'Har ni kontinuerlig loggning och övervakning av era kritiska system?',
    'Har ni en kommunikationsplan för hur ni hanterar incidenter externt?',
  ],
  [
    'Har ni en komplett förteckning över era kritiska IT-leverantörer?',
    'Ställer ni dokumenterade säkerhetskrav på era leverantörer?',
    'Granskar ni leverantörers säkerhetsnivå vid upphandling och regelbundet därefter?',
    'Ingår cybersäkerhets- och incidentrapporteringskrav i era leverantörsavtal?',
    'Kontrollerar ni tredjepartsåtkomst till era system systematiskt?',
  ],
  [
    'Är era nätverk segmenterade — t.ex. separation av OT/IT, gästnät och produktionsmiljöer?',
    'Har ni endpoint-skydd (EDR/antivirus) installerat och aktivt på alla enheter?',
    'Använder ni krypterad kommunikation och lagring för all känslig data?',
    'Har ni testade backup- och återställningsprocedurer (3-2-1-regeln)?',
    'Har ni ett identitets- och åtkomsthanteringssystem (IAM/PAM) med principen om minsta privilegium?',
  ],
];

const ANSWER_LABELS = { 2: 'Ja', 1: 'Delvis', 0: 'Nej' };
const RISK_LABELS   = { red: 'HÖG RISK', amber: 'MEDELHÖG RISK', green: 'GOD TÄCKNING' };

/**
 * @param {object} opts
 * @param {string} opts.company
 * @param {string} opts.name
 * @param {number} opts.score       0-50
 * @param {number} opts.scorePct    0-100
 * @param {string} opts.riskLevel   'red'|'amber'|'green'
 * @param {number} opts.criticalGaps
 * @param {number} opts.partialGaps
 * @param {object} opts.domains     { "Styrning & Ledning": 60, ... }
 * @param {object} opts.answers     { "d0_q0": 2, ... }
 * @returns {Promise<Buffer>}
 */
function generateGapPdf(opts) {
  return new Promise((resolve, reject) => {
    const { company, name, score, scorePct, riskLevel, criticalGaps, partialGaps, domains, answers } = opts;
    const chunks = [];

    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end',  () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const W = doc.page.width - 100; // usable width

    // ── Header ──────────────────────────────────────────────────────────
    doc.fontSize(20).font('Helvetica-Bold').text('NIS2 Gap-Analys', 50, 50);
    doc.fontSize(11).font('Helvetica').fillColor('#555')
       .text(`${company}  ·  ${name}  ·  ${new Date().toLocaleDateString('sv-SE')}`, 50, 78);

    // ── Score block ──────────────────────────────────────────────────────
    doc.moveDown(1.5);
    const riskLabel = RISK_LABELS[riskLevel] || riskLevel.toUpperCase();
    const riskColor = riskLevel === 'red' ? '#cc3333' : riskLevel === 'amber' ? '#cc7700' : '#2a8a2a';

    doc.fontSize(32).font('Helvetica-Bold').fillColor(riskColor)
       .text(`${scorePct}%`, { continued: false });
    doc.moveUp(1);
    doc.fontSize(13).font('Helvetica-Bold').fillColor(riskColor)
       .text(riskLabel, 110, doc.y - 20);
    doc.fontSize(11).font('Helvetica').fillColor('#333')
       .text(`${score}/50 poäng  ·  ${criticalGaps} kritiska gap  ·  ${partialGaps} delvisa gap`, 110, doc.y);

    doc.fillColor('#000');
    doc.moveDown(1.5);

    // ── Domain scores ────────────────────────────────────────────────────
    doc.fontSize(13).font('Helvetica-Bold').text('Resultat per område');
    doc.moveDown(0.4);

    DOMAIN_NAMES.forEach(domainName => {
      const pct = domains?.[domainName] ?? 0;
      const barColor = pct >= 75 ? '#2a8a2a' : pct >= 40 ? '#cc7700' : '#cc3333';
      const barW = Math.round(W * pct / 100);

      doc.fontSize(10).font('Helvetica').fillColor('#333').text(`${domainName}`, { continued: true });
      doc.fillColor('#888').text(`  ${pct}%`, { continued: false });

      const y = doc.y + 2;
      doc.rect(50, y, W, 8).fillColor('#eee').fill();
      doc.rect(50, y, barW, 8).fillColor(barColor).fill();
      doc.fillColor('#000');
      doc.moveDown(0.9);
    });

    // ── Answers per domain ────────────────────────────────────────────────
    doc.moveDown(0.5);
    doc.addPage();

    doc.fontSize(15).font('Helvetica-Bold').text('Detaljerade svar');
    doc.moveDown(0.6);

    DOMAIN_NAMES.forEach((domainName, di) => {
      // Domain header
      doc.fontSize(12).font('Helvetica-Bold').fillColor('#1a1a1a').text(domainName);
      doc.moveDown(0.3);

      QUESTIONS[di].forEach((q, qi) => {
        const val = answers?.[`d${di}_q${qi}`];
        const label = ANSWER_LABELS[val] ?? '—';
        const color = val === 2 ? '#2a8a2a' : val === 1 ? '#cc7700' : val === 0 ? '#cc3333' : '#888';

        // Check if we need a new page
        if (doc.y > doc.page.height - 100) doc.addPage();

        doc.fontSize(9).font('Helvetica').fillColor('#444')
           .text(`${qi + 1}. ${q}`, 50, doc.y, { width: W - 60, continued: false });
        doc.moveUp(1);
        doc.fontSize(9).font('Helvetica-Bold').fillColor(color)
           .text(label, 50 + W - 55, doc.y, { width: 55, align: 'right' });
        doc.fillColor('#000');
        doc.moveDown(0.5);
      });

      doc.moveDown(0.5);
    });

    // ── Footer ────────────────────────────────────────────────────────────
    const pages = doc.bufferedPageRange();
    for (let i = 0; i < pages.count; i++) {
      doc.switchToPage(pages.start + i);
      doc.fontSize(8).font('Helvetica').fillColor('#aaa')
         .text('NIS2Klar · nis2klar.se · M&J Trusted Marketing KB',
               50, doc.page.height - 40, { align: 'center', width: W });
    }

    doc.end();
  });
}

module.exports = { generateGapPdf };
