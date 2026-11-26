// Test environment: point at a dedicated database. CI overrides these via env vars.
process.env.NODE_ENV = 'test';
process.env.DB_NAME = process.env.DB_NAME || 'shackpulse_test';
process.env.DB_HOST = process.env.DB_HOST || 'localhost';
process.env.DB_USER = process.env.DB_USER || 'shackpulse';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'shackpulse';
process.env.JWT_SECRET = 'test-secret';
process.env.LOG_LEVEL = 'silent';
