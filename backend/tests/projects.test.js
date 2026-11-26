const { app, request, db, resetDb, asAdmin, asManager, asMember, asOutsider, asViewer, auth, projectByCode, userByEmail } = require('./helpers');

let admin; let manager; let member; let outsider; let viewer; let p1;
beforeAll(async () => {
  await resetDb();
  [admin, manager, member, outsider, viewer] = await Promise.all([asAdmin(), asManager(), asMember(), asOutsider(), asViewer()]);
  p1 = await projectByCode('PRJ-1001');
});
afterAll(() => db.pool.end());

describe('listing and filtering', () => {
  test('lists projects with client, owner, progress and burn', async () => {
    const res = await request(app).get('/api/projects').set(auth(viewer));
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(16);
    const p = res.body.projects.find((x) => x.code === 'PRJ-1001');
    expect(p).toMatchObject({ name: 'Core Banking AKS Migration', client: { name: 'Kestrel Bank' }, owner: { name: 'Rohan Mehta' } });
    expect(p.progress).toBeGreaterThan(0);
    expect(p.hoursUsed).toBeGreaterThan(0);
  });

  test('filters by status, health, client, search and mine', async () => {
    const open = await request(app).get('/api/projects?status=open').set(auth(viewer));
    expect(open.body.projects.every((p) => ['planning', 'active', 'on_hold'].includes(p.status))).toBe(true);
    const red = await request(app).get('/api/projects?health=red').set(auth(viewer));
    expect(red.body.projects.map((p) => p.code).sort()).toEqual(['PRJ-1004', 'PRJ-1011']);
    const byClient = await request(app).get(`/api/projects?clientId=${p1.client_id}`).set(auth(viewer));
    expect(byClient.body.projects.every((p) => p.client.id === p1.client_id)).toBe(true);
    const search = await request(app).get('/api/projects?q=terraform').set(auth(viewer));
    expect(search.body.total).toBeGreaterThan(2);
    const mine = await request(app).get('/api/projects?mine=true').set(auth(member));
    expect(mine.body.projects.some((p) => p.code === 'PRJ-1001')).toBe(true);
    const sorted = await request(app).get('/api/projects?sort=health').set(auth(viewer));
    expect(sorted.body.projects[0].health).toBe('red');
  });

  test('rejects bad filter values', async () => {
    expect((await request(app).get('/api/projects?status=nope').set(auth(viewer))).status).toBe(400);
  });

  test('exports CSV with formula-safe cells', async () => {
    const res = await request(app).get('/api/projects/export.csv?status=open').set(auth(viewer));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.text.split('\n')[0]).toContain('"Code","Project","Client"');
    expect(res.text).toContain('Core Banking AKS Migration');
  });

  test('detail includes team, milestones, weekly hours and permissions', async () => {
    const res = await request(app).get(`/api/projects/${p1.id}`).set(auth(member));
    expect(res.status).toBe(200);
    const p = res.body.project;
    expect(p.members.length).toBe(5);
    expect(p.milestones.length).toBe(5);
    expect(p.weekly).toHaveLength(8);
    expect(p.clientContacts.length).toBe(2);
    expect(p.permissions).toEqual({ manage: false, contribute: true, delete: false });
    const asOwner = await request(app).get(`/api/projects/${p1.id}`).set(auth(manager));
    expect(asOwner.body.project.permissions.manage).toBe(true);
    expect((await request(app).get('/api/projects/99999').set(auth(member))).status).toBe(404);
  });
});

