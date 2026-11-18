import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useReducedMotion } from 'motion/react';

// Ilustração de fluxo de dados (inspirada na descrição do "Data flow" da uiarc,
// que é Arc Pro): fontes à esquerda, o Rudge no meio, destinos à direita.
// Registros saem como bolinhas vazadas, viram quadrados sólidos ao passar pelo
// núcleo e se espalham para os destinos. Tudo é um loop de rAF que escreve
// direto no SVG; o React não renderiza por quadro.

export interface FlowNode {
  label: string;
  meta?: string;
  detail?: string;
  icon?: ReactNode;
  /** 0 a 1: fração dos registros que chega a este destino. */
  share?: number;
}

interface DataFlowProps {
  sources: FlowNode[];
  destinations: FlowNode[];
  core?: { label?: string; detail?: string; countLabel?: string; countStart?: number; icon?: ReactNode };
  speed?: number;
  label?: string;
  caption?: ReactNode;
  className?: string;
}

const CYCLE = 6.6; // segundos
const PER_CYCLE = 6;
const LEG_IN = 1.7;
const MORPH = 0.45;
const LEG_OUT = 1.7;
const TRAIL = 0.12; // fração do caminho

type P = { x: number; y: number };
type Curve = [P, P, P, P];

const bez = (c: Curve, t: number): P => {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const d = 3 * u * t * t;
  const e = t * t * t;
  return { x: a * c[0].x + b * c[1].x + d * c[2].x + e * c[3].x, y: a * c[0].y + b * c[1].y + d * c[2].y + e * c[3].y };
};
const ease = (p: number) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);
const curvePath = (c: Curve) =>
  `M ${c[0].x} ${c[0].y} C ${c[1].x} ${c[1].y} ${c[2].x} ${c[2].y} ${c[3].x} ${c[3].y}`;

// recebe o destino d o registro k? (share espalha de forma uniforme)
const takes = (share: number | undefined, k: number) => {
  if (share === undefined || share >= 1) return true;
  return Math.floor((k + 1) * share) > Math.floor(k * share);
};

interface Layout {
  w: number;
  h: number;
  vertical: boolean;
  core: P;
  coreR: number;
  src: { box: { x: number; y: number; w: number; h: number }; port: P }[];
  dst: { box: { x: number; y: number; w: number; h: number }; port: P }[];
  inC: Curve[];
  outC: Curve[];
}

function layoutFor(w: number, nS: number, nD: number): Layout {
  const vertical = w < 600;
  if (!vertical) {
    const h = 300;
    const nodeW = Math.min(190, w * 0.27);
    const nodeH = 58;
    const coreR = 44;
    const core = { x: w / 2, y: h / 2 };
    const col = (n: number, i: number) => (h / n) * (i + 0.5);
    const src = Array.from({ length: nS }, (_, i) => {
      const y = col(nS, i);
      return { box: { x: 0, y: y - nodeH / 2, w: nodeW, h: nodeH }, port: { x: nodeW, y } };
    });
    const dst = Array.from({ length: nD }, (_, i) => {
      const y = col(nD, i);
      return { box: { x: w - nodeW, y: y - nodeH / 2, w: nodeW, h: nodeH }, port: { x: w - nodeW, y } };
    });
    const inC = src.map(({ port }): Curve => {
      const end = { x: core.x - coreR, y: core.y + (port.y - core.y) * 0.25 };
      const mx = (port.x + end.x) / 2;
      return [port, { x: mx, y: port.y }, { x: mx, y: end.y }, end];
    });
    const outC = dst.map(({ port }): Curve => {
      const st = { x: core.x + coreR, y: core.y + (port.y - core.y) * 0.25 };
      const mx = (port.x + st.x) / 2;
      return [st, { x: mx, y: st.y }, { x: mx, y: port.y }, port];
    });
    return { w, h, vertical, core, coreR, src, dst, inC, outC };
  }
  const h = 430;
  const gap = 8;
  const nodeH = 50;
  const coreR = 40;
  const core = { x: w / 2, y: h / 2 };
  const row = (n: number, i: number, y: number) => {
    const nw = (w - gap * (n - 1)) / n;
    const x = i * (nw + gap);
    return { x, y, w: nw, h: nodeH };
  };
  const src = Array.from({ length: nS }, (_, i) => {
    const box = row(nS, i, 0);
    return { box, port: { x: box.x + box.w / 2, y: nodeH } };
  });
  const dst = Array.from({ length: nD }, (_, i) => {
    const box = row(nD, i, h - nodeH);
    return { box, port: { x: box.x + box.w / 2, y: h - nodeH } };
  });
  const inC = src.map(({ port }): Curve => {
    const end = { x: core.x + (port.x - core.x) * 0.25, y: core.y - coreR + 4 };
    const my = (port.y + end.y) / 2;
    return [port, { x: port.x, y: my }, { x: end.x, y: my }, end];
  });
  const outC = dst.map(({ port }): Curve => {
    const st = { x: core.x + (port.x - core.x) * 0.25, y: core.y + coreR - 4 };
    const my = (port.y + st.y) / 2;
    return [st, { x: st.x, y: my }, { x: port.x, y: my }, port];
  });
  return { w, h, vertical, core, coreR, src, dst, inC, outC };
}

