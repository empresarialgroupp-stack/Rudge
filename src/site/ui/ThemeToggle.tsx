import { useRef, useState } from 'react';
import { motion } from 'motion/react';

/**
 * Botão de tema com transição de tela (View Transitions API).
 * Baseado no Skiper 26 "Theme_buttons_002" da Skiper UI (skiper-ui.com),
 * conceito original de rudrodip. Adaptado ao Rudge: sem next-themes, o tema
 * fica em data-theme, e o círculo da transição nasce do próprio botão.
 */
export function ThemeToggle() {
  const ref = useRef<HTMLButtonElement>(null);
  const [isDark, setIsDark] = useState(() => document.documentElement.dataset.theme !== 'light');

  const toggle = () => {
    const next = isDark ? 'light' : 'dark';
    const root = document.documentElement;
    const apply = () => {
      root.dataset.theme = next;
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', next === 'light' ? '#f2f2f3' : '#000000');
    };
    try {
      localStorage.setItem('rudge:site:theme', next);
    } catch {
      /* navegação privada */
    }
    setIsDark(!isDark);

    const rect = ref.current?.getBoundingClientRect();
    if (rect) {
      root.style.setProperty('--vt-x', `${rect.left + rect.width / 2}px`);
      root.style.setProperty('--vt-y', `${rect.top + rect.height / 2}px`);
    }
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || typeof document.startViewTransition !== 'function') {
      apply();
      return;
    }
    document.startViewTransition(apply);
  };

  return (
    <button ref={ref} type="button" className="s-theme" onClick={toggle} aria-label={isDark ? 'Usar tema claro' : 'Usar tema escuro'}>
      <svg viewBox="0 0 240 240" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <motion.g animate={{ rotate: isDark ? -180 : 0 }} transition={{ ease: 'easeInOut', duration: 0.5 }}>
          <path d="M120 67.5C149.25 67.5 172.5 90.75 172.5 120C172.5 149.25 149.25 172.5 120 172.5" fill="white" />
          <path d="M120 67.5C90.75 67.5 67.5 90.75 67.5 120C67.5 149.25 90.75 172.5 120 172.5" fill="black" />
        </motion.g>
        <motion.path
          animate={{ rotate: isDark ? 180 : 0 }}
          transition={{ ease: 'easeInOut', duration: 0.5 }}
          d="M120 3.75C55.5 3.75 3.75 55.5 3.75 120C3.75 184.5 55.5 236.25 120 236.25C184.5 236.25 236.25 184.5 236.25 120C236.25 55.5 184.5 3.75 120 3.75ZM120 214.5V172.5C90.75 172.5 67.5 149.25 67.5 120C67.5 90.75 90.75 67.5 120 67.5V25.5C172.5 25.5 214.5 67.5 214.5 120C214.5 172.5 172.5 214.5 120 214.5Z"
          fill="white"
        />
      </svg>
    </button>
  );
}
