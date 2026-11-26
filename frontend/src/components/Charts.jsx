/* Small dependency-free SVG charts. */

/** Donut with a legend. segments: [{ key, label, value, color }] */
export function Donut({ segments, size = 148, label }) {
  const total = segments.reduce((a, s) => a + s.value, 0);
  const r = 52; const c = 2 * Math.PI * r;
  // Precompute each arc's start so rendering stays pure.
  const arcs = segments.filter((s) => s.value > 0).reduce((acc, s) => {
    const len = total ? (s.value / total) * c : 0;
    const start = acc.length ? acc[acc.length - 1].start + acc[acc.length - 1].len : 0;
    return [...acc, { ...s, len, start }];
  }, []);
  return (
    <div className="donut">
      <svg viewBox="0 0 140 140" width={size} height={size} role="img" aria-label={`${label}: ${segments.map((s) => `${s.label} ${s.value}`).join(', ')}`}>
        <circle cx="70" cy="70" r={r} fill="none" stroke="var(--line-soft)" strokeWidth="18" />
        {arcs.map((s) => (
          <circle key={s.key} cx="70" cy="70" r={r} fill="none" stroke={s.color} strokeWidth="18"
            strokeDasharray={`${s.len} ${c - s.len}`} strokeDashoffset={-s.start} transform="rotate(-90 70 70)" />
        ))}
        <text x="70" y="68" textAnchor="middle" className="donut-total">{total}</text>
        <text x="70" y="86" textAnchor="middle" className="donut-caption">{label}</text>
      </svg>
      <ul className="legend-list">
        {segments.map((s) => (
          <li key={s.key}><i style={{ background: s.color }} /><span>{s.label}</span><b>{s.value}</b></li>
        ))}
      </ul>
    </div>
  );
}

/** Vertical bars, e.g. hours per week. data: [{ week, hours }] */
export function Columns({ data, valueKey = 'hours', labelKey = 'week', height = 160, suffix = ' h' }) {
  const w = 560; const h = height; const pad = { l: 8, r: 8, t: 18, b: 22 };
  const max = Math.max(1, ...data.map((d) => d[valueKey]));
  const bw = (w - pad.l - pad.r) / data.length;
  return (
    <svg className="columns" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`${data.length} weeks of logged hours`}>
      {data.map((d, i) => {
        const bh = (d[valueKey] / max) * (h - pad.t - pad.b);
        const x = pad.l + i * bw + bw * 0.18;
        const y = h - pad.b - bh;
        const last = i === data.length - 1;
        return (
          <g key={d[labelKey]}>
            <rect x={x} y={y} width={bw * 0.64} height={Math.max(1, bh)} rx="4" className={last ? 'col col-now' : 'col'} />
            {d[valueKey] > 0 && <text x={x + bw * 0.32} y={y - 5} textAnchor="middle" className="col-value">{Math.round(d[valueKey])}</text>}
            <text x={x + bw * 0.32} y={h - 6} textAnchor="middle" className="axis">
              {new Date(`${d[labelKey]}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' })}
            </text>
            <title>{`Week of ${d[labelKey]}: ${d[valueKey]}${suffix}`}</title>
          </g>
        );
      })}
    </svg>
  );
}

/** Horizontal bars. rows: [{ label, value, tone }] */
export function HBars({ rows, max: fixedMax, suffix = '' }) {
  const max = fixedMax || Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="hbars">
      {rows.map((r) => (
        <li key={r.key || r.label}>
          <span className="hbar-label">{r.label}</span>
          <span className="hbar-track"><span className={`tone-bg-${r.tone || 'brand'}`} style={{ width: `${Math.min(100, (r.value / max) * 100)}%` }} /></span>
          <span className="hbar-value">{r.value}{suffix}</span>
        </li>
      ))}
    </ul>
  );
}
