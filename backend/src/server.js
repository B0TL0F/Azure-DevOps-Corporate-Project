'use strict';

const config = require('./config');
const logger = require('./logger');
const { createApp } = require('./app');
const { pool } = require('./db/pool');
const { migrate } = require('./db/migrate');
const { seed } = require('./db/seed');

async function waitForDb(retries = 30) {
  for (let i = 1; i <= retries; i += 1) {
    try { await pool.query('SELECT 1'); return; } catch (err) {
      logger.warn({ attempt: i, err: err.message }, 'database not ready, retrying in 2s');
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw new Error('Database never became reachable');
}

async function main() {
  await waitForDb();
  if (config.migrateOnStart) {
    const n = await migrate(logger);
    logger.info({ applied: n }, 'migrations complete');
  }
  if (config.seedOnStart) {
    const seeded = await seed(logger);
    if (seeded) logger.info('demo data seeded');
  }
  const app = createApp();
  const server = app.listen(config.port, () => {
    logger.info({ port: config.port, env: config.appEnv, version: config.version }, 'shackpulse-api listening');
  });

  const shutdown = (signal) => {
    logger.info({ signal }, 'shutting down gracefully');
    server.close(async () => {
      await pool.end().catch(() => {});
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  logger.fatal({ err }, 'failed to start');
  process.exit(1);
});
