// Relógios do Modo foco. Cada estilo recebe só o tempo que falta e o total;
// o usuário escolhe o seu na primeira vez e pode trocar nas Configurações.
import { Check } from 'lucide-react';
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
