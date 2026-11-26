import { cloneElement, isValidElement, useEffect, useId, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import Icon from './Icon';
import { initials, HEALTH_LABEL, STATUS_LABEL, PRIORITY_LABEL, TIER_LABEL } from '../lib/format';

export function Logo({ compact = false }) {
  return (
    <Link to="/" className="logo" aria-label="ShackPulse home">
      <span className="logo-mark" aria-hidden="true"><Icon name="pulse" size={18} stroke={2.4} /></span>
      {!compact && <span className="logo-text">Shack<b>Pulse</b></span>}
    </Link>
  );
}

export function Avatar({ name, size = 32 }) {
  const hue = useMemo(() => [...(name || '?')].reduce((a, c) => a + c.charCodeAt(0), 0) % 360, [name]);
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.38,
      background: `hsl(${hue} 70% 92%)`, color: `hsl(${hue} 55% 30%)` }} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

export function AvatarStack({ people, max = 4 }) {
  const shown = people.slice(0, max);
  return (
    <span className="avatar-stack" aria-label={`${people.length} people`}>
      {shown.map((p) => <span key={p.id} title={p.name}><Avatar name={p.name} size={26} /></span>)}
      {people.length > max && <span className="avatar more">+{people.length - max}</span>}
    </span>
  );
}

export function Spinner({ label = 'Loading' }) {
  return <div className="spinner-wrap" role="status"><span className="spinner" /><span className="sr-only">{label}</span></div>;
}

export function ErrorState({ error, onRetry }) {
  return (
    <div className="state state-error">
      <span className="state-icon"><Icon name="alert" size={24} /></span>
      <h3>That didn't load</h3>
      <p>{error?.message || 'The API did not respond.'}</p>
      {onRetry && <button className="btn" onClick={onRetry}>Try again</button>}
    </div>
  );
}

export function Empty({ icon = 'box', title, children, action }) {
  return (
    <div className="state">
      <span className="state-icon"><Icon name={icon} size={24} /></span>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function Health({ value, compact = false }) {
  return (
    <span className={`health health-${value}`} title={HEALTH_LABEL[value]}>
      <i aria-hidden="true" />{compact ? <span className="sr-only">{HEALTH_LABEL[value]}</span> : HEALTH_LABEL[value]}
    </span>
  );
}

export const Status = ({ value }) => <span className={`pill status-${value}`}>{STATUS_LABEL[value] || value}</span>;
export const Priority = ({ value }) => <span className={`prio prio-${value}`}><Icon name="flag" size={13} stroke={2} />{PRIORITY_LABEL[value]}</span>;
export const Tier = ({ value }) => <span className={`pill tier-${value}`}>{TIER_LABEL[value]}</span>;

export function Progress({ value, tone, label }) {
  const v = Math.max(0, Math.min(100, Math.round(value || 0)));
  return (
    <div className={`progress ${tone ? `progress-${tone}` : ''}`} role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100} aria-label={label || 'Progress'}>
      <span style={{ width: `${v}%` }} />
    </div>
  );
}

/** Budget burn: hours used vs budget. Over 90% turns amber, over 100% red. */
export function Burn({ used, budget }) {
  const pct = budget ? Math.round((used / budget) * 100) : 0;
  const tone = pct > 100 ? 'red' : pct > 90 ? 'amber' : 'ok';
  return (
    <div className="burn">
      <Progress value={pct} tone={tone} label="Budget used" />
      <span className={`burn-label tone-${tone}`}>{pct}%</span>
    </div>
  );
}

export function Stat({ label, value, hint, icon, tone, to }) {
  const body = (
    <>
      <span className="stat-top"><span className="stat-label">{label}</span>{icon && <Icon name={icon} size={16} />}</span>
      <strong className="stat-value">{value}</strong>
      {hint && <span className="stat-hint">{hint}</span>}
    </>
  );
  return to
    ? <Link to={to} className={`stat ${tone ? `stat-${tone}` : ''}`}>{body}</Link>
    : <div className={`stat ${tone ? `stat-${tone}` : ''}`}>{body}</div>;
}

export function Field({ label, hint, error, children }) {
  const id = useId();
  const control = isValidElement(children) ? cloneElement(children, { id: children.props.id || id }) : children;
  return (
    <div className={`field ${error ? 'has-error' : ''}`}>
      <label htmlFor={children?.props?.id || id}>{label}</label>
      {control}
      {hint && !error && <span className="hint">{hint}</span>}
      {error && <span className="error-text">{error}</span>}
    </div>
  );
}

export function Modal({ title, onClose, children, wide = false }) {
  const ref = useRef(null);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    ref.current?.querySelector('input, select, textarea, button')?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.key} role="tab" aria-selected={value === t.key} className={value === t.key ? 'tab on' : 'tab'} onClick={() => onChange(t.key)}>
          {t.label}{t.count !== undefined && <span className="tab-count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function PageHead({ title, subtitle, actions, crumb }) {
  return (
    <header className="page-head">
      <div>
        {crumb}
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}
