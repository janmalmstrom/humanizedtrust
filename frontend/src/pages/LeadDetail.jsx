import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api';

// ─── Info Tooltip (CSS-only hover, no JS) ─────────────────────────────────────
function InfoTooltip({ text, position = 'top' }) {
  const posClass = position === 'top'
    ? 'bottom-full left-1/2 -translate-x-1/2 mb-2'
    : 'top-full left-1/2 -translate-x-1/2 mt-2';
  const arrowClass = position === 'top'
    ? 'absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-[#1e293b]'
    : 'absolute bottom-full left-1/2 -translate-x-1/2 border-4 border-transparent border-b-[#1e293b]';
  return (
    <span className="relative group inline-flex flex-shrink-0">
      <span className="w-4 h-4 rounded-full bg-white/8 text-slate-500 hover:text-slate-200 hover:bg-white/15 text-[10px] font-bold flex items-center justify-center cursor-help transition-colors select-none">?</span>
      <span className={`absolute ${posClass} w-72 bg-[#1e293b] border border-white/15 text-slate-300 text-xs rounded-xl px-3.5 py-3 shadow-2xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 leading-relaxed whitespace-normal`}>
        {text}
        <span className={arrowClass} />
      </span>
    </span>
  );
}

const CHANNEL_ICONS = { email: '📧', linkedin: '💼', call: '📞' };

const STATUSES = ['new','contacted','qualified','rejected','customer'];

const ACTIVITY_ICONS = {
  email:          '📧',
  linkedin:       '💼',
  call:           '📞',
  note:           '📝',
  status_change:  '🔄',
  task_completed: '✅',
};

// NIS2 pitch angles based on sector
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

// ---- Phone helpers ----
function copyToClipboard(text) {
  navigator.clipboard?.writeText(text).catch(() => {
    const el = document.createElement('textarea');
    el.value = text; document.body.appendChild(el);
    el.select(); document.execCommand('copy');
    document.body.removeChild(el);
  });
}

function PhoneDisplay({ phone }) {
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    copyToClipboard(phone);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <span className="flex items-center gap-2">
      <a href={`tel:${phone}`} className="text-cyan-400 hover:underline">{phone}</a>
      <button onClick={handleCopy} className="text-xs text-slate-500 hover:text-slate-300 transition-colors">
        {copied ? '✓ copied' : 'copy'}
      </button>
    </span>
  );
}

function CallButton({ phone, onLog }) {
  if (!phone) {
    return (
      <button disabled className="px-4 py-2 text-sm rounded-lg bg-white/5 border border-white/10 text-slate-500 cursor-not-allowed flex items-center gap-2">
        📞 <span>No phone number</span>
      </button>
    );
  }

  return (
    <a
      href={`tel:${phone}`}
      onClick={onLog}
      className="px-4 py-2 text-sm font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors flex items-center gap-2 shadow-lg shadow-emerald-900/30"
      title={`Call ${phone}`}
    >
      📞 <span>Call {phone}</span>
    </a>
  );
}

function formatDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-SE', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateTime(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-SE', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ---- Call Script ────────────────────────────────────────────────────────────
const SNI_SCRIPTS = {
  '86': { sector: 'Healthcare', opener: 'Vi hjälper sjukvårdsorganisationer att uppfylla NIS2-kraven för incidentrapportering — ni måste rapportera säkerhetsincidenter till MSB inom 24 timmar.', q1: 'Har ni en utsedd CISO eller NIS2-ansvarig idag?', q2: 'Hur hanterar ni er patientdata i AI-verktyg som Microsoft Copilot?', q3: 'Är ni medvetna om att ledningen bär personligt ansvar vid NIS2-brister?' },
  '87': { sector: 'Residential care', opener: 'Vi arbetar med omsorgsaktörer kring NIS2 och dataskydd för känsliga personuppgifter.', q1: 'Har ni kartlagt vilka system som hanterar skyddad persondata?', q2: 'Finns det en kontinuitetsplan om era system går ner?', q3: 'Är ni medvetna om de nya rapporteringskraven under NIS2?' },
  '64': { sector: 'Banking & Finance', opener: 'Vi hjälper finansbolag att hantera den dubbla compliance-pressen av NIS2 och EBA:s ICT-riskriktlinjer — ECB genomför cyberstresstester på banker under 2025.', q1: 'Hur ser er ICT-riskhantering ut idag — intern eller outsourcad?', q2: 'Har ni gjort en NIS2 gap-analys sedan lagen trädde i kraft?', q3: 'Vet ledningen att de bär personligt ansvar för NIS2-brister?' },
  '65': { sector: 'Insurance', opener: 'EIOPA och NIS2 skapar dubbla krav för försäkringsbolag — incidenter måste rapporteras till Finansinspektionen inom 72 timmar.', q1: 'Hur snabbt kan ni idag identifiera och rapportera en säkerhetsincident?', q2: 'Har er IT-leverantörskedja granskats ur ett NIS2-perspektiv?', q3: 'Har ni testat er incidentresponsplan det senaste året?' },
  '66': { sector: 'Financial services', opener: 'Vi hjälper finansiella tjänsteföretag — fondbolag, clearinghus — att hantera NIS2 supply chain-krav och tredjepartsrisk.', q1: 'Vilka tredjepartsleverantörer har tillgång till era kritiska system?', q2: 'Hur verifierar ni att era leverantörer uppfyller NIS2-krav?', q3: 'Har ni en uppdaterad risk-register för era IT-tjänster?' },
  '62': { sector: 'IT & Software', opener: 'Som IT-bolag är ni "viktig entitet" under NIS2 — och om ni levererar till väsentliga sektorer ärver era kunder era säkerhetskrav, vilket skapar affärsrisk för er.', q1: 'Levererar ni tjänster till någon av de väsentliga NIS2-sektorerna?', q2: 'Har ni dokumenterade säkerhetsprocesser som ni kan visa kunder?', q3: 'Hur hanterar ni AI-verktyg som Copilot ur ett datasäkerhetsperspektiv?' },
  '63': { sector: 'Data & Cloud services', opener: 'Molntjänstleverantörer träffas hårt av NIS2 — era kunder i väsentliga sektorer kommer kräva att ni uppfyller NIS2-standarder som del av deras leverantörsgranskning.', q1: 'Har era kunder börjat ställa NIS2-krav på er?', q2: 'Är er datahantering och incidentrespons dokumenterad?', q3: 'Har ni SOC 2 eller ISO 27001 — eller planerar ni det?' },
  '49': { sector: 'Land transport', opener: 'Transport är NIS2 Bilaga I — operatörer av väsentliga tjänster måste ha testade incidentresponsplaner, och Trafikverket samordnar tillsynen.', q1: 'Är era fordonssystem och verksamhetssystem separerade nätverksmässigt?', q2: 'Hur snabbt kan ni återhämta er om IT-systemen går ner under en störning?', q3: 'Har ni gjort en NIS2-analys av era OT-system?' },
  '52': { sector: 'Warehousing & Logistics', opener: 'Supply chain-attacker ökar kraftigt — och som logistikaktör är ni ofta ingångspunkten till era kunders system. NIS2 kräver att ni säkerställer era leverantörers säkerhetsnivå.', q1: 'Hur är era WMS-system skyddade mot obehörig åtkomst?', q2: 'Har ni incidentresponsplan som täcker driftstopp i lagerhantering?', q3: 'Vet era kunder i väsentliga sektorer att de är beroende av er säkerhet?' },
  '35': { sector: 'Energy', opener: 'Energisektorn är NIS2 Bilaga I prioritet — Svenska kraftnät och Energimarknadsinspektionen kräver OT-säkerhet och redundans för alla operatörer av väsentliga tjänster.', q1: 'Hur är era OT-system segmenterade från affärsnätverket?', q2: 'Har ni gjort en cybersäkerhetsanalys av er operativa teknologi?', q3: 'Hur länge kan ni driva kritisk infrastruktur utan IT-stöd?' },
  '84': { sector: 'Public administration', opener: 'MSB kräver att myndigheter genomför informationssäkerhetsanalyser och testar incidentrespons under NIS2 — och bötestak för myndigheter är 10M EUR.', q1: 'Har ni en aktuell informationssäkerhetsanalys (ISMS)?', q2: 'Hur hanterar ni säkerheten kring AI-verktyg i förvaltningen?', q3: 'Har ni testat er förmåga att hantera en IT-incident de senaste 12 månaderna?' },
};

function getCallScript(lead) {
  const prefix = lead?.nace_code ? String(lead.nace_code).substring(0, 2) : null;
  const s = (prefix && SNI_SCRIPTS[prefix]) || {
    sector: lead?.nace_description || 'your sector',
    opener: 'Vi hjälper svenska företag att navigera NIS2-kraven och säkra sina AI-verktyg som Microsoft Copilot — med ledningens personliga ansvar i fokus.',
    q1: 'Har ni gjort en NIS2-analys och vet var ni står idag?',
    q2: 'Hur hanterar ni säkerheten kring AI-verktyg och Copilot?',
    q3: 'Vem i organisationen är ansvarig för cybersäkerhet och NIS2-efterlevnad?',
  };
  const objections = [
    { obj: '"Vi har det under kontroll"', resp: '"Bra att höra. Har ni dokumenterat det och testat incidentresponsen? Det är ofta där gapet finns inför en MSB-granskning."' },
    { obj: '"Inte just nu / för tidigt"', resp: '"Förstår det. NIS2 är redan i kraft — är det att ni avvaktar tillsynen, eller att ni inte fått resurser ännu?"' },
    { obj: '"Vi har ingen budget"', resp: '"En Readiness Assessment kostar en bråkdel av en böter på 10M EUR. Kan vi titta på vad minsta möjliga scope skulle kosta?"' },
  ];
  return { ...s, objections, company: lead?.company_name || '', nis2: lead?.nis2_registered };
}

