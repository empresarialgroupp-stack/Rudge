import { useMemo, useState, type ReactNode } from 'react';
import {
  Bell,
  CalendarDays,
  ClipboardCheck,
  Download,
  Flame,
  House,
  ListTodo,
  LogOut,
  Menu,
  Plus,
  Search,
  Settings,
  Target,
  AlarmClock,
  type LucideIcon,
} from 'lucide-react';
import { useStore } from '../lib/store';
import { logout, useSession } from '../lib/auth';
import { navigate, openModal, useRoute, type RouteName } from '../lib/ui';
import { todayKey } from '../lib/date';
import { isHabitDueOn } from '../lib/goals';
import { occurrencesBetween } from '../lib/recurrence';
import { BrandMark, cx, Modal } from './ui';
import { greetingTitle, todaySummary, displayName } from '../lib/summary';
import { ThemeToggle } from './ThemeToggle';
import { NotificationCenter } from './NotificationCenter';

interface NavDef {
  name: RouteName;
  label: string;
  icon: LucideIcon;
}

export const NAV: NavDef[] = [
  { name: 'inicio', label: 'Início', icon: House },
  { name: 'tarefas', label: 'Tarefas', icon: ListTodo },
  { name: 'metas', label: 'Metas', icon: Target },
  { name: 'habitos', label: 'Hábitos', icon: Flame },
  { name: 'lembretes', label: 'Lembretes', icon: AlarmClock },
  { name: 'agenda', label: 'Agenda', icon: CalendarDays },
  { name: 'revisao', label: 'Revisão semanal', icon: ClipboardCheck },
];

export const PAGE_META: Record<RouteName, { title: string; sub?: string }> = {
  inicio: { title: 'Início' },
  tarefas: { title: 'Tarefas', sub: 'Tudo o que precisa ser feito, organizado por prazo.' },
  metas: { title: 'Metas', sub: 'Objetivos com prazo, ritmo calculado e plano de ação.' },
  habitos: { title: 'Hábitos', sub: 'Pequenas ações diárias que constroem suas metas.' },
  lembretes: { title: 'Lembretes', sub: 'Peça e o Rudge lembra você na hora certa.' },
  agenda: { title: 'Agenda', sub: 'Tarefas, lembretes e prazos no calendário.' },
  revisao: { title: 'Revisão semanal', sub: 'Feche a semana e planeje a próxima em 5 minutos.' },
  instalar: { title: 'Instalar o Rudge', sub: 'Use como aplicativo no computador e no celular.' },
  configuracoes: { title: 'Configurações', sub: 'Aparência, notificações, dados e conta.' },
};

function useBadges() {
  const s = useStore();
  return useMemo(() => {
    const today = todayKey();
    const tasks = s.tasks.filter((t) => !t.done && t.due && t.due <= today).length;
    const now = Date.now();
    const reminders = s.reminders
      .filter((r) => !r.done)
      .reduce((n, r) => n + occurrencesBetween({ at: Date.parse(r.at), repeat: r.repeat, days: r.days }, now, now + 86_400_000).length, 0);
    const habits = s.habits.filter((h) => isHabitDueOn(h, today) && !h.log.includes(today)).length;
    return { tarefas: tasks, lembretes: reminders, habitos: habits } as Partial<Record<RouteName, number>>;
  }, [s.tasks, s.reminders, s.habits]);
}

function initials(name: string, email: string) {
  const src = name.trim() || email.split('@')[0];
  return src.slice(0, 1).toUpperCase();
}

