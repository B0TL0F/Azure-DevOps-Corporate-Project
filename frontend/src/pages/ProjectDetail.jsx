import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useApi, useDocumentTitle } from '../lib/hooks';
import { api } from '../lib/api';
import { Avatar, Burn, Empty, ErrorState, Field, Health, Modal, Priority, Progress, Spinner, Status, Tabs, Tier } from '../components/ui';
import { Columns } from '../components/Charts';
import Icon from '../components/Icon';
import ProjectForm from './ProjectForm';
import { dueLabel, fmtDate, fmtShort, hours, money, plural, timeAgo, todayIso, HEALTH_LABEL, KIND_LABEL } from '../lib/format';

function Description({ text }) {
  if (!text) return <p className="muted">No description yet.</p>;
  // Plain text with blank-line paragraphs; "## " lines become headings and "- " lines bullets.
  return (
    <div className="prose">
      {text.split(/\n{2,}/).map((block, i) => {
        if (block.startsWith('## ')) {
          const [head, ...rest] = block.split('\n');
          return <div key={i}><h4>{head.slice(3)}</h4>{rest.length > 0 && <Lines lines={rest} />}</div>;
        }
        return <Lines key={i} lines={block.split('\n')} />;
      })}
    </div>
  );
}
function Lines({ lines }) {
  if (lines.every((l) => l.startsWith('- '))) return <ul>{lines.map((l, i) => <li key={i}>{l.slice(2)}</li>)}</ul>;
  return <p>{lines.join(' ')}</p>;
}

