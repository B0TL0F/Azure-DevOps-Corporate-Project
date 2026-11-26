const { app, request, db, resetDb, asAdmin, asManager, asMember, asViewer, auth, userByEmail } = require('./helpers');

let admin; let manager; let member; let viewer;
beforeAll(async () => {
  await resetDb();
  [admin, manager, member, viewer] = await Promise.all([asAdmin(), asManager(), asMember(), asViewer()]);
});
afterAll(() => db.pool.end());

describe('dashboard and search', () => {
  test('dashboard totals and widgets', async () => {
    const res = await request(app).get('/api/dashboard').set(auth(viewer));
    expect(res.status).toBe(200);
    const d = res.body;
    expect(d.totals).toMatchObject({ open_projects: 13, active_clients: 9, people: 21 });
    expect(d.totals.at_risk).toBeGreaterThan(3);
    expect(d.byHealth.find((h) => h.health === 'red').count).toBe(2);
    expect(d.atRisk[0].health).toBe('red');
    expect(d.deadlines.length).toBeGreaterThan(0);
    expect(d.activity.length).toBe(12);
    expect(d.hoursByWeek).toHaveLength(12);
    expect(d.workload[0].allocation).toBeGreaterThanOrEqual(d.workload[1].allocation);
  });

  test('search spans projects, clients and people', async () => {
    const res = await request(app).get('/api/search?q=kestrel').set(auth(viewer));
    expect(res.body.clients[0].name).toBe('Kestrel Bank');
    const people = await request(app).get('/api/search?q=SRE').set(auth(viewer));
    expect(people.body.people.length).toBeGreaterThan(0);
    const proj = await request(app).get('/api/search?q=argo').set(auth(viewer));
    expect(proj.body.projects[0].code).toBe('PRJ-1004');
    expect((await request(app).get('/api/search?q=').set(auth(viewer))).status).toBe(400);
  });

  test('notifications: list, mark one and all read', async () => {
    const list = await request(app).get('/api/notifications').set(auth(admin));
    expect(list.body.unread).toBeGreaterThan(0);
    await request(app).post(`/api/notifications/${list.body.notifications[0].id}/read`).set(auth(admin));
    const after = await request(app).get('/api/notifications').set(auth(admin));
    expect(after.body.unread).toBe(list.body.unread - 1);
    await request(app).post('/api/notifications/read-all').set(auth(admin));
    expect((await request(app).get('/api/notifications').set(auth(admin))).body.unread).toBe(0);
  });
});

describe('clients', () => {
  test('list is ordered by tier with project counts', async () => {
    const res = await request(app).get('/api/clients').set(auth(viewer));
    expect(res.body.clients).toHaveLength(10);
    expect(res.body.clients[0].tier).toBe('strategic');
    const k = res.body.clients.find((c) => c.name === 'Kestrel Bank');
    expect(k.projects).toMatchObject({ total: 2, open: 2 });
    expect(k.contractValue).toBe(13400000);
    const filtered = await request(app).get('/api/clients?tier=key').set(auth(viewer));
    expect(filtered.body.clients.every((c) => c.tier === 'key')).toBe(true);
  });

  test('detail by slug includes contacts and projects', async () => {
    const res = await request(app).get('/api/clients/zenvia-health').set(auth(viewer));
    expect(res.body.client.contacts).toHaveLength(2);
    expect(res.body.client.projectList).toHaveLength(3);
    expect((await request(app).get('/api/clients/nope').set(auth(viewer))).status).toBe(404);
  });

  test('managers create and edit clients; members cannot', async () => {
    const body = { name: 'Aurora Pharma', industry: 'Healthcare', tier: 'key', city: 'Hyderabad' };
    expect((await request(app).post('/api/clients').set(auth(member)).send(body)).status).toBe(403);
    const res = await request(app).post('/api/clients').set(auth(manager)).send(body);
    expect(res.status).toBe(201);
    expect(res.body.client).toMatchObject({ slug: 'aurora-pharma', accountManager: { name: 'Rohan Mehta' } });
    expect((await request(app).post('/api/clients').set(auth(manager)).send(body)).status).toBe(409);
    const id = res.body.client.id;
    const upd = await request(app).patch(`/api/clients/${id}`).set(auth(manager)).send({ tier: 'strategic', website: 'https://aurora.example' });
    expect(upd.body.client).toMatchObject({ tier: 'strategic', website: 'https://aurora.example' });
    const c = await request(app).post(`/api/clients/${id}/contacts`).set(auth(manager)).send({ name: 'Dr Asha Rao', role: 'CTO', isPrimary: true });
    expect(c.body.client.contacts[0]).toMatchObject({ name: 'Dr Asha Rao', isPrimary: true });
    const rm = await request(app).delete(`/api/clients/${id}/contacts/${c.body.client.contacts[0].id}`).set(auth(manager));
    expect(rm.body.client.contacts).toHaveLength(0);
    expect((await request(app).delete(`/api/clients/${id}`).set(auth(admin))).status).toBe(204);
  });

  test('a client with projects cannot be deleted', async () => {
    const k = await db.one(`SELECT id FROM clients WHERE slug='kestrel-bank'`);
    expect((await request(app).delete(`/api/clients/${k.id}`).set(auth(admin))).status).toBe(409);
  });
});

