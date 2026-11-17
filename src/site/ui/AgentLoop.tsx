import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, animate, motion, useReducedMotion } from 'motion/react';
import { Check, Loader2, Pause, Play, RotateCcw, SkipForward, Sparkles, X } from 'lucide-react';
import { LiquidButton } from './LiquidButton';

// Ilustração do ciclo do agente (inspirada na descrição do "Agent loop" da uiarc,
// que é Arc Pro): ler contexto, agir, conferir e repetir, com uma cabeça luminosa
// dando a volta no anel. Feita do zero com motion; tudo aqui é dado de exemplo.

export type LoopStation = 'gather' | 'act' | 'verify';

export interface LoopCall {
  tool: string;
  mark?: ReactNode;
  action: string;
  result: string;
  status?: 'ok' | 'error';
}

export interface LoopIteration {
  gather: { label: string; detail?: string; tokens: number; mark?: ReactNode };
  calls: LoopCall[];
  verify: { passed: boolean; note: string };
}

interface AgentLoopProps {
  iterations: LoopIteration[];
  task: string;
  summary?: string;
  model?: { name: string; mark?: ReactNode } | null;
  title?: string;
  stationLabels?: Partial<Record<LoopStation, string>>;
  autoPlay?: boolean;
  loop?: boolean;
  defaultSpeed?: number;
  /** Mostra tocar/pausar, passo, recomeçar e velocidade. */
  controls?: boolean;
  className?: string;
}

/* ---------- linha do tempo pura ---------- */

type Ev =
  | { t: number; kind: 'arrive'; station: LoopStation; iter: number }
  | { t: number; kind: 'block'; iter: number }
  | { t: number; kind: 'call'; iter: number; idx: number }
  | { t: number; kind: 'result'; iter: number; idx: number }
  | { t: number; kind: 'check'; iter: number }
  | { t: number; kind: 'done' };

interface Travel {
  t0: number;
  t1: number;
  a0: number;
  a1: number;
}

const ANGLE: Record<LoopStation, number> = { gather: 270, act: 30, verify: 150 };
const TRAVEL = 1000;

function buildTimeline(iterations: LoopIteration[]) {
  const events: Ev[] = [];
  const travels: Travel[] = [];
  let t = 400;
  let a = 270;
  const go = (to: number) => {
    travels.push({ t0: t, t1: t + TRAVEL, a0: a, a1: to });
    t += TRAVEL;
    a = to;
  };
  iterations.forEach((it, i) => {
    if (i > 0) go(a + 120);
    events.push({ t, kind: 'arrive', station: 'gather', iter: i });
    events.push({ t: t + 250, kind: 'block', iter: i });
    t += 1000;
    go(a + 120);
    events.push({ t, kind: 'arrive', station: 'act', iter: i });
    it.calls.forEach((_, j) => {
      events.push({ t: t + 150, kind: 'call', iter: i, idx: j });
      events.push({ t: t + 950, kind: 'result', iter: i, idx: j });
      t += 1500;
    });
    go(a + 120);
    events.push({ t, kind: 'arrive', station: 'verify', iter: i });
    events.push({ t: t + 200, kind: 'check', iter: i });
    t += 1300;
  });
  events.push({ t, kind: 'done' });
  return { events, travels, end: t };
}

const easeInOut = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);

/* ---------- geometria do anel ---------- */

const VB = 300;
const C = VB / 2;
const R = 108;
const pt = (deg: number, r = R) => {
  const rad = (deg * Math.PI) / 180;
  return { x: C + r * Math.cos(rad), y: C + r * Math.sin(rad) };
};
const arc = (a0: number, a1: number) => {
  const p0 = pt(a0);
  const p1 = pt(a1);
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
  return `M ${p0.x.toFixed(2)} ${p0.y.toFixed(2)} A ${R} ${R} 0 ${large} 1 ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`;
};
const TRAIL_SEGMENTS = 12;
const SPEEDS = [0.5, 1, 2];

