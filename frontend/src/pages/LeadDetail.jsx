import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api';

const STATUSES = ['new','contacted','qualified','rejected','customer'];
const NIS2_SECTORS = ['energy','transport','health','digital_infra','finance','water','public_admin','space'];

// Nomad Cyber pitch angles based on sector
function getPitchAngle(lead) {
  if (lead.nis2_registered) {
    const sector = lead.nis2_sector;
    if (sector === 'health') return `${lead.company_name} faller under NIS2 via hälsosektorn. Patientdatalagen + GDPR + NIS2 = trippelkrav. Nomad's Purview-governance löser deidentifiering av patientdata för säkra AI-flöden.`;
    if (sector === 'energy' || sector === 'transport') return `${lead.company_name} är NIS2-registrerat i ${sector}-sektorn. Whole-entity-principen kräver att hela IT-miljön säkras — inklusive Copilot. SOCaaS via Chorus-partnerskapet.`;
    if (sector === 'finance') return `${lead.company_name} är NIS2-registrerat. Finanssektorn under hårdaste granskning 2026. Ledningen bär personligt ansvar. Nomad's Readiness Assessment på 2 veckor.`;
    return `${lead.company_name} är NIS2-registrerat. Ledningen bär nu personligt ansvar för brister. Nomad erbjuder en Readiness Assessment för att kartlägga gapet.`;
  }
  if (lead.nace_code && (lead.nace_code.startsWith('25') || lead.nace_code.startsWith('28') || lead.nace_code.startsWith('29'))) {
    return `${lead.company_name} är tillverkningsbolag med OT-miljö. 57% av Nordens industriella kontrollsystem finns i Sverige. Behovet att säkra fabriken simultaneously med Copilot-utrullning är akut.`;
  }
  if (lead.employee_range && (lead.employee_range.includes('50') || lead.employee_range.includes('100'))) {
    return `${lead.company_name} är i SME-segmentet (50-249 anst.) — det segment med snabbast AI-adoption men störst kompetensgap. "Governance-as-a-Service": stoppa dataöverspridning med Purview.`;
  }
  return `${lead.company_name} — identifiera om de har Copilot-licenser men saknar säkerhetsstyrning. 74.7% av svenska bolag anger "brist på intern expertis" som hinder.`;
}