function CallScript({ lead }) {
  const [open, setOpen] = useState(false);
  const [generated, setGenerated] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [activeScript, setActiveScript] = useState(1);
  const [objBank, setObjBank] = useState(null); // { objections: [{obj,ara,ace}] }
  const [generatingObj, setGeneratingObj] = useState(false);
  const [activeLayer, setActiveLayer] = useState({}); // { [i]: 'ara'|'ace' }
  const s = getCallScript(lead);

  async function handleGenerateObjBank() {
    setGeneratingObj(true);
    try {
      const r = await api.post(`/leads/${lead.id}/generate-objection-bank`);
      setObjBank(r.data);
      const layers = {};
      r.data.objections.forEach((_, i) => { layers[i] = 'ara'; });
      setActiveLayer(layers);
    } catch (err) {
      console.error(err);
    } finally {
      setGeneratingObj(false);
    }
  }

  async function handleGenerate() {
    setGenerating(true);
    try {
      const r = await api.post(`/leads/${lead.id}/generate-call-scripts`);
      setGenerated(r.data);
      setActiveScript(1);
    } catch (err) {
      console.error(err);
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-emerald-500/5 transition-colors rounded-t-xl"
      >
        <div className="flex items-center gap-2">
          <span className="text-base">📞</span>
          <span className="text-sm font-semibold text-emerald-400">Discovery Call Script</span>
          <InfoTooltip text="Two ready-to-use cold call scripts for this specific company: Script 1 (Immediate Ask — direct, assumptive) and Script 2 (Pause Before Ask — softer entry). Also includes an AI-generated objection bank with ARA + ACE dual-layer responses to the 5 most likely objections from this sector." />
          {s.nis2 && <span className="text-xs bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 px-1.5 py-0.5 rounded-full">NIS2</span>}
          {generated && <span className="text-xs bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-1.5 py-0.5 rounded-full">AI ✓</span>}
        </div>
        <span className="text-slate-500 text-xs">{open ? '▲ collapse' : '▼ expand'}</span>
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-4">

          {/* Opening — static or AI generated */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Opening (30 sec)</div>
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="text-xs px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
              >
                {generating ? '⏳ Generating...' : generated ? '↻ Regenerate' : '✨ Generate scripts'}
              </button>
            </div>

            {!generated ? (
              <div className="bg-white/5 rounded-lg p-3 text-sm text-slate-200 leading-relaxed">
                "Hej, jag heter Jan Malmström. {s.opener} Har du två minuter?"
              </div>
            ) : (
              <div className="space-y-2">
                {/* Script toggle */}
                <div className="flex gap-1">
                  <button
                    onClick={() => setActiveScript(1)}
                    className={`text-xs px-3 py-1 rounded-lg border transition-colors ${activeScript === 1 ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-300' : 'bg-white/5 border-white/10 text-slate-500 hover:text-slate-300'}`}
                  >
                    Script 1 — Immediate Ask
                  </button>
                  <button
                    onClick={() => setActiveScript(2)}
                    className={`text-xs px-3 py-1 rounded-lg border transition-colors ${activeScript === 2 ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-300' : 'bg-white/5 border-white/10 text-slate-500 hover:text-slate-300'}`}
                  >
                    Script 2 — Pause Before Ask
                  </button>
                </div>
                <div className="bg-white/5 rounded-lg p-3 text-sm text-slate-200 leading-relaxed whitespace-pre-wrap">
                  {activeScript === 1 ? generated.script1 : generated.script2}
                </div>
              </div>
            )}
          </div>

          {/* Qualifying questions */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Discovery questions</div>
              {generated?.questions?.length > 0 && <span className="text-xs text-emerald-500">AI ✓</span>}
            </div>
            <div className="space-y-2">
              {(generated?.questions?.length > 0 ? generated.questions : [s.q1, s.q2, s.q3]).map((q, i) => (
                <div key={i} className="flex gap-2.5 text-sm">
                  <span className="text-emerald-500 font-bold flex-shrink-0">{i + 1}.</span>
                  <span className="text-slate-300">{q}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Objection handlers */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Objection handlers</div>
                {objBank && <span className="text-xs text-amber-500">AI ✓</span>}
              </div>
              <button
                onClick={handleGenerateObjBank}
                disabled={generatingObj}
                className="text-xs px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 hover:bg-amber-500/20 transition-colors disabled:opacity-50"
              >
                {generatingObj ? '⏳ Generating...' : objBank ? '↻ Regenerate' : '✨ Generate bank'}
              </button>
            </div>

            {!objBank ? (
              <div className="space-y-2">
                {s.objections.map((o, i) => (
                  <div key={i} className="bg-white/3 rounded-lg p-3 space-y-1">
                    <div className="text-xs font-medium text-amber-400">{o.obj}</div>
                    <div className="text-xs text-slate-300">{o.resp}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {objBank.objections.map((o, i) => (
                  <div key={i} className="bg-white/3 rounded-lg p-3 space-y-2">
                    <div className="text-xs font-medium text-amber-400">{o.obj}</div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => setActiveLayer(l => ({ ...l, [i]: 'ara' }))}
                        className={`text-xs px-2 py-0.5 rounded border transition-colors ${activeLayer[i] === 'ara' ? 'bg-amber-500/20 border-amber-500/30 text-amber-300' : 'bg-white/5 border-white/10 text-slate-500 hover:text-slate-300'}`}
                      >
                        ARA
                      </button>
                      <button
                        onClick={() => setActiveLayer(l => ({ ...l, [i]: 'ace' }))}
                        className={`text-xs px-2 py-0.5 rounded border transition-colors ${activeLayer[i] === 'ace' ? 'bg-amber-500/20 border-amber-500/30 text-amber-300' : 'bg-white/5 border-white/10 text-slate-500 hover:text-slate-300'}`}
                      >
                        ACE
                      </button>
                    </div>
                    <div className="text-xs text-slate-300 leading-relaxed">
                      {activeLayer[i] === 'ace' ? o.ace : o.ara}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Close */}
          <div className="space-y-1.5">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Close / next step</div>
            <div className="bg-white/5 rounded-lg p-3 text-sm text-slate-200 leading-relaxed">
              "Baserat på vad du berättat verkar det finnas ett par saker värda att titta på. Kan vi boka 30 minuter nästa vecka — jag kan visa konkret vad gap-analysen skulle se ut för {s.company || 'er'}?"
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MeetingAgenda({ lead }) {
  const [open, setOpen] = useState(false);
  const [agenda, setAgenda] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeFormat, setActiveFormat] = useState('concise');
  const [copied, setCopied] = useState(false);

  async function handleGenerate() {
    setLoading(true);
    try {
      const r = await api.post(`/leads/${lead.id}/generate-meeting-agenda`);
      setAgenda(r.data);
      setActiveFormat('concise');
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  function handleCopy() {
    const title = activeFormat === 'concise' ? agenda.title1 : agenda.title2;
    const body = activeFormat === 'concise' ? agenda.concise : agenda.expanded;
    navigator.clipboard.writeText(`${title}\n\n${body}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="bg-violet-500/5 border border-violet-500/20 rounded-xl">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-violet-500/5 transition-colors rounded-t-xl"
      >
        <div className="flex items-center gap-2">
          <span className="text-base">📅</span>
          <span className="text-sm font-semibold text-violet-400">Meeting Agenda</span>
          <InfoTooltip text="Generates a polished calendar invite agenda for a booked meeting. Outputs two formats: Concise (3–5 bullet items, one line each) and Expanded (same items with sub-bullets and context). Framed around the prospect's challenges — gives them a reason to show up and reduces no-shows." />
          {agenda && <span className="text-xs bg-violet-500/15 text-violet-400 border border-violet-500/30 px-1.5 py-0.5 rounded-full">AI ✓</span>}
        </div>
        <span className="text-slate-500 text-xs">{open ? '▲ collapse' : '▼ expand'}</span>
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">Generate a polished calendar invite agenda for your booked meeting.</p>
            <button
              onClick={handleGenerate}
              disabled={loading}
              className="text-xs px-2.5 py-1 rounded-lg bg-violet-500/10 border border-violet-500/20 text-violet-400 hover:bg-violet-500/20 transition-colors disabled:opacity-50 flex-shrink-0"
            >
              {loading ? '⏳ Generating...' : agenda ? '↻ Regenerate' : '✨ Generate agenda'}
            </button>
          </div>

          {agenda && (
            <div className="space-y-3">
              {/* Format toggle */}
              <div className="flex gap-1">
                <button
                  onClick={() => setActiveFormat('concise')}
                  className={`text-xs px-3 py-1 rounded-lg border transition-colors ${activeFormat === 'concise' ? 'bg-violet-500/20 border-violet-500/30 text-violet-300' : 'bg-white/5 border-white/10 text-slate-500 hover:text-slate-300'}`}
                >
                  Concise
                </button>
                <button
                  onClick={() => setActiveFormat('expanded')}
                  className={`text-xs px-3 py-1 rounded-lg border transition-colors ${activeFormat === 'expanded' ? 'bg-violet-500/20 border-violet-500/30 text-violet-300' : 'bg-white/5 border-white/10 text-slate-500 hover:text-slate-300'}`}
                >
                  Expanded
                </button>
              </div>

              {/* Title */}
              <div className="text-xs font-semibold text-violet-300">
                {activeFormat === 'concise' ? agenda.title1 : agenda.title2}
              </div>

              {/* Agenda body */}
              <div className="bg-white/5 rounded-lg p-3 text-xs text-slate-200 leading-relaxed whitespace-pre-wrap">
                {activeFormat === 'concise' ? agenda.concise : agenda.expanded}
              </div>

              {/* Copy button */}
              <button
                onClick={handleCopy}
                className="text-xs px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-slate-400 hover:text-slate-200 hover:bg-white/10 transition-colors"
              >
                {copied ? '✓ Copied!' : '📋 Copy to clipboard'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function EmailSequence({ lead }) {
  const [open, setOpen] = useState(false);
  const [extraContext, setExtraContext] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [activeTemplate, setActiveTemplate] = useState('a');
  const [copied, setCopied] = useState('');
  const [delivCheck, setDelivCheck] = useState(null);
  const [delivLoading, setDelivLoading] = useState(false);
  const [delivError, setDelivError] = useState('');

  async function handleGenerate() {
    setLoading(true); setError(''); setResult(null); setDelivCheck(null);
    try {
      const r = await api.post(`/leads/${lead.id}/generate-email-sequence`, { extra_context: extraContext });
      setResult(r.data);
    } catch (err) { setError(err.message || 'Failed'); }
    finally { setLoading(false); }
  }

  async function handleDelivCheck() {
    if (!result) return;
    const emailText = result.templates[activeTemplate];
    setDelivLoading(true); setDelivError(''); setDelivCheck(null);
    try {
      const r = await api.post(`/leads/${lead.id}/check-deliverability`, { email_text: emailText });
      setDelivCheck(r.data);
    } catch (err) { setDelivError(err.message || 'Check failed'); }
    finally { setDelivLoading(false); }
  }

  function copyText(text, key) {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(''), 2000);
  }

  const TEMPLATES = [
    { key: 'a',       label: 'Standard A' },
    { key: 'b',       label: 'Standard B' },
    { key: 'formalA', label: 'Formal A' },
    { key: 'formalB', label: 'Formal B' },
    { key: 'natural', label: 'Natural' },
  ];

  return (
    <div className="bg-[#0f1c2e] rounded-xl border border-white/10">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/3 transition-colors rounded-t-xl">
        <div className="flex items-center gap-2">
          <span className="text-base">✉️</span>
          <span className="text-sm font-semibold text-slate-200">Email sequence</span>
          <span className="text-xs text-slate-500">— 5 templates + subject lines + 3-touch follow-up</span>
          <InfoTooltip text="Generates a complete cold email package: 4 subject line options + 5 templates (Standard A/B, Formal A/B, Natural & Concise) + a 3-touch follow-up cadence (polite nudge → direct ask → assumptive break-up). Also includes a built-in deliverability checker — paste any email to get a 🟢🟡🔴 spam risk score before sending." />
        </div>
        <span className="text-slate-500 text-xs">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-4 border-t border-white/8">
          <div className="mt-4 space-y-2">
            <label className="text-xs text-slate-400">Extra context (optional) — competitor they use, recent trigger, tone preference</label>
            <input
              value={extraContext}
              onChange={e => setExtraContext(e.target.value)}
              placeholder="e.g. Uses Microsoft 365, recent NIS2 audit, prefer formal tone..."
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-white/20"
            />
          </div>
          <button onClick={handleGenerate} disabled={loading}
            className="w-full py-2.5 rounded-xl bg-blue-600/80 hover:bg-blue-500 text-white text-sm font-semibold transition-colors disabled:opacity-50">
            {loading ? '⏳ Generating...' : result ? '↺ Regenerate sequence' : '✨ Generate email sequence'}
          </button>
          {error && <div className="text-xs text-red-400">{error}</div>}

          {result && (
            <div className="space-y-5">

              {/* Subject lines */}
              <div>
                <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Subject lines</div>
                <div className="space-y-1.5">
                  {result.subjects.map((s, i) => (
                    <div key={i} className="flex items-center justify-between gap-3 bg-white/5 rounded-lg px-3 py-2 border border-white/8">
                      <span className="text-sm text-slate-300 flex-1">{s}</span>
                      <button onClick={() => copyText(s, `sub${i}`)}
                        className="text-xs text-slate-500 hover:text-slate-300 flex-shrink-0">
                        {copied === `sub${i}` ? '✓' : 'Copy'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Template tabs */}
              <div>
                <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Templates</div>
                <div className="flex gap-1 flex-wrap mb-3">
                  {TEMPLATES.map(t => (
                    <button key={t.key} onClick={() => { setActiveTemplate(t.key); setDelivCheck(null); }}
                      className={`text-xs px-2.5 py-1 rounded border transition-colors ${activeTemplate === t.key ? 'bg-blue-500/20 border-blue-500/40 text-blue-200' : 'bg-white/5 border-white/10 text-slate-400 hover:text-slate-200'}`}>
                      {t.label}
                    </button>
                  ))}
                </div>
                <div className="relative">
                  <div className="bg-white/5 rounded-xl p-4 border border-white/8 text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">
                    {result.templates[activeTemplate]}
                  </div>
                  <button onClick={() => copyText(result.templates[activeTemplate], 'tpl')}
                    className="absolute top-3 right-3 text-xs bg-white/10 hover:bg-white/20 text-slate-300 px-2.5 py-1 rounded-lg transition-colors">
                    {copied === 'tpl' ? '✓ Copied' : 'Copy'}
                  </button>
                </div>
              </div>

              {/* Deliverability check */}
              <div>
                <button onClick={handleDelivCheck} disabled={delivLoading}
                  className="w-full py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/8 text-slate-300 text-sm font-medium transition-colors disabled:opacity-50">
                  {delivLoading ? '⏳ Checking...' : delivCheck ? '↺ Re-check deliverability' : '📬 Check deliverability of active template'}
                </button>
                {delivError && <div className="text-xs text-red-400 mt-1">{delivError}</div>}
                {delivCheck && (() => {
                  const { score, rating, risks, fixes, revised } = delivCheck;
                  const badge = rating === 'green' ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                    : rating === 'red' ? 'bg-red-500/15 border-red-500/30 text-red-300'
                    : 'bg-amber-500/15 border-amber-500/30 text-amber-300';
                  const icon = rating === 'green' ? '🟢' : rating === 'red' ? '🔴' : '🟡';
                  return (
                    <div className="mt-3 space-y-3">
                      <div className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${badge}`}>
                        <span className="text-2xl">{icon}</span>
                        <div>
                          <div className="text-sm font-bold">Deliverability score: {score}/100</div>
                          <div className="text-xs opacity-70">
                            {rating === 'green' ? 'Safe to send' : rating === 'red' ? 'Do not send — requires revision' : 'Caution — fix before sending at scale'}
                          </div>
                        </div>
                      </div>
                      {risks && (
                        <div className="bg-white/5 rounded-xl p-4 border border-white/8 space-y-1.5">
                          <div className="text-xs font-semibold text-slate-400 mb-2">⚠️ Identified risks</div>
                          <div className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">{risks}</div>
                        </div>
                      )}
                      {fixes && (
                        <div className="bg-white/5 rounded-xl p-4 border border-white/8">
                          <div className="text-xs font-semibold text-slate-400 mb-2">✅ Recommended fixes</div>
                          <div className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">{fixes}</div>
                        </div>
                      )}
                      {revised && (
                        <div className="bg-blue-500/5 rounded-xl p-4 border border-blue-500/20 relative">
                          <div className="text-xs font-semibold text-blue-400 mb-2">📝 Deliverability-optimized version</div>
                          <div className="text-xs text-slate-500 mb-3">Prioritizes inbox placement — refine tone after</div>
                          <div className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed pr-12">{revised}</div>
                          <button onClick={() => copyText(revised, 'revised')}
                            className="absolute top-3 right-3 text-xs bg-white/10 hover:bg-white/20 text-slate-300 px-2.5 py-1 rounded-lg transition-colors">
                            {copied === 'revised' ? '✓' : 'Copy'}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* Follow-up cadence */}
              <div>
                <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">3-touch follow-up cadence</div>
                <div className="space-y-3">
                  {[
                    { key: 'touch1', label: 'Touch 1 — Polite nudge', color: 'border-amber-500/20 bg-amber-500/5' },
                    { key: 'touch2', label: 'Touch 2 — Direct ask', color: 'border-orange-500/20 bg-orange-500/5' },
                    { key: 'touch3', label: 'Touch 3 — Break-up', color: 'border-red-500/20 bg-red-500/5' },
                  ].map(({ key, label, color }) => (
                    <div key={key} className={`rounded-xl border p-4 ${color} relative`}>
                      <div className="text-xs font-semibold text-slate-400 mb-2">{label}</div>
                      <div className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap pr-12">{result.followup[key]}</div>
                      <button onClick={() => copyText(result.followup[key], key)}
                        className="absolute top-3 right-3 text-xs bg-white/10 hover:bg-white/20 text-slate-300 px-2.5 py-1 rounded-lg transition-colors">
                        {copied === key ? '✓' : 'Copy'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MeetingRecap({ lead }) {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');
  const [logging, setLogging] = useState(false);
  const [logged, setLogged] = useState(false);

  async function handleGenerate() {
    setLoading(true); setError(''); setResult(null); setLogged(false);
    try {
      const r = await api.post(`/leads/${lead.id}/generate-meeting-recap`, { notes });
      setResult(r.data);
    } catch (err) { setError(err.message || 'Failed'); }
    finally { setLoading(false); }
  }

  async function handleLogActivity() {
    if (!result) return;
    setLogging(true);
    try {
      await api.post(`/leads/${lead.id}/activities`, {
        type: 'note',
        content: `📧 Follow-up email sent\n\nSubject: ${result.subject}\n\n${result.body}`,
      });
      setLogged(true);
    } catch (err) { console.error(err); }
    finally { setLogging(false); }
  }

  function copy(text, key) {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(''), 2000);
  }

  return (
    <div className="bg-[#0f1c2e] rounded-xl border border-white/10">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/3 transition-colors rounded-t-xl">
        <div className="flex items-center gap-2">
          <span className="text-base">📩</span>
          <span className="text-sm font-semibold text-slate-200">Meeting follow-up</span>
          <span className="text-xs text-slate-500">— paste notes, get a polished follow-up email</span>
          <InfoTooltip text="Paste messy meeting notes or a transcript → get a ready-to-send follow-up email with subject line. Uses assumptive language on next steps ('We'll connect Thursday' not 'Let me know if...'). Never fabricates details — uses [DATE] placeholders if something is unclear. Log it as an activity after sending." />
        </div>
        <span className="text-slate-500 text-xs">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-4 border-t border-white/8">
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Paste your meeting notes or transcript here — messy is fine..."
            rows={5}
            className="w-full mt-4 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-white/20 resize-y"
          />
          <button onClick={handleGenerate} disabled={loading || !notes.trim()}
            className="w-full py-2.5 rounded-xl bg-indigo-600/80 hover:bg-indigo-500 text-white text-sm font-semibold transition-colors disabled:opacity-50">
            {loading ? '⏳ Writing email...' : result ? '↺ Regenerate' : '📩 Generate follow-up email'}
          </button>
          {error && <div className="text-xs text-red-400">{error}</div>}

          {result && (
            <div className="space-y-3">
              {/* Subject */}
              <div className="flex items-center justify-between gap-3 bg-white/5 rounded-xl px-4 py-3 border border-white/8">
                <div>
                  <div className="text-xs text-slate-500 mb-0.5">Subject</div>
                  <div className="text-sm font-medium text-slate-200">{result.subject}</div>
                </div>
                <button onClick={() => copy(result.subject, 'subject')}
                  className="text-xs text-slate-500 hover:text-slate-300 flex-shrink-0 transition-colors">
                  {copied === 'subject' ? '✓' : 'Copy'}
                </button>
              </div>

              {/* Body */}
              <div className="relative bg-white/5 rounded-xl border border-white/8">
                <div className="px-4 pt-3 pb-1">
                  <div className="text-xs text-slate-500 mb-2">Email body</div>
                </div>
                <div className="px-4 pb-4 text-sm text-slate-300 leading-relaxed whitespace-pre-wrap pr-16">
                  {result.body}
                </div>
                <button onClick={() => copy(result.body, 'body')}
                  className="absolute top-3 right-3 text-xs bg-white/10 hover:bg-white/20 text-slate-300 px-2.5 py-1 rounded-lg transition-colors">
                  {copied === 'body' ? '✓ Copied' : 'Copy'}
                </button>
              </div>

              {/* Tip */}
              {result.tip && (
                <div className="text-xs text-slate-500 italic px-1">{result.tip}</div>
              )}

              {/* Log activity */}
              <button onClick={handleLogActivity} disabled={logging || logged}
                className={`w-full py-2 rounded-xl border text-xs font-medium transition-colors ${
                  logged
                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                    : 'bg-white/5 border-white/10 text-slate-400 hover:text-slate-200 hover:bg-white/8'
                } disabled:opacity-50`}>
                {logged ? '✓ Logged to activity timeline' : logging ? '⏳ Logging...' : '📌 Log as activity on this lead'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DiscoveryBrief({ lead }) {
  const [open, setOpen] = useState(false);
  const [extraContext, setExtraContext] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');

  async function handleGenerate() {
    setLoading(true); setError(''); setResult(null);
    try {
      const r = await api.post(`/leads/${lead.id}/generate-discovery-brief`, { extra_context: extraContext });
      setResult(r.data);
    } catch (err) { setError(err.message || 'Failed'); }
    finally { setLoading(false); }
  }

  function copy(text, key) {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(''), 2000);
  }

  const SECTIONS = [
    { key: 'background',  icon: '🏢', label: 'Company background',          color: 'text-slate-300' },
    { key: 'industry',    icon: '📊', label: 'Industry challenges & trends', color: 'text-cyan-400' },
    { key: 'valueprop',   icon: '🎯', label: 'Value proposition alignment',  color: 'text-emerald-400' },
    { key: 'questions',   icon: '❓', label: 'Discovery question funnels',   color: 'text-violet-400' },
    { key: 'valuepoints', icon: '💡', label: 'Value points to emphasize',    color: 'text-amber-400' },
    { key: 'opener',      icon: '🎙️', label: 'Opening script (word-for-word)', color: 'text-blue-400' },
    { key: 'objections',  icon: '🛡️', label: 'Likely objections & responses', color: 'text-orange-400' },
    { key: 'nextsteps',   icon: '✅', label: 'Recommended next steps',       color: 'text-emerald-400' },
    { key: 'resources',   icon: '📎', label: 'Resources to share',           color: 'text-slate-400' },
  ];

  return (
    <div className="bg-[#0f1c2e] rounded-xl border border-white/10">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/3 transition-colors rounded-t-xl">
        <div className="flex items-center gap-2">
          <span className="text-base">📋</span>
          <span className="text-sm font-semibold text-slate-200">Discovery brief</span>
          <span className="text-xs text-slate-500">— 9-section prep brief for your meeting</span>
          <InfoTooltip text="Generates a complete pre-meeting prep document: company background · industry challenges · value prop alignment · 4 question funnels (current state / impact / priority / decision) · word-for-word opening script · 3 likely objections + responses · 2 recommended next steps · resources to share. Add a contact name to get persona-aware output." />
        </div>
        <span className="text-slate-500 text-xs">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-4 border-t border-white/8">
          <div className="mt-4 space-y-2">
            <label className="text-xs text-slate-400">Extra context (optional) — what was discussed on the cold call, recent triggers, known pain points</label>
            <input
              value={extraContext}
              onChange={e => setExtraContext(e.target.value)}
              placeholder="e.g. Mentioned they had a security audit last month, VD seemed interested in NIS2..."
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-white/20"
            />
          </div>
          <button onClick={handleGenerate} disabled={loading}
            className="w-full py-2.5 rounded-xl bg-emerald-700/80 hover:bg-emerald-600 text-white text-sm font-semibold transition-colors disabled:opacity-50">
            {loading ? '⏳ Building brief...' : result ? '↺ Regenerate brief' : '📋 Generate discovery brief'}
          </button>
          {error && <div className="text-xs text-red-400">{error}</div>}

          {result && (
            <div className="space-y-4 pt-1">
              {result.contact && (
                <div className="flex items-center gap-2 text-xs text-slate-400 bg-white/5 rounded-lg px-3 py-2 border border-white/8">
                  <span>👤</span>
                  <span>Briefed for <span className="text-slate-200 font-medium">{result.contact.name}</span>{result.contact.title ? ` — ${result.contact.title}` : ''}</span>
                </div>
              )}

              {SECTIONS.map(({ key, icon, label, color }) => (
                result[key] ? (
                  <div key={key} className="bg-white/5 rounded-xl border border-white/8 overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/8">
                      <div className={`flex items-center gap-2 text-xs font-semibold uppercase tracking-wide ${color}`}>
                        <span>{icon}</span><span>{label}</span>
                      </div>
                      <button onClick={() => copy(result[key], key)}
                        className="text-xs text-slate-500 hover:text-slate-300 transition-colors">
                        {copied === key ? '✓ Copied' : 'Copy'}
                      </button>
                    </div>
                    <div className="px-4 py-3 text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">
                      {result[key]}
                    </div>
                  </div>
                ) : null
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CallAnalysis({ lead }) {
  const [open, setOpen] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  async function handleAnalyze() {
    if (!transcript.trim()) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const r = await api.post(`/leads/${lead.id}/analyze-call`, { transcript });
      setResult(r.data);
    } catch (err) {
      setError(err.message || 'Analysis failed');
    } finally {
      setLoading(false);
    }
  }

  const Section = ({ label, color = 'text-slate-300', children }) => (
    <div className="space-y-1.5">
      <div className={`text-xs font-semibold uppercase tracking-wide ${color}`}>{label}</div>
      <div className="text-sm text-slate-300 leading-relaxed">{children}</div>
    </div>
  );

  return (
    <div className="bg-[#0f1c2e] rounded-xl border border-white/10">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/3 transition-colors rounded-t-xl">
        <div className="flex items-center gap-2">
          <span className="text-base">🔍</span>
          <span className="text-sm font-semibold text-slate-200">Analyze call</span>
          <span className="text-xs text-slate-500">— paste transcript, get BANT + coaching</span>
          <InfoTooltip text="Paste a call transcript → get structured coaching feedback using BANT (Budget / Authority / Need / Timeline) and MEDDIC frameworks. Covers: talk track pacing + filler words · missed discovery opportunities · qualification gaps · top 3 specific improvements · suggested follow-up approach. Every piece of feedback is tied to moments in your transcript." />
        </div>
        <span className="text-slate-500 text-xs">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-4 border-t border-white/8">
          <textarea
            value={transcript}
            onChange={e => setTranscript(e.target.value)}
            placeholder="Paste your call transcript here..."
            rows={6}
            className="w-full mt-4 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-white/20 resize-y"
          />
          <button onClick={handleAnalyze} disabled={loading || !transcript.trim()}
            className="w-full py-2.5 rounded-xl bg-violet-600/80 hover:bg-violet-500 text-white text-sm font-semibold transition-colors disabled:opacity-50">
            {loading ? '⏳ Analyzing...' : '🔍 Analyze transcript'}
          </button>
          {error && <div className="text-xs text-red-400">{error}</div>}

          {result && (
            <div className="space-y-5 pt-1">
              <Section label="⏱ Tempo & pacing" color="text-blue-400">
                {result.tempo}
              </Section>
              <Section label="🎯 Missed opportunities" color="text-amber-400">
                {result.missed}
              </Section>
              <Section label="📊 BANT qualification" color="text-cyan-400">
                <div className="space-y-1">
                  {result.bant.map((line, i) => (
                    <div key={i} className="text-sm text-slate-300">{line}</div>
                  ))}
                </div>
              </Section>
              <Section label="✅ Top 3 improvements" color="text-emerald-400">
                <div className="space-y-1.5">
                  {result.top3.map((item, i) => (
                    <div key={i} className="flex gap-2 text-sm text-slate-300">
                      <span className="text-emerald-500 flex-shrink-0">{i + 1}.</span>
                      <span>{item.replace(/^\d+\.\s*/, '')}</span>
                    </div>
                  ))}
                </div>
              </Section>
              <Section label="📅 Follow-up plan" color="text-violet-400">
                {result.followup}
              </Section>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CallSimulator({ lead, onClose }) {
  const [phase, setPhase] = useState('setup'); // setup | preplan | active | debrief
  const [difficulty, setDifficulty] = useState('standard');
  const [messages, setMessages] = useState([]);
  const [prePlan, setPrecPlan] = useState('');
  const [firstProspectLine, setFirstProspectLine] = useState('');
  const [debrief, setDebrief] = useState(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [micError, setMicError] = useState('');
  const [scripts, setScripts] = useState(null);
  const [loadingScripts, setLoadingScripts] = useState(false);
  const [activeScript, setActiveScriptSim] = useState(1);
  const [voiceOut, setVoiceOut] = useState(true);
  const [voiceSupported] = useState(() => !!(window.SpeechRecognition || window.webkitSpeechRecognition));
  const bottomRef = useRef(null);
  const recognitionRef = useRef(null);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const transcriptRef = useRef('');
  const handleSendRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Cancel speech on unmount
  useEffect(() => () => window.speechSynthesis?.cancel(), []);

  function speak(text) {
    if (!voiceOut || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const doSpeak = () => {
      const utt = new SpeechSynthesisUtterance(text);
      utt.lang = 'sv-SE';
      utt.rate = 0.78;
      utt.pitch = 0.95;
      const voices = window.speechSynthesis.getVoices();
      const svVoice = voices.find(v => v.lang === 'sv-SE') || voices.find(v => v.lang.startsWith('sv'));
      if (svVoice) utt.voice = svVoice;
      window.speechSynthesis.speak(utt);
    };
    // voices may not be loaded yet on first call
    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      doSpeak();
    } else {
      window.speechSynthesis.onvoiceschanged = () => { doSpeak(); window.speechSynthesis.onvoiceschanged = null; };
    }
  }

  function toggleListening() {
    if (listening) {
      // Stop — onend will fire and send
      recognitionRef.current?.stop();
      return;
    }

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setMicError('Speech recognition not supported in this browser'); return; }

    window.speechSynthesis?.cancel();
    setMicError('');
    transcriptRef.current = '';
    setInput('');

    let recognition;
    try {
      recognition = new SR();
    } catch (e) {
      setMicError(`Could not create recognizer: ${e.message}`);
      return;
    }

    recognition.lang = 'sv-SE';
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (e) => {
      const transcript = Array.from(e.results).map(r => r[0].transcript).join('');
      transcriptRef.current = transcript;
      setInput(transcript);
    };

    recognition.onend = () => {
      setListening(false);
      const text = transcriptRef.current.trim();
      if (text) {
        transcriptRef.current = '';
        handleSendRef.current(text);
      }
    };

    recognition.onerror = (e) => {
      setListening(false);
      if (e.error === 'not-allowed') setMicError('Mic blocked — click the lock icon in your browser address bar and allow microphone');
      else if (e.error === 'no-speech') setMicError('No speech detected — try speaking closer to the mic');
      else if (e.error === 'audio-capture') setMicError('No microphone found');
      else if (e.error === 'network') setMicError('Network error — speech recognition requires internet');
      else setMicError(`Mic error: ${e.error}`);
    };

    try {
      recognition.start();
      recognitionRef.current = recognition;
      setListening(true);
    } catch (e) {
      setMicError(`Failed to start mic: ${e.message}`);
    }
  }

  async function handleGeneratePlan() {
    setLoading(true);
    try {
      const r = await api.post(`/leads/${lead.id}/call-simulator`, { action: 'start', difficulty });
      setPrecPlan(r.data.prePlan);
      setFirstProspectLine(r.data.prospectLine);
      setPhase('preplan');
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }

  function handleBeginCall() {
    const firstMsg = { role: 'prospect', content: firstProspectLine };
    setMessages([firstMsg]);
    setPhase('active');
    setTimeout(() => speak(firstProspectLine), 300);
  }

  async function handleSend(textOverride) {
    const text = (textOverride || input).trim();
    if (!text || loading) return;
    const repMsg = { role: 'rep', content: text };
    const next = [...messagesRef.current, repMsg];
    setMessages(next);
    setInput('');
    setLoading(true);
    try {
      const r = await api.post(`/leads/${lead.id}/call-simulator`, { action: 'respond', difficulty, messages: next });
      const prospectMsg = { role: 'prospect', content: r.data.reply };
      setMessages([...next, prospectMsg]);
      speak(r.data.reply);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }
  handleSendRef.current = handleSend;


  async function handleEnd() {
    window.speechSynthesis?.cancel();
    setLoading(true);
    try {
      const r = await api.post(`/leads/${lead.id}/call-simulator`, { action: 'end', difficulty, messages: messagesRef.current });
      setDebrief(r.data);
      setPhase('debrief');
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }

  function handleRestart() {
    window.speechSynthesis?.cancel();
    setPhase('setup');
    setMessages([]);
    setPrecPlan('');
    setFirstProspectLine('');
    setDebrief(null);
    setInput('');
    setListening(false);
    setMicError('');
  }

  const gradeColors = {
    'Bokat möte': 'text-emerald-400',
    'Nästan': 'text-amber-400',
    'Tappat kontakt': 'text-orange-400',
    'Lade på': 'text-red-400',
  };
  const gradeColor = debrief ? (gradeColors[debrief.grade] || 'text-slate-300') : '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-[#0f1c2e] border border-white/10 rounded-2xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 flex-shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-lg">🎯</span>
            <div>
              <div className="text-sm font-semibold text-slate-100">Practice Call — {lead.company_name}</div>
              <div className="text-xs text-slate-500">{lead.nace_description} · {lead.city}</div>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 text-lg leading-none">✕</button>
        </div>

        {/* Setup phase */}
        {phase === 'setup' && (
          <div className="flex-1 p-6 space-y-5 overflow-y-auto">
            <div>
              <div className="text-sm font-semibold text-slate-200 mb-3">Difficulty</div>
              <div className="flex gap-2">
                {['standard', 'hard'].map(d => (
                  <button key={d} onClick={() => setDifficulty(d)}
                    className={`flex-1 py-3 rounded-xl border text-sm font-medium transition-colors ${difficulty === d ? 'bg-red-500/15 border-red-500/30 text-red-300' : 'bg-white/5 border-white/10 text-slate-400 hover:text-slate-200'}`}>
                    {d === 'standard' ? '🟡 Standard' : '🔴 Hard mode'}
                    <div className="text-xs font-normal mt-0.5 opacity-70">
                      {d === 'standard' ? 'Realistic pushback' : 'Interrupts · threatens to hang up'}
                    </div>
                  </button>
                ))}
              </div>
            </div>
            <div className="bg-white/5 rounded-xl p-4 space-y-1.5 text-xs text-slate-400">
              <div className="font-semibold text-slate-300 mb-2">How it works</div>
              <div>1. Generate your pre-call plan — opening angle, likely objections, strategic hook</div>
              <div>2. Review the plan, then start the call when ready</div>
              <div>3. {voiceSupported ? <><span className="text-emerald-400">🎤 Click mic to start/stop speaking</span> or type</> : 'Type your responses'}</div>
              <div>4. Click <span className="text-red-400 font-medium">End call</span> for debrief + grade</div>
            </div>
            <button onClick={handleGeneratePlan} disabled={loading}
              className="w-full py-3 rounded-xl bg-amber-600/80 hover:bg-amber-500 text-white text-sm font-semibold transition-colors disabled:opacity-50">
              {loading ? '⏳ Generating plan...' : '📋 Generate pre-call plan'}
            </button>
          </div>
        )}

        {/* Pre-call plan phase */}
        {phase === 'preplan' && (
          <div className="flex-1 p-6 space-y-5 overflow-y-auto">
            <div className="bg-amber-500/8 border border-amber-500/20 rounded-xl p-5">
              <div className="text-xs font-semibold text-amber-400 mb-3">📋 Pre-call plan — {lead.company_name}</div>
              <div className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">{prePlan}</div>
            </div>
            <button onClick={handleBeginCall}
              className="w-full py-3 rounded-xl bg-red-600/80 hover:bg-red-500 text-white text-sm font-semibold transition-colors">
              📞 Start practice call
            </button>
          </div>
        )}

        {/* Active call phase — two columns */}
        {phase === 'active' && (
          <div className="flex flex-1 min-h-0">

            {/* Left: chat */}
            <div className="flex flex-col flex-1 min-w-0 border-r border-white/10">
              {prePlan && (
                <div className="px-4 py-2.5 bg-amber-500/8 border-b border-amber-500/15 flex-shrink-0">
                  <div className="text-xs font-semibold text-amber-400 mb-1">📋 Pre-call plan</div>
                  <div className="text-xs text-slate-300 whitespace-pre-wrap leading-relaxed">{prePlan}</div>
                </div>
              )}

              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                {messages.map((m, i) => (
                  <div key={i} className={`flex ${m.role === 'rep' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] rounded-xl px-4 py-2.5 text-sm leading-relaxed ${
                      m.role === 'rep'
                        ? 'bg-blue-600/30 border border-blue-500/30 text-slate-100'
                        : 'bg-white/8 border border-white/10 text-slate-200'
                    }`}>
                      <div className="text-xs opacity-50 mb-1">{m.role === 'rep' ? 'Jan (you)' : lead.company_name}</div>
                      {m.content}
                    </div>
                  </div>
                ))}
                {loading && (
                  <div className="flex justify-start">
                    <div className="bg-white/8 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-slate-400">
                      <div className="text-xs opacity-50 mb-1">{lead.company_name}</div>
                      <span className="animate-pulse">...</span>
                    </div>
                  </div>
                )}
                <div ref={bottomRef} />
              </div>

              <div className="px-4 py-3 border-t border-white/10 flex-shrink-0 space-y-2">
                <div className="flex items-center gap-2">
                  {voiceSupported && (
                    <button
                      onClick={toggleListening}
                      disabled={loading}
                      title={listening ? 'Click to stop & send' : 'Click to start speaking'}
                      className={`w-12 h-10 rounded-xl border flex items-center justify-center text-lg transition-all flex-shrink-0 ${
                        listening ? 'bg-red-500/30 border-red-400/50 animate-pulse' : 'bg-white/5 border-white/10 hover:bg-white/10'
                      } disabled:opacity-40`}>
                      🎤
                    </button>
                  )}
                  <input
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
                    placeholder={listening ? '🎤 Listening...' : voiceSupported ? 'Hold mic or type...' : 'Type your response...'}
                    disabled={loading || listening}
                    className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-white/20 disabled:opacity-50"
                  />
                  <button onClick={() => handleSend()} disabled={loading || !input.trim() || listening}
                    className="px-4 py-2.5 rounded-xl bg-blue-600/80 hover:bg-blue-500 text-white text-sm font-medium transition-colors disabled:opacity-40 flex-shrink-0">
                    Send
                  </button>
                  <button
                    onClick={() => { setVoiceOut(v => !v); window.speechSynthesis?.cancel(); }}
                    title={voiceOut ? 'Mute' : 'Unmute'}
                    className={`w-10 h-10 rounded-xl border flex items-center justify-center text-base transition-colors flex-shrink-0 ${
                      voiceOut ? 'bg-white/8 border-white/15 text-slate-300' : 'bg-white/3 border-white/8 text-slate-600'
                    }`}>
                    {voiceOut ? '🔊' : '🔇'}
                  </button>
                </div>
                {listening && (
                  <div className="text-xs text-center text-red-400 animate-pulse">🔴 Recording — click mic to stop & send</div>
                )}
                {micError && !listening && (
                  <div className="text-xs text-center text-orange-400">{micError}</div>
                )}
                <button onClick={handleEnd} disabled={loading}
                  className="w-full py-2 rounded-xl bg-red-600/20 border border-red-500/30 text-red-400 hover:bg-red-600/30 text-xs font-medium transition-colors disabled:opacity-40">
                  📵 End call → get debrief
                </button>
              </div>
            </div>

            {/* Right: script panel */}
            <div className="w-72 flex-shrink-0 flex flex-col overflow-hidden">
              <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between flex-shrink-0">
                <span className="text-xs font-semibold text-violet-300">📄 Call script</span>
                <button
                  onClick={async () => {
                    setLoadingScripts(true);
                    try {
                      const r = await api.post(`/leads/${lead.id}/generate-call-scripts`);
                      setScripts(r.data);
                    } catch (err) { console.error(err); }
                    finally { setLoadingScripts(false); }
                  }}
                  disabled={loadingScripts}
                  className="text-xs px-2.5 py-1 rounded-lg bg-violet-500/15 border border-violet-500/30 text-violet-300 hover:bg-violet-500/25 transition-colors disabled:opacity-50"
                >
                  {loadingScripts ? '⏳...' : scripts ? '↺' : '✨ Generate'}
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
                {!scripts && !loadingScripts && (
                  <div className="text-xs text-slate-500 text-center pt-8">
                    Generate a script to see it here while you practice
                  </div>
                )}
                {scripts && (
                  <>
                    <div className="flex gap-1">
                      {[1, 2].map(n => (
                        <button key={n} onClick={() => setActiveScriptSim(n)}
                          className={`flex-1 text-xs py-1 rounded border transition-colors ${activeScript === n ? 'bg-violet-500/20 border-violet-500/40 text-violet-200' : 'bg-white/5 border-white/10 text-slate-400 hover:text-slate-200'}`}>
                          {n === 1 ? 'Direct' : 'Softer'}
                        </button>
                      ))}
                    </div>
                    <div className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap bg-white/5 rounded-lg p-3 border border-white/8">
                      {activeScript === 1 ? scripts.script1 : scripts.script2}
                    </div>
                    {scripts.questions?.length > 0 && (
                      <div className="space-y-2">
                        <div className="text-xs font-semibold text-slate-400">Discovery questions</div>
                        {scripts.questions.map((q, i) => (
                          <div key={i} className="text-xs text-slate-300 bg-white/5 rounded-lg px-3 py-2 border border-white/8">
                            <span className="text-slate-500 mr-1">Q{i+1}.</span>{q}
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

          </div>
        )}

        {/* Debrief phase */}
        {phase === 'debrief' && debrief && (
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            <div className="text-center">
              <div className={`text-2xl font-bold ${gradeColor}`}>{debrief.grade}</div>
              <div className="text-xs text-slate-500 mt-0.5">Call outcome</div>
            </div>
            <div className="space-y-3">
              <div className="bg-emerald-500/8 border border-emerald-500/20 rounded-xl p-4">
                <div className="text-xs font-semibold text-emerald-400 mb-1">✓ What you did well</div>
                <div className="text-sm text-slate-300">{debrief.good}</div>
              </div>
              <div className="bg-amber-500/8 border border-amber-500/20 rounded-xl p-4">
                <div className="text-xs font-semibold text-amber-400 mb-1">⚠ Where you lost momentum</div>
                <div className="text-sm text-slate-300">{debrief.improve}</div>
              </div>
              <div className="bg-blue-500/8 border border-blue-500/20 rounded-xl p-4">
                <div className="text-xs font-semibold text-blue-400 mb-1">→ One thing to change next time</div>
                <div className="text-sm text-slate-300">{debrief.change}</div>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={handleRestart}
                className="flex-1 py-2.5 rounded-xl bg-white/5 border border-white/10 text-slate-300 text-sm hover:bg-white/10 transition-colors">
                🔄 Try again
              </button>
              <button onClick={onClose}
                className="flex-1 py-2.5 rounded-xl bg-white/5 border border-white/10 text-slate-300 text-sm hover:bg-white/10 transition-colors">
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Messages Inbox ----
function MessagesPanel({ leadId, leadEmail }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [replyTo, setReplyTo] = useState(leadEmail || '');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [sendMsg, setSendMsg] = useState('');
  const [showCompose, setShowCompose] = useState(false);

  const fetchMessages = useCallback(() => {
    api.get(`/messages/${leadId}`)
      .then(r => { setMessages(r.data.messages); setLoading(false); })
      .catch(() => setLoading(false));
  }, [leadId]);

  useEffect(() => {
    fetchMessages();
    const t = setInterval(fetchMessages, 15000); // auto-refresh every 15s
    return () => clearInterval(t);
  }, [fetchMessages]);

  async function sendReply(e) {
    e.preventDefault();
    if (!body.trim() || !replyTo.trim()) return;
    setSending(true);
    setSendMsg('');
    try {
      await api.post(`/messages/${leadId}/reply`, {
        to_email: replyTo.trim(),
        subject: subject.trim() || 'Ang. NIS2',
        body: body.trim(),
      });
      setBody('');
      setSubject('');
      setShowCompose(false);
      setSendMsg('✓ Sent');
      fetchMessages();
    } catch (err) {
      setSendMsg('Error: ' + (err.response?.data?.error || err.message));
    } finally {
      setSending(false);
      setTimeout(() => setSendMsg(''), 4000);
    }
  }

  function formatTime(ts) {
    return new Date(ts).toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' });
  }

  return (
    <div className="bg-navy-800 rounded-xl border border-white/10 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
          📬 Messages
          {messages.filter(m => m.direction === 'inbound' && !m.read_at).length > 0 && (
            <span className="bg-cyan-500 text-white text-xs px-1.5 py-0.5 rounded-full">
              {messages.filter(m => m.direction === 'inbound' && !m.read_at).length} new
            </span>
          )}
        </h2>
        <button
          onClick={() => setShowCompose(c => !c)}
          className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
        >
          {showCompose ? 'Cancel' : '+ Compose'}
        </button>
      </div>

      {/* Compose form */}
      {showCompose && (
        <form onSubmit={sendReply} className="space-y-2 border border-white/10 rounded-lg p-3 bg-navy-700/50">
          <input
            type="email"
            value={replyTo}
            onChange={e => setReplyTo(e.target.value)}
            placeholder="To email..."
            className="w-full bg-navy-700 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
          />
          <input
            type="text"
            value={subject}
            onChange={e => setSubject(e.target.value)}
            placeholder="Subject (default: Ang. NIS2)"
            className="w-full bg-navy-700 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
          />
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder="Write your message..."
            rows={5}
            className="w-full bg-navy-700 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-500 resize-none focus:outline-none focus:border-cyan-500"
          />
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={sending || !body.trim() || !replyTo.trim()}
              className="px-3 py-1.5 text-xs rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white transition-colors disabled:opacity-50"
            >
              {sending ? 'Sending...' : '📤 Send'}
            </button>
            {sendMsg && (
              <span className={`text-xs ${sendMsg.startsWith('✓') ? 'text-emerald-400' : 'text-red-400'}`}>
                {sendMsg}
              </span>
            )}
          </div>
        </form>
      )}

      {/* Thread */}
      {loading ? (
        <p className="text-slate-500 text-sm">Loading...</p>
      ) : messages.length === 0 ? (
        <p className="text-slate-500 text-sm">No messages yet. Compose one or wait for a reply from a lead.</p>
      ) : (
        <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
          {messages.map(m => (
            <div
              key={m.id}
              className={`rounded-lg p-3 space-y-1 ${
                m.direction === 'inbound'
                  ? 'bg-cyan-500/8 border border-cyan-500/20'
                  : 'bg-white/4 border border-white/8'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-medium text-slate-300">
                    {m.direction === 'inbound' ? `📩 ${m.from_email}` : `📤 You → ${m.to_email}`}
                  </span>
                  {m.subject && (
                    <span className="text-xs text-slate-500 italic">— {m.subject}</span>
                  )}
                </div>
                <span className="text-xs text-slate-500 flex-shrink-0">{formatTime(m.created_at)}</span>
              </div>
              <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap break-words">
                {m.body_text || '(no text content)'}
              </p>
              {m.direction === 'inbound' && (
                <div className="pt-1">
                  <button
                    onClick={() => {
                      setReplyTo(m.from_email);
                      setSubject(m.subject ? `Re: ${m.subject.replace(/^Re:\s*/i, '')}` : 'Re: Ang. NIS2');
                      setShowCompose(true);
                      setTimeout(() => document.querySelector('textarea')?.focus(), 50);
                    }}
                    className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
                  >
                    ↩ Reply
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- Activity Timeline ----
function ActivityTimeline({ leadId }) {
  const [activities, setActivities] = useState([]);
  const [type, setType] = useState('note');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchActivities = useCallback(() => {
    api.get(`/activities/${leadId}`)
      .then(r => setActivities(r.data.activities))
      .catch(console.error);
  }, [leadId]);

  useEffect(() => { fetchActivities(); }, [fetchActivities]);

  async function submit(e) {
    e.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);
    try {
      await api.post(`/activities/${leadId}`, { type, title: title.trim(), body: body.trim() || undefined });
      setTitle('');
      setBody('');
      fetchActivities();
    } finally { setSubmitting(false); }
  }

  return (
    <div className="bg-navy-800 rounded-xl border border-white/10 p-5 space-y-4">
      <h2 className="text-sm font-semibold text-slate-200">Activity timeline</h2>

      {/* Log activity form */}
      <form onSubmit={submit} className="space-y-2">
        <div className="flex gap-2">
          <select
            value={type}
            onChange={e => setType(e.target.value)}
            className="bg-navy-700 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-cyan-500"
          >
            <option value="note">Note</option>
            <option value="email">Email</option>
            <option value="linkedin">LinkedIn</option>
            <option value="call">Call</option>
          </select>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Activity title..."
            className="flex-1 bg-navy-700 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
          />
          <button
            type="submit"
            disabled={submitting || !title.trim()}
            className="px-3 py-1.5 text-xs rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white transition-colors disabled:opacity-50"
          >
            Log
          </button>
        </div>
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          placeholder="Optional details..."
          rows={2}
          className="w-full bg-navy-700 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-500 resize-none focus:outline-none focus:border-cyan-500"
        />
      </form>

      {/* Timeline */}
      {activities.length === 0 ? (
        <p className="text-slate-500 text-sm">No activities yet.</p>
      ) : (
        <div className="space-y-2">
          {activities.map(a => (
            <div key={a.id} className="flex gap-3 py-2 border-b border-white/5 last:border-0">
              <span className="text-lg leading-none mt-0.5">{ACTIVITY_ICONS[a.type] || '📝'}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm text-slate-200 font-medium">{a.title || a.type}</span>
                  <span className="text-xs text-slate-500 flex-shrink-0">{formatDateTime(a.created_at)}</span>
                </div>
                {a.body && <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{a.body}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- Tasks for a lead ----
function LeadTasks({ leadId }) {
  const [tasks, setTasks] = useState([]);
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchTasks = useCallback(() => {
    api.get(`/tasks?lead_id=${leadId}&limit=50`)
      .then(r => setTasks(r.data.tasks))
      .catch(console.error);
  }, [leadId]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  async function addTask(e) {
    e.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);
    try {
      await api.post('/tasks', { lead_id: parseInt(leadId), title: title.trim(), due_date: dueDate || undefined });
      setTitle('');
      setDueDate('');
      fetchTasks();
    } finally { setSubmitting(false); }
  }

  async function toggleTask(task) {
    await api.patch(`/tasks/${task.id}`, { completed: !task.completed });
    fetchTasks();
  }

  async function deleteTask(id) {
    await api.delete(`/tasks/${id}`);
    fetchTasks();
  }

  return (
    <div className="bg-navy-800 rounded-xl border border-white/10 p-5 space-y-4">
      <h2 className="text-sm font-semibold text-slate-200">Tasks</h2>

      {/* Add task form */}
      <form onSubmit={addTask} className="flex gap-2">
        <input
          type="text"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="New task..."
          className="flex-1 bg-navy-700 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
        />
        <input
          type="date"
          value={dueDate}
          onChange={e => setDueDate(e.target.value)}
          className="bg-navy-700 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-slate-300 focus:outline-none focus:border-cyan-500"
        />
        <button
          type="submit"
          disabled={submitting || !title.trim()}
          className="px-3 py-1.5 text-xs rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white transition-colors disabled:opacity-50"
        >
          Add
        </button>
      </form>

      {/* Task list */}
      {tasks.length === 0 ? (
        <p className="text-slate-500 text-sm">No tasks yet.</p>
      ) : (
        <div className="space-y-2">
          {tasks.map(task => (
            <div key={task.id} className="flex items-center gap-3 py-1.5 border-b border-white/5 last:border-0">
              <input
                type="checkbox"
                checked={task.completed}
                onChange={() => toggleTask(task)}
                className="w-4 h-4 accent-cyan-500 cursor-pointer flex-shrink-0"
              />
              <div className="flex-1 min-w-0">
                <span className={`text-sm ${task.completed ? 'line-through text-slate-500' : 'text-slate-200'}`}>
                  {task.title}
                </span>
                {task.due_date && (
                  <span className="ml-2 text-xs text-slate-500">{formatDate(task.due_date)}</span>
                )}
              </div>
              <button
                onClick={() => deleteTask(task.id)}
                className="text-slate-600 hover:text-red-400 text-xs transition-colors"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- Contacts ----
function ContactsCard({ leadId, companyName }) {
  const [contacts, setContacts] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ name: '', title: '', email: '', phone: '', linkedin_url: '' });
  const [submitting, setSubmitting] = useState(false);

  const fetchContacts = useCallback(() => {
    api.get(`/contacts/${leadId}`)
      .then(r => setContacts(r.data.contacts || []))
      .catch(console.error);
  }, [leadId]);

  useEffect(() => { fetchContacts(); }, [fetchContacts]);

  function startEdit(contact) {
    setEditId(contact.id);
    setForm({ name: contact.name, title: contact.title || '', email: contact.email || '', phone: contact.phone || '', linkedin_url: contact.linkedin_url || '' });
    setShowForm(true);
  }

  function resetForm() {
    setShowForm(false);
    setEditId(null);
    setForm({ name: '', title: '', email: '', phone: '', linkedin_url: '' });
  }

  async function submit(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSubmitting(true);
    try {
      if (editId) {
        await api.patch(`/contacts/${editId}`, form);
      } else {
        await api.post(`/contacts/${leadId}`, form);
      }
      resetForm();
      fetchContacts();
    } finally { setSubmitting(false); }
  }

  async function deleteContact(id) {
    await api.delete(`/contacts/${id}`);
    fetchContacts();
  }

  return (
    <div className="bg-navy-800 rounded-xl border border-white/10 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-200">Contacts</h2>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
          >
            + Add contact
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={submit} className="space-y-2 border border-white/10 rounded-lg p-3 bg-navy-700/50">
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text" placeholder="Name *" value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="bg-navy-700 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
            />
            <input
              type="text" placeholder="Title (CEO, CISO...)" value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              className="bg-navy-700 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
            />
            <input
              type="email" placeholder="Email" value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              className="bg-navy-700 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
            />
            <input
              type="text" placeholder="Phone" value={form.phone}
              onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
              className="bg-navy-700 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
            />
            <input
              type="url" placeholder="LinkedIn URL" value={form.linkedin_url}
              onChange={e => setForm(f => ({ ...f, linkedin_url: e.target.value }))}
              className="col-span-2 bg-navy-700 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
            />
          </div>
          <div className="flex gap-2 pt-1">
            <button
              type="submit" disabled={submitting || !form.name.trim()}
              className="px-3 py-1.5 text-xs rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white transition-colors disabled:opacity-50"
            >
              {submitting ? 'Saving...' : editId ? 'Update' : 'Add'}
            </button>
            <button type="button" onClick={resetForm} className="text-xs text-slate-500 hover:text-slate-300 transition-colors">
              Cancel
            </button>
          </div>
        </form>
      )}

      {contacts.length === 0 && !showForm ? (
        <p className="text-slate-500 text-sm">No contacts yet.</p>
      ) : (
        <div className="space-y-2">
          {contacts.map(c => (
            <div key={c.id} className="flex items-start justify-between gap-3 py-2 border-b border-white/5 last:border-0">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => startEdit(c)}
                    className="text-sm text-slate-200 font-medium hover:text-cyan-400 transition-colors"
                  >
                    {c.name}
                  </button>
                  {c.title && (
                    <span className="text-xs bg-slate-700 text-slate-400 px-1.5 py-0.5 rounded">
                      {c.title}
                    </span>
                  )}
                  {c.linkedin_url ? (
                    <a href={c.linkedin_url} target="_blank" rel="noreferrer"
                      className="text-cyan-500 hover:text-cyan-400 text-xs" title="Open LinkedIn profile">
                      💼
                    </a>
                  ) : (
                    <button
                      onClick={() => {
                        const q = encodeURIComponent(`${c.name} ${companyName || ''}`);
                        window.open(`https://www.linkedin.com/search/results/people/?keywords=${q}`, '_blank', 'noreferrer');
                      }}
                      className="text-slate-500 hover:text-cyan-400 text-xs transition-colors"
                      title="Find on LinkedIn"
                    >
                      💼 Find
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-0.5">
                  {c.email && (
                    <a href={`mailto:${c.email}`} className="text-xs text-slate-400 hover:text-cyan-400 transition-colors">
                      {c.email}
                    </a>
                  )}
                  {c.phone && <PhoneDisplay phone={c.phone} />}
                </div>
              </div>
              <button
                onClick={() => deleteContact(c.id)}
                className="text-slate-600 hover:text-red-400 text-sm transition-colors flex-shrink-0"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- Sequences Panel ----
function SequencesPanel({ leadId }) {
  const [sequences, setSequences] = useState([]);
  const [enrollments, setEnrollments] = useState([]);
  const [selectedSeq, setSelectedSeq] = useState('');
  const [enrolling, setEnrolling] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [previewId, setPreviewId] = useState(null);

  const fetchEnrollments = useCallback(() => {
    api.get(`/sequences/enrollments/${leadId}`)
      .then(r => setEnrollments(r.data.enrollments || []))
      .catch(console.error);
  }, [leadId]);

  useEffect(() => {
    api.get('/sequences')
      .then(r => setSequences(r.data.sequences || []))
      .catch(console.error);
    fetchEnrollments();
  }, [fetchEnrollments]);

  useEffect(() => {
    if (enrollments.length > 0 && !selectedSeq) {
      setSelectedSeq(String(enrollments[0].sequence_id));
    }
  }, [enrollments]);

  async function enroll() {
    if (!selectedSeq) return;
    setEnrolling(true);
    setSuccessMsg('');
    try {
      const r = await api.post(`/sequences/${leadId}/enroll`, { sequence_id: parseInt(selectedSeq) });
      setSuccessMsg(`Enrolled — ${r.data.tasks_created} tasks created`);
      fetchEnrollments();
    } catch (err) {
      setSuccessMsg('Error: ' + (err.response?.data?.error || err.message));
    } finally { setEnrolling(false); }
  }

  const previewSequence = sequences.find(s => String(s.id) === String(previewId || selectedSeq));
  const previewSteps = previewSequence
    ? (Array.isArray(previewSequence.steps) ? previewSequence.steps : JSON.parse(previewSequence.steps || '[]'))
    : [];

  return (
    <div className="bg-navy-800 rounded-xl border border-white/10 p-5 space-y-4">
      <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-1.5">Sequences <InfoTooltip text="Enroll this lead into a multi-step outreach sequence. Each step (email, LinkedIn, call) appears in Today's Actions on the Dashboard when it's due. Email steps can be sent directly from the action queue with an AI-generated pitch. The nightly IMAP check detects replies and auto-marks the enrollment as replied." position="top" /></h2>

      {/* Active enrollments */}
      {enrollments.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs text-slate-500 uppercase tracking-wide">Active</div>
          {enrollments.map(e => {
            const steps = Array.isArray(e.steps) ? e.steps : JSON.parse(e.steps || '[]');
            return (
              <div key={e.id} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                <div>
                  <span className="text-sm text-slate-200">{e.sequence_name}</span>
                  <span className="ml-2 text-xs text-slate-500">
                    {steps.length} steps · enrolled {new Date(e.enrolled_at).toLocaleDateString('en-SE', { month: 'short', day: 'numeric' })}
                  </span>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full border ${
                  e.status === 'active' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                  e.status === 'completed' ? 'bg-slate-500/10 text-slate-400 border-slate-500/20' :
                  'bg-amber-500/10 text-amber-400 border-amber-500/20'
                }`}>{e.status}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Enroll form */}
      <div className="space-y-2">
        <div className="flex gap-2">
          <select
            value={selectedSeq}
            onChange={e => { setSelectedSeq(e.target.value); setPreviewId(null); }}
            className="flex-1 bg-navy-700 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-cyan-500"
          >
            <option value="">Select sequence...</option>
            {sequences.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <button
            onClick={enroll}
            disabled={!selectedSeq || enrolling}
            className="px-3 py-1.5 text-xs rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white transition-colors disabled:opacity-50"
          >
            {enrolling ? 'Enrolling...' : 'Enroll'}
          </button>
        </div>

        {/* Steps preview */}
        {selectedSeq && previewSteps.length > 0 && (
          <div className="bg-navy-700/50 rounded-lg p-3 space-y-1.5 border border-white/5">
            <div className="text-xs text-slate-500 mb-2">{previewSteps.length} steps preview</div>
            {previewSteps.map((step, idx) => (
              <div key={idx} className="flex items-center gap-2 text-xs">
                <span className="text-slate-600 w-10 flex-shrink-0">Day {step.day}</span>
                <span className="text-slate-500">{CHANNEL_ICONS[step.channel] || '•'}</span>
                <span className="text-slate-400">{step.title}</span>
              </div>
            ))}
          </div>
        )}

        {successMsg && (
          <p className={`text-xs ${successMsg.startsWith('Error') ? 'text-red-400' : 'text-emerald-400'}`}>
            {successMsg}
          </p>
        )}
      </div>
    </div>
  );
}

// ---- LinkedIn DM Sequence ----
const LINKEDIN_STEP_COLORS = ['blue', 'indigo', 'violet', 'purple'];

function LinkedInSequence({ lead }) {
  const [open, setOpen] = useState(false);
  const [extraContext, setExtraContext] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(null);

  async function handleGenerate() {
    setLoading(true);
    setError('');
    try {
      const r = await api.post(`/leads/${lead.id}/generate-linkedin-sequence`, { extra_context: extraContext });
      setResult(r.data.data);
    } catch {
      setError('Kunde inte generera sekvensen. Försök igen.');
    } finally {
      setLoading(false);
    }
  }

  function copyStep(idx, text) {
    navigator.clipboard.writeText(text);
    setCopied(idx);
    setTimeout(() => setCopied(null), 2000);
  }

  const stepBorderColors = ['border-blue-500/50', 'border-indigo-500/50', 'border-violet-500/50', 'border-purple-500/50'];
  const stepLabelColors = ['text-blue-300', 'text-indigo-300', 'text-violet-300', 'text-purple-300'];

  return (
    <div className="bg-blue-950/30 border border-blue-500/20 rounded-xl">
      <button onClick={() => setOpen(o => !o)} className="w-full flex justify-between items-center px-5 py-3.5 text-left rounded-t-xl">
        <span className="flex items-center gap-2 text-blue-300 font-semibold text-sm">
          💼 LinkedIn DM-sekvens
          <InfoTooltip text="Generates a 4-step LinkedIn DM sequence in Swedish: Step 1 = connection request note (≤50 words, trigger-based). Step 2 = first DM (rapport, soft CTA). Step 3 = follow-up bump (new angle or insight). Step 4 = assumptive meeting ask ('Låt oss ta 15 minuter...'). Paste triggers from 🔍 Köpsignaler for best results — copy each step directly into LinkedIn." position="bottom" />
          {result && (
            <span className="text-xs bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full font-normal">
              4 steg klara
            </span>
          )}
        </span>
        <span className="text-blue-500 text-xs">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-4">
          <div className="space-y-2">
            <label className="text-xs text-blue-400">Trigger / extra kontext (valfritt)</label>
            <textarea
              value={extraContext}
              onChange={e => setExtraContext(e.target.value)}
              placeholder="Klistra in triggers från köpsignaler, nyheter, eller annan kontext som gör kontakten relevant just nu..."
              rows={3}
              className="w-full bg-blue-950/40 border border-blue-500/30 rounded-lg px-3 py-2 text-sm text-white placeholder-blue-800 focus:outline-none focus:border-blue-400 resize-none"
            />
            <p className="text-xs text-blue-700">Tips: Kör 🔍 Köpsignaler först och klistra in triggerna här för bäst resultat</p>
          </div>

          <button
            onClick={handleGenerate}
            disabled={loading}
            className="px-4 py-2 bg-blue-700 hover:bg-blue-600 disabled:opacity-40 text-white text-sm rounded-lg font-medium transition-colors flex items-center gap-2"
          >
            {loading ? (
              <><span className="inline-block w-3 h-3 border border-white/40 border-t-white rounded-full animate-spin" /> Genererar sekvens...</>
            ) : result ? '↻ Regenerera' : '💼 Generera sekvens'}
          </button>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          {result && (
            <div className="space-y-3 mt-1">
              {result.steps.map((step, i) => (
                <div key={i} className={`bg-slate-800/60 rounded-lg p-3 border-l-2 ${stepBorderColors[i]}`}>
                  <div className="flex justify-between items-start mb-1.5">
                    <div>
                      <span className="text-xs font-bold text-slate-500 mr-2">Steg {i + 1}</span>
                      <span className={`text-xs font-semibold ${stepLabelColors[i]}`}>{step.label}</span>
                    </div>
                    <button
                      onClick={() => copyStep(i, step.message)}
                      className="text-xs text-slate-500 hover:text-slate-300 transition-colors shrink-0 ml-2"
                    >
                      {copied === i ? '✓ Kopierat' : 'Kopiera'}
                    </button>
                  </div>
                  {step.purpose && (
                    <p className="text-xs text-slate-500 italic mb-2">{step.purpose}</p>
                  )}
                  <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap">{step.message}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---- Buying Triggers ----
function BuyingTriggers({ lead }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  async function handleSearch() {
    setLoading(true);
    setError('');
    try {
      const r = await api.post(`/leads/${lead.id}/buying-triggers`);
      setResult(r.data.data);
    } catch {
      setError('Kunde inte hämta köpsignaler. Kontrollera att BRAVE_API_KEY är satt.');
    } finally {
      setLoading(false);
    }
  }

  const searchedAt = result?.searchedAt
    ? new Date(result.searchedAt).toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' })
    : null;

  return (
    <div className="bg-emerald-950/30 border border-emerald-500/20 rounded-xl">
      <button onClick={() => setOpen(o => !o)} className="w-full flex justify-between items-center px-5 py-3.5 text-left rounded-t-xl">
        <span className="flex items-center gap-2 text-emerald-300 font-semibold text-sm">
          🔍 Köpsignaler
          <InfoTooltip text="Searches Brave for real news about this company (3 parallel searches: recent news · cybersecurity/NIS2 · leadership/hiring), then uses AI to identify buying signals and explain WHY NOW is the right time to reach out. Output: company snapshot · strategic context · detected triggers with source URLs · why contact now · which roles to target. Takes ~5–8 seconds. Refresh anytime." position="bottom" />
          {result && (
            <span className="text-xs bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full font-normal">
              {result.triggers?.length || 0} triggers · {searchedAt}
            </span>
          )}
        </span>
        <span className="text-emerald-500 text-xs">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-4">
          <div className="flex items-center gap-3">
            <button
              onClick={handleSearch}
              disabled={loading}
              className="px-4 py-2 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 text-white text-sm rounded-lg font-medium transition-colors flex items-center gap-2"
            >
              {loading ? (
                <><span className="inline-block w-3 h-3 border border-white/40 border-t-white rounded-full animate-spin" /> Söker nyheter...</>
              ) : result ? '↻ Sök igen' : '🔍 Sök köpsignaler'}
            </button>
            <span className="text-xs text-emerald-600">Söker Brave Search · analyseras med AI</span>
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          {result && (
            <div className="space-y-3 mt-1">
              {/* Snapshot */}
              <div className="bg-slate-800/60 rounded-lg p-3">
                <p className="text-xs font-semibold text-slate-400 mb-1.5">🏢 Företagsöversikt</p>
                <p className="text-sm text-slate-200 leading-relaxed">{result.snapshot}</p>
              </div>

              {/* Strategic */}
              <div className="bg-slate-800/60 rounded-lg p-3">
                <p className="text-xs font-semibold text-slate-400 mb-1.5">🧭 Strategisk kontext</p>
                <p className="text-sm text-slate-200 leading-relaxed">{result.strategic}</p>
              </div>

              {/* Triggers */}
              <div className="bg-slate-800/60 rounded-lg p-3">
                <p className="text-xs font-semibold text-slate-400 mb-2">⚡ Detekterade köpsignaler</p>
                {result.triggers?.length > 0 ? (
                  <div className="space-y-3">
                    {result.triggers.map((t, i) => (
                      <div key={i} className="border-l-2 border-emerald-500/50 pl-3 space-y-1">
                        <p className="text-sm text-emerald-200 font-medium">{t.event}</p>
                        {t.when && t.when !== '—' && (
                          <p className="text-xs text-slate-400">📅 {t.when}</p>
                        )}
                        {t.url && t.url !== '—' && !t.url.includes('Ej bekräftad') && (
                          <a href={t.url} target="_blank" rel="noopener noreferrer"
                            className="text-xs text-emerald-400 hover:text-emerald-300 underline break-all">
                            🔗 {t.url}
                          </a>
                        )}
                        {t.url?.includes('Ej bekräftad') && (
                          <p className="text-xs text-slate-500 italic">Ej bekräftad offentligt</p>
                        )}
                        <p className="text-xs text-amber-300">💡 {t.why}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-400 italic">Inga specifika triggers identifierade — se strategisk kontext.</p>
                )}
              </div>

              {/* Implications */}
              <div className="bg-amber-950/30 border border-amber-500/20 rounded-lg p-3">
                <p className="text-xs font-semibold text-amber-400 mb-1.5">🎯 Varför kontakta NU</p>
                <p className="text-sm text-amber-100 leading-relaxed">{result.implications}</p>
              </div>

              {/* Personas */}
              <div className="bg-slate-800/60 rounded-lg p-3">
                <p className="text-xs font-semibold text-slate-400 mb-2">👤 Kontakta dessa roller</p>
                <div className="space-y-2">
                  {result.personas?.map((p, i) => (
                    <div key={i} className="flex gap-3">
                      <span className="text-xs text-slate-500 w-4 shrink-0">{i + 1}.</span>
                      <div>
                        <p className="text-sm text-cyan-300 font-medium">{p.title}</p>
                        <p className="text-xs text-slate-400">{p.why}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---- IT Vendor Battle Card (MS vs konkurrenter) ----
const IT_VENDORS = {
  crowdstrike: {
    name: 'CrowdStrike Falcon',
    keywords: ['crowdstrike', 'falcon'],
    color: 'orange',
    price: '~kr 300–400/endpoint/mån',
    msprice: 'Ingår i M365 Business Premium (~kr 285/user/mån total)',
    gap: 'Täcker bara endpoints — inte email, identitet eller data',
    win: 'Defender for Endpoint P2 är topprankad (Gartner/AV-TEST). Defender täcker endpoint + email + identitet + data i ett flöde. CrowdStrike kräver separat IdP + SIEM = 3 leverantörer.',
    objections: [
      { q: 'CrowdStrike är bättre än Defender', a: 'Skillnaden är marginell i EDR-rankning — men CrowdStrike täcker bara endpoints. Ni betalar för halva lösningen och saknar fortfarande email-skydd och identitetsskydd.' },
      { q: 'Vi är vana vid CrowdStrike', a: 'Det förstår jag. Men vid en NIS2-tillsyn vill ni visa ett sammanhängande ramverk — inte ett lapptäcke av verktyg. Defender + M365 ger en portal, ett avtal, en audit log.' },
    ],
    discovery: 'Vilken lösning täcker er email-säkerhet idag? Och hur korrelerar ni email-hot med endpoint-detektioner?',
  },
  okta: {
    name: 'Okta',
    keywords: ['okta'],
    color: 'blue',
    price: '~kr 185/user/mån (Essentials)',
    msprice: 'Entra ID P1 ingår i M365 Business Premium — ingen extra kostnad',
    gap: 'Kostar extra ovanpå M365 ni redan betalar för',
    win: 'Ni betalar dubbelt för IAM. Entra ID P1 ingår redan i er M365-licens. Entra P2 (PIM) kostar ~kr 80/user/mån för admins — Okta PAM kostar mångfalt mer.',
    objections: [
      { q: 'Okta är mer flexibelt', a: 'Okta är bra för multi-cloud med många olika IdP:s. Om ni primärt kör M365 är Entra native-integrerat och ingår — ni betalar kr 185/user/mån för ingenting extra.' },
      { q: 'Vi har byggt mycket i Okta', a: 'Då förstår jag att det är ett beslut. Men räkna på det: 100 users × kr 185 = kr 18 500/mån = kr 222 000/år — för något som ingår i er M365-licens.' },
    ],
    discovery: 'Hur många av era applikationer är Microsoft-baserade? Och hur hanterar ni Conditional Access för era M365-tjänster idag?',
  },
  jamf: {
    name: 'Jamf',
    keywords: ['jamf'],
    color: 'purple',
    price: '~kr 280–350/device/mån',
    msprice: 'Intune ingår i M365 Business Premium',
    gap: 'Täcker bara Mac — inte Windows, mobil eller server',
    win: 'Intune hanterar Mac, Windows och mobil i ett verktyg som redan ingår. Jamf saknar native integration med Entra och Defender — ingen samlad compliance-vy.',
    objections: [
      { q: 'Jamf är bättre för Mac', a: 'Historiskt stämmer det. Intune för Mac har kommit ikapp kraftigt sedan 2023. För en blandad miljö med Windows + Mac är Intune överlägset ur ett NIS2-perspektiv — allt syns på ett ställe.' },
      { q: 'Vi har mycket Mac', a: 'Hur stor andel är Windows vs Mac? Om ni har blandad miljö betalar ni för Jamf (Mac) + något annat för Windows. Intune täcker båda i ett.' },
    ],
    discovery: 'Hur hanterar ni era Windows-enheter idag? Och hur ser ni compliance-status för alla enheter samlat — Mac och Windows?',
  },
  sophos: {
    name: 'Sophos / ESET',
    keywords: ['sophos', 'eset', 'intercept x'],
    color: 'red',
    price: '~kr 180–250/user/mån',
    msprice: 'Defender for Business ingår i M365 Business Premium',
    gap: 'Täcker bara endpoints — byggt för en era av fil- och USB-hot',
    win: 'Moderna hot (phishing, credential theft) kräver korrelation mellan email, identitet och endpoint. Sophos/ESET klarar inte det utan ytterligare produkter. Defender täcker hela ytan och är topprankad av AV-TEST.',
    objections: [
      { q: 'Vi har alltid haft Sophos', a: 'Det fungerar säkert för grundläggande skydd. Men NIS2 kräver att ni kan korrelera hot över hela miljön — email + identitet + endpoint. Det klarar inte Sophos utan en SIEM och ytterligare produkter.' },
      { q: 'ESET är billigare', a: 'ESET är billigare än Sophos — men fortfarande kr 150–200/user/mån för bara endpoint. Defender ingår i er M365-licens och täcker mer.' },
    ],
    discovery: 'Hur hanterar ni email-säkerhet och phishing-skydd idag? Och om en användare klickar på en phishing-länk — hur lång tid tar det innan ni märker det?',
  },
  google: {
    name: 'Google Workspace',
    keywords: ['google workspace', 'google apps', 'gsuite', 'g suite', 'gmail'],
    color: 'yellow',
    price: '~kr 220/user/mån (Business Plus)',
    msprice: 'M365 Business Premium ~kr 285/user/mån — men inkluderar EDR, MDM och IAM',
    gap: 'Saknar EDR, fullständigt MDM och PIM — måste köpas separat (totalt ~kr 1 000/user/mån)',
    win: 'Google är billigare för email. För NIS2 behöver en Google-kund lägga till CrowdStrike + Okta + Jamf = kr 785 extra per user. Totalt kr 1 005/user vs M365 kr 285/user.',
    objections: [
      { q: 'Google är billigare', a: 'Google är billigare för email och kalender — kr 65/user/mån mindre. Men för NIS2 behöver ni lägga till EDR, MDM och IAM. Då är Google 3x dyrare totalt.' },
      { q: 'Vi är vana vid Google', a: 'Många är det. Frågan är om ni vill betala kr 720 extra per user per månad och hantera 4 leverantörsrelationer för att bibehålla den vanan.' },
    ],
    discovery: 'Hur hanterar ni endpoint-skydd och enhetshantering idag? Och vad använder ni för MFA och Conditional Access?',
  },
};

function detectVendor(lead) {
  const searchText = [
    lead?.notes || '',
    lead?.outreach_angle || '',
    lead?.tech_stack || '',
    lead?.extra_context || '',
  ].join(' ').toLowerCase();

  if (!searchText.trim()) return null;
  for (const [key, vendor] of Object.entries(IT_VENDORS)) {
    if (vendor.keywords.some(kw => searchText.includes(kw))) return { key, ...vendor };
  }
  return null;
}

const VENDOR_COLORS = {
  orange: { bg: 'bg-orange-950/30', border: 'border-orange-500/20', title: 'text-orange-300', badge: 'bg-orange-500/20 text-orange-300', pill: 'bg-orange-500/10 text-orange-200 border-orange-500/20' },
  blue:   { bg: 'bg-blue-950/30',   border: 'border-blue-500/20',   title: 'text-blue-300',   badge: 'bg-blue-500/20 text-blue-300',   pill: 'bg-blue-500/10 text-blue-200 border-blue-500/20' },
  purple: { bg: 'bg-purple-950/30', border: 'border-purple-500/20', title: 'text-purple-300', badge: 'bg-purple-500/20 text-purple-300', pill: 'bg-purple-500/10 text-purple-200 border-purple-500/20' },
  red:    { bg: 'bg-red-950/30',    border: 'border-red-500/20',    title: 'text-red-300',    badge: 'bg-red-500/20 text-red-300',    pill: 'bg-red-500/10 text-red-200 border-red-500/20' },
  yellow: { bg: 'bg-yellow-950/30', border: 'border-yellow-500/20', title: 'text-yellow-300', badge: 'bg-yellow-500/20 text-yellow-300', pill: 'bg-yellow-500/10 text-yellow-200 border-yellow-500/20' },
};

function VendorBattleCard({ lead }) {
  const [open, setOpen] = useState(true);
  const [manualVendor, setManualVendor] = useState('');
  const detected = detectVendor(lead);
  const selected = manualVendor ? IT_VENDORS[manualVendor] : detected;
  const c = selected ? VENDOR_COLORS[selected.color] : null;

  return (
    <div className={`border rounded-xl ${selected ? `${c.bg} ${c.border}` : 'bg-slate-900/40 border-slate-700/30'}`}>
      <button onClick={() => setOpen(o => !o)} className="w-full flex justify-between items-center px-5 py-3.5 text-left">
        <span className={`flex items-center gap-2 font-semibold text-sm ${selected ? c.title : 'text-slate-400'}`}>
          🛡️ IT-vendor Battle Card
          {selected && <span className={`text-xs px-2 py-0.5 rounded-full font-normal ${c.badge}`}>{selected.name}</span>}
          {!selected && <span className="text-xs text-slate-500 font-normal">— ange verktyg i notes för auto-detektering</span>}
        </span>
        <span className={`text-xs ${selected ? c.title : 'text-slate-500'}`}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-4">
          {/* Manual vendor selector */}
          <div className="flex gap-2 flex-wrap">
            {Object.entries(IT_VENDORS).map(([key, v]) => (
              <button key={key}
                onClick={() => setManualVendor(manualVendor === key ? '' : key)}
                className={`text-xs px-3 py-1 rounded-full border transition-all ${
                  (manualVendor === key || (!manualVendor && detected?.key === key))
                    ? `${VENDOR_COLORS[v.color].pill} border font-semibold`
                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500'
                }`}>
                {v.name}
              </button>
            ))}
          </div>

          {selected ? (
            <div className="space-y-3">
              {/* Price comparison */}
              <div className={`rounded-lg p-3 border ${c.pill} border-opacity-30`}>
                <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">💰 Kostnadsjämförelse</div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <div className={`font-semibold mb-1 ${c.title}`}>{selected.name}</div>
                    <div className="text-slate-300">{selected.price}</div>
                  </div>
                  <div>
                    <div className="font-semibold text-green-400 mb-1">Microsoft</div>
                    <div className="text-slate-300">{selected.msprice}</div>
                  </div>
                </div>
              </div>

              {/* Gap */}
              <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/30">
                <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">⚠️ Deras gap</div>
                <div className="text-sm text-slate-200">{selected.gap}</div>
              </div>

              {/* Win argument */}
              <div className="bg-green-950/30 rounded-lg p-3 border border-green-500/20">
                <div className="text-xs font-semibold text-green-400 uppercase tracking-wide mb-1">✅ Så vinner vi</div>
                <div className="text-sm text-slate-200 leading-relaxed">{selected.win}</div>
              </div>

              {/* Objections */}
              <div className="space-y-2">
                <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide">💬 Vanliga invändningar</div>
                {selected.objections.map((o, i) => (
                  <div key={i} className="bg-slate-800/40 rounded-lg p-3 border border-slate-700/20 text-xs space-y-1">
                    <div className={`font-semibold ${c.title}`}>"{o.q}"</div>
                    <div className="text-slate-300 leading-relaxed">→ {o.a}</div>
                  </div>
                ))}
              </div>

              {/* Discovery question */}
              <div className="bg-violet-950/30 rounded-lg p-3 border border-violet-500/20">
                <div className="text-xs font-semibold text-violet-400 uppercase tracking-wide mb-1">🎯 Öppningsfråga under samtalet</div>
                <div className="text-sm text-slate-200 italic">"{selected.discovery}"</div>
              </div>
            </div>
          ) : (
            <div className="text-xs text-slate-500 text-center py-4">
              Välj ett verktyg ovan — eller skriv t.ex. "kör CrowdStrike" i notes-fältet för auto-detektering.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---- Battle Card ----
const COMMON_COMPETITORS = ['Truesec', 'Secify', 'Advania', 'CGI', 'Atea', 'KPMG', 'PwC', 'Cygate'];

function BattleCard({ lead }) {
  const [open, setOpen] = useState(false);
  const [competitor, setCompetitor] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  async function handleGenerate() {
    if (!competitor.trim()) return;
    setLoading(true);
    setError('');
    try {
      const r = await api.post(`/leads/${lead.id}/generate-battle-card`, { competitor_name: competitor.trim() });
      setResult(r.data.data);
    } catch {
      setError('Kunde inte generera battle card. Försök igen.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-rose-950/30 border border-rose-500/20 rounded-xl">
      <button onClick={() => setOpen(o => !o)} className="w-full flex justify-between items-center px-5 py-3.5 text-left rounded-t-xl">
        <span className="flex items-center gap-2 text-rose-300 font-semibold text-sm">
          ⚔️ Battle Card
          <InfoTooltip text="Generates a 7-section competitive battle card for any named competitor: snapshot · their real strengths · weaknesses & gaps · how we win · 3 objections with rebuttals · 4 trap-setting discovery questions (expose weaknesses without naming them) · 3 punchy one-liners. All in Swedish. Quick-select: Truesec, Secify, Advania, CGI, Atea, KPMG, PwC, Cygate." position="bottom" />
          {result && (
            <span className="text-xs bg-rose-500/20 text-rose-300 px-2 py-0.5 rounded-full font-normal">
              {result.competitor}
            </span>
          )}
        </span>
        <span className="text-rose-500 text-xs">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-4">
          {/* Input */}
          <div className="space-y-2">
            <label className="text-xs text-rose-400">Ange konkurrent</label>
            <div className="flex gap-2">
              <input
                value={competitor}
                onChange={e => setCompetitor(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleGenerate()}
                placeholder="t.ex. Truesec, Secify, KPMG..."
                className="flex-1 bg-rose-950/40 border border-rose-500/30 rounded-lg px-3 py-2 text-sm text-white placeholder-rose-700 focus:outline-none focus:border-rose-400"
              />
              <button
                onClick={handleGenerate}
                disabled={loading || !competitor.trim()}
                className="px-4 py-2 bg-rose-700 hover:bg-rose-600 disabled:opacity-40 text-white text-sm rounded-lg font-medium transition-colors whitespace-nowrap"
              >
                {loading ? '⏳' : result ? '↻ Ny' : '⚔️ Generera'}
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {COMMON_COMPETITORS.map(c => (
                <button
                  key={c}
                  onClick={() => setCompetitor(c)}
                  className="text-xs px-2 py-1 bg-rose-900/40 hover:bg-rose-800/50 text-rose-400 border border-rose-700/30 rounded-md transition-colors"
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          {result && (
            <div className="space-y-3 mt-1">
              {/* Snapshot */}
              <div className="bg-slate-800/60 rounded-lg p-3">
                <p className="text-xs font-semibold text-slate-400 mb-1.5">🎯 Snapshot — {result.competitor}</p>
                <p className="text-sm text-slate-200 leading-relaxed">{result.snapshot}</p>
              </div>

              {/* Strengths */}
              <div className="bg-slate-800/60 rounded-lg p-3">
                <p className="text-xs font-semibold text-slate-400 mb-1.5">💪 Deras styrkor (ärlig bild)</p>
                <ul className="space-y-1">
                  {result.strengths.map((s, i) => (
                    <li key={i} className="text-sm text-amber-300 flex gap-2"><span className="opacity-40 shrink-0">•</span>{s}</li>
                  ))}
                </ul>
              </div>

              {/* Weaknesses */}
              <div className="bg-slate-800/60 rounded-lg p-3">
                <p className="text-xs font-semibold text-slate-400 mb-1.5">🔓 Svagheter & luckor</p>
                <ul className="space-y-1">
                  {result.weaknesses.map((w, i) => (
                    <li key={i} className="text-sm text-rose-300 flex gap-2"><span className="opacity-40 shrink-0">•</span>{w}</li>
                  ))}
                </ul>
              </div>

              {/* Differentiation */}
              <div className="bg-slate-800/60 rounded-lg p-3">
                <p className="text-xs font-semibold text-slate-400 mb-1.5">🏆 Hur vi vinner</p>
                <ul className="space-y-1">
                  {result.differentiation.map((d, i) => (
                    <li key={i} className="text-sm text-emerald-300 flex gap-2"><span className="opacity-40 shrink-0">•</span>{d}</li>
                  ))}
                </ul>
              </div>

              {/* Objections */}
              <div className="bg-slate-800/60 rounded-lg p-3">
                <p className="text-xs font-semibold text-slate-400 mb-2">🛡️ Invändningar & svar</p>
                <div className="space-y-3">
                  {result.objections.map((o, i) => (
                    <div key={i}>
                      <p className="text-sm text-rose-300 font-medium mb-1">"{o.objection}"</p>
                      <p className="text-sm text-emerald-200 pl-3 border-l-2 border-emerald-500/40 leading-relaxed">{o.rebuttal}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Trap questions */}
              <div className="bg-slate-800/60 rounded-lg p-3">
                <p className="text-xs font-semibold text-slate-400 mb-1.5">🎣 Avslöjande frågor</p>
                <ul className="space-y-1.5">
                  {result.questions.map((q, i) => (
                    <li key={i} className="text-sm text-cyan-300 flex gap-2"><span className="opacity-40 shrink-0">•</span>{q}</li>
                  ))}
                </ul>
              </div>

              {/* Soundbites */}
              <div className="bg-slate-800/60 rounded-lg p-3">
                <p className="text-xs font-semibold text-slate-400 mb-1.5">⚡ Snabba one-liners</p>
                <ul className="space-y-1.5">
                  {result.soundbites.map((s, i) => (
                    <li key={i} className="text-sm text-violet-300 flex gap-2"><span className="opacity-40 shrink-0">•</span>{s}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---- Main component ----
export default function LeadDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [lead, setLead] = useState(null);
  const [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState('');
  const [competitorIntel, setCompetitorIntel] = useState('');
  const [status, setStatus] = useState('new');
  const [editingInfo, setEditingInfo] = useState(false);
  const [infoEdits, setInfoEdits] = useState({});
  const [savingInfo, setSavingInfo] = useState(false);
  const [dealValue, setDealValue] = useState('');
  const [schedulerUrl, setSchedulerUrl] = useState('');
  const [generatingPitch, setGeneratingPitch] = useState(false);
  const [pitchError, setPitchError] = useState('');
  const [fetchingReport, setFetchingReport] = useState(false);
  const [reportMsg, setReportMsg] = useState('');
  const [showSimulator, setShowSimulator] = useState(false);

  useEffect(() => {
    api.get(`/leads/${id}`).then(({ data }) => {
      setLead(data.lead);
      setNotes(data.lead.notes || '');
      setCompetitorIntel(data.lead.competitor_intel || '');
      setStatus(data.lead.review_status || 'new');
      setDealValue(data.lead.estimated_value_sek || '');
      setSchedulerUrl(data.lead.scheduler_url || '');
    }).catch(console.error);
  }, [id]);

  async function saveDealField(field, value) {
    await api.patch(`/leads/${id}`, { [field]: value || null }).catch(console.error);
  }

  async function save() {
    setSaving(true);
    try {
      const angle = getPitchAngle(lead);
      await api.patch(`/leads/${id}`, { notes, competitor_intel: competitorIntel, review_status: status, outreach_angle: angle });
      setLead(l => ({ ...l, notes, competitor_intel: competitorIntel, review_status: status, outreach_angle: angle }));
    } finally { setSaving(false); }
  }

  async function fetchAnnualReport() {
    setFetchingReport(true);
    setReportMsg('');
    try {
      const { data } = await api.post(`/leads/${id}/fetch-annual-report`, {});
      if (data.success) {
        setLead(l => ({ ...l, ...data.data }));
        setReportMsg(`✓ ${data.data.annual_report_year} — Revenue: ${(data.data.revenue_sek/1000000).toFixed(1)} MSEK · Profit: ${(data.data.profit_sek/1000000).toFixed(1)} MSEK · ${data.data.num_employees_exact} employees`);
      } else {
        // Fetch failed — re-load lead from DB in case data was saved in a previous attempt
        const refreshed = await api.get(`/leads/${id}`);
        const freshLead = refreshed.data.lead;
        setLead(freshLead);
        if (freshLead.revenue_sek) {
          setReportMsg(`✓ Showing saved data from ${freshLead.annual_report_year}`);
        } else {
          setReportMsg('No financial data found on allabolag.se');
        }
      }
    } catch (err) {
      setReportMsg('Error: ' + err.message);
    } finally { setFetchingReport(false); }
  }

  async function generatePitch() {
    setGeneratingPitch(true);
    setPitchError('');
    try {
      const { data } = await api.post(`/leads/${id}/generate-pitch`, {});
      setLead(l => ({ ...l, outreach_angle: data.email }));
    } catch (err) {
      const msg = err.message || '';
      if (msg.includes('ANTHROPIC_API_KEY') || msg.includes('not configured')) {
        setPitchError('Add ANTHROPIC_API_KEY to backend .env to enable');
      } else {
        setPitchError('Error: ' + msg);
      }
    } finally { setGeneratingPitch(false); }
  }

  async function logOutreach(channel) {
    await api.post(`/leads/${id}/outreach`, { channel, message: lead.outreach_angle });
    // Also log as activity
    await api.post(`/activities/${id}`, {
      type: channel,
      title: `${channel.charAt(0).toUpperCase() + channel.slice(1)} outreach`,
      body: lead.outreach_angle || undefined,
    });
    setStatus('contacted');
    setLead(l => ({ ...l, review_status: 'contacted' }));
  }

  if (!lead) return <div className="p-8 text-slate-400">Loading...</div>;

  const pitchAngle = getPitchAngle(lead);

  return (
    <div className="p-4 sm:p-8 max-w-4xl space-y-6">
      {showSimulator && <CallSimulator lead={lead} onClose={() => setShowSimulator(false)} />}
      <div>
        <button onClick={() => navigate('/leads')} className="text-slate-500 hover:text-slate-300 text-sm mb-2 transition-colors">
          ← Back
        </button>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-100">{lead.company_name}</h1>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              <span className={`text-sm font-semibold ${
                lead.score_label === 'hot' ? 'text-red-400' :
                lead.score_label === 'warm' ? 'text-amber-400' : 'text-blue-400'
              }`}>Score: {lead.score ?? '—'}</span>
              {lead.nis2_registered && <span className="text-xs bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 px-2 py-0.5 rounded-full">NIS2 registered</span>}
              <span className="text-xs text-slate-500">{lead.org_nr}</span>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => {
                logOutreach('linkedin');
                if (lead.linkedin_url) {
                  window.open(lead.linkedin_url, '_blank', 'noreferrer');
                } else {
                  window.open(`https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(lead.company_name)}`, '_blank', 'noreferrer');
                }
              }}
              title={lead.linkedin_url ? 'Open LinkedIn profile' : 'Search on LinkedIn'}
              className={`px-3 py-2 text-xs rounded-lg text-white transition-colors ${lead.linkedin_url ? 'bg-sky-600 hover:bg-sky-500' : 'bg-cyan-600 hover:bg-cyan-500'}`}>
              💼 {lead.linkedin_url ? 'LinkedIn' : 'Find LinkedIn'}
            </button>
            <button
              onClick={() => {
                logOutreach('email');
                if (lead.email) window.location.href = `mailto:${lead.email}`;
              }}
              title={lead.email || 'No email yet'}
              className={`px-3 py-2 text-xs rounded-lg text-white transition-colors ${lead.email ? 'bg-blue-600 hover:bg-blue-500' : 'bg-cyan-600 hover:bg-cyan-500'}`}>
              📧 {lead.email ? 'Email' : 'No email'}
            </button>
            <CallButton phone={lead.phone} onLog={() => logOutreach('phone')} />
            <button
              onClick={() => setShowSimulator(true)}
              className="px-3 py-2 text-xs rounded-lg bg-red-600/80 hover:bg-red-500 text-white transition-colors font-medium"
              title="Practice this cold call with AI">
              🎯 Practice call
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left column: Company info + Contacts */}
        <div className="space-y-4">
          <div className="bg-navy-800 rounded-xl border border-white/10 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-200">Company information</h2>
              {!editingInfo ? (
                <button
                  onClick={() => { setInfoEdits({ email: lead.email || '', phone: lead.phone || '', website: lead.website || '', linkedin_url: lead.linkedin_url || '' }); setEditingInfo(true); }}
                  className="text-xs text-slate-500 hover:text-slate-200 px-2 py-1 rounded hover:bg-white/8 transition-colors"
                >✏️ Edit</button>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={async () => {
                      setSavingInfo(true);
                      try {
                        const { data } = await api.patch(`/leads/${id}`, infoEdits);
                        setLead(l => ({ ...l, ...data.lead }));
                        setEditingInfo(false);
                      } catch (err) { console.error(err); }
                      setSavingInfo(false);
                    }}
                    disabled={savingInfo}
                    className="text-xs px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white transition-colors disabled:opacity-50"
                  >{savingInfo ? 'Saving…' : 'Save'}</button>
                  <button onClick={() => setEditingInfo(false)} className="text-xs px-2 py-1 rounded bg-white/8 text-slate-400 hover:text-slate-200 transition-colors">Cancel</button>
                </div>
              )}
            </div>

            {editingInfo ? (
              <div className="space-y-2">
                {[
                  ['Email', 'email', 'email'],
                  ['Phone', 'phone', 'tel'],
                  ['Website', 'website', 'url'],
                  ['LinkedIn URL', 'linkedin_url', 'url'],
                ].map(([label, field, type]) => (
                  <div key={field}>
                    <label className="text-xs text-slate-500 block mb-0.5">{label}</label>
                    <input
                      type={type}
                      value={infoEdits[field]}
                      onChange={e => setInfoEdits(p => ({ ...p, [field]: e.target.value }))}
                      placeholder={`Enter ${label.toLowerCase()}`}
                      className="w-full bg-navy-700 border border-white/15 rounded-lg px-3 py-1.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500/50"
                    />
                  </div>
                ))}
              </div>
            ) : (
              <>
                {[
                  ['Website', lead.website ? <a href={lead.website} target="_blank" rel="noreferrer" className="text-cyan-400 hover:underline truncate block max-w-full">{lead.website}</a> : '—'],
                  ['Email', lead.email ? <a href={`mailto:${lead.email}`} className="text-cyan-400 hover:underline">{lead.email}</a> : '—'],
                  ['Phone', lead.phone ? <PhoneDisplay phone={lead.phone} /> : '—'],
                  ['LinkedIn', lead.linkedin_url ? <a href={lead.linkedin_url} target="_blank" rel="noreferrer" className="text-cyan-400 hover:underline">Profile</a> : '—'],
                  ['Address', [lead.address, lead.postal_code, lead.city].filter(Boolean).join(', ') || '—'],
                  ['County', lead.county || '—'],
                  ['Employees', lead.num_employees_exact ? `${lead.num_employees_exact} (exact)` : lead.employee_range || '—'],
                  ['Revenue', lead.revenue_sek ? `${(lead.revenue_sek/1000000).toFixed(1)} MSEK (${lead.annual_report_year})` : lead.revenue_range || '—'],
                  ['Profit', lead.profit_sek ? <span className={lead.profit_sek >= 0 ? 'text-emerald-400' : 'text-red-400'}>{(lead.profit_sek/1000000).toFixed(1)} MSEK</span> : '—'],
                  ['SNI/NACE', lead.nace_code ? `${lead.nace_code} — ${lead.nace_description || ''}` : '—'],
                  ['NIS2 sector', lead.nis2_sector || '—'],
                ].map(([label, val]) => (
                  <div key={label} className="flex justify-between text-sm">
                    <span className="text-slate-500">{label}</span>
                    <span className="text-slate-300 text-right max-w-[60%]">{val}</span>
                  </div>
                ))}
              </>
            )}

            <div className="pt-2 border-t border-white/5">
              <button
                onClick={fetchAnnualReport}
                disabled={fetchingReport}
                className="w-full px-3 py-2 text-xs rounded-lg bg-white/5 border border-white/10 text-slate-400 hover:text-slate-200 hover:bg-white/10 transition-colors disabled:opacity-50"
              >
                {fetchingReport ? 'Fetching...' : lead.annual_report_fetched_at ? '↻ Refresh årsredovisning' : '📊 Fetch årsredovisning (allabolag.se)'}
              </button>
              {reportMsg && (
                <p className={`text-xs mt-1.5 ${reportMsg.startsWith('✓') ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {reportMsg}
                </p>
              )}
            </div>
          </div>
          <ContactsCard leadId={id} companyName={lead.company_name} />
        </div>

        {/* Right column: Score breakdown + Status */}
        <div className="space-y-4">
          <div className="bg-navy-800 rounded-xl border border-white/10 p-5">
            <h2 className="text-sm font-semibold text-slate-200 mb-3 flex items-center gap-1.5">Score breakdown <InfoTooltip text="Total score out of 100 determines lead tier: Hot ≥70 · Warm ≥40 · Cold below 40. Points awarded for: NIS2 registration (+30) · target NACE sector (+20) · employees 50–249 (+25) · email found (+15) · phone (+3) · website (+5) · LinkedIn (+5). Enrichment data (Vibe) adds bonus points. Higher score = better NIS2 fit + more urgency." position="bottom" /></h2>
            {lead.score_breakdown && Object.entries(lead.score_breakdown).map(([group, items]) => (
              Object.keys(items).length > 0 ? (
                <div key={group} className="mb-3">
                  <div className="text-xs text-slate-500 font-medium uppercase tracking-wide mb-1">
                    {{ company_fit: 'Company fit', contact_data: 'Contact data', compliance: 'Compliance' }[group] || group}
                  </div>
                  {Object.entries(items).map(([key, val]) => (
                    <div key={key} className="flex justify-between text-xs py-0.5">
                      <span className="text-slate-400">
                        {{ target_nace: 'Target sector (NACE)', nis2_registered: 'NIS2 registered', employee_range: 'Employee count (50–249)', has_email: 'Email found', has_phone: 'Phone found', has_website: 'Website found', has_linkedin: 'LinkedIn found' }[key] || key.replace(/_/g, ' ')}
                      </span>
                      <span className={val > 0 ? 'text-emerald-400' : 'text-slate-600'}>{val > 0 ? `+${val}` : '—'}</span>
                    </div>
                  ))}
                </div>
              ) : null
            ))}
          </div>

          {/* Status */}
          <div className="bg-navy-800 rounded-xl border border-white/10 p-5 space-y-3">
            <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-1.5">Lead status <InfoTooltip text="Track where this lead is in your pipeline. New = untouched. Contacted = you've reached out at least once (auto-set when you click LinkedIn/Email/Call). Qualified = confirmed interest or fit. Rejected = not a fit. Customer = deal closed. Pipeline counts on the Dashboard update in real time." position="bottom" /></h2>
            <select value={status} onChange={async e => {
                const newStatus = e.target.value;
                setStatus(newStatus);
                setLead(l => ({ ...l, review_status: newStatus }));
                try {
                  await api.patch(`/leads/${id}`, { review_status: newStatus });
                } catch (err) {
                  console.error('status save failed:', err.message);
                }
              }}
              className="w-full bg-navy-700 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200">
              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {/* Deal */}
          <div className="bg-navy-800 rounded-xl border border-white/10 p-5 space-y-3">
            <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-1.5">Deal <InfoTooltip text="Set the estimated deal value in SEK — this feeds the Pipeline Revenue forecast on the Dashboard (weighted by stage probability: New 5% · Contacted 20% · Qualified 50% · Customer 100%). Add your scheduler link (cal.com, Calendly, etc.) so you can share it quickly during outreach." position="bottom" /></h2>
            <div className="space-y-2">
              <label className="block text-xs text-slate-500">Estimated value (SEK)</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={dealValue}
                  onChange={e => setDealValue(e.target.value)}
                  onBlur={() => saveDealField('estimated_value_sek', dealValue ? parseInt(dealValue) : null)}
                  placeholder="e.g. 75000"
                  className="flex-1 bg-navy-700 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500"
                />
                <span className="text-xs text-slate-500">SEK</span>
              </div>
              {dealValue && (
                <div className="text-xs text-emerald-400">{parseInt(dealValue).toLocaleString('sv-SE')} kr</div>
              )}
            </div>
            <div className="space-y-2">
              <label className="block text-xs text-slate-500">Scheduler / meeting link</label>
              <input
                type="url"
                value={schedulerUrl}
                onChange={e => setSchedulerUrl(e.target.value)}
                onBlur={() => saveDealField('scheduler_url', schedulerUrl)}
                placeholder="https://cal.com/your-link"
                className="w-full bg-navy-700 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500"
              />
              {schedulerUrl && (
                <a href={schedulerUrl} target="_blank" rel="noreferrer"
                  className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors">
                  📅 Open booking link →
                </a>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Call script */}
      <CallScript lead={lead} />

      {/* Meeting agenda */}
      <MeetingAgenda lead={lead} />

      {/* Discovery brief */}
      <DiscoveryBrief lead={lead} />

      {/* Meeting follow-up */}
      <MeetingRecap lead={lead} />

      {/* Email sequence */}
      <EmailSequence lead={lead} />

      {/* Call analysis */}
      <CallAnalysis lead={lead} />

      {/* Buying triggers */}
      <BuyingTriggers lead={lead} />

      {/* LinkedIn DM sequence */}
      <LinkedInSequence lead={lead} />

      {/* Battle card */}
      <VendorBattleCard lead={lead} />
      <BattleCard lead={lead} />

      {/* Pitch angle */}
      <div className="bg-cyan-500/5 border border-cyan-500/20 rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-cyan-400 flex items-center gap-1.5">NIS2 Pitch Angle <InfoTooltip text="A one-paragraph NIS2 outreach angle tailored to this company's sector, employee size, and compliance status. Used as the opening hook for cold calls, emails, and LinkedIn messages. Saved to the lead — regenerate anytime if the angle needs refreshing. Based on 23 SNI sector hooks mapped to NIS2 compliance urgency." position="top" /></h2>
          <button
            onClick={generatePitch}
            disabled={generatingPitch}
            className="px-3 py-1.5 text-xs rounded-lg bg-cyan-600/80 hover:bg-cyan-500 text-white transition-colors disabled:opacity-50 flex items-center gap-1.5"
          >
            {generatingPitch ? (
              <>
                <span className="inline-block w-3 h-3 border border-white/40 border-t-white rounded-full animate-spin" />
                Generating...
              </>
            ) : (
              <>✨ Generate with AI</>
            )}
          </button>
        </div>
        {pitchError && (
          <p className={`text-xs mb-2 ${pitchError.startsWith('Add') ? 'text-amber-400' : 'text-red-400'}`}>
            {pitchError}
          </p>
        )}
        <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{lead.outreach_angle || pitchAngle}</p>
      </div>

      {/* Sequences */}
      <SequencesPanel leadId={id} />

      {/* Notes + Competitor Intel */}
      <div className="bg-navy-800 rounded-xl border border-white/10 p-5 space-y-3">
        <h2 className="text-sm font-semibold text-slate-200">Notes</h2>
        <textarea
          value={notes} onChange={e => setNotes(e.target.value)}
          rows={4} placeholder="Add notes about this prospect..."
          className="w-full bg-navy-700 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 resize-none focus:outline-none focus:border-cyan-500"
        />
        <div>
          <label className="text-xs text-slate-400 block mb-1">🛡️ Known security vendor / competitor intel</label>
          <input
            type="text"
            value={competitorIntel}
            onChange={e => setCompetitorIntel(e.target.value)}
            placeholder="e.g. Truesec for pen tests, Advania M365 partner..."
            className="w-full bg-navy-700 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500"
          />
        </div>
        {lead?.tech_stack && (
          <p className="text-xs text-blue-400">
            📧 Detected stack: <span className="font-semibold">{lead.tech_stack === 'microsoft365' ? 'Microsoft 365' : lead.tech_stack}</span>
            {lead.tech_stack === 'microsoft365' && <span className="ml-2 text-slate-400">→ M365 NIS2 Security sequence recommended</span>}
          </p>
        )}
        <button onClick={save} disabled={saving}
          className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-sm rounded-lg transition-colors disabled:opacity-50">
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>

      {/* Messages — email thread with reply */}
      <MessagesPanel leadId={id} leadEmail={lead?.email} />

      {/* Activity timeline */}
      <ActivityTimeline leadId={id} />

      {/* Tasks */}
      <LeadTasks leadId={id} />
    </div>
  );
}
