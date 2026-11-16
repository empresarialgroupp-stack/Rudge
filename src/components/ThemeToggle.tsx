import { flushSync } from 'react-dom';
import { Moon, Sun } from 'lucide-react';
import { useStore } from '../lib/store';
import { updateSettings } from '../lib/actions';
import { cx } from './ui';
import { Button } from 'glisse';

type Theme = 'dark' | 'light';

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#f2f2f3' : '#000000');
}

/** O navegador anima a máscara com borda desfocada? (View Transitions + @property + mask) */
function canReveal() {
  if (typeof document === 'undefined' || !document.startViewTransition) return false;
  if (typeof CSS === 'undefined' || !('registerProperty' in CSS)) return false;
  const g = 'radial-gradient(circle, #000 0px, transparent 1px)';
  return CSS.supports('mask-image', g) || CSS.supports('-webkit-mask-image', g);
}

/**
 * Troca o tema abrindo um círculo a partir do botão tocado (View Transitions).
 * Só a borda do círculo é desfocada (máscara radial com 90px de degradê); o
 * interior e o resto da tela ficam nítidos o tempo todo.
 */
export function setTheme(theme: Theme, origin?: Element | null) {
  const change = () => {
    flushSync(() => updateSettings({ theme }));
    applyTheme(theme);
  };
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (!origin || reduce || !canReveal()) return change();

  const root = document.documentElement;
  const r = origin.getBoundingClientRect();
  const x = r.left + r.width / 2;
  const y = r.top + r.height / 2;
  const edge = 90;
  const end = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y)) + edge;

  root.style.setProperty('--vt-x', `${x}px`);
  root.style.setProperty('--vt-y', `${y}px`);
  // sem transições de cor enquanto a tela nova é fotografada (senão sai com as cores dos dois temas)
  root.classList.add('theme-switching', 'vt-reveal');

  let vt: ViewTransition;
  try {
    vt = document.startViewTransition(change);
  } catch {
    root.classList.remove('theme-switching', 'vt-reveal');
    return change();
  }
  vt.ready
    .then(() => {
      root.animate(
        { '--vt-r': ['0px', `${end}px`] } as unknown as Keyframe[],
        { duration: 900, easing: 'cubic-bezier(0.45, 0, 0.2, 1)', fill: 'both', pseudoElement: '::view-transition-new(root)' },
      );
    })
    .catch(() => {});
  vt.finished.finally(() => {
    root.classList.remove('theme-switching', 'vt-reveal');
    root.style.removeProperty('--vt-x');
    root.style.removeProperty('--vt-y');
  });
}

export function ThemeToggle() {
  const { settings } = useStore();
  const light = settings.theme === 'light';
  return (
    <Button
      className="icon-btn"
      onClick={(e) => setTheme(light ? 'dark' : 'light', e.currentTarget)}
      aria-label={light ? 'Mudar para modo escuro' : 'Mudar para modo white'}
      title={light ? 'Modo escuro' : 'Modo white'}
    >
      {light ? <Moon /> : <Sun />}
    </Button>
  );
}

/** Seletor sol/lua vertical da barra lateral. */
export function ThemeSwitch() {
  const { settings } = useStore();
  const light = settings.theme === 'light';
  return (
    <div className={cx('theme-switch', light && 'is-light')} role="radiogroup" aria-label="Tema">
      <span className="ts-thumb" aria-hidden="true" />
      <button role="radio" aria-checked={light} data-tip="Modo white" onClick={(e) => !light && setTheme('light', e.currentTarget)}>
        <Sun />
      </button>
      <button role="radio" aria-checked={!light} data-tip="Modo escuro" onClick={(e) => light && setTheme('dark', e.currentTarget)}>
        <Moon />
      </button>
    </div>
  );
}