export function Shell({ children }: { children: ReactNode }) {
  const route = useRoute();
  const s = useStore();
  const session = useSession();
  const badges = useBadges();
  const [bellOpen, setBellOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const unread = s.inbox.filter((i) => !i.read).length;
  const email = session?.email ?? '';
  const meta = route.name === 'inicio' ? { title: greetingTitle(s, email), sub: todaySummary(s) } : PAGE_META[route.name];
  const userName = s.settings.name || displayName(s, email);

  const go = (name: RouteName) => {
    navigate(name);
    setMoreOpen(false);
  };

  return (
    <div className="app">
      {/* Sidebar (desktop) */}
      <aside className="sidebar glass solid liquid">
        <div className="brand">
          <BrandMark />
          <span className="brand-name">Rudge</span>
        </div>
        <div className="side-actions">
          <button className="btn btn-primary" onClick={() => openModal({ type: 'quick-add' })}>
            <Plus /> Novo
          </button>
        </div>
        <button className="search-btn" onClick={() => openModal({ type: 'command' })}>
          <Search /> Buscar ou comandar <kbd>Ctrl K</kbd>
        </button>
        <nav className="nav">
          <div className="nav-label">Organização</div>
          {NAV.map((n) => (
            <button key={n.name} className={cx('nav-item', route.name === n.name && 'on')} onClick={() => go(n.name)}>
              <n.icon /> {n.label}
              {!!badges[n.name] && <span className="badge">{badges[n.name]}</span>}
            </button>
          ))}
        </nav>
        <div className="side-bottom">
          <button className={cx('nav-item', route.name === 'instalar' && 'on')} onClick={() => go('instalar')}>
            <Download /> Instalar app
          </button>
          <button className={cx('nav-item', route.name === 'configuracoes' && 'on')} onClick={() => go('configuracoes')}>
            <Settings /> Configurações
          </button>
          <div className="user-card">
            <div className="avatar">{initials(s.settings.name, email)}</div>
            <div className="who">
              <b>{userName}</b>
              <span>{email}</span>
            </div>
            <button className="icon-btn sm" onClick={logout} title="Sair" aria-label="Sair">
              <LogOut />
            </button>
          </div>
        </div>
      </aside>

      {/* Topo (mobile) */}
      <header className="mobile-top">
        <div className="brand">
          <BrandMark />
          <span className="brand-name">Rudge</span>
        </div>
        <button className="icon-btn btn-glass" onClick={() => openModal({ type: 'command' })} aria-label="Buscar">
          <Search />
        </button>
        <button className="icon-btn btn-glass" onClick={() => setBellOpen((v) => !v)} aria-label="Notificações">
          <Bell />
          {unread > 0 && <span className="dot">{unread > 9 ? '9+' : unread}</span>}
        </button>
        <ThemeToggle />
      </header>

      <main className="main">
        <div className="topbar">
          <div className="page-head">
            <h1 className="page-title">{meta.title}</h1>
            {meta.sub && <p className="page-sub">{meta.sub}</p>}
          </div>
          <div className="top-actions">
            <button className="icon-btn btn-glass" onClick={() => setBellOpen((v) => !v)} aria-label="Notificações" title="Notificações">
              <Bell />
              {unread > 0 && <span className="dot">{unread > 9 ? '9+' : unread}</span>}
            </button>
            <ThemeToggle />
          </div>
        </div>
        {route.name !== 'inicio' && (
          <div className="mobile-title only-mobile">
            <h1 className="page-title">{meta.title}</h1>
            {meta.sub && <p className="page-sub">{meta.sub}</p>}
          </div>
        )}
        <div className="content" key={route.name}>
          {children}
        </div>
      </main>

      {/* Barra de abas (mobile) */}
      <nav className="tabbar glass liquid">
        <button className={cx('tab', route.name === 'inicio' && 'on')} onClick={() => go('inicio')}>
          <House /> Início
        </button>
        <button className={cx('tab', route.name === 'tarefas' && 'on')} onClick={() => go('tarefas')}>
          <ListTodo /> Tarefas
        </button>
        <button className="tab-add" onClick={() => openModal({ type: 'quick-add' })} aria-label="Adicionar">
          <Plus />
        </button>
        <button className={cx('tab', route.name === 'metas' && 'on')} onClick={() => go('metas')}>
          <Target /> Metas
        </button>
        <button
          className={cx('tab', ['habitos', 'lembretes', 'agenda', 'revisao', 'instalar', 'configuracoes'].includes(route.name) && 'on')}
          onClick={() => setMoreOpen(true)}
        >
          <Menu /> Mais
        </button>
      </nav>

      {moreOpen && (
        <Modal title="Menu" onClose={() => setMoreOpen(false)} size="narrow">
          <div className="nav" style={{ marginTop: 0 }}>
            {[...NAV.slice(3), { name: 'instalar' as RouteName, label: 'Instalar app', icon: Download }, { name: 'configuracoes' as RouteName, label: 'Configurações', icon: Settings }].map((n) => (
              <button key={n.name} className={cx('nav-item', route.name === n.name && 'on')} onClick={() => go(n.name)} style={{ height: 46 }}>
                <n.icon /> {n.label}
                {!!badges[n.name] && <span className="badge">{badges[n.name]}</span>}
              </button>
            ))}
          </div>
          <div className="user-card">
            <div className="avatar">{initials(s.settings.name, email)}</div>
            <div className="who">
              <b>{userName}</b>
              <span>{email}</span>
            </div>
            <button className="btn btn-sm btn-glass" onClick={logout}>
              <LogOut /> Sair
            </button>
          </div>
        </Modal>
      )}

      {bellOpen && <NotificationCenter onClose={() => setBellOpen(false)} />}
    </div>
  );
}
