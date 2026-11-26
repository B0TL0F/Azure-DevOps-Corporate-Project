'use strict';

const express = require('express');
const os = require('os');
const config = require('../config');
const db = require('../db/pool');
const metrics = require('../metrics');

const router = express.Router();
const startedAt = new Date();

// Liveness: the process is up. Never touches the DB so a DB blip doesn't restart pods.
router.get('/healthz', (_req, res) => res.json({ status: 'ok' }));

// Readiness: only receive traffic when the DB answers.
router.get('/readyz', async (_req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ status: 'ready' });
  } catch (err) {
    res.status(503).json({ status: 'not-ready', error: err.message });
  }
});

router.get('/metrics', async (_req, res) => {
  res.set('Content-Type', metrics.register.contentType);
  res.end(await metrics.register.metrics());
});

// Deployment info — the UI shows this so you can see which environment/build you're on.
router.get('/api/info', async (_req, res) => {
  let dbVersion = null;
  try { dbVersion = (await db.one('SHOW server_version')).server_version; } catch { /* db down */ }
  res.json({
    app: 'ShackPulse',
    environment: config.appEnv,
    version: config.version,
    buildId: config.buildId,
    commit: config.commitSha,
    pod: os.hostname(),
    namespace: process.env.POD_NAMESPACE || null,
    node: process.version,
    demoLogins: config.demoLogins,
    database: dbVersion ? `PostgreSQL ${dbVersion}` : 'unreachable',
    startedAt,
    uptimeSeconds: Math.round(process.uptime()),
  });
});

module.exports = router;
