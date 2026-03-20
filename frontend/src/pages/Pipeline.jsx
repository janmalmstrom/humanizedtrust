import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';

const COLUMNS = [
  { key: 'new',       label: 'New',       color: 'text-blue-400',    badge: 'bg-blue-500/20 text-blue-300',    border: 'border-blue-500/30' },
  { key: 'contacted', label: 'Contacted', color: 'text-amber-400',   badge: 'bg-amber-500/20 text-amber-300',  border: 'border-amber-500/30' },
  { key: 'qualified', label: 'Qualified', color: 'text-emerald-400', badge: 'bg-emerald-500/20 text-emerald-300', border: 'border-emerald-500/30' },
  { key: 'rejected',  label: 'Rejected',  color: 'text-red-400',     badge: 'bg-red-500/20 text-red-300',      border: 'border-red-500/30' },
  { key: 'customer',  label: 'Customer',  color: 'text-purple-400',  badge: 'bg-purple-500/20 text-purple-300', border: 'border-purple-500/30' },
];

function scoreBadge(lead) {
  if (lead.score_label === 'hot')  return 'bg-red-500/20 text-red-300';
  if (lead.score_label === 'warm') return 'bg-amber-500/20 text-amber-300';
  return 'bg-blue-500/20 text-blue-300';
}

function LeadCard({ lead, onMove, currentStatus }) {
  const [showMove, setShowMove] = useState(false);
  const others = COLUMNS.filter(c => c.key !== currentStatus);

  async function moveTo(newStatus) {
    setShowMove(false);
    await onMove(lead.id, newStatus);
  }

  return (
    <div className="bg-navy-800 border border-white/10 rounded-xl p-3 space-y-2 group">
      <div className="flex items-start justify-between gap-2">
        <Link
          to={`/leads/${lead.id}`}
          className="text-sm font-medium text-slate-200 hover:text-cyan-400 transition-colors leading-tight"
        >
          {lead.company_name}
        </Link>
        {lead.score != null && (
          <span className={`text-xs px-1.5 py-0.5 rounded font-semibold flex-shrink-0 ${scoreBadge(lead)}`}>
            {lead.score}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 text-xs text-slate-500 flex-wrap">
        {lead.city && <span>{lead.city}</span>}
        {lead.nace_code && <span className="font-mono">{lead.nace_code}</span>}
        {lead.nis2_registered && (
          <span className="bg-cyan-500/15 text-cyan-400 px-1.5 py-0.5 rounded">NIS2</span>
        )}
      </div>

      <div className="relative">
        <button
          onClick={() => setShowMove(v => !v)}
          className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
        >
          Move →
        </button>
        {showMove && (
          <div className="absolute left-0 top-6 z-10 bg-navy-700 border border-white/15 rounded-lg shadow-xl overflow-hidden min-w-[120px]">
            {others.map(col => (
              <button
                key={col.key}
                onClick={() => moveTo(col.key)}
                className={`block w-full text-left px-3 py-2 text-xs hover:bg-white/10 transition-colors ${col.color}`}
              >
                {col.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Pipeline() {
  const [columns, setColumns] = useState({});
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const results = await Promise.all(
        COLUMNS.map(col =>
          api.get(`/leads?status=${col.key}&limit=100&sort=score&dir=desc`)
            .then(r => ({ key: col.key, leads: r.data.leads }))
        )
      );
      const map = {};
      results.forEach(r => { map[r.key] = r.leads; });
      setColumns(map);
    } catch (err) {
      console.error('[pipeline] fetch error:', err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  async function handleMove(leadId, newStatus) {
    try {
      await api.patch(`/leads/${leadId}`, { review_status: newStatus });
      await fetchAll();
    } catch (err) {
      console.error('[pipeline] move error:', err.message);
    }
  }

  if (loading) return <div className="p-8 text-slate-400">Loading pipeline...</div>;

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-100">Pipeline</h1>
        <p className="text-slate-500 text-sm mt-0.5">Drag leads through your outreach pipeline</p>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4">
        {COLUMNS.map(col => {
          const leads = columns[col.key] || [];
          return (
            <div key={col.key} className="flex-shrink-0 w-64 flex flex-col gap-3">
              {/* Column header */}
              <div className={`flex items-center justify-between px-3 py-2 rounded-lg border ${col.border} bg-white/3`}>
                <span className={`text-sm font-semibold ${col.color}`}>{col.label}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${col.badge}`}>
                  {leads.length}
                </span>
              </div>

              {/* Cards */}
              <div className="flex flex-col gap-2 max-h-[calc(100vh-220px)] overflow-y-auto pr-0.5">
                {leads.length === 0 ? (
                  <div className="text-center py-8 text-slate-600 text-xs">No leads</div>
                ) : (
                  leads.map(lead => (
                    <LeadCard
                      key={lead.id}
                      lead={lead}
                      currentStatus={col.key}
                      onMove={handleMove}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
