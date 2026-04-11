const express = require('express');
const router = express.Router();
const db = require('../db');
const { sendEmail } = require('../services/emailService');

// GET /api/sequences — list all sequences
router.get('/', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT s.id, s.name, s.description, s.steps, s.created_at,
              COUNT(e.id) AS enrollment_count
       FROM sequences s
       LEFT JOIN sequence_enrollments e ON e.sequence_id = s.id
       GROUP BY s.id ORDER BY s.created_at ASC`
    );
    res.json({ success: true, data: { sequences: rows } });
  } catch (err) {
    console.error('[sequences] list error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/sequences/:lead_id/enroll — enroll a lead in a sequence
router.post('/:lead_id/enroll', async (req, res) => {
  const { sequence_id } = req.body;
  if (!sequence_id) return res.status(400).json({ success: false, error: 'sequence_id required' });

  try {
    // Fetch sequence
    const { rows: seqRows } = await db.query(
      'SELECT * FROM sequences WHERE id = $1',
      [sequence_id]
    );
    if (!seqRows[0]) return res.status(404).json({ success: false, error: 'Sequence not found' });

    const sequence = seqRows[0];
    const steps = Array.isArray(sequence.steps) ? sequence.steps : JSON.parse(sequence.steps);

    // Create enrollment
    const { rows: enrollRows } = await db.query(
      `INSERT INTO sequence_enrollments (lead_id, sequence_id, status, current_step)
       VALUES ($1, $2, 'active', 0) RETURNING id`,
      [req.params.lead_id, sequence_id]
    );
    const enrollmentId = enrollRows[0].id;

    // Create tasks for each step
    const today = new Date();
    let tasksCreated = 0;
    for (const step of steps) {
      const dueDate = new Date(today);
      dueDate.setDate(dueDate.getDate() + (step.day || 0));
      const dueDateStr = dueDate.toISOString().split('T')[0];

      await db.query(
        `INSERT INTO tasks (user_id, lead_id, title, due_date)
         VALUES ($1, $2, $3, $4)`,
        [req.user.id, req.params.lead_id, step.title, dueDateStr]
      );
      tasksCreated++;
    }

    res.json({ success: true, data: { enrollment_id: enrollmentId, tasks_created: tasksCreated } });
  } catch (err) {
    console.error('[sequences] enroll error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/sequences/enrolled-leads — all leads currently enrolled (active status)
router.get('/enrolled-leads', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT e.id AS enrollment_id, e.lead_id, e.current_step, e.enrolled_at, e.status,
              s.name AS sequence_name, s.steps,
              l.company_name, l.email, l.score, l.outreach_tier, l.intent_signal, l.num_employees_exact
       FROM sequence_enrollments e
       JOIN sequences s ON s.id = e.sequence_id
       JOIN discovery_leads l ON l.id = e.lead_id
       WHERE e.status = 'active'
       ORDER BY e.enrolled_at DESC`
    );
    res.json({ success: true, data: { leads: rows } });
  } catch (err) {
    console.error('[sequences] enrolled-leads error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/sequences/today — all active enrollments with a step due today (or overdue)
router.get('/today', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT e.id AS enrollment_id, e.lead_id, e.current_step, e.enrolled_at,
              s.name AS sequence_name, s.steps,
              l.company_name, l.city, l.email, l.phone, l.linkedin_url
       FROM sequence_enrollments e
       JOIN sequences s ON s.id = e.sequence_id
       JOIN discovery_leads l ON l.id = e.lead_id
       WHERE e.status = 'active'
       ORDER BY e.enrolled_at ASC`
    );

    const today = new Date();
    today.setHours(23, 59, 59, 999); // include steps due any time today

    const actions = [];
    for (const row of rows) {
      const steps = Array.isArray(row.steps) ? row.steps : JSON.parse(row.steps);
      const stepIndex = row.current_step;
      if (stepIndex >= steps.length) continue; // all steps done

      const step = steps[stepIndex];
      const dueAt = new Date(row.enrolled_at);
      dueAt.setDate(dueAt.getDate() + (step.day || 0));

      if (dueAt <= today) {
        const isOverdue = dueAt < new Date(new Date().setHours(0, 0, 0, 0));
        actions.push({
          enrollment_id: row.enrollment_id,
          lead_id: row.lead_id,
          company_name: row.company_name,
          city: row.city,
          email: row.email,
          phone: row.phone,
          linkedin_url: row.linkedin_url,
          sequence_name: row.sequence_name,
          step_index: stepIndex,
          step_total: steps.length,
          step_title: step.title,
          step_channel: step.channel,
          due_at: dueAt.toISOString(),
          is_overdue: isOverdue,
        });
      }
    }

    res.json({ success: true, data: { actions } });
  } catch (err) {
    console.error('[sequences] today error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/sequences/enrollments/:id/send-email
// Generates AI pitch (or uses provided body), sends via SES, advances enrollment
router.post('/enrollments/:id/send-email', async (req, res) => {
  const { subject, body } = req.body; // frontend passes edited subject+body
  if (!subject || !body) return res.status(400).json({ success: false, error: 'subject and body required' });

  try {
    const { rows } = await db.query(
      `SELECT e.*, s.steps, l.email, l.company_name
       FROM sequence_enrollments e
       JOIN sequences s ON s.id = e.sequence_id
       JOIN discovery_leads l ON l.id = e.lead_id
       WHERE e.id = $1`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ success: false, error: 'Enrollment not found' });

    const enrollment = rows[0];
    if (!enrollment.email) return res.status(400).json({ success: false, error: 'Lead has no email address' });

    // Send via SES
    const { messageId } = await sendEmail({ to: enrollment.email, subject, body });

    // Log activity
    await db.query(
      `INSERT INTO activities (lead_id, type, title) VALUES ($1, 'email', $2)`,
      [enrollment.lead_id, `Sent: ${subject}`]
    );

    // Advance enrollment
    const steps = Array.isArray(enrollment.steps) ? enrollment.steps : JSON.parse(enrollment.steps);
    const nextStep = enrollment.current_step + 1;
    const isComplete = nextStep >= steps.length;
    await db.query(
      `UPDATE sequence_enrollments SET current_step=$1, status=$2 WHERE id=$3`,
      [nextStep, isComplete ? 'completed' : 'active', enrollment.id]
    );

    res.json({ success: true, data: { messageId, completed: isComplete } });
  } catch (err) {
    console.error('[sequences] send-email error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/sequences/enrollments/:id/generate-pitch — tiered + sequence-aware pitch
router.post('/enrollments/:id/generate-pitch', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT e.current_step, e.enrolled_at, s.steps, l.*
       FROM sequence_enrollments e
       JOIN sequences s ON s.id = e.sequence_id
       JOIN discovery_leads l ON l.id = e.lead_id
       WHERE e.id = $1`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ success: false, error: 'Not found' });

    const row = rows[0];
    const steps = Array.isArray(row.steps) ? row.steps : JSON.parse(row.steps);
    const stepIndex = row.current_step;
    const stepTitle = steps[stepIndex]?.title || null;

    const { generatePitch } = require('../engines/pitchGenerator');
    const result = await generatePitch(row, {
      stepIndex,
      stepTitle,
      enrolledAt: row.enrolled_at,
    });

    res.json({ success: true, data: result });
  } catch (err) {
    console.error('[sequences] generate-pitch error:', err.message);
    res.status(err.message.includes('ANTHROPIC') ? 503 : 500).json({ success: false, error: err.message });
  }
});

