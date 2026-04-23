import React, { useEffect, useState, useCallback, useRef } from 'react';
import { api } from '../api';
import { Link } from 'react-router-dom';

// ─── Info Tooltip ─────────────────────────────────────────────────────────────
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

const SNI_NAMES = {
  '01': 'Agriculture', '02': 'Forestry', '03': 'Fishing',
  '06': 'Oil & gas extraction', '07': 'Mining', '08': 'Quarrying', '09': 'Mining support',
  '10': 'Food manufacturing', '11': 'Beverages', '12': 'Tobacco', '13': 'Textiles',
  '14': 'Apparel', '15': 'Leather', '16': 'Wood products', '17': 'Paper',
  '18': 'Printing', '19': 'Petroleum refining', '20': 'Chemicals', '21': 'Pharmaceuticals',
  '22': 'Rubber & plastics', '23': 'Non-metallic minerals', '24': 'Basic metals',
  '25': 'Fabricated metal', '26': 'Electronics & computers', '27': 'Electrical equipment',
  '28': 'Machinery', '29': 'Motor vehicles', '30': 'Other transport equipment',
  '31': 'Furniture', '32': 'Other manufacturing', '33': 'Repair & installation',
  '35': 'Electricity & gas', '36': 'Water supply', '37': 'Sewage',
  '38': 'Waste management', '39': 'Remediation',
  '41': 'Construction', '42': 'Civil engineering', '43': 'Specialised construction',
  '45': 'Motor trade', '46': 'Wholesale', '47': 'Retail',
  '49': 'Land transport', '50': 'Water transport', '51': 'Air transport',
  '52': 'Warehousing & logistics', '53': 'Postal & courier',
  '55': 'Hotels', '56': 'Restaurants',
  '58': 'Publishing', '59': 'Film & TV', '60': 'Broadcasting',
  '61': 'Telecommunications', '62': 'IT & software', '63': 'Data services',
  '64': 'Banking & finance', '65': 'Insurance', '66': 'Financial services',
  '68': 'Real estate',
  '69': 'Legal', '70': 'Management consulting', '71': 'Architecture & engineering',
  '72': 'Research & development', '73': 'Advertising', '74': 'Other professional',
  '75': 'Veterinary',
  '77': 'Rental', '78': 'Employment', '79': 'Travel', '80': 'Security',
  '81': 'Facilities management', '82': 'Office support',
  '84': 'Public administration', '85': 'Education',
  '86': 'Healthcare', '87': 'Residential care', '88': 'Social work',
  '90': 'Arts', '91': 'Libraries & museums', '92': 'Gambling', '93': 'Sports',
  '94': 'Membership organisations', '95': 'Computer repair', '96': 'Personal services',
};

