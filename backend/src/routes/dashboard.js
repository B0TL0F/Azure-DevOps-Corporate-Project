'use strict';

const express = require('express');
const { z } = require('zod');
const db = require('../db/pool');
const { requireAuth } = require('../middleware/auth');
const { parse, intParam } = require('../utils');

const router = express.Router();
// Mounted at /api itself, so auth goes on each route (a router-level guard would turn every unknown /api path into a 401).

const OPEN = `status IN ('planning','active','on_hold')`;

router.get('/dashboard', requireAuth, async (req, res) => {
  const [totals, byStatus, byHealth, byCategory, deadlines, atRisk, activity, workload, hours] = await Promise.all([
    db.one(`SELECT
        (SELECT count(*) FROM projects WHERE ${OPEN})::int AS open_projects,
        (SELECT count(*) FROM projects WHERE status='active')::int AS active_projects,
        (SELECT count(*) FROM projects WHERE ${OPEN} AND health<>'green')::int AS at_risk,
        (SELECT count(*) FROM projects WHERE ${OPEN} AND due_date < current_date)::int AS overdue,
        (SELECT count(*) FROM projects WHERE status='completed' AND completed_at >= date_trunc('quarter', now()))::int AS completed_this_quarter,
        (SELECT count(*) FROM clients WHERE status='active')::int AS active_clients,
        (SELECT count(*) FROM users WHERE status='active')::int AS people,
        (SELECT COALESCE(sum(contract_value),0) FROM projects WHERE ${OPEN})::float AS open_contract_value`),
    db.many(`SELECT status, count(*)::int AS count FROM projects GROUP BY status`),
    db.many(`SELECT health, count(*)::int AS count FROM projects WHERE ${OPEN} GROUP BY health`),
    db.many(`SELECT category, count(*)::int AS count FROM projects WHERE ${OPEN} GROUP BY category ORDER BY count DESC, category`),
    db.many(
      `SELECT ms.id, ms.title, to_char(ms.due_date,'YYYY-MM-DD') AS due_date, ms.status, (ms.due_date < current_date) AS overdue,
              p.id AS project_id, p.code, p.name AS project_name, c.name AS client_name
         FROM milestones ms JOIN projects p ON p.id=ms.project_id JOIN clients c ON c.id=p.client_id
        WHERE ms.status<>'done' AND p.${OPEN} AND ms.due_date <= current_date + 21
        ORDER BY ms.due_date, ms.id LIMIT 8`),
    db.many(
      `SELECT p.id, p.code, p.name, p.health, p.priority, to_char(p.due_date,'YYYY-MM-DD') AS due_date, c.name AS client_name, o.name AS owner_name,
              (SELECT body FROM project_updates u WHERE u.project_id=p.id AND u.kind IN ('status','risk') ORDER BY created_at DESC LIMIT 1) AS last_update
         FROM projects p JOIN clients c ON c.id=p.client_id JOIN users o ON o.id=p.owner_id
        WHERE p.${OPEN} AND p.health<>'green'
        ORDER BY array_position(ARRAY['red','amber'], p.health), array_position(ARRAY['critical','high','medium','low'], p.priority), p.due_date
        LIMIT 6`),
    db.many(
      `SELECT a.id, a.action, a.summary, a.created_at, a.project_id, u.id AS actor_id, u.name AS actor_name
         FROM activity a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.created_at DESC, a.id DESC LIMIT 12`),
    db.many(
      `SELECT u.id, u.name, u.department, COALESCE(sum(m.allocation_pct),0)::int AS allocation, count(m.project_id)::int AS projects
         FROM users u JOIN project_members m ON m.user_id=u.id JOIN projects p ON p.id=m.project_id AND p.${OPEN}
        WHERE u.status='active' GROUP BY u.id ORDER BY allocation DESC, u.name LIMIT 8`),
    db.many(
      `SELECT to_char(w,'YYYY-MM-DD') AS week, COALESCE(sum(t.hours),0)::float AS hours
         FROM generate_series(date_trunc('week', current_date) - interval '11 weeks', date_trunc('week', current_date), interval '1 week') w
         LEFT JOIN time_entries t ON date_trunc('week', t.entry_date)=w GROUP BY w ORDER BY w`),
  ]);
  res.json({
    totals,
    byStatus, byHealth, byCategory,
    deadlines: deadlines.map((d) => ({ id: d.id, title: d.title, dueDate: d.due_date, status: d.status, overdue: d.overdue,
      project: { id: d.project_id, code: d.code, name: d.project_name, client: d.client_name } })),
    atRisk: atRisk.map((p) => ({ id: p.id, code: p.code, name: p.name, health: p.health, priority: p.priority, dueDate: p.due_date,
      client: p.client_name, owner: p.owner_name, lastUpdate: p.last_update })),
    activity: activity.map((a) => ({ id: a.id, action: a.action, summary: a.summary, createdAt: a.created_at, projectId: a.project_id,
      actor: a.actor_id ? { id: a.actor_id, name: a.actor_name } : null })),
    workload, hoursByWeek: hours,
  });
});

// One search box for projects, clients and people.
router.get('/search', requireAuth, async (req, res) => {
  const { q } = parse(z.object({ q: z.string().trim().min(1).max(80) }), req.query);
  const like = `%${q}%`;
  const [projects, clients, people] = await Promise.all([
    db.many(`SELECT p.id, p.code, p.name, p.status, p.health, c.name AS client FROM projects p JOIN clients c ON c.id=p.client_id
              WHERE p.name ILIKE $1 OR p.code ILIKE $1 OR array_to_string(p.tech_stack,' ') ILIKE $1 ORDER BY p.updated_at DESC LIMIT 6`, [like]),
    db.many(`SELECT id, name, slug, industry, tier FROM clients WHERE name ILIKE $1 OR industry ILIKE $1 ORDER BY name LIMIT 5`, [like]),
    db.many(`SELECT id, name, title, department FROM users WHERE status='active' AND (name ILIKE $1 OR title ILIKE $1 OR department ILIKE $1) ORDER BY name LIMIT 5`, [like]),
  ]);
  res.json({ projects, clients, people });
});

router.get('/notifications', requireAuth, async (req, res) => {
  const rows = await db.many(
    `SELECT id, type, title, body, link, read_at, created_at FROM notifications WHERE user_id=$1 ORDER BY created_at DESC, id DESC LIMIT 30`,
    [req.user.id]);
  const { unread } = await db.one('SELECT count(*)::int AS unread FROM notifications WHERE user_id=$1 AND read_at IS NULL', [req.user.id]);
  res.json({ notifications: rows.map((n) => ({ id: n.id, type: n.type, title: n.title, body: n.body, link: n.link, read: Boolean(n.read_at), createdAt: n.created_at })), unread });
});

router.post('/notifications/read-all', requireAuth, async (req, res) => {
  await db.query('UPDATE notifications SET read_at=now() WHERE user_id=$1 AND read_at IS NULL', [req.user.id]);
  res.json({ ok: true });
});

router.post('/notifications/:id/read', requireAuth, async (req, res) => {
  await db.query('UPDATE notifications SET read_at=COALESCE(read_at, now()) WHERE id=$1 AND user_id=$2', [intParam(req.params.id), req.user.id]);
  res.json({ ok: true });
});

module.exports = router;
