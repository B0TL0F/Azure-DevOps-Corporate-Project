'use strict';

const express = require('express');
const { z } = require('zod');
const db = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');
const { parse, intParam, notFound, conflict, badRequest, slugify } = require('../utils');
const core = require('../services/core');

const router = express.Router();
router.use(requireAuth);

const TIERS = ['strategic', 'key', 'standard'];
const INDUSTRIES = ['Banking & Finance', 'Healthcare', 'Retail & E-commerce', 'Telecom', 'Insurance', 'Media', 'Automotive', 'Education', 'Logistics', 'Food & Beverage', 'SaaS'];

const clientFields = {
  name: z.string().trim().min(2).max(100),
  industry: z.enum(INDUSTRIES),
  tier: z.enum(TIERS),
  status: z.enum(['prospect', 'active', 'inactive']),
  city: z.string().trim().max(60).optional().nullable(),
  country: z.string().trim().min(2).max(60),
  website: z.url().max(200).optional().nullable().or(z.literal('')),
  accountManagerId: z.number().int().positive().optional().nullable(),
  notes: z.string().trim().max(4000).optional().nullable(),
};

const SUMMARY_SQL = `
  SELECT c.id, c.name, c.slug, c.industry, c.tier, c.status, c.city, c.country, c.website, c.notes, c.created_at,
         am.id AS am_id, am.name AS am_name,
         count(p.id)::int AS projects_total,
         count(p.id) FILTER (WHERE p.status IN ('planning','active','on_hold'))::int AS projects_open,
         count(p.id) FILTER (WHERE p.health='red' AND p.status IN ('planning','active','on_hold'))::int AS projects_red,
         COALESCE(sum(p.contract_value) FILTER (WHERE p.status <> 'cancelled'),0)::float AS contract_value,
         max(p.updated_at) AS last_activity
    FROM clients c
    LEFT JOIN users am ON am.id = c.account_manager_id
    LEFT JOIN projects p ON p.client_id = c.id`;

function shape(r) {
  return {
    id: r.id, name: r.name, slug: r.slug, industry: r.industry, tier: r.tier, status: r.status, city: r.city, country: r.country,
    website: r.website, notes: r.notes, createdAt: r.created_at, accountManager: r.am_id ? { id: r.am_id, name: r.am_name } : null,
    projects: { total: r.projects_total, open: r.projects_open, red: r.projects_red }, contractValue: r.contract_value, lastActivity: r.last_activity,
  };
}

router.get('/meta', (_req, res) => res.json({ tiers: TIERS, industries: INDUSTRIES }));

router.get('/', async (req, res) => {
  const q = parse(z.object({
    q: z.string().trim().max(80).optional(), tier: z.enum(TIERS).optional(), status: z.enum(['prospect', 'active', 'inactive']).optional(),
    industry: z.enum(INDUSTRIES).optional(),
  }), req.query);
  const where = []; const vals = [];
  if (q.q) { vals.push(`%${q.q}%`); where.push(`(c.name ILIKE $${vals.length} OR c.city ILIKE $${vals.length})`); }
  if (q.tier) { vals.push(q.tier); where.push(`c.tier=$${vals.length}`); }
  if (q.status) { vals.push(q.status); where.push(`c.status=$${vals.length}`); }
  if (q.industry) { vals.push(q.industry); where.push(`c.industry=$${vals.length}`); }
  const rows = await db.many(
    `${SUMMARY_SQL} ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     GROUP BY c.id, am.id ORDER BY array_position(ARRAY['strategic','key','standard'], c.tier), c.name`, vals);
  res.json({ clients: rows.map(shape) });
});

async function detail(id) {
  const row = await db.one(`${SUMMARY_SQL} WHERE c.id=$1 GROUP BY c.id, am.id`, [id]);
  if (!row) throw notFound('Client not found');
  const [contacts, projects] = await Promise.all([
    db.many('SELECT id, name, email, phone, role, is_primary FROM client_contacts WHERE client_id=$1 ORDER BY is_primary DESC, name', [id]),
    db.many(
      `SELECT p.id, p.code, p.name, p.status, p.health, p.priority, p.category, to_char(p.due_date,'YYYY-MM-DD') AS due_date,
              p.contract_value::float AS contract_value, o.id AS owner_id, o.name AS owner_name,
              (SELECT count(*) FROM milestones m WHERE m.project_id=p.id)::int AS ms_total,
              (SELECT count(*) FROM milestones m WHERE m.project_id=p.id AND m.status='done')::int AS ms_done
         FROM projects p JOIN users o ON o.id=p.owner_id WHERE p.client_id=$1
        ORDER BY array_position(ARRAY['active','planning','on_hold','completed','cancelled'], p.status), p.due_date`, [id]),
  ]);
  return {
    ...shape(row),
    contacts: contacts.map((c) => ({ id: c.id, name: c.name, email: c.email, phone: c.phone, role: c.role, isPrimary: c.is_primary })),
    projectList: projects.map((p) => ({
      id: p.id, code: p.code, name: p.name, status: p.status, health: p.health, priority: p.priority, category: p.category,
      dueDate: p.due_date, contractValue: p.contract_value, owner: { id: p.owner_id, name: p.owner_name },
      progress: p.ms_total ? Math.round((p.ms_done / p.ms_total) * 100) : (p.status === 'completed' ? 100 : 0),
    })),
  };
}