describe('people', () => {
  test('directory with allocation and filters', async () => {
    const res = await request(app).get('/api/people').set(auth(viewer));
    expect(res.body.people).toHaveLength(21);
    expect(res.body.people.every((p) => p.email)).toBe(true);
    const sre = await request(app).get('/api/people?department=SRE').set(auth(viewer));
    expect(sre.body.people.every((p) => p.department === 'SRE')).toBe(true);
    const owners = await request(app).get('/api/people?owners=true').set(auth(viewer));
    expect(owners.body.people.every((p) => ['admin', 'manager'].includes(p.role))).toBe(true);
  });

  test('person profile lists projects and weekly hours', async () => {
    const arjun = await userByEmail('arjun.reddy@devopsshack.com');
    const res = await request(app).get(`/api/people/${arjun.id}`).set(auth(viewer));
    expect(res.body.person.projects.length).toBeGreaterThan(1);
    expect(res.body.person.weekly).toHaveLength(8);
    expect(res.body.person.allocation).toBe(105); // overbooked across three projects
    const pending = await userByEmail('riya.saxena@devopsshack.com');
    expect((await request(app).get(`/api/people/${pending.id}`).set(auth(viewer))).status).toBe(404);
  });
});

describe('admin', () => {
  test('non-admins are blocked', async () => {
    expect((await request(app).get('/api/admin/users').set(auth(manager))).status).toBe(403);
  });

  test('user list with status counts and the pending queue', async () => {
    const res = await request(app).get('/api/admin/users?status=pending').set(auth(admin));
    expect(res.body.users.map((u) => u.name).sort()).toEqual(['Mohit Arora', 'Riya Saxena']);
    expect(res.body.counts.pending).toBe(2);
  });

  test('role changes are guarded', async () => {
    const me = await userByEmail('admin@devopsshack.com');
    expect((await request(app).patch(`/api/admin/users/${me.id}`).set(auth(admin)).send({ role: 'member' })).status).toBe(400);
    const rohan = await userByEmail('rohan.mehta@devopsshack.com');
    const r = await request(app).patch(`/api/admin/users/${rohan.id}`).set(auth(admin)).send({ role: 'member' });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/owns \d+ open project/);
    const kavya = await userByEmail('kavya.menon@devopsshack.com');
    const ok = await request(app).patch(`/api/admin/users/${kavya.id}`).set(auth(admin)).send({ role: 'manager' });
    expect(ok.body.user.role).toBe('manager');
  });

  test('approve and reject requests', async () => {
    const riya = await userByEmail('riya.saxena@devopsshack.com');
    const mohit = await userByEmail('mohit.arora@devopsshack.com');
    expect((await request(app).patch(`/api/admin/users/${riya.id}`).set(auth(admin)).send({ status: 'active', role: 'member' })).body.user.status).toBe('active');
    expect((await request(app).patch(`/api/admin/users/${mohit.id}`).set(auth(admin)).send({ status: 'rejected' })).body.user.status).toBe('rejected');
    const act = await request(app).get('/api/admin/activity?action=user.approve').set(auth(admin));
    expect(act.body.activity[0].summary).toMatch(/approved Riya Saxena/);
  });

  test('password reset returns a one-time password that works', async () => {
    const meera = await userByEmail('meera.pillai@devopsshack.com');
    const res = await request(app).post(`/api/admin/users/${meera.id}/reset-password`).set(auth(admin));
    expect(res.body.temporaryPassword).toMatch(/^Sp-/);
    const login = await request(app).post('/api/auth/login').send({ email: 'meera.pillai@devopsshack.com', password: res.body.temporaryPassword });
    expect(login.status).toBe(200);
  });
});
