'use strict';

const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const db = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');
const { parse, intParam, notFound, badRequest } = require('../utils');
const core = require('../services/core');
const { publicUser } = require('./auth');

const router = express.Router();
router.use(requireAuth, requireRole('admin'));

router.get('/users', async (req, res) => {
  const q = parse(z.object({ status: z.enum(['pending', 'active', 'rejected', 'disabled']).optional(), q: z.string().trim().max(80).optional() }), req.query);
  const where = []; const vals = [];
  if (q.status) { vals.push(q.status); where.push(`status=$${vals.length}`); }
  if (q.q) { vals.push(`%${q.q}%`); where.push(`(name ILIKE $${vals.length} OR email ILIKE $${vals.length})`); }
  const rows = await db.many(`SELECT * FROM users ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY array_position(ARRAY['pending','active','disabled','rejected'], status), name`, vals);
  const counts = await db.many('SELECT status, count(*)::int AS count FROM users GROUP BY status');
  res.json({ users: rows.map(publicUser), counts: Object.fromEntries(counts.map((c) => [c.status, c.count])) });
});

router.patch('/users/:id', async (req, res) => {
  const id = intParam(req.params.id);
  const b = parse(z.object({
    role: z.enum(['admin', 'manager', 'member', 'viewer']).optional(),
    status: z.enum(['active', 'rejected', 'disabled']).optional(),
    department: z.string().trim().max(40).optional(),
  }), req.body);
  const user = await db.one('SELECT * FROM users WHERE id=$1', [id]);
  if (!user) throw notFound('User not found');
  if (id === req.user.id && (b.role && b.role !== 'admin' || b.status && b.status !== 'active')) {
    throw badRequest('You cannot remove your own admin access');
  }
  if (b.role && !['admin', 'manager'].includes(b.role)) {
    const { n } = await db.one(`SELECT count(*)::int AS n FROM projects WHERE owner_id=$1 AND status IN ('planning','active','on_hold')`, [id]);
    if (n) throw badRequest(`${user.name} owns ${n} open project(s). Reassign them before changing the role.`);
  }
  const updated = await db.one(
    `UPDATE users SET role=COALESCE($2,role), status=COALESCE($3,status), department=COALESCE($4,department) WHERE id=$1 RETURNING *`,
    [id, b.role ?? null, b.status ?? null, b.department ?? null]);
  if (b.status === 'active' && user.status === 'pending') {
    await core.notify(id, { type: 'approved', title: 'Welcome to ShackPulse', body: `Your access was approved by ${req.user.name}.`, link: '/' });
    await core.record(req.user.id, 'user.approve', `${req.user.name} approved ${user.name} as ${updated.role}`);
  } else {
    await core.record(req.user.id, 'user.update', `${req.user.name} updated ${user.name}: ${Object.entries(b).map(([k, v]) => `${k}=${v}`).join(', ')}`);
  }
  res.json({ user: publicUser(updated) });
});

// Generates a one-time temporary password. It is shown to the admin once and never stored in clear text.
router.post('/users/:id/reset-password', async (req, res) => {
  const id = intParam(req.params.id);
  const user = await db.one('SELECT id, name FROM users WHERE id=$1', [id]);
  if (!user) throw notFound('User not found');
  const temp = `Sp-${crypto.randomBytes(6).toString('base64url')}9`;
  await db.query('UPDATE users SET password_hash=$2 WHERE id=$1', [id, await bcrypt.hash(temp, 10)]);
  await core.record(req.user.id, 'user.reset_password', `${req.user.name} reset the password for ${user.name}`);
  res.json({ temporaryPassword: temp });
});

router.get('/activity', async (req, res) => {
  const q = parse(z.object({ action: z.string().trim().max(40).optional(), limit: z.coerce.number().int().min(1).max(200).default(60) }), req.query);
  const vals = []; let where = '';
  if (q.action) { vals.push(`${q.action}%`); where = `WHERE a.action LIKE $1`; }
  const rows = await db.many(
    `SELECT a.id, a.action, a.summary, a.created_at, a.project_id, a.client_id, u.name AS actor_name
       FROM activity a LEFT JOIN users u ON u.id=a.actor_id ${where} ORDER BY a.created_at DESC, a.id DESC LIMIT ${q.limit}`, vals);
  res.json({ activity: rows.map((r) => ({ id: r.id, action: r.action, summary: r.summary, createdAt: r.created_at, projectId: r.project_id, clientId: r.client_id, actor: r.actor_name })) });
});

module.exports = router;
