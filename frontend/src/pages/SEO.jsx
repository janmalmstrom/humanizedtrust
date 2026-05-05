import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';

function LineChart({ snapshots, metric, color, label, invert = false, fmt: fmtFn = (n) => n }) {
  if (!snapshots || snapshots.length < 2) {
    return (
      <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '0.82rem' }}>
        Not enough data yet — check back after next refresh
      </div>
    );
  }
  const W = 600, H = 140, PAD = { top: 16, right: 24, bottom: 28, left: 44 };
  const vals = snapshots.map(s => s[metric] ?? 0);
  const raw_min = Math.min(...vals);
  const raw_max = Math.max(...vals);
  const range = raw_max - raw_min || 1;
  const toY = v => {
    const norm = (v - raw_min) / range;
    const flipped = invert ? norm : 1 - norm;
    return PAD.top + flipped * (H - PAD.top - PAD.bottom);
  };
  const toX = i => PAD.left + (i / (snapshots.length - 1)) * (W - PAD.left - PAD.right);
  const points = snapshots.map((s, i) => `${toX(i)},${toY(s[metric] ?? 0)}`).join(' ');
  const yLabels = [raw_min, raw_min + range * 0.5, raw_max].map(v => ({ v, y: toY(v) }));
  const xLabels = snapshots.length <= 8
    ? snapshots.map((s, i) => ({ label: s.date.slice(5), x: toX(i) }))
    : [0, Math.floor((snapshots.length - 1) / 2), snapshots.length - 1].map(i => ({ label: snapshots[i].date.slice(5), x: toX(i) }));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 160, display: 'block' }}>
      {/* Grid lines */}
      {yLabels.map(({ y }, i) => (
        <line key={i} x1={PAD.left} y1={y} x2={W - PAD.right} y2={y} stroke="#f1f5f9" strokeWidth={1} />
      ))}
      {/* Y labels */}
      {yLabels.map(({ v, y }, i) => (
        <text key={i} x={PAD.left - 6} y={y + 4} textAnchor="end" fontSize={9} fill="#94a3b8">{fmtFn(v)}</text>
      ))}
      {/* X labels */}
      {xLabels.map(({ label: l, x }, i) => (
        <text key={i} x={x} y={H - 4} textAnchor="middle" fontSize={9} fill="#94a3b8">{l}</text>
      ))}
      {/* Line */}
      <polyline fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" points={points} />
      {/* Fill area */}
      <polygon
        points={`${toX(0)},${H - PAD.bottom} ${points} ${toX(snapshots.length - 1)},${H - PAD.bottom}`}
        fill={color} opacity={0.08}
      />
      {/* Dots */}
      {snapshots.map((s, i) => (
        <circle key={i} cx={toX(i)} cy={toY(s[metric] ?? 0)} r={3} fill={color} />
      ))}
    </svg>
  );
}

const fmt = (n) => n == null ? '—' : Number(n).toLocaleString();
const fmtPct = (n) => n == null ? '—' : Number(n).toFixed(1) + '%';
const fmtPos = (n) => n == null ? '—' : Number(n).toFixed(1);

function Badge({ color, children }) {
  const colors = {
    green:  { background: '#dcfce7', color: '#15803d' },
    red:    { background: '#fee2e2', color: '#dc2626' },
    blue:   { background: '#dbeafe', color: '#1d4ed8' },
    gray:   { background: '#f1f5f9', color: '#64748b' },
    orange: { background: '#ffedd5', color: '#ea580c' },
  };
  return (
    <span style={{ ...colors[color] || colors.gray, fontSize: '0.75rem', fontWeight: 700, padding: '0.2rem 0.55rem', borderRadius: 99 }}>
      {children}
    </span>
  );
}

function StatCard({ label, value, sub }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '1.1rem 1.25rem', flex: 1, minWidth: 130 }}>
      <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.4rem' }}>{label}</div>
      <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#0f172a', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: '0.82rem', color: '#94a3b8', marginTop: '0.3rem' }}>{sub}</div>}
    </div>
  );
}

function MiniBar({ value, max }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      <div style={{ flex: 1, background: '#f1f5f9', borderRadius: 3, height: 6 }}>
        <div style={{ width: `${pct}%`, background: '#6366f1', borderRadius: 3, height: 6 }} />
      </div>
      <span style={{ fontSize: '0.8rem', color: '#64748b', minWidth: 36, textAlign: 'right' }}>{fmt(value)}</span>
    </div>
  );
}

