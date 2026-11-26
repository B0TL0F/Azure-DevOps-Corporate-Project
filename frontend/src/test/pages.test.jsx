import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { vi } from 'vitest';
import { AuthProvider } from '../context/AuthContext';
import { ToastProvider } from '../context/ToastContext';
import { Login, Register } from '../pages/Auth';
import Projects from '../pages/Projects';
import { setToken } from '../lib/api';

const USER = { id: 2, name: 'Rohan Mehta', email: 'rohan.mehta@devopsshack.com', role: 'manager', status: 'active' };
const PROJECT = {
  id: 1, code: 'PRJ-1001', name: 'Core Banking AKS Migration', category: 'Cloud Migration', status: 'active', health: 'amber', priority: 'critical',
  techStack: ['AKS'], startDate: '2026-08-01', dueDate: '2027-01-09', budgetHours: 2400, hoursUsed: 496, contractValue: 9800000, burnPct: 21,
  milestones: { total: 5, done: 3 }, progress: 60, teamSize: 5, overdue: false,
  client: { id: 1, name: 'Kestrel Bank', slug: 'kestrel-bank', tier: 'strategic' }, owner: { id: 2, name: 'Rohan Mehta' },
};

function mockApi(routes) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, opts = {}) => {
    const path = String(url).replace(/^\/api/, '');
    const key = Object.keys(routes).find((k) => path.startsWith(k.split(' ').pop()) && (!k.includes(' ') || k.startsWith(opts.method || 'GET')));
    const [status, body] = key ? routes[key] : [404, { error: 'not mocked' }];
    return { ok: status < 400, status, json: async () => (typeof body === 'function' ? body(opts) : body) };
  });
}

const wrap = (ui, path = '/') => render(
  <MemoryRouter initialEntries={[path]}>
    <ToastProvider><AuthProvider>
      <Routes><Route path="/" element={<p>dashboard</p>} /><Route path="/login" element={ui} /><Route path="/register" element={ui} /><Route path="/projects" element={ui} /></Routes>
    </AuthProvider></ToastProvider>
  </MemoryRouter>,
);

describe('sign in', () => {
  test('shows demo accounts when the API allows demo logins, and fills the form', async () => {
    mockApi({ '/info': [200, { environment: 'dev', demoLogins: true }] });
    wrap(<Login />, '/login');
    const item = await screen.findByRole('button', { name: /Project manager/ });
    await userEvent.click(item);
    expect(screen.getByLabelText('Work email')).toHaveValue('rohan.mehta@devopsshack.com');
    expect(screen.getByLabelText('Password')).toHaveValue('Demo@1234');
  });

  test('hides demo accounts in prod', async () => {
    mockApi({ '/info': [200, { environment: 'prod', demoLogins: false }] });
    wrap(<Login />, '/login');
    await screen.findByRole('heading', { name: 'Sign in' });
    await waitFor(() => expect(screen.queryByText(/Demo accounts/)).not.toBeInTheDocument());
  });

  test('shows the pending-approval message from the API', async () => {
    mockApi({ '/info': [200, { demoLogins: false }], 'POST /auth/login': [403, { error: 'Your account is waiting for admin approval' }] });
    wrap(<Login />, '/login');
    await userEvent.type(screen.getByLabelText('Work email'), 'new@devopsshack.com');
    await userEvent.type(screen.getByLabelText('Password'), 'Passw0rd!');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('waiting for admin approval');
  });

  test('a successful sign-in goes to the dashboard', async () => {
    mockApi({ '/info': [200, {}], 'POST /auth/login': [200, { token: 't', user: USER }], '/auth/me': [200, { user: USER, stats: { unread: 0 } }] });
    wrap(<Login />, '/login');
    await userEvent.type(screen.getByLabelText('Work email'), USER.email);
    await userEvent.type(screen.getByLabelText('Password'), 'Demo@1234');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('dashboard')).toBeInTheDocument();
  });
});

describe('request access', () => {
  test('confirms the request is pending', async () => {
    mockApi({ 'POST /auth/register': [201, { pending: true, message: 'Request sent. An admin will approve your account shortly.' }] });
    wrap(<Register />, '/register');
    await userEvent.type(screen.getByLabelText('Full name'), 'New Joiner');
    await userEvent.type(screen.getByLabelText('Work email'), 'new.joiner@devopsshack.com');
    await userEvent.type(screen.getByLabelText('Password'), 'Passw0rd!');
    await userEvent.click(screen.getByRole('button', { name: 'Request access' }));
    expect(await screen.findByRole('heading', { name: 'Request sent' })).toBeInTheDocument();
  });
});

describe('projects list', () => {
  test('renders projects and lets a manager start a new one', async () => {
    setToken('t');
    mockApi({
      '/auth/me': [200, { user: USER, stats: {} }],
      '/projects': [200, { projects: [PROJECT], total: 1, page: 1, pageSize: 100 }],
      '/clients': [200, { clients: [{ id: 1, name: 'Kestrel Bank' }] }],
      '/people': [200, { people: [USER] }],
    });
    wrap(<Projects />, '/projects');
    expect(await screen.findByText('Core Banking AKS Migration')).toBeInTheDocument();
    expect(screen.getByText(/1 project/)).toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: /New project/ }));
    expect(await screen.findByRole('dialog', { name: 'New project' })).toBeInTheDocument();
  });

  test('board view groups by status', async () => {
    setToken('t');
    mockApi({
      '/auth/me': [200, { user: { ...USER, role: 'viewer' }, stats: {} }],
      '/projects': [200, { projects: [PROJECT, { ...PROJECT, id: 2, code: 'PRJ-1008', name: 'Lakehouse', status: 'planning' }], total: 2 }],
      '/clients': [200, { clients: [] }], '/people': [200, { people: [] }],
    });
    wrap(<Projects />, '/projects');
    await userEvent.click(await screen.findByRole('button', { name: 'Board view' }));
    expect(screen.getByRole('heading', { name: /Planning/ })).toHaveTextContent('1');
    expect(screen.queryByRole('button', { name: /New project/ })).not.toBeInTheDocument();
  });
});
