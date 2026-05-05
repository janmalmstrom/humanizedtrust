const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const BASE_SEO_DIR = '/home/janne/simaroa-seo';

const PROPERTIES = {
  nis2klar:     { dir: 'nis2klar',     label: 'NIS2Klar',       domain: 'nis2klar.se' },
  lifeandpower: { dir: 'lifeandpower', label: 'Life and Power',  domain: 'lifeandpower.se' },
};

function getProperty(req) {
  const key = req.query.property || req.body?.property || 'nis2klar';
  return PROPERTIES[key] || PROPERTIES.nis2klar;
}

function readJson(filepath) {
  try {
    return JSON.parse(fs.readFileSync(filepath, 'utf8'));
  } catch {
    return null;
  }
}

// GET /api/seo/properties
router.get('/properties', (_req, res) => {
  res.json({ success: true, data: Object.entries(PROPERTIES).map(([key, p]) => ({ key, label: p.label, domain: p.domain })) });
});

// GET /api/seo/data?property=nis2klar
router.get('/data', (req, res) => {
  const prop = getProperty(req);
  const dataDir = path.join(BASE_SEO_DIR, prop.dir, 'data');
  const gsc = readJson(path.join(dataDir, 'gsc', 'data.json'));
  const ga4 = readJson(path.join(dataDir, 'ga4', 'data.json'));
  const ai  = readJson(path.join(dataDir, 'ai-visibility', 'data.json'));
  res.json({ success: true, data: { gsc, ga4, ai, property: prop } });
});

// POST /api/seo/fetch
router.post('/fetch', (req, res) => {
  const prop = getProperty(req);
  const seoDir = path.join(BASE_SEO_DIR, prop.dir);
  const { sources = 'gsc,ga4' } = req.body;
  const venvPython = path.join(BASE_SEO_DIR, 'nis2klar', 'venv', 'bin', 'python3');
  const pythonBin = fs.existsSync(venvPython) ? venvPython : 'python3';

  if (sources === 'ai') {
    const playwrightScript = path.join(seoDir, 'fetchers', 'fetch_ai_playwright.py');
    const script = fs.existsSync(playwrightScript) ? playwrightScript : path.join(seoDir, 'fetchers', 'fetch_ai_visibility.py');
    const proc = spawn(pythonBin, [script], { cwd: seoDir, detached: true, stdio: 'ignore' });
    proc.unref();
    return res.json({ success: true, data: { message: 'Checking AI visibility… takes ~2 minutes. Reload when done.' } });
  }

  const script = path.join(seoDir, 'run_fetch.py');
  if (!fs.existsSync(script)) {
    return res.json({ success: false, error: 'SEO scripts not found at ' + seoDir });
  }

  const proc = spawn(pythonBin, [script, '--sources', sources], { cwd: seoDir, detached: true, stdio: 'ignore' });
  proc.unref();
  res.json({ success: true, data: { message: `Fetching ${sources} for ${prop.label}… Reload in ~30 seconds.` } });
});

// POST /api/seo/report
router.post('/report', (req, res) => {
  const prop = getProperty(req);
  const seoDir = path.join(BASE_SEO_DIR, prop.dir);
  const venvPython = path.join(BASE_SEO_DIR, 'nis2klar', 'venv', 'bin', 'python3');
  const pythonBin = fs.existsSync(venvPython) ? venvPython : 'python3';
  const script = path.join(seoDir, 'generate_report.py');

  if (!fs.existsSync(script)) {
    return res.json({ success: false, error: 'generate_report.py not found for ' + prop.label });
  }

  const proc = spawn(pythonBin, [script], { cwd: seoDir, detached: true, stdio: 'ignore', env: { ...process.env } });
  proc.unref();
  res.json({ success: true, data: { message: `Generating AI report for ${prop.label}… takes ~30 seconds.` } });
});

// GET /api/seo/report/latest?property=nis2klar
router.get('/report/latest', (req, res) => {
  const prop = getProperty(req);
  const reportsDir = path.join(BASE_SEO_DIR, prop.dir, 'reports');
  if (!fs.existsSync(reportsDir)) return res.json({ success: true, data: { filename: null } });
  const files = fs.readdirSync(reportsDir)
    .filter(f => f.startsWith('seo-report-') && f.endsWith('.html'))
    .sort().reverse();
  res.json({ success: true, data: { filename: files[0] || null } });
});

// GET /api/seo/history?property=lifeandpower
router.get('/history', (req, res) => {
  const prop = getProperty(req);
  const snapshotsDir = path.join(BASE_SEO_DIR, prop.dir, 'data', 'gsc', 'snapshots');
  if (!fs.existsSync(snapshotsDir)) return res.json({ success: true, data: [] });
  const files = fs.readdirSync(snapshotsDir)
    .filter(f => f.endsWith('.json'))
    .sort();
  const snapshots = files.map(f => {
    try {
      const s = JSON.parse(fs.readFileSync(path.join(snapshotsDir, f), 'utf8'));
      return {
        date: s.date,
        total_clicks: s.total_clicks,
        total_impressions: s.total_impressions,
        avg_position: s.avg_position,
        total_queries: s.total_queries,
        total_pages: s.total_pages,
        top_queries: s.top_queries || [],
        top_pages: s.top_pages || [],
      };
    } catch { return null; }
  }).filter(Boolean);
  res.json({ success: true, data: snapshots });
});

// GET /api/seo/report/view?property=nis2klar
router.get('/report/view', (req, res) => {
  const prop = getProperty(req);
  const reportsDir = path.join(BASE_SEO_DIR, prop.dir, 'reports');
  if (!fs.existsSync(reportsDir)) return res.status(404).send('No reports yet');
  const files = fs.readdirSync(reportsDir)
    .filter(f => f.startsWith('seo-report-') && f.endsWith('.html'))
    .sort().reverse();
  if (!files[0]) return res.status(404).send('No reports generated yet. Click "AI Report" first.');
  res.setHeader('Content-Type', 'text/html');
  res.send(fs.readFileSync(path.join(reportsDir, files[0]), 'utf8'));
});

module.exports = router;
