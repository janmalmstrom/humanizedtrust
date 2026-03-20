import React, { useState } from 'react';
import { api } from '../api';

const SNI_SECTORS = [
  {
    group: 'Energy',
    items: [
      { label: 'Electricity & gas', value: '35', key: '35' },
      { label: 'Water supply', value: '36', key: '36' },
      { label: 'Oil & gas extraction', value: '06', key: '06' },
      { label: 'Petroleum refining', value: '19', key: '19' },
      { label: '⬛ All Energy', value: '06,19,35,36', key: 'energy_all' },
    ]
  },
  {
    group: 'Transport & Logistics',
    items: [
      { label: 'Land transport', value: '49', key: '49' },
      { label: 'Water transport', value: '50', key: '50' },
      { label: 'Air transport', value: '51', key: '51' },
      { label: 'Warehousing & logistics', value: '52', key: '52' },
      { label: 'Postal & courier', value: '53', key: '53' },
      { label: '⬛ All Transport', value: '49,50,51,52,53', key: 'transport_all' },
    ]
  },
  {
    group: 'Banking & Finance',
    items: [
      { label: 'Banking & finance', value: '64', key: '64' },
      { label: 'Insurance', value: '65', key: '65' },
      { label: 'Financial services', value: '66', key: '66' },
      { label: '⬛ All Finance', value: '64,65,66', key: 'finance_all' },
    ]
  },
  {
    group: 'Healthcare',
    items: [
      { label: 'Healthcare', value: '86', key: '86' },
      { label: 'Residential care', value: '87', key: '87' },
      { label: 'Social work', value: '88', key: '88' },
      { label: '⬛ All Healthcare', value: '86,87,88', key: 'health_all' },
    ]
  },
  {
    group: 'Water & Waste',
    items: [
      { label: 'Sewage', value: '37', key: '37' },
      { label: 'Waste management', value: '38', key: '38' },
      { label: 'Remediation', value: '39', key: '39' },
      { label: '⬛ All Water & Waste', value: '37,38,39', key: 'water_all' },
    ]
  },
  {
    group: 'Digital & IT',
    items: [
      { label: 'Telecommunications', value: '61', key: '61' },
      { label: 'IT & software', value: '62', key: '62' },
      { label: 'Data services', value: '63', key: '63' },
      { label: '⬛ All Digital', value: '61,62,63', key: 'digital_all' },
    ]
  },
  {
    group: 'Manufacturing',
    items: [
      { label: 'Fabricated metal', value: '25', key: '25' },
      { label: 'Electronics & computers', value: '26', key: '26' },
      { label: 'Electrical equipment', value: '27', key: '27' },
      { label: 'Machinery', value: '28', key: '28' },
      { label: 'Motor vehicles', value: '29', key: '29' },
      { label: 'Other transport equipment', value: '30', key: '30' },
      { label: 'Furniture', value: '31', key: '31' },
      { label: 'Other manufacturing', value: '32', key: '32' },
      { label: 'Repair & installation', value: '33', key: '33' },
      { label: '⬛ All Manufacturing', value: '25,26,27,28,29,30,31,32,33', key: 'mfg_all' },
    ]
  },
  {
    group: 'Chemicals & Pharma',
    items: [
      { label: 'Chemicals', value: '20', key: '20' },
      { label: 'Pharmaceuticals', value: '21', key: '21' },
      { label: '⬛ All Chemicals', value: '20,21', key: 'chem_all' },
    ]
  },
  {
    group: 'Food & Beverages',
    items: [
      { label: 'Food manufacturing', value: '10', key: '10' },
      { label: 'Beverages', value: '11', key: '11' },
      { label: '⬛ All Food', value: '10,11', key: 'food_all' },
    ]
  },
  {
    group: 'Other',
    items: [
      { label: 'Public administration', value: '84', key: '84' },
      { label: 'Research & development', value: '72', key: '72' },
    ]
  },
];

const COUNTIES = ['Stockholm','Uppsala','Södermanland','Östergötland','Jönköping','Kronoberg','Kalmar','Gotland','Blekinge','Skåne','Halland','Västra Götaland','Värmland','Örebro','Västmanland','Dalarna','Gävleborg','Västernorrland','Jämtland','Västerbotten','Norrbotten'];

