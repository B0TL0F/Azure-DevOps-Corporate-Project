'use strict';

const request = require('supertest');
const db = require('../src/db/pool');
const { migrate } = require('../src/db/migrate');
const { seed } = require('../src/db/seed');
const { createApp } = require('../src/app');

const app = createApp();
const silent = { info() {}, warn() {}, error() {} };

/** Fresh schema + demo seed before each test file. */
async function resetDb({ withSeed = true } = {}) {
  await db.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate(silent);
  if (withSeed) await seed(silent);
}

async function login(email, password = 'Demo@1234') {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  if (res.status !== 200) throw new Error(`login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.token;
}

const ADMIN = ['admin@devopsshack.com', 'Admin@123'];
const asAdmin = () => login(...ADMIN);
const asManager = () => login('rohan.mehta@devopsshack.com'); // owns PRJ-1001
const asMember = () => login('arjun.reddy@devopsshack.com'); // on PRJ-1001's team
const asOutsider = () => login('ishita.das@devopsshack.com'); // member, not on PRJ-1001
const asViewer = () => login('divya.krishnan@devopsshack.com');

const auth = (token) => ({ Authorization: `Bearer ${token}` });

async function projectByCode(code) {
  return db.one('SELECT * FROM projects WHERE code=$1', [code]);
}
async function userByEmail(email) {
  return db.one('SELECT * FROM users WHERE email=$1', [email]);
}

module.exports = { app, request, db, resetDb, login, asAdmin, asManager, asMember, asOutsider, asViewer, auth, projectByCode, userByEmail };
