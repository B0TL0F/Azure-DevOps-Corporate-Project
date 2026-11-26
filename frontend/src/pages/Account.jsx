import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useApi, useDocumentTitle } from '../lib/hooks';
import { api } from '../lib/api';
import { Empty, Field, PageHead, Spinner } from '../components/ui';
import { ROLE_LABEL } from '../lib/format';

export function Settings() {
  useDocumentTitle('Settings');
  const { user, refresh } = useAuth();
  const toast = useToast();
  const [profile, setProfile] = useState({ name: user.name, title: user.title || '', location: user.location || '', phone: user.phone || '' });
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });

  const saveProfile = async (e) => {
    e.preventDefault();
    try { await api('/auth/me', { method: 'PATCH', body: { name: profile.name, title: profile.title || null, location: profile.location || null, phone: profile.phone || null } }); await refresh(); toast('Profile saved'); } catch (err) { toast(err.message, 'error'); }
  };
  const savePw = async (e) => {
    e.preventDefault();
    try { await api('/auth/change-password', { method: 'POST', body: pw }); setPw({ currentPassword: '', newPassword: '' }); toast('Password changed'); } catch (err) { toast(err.message, 'error'); }
  };

  return (
    <div className="page narrow">
      <PageHead title="Settings" subtitle={`${user.email} · ${ROLE_LABEL[user.role]}${user.department ? ` · ${user.department}` : ''}`} />
      <div className="two-col even">
        <form className="card stack" onSubmit={saveProfile}>
          <h3>Profile</h3>
          <Field label="Name"><input required minLength={2} value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} /></Field>
          <Field label="Job title"><input value={profile.title} onChange={(e) => setProfile({ ...profile, title: e.target.value })} /></Field>
          <Field label="Location"><input value={profile.location} onChange={(e) => setProfile({ ...profile, location: e.target.value })} /></Field>
          <Field label="Phone"><input value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} /></Field>
          <button className="btn btn-primary">Save profile</button>
        </form>
        <form className="card stack" onSubmit={savePw}>
          <h3>Password</h3>
          <Field label="Current password"><input type="password" required autoComplete="current-password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} /></Field>
          <Field label="New password" hint="At least 8 characters, with a letter and a number"><input type="password" required minLength={8} autoComplete="new-password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} /></Field>
          <button className="btn btn-primary">Change password</button>
        </form>
      </div>
    </div>
  );
}

/** Which build, pod and database am I talking to? Handy right after a pipeline run. */
export function Status() {
  useDocumentTitle('System status');
  const { data, error } = useApi('/info');
  const rows = data ? [
    ['Environment', data.environment], ['Version', data.version], ['Build', data.buildId], ['Commit', data.commit],
    ['Served by pod', data.pod], ['Namespace', data.namespace || '—'], ['Database', data.database], ['Node.js', data.node],
    ['Pod started', new Date(data.startedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })], ['Uptime', `${Math.floor(data.uptimeSeconds / 60)} min`],
  ] : [];
  return (
    <div className="page narrow">
      <PageHead title="System status" subtitle="The build and environment behind this page. Refresh a few times to see requests land on different pods." />
      {error && <p className="form-error">API unreachable: {error.message}</p>}
      {!data && !error && <Spinner />}
      {data && (
        <div className="card">
          <p className={`status-banner ${data.database.startsWith('PostgreSQL') ? 'ok' : 'bad'}`}>
            {data.database.startsWith('PostgreSQL') ? 'All systems operational' : 'Database unreachable'}
          </p>
          <ul className="kv">{rows.map(([k, v]) => <li key={k}><span>{k}</span><b><code>{v}</code></b></li>)}</ul>
        </div>
      )}
    </div>
  );
}

export function NotFound() {
  useDocumentTitle('Not found');
  return <div className="page"><Empty icon="search" title="Page not found" action={<Link to="/" className="btn">Go to the dashboard</Link>}>That page doesn't exist, or it moved.</Empty></div>;
}
