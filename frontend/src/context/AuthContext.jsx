import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, getToken, setToken } from '../lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [stats, setStats] = useState(null);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    if (!getToken()) { setUser(null); setStats(null); setReady(true); return; }
    try {
      const data = await api('/auth/me');
      setUser(data.user); setStats(data.stats);
    } catch (err) {
      // Only a rejected token signs you out. A rate limit, timeout or rollout blip keeps the session.
      if (err.status === 401) { setUser(null); setStats(null); }
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    refresh();
    const onLogout = () => { setUser(null); setStats(null); };
    window.addEventListener('spulse:logout', onLogout);
    return () => window.removeEventListener('spulse:logout', onLogout);
  }, [refresh]);

  const signIn = useCallback(async (email, password) => {
    const data = await api('/auth/login', { method: 'POST', body: { email, password } });
    setToken(data.token);
    await refresh();
    return data.user;
  }, [refresh]);

  // Sign-up creates a pending account: no token until an admin approves it.
  const register = useCallback((payload) => api('/auth/register', { method: 'POST', body: payload }), []);

  const signOut = useCallback(() => { setToken(null); setUser(null); setStats(null); }, []);

  const value = useMemo(() => ({
    user, stats, ready, signIn, register, signOut, refresh,
    isAdmin: user?.role === 'admin',
    isManager: user?.role === 'admin' || user?.role === 'manager',
    canWrite: Boolean(user) && user.role !== 'viewer',
  }), [user, stats, ready, signIn, register, signOut, refresh]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
