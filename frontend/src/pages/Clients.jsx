import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useApi, useDocumentTitle } from '../lib/hooks';
import { api } from '../lib/api';
import { Avatar, Empty, ErrorState, Field, Health, Modal, PageHead, Progress, Spinner, Status, Tier } from '../components/ui';
import Icon from '../components/Icon';
import ProjectForm from './ProjectForm';
import { fmtDate, money, plural, timeAgo, TIER_LABEL } from '../lib/format';

const INDUSTRIES = ['Banking & Finance', 'Healthcare', 'Retail & E-commerce', 'Telecom', 'Insurance', 'Media', 'Automotive', 'Education', 'Logistics', 'Food & Beverage', 'SaaS'];

function ClientForm({ client, onClose, onSaved }) {
  const [f, setF] = useState({
    name: client?.name || '', industry: client?.industry || INDUSTRIES[0], tier: client?.tier || 'standard', status: client?.status || 'active',
    city: client?.city || '', country: client?.country || 'India', website: client?.website || '', notes: client?.notes || '',
  });
  const [error, setError] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault(); setError(null);
    try {
      const res = await api(client ? `/clients/${client.id}` : '/clients', { method: client ? 'PATCH' : 'POST', body: { ...f, city: f.city || null, notes: f.notes || null } });
      onSaved(res.client);
    } catch (err) { setError(err.message); }
  };
  return (
    <Modal title={client ? `Edit ${client.name}` : 'New client'} onClose={onClose}>
      <form onSubmit={submit} className="stack">
        <Field label="Company name"><input required minLength={2} value={f.name} onChange={set('name')} /></Field>
        <div className="grid-2">
          <Field label="Industry"><select value={f.industry} onChange={set('industry')}>{INDUSTRIES.map((i) => <option key={i}>{i}</option>)}</select></Field>
          <Field label="Tier"><select value={f.tier} onChange={set('tier')}>{Object.entries(TIER_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
          <Field label="City"><input value={f.city} onChange={set('city')} /></Field>
          <Field label="Status"><select value={f.status} onChange={set('status')}><option value="active">Active</option><option value="prospect">Prospect</option><option value="inactive">Inactive</option></select></Field>
        </div>
        <Field label="Website"><input type="url" value={f.website} onChange={set('website')} placeholder="https://" /></Field>
        <Field label="Notes"><textarea rows={3} value={f.notes} onChange={set('notes')} /></Field>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="modal-actions"><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary">{client ? 'Save' : 'Add client'}</button></div>
      </form>
    </Modal>
  );
}

export function Clients() {
  useDocumentTitle('Clients');
  const { isManager } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [tier, setTier] = useState('');
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const qs = new URLSearchParams(); if (tier) qs.set('tier', tier); if (q) qs.set('q', q);
  const { data, error, loading, reload } = useApi(`/clients?${qs}`);

  return (
    <div className="page">
      <PageHead title="Clients" subtitle={data ? `${plural(data.clients.length, 'client')} · ${money(data.clients.reduce((a, c) => a + c.contractValue, 0))} total contract value` : 'Loading…'}
        actions={isManager && <button className="btn btn-primary" onClick={() => setAdding(true)}><Icon name="plus" size={16} />New client</button>} />
      <div className="filters">
        <div className="search-inline"><Icon name="search" size={16} /><input type="search" placeholder="Name or city…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter clients" /></div>
        <div className="row">
          {['', 'strategic', 'key', 'standard'].map((t) => <button key={t || 'all'} className={`chip ${tier === t ? 'on' : ''}`} onClick={() => setTier(t)}>{t ? TIER_LABEL[t] : 'All tiers'}</button>)}
        </div>
      </div>
      {loading && !data && <Spinner />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {data?.clients.length === 0 && <Empty icon="building" title="No clients match" />}
      <div className="card-grid">
        {data?.clients.map((c) => (
          <Link key={c.id} to={`/clients/${c.slug}`} className="client-card">
            <div className="row-between tight"><span className="client-logo" aria-hidden="true">{c.name.slice(0, 2).toUpperCase()}</span><Tier value={c.tier} /></div>
            <h3>{c.name}</h3>
            <span className="muted small">{c.industry} · {c.city}</span>
            <div className="client-stats">
              <span><b>{c.projects.open}</b> open</span><span><b>{c.projects.total}</b> total</span>
              <span className={c.projects.red ? 'tone-red' : ''}><b>{c.projects.red}</b> off track</span>
            </div>
            <div className="row-between tight small">
              <span>{money(c.contractValue)}</span>
              <span className="muted">{c.accountManager ? c.accountManager.name : 'No account manager'}</span>
            </div>
            {c.status !== 'active' && <span className="pill">{c.status}</span>}
          </Link>
        ))}
      </div>
      {adding && <ClientForm onClose={() => setAdding(false)} onSaved={(c) => { setAdding(false); toast(`${c.name} added`); navigate(`/clients/${c.slug}`); }} />}
    </div>
  );
}

export function ClientDetail() {
  const { slug } = useParams();
  const { isManager, isAdmin } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const { data, error, loading, reload, setData } = useApi(`/clients/${slug}`);
  const [editing, setEditing] = useState(false);
  const [newProject, setNewProject] = useState(false);
  const [contact, setContact] = useState(null);
  const c = data?.client;
  useDocumentTitle(c?.name || 'Client');
  if (loading && !data) return <Spinner />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const addContact = async (e) => {
    e.preventDefault();
    try { setData({ client: (await api(`/clients/${c.id}/contacts`, { method: 'POST', body: contact })).client }); setContact(null); toast('Contact added'); } catch (err) { toast(err.message, 'error'); }
  };
  const removeContact = async (ct) => {
    if (!window.confirm(`Remove ${ct.name}?`)) return;
    setData({ client: (await api(`/clients/${c.id}/contacts/${ct.id}`, { method: 'DELETE' })).client });
  };
  const remove = async () => {
    if (!window.confirm(`Delete ${c.name}?`)) return;
    try { await api(`/clients/${c.id}`, { method: 'DELETE' }); toast(`${c.name} deleted`); navigate('/clients'); } catch (err) { toast(err.message, 'error'); }
  };

  return (
    <div className="page">
      <nav className="crumbs"><Link to="/clients">Clients</Link><Icon name="chevronRight" size={14} /><span>{c.name}</span></nav>
      <PageHead
        title={<span className="row"><span className="client-logo lg" aria-hidden="true">{c.name.slice(0, 2).toUpperCase()}</span>{c.name}</span>}
        subtitle={`${c.industry} · ${[c.city, c.country].filter(Boolean).join(', ')} · client since ${fmtDate(c.createdAt)}`}
        actions={(
          <>
            {isManager && <button className="btn" onClick={() => setEditing(true)}><Icon name="edit" size={16} />Edit</button>}
            {isManager && <button className="btn btn-primary" onClick={() => setNewProject(true)}><Icon name="plus" size={16} />New project</button>}
            {isAdmin && c.projects.total === 0 && <button className="btn btn-danger-ghost" onClick={remove} aria-label="Delete client"><Icon name="trash" size={16} /></button>}
          </>
        )}
      />
      <section className="stats stats-tight">
        <div className="stat"><span className="stat-label">Tier</span><strong className="stat-value"><Tier value={c.tier} /></strong></div>
        <div className="stat"><span className="stat-label">Open projects</span><strong className="stat-value">{c.projects.open}</strong><span className="stat-hint">{c.projects.total} in total</span></div>
        <div className="stat"><span className="stat-label">Contract value</span><strong className="stat-value">{money(c.contractValue)}</strong></div>
        <div className="stat"><span className="stat-label">Account manager</span><strong className="stat-value small-value">{c.accountManager?.name || '—'}</strong>{c.lastActivity && <span className="stat-hint">last activity {timeAgo(c.lastActivity)}</span>}</div>
      </section>
      <div className="two-col">
        <section className="card">
          <h3>Projects</h3>
          {c.projectList.length === 0 ? <p className="muted">No projects yet.</p> : (
            <ul className="project-rows">
              {c.projectList.map((p) => (
                <li key={p.id}>
                  <Link to={`/projects/${p.id}`} className="project-row">
                    <Health value={p.health} compact />
                    <span className="grow"><b>{p.name}</b><small>{p.code} · {p.category} · owner {p.owner.name}</small></span>
                    <Status value={p.status} />
                    <span className="w-progress"><Progress value={p.progress} label={`${p.name} progress`} /></span>
                    <span className="muted small nowrap">{money(p.contractValue)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        <div className="stack">
          <section className="card">
            <div className="card-head"><h3>Contacts</h3>{isManager && <button className="btn btn-sm" onClick={() => setContact({ name: '', email: '', role: '', phone: '', isPrimary: false })}><Icon name="plus" size={14} />Add</button>}</div>
            <ul className="contacts">
              {c.contacts.map((ct) => (
                <li key={ct.id}>
                  <span className="row-between tight"><span className="row"><Avatar name={ct.name} size={26} /><b>{ct.name}</b>{ct.isPrimary && <span className="pill">Primary</span>}</span>
                    {isManager && <button className="icon-btn sm" onClick={() => removeContact(ct)} aria-label={`Remove ${ct.name}`}><Icon name="x" size={14} /></button>}</span>
                  <small>{ct.role}</small>
                  {ct.email && <a href={`mailto:${ct.email}`} className="link small row"><Icon name="mail" size={13} />{ct.email}</a>}
                  {ct.phone && <span className="small muted row"><Icon name="phone" size={13} />{ct.phone}</span>}
                </li>
              ))}
            </ul>
          </section>
          {c.notes && <section className="card"><h3>Notes</h3><p className="small">{c.notes}</p></section>}
          {c.website && <a className="link small row" href={c.website} target="_blank" rel="noreferrer"><Icon name="external" size={14} />{c.website}</a>}
        </div>
      </div>
      {editing && <ClientForm client={c} onClose={() => setEditing(false)} onSaved={(nc) => { setEditing(false); setData({ client: nc }); toast('Saved'); if (nc.slug !== slug) navigate(`/clients/${nc.slug}`); }} />}
      {newProject && <ProjectForm defaultClientId={c.id} onClose={() => setNewProject(false)} onSaved={(p) => navigate(`/projects/${p.id}`)} />}
      {contact && (
        <Modal title={`New contact at ${c.name}`} onClose={() => setContact(null)}>
          <form onSubmit={addContact} className="stack">
            <Field label="Name"><input required value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} /></Field>
            <div className="grid-2">
              <Field label="Role"><input value={contact.role} onChange={(e) => setContact({ ...contact, role: e.target.value })} placeholder="CTO" /></Field>
              <Field label="Phone"><input value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} /></Field>
            </div>
            <Field label="Email"><input type="email" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} /></Field>
            <label className="check"><input type="checkbox" checked={contact.isPrimary} onChange={(e) => setContact({ ...contact, isPrimary: e.target.checked })} />Primary contact</label>
            <div className="modal-actions"><button type="button" className="btn" onClick={() => setContact(null)}>Cancel</button><button className="btn btn-primary">Add contact</button></div>
          </form>
        </Modal>
      )}
    </div>
  );
}
