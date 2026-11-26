'use strict';

const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = require('./pool');
const config = require('../config');

// Deterministic PRNG so every environment gets the same demo data.
function rng(seed) {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
}

/** 'YYYY-MM-DD' for today + n days (UTC). */
function day(n) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const ago = (days, hours = 0) => new Date(Date.now() - days * 864e5 - hours * 36e5);

// [name, email local part, role, title, department, location]
const PEOPLE = [
  ['Ananya Iyer', 'ananya.iyer', 'admin', 'Head of Delivery', 'Leadership', 'Bengaluru'],
  ['Rohan Mehta', 'rohan.mehta', 'manager', 'Engagement Manager', 'Delivery', 'Gurugram'],
  ['Priya Nair', 'priya.nair', 'manager', 'Principal Cloud Architect', 'Cloud', 'Bengaluru'],
  ['Vikram Singh', 'vikram.singh', 'manager', 'Platform Engineering Lead', 'Platform', 'Pune'],
  ['Sneha Kulkarni', 'sneha.kulkarni', 'manager', 'DevSecOps Lead', 'DevSecOps', 'Hyderabad'],
  ['Arjun Reddy', 'arjun.reddy', 'member', 'Senior DevOps Engineer', 'Platform', 'Hyderabad'],
  ['Kavya Menon', 'kavya.menon', 'member', 'Site Reliability Engineer', 'SRE', 'Kochi'],
  ['Rahul Verma', 'rahul.verma', 'member', 'Cloud Engineer', 'Cloud', 'Noida'],
  ['Neha Gupta', 'neha.gupta', 'member', 'Security Engineer', 'DevSecOps', 'Gurugram'],
  ['Aman Joshi', 'aman.joshi', 'member', 'Kubernetes Engineer', 'Platform', 'Indore'],
  ['Ishita Das', 'ishita.das', 'member', 'MLOps Engineer', 'MLOps', 'Kolkata'],
  ['Karthik Raman', 'karthik.raman', 'member', 'Senior SRE', 'SRE', 'Chennai'],
  ['Pooja Sharma', 'pooja.sharma', 'member', 'DevOps Engineer', 'Platform', 'Jaipur'],
  ['Siddharth Rao', 'siddharth.rao', 'member', 'Terraform Engineer', 'Cloud', 'Bengaluru'],
  ['Meera Pillai', 'meera.pillai', 'member', 'Observability Engineer', 'SRE', 'Thiruvananthapuram'],
  ['Farhan Qureshi', 'farhan.qureshi', 'member', 'Cloud Security Engineer', 'DevSecOps', 'Lucknow'],
  ['Tanvi Desai', 'tanvi.desai', 'member', 'Data Platform Engineer', 'MLOps', 'Ahmedabad'],
  ['Nikhil Bansal', 'nikhil.bansal', 'member', 'Associate DevOps Engineer', 'Platform', 'Chandigarh'],
  ['Divya Krishnan', 'divya.krishnan', 'viewer', 'Finance Partner', 'Leadership', 'Bengaluru'],
  ['Harsh Vardhan', 'harsh.vardhan', 'viewer', 'Sales Director', 'Leadership', 'Mumbai'],
];

// [name, industry, tier, city, account manager (people index)]
const CLIENTS = [
  ['Kestrel Bank', 'Banking & Finance', 'strategic', 'Mumbai', 1],
  ['Zenvia Health', 'Healthcare', 'strategic', 'Bengaluru', 2],
  ['Orbital Retail', 'Retail & E-commerce', 'key', 'Gurugram', 1],
  ['Nimbus Telecom', 'Telecom', 'key', 'Hyderabad', 3],
  ['Bluepeak Insurance', 'Insurance', 'key', 'Pune', 4],
  ['Monsoon Media', 'Media', 'standard', 'Mumbai', 2],
  ['Trident Motors', 'Automotive', 'standard', 'Chennai', 3],
  ['Lumen EdTech', 'Education', 'standard', 'Noida', 1],
  ['Harbor Freightways', 'Logistics', 'standard', 'Kochi', 4],
  ['Saffron Foods', 'Food & Beverage', 'standard', 'Ahmedabad', 2],
];

