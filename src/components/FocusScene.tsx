// Fundos do Modo foco: cenas feitas só com CSS (sem imagens externas, sem custo).
import type { FocusBg } from '../lib/types';
import { cx } from './ui';

export const FOCUS_BGS: { value: FocusBg; label: string }[] = [
  { value: 'none', label: 'Liso' },
  { value: 'aurora', label: 'Aurora' },
  { value: 'poente', label: 'Pôr do sol' },
  { value: 'oceano', label: 'Oceano' },
  { value: 'floresta', label: 'Floresta' },
  { value: 'noite', label: 'Noite' },
  { value: 'dunas', label: 'Dunas' },
];

/** Cena atrás do relógio. Não desenha nada no fundo "Liso". */
export function FocusScene({ bg }: { bg?: FocusBg }) {
  if (!bg || bg === 'none') return null;
  return <div className={cx('focus-scene', `scene-${bg}`)} aria-hidden="true" />;
}

export function FocusBgPicker({ value, onChange }: { value?: FocusBg; onChange: (v: FocusBg) => void }) {
  const cur = value ?? 'none';
  return (
    <div className="focus-bg-picker" role="radiogroup" aria-label="Fundo do Modo foco">
      {FOCUS_BGS.map((b) => (
        <button
          key={b.value}
          type="button"
          role="radio"
          aria-checked={cur === b.value}
          className={cx('focus-bg-opt', cur === b.value && 'on')}
          onClick={() => onChange(b.value)}
        >
          <i className={cx('focus-bg-swatch', `scene-${b.value}`)} />
          <span>{b.label}</span>
        </button>
      ))}
    </div>
  );
}
