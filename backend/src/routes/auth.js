'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const db = require('../db/pool');
const config = require('../config');
const { signToken, requireAuth } = require('../middleware/auth');
const { parse, conflict, unauthorized, badRequest, forbidden } = require('../utils');
const { notifyMany, record } = require('../services/core');
const metrics = require('../metrics');

const router = express.Router();

const password = z.string().min(8, 'Password must be at least 8 characters').max(100)
  .regex(/[A-Za-z]/, 'Password needs a letter').regex(/[0-9]/, 'Password needs a number');

const DEPARTMENTS = ['Platform', 'DevSecOps', 'Cloud', 'SRE', 'MLOps', 'Delivery', 'Leadership'];

const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password,
  title: z.string().trim().min(2).max(80).optional(),
  department: z.enum(DEPARTMENTS).optional(),
});

function publicUser(u) {
  return {
    id: u.id, name: u.name, email: u.email, role: u.role, status: u.status, title: u.title,
    department: u.department, location: u.location, phone: u.phone, lastLoginAt: u.last_login_at, createdAt: u.created_at,
  };
}

function emailAllowed(email) {
  const domains = config.allowedEmailDomains;
  if (domains.includes('*')) return true;
  return domains.includes(email.split('@')[1]);
}

// Sign-up creates a *pending* account. An admin approves it before the person can sign in.
router.post('/register', async (req, res) => {
  const b = parse(registerSchema, req.body);
  if (!emailAllowed(b.email)) {
    throw badRequest(`Use your company email (${config.allowedEmailDomains.map((d) => `@${d}`).join(', ')})`);
  }
  if (await db.one('SELECT 1 FROM users WHERE email=$1', [b.email])) throw conflict('An account with this email already exists');
  const user = await db.one(
    `INSERT INTO users(name, email, password_hash, role, status, title, department)
     VALUES ($1,$2,$3,'member','pending',$4,$5) RETURNING *`,
    [b.name, b.email, await bcrypt.hash(b.password, 10), b.title ?? null, b.department ?? null],
  );
  const admins = await db.many(`SELECT id FROM users WHERE role='admin' AND status='active'`);
  await notifyMany(admins.map((a) => a.id), {
    type: 'access_request', title: `Access request: ${b.name}`, body: `${b.email}${b.department ? ` · ${b.department}` : ''}`, link: '/admin',
  });
  await record(user.id, 'user.register', `${b.name} requested access`);
  metrics.signups.inc();
  res.status(201).json({ pending: true, user: publicUser(user), message: 'Request sent. An admin will approve your account shortly.' });
});

router.post('/login', async (req, res) => {
  const b = parse(z.object({ email: z.string().trim().toLowerCase(), password: z.string().min(1) }), req.body);
  const user = await db.one('SELECT * FROM users WHERE email=$1', [b.email]);
  if (!user || !(await bcrypt.compare(b.password, user.password_hash))) {
    metrics.logins.inc({ outcome: 'bad_credentials' });
    throw unauthorized('Invalid email or password');
  }
  if (user.status === 'pending') { metrics.logins.inc({ outcome: 'pending' }); throw forbidden('Your account is waiting for admin approval'); }
  if (user.status !== 'active') { metrics.logins.inc({ outcome: 'blocked' }); throw forbidden('This account is not active. Contact an admin.'); }
  const updated = await db.one('UPDATE users SET last_login_at=now() WHERE id=$1 RETURNING *', [user.id]);
  metrics.logins.inc({ outcome: 'ok' });
  res.json({ token: signToken(updated), user: publicUser(updated) });
});

router.get('/me', requireAuth, async (req, res) => {
  const stats = await db.one(
    `SELECT
       (SELECT count(DISTINCT p.id) FROM projects p LEFT JOIN project_members m ON m.project_id=p.id
          WHERE (p.owner_id=$1 OR m.user_id=$1) AND p.status IN ('planning','active','on_hold'))::int AS my_projects,
       (SELECT count(*) FROM milestones ms JOIN projects p ON p.id=ms.project_id
          LEFT JOIN project_members m ON m.project_id=p.id AND m.user_id=$1
          WHERE (p.owner_id=$1 OR m.user_id IS NOT NULL) AND ms.status<>'done'
            AND ms.due_date <= current_date + 14)::int AS due_soon,
       (SELECT COALESCE(sum(hours),0) FROM time_entries
          WHERE user_id=$1 AND entry_date >= date_trunc('week', current_date))::float AS hours_this_week,
       (SELECT count(*) FROM notifications WHERE user_id=$1 AND read_at IS NULL)::int AS unread`,
    [req.user.id],
  );
  res.json({ user: publicUser(req.user), stats });
});

router.patch('/me', requireAuth, async (req, res) => {
  const b = parse(z.object({
    name: z.string().trim().min(2).max(80).optional(),
    title: z.string().trim().max(80).nullable().optional(),
    location: z.string().trim().max(60).nullable().optional(),
    phone: z.string().trim().regex(/^[0-9+ -]{7,16}$/, 'Phone looks invalid').nullable().optional(),
  }), req.body);
  const sets = []; const vals = [req.user.id];
  for (const [k, v] of Object.entries(b)) { vals.push(v); sets.push(`${k}=$${vals.length}`); }
  const user = sets.length
    ? await db.one(`UPDATE users SET ${sets.join(', ')} WHERE id=$1 RETURNING *`, vals)
    : await db.one('SELECT * FROM users WHERE id=$1', [req.user.id]);
  res.json({ user: publicUser(user) });
});

router.post('/change-password', requireAuth, async (req, res) => {
  const b = parse(z.object({ currentPassword: z.string().min(1), newPassword: password }), req.body);
  const row = await db.one('SELECT password_hash FROM users WHERE id=$1', [req.user.id]);
  if (!(await bcrypt.compare(b.currentPassword, row.password_hash))) throw badRequest('Current password is incorrect');
  await db.query('UPDATE users SET password_hash=$2 WHERE id=$1', [req.user.id, await bcrypt.hash(b.newPassword, 10)]);
  await record(req.user.id, 'user.change_password', `${req.user.name} changed their password`);
  res.json({ ok: true });
});

module.exports = { router, publicUser, DEPARTMENTS, password };