const CONTACT_ROLES = ['CTO', 'VP Engineering', 'Head of Infrastructure', 'Engineering Manager', 'CISO', 'Procurement Lead'];
const CONTACT_NAMES = ['Ritu Malhotra', 'Sanjay Kapoor', 'Lakshmi Narayanan', 'Deepak Chawla', 'Anjali Bose', 'Manoj Tiwari', 'Shreya Ghosh',
  'Varun Khanna', 'Nandini Rao', 'Abhishek Jain', 'Gayatri Sen', 'Prakash Hegde', 'Swati Agarwal', 'Imran Sheikh', 'Rekha Pandey',
  'Alok Mishra', 'Bhavna Thakur', 'Suresh Babu', 'Jyoti Arora', 'Kunal Shah'];

// Each project: client, owner (people index), team [people index, role, %], start/due offsets in days, and milestone plan.
const PROJECTS = [
  { c: 0, o: 1, name: 'Core Banking AKS Migration', cat: 'Cloud Migration', status: 'active', health: 'amber', prio: 'critical',
    stack: ['AKS', 'Terraform', 'Azure DevOps', 'Key Vault', 'PostgreSQL'], start: -120, due: 45, budget: 2400, value: 9800000,
    summary: 'Move 40 core banking services from VMs to AKS with zero customer downtime.',
    team: [[5, 'Lead DevOps Engineer', 80], [9, 'Kubernetes Engineer', 60], [13, 'Terraform Engineer', 60], [8, 'Security Engineer', 30]],
    ms: [['Landing zone and network design', -95], ['Non-prod AKS clusters live', -60], ['Payments services migrated', -10], ['DR drill signed off', 20], ['Production cutover', 40]] },
  { c: 0, o: 4, name: 'PCI-DSS DevSecOps Pipeline', cat: 'DevSecOps', status: 'active', health: 'green', prio: 'high',
    stack: ['GitHub Actions', 'Trivy', 'SonarQube', 'OPA', 'Vault'], start: -70, due: 60, budget: 1100, value: 3600000,
    summary: 'Shift-left security gates on every pipeline, with evidence for the PCI auditors.',
    team: [[8, 'Security Engineer', 70], [15, 'Cloud Security Engineer', 60], [12, 'DevOps Engineer', 40]],
    ms: [['Threat model and control mapping', -50], ['SAST and SCA gates enforced', -20], ['Image signing with Cosign', 10], ['Audit evidence pack', 55]] },
  { c: 1, o: 2, name: 'Patient Portal Observability', cat: 'Observability', status: 'active', health: 'green', prio: 'high',
    stack: ['Prometheus', 'Grafana', 'Loki', 'OpenTelemetry'], start: -45, due: 50, budget: 900, value: 2400000,
    summary: 'SLOs, tracing and on-call dashboards for the patient portal.',
    team: [[14, 'Observability Engineer', 80], [6, 'Site Reliability Engineer', 50]],
    ms: [['Golden signals dashboards', -25], ['Distributed tracing rollout', -2], ['SLOs and error budgets', 20], ['On-call runbooks', 45]] },
  { c: 1, o: 3, name: 'HIPAA-ready EKS Platform', cat: 'Kubernetes Platform', status: 'active', health: 'red', prio: 'critical',
    stack: ['EKS', 'Karpenter', 'Argo CD', 'Kyverno', 'Terraform'], start: -90, due: 15, budget: 1800, value: 7200000,
    summary: 'Multi-tenant EKS platform with policy guardrails for clinical workloads.',
    team: [[9, 'Kubernetes Engineer', 50], [5, 'Senior DevOps Engineer', 20], [15, 'Cloud Security Engineer', 30], [17, 'Associate DevOps Engineer', 100]],
    ms: [['Cluster baseline and IAM', -70], ['GitOps with Argo CD', -40], ['Kyverno policy pack', -12], ['Tenant onboarding self-service', 5], ['Go-live', 15]] },
  { c: 2, o: 1, name: 'Black Friday Scale Readiness', cat: 'Kubernetes Platform', status: 'active', health: 'amber', prio: 'high',
    stack: ['GKE', 'HPA', 'k6', 'Redis', 'Cloud CDN'], start: -40, due: 12, budget: 700, value: 1900000,
    summary: 'Load test checkout to 10x peak and tune autoscaling before the sale.',
    team: [[11, 'Senior SRE', 80], [12, 'DevOps Engineer', 40], [6, 'Site Reliability Engineer', 30]],
    ms: [['Baseline load test', -25], ['Autoscaling tuned', -6], ['Game day', 4], ['Sale-week war room', 12]] },
  { c: 2, o: 2, name: 'Cloud Cost Optimisation', cat: 'Cost Optimization', status: 'completed', health: 'green', prio: 'medium',
    stack: ['AWS', 'Kubecost', 'Spot', 'Savings Plans'], start: -150, due: -30, budget: 500, value: 1200000,
    summary: 'Cut the monthly AWS bill by 38% with rightsizing, spot and savings plans.',
    team: [[7, 'Cloud Engineer', 60], [13, 'Terraform Engineer', 20]],
    ms: [['Cost visibility with tags', -130], ['Rightsizing wave 1', -100], ['Spot for stateless workloads', -60], ['Savings plan purchase', -35]] },
  { c: 3, o: 3, name: '5G Core CI/CD Modernisation', cat: 'CI/CD', status: 'active', health: 'green', prio: 'high',
    stack: ['GitLab CI', 'Helm', 'OpenShift', 'Nexus'], start: -60, due: 90, budget: 1500, value: 4100000,
    summary: 'Replace manual releases of network functions with GitLab pipelines and Helm.',
    team: [[12, 'DevOps Engineer', 20], [17, 'Associate DevOps Engineer', 0], [5, 'Senior DevOps Engineer', 0]],
    ms: [['Pipeline templates', -35], ['Helm charts for 12 CNFs', -5], ['Canary releases', 35], ['Self-service release portal', 85]] },
  { c: 3, o: 2, name: 'Network Analytics Lakehouse', cat: 'MLOps', status: 'planning', health: 'green', prio: 'medium',
    stack: ['Databricks', 'MLflow', 'Azure', 'Terraform'], start: 10, due: 150, budget: 1300, value: 3300000,
    summary: 'Data platform and model pipeline for network anomaly detection.',
    team: [[10, 'MLOps Engineer', 60], [16, 'Data Platform Engineer', 60]],
    ms: [['Discovery workshops', 20], ['Landing zone', 50], ['Feature store', 95], ['First model in production', 145]] },
  { c: 4, o: 4, name: 'Zero-Trust Access Rollout', cat: 'DevSecOps', status: 'on_hold', health: 'amber', prio: 'medium',
    stack: ['Azure AD', 'Conditional Access', 'Teleport', 'Vault'], start: -50, due: 70, budget: 800, value: 2100000,
    summary: 'Replace VPN and shared bastions with identity-aware access. Paused for budget sign-off.',
    team: [[15, 'Cloud Security Engineer', 10], [8, 'Security Engineer', 0]],
    ms: [['Access inventory', -30], ['Pilot with platform team', 15], ['Company-wide rollout', 65]] },
  { c: 4, o: 3, name: 'Claims Platform IaC', cat: 'Infrastructure as Code', status: 'active', health: 'green', prio: 'medium',
    stack: ['Terraform', 'Terragrunt', 'Atlantis', 'Azure'], start: -35, due: 55, budget: 650, value: 1500000,
    summary: 'Bring 300 hand-built Azure resources under Terraform with plan-on-PR reviews.',
    team: [[13, 'Terraform Engineer', 20], [7, 'Cloud Engineer', 40]],
    ms: [['Import and state layout', -15], ['Module library', 10], ['Atlantis on every PR', 30], ['Drift detection', 50]] },
  { c: 5, o: 1, name: 'Streaming Platform SRE', cat: 'Observability', status: 'active', health: 'red', prio: 'high',
    stack: ['Kubernetes', 'Prometheus', 'PagerDuty', 'Chaos Mesh'], start: -30, due: 25, budget: 600, value: 1400000,
    summary: 'Stabilise live streaming after three P1 incidents in a month.',
    team: [[11, 'Senior SRE', 20], [6, 'Site Reliability Engineer', 20], [14, 'Observability Engineer', 20]],
    ms: [['Incident review and quick wins', -18], ['Alerting overhaul', -4], ['Chaos experiments', 12], ['Reliability report', 24]] },
  { c: 6, o: 2, name: 'Connected Car OTA Pipeline', cat: 'CI/CD', status: 'planning', health: 'green', prio: 'low',
    stack: ['Azure IoT', 'Azure DevOps', 'ACR', 'Bicep'], start: 20, due: 140, budget: 900, value: 2600000,
    summary: 'Signed over-the-air update pipeline for vehicle firmware.',
    team: [[7, 'Cloud Engineer', 20]],
    ms: [['Architecture sign-off', 30], ['Signing service', 70], ['Staged rollout to test fleet', 130]] },
  { c: 7, o: 3, name: 'Exam Season Autoscaling', cat: 'Kubernetes Platform', status: 'completed', health: 'green', prio: 'medium',
    stack: ['AKS', 'KEDA', 'Azure Front Door'], start: -110, due: -40, budget: 400, value: 900000,
    summary: 'Event-driven autoscaling so results day no longer takes the site down.',
    team: [[9, 'Kubernetes Engineer', 0], [17, 'Associate DevOps Engineer', 0]],
    ms: [['KEDA scalers', -90], ['Front Door caching', -70], ['Results-day rehearsal', -45]] },
  { c: 8, o: 4, name: 'Fleet Tracking Security Review', cat: 'DevSecOps', status: 'active', health: 'amber', prio: 'medium',
    stack: ['AWS', 'GuardDuty', 'Prowler', 'Checkov'], start: -20, due: 30, budget: 300, value: 750000,
    summary: 'Cloud security posture review and remediation plan.',
    team: [[8, 'Security Engineer', 0], [15, 'Cloud Security Engineer', 0]],
    ms: [['Posture scan', -10], ['Findings workshop', 5], ['Remediation roadmap', 28]] },
  { c: 9, o: 1, name: 'Kitchen Ops Platform on GCP', cat: 'Cloud Migration', status: 'cancelled', health: 'amber', prio: 'low',
    stack: ['GCP', 'Cloud Run', 'Terraform'], start: -80, due: 20, budget: 500, value: 0,
    summary: 'Cancelled by the client after a change of strategy.',
    team: [[12, 'DevOps Engineer', 0]],
    ms: [['Assessment', -60]] },
  { c: 1, o: 4, name: 'Clinical ML Model Governance', cat: 'MLOps', status: 'active', health: 'green', prio: 'medium',
    stack: ['SageMaker', 'MLflow', 'Great Expectations'], start: -25, due: 80, budget: 700, value: 1800000,
    summary: 'Model registry, approvals and drift monitoring for clinical models.',
    team: [[10, 'MLOps Engineer', 40], [16, 'Data Platform Engineer', 40]],
    ms: [['Model registry', -8], ['Approval workflow', 25], ['Drift monitoring', 70]] },
];

