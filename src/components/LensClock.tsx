// Relógio "Lente": mostrador analógico que desliza por trás de um cartão, com
// profundidade de campo nas bordas. Adaptado do componente enviado pelo André
// (Tailwind e framer-motion trocados pelo CSS do app e pelo pacote motion).
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useReducedMotion, useSpring } from 'motion/react';
import { cx } from './ui';

export interface LensClockProps {
  /** Fuso IANA, como "America/Sao_Paulo". Sem ele, usa o do aparelho. */
  timeZone?: string;
  /** Momento fixo. Sem ele, o relógio anda sozinho com o relógio do aparelho. */
  time?: Date;
  /** Força uma paleta. Sem ela, segue o tema do app. */
  theme?: 'light' | 'dark';
  className?: string;
}

// Geometria em unidades do cartão (viewBox 100 x 100).
const TICK_OUTER = 54;
const MINOR_INNER = 50.5;
const HOUR_INNER = 42;
const LABEL_RADIUS = 61;
const HAND_LENGTH = 33;
const MINUTE_LENGTH = 48;
const SECOND_LENGTH = 52;
// Quanto o centro do mostrador fica atrás do centro do cartão, oposto ao ponteiro.
const PAN_DISTANCE = 24;

const TIME_FORMAT: Intl.DateTimeFormatOptions = {
  hour: 'numeric',
  minute: 'numeric',
  second: 'numeric',
  hourCycle: 'h23',
};

function createFormatter(timeZone?: string) {
  try {
    return new Intl.DateTimeFormat('en-US', { ...TIME_FORMAT, timeZone });
  } catch {
    // fuso desconhecido: usa o do aparelho
    return new Intl.DateTimeFormat('en-US', TIME_FORMAT);
  }
}

function readTime(date: Date, formatter: Intl.DateTimeFormat) {
  const parts = formatter.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return { hours: get('hour') % 24, minutes: get('minute'), seconds: get('second') };
}

type SpringOptions = Parameters<typeof useSpring>[1];

// Mola até um ângulo "desenrolado", para 59 -> 0 seguir em frente.
function useAngle(target: number | null, reduceMotion: boolean, options: SpringOptions) {
  const angle = useSpring(0, options);
  const unwrapped = useRef<number | null>(null);

  useEffect(() => {
    if (target === null) return;
    const previous = unwrapped.current;
    const next = previous === null ? target : previous + ((((target - previous) % 360) + 540) % 360) - 180;
    unwrapped.current = next;
    if (previous === null || reduceMotion) angle.jump(next);
    else angle.set(next);
  }, [target, reduceMotion, angle]);

  return angle;
}

function useNow(fixed?: Date) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    if (fixed) return;
    const tick = () => setNow(new Date());
    tick();
    let interval: ReturnType<typeof setInterval> | undefined;
    // alinha com a virada do segundo
    const timeout = setTimeout(() => {
      tick();
      interval = setInterval(tick, 1000);
    }, 1000 - (Date.now() % 1000));
    return () => {
      clearTimeout(timeout);
      if (interval) clearInterval(interval);
    };
  }, [fixed]);

  return fixed ?? now;
}

const pad = (value: number) => value.toString().padStart(2, '0');

