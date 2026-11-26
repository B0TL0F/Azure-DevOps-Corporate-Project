import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useApi, useDocumentTitle } from '../lib/hooks';
import { getToken } from '../lib/api';
import { Avatar, Burn, Empty, ErrorState, Health, PageHead, Priority, Progress, Spinner, Status } from '../components/ui';
import Icon from '../components/Icon';
import ProjectForm from './ProjectForm';
import { dueLabel, fmtDate, money, STATUS_LABEL, HEALTH_LABEL, PRIORITY_LABEL, plural } from '../lib/format';
import { useToast } from '../context/ToastContext';

const CATEGORIES = ['Cloud Migration', 'Kubernetes Platform', 'CI/CD', 'DevSecOps', 'Observability', 'MLOps', 'Cost Optimization', 'Infrastructure as Code'];
const FILTERS = ['q', 'status', 'health', 'priority', 'category', 'clientId', 'ownerId', 'mine', 'overdue', 'sort'];
const BOARD = ['planning', 'active', 'on_hold', 'completed'];

function Board({ projects }) {
  return (
    <div className="board">
      {BOARD.map((s) => {
        const items = projects.filter((p) => p.status === s);
        return (
          <section key={s} className="board-col">
            <h3>{STATUS_LABEL[s]} <span className="muted">{items.length}</span></h3>
            {items.map((p) => (
              <Link key={p.id} to={`/projects/${p.id}`} className={`board-card edge-${p.health}`}>
                <div className="row-between tight"><span className="code">{p.code}</span><Health value={p.health} compact /></div>
                <b>{p.name}</b>
                <span className="muted small">{p.client.name}</span>
                <Progress value={p.progress} label={`${p.name} progress`} />
                <div className="row-between tight small">
                  <span className={p.overdue ? 'tone-red' : 'muted'}>{dueLabel(p.dueDate)}</span>
                  <span title={p.owner.name}><Avatar name={p.owner.name} size={22} /></span>
                </div>
              </Link>
            ))}
            {items.length === 0 && <p className="muted small">None</p>}
          </section>
        );
      })}
    </div>
  );
}

