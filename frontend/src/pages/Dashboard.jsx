import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { Link } from 'react-router-dom';

const LABEL_CONFIG = {
  hot:  { label: 'Heta leads', color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20' },
  warm: { label: 'Varma leads', color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },
  cold: { label: 'Kalla leads', color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' },
};

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [hotLeads, setHotLeads] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/leads/stats'),
      api.get('/leads?score_label=hot&limit=8&sort=score&dir=desc')
    ]).then(([s, l]) => {
      setStats(s.data);
      setHotLeads(l.data.leads);
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-8 text-slate-400">Laddar...</div>;
  if (!stats) return null;

  const ov = stats.overview;
  const labelMap = {};
  stats.by_label.forEach(r => { labelMap[r.score_label] = parseInt(r.count); });

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-100">Dashboard</h1>
        <p className="text-slate-500 text-sm mt-0.5">Nomad Cyber — Swedish AI/NIS2 outreach pipeline</p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Totalt leads', value: ov.total, sub: `${ov.has_email} med e-post` },
          { label: 'NIS2-registrerade', value: ov.nis2_count, sub: 'Lagkrav = hög prioritet', highlight: true },
          { label: 'Kontaktade', value: ov.contacted, sub: `${ov.qualified} kvalificerade` },
          { label: 'Genomsnittspoäng', value: ov.avg_score || 0, sub: 'av 100' },
        ].map(kpi => (
          <div key={kpi.label} className={`rounded-xl border p-5 ${kpi.highlight ? 'border-cyan-500/30 bg-cyan-500/5' : 'border-white/10 bg-navy-800'}`}>
            <div className="text-2xl font-bold text-slate-100">{kpi.value}</div>
            <div className={`text-sm font-medium mt-1 ${kpi.highlight ? 'text-cyan-400' : 'text-slate-300'}`}>{kpi.label}</div>
            <div className="text-xs text-slate-500 mt-0.5">{kpi.sub}</div>
          </div>
        ))}
      </div>

      {/* Score distribution */}
      <div className="grid grid-cols-3 gap-4">
        {['hot','warm','cold'].map(label => {
          const cfg = LABEL_CONFIG[label];
          return (
            <div key={label} className={`rounded-xl border p-5 ${cfg.bg}`}>
              <div className={`text-2xl font-bold ${cfg.color}`}>{labelMap[label] || 0}</div>
              <div className="text-sm text-slate-300 mt-1">{cfg.label}</div>
              <Link to={`/leads?score_label=${label}`} className="text-xs text-slate-500 hover:text-slate-300 mt-1 inline-block">
                Visa alla →
              </Link>
            </div>
          );
        })}
      </div>

      {/* Hot leads table */}
      {hotLeads.length > 0 && (
        <div className="bg-navy-800 rounded-xl border border-white/10 overflow-hidden">
          <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-200">Heta leads att kontakta</h2>
            <Link to="/leads?score_label=hot" className="text-xs text-cyan-400 hover:text-cyan-300">Visa alla</Link>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5">
                {['Företag','Ort','Anst.','NACE','NIS2','Poäng','E-post'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs text-slate-500 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {hotLeads.map(lead => (
                <tr key={lead.id} className="border-b border-white/5 hover:bg-white/3 transition-colors">
                  <td className="px-4 py-3">
                    <Link to={`/leads/${lead.id}`} className="text-slate-200 hover:text-cyan-400 font-medium transition-colors">
                      {lead.company_name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-400">{lead.city || '—'}</td>
                  <td className="px-4 py-3 text-slate-400">{lead.employee_range || '—'}</td>
                  <td className="px-4 py-3 text-slate-500 font-mono text-xs">{lead.nace_code || '—'}</td>
                  <td className="px-4 py-3">
                    {lead.nis2_registered
                      ? <span className="text-xs bg-cyan-500/15 text-cyan-400 px-2 py-0.5 rounded-full">NIS2</span>
                      : <span className="text-slate-600">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-red-400 font-semibold">{lead.score}</span>
                  </td>
                  <td className="px-4 py-3">
                    {lead.email
                      ? <span className="text-emerald-400 text-xs">✓</span>
                      : <span className="text-slate-600 text-xs">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* County + NACE breakdown */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-navy-800 rounded-xl border border-white/10 p-5">
          <h3 className="text-sm font-semibold text-slate-200 mb-3">Leads per Län</h3>
          <div className="space-y-2">
            {stats.by_county.slice(0, 6).map(r => (
              <div key={r.county} className="flex justify-between text-sm">
                <span className="text-slate-400">{r.county}</span>
                <span className="text-slate-300 font-medium">{r.count}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-navy-800 rounded-xl border border-white/10 p-5">
          <h3 className="text-sm font-semibold text-slate-200 mb-3">Leads per Sektor (SNI)</h3>
          <div className="space-y-2">
            {stats.by_nace.slice(0, 6).map(r => (
              <div key={r.sector} className="flex justify-between text-sm">
                <span className="text-slate-400 font-mono">{r.sector}</span>
                <span className="text-slate-300 font-medium">{r.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
