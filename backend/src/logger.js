'use strict';

const pino = require('pino');
const config = require('./config');

module.exports = pino({
  level: config.logLevel,
  base: { app: 'shackpulse-api', env: config.appEnv, version: config.version },
  redact: ['req.headers.authorization', 'req.headers.cookie'],
});
