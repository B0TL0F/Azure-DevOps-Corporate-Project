import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useApi, useDocumentTitle } from '../lib/hooks';
import { Avatar, Empty, ErrorState, Health, PageHead, Spinner, Status } from '../components/ui';
import { Columns } from '../components/Charts';
import Icon from '../components/Icon';
import { DEPARTMENTS, ROLE_LABEL, fmtShort, hours, plural, timeAgo } from '../lib/format';

function AllocationMeter({ value }) {
  const tone = value > 100 ? 'red' : value > 85 ? 'amber' : 'ok';
  return (
    <span className={`alloc alloc-${tone}`} title={`${value}% of the week booked on open projects`}>
      <span className="alloc-track"><span style={{ width: `${Math.min(100, value)}%` }} /></span>{value}%
    </span>
  );
}

export function People() {
  useDocumentTitle('People');
  const [dept, setDept] = useState('');
  const [q, setQ] = useState('');
  const qs = new URLSearchParams(); if (dept) qs.set('department', dept); if (q) qs.set('q', q);
  const { data, error, loading, reload } = useApi(`/people?${qs}`);
  const over = data?.people.filter((p) => p.allocation > 100).length || 0;

  return (
    <div className="page">
      <PageHead title="People" subtitle={data ? `${plural(data.people.length, 'person', 'people')}${over ? ` · ${over} overbooked` : ''}` : 'Loading…'} />
      <div className="filters">
        <div className="search-inline"><Icon name="search" size={16} /><input type="search" placeholder="Name, title or email…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter people" /></div>
        <div className="row">
          {['', ...DEPARTMENTS].map((d) => <button key={d || 'all'} className={`chip ${dept === d ? 'on' : ''}`} onClick={() => setDept(d)}>{d || 'Everyone'}</button>)}
        </div>
      </div>
      {loading && !data && <Spinner />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {data?.people.length === 0 && <Empty icon="users" title="Nobody matches" />}
      {data && data.people.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Name</th><th>Department</th><th>Role</th><th>Open projects</th><th>Owns</th><th>Allocation</th><th>Hours (30 days)</th></tr></thead>
            <tbody>
              {data.people.map((p) => (
                <tr key={p.id}>
                  <td><Link to={`/people/${p.id}`} className="person-row"><Avatar name={p.name} size={32} /><span><b>{p.name}</b><small>{p.title}</small></span></Link></td>
                  <td>{p.department}</td>
                  <td><span className={`pill role-${p.role}`}>{ROLE_LABEL[p.role]}</span></td>
                  <td>{p.openProjects}</td>
                  <td>{p.ownedProjects || '—'}</td>
                  <td><AllocationMeter value={p.allocation} /></td>
                  <td>{hours(p.hours30d)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function Person() {
  const { id } = useParams();
  const { data, error, loading, reload } = useApi(`/people/${id}`);
  const p = data?.person;
  useDocumentTitle(p?.name || 'Person');
  if (loading && !data) return <Spinner />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  return (
    <div className="page">
      <nav className="crumbs"><Link to="/people">People</Link><Icon name="chevronRight" size={14} /><span>{p.name}</span></nav>
      <header className="person-head">
        <Avatar name={p.name} size={72} />
        <div>
          <h1>{p.name}</h1>
          <p className="muted">{p.title} · {p.department} · {p.location}</p>
          <div className="row small">
            <span className={`pill role-${p.role}`}>{ROLE_LABEL[p.role]}</span>
            <a href={`mailto:${p.email}`} className="link row"><Icon name="mail" size={14} />{p.email}</a>
            {p.lastLoginAt && <span className="muted">last seen {timeAgo(p.lastLoginAt)}</span>}
          </div>
        </div>
      </header>
      <section className="stats stats-tight">
        <div className="stat"><span className="stat-label">Allocation</span><strong className="stat-value"><AllocationMeter value={p.allocation} /></strong></div>
        <div className="stat"><span className="stat-label">Open projects</span><strong className="stat-value">{p.openProjects}</strong></div>
        <div className="stat"><span className="stat-label">Owns</span><strong className="stat-value">{p.ownedProjects}</strong></div>
        <div className="stat"><span className="stat-label">Hours, last 30 days</span><strong className="stat-value">{hours(p.hours30d)}</strong></div>
      </section>
      <div className="two-col">
        <section className="card">
          <h3>Projects</h3>
          {p.projects.length === 0 ? <p className="muted">Not on any project yet.</p> : (
            <ul className="project-rows">
              {p.projects.map((pr) => (
                <li key={pr.id}>
                  <Link to={`/projects/${pr.id}`} className="project-row">
                    <Health value={pr.health} compact />
                    <span className="grow"><b>{pr.name}</b><small>{pr.code} · {pr.client.name} · {pr.isOwner ? 'Owner' : pr.projectRole}</small></span>
                    <Status value={pr.status} />
                    <span className="muted small nowrap">{pr.allocationPct}% · {hours(pr.hours)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        <div className="stack">
          <section className="card"><div className="card-head"><h3>Hours per week</h3></div><Columns data={p.weekly} height={140} /></section>
          <section className="card">
            <h3>Recent activity</h3>
            {p.recentActivity.length === 0 ? <p className="muted small">Nothing yet.</p> : (
              <ul className="feed compact">
                {p.recentActivity.map((a) => <li key={a.id}><span>{a.projectId ? <Link to={`/projects/${a.projectId}`}>{a.summary}</Link> : a.summary}</span><small className="muted">{fmtShort(a.createdAt)}</small></li>)}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