export function LensClock({ timeZone, time, theme, className }: LensClockProps) {
  const now = useNow(time);
  const formatter = useMemo(() => createFormatter(timeZone), [timeZone]);
  const parts = now ? readTime(now, formatter) : null;
  const reduceMotion = useReducedMotion() ?? false;
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');

  const dialRef = useRef<SVGGElement>(null);
  const hourRef = useRef<SVGGElement>(null);
  const minuteRef = useRef<SVGGElement>(null);
  const secondRef = useRef<SVGGElement>(null);

  const ready = now !== null;
  const live = !time;
  const target = parts ? ((parts.hours % 12) + parts.minutes / 60 + parts.seconds / 3600) * 30 : null;

  // Um `time` fixo vai de mola até o lugar; o relógio ao vivo é desenhado a cada quadro.
  const hourAngle = useAngle(live ? null : target, reduceMotion, { stiffness: 70, damping: 18 });
  const minuteAngle = useAngle(!live && parts ? (parts.minutes + parts.seconds / 60) * 6 : null, reduceMotion, { stiffness: 90, damping: 18 });
  const secondAngle = useAngle(!live && parts ? parts.seconds * 6 : null, reduceMotion, { stiffness: 90, damping: 18 });

  const draw = useCallback((hour: number, minute: number, second: number) => {
    const rad = (hour * Math.PI) / 180;
    const x = 50 - PAN_DISTANCE * Math.sin(rad);
    const y = 50 + PAN_DISTANCE * Math.cos(rad);
    dialRef.current?.setAttribute('transform', `translate(${x} ${y})`);
    hourRef.current?.setAttribute('transform', `rotate(${hour})`);
    minuteRef.current?.setAttribute('transform', `rotate(${minute})`);
    secondRef.current?.setAttribute('transform', `rotate(${second})`);
  }, []);

  useEffect(() => {
    if (live) return;
    const update = () => draw(hourAngle.get(), minuteAngle.get(), secondAngle.get());
    update();
    const unsubscribe = [hourAngle.on('change', update), minuteAngle.on('change', update), secondAngle.on('change', update)];
    return () => unsubscribe.forEach((fn) => fn());
  }, [live, ready, hourAngle, minuteAngle, secondAngle, draw]);

  // Ao vivo: lê a hora do fuso uma vez por segundo e, entre uma leitura e outra,
  // soma os milissegundos do aparelho para o ponteiro varrer liso.
  const baseSeconds = live && parts ? parts.hours * 3600 + parts.minutes * 60 + parts.seconds : null;
  const baseAt = live && now ? Math.floor(now.getTime() / 1000) * 1000 : null;

  useEffect(() => {
    if (baseSeconds === null || baseAt === null) return;
    let frame = 0;
    const tick = () => {
      const elapsed = (Date.now() - baseAt) / 1000;
      // movimento reduzido: pula de segundo em segundo
      const t = baseSeconds + (reduceMotion ? Math.floor(elapsed) : elapsed);
      draw((t / 120) % 360, (t / 10) % 360, (t * 6) % 360);
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [baseSeconds, baseAt, reduceMotion, draw]);

  const hours = parts?.hours ?? 0;
  const minutes = parts?.minutes ?? 0;

  const ticks = useMemo(
    () =>
      Array.from({ length: 60 }, (_, i) => {
        const rad = (i * 6 * Math.PI) / 180;
        return { i, sin: Math.sin(rad), cos: -Math.cos(rad), isHour: i % 5 === 0 };
      }),
    [],
  );

  const dial = (
    <>
      {/* raios finos que convergem no pivô */}
      {Array.from({ length: 12 }, (_, i) => (
        <line key={i} x1={0} y1={0} x2={0} y2={-TICK_OUTER + 4} transform={`rotate(${i * 30})`} stroke={`url(#${id}-spoke)`} strokeWidth={0.18} />
      ))}

      {ticks.map(({ i, sin, cos, isHour }) =>
        !isHour ? (
          <line key={i} x1={sin * MINOR_INNER} y1={cos * MINOR_INNER} x2={sin * TICK_OUTER} y2={cos * TICK_OUTER} stroke="var(--lc-tick)" strokeWidth={0.85} strokeLinecap="round" />
        ) : (
          <g key={i} filter={`url(#${id}-lift)`}>
            <line x1={sin * HOUR_INNER} y1={cos * HOUR_INNER} x2={sin * TICK_OUTER} y2={cos * TICK_OUTER} stroke="var(--lc-sleeve)" strokeWidth={2.5} strokeLinecap="round" />
            <line
              x1={sin * (HOUR_INNER + 0.7)}
              y1={cos * (HOUR_INNER + 0.7)}
              x2={sin * (TICK_OUTER - 0.7)}
              y2={cos * (TICK_OUTER - 0.7)}
              stroke="var(--lc-lume)"
              strokeWidth={1.05}
              strokeLinecap="round"
            />
          </g>
        ),
      )}

      {Array.from({ length: 12 }, (_, i) => {
        const hour = i === 0 ? 12 : i;
        const deg = i * 30;
        const rad = (deg * Math.PI) / 180;
        const x = Math.sin(rad) * LABEL_RADIUS;
        const y = -Math.cos(rad) * LABEL_RADIUS;
        // números tangenciais legíveis: topo para fora em cima e para dentro embaixo
        const rotation = deg > 90 && deg < 270 ? deg - 180 : deg;
        return (
          <text key={hour} x={x} y={y} transform={`rotate(${rotation} ${x} ${y})`} textAnchor="middle" dominantBaseline="central" fontSize={5.4} fill="var(--lc-label)" className="lc-num">
            {hour}
          </text>
        );
      })}

      {/* ponteiro das horas */}
      <g ref={hourRef}>
        <g filter={`url(#${id}-hand-shadow)`}>
          <path
            d={`M -1.35 2 L -0.95 ${-HAND_LENGTH + 2.4} Q 0 ${-HAND_LENGTH - 0.6} 0.95 ${-HAND_LENGTH + 2.4} L 1.35 2 Z`}
            fill="var(--lc-hand)"
            stroke="var(--lc-hand-edge)"
            strokeWidth={0.2}
          />
        </g>
        <line x1={0} y1={-12} x2={0} y2={-HAND_LENGTH + 6} stroke="var(--lc-lume)" strokeWidth={1} strokeLinecap="round" />
      </g>

      {/* ponteiro dos minutos */}
      <g ref={minuteRef}>
        <g filter={`url(#${id}-hand-shadow)`}>
          <path
            d={`M -0.95 2 L -0.6 ${-MINUTE_LENGTH + 1.6} Q 0 ${-MINUTE_LENGTH - 0.4} 0.6 ${-MINUTE_LENGTH + 1.6} L 0.95 2 Z`}
            fill="var(--lc-hand)"
            stroke="var(--lc-hand-edge)"
            strokeWidth={0.2}
          />
        </g>
        <line x1={0} y1={-16} x2={0} y2={-MINUTE_LENGTH + 4} stroke="var(--lc-lume)" strokeWidth={0.6} strokeLinecap="round" />
      </g>

      <circle r={3.9} fill={`url(#${id}-pivot)`} filter={`url(#${id}-hand-shadow)`} />

      {/* ponteiro dos segundos, com contrapeso curto */}
      <g ref={secondRef}>
        <line x1={0} y1={9} x2={0} y2={-SECOND_LENGTH} stroke="var(--lc-accent)" strokeWidth={0.4} strokeLinecap="round" />
        <circle r={1.3} fill="var(--lc-accent)" />
      </g>
    </>
  );

  const timeLabel = now ? `${pad(hours)}:${pad(minutes)}` : undefined;

  return (
    <div role="img" aria-label={timeLabel ? `Relógio marcando ${timeLabel}` : 'Relógio'} className={cx('lens-clock', theme && `lc-${theme}`, className)}>
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <defs>
          <radialGradient id={`${id}-spoke`} gradientUnits="userSpaceOnUse" cx={0} cy={0} r={TICK_OUTER}>
            <stop offset="0" stopColor="var(--lc-spoke)" stopOpacity={0.16} />
            <stop offset="0.75" stopColor="var(--lc-spoke)" stopOpacity={0.03} />
            <stop offset="1" stopColor="var(--lc-spoke)" stopOpacity={0} />
          </radialGradient>
          <radialGradient id={`${id}-pivot`} cx="0.35" cy="0.3" r="0.8">
            <stop offset="0" stopColor="var(--lc-pivot-from)" />
            <stop offset="1" stopColor="var(--lc-pivot-to)" />
          </radialGradient>
          <filter id={`${id}-hand-shadow`} x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx={0.5} dy={1.1} stdDeviation={0.9} floodColor="#000" floodOpacity={0.18} />
          </filter>
          {/* região em user space: os traços retos de 12/3/6/9 têm caixa de área zero */}
          <filter id={`${id}-lift`} filterUnits="userSpaceOnUse" x={-70} y={-70} width={140} height={140}>
            <feDropShadow dx={0.2} dy={0.45} stdDeviation={0.35} floodColor="#000" floodOpacity={0.14} />
          </filter>
          <filter id={`${id}-defocus`} x="-10%" y="-10%" width="120%" height="120%">
            <feGaussianBlur stdDeviation={1.3} />
          </filter>
          {/* profundidade de campo: nítido no meio, suave nos cantos */}
          <radialGradient id={`${id}-focus`} gradientUnits="userSpaceOnUse" cx={50} cy={50} r={71}>
            <stop offset="0.55" stopColor="#fff" />
            <stop offset="0.82" stopColor="#000" />
          </radialGradient>
          <radialGradient id={`${id}-blur`} gradientUnits="userSpaceOnUse" cx={50} cy={50} r={71}>
            <stop offset="0.55" stopColor="#000" />
            <stop offset="0.82" stopColor="#fff" stopOpacity={0.75} />
          </radialGradient>
          <mask id={`${id}-focus-mask`} maskUnits="userSpaceOnUse" x={0} y={0} width={100} height={100}>
            <rect width={100} height={100} fill={`url(#${id}-focus)`} />
          </mask>
          <mask id={`${id}-blur-mask`} maskUnits="userSpaceOnUse" x={0} y={0} width={100} height={100}>
            <rect width={100} height={100} fill={`url(#${id}-blur)`} />
          </mask>
        </defs>

        {now && (
          <>
            <g mask={`url(#${id}-focus-mask)`}>
              <g id={`${id}-dial`} ref={dialRef}>
                {dial}
              </g>
            </g>
            <g mask={`url(#${id}-blur-mask)`} filter={`url(#${id}-defocus)`}>
              <use href={`#${id}-dial`} />
            </g>
          </>
        )}
      </svg>
    </div>
  );
}
