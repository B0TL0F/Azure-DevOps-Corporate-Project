'use strict';

const express = require('express');
const { z } = require('zod');
const db = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');
const { parse, intParam, notFound, badRequest, conflict } = require('../utils');
const core = require('../services/core');
const metrics = require('../metrics');

const router = express.Router();
router.use(requireAuth);

const STATUSES = ['planning', 'active', 'on_hold', 'completed', 'cancelled'];
const HEALTH = ['green', 'amber', 'red'];
const PRIORITIES = ['low', 'medium', 'high', 'critical'];
const CATEGORIES = ['Cloud Migration', 'Kubernetes Platform', 'CI/CD', 'DevSecOps', 'Observability', 'MLOps', 'Cost Optimization', 'Infrastructure as Code'];
const OPEN = ['planning', 'active', 'on_hold'];

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

const projectFields = {
  name: z.string().trim().min(3).max(120),
  clientId: z.number().int().positive(),
  ownerId: z.number().int().positive(),
  summary: z.string().trim().max(200).optional().nullable(),
  description: z.string().trim().max(8000).optional().nullable(),
  category: z.enum(CATEGORIES),
  status: z.enum(STATUSES),
  health: z.enum(HEALTH),
  priority: z.enum(PRIORITIES),
  techStack: z.array(z.string().trim().min(1).max(30)).max(15),
  startDate: isoDate,
  dueDate: isoDate,
  budgetHours: z.number().int().min(0).max(100000),
  contractValue: z.number().min(0).max(1e12),
  repoUrl: z.url().max(300).optional().nullable().or(z.literal('')),
};

const createSchema = z.object({
  ...projectFields,
  status: projectFields.status.default('planning'),
  health: projectFields.health.default('green'),
  priority: projectFields.priority.default('medium'),
  techStack: projectFields.techStack.default([]),
  budgetHours: projectFields.budgetHours.default(0),
  contractValue: projectFields.contractValue.default(0),
}).refine((b) => b.dueDate >= b.startDate, { message: 'Due date must be on or after the start date', path: ['dueDate'] });

const updateSchema = z.object(projectFields).partial();

const COLUMN = {
  name: 'name', clientId: 'client_id', ownerId: 'owner_id', summary: 'summary', description: 'description',
  category: 'category', status: 'status', health: 'health', priority: 'priority', techStack: 'tech_stack',
  startDate: 'start_date', dueDate: 'due_date', budgetHours: 'budget_hours', contractValue: 'contract_value', repoUrl: 'repo_url',
};

// One row per project with everything a list or card needs.
const LIST_SQL = `
  SELECT p.id, p.code, p.name, p.summary, p.category, p.status, p.health, p.priority, p.tech_stack,
         to_char(p.start_date,'YYYY-MM-DD') AS start_date, to_char(p.due_date,'YYYY-MM-DD') AS due_date,
         p.budget_hours, p.contract_value::float AS contract_value, p.updated_at,
         c.id AS client_id, c.name AS client_name, c.slug AS client_slug, c.tier AS client_tier,
         o.id AS owner_id, o.name AS owner_name, o.title AS owner_title,
         COALESCE(h.hours, 0)::float AS hours_used,
         COALESCE(ms.total, 0)::int AS milestones_total, COALESCE(ms.done, 0)::int AS milestones_done,
         COALESCE(tm.members, 0)::int AS team_size,
         (p.due_date < current_date AND p.status IN ('planning','active','on_hold')) AS overdue
    FROM projects p
    JOIN clients c ON c.id = p.client_id
    JOIN users o ON o.id = p.owner_id
    LEFT JOIN (SELECT project_id, sum(hours) AS hours FROM time_entries GROUP BY project_id) h ON h.project_id = p.id
    LEFT JOIN (SELECT project_id, count(*) AS total, count(*) FILTER (WHERE status='done') AS done
                 FROM milestones GROUP BY project_id) ms ON ms.project_id = p.id
    LEFT JOIN (SELECT project_id, count(*) AS members FROM project_members GROUP BY project_id) tm ON tm.project_id = p.id`;

