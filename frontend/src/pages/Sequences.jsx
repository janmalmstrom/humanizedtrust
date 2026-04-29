import React, { useEffect, useState } from 'react';
import { api } from '../api';

const PLAYBOOK_SECTIONS = [
  {
    id: 'idea',
    title: 'Idén, kort och gott',
    icon: '💡',
    content: `LinkedIn är fullt av köpsignaler. Varje gång någon kommenterar eller reagerar på ett inlägg i din bransch räcker de i praktiken upp handen. Ämnet är top of mind just nu.\n\nDe flesta säljare ignorerar signalen och skickar kalla pitchar till främlingar. Playbooken gör tvärtom: låt andras innehåll göra prospekteringen åt dig, och hör av dig med kontext.`,
  },
  {
    id: 'manual',
    title: 'Så kör du playbooken manuellt',
    icon: '🛠️',
    steps: [
      { num: '1', title: 'Välj dina källor', body: 'Lista 3 LinkedIn-profiler eller företagssidor som din idealkund engagerar sig i. Med tiden skalar du upp till tiotals — konkurrenter, komplementära leverantörer, branschprofiler, fackmedia och egna thought leaders. Källorna är playbookens motor. Bättre källor ger varmare leads.' },
      { num: '2', title: 'Bevaka inläggen', body: 'Gå igenom källornas inlägg dagligen eller några gånger i veckan. För varje inlägg som rör ditt problemområde: notera vilka som kommenterar och reagerar.' },
      { num: '3', title: 'Filtrera signalen', body: 'Allt engagemang är inte leads. Titta på titel, senioritet och bolag. Sålla bort 1st-degree och fokusera på 2nd och 3rd. Kommentarer är en starkare signal än reaktioner.' },
      { num: '4', title: 'Hör av dig vid rätt tillfälle', body: 'Du behöver inte nämna exakt vilket inlägg de interagerat med — det kan snabbt kännas för mycket från en främling. Håll första meddelandet kort, öppna ett samtal kring problemet du löser och låt timingen göra jobbet.' },
      { num: '5', title: 'Följ upp i sekvens', body: 'Kontaktförfrågan → uppföljning efter 3 dagar → värdemeddelande efter en vecka → videomeddelande efter två veckor. Så fort någon bokar möte lyfts de ur sekvensen.' },
    ],
  },
  {
    id: 'scale',
    title: 'Varför det inte skalar manuellt',
    icon: '⚠️',
    content: `Att bevaka källorna, skrapa engagemang och filtrera bort bruset tar timmar varje vecka, per källa. Du missar alltid inlägg — särskilt runt helger och semestrar. Det blir snabbt svårt att hålla reda på vem du redan kontaktat. Och så fort du passerar fem, tio källor blir det ohanterligt.\n\nPlaybooken funkar, men bara om någon faktiskt kör den varje dag.`,
  },
  {
    id: 'automate',
    title: 'Automatisera med Vaam',
    icon: '🤖',
    steps: [
      { num: '1', title: 'Skapa en trigger', body: 'En trigger är en bevakning av en källa. Välj typ: Företagsinlägg (bevakar en sida och fångar alla som engagerar sig) eller Profilinlägg (bevakar en enskild profil).' },
      { num: '2', title: 'Sätt filtret', body: 'Bestäm exakt vilken signal som räknas: engagemangstyp (kommentar/reaktion/båda), kopplingsgrad (1st/2nd/3rd), beslutsfattartitlar du vill rikta dig mot, och bevakningslängd per inlägg (3–30 dagar).' },
      { num: '3', title: 'Koppla till en sekvens', body: 'Välj vilket utskicksflöde matchade prospects ska landa i. Typisk sekvens: kontaktförfrågan → textmeddelande → videomeddelande → uppföljning. Samma logik som manuellt, bara automatiserad.' },
      { num: '4', title: 'Godkännandesteget (valfritt)', body: 'Aktivera "kräver godkännande" så landar matchade prospects i en kö. Du ser namn, titel och engagemang, och godkänner med ett klick innan de skrivs in i sekvensen.' },
      { num: '5', title: 'Luta dig tillbaka', body: 'Vaam hittar nya inlägg automatiskt, filtrerar till 2nd-degree beslutsfattare och startar din sekvens. Du vaknar till varma prospects i inkorgen utan att ha öppnat LinkedIn.' },
    ],
  },
];

