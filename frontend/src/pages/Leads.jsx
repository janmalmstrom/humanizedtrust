import React, { useEffect, useState, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';

const COUNTIES = ['Stockholm','Västra Götaland','Skåne','Uppsala','Östergötland','Jönköping','Örebro','Halland','Gävleborg','Dalarna'];
const EMPLOYEE_RANGES = ['1-9','10-49','50-99','100-199','200-499','500+'];
const SCORE_LABELS = [{ value: 'hot', label: '🔴 Het' }, { value: 'warm', label: '🟡 Varm' }, { value: 'cold', label: '🔵 Kall' }];
const STATUSES = [
  { value: 'new', label: 'Ny' }, { value: 'contacted', label: 'Kontaktad' },
  { value: 'qualified', label: 'Kvalificerad' }, { value: 'rejected', label: 'Avvisad' }
];

export default function Leads() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [leads, setLeads] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  const filters = {
    search: searchParams.get('search') || '',
    score_label: searchParams.get('score_label') || '',
    county: searchParams.get('county') || '',
    employees: searchParams.get('employees') || '',
    nis2: searchParams.get('nis2') || '',
    status: searchParams.get('status') || '',
  };

  const setFilter = (key, val) => {
    const next = new URLSearchParams(searchParams);
    if (val) next.set(key, val); else next.delete(key);
    setSearchParams(next);
    setPage(1);
  };

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page, limit: 50, sort: 'score', dir: 'desc' });
      Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v); });
      const { data } = await api.get(`/leads?${params}`);
      setLeads(data.leads);
      setTotal(data.total);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [page, searchParams]);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  return (
    <div className="p-8 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">Leads</h1>
          <p className="text-slate-500 text-sm">{total.toLocaleString()} företag i databasen</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <input
          type="text" placeholder="Sök företag, stad, e-post..."
          value={filters.search}
          onChange={e => setFilter('search', e.target.value)}
          className="bg-navy-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 w-64"
        />
        {[
          { key: 'score_label', opts: SCORE_LABELS, placeholder: 'Poängnivå' },
          { key: 'county', opts: COUNTIES.map(c => ({ value: c, label: c })), placeholder: 'Län' },
          { key: 'employees', opts: EMPLOYEE_RANGES.map(r => ({ value: r, label: r })), placeholder: 'Anställda' },
          { key: 'status', opts: STATUSES, placeholder: 'Status' },
        ].map(f => (
          <select
            key={f.key}
            value={filters[f.key]}
            onChange={e => setFilter(f.key, e.target.value)}
            className="bg-navy-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500"
          >
            <option value="">{f.placeholder}</option>
            {f.opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        ))}
        <button
          onClick={() => setFilter('nis2', filters.nis2 ? '' : 'true')}
          className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
            filters.nis2 ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-400' : 'bg-navy-800 border-white/10 text-slate-400 hover:text-slate-200'
          }`}
        >
          NIS2 only
        </button>
      </div>

      {/* Table */}
      <div className="bg-navy-800 rounded-xl border border-white/10 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left">
              {['Poäng','Företag','Ort / Län','Anst.','Sektor','NIS2','E-post','Status'].map(h => (
                <th key={h} className="px-4 py-3 text-xs text-slate-500 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-500">Laddar...</td></tr>
            ) : leads.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-500">Inga leads hittades</td></tr>
            ) : leads.map(lead => (
              <tr key={lead.id} className="border-b border-white/5 hover:bg-white/3 transition-colors">
                <td className="px-4 py-3">
                  <span className={`font-bold text-sm ${
                    lead.score_label === 'hot' ? 'text-red-400' :
                    lead.score_label === 'warm' ? 'text-amber-400' : 'text-blue-400'
                  }`}>{lead.score ?? '—'}</span>
                </td>
                <td className="px-4 py-3">
                  <Link to={`/leads/${lead.id}`} className="text-slate-200 hover:text-cyan-400 font-medium transition-colors">
                    {lead.company_name}
                  </Link>
                  {lead.website && <div className="text-xs text-slate-600 truncate max-w-[180px]">{lead.website}</div>}
                </td>
                <td className="px-4 py-3 text-slate-400 text-xs">
                  <div>{lead.city || '—'}</div>
                  <div className="text-slate-600">{lead.county || ''}</div>
                </td>
                <td className="px-4 py-3 text-slate-400 text-xs">{lead.employee_range || '—'}</td>
                <td className="px-4 py-3 text-slate-500 font-mono text-xs">{lead.nace_code || '—'}</td>
                <td className="px-4 py-3">
                  {lead.nis2_registered
                    ? <span className="text-xs bg-cyan-500/15 text-cyan-400 px-2 py-0.5 rounded-full">NIS2</span>
                    : '—'}
                </td>
                <td className="px-4 py-3">
                  {lead.email
                    ? <span className="text-emerald-400 text-xs" title={lead.email}>✓</span>
                    : <span className="text-slate-600">—</span>}
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    lead.review_status === 'qualified' ? 'bg-emerald-500/15 text-emerald-400' :
                    lead.review_status === 'contacted' ? 'bg-amber-500/15 text-amber-400' :
                    lead.review_status === 'rejected' ? 'bg-red-500/15 text-red-400' :
                    'bg-white/5 text-slate-500'
                  }`}>{lead.review_status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Pagination */}
        {total > 50 && (
          <div className="px-4 py-3 border-t border-white/10 flex items-center justify-between text-sm text-slate-400">
            <span>{Math.min((page - 1) * 50 + 1, total)}–{Math.min(page * 50, total)} av {total}</span>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="px-3 py-1 rounded bg-white/5 disabled:opacity-40 hover:bg-white/10">← Föregående</button>
              <button onClick={() => setPage(p => p + 1)} disabled={page * 50 >= total}
                className="px-3 py-1 rounded bg-white/5 disabled:opacity-40 hover:bg-white/10">Nästa →</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