function shape(r) {
  const progress = r.milestones_total ? Math.round((r.milestones_done / r.milestones_total) * 100) : (r.status === 'completed' ? 100 : 0);
  return {
    id: r.id, code: r.code, name: r.name, summary: r.summary, category: r.category, status: r.status, health: r.health,
    priority: r.priority, techStack: r.tech_stack, startDate: r.start_date, dueDate: r.due_date, updatedAt: r.updated_at,
    budgetHours: r.budget_hours, hoursUsed: r.hours_used, contractValue: r.contract_value,
    burnPct: r.budget_hours ? Math.round((r.hours_used / r.budget_hours) * 100) : 0,
    milestones: { total: r.milestones_total, done: r.milestones_done }, progress, teamSize: r.team_size, overdue: r.overdue,
    client: { id: r.client_id, name: r.client_name, slug: r.client_slug, tier: r.client_tier },
    owner: { id: r.owner_id, name: r.owner_name, title: r.owner_title },
  };
}

const SORTS = {
  due: `(p.status IN ('completed','cancelled')), p.due_date ASC, p.id`, // finished work sinks to the bottom updated: 'p.updated_at DESC, p.id DESC', name: 'p.name ASC',
  priority: `array_position(ARRAY['critical','high','medium','low'], p.priority), p.due_date`,
  health: `array_position(ARRAY['red','amber','green'], p.health), p.due_date`,
  value: 'p.contract_value DESC, p.id',
};

/** Shared filter builder, used by the list and the CSV export. */
function buildFilter(q, user) {
  const where = []; const vals = [];
  const add = (sql, v) => { vals.push(v); where.push(sql.replace('?', `$${vals.length}`)); };
  if (q.q) add(`(p.name ILIKE ? OR p.code ILIKE $${vals.length + 1} OR c.name ILIKE $${vals.length + 1} OR array_to_string(p.tech_stack,' ') ILIKE $${vals.length + 1})`, `%${q.q}%`);
  if (q.status === 'open') where.push(`p.status IN ('planning','active','on_hold')`);
  else if (q.status) add('p.status = ?', q.status);
  if (q.health) add('p.health = ?', q.health);
  if (q.priority) add('p.priority = ?', q.priority);
  if (q.category) add('p.category = ?', q.category);
  if (q.clientId) add('p.client_id = ?', intParam(q.clientId, 'clientId'));
  if (q.ownerId) add('p.owner_id = ?', intParam(q.ownerId, 'ownerId'));
  if (q.mine === 'true') add('(p.owner_id = ? OR EXISTS (SELECT 1 FROM project_members m WHERE m.project_id=p.id AND m.user_id=$' + (vals.length + 1) + '))', user.id);
  if (q.overdue === 'true') where.push(`p.due_date < current_date AND p.status IN ('planning','active','on_hold')`);
  return { where: where.length ? `WHERE ${where.join(' AND ')}` : '', vals };
}

