import React, { useEffect, useState, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';

const COUNTIES = ['Stockholm','Uppsala','Södermanland','Östergötland','Jönköping','Kronoberg','Kalmar','Gotland','Blekinge','Skåne','Halland','Västra Götaland','Värmland','Örebro','Västmanland','Dalarna','Gävleborg','Västernorrland','Jämtland','Västerbotten','Norrbotten'];
const EMPLOYEE_RANGES = ['1-9','10-49','50-99','100-199','200-499','500+'];
const SCORE_LABELS = [{ value: 'hot', label: '🔴 Hot' }, { value: 'warm', label: '🟡 Warm' }, { value: 'cold', label: '🔵 Cold' }];
const STATUSES = [
  { value: 'new', label: 'New' }, { value: 'contacted', label: 'Contacted' },
  { value: 'qualified', label: 'Qualified' }, { value: 'rejected', label: 'Rejected' }
];

export default function Leads() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [leads, setLeads] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  // Bulk selection state
  const [selected, setSelected] = useState(new Set());
  const [bulkStatus, setBulkStatus] = useState('');
  const [bulkSequenceId, setBulkSequenceId] = useState('');
  const [sequences, setSequences] = useState([]);
  const [bulkMsg, setBulkMsg] = useState('');
  const [bulkLoading, setBulkLoading] = useState(false);

  const filters = {
    search: searchParams.get('search') || '',
    score_label: searchParams.get('score_label') || '',
    county: searchParams.get('county') || '',
    nace: searchParams.get('nace') || '',
    employees: searchParams.get('employees') || '',
    nis2: searchParams.get('nis2') || '',
    has_website: searchParams.get('has_website') || '',
    status: searchParams.get('status') || '',
  };

  const setFilter = (key, val) => {
    const next = new URLSearchParams(searchParams);
    if (val) next.set(key, val); else next.delete(key);
    setSearchParams(next);
    setPage(1);
    setSelected(new Set());
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

  // Load sequences for bulk enroll dropdown
  useEffect(() => {
    api.get('/sequences').then(r => setSequences(r.data.sequences || [])).catch(console.error);
  }, []);

  // Export CSV — fetch with auth header, then trigger browser download
  async function handleExport(idsOverride) {
    const params = new URLSearchParams();
    if (idsOverride && idsOverride.length) {
      params.set('ids', idsOverride.join(','));
    } else {
      Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v); });
    }
    const token = localStorage.getItem('ht_token');
    const res = await fetch(`/api/leads/export?${params}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) { console.error('Export failed'); return; }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const today = new Date().toISOString().split('T')[0];
    a.href = url;
    a.download = `leads_export_${today}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Checkbox logic
  const allSelected = leads.length > 0 && leads.every(l => selected.has(l.id));
  function toggleAll() {
    if (allSelected) {
      setSelected(prev => { const n = new Set(prev); leads.forEach(l => n.delete(l.id)); return n; });
    } else {
      setSelected(prev => { const n = new Set(prev); leads.forEach(l => n.add(l.id)); return n; });
    }
  }
  function toggleOne(id) {
    setSelected(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  async function applyBulkStatus() {
    if (!bulkStatus || !selected.size) return;
    setBulkLoading(true);
    setBulkMsg('');
    try {
      const { data } = await api.post('/leads/bulk-status', { ids: [...selected], status: bulkStatus });
      setBulkMsg(`Updated ${data.updated} leads to "${bulkStatus}"`);
      setSelected(new Set());
      setBulkStatus('');
      fetchLeads();
    } catch (err) {
      setBulkMsg('Error: ' + (err.response?.data?.error || err.message));
    } finally { setBulkLoading(false); }
  }

  async function applyBulkEnroll() {
    if (!bulkSequenceId || !selected.size) return;
    setBulkLoading(true);
    setBulkMsg('');
    try {
      const { data } = await api.post('/leads/bulk-enroll', { ids: [...selected], sequence_id: parseInt(bulkSequenceId) });
      setBulkMsg(`Enrolled ${data.enrolled} leads (${data.skipped} already enrolled)`);
      setSelected(new Set());
      setBulkSequenceId('');
    } catch (err) {
      setBulkMsg('Error: ' + (err.response?.data?.error || err.message));
    } finally { setBulkLoading(false); }
  }

  return (
    <div className="p-8 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">Leads</h1>
          <p className="text-slate-500 text-sm">{total.toLocaleString()} companies in database</p>
        </div>
        <button
          onClick={() => handleExport()}
          className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-slate-300 hover:text-slate-100 hover:bg-white/10 text-sm transition-colors"
        >
          Export {total > 0 ? `${total.toLocaleString()} leads` : ''} CSV
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <input
          type="text" placeholder="Search company, city, email..."
          value={filters.search}
          onChange={e => setFilter('search', e.target.value)}
          className="bg-navy-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 w-64"
        />
        {[
          { key: 'score_label', opts: SCORE_LABELS, placeholder: 'Score level' },
          { key: 'county', opts: COUNTIES.map(c => ({ value: c, label: c })), placeholder: 'County' },
          { key: 'employees', opts: EMPLOYEE_RANGES.map(r => ({ value: r, label: r })), placeholder: 'Employees' },
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
        <button
          onClick={() => setFilter('has_website', filters.has_website ? '' : 'true')}
          className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
            filters.has_website ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-400' : 'bg-navy-800 border-white/10 text-slate-400 hover:text-slate-200'
          }`}
        >
          Has website
        </button>
        {filters.nace && (
          <button
            onClick={() => setFilter('nace', '')}
            className="px-3 py-2 rounded-lg text-sm font-medium border bg-cyan-500/20 border-cyan-500/40 text-cyan-400 flex items-center gap-1.5"
          >
            Sector: {filters.nace}
            <span className="text-cyan-300 hover:text-white">×</span>
          </button>
        )}
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="bg-navy-800 border border-cyan-500/30 rounded-xl px-4 py-3 flex flex-wrap items-center gap-3">
          <span className="text-sm text-cyan-400 font-medium">{selected.size} selected</span>
          <div className="flex items-center gap-2">
            <select
              value={bulkStatus}
              onChange={e => setBulkStatus(e.target.value)}
              className="bg-navy-700 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-cyan-500"
            >
              <option value="">Change status...</option>
              {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <button
              onClick={applyBulkStatus}
              disabled={!bulkStatus || bulkLoading}
              className="px-3 py-1.5 text-xs rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white transition-colors disabled:opacity-40"
            >
              Apply
            </button>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={bulkSequenceId}
              onChange={e => setBulkSequenceId(e.target.value)}
              className="bg-navy-700 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-cyan-500"
            >
              <option value="">Enroll in sequence...</option>
              {sequences.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <button
              onClick={applyBulkEnroll}
              disabled={!bulkSequenceId || bulkLoading}
              className="px-3 py-1.5 text-xs rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white transition-colors disabled:opacity-40"
            >
              Enroll
            </button>
          </div>
          <button
            onClick={() => handleExport([...selected])}
            className="px-3 py-1.5 text-xs rounded-lg bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 transition-colors"
          >
            Export selected
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors ml-auto"
          >
            Clear
          </button>
          {bulkMsg && (
            <span className={`text-xs w-full ${bulkMsg.startsWith('Error') ? 'text-red-400' : 'text-emerald-400'}`}>
              {bulkMsg}
            </span>
          )}
        </div>
      )}

      {/* Table */}
      <div className="bg-navy-800 rounded-xl border border-white/10 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left">
              <th className="px-4 py-3 w-8">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  className="w-4 h-4 accent-cyan-500 cursor-pointer"
                />
              </th>
              {['Score','Company','City / County','Emp.','Sector','NIS2','Data','Status'].map(h => (
                <th key={h} className="px-4 py-3 text-xs text-slate-500 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-500">Loading...</td></tr>
            ) : leads.length === 0 ? (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-500">No leads found</td></tr>
            ) : leads.map(lead => (
              <tr key={lead.id} className={`border-b border-white/5 hover:bg-white/3 transition-colors ${selected.has(lead.id) ? 'bg-cyan-500/5' : ''}`}>
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selected.has(lead.id)}
                    onChange={() => toggleOne(lead.id)}
                    className="w-4 h-4 accent-cyan-500 cursor-pointer"
                  />
                </td>
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
                  {lead.intent_signal && (
                    <span title="Hiring for security/NIS2 roles — buying signal" className="ml-1.5 text-xs bg-orange-500/20 text-orange-400 px-1.5 py-0.5 rounded-full">🎯 hiring</span>
                  )}
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
                  <div className="flex items-center gap-1.5">
                    <span title={lead.website || 'No website'} className={lead.website ? 'text-emerald-400' : 'text-slate-700'}>🌐</span>
                    <span title={lead.email || 'No email'} className={lead.email ? 'text-emerald-400' : 'text-slate-700'}>📧</span>
                    <span title={lead.linkedin_url || 'No LinkedIn'} className={lead.linkedin_url ? 'text-emerald-400' : 'text-slate-700'}>💼</span>
                    <span title={lead.phone || 'No phone'} className={lead.phone ? 'text-emerald-400' : 'text-slate-700'}>📞</span>
                  </div>
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
            <span>{Math.min((page - 1) * 50 + 1, total)}–{Math.min(page * 50, total)} of {total}</span>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="px-3 py-1 rounded bg-white/5 disabled:opacity-40 hover:bg-white/10">← Previous</button>
              <button onClick={() => setPage(p => p + 1)} disabled={page * 50 >= total}
                className="px-3 py-1 rounded bg-white/5 disabled:opacity-40 hover:bg-white/10">Next →</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
