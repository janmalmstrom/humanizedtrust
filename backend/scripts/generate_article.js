'use strict';
/**
 * NIS2Klar Article Generator
 *
 * Generates Swedish NIS2 articles in StoryBrand style with personal liability framing.
 * Saves to frontend/public/artiklar/ and rebuilds frontend.
 *
 * Usage:
 *   node scripts/generate_article.js           # generates next unpublished article
 *   node scripts/generate_article.js --all     # generates all 10 (for initial batch)
 *   node scripts/generate_article.js --list    # shows topic queue status
 */

require('dotenv').config({ path: __dirname + '/../.env' });
const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const ARTICLES_DIR = path.join(__dirname, '../../frontend/public/artiklar');
const FRONTEND_DIR = path.join(__dirname, '../../frontend');

// Topic queue — slug, title, angle
const TOPICS = [
  {
    slug: 'nis2-vad-ar-nis2-direktivet',
    title: 'Vad är NIS2-direktivet? En guide för svenska företag',
    angle: 'Intro-artikel som förklarar NIS2 för en icke-teknisk VD eller styrelseledamot. Fokus: varför NIS2 finns, vad det kräver på hög nivå, och vad som händer om man ignorerar det. StoryBrand: läsaren är hjälten som riskerar att vara oförberedd.'
  },
  {
    slug: 'nis2-personligt-ansvar-styrelse',
    title: 'NIS2 och styrelsens personliga ansvar — det ingen vill prata om',
    angle: 'Djupdykning i det personliga ansvaret för VD och styrelseledamöter. Konkreta scenarier: hur ser ett tillsynsärende ut, kan man bli av med sitt uppdrag, vad är skillnaden mot GDPR-ansvar. Skrämmande men sakligt.'
  },
  {
    slug: 'nis2-vilka-foretag-omfattas',
    title: 'Vilka företag måste följa NIS2? Kolla om ditt faller inom lagen',
    angle: 'Praktisk guide: Essential vs Important entities, tröskelvärdena (250+ anställda ELLER 550M+ SEK, och 50-249 anställda OCH 110M+ SEK), sektorer. Inkludera ett enkelt test i form av frågor läsaren kan svara ja/nej på.'
  },
  {
    slug: 'nis2-incidentrapportering-24-timmar',
    title: '24 timmar på sig: Så rapporterar du en NIS2-incident rätt',
    angle: 'Berättelseformat: ett fiktivt företag drabbas av ransomware kl 03:00. Vad måste göras inom 24h, 72h, 30 dagar? Vad händer om man missar? Praktisk tidslinje med checkboxar.'
  },
  {
    slug: 'nis2-tekniska-sakerhetsatgarder',
    title: 'NIS2-kraven på teknisk säkerhet — vad lagen faktiskt kräver',
    angle: 'Bryt ner Article 21 i NIS2 till svenska: lösenordshantering, MFA, patchning, backup, kryptering, incidentrespons. Rikta till styrelseledamot som ska förstå vad IT-chefen gör (eller inte gör).'
  },
  {
    slug: 'nis2-leverantorskedjan-risk',
    title: 'Din leverantör kan fälla dig: NIS2 och leverantörskedjans säkerhet',
    angle: 'Fokus på supply chain-ansvar. Du ansvarar för dina leverantörers säkerhet. Vad måste du kräva? Hur gör du en leverantörsbedömning? Verkliga exempel från EU på supply chain-attacker (SolarWinds, Kaseya). Personligt ansvar om du väljer fel leverantör.'
  },
  {
    slug: 'nis2-vs-gdpr-skillnaden',
    title: 'NIS2 vs GDPR: Det här är skillnaden (och varför du inte kan välja)',
    angle: 'Jämförelseartiklar presterar bra SEO. Förklara: GDPR = persondata, NIS2 = kritisk infrastruktur och cybersäkerhet. De överlappar. Du måste följa båda. Tabellformat med jämförelse. Personligt ansvar är högre under NIS2.'
  },
  {
    slug: 'nis2-tillsyn-ncsc-msb-sverige',
    title: 'NIS2-tillsyn i Sverige: NCSC, MSB och vem som kontrollerar dig',
    angle: 'Vem granskar vad? NCSC, MSB, sektorsspecifika tillsynsmyndigheter (Finansinspektionen för bank, etc). Hur ser en granskning ut? Vad måste du ha dokumenterat? Konsekvenserna av en tillsynsinspektion.'
  },
  {
    slug: 'nis2-riskanalys-styrelsen-maste-godkanna',
    title: 'Riskanalysen styrelsen måste godkänna — och förstå',
    angle: 'NIS2 kräver att styrelsen aktivt godkänner riskhantering, inte bara delegerar. Vad ingår i en NIS2-riskanalys? Hur presenterar CISO den för styrelsen? Vad händer om styrelsen inte förstår vad de skriver under?'
  },
  {
    slug: 'nis2-deadline-ar-din-organisation-redo',
    title: 'NIS2-deadline: Är din organisation redo — eller köper du tid?',
    angle: 'Urgency-artikel. Direktivet gäller nu. Hur lång tid tar implementering i verkligheten (6-18 månader för de flesta)? Vad kostar det att börja för sent? Tre konkreta första steg du kan ta den här veckan.'
  }
];

