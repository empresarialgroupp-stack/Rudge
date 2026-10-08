import { Moon, Sun } from 'lucide-react';
import { useStore } from '../lib/store';
import { updateSettings } from '../lib/actions';

export function applyTheme(theme: 'dark' | 'light') {
  const root = document.documentElement;
  root.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#f2f2f3' : '#000000');
}

export function ThemeToggle() {
  const { settings } = useStore();
  const light = settings.theme === 'light';
  return (
    <button
      className="icon-btn btn-glass"
      onClick={() => updateSettings({ theme: light ? 'dark' : 'light' })}
      aria-label={light ? 'Mudar para modo escuro' : 'Mudar para modo white'}
      title={light ? 'Modo escuro' : 'Modo white'}
    >
      {light ? <Moon /> : <Sun />}
    </button>
  );
}
