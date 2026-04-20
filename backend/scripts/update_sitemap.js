'use strict';
/**
 * Regenerates sitemap.xml with all 4 language versions of articles.
 * Includes hreflang alternate links for each article.
 *
 * Usage:
 *   node scripts/update_sitemap.js
 */

const fs = require('fs');
const path = require('path');

const FRONTEND_PUBLIC = path.join(__dirname, '../../frontend/public');
const TODAY = new Date().toISOString().split('T')[0];

// Language article directories and their URL paths
const LANG_DIRS = [
  { dir: 'artiklar',   urlPath: 'artiklar',    indexUrl: 'artiklar.html',      lang: 'sv' },
  { dir: 'en/articles', urlPath: 'en/articles', indexUrl: 'en/articles.html',  lang: 'en' },
  { dir: 'da/artikler', urlPath: 'da/artikler', indexUrl: 'da/artikler.html',  lang: 'da' },
  { dir: 'no/artikler', urlPath: 'no/artikler', indexUrl: 'no/artikler.html',  lang: 'no' },
  { dir: 'it/articoli', urlPath: 'it/articoli', indexUrl: 'it/articoli.html',  lang: 'it' },
];

const BASE = 'https://nis2klar.se';

// Static pages
const STATIC_PAGES = [
  { url: 'nis2.html',           priority: '1.0', changefreq: 'weekly' },
  { url: 'artiklar.html',       priority: '0.9', changefreq: 'daily'  },
  { url: 'en/nis2.html',        priority: '1.0', changefreq: 'weekly' },
  { url: 'da/nis2.html',        priority: '1.0', changefreq: 'weekly' },
  { url: 'no/nis2.html',        priority: '1.0', changefreq: 'weekly' },
  { url: 'en/articles.html',    priority: '0.9', changefreq: 'daily'  },
  { url: 'da/artikler.html',    priority: '0.9', changefreq: 'daily'  },
  { url: 'no/artikler.html',    priority: '0.9', changefreq: 'daily'  },
  { url: 'it/nis2.html',        priority: '1.0', changefreq: 'weekly' },
  { url: 'it/articoli.html',    priority: '0.9', changefreq: 'daily'  },
  { url: 'nis2-gap-analys.html',   priority: '0.8', changefreq: 'monthly' },
  { url: 'nis2-checklista.html',   priority: '0.7', changefreq: 'monthly' },
  { url: 'nis2-kalkylator.html',   priority: '0.7', changefreq: 'monthly' },
  { url: 'nis2-styrelsepaket.html', priority: '0.7', changefreq: 'monthly' },
];

function getArticlesInDir(dirName) {
  const fullDir = path.join(FRONTEND_PUBLIC, dirName);
  if (!fs.existsSync(fullDir)) return [];
  return fs.readdirSync(fullDir)
    .filter(f => f.endsWith('.html'))
    .sort()
    .map(f => f.replace('.html', ''));
}

function buildSitemap() {
  const lines = ['<?xml version="1.0" encoding="UTF-8"?>'];
  lines.push('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"');
  lines.push('        xmlns:xhtml="http://www.w3.org/1999/xhtml">');
  lines.push('');

  // Static pages
  lines.push('  <!-- Static pages -->');
  for (const page of STATIC_PAGES) {
    lines.push('  <url>');
    lines.push(`    <loc>${BASE}/${page.url}</loc>`);
    lines.push(`    <lastmod>${TODAY}</lastmod>`);
    lines.push(`    <changefreq>${page.changefreq}</changefreq>`);
    lines.push(`    <priority>${page.priority}</priority>`);
    lines.push('  </url>');
  }
  lines.push('');

  // Article pages per language
  for (const { dir, urlPath, lang } of LANG_DIRS) {
    const slugs = getArticlesInDir(dir);
    if (slugs.length === 0) continue;

    lines.push(`  <!-- ${lang.toUpperCase()} articles (${slugs.length}) -->`);
    for (const slug of slugs) {
      lines.push('  <url>');
      lines.push(`    <loc>${BASE}/${urlPath}/${slug}.html</loc>`);
      lines.push(`    <lastmod>${TODAY}</lastmod>`);
      lines.push('    <changefreq>monthly</changefreq>');
      lines.push('    <priority>0.8</priority>');
      // hreflang self-reference
      lines.push(`    <xhtml:link rel="alternate" hreflang="${lang}" href="${BASE}/${urlPath}/${slug}.html"/>`);
      lines.push('  </url>');
    }
    lines.push('');
  }

  lines.push('</urlset>');

  const sitemapPath = path.join(FRONTEND_PUBLIC, 'sitemap.xml');
  fs.writeFileSync(sitemapPath, lines.join('\n'), 'utf-8');

  // Count stats
  const counts = LANG_DIRS.map(({ dir, lang }) => `${lang}:${getArticlesInDir(dir).length}`).join(' ');
  console.log(`[sitemap] Rebuilt sitemap.xml — ${counts}`);
  console.log(`[sitemap] Saved: ${sitemapPath}`);
}

buildSitemap();