function PositionBadge({ pos }) {
  if (pos == null) return <span style={{ color: '#94a3b8' }}>—</span>;
  const p = Number(pos);
  const color = p <= 3 ? 'green' : p <= 10 ? 'blue' : p <= 20 ? 'orange' : 'gray';
  return <Badge color={color}>{fmtPos(pos)}</Badge>;
}

function SectionLabel({ children }) {
  return (
    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.75rem', marginTop: '1.75rem' }}>
      {children}
    </div>
  );
}

const thStyle = {
  textAlign: 'left', padding: '0.5rem 0.75rem',
  fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8',
  textTransform: 'uppercase', letterSpacing: '0.06em',
  borderBottom: '1px solid #e2e8f0', background: '#f8fafc'
};
const tdStyle = {
  padding: '0.55rem 0.75rem', fontSize: '0.85rem',
  color: '#334155', borderBottom: '1px solid #f1f5f9'
};

const PROPERTIES = [
  { key: 'nis2klar',     label: 'NIS2Klar',      domain: 'nis2klar.se' },
  { key: 'lifeandpower', label: 'Life and Power', domain: 'lifeandpower.se' },
];

export default function SEO() {
  const [data, setData]             = useState(null);
  const [loading, setLoading]       = useState(true);
  const [fetching, setFetching]     = useState(false);
  const [fetchMsg, setFetchMsg]     = useState('');
  const [generating, setGenerating] = useState(false);
  const [gscTab, setGscTab]         = useState('queries');
  const [property, setProperty]     = useState('nis2klar');
  const [sortCol, setSortCol]       = useState('impressions');
  const [sortDir, setSortDir]       = useState('desc');
  const [filters, setFilters]       = useState({ query: '', minImpressions: '', maxPosition: '', minClicks: '', maxCtr: '' });
  const [history, setHistory]       = useState([]);
  const [trendMetric, setTrendMetric] = useState('total_clicks');

  const load = useCallback(async (prop = property) => {
    setLoading(true);
    try {
      const [dataRes, histRes] = await Promise.all([
        api.get('/seo/data?property=' + prop),
        api.get('/seo/history?property=' + prop),
      ]);
      setData(dataRes.data);
      setHistory(histRes.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [property]);

  useEffect(() => { load(); }, [load]);

  const handlePropertyChange = (key) => {
    setProperty(key);
    setData(null);
    load(key);
  };

  const handleFetch = async (sources) => {
    setFetching(true);
    setFetchMsg('');
    try {
      const res = await api.post('/seo/fetch', { sources, property });
      setFetchMsg(res.data.message);
      setTimeout(() => { load(); setFetchMsg(''); }, 35000);
    } catch (e) {
      setFetchMsg('Fetch failed: ' + e.message);
    } finally {
      setFetching(false);
    }
  };

  if (loading) {
    return <div style={{ padding: '2rem', color: '#94a3b8', fontSize: '0.9rem' }}>Loading SEO data…</div>;
  }

  const gsc = data?.gsc;
  const ga4 = data?.ga4;
  const ai  = data?.ai;

  const hasGsc = !!gsc;
  const hasGa4 = !!ga4;
  const hasAi  = !!ai;

  const quickWins = hasGsc
    ? (gsc.queries || []).filter(q => q.position >= 11 && q.position <= 20 && q.impressions >= 50)
        .sort((a, b) => b.impressions - a.impressions).slice(0, 15)
    : [];

  const lowCtr = hasGsc
    ? (gsc.queries || []).filter(q => q.position <= 10 && q.ctr < 2 && q.impressions >= 100)
        .sort((a, b) => b.impressions - a.impressions).slice(0, 15)
    : [];

  const maxImpressions = hasGsc ? Math.max(...(gsc.queries || []).map(q => q.impressions), 1) : 1;
  const totalClicks = hasGsc ? (gsc.queries || []).reduce((s, q) => s + q.clicks, 0) : 0;
  const totalImpressions = hasGsc ? (gsc.queries || []).reduce((s, q) => s + q.impressions, 0) : 0;
  const avgPosition = hasGsc && gsc.queries?.length
    ? gsc.queries.reduce((s, q) => s + q.position, 0) / gsc.queries.length
    : null;
  const avgCtr = totalImpressions > 0 ? (totalClicks / totalImpressions * 100) : 0;
  const organicSessions = hasGa4
    ? (ga4.channels || []).find(c => c.sessionDefaultChannelGroup === 'Organic Search')?.sessions || 0
    : 0;
  const aiCited = hasAi ? (ai.summary?.times_cited || 0) : 0;
  const aiMentioned = hasAi ? (ai.summary?.times_mentioned_not_cited || 0) : 0;
  const aiTotal = hasAi ? (ai.summary?.total_checks || 0) : 0;

  return (
    <div style={{ padding: '1.5rem 2rem', maxWidth: 1100, fontFamily: 'system-ui, sans-serif' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div>
            <h2 style={{ fontSize: '2rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>SEO Dashboard</h2>
            <div style={{ fontSize: '0.82rem', color: '#94a3b8', marginTop: '0.2rem' }}>
              {PROPERTIES.find(p => p.key === property)?.domain} ·{' '}
              {hasGsc ? `GSC: ${gsc.date_range?.start} → ${gsc.date_range?.end}` : 'No GSC data yet'}
              {hasGa4 ? ` · GA4: ${ga4.date_range?.start} → ${ga4.date_range?.end}` : ''}
            </div>
          </div>
          <select
            value={property}
            onChange={e => handlePropertyChange(e.target.value)}
            style={{ padding: '0.45rem 0.85rem', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: '0.9rem', fontWeight: 600, color: '#0f172a', background: '#f8fafc', cursor: 'pointer' }}
          >
            {PROPERTIES.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            onClick={() => handleFetch('gsc,ga4')}
            disabled={fetching}
            style={{ padding: '0.55rem 1.1rem', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: '0.85rem', cursor: fetching ? 'not-allowed' : 'pointer', opacity: fetching ? 0.7 : 1 }}
          >
            {fetching ? '⏳ Fetching…' : '↻ Refresh Data'}
          </button>
          <button
            onClick={() => handleFetch('ai')}
            disabled={fetching}
            style={{ padding: '0.55rem 1.1rem', background: '#fff', color: '#6366f1', border: '1px solid #6366f1', borderRadius: 8, fontWeight: 600, fontSize: '0.85rem', cursor: fetching ? 'not-allowed' : 'pointer', opacity: fetching ? 0.7 : 1 }}
          >
            🤖 Check AI Visibility
          </button>
          <button
            onClick={async () => {
              setGenerating(true);
              setFetchMsg('');
              try {
                const res = await api.post('/seo/report', { property });
                setFetchMsg(res.data.message);
              } catch (e) { setFetchMsg('Error: ' + e.message); }
              finally { setGenerating(false); }
            }}
            disabled={generating}
            style={{ padding: '0.55rem 1.1rem', background: '#f59e0b', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: '0.85rem', cursor: generating ? 'not-allowed' : 'pointer', opacity: generating ? 0.7 : 1 }}
          >
            {generating ? '⏳ Generating…' : '✨ AI Report'}
          </button>
          <a
            href={`/api/seo/report/view?property=${property}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ padding: '0.55rem 1.1rem', background: '#fff', color: '#f59e0b', border: '1px solid #f59e0b', borderRadius: 8, fontWeight: 600, fontSize: '0.85rem', textDecoration: 'none' }}
          >
            View Report
          </a>
          <button
            onClick={load}
            style={{ padding: '0.55rem 0.9rem', background: '#f1f5f9', color: '#64748b', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}
          >
            Reload
          </button>
        </div>
      </div>

      {fetchMsg && (
        <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '0.7rem 1rem', fontSize: '0.85rem', color: '#1d4ed8', marginBottom: '1rem' }}>
          {fetchMsg}
        </div>
      )}

      {(gsc && gsc.queries?.length === 0 && ga4 && ga4.channels?.length === 0) && (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '1.25rem 1.5rem', marginBottom: '1.5rem' }}>
          <div style={{ fontWeight: 700, color: '#166534', marginBottom: '0.4rem' }}>✅ GSC & GA4 connected — waiting for data</div>
          <div style={{ fontSize: '0.85rem', color: '#15803d' }}>
            GA4 data appears within 24–48h. GSC search data builds up over days as Google indexes nis2klar.se. Check back tomorrow.
          </div>
        </div>
      )}

      {/* Stat cards */}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.25rem' }}>
        <StatCard label="Organic Clicks" value={fmt(totalClicks)} sub="last 90 days (GSC)" />
        <StatCard label="Impressions" value={fmt(totalImpressions)} sub="last 90 days (GSC)" />
        <StatCard label="Avg Position" value={avgPosition ? fmtPos(avgPosition) : '—'} sub="across all queries" />
        <StatCard label="Avg CTR" value={avgCtr ? fmtPct(avgCtr) : '—'} sub="clicks ÷ impressions" />
        <StatCard label="Organic Sessions" value={fmt(organicSessions)} sub="last 90 days (GA4)" />
        {hasAi && <StatCard label="AI Visibility" value={`${aiCited + aiMentioned}/${aiTotal}`} sub={`${aiCited} cited · ${aiMentioned} mentioned`} />}
      </div>

      {/* Trends */}
      <SectionLabel>Trends Over Time</SectionLabel>
      {history.length === 0 ? (
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '1.25rem 1.5rem', fontSize: '0.85rem', color: '#94a3b8' }}>
          No snapshots yet — data is saved each time you click ↻ Refresh Data. Check back after the next refresh.
        </div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '1rem 1.25rem' }}>
          <div style={{ display: 'flex', gap: '0.35rem', marginBottom: '0.85rem', flexWrap: 'wrap' }}>
            {[
              { key: 'total_clicks',      label: 'Clicks',       color: '#6366f1', invert: false, fmtFn: n => Math.round(n) },
              { key: 'total_impressions', label: 'Impressions',  color: '#0ea5e9', invert: false, fmtFn: n => Math.round(n) },
              { key: 'avg_position',      label: 'Avg Position', color: '#f59e0b', invert: true,  fmtFn: n => Number(n).toFixed(1) },
              { key: 'total_queries',     label: 'Queries',      color: '#10b981', invert: false, fmtFn: n => Math.round(n) },
            ].map(m => (
              <button key={m.key} onClick={() => setTrendMetric(m.key)}
                style={{ padding: '0.3rem 0.75rem', border: 'none', borderRadius: 6, fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer',
                  background: trendMetric === m.key ? m.color : '#f1f5f9',
                  color: trendMetric === m.key ? '#fff' : '#64748b' }}>
                {m.label}
              </button>
            ))}
            <span style={{ marginLeft: 'auto', fontSize: '0.78rem', color: '#94a3b8', alignSelf: 'center' }}>
              {history.length} snapshot{history.length !== 1 ? 's' : ''} · {history[0]?.date} → {history[history.length - 1]?.date}
            </span>
          </div>
          {(() => {
            const m = [
              { key: 'total_clicks',      color: '#6366f1', invert: false, fmtFn: n => Math.round(n) },
              { key: 'total_impressions', color: '#0ea5e9', invert: false, fmtFn: n => Math.round(n) },
              { key: 'avg_position',      color: '#f59e0b', invert: true,  fmtFn: n => Number(n).toFixed(1) },
              { key: 'total_queries',     color: '#10b981', invert: false, fmtFn: n => Math.round(n) },
            ].find(x => x.key === trendMetric);
            return <LineChart snapshots={history} metric={m.key} color={m.color} invert={m.invert} fmt={m.fmtFn} />;
          })()}
          {history.length >= 2 && (() => {
            const first = history[0], last = history[history.length - 1];
            const metrics = [
              { key: 'total_clicks', label: 'Clicks', invert: false },
              { key: 'total_impressions', label: 'Impressions', invert: false },
              { key: 'avg_position', label: 'Avg Pos', invert: true, fmtFn: n => Number(n).toFixed(1) },
            ];
            return (
              <div style={{ display: 'flex', gap: '1rem', marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid #f1f5f9' }}>
                {metrics.map(m => {
                  const f = first[m.key] ?? 0, l = last[m.key] ?? 0;
                  const delta = l - f;
                  const pct = f !== 0 ? ((delta / f) * 100).toFixed(0) : null;
                  const good = m.invert ? delta < 0 : delta > 0;
                  const color = delta === 0 ? '#94a3b8' : good ? '#15803d' : '#dc2626';
                  return (
                    <div key={m.key} style={{ flex: 1, textAlign: 'center' }}>
                      <div style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{m.label}</div>
                      <div style={{ fontSize: '1.2rem', fontWeight: 800, color, marginTop: 2 }}>
                        {delta > 0 ? '+' : ''}{m.fmtFn ? m.fmtFn(delta) : Math.round(delta)}
                        {pct && <span style={{ fontSize: '0.75rem', fontWeight: 600, marginLeft: 4 }}>({pct > 0 ? '+' : ''}{pct}%)</span>}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{first.date} → {last.date}</div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      )}

      {/* GSC */}
      {hasGsc && (
        <>
          <SectionLabel>Google Search Console</SectionLabel>
          <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '0.75rem' }}>
            {['queries', 'pages', 'quick_wins', 'low_ctr'].map(t => (
              <button
                key={t}
                onClick={() => setGscTab(t)}
                style={{ padding: '0.35rem 0.85rem', border: 'none', borderRadius: 6, fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer', background: gscTab === t ? '#6366f1' : '#f1f5f9', color: gscTab === t ? '#fff' : '#64748b' }}
              >
                {t === 'queries' ? 'Top Queries' : t === 'pages' ? 'Top Pages' : t === 'quick_wins' ? `🎯 Quick Wins (${quickWins.length})` : `⚡ Low CTR (${lowCtr.length})`}
              </button>
            ))}
          </div>

          {gscTab === 'queries' && (() => {
            const handleSort = (col) => {
              if (sortCol === col) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
              else { setSortCol(col); setSortDir(col === 'query' ? 'asc' : 'desc'); }
            };
            const setF = (k, v) => setFilters(f => ({ ...f, [k]: v }));
            const SortTh = ({ col, label, align = 'right' }) => (
              <th style={{ ...thStyle, textAlign: align, cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }} onClick={() => handleSort(col)}>
                {label} {sortCol === col ? (sortDir === 'desc' ? '▼' : '▲') : <span style={{ opacity: 0.3 }}>↕</span>}
              </th>
            );
            const inputStyle = { padding: '0.35rem 0.6rem', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: '0.82rem', width: '100%', color: '#334155' };
            const filtered = (gsc.queries || []).filter(q => {
              if (filters.query && !q.query.toLowerCase().includes(filters.query.toLowerCase())) return false;
              if (filters.minImpressions && q.impressions < Number(filters.minImpressions)) return false;
              if (filters.maxPosition && q.position > Number(filters.maxPosition)) return false;
              if (filters.minClicks && q.clicks < Number(filters.minClicks)) return false;
              if (filters.maxCtr && q.ctr > Number(filters.maxCtr)) return false;
              return true;
            });
            const sorted = [...filtered].sort((a, b) => {
              const v = sortCol === 'query' ? a.query.localeCompare(b.query) : (a[sortCol] ?? 0) - (b[sortCol] ?? 0);
              return sortDir === 'desc' ? -v : v;
            });
            const hasFilters = Object.values(filters).some(v => v !== '');
            return (
              <div>
                {/* Filter bar */}
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  <div style={{ flex: 2, minWidth: 140 }}>
                    <div style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 700, marginBottom: 3 }}>SEARCH QUERY</div>
                    <input placeholder="filter by keyword…" value={filters.query} onChange={e => setF('query', e.target.value)} style={inputStyle} />
                  </div>
                  <div style={{ flex: 1, minWidth: 100 }}>
                    <div style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 700, marginBottom: 3 }}>MIN IMPRESSIONS</div>
                    <input type="number" placeholder="e.g. 50" value={filters.minImpressions} onChange={e => setF('minImpressions', e.target.value)} style={inputStyle} />
                  </div>
                  <div style={{ flex: 1, minWidth: 100 }}>
                    <div style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 700, marginBottom: 3 }}>MAX POSITION</div>
                    <input type="number" placeholder="e.g. 20" value={filters.maxPosition} onChange={e => setF('maxPosition', e.target.value)} style={inputStyle} />
                  </div>
                  <div style={{ flex: 1, minWidth: 100 }}>
                    <div style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 700, marginBottom: 3 }}>MIN CLICKS</div>
                    <input type="number" placeholder="e.g. 1" value={filters.minClicks} onChange={e => setF('minClicks', e.target.value)} style={inputStyle} />
                  </div>
                  <div style={{ flex: 1, minWidth: 100 }}>
                    <div style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 700, marginBottom: 3 }}>MAX CTR %</div>
                    <input type="number" placeholder="e.g. 2" value={filters.maxCtr} onChange={e => setF('maxCtr', e.target.value)} style={inputStyle} />
                  </div>
                  {hasFilters && (
                    <button onClick={() => setFilters({ query: '', minImpressions: '', maxPosition: '', minClicks: '', maxCtr: '' })}
                      style={{ padding: '0.35rem 0.75rem', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: '0.82rem', cursor: 'pointer', background: '#fff', color: '#64748b', whiteSpace: 'nowrap' }}>
                      ✕ Clear
                    </button>
                  )}
                  <div style={{ fontSize: '0.82rem', color: '#94a3b8', whiteSpace: 'nowrap', alignSelf: 'center' }}>{sorted.length} rows</div>
                </div>
                {/* Table */}
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr>
                      <SortTh col="query" label="Query" align="left" />
                      <SortTh col="impressions" label="Impressions" />
                      <SortTh col="clicks" label="Clicks" />
                      <SortTh col="ctr" label="CTR" />
                      <SortTh col="position" label="Position" />
                    </tr></thead>
                    <tbody>
                      {sorted.slice(0, 50).map((q, i) => (
                        <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                          <td style={tdStyle}>{q.query}</td>
                          <td style={{ ...tdStyle, textAlign: 'right' }}><MiniBar value={q.impressions} max={maxImpressions} /></td>
                          <td style={{ ...tdStyle, textAlign: 'right' }}>{fmt(q.clicks)}</td>
                          <td style={{ ...tdStyle, textAlign: 'right' }}>{fmtPct(q.ctr)}</td>
                          <td style={{ ...tdStyle, textAlign: 'right' }}><PositionBadge pos={q.position} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}

          {gscTab === 'pages' && (
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>
                  <th style={thStyle}>Page</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Impressions</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Clicks</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>CTR</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Position</th>
                </tr></thead>
                <tbody>
                  {(gsc.pages || []).slice(0, 50).map((p, i) => (
                    <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                      <td style={{ ...tdStyle, maxWidth: 420, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <a href={p.page} target="_blank" rel="noopener noreferrer" style={{ color: '#6366f1', textDecoration: 'none' }}>
                          {p.page.replace(/^https?:\/\/[^/]+/, '') || '/'}
                        </a>
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{fmt(p.impressions)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{fmt(p.clicks)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{fmtPct(p.ctr)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}><PositionBadge pos={p.position} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {gscTab === 'quick_wins' && (
            <div>
              <div style={{ fontSize: '0.82rem', color: '#64748b', marginBottom: '0.75rem' }}>
                Keywords on position 11–20 with 50+ impressions — small content improvements can push these to page 1.
              </div>
              {quickWins.length === 0
                ? <div style={{ color: '#94a3b8', fontSize: '0.85rem' }}>No page-2 keywords with enough impressions yet.</div>
                : <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead><tr>
                        <th style={thStyle}>Keyword</th>
                        <th style={{ ...thStyle, textAlign: 'right' }}>Impressions</th>
                        <th style={{ ...thStyle, textAlign: 'right' }}>Clicks</th>
                        <th style={{ ...thStyle, textAlign: 'right' }}>Position</th>
                      </tr></thead>
                      <tbody>
                        {quickWins.map((q, i) => (
                          <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                            <td style={tdStyle}>{q.query}</td>
                            <td style={{ ...tdStyle, textAlign: 'right' }}>{fmt(q.impressions)}</td>
                            <td style={{ ...tdStyle, textAlign: 'right' }}>{fmt(q.clicks)}</td>
                            <td style={{ ...tdStyle, textAlign: 'right' }}><PositionBadge pos={q.position} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
              }
            </div>
          )}

          {gscTab === 'low_ctr' && (
            <div>
              <div style={{ fontSize: '0.82rem', color: '#64748b', marginBottom: '0.75rem' }}>
                Keywords ranking top 10 with CTR below 2% — improve title tags or meta descriptions to increase clicks.
              </div>
              {lowCtr.length === 0
                ? <div style={{ color: '#94a3b8', fontSize: '0.85rem' }}>No low-CTR keywords in top 10 yet.</div>
                : <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead><tr>
                        <th style={thStyle}>Keyword</th>
                        <th style={{ ...thStyle, textAlign: 'right' }}>Impressions</th>
                        <th style={{ ...thStyle, textAlign: 'right' }}>CTR</th>
                        <th style={{ ...thStyle, textAlign: 'right' }}>Position</th>
                      </tr></thead>
                      <tbody>
                        {lowCtr.map((q, i) => (
                          <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                            <td style={tdStyle}>{q.query}</td>
                            <td style={{ ...tdStyle, textAlign: 'right' }}>{fmt(q.impressions)}</td>
                            <td style={{ ...tdStyle, textAlign: 'right' }}><Badge color="orange">{fmtPct(q.ctr)}</Badge></td>
                            <td style={{ ...tdStyle, textAlign: 'right' }}><PositionBadge pos={q.position} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
              }
            </div>
          )}
        </>
      )}

      {/* GA4 */}
      {hasGa4 && (
        <>
          <SectionLabel>Google Analytics 4</SectionLabel>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden', flex: '1 1 360px' }}>
              <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #f1f5f9', fontWeight: 700, fontSize: '0.9rem', color: '#0f172a' }}>Traffic by Channel</div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>
                  <th style={thStyle}>Channel</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Sessions</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Users</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Bounce</th>
                </tr></thead>
                <tbody>
                  {(ga4.channels || []).slice(0, 12).map((c, i) => (
                    <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                      <td style={tdStyle}>{c.sessionDefaultChannelGroup}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{fmt(c.sessions)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{fmt(c.totalUsers)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{c.bounceRate != null ? fmtPct(c.bounceRate * 100) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden', flex: '1 1 360px' }}>
              <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #f1f5f9', fontWeight: 700, fontSize: '0.9rem', color: '#0f172a' }}>Top Organic Landing Pages</div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>
                  <th style={thStyle}>Page</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Sessions</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Bounce</th>
                </tr></thead>
                <tbody>
                  {(ga4.organic_landing_pages || []).slice(0, 15).map((p, i) => (
                    <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                      <td style={{ ...tdStyle, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.landingPage}>
                        {p.landingPage}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{fmt(p.sessions)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{p.bounceRate != null ? fmtPct(p.bounceRate * 100) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* AI Visibility */}
      {hasAi && (
        <>
          <SectionLabel>AI Visibility — {ai.domain}</SectionLabel>
          <div style={{ fontSize: '0.82rem', color: '#64748b', marginBottom: '0.75rem' }}>
            Checked {aiTotal} queries · {aiCited} citations · {aiMentioned} mentions · last checked {new Date(ai.fetched_at).toLocaleDateString()}
          </div>
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>
                <th style={thStyle}>Query</th>
                <th style={thStyle}>Platform</th>
                <th style={thStyle}>Result</th>
              </tr></thead>
              <tbody>
                {(ai.results || []).map((r, i) => (
                  <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                    <td style={{ ...tdStyle, maxWidth: 380 }}>{r.query}</td>
                    <td style={tdStyle}>{r.platform}</td>
                    <td style={tdStyle}>
                      {r.error
                        ? <Badge color="gray">Error</Badge>
                        : r.simaroa_cited
                          ? <Badge color="green">✅ Cited</Badge>
                          : r.simaroa_mentioned
                            ? <Badge color="blue">💬 Mentioned</Badge>
                            : <Badge color="gray">Not found</Badge>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {!hasAi && (
        <div style={{ marginTop: '1.75rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '1.25rem 1.5rem' }}>
          <div style={{ fontWeight: 700, color: '#334155', marginBottom: '0.3rem' }}>🤖 AI Visibility not checked yet</div>
          <div style={{ fontSize: '0.85rem', color: '#64748b' }}>
            Click <strong>Check AI Visibility</strong> above. Checks 8 Swedish NIS2 queries to see if nis2klar.se is mentioned by Claude or Perplexity.
          </div>
        </div>
      )}

    </div>
  );
}
