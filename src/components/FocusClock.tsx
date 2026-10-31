// Relógio do Modo foco. Fica isolado para poder ser trocado por outro
// componente sem mexer na tela: recebe só o tempo que falta e o total.
import { cx } from './ui';

export const mmss = (ms: number) => {
  const t = Math.ceil(ms / 1000);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

export interface FocusClockProps {
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

export function FocusClock({ left, total, paused, idle, caption }: FocusClockProps) {
  return (
    <div className={cx('focus-dial', idle && 'idle', paused && 'paused')}>
      <Ring value={total ? left / total : 0} />
      <div className="focus-center">
        <span className="focus-time" aria-live="off">
          {mmss(left)}
        </span>
        {caption && <span className="focus-state">{caption}</span>}
      </div>
    </div>
  );
}
