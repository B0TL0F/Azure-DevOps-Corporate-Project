import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import Icon from './Icon';
import { Avatar, Logo, Health } from './ui';
import { useAuth } from '../context/AuthContext';
import { useApi } from '../lib/hooks';
import { api } from '../lib/api';
import { timeAgo, ROLE_LABEL } from '../lib/format';

const NAV = [
  { to: '/', label: 'Dashboard', icon: 'chart', end: true },
  { to: '/projects', label: 'Projects', icon: 'folder' },
  { to: '/clients', label: 'Clients', icon: 'building' },
  { to: '/people', label: 'People', icon: 'users' },
];

/** Shows which environment and build you are looking at — the point of a dev/prod pipeline demo. */
export function EnvBadge() {
  const { data } = useApi('/info');
  if (!data) return null;
  return (
    <Link to="/status" className={`env env-${data.environment}`} title={`Build ${data.buildId} · ${data.pod}`}>
      <i aria-hidden="true" />{data.environment} · v{data.version}{data.buildId !== 'local' ? ` · #${data.buildId}` : ''}
    </Link>
  );
}

function useClickAway(ref, onAway) {
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) onAway(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [ref, onAway]);
}

function Search() {
  const [q, setQ] = useState('');
  const [res, setRes] = useState(null);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();
  useClickAway(ref, () => setOpen(false));

  useEffect(() => {
    if (q.trim().length < 2) { setRes(null); return undefined; }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      api(`/search?q=${encodeURIComponent(q.trim())}`, { signal: ctrl.signal }).then(setRes).catch(() => {});
    }, 180);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [q]);

  const go = (to) => { setOpen(false); setQ(''); navigate(to); };
  const empty = res && !res.projects.length && !res.clients.length && !res.people.length;

  return (
    <div className="search" ref={ref}>
      <Icon name="search" size={16} />
      <input
        type="search" placeholder="Search projects, clients, people…" value={q} aria-label="Search"
        onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
        onKeyDown={(e) => { if (e.key === 'Enter' && q.trim()) go(`/projects?q=${encodeURIComponent(q.trim())}`); }}
      />
      {open && res && (
        <div className="search-pop" role="listbox">
          {empty && <p className="muted small pad">Nothing matches "{q}".</p>}
          {res.projects.length > 0 && <h4>Projects</h4>}
          {res.projects.map((p) => (
            <button key={`p${p.id}`} className="search-item" onClick={() => go(`/projects/${p.id}`)}>
              <Health value={p.health} compact /><span><b>{p.name}</b><small>{p.code} · {p.client}</small></span>
            </button>
          ))}
          {res.clients.length > 0 && <h4>Clients</h4>}
          {res.clients.map((c) => (
            <button key={`c${c.id}`} className="search-item" onClick={() => go(`/clients/${c.slug}`)}>
              <Icon name="building" size={16} /><span><b>{c.name}</b><small>{c.industry}</small></span>
            </button>
          ))}
          {res.people.length > 0 && <h4>People</h4>}
          {res.people.map((p) => (
            <button key={`u${p.id}`} className="search-item" onClick={() => go(`/people/${p.id}`)}>
              <Avatar name={p.name} size={22} /><span><b>{p.name}</b><small>{p.title}</small></span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Notifications() {
  const { stats, refresh } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();
  const { data, reload } = useApi(open ? '/notifications' : null);
  useClickAway(ref, () => setOpen(false));
  const unread = stats?.unread || 0;

  const openItem = async (n) => {
    if (!n.read) await api(`/notifications/${n.id}/read`, { method: 'POST' }).catch(() => {});
    setOpen(false); refresh();
    if (n.link) navigate(n.link);
  };
  const readAll = async () => { await api('/notifications/read-all', { method: 'POST' }); reload(); refresh(); };

  return (
    <div className="notif" ref={ref}>
      <button className="icon-btn" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`} onClick={() => setOpen((o) => !o)}>
        <Icon name="bell" />{unread > 0 && <span className="dot">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="notif-pop">
          <div className="row-between pad-x"><h4>Notifications</h4>{unread > 0 && <button className="link-btn" onClick={readAll}>Mark all read</button>}</div>
          {!data && <p className="muted small pad">Loading…</p>}
          {data?.notifications.length === 0 && <p className="muted small pad">You're all caught up.</p>}
          <ul>
            {data?.notifications.map((n) => (
              <li key={n.id}>
                <button className={n.read ? 'notif-item' : 'notif-item unread'} onClick={() => openItem(n)}>
                  <b>{n.title}</b>{n.body && <span>{n.body}</span>}<small>{timeAgo(n.createdAt)}</small>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function UserMenu() {
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();
  useClickAway(ref, () => setOpen(false));
  return (
    <div className="user-menu" ref={ref}>
      <button className="user-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <Avatar name={user.name} size={30} />
        <span className="user-meta"><b>{user.name}</b><small>{ROLE_LABEL[user.role]}</small></span>
      </button>
      {open && (
        <div className="menu-pop">
          <Link to={`/people/${user.id}`} onClick={() => setOpen(false)}><Icon name="users" size={16} />My profile</Link>
          <Link to="/settings" onClick={() => setOpen(false)}><Icon name="settings" size={16} />Settings</Link>
          <Link to="/status" onClick={() => setOpen(false)}><Icon name="server" size={16} />System status</Link>
          <button onClick={() => { signOut(); navigate('/login'); }}><Icon name="logout" size={16} />Sign out</button>
        </div>
      )}
    </div>
  );
}

export default function Layout() {
  const { user, isAdmin, stats } = useAuth();
  const [menu, setMenu] = useState(false);
  const location = useLocation();
  useEffect(() => setMenu(false), [location.pathname]);

  if (!user) {
    return (
      <div className="public">
        <a href="#main" className="skip">Skip to content</a>
        <main id="main"><Outlet /></main>
      </div>
    );
  }

  return (
    <div className={`shell ${menu ? 'menu-open' : ''}`}>
      <a href="#main" className="skip">Skip to content</a>
      <aside className="sidebar">
        <div className="sidebar-top"><Logo /></div>
        <nav aria-label="Main">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className="nav-item">
              <Icon name={n.icon} size={18} />{n.label}
            </NavLink>
          ))}
          <NavLink to="/projects?mine=true" className={() => (location.search.includes('mine=true') ? 'nav-item sub active' : 'nav-item sub')}>
            <Icon name="target" size={16} />My projects{stats?.my_projects ? <span className="nav-count">{stats.my_projects}</span> : null}
          </NavLink>
          {isAdmin && (
            <NavLink to="/admin" className="nav-item"><Icon name="shield" size={18} />Admin</NavLink>
          )}
        </nav>
        <div className="sidebar-foot">
          <EnvBadge />
          <p>Internal tool · DevOps Shack</p>
        </div>
      </aside>
      <div className="main-col">
        <header className="topbar">
          <button className="icon-btn burger" aria-label="Menu" onClick={() => setMenu((m) => !m)}><Icon name="menu" /></button>
          <Search />
          <div className="topbar-right">
            <Notifications />
            <UserMenu />
          </div>
        </header>
        <main id="main" className="content"><Outlet /></main>
      </div>
      {menu && <button className="scrim" aria-label="Close menu" onClick={() => setMenu(false)} />}
    </div>
  );
}
