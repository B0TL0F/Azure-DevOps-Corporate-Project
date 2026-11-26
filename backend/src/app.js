'use strict';

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const pinoHttp = require('pino-http');
const crypto = require('crypto');
const config = require('./config');
const logger = require('./logger');
const metrics = require('./metrics');
const { HttpError } = require('./utils');

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(cors({ origin: config.corsOrigin === '*' ? true : config.corsOrigin.split(',') }));
  app.use(compression());
  app.use(express.json({ limit: '256kb' }));
  app.use(pinoHttp({
    logger,
    genReqId: (req) => req.headers['x-request-id'] || crypto.randomUUID(),
    autoLogging: { ignore: (req) => ['/healthz', '/readyz', '/metrics'].includes(req.url) },
  }));
  app.use(metrics.middleware);

  app.use(require('./routes/system'));

  const api = express.Router();
  api.use(rateLimit({ windowMs: 60_000, limit: config.rateLimitPerMin, standardHeaders: 'draft-7', legacyHeaders: false }));
  // Brute-force protection only where passwords are checked; /auth/me runs on every page load.
  const credentialLimiter = rateLimit({ windowMs: 60_000, limit: config.env === 'test' ? 1000 : 20, standardHeaders: 'draft-7', legacyHeaders: false });
  api.use(['/auth/login', '/auth/register', '/auth/change-password'], credentialLimiter);
  api.use('/auth', require('./routes/auth').router);
  api.use('/projects', require('./routes/projects').router);
  api.use('/clients', require('./routes/clients').router);
  api.use('/people', require('./routes/people'));
  api.use('/admin', require('./routes/admin'));
  api.use(require('./routes/dashboard'));
  app.use('/api', api);

  app.use((req, _res, next) => next(new HttpError(404, `Route ${req.method} ${req.path} not found`)));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    if (err.type === 'entity.parse.failed') err = new HttpError(400, 'Malformed JSON body');
    const status = err.status || 500;
    if (status >= 500) req.log.error({ err }, 'request failed');
    res.status(status).json({
      error: status >= 500 && config.env === 'production' ? 'Internal server error' : err.message,
      ...(err.details ? { details: err.details } : {}),
      requestId: req.id,
    });
  });

  return app;
}

module.exports = { createApp };