describe('creating and editing', () => {
  const body = (extra = {}) => ({
    name: 'Payments Kafka Platform', clientId: p1.client_id, ownerId: 999, category: 'Kubernetes Platform',
    startDate: '2026-12-01', dueDate: '2027-03-31', techStack: ['Kafka', 'Strimzi'], budgetHours: 800, contractValue: 2500000, ...extra,
  });

  test('members and viewers cannot create projects', async () => {
    expect((await request(app).post('/api/projects').set(auth(member)).send(body())).status).toBe(403);
    expect((await request(app).post('/api/projects').set(auth(viewer)).send(body())).status).toBe(403);
  });

  test('a manager creates a project they own, with a generated code', async () => {
    const res = await request(app).post('/api/projects').set(auth(manager)).send(body());
    expect(res.status).toBe(201);
    expect(res.body.project.code).toBe('PRJ-1017');
    expect(res.body.project.owner.name).toBe('Rohan Mehta');
    expect(res.body.project.members[0].projectRole).toBe('Project Owner');
  });

  test('validation: dates, owner role, client', async () => {
    const owner = (await userByEmail('priya.nair@devopsshack.com')).id;
    expect((await request(app).post('/api/projects').set(auth(admin)).send(body({ ownerId: owner, dueDate: '2026-01-01' }))).status).toBe(400);
    const memberId = (await userByEmail('arjun.reddy@devopsshack.com')).id;
    const r = await request(app).post('/api/projects').set(auth(admin)).send(body({ ownerId: memberId }));
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/project manager or admin/);
    expect((await request(app).post('/api/projects').set(auth(admin)).send(body({ ownerId: owner, clientId: 9999 }))).status).toBe(400);
  });

  test('admin assigns another owner, who is notified', async () => {
    const owner = await userByEmail('priya.nair@devopsshack.com');
    const res = await request(app).post('/api/projects').set(auth(admin)).send(body({ name: 'Admin Created', ownerId: owner.id }));
    expect(res.status).toBe(201);
    const n = await db.one(`SELECT * FROM notifications WHERE user_id=$1 AND type='project_assigned' ORDER BY id DESC LIMIT 1`, [owner.id]);
    expect(n.title).toContain('Admin Created');
  });

  test('only the owner or an admin can edit; changes are recorded and notified', async () => {
    expect((await request(app).patch(`/api/projects/${p1.id}`).set(auth(member)).send({ health: 'red' })).status).toBe(403);
    expect((await request(app).patch(`/api/projects/${p1.id}`).set(auth(outsider)).send({ health: 'red' })).status).toBe(403);
    const res = await request(app).patch(`/api/projects/${p1.id}`).set(auth(manager)).send({ health: 'red', status: 'on_hold' });
    expect(res.status).toBe(200);
    expect(res.body.project).toMatchObject({ health: 'red', status: 'on_hold' });
    const act = await db.one(`SELECT summary FROM activity WHERE project_id=$1 ORDER BY id DESC LIMIT 1`, [p1.id]);
    expect(act.summary).toMatch(/health amber → red/);
    const memberId = (await userByEmail('arjun.reddy@devopsshack.com')).id;
    const n = await db.one(`SELECT title FROM notifications WHERE user_id=$1 AND type='project_changed' ORDER BY id DESC LIMIT 1`, [memberId]);
    expect(n.title).toMatch(/PRJ-1001/);
  });

  test('only an admin can change the owner', async () => {
    const other = (await userByEmail('priya.nair@devopsshack.com')).id;
    expect((await request(app).patch(`/api/projects/${p1.id}`).set(auth(manager)).send({ ownerId: other })).status).toBe(400);
  });

  test('completing a project stamps completed_at', async () => {
    const res = await request(app).patch(`/api/projects/${p1.id}`).set(auth(admin)).send({ status: 'completed' });
    expect(res.body.project.completedAt).toBeTruthy();
    await request(app).patch(`/api/projects/${p1.id}`).set(auth(admin)).send({ status: 'active', health: 'amber' });
  });
});