type Status = 'ready' | 'running' | 'paused' | 'done' | 'stopped';
const STATUS_LABEL: Record<Status, string> = {
  ready: 'Pronto',
  running: 'Rodando',
  paused: 'Pausado',
  done: 'Concluído',
  stopped: 'Parado',
};

function RollingNumber({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef(value);
  const reduce = useReducedMotion();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fmt = (n: number) => Math.round(n).toLocaleString('pt-BR');
    if (reduce) {
      el.textContent = fmt(value);
      prev.current = value;
      return;
    }
    const controls = animate(prev.current, value, {
      duration: 0.6,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (n) => (el.textContent = fmt(n)),
    });
    prev.current = value;
    return () => controls.stop();
  }, [value, reduce]);
  return <span ref={ref}>{Math.round(value).toLocaleString('pt-BR')}</span>;
}

export default function AgentLoop({
  iterations,
  task,
  summary,
  model = { name: 'Claude Opus' },
  title = 'Ciclo do agente',
  stationLabels,
  autoPlay = true,
  loop = false,
  defaultSpeed = 1,
  controls = true,
  className,
}: AgentLoopProps) {
  const reduce = useReducedMotion();
  const labels = { gather: 'Ler contexto', act: 'Agir', verify: 'Conferir', ...stationLabels };
  const { events, travels, end } = useMemo(() => buildTimeline(iterations), [iterations]);
  const empty = iterations.length === 0;
  const gradId = useId().replace(/[^a-zA-Z0-9-_]/g, '');

  const rootRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<SVGCircleElement>(null);
  const haloRef = useRef<SVGCircleElement>(null);
  const trailRefs = useRef<(SVGPathElement | null)[]>([]);
  const restartBtn = useRef<HTMLElement>(null);

  const timeRef = useRef(0);
  const playingRef = useRef(false);
  const stopAtRef = useRef<number | null>(null);
  const speedRef = useRef(defaultSpeed);
  const rafRef = useRef(0);
  const loopTimer = useRef<number | undefined>(undefined);
  const startedRef = useRef(false);

  const [fired, setFired] = useState(0); // quantos eventos já aconteceram
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(defaultSpeed);
  const [announce, setAnnounce] = useState('');

  const countAt = useCallback(
    (t: number) => {
      let n = 0;
      while (n < events.length && events[n].t <= t) n++;
      return n;
    },
    [events],
  );

  // posição da cabeça e do rastro, escritas direto no SVG (sem render por quadro)
  const paint = useCallback(
    (t: number) => {
      let angle = 270;
      let trail = 0;
      for (const tr of travels) {
        if (t >= tr.t1) angle = tr.a1;
        else if (t > tr.t0) {
          const p = (t - tr.t0) / (tr.t1 - tr.t0);
          if (reduce) {
            angle = p < 1 ? tr.a0 : tr.a1;
          } else {
            angle = tr.a0 + (tr.a1 - tr.a0) * easeInOut(p);
            trail = 70 * Math.sin(Math.PI * p);
          }
          break;
        } else break;
      }
      const p = pt(angle);
      headRef.current?.setAttribute('cx', p.x.toFixed(2));
      headRef.current?.setAttribute('cy', p.y.toFixed(2));
      haloRef.current?.setAttribute('cx', p.x.toFixed(2));
      haloRef.current?.setAttribute('cy', p.y.toFixed(2));
      const seg = trail / TRAIL_SEGMENTS;
      trailRefs.current.forEach((el, i) => {
        if (!el) return;
        if (trail < 1) {
          el.setAttribute('d', '');
          return;
        }
        const a1 = angle - seg * i;
        const a0 = a1 - seg - 0.4;
        el.setAttribute('d', arc(a0, a1));
      });
    },
    [travels, reduce],
  );

  const sync = useCallback(
    (t: number) => {
      paint(t);
      setFired(countAt(t));
    },
    [paint, countAt],
  );

  const stopRaf = () => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
  };

  const tick = useCallback(() => {
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(64, now - last) * speedRef.current;
      last = now;
      let t = timeRef.current + dt;
      const stopAt = stopAtRef.current;
      let halt = false;
      if (stopAt !== null && t >= stopAt) {
        t = stopAt;
        halt = true;
      }
      if (t >= end) {
        t = end;
        halt = true;
      }
      timeRef.current = t;
      sync(t);
      if (halt) {
        playingRef.current = false;
        stopAtRef.current = null;
        setPlaying(false);
        rafRef.current = 0;
        return;
      }
      rafRef.current = requestAnimationFrame(step);
    };
    stopRaf();
    rafRef.current = requestAnimationFrame(step);
  }, [end, sync]);

  const play = useCallback(() => {
    if (empty) return;
    window.clearTimeout(loopTimer.current);
    if (timeRef.current >= end) timeRef.current = 0;
    stopAtRef.current = null;
    playingRef.current = true;
    setPlaying(true);
    setAnnounce('');
    tick();
  }, [empty, end, tick]);

  const pause = useCallback(() => {
    playingRef.current = false;
    stopAtRef.current = null;
    stopRaf();
    setPlaying(false);
  }, []);

  const restart = useCallback(() => {
    pause();
    window.clearTimeout(loopTimer.current);
    timeRef.current = 0;
    sync(0);
  }, [pause, sync]);

  const stepNext = useCallback(() => {
    if (empty) return;
    const t = timeRef.current >= end ? 0 : timeRef.current;
    if (t === 0 && timeRef.current >= end) sync(0);
    timeRef.current = t;
    const next = events.find((e) => e.t > t + 0.5 && e.kind !== 'arrive');
    if (!next) return;
    if (reduce) {
      timeRef.current = next.t;
      sync(next.t);
      return;
    }
    stopAtRef.current = next.t;
    playingRef.current = true;
    setPlaying(true);
    tick();
  }, [empty, end, events, reduce, sync, tick]);

  // começa quando o cartão aparece na tela (reduzir movimento: abre no fim)
  useEffect(() => {
    if (empty) return;
    if (reduce) {
      timeRef.current = end;
      sync(end);
      return;
    }
    sync(0);
    if (!autoPlay) return;
    const el = rootRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting && !startedRef.current) {
          startedRef.current = true;
          play();
        }
      },
      { threshold: 0.45 },
    );
    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empty, reduce, end]);

  useEffect(() => () => {
    stopRaf();
    window.clearTimeout(loopTimer.current);
  }, []);

  /* ---------- estado derivado dos eventos ---------- */
  const done = fired > 0 && events[fired - 1]?.kind === 'done';
  const lastPassed = iterations[iterations.length - 1]?.verify.passed ?? true;
  const status: Status = done ? (lastPassed ? 'done' : 'stopped') : playing ? 'running' : fired > 0 ? 'paused' : 'ready';

  // volta de novo depois do fim, se pedido
  useEffect(() => {
    if (!done || !loop || reduce) return;
    loopTimer.current = window.setTimeout(() => {
      timeRef.current = 0;
      sync(0);
      play();
    }, 4000);
    return () => window.clearTimeout(loopTimer.current);
  }, [done, loop, reduce, play, sync]);

  // foco vai para "Recomeçar" quando o passo a passo chega ao fim
  const steppedRef = useRef(false);
  useEffect(() => {
    if (done && steppedRef.current) {
      restartBtn.current?.focus();
      steppedRef.current = false;
    }
  }, [done]);

  let iter = 0;
  let station: LoopStation | null = null;
  let blocks = 0;
  let call: { iter: number; idx: number; resolved: boolean } | null = null;
  let check: number | null = null;
  let laneKind: 'call' | 'check' | null = null;
  let calls = 0;
  for (let i = 0; i < fired; i++) {
    const e = events[i];
    if (e.kind === 'arrive') {
      iter = e.iter;
      station = e.station;
      if (e.station === 'gather') check = null;
      if (e.station === 'gather') call = null;
    } else if (e.kind === 'block') blocks++;
    else if (e.kind === 'call') {
      call = { iter: e.iter, idx: e.idx, resolved: false };
      laneKind = 'call';
    } else if (e.kind === 'result') {
      call = { iter: e.iter, idx: e.idx, resolved: true };
      calls++;
    } else if (e.kind === 'check') {
      check = e.iter;
      laneKind = 'check';
    } else if (e.kind === 'done') station = null;
  }
  const tokens = iterations.slice(0, blocks).reduce((s, it) => s + it.gather.tokens, 0);
  const callData = call ? iterations[call.iter].calls[call.idx] : null;
  const checkData = check !== null ? iterations[check].verify : null;
  const totalCalls = iterations.reduce((s, it) => s + it.calls.length, 0);
  const caption = done
    ? summary ??
      (lastPassed
        ? `${iterations.length} voltas e ${totalCalls} ações até concluir.`
        : 'Parou: a última conferência não passou.')
    : task;

  // anúncio para leitor de tela só quando pausado ou passo a passo
  useEffect(() => {
    if (playing && stopAtRef.current === null) return;
    const e = events[fired - 1];
    if (!e) return;
    let msg = '';
    if (e.kind === 'block') msg = `Contexto lido: ${iterations[e.iter].gather.label}`;
    if (e.kind === 'result') {
      const c = iterations[e.iter].calls[e.idx];
      msg = c.status === 'error' ? `${c.tool} falhou: ${c.result}` : `${c.tool} respondeu: ${c.result}`;
    }
    if (e.kind === 'check') {
      const v = iterations[e.iter].verify;
      msg = v.passed ? `Conferência ok: ${v.note}` : `Repetir: ${v.note}`;
    }
    if (e.kind === 'done') msg = caption;
    if (msg) setAnnounce(msg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fired, playing]);

  const onSpeedKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const i = SPEEDS.indexOf(speed);
    const ni = Math.max(0, Math.min(SPEEDS.length - 1, i + (e.key === 'ArrowRight' ? 1 : -1)));
    setSpeed(SPEEDS[ni]);
    speedRef.current = SPEEDS[ni];
    const btns = (e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('[data-speed]');
    btns[ni]?.focus();
  };

  const stationPos = (s: LoopStation) => pt(ANGLE[s], R);
  const circ = 2 * Math.PI * R;
  const pinFrom = (s: LoopStation) => pt(ANGLE[s], R + 8);
  const pinTo = (s: LoopStation) => pt(ANGLE[s], R + 30);

  const callIcon = callData && call ? (call.resolved ? (callData.status === 'error' ? <X /> : <Check />) : <Loader2 className="al-spin" />) : null;

  const callChip = callData && call && (
    <motion.div
      key={`c-${call.iter}-${call.idx}`}
      className={`al-chip${call.resolved && callData.status === 'error' ? ' is-error' : ''}`}
      initial={reduce ? false : { opacity: 0, y: -6, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.08 } }}
      transition={{ type: 'spring', stiffness: 520, damping: 46 }}
    >
      <span className="al-chip-mark" aria-hidden="true">
        {callData.mark}
      </span>
      <span className="al-chip-text">
        <b>{callData.tool}</b>
        <span>{callData.action}</span>
        <AnimatePresence mode="wait" initial={false}>
          {call.resolved ? (
            <motion.em key="r" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              {callData.status === 'error' ? 'Falhou: ' : ''}
              {callData.result}
            </motion.em>
          ) : (
            <motion.em key="w" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              Executando…
            </motion.em>
          )}
        </AnimatePresence>
      </span>
      <span className="al-chip-state" aria-hidden="true">
        {callIcon}
      </span>
    </motion.div>
  );

  const checkChip = checkData && check !== null && (
    <motion.div
      key={`v-${check}`}
      className={`al-chip ${checkData.passed ? 'is-ok' : 'is-retry'}`}
      initial={reduce ? false : { opacity: 0, y: -6, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.08 } }}
      transition={{ type: 'spring', stiffness: 520, damping: 46 }}
    >
      <span className="al-chip-mark" aria-hidden="true">
        {checkData.passed ? <Check /> : <RotateCcw />}
      </span>
      <span className="al-chip-text">
        <b>{checkData.passed ? 'Conferência ok' : 'Repetir'}</b>
        <span>{checkData.note}</span>
      </span>
    </motion.div>
  );

  return (
    <div
      ref={rootRef}
      className={`al${className ? ` ${className}` : ''}`}
      role="group"
      aria-label={title}
      data-status={status}
    >
      <div className="al-head">
        <div className="al-title">
          <span>{title}</span>
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={status}
              className="al-status"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              {status === 'running' ? (
                <Loader2 className="al-spin" aria-hidden="true" />
              ) : status === 'done' ? (
                <Check aria-hidden="true" />
              ) : status === 'paused' ? (
                <Pause aria-hidden="true" />
              ) : status === 'stopped' ? (
                <X aria-hidden="true" />
              ) : (
                <Play aria-hidden="true" />
              )}
              {STATUS_LABEL[status]}
            </motion.span>
          </AnimatePresence>
        </div>
        <span className="al-tokens">
          <RollingNumber value={tokens} /> tokens
        </span>
      </div>

      <div className="al-body">
        <div className="al-stage">
          <div className="al-ring">
            <svg viewBox={`0 0 ${VB} ${VB}`} aria-hidden="true">
              <defs>
                <radialGradient id={`${gradId}-halo`}>
                  <stop offset="0" stopColor="var(--al-accent)" stopOpacity="0.55" />
                  <stop offset="1" stopColor="var(--al-accent)" stopOpacity="0" />
                </radialGradient>
              </defs>
              <circle className="al-track" cx={C} cy={C} r={R} />
              <circle
                className={`al-drawn${status === 'done' ? ' is-on' : ''}`}
                cx={C}
                cy={C}
                r={R}
                strokeDasharray={circ}
                strokeDashoffset={status === 'done' ? 0 : circ}
                transform={`rotate(-90 ${C} ${C})`}
              />
              {[330, 90, 210].map((a) => {
                const p = pt(a);
                return (
                  <path
                    key={a}
                    className="al-chev"
                    d="M -3 -4 L 2 0 L -3 4"
                    transform={`translate(${p.x} ${p.y}) rotate(${a + 90})`}
                  />
                );
              })}
              {(['act', 'verify'] as const).map((s) => {
                const on = (s === 'act' && laneKind === 'call' && callData) || (s === 'verify' && laneKind === 'check' && checkData);
                const a = pinFrom(s);
                const b = pinTo(s);
                return (
                  <line
                    key={s}
                    className={`al-pin${on && !done ? ' is-on' : ''}`}
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    pathLength={1}
                  />
                );
              })}
              {Array.from({ length: TRAIL_SEGMENTS }, (_, i) => (
                <path
                  key={i}
                  ref={(el) => {
                    trailRefs.current[i] = el;
                  }}
                  className="al-trail"
                  style={{ opacity: 0.85 * (1 - i / TRAIL_SEGMENTS) }}
                />
              ))}
              {(['gather', 'act', 'verify'] as const).map((s) => {
                const p = stationPos(s);
                return (
                  <g key={s} className={`al-node${station === s ? ' is-active' : ''}`}>
                    <circle className="al-node-ring" cx={p.x} cy={p.y} r={13} />
                    <circle className="al-node-dot" cx={p.x} cy={p.y} r={6.5} />
                  </g>
                );
              })}
              <circle ref={haloRef} className={`al-halo${done ? ' is-off' : ''}`} r={16} fill={`url(#${gradId}-halo)`} />
              <circle ref={headRef} className={`al-headdot${done ? ' is-off' : ''}`} r={5.5} />
            </svg>

            {(['gather', 'act', 'verify'] as const).map((s) => (
              <span key={s} className={`al-label al-label-${s}${station === s ? ' is-active' : ''}`}>
                {labels[s]}
              </span>
            ))}

            <div className="al-center">
              <AnimatePresence mode="wait" initial={false}>
                {done ? (
                  <motion.span
                    key="ok"
                    className="al-center-mark is-done"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                  >
                    {lastPassed ? <Check /> : <X />}
                  </motion.span>
                ) : (
                  <motion.span key="m" className="al-center-mark" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    {model?.mark ?? <Sparkles />}
                  </motion.span>
                )}
              </AnimatePresence>
              {model && <b>{model.name}</b>}
              <span className="al-count">
                Volta{' '}
                <span className="al-count-num">
                  <AnimatePresence mode="popLayout" initial={false}>
                    <motion.span
                      key={iter}
                      initial={reduce ? false : { y: '100%', opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      exit={{ y: '-100%', opacity: 0 }}
                      transition={{ duration: 0.25 }}
                    >
                      {empty ? 0 : iter + 1}
                    </motion.span>
                  </AnimatePresence>
                </span>{' '}
                de {iterations.length}
              </span>
            </div>
          </div>

          <div className="al-lanes">
            <div className="al-lane al-lane-act" data-show={laneKind === 'call' ? 'true' : 'false'}>
              <AnimatePresence mode="wait">{callChip}</AnimatePresence>
            </div>
            <div className="al-lane al-lane-verify" data-show={laneKind === 'check' ? 'true' : 'false'}>
              <AnimatePresence mode="wait">{checkChip}</AnimatePresence>
            </div>
          </div>
        </div>

        <div className="al-context">
          <p className="al-context-title">Contexto reunido</p>
          <ol style={{ ['--slots' as string]: iterations.length }}>
            {iterations.slice(0, blocks).map((it, i) => (
              <motion.li
                key={i}
                initial={reduce ? false : { opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              >
                <span className="al-ctx-mark" aria-hidden="true">
                  {it.gather.mark}
                </span>
                <span className="al-ctx-text">
                  <b>{it.gather.label}</b>
                  {it.gather.detail && <span>{it.gather.detail}</span>}
                </span>
                <span className="al-ctx-tokens">+{it.gather.tokens.toLocaleString('pt-BR')}</span>
              </motion.li>
            ))}
          </ol>
        </div>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.p
          key={done ? 'sum' : 'task'}
          className="al-caption"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {done ? '' : 'Pedido: '}
          {caption}
        </motion.p>
      </AnimatePresence>

      {controls && (
      <div className="al-controls">
        <LiquidButton
          size="sm"
          aria-label={playing ? 'Pausar' : 'Tocar'}
          disabled={empty}
          onClick={() => (playing ? pause() : play())}
        >
          {playing ? <Pause className="al-ico" aria-hidden="true" /> : <Play className="al-ico" aria-hidden="true" />}
        </LiquidButton>
        <LiquidButton
          size="sm"
          aria-label="Próximo passo"
          disabled={empty || done}
          onClick={() => {
            if (playing) pause();
            steppedRef.current = true;
            stepNext();
          }}
        >
          <SkipForward className="al-ico" aria-hidden="true" />
        </LiquidButton>
        <LiquidButton ref={restartBtn} size="sm" aria-label="Recomeçar" disabled={empty} onClick={restart}>
          <RotateCcw className="al-ico" aria-hidden="true" />
        </LiquidButton>
        <div className="al-speed" role="group" aria-label="Velocidade" onKeyDown={onSpeedKey}>
          <span className="al-speed-label">Velocidade</span>
          {SPEEDS.map((s) => (
            <LiquidButton
              key={s}
              size="sm"
              data-speed={s}
              aria-pressed={speed === s}
              variant={speed === s ? 'solid' : 'default'}
              tabIndex={speed === s ? 0 : -1}
              onClick={() => {
                setSpeed(s);
                speedRef.current = s;
              }}
            >
              {String(s).replace('.', ',')}×
            </LiquidButton>
          ))}
        </div>
      </div>
      )}

      <p className="al-sr" aria-live="polite">
        {announce}
      </p>
    </div>
  );
}
