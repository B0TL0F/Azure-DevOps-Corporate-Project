import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useApi, useDocumentTitle } from '../lib/hooks';
import { Avatar, ErrorState, Health, PageHead, Priority, Spinner, Stat } from '../components/ui';
import { Columns, Donut, HBars } from '../components/Charts';
import Icon from '../components/Icon';
import { dueLabel, fmtShort, money, timeAgo, STATUS_LABEL, hours } from '../lib/format';

const HEALTH_COLORS = { green: 'var(--green)', amber: 'var(--amber)', red: 'var(--red)' };
const STATUS_COLORS = { planning: 'var(--sky)', active: 'var(--brand)', on_hold: 'var(--amber)', completed: 'var(--green)', cancelled: 'var(--faint)' };

function greeting() {
  const h = Number(new Date().toLocaleString('en-IN', { hour: 'numeric', hour12: false, timeZone: 'Asia/Kolkata' }));
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export default function Dashboard() {
  useDocumentTitle('Dashboard');
  const { user, stats } = useAuth();
  const { data, error, loading, reload } = useApi('/dashboard');
  if (loading && !data) return <Spinner />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const t = data.totals;
  const health = ['green', 'amber', 'red'].map((k) => ({ key: k, label: { green: 'On track', amber: 'At risk', red: 'Off track' }[k], value: data.byHealth.find((h) => h.health === k)?.count || 0, color: HEALTH_COLORS[k] }));
  const status = ['planning', 'active', 'on_hold', 'completed', 'cancelled'].map((k) => ({ key: k, label: STATUS_LABEL[k], value: data.byStatus.find((s) => s.status === k)?.count || 0, color: STATUS_COLORS[k] }));

  return (
    <div className="page">
      <PageHead
        title={`${greeting()}, ${user.name.split(' ')[0]}`}
        subtitle={stats ? `You're on ${stats.my_projects} open projects, with ${stats.due_soon} milestones due in the next two weeks and ${hours(stats.hours_this_week)} logged this week.` : null}
        actions={<Link to="/projects?mine=true" className="btn"><Icon name="target" size={16} />My projects</Link>}
      />

      <section className="stats">
        <Stat label="Open projects" value={t.open_projects} hint={`${t.active_projects} active`} icon="folder" to="/projects?status=open" />
        <Stat label="Need attention" value={t.at_risk} hint="amber or red health" icon="alert" tone={t.at_risk ? 'amber' : undefined} to="/projects?status=open&sort=health" />
        <Stat label="Overdue" value={t.overdue} hint="past due date, still open" icon="clock" tone={t.overdue ? 'red' : undefined} to="/projects?overdue=true" />
        <Stat label="Active clients" value={t.active_clients} hint={`${money(t.open_contract_value)} in open contracts`} icon="building" to="/clients" />
        <Stat label="People" value={t.people} hint={`${t.completed_this_quarter} projects delivered this quarter`} icon="users" to="/people" />
      </section>

      <div className="dash-grid">
        <section className="card span-2">
          <div className="card-head"><h3>Needs attention</h3><Link to="/projects?status=open&sort=health" className="link small">All at-risk projects</Link></div>
          {data.atRisk.length === 0 ? <p className="muted">Everything is on track.</p> : (
            <ul className="risk-list">
              {data.atRisk.map((p) => (
                <li key={p.id}>
                  <Link to={`/projects/${p.id}`} className="risk-item">
                    <Health value={p.health} compact />
                    <div className="risk-main">
                      <div className="risk-title"><b>{p.name}</b><span className="code">{p.code}</span><Priority value={p.priority} /></div>
                      <span className="muted small">{p.client} · owner {p.owner} · {dueLabel(p.dueDate)}</span>
                      {p.lastUpdate && <p className="risk-update">"{p.lastUpdate}"</p>}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <div className="card-head"><h3>Portfolio health</h3></div>
          <Donut segments={health} label="open" />
        </section>

        <section className="card">
          <div className="card-head"><h3>Upcoming milestones</h3><span className="muted small">next 3 weeks</span></div>
          {data.deadlines.length === 0 ? <p className="muted">Nothing due soon.</p> : (
            <ul className="deadlines">
              {data.deadlines.map((d) => (
                <li key={d.id}>
                  <Link to={`/projects/${d.project.id}`}>
                    <span className={`date-chip ${d.overdue ? 'late' : ''}`}><b>{fmtShort(d.dueDate).split(' ')[0]}</b>{fmtShort(d.dueDate).split(' ')[1]}</span>
                    <span><b>{d.title}</b><small>{d.project.code} · {d.project.client}</small></span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <div className="card-head"><h3>Projects by status</h3></div>
          <Donut segments={status} label="projects" />
        </section>

        <section className="card">
          <div className="card-head"><h3>Team allocation</h3><Link to="/people" className="link small">People</Link></div>
          <HBars max={120} suffix="%" rows={data.workload.map((w) => ({ key: w.id, label: w.name, value: w.allocation, tone: w.allocation > 100 ? 'red' : w.allocation > 85 ? 'amber' : 'brand' }))} />
          <p className="muted small">Share of each person's week booked on open projects. Over 100% means overbooked.</p>
        </section>

        <section className="card span-2">
          <div className="card-head"><h3>Hours logged</h3><span className="muted small">last 12 weeks, all projects</span></div>
          <Columns data={data.hoursByWeek} />
        </section>

        <section className="card">
          <div className="card-head"><h3>Open work by category</h3></div>
          <HBars rows={data.byCategory.map((c) => ({ label: c.category, value: c.count }))} />
        </section>

        <section className="card span-3">
          <div className="card-head"><h3>Activity</h3></div>
          <ul className="feed">
            {data.activity.map((a) => (
              <li key={a.id}>
                <Avatar name={a.actor?.name || 'System'} size={28} />
                <span>{a.projectId ? <Link to={`/projects/${a.projectId}`}>{a.summary}</Link> : a.summary}</span>
                <small className="muted">{timeAgo(a.createdAt)}</small>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
