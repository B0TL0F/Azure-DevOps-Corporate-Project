import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useApi } from '../lib/hooks';
import { api } from '../lib/api';
import { Field, Modal } from '../components/ui';
import { STATUS_LABEL, HEALTH_LABEL, PRIORITY_LABEL, todayIso } from '../lib/format';

const CATEGORIES = ['Cloud Migration', 'Kubernetes Platform', 'CI/CD', 'DevSecOps', 'Observability', 'MLOps', 'Cost Optimization', 'Infrastructure as Code'];

function plusDays(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
}

/** Create (no project) or edit (project given). Calls onSaved(project). */
export default function ProjectForm({ project, defaultClientId, onClose, onSaved }) {
  const { user, isAdmin } = useAuth();
  const { data: clients } = useApi('/clients');
  const { data: owners } = useApi(isAdmin ? '/people?owners=true' : null);
  const editing = Boolean(project);
  const [f, setF] = useState(() => (editing ? {
    name: project.name, clientId: String(project.client.id), ownerId: String(project.owner.id), summary: project.summary || '',
    description: project.description || '', category: project.category, status: project.status, health: project.health,
    priority: project.priority, techStack: project.techStack.join(', '), startDate: project.startDate, dueDate: project.dueDate,
    budgetHours: String(project.budgetHours), contractValue: String(project.contractValue), repoUrl: project.repoUrl || '',
  } : {
    name: '', clientId: defaultClientId ? String(defaultClientId) : '', ownerId: String(user.id), summary: '', description: '',
    category: CATEGORIES[0], status: 'planning', health: 'green', priority: 'medium', techStack: '',
    startDate: todayIso(), dueDate: plusDays(todayIso(), 90), budgetHours: '400', contractValue: '1000000', repoUrl: '',
  }));
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError(null);
    const body = {
      name: f.name, clientId: Number(f.clientId), summary: f.summary || null, description: f.description || null,
      category: f.category, status: f.status, health: f.health, priority: f.priority,
      techStack: f.techStack.split(',').map((s) => s.trim()).filter(Boolean), startDate: f.startDate, dueDate: f.dueDate,
      budgetHours: Number(f.budgetHours || 0), contractValue: Number(f.contractValue || 0), repoUrl: f.repoUrl || '',
    };
    if (isAdmin) body.ownerId = Number(f.ownerId);
    else if (!editing) body.ownerId = user.id;
    try {
      const res = await api(editing ? `/projects/${project.id}` : '/projects', { method: editing ? 'PATCH' : 'POST', body });
      onSaved(res.project);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  return (
    <Modal title={editing ? `Edit ${project.code}` : 'New project'} onClose={onClose} wide>
      <form onSubmit={submit} className="stack">
        <Field label="Project name"><input required minLength={3} value={f.name} onChange={set('name')} placeholder="e.g. Payments Platform on AKS" /></Field>
        <div className="grid-2">
          <Field label="Client">
            <select required value={f.clientId} onChange={set('clientId')}>
              <option value="">Choose a client…</option>
              {clients?.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          {isAdmin ? (
            <Field label="Owner">
              <select required value={f.ownerId} onChange={set('ownerId')}>
                {owners?.people.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.title}</option>)}
              </select>
            </Field>
          ) : (
            <Field label="Owner" hint="Project managers own the projects they create"><input value={editing ? project.owner.name : user.name} disabled /></Field>
          )}
        </div>
        <Field label="One-line summary"><input maxLength={200} value={f.summary} onChange={set('summary')} placeholder="What does done look like?" /></Field>
        <div className="grid-4">
          <Field label="Category"><select value={f.category} onChange={set('category')}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
          <Field label="Status"><select value={f.status} onChange={set('status')}>{Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
          <Field label="Health"><select value={f.health} onChange={set('health')}>{Object.entries(HEALTH_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
          <Field label="Priority"><select value={f.priority} onChange={set('priority')}>{Object.entries(PRIORITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        </div>
        <div className="grid-4">
          <Field label="Start date"><input type="date" required value={f.startDate} onChange={set('startDate')} /></Field>
          <Field label="Due date"><input type="date" required min={f.startDate} value={f.dueDate} onChange={set('dueDate')} /></Field>
          <Field label="Budget (hours)"><input type="number" min={0} value={f.budgetHours} onChange={set('budgetHours')} /></Field>
          <Field label="Contract value (₹)"><input type="number" min={0} step={1000} value={f.contractValue} onChange={set('contractValue')} /></Field>
        </div>
        <Field label="Tech stack" hint="Comma-separated, e.g. AKS, Terraform, Argo CD"><input value={f.techStack} onChange={set('techStack')} /></Field>
        <Field label="Repository URL"><input type="url" value={f.repoUrl} onChange={set('repoUrl')} placeholder="https://dev.azure.com/…" /></Field>
        <Field label="Description" hint="Plain text. Use blank lines between paragraphs."><textarea rows={5} value={f.description} onChange={set('description')} /></Field>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Create project'}</button>
        </div>
      </form>
    </Modal>
  );
}
