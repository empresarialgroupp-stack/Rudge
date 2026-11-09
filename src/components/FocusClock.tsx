// Relógios do Modo foco. Cada estilo recebe só o tempo que falta e o total;
// o usuário escolhe o seu na primeira vez e pode trocar nas Configurações.
import { useId } from 'react';
import { Check } from 'lucide-react';
import { useReducedMotion } from 'motion/react';
import type { FocusClockStyle } from '../lib/types';
import { LensClock } from './LensClock';
import { cx } from './ui';

export const mmss = (ms: number) => {
  const t = Math.ceil(ms / 1000);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

export const CLOCK_STYLES: { value: FocusClockStyle; label: string; hint: string }[] = [
  { value: 'ring', label: 'Anel', hint: 'Contagem com tracinhos que apagam' },
  { value: 'lens', label: 'Lente', hint: 'Relógio analógico e contagem' },
  { value: 'digital', label: 'Digital', hint: 'Só os números, bem grandes' },
  { value: 'disc', label: 'Disco', hint: 'Fatia que encolhe até zerar' },
  { value: 'flip', label: 'Placas', hint: 'Números que viram como placas' },
  { value: 'tide', label: 'Maré', hint: 'Nível que baixa com o tempo' },
];

export interface FocusClockProps {
  style?: FocusClockStyle;
  /** milissegundos que faltam */
  left: number;
  /** duração total em milissegundos */
  total: number;
  paused?: boolean;
  /** true na tela de escolha, antes de começar */
  idle?: boolean;
  /** linha pequena embaixo do tempo */
  caption?: string;
}

/** Anel de tracinhos: os acesos são o tempo que falta. */
function Ring({ value, ticks = 96 }: { value: number; ticks?: number }) {
  const on = Math.round(Math.max(0, Math.min(1, value)) * ticks);
  return (
    <svg className="focus-ring" viewBox="0 0 300 300" aria-hidden="true">
      {Array.from({ length: ticks }, (_, i) => {
        const a = (i / ticks) * Math.PI * 2 - Math.PI / 2;
        const long = i % 8 === 0;
        const r1 = long ? 118 : 124;
        return (
          <line
            key={i}
            x1={150 + r1 * Math.cos(a)}
            y1={150 + r1 * Math.sin(a)}
            x2={150 + 140 * Math.cos(a)}
            y2={150 + 140 * Math.sin(a)}
            className={cx('fr-tick', i < on && 'on')}
          />
        );
      })}
    </svg>
  );
}

/** Disco: uma fatia cheia que vai encolhendo no sentido horário. */
function Disc({ value }: { value: number }) {
  const v = Math.max(0, Math.min(1, value));
  const r = 120;
  const a = v * Math.PI * 2 - Math.PI / 2;
  const x = 150 + r * Math.cos(a);
  const y = 150 + r * Math.sin(a);
  return (
    <svg className="fd-disc" viewBox="0 0 300 300" aria-hidden="true">
      <circle className="fd-plate" cx="150" cy="150" r={r} />
      {v >= 0.9995 ? (
        <circle className="fd-slice" cx="150" cy="150" r={r} />
      ) : (
        v > 0.0005 && <path className="fd-slice" d={`M150 150 L150 ${150 - r} A${r} ${r} 0 ${v > 0.5 ? 1 : 0} 1 ${x} ${y} Z`} />
      )}
      {Array.from({ length: 12 }, (_, i) => {
        const t = (i / 12) * Math.PI * 2 - Math.PI / 2;
        return <line key={i} className="fd-tick" x1={150 + 132 * Math.cos(t)} y1={150 + 132 * Math.sin(t)} x2={150 + 142 * Math.cos(t)} y2={150 + 142 * Math.sin(t)} />;
      })}
      <circle className="fd-knob" cx="150" cy="150" r="9" />
    </svg>
  );
}

/** Placas: cada grupo de números numa placa que vira quando muda. */
function Flip({ text }: { text: string }) {
  const groups = text.split(':');
  return (
    <span className="ff-row" aria-hidden="true">
      {groups.map((g, i) => (
        <span key={i} className="ff-group">
          {i > 0 && <span className="ff-colon">:</span>}
          <span className="ff-card">
            <span key={g} className="ff-face">
              {g}
            </span>
          </span>
        </span>
      ))}
    </span>
  );
}

/** Maré: um nível que desce; onde a água passa, o número troca de cor. */
function Tide({ value, text, still }: { value: number; text: string; still?: boolean }) {
  const id = 'ft' + useId().replace(/[^a-zA-Z0-9]/g, '');
  const reduce = useReducedMotion();
  const v = Math.max(0, Math.min(1, value));
  // nível em unidades do viewBox; a crista da onda sobe 1,5 acima dele
  const level = 100 - v * 100;
  // <clipPath> não aceita <g>, então o nível vai direto nas coordenadas da onda
  let d = `M-100 ${level} Q-87.5 ${level - 3} -75 ${level}`;
  for (let x = -50; x <= 150; x += 25) d += ` T${x} ${level}`;
  d += ' V110 H-100 Z';
  const water = (
    <path d={d}>
      {!still && !reduce && <animateTransform attributeName="transform" type="translate" from="0 0" to="50 0" dur="4s" repeatCount="indefinite" />}
    </path>
  );
  const label = (
    <text x="50" y="50" textAnchor="middle" dominantBaseline="central">
      {text}
    </text>
  );
  return (
    <svg className="ft-tank" viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <clipPath id={`${id}-tank`}>
          <rect width="100" height="100" rx="30" />
        </clipPath>
        <clipPath id={`${id}-water`}>{water}</clipPath>
      </defs>
      <g clipPath={`url(#${id}-tank)`}>
        <rect className="ft-glass" width="100" height="100" />
        <g className="ft-water">{water}</g>
        <g className="ft-time">{label}</g>
        <g className="ft-time ft-ink" clipPath={`url(#${id}-water)`}>
          {label}
        </g>
      </g>
      <rect className="ft-edge" x="0.25" y="0.25" width="99.5" height="99.5" rx="29.8" />
    </svg>
  );
}

export function FocusClock({ style = 'ring', left, total, paused, idle, caption }: FocusClockProps) {
  const value = total ? Math.max(0, Math.min(1, left / total)) : 0;
  const time = (
    <span className="focus-time" aria-live="off">
      {mmss(left)}
    </span>
  );
  const cap = caption && <span className="focus-state">{caption}</span>;
  const state = cx(idle && 'idle', paused && 'paused');

  if (style === 'lens')
    return (
      <div className={cx('focus-clock fc-lens', state)}>
        <LensClock className="fc-lens-card" />
        <div className="fc-count">
          {time}
          <span className="fc-bar" aria-hidden="true">
            <i style={{ transform: `scaleX(${value})` }} />
          </span>
          {cap}
        </div>
      </div>
    );

  const bar = (
    <span className="fc-bar" aria-hidden="true">
      <i style={{ transform: `scaleX(${value})` }} />
    </span>
  );

  if (style === 'disc')
    return (
      <div className={cx('focus-clock fc-disc', state)}>
        <Disc value={value} />
        <div className="fc-count">
          {time}
          {cap}
        </div>
      </div>
    );

  if (style === 'flip')
    return (
      <div className={cx('focus-clock fc-flip', state)}>
        <span className="sr-only">{mmss(left)}</span>
        <Flip text={mmss(left)} />
        {bar}
        {cap}
      </div>
    );

  if (style === 'tide')
    return (
      <div className={cx('focus-clock fc-tide', state)}>
        <span className="sr-only">{mmss(left)}</span>
        <Tide value={value} text={mmss(left)} still={idle || paused} />
        {cap}
      </div>
    );

  if (style === 'digital')
    return (
      <div className={cx('focus-clock fc-digital', state)}>
        {time}
        <span className="fc-bar" aria-hidden="true">
          <i style={{ transform: `scaleX(${value})` }} />
        </span>
        {cap}
      </div>
    );

  return (
    <div className={cx('focus-clock focus-dial', state)}>
      <Ring value={value} />
      <div className="focus-center">
        {time}
        {cap}
      </div>
    </div>
  );
}

/** Cartões com prévia ao vivo de cada relógio. */
export function FocusClockPicker({ value, onChange }: { value?: FocusClockStyle; onChange: (v: FocusClockStyle) => void }) {
  return (
    <div className="clock-picker" role="radiogroup" aria-label="Relógio do Modo foco">
      {CLOCK_STYLES.map((c) => (
        <button key={c.value} type="button" role="radio" aria-checked={value === c.value} className={cx('clock-opt', value === c.value && 'on')} onClick={() => onChange(c.value)}>
          <span className="clock-preview" aria-hidden="true">
            <FocusClock style={c.value} left={18 * 60_000} total={25 * 60_000} />
          </span>
          <span className="clock-name">
            <b>{c.label}</b>
            <small>{c.hint}</small>
          </span>
          {value === c.value && (
            <i className="clock-check">
              <Check />
            </i>
          )}
        </button>
      ))}
    </div>
  );
}