describe('team, milestones, updates and time', () => {
  test('owner adds and removes team members', async () => {
    const ishita = await userByEmail('ishita.das@devopsshack.com');
    const add = await request(app).post(`/api/projects/${p1.id}/members`).set(auth(manager)).send({ userId: ishita.id, projectRole: 'MLOps Advisor', allocationPct: 20 });
    expect(add.status).toBe(201);
    expect(add.body.project.members.some((m) => m.id === ishita.id)).toBe(true);
    const rm = await request(app).delete(`/api/projects/${p1.id}/members/${ishita.id}`).set(auth(manager));
    expect(rm.body.project.members.some((m) => m.id === ishita.id)).toBe(false);
    expect((await request(app).delete(`/api/projects/${p1.id}/members/${p1.owner_id}`).set(auth(manager))).status).toBe(400);
  });

  test('milestones: owner creates, member completes, outsider cannot', async () => {
    const add = await request(app).post(`/api/projects/${p1.id}/milestones`).set(auth(manager)).send({ title: 'Hypercare', dueDate: '2027-02-15' });
    expect(add.status).toBe(201);
    const ms = add.body.project.milestones.find((m) => m.title === 'Hypercare');
    expect((await request(app).patch(`/api/projects/${p1.id}/milestones/${ms.id}`).set(auth(outsider)).send({ status: 'done' })).status).toBe(403);
    expect((await request(app).patch(`/api/projects/${p1.id}/milestones/${ms.id}`).set(auth(member)).send({ title: 'Renamed' })).status).toBe(403);
    const done = await request(app).patch(`/api/projects/${p1.id}/milestones/${ms.id}`).set(auth(member)).send({ status: 'done' });
    expect(done.body.project.milestones.find((m) => m.id === ms.id).status).toBe('done');
    const n = await db.one(`SELECT title FROM notifications WHERE user_id=$1 AND type='milestone_done' ORDER BY id DESC LIMIT 1`, [p1.owner_id]);
    expect(n.title).toBe('Milestone done: Hypercare');
    const del = await request(app).delete(`/api/projects/${p1.id}/milestones/${ms.id}`).set(auth(manager));
    expect(del.status).toBe(200);
  });

  test('status updates need health; owner status update sets project health', async () => {
    expect((await request(app).post(`/api/projects/${p1.id}/updates`).set(auth(manager)).send({ kind: 'status', body: 'All good' })).status).toBe(400);
    const res = await request(app).post(`/api/projects/${p1.id}/updates`).set(auth(manager)).send({ kind: 'status', health: 'green', body: 'Back on track after the vendor fix.' });
    expect(res.status).toBe(201);
    expect(res.body.healthChanged).toBe(true);
    expect((await projectByCode('PRJ-1001')).health).toBe('green');
    // A member's status update is recorded but does not change health.
    await request(app).post(`/api/projects/${p1.id}/updates`).set(auth(member)).send({ kind: 'status', health: 'red', body: 'I think we are behind.' });
    expect((await projectByCode('PRJ-1001')).health).toBe('green');
  });

  test('viewers and outsiders cannot post; feed lists newest first', async () => {
    expect((await request(app).post(`/api/projects/${p1.id}/updates`).set(auth(viewer)).send({ body: 'hello there' })).status).toBe(403);
    expect((await request(app).post(`/api/projects/${p1.id}/updates`).set(auth(outsider)).send({ body: 'hello there' })).status).toBe(403);
    await request(app).post(`/api/projects/${p1.id}/updates`).set(auth(member)).send({ kind: 'risk', body: 'Change freeze next week.' });
    const feed = await request(app).get(`/api/projects/${p1.id}/updates`).set(auth(viewer));
    expect(feed.body.updates[0]).toMatchObject({ kind: 'risk', body: 'Change freeze next week.', author: { name: 'Arjun Reddy' } });
  });

  test('time logging: members only, no future dates, 16 h daily cap, own entries deletable', async () => {
    const today = new Date().toISOString().slice(0, 10);
    expect((await request(app).post(`/api/projects/${p1.id}/time`).set(auth(outsider)).send({ date: today, hours: 2 })).status).toBe(403);
    expect((await request(app).post(`/api/projects/${p1.id}/time`).set(auth(member)).send({ date: '2099-01-01', hours: 2 })).status).toBe(400);
    const before = (await request(app).get(`/api/projects/${p1.id}`).set(auth(member))).body.project.hoursUsed;
    const ok = await request(app).post(`/api/projects/${p1.id}/time`).set(auth(member)).send({ date: today, hours: 6, note: 'Cutover rehearsal' });
    expect(ok.status).toBe(201);
    expect(ok.body.project.hoursUsed).toBe(before + 6);
    await request(app).post(`/api/projects/${p1.id}/time`).set(auth(member)).send({ date: today, hours: 8 });
    const cap = await request(app).post(`/api/projects/${p1.id}/time`).set(auth(member)).send({ date: today, hours: 4 });
    expect(cap.status).toBe(409);
    const entries = await request(app).get(`/api/projects/${p1.id}/time`).set(auth(member));
    const mine = entries.body.entries.find((e) => e.note === 'Cutover rehearsal');
    expect((await request(app).delete(`/api/projects/${p1.id}/time/${mine.id}`).set(auth(outsider))).status).toBe(403);
    expect((await request(app).delete(`/api/projects/${p1.id}/time/${mine.id}`).set(auth(member))).status).toBe(200);
  });

  test('only an admin can delete a project', async () => {
    const p = await projectByCode('PRJ-1015');
    expect((await request(app).delete(`/api/projects/${p.id}`).set(auth(manager))).status).toBe(403);
    expect((await request(app).delete(`/api/projects/${p.id}`).set(auth(admin))).status).toBe(204);
    expect(await projectByCode('PRJ-1015')).toBeNull();
  });
});
