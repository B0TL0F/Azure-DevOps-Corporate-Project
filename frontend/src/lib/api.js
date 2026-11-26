const TOKEN_KEY = 'spulse_token';

export function getToken() {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch { /* storage unavailable */ }
}

export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export async function api(path, { method = 'GET', body, signal } = {}) {
  const headers = { Accept: 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(path.startsWith('/api') ? path : `/api${path}`, {
    method, headers, signal, body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  let data = null;
  try { data = await res.json(); } catch (err) { if (err.name === 'AbortError') throw err; /* non-JSON body */ }
  if (!res.ok) {
    if (res.status === 401 && token) {
      setToken(null);
      window.dispatchEvent(new Event('spulse:logout'));
    }
    const msg = data?.details?.length
      ? data.details.map((d) => (d.path ? `${d.path}: ${d.message}` : d.message)).join(' · ')
      : data?.error || `Request failed (${res.status})`;
    throw new ApiError(res.status, msg, data?.details);
  }
  return data;
}
