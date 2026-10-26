import { flushSync } from 'react-dom';
import { Moon, Sun } from 'lucide-react';
import { useStore } from '../lib/store';
import { updateSettings } from '../lib/actions';
import { cx } from './ui';

type Theme = 'dark' | 'light';

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#f2f2f3' : '#000000');
}

/** Troca o tema abrindo um círculo a partir do botão tocado (View Transitions). */
export function setTheme(theme: Theme, origin?: Element | null) {
  const change = () => {
    flushSync(() => updateSettings({ theme }));
    applyTheme(theme);
  };
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (!origin || reduce || !document.startViewTransition) return change();
  const r = origin.getBoundingClientRect();
  const x = r.left + r.width / 2;
  const y = r.top + r.height / 2;
  const end = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  document.startViewTransition(change).ready.then(() => {
    document.documentElement.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${end}px at ${x}px ${y}px)`] },
      { duration: 620, easing: 'cubic-bezier(.65,0,.35,1)', pseudoElement: '::view-transition-new(root)' },
    );
  });
}

export function ThemeToggle() {
  const { settings } = useStore();
  const light = settings.theme === 'light';
  return (
    <button
      className="icon-btn btn-glass"
      onClick={(e) => setTheme(light ? 'dark' : 'light', e.currentTarget)}
      aria-label={light ? 'Mudar para modo escuro' : 'Mudar para modo white'}
      title={light ? 'Modo escuro' : 'Modo white'}
    >
      {light ? <Moon /> : <Sun />}
    </button>
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
