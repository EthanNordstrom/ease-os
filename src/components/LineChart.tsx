import { useState } from 'react';
import type { SeriesPoint } from '../lib/domain';

/** Single-series line chart: 2px line, 8px markers, recessive grid, hover/focus tooltip. */
export default function LineChart({ data, unit, label, fmtX }: { data: SeriesPoint[]; unit: string; label: string; fmtX: (d: string) => string }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640, H = 220, L = 44, R = 16, T = 16, B = 28;
  if (!data.length) return null;
  const vals = data.map((d) => d.value);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (lo === hi) { lo = lo * 0.9; hi = hi * 1.1 || 1; }
  const pad = (hi - lo) * 0.15; lo = Math.max(0, lo - pad); hi = hi + pad;
  const x = (i: number) => L + (data.length === 1 ? (W - L - R) / 2 : (i / (data.length - 1)) * (W - L - R));
  const y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const ticks = [lo, (lo + hi) / 2, hi];
  const round = (v: number) => (Math.abs(v) >= 100 ? Math.round(v) : Math.round(v * 10) / 10);
  const h = hover !== null ? data[hover] : null;

  return (
    <figure className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={`${label}: ${data.map((d) => `${fmtX(d.date)} ${d.value} ${unit}`).join(', ')}`}
        onMouseLeave={() => setHover(null)}>
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="#26262A" strokeWidth={1} />
            <text x={L - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill="#8C8C86" fontFamily="JetBrains Mono, monospace">{round(t)}</text>
          </g>
        ))}
        <polyline fill="none" stroke="#B9DB6E" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" points={data.map((d, i) => `${x(i)},${y(d.value)}`).join(' ')} />
        {h && <line x1={x(hover!)} x2={x(hover!)} y1={T} y2={H - B} stroke="#4A4A52" strokeWidth={1} />}
        {data.map((d, i) => (
          <g key={i}>
            <circle cx={x(i)} cy={y(d.value)} r={hover === i ? 5 : 4} fill="#B9DB6E" stroke="#111113" strokeWidth={2} />
            <rect x={x(i) - 16} y={T} width={32} height={H - T - B} fill="transparent" tabIndex={0} aria-label={`${fmtX(d.date)}: ${d.value} ${unit}`}
              onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} />
          </g>
        ))}
        {[0, data.length - 1].filter((v, i, a) => a.indexOf(v) === i).map((i) => (
          <text key={i} x={x(i)} y={H - 8} textAnchor={data.length === 1 ? 'middle' : i === 0 ? 'start' : 'end'} fontSize={11} fill="#8C8C86" fontFamily="JetBrains Mono, monospace">{fmtX(data[i].date)}</text>
        ))}
      </svg>
      {h && (
        <div className="absolute pointer-events-none bg-ink-800 border border-ink-600 rounded px-2.5 py-1.5 text-sm -translate-x-1/2 -translate-y-full"
          style={{ left: `${(x(hover!) / W) * 100}%`, top: `${(y(h.value) / H) * 100}%`, marginTop: -10 }}>
          <span className="meta block">{fmtX(h.date)}</span>{h.value} {unit}
        </div>
      )}
    </figure>
  );
}
