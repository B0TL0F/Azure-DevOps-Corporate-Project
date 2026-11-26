'use strict';

const pkg = require('../package.json');

function bool(v, def) {
  if (v === undefined || v === '') return def;
  return ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());
}

const env = process.env.NODE_ENV || 'development';

const config = {
  env,
  appEnv: process.env.APP_ENV || 'local', // dev | prod | local — shown in the UI banner
  version: process.env.APP_VERSION || pkg.version,
  buildId: process.env.BUILD_ID || 'local',
  commitSha: process.env.COMMIT_SHA || 'local',
  port: parseInt(process.env.PORT || '8080', 10),
  logLevel: process.env.LOG_LEVEL || (env === 'test' ? 'silent' : 'info'),
  jwtSecret: process.env.JWT_SECRET || 'dev-only-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '12h',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  migrateOnStart: bool(process.env.MIGRATE_ON_START, true),
  seedOnStart: bool(process.env.SEED_ON_START, true),
  seedAdminPassword: process.env.SEED_ADMIN_PASSWORD || 'Admin@123',
  rateLimitPerMin: parseInt(process.env.RATE_LIMIT_PER_MIN || '300', 10),
  // Sign-up is limited to company addresses. Comma-separated list; "*" allows any domain.
  allowedEmailDomains: (process.env.ALLOWED_EMAIL_DOMAINS || 'devopsshack.com')
    .split(',').map((d) => d.trim().toLowerCase()).filter(Boolean),
  // Demo accounts (seeded team members) can sign in with SEED_DEMO_PASSWORD.
  // Off in prod by default: there the seeded people exist but cannot sign in until an admin resets them.
  demoLogins: bool(process.env.DEMO_LOGINS, (process.env.APP_ENV || 'local') !== 'prod'),
  seedDemoPassword: process.env.SEED_DEMO_PASSWORD || 'Demo@1234',
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'shackpulse',
    user: process.env.DB_USER || 'shackpulse',
    password: process.env.DB_PASSWORD || 'shackpulse',
    ssl: bool(process.env.DB_SSL, false),
    max: parseInt(process.env.DB_POOL_MAX || '10', 10),
  },
};

if (env === 'production' && config.jwtSecret === 'dev-only-change-me') {
  throw new Error('JWT_SECRET must be set in production');
}

module.exports = config;
