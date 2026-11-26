const { app, request, db, resetDb } = require('./helpers');

beforeAll(() => resetDb({ withSeed: false }));
afterAll(() => db.pool.end());

describe('platform endpoints', () => {
  test('GET /healthz is always ok', async () => {
    const res = await request(app).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  test('GET /readyz checks the database', async () => {
    const res = await request(app).get('/readyz');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ready');
  });

  test('GET /api/info reports environment and build', async () => {
    const res = await request(app).get('/api/info');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ app: 'ShackPulse', environment: expect.any(String), version: expect.any(String) });
    expect(res.body.database).toMatch(/PostgreSQL/);
  });

  test('GET /metrics exposes Prometheus metrics', async () => {
    await request(app).get('/api/info');
    const res = await request(app).get('/metrics');
    expect(res.status).toBe(200);
    expect(res.text).toContain('http_request_duration_seconds');
    expect(res.text).toContain('shackpulse_signups_total');
  });

  test('unknown routes return JSON 404', async () => {
    const res = await request(app).get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
    expect(res.body.requestId).toBeDefined();
  });

  test('malformed JSON returns 400', async () => {
    const res = await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{bad json');
    expect(res.status).toBe(400);
  });

  test('security headers are set', async () => {
    const res = await request(app).get('/healthz');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});
