#!/bin/bash
# Generate one article per language in every run.
# Called by cron twice daily — keeps all language queues advancing in sync.

cd /home/janne/humanizedtrust/backend || exit 1

echo "[all-langs] Starting $(date)"

echo "[all-langs] Swedish..."
node scripts/generate_article.js >> /tmp/nis2klar_articles.log 2>&1

echo "[all-langs] English..."
node scripts/generate_article_multilang.js --lang=en >> /tmp/nis2klar_articles_en.log 2>&1

echo "[all-langs] Danish..."
node scripts/generate_article_multilang.js --lang=da >> /tmp/nis2klar_articles_da.log 2>&1

echo "[all-langs] Norwegian..."
node scripts/generate_article_multilang.js --lang=no >> /tmp/nis2klar_articles_no.log 2>&1

echo "[all-langs] Italian..."
node scripts/generate_article_multilang.js --lang=it >> /tmp/nis2klar_articles_it.log 2>&1

echo "[all-langs] Done $(date)"
