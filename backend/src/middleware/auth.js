'use strict';

const jwt = require('jsonwebtoken');
const config = require('../config');
const db = require('../db/pool');
const { unauthorized, forbidden } = require('../utils');

function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
}

async function loadUser(req) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) return null;
  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret);
  } catch {
    throw unauthorized('Session expired or invalid — please sign in again');
  }
  const user = await db.one(
    `SELECT id, name, email, role, status, title, department, location, phone, last_login_at, created_at
       FROM users WHERE id = $1`,
    [payload.sub],
  );
  if (!user || user.status !== 'active') throw unauthorized('Account not found or not active');
  return user;
}

async function requireAuth(req, _res, next) {
  const user = await loadUser(req);
  if (!user) throw unauthorized();
  req.user = user;
  next();
}

function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) throw unauthorized();
    if (!roles.includes(req.user.role)) throw forbidden();
    next();
  };
}

module.exports = { signToken, requireAuth, requireRole };
