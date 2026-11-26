import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useApi, useDocumentTitle } from '../lib/hooks';
import { Field, Logo } from '../components/ui';
import Icon from '../components/Icon';
import { DEPARTMENTS } from '../lib/format';

const DEMO = [
  ['admin@devopsshack.com', 'Admin', 'Approvals, roles, everything'],
  ['rohan.mehta@devopsshack.com', 'Project manager', 'Owns Core Banking AKS Migration'],
  ['arjun.reddy@devopsshack.com', 'Member', 'Senior DevOps Engineer on 3 projects'],
  ['divya.krishnan@devopsshack.com', 'Viewer', 'Finance, read-only'],
];

function Brand() {
  return (
    <div className="auth-brand">
      <Logo />
      <h2>Every project. Every client. One pulse.</h2>
      <p>ShackPulse is how DevOps Shack tracks what we are delivering, for whom, who owns it, and whether it is on track.</p>
      <ul>
        <li><Icon name="target" size={18} />Health, milestones and budget burn for every engagement</li>
        <li><Icon name="building" size={18} />Clients, contacts and the projects we run for them</li>
        <li><Icon name="users" size={18} />Who is on what, and who is overbooked</li>
      </ul>
    </div>
  );
}

export function Login() {
  useDocumentTitle('Sign in');
  const { user, signIn } = useAuth();
  const { data: info } = useApi('/info');
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  if (user) return <Navigate to={location.state?.from || '/'} replace />;

  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError(null);
    try { await signIn(form.email, form.password); navigate(location.state?.from || '/', { replace: true }); } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  return (
    <div className="auth">
      <Brand />
      <div className="auth-card">
        <h1>Sign in</h1>
        <p className="muted">Use your DevOps Shack account.</p>
        <form onSubmit={submit} className="stack">
          <Field label="Work email"><input type="email" autoComplete="username" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="Password"><input type="password" autoComplete="current-password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        </form>
        <p className="small muted center">New here? <Link to="/register" className="link">Request access</Link></p>
        {info?.demoLogins && (
          <div className="demo">
            <h4>Demo accounts <span className="muted">· password Demo@1234 (admin uses its own)</span></h4>
            {DEMO.map(([email, role, what]) => (
              <button key={email} type="button" className="demo-item" onClick={() => setForm({ email, password: email.startsWith('admin') ? '' : 'Demo@1234' })}>
                <b>{role}</b><span>{email}</span><small>{what}</small>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function Register() {
  useDocumentTitle('Request access');
  const { user, register } = useAuth();
  const [form, setForm] = useState({ name: '', email: '', password: '', title: '', department: '' });
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null);
  const [busy, setBusy] = useState(false);
  if (user) return <Navigate to="/" replace />;
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError(null);
    const body = { name: form.name, email: form.email, password: form.password };
    if (form.title) body.title = form.title;
    if (form.department) body.department = form.department;
    try { setDone(await register(body)); } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  return (
    <div className="auth">
      <Brand />
      <div className="auth-card">
        {done ? (
          <div className="state">
            <span className="state-icon ok"><Icon name="check" size={24} /></span>
            <h2>Request sent</h2>
            <p>{done.message}</p>
            <p className="muted small">We'll show a welcome note when you sign in after approval.</p>
            <Link to="/login" className="btn btn-primary">Back to sign in</Link>
          </div>
        ) : (
          <>
            <h1>Request access</h1>
            <p className="muted">Sign up with your company email. An admin approves new accounts.</p>
            <form onSubmit={submit} className="stack">
              <Field label="Full name"><input required minLength={2} value={form.name} onChange={set('name')} autoComplete="name" /></Field>
              <Field label="Work email" hint="Must be your @devopsshack.com address"><input type="email" required value={form.email} onChange={set('email')} autoComplete="email" /></Field>
              <div className="grid-2">
                <Field label="Job title"><input value={form.title} onChange={set('title')} placeholder="DevOps Engineer" /></Field>
                <Field label="Department">
                  <select value={form.department} onChange={set('department')}>
                    <option value="">Choose…</option>
                    {DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="Password" hint="At least 8 characters, with a letter and a number"><input type="password" required minLength={8} value={form.password} onChange={set('password')} autoComplete="new-password" /></Field>
              {error && <p className="form-error" role="alert">{error}</p>}
              <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Sending…' : 'Request access'}</button>
            </form>
            <p className="small muted center">Already approved? <Link to="/login" className="link">Sign in</Link></p>
          </>
        )}
      </div>
    </div>
  );
}
