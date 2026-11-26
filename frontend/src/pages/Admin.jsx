import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useApi, useDocumentTitle } from '../lib/hooks';
import { api } from '../lib/api';
import { Avatar, Empty, Modal, PageHead, Spinner, Tabs } from '../components/ui';
import Icon from '../components/Icon';
import { ROLE_LABEL, timeAgo, fmtDate } from '../lib/format';

function Approvals({ onDone }) {
  const toast = useToast();
  const { data, reload } = useApi('/admin/users?status=pending');
  const [roles, setRoles] = useState({});
  const decide = async (u, status) => {
    try {
      await api(`/admin/users/${u.id}`, { method: 'PATCH', body: status === 'active' ? { status, role: roles[u.id] || 'member' } : { status } });
      toast(status === 'active' ? `${u.name} approved` : `${u.name} rejected`); reload(); onDone();
    } catch (err) { toast(err.message, 'error'); }
  };
  if (!data) return <Spinner />;
  if (data.users.length === 0) return <Empty icon="check" title="No pending requests">New sign-ups will show up here for approval.</Empty>;
  return (
    <ul className="approvals">
      {data.users.map((u) => (
        <li key={u.id} className="card">
          <div className="person-row"><Avatar name={u.name} size={40} /><span><b>{u.name}</b><small>{u.email}</small><small>{[u.title, u.department].filter(Boolean).join(' · ')} · requested {timeAgo(u.createdAt)}</small></span></div>
          <div className="row">
            <select aria-label={`Role for ${u.name}`} value={roles[u.id] || 'member'} onChange={(e) => setRoles({ ...roles, [u.id]: e.target.value })}>
              {Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <button className="btn btn-primary" onClick={() => decide(u, 'active')}><Icon name="check" size={16} />Approve</button>
            <button className="btn" onClick={() => decide(u, 'rejected')}>Reject</button>
          </div>
        </li>
      ))}
    </ul>
  );
}

function Users() {
  const { user: me } = useAuth();
  const toast = useToast();
  const [q, setQ] = useState('');
  const { data, reload } = useApi(`/admin/users${q ? `?q=${encodeURIComponent(q)}` : ''}`);
  const [temp, setTemp] = useState(null);
  const patch = async (u, body) => {
    try { await api(`/admin/users/${u.id}`, { method: 'PATCH', body }); toast(`${u.name} updated`); reload(); } catch (err) { toast(err.message, 'error'); }
  };
  const reset = async (u) => {
    if (!window.confirm(`Reset the password for ${u.name}? Their current password stops working.`)) return;
    try { const r = await api(`/admin/users/${u.id}/reset-password`, { method: 'POST' }); setTemp({ name: u.name, password: r.temporaryPassword }); } catch (err) { toast(err.message, 'error'); }
  };
  return (
    <>
      <div className="filters"><div className="search-inline"><Icon name="search" size={16} /><input type="search" placeholder="Name or email…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter users" /></div>
        {data && <span className="muted small">{Object.entries(data.counts).map(([k, v]) => `${v} ${k}`).join(' · ')}</span>}</div>
      {!data ? <Spinner /> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Person</th><th>Role</th><th>Status</th><th>Last sign-in</th><th /></tr></thead>
            <tbody>
              {data.users.map((u) => (
                <tr key={u.id}>
                  <td><span className="person-row"><Avatar name={u.name} size={30} /><span><b>{u.name}</b><small>{u.email}</small></span></span></td>
                  <td>
                    <select aria-label={`Role for ${u.name}`} value={u.role} disabled={u.id === me.id} onChange={(e) => patch(u, { role: e.target.value })}>
                      {Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </td>
                  <td><span className={`pill user-${u.status}`}>{u.status}</span></td>
                  <td className="muted small">{u.lastLoginAt ? timeAgo(u.lastLoginAt) : 'never'}</td>
                  <td className="row nowrap">
                    {u.id !== me.id && u.status === 'active' && <button className="btn btn-sm" onClick={() => patch(u, { status: 'disabled' })}>Disable</button>}
                    {u.id !== me.id && ['disabled', 'rejected'].includes(u.status) && <button className="btn btn-sm" onClick={() => patch(u, { status: 'active' })}>Enable</button>}
                    <button className="btn btn-sm" onClick={() => reset(u)}><Icon name="key" size={14} />Reset password</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {temp && (
        <Modal title="Temporary password" onClose={() => setTemp(null)}>
          <p>Share this with <b>{temp.name}</b> privately. It is shown only once; ask them to change it after signing in.</p>
          <p className="temp-pass"><code>{temp.password}</code></p>
          <div className="modal-actions"><button className="btn" onClick={() => navigator.clipboard?.writeText(temp.password)}>Copy</button><button className="btn btn-primary" onClick={() => setTemp(null)}>Done</button></div>
        </Modal>
      )}
    </>
  );
}

function Audit() {
  const [action, setAction] = useState('');
  const { data } = useApi(`/admin/activity${action ? `?action=${action}` : ''}`);
  return (
    <>
      <div className="row filters">
        {[['', 'Everything'], ['project', 'Projects'], ['milestone', 'Milestones'], ['update', 'Updates'], ['client', 'Clients'], ['user', 'Users']].map(([k, label]) => (
          <button key={k || 'all'} className={`chip ${action === k ? 'on' : ''}`} onClick={() => setAction(k)}>{label}</button>
        ))}
      </div>
      {!data ? <Spinner /> : (
        <div className="table-wrap">
          <table className="table compact">
            <thead><tr><th>When</th><th>Who</th><th>Action</th><th>What happened</th></tr></thead>
            <tbody>{data.activity.map((a) => <tr key={a.id}><td className="nowrap muted">{fmtDate(a.createdAt)}</td><td>{a.actor || 'System'}</td><td><code>{a.action}</code></td><td>{a.summary}</td></tr>)}</tbody>
          </table>
        </div>
      )}
    </>
  );
}

export default function Admin() {
  useDocumentTitle('Admin');
  const { refresh } = useAuth();
  const { data: counts, reload } = useApi('/admin/users?status=pending');
  const [tab, setTab] = useState('approvals');
  return (
    <div className="page">
      <PageHead title="Admin" subtitle="Approve access requests, manage roles and see the audit trail." />
      <Tabs value={tab} onChange={setTab} tabs={[
        { key: 'approvals', label: 'Access requests', count: counts?.users.length },
        { key: 'users', label: 'Users' },
        { key: 'audit', label: 'Audit log' },
      ]} />
      {tab === 'approvals' && <Approvals onDone={() => { reload(); refresh(); }} />}
      {tab === 'users' && <Users />}
      {tab === 'audit' && <Audit />}
    </div>
  );
}