router.get('/:idOrSlug', async (req, res) => {
  const key = req.params.idOrSlug;
  const row = /^\d+$/.test(key) ? { id: Number(key) } : await db.one('SELECT id FROM clients WHERE slug=$1', [key]);
  if (!row) throw notFound('Client not found');
  res.json({ client: await detail(row.id) });
});

async function assertAccountManager(id) {
  if (id === undefined || id === null) return;
  const u = await db.one(`SELECT role, status FROM users WHERE id=$1`, [id]);
  if (!u || u.status !== 'active' || !['admin', 'manager'].includes(u.role)) throw badRequest('Account manager must be an active manager or admin');
}

router.post('/', requireRole('admin', 'manager'), async (req, res) => {
  const b = parse(z.object({ ...clientFields, tier: clientFields.tier.default('standard'), status: clientFields.status.default('active'), country: clientFields.country.default('India') }), req.body);
  if (await db.one('SELECT 1 FROM clients WHERE lower(name)=lower($1)', [b.name])) throw conflict('A client with this name already exists');
  await assertAccountManager(b.accountManagerId);
  let slug = slugify(b.name);
  if (await db.one('SELECT 1 FROM clients WHERE slug=$1', [slug])) slug = `${slug}-${Date.now().toString(36)}`;
  const c = await db.one(
    `INSERT INTO clients(name, slug, industry, tier, status, city, country, website, account_manager_id, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id, name`,
    [b.name, slug, b.industry, b.tier, b.status, b.city ?? null, b.country, b.website || null, b.accountManagerId ?? req.user.id, b.notes ?? null]);
  await core.record(req.user.id, 'client.create', `${req.user.name} added client ${c.name}`, { clientId: c.id });
  res.status(201).json({ client: await detail(c.id) });
});

const COLUMN = { name: 'name', industry: 'industry', tier: 'tier', status: 'status', city: 'city', country: 'country', website: 'website', accountManagerId: 'account_manager_id', notes: 'notes' };

router.patch('/:id', requireRole('admin', 'manager'), async (req, res) => {
  const id = intParam(req.params.id);
  const client = await db.one('SELECT * FROM clients WHERE id=$1', [id]);
  if (!client) throw notFound('Client not found');
  const b = parse(z.object(clientFields).partial(), req.body);
  if (b.name && await db.one('SELECT 1 FROM clients WHERE lower(name)=lower($1) AND id<>$2', [b.name, id])) throw conflict('A client with this name already exists');
  await assertAccountManager(b.accountManagerId);
  const sets = []; const vals = [id];
  for (const [k, v] of Object.entries(b)) { vals.push(k === 'website' ? (v || null) : v); sets.push(`${COLUMN[k]}=$${vals.length}`); }
  if (sets.length) await db.query(`UPDATE clients SET ${sets.join(', ')} WHERE id=$1`, vals);
  await core.record(req.user.id, 'client.update', `${req.user.name} updated client ${b.name || client.name}`, { clientId: id });
  res.json({ client: await detail(id) });
});

router.delete('/:id', requireRole('admin'), async (req, res) => {
  const id = intParam(req.params.id);
  const { n } = await db.one('SELECT count(*)::int AS n FROM projects WHERE client_id=$1', [id]);
  if (n) throw conflict(`This client has ${n} project(s). Move or delete them first.`);
  const r = await db.query('DELETE FROM clients WHERE id=$1 RETURNING name', [id]);
  if (!r.rowCount) throw notFound('Client not found');
  await core.record(req.user.id, 'client.delete', `${req.user.name} deleted client ${r.rows[0].name}`);
  res.status(204).end();
});

const contactSchema = z.object({
  name: z.string().trim().min(2).max(80), email: z.email().optional().nullable().or(z.literal('')),
  phone: z.string().trim().max(20).optional().nullable(), role: z.string().trim().max(60).optional().nullable(), isPrimary: z.boolean().default(false),
});

router.post('/:id/contacts', requireRole('admin', 'manager'), async (req, res) => {
  const id = intParam(req.params.id);
  if (!(await db.one('SELECT 1 FROM clients WHERE id=$1', [id]))) throw notFound('Client not found');
  const b = parse(contactSchema, req.body);
  await db.tx(async (c) => {
    if (b.isPrimary) await c.query('UPDATE client_contacts SET is_primary=false WHERE client_id=$1', [id]);
    await c.query('INSERT INTO client_contacts(client_id, name, email, phone, role, is_primary) VALUES ($1,$2,$3,$4,$5,$6)',
      [id, b.name, b.email || null, b.phone ?? null, b.role ?? null, b.isPrimary]);
  });
  res.status(201).json({ client: await detail(id) });
});

router.delete('/:id/contacts/:contactId', requireRole('admin', 'manager'), async (req, res) => {
  const id = intParam(req.params.id); const cid = intParam(req.params.contactId, 'contact id');
  const r = await db.query('DELETE FROM client_contacts WHERE id=$1 AND client_id=$2', [cid, id]);
  if (!r.rowCount) throw notFound('Contact not found');
  res.json({ client: await detail(id) });
});

module.exports = { router, INDUSTRIES, TIERS };
