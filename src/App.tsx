import { useEffect, useState } from 'react';
import { useSession } from './lib/auth';
import { getState, useStore } from './lib/store';
import { openModal, useModals, useRoute } from './lib/ui';
import { present, startScheduler } from './lib/scheduler';
import { startPush } from './lib/push';
import { startCloud } from './lib/cloud';
import { startFocusWatcher } from './lib/focus';
import { startGeo } from './lib/geo';
import { applyTheme } from './components/ThemeToggle';
import { Shell } from './components/Shell';
import { ModalHost, Toaster } from './components/Host';
import { FirstRunTour } from './components/FirstRunTour';
import { Login } from './pages/Login';
import { CurtainHost, EntryLayer, GooFilter, PinScreen, playCurtain } from './components/Entry';
import { hasPin, pinResetPending, pinSupported, pinUndecided, turnOffPin, unlock, useLocked } from './lib/pin';
import { useCloudStatus } from './lib/cloud';
import { PlanLocked } from './components/Integrations';
import { appBlocked, useAccess } from './lib/access';
import { Dashboard } from './pages/Dashboard';
import { Tasks } from './pages/Tasks';
import { Goals } from './pages/Goals';
import { Habits } from './pages/Habits';
import { Reminders } from './pages/Reminders';
import { CalendarPage } from './pages/Calendar';
import { Review } from './pages/Review';
import { Journal } from './pages/Journal';
import { WalletPage } from './pages/Wallet';
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
    case 'diario':
      return <Journal />;
    case 'carteira':
      return <WalletPage />;
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
    startCloud();
    void startScheduler().then(() => startPush());
    startFocusWatcher();
    startGeo((r, place) =>
      void present({
        key: `place:${r.id}:${Date.now()}`,
        at: Date.now(),
        title: r.title,
        body: `${r.place?.on === 'arrive' ? 'Você chegou em' : 'Você saiu de'} ${place.name}`,
        kind: 'place',
        refId: r.id,
        url: '#/lembretes',
        actions: [],
        grace: 3_600_000,
        snoozeMin: 10,
        requireInteraction: true,
      }),
    );
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
      <FirstRunTour />
      <PinSetupPrompt />
    </>
  );
}

/**
 * Depois da atualização (ou de "Esqueci o PIN"), oferece criar o PIN de entrada uma vez.
 * Espera a conta sincronizar para não pedir um PIN que outro aparelho já criou.
 */
function PinSetupPrompt() {
  const { settings } = useStore();
  const modals = useModals();
  const cloud = useCloudStatus();
  const [synced, setSynced] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (cloud.state === 'ok') setSynced(true);
  }, [cloud.state]);
  useEffect(() => {
    if (open || !synced || !pinSupported() || !settings.onboarded || !settings.tourSeen || modals.length) return;
    if (!pinUndecided() && !pinResetPending()) return;
    const t = setTimeout(() => setOpen(true), 900);
    return () => clearTimeout(t);
  }, [open, synced, settings.onboarded, settings.tourSeen, settings.lock, modals.length]);
  if (!open) return null;
  return (
    <EntryLayer>
      <PinScreen
        flow="create"
        cancelLabel="Agora não"
        onCancel={() => {
          if (!hasPin()) turnOffPin();
          else localStorage.removeItem('rudge:pin-reset');
          setOpen(false);
        }}
        onDone={() => playCurtain(() => setOpen(false))}
      />
    </EntryLayer>
  );
}

/** Plano da conta: bloqueia só quando o servidor diz que o plano não inclui o Rudge app. */
function Gate() {
  const access = useAccess();
  return appBlocked(access) ? <PlanLocked /> : <Authed />;
}

export function App() {
  const session = useSession();
  const locked = useLocked();
  const { settings } = useStore();
  // ao entrar, a cortina cobre a tela antes de trocar o login pelo app
  const [shown, setShown] = useState(session);
  useEffect(() => {
    if (session && !shown) playCurtain(() => setShown(session));
    else setShown(session);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);
  const [lockSplash] = useState(locked);
  useSpotlight();

  useEffect(() => {
    applyTheme(settings.theme);
  }, [settings.theme]);

  return (
    <>
      <Ambient />
      <GooFilter />
      {shown ? (
        <div className="app-root" inert={locked}>
          <Gate />
        </div>
      ) : (
        <Login />
      )}
      {shown && locked && (
        <EntryLayer>
          <PinScreen flow="unlock" splash={lockSplash} onDone={() => playCurtain(unlock)} />
        </EntryLayer>
      )}
      <Toaster />
      <CurtainHost />
    </>
  );
}
