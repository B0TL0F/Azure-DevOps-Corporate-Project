const { app, request, db, resetDb, login, asAdmin, auth, userByEmail } = require('./helpers');

beforeAll(() => resetDb());
afterAll(() => db.pool.end());

describe('sign-up and approval', () => {
  test('sign-up needs a company email', async () => {
    const res = await request(app).post('/api/auth/register').send({ name: 'Outsider', email: 'someone@gmail.com', password: 'Passw0rd!' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/company email/);
  });

  test('weak passwords are rejected', async () => {
    const res = await request(app).post('/api/auth/register').send({ name: 'Weak', email: 'weak@devopsshack.com', password: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.details[0].path).toBe('password');
  });

  test('a new account waits for approval, then can sign in', async () => {
    const reg = await request(app).post('/api/auth/register')
      .send({ name: 'New Joiner', email: 'new.joiner@devopsshack.com', password: 'Passw0rd!', title: 'DevOps Engineer', department: 'Platform' });
    expect(reg.status).toBe(201);
    expect(reg.body.pending).toBe(true);
    expect(reg.body.token).toBeUndefined();

    const blocked = await request(app).post('/api/auth/login').send({ email: 'new.joiner@devopsshack.com', password: 'Passw0rd!' });
    expect(blocked.status).toBe(403);
    expect(blocked.body.error).toMatch(/waiting for admin approval/);

    const admin = await asAdmin();
    const notes = await request(app).get('/api/notifications').set(auth(admin));
    expect(notes.body.notifications.some((n) => n.title.includes('New Joiner'))).toBe(true);

    const u = await userByEmail('new.joiner@devopsshack.com');
    const ok = await request(app).patch(`/api/admin/users/${u.id}`).set(auth(admin)).send({ status: 'active' });
    expect(ok.status).toBe(200);
    const token = await login('new.joiner@devopsshack.com', 'Passw0rd!');
    const me = await request(app).get('/api/auth/me').set(auth(token));
    expect(me.body.user).toMatchObject({ name: 'New Joiner', role: 'member', status: 'active' });
    expect(me.body.stats.unread).toBe(1); // the welcome notification
  });

  test('duplicate emails are rejected', async () => {
    const res = await request(app).post('/api/auth/register').send({ name: 'Dup', email: 'admin@devopsshack.com', password: 'Passw0rd!' });
    expect(res.status).toBe(409);
  });
});

describe('sessions and profile', () => {
  test('wrong password is 401', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'admin@devopsshack.com', password: 'nope' });
    expect(res.status).toBe(401);
  });

  test('protected routes need a token, and reject a bad one', async () => {
    expect((await request(app).get('/api/projects')).status).toBe(401);
    expect((await request(app).get('/api/projects').set(auth('garbage'))).status).toBe(401);
  });

  test('/me returns personal stats', async () => {
    const t = await login('rohan.mehta@devopsshack.com');
    const res = await request(app).get('/api/auth/me').set(auth(t));
    expect(res.status).toBe(200);
    expect(res.body.stats.my_projects).toBeGreaterThan(0);
    expect(res.body.user.lastLoginAt).toBeTruthy();
  });

  test('profile update and password change', async () => {
    const t = await login('pooja.sharma@devopsshack.com');
    const p = await request(app).patch('/api/auth/me').set(auth(t)).send({ title: 'Senior DevOps Engineer', phone: '+91 98765 43210' });
    expect(p.body.user).toMatchObject({ title: 'Senior DevOps Engineer', phone: '+91 98765 43210' });
    const bad = await request(app).post('/api/auth/change-password').set(auth(t)).send({ currentPassword: 'wrong', newPassword: 'NewPassw0rd' });
    expect(bad.status).toBe(400);
    const ok = await request(app).post('/api/auth/change-password').set(auth(t)).send({ currentPassword: 'Demo@1234', newPassword: 'NewPassw0rd' });
    expect(ok.status).toBe(200);
    await expect(login('pooja.sharma@devopsshack.com', 'NewPassw0rd')).resolves.toBeTruthy();
  });

  test('a disabled account is signed out immediately', async () => {
    const t = await login('nikhil.bansal@devopsshack.com');
    const admin = await asAdmin();
    const u = await userByEmail('nikhil.bansal@devopsshack.com');
    await request(app).patch(`/api/admin/users/${u.id}`).set(auth(admin)).send({ status: 'disabled' });
    expect((await request(app).get('/api/auth/me').set(auth(t))).status).toBe(401);
    const res = await request(app).post('/api/auth/login').send({ email: 'nikhil.bansal@devopsshack.com', password: 'Demo@1234' });
    expect(res.status).toBe(403);
  });
});