const STYLE_GUIDE = fs.readFileSync(
  path.join(ARTICLES_DIR, 'nis2-boten-sanktioner-sverige.html'),
  'utf-8'
);

async function generateArticle(topic) {
  console.log(`\n[article] Generating: ${topic.slug}`);
  console.log(`[article] Title: ${topic.title}`);

  const today = new Date().toLocaleDateString('sv-SE', { year: 'numeric', month: 'long', day: 'numeric' });

  const prompt = `Du är en expert på NIS2 och skriver för nis2klar.se — en svensk sajt som hjälper VD:ar och styrelser att förstå och följa NIS2-direktivet.

UPPDRAG:
Skriv en komplett HTML-artikel med titeln: "${topic.title}"

VINKEL/FOKUS:
${topic.angle}

STILGUIDE — matcha exakt denna HTML-struktur och CSS (kopiera CSS-sektionen och nav-strukturen ordagrant, byt bara innehåll):
${STYLE_GUIDE}

KRAV:
- Minst 1200 ord löptext (exkl. HTML-taggar)
- Datum: ${today}
- Läsare: VD, styrelseordförande, styrelseledamot — inte tekniker
- Ton: professionell, direkt, lite skrämmande men aldrig panikskapande
- StoryBrand: läsaren är hjälten, NIS2 är utmaningen, vi är guiden
- Personligt ansvar ska nämnas konkret (inte bara i förbigående)
- Avsluta med CTA-sektion: länk till https://nis2klar.se/#kontakt med texten "Boka en kostnadsfri NIS2-genomgång"
- Inkludera minst: en .box-warning, en .box-info, och en .box-case
- nav-logo ska vara: <a class="nav-logo" href="https://nis2klar.se/">NIS2<span>Klar</span></a>
- nav-back: <a class="nav-back" href="https://nis2klar.se/artiklar.html">← Alla artiklar</a>
- Slug för denna artikel: ${topic.slug}

VIKTIGT: Returnera ENBART giltig HTML från <!DOCTYPE html> till </html>. Inget annat.`;

  let message;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      message = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 8000,
        messages: [{ role: 'user', content: prompt }]
      });
      break;
    } catch (err) {
      if ((err.status === 529 || err.status === 529) && attempt < 5) {
        const wait = attempt * 30000;
        console.log(`[article] API overloaded, retrying in ${wait/1000}s... (${attempt}/5)`);
        await new Promise(r => setTimeout(r, wait));
      } else throw err;
    }
  }

  let html = message.content[0].text.trim();
  // Strip markdown code fences if model wrapped response
  html = html.replace(/^```html?\s*/i, '').replace(/\s*```$/, '').trim();

  // Validate it looks like HTML
  if (!html.startsWith('<!DOCTYPE') && !html.startsWith('<html')) {
    throw new Error('Response does not look like HTML: ' + html.slice(0, 100));
  }

  const outPath = path.join(ARTICLES_DIR, `${topic.slug}.html`);
  fs.writeFileSync(outPath, html, 'utf-8');
  console.log(`[article] Saved: ${outPath}`);
  return outPath;
}