export default function LeadDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [lead, setLead] = useState(null);
  const [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState('new');

  useEffect(() => {
    api.get(`/leads/${id}`).then(({ data }) => {
      setLead(data.lead);
      setNotes(data.lead.notes || '');
      setStatus(data.lead.review_status || 'new');
    }).catch(console.error);
  }, [id]);

  async function save() {
    setSaving(true);
    try {
      const angle = getPitchAngle(lead);
      await api.patch(`/leads/${id}`, { notes, review_status: status, outreach_angle: angle });
      setLead(l => ({ ...l, notes, review_status: status, outreach_angle: angle }));
    } finally { setSaving(false); }
  }

  async function logOutreach(channel) {
    await api.post(`/leads/${id}/outreach`, { channel, message: lead.outreach_angle });
    setStatus('contacted');
    setLead(l => ({ ...l, review_status: 'contacted' }));
  }

  if (!lead) return <div className="p-8 text-slate-400">Laddar...</div>;

  const pitchAngle = getPitchAngle(lead);

  return (
    <div className="p-8 max-w-4xl space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <button onClick={() => navigate('/leads')} className="text-slate-500 hover:text-slate-300 text-sm mb-2 transition-colors">
            ← Tillbaka
          </button>
          <h1 className="text-2xl font-bold text-slate-100">{lead.company_name}</h1>
          <div className="flex items-center gap-3 mt-1">
            <span className={`text-sm font-semibold ${
              lead.score_label === 'hot' ? 'text-red-400' :
              lead.score_label === 'warm' ? 'text-amber-400' : 'text-blue-400'
            }`}>Poäng: {lead.score ?? '—'}</span>
            {lead.nis2_registered && <span className="text-xs bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 px-2 py-0.5 rounded-full">NIS2-registrerat</span>}
            <span className="text-xs text-slate-500">{lead.org_nr}</span>
          </div>
        </div>
        <div className="flex gap-2">
          {['linkedin','email','phone'].map(ch => (
            <button key={ch} onClick={() => logOutreach(ch)}
              className="px-3 py-1.5 text-xs rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white transition-colors capitalize">
              {ch === 'linkedin' ? 'LinkedIn' : ch === 'email' ? 'E-post' : 'Telefon'}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Company info */}
        <div className="bg-navy-800 rounded-xl border border-white/10 p-5 space-y-3">
          <h2 className="text-sm font-semibold text-slate-200">Företagsinformation</h2>
          {[
            ['Webbplats', lead.website ? <a href={lead.website} target="_blank" rel="noreferrer" className="text-cyan-400 hover:underline">{lead.website}</a> : '—'],
            ['E-post', lead.email || '—'],
            ['Telefon', lead.phone || '—'],
            ['Adress', [lead.address, lead.postal_code, lead.city].filter(Boolean).join(', ') || '—'],
            ['Län', lead.county || '—'],
            ['Anställda', lead.employee_range || '—'],
            ['Omsättning', lead.revenue_range || '—'],
            ['SNI/NACE', lead.nace_code ? `${lead.nace_code} — ${lead.nace_description || ''}` : '—'],
            ['NIS2-sektor', lead.nis2_sector || '—'],
            ['LinkedIn', lead.linkedin_url ? <a href={lead.linkedin_url} target="_blank" rel="noreferrer" className="text-cyan-400 hover:underline">Profil</a> : '—'],
          ].map(([label, val]) => (
            <div key={label} className="flex justify-between text-sm">
              <span className="text-slate-500">{label}</span>
              <span className="text-slate-300 text-right max-w-[60%]">{val}</span>
            </div>
          ))}
        </div>

        {/* Score breakdown */}
        <div className="space-y-4">
          <div className="bg-navy-800 rounded-xl border border-white/10 p-5">
            <h2 className="text-sm font-semibold text-slate-200 mb-3">Poängfördelning</h2>
            {lead.score_breakdown && Object.entries(lead.score_breakdown).map(([group, items]) => (
              Object.keys(items).length > 0 ? (
                <div key={group} className="mb-2">
                  <div className="text-xs text-slate-600 uppercase mb-1">{group}</div>
                  {Object.entries(items).map(([key, val]) => (
                    <div key={key} className="flex justify-between text-xs py-0.5">
                      <span className="text-slate-400">{key}</span>
                      <span className={val > 0 ? 'text-emerald-400' : 'text-red-400'}>{val > 0 ? `+${val}` : val}</span>
                    </div>
                  ))}
                </div>
              ) : null
            ))}
          </div>

          {/* Status */}
          <div className="bg-navy-800 rounded-xl border border-white/10 p-5 space-y-3">
            <h2 className="text-sm font-semibold text-slate-200">Status</h2>
            <select value={status} onChange={e => setStatus(e.target.value)}
              className="w-full bg-navy-700 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200">
              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Nomad pitch angle */}
      <div className="bg-cyan-500/5 border border-cyan-500/20 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-cyan-400 mb-2">Nomad Cyber — Pitch Angle</h2>
        <p className="text-sm text-slate-300 leading-relaxed">{lead.outreach_angle || pitchAngle}</p>
      </div>

      {/* Notes */}
      <div className="bg-navy-800 rounded-xl border border-white/10 p-5 space-y-3">
        <h2 className="text-sm font-semibold text-slate-200">Anteckningar</h2>
        <textarea
          value={notes} onChange={e => setNotes(e.target.value)}
          rows={4} placeholder="Lägg till anteckningar om prospektet..."
          className="w-full bg-navy-700 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 resize-none focus:outline-none focus:border-cyan-500"
        />
        <button onClick={save} disabled={saving}
          className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-sm rounded-lg transition-colors disabled:opacity-50">
          {saving ? 'Sparar...' : 'Spara'}
        </button>
      </div>
    </div>
  );
}
