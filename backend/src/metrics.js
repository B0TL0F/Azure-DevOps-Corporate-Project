'use strict';

const client = require('prom-client');

const register = new client.Registry();
register.setDefaultLabels({ app: 'shackpulse-api' });
client.collectDefaultMetrics({ register });

const httpDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
  registers: [register],
});

const signups = new client.Counter({ name: 'shackpulse_signups_total', help: 'Sign-up requests', registers: [register] });
const logins = new client.Counter({ name: 'shackpulse_logins_total', help: 'Sign-in attempts by outcome', labelNames: ['outcome'], registers: [register] });
const projectsCreated = new client.Counter({ name: 'shackpulse_projects_created_total', help: 'Projects created', registers: [register] });
const updatesPosted = new client.Counter({ name: 'shackpulse_updates_posted_total', help: 'Project updates posted by kind', labelNames: ['kind'], registers: [register] });
const hoursLogged = new client.Counter({ name: 'shackpulse_hours_logged_total', help: 'Hours logged against projects', registers: [register] });

function middleware(req, res, next) {
  const end = httpDuration.startTimer();
  res.on('finish', () => {
    const route = req.route ? `${req.baseUrl}${req.route.path}` : 'unmatched';
    end({ method: req.method, route, status: res.statusCode });
  });
  next();
}

module.exports = { register, middleware, signups, logins, projectsCreated, updatesPosted, hoursLogged };
