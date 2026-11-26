'use strict';

class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

const badRequest = (m, d) => new HttpError(400, m, d);
const unauthorized = (m = 'Authentication required') => new HttpError(401, m);
const forbidden = (m = 'You do not have permission to do that') => new HttpError(403, m);
const notFound = (m = 'Not found') => new HttpError(404, m);
const conflict = (m) => new HttpError(409, m);

function parse(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) {
    const details = result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    throw badRequest('Validation failed', details);
  }
  return result.data;
}

function slugify(s) {
  return String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}

function intParam(v, name = 'id') {
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n) || n <= 0 || String(n) !== String(v)) throw badRequest(`Invalid ${name}`);
  return n;
}

module.exports = { HttpError, badRequest, unauthorized, forbidden, notFound, conflict, parse, slugify, intParam };