export default function DataFlow({
  sources,
  destinations,
  core = {},
  speed = 1,
  label,
  caption,
  className,
}: DataFlowProps) {
  const reduce = useReducedMotion();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  const [hover, setHover] = useState<{ side: 'src' | 'dst'; i: number } | null>(null);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    setW(Math.round(el.getBoundingClientRect().width));
    return () => ro.disconnect();
  }, []);

  const L = useMemo(() => (w > 0 ? layoutFor(w, sources.length, destinations.length) : null), [w, sources.length, destinations.length]);

  const inDots = useRef<(SVGCircleElement | null)[]>([]);
  const inTrails = useRef<(SVGPathElement | null)[]>([]);
  const outSq = useRef<(SVGRectElement | null)[]>([]);
  const outTrails = useRef<(SVGPathElement | null)[]>([]);
  const coreRing = useRef<SVGCircleElement>(null);
  const corePulse = useRef<SVGCircleElement>(null);
  const countRef = useRef<HTMLSpanElement>(null);
  const srcPorts = useRef<(SVGCircleElement | null)[]>([]);
  const dstPorts = useRef<(SVGCircleElement | null)[]>([]);
  const speedTarget = useRef(speed);
  speedTarget.current = hover ? speed * 0.6 : speed;

  const countStart = core.countStart ?? 1248;
  const nD = destinations.length;

  useEffect(() => {
    if (!L) return;
    const el = wrapRef.current;
    const cache = new Map<Element, Record<string, string>>();
    const set = (node: Element | null, attr: string, v: string) => {
      if (!node) return;
      let c = cache.get(node);
      if (!c) cache.set(node, (c = {}));
      if (c[attr] === v) return;
      c[attr] = v;
      node.setAttribute(attr, v);
    };
    const trailPath = (c: Curve, p0: number, p1: number) => {
      if (p1 - p0 < 0.005) return '';
      const n = 6;
      let d = '';
      for (let i = 0; i <= n; i++) {
        const q = bez(c, p0 + ((p1 - p0) * i) / n);
        d += `${i ? 'L' : 'M'} ${q.x.toFixed(1)} ${q.y.toFixed(1)} `;
      }
      return d;
    };

    const draw = (time: number) => {
      const step = CYCLE / PER_CYCLE;
      let pulse = 0;
      const srcLit = new Array(sources.length).fill(0);
      const dstLit = new Array(nD).fill(0);
      for (let s = 0; s < PER_CYCLE; s++) {
        // registro mais recente nesta vaga
        const birth0 = s * step;
        const k = Math.floor((time - birth0) / CYCLE); // ciclo
        const age = time - birth0 - k * CYCLE;
        const kk = s; // posição no ciclo define a fonte e os destinos (loop sem emenda)
        const si = kk % sources.length;
        const dot = inDots.current[s];
        const tr = inTrails.current[s];
        if (age < LEG_IN && time >= birth0) {
          const p = ease(age / LEG_IN);
          const q = bez(L.inC[si], p);
          set(dot, 'transform', `translate(${q.x.toFixed(1)} ${q.y.toFixed(1)})`);
          set(dot, 'opacity', '1');
          set(tr, 'd', trailPath(L.inC[si], Math.max(0, p - TRAIL), p));
          if (age < 0.25) srcLit[si] = 1;
        } else {
          set(dot, 'opacity', '0');
          set(tr, 'd', '');
        }
        if (age >= LEG_IN && age < LEG_IN + MORPH) pulse = Math.max(pulse, Math.sin(((age - LEG_IN) / MORPH) * Math.PI));
        for (let d = 0; d < nD; d++) {
          const sq = outSq.current[s * nD + d];
          const otr = outTrails.current[s * nD + d];
          const go = takes(destinations[d].share, kk);
          const oa = age - LEG_IN - MORPH;
          if (go && oa >= -MORPH * 0.5 && oa < LEG_OUT && time >= birth0) {
            const p = oa < 0 ? 0 : ease(oa / LEG_OUT);
            const q = bez(L.outC[d], p);
            // aparece encolhido no núcleo e cresce ao sair
            const sc = oa < 0 ? 0.4 + 0.6 * (1 + oa / (MORPH * 0.5)) : 1;
            set(sq, 'transform', `translate(${q.x.toFixed(1)} ${q.y.toFixed(1)}) scale(${sc.toFixed(2)})`);
            set(sq, 'opacity', oa < 0 ? (1 + oa / (MORPH * 0.5)).toFixed(2) : '1');
            set(otr, 'd', oa > 0 ? trailPath(L.outC[d], Math.max(0, p - TRAIL), p) : '');
            if (oa > LEG_OUT - 0.3) dstLit[d] = 1;
          } else {
            set(sq, 'opacity', '0');
            set(otr, 'd', '');
          }
        }
      }
      set(corePulse.current, 'r', (L.coreR + 2 + pulse * 10).toFixed(1));
      set(corePulse.current, 'opacity', (pulse * 0.5).toFixed(2));
      srcLit.forEach((v, i) => set(srcPorts.current[i], 'data-lit', v ? '1' : '0'));
      dstLit.forEach((v, i) => set(dstPorts.current[i], 'data-lit', v ? '1' : '0'));
      el?.querySelectorAll<HTMLElement>('.df-node').forEach((n) => {
        const side = n.dataset.side;
        const i = Number(n.dataset.i);
        const lit = side === 'src' ? srcLit[i] : dstLit[i];
        if (n.dataset.lit !== String(lit)) n.dataset.lit = String(lit);
      });
      // contador: registros que já passaram pelo núcleo
      const processed = time < LEG_IN ? 0 : Math.floor((time - LEG_IN) / step) + 1;
      const txt = (countStart + processed).toLocaleString('pt-BR');
      if (countRef.current && countRef.current.textContent !== txt) countRef.current.textContent = txt;
      // anel tracejado acelera um pouco no pulso
      if (coreRing.current) {
        const off = -(time * 8 + pulse * 6);
        coreRing.current.style.strokeDashoffset = off.toFixed(1);
      }
    };

    if (reduce) {
      // quadro parado: um registro bruto em cada entrada e um processado em cada saída
      const still = LEG_IN * 0.55;
      for (let s = 0; s < PER_CYCLE; s++) {
        set(inDots.current[s], 'opacity', '0');
        for (let d = 0; d < nD; d++) set(outSq.current[s * nD + d], 'opacity', '0');
      }
      L.inC.forEach((c, i) => {
        const q = bez(c, ease(still / LEG_IN));
        set(inDots.current[i], 'transform', `translate(${q.x} ${q.y})`);
        set(inDots.current[i], 'opacity', '1');
      });
      L.outC.forEach((c, d) => {
        const q = bez(c, 0.55);
        set(outSq.current[d], 'transform', `translate(${q.x} ${q.y}) scale(1)`);
        set(outSq.current[d], 'opacity', '1');
      });
      if (countRef.current) countRef.current.textContent = countStart.toLocaleString('pt-BR');
      return;
    }

    let raf = 0;
    let visible = false;
    let last = 0;
    let time = 0.001;
    let cur = speedTarget.current;
    const loop = (now: number) => {
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
      last = now;
      cur += (speedTarget.current - cur) * Math.min(1, dt * 6); // aproxima suave
      time += dt * cur;
      draw(time);
      raf = requestAnimationFrame(loop);
    };
    const start = () => {
      if (raf || !visible || document.hidden) return;
      last = 0;
      raf = requestAnimationFrame(loop);
    };
    const stop = () => {
      cancelAnimationFrame(raf);
      raf = 0;
    };
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible) start();
      else stop();
    });
    if (el) io.observe(el);
    const onVis = () => (document.hidden ? stop() : start());
    document.addEventListener('visibilitychange', onVis);
    draw(time);
    return () => {
      stop();
      io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [L, reduce, sources.length, nD, destinations, countStart]);

  const aria =
    label ??
    `Fluxo: ${sources.map((s) => s.label).join(', ')} entram no ${core.label ?? 'Rudge'}, que organiza e envia para ${destinations
      .map((d) => d.label)
      .join(', ')}.`;

  const isLit = (side: 'src' | 'dst', i: number) => hover?.side === side && hover.i === i;

  return (
    <figure className={`df${className ? ` ${className}` : ''}`}>
      <div ref={wrapRef} className="df-stage" role="img" aria-label={aria} style={{ height: L?.h ?? 300 }}>
        {L && (
          <>
            <svg width={L.w} height={L.h} viewBox={`0 0 ${L.w} ${L.h}`} aria-hidden="true">
              {L.inC.map((c, i) => (
                <path key={`pi${i}`} className={`df-path${isLit('src', i) ? ' is-hot' : ''}`} d={curvePath(c)} />
              ))}
              {L.outC.map((c, i) => (
                <path key={`po${i}`} className={`df-path${isLit('dst', i) ? ' is-hot' : ''}`} d={curvePath(c)} />
              ))}
              {L.src.map((s, i) => (
                <circle
                  key={`sp${i}`}
                  ref={(el) => {
                    srcPorts.current[i] = el;
                  }}
                  className="df-port"
                  cx={s.port.x}
                  cy={s.port.y}
                  r={3}
                />
              ))}
              {L.dst.map((s, i) => (
                <circle
                  key={`dp${i}`}
                  ref={(el) => {
                    dstPorts.current[i] = el;
                  }}
                  className="df-port"
                  cx={s.port.x}
                  cy={s.port.y}
                  r={3}
                />
              ))}
              <circle ref={corePulse} className="df-core-pulse" cx={L.core.x} cy={L.core.y} r={L.coreR} opacity={0} />
              <circle className="df-core" cx={L.core.x} cy={L.core.y} r={L.coreR} />
              <circle ref={coreRing} className="df-core-ring" cx={L.core.x} cy={L.core.y} r={L.coreR + 7} />
              {Array.from({ length: PER_CYCLE }, (_, s) => (
                <g key={`r${s}`}>
                  <path
                    ref={(el) => {
                      inTrails.current[s] = el;
                    }}
                    className="df-trail is-raw"
                  />
                  <circle
                    ref={(el) => {
                      inDots.current[s] = el;
                    }}
                    className="df-raw"
                    r={4}
                    opacity={0}
                  />
                  {destinations.map((_, d) => (
                    <g key={d}>
                      <path
                        ref={(el) => {
                          outTrails.current[s * nD + d] = el;
                        }}
                        className="df-trail"
                      />
                      <rect
                        ref={(el) => {
                          outSq.current[s * nD + d] = el;
                        }}
                        className="df-done"
                        x={-4}
                        y={-4}
                        width={8}
                        height={8}
                        rx={1.5}
                        opacity={0}
                      />
                    </g>
                  ))}
                </g>
              ))}
            </svg>

            {([
              ['src', sources, L.src],
              ['dst', destinations, L.dst],
            ] as const).map(([side, nodes, boxes]) =>
              nodes.map((n, i) => (
                <div
                  key={`${side}${i}`}
                  className={`df-node df-${side}`}
                  data-side={side}
                  data-i={i}
                  title={n.detail}
                  style={{ left: boxes[i].box.x, top: boxes[i].box.y, width: boxes[i].box.w, height: boxes[i].box.h }}
                  onPointerEnter={(e) => e.pointerType === 'mouse' && setHover({ side, i })}
                  onPointerLeave={() => setHover(null)}
                >
                  {n.icon && (
                    <span className="df-icon" aria-hidden="true">
                      {n.icon}
                    </span>
                  )}
                  <span className="df-text">
                    <b>{n.label}</b>
                    {n.meta && !L.vertical && <span>{n.meta}</span>}
                  </span>
                  {hover?.side === side && hover.i === i && n.detail && <span className="df-tag">{n.detail}</span>}
                </div>
              )),
            )}

            <div
              className="df-core-label"
              style={{ left: L.core.x, top: L.core.y }}
              title={core.detail}
            >
              {core.icon && (
                <span className="df-core-icon" aria-hidden="true">
                  {core.icon}
                </span>
              )}
              <b>{core.label ?? 'Rudge'}</b>
            </div>
            <div className="df-count" style={{ left: L.core.x, top: L.core.y + L.coreR + 16 }}>
              <span ref={countRef}>{countStart.toLocaleString('pt-BR')}</span> {core.countLabel ?? 'organizados'}
            </div>
          </>
        )}
      </div>
      {caption && <figcaption className="df-caption">{caption}</figcaption>}
    </figure>
  );
}