function generateIndex() {
  const files = fs.readdirSync(ARTICLES_DIR)
    .filter(f => f.endsWith('.html'))
    .sort();

  const cards = files.map(file => {
    const html = fs.readFileSync(path.join(ARTICLES_DIR, file), 'utf-8');
    const slug = file.replace('.html', '');
    const title = (html.match(/<title>([^<]*)<\/title>/) || [])[1]?.replace(/\s*\|.*$/, '').trim() || slug;
    const desc = (html.match(/name="description" content="([^"]*)"/) || [])[1] || '';
    const category = (html.match(/class="article-category"[^>]*>([^<]+)</) || [])[1]?.trim() || 'NIS2';
    return { slug, title, desc, category };
  });

  const cardHtml = cards.map(({ slug, title, desc, category }) => `
    <a class="card" href="/artiklar/${slug}.html">
      <div class="card-category">${category}</div>
      <h2>${title}</h2>
      <p>${desc}</p>
      <div class="card-arrow">Läs artikel →</div>
    </a>`).join('\n');

  const indexHtml = `<!DOCTYPE html>
<html lang="sv">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>NIS2 Artiklar — Guider för VD och styrelse | NIS2Klar</title>
  <meta name="description" content="Samling av artiklar om NIS2-direktivet för svenska VD:ar och styrelser. Böter, personligt ansvar, tekniska krav, incidentrapportering och mer.">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700;900&family=Barlow:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    :root { --bg: #141416; --card: #1c1c1f; --yellow: #f5c518; --white: #f0f0f0; --muted: #888; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: var(--bg); color: var(--white); font-family: 'Barlow', sans-serif; font-size: 18px; line-height: 1.7; }
    nav { display: flex; justify-content: space-between; align-items: center; padding: 20px 40px; border-bottom: 1px solid rgba(255,255,255,0.07); max-width: 1000px; margin: 0 auto; }
    .nav-logo { font-family: 'Poppins', sans-serif; font-weight: 900; font-size: 20px; color: var(--yellow); text-decoration: none; }
    .nav-logo span { color: var(--white); }
    .nav-cta { background: var(--yellow); color: #000; padding: 8px 18px; border-radius: 4px; text-decoration: none; font-weight: 700; font-size: 14px; font-family: 'Poppins', sans-serif; }
    .hero { max-width: 1000px; margin: 0 auto; padding: 60px 40px 40px; }
    .hero h1 { font-family: 'Poppins', sans-serif; font-size: clamp(28px, 4vw, 42px); font-weight: 900; margin-bottom: 12px; }
    .hero p { color: var(--muted); font-size: 18px; max-width: 560px; }
    .grid { max-width: 1000px; margin: 0 auto; padding: 20px 40px 80px; display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 24px; }
    .card { background: var(--card); border: 1px solid rgba(255,255,255,0.07); border-radius: 6px; padding: 28px; text-decoration: none; color: inherit; display: flex; flex-direction: column; transition: border-color 0.2s, transform 0.15s; }
    .card:hover { border-color: rgba(245,197,24,0.4); transform: translateY(-2px); }
    .card-category { font-size: 11px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: var(--yellow); margin-bottom: 12px; }
    .card h2 { font-family: 'Poppins', sans-serif; font-size: 18px; font-weight: 700; line-height: 1.35; margin-bottom: 12px; color: var(--white); }
    .card p { font-size: 15px; color: var(--muted); line-height: 1.6; flex: 1; }
    .card-arrow { margin-top: 20px; font-size: 14px; color: var(--yellow); font-weight: 600; }
  </style>
</head>
<body>
  <nav>
    <a class="nav-logo" href="https://nis2klar.se/">NIS2<span>Klar</span></a>
    <a class="nav-cta" href="https://nis2klar.se/#kontakt">Boka genomgång</a>
  </nav>
  <div class="hero">
    <h1>NIS2 Artiklar</h1>
    <p>Guider för VD:ar och styrelser — utan teknisk jargong. Vad NIS2 kräver, vad det kostar att missa, och hur du faktiskt följer lagen.</p>
  </div>
  <div class="grid">
${cardHtml}
  </div>
</body>
</html>`;

  const indexPath = path.join(FRONTEND_DIR, 'public', 'artiklar.html');
  fs.writeFileSync(indexPath, indexHtml, 'utf-8');
  console.log(`[index] Rebuilt artiklar.html — ${cards.length} articles`);
}

function rebuildFrontend() {
  console.log('\n[build] Rebuilding frontend...');
  generateIndex();
  execSync('npm run build', { cwd: FRONTEND_DIR, stdio: 'inherit' });
  console.log('[build] Done.');
}

function listStatus() {
  console.log('\nArticle queue status:');
  console.log('─'.repeat(70));
  for (const topic of TOPICS) {
    const exists = fs.existsSync(path.join(ARTICLES_DIR, `${topic.slug}.html`));
    const status = exists ? '✅ published' : '⏳ pending';
    console.log(`${status}  ${topic.slug}`);
  }
  const done = TOPICS.filter(t => fs.existsSync(path.join(ARTICLES_DIR, `${t.slug}.html`))).length;
  console.log('─'.repeat(70));
  console.log(`${done}/${TOPICS.length} published`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--list')) {
    listStatus();
    return;
  }

  if (args.includes('--all')) {
    // Generate all pending topics
    const pending = TOPICS.filter(t => !fs.existsSync(path.join(ARTICLES_DIR, `${t.slug}.html`)));
    console.log(`[article] Generating ${pending.length} pending articles...`);
    for (const topic of pending) {
      await generateArticle(topic);
      // Delay between requests to avoid overload
      await new Promise(r => setTimeout(r, 8000));
    }
    rebuildFrontend();
    listStatus();
    return;
  }

  // Default: generate next pending article (for daily cron)
  const next = TOPICS.find(t => !fs.existsSync(path.join(ARTICLES_DIR, `${t.slug}.html`)));
  if (!next) {
    console.log('[article] All articles published — nothing to do.');
    listStatus();
    return;
  }
  await generateArticle(next);
  rebuildFrontend();
}

main().catch(err => {
  console.error('[article] Error:', err.message);
  process.exit(1);
});