function Milestones({ project, onChange }) {
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ title: '', dueDate: todayIso() });
  const { manage, contribute } = project.permissions;

  const setStatus = async (m, status) => {
    try { onChange((await api(`/projects/${project.id}/milestones/${m.id}`, { method: 'PATCH', body: { status } })).project); } catch (err) { toast(err.message, 'error'); }
  };
  const remove = async (m) => {
    if (!window.confirm(`Delete milestone "${m.title}"?`)) return;
    try { onChange((await api(`/projects/${project.id}/milestones/${m.id}`, { method: 'DELETE' })).project); } catch (err) { toast(err.message, 'error'); }
  };
  const add = async (e) => {
    e.preventDefault();
    try {
      onChange((await api(`/projects/${project.id}/milestones`, { method: 'POST', body: form })).project);
      setForm({ title: '', dueDate: todayIso() }); setAdding(false); toast('Milestone added');
    } catch (err) { toast(err.message, 'error'); }
  };

  return (
    <section className="card">
      <div className="card-head">
        <h3>Milestones <span className="muted">{project.milestoneSummary.done}/{project.milestoneSummary.total}</span></h3>
        {manage && <button className="btn btn-sm" onClick={() => setAdding((a) => !a)}><Icon name="plus" size={14} />Add</button>}
      </div>
      {adding && (
        <form className="inline-form" onSubmit={add}>
          <input required minLength={2} placeholder="Milestone title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} aria-label="Milestone title" />
          <input type="date" required value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} aria-label="Due date" />
          <button className="btn btn-primary btn-sm">Save</button>
        </form>
      )}
      {project.milestones.length === 0 ? <p className="muted">No milestones yet.</p> : (
        <ol className="timeline">
          {project.milestones.map((m) => (
            <li key={m.id} className={`ms ms-${m.status} ${m.overdue ? 'ms-late' : ''}`}>
              <span className="ms-dot" aria-hidden="true">{m.status === 'done' && <Icon name="check" size={12} stroke={3} />}</span>
              <div className="ms-body">
                <b>{m.title}</b>
                <small className={m.overdue ? 'tone-red' : 'muted'}>
                  {m.status === 'done' ? `Done ${m.completedAt ? timeAgo(m.completedAt) : ''}` : `${fmtDate(m.dueDate)} · ${dueLabel(m.dueDate)}`}
                </small>
              </div>
              {contribute && (
                <select className="ms-select" value={m.status} onChange={(e) => setStatus(m, e.target.value)} aria-label={`Status of ${m.title}`}>
                  <option value="pending">Not started</option><option value="in_progress">In progress</option><option value="done">Done</option>
                </select>
              )}
              {manage && <button className="icon-btn sm" onClick={() => remove(m)} aria-label={`Delete ${m.title}`}><Icon name="trash" size={14} /></button>}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function Team({ project, onChange }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const { data: people } = useApi(open ? '/people' : null);
  const [form, setForm] = useState({ userId: '', projectRole: 'Engineer', allocationPct: 50 });

  const add = async (e) => {
    e.preventDefault();
    try {
      onChange((await api(`/projects/${project.id}/members`, { method: 'POST', body: { ...form, userId: Number(form.userId), allocationPct: Number(form.allocationPct) } })).project);
      setOpen(false); toast('Team updated');
    } catch (err) { toast(err.message, 'error'); }
  };
  const remove = async (m) => {
    if (!window.confirm(`Remove ${m.name} from ${project.code}?`)) return;
    try { onChange((await api(`/projects/${project.id}/members/${m.id}`, { method: 'DELETE' })).project); } catch (err) { toast(err.message, 'error'); }
  };
  const available = people?.people.filter((p) => !project.members.some((m) => m.id === p.id)) || [];

  return (
    <section className="card">
      <div className="card-head">
        <h3>Team <span className="muted">{project.members.length}</span></h3>
        {project.permissions.manage && <button className="btn btn-sm" onClick={() => setOpen(true)}><Icon name="plus" size={14} />Add person</button>}
      </div>
      <ul className="people-list">
        {project.members.map((m) => (
          <li key={m.id}>
            <Link to={`/people/${m.id}`} className="person-row">
              <Avatar name={m.name} size={34} />
              <span><b>{m.name}</b><small>{m.projectRole} · {m.allocationPct}%</small></span>
            </Link>
            <span className="muted small">{hours(m.hours)}</span>
            {project.permissions.manage && m.id !== project.owner.id && (
              <button className="icon-btn sm" onClick={() => remove(m)} aria-label={`Remove ${m.name}`}><Icon name="x" size={14} /></button>
            )}
          </li>
        ))}
      </ul>
      {open && (
        <Modal title={`Add to ${project.code}`} onClose={() => setOpen(false)}>
          <form onSubmit={add} className="stack">
            <Field label="Person">
              <select required value={form.userId} onChange={(e) => setForm({ ...form, userId: e.target.value })}>
                <option value="">Choose…</option>
                {available.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.title} ({p.allocation}% booked)</option>)}
              </select>
            </Field>
            <div className="grid-2">
              <Field label="Role on this project"><input required value={form.projectRole} onChange={(e) => setForm({ ...form, projectRole: e.target.value })} /></Field>
              <Field label="Allocation (%)"><input type="number" min={5} max={100} step={5} value={form.allocationPct} onChange={(e) => setForm({ ...form, allocationPct: e.target.value })} /></Field>
            </div>
            <div className="modal-actions"><button type="button" className="btn" onClick={() => setOpen(false)}>Cancel</button><button className="btn btn-primary">Add</button></div>
          </form>
        </Modal>
      )}
    </section>
  );
}

function Updates({ project, onPosted }) {
  const toast = useToast();
  const { data, reload } = useApi(`/projects/${project.id}/updates`);
  const [form, setForm] = useState({ kind: 'comment', health: project.health, body: '' });
  const [busy, setBusy] = useState(false);

  const post = async (e) => {
    e.preventDefault(); setBusy(true);
    const body = { kind: form.kind, body: form.body };
    if (form.kind === 'status') body.health = form.health;
    try {
      const res = await api(`/projects/${project.id}/updates`, { method: 'POST', body });
      setForm({ ...form, body: '' }); reload();
      toast(res.healthChanged ? `Posted. Project health is now ${HEALTH_LABEL[form.health]}.` : 'Posted');
      if (res.healthChanged) onPosted();
    } catch (err) { toast(err.message, 'error'); } finally { setBusy(false); }
  };

  return (
    <div className="two-col">
      <div>
        {project.permissions.contribute ? (
          <form className="card composer" onSubmit={post}>
            <div className="row">
              {['comment', 'status', 'risk', 'decision'].map((k) => (
                <button type="button" key={k} className={`chip ${form.kind === k ? 'on' : ''}`} onClick={() => setForm({ ...form, kind: k })}>{KIND_LABEL[k]}</button>
              ))}
            </div>
            {form.kind === 'status' && (
              <div className="row health-pick" role="radiogroup" aria-label="Health">
                {['green', 'amber', 'red'].map((h) => (
                  <label key={h} className={`health-opt ${form.health === h ? 'on' : ''}`}>
                    <input type="radio" name="health" value={h} checked={form.health === h} onChange={() => setForm({ ...form, health: h })} /><Health value={h} />
                  </label>
                ))}
                {!project.permissions.manage && <small className="muted">Only the owner's status updates change the project health.</small>}
              </div>
            )}
            <textarea required minLength={3} rows={3} placeholder={form.kind === 'risk' ? 'What could go wrong, and what are we doing about it?' : 'Share an update with the team…'}
              value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} aria-label="Update" />
            <div className="row-between tight"><small className="muted">Team members and the owner are notified.</small><button className="btn btn-primary" disabled={busy}>Post</button></div>
          </form>
        ) : (
          <p className="muted small card">Only members of this project can post updates.</p>
        )}
        {!data ? <Spinner /> : data.updates.length === 0 ? <Empty icon="message" title="No updates yet" /> : (
          <ul className="updates">
            {data.updates.map((u) => (
              <li key={u.id} className={`update kind-${u.kind}`}>
                <Avatar name={u.author?.name || '?'} size={34} />
                <div>
                  <div className="update-head">
                    <b>{u.author?.name || 'Former member'}</b>
                    <span className={`kind kind-${u.kind}`}>{KIND_LABEL[u.kind]}</span>
                    {u.health && <Health value={u.health} />}
                    <small className="muted">{timeAgo(u.createdAt)}</small>
                  </div>
                  <p>{u.body}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <aside className="card">
        <h3>Health guide</h3>
        <p className="small"><Health value="green" /> Scope, schedule and budget all on plan.</p>
        <p className="small"><Health value="amber" /> One of them is slipping, with a recovery plan.</p>
        <p className="small"><Health value="red" /> Needs leadership help to recover.</p>
        <p className="muted small">The owner posts a status update at least once a week.</p>
      </aside>
    </div>
  );
}

function Time({ project, onChange }) {
  const toast = useToast();
  const { user } = useAuth();
  const { data, reload } = useApi(`/projects/${project.id}/time`, [project.hoursUsed]);
  const [form, setForm] = useState({ date: todayIso(), hours: '4', note: '' });

  const log = async (e) => {
    e.preventDefault();
    try {
      onChange((await api(`/projects/${project.id}/time`, { method: 'POST', body: { date: form.date, hours: Number(form.hours), note: form.note || undefined } })).project);
      setForm({ ...form, note: '' }); toast(`${form.hours} h logged`); reload();
    } catch (err) { toast(err.message, 'error'); }
  };
  const remove = async (entry) => {
    try { onChange((await api(`/projects/${project.id}/time/${entry.id}`, { method: 'DELETE' })).project); reload(); } catch (err) { toast(err.message, 'error'); }
  };

  return (
    <div className="two-col">
      <div className="stack">
        <section className="card">
          <div className="card-head"><h3>Hours per week</h3><span className="muted small">last 8 weeks</span></div>
          <Columns data={project.weekly} />
        </section>
        <section className="card">
          <div className="card-head"><h3>Recent entries</h3></div>
          {!data ? <Spinner /> : data.entries.length === 0 ? <p className="muted">No time logged yet.</p> : (
            <table className="table compact">
              <thead><tr><th>Date</th><th>Person</th><th>Hours</th><th>Note</th><th /></tr></thead>
              <tbody>
                {data.entries.slice(0, 12).map((e) => (
                  <tr key={e.id}>
                    <td className="nowrap">{fmtShort(e.date)}</td><td>{e.user.name}</td><td>{e.hours}</td><td className="muted">{e.note}</td>
                    <td>{(e.user.id === user.id || project.permissions.manage) && <button className="icon-btn sm" onClick={() => remove(e)} aria-label="Delete entry"><Icon name="trash" size={14} /></button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
      <aside className="stack">
        {project.permissions.contribute && (
          <form className="card stack" onSubmit={log}>
            <h3>Log time</h3>
            <div className="grid-2">
              <Field label="Date"><input type="date" required max={todayIso()} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
              <Field label="Hours"><input type="number" required min={0.5} max={16} step={0.5} value={form.hours} onChange={(e) => setForm({ ...form, hours: e.target.value })} /></Field>
            </div>
            <Field label="What did you work on?"><input value={form.note} maxLength={300} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="e.g. Helm chart for the payments API" /></Field>
            <button className="btn btn-primary">Log hours</button>
          </form>
        )}
        <section className="card">
          <h3>Budget</h3>
          <Burn used={project.hoursUsed} budget={project.budgetHours} />
          <p className="small muted">{hours(project.hoursUsed)} of {hours(project.budgetHours)} used</p>
          <ul className="kv">
            {project.hoursByPerson.map((p) => <li key={p.id}><span>{p.name}</span><b>{hours(p.hours)}</b></li>)}
          </ul>
        </section>
      </aside>
    </div>
  );
}

export default function ProjectDetail() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { data, error, loading, reload, setData } = useApi(`/projects/${id}`);
  const [editing, setEditing] = useState(false);
  const tab = params.get('tab') || 'overview';
  const p = data?.project;
  useDocumentTitle(p ? `${p.code} ${p.name}` : 'Project');

  if (loading && !data) return <Spinner />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const onChange = (project) => setData({ project });

  const remove = async () => {
    if (!window.confirm(`Delete ${p.code} ${p.name}? This removes its milestones, updates and time entries.`)) return;
    try { await api(`/projects/${p.id}`, { method: 'DELETE' }); toast(`${p.code} deleted`); navigate('/projects'); } catch (err) { toast(err.message, 'error'); }
  };

  return (
    <div className="page">
      <nav className="crumbs"><Link to="/projects">Projects</Link><Icon name="chevronRight" size={14} /><span>{p.code}</span></nav>
      <header className={`project-head edge-${p.health}`}>
        <div className="project-title">
          <div className="row"><span className="code">{p.code}</span><Status value={p.status} /><Health value={p.health} /><Priority value={p.priority} /></div>
          <h1>{p.name}</h1>
          {p.summary && <p className="lead">{p.summary}</p>}
          <div className="row muted small">
            <Link to={`/clients/${p.client.slug}`} className="row link-quiet"><Icon name="building" size={15} />{p.client.name}</Link><Tier value={p.client.tier} />
            <Link to={`/people/${p.owner.id}`} className="row link-quiet"><Avatar name={p.owner.name} size={20} />{p.owner.name}, owner</Link>
            <span>{p.category}</span>
          </div>
        </div>
        <div className="page-actions">
          {p.permissions.manage && <button className="btn" onClick={() => setEditing(true)}><Icon name="edit" size={16} />Edit</button>}
          {p.permissions.delete && <button className="btn btn-danger-ghost" onClick={remove} aria-label="Delete project"><Icon name="trash" size={16} /></button>}
        </div>
      </header>

      <section className="stats stats-tight">
        <div className="stat"><span className="stat-label">Progress</span><strong className="stat-value">{p.progress}%</strong><Progress value={p.progress} /></div>
        <div className="stat"><span className="stat-label">Budget used</span><strong className="stat-value">{hours(p.hoursUsed)}</strong><Burn used={p.hoursUsed} budget={p.budgetHours} /></div>
        <div className="stat"><span className="stat-label">Due</span><strong className="stat-value">{fmtShort(p.dueDate)}</strong><span className={`stat-hint ${p.overdue ? 'tone-red' : ''}`}>{p.status === 'completed' ? 'Delivered' : dueLabel(p.dueDate)}</span></div>
        <div className="stat"><span className="stat-label">Contract value</span><strong className="stat-value">{money(p.contractValue)}</strong><span className="stat-hint">since {fmtShort(p.startDate)}</span></div>
        <div className="stat"><span className="stat-label">Team</span><strong className="stat-value">{p.members.length}</strong><span className="stat-hint">{plural([...new Set(p.members.map((m) => m.department).filter(Boolean))].length, 'department')}</span></div>
      </section>

      <Tabs value={tab} onChange={(t) => setParams(t === 'overview' ? {} : { tab: t }, { replace: true })} tabs={[
        { key: 'overview', label: 'Overview' }, { key: 'updates', label: 'Updates' }, { key: 'time', label: 'Time & budget' },
      ]} />

      {tab === 'overview' && (
        <div className="two-col">
          <div className="stack">
            <section className="card"><h3>About</h3><Description text={p.description} /></section>
            <Milestones project={p} onChange={onChange} />
          </div>
          <div className="stack">
            <Team project={p} onChange={onChange} />
            <section className="card">
              <h3>Tech stack</h3>
              <div className="tags">{p.techStack.map((t) => <span key={t} className="tag">{t}</span>)}</div>
              {p.repoUrl && <a className="link small row" href={p.repoUrl} target="_blank" rel="noreferrer"><Icon name="git" size={15} />Repository</a>}
            </section>
            <section className="card">
              <h3>Client contacts</h3>
              {p.clientContacts.length === 0 ? <p className="muted small">None recorded.</p> : (
                <ul className="contacts">
                  {p.clientContacts.map((c) => (
                    <li key={c.id}><b>{c.name}</b>{c.is_primary && <span className="pill">Primary</span>}<small>{c.role}</small>{c.email && <a href={`mailto:${c.email}`} className="link small">{c.email}</a>}</li>
                  ))}
                </ul>
              )}
            </section>
            <p className="muted small">Created {fmtDate(p.createdAt)}{p.createdBy ? ` by ${p.createdBy}` : ''} · updated {timeAgo(p.updatedAt)}</p>
          </div>
        </div>
      )}
      {tab === 'updates' && <Updates project={p} onPosted={reload} />}
      {tab === 'time' && <Time project={p} onChange={onChange} />}

      {editing && <ProjectForm project={p} onClose={() => setEditing(false)} onSaved={(np) => { setEditing(false); onChange(np); toast('Saved'); }} />}
    </div>
  );
}
