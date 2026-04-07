const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const SEO_DIR = '/home/janne/simaroa-seo/nis2klar';
const DATA_DIR = path.join(SEO_DIR, 'data');

function readJson(filepath) {
  try {
    return JSON.parse(fs.readFileSync(filepath, 'utf8'));
  } catch {
    return null;
  }
}

// GET /api/seo/data
router.get('/data', (req, res) => {
  const gsc = readJson(path.join(DATA_DIR, 'gsc', 'data.json'));
  const ga4 = readJson(path.join(DATA_DIR, 'ga4', 'data.json'));
  const ai  = readJson(path.join(DATA_DIR, 'ai-visibility', 'data.json'));
  res.json({ success: true, data: { gsc, ga4, ai } });
});

// POST /api/seo/fetch — trigger Python fetchers in background
router.post('/fetch', (req, res) => {
  const { sources = 'gsc,ga4' } = req.body;
  const venvPython = path.join(SEO_DIR, 'venv', 'bin', 'python3');
  const pythonBin = fs.existsSync(venvPython) ? venvPython : 'python3';

  // AI visibility: use Playwright scraper (no API key needed)
  if (sources === 'ai') {
    const playwrightScript = path.join(SEO_DIR, 'fetchers', 'fetch_ai_playwright.py');
    const script = fs.existsSync(playwrightScript) ? playwrightScript : path.join(SEO_DIR, 'fetchers', 'fetch_ai_visibility.py');
    const proc = spawn(pythonBin, [script], { cwd: SEO_DIR, detached: true, stdio: 'ignore' });
    proc.unref();
    return res.json({ success: true, data: { message: 'Checking AI visibility on Perplexity + DuckDuckGo AI… takes ~2 minutes. Reload when done.' } });
  }

  const script = path.join(SEO_DIR, 'run_fetch.py');
  if (!fs.existsSync(script)) {
    return res.json({ success: false, error: 'SEO scripts not found at ' + SEO_DIR });
  }

  const proc = spawn(pythonBin, [script, '--sources', sources], {
    cwd: SEO_DIR, detached: true, stdio: 'ignore'
  });
  proc.unref();

  res.json({ success: true, data: { message: `Fetching ${sources} in background. Reload in ~30 seconds.` } });
});

// POST /api/seo/report — generate AI report
router.post('/report', (req, res) => {
  const venvPython = path.join(SEO_DIR, 'venv', 'bin', 'python3');
  const pythonBin = fs.existsSync(venvPython) ? venvPython : 'python3';
  const script = path.join(SEO_DIR, 'generate_report.py');

  if (!fs.existsSync(script)) {
    return res.json({ success: false, error: 'generate_report.py not found' });
  }

  const env = { ...process.env };
  const proc = spawn(pythonBin, [script], { cwd: SEO_DIR, detached: true, stdio: 'ignore', env });
  proc.unref();

  res.json({ success: true, data: { message: 'Generating AI report… takes ~30 seconds. Click View Report when ready.' } });
});

// GET /api/seo/report/latest
router.get('/report/latest', (req, res) => {
  const reportsDir = path.join(SEO_DIR, 'reports');
  if (!fs.existsSync(reportsDir)) return res.json({ success: true, data: { filename: null } });
  const files = fs.readdirSync(reportsDir)
    .filter(f => f.startsWith('seo-report-') && f.endsWith('.html'))
    .sort().reverse();
  res.json({ success: true, data: { filename: files[0] || null } });
});

// GET /api/seo/report/view
router.get('/report/view', (req, res) => {
  const reportsDir = path.join(SEO_DIR, 'reports');
  if (!fs.existsSync(reportsDir)) return res.status(404).send('No reports yet');
  const files = fs.readdirSync(reportsDir)
    .filter(f => f.startsWith('seo-report-') && f.endsWith('.html'))
    .sort().reverse();
  if (!files[0]) return res.status(404).send('No reports generated yet. Click "AI Report" first.');
  res.setHeader('Content-Type', 'text/html');
  res.send(fs.readFileSync(path.join(reportsDir, files[0]), 'utf8'));
});

module.exports = router;
