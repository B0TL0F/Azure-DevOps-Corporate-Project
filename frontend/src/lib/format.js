const TZ = 'Asia/Kolkata';

export function timeAgo(date) {
  const s = Math.round((Date.now() - new Date(date).getTime()) / 1000);
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} d ago`;
  return fmtDate(date);
}

/** Dates from the API are plain 'YYYY-MM-DD' strings; read them as calendar days, not instants. */
const asDay = (d) => (typeof d === 'string' && d.length === 10 ? new Date(`${d}T00:00:00Z`) : new Date(d));

export const fmtDate = (d) => asDay(d).toLocaleDateString('en-IN', { timeZone: d?.length === 10 ? 'UTC' : TZ, day: 'numeric', month: 'short', year: 'numeric' });
export const fmtShort = (d) => asDay(d).toLocaleDateString('en-IN', { timeZone: d?.length === 10 ? 'UTC' : TZ, day: 'numeric', month: 'short' });

export function todayIso() {
  const now = new Date(Date.now() + 5.5 * 36e5); // India date
  return now.toISOString().slice(0, 10);
}

/** Whole days from today (India) to a 'YYYY-MM-DD' date; negative when past. */
export function daysUntil(d) {
  return Math.round((asDay(d) - asDay(todayIso())) / 864e5);
}

export function dueLabel(d) {
  const n = daysUntil(d);
  if (n === 0) return 'Due today';
  if (n === 1) return 'Due tomorrow';
  if (n > 1) return `Due in ${n} days`;
  if (n === -1) return '1 day overdue';
  return `${-n} days overdue`;
}

/** ₹ in Indian notation, compacted to lakh / crore. */
export function money(n, { compact = true } = {}) {
  const v = Number(n || 0);
  if (compact && v >= 1e7) return `₹${(v / 1e7).toFixed(v >= 1e8 ? 0 : 2).replace(/\.?0+$/, '')} Cr`;
  if (compact && v >= 1e5) return `₹${(v / 1e5).toFixed(1).replace(/\.0$/, '')} L`;
  return `₹${v.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

export const hours = (h) => `${Number(h || 0).toLocaleString('en-IN', { maximumFractionDigits: 1 })} h`;

export function initials(name = '') {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');
}

export function plural(n, word, pluralWord = `${word}s`) {
  return `${n} ${n === 1 ? word : pluralWord}`;
}

export const STATUS_LABEL = { planning: 'Planning', active: 'Active', on_hold: 'On hold', completed: 'Completed', cancelled: 'Cancelled' };
export const HEALTH_LABEL = { green: 'On track', amber: 'At risk', red: 'Off track' };
export const PRIORITY_LABEL = { low: 'Low', medium: 'Medium', high: 'High', critical: 'Critical' };
export const ROLE_LABEL = { admin: 'Admin', manager: 'Project manager', member: 'Member', viewer: 'Viewer' };
export const TIER_LABEL = { strategic: 'Strategic', key: 'Key', standard: 'Standard' };
export const KIND_LABEL = { status: 'Status update', comment: 'Comment', risk: 'Risk', decision: 'Decision' };
export const DEPARTMENTS = ['Platform', 'DevSecOps', 'Cloud', 'SRE', 'MLOps', 'Delivery', 'Leadership'];
