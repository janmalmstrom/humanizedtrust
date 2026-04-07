import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';

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

export default function SEO() {
  const [data, setData]             = useState(null);
  const [loading, setLoading]       = useState(true);
  const [fetching, setFetching]     = useState(false);
  const [fetchMsg, setFetchMsg]     = useState('');
  const [generating, setGenerating] = useState(false);
  const [gscTab, setGscTab]         = useState('queries');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/seo/data');
      setData(res.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleFetch = async (sources) => {
    setFetching(true);
    setFetchMsg('');
    try {
      const res = await api.post('/seo/fetch', { sources });
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
        <div>
          <h2 style={{ fontSize: '2rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>NIS2Klar SEO</h2>
          <div style={{ fontSize: '0.82rem', color: '#94a3b8', marginTop: '0.2rem' }}>
            nis2klar.se ·{' '}
            {hasGsc ? `GSC: ${gsc.date_range?.start} → ${gsc.date_range?.end}` : 'No GSC data yet'}
            {hasGa4 ? ` · GA4: ${ga4.date_range?.start} → ${ga4.date_range?.end}` : ''}
          </div>
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
                const res = await api.post('/seo/report', {});
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
            href="/api/seo/report/view"
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

          {gscTab === 'queries' && (
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>
                  <th style={thStyle}>Query</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Impressions</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Clicks</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>CTR</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Position</th>
                </tr></thead>
                <tbody>
                  {(gsc.queries || []).slice(0, 50).map((q, i) => (
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
          )}

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
