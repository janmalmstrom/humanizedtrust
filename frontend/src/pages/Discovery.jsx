import React, { useState } from 'react';
import { api } from '../api';

const SNI_GROUPS = [
  { label: 'Tillverkning (25–33)', value: '25,26,27,28,29,30,31,32,33', key: 'manufacturing' },
  { label: 'Hälso- & sjukvård (86–88)', value: '86,87,88', key: 'healthcare' },
  { label: 'Finansiella tjänster (64–66)', value: '64,65,66', key: 'financial' },
  { label: 'Energi (35–36)', value: '35,36', key: 'energy' },
  { label: 'Transport & logistik (49–53)', value: '49,50,51,52,53', key: 'transport' },
  { label: 'IT-tjänster (62–63)', value: '62,63', key: 'it' },
];

const COUNTIES = ['Stockholm','Västra Götaland','Skåne','Uppsala','Östergötland','Jönköping','Örebro','Halland','Gävleborg','Dalarna','Västernorrland','Norrbotten'];

export default function Discovery() {
  const [sni, setSni] = useState('');
  const [county, setCounty] = useState('');
  const [maxResults, setMaxResults] = useState(50);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState('');
  const [nis2Text, setNis2Text] = useState('');
  const [nis2Running, setNis2Running] = useState(false);

  async function runDiscovery() {
    if (!sni) return;
    setRunning(true); setMessage('');
    try {
      for (const sniCode of sni.split(',')) {
        const { data } = await api.post('/discovery/run', {
          sni_prefix: sniCode.trim(),
          county: county || undefined,
          max_results: maxResults
        });
        setMessage(data.message);
      }
    } catch (err) {
      setMessage(`Fel: ${err.message}`);
    } finally { setRunning(false); }
  }

  async function importNis2() {
    if (!nis2Text.trim()) return;
    setNis2Running(true);
    try {
      // Parse CSV: org_nr,company_name,sector
      const lines = nis2Text.trim().split('\n').slice(1); // skip header
      const organizations = lines.map(line => {
        const [org_nr, company_name, sector] = line.split(',').map(s => s.trim().replace(/"/g,''));
        return { org_nr, company_name, sector };
      }).filter(o => o.org_nr);

      const { data } = await api.post('/discovery/import-nis2', { organizations });
      setMessage(`NIS2: ${data.imported} importerade, ${data.matched_in_leads} matchade i leads`);
    } catch (err) {
      setMessage(`Fel: ${err.message}`);
    } finally { setNis2Running(false); }
  }

  async function rescoreAll() {
    await api.post('/discovery/rescore-all', {});
    setMessage('Ompoängsättning startad i bakgrunden...');
  }

  return (
    <div className="p-8 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-xl font-semibold text-slate-100">Discovery</h1>
        <p className="text-slate-500 text-sm mt-0.5">Skrapa nya svenska leads från Allabolag.se</p>
      </div>

      {message && (
        <div className="bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-sm rounded-lg px-4 py-3">
          {message}
        </div>
      )}

      {/* Allabolag scraper */}
      <div className="bg-navy-800 border border-white/10 rounded-xl p-6 space-y-4">
        <h2 className="text-sm font-semibold text-slate-200">Allabolag.se Discovery</h2>

        <div>
          <label className="block text-xs text-slate-500 mb-2">SNI-sektor</label>
          <div className="grid grid-cols-2 gap-2">
            {SNI_GROUPS.map(g => (
              <button
                key={g.key}
                onClick={() => setSni(g.value)}
                className={`text-left px-3 py-2 rounded-lg text-xs border transition-colors ${
                  sni === g.value
                    ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-400'
                    : 'bg-white/5 border-white/10 text-slate-400 hover:text-slate-200'
                }`}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-slate-500 mb-1.5">Län (valfritt)</label>
            <select value={county} onChange={e => setCounty(e.target.value)}
              className="w-full bg-navy-700 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200">
              <option value="">Alla Län</option>
              {COUNTIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1.5">Max resultat</label>
            <input type="number" value={maxResults} onChange={e => setMaxResults(parseInt(e.target.value))}
              className="w-full bg-navy-700 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200"
            />
          </div>
        </div>

        <button onClick={runDiscovery} disabled={!sni || running}
          className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-sm rounded-lg transition-colors disabled:opacity-50">
          {running ? 'Kör discovery...' : 'Starta Discovery'}
        </button>
      </div>

      {/* NIS2 import */}
      <div className="bg-navy-800 border border-white/10 rounded-xl p-6 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-200">Importera NIS2-lista (MSB)</h2>
          <p className="text-xs text-slate-500 mt-1">
            Klistra in CSV från MSB:s NIS2-register. Format: org_nr,company_name,sector
          </p>
        </div>
        <textarea
          value={nis2Text} onChange={e => setNis2Text(e.target.value)}
          rows={5}
          placeholder={"org_nr,company_name,sector\n5567890123,Energibolaget AB,energy\n5561234567,Sjukhuset AB,health"}
          className="w-full bg-navy-700 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 font-mono resize-none focus:outline-none focus:border-cyan-500"
        />
        <button onClick={importNis2} disabled={!nis2Text.trim() || nis2Running}
          className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-sm rounded-lg transition-colors disabled:opacity-50">
          {nis2Running ? 'Importerar...' : 'Importera NIS2-lista'}
        </button>
      </div>

      {/* Rescore */}
      <div className="bg-navy-800 border border-white/10 rounded-xl p-6">
        <h2 className="text-sm font-semibold text-slate-200 mb-2">Ompoängsätt alla leads</h2>
        <p className="text-xs text-slate-500 mb-4">Kör scorern igen på alla leads med nuvarande signaler.</p>
        <button onClick={rescoreAll}
          className="px-4 py-2 bg-white/10 hover:bg-white/15 text-slate-300 text-sm rounded-lg transition-colors">
          Kör Rescore
        </button>
      </div>
    </div>
  );
}