const LABEL_CONFIG = {
  hot:  { label: 'Hot leads', color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20' },
  warm: { label: 'Warm leads', color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },
  cold: { label: 'Cold leads', color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' },
};

function formatDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-SE', { month: 'short', day: 'numeric' });
}

const CHANNEL_CONFIG = {
  email:    { icon: '📧', label: 'Send email',        color: 'text-blue-400',    bg: 'bg-blue-500/10 border-blue-500/20' },
  linkedin: { icon: '💼', label: 'LinkedIn connect',  color: 'text-sky-400',     bg: 'bg-sky-500/10 border-sky-500/20' },
  call:     { icon: '📞', label: 'Discovery call',    color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
};

function SendEmailModal({ action, onSent, onClose }) {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [generating, setGenerating] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.post(`/sequences/enrollments/${action.enrollment_id}/generate-pitch`)
      .then(r => {
        setSubject(r.data.subject);
        setBody(r.data.body);
        setGenerating(false);
      })
      .catch(e => {
        setError(e.response?.data?.error || 'Failed to generate pitch');
        setGenerating(false);
      });
  }, [action.enrollment_id]);

  async function send() {
    if (!subject.trim() || !body.trim()) return;
    setSending(true);
    setError('');
    try {
      await api.post(`/sequences/enrollments/${action.enrollment_id}/send-email`, { subject, body });
      onSent(action.enrollment_id);
    } catch (e) {
      setError(e.response?.data?.error || 'Send failed');
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-[#0f1729] border border-white/10 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-slate-200">Send Email</h2>
            <p className="text-xs text-slate-500 mt-0.5">To: {action.email} · {action.company_name}</p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 text-xl leading-none">×</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {generating ? (
            <div className="text-center py-12 text-slate-400">
              <div className="text-2xl mb-2">✨</div>
              <div className="text-sm">Generating pitch in Swedish...</div>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-xs text-slate-500 mb-1.5">Subject</label>
                <input
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1.5">Body</label>
                <textarea
                  value={body}
                  onChange={e => setBody(e.target.value)}
                  rows={14}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50 resize-none font-mono leading-relaxed"
                />
              </div>
              {error && <p className="text-xs text-red-400">{error}</p>}
            </>
          )}
        </div>

        {/* Footer */}
        {!generating && (
          <div className="px-6 py-4 border-t border-white/10 flex items-center justify-between flex-shrink-0">
            <button onClick={onClose} className="text-sm text-slate-500 hover:text-slate-300 transition-colors">
              Cancel
            </button>
            <button
              onClick={send}
              disabled={sending || !subject.trim() || !body.trim()}
              className="px-5 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors">
              {sending ? 'Sending...' : 'Send via Resend →'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Schedule Call Modal ───────────────────────────────────────────────────────
function ScheduleCallModal({ lead, onSaved, onClose }) {
  const today = new Date().toISOString().slice(0, 10);
  const nextHour = new Date();
  nextHour.setHours(nextHour.getHours() + 1, 0, 0, 0);
  const defaultTime = nextHour.toTimeString().slice(0, 5);

  const [date, setDate] = useState(today);
  const [time, setTime] = useState(defaultTime);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const scheduled_at = `${date}T${time}:00`;
    const title = `📞 Samtal · ${lead.company_name}${notes ? ` — ${notes}` : ''}`;
    try {
      const r = await api.post('/tasks', { lead_id: lead.id, title, scheduled_at, due_date: date });
      const taskId = r.data?.data?.task?.id;
      if (taskId && lead.email) {
        await api.post(`/tasks/${taskId}/send-invite`).catch(() => {}); // fire-and-forget
      }
      onSaved();
    } catch {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-[#1e293b] border border-white/15 rounded-2xl p-6 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
        <h3 className="text-sm font-semibold text-slate-200 mb-1">Schedule a call</h3>
        <p className="text-xs text-slate-500 mb-5">{lead.company_name}</p>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-slate-400 block mb-1">Date</label>
            <input type="date" value={date} min={today} onChange={e => setDate(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50" />
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1">Time</label>
            <input type="time" value={time} onChange={e => setTime(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50" />
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1">Notes (optional)</label>
            <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="e.g. Discuss NIS2 audit scope"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500/50" />
          </div>
        </div>
        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200 bg-white/5 hover:bg-white/10 transition-colors">Cancel</button>
          <button onClick={save} disabled={saving}
            className="flex-1 py-2 rounded-lg text-xs font-medium bg-cyan-600 hover:bg-cyan-500 text-white transition-colors disabled:opacity-50">
            {saving ? 'Saving…' : 'Schedule call'}
          </button>
        </div>
      </div>
    </div>
  );
}

function EnrolledLeadsModal({ onClose }) {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/sequences/enrolled-leads')
      .then(r => { setLeads(r.data.leads || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-[#0f172a] border border-white/10 rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <h3 className="text-sm font-semibold text-slate-200">Enrolled leads</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-200 text-lg leading-none">×</button>
        </div>
        <div className="overflow-y-auto flex-1 px-6 py-4">
          {loading ? (
            <p className="text-xs text-slate-500 text-center py-8">Loading…</p>
          ) : leads.length === 0 ? (
            <p className="text-xs text-slate-500 text-center py-8">No active enrollments.</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-500 border-b border-white/8">
                  <th className="text-left pb-2 font-medium">Company</th>
                  <th className="text-left pb-2 font-medium">Sequence</th>
                  <th className="text-left pb-2 font-medium">Step</th>
                  <th className="text-left pb-2 font-medium">Score</th>
                  <th className="text-left pb-2 font-medium">Enrolled</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {leads.map(l => {
                  const steps = Array.isArray(l.steps) ? l.steps : JSON.parse(l.steps || '[]');
                  const stepLabel = steps[l.current_step]?.type || `#${l.current_step + 1}`;
                  return (
                    <tr key={l.enrollment_id} className="hover:bg-white/3">
                      <td className="py-2 pr-4">
                        <Link to={`/leads/${l.lead_id}`} onClick={onClose} className="text-cyan-400 hover:underline font-medium">
                          {l.company_name}
                        </Link>
                        {l.intent_signal && <span className="ml-1.5 text-orange-400">🎯</span>}
                      </td>
                      <td className="py-2 pr-4 text-slate-300">{l.sequence_name}</td>
                      <td className="py-2 pr-4 text-slate-400">{stepLabel}</td>
                      <td className="py-2 pr-4">
                        <span className={`font-semibold ${l.score >= 70 ? 'text-emerald-400' : l.score >= 40 ? 'text-amber-400' : 'text-slate-400'}`}>
                          {l.score}
                        </span>
                      </td>
                      <td className="py-2 text-slate-500">
                        {new Date(l.enrolled_at).toLocaleDateString('sv-SE')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Reply Inbox Alert ────────────────────────────────────────────────────────
function ReplyInboxAlert() {
  const [unread, setUnread] = useState([]);

  useEffect(() => {
    function fetch() {
      api.get('/messages/unread-summary')
        .then(r => setUnread(r.data?.unread || []))
        .catch(() => {});
    }
    fetch();
    const t = setInterval(fetch, 30000); // poll every 30s
    return () => clearInterval(t);
  }, []);

  if (unread.length === 0) return null;

  const totalUnread = unread.reduce((s, r) => s + parseInt(r.unread_count), 0);

  return (
    <div className="bg-cyan-500/8 border border-cyan-500/30 rounded-xl overflow-hidden">
      <div className="px-5 py-3.5 border-b border-cyan-500/20 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="text-base">📩</span>
          <h2 className="text-sm font-semibold text-cyan-300">Replies waiting</h2>
          <span className="bg-cyan-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
            {totalUnread}
          </span>
        </div>
        <span className="text-xs text-cyan-600">Click a company to open the conversation</span>
      </div>
      <div className="divide-y divide-cyan-500/10">
        {unread.map(r => (
          <Link
            key={r.lead_id}
            to={`/leads/${r.lead_id}`}
            className="flex items-center gap-4 px-5 py-3 hover:bg-cyan-500/10 transition-colors group"
          >
            <div className="w-8 h-8 rounded-lg bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-sm flex-shrink-0">
              💬
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-slate-200 group-hover:text-cyan-300 transition-colors">
                  {r.company_name}
                </span>
                {parseInt(r.unread_count) > 1 && (
                  <span className="text-xs bg-cyan-500/20 text-cyan-400 px-1.5 py-0.5 rounded-full">
                    {r.unread_count} new
                  </span>
                )}
              </div>
              {r.latest_subject && (
                <div className="text-xs text-slate-500 truncate mt-0.5">{r.latest_subject}</div>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-xs text-slate-600">
                {new Date(r.latest_at).toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' })}
              </span>
              <span className="text-cyan-500 text-xs group-hover:translate-x-0.5 transition-transform">→</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

const CHANNEL_ORDER = ['email', 'linkedin', 'call'];
const CHANNEL_SECTION = {
  email:    { icon: '📧', label: 'Emails',            hint: 'Send all emails first — batch them together' },
  linkedin: { icon: '💼', label: 'LinkedIn actions',  hint: 'Follow, like, connect, or DM — work down the list' },
  call:     { icon: '📞', label: 'Calls',             hint: 'Call all prospects — use the phone number link' },
};

function TodayActions() {
  const [actions, setActions] = useState([]);
  const [callTasks, setCallTasks] = useState([]);
  const [doneTasks, setDoneTasks] = useState(new Set());
  const [done, setDone] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [emailModal, setEmailModal] = useState(null);

  const fetchActions = useCallback(() => {
    const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);
    Promise.all([
      api.get('/sequences/today'),
      api.get(`/tasks?completed=false&limit=100&_t=${Date.now()}`),
    ]).then(([seqRes, taskRes]) => {
      setActions(seqRes.data.actions);
      const todayTasks = (taskRes.data?.data?.tasks || []).filter(t => {
        const check = t.scheduled_at || t.due_date;
        if (!check) return false;
        return new Date(check) <= todayEnd;
      });
      setCallTasks(todayTasks);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  useEffect(() => { fetchActions(); }, [fetchActions]);

  async function advance(enrollmentId, channel) {
    setDone(prev => new Set(prev).add(enrollmentId));
    try {
      await api.post(`/sequences/enrollments/${enrollmentId}/advance`, { channel });
    } catch {
      setDone(prev => { const s = new Set(prev); s.delete(enrollmentId); return s; });
    }
  }

  function onEmailSent(enrollmentId) {
    setEmailModal(null);
    setDone(prev => new Set(prev).add(enrollmentId));
  }

  if (loading || (actions.length === 0 && callTasks.length === 0)) return null;

  const pending = actions.filter(a => !done.has(a.enrollment_id));
  const pendingTasks = callTasks.filter(t => !doneTasks.has(t.id));
  const totalPending = pending.length + pendingTasks.length;

  // Group sequence actions by channel, then add scheduled call tasks into 'call' group
  const grouped = {};
  CHANNEL_ORDER.forEach(ch => { grouped[ch] = []; });
  pending.forEach(a => {
    const ch = a.step_channel || 'email';
    if (!grouped[ch]) grouped[ch] = [];
    grouped[ch].push({ type: 'sequence', data: a });
  });
  // Scheduled call tasks go into the call group
  pendingTasks.forEach(t => grouped['call'].push({ type: 'task', data: t }));

  function renderSequenceRow(action) {
    const cfg = CHANNEL_CONFIG[action.step_channel] || CHANNEL_CONFIG.email;
    const isDone = done.has(action.enrollment_id);
    const isEmail = action.step_channel === 'email';
    const isLinkedIn = action.step_channel === 'linkedin';

    // Derive specific LinkedIn action label from step title
    const linkedInLabel = isLinkedIn
      ? action.step_title.toLowerCase().includes('follow') ? 'LinkedIn Follow'
      : action.step_title.toLowerCase().includes('like') ? 'LinkedIn Like/Comment'
      : action.step_title.toLowerCase().includes('dm') || action.step_title.toLowerCase().includes('connection') ? 'LinkedIn DM'
      : 'LinkedIn'
      : null;

    return (
      <div key={action.enrollment_id}
        className={`flex items-center gap-4 px-5 py-3.5 transition-all ${isDone ? 'opacity-40' : 'hover:bg-white/3'}`}>
        <div className={`w-9 h-9 rounded-lg border flex items-center justify-center flex-shrink-0 text-lg ${cfg.bg}`}>
          {cfg.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Link to={`/leads/${action.lead_id}`}
              className="text-sm font-medium text-slate-200 hover:text-cyan-400 transition-colors">
              {action.company_name}
            </Link>
            {action.city && <span className="text-xs text-slate-500">{action.city}</span>}
            {action.is_overdue && !isDone && (
              <span className="text-xs bg-red-500/15 text-red-400 px-1.5 py-0.5 rounded">overdue</span>
            )}
          </div>
          <div className="text-xs text-slate-300 mt-0.5 font-medium">{action.step_title}</div>
          <div className="flex items-center gap-3 mt-1">
            <span className={`text-xs font-medium ${cfg.color}`}>{isLinkedIn ? linkedInLabel : cfg.label}</span>
            {action.phone && action.step_channel === 'call' && (
              <a href={`tel:${action.phone}`} className="text-xs text-slate-500 hover:text-slate-300 transition-colors">
                {action.phone}
              </a>
            )}
            {isLinkedIn && action.linkedin_url && (
              <a href={action.linkedin_url} target="_blank" rel="noreferrer"
                className="text-xs text-sky-500 hover:text-sky-400 transition-colors">
                Company →
              </a>
            )}
            {isLinkedIn && action.vd_contacts && action.vd_contacts.map((c, i) => (
              <a key={i} href={c.linkedin_url} target="_blank" rel="noreferrer"
                className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors">
                {c.name} ({c.title}) →
              </a>
            ))}
            {isEmail && action.email && (
              <span className="text-xs text-slate-500">{action.email}</span>
            )}
            {isEmail && !action.email && !isDone && (
              <span className="text-xs text-amber-500">No email — skip or enrich first</span>
            )}
          </div>
        </div>
        <div className="text-xs text-slate-600 flex-shrink-0 text-right mr-2">
          <div>{action.sequence_name}</div>
          <div>Step {action.step_index + 1}/{action.step_total}</div>
        </div>
        {isEmail && action.email && !isDone ? (
          <button
            onClick={() => setEmailModal(action)}
            className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600/80 hover:bg-blue-500 text-white transition-colors cursor-pointer">
            Send email
          </button>
        ) : (
          <button
            onClick={() => !isDone && advance(action.enrollment_id, action.step_channel)}
            disabled={isDone}
            className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              isDone
                ? 'bg-emerald-500/15 text-emerald-400 cursor-default'
                : 'bg-white/8 hover:bg-cyan-500/20 hover:text-cyan-300 text-slate-300 cursor-pointer'
            }`}>
            {isDone ? 'Done ✓' : 'Mark done'}
          </button>
        )}
      </div>
    );
  }

  function renderTaskRow(task) {
    const isDoneTask = doneTasks.has(task.id);
    const taskDue = new Date(task.scheduled_at || task.due_date);
    const isOverdue = taskDue < new Date(new Date().setHours(0,0,0,0));
    const timeStr = task.scheduled_at ? taskDue.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' }) : '';
    const isConfirmed = !!task.confirmed_at;
    return (
      <div key={`task-${task.id}`}
        className={`flex items-center gap-4 px-5 py-3.5 transition-all ${isDoneTask ? 'opacity-40' : 'hover:bg-white/3'}`}>
        <div className="w-9 h-9 rounded-lg border flex items-center justify-center flex-shrink-0 text-lg bg-emerald-500/10 border-emerald-500/20">
          📞
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {task.lead_id
              ? <Link to={`/leads/${task.lead_id}`} className="text-sm font-medium text-slate-200 hover:text-cyan-400 transition-colors">{task.company_name || 'Unknown'}</Link>
              : <span className="text-sm font-medium text-slate-200">{task.company_name || 'Call'}</span>
            }
            {isOverdue && !isDoneTask && (
              <span className="text-xs bg-red-500/15 text-red-400 px-1.5 py-0.5 rounded">overdue</span>
            )}
            {isConfirmed && (
              <span className="text-xs bg-emerald-500/15 text-emerald-400 px-1.5 py-0.5 rounded font-medium">✓ confirmed</span>
            )}
          </div>
          <div className="text-xs text-slate-400 mt-0.5">{task.title.replace(/^📞 Samtal · [^—\n]+/, '').replace(/^— /, '') || 'Scheduled call'}</div>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-xs font-medium text-emerald-400">Discovery call</span>
            {timeStr && <span className="text-xs text-slate-500">{timeStr}</span>}
          </div>
        </div>
        <button
          onClick={async () => {
            setDoneTasks(prev => new Set(prev).add(task.id));
            try { await api.patch(`/tasks/${task.id}`, { completed: true }); } catch {
              setDoneTasks(prev => { const s = new Set(prev); s.delete(task.id); return s; });
            }
          }}
          disabled={isDoneTask}
          className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
            isDoneTask
              ? 'bg-emerald-500/15 text-emerald-400 cursor-default'
              : 'bg-white/8 hover:bg-emerald-500/20 hover:text-emerald-300 text-slate-300 cursor-pointer'
          }`}>
          {isDoneTask ? 'Done ✓' : 'Mark done'}
        </button>
      </div>
    );
  }

  return (
    <>
      {emailModal && (
        <SendEmailModal
          action={emailModal}
          onSent={onEmailSent}
          onClose={() => setEmailModal(null)}
        />
      )}
      <div className="bg-navy-800 rounded-xl border border-cyan-500/30 overflow-hidden">
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-200">Today's Actions</h2>
            <p className="text-xs text-slate-500 mt-0.5">Grouped by action type — do all emails, then LinkedIn, then calls</p>
          </div>
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${totalPending > 0 ? 'bg-cyan-500/15 text-cyan-400' : 'bg-emerald-500/15 text-emerald-400'}`}>
            {totalPending > 0 ? `${totalPending} to do` : 'All done ✓'}
          </span>
        </div>

        {CHANNEL_ORDER.map(ch => {
          const items = grouped[ch] || [];
          if (items.length === 0) return null;
          const sec = CHANNEL_SECTION[ch];

          // LinkedIn: sub-group by step_title so Follow / Like / DM are separated
          if (ch === 'linkedin') {
            const subGroups = {};
            items.forEach(item => {
              const key = item.type === 'sequence' ? item.data.step_title : 'Other';
              if (!subGroups[key]) subGroups[key] = [];
              subGroups[key].push(item);
            });
            return (
              <div key={ch}>
                <div className="px-5 py-2 bg-white/3 border-y border-white/8 flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-400 tracking-wide uppercase">
                    {sec.icon} {sec.label}
                  </span>
                  <span className="text-xs text-slate-600">{sec.hint}</span>
                </div>
                {Object.entries(subGroups).map(([title, subItems]) => (
                  <div key={title}>
                    <div className="px-5 py-1.5 bg-sky-500/5 border-y border-white/8 flex items-center gap-2">
                      <span className="text-xs font-semibold text-sky-400">💼 {title}</span>
                      <span className="text-xs text-slate-600">· {subItems.length} leads</span>
                    </div>
                    <div className="divide-y divide-white/5">
                      {subItems.map(item =>
                        item.type === 'sequence'
                          ? renderSequenceRow(item.data)
                          : renderTaskRow(item.data)
                      )}
                    </div>
                  </div>
                ))}
              </div>
            );
          }

          return (
            <div key={ch}>
              {/* Section header */}
              <div className="px-5 py-2 bg-white/3 border-y border-white/8 flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-400 tracking-wide uppercase">
                  {sec.icon} {sec.label}
                </span>
                <span className="text-xs text-slate-600">{sec.hint}</span>
              </div>
              <div className="divide-y divide-white/5">
                {items.map(item =>
                  item.type === 'sequence'
                    ? renderSequenceRow(item.data)
                    : renderTaskRow(item.data)
                )}
              </div>
            </div>
          );
        })}

        {totalPending === 0 && (
          <div className="px-5 py-8 text-center text-sm text-emerald-400">
            All done for today ✓
          </div>
        )}
      </div>
    </>
  );
}

// ─── BDR Benchmarks (3 focused components) ────────────────────────────────────
const DAILY_TARGETS = { email: 8, call: 4, linkedin: 10 };

// 1. Daily scorecard — placed right after Outreach Pulse
function DailyScorecard({ out }) {
  const items = [
    { label: 'Emails',   icon: '📧', actual: parseInt(out.emails_today)   || 0, target: DAILY_TARGETS.email,    color: 'bg-blue-500',    text: 'text-blue-400' },
    { label: 'Calls',    icon: '📞', actual: parseInt(out.calls_today)    || 0, target: DAILY_TARGETS.call,     color: 'bg-emerald-500', text: 'text-emerald-400' },
    { label: 'LinkedIn', icon: '💼', actual: parseInt(out.linkedin_today) || 0, target: DAILY_TARGETS.linkedin, color: 'bg-sky-500',     text: 'text-sky-400' },
  ];
  return (
    <div className="bg-navy-800 rounded-xl border border-white/10 p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-slate-200">Today's Activity</h2>
          <InfoTooltip text="Your daily outreach output vs targets. Consistency is everything in BDR — 20 emails/day × 5 days beats 100 in one day because replies come in waves. Targets: 8 emails, 4 calls, 10 LinkedIn actions. Resets at midnight UTC (01:00 Swedish time)." />
        </div>
        <span className="text-xs text-slate-500">Target: {DAILY_TARGETS.email} emails · {DAILY_TARGETS.call} calls · {DAILY_TARGETS.linkedin} LinkedIn</span>
      </div>
      <div className="grid grid-cols-3 gap-6">
        {items.map(item => {
          const pct = Math.min(Math.round(item.actual * 100 / item.target), 100);
          const status = pct >= 100 ? { icon: '✓', cls: 'text-emerald-400' }
                       : pct >= 50  ? { icon: '⚡', cls: 'text-amber-400' }
                       :              { icon: '○',  cls: 'text-slate-600' };
          return (
            <div key={item.label} className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">{item.icon} {item.label}</span>
                <span className={`text-xs ${status.cls}`}>{status.icon} {pct}%</span>
              </div>
              <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${item.color} opacity-70`}
                  style={{ width: `${pct > 0 ? Math.max(pct, 2) : 0}%` }} />
              </div>
              <div className="flex items-baseline gap-1">
                <span className={`text-xl font-bold ${item.text}`}>{item.actual}</span>
                <span className="text-xs text-slate-600">/ {item.target}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// 2. Pipeline conversion vs benchmark — placed right after Pipeline Funnel
const PIPELINE_BENCHMARKS = [
  { label: 'Lead → Contacted',      target: 25, color: 'bg-blue-500' },
  { label: 'Contacted → Qualified', target: 15, color: 'bg-amber-500' },
  { label: 'Qualified → Customer',  target: 25, color: 'bg-emerald-500' },
];

// Stage weights for pipeline forecasting
const STAGE_WEIGHTS = { new: 0.05, contacted: 0.20, qualified: 0.50, customer: 1.0 };

function PipelineRevenue({ revenueByStage }) {
  if (!revenueByStage || revenueByStage.length === 0) return null;

  const stageMap = {};
  revenueByStage.forEach(r => { stageMap[r.review_status] = r; });

  const totalPipeline = revenueByStage.reduce((s, r) => s + parseInt(r.total_value || 0), 0);
  const weightedForecast = revenueByStage.reduce((s, r) => {
    const w = STAGE_WEIGHTS[r.review_status] || 0;
    return s + (parseInt(r.total_value || 0) * w);
  }, 0);
  const totalValued = revenueByStage.reduce((s, r) => s + parseInt(r.valued_count || 0), 0);
  const avgDeal = totalValued > 0
    ? Math.round(revenueByStage.reduce((s, r) => s + parseFloat(r.avg_value || 0) * parseInt(r.valued_count || 0), 0) / totalValued)
    : 0;

  if (totalPipeline === 0) return null; // No deal values set yet — hide

  const fmt = v => v >= 1000000
    ? `${(v / 1000000).toFixed(1)}M kr`
    : v >= 1000
    ? `${Math.round(v / 1000)}k kr`
    : `${v.toLocaleString('sv-SE')} kr`;

  const stageRows = [
    { key: 'new',       label: 'New',       color: 'bg-slate-500', weight: '5%' },
    { key: 'contacted', label: 'Contacted', color: 'bg-blue-500',  weight: '20%' },
    { key: 'qualified', label: 'Qualified', color: 'bg-amber-500', weight: '50%' },
    { key: 'customer',  label: 'Customer',  color: 'bg-emerald-500', weight: '100%' },
  ];

  return (
    <div className="bg-navy-800 rounded-xl border border-white/10 p-5">
      <div className="flex items-center gap-2 mb-4">
        <h2 className="text-sm font-semibold text-slate-200">Pipeline Revenue</h2>
        <InfoTooltip text="Weighted deal value forecast based on stage probability. New=5%, Contacted=20%, Qualified=50%, Customer=100%. Set deal values on individual lead pages to populate this. Weighted forecast = your realistic expected revenue from current pipeline." />
      </div>
      <div className="grid grid-cols-3 gap-4 mb-4">
        <div className="text-center">
          <div className="text-xl font-bold text-slate-100">{fmt(totalPipeline)}</div>
          <div className="text-xs text-slate-500 mt-0.5">Total pipeline value</div>
        </div>
        <div className="text-center">
          <div className="text-xl font-bold text-emerald-400">{fmt(Math.round(weightedForecast))}</div>
          <div className="text-xs text-slate-500 mt-0.5">Weighted forecast</div>
        </div>
        <div className="text-center">
          <div className="text-xl font-bold text-cyan-400">{fmt(avgDeal)}</div>
          <div className="text-xs text-slate-500 mt-0.5">Avg deal size</div>
        </div>
      </div>
      <div className="space-y-2">
        {stageRows.map(row => {
          const r = stageMap[row.key];
          if (!r || parseInt(r.valued_count || 0) === 0) return null;
          return (
            <div key={row.key} className="flex items-center gap-3 text-xs">
              <div className={`w-2 h-2 rounded-full ${row.color} flex-shrink-0`} />
              <span className="text-slate-400 w-20">{row.label}</span>
              <span className="text-slate-300 font-medium">{fmt(parseInt(r.total_value))}</span>
              <span className="text-slate-600">({parseInt(r.valued_count)} deals · {row.weight} weight)</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PipelineBenchmark({ funnelMap, totalLeads }) {
  const contacted = funnelMap['contacted'] || 0;
  const qualified  = funnelMap['qualified']  || 0;
  const customer   = funnelMap['customer']   || 0;
  const total      = totalLeads || 1;
  const actualRates = [
    Math.round(contacted * 100 / total),
    contacted > 0 ? Math.round(qualified * 100 / contacted) : 0,
    qualified  > 0 ? Math.round(customer  * 100 / qualified)  : 0,
  ];
  return (
    <div className="bg-navy-800 rounded-xl border border-white/10 p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-slate-200">Conversion vs Benchmark</h2>
          <InfoTooltip text="How well your pipeline converts at each stage vs B2B cybersecurity benchmarks. The faint ghost bar is the target. Solid bar is your actual rate. Amber = below target but progressing. Green ✓ = at or above benchmark. Early-stage pipelines will show 0% — that's normal, it builds up over time." />
        </div>
        <span className="text-xs text-slate-500">Ghost bar = target</span>
      </div>
      <div className="space-y-4">
        {PIPELINE_BENCHMARKS.map((b, i) => {
          const actual = actualRates[i];
          const hit = actual >= b.target;
          return (
            <div key={b.label} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">{b.label}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-600">target {b.target}%</span>
                  <span className={`text-sm font-bold ${hit ? 'text-emerald-400' : actual > 0 ? 'text-amber-400' : 'text-slate-600'}`}>
                    {actual}% {hit ? '✓' : actual > 0 ? '↑' : '—'}
                  </span>
                </div>
              </div>
              <div className="relative h-2 bg-white/5 rounded-full overflow-hidden">
                <div className="absolute inset-y-0 left-0 bg-white/10 rounded-full" style={{ width: `${b.target}%` }} />
                <div className={`absolute inset-y-0 left-0 rounded-full ${b.color} opacity-80`} style={{ width: `${Math.min(actual, 100)}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// 3. Cold email + call reference benchmarks — placed after Enrichment Health
const EMAIL_BENCHMARKS = [
  { label: 'Reply rate',          target: '5–8%',          avg: '2–5%',         tip: 'Personalized Swedish copy beats templates by 3×' },
  { label: 'Meeting booked rate', target: '1–3%',          avg: '0.5–1%',       tip: 'Per email sent — AI pitch + NIS2 angle lifts this' },
  { label: 'Follow-up steps',     target: '4–6 touches',   avg: '1–2',          tip: 'Most replies come on step 3–5, not step 1' },
  { label: 'Best send time',      target: 'Tue–Thu 08–10', avg: 'Mon AM worst', tip: 'Swedish business hours — avoid Fri PM' },
];
const CALL_BENCHMARKS = [
  { label: 'Connect rate',      target: '10–20%',        avg: '5–10%', tip: 'Gatekeeper navigation — try direct/mobile numbers' },
  { label: 'Connect → meeting', target: '5–15%',         avg: '2–5%',  tip: 'Lead with NIS2 deadline + ROI — skip product pitch' },
  { label: 'Dials per meeting', target: '50–80',         avg: '100+',  tip: 'Hot leads (score ≥70) need ~30 dials' },
  { label: 'Best call time',    target: '10–11 & 15–16', avg: 'Random', tip: 'Avoid Mon AM and Fri PM in Sweden' },
];

function OutreachBenchmarks() {
  const BenchRow = ({ b, tagColor }) => (
    <div className="flex items-center justify-between py-2.5 border-b border-white/5 last:border-0 gap-4">
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="text-xs font-medium text-slate-300">{b.label}</span>
        <InfoTooltip text={b.tip} />
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className="text-xs text-slate-600 line-through">{b.avg}</span>
        <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${tagColor}`}>🎯 {b.target}</span>
      </div>
    </div>
  );
  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="bg-navy-800 rounded-xl border border-white/10 p-5">
        <h2 className="text-sm font-semibold text-slate-200 mb-0.5">📧 Cold Email Benchmarks</h2>
        <p className="text-xs text-slate-500 mb-3">B2B cybersecurity · Swedish market</p>
        {EMAIL_BENCHMARKS.map(b => <BenchRow key={b.label} b={b} tagColor="text-emerald-400 bg-emerald-500/10" />)}
      </div>
      <div className="bg-navy-800 rounded-xl border border-white/10 p-5">
        <h2 className="text-sm font-semibold text-slate-200 mb-0.5">📞 Discovery Call Benchmarks</h2>
        <p className="text-xs text-slate-500 mb-3">Cold calling KPIs · B2B enterprise Sweden</p>
        {CALL_BENCHMARKS.map(b => <BenchRow key={b.label} b={b} tagColor="text-cyan-400 bg-cyan-500/10" />)}
      </div>
    </div>
  );
}

function UpcomingTasks() {
  const [tasks, setTasks] = useState([]);

  const fetchTasks = useCallback(() => {
    api.get('/tasks?completed=false&limit=5')
      .then(r => setTasks(r.data.tasks))
      .catch(console.error);
  }, []);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  async function complete(task) {
    await api.patch(`/tasks/${task.id}`, { completed: true });
    fetchTasks();
  }

  if (tasks.length === 0) return null;

  return (
    <div className="bg-navy-800 rounded-xl border border-white/10 overflow-hidden">
      <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-200">Upcoming tasks</h2>
        <span className="text-xs text-slate-500">{tasks.length} pending</span>
      </div>
      <div className="divide-y divide-white/5">
        {tasks.map(task => (
          <div key={task.id} className="flex items-center gap-3 px-5 py-3 hover:bg-white/3 transition-colors">
            <input
              type="checkbox"
              checked={false}
              onChange={() => complete(task)}
              className="w-4 h-4 accent-cyan-500 cursor-pointer flex-shrink-0"
            />
            <div className="flex-1 min-w-0">
              <span className="text-sm text-slate-200">{task.title}</span>
              {task.company_name && (
                <Link to={`/leads/${task.lead_id}`} className="ml-2 text-xs text-cyan-400 hover:text-cyan-300 transition-colors">
                  {task.company_name}
                </Link>
              )}
            </div>
            {task.due_date && (
              <span className="text-xs text-slate-500 flex-shrink-0">{formatDate(task.due_date)}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

const FUNNEL_STAGES = [
  { key: 'new',       label: 'New',       color: 'bg-slate-500' },
  { key: 'contacted', label: 'Contacted', color: 'bg-blue-500' },
  { key: 'qualified', label: 'Qualified', color: 'bg-amber-500' },
  { key: 'customer',  label: 'Customer',  color: 'bg-emerald-500' },
];

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [bdr, setBdr] = useState(null);
  const [hotLeads, setHotLeads] = useState([]);
  const [inboundLeads, setInboundLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scheduleModal, setScheduleModal] = useState(null); // lead object
  const [showEnrolled, setShowEnrolled] = useState(false);

  const fetchInbound = useCallback(() => {
    api.get('/leads/inbound').then(r => setInboundLeads(r.data?.data?.leads || r.data?.leads || [])).catch(() => {});
  }, []);

  useEffect(() => {
    Promise.all([
      api.get('/leads/stats'),
      api.get('/leads/bdr-stats'),
      api.get('/leads?score_label=hot&limit=8&sort=score&dir=desc'),
      api.get('/leads/inbound')
    ]).then(([s, b, l, inb]) => {
      setStats(s.data);
      setBdr(b.data);
      setHotLeads(l.data.leads);
      setInboundLeads(inb.data?.data?.leads || inb.data?.leads || []);
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  // Auto-refresh inbound leads every 30s
  useEffect(() => {
    const interval = setInterval(fetchInbound, 30000);
    return () => clearInterval(interval);
  }, [fetchInbound]);

  if (loading) return <div className="p-8 text-slate-400">Loading...</div>;
  if (!stats) return null;

  const ov = stats.overview;
  const labelMap = {};
  stats.by_label.forEach(r => { labelMap[r.score_label] = parseInt(r.count); });

  // Funnel helpers
  const funnelMap = {};
  if (bdr) bdr.funnel.forEach(r => { funnelMap[r.review_status] = parseInt(r.count); });
  const totalLeads = parseInt(ov.total) || 1;
  const enr = bdr?.enrichment || {};
  const out = bdr?.outreach   || {};

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-100">Dashboard</h1>
        <p className="text-slate-500 text-sm mt-0.5">Swedish AI/NIS2 outreach pipeline</p>
      </div>

      {scheduleModal && (
        <ScheduleCallModal
          lead={scheduleModal}
          onSaved={() => { setScheduleModal(null); }}
          onClose={() => setScheduleModal(null)}
        />
      )}
      {showEnrolled && <EnrolledLeadsModal onClose={() => setShowEnrolled(false)} />}

      {/* Reply inbox alert — shows first if there are unread replies */}
      <ReplyInboxAlert />

      {/* NIS2Klar Inbound Leads */}
      <div className="bg-navy-800 rounded-xl border border-white/10 overflow-hidden">
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-base">📥</span>
            <h3 className="text-sm font-semibold text-slate-200">NIS2Klar Inbound Leads</h3>
            {inboundLeads.length > 0 && (
              <span className="ml-1 px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 text-xs font-bold">{inboundLeads.length}</span>
            )}
          </div>
          <Link to="/leads" className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors">View all →</Link>
        </div>
        {inboundLeads.length === 0 ? (
          <div className="px-5 py-6 text-sm text-slate-500">No inbound leads yet — forms on nis2klar.se will appear here.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5">
                <th className="text-left px-5 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Company</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Email</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Phone</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Source</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Received</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {inboundLeads.map((lead, i) => (
                <tr key={lead.id} className={`border-b border-white/5 hover:bg-white/3 transition-colors ${i === 0 && Date.now() - new Date(lead.created_at) < 86400000 ? 'bg-amber-500/5' : ''}`}>
                  <td className="px-5 py-3">
                    <Link to={`/leads/${lead.id}`} className="font-medium text-slate-200 hover:text-cyan-400 transition-colors">
                      {lead.company_name || '—'}
                    </Link>
                    {i === 0 && Date.now() - new Date(lead.created_at) < 86400000 && (
                      <span className="ml-2 text-xs bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded-full font-semibold">NEW</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-400">{lead.email || '—'}</td>
                  <td className="px-4 py-3 text-slate-400">{lead.phone || '—'}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs font-mono">{lead.source}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{new Date(lead.created_at).toLocaleDateString('sv-SE')}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <button
                        onClick={() => setScheduleModal(lead)}
                        title="Schedule a call"
                        className="text-slate-500 hover:text-cyan-400 transition-colors text-sm leading-none"
                      >📅</button>
                      <button
                        onClick={async () => {
                          setInboundLeads(prev => prev.filter(l => l.id !== lead.id));
                          try { await api.patch(`/leads/${lead.id}`, { review_status: 'contacted' }); } catch {}
                        }}
                        title="Mark as contacted — removes from this list"
                        className="text-slate-600 hover:text-emerald-400 transition-colors text-base leading-none"
                      >✓</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Today's sequence action queue */}
      <TodayActions />

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total leads', value: parseInt(ov.total).toLocaleString(), sub: `${ov.has_email} with email`, tip: 'All Swedish ABs in your database matching NIS2 target sectors (healthcare, finance, transport, IT, etc.). Imported from Bolagsverket + SCB.' },
          { label: 'NIS2 registered', value: parseInt(ov.nis2_count).toLocaleString(), sub: 'Regulatory = high priority', highlight: true, tip: 'Companies officially registered under Sweden\'s NIS2 implementation. They face legal deadlines to improve cybersecurity — regulatory pressure creates urgency to buy. These are your hottest prospects.' },
          { label: 'Active sequences', value: bdr?.sequences?.active || 0, sub: `${bdr?.sequences?.enrolled_leads || 0} leads enrolled`, tip: 'Leads currently enrolled in an automated multi-step outreach sequence (e.g. email → LinkedIn → call). Each sequence step fires on a schedule — sequences keep you consistent without manual follow-up tracking.', onClick: () => setShowEnrolled(true) },
          { label: 'Avg score', value: ov.avg_score || 0, sub: 'out of 100', tip: 'Average lead quality score across all leads (0–100). Scoring: NIS2 registered +30 · employees 50–249 +25 · target NACE sector +20 · has email +15. Avg of ~20 is expected cold — enrichment + filtering push hot leads to 70+.' },
        ].map(kpi => (
          <div key={kpi.label} onClick={kpi.onClick}
            className={`rounded-xl border p-5 ${kpi.highlight ? 'border-cyan-500/30 bg-cyan-500/5' : 'border-white/10 bg-navy-800'} ${kpi.onClick ? 'cursor-pointer hover:border-white/20 hover:bg-white/5 transition-colors' : ''}`}>
            <div className="text-2xl font-bold text-slate-100">{kpi.value}</div>
            <div className={`text-sm font-medium mt-1 flex items-center gap-1.5 ${kpi.highlight ? 'text-cyan-400' : 'text-slate-300'}`}>
              {kpi.label} <InfoTooltip text={kpi.tip} />
            </div>
            <div className="text-xs mt-0.5">
              <span className={kpi.onClick ? 'text-cyan-500 hover:underline' : 'text-slate-500'}>{kpi.sub}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Outreach pulse + Going cold */}
      {bdr && <DailyScorecard out={bdr.outreach || {}} />}
      {bdr && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Emails sent', value: out.emails_7d || 0, sub: `${out.emails_30d || 0} this month`, icon: '📧', color: 'text-blue-400', tip: 'Total email activities logged in the last 7 days. Emails are logged automatically when you send via sequences, or manually from the lead detail page.' },
            { label: 'Calls made', value: out.calls_7d || 0, sub: 'last 7 days', icon: '📞', color: 'text-emerald-400', tip: 'Discovery calls logged in the last 7 days. Log a call from the lead detail page after each conversation — even if no one answered, mark it so you track your dial volume.' },
            { label: 'LinkedIn actions', value: out.linkedin_7d || 0, sub: 'last 7 days', icon: '💼', color: 'text-sky-400', tip: 'LinkedIn connection requests or messages logged in the last 7 days. LinkedIn is your softest touch — use it to warm up leads before a cold call or as a follow-up after an email.' },
            {
              label: 'Going cold',
              value: bdr.going_cold,
              sub: 'contacted/qualified, no touch 7d',
              icon: '🧊',
              color: bdr.going_cold > 0 ? 'text-amber-400' : 'text-slate-500',
              alert: bdr.going_cold > 0,
              tip: 'Leads you\'ve already contacted or qualified but haven\'t touched in 7+ days. These are at risk — they showed enough interest to move forward but you\'ve gone quiet. Follow up now before they forget you.',
            },
          ].map(kpi => (
            <div key={kpi.label} className={`rounded-xl border p-5 bg-navy-800 ${kpi.alert ? 'border-amber-500/30' : 'border-white/10'}`}>
              <div className="flex items-start justify-between">
                <div className={`text-2xl font-bold ${kpi.color}`}>{kpi.value}</div>
                <span className="text-lg">{kpi.icon}</span>
              </div>
              <div className="text-sm text-slate-300 mt-1 flex items-center gap-1.5">{kpi.label} <InfoTooltip text={kpi.tip} /></div>
              <div className="text-xs text-slate-500 mt-0.5">{kpi.sub}</div>
              {kpi.alert && (
                <Link to="/leads?status=contacted" className="text-xs text-amber-400 hover:text-amber-300 mt-1.5 inline-block">
                  Review →
                </Link>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Funnel + conversion benchmark */}
      {bdr && (
        <div className="bg-navy-800 rounded-xl border border-white/10 p-5">
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-sm font-semibold text-slate-200">Pipeline Funnel</h2>
            <InfoTooltip text="Your sales pipeline broken into 4 stages. New = untouched leads. Contacted = you've reached out at least once. Qualified = they've shown real interest or fit is confirmed. Customer = deal closed. Click any stage to see those leads. The bar shows what % of total leads are in each stage." />
          </div>
          <div className="grid grid-cols-4 gap-3">
            {FUNNEL_STAGES.map((stage, i) => {
              const count = funnelMap[stage.key] || 0;
              const pct = i === 0 ? 100 : Math.round(count * 100 / (totalLeads || 1) * 10) / 10;
              const prevCount = i === 0 ? totalLeads : (funnelMap[FUNNEL_STAGES[i-1].key] || 1);
              const convRate = i === 0 ? null : prevCount > 0 ? Math.round(count * 100 / prevCount * 10) / 10 : 0;
              return (
                <Link key={stage.key} to={`/leads?status=${stage.key}`}
                  className="group rounded-lg border border-white/8 bg-white/3 hover:bg-white/6 p-4 transition-colors">
                  <div className={`w-full h-1.5 rounded-full mb-3 ${stage.color} opacity-70`}
                    style={{ width: `${Math.max(pct, 2)}%`, minWidth: '8px' }} />
                  <div className="text-xl font-bold text-slate-100">{count.toLocaleString()}</div>
                  <div className="text-xs font-medium text-slate-300 mt-0.5">{stage.label}</div>
                  {convRate !== null && (
                    <div className="text-xs text-slate-500 mt-1">{convRate}% of prev stage</div>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      )}
      {bdr && <PipelineBenchmark funnelMap={funnelMap} totalLeads={totalLeads} />}
      {bdr?.revenue_by_stage && <PipelineRevenue revenueByStage={bdr.revenue_by_stage} />}

      {/* Score distribution */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'hot',  tip: 'Score ≥70. These tick every box: NIS2 registered, right employee count (50–249), target NACE sector, and often have an email. Prioritize these — they need far fewer touches to convert.' },
          { label: 'warm', tip: 'Score 40–69. Good fit but missing 1–2 signals — maybe no email found yet, slightly smaller company, or adjacent sector. Worth contacting after your hot leads are worked.' },
          { label: 'cold', tip: 'Score <40. Low priority — missing most qualification signals (not NIS2, wrong size, non-target sector). Use these to fill volume gaps only, or wait for enrichment to update their score.' },
        ].map(({ label, tip }) => {
          const cfg = LABEL_CONFIG[label];
          return (
            <div key={label} className={`rounded-xl border p-5 ${cfg.bg}`}>
              <div className={`text-2xl font-bold ${cfg.color}`}>{labelMap[label] || 0}</div>
              <div className={`text-sm mt-1 flex items-center gap-1.5 ${cfg.color}`}>
                {cfg.label} <InfoTooltip text={tip} />
              </div>
              <Link to={`/leads?score_label=${label}`} className="text-xs text-slate-500 hover:text-slate-300 mt-1 inline-block">
                View all →
              </Link>
            </div>
          );
        })}
      </div>

      {/* Enrichment health */}
      {bdr && (
        <div className="bg-navy-800 rounded-xl border border-white/10 p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-slate-200">Enrichment Health</h2>
              <InfoTooltip text="How well your leads are enriched with contact data. The nightly pipeline automatically finds emails, websites, LinkedIn pages, and phone numbers. Higher % = more leads you can actually reach. Email is the most valuable signal — no email means no cold outreach." />
            </div>
            <span className="text-xs text-slate-500">{enr.enriched_today || 0} enriched today</span>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Has email',    value: enr.has_email,    icon: '📧', color: 'text-blue-400',    tip: 'Leads with a found email address. The nightly SMTP permutation engine tries common patterns (firstname@domain.com etc.) and validates deliverability. Without email you can only call or LinkedIn.' },
              { label: 'Has website',  value: enr.has_website,  icon: '🌐', color: 'text-purple-400',  tip: 'Leads with a company website found. Website is the first enrichment step — once found, the crawler extracts email and phone from it. No website = harder to enrich further.' },
              { label: 'Has LinkedIn', value: enr.has_linkedin, icon: '💼', color: 'text-sky-400',     tip: 'Leads with a LinkedIn company page found via Brave Search X-ray. Useful for researching the company before a call, and for LinkedIn outreach steps in sequences.' },
              { label: 'Has phone',    value: enr.has_phone,    icon: '📞', color: 'text-emerald-400', tip: 'Leads with a phone number found (extracted from the company website). Use for discovery calls — the number links directly on mobile so you can tap to dial.' },
            ].map(item => {
              const count = parseInt(item.value) || 0;
              const pct = Math.round(count * 100 / (parseInt(enr.total) || 1) * 10) / 10;
              const barW = Math.max(pct, 0.5);
              return (
                <div key={item.label} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400 flex items-center gap-1">{item.icon} {item.label} <InfoTooltip text={item.tip} /></span>
                    <span className={`text-xs font-semibold ${item.color}`}>{pct}%</span>
                  </div>
                  <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${item.color.replace('text-','bg-')} opacity-70`}
                      style={{ width: `${barW}%` }} />
                  </div>
                  <div className="text-xs text-slate-500">{count.toLocaleString()} / {parseInt(enr.total).toLocaleString()}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      <OutreachBenchmarks />

      {/* Hot leads table */}
      {hotLeads.length > 0 && (
        <div className="bg-navy-800 rounded-xl border border-white/10 overflow-hidden">
          <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-slate-200">Hot leads to contact</h2>
              <InfoTooltip text="Your top 8 leads sorted by score. Score ≥70 = NIS2 registered + right size + target sector. The Score column is the most important — higher = better fit + more urgency. NIS2 badge means they face legal compliance deadlines. Email ✓ means you can start a sequence immediately." position="top" />
            </div>
            <Link to="/leads?score_label=hot" className="text-xs text-cyan-400 hover:text-cyan-300">View all</Link>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5">
                {['Company','City','Emp.','NACE','NIS2','Score','Email'].map(h => (
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
          <div className="flex items-center gap-2 mb-3">
            <h3 className="text-sm font-semibold text-slate-200">Leads by County</h3>
            <InfoTooltip text="Lead count broken down by Swedish county (län), mapped from postal codes. Click any county to filter your leads list. Stockholm and Västra Götaland dominate because they have the most registered ABs — but smaller counties may have less competition." position="top" />
          </div>
          <div className="space-y-2">
            {stats.by_county.map(r => (
              <Link key={r.county} to={`/leads?county=${encodeURIComponent(r.county)}`}
                className="flex justify-between text-sm group hover:bg-white/5 rounded px-1 -mx-1 transition-colors">
                <span className="text-slate-400 group-hover:text-cyan-400 transition-colors">{r.county}</span>
                <span className="text-slate-300 font-medium">{parseInt(r.count).toLocaleString()}</span>
              </Link>
            ))}
          </div>
        </div>
        <div className="bg-navy-800 rounded-xl border border-white/10 p-5">
          <div className="flex items-center gap-2 mb-3">
            <h3 className="text-sm font-semibold text-slate-200">Leads by Sector (SNI)</h3>
            <InfoTooltip text="Lead count by Swedish SNI sector code (same as NACE). These are the NIS2-relevant sectors your leads operate in. Click any sector to filter. Healthcare (86) and Finance (64) tend to have the highest NIS2 urgency and largest budgets." position="top" />
          </div>
          <div className="space-y-2">
            {stats.by_nace.map(r => (
              <Link key={r.sector} to={`/leads?nace=${encodeURIComponent(r.sector)}`}
                className="flex justify-between text-sm gap-3 group hover:bg-white/5 rounded px-1 -mx-1 transition-colors">
                <span className="text-slate-400 group-hover:text-cyan-400 transition-colors">
                  <span className="font-mono text-slate-500 text-xs mr-1.5">{r.sector}</span>
                  {SNI_NAMES[r.sector] || r.sector}
                </span>
                <span className="text-slate-300 font-medium flex-shrink-0">{parseInt(r.count).toLocaleString()}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Upcoming tasks */}
      <UpcomingTasks />
    </div>
  );
}