const UPDATE_LINES = {
  green: ['Sprint closed on plan. Demo went well and the client signed off the increment.', 'All milestones tracking. No blockers this week.',
    'Pipeline run time down from 18 to 7 minutes after caching the build layers.'],
  amber: ['Two services slipped a week: the vendor API we depend on changed its auth flow.', 'Waiting on the client firewall change; escalated to their infra lead.',
    'Team is stretched. Asked for one more engineer for three weeks.'],
  red: ['Go-live at risk. Policy pack blocks two legacy workloads and the client wants an exception process first.',
    'Third P1 this month. Freezing feature work until alerting and capacity are fixed.'],
};

/** Seeds demo data once. Returns true if it seeded. */
async function seed(logger = console) {
  const { n } = await db.one('SELECT count(*)::int AS n FROM users');
  if (n > 0) return false;
  const rand = rng(42);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];

  const adminHash = await bcrypt.hash(config.seedAdminPassword, 10);
  // Demo logins on: every seeded person can sign in with the demo password.
  // Demo logins off (prod): they get an unusable random password until an admin resets it.
  const demoHash = await bcrypt.hash(config.demoLogins ? config.seedDemoPassword : crypto.randomBytes(24).toString('hex'), 10);

  await db.tx(async (c) => {
    const q = (text, params) => c.query(text, params);
    const { rows: [admin] } = await q(
      `INSERT INTO users(name, email, password_hash, role, status, title, department, location, created_at)
       VALUES ('ShackPulse Admin','admin@devopsshack.com',$1,'admin','active','Platform Administrator','Leadership','Gurugram', now() - interval '200 days') RETURNING id`,
      [adminHash]);

    const people = [];
    for (const [i, [name, local, role, title, dept, loc]] of PEOPLE.entries()) {
      const { rows: [u] } = await q(
        `INSERT INTO users(name, email, password_hash, role, status, title, department, location, last_login_at, created_at)
         VALUES ($1,$2,$3,$4,'active',$5,$6,$7,$8,$9) RETURNING id`,
        [name, `${local}@devopsshack.com`, demoHash, role, title, dept, loc, ago(i % 5, i), ago(180 - i * 3)]);
      people.push(u.id);
    }
    // Two pending access requests so the admin approval queue has something in it.
    for (const [name, local, title, dept] of [['Riya Saxena', 'riya.saxena', 'DevOps Engineer', 'Platform'], ['Mohit Arora', 'mohit.arora', 'Cloud Engineer', 'Cloud']]) {
      await q(`INSERT INTO users(name, email, password_hash, role, status, title, department, created_at) VALUES ($1,$2,$3,'member','pending',$4,$5, now() - interval '1 day')`,
        [name, `${local}@devopsshack.com`, demoHash, title, dept]);
    }

    const clientIds = [];
    for (const [i, [name, industry, tier, city, am]] of CLIENTS.entries()) {
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const { rows: [cl] } = await q(
        `INSERT INTO clients(name, slug, industry, tier, status, city, website, account_manager_id, notes, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
        [name, slug, industry, tier, i === 9 ? 'inactive' : 'active', city, `https://www.${slug.replace(/-/g, '')}.example`, people[am],
          `${name} is a ${tier} ${industry.toLowerCase()} account.`, ago(400 - i * 20)]);
      clientIds.push(cl.id);
      for (let k = 0; k < 2; k += 1) {
        const cn = CONTACT_NAMES[(i * 2 + k) % CONTACT_NAMES.length];
        await q('INSERT INTO client_contacts(client_id, name, email, phone, role, is_primary) VALUES ($1,$2,$3,$4,$5,$6)',
          [cl.id, cn, `${cn.toLowerCase().replace(/[^a-z]+/g, '.')}@${slug.replace(/-/g, '')}.example`, `+91 98${String(10000000 + i * 1111 + k * 7).slice(0, 8)}`,
            CONTACT_ROLES[(i + k) % CONTACT_ROLES.length], k === 0]);
      }
    }

    const acts = []; // [actor, action, summary, project, client, created_at]
    for (const [pi, p] of PROJECTS.entries()) {
      const owner = people[p.o];
      const createdAt = ago(Math.max(1, -p.start + 7));
      const { rows: [proj] } = await q(
        `INSERT INTO projects(name, client_id, owner_id, summary, description, category, status, health, priority, tech_stack, start_date, due_date,
                              budget_hours, contract_value, repo_url, created_by, created_at, updated_at, completed_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING id, code`,
        [p.name, clientIds[p.c], owner, p.summary,
          `## Goal\n${p.summary}\n\n## Scope\n- ${p.stack.slice(0, 3).join('\n- ')}\n\n## Definition of done\nAgreed with ${CLIENTS[p.c][0]} in the statement of work.`,
          p.cat, p.status, p.health, p.prio, p.stack, day(p.start), day(p.due), p.budget, p.value,
          `https://dev.azure.com/devopsshack/${p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, people[0], createdAt, ago(pi % 6, pi),
          p.status === 'completed' ? ago(-p.due) : null]);
      acts.push([people[0], 'project.create', `Ananya Iyer created ${proj.code} ${p.name}`, proj.id, clientIds[p.c], createdAt]);

      await q(`INSERT INTO project_members(project_id, user_id, project_role, allocation_pct, joined_at) VALUES ($1,$2,'Project Owner',$3,$4)`,
        [proj.id, owner, p.status === 'completed' || p.status === 'cancelled' ? 5 : 20, createdAt]);
      for (const [idx, role, pct] of p.team) {
        await q('INSERT INTO project_members(project_id, user_id, project_role, allocation_pct, joined_at) VALUES ($1,$2,$3,$4,$5)',
          [proj.id, people[idx], role, Math.max(5, pct), createdAt]);
      }

      for (const [title, off] of p.ms) {
        let status = 'pending';
        if (p.status === 'completed' || off < -5) status = 'done';
        else if (off <= 10 && p.status === 'active') status = 'in_progress';
        // A red project carries one overdue milestone.
        if (p.health === 'red' && off < 0 && off > -15) status = 'in_progress';
        await q('INSERT INTO milestones(project_id, title, due_date, status, completed_at) VALUES ($1,$2,$3,$4,$5)',
          [proj.id, title, day(off), status, status === 'done' ? ago(Math.max(0, -off - 1)) : null]);
        if (status === 'done' && off > -40) acts.push([owner, 'milestone.done', `${PEOPLE[p.o][0]} completed "${title}" on ${proj.code}`, proj.id, null, ago(-off)]);
      }

      // Time entries: weekdays over the last 12 weeks for active work.
      if (['active', 'completed', 'on_hold'].includes(p.status)) {
        const workers = [p.o, ...p.team.map((t) => t[0])];
        const values = []; const params = [];
        for (let d = 84; d >= 1; d -= 1) { // 12 weeks of history
          const date = new Date(Date.now() - d * 864e5);
          if ([0, 6].includes(date.getUTCDay())) continue;
          if (p.status === 'completed' && d < 35) continue;
          if (p.status === 'on_hold' && d < 21) continue;
          for (const w of workers) {
            if (rand() < 0.45) continue;
            const hours = [2, 3, 4, 5, 6, 8][Math.floor(rand() * 6)];
            params.push(proj.id, people[w], date.toISOString().slice(0, 10), hours, pick(['Pipeline work', 'Client call', 'Terraform modules', 'Code review', 'Incident follow-up', 'Documentation', 'Cluster upgrades']));
            const b = params.length - 4;
            values.push(`($${b},$${b + 1},$${b + 2},$${b + 3},$${b + 4})`);
          }
        }
        if (values.length) await q(`INSERT INTO time_entries(project_id, user_id, entry_date, hours, note) VALUES ${values.join(',')}`, params);
      }

      // Updates: a status update per project and a couple of comments, newest first in the UI.
      const lines = UPDATE_LINES[p.health];
      const updates = [
        [owner, 'status', p.health, lines[pi % lines.length], ago(2 + (pi % 4), pi)],
        [people[p.team[0][0]], 'comment', null, pick(['Merged the module refactor; plan output is clean on all workspaces.', 'Runbook updated with the new rollback steps.', 'Client asked for a walkthrough on Friday, I have booked it.']), ago(1 + (pi % 3), pi + 2)],
      ];
      if (p.health !== 'green') updates.push([owner, 'risk', null, pick(['Dependency on client change board, which meets only on Thursdays.', 'Key engineer on leave for two weeks during the critical window.']), ago(5, pi)]);
      if (pi % 3 === 0) updates.push([owner, 'decision', null, 'Agreed with the client to phase the rollout by business unit instead of a big-bang cutover.', ago(9, pi)]);
      for (const [author, kind, health, body, at] of updates) {
        await q('INSERT INTO project_updates(project_id, author_id, kind, health, body, created_at) VALUES ($1,$2,$3,$4,$5,$6)', [proj.id, author, kind, health, body, at]);
        acts.push([author, `update.${kind}`, `${PEOPLE[people.indexOf(author)][0]} posted a ${kind} on ${proj.code}`, proj.id, null, at]);
      }
    }

    acts.push([admin.id, 'user.approve', 'ShackPulse Admin approved Nikhil Bansal as member', null, null, ago(30)]);
    for (const [actor, action, summary, projectId, clientId, at] of acts) {
      await q('INSERT INTO activity(actor_id, action, summary, project_id, client_id, created_at) VALUES ($1,$2,$3,$4,$5,$6)', [actor, action, summary, projectId, clientId, at]);
    }

    // A few unread notifications for the demo managers.
    await q(`INSERT INTO notifications(user_id, type, title, body, link) VALUES
      ($1,'access_request','Access request: Riya Saxena','riya.saxena@devopsshack.com · Platform','/admin'),
      ($1,'access_request','Access request: Mohit Arora','mohit.arora@devopsshack.com · Cloud','/admin'),
      ($2,'update_risk','PRJ-1001: new risk from Arjun Reddy','Vendor API auth change may slip payments migration.','/projects/1?tab=updates')`,
    [admin.id, people[1]]);
    await q(`INSERT INTO notifications(user_id, type, title, link) SELECT id, 'access_request', 'Access request: Riya Saxena', '/admin' FROM users WHERE email='ananya.iyer@devopsshack.com'`);
  });
  logger.info({ demoLogins: config.demoLogins }, 'seed complete');
  return true;
}

module.exports = { seed, PEOPLE };

if (require.main === module) {
  seed()
    .then((did) => { console.log(did ? 'Seeded demo data' : 'Database already has data, skipped'); return db.pool.end(); })
    .catch((err) => { console.error(err); process.exit(1); });
}