function LinkedInPlaybook() {
  const [open, setOpen] = useState(false);
  const [activeSection, setActiveSection] = useState(null);

  return (
    <div className="bg-sky-950/30 border border-sky-500/20 rounded-xl">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 text-left rounded-xl"
      >
        <div className="flex items-center gap-3">
          <span className="text-lg">💼</span>
          <div>
            <div className="text-sky-300 font-semibold text-sm">LinkedIn Engagement Playbook</div>
            <div className="text-slate-500 text-xs mt-0.5">Förvandla andras LinkedIn-aktivitet till varma leads</div>
          </div>
        </div>
        <span className="text-sky-600 text-xs font-medium">{open ? '▲ Stäng' : '▼ Läs playbooken'}</span>
      </button>

      {open && (
        <div className="px-5 pb-6 space-y-4 border-t border-sky-500/10 pt-5">
          <div className="bg-sky-900/20 rounded-lg p-4 border border-sky-500/10">
            <p className="text-slate-300 text-sm leading-relaxed">
              <span className="font-semibold text-sky-300">Metoden i klartext.</span>{' '}
              Hur bokar ni så många möten från LinkedIn utan att spamma folk? Här är svaret — först metoden för hand, sedan hur du automatiserar den med Vaam.
            </p>
          </div>

          <div className="space-y-2">
            {PLAYBOOK_SECTIONS.map(section => (
              <div key={section.id} className="bg-slate-800/50 rounded-xl border border-white/5 overflow-hidden">
                <button
                  onClick={() => setActiveSection(activeSection === section.id ? null : section.id)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-white/[0.03] transition-colors"
                >
                  <span className="flex items-center gap-2 text-sm font-medium text-slate-200">
                    <span>{section.icon}</span>
                    {section.title}
                  </span>
                  <span className="text-slate-600 text-xs">{activeSection === section.id ? '▲' : '▼'}</span>
                </button>

                {activeSection === section.id && (
                  <div className="px-4 pb-4 space-y-3 border-t border-white/5 pt-3">
                    {section.content && (
                      <p className="text-slate-400 text-sm leading-relaxed whitespace-pre-line">{section.content}</p>
                    )}
                    {section.steps && (
                      <div className="space-y-3">
                        {section.steps.map(step => (
                          <div key={step.num} className="flex gap-3">
                            <div className="flex-shrink-0 w-6 h-6 rounded-full bg-sky-500/20 border border-sky-500/30 flex items-center justify-center">
                              <span className="text-sky-400 text-xs font-bold">{step.num}</span>
                            </div>
                            <div>
                              <div className="text-slate-200 text-sm font-medium mb-0.5">{step.title}</div>
                              <div className="text-slate-400 text-sm leading-relaxed">{step.body}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="bg-emerald-950/30 border border-emerald-500/20 rounded-lg px-4 py-3">
            <p className="text-sm text-slate-300 leading-relaxed">
              <span className="font-semibold text-emerald-400">Nyckeln:</span>{' '}
              De som faktiskt bokar möten från LinkedIn har inte hittat ett trick — de kör playbooken disciplinerat, vecka efter vecka. Nya källor på måndagar, engagemang dagligen, uppföljningar i tid.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

const CHANNEL_ICONS = {
  email:    '📧',
  linkedin: '💼',
  call:     '📞',
};

function ChannelBadge({ channel }) {
  const colors = {
    email:    'bg-blue-500/15 text-blue-400 border-blue-500/30',
    linkedin: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
    call:     'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  };
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${colors[channel] || 'bg-slate-500/15 text-slate-400 border-slate-500/30'}`}>
      {CHANNEL_ICONS[channel] || '•'} {channel}
    </span>
  );
}

function SequenceAnalytics({ seqId, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/sequences/${seqId}/analytics`)
      .then(r => setData(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [seqId]);

  if (loading) return <div className="p-4 text-slate-400 text-sm">Loading analytics...</div>;
  if (!data) return null;

  const t = data.totals;
  const total = parseInt(t.total_enrolled) || 0;
  const active = parseInt(t.active) || 0;
  const completed = parseInt(t.completed) || 0;
  const replied = parseInt(t.reply_count) || 0;
  const emailsSent = data.activity?.email || 0;
  const callsMade = data.activity?.call || 0;
  const linkedinActions = data.activity?.linkedin || 0;

  const StatPill = ({ label, value, color = 'text-slate-300' }) => (
    <div className="bg-white/5 rounded-lg p-3 text-center">
      <div className={`text-xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-slate-500 mt-0.5">{label}</div>
    </div>
  );

  return (
    <div className="border-t border-white/10 pt-4 space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Analytics</span>
        <button onClick={onClose} className="text-xs text-slate-500 hover:text-slate-300 transition-colors">▲ hide</button>
      </div>

      {/* Enrollment stats */}
      <div className="grid grid-cols-4 gap-2">
        <StatPill label="Total enrolled" value={total} />
        <StatPill label="Active" value={active} color="text-cyan-400" />
        <StatPill label="Completed" value={completed} color="text-emerald-400" />
        <StatPill label="Replied" value={replied} color="text-amber-400" />
      </div>

      {/* Activity counts */}
      <div className="grid grid-cols-3 gap-2">
        <StatPill label="📧 Emails sent" value={emailsSent} color="text-blue-400" />
        <StatPill label="📞 Calls made" value={callsMade} color="text-emerald-400" />
        <StatPill label="💼 LinkedIn" value={linkedinActions} color="text-sky-400" />
      </div>

      {/* Rate metrics */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-white/5 rounded-lg p-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-slate-500">Reply rate</span>
            <span className={`text-sm font-bold ${replied > 0 ? 'text-emerald-400' : 'text-slate-600'}`}>
              {data.reply_rate != null ? `${data.reply_rate}%` : '—'}
            </span>
          </div>
          <div className="text-xs text-slate-600">target: 5–8% · {emailsSent} emails sent</div>
          <div className="h-1.5 bg-white/5 rounded-full mt-2 overflow-hidden">
            <div className="h-full bg-emerald-500 opacity-70 rounded-full"
              style={{ width: `${Math.min(parseFloat(data.reply_rate) || 0, 100)}%` }} />
          </div>
        </div>
        <div className="bg-white/5 rounded-lg p-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-slate-500">Completion rate</span>
            <span className={`text-sm font-bold ${parseFloat(data.completion_rate) > 50 ? 'text-emerald-400' : 'text-slate-300'}`}>
              {data.completion_rate != null ? `${data.completion_rate}%` : '—'}
            </span>
          </div>
          <div className="text-xs text-slate-600">{completed} of {total} leads completed</div>
          <div className="h-1.5 bg-white/5 rounded-full mt-2 overflow-hidden">
            <div className="h-full bg-cyan-500 opacity-70 rounded-full"
              style={{ width: `${Math.min(parseFloat(data.completion_rate) || 0, 100)}%` }} />
          </div>
        </div>
      </div>

      {/* Steps */}
      <div className="space-y-1.5">
        <div className="text-xs text-slate-500 uppercase tracking-wide font-semibold">Sequence steps</div>
        {data.sequence.steps.map((step, idx) => (
          <div key={idx} className="flex items-center gap-3 py-1.5 border-b border-white/5 last:border-0 text-sm">
            <span className="text-xs text-slate-600 w-12 flex-shrink-0">Day {step.day}</span>
            <ChannelBadge channel={step.channel} />
            <span className="text-slate-300 flex-1">{step.title}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Sequences() {
  const [sequences, setSequences] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openAnalytics, setOpenAnalytics] = useState(null); // seqId

  useEffect(() => {
    api.get('/sequences')
      .then(r => setSequences(r.data.sequences || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-8 text-slate-400">Loading...</div>;

  return (
    <div className="p-8 max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Sequences</h1>
        <p className="text-slate-500 text-sm mt-1">Outreach sequences — enroll leads from the lead detail page</p>
      </div>

      <LinkedInPlaybook />

      {sequences.length === 0 ? (
        <div className="bg-navy-800 rounded-xl border border-white/10 p-8 text-center text-slate-500">
          No sequences yet.
        </div>
      ) : (
        <div className="space-y-4">
          {sequences.map(seq => {
            const steps = Array.isArray(seq.steps) ? seq.steps : JSON.parse(seq.steps || '[]');
            const showAnalytics = openAnalytics === seq.id;
            return (
              <div key={seq.id} className="bg-navy-800 rounded-xl border border-white/10 p-5 space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-slate-100 font-semibold">{seq.name}</h2>
                    {seq.description && (
                      <p className="text-slate-500 text-sm mt-0.5">{seq.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs text-slate-500">{steps.length} steps</span>
                    <span className="text-xs bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 px-2 py-0.5 rounded-full">
                      {seq.enrollment_count || 0} enrolled
                    </span>
                    <button
                      onClick={() => setOpenAnalytics(showAnalytics ? null : seq.id)}
                      className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${
                        showAnalytics
                          ? 'bg-white/10 border-white/20 text-slate-200'
                          : 'bg-white/5 border-white/10 text-slate-400 hover:text-slate-200 hover:bg-white/8'
                      }`}
                    >
                      📊 Analytics
                    </button>
                  </div>
                </div>

                {!showAnalytics && (
                  <div className="space-y-2">
                    {steps.map((step, idx) => (
                      <div key={idx} className="flex items-center gap-3 py-1.5 border-b border-white/5 last:border-0">
                        <span className="text-xs text-slate-600 w-12 flex-shrink-0">
                          {step.day === 0 ? 'Day 0' : `Day ${step.day}`}
                        </span>
                        <ChannelBadge channel={step.channel} />
                        <span className="text-sm text-slate-300">{step.title}</span>
                      </div>
                    ))}
                  </div>
                )}

                {showAnalytics && (
                  <SequenceAnalytics
                    seqId={seq.id}
                    onClose={() => setOpenAnalytics(null)}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
