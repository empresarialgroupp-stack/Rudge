// Gráficos leves em SVG/CSS (sem biblioteca): contador animado, sparkline,
// barras agrupadas com balão e medidor semicircular de tracinhos.
import { useEffect, useId, useRef, useState } from 'react';
import { cx } from './ui';

const reduceMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Número que "rola" até o novo valor quando muda. */
export function CountUp({ value, decimals = 0, duration = 700 }: { value: number; decimals?: number; duration?: number }) {
  const [shown, setShown] = useState(reduceMotion() ? value : 0);
  const from = useRef(shown);
  useEffect(() => {
    if (reduceMotion()) {
      setShown(value);
      return;
    }
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / duration);
      const e = 1 - Math.pow(1 - k, 3);
      const v = a + (value - a) * e;
      from.current = v;
      setShown(v);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return <>{shown.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}</>;
}

/** Caminho suave (Catmull-Rom → Bézier) pelos pontos. */
function smooth(points: [number, number][]) {
  if (points.length < 2) return '';
  let d = `M${points[0][0]},${points[0][1]}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0]},${p2[1].toFixed(1)}`;
  }
  return d;
}

export function Sparkline({ data, width = 96, height = 34 }: { data: number[]; width?: number; height?: number }) {
  const id = 'sp' + useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const max = Math.max(1, ...data);
  const pad = 3;
  const pts = data.map((v, i): [number, number] => [
    Math.round((i / Math.max(1, data.length - 1)) * width),
    pad + (height - pad * 2) * (1 - v / max),
  ]);
  const line = smooth(pts);
  return (
    <svg className="sparkline" width={width} height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="currentColor" stopOpacity="0.22" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L${width},${height} L0,${height} Z`} fill={`url(#${id})`} className="sp-area" />
      <path d={line} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" pathLength={1} vectorEffect="non-scaling-stroke" className="sp-line" />
    </svg>
  );
}

export interface BarSeries {
  name: string;
  values: number[];
  /** 'solid' (branco/preto) ou 'soft' (listrado) */
  tone: 'solid' | 'soft';
}

/** Barras agrupadas por período, com linhas de grade e balão ao passar o mouse/tocar. */
export function BarChart({ labels, series, current, height = 268 }: { labels: string[]; series: BarSeries[]; current?: number; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(4, ...series.flatMap((s) => s.values));
  const step = niceStep(max);
  const top = Math.ceil(max / step) * step;
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => top - i * step);
  const active = hover ?? current ?? null;
  return (
    <div className="barchart" style={{ height }} onMouseLeave={() => setHover(null)}>
      <div className="bc-axis">
        {ticks.map((t) => (
          <span key={t}>{t}</span>
        ))}
      </div>
      <div className="bc-plot">
        <div className="bc-grid">
          {ticks.map((t) => (
            <i key={t} />
          ))}
        </div>
        <div className="bc-cols">
          {labels.map((label, i) => (
            <div
              key={label + i}
              className={cx('bc-col', i === active && 'on', i === current && 'now')}
              onMouseEnter={() => setHover(i)}
              onClick={() => setHover(i)}
            >
              <div className="bc-bars">
                {series.map((s, k) => (
                  <i
                    key={s.name}
                    className={cx('bc-bar', s.tone)}
                    style={{ height: `${(s.values[i] / top) * 100}%`, animationDelay: `${i * 40 + k * 70}ms` }}
                  />
                ))}
              </div>
              <span className="bc-label">{label}</span>
              {i === hover && (
                <div className={cx('bc-tip glass strong', i > labels.length / 2 && 'left')}>
                  <b>{label}</b>
                  {series.map((s) => (
                    <div key={s.name} className="row-tip">
                      <span className={cx('dot', s.tone)} />
                      {s.name}
                      <span className="v">{s.values[i]}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function niceStep(max: number) {
  const raw = max / 4;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  for (const m of [1, 2, 2.5, 5, 10]) if (raw <= m * pow) return Math.max(1, m * pow);
  return Math.max(1, 10 * pow);
}

/** Medidor semicircular feito de tracinhos que acendem em sequência. */
export function Gauge({ value, ticks = 64, size = 280 }: { value: number; ticks?: number; size?: number }) {
  const v = Math.max(0, Math.min(1, value));
  const [lit, setLit] = useState(reduceMotion() ? v : 0);
  useEffect(() => {
    const t = setTimeout(() => setLit(v), 60);
    return () => clearTimeout(t);
  }, [v]);
  const cx0 = size / 2;
  const cy0 = size / 2;
  const rOut = size / 2 - 4;
  const rIn = rOut * 0.66;
  const on = Math.round(lit * ticks);
  return (
    <svg className="gauge" width="100%" viewBox={`0 0 ${size} ${size / 2 + 6}`} aria-hidden="true">
      {Array.from({ length: ticks }, (_, i) => {
        const a = Math.PI - (i / (ticks - 1)) * Math.PI;
        const cos = Math.cos(a);
        const sin = Math.sin(a);
        const lenOut = i % 4 === 0 ? rOut : rOut - 6;
        return (
          <line
            key={i}
            x1={cx0 + rIn * cos}
            y1={cy0 - rIn * sin}
            x2={cx0 + lenOut * cos}
            y2={cy0 - lenOut * sin}
            className={cx('g-tick', i < on && 'on')}
            style={{ transitionDelay: `${i * 12}ms`, opacity: i < on ? 0.45 + 0.55 * (i / Math.max(1, on)) : undefined }}
          />
        );
      })}
    </svg>
  );
}