function Table({ projects }) {
  const navigate = useNavigate();
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr><th>Project</th><th>Client</th><th>Owner</th><th>Status</th><th>Health</th><th>Priority</th><th>Progress</th><th>Budget</th><th>Due</th></tr>
        </thead>
        <tbody>
          {projects.map((p) => (
            <tr key={p.id} onClick={() => navigate(`/projects/${p.id}`)} className="clickable">
              <td><Link to={`/projects/${p.id}`} className="cell-title" onClick={(e) => e.stopPropagation()}><b>{p.name}</b><small>{p.code} · {p.category}</small></Link></td>
              <td>{p.client.name}</td>
              <td><span className="row nowrap"><Avatar name={p.owner.name} size={24} />{p.owner.name}</span></td>
              <td><Status value={p.status} /></td>
              <td><Health value={p.health} /></td>
              <td><Priority value={p.priority} /></td>
              <td className="w-progress"><Progress value={p.progress} label={`${p.name} progress`} /><small className="muted">{p.milestones.done}/{p.milestones.total} milestones</small></td>
              <td className="w-progress"><Burn used={p.hoursUsed} budget={p.budgetHours} /></td>
              <td className="nowrap"><span>{fmtDate(p.dueDate)}</span>{p.overdue && <small className="tone-red block">{dueLabel(p.dueDate)}</small>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Projects() {
  useDocumentTitle('Projects');
  const { isManager } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [view, setView] = useState(() => { try { return localStorage.getItem('spulse_view') || 'table'; } catch { return 'table'; } });
  const [creating, setCreating] = useState(false);
  const { data: clients } = useApi('/clients');
  const { data: owners } = useApi('/people?owners=true');

  const qs = new URLSearchParams();
  FILTERS.forEach((k) => { if (params.get(k)) qs.set(k, params.get(k)); });
  qs.set('pageSize', '100');
  const { data, error, loading, reload } = useApi(`/projects?${qs}`);

  const setFilter = (k, v) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v); else next.delete(k);
    setParams(next, { replace: true });
  };
  const switchView = (v) => { setView(v); try { localStorage.setItem('spulse_view', v); } catch { /* ignore */ } };
  const active = FILTERS.filter((k) => k !== 'sort' && params.get(k)).length;

  const exportCsv = async () => {
    const res = await fetch(`/api/projects/export.csv?${qs}`, { headers: { Authorization: `Bearer ${getToken()}` } });
    if (!res.ok) { toast('Export failed', 'error'); return; }
    const url = URL.createObjectURL(await res.blob());
    const a = Object.assign(document.createElement('a'), { href: url, download: 'shackpulse-projects.csv' });
    a.click(); URL.revokeObjectURL(url);
  };

  const mine = params.get('mine') === 'true';
  return (
    <div className="page">
      <PageHead
        title={mine ? 'My projects' : 'Projects'}
        subtitle={data ? `${plural(data.total, 'project')}${active ? ' match your filters' : ''} · ${money(data.projects.reduce((a, p) => a + p.contractValue, 0))} contract value` : 'Loading…'}
        actions={(
          <>
            <button className="btn" onClick={exportCsv}><Icon name="download" size={16} />Export CSV</button>
            {isManager && <button className="btn btn-primary" onClick={() => setCreating(true)}><Icon name="plus" size={16} />New project</button>}
          </>
        )}
      />

      <div className="filters">
        <div className="search-inline">
          <Icon name="search" size={16} />
          <input type="search" placeholder="Name, code, client or tech…" defaultValue={params.get('q') || ''} aria-label="Filter projects"
            onKeyDown={(e) => { if (e.key === 'Enter') setFilter('q', e.currentTarget.value.trim()); }}
            onBlur={(e) => setFilter('q', e.currentTarget.value.trim())} />
        </div>
        <select aria-label="Status" value={params.get('status') || ''} onChange={(e) => setFilter('status', e.target.value)}>
          <option value="">All statuses</option><option value="open">Open (not done)</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select aria-label="Health" value={params.get('health') || ''} onChange={(e) => setFilter('health', e.target.value)}>
          <option value="">Any health</option>{Object.entries(HEALTH_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select aria-label="Priority" value={params.get('priority') || ''} onChange={(e) => setFilter('priority', e.target.value)}>
          <option value="">Any priority</option>{Object.entries(PRIORITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select aria-label="Category" value={params.get('category') || ''} onChange={(e) => setFilter('category', e.target.value)}>
          <option value="">All categories</option>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </select>
        <select aria-label="Client" value={params.get('clientId') || ''} onChange={(e) => setFilter('clientId', e.target.value)}>
          <option value="">All clients</option>{clients?.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select aria-label="Owner" value={params.get('ownerId') || ''} onChange={(e) => setFilter('ownerId', e.target.value)}>
          <option value="">Any owner</option>{owners?.people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select aria-label="Sort" value={params.get('sort') || 'due'} onChange={(e) => setFilter('sort', e.target.value === 'due' ? '' : e.target.value)}>
          <option value="due">Sort: due date</option><option value="health">Sort: health</option><option value="priority">Sort: priority</option>
          <option value="updated">Sort: recently updated</option><option value="value">Sort: contract value</option><option value="name">Sort: name</option>
        </select>
        <label className="check"><input type="checkbox" checked={params.get('overdue') === 'true'} onChange={(e) => setFilter('overdue', e.target.checked ? 'true' : '')} />Overdue only</label>
        {active > 0 && <button className="link-btn" onClick={() => setParams({}, { replace: true })}>Clear filters</button>}
        <div className="view-toggle" role="group" aria-label="View">
          <button className={view === 'table' ? 'on' : ''} onClick={() => switchView('table')} aria-label="Table view" aria-pressed={view === 'table'}><Icon name="list" size={16} /></button>
          <button className={view === 'board' ? 'on' : ''} onClick={() => switchView('board')} aria-label="Board view" aria-pressed={view === 'board'}><Icon name="board" size={16} /></button>
        </div>
      </div>

      {loading && !data && <Spinner />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {data && data.projects.length === 0 && (
        <Empty icon="folder" title="No projects match" action={active ? <button className="btn" onClick={() => setParams({})}>Clear filters</button> : null}>
          Try a different filter{isManager ? ', or create a new project' : ''}.
        </Empty>
      )}
      {data && data.projects.length > 0 && (view === 'board' ? <Board projects={data.projects} /> : <Table projects={data.projects} />)}

      {creating && (
        <ProjectForm onClose={() => setCreating(false)} onSaved={(p) => { setCreating(false); toast(`${p.code} created`); navigate(`/projects/${p.id}`); }} />
      )}
    </div>
  );
}