// POST /api/sequences/enrollments/:id/advance — mark current step done, move to next
router.post('/enrollments/:id/advance', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT e.*, s.steps FROM sequence_enrollments e
       JOIN sequences s ON s.id = e.sequence_id
       WHERE e.id = $1`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ success: false, error: 'Enrollment not found' });

    const enrollment = rows[0];
    const steps = Array.isArray(enrollment.steps) ? enrollment.steps : JSON.parse(enrollment.steps);
    const nextStep = enrollment.current_step + 1;
    const isComplete = nextStep >= steps.length;

    await db.query(
      `UPDATE sequence_enrollments SET current_step = $1, status = $2 WHERE id = $3`,
      [nextStep, isComplete ? 'completed' : 'active', enrollment.id]
    );

    res.json({ success: true, data: { completed: isComplete, next_step: nextStep } });
  } catch (err) {
    console.error('[sequences] advance error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/sequences/enrollments/:lead_id — get enrollments for a lead
router.get('/enrollments/:lead_id', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT e.id, e.lead_id, e.sequence_id, e.enrolled_at, e.status, e.current_step,
              s.name AS sequence_name, s.description, s.steps
       FROM sequence_enrollments e
       JOIN sequences s ON s.id = e.sequence_id
       WHERE e.lead_id = $1
       ORDER BY e.enrolled_at DESC`,
      [req.params.lead_id]
    );
    res.json({ success: true, data: { enrollments: rows } });
  } catch (err) {
    console.error('[sequences] enrollments error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/sequences/:id/analytics — per-step performance stats
router.get('/:id/analytics', async (req, res) => {
  try {
    const { rows: seqRows } = await db.query('SELECT * FROM sequences WHERE id = $1', [req.params.id]);
    if (!seqRows[0]) return res.status(404).json({ success: false, error: 'Sequence not found' });

    const steps = Array.isArray(seqRows[0].steps) ? seqRows[0].steps : JSON.parse(seqRows[0].steps || '[]');

    // Total enrollments
    const { rows: totals } = await db.query(
      `SELECT
         COUNT(*) AS total_enrolled,
         COUNT(*) FILTER (WHERE status = 'active')    AS active,
         COUNT(*) FILTER (WHERE status = 'completed') AS completed,
         COUNT(*) FILTER (WHERE status = 'replied')   AS replied,
         COUNT(*) FILTER (WHERE replied_at IS NOT NULL) AS reply_count
       FROM sequence_enrollments WHERE sequence_id = $1`,
      [req.params.id]
    );

    // Per-step email sends (from activities)
    const { rows: stepActivity } = await db.query(
      `SELECT a.type, COUNT(*) AS count
       FROM activities a
       JOIN sequence_enrollments e ON e.lead_id = a.lead_id
       WHERE e.sequence_id = $1 AND a.type IN ('email','call','linkedin','reply')
       GROUP BY a.type`,
      [req.params.id]
    );

    const actMap = {};
    stepActivity.forEach(r => { actMap[r.type] = parseInt(r.count); });

    const total = parseInt(totals[0].total_enrolled) || 0;
    const replies = parseInt(totals[0].reply_count) || 0;
    const emailsSent = actMap['email'] || 0;

    res.json({
      success: true,
      data: {
        sequence: { id: seqRows[0].id, name: seqRows[0].name, steps },
        totals: totals[0],
        step_count: steps.length,
        activity: actMap,
        reply_rate: emailsSent > 0 ? ((replies / emailsSent) * 100).toFixed(1) : null,
        completion_rate: total > 0 ? ((parseInt(totals[0].completed) / total) * 100).toFixed(1) : null,
      }
    });
  } catch (err) {
    console.error('[sequences] analytics error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/sequences/overview/stats — all sequences summary
router.get('/overview/stats', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT s.id, s.name,
         COUNT(e.id)                                            AS total_enrolled,
         COUNT(e.id) FILTER (WHERE e.status = 'active')        AS active,
         COUNT(e.id) FILTER (WHERE e.status = 'completed')     AS completed,
         COUNT(e.id) FILTER (WHERE e.status = 'replied')       AS replied,
         COUNT(e.id) FILTER (WHERE e.replied_at IS NOT NULL)   AS reply_count
       FROM sequences s
       LEFT JOIN sequence_enrollments e ON e.sequence_id = s.id
       GROUP BY s.id ORDER BY s.created_at ASC`
    );
    res.json({ success: true, data: { sequences: rows } });
  } catch (err) {
    console.error('[sequences] overview error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
