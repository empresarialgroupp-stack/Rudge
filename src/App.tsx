import { useEffect } from 'react';
import { useSession } from './lib/auth';
import { getState, useStore } from './lib/store';
import { openModal, useModals, useRoute } from './lib/ui';
import { startScheduler } from './lib/scheduler';
import { applyTheme } from './components/ThemeToggle';
import { Shell } from './components/Shell';
import { ModalHost, Toaster } from './components/Host';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Tasks } from './pages/Tasks';
import { Goals } from './pages/Goals';
import { Habits } from './pages/Habits';
import { Reminders } from './pages/Reminders';
import { CalendarPage } from './pages/Calendar';
import { Review } from './pages/Review';
import { Install } from './pages/Install';
import { SettingsPage } from './pages/Settings';

function Ambient() {
  return (
    <div className="ambient" aria-hidden="true">
      <div className="ring" />
      <div className="blob b1" />
      <div className="blob b2" />
      <div className="blob b3" />
      <div className="grid" />
      <div className="noise" />
    </div>
  );
}

/** Brilho do vidro que acompanha o cursor. */
function useSpotlight() {
  useEffect(() => {
    let raf = 0;
    let last: HTMLElement | null = null;
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const el = (e.target as HTMLElement | null)?.closest?.('.glass') as HTMLElement | null;
        if (last && last !== el) {
          last.style.removeProperty('--mx');
          last.style.removeProperty('--my');
        }
        if (el) {
          const r = el.getBoundingClientRect();
          el.style.setProperty('--mx', `${e.clientX - r.left}px`);
          el.style.setProperty('--my', `${e.clientY - r.top}px`);
        }
        last = el;
      });
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, []);
}

function Page() {
  const route = useRoute();
  switch (route.name) {
    case 'tarefas':
      return <Tasks />;
    case 'metas':
      return <Goals />;
    case 'habitos':
      return <Habits />;
    case 'lembretes':
      return <Reminders />;
    case 'agenda':
      return <CalendarPage />;
    case 'revisao':
      return <Review />;
    case 'instalar':
      return <Install />;
    case 'configuracoes':
      return <SettingsPage />;
    default:
      return <Dashboard />;
  }
}

function Authed() {
  const modals = useModals();
  useEffect(() => {
    void startScheduler();
    if (!getState().settings.onboarded) setTimeout(() => openModal({ type: 'onboarding' }), 600);
  }, []);

  // atalhos de teclado
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = /INPUT|TEXTAREA|SELECT/.test(target.tagName) || target.isContentEditable;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        openModal({ type: 'command' });
      } else if (!typing && !e.metaKey && !e.ctrlKey && !e.altKey && e.key.toLowerCase() === 'n' && !modals.length) {
        e.preventDefault();
        openModal({ type: 'quick-add' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modals.length]);

  return (
    <>
      <Shell>
        <Page />
      </Shell>
      <ModalHost />
    </>
  );
}

export function App() {
  const session = useSession();
  const { settings } = useStore();
  useSpotlight();

  useEffect(() => {
    applyTheme(settings.theme);
  }, [settings.theme]);

  return (
    <>
      <Ambient />
      {session ? <Authed /> : <Login />}
      <Toaster />
    </>
  );
}