export default function Discovery() {
  const [sni, setSni] = useState('');
  const [county, setCounty] = useState('');
  const [maxResults, setMaxResults] = useState(50);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState('');
  const [nis2Text, setNis2Text] = useState('');
  const [nis2Running, setNis2Running] = useState(false);
  const [bvRunning, setBvRunning] = useState(false);

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
      setMessage(`Error: ${err.message}`);
    } finally { setRunning(false); }
  }

  async function importNis2() {
    if (!nis2Text.trim()) return;
    setNis2Running(true);
    try {
      const lines = nis2Text.trim().split('\n').slice(1);
      const organizations = lines.map(line => {
        const [org_nr, company_name, sector] = line.split(',').map(s => s.trim().replace(/"/g,''));
        return { org_nr, company_name, sector };
      }).filter(o => o.org_nr);
      const { data } = await api.post('/discovery/import-nis2', { organizations });
      setMessage(`NIS2: ${data.imported} imported, ${data.matched_in_leads} matched in leads`);
    } catch (err) {
      setMessage(`Error: ${err.message}`);
    } finally { setNis2Running(false); }
  }

  async function runBolagsverket() {
    setBvRunning(true);
    try {
      const { data } = await api.post('/discovery/bolagsverket', {});
      setMessage(data.message);
    } catch (err) {
      setMessage(`Error: ${err.message}`);
    } finally { setBvRunning(false); }
  }

  async function rescoreAll() {
    await api.post('/discovery/rescore-all', {});
    setMessage('Re-scoring started in background...');
  }

  return (
    <div className="p-4 sm:p-8 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-xl font-semibold text-slate-100">Discovery</h1>
        <p className="text-slate-500 text-sm mt-0.5">Scrape new Swedish leads from Allabolag.se</p>
      </div>

      {message && (
        <div className="bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-sm rounded-lg px-4 py-3">
          {message}
        </div>
      )}

      {/* Allabolag scraper */}
      <div className="bg-navy-800 border border-white/10 rounded-xl p-4 sm:p-6 space-y-4">
        <h2 className="text-sm font-semibold text-slate-200">Allabolag.se Discovery</h2>

        <div className="space-y-3">
          <label className="block text-xs text-slate-500">SNI sector</label>
          {SNI_SECTORS.map(group => (
            <div key={group.group}>
              <div className="text-xs text-slate-600 uppercase tracking-wide mb-1.5">{group.group}</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1.5">
                {group.items.map(g => (
                  <button
                    key={g.key}
                    onClick={() => setSni(g.value)}
                    className={`text-left px-2.5 py-2 rounded-lg text-xs border transition-colors ${
                      sni === g.value
                        ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-400'
                        : g.label.startsWith('⬛')
                          ? 'bg-white/3 border-white/5 text-slate-500 hover:text-slate-300'
                          : 'bg-white/5 border-white/10 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {g.label.replace('⬛ ', '')}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-slate-500 mb-1.5">County (optional)</label>
            <select value={county} onChange={e => setCounty(e.target.value)}
              className="w-full bg-navy-700 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200">
              <option value="">All counties</option>
              {COUNTIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1.5">Max results</label>
            <input type="number" value={maxResults} onChange={e => setMaxResults(parseInt(e.target.value))}
              className="w-full bg-navy-700 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200"
            />
          </div>
        </div>

        <button onClick={runDiscovery} disabled={!sni || running}
          className="w-full sm:w-auto px-4 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white text-sm rounded-lg transition-colors disabled:opacity-50">
          {running ? 'Running discovery...' : 'Start Discovery'}
        </button>
      </div>

      {/* Bolagsverket bulk import */}
      <div className="bg-navy-800 border border-white/10 rounded-xl p-4 sm:p-6 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-200">Bolagsverket + SCB Bulk Import</h2>
          <p className="text-xs text-slate-500 mt-1">
            Imports all active Swedish companies in target sectors. Free, no registration required. Takes 5–15 minutes.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          {[
            { label: 'Source', value: 'Bolagsverket + SCB' },
            { label: 'Updated', value: 'Every week' },
            { label: 'Cost', value: 'Free (CC BY 2.5 SE)' },
          ].map(item => (
            <div key={item.label} className="bg-white/5 rounded-lg px-3 py-2">
              <div className="text-slate-500">{item.label}</div>
              <div className="text-slate-300 font-medium mt-0.5">{item.value}</div>
            </div>
          ))}
        </div>
        <button onClick={runBolagsverket} disabled={bvRunning}
          className="w-full sm:w-auto px-4 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white text-sm rounded-lg transition-colors disabled:opacity-50">
          {bvRunning ? 'Starting import...' : 'Run Bolagsverket Import'}
        </button>
      </div>

      {/* NIS2 import */}
      <div className="bg-navy-800 border border-white/10 rounded-xl p-4 sm:p-6 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-200">Import NIS2 list (MSB)</h2>
          <p className="text-xs text-slate-500 mt-1">
            Paste CSV from MSB's NIS2 register. Format: org_nr,company_name,sector
          </p>
        </div>
        <textarea
          value={nis2Text} onChange={e => setNis2Text(e.target.value)}
          rows={4}
          placeholder={"org_nr,company_name,sector\n5567890123,Energibolaget AB,energy"}
          className="w-full bg-navy-700 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 font-mono resize-none focus:outline-none focus:border-cyan-500"
        />
        <button onClick={importNis2} disabled={!nis2Text.trim() || nis2Running}
          className="w-full sm:w-auto px-4 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white text-sm rounded-lg transition-colors disabled:opacity-50">
          {nis2Running ? 'Importing...' : 'Import NIS2 list'}
        </button>
      </div>

      {/* Rescore */}
      <div className="bg-navy-800 border border-white/10 rounded-xl p-4 sm:p-6">
        <h2 className="text-sm font-semibold text-slate-200 mb-2">Re-score all leads</h2>
        <p className="text-xs text-slate-500 mb-4">Re-run the scorer on all leads with current signals.</p>
        <button onClick={rescoreAll}
          className="w-full sm:w-auto px-4 py-2.5 bg-white/10 hover:bg-white/15 text-slate-300 text-sm rounded-lg transition-colors">
          Run Rescore
        </button>
      </div>
    </div>
  );
}