const listQuery = z.object({
  q: z.string().trim().max(80).optional(),
  status: z.enum([...STATUSES, 'open']).optional(),
  health: z.enum(HEALTH).optional(),
  priority: z.enum(PRIORITIES).optional(),
  category: z.enum(CATEGORIES).optional(),
  clientId: z.string().optional(),
  ownerId: z.string().optional(),
  mine: z.enum(['true', 'false']).optional(),
  overdue: z.enum(['true', 'false']).optional(),
  sort: z.enum(Object.keys(SORTS)).default('due'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(24),
});

router.get('/meta', (_req, res) => res.json({ statuses: STATUSES, health: HEALTH, priorities: PRIORITIES, categories: CATEGORIES }));

router.get('/', async (req, res) => {
  const q = parse(listQuery, req.query);
  const { where, vals } = buildFilter(q, req.user);
  const base = `FROM projects p JOIN clients c ON c.id=p.client_id ${where}`;
  const { total } = await db.one(`SELECT count(*)::int AS total ${base}`, vals);
  const rows = await db.many(
    `SELECT * FROM (${LIST_SQL} ${where}) x ORDER BY ${SORTS[q.sort].replace(/p\./g, 'x.')} LIMIT ${q.pageSize} OFFSET ${(q.page - 1) * q.pageSize}`,
    vals,
  );
  res.json({ projects: rows.map(shape), total, page: q.page, pageSize: q.pageSize });
});

function csvCell(v) {
  const s = v === null || v === undefined ? '' : String(v);
  // Neutralise spreadsheet formulas and quote everything.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

router.get('/export.csv', async (req, res) => {
  const q = parse(listQuery, req.query);
  const { where, vals } = buildFilter(q, req.user);
  const rows = (await db.many(`SELECT * FROM (${LIST_SQL} ${where}) x ORDER BY ${SORTS[q.sort].replace(/p\./g, 'x.')}`, vals)).map(shape);
  const header = ['Code', 'Project', 'Client', 'Owner', 'Category', 'Status', 'Health', 'Priority', 'Start', 'Due', 'Progress %', 'Budget hours', 'Hours used', 'Contract value (INR)'];
  const lines = rows.map((p) => [p.code, p.name, p.client.name, p.owner.name, p.category, p.status, p.health, p.priority,
    p.startDate, p.dueDate, p.progress, p.budgetHours, p.hoursUsed, p.contractValue].map(csvCell).join(','));
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', 'attachment; filename="shackpulse-projects.csv"');
  res.send([header.map(csvCell).join(','), ...lines].join('\n'));
});

async function loadDetail(id, user) {
  const row = await db.one(`${LIST_SQL} WHERE p.id=$1`, [id]);
  if (!row) throw notFound('Project not found');
  const project = shape(row);
  const extra = await db.one(
    `SELECT p.description, p.repo_url, p.created_at, p.completed_at, u.name AS created_by_name
       FROM projects p LEFT JOIN users u ON u.id=p.created_by WHERE p.id=$1`, [id]);
  const [members, milestones, hoursByPerson, weekly, contacts] = await Promise.all([
    db.many(
      `SELECT u.id, u.name, u.title, u.department, m.project_role, m.allocation_pct,
              COALESCE((SELECT sum(hours) FROM time_entries t WHERE t.project_id=m.project_id AND t.user_id=u.id),0)::float AS hours
         FROM project_members m JOIN users u ON u.id=m.user_id WHERE m.project_id=$1
        ORDER BY (m.project_role = 'Project Owner') DESC, m.allocation_pct DESC, u.name`, [id]),
    db.many(
      `SELECT id, title, status, to_char(due_date,'YYYY-MM-DD') AS due_date, completed_at,
              (due_date < current_date AND status<>'done') AS overdue
         FROM milestones WHERE project_id=$1 ORDER BY due_date, id`, [id]),
    db.many(
      `SELECT u.id, u.name, sum(t.hours)::float AS hours FROM time_entries t JOIN users u ON u.id=t.user_id
        WHERE t.project_id=$1 GROUP BY u.id, u.name ORDER BY hours DESC`, [id]),
    db.many(
      `SELECT to_char(w, 'YYYY-MM-DD') AS week, COALESCE(sum(t.hours),0)::float AS hours
         FROM generate_series(date_trunc('week', current_date) - interval '7 weeks', date_trunc('week', current_date), interval '1 week') w
         LEFT JOIN time_entries t ON t.project_id=$1 AND date_trunc('week', t.entry_date) = w
        GROUP BY w ORDER BY w`, [id]),
    db.many('SELECT id, name, email, role, is_primary FROM client_contacts WHERE client_id=$1 ORDER BY is_primary DESC, name', [project.client.id]),
  ]);
  const raw = { id, owner_id: project.owner.id };
  const member = members.some((m) => m.id === user.id);
  return {
    ...project,
    description: extra.description, repoUrl: extra.repo_url, createdAt: extra.created_at, completedAt: extra.completed_at,
    createdBy: extra.created_by_name,
    members: members.map((m) => ({ id: m.id, name: m.name, title: m.title, department: m.department, projectRole: m.project_role, allocationPct: m.allocation_pct, hours: m.hours })),
    milestones: milestones.map((m) => ({ id: m.id, title: m.title, status: m.status, dueDate: m.due_date, completedAt: m.completed_at, overdue: m.overdue })),
    milestoneSummary: project.milestones,
    hoursByPerson, weekly, clientContacts: contacts,
    permissions: {
      manage: core.canManage(user, raw),
      contribute: core.canManage(user, raw) || (user.role !== 'viewer' && member),
      delete: user.role === 'admin',
    },
  };
}

router.get('/:id', async (req, res) => {
  res.json({ project: await loadDetail(intParam(req.params.id), req.user) });
});

async function assertRefs(clientId, ownerId) {
  if (clientId !== undefined && !(await db.one('SELECT 1 FROM clients WHERE id=$1', [clientId]))) throw badRequest('Client does not exist');
  if (ownerId !== undefined) {
    const o = await db.one(`SELECT role, status FROM users WHERE id=$1`, [ownerId]);
    if (!o || o.status !== 'active') throw badRequest('Owner must be an active person');
    if (!['admin', 'manager'].includes(o.role)) throw badRequest('Owner must be a project manager or admin');
  }
}

router.post('/', requireRole('admin', 'manager'), async (req, res) => {
  const b = parse(createSchema, req.body);
  if (req.user.role === 'manager' && b.ownerId !== req.user.id) {
    // Managers create projects they own; admins can assign anyone.
    b.ownerId = req.user.id;
  }
  await assertRefs(b.clientId, b.ownerId);
  const p = await db.tx(async (c) => {
    const { rows: [row] } = await c.query(
      `INSERT INTO projects(name, client_id, owner_id, summary, description, category, status, health, priority, tech_stack,
                            start_date, due_date, budget_hours, contract_value, repo_url, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id, code, name, client_id, owner_id`,
      [b.name, b.clientId, b.ownerId, b.summary ?? null, b.description ?? null, b.category, b.status, b.health, b.priority,
        b.techStack, b.startDate, b.dueDate, b.budgetHours, b.contractValue, b.repoUrl || null, req.user.id],
    );
    await c.query(`INSERT INTO project_members(project_id, user_id, project_role, allocation_pct) VALUES ($1,$2,'Project Owner',50)`, [row.id, b.ownerId]);
    await core.record(req.user.id, 'project.create', `${req.user.name} created ${row.code} ${row.name}`, { projectId: row.id, clientId: row.client_id }, c);
    if (row.owner_id !== req.user.id) {
      await core.notify(row.owner_id, { type: 'project_assigned', title: `You own ${row.code} ${row.name}`, body: `Assigned by ${req.user.name}`, link: `/projects/${row.id}` }, c);
    }
    return row;
  });
  metrics.projectsCreated.inc();
  res.status(201).json({ project: await loadDetail(p.id, req.user) });
});

router.patch('/:id', async (req, res) => {
  const id = intParam(req.params.id);
  const project = await core.getProject(id);
  core.assertCanManage(req.user, project);
  const b = parse(updateSchema, req.body);
  if (b.ownerId !== undefined && req.user.role !== 'admin') throw badRequest('Only an admin can change the owner');
  await assertRefs(b.clientId, b.ownerId);
  const start = b.startDate ?? project.start_date;
  const due = b.dueDate ?? project.due_date;
  if (due < start) throw badRequest('Due date must be on or after the start date');

  const sets = []; const vals = [id];
  for (const [k, v] of Object.entries(b)) { vals.push(k === 'repoUrl' ? (v || null) : v); sets.push(`${COLUMN[k]}=$${vals.length}`); }
  if (b.status === 'completed' && project.status !== 'completed') sets.push('completed_at=now()');
  if (b.status && b.status !== 'completed') sets.push('completed_at=NULL');
  if (!sets.length) return res.json({ project: await loadDetail(id, req.user) });
  sets.push('updated_at=now()');

  await db.tx(async (c) => {
    await c.query(`UPDATE projects SET ${sets.join(', ')} WHERE id=$1`, vals);
    const changes = [];
    if (b.status && b.status !== project.status) changes.push(`status ${project.status} → ${b.status}`);
    if (b.health && b.health !== project.health) changes.push(`health ${project.health} → ${b.health}`);
    if (b.dueDate && b.dueDate !== project.due_date) changes.push(`due date → ${b.dueDate}`);
    const summary = changes.length ? `${req.user.name} changed ${project.code}: ${changes.join(', ')}` : `${req.user.name} edited ${project.code} ${b.name || project.name}`;
    await core.record(req.user.id, 'project.update', summary, { projectId: id, clientId: project.client_id, meta: b });
    if (b.ownerId && b.ownerId !== project.owner_id) {
      await c.query(`INSERT INTO project_members(project_id, user_id, project_role) VALUES ($1,$2,'Project Owner')
                     ON CONFLICT (project_id, user_id) DO UPDATE SET project_role='Project Owner'`, [id, b.ownerId]);
      await core.notify(b.ownerId, { type: 'project_assigned', title: `You now own ${project.code} ${project.name}`, link: `/projects/${id}` }, c);
    }
    if (changes.length) {
      const members = (await c.query('SELECT user_id FROM project_members WHERE project_id=$1', [id])).rows.map((r) => r.user_id);
      await core.notifyMany([...members, project.owner_id], { type: 'project_changed', title: `${project.code}: ${changes.join(', ')}`, link: `/projects/${id}` }, req.user.id, c);
    }
  });
  res.json({ project: await loadDetail(id, req.user) });
});

router.delete('/:id', requireRole('admin'), async (req, res) => {
  const id = intParam(req.params.id);
  const project = await core.getProject(id);
  await db.query('DELETE FROM projects WHERE id=$1', [id]);
  await core.record(req.user.id, 'project.delete', `${req.user.name} deleted ${project.code} ${project.name}`, { clientId: project.client_id });
  res.status(204).end();
});

// ---------------- team ----------------
const memberSchema = z.object({
  userId: z.number().int().positive(),
  projectRole: z.string().trim().min(2).max(60).default('Engineer'),
  allocationPct: z.number().int().min(5).max(100).default(50),
});

router.post('/:id/members', async (req, res) => {
  const id = intParam(req.params.id);
  const project = await core.getProject(id);
  core.assertCanManage(req.user, project);
  const b = parse(memberSchema, req.body);
  const u = await db.one('SELECT id, name, status FROM users WHERE id=$1', [b.userId]);
  if (!u || u.status !== 'active') throw badRequest('That person is not an active user');
  const exists = await db.one('SELECT 1 FROM project_members WHERE project_id=$1 AND user_id=$2', [id, b.userId]);
  await db.query(
    `INSERT INTO project_members(project_id, user_id, project_role, allocation_pct) VALUES ($1,$2,$3,$4)
     ON CONFLICT (project_id, user_id) DO UPDATE SET project_role=EXCLUDED.project_role, allocation_pct=EXCLUDED.allocation_pct`,
    [id, b.userId, b.projectRole, b.allocationPct],
  );
  if (!exists) {
    await core.record(req.user.id, 'project.member_add', `${u.name} joined ${project.code} as ${b.projectRole}`, { projectId: id });
    await core.notify(u.id, { type: 'project_joined', title: `You were added to ${project.code} ${project.name}`, body: `${b.projectRole} · ${b.allocationPct}%`, link: `/projects/${id}` });
  }
  res.status(exists ? 200 : 201).json({ project: await loadDetail(id, req.user) });
});

router.delete('/:id/members/:userId', async (req, res) => {
  const id = intParam(req.params.id); const userId = intParam(req.params.userId, 'userId');
  const project = await core.getProject(id);
  core.assertCanManage(req.user, project);
  if (userId === project.owner_id) throw badRequest('The owner cannot be removed. Change the owner first.');
  const r = await db.query('DELETE FROM project_members WHERE project_id=$1 AND user_id=$2', [id, userId]);
  if (!r.rowCount) throw notFound('That person is not on this project');
  await core.record(req.user.id, 'project.member_remove', `${req.user.name} removed a member from ${project.code}`, { projectId: id, meta: { userId } });
  res.json({ project: await loadDetail(id, req.user) });
});

// ---------------- milestones ----------------
const milestoneSchema = z.object({ title: z.string().trim().min(2).max(140), dueDate: isoDate });

router.post('/:id/milestones', async (req, res) => {
  const id = intParam(req.params.id);
  const project = await core.getProject(id);
  core.assertCanManage(req.user, project);
  const b = parse(milestoneSchema, req.body);
  await db.query('INSERT INTO milestones(project_id, title, due_date) VALUES ($1,$2,$3)', [id, b.title, b.dueDate]);
  await db.query('UPDATE projects SET updated_at=now() WHERE id=$1', [id]);
  await core.record(req.user.id, 'milestone.create', `${req.user.name} added milestone "${b.title}" to ${project.code}`, { projectId: id });
  res.status(201).json({ project: await loadDetail(id, req.user) });
});

router.patch('/:id/milestones/:mid', async (req, res) => {
  const id = intParam(req.params.id); const mid = intParam(req.params.mid, 'milestone id');
  const project = await core.getProject(id);
  const b = parse(z.object({ status: z.enum(['pending', 'in_progress', 'done']).optional(), title: z.string().trim().min(2).max(140).optional(), dueDate: isoDate.optional() }), req.body);
  // Members may move a milestone along; renaming or rescheduling is for the owner.
  if (b.title || b.dueDate) core.assertCanManage(req.user, project);
  else await core.assertCanContribute(req.user, project);
  const m = await db.one('SELECT * FROM milestones WHERE id=$1 AND project_id=$2', [mid, id]);
  if (!m) throw notFound('Milestone not found');
  await db.query(
    `UPDATE milestones SET status=COALESCE($2,status), title=COALESCE($3,title), due_date=COALESCE($4::date,due_date),
       completed_at = CASE WHEN $2='done' THEN COALESCE(completed_at, now()) WHEN $2 IS NULL THEN completed_at ELSE NULL END
     WHERE id=$1`, [mid, b.status ?? null, b.title ?? null, b.dueDate ?? null]);
  await db.query('UPDATE projects SET updated_at=now() WHERE id=$1', [id]);
  if (b.status === 'done' && m.status !== 'done') {
    await core.record(req.user.id, 'milestone.done', `${req.user.name} completed "${m.title}" on ${project.code}`, { projectId: id });
    await core.notify(project.owner_id === req.user.id ? null : project.owner_id,
      { type: 'milestone_done', title: `Milestone done: ${m.title}`, body: `${project.code} · by ${req.user.name}`, link: `/projects/${id}` });
  }
  res.json({ project: await loadDetail(id, req.user) });
});

router.delete('/:id/milestones/:mid', async (req, res) => {
  const id = intParam(req.params.id); const mid = intParam(req.params.mid, 'milestone id');
  const project = await core.getProject(id);
  core.assertCanManage(req.user, project);
  const r = await db.query('DELETE FROM milestones WHERE id=$1 AND project_id=$2', [mid, id]);
  if (!r.rowCount) throw notFound('Milestone not found');
  res.json({ project: await loadDetail(id, req.user) });
});

// ---------------- updates feed ----------------
router.get('/:id/updates', async (req, res) => {
  const id = intParam(req.params.id);
  await core.getProject(id);
  const rows = await db.many(
    `SELECT u.id, u.kind, u.health, u.body, u.created_at, a.id AS author_id, a.name AS author_name, a.title AS author_title
       FROM project_updates u LEFT JOIN users a ON a.id=u.author_id WHERE u.project_id=$1 ORDER BY u.created_at DESC, u.id DESC LIMIT 100`, [id]);
  res.json({ updates: rows.map((r) => ({ id: r.id, kind: r.kind, health: r.health, body: r.body, createdAt: r.created_at,
    author: r.author_id ? { id: r.author_id, name: r.author_name, title: r.author_title } : null })) });
});

router.post('/:id/updates', async (req, res) => {
  const id = intParam(req.params.id);
  const project = await core.getProject(id);
  await core.assertCanContribute(req.user, project);
  const b = parse(z.object({
    kind: z.enum(['status', 'comment', 'risk', 'decision']).default('comment'),
    health: z.enum(HEALTH).optional(),
    body: z.string().trim().min(3).max(4000),
  }), req.body);
  if (b.kind === 'status' && !b.health) throw badRequest('A status update needs a health rating');
  if (b.kind !== 'status') b.health = undefined;
  // A status update from the owner (or an admin) also sets the project's health.
  const setsHealth = b.kind === 'status' && core.canManage(req.user, project);
  const update = await db.tx(async (c) => {
    const { rows: [u] } = await c.query(
      'INSERT INTO project_updates(project_id, author_id, kind, health, body) VALUES ($1,$2,$3,$4,$5) RETURNING id, created_at',
      [id, req.user.id, b.kind, b.health ?? null, b.body]);
    await c.query(`UPDATE projects SET updated_at=now() ${setsHealth ? ', health=$2' : ''} WHERE id=$1`, setsHealth ? [id, b.health] : [id]);
    await core.record(req.user.id, `update.${b.kind}`, `${req.user.name} posted a ${b.kind} on ${project.code}`, { projectId: id, meta: { health: b.health ?? null } }, c);
    const members = (await c.query('SELECT user_id FROM project_members WHERE project_id=$1', [id])).rows.map((r) => r.user_id);
    await core.notifyMany([...members, project.owner_id], {
      type: `update_${b.kind}`, title: `${project.code}: new ${b.kind} from ${req.user.name}`, body: b.body.slice(0, 140), link: `/projects/${id}?tab=updates`,
    }, req.user.id, c);
    return u;
  });
  metrics.updatesPosted.inc({ kind: b.kind });
  res.status(201).json({ update: { id: update.id, createdAt: update.created_at }, healthChanged: setsHealth && b.health !== project.health });
});

// ---------------- time tracking ----------------
router.get('/:id/time', async (req, res) => {
  const id = intParam(req.params.id);
  await core.getProject(id);
  const rows = await db.many(
    `SELECT t.id, to_char(t.entry_date,'YYYY-MM-DD') AS entry_date, t.hours::float AS hours, t.note, u.id AS user_id, u.name AS user_name
       FROM time_entries t JOIN users u ON u.id=t.user_id WHERE t.project_id=$1 ORDER BY t.entry_date DESC, t.id DESC LIMIT 60`, [id]);
  res.json({ entries: rows.map((r) => ({ id: r.id, date: r.entry_date, hours: r.hours, note: r.note, user: { id: r.user_id, name: r.user_name } })) });
});

router.post('/:id/time', async (req, res) => {
  const id = intParam(req.params.id);
  const project = await core.getProject(id);
  await core.assertCanContribute(req.user, project);
  const b = parse(z.object({ date: isoDate, hours: z.number().min(0.5).max(16), note: z.string().trim().max(300).optional() }), req.body);
  if (b.date > new Date(Date.now() + 14 * 36e5).toISOString().slice(0, 10)) // allow for any time zone ahead of UTC
    throw badRequest('You cannot log time in the future');
  const { total } = await db.one('SELECT COALESCE(sum(hours),0)::float AS total FROM time_entries WHERE user_id=$1 AND entry_date=$2', [req.user.id, b.date]);
  if (total + b.hours > 16) throw conflict(`That would be ${total + b.hours} hours on ${b.date}. The daily limit is 16.`);
  await db.query('INSERT INTO time_entries(project_id, user_id, entry_date, hours, note) VALUES ($1,$2,$3,$4,$5)', [id, req.user.id, b.date, b.hours, b.note ?? null]);
  await db.query('UPDATE projects SET updated_at=now() WHERE id=$1', [id]);
  metrics.hoursLogged.inc(b.hours);
  res.status(201).json({ project: await loadDetail(id, req.user) });
});

router.delete('/:id/time/:entryId', async (req, res) => {
  const id = intParam(req.params.id); const entryId = intParam(req.params.entryId, 'entry id');
  const project = await core.getProject(id);
  const e = await db.one('SELECT user_id FROM time_entries WHERE id=$1 AND project_id=$2', [entryId, id]);
  if (!e) throw notFound('Time entry not found');
  if (e.user_id !== req.user.id) core.assertCanManage(req.user, project);
  await db.query('DELETE FROM time_entries WHERE id=$1', [entryId]);
  res.json({ project: await loadDetail(id, req.user) });
});

module.exports = { router, CATEGORIES, STATUSES, OPEN };
