import React, { useEffect, useState } from 'react';
import { api } from '../api';

function StatCard({ label, value, sub, subColor = 'text-slate-500' }) {
  return (
    <div className="bg-navy-800 rounded-xl border border-white/10 p-5">
      <div className="text-xs text-slate-500 font-medium uppercase tracking-wide mb-1">{label}</div>
      <div className="text-2xl font-bold text-slate-100">{value ?? '—'}</div>
      {sub && <div className={`text-xs mt-1 ${subColor}`}>{sub}</div>}
    </div>
  );
}

function pct(num, total) {
  if (!total || !num) return '0%';
  return `${((parseInt(num) / parseInt(total)) * 100).toFixed(1)}%`;
}

function formatDate(d) {
  if (!d) return 'Never';
  return new Date(d).toLocaleString('en-SE', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

export default function Enrichment() {
  const [stats, setStats] = useState(null);
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [triggerMsg, setTriggerMsg] = useState('');

  async function fetchStats() {
    setLoading(true);
    try {
      const { data } = await api.get('/enrichment/stats');
      setStats(data.stats);
      setRecent(data.recent_activity || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }

  useEffect(() => { fetchStats(); }, []);

  async function triggerEnrichment() {
    setTriggering(true);
    setTriggerMsg('');
    try {
      const { data } = await api.post('/enrichment/trigger', {});
      setTriggerMsg(data.message);
    } catch (err) {
      setTriggerMsg('Error: ' + (err.response?.data?.error || err.message));
    } finally { setTriggering(false); }
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">Enrichment</h1>
          <p className="text-slate-500 text-sm">Pipeline status and data coverage</p>
        </div>
        <button
          onClick={fetchStats}
          className="px-3 py-1.5 text-xs rounded-lg bg-white/5 border border-white/10 text-slate-400 hover:text-slate-200 transition-colors"
        >
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="text-slate-500 text-sm">Loading stats...</div>
      ) : stats ? (
        <>
          {/* Stats cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
            <StatCard
              label="Total leads"
              value={parseInt(stats.total).toLocaleString()}
              sub={`${parseInt(stats.ever_enriched).toLocaleString()} ever enriched`}
            />
            <StatCard
              label="Has email"
              value={parseInt(stats.has_email).toLocaleString()}
              sub={pct(stats.has_email, stats.total) + ' of total'}
              subColor="text-emerald-400"
            />
            <StatCard
              label="Has website"
              value={parseInt(stats.has_website).toLocaleString()}
              sub={pct(stats.has_website, stats.total) + ' of total'}
              subColor="text-cyan-400"
            />
            <StatCard
              label="Has LinkedIn"
              value={parseInt(stats.has_linkedin).toLocaleString()}
              sub={pct(stats.has_linkedin, stats.total) + ' of total'}
              subColor="text-blue-400"
            />
            <StatCard
              label="Has phone"
              value={parseInt(stats.has_phone).toLocaleString()}
              sub={pct(stats.has_phone, stats.total) + ' of total'}
              subColor="text-slate-400"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Email status breakdown */}
            <div className="bg-navy-800 rounded-xl border border-white/10 p-5 space-y-3">
              <h2 className="text-sm font-semibold text-slate-200">Email status breakdown</h2>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-400" />
                    <span className="text-sm text-slate-300">Verified</span>
                  </div>
                  <span className="text-sm text-slate-200 font-medium">
                    {parseInt(stats.verified_emails).toLocaleString()}
                    <span className="text-slate-500 font-normal ml-2">{pct(stats.verified_emails, stats.has_email)} of emails</span>
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-amber-400" />
                    <span className="text-sm text-slate-300">Guessed</span>
                  </div>
                  <span className="text-sm text-slate-200 font-medium">
                    {parseInt(stats.guessed_emails).toLocaleString()}
                    <span className="text-slate-500 font-normal ml-2">{pct(stats.guessed_emails, stats.has_email)} of emails</span>
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-slate-600" />
                    <span className="text-sm text-slate-300">No email</span>
                  </div>
                  <span className="text-sm text-slate-200 font-medium">
                    {(parseInt(stats.total) - parseInt(stats.has_email)).toLocaleString()}
                    <span className="text-slate-500 font-normal ml-2">{pct(parseInt(stats.total) - parseInt(stats.has_email), stats.total)} of total</span>
                  </span>
                </div>
              </div>

              {/* Coverage bar */}
              <div className="mt-3">
                <div className="text-xs text-slate-500 mb-1.5">Email coverage</div>
                <div className="h-2 bg-navy-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full"
                    style={{ width: pct(stats.has_email, stats.total) }}
                  />
                </div>
              </div>
            </div>

            {/* Nightly pipeline */}
            <div className="bg-navy-800 rounded-xl border border-white/10 p-5 space-y-4">
              <h2 className="text-sm font-semibold text-slate-200">Nightly pipeline</h2>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Schedule</span>
                  <span className="text-slate-300 font-mono text-xs">06:00 UTC (08:00 CET)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Last run</span>
                  <span className="text-slate-300 text-xs">{formatDate(stats.last_enriched)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Steps</span>
                  <span className="text-slate-400 text-xs">Website crawl → LinkedIn → SMTP permutation → Re-score</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Batch size</span>
                  <span className="text-slate-300">20 leads / run</span>
                </div>
              </div>

              <div className="border-t border-white/10 pt-4 space-y-2">
                <button
                  onClick={triggerEnrichment}
                  disabled={triggering}
                  className="w-full px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {triggering ? 'Starting...' : 'Trigger enrichment now'}
                </button>
                {triggerMsg && (
                  <p className={`text-xs text-center ${triggerMsg.startsWith('Error') ? 'text-red-400' : 'text-emerald-400'}`}>
                    {triggerMsg}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Recent enrichment activity */}
          {recent.length > 0 && (
            <div className="bg-navy-800 rounded-xl border border-white/10 p-5 space-y-3">
              <h2 className="text-sm font-semibold text-slate-200">Recent enrichment activity</h2>
              <div className="space-y-2">
                {recent.map(a => (
                  <div key={a.id} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0 text-sm">
                    <div>
                      <span className="text-slate-300">{a.title || a.type}</span>
                      {a.body && <span className="text-slate-500 ml-2 text-xs">{a.body}</span>}
                    </div>
                    <span className="text-xs text-slate-600 flex-shrink-0 ml-4">{formatDate(a.created_at)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="text-red-400 text-sm">Failed to load enrichment stats.</div>
      )}
    </div>
  );
}
