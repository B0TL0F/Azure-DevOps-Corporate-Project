'use strict';

const express = require('express');
const { z } = require('zod');
const db = require('../db/pool');
const { requireAuth } = require('../middleware/auth');
const { parse, intParam, notFound } = require('../utils');
const { DEPARTMENTS } = require('./auth');

const router = express.Router();
router.use(requireAuth);

// Allocation = sum of allocation_pct across a person's open projects. Over 100% means overbooked.
const PEOPLE_SQL = `
  SELECT u.id, u.name, u.email, u.role, u.title, u.department, u.location, u.last_login_at,
         COALESCE(a.open_projects,0)::int AS open_projects, COALESCE(a.allocation,0)::int AS allocation,
         COALESCE(o.owned,0)::int AS owned_projects,
         COALESCE(t.hours_30d,0)::float AS hours_30d
    FROM users u
    LEFT JOIN (SELECT m.user_id, count(*) AS open_projects, sum(m.allocation_pct) AS allocation
                 FROM project_members m JOIN projects p ON p.id=m.project_id
                WHERE p.status IN ('planning','active','on_hold') GROUP BY m.user_id) a ON a.user_id=u.id
    LEFT JOIN (SELECT owner_id, count(*) AS owned FROM projects WHERE status IN ('planning','active','on_hold') GROUP BY owner_id) o ON o.owner_id=u.id
    LEFT JOIN (SELECT user_id, sum(hours) AS hours_30d FROM time_entries WHERE entry_date >= current_date - 30 GROUP BY user_id) t ON t.user_id=u.id`;

function shape(r) {
  return {
    id: r.id, name: r.name, email: r.email, role: r.role, title: r.title, department: r.department, location: r.location,
    lastLoginAt: r.last_login_at, openProjects: r.open_projects, allocation: r.allocation, ownedProjects: r.owned_projects, hours30d: r.hours_30d,
  };
}

router.get('/', async (req, res) => {
  const q = parse(z.object({
    q: z.string().trim().max(80).optional(), department: z.enum(DEPARTMENTS).optional(),
    role: z.enum(['admin', 'manager', 'member', 'viewer']).optional(), owners: z.enum(['true', 'false']).optional(),
  }), req.query);
  const where = [`u.status='active'`]; const vals = [];
  if (q.q) { vals.push(`%${q.q}%`); where.push(`(u.name ILIKE $${vals.length} OR u.title ILIKE $${vals.length} OR u.email ILIKE $${vals.length})`); }
  if (q.department) { vals.push(q.department); where.push(`u.department=$${vals.length}`); }
  if (q.role) { vals.push(q.role); where.push(`u.role=$${vals.length}`); }
  if (q.owners === 'true') where.push(`u.role IN ('admin','manager')`);
  const rows = await db.many(`${PEOPLE_SQL} WHERE ${where.join(' AND ')} ORDER BY u.department NULLS LAST, u.name`, vals);
  res.json({ people: rows.map(shape), departments: DEPARTMENTS });
});

router.get('/:id', async (req, res) => {
  const id = intParam(req.params.id);
  const row = await db.one(`${PEOPLE_SQL} WHERE u.id=$1 AND u.status='active'`, [id]);
  if (!row) throw notFound('Person not found');
  const [projects, weekly, recent] = await Promise.all([
    db.many(
      `SELECT p.id, p.code, p.name, p.status, p.health, to_char(p.due_date,'YYYY-MM-DD') AS due_date,
              c.name AS client_name, c.slug AS client_slug, m.project_role, m.allocation_pct, (p.owner_id = $1) AS is_owner,
              COALESCE((SELECT sum(hours) FROM time_entries t WHERE t.project_id=p.id AND t.user_id=$1),0)::float AS hours
         FROM project_members m JOIN projects p ON p.id=m.project_id JOIN clients c ON c.id=p.client_id
        WHERE m.user_id=$1
        ORDER BY array_position(ARRAY['active','planning','on_hold','completed','cancelled'], p.status), p.due_date`, [id]),
    db.many(
      `SELECT to_char(w,'YYYY-MM-DD') AS week, COALESCE(sum(t.hours),0)::float AS hours
         FROM generate_series(date_trunc('week', current_date) - interval '7 weeks', date_trunc('week', current_date), interval '1 week') w
         LEFT JOIN time_entries t ON t.user_id=$1 AND date_trunc('week', t.entry_date)=w
        GROUP BY w ORDER BY w`, [id]),
    db.many(
      `SELECT a.id, a.action, a.summary, a.created_at, a.project_id FROM activity a WHERE a.actor_id=$1 ORDER BY a.created_at DESC LIMIT 10`, [id]),
  ]);
  res.json({
    person: {
      ...shape(row),
      projects: projects.map((p) => ({
        id: p.id, code: p.code, name: p.name, status: p.status, health: p.health, dueDate: p.due_date,
        client: { name: p.client_name, slug: p.client_slug }, projectRole: p.project_role, allocationPct: p.allocation_pct, isOwner: p.is_owner, hours: p.hours,
      })),
      weekly,
      recentActivity: recent.map((a) => ({ id: a.id, action: a.action, summary: a.summary, createdAt: a.created_at, projectId: a.project_id })),
    },
  });
});

module.exports = router;
