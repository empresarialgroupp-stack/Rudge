import { useMemo, useState, type ReactNode } from 'react';
import {
  Bell,
  CalendarDays,
  ChevronDown,
  ClipboardCheck,
  Download,
  Flame,
  House,
  ListTodo,
  LogOut,
  Menu,
  Mic,
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
import { greeting, todayKey } from '../lib/date';
import { isHabitDueOn } from '../lib/goals';
import { occurrencesBetween } from '../lib/recurrence';
import { BrandMark, cx, Modal } from './ui';
import { displayName } from '../lib/summary';
import { ThemeSwitch, ThemeToggle } from './ThemeToggle';
import { LiquidTabBar } from './LiquidTabBar';
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
  inicio: { title: 'Início', sub: 'Seu dia em um só lugar' },
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

/** Abas em pílula do topo: páginas irmãs da seção atual. */
const GROUPS: { name: RouteName; label: string }[][] = [
  [
    { name: 'inicio', label: 'Visão geral' },
    { name: 'agenda', label: 'Agenda' },
    { name: 'revisao', label: 'Revisão' },
  ],
  [
    { name: 'tarefas', label: 'Tarefas' },
    { name: 'lembretes', label: 'Lembretes' },
  ],
  [
    { name: 'metas', label: 'Metas' },
    { name: 'habitos', label: 'Hábitos' },
  ],
  [
    { name: 'configuracoes', label: 'Configurações' },
    { name: 'instalar', label: 'Instalar' },
  ],
];

function PillTabs({ route, onGo, id }: { route: RouteName; onGo: (r: RouteName) => void; id: string }) {
  const group = GROUPS.find((g) => g.some((t) => t.name === route)) ?? GROUPS[0];
  const tabs = useMemo(() => group.map((t) => ({ value: t.name, label: t.label })), [group]);
  return <LiquidTabBar key={group[0].name} id={id} label="Páginas desta seção" labels="always" tabs={tabs} value={route} onValueChange={(v) => onGo(v as RouteName)} />;
}

const MORE: RouteName[] = ['habitos', 'lembretes', 'agenda', 'revisao', 'instalar', 'configuracoes'];

export function Shell({ children }: { children: ReactNode }) {
  const route = useRoute();
  const s = useStore();
  const session = useSession();
  const badges = useBadges();
  const [bellOpen, setBellOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const unread = s.inbox.filter((i) => !i.read).length;
  const email = session?.email ?? '';
  const meta = PAGE_META[route.name];
  const userName = s.settings.name || displayName(s, email);

  const go = (name: RouteName) => {
    navigate(name);
    setMoreOpen(false);
    setUserOpen(false);
  };

  const moreBadge = (badges.lembretes ?? 0) + (badges.habitos ?? 0);
  const dockTabs = useMemo(
    () => [
      { value: 'inicio', label: 'Início', icon: <House /> },
      { value: 'tarefas', label: 'Tarefas', icon: <ListTodo />, badge: badges.tarefas || undefined, badgeLabel: badges.tarefas ? `${badges.tarefas} para hoje` : undefined },
      { value: 'metas', label: 'Metas', icon: <Target /> },
      { value: 'mais', label: 'Mais', icon: <Menu />, badge: moreBadge || undefined, badgeLabel: moreBadge ? `${moreBadge} pendentes` : undefined },
    ],
    [badges.tarefas, moreBadge],
  );

  const railItems: NavDef[] = [...NAV, { name: 'instalar', label: 'Instalar app', icon: Download }, { name: 'configuracoes', label: 'Configurações', icon: Settings }];

  return (
    <div className="app">
      {/* Topo (computador) */}
      <header className="topnav glass solid liquid">
        <button className="brand" onClick={() => go('inicio')} aria-label="Rudge — início">
          <BrandMark className="brand-orb" />
          <span className="brand-txt">
            <b>Rudge</b>
            <small>Organização pessoal</small>
          </span>
        </button>
        <PillTabs id="top-tabs" route={route.name} onGo={go} />
        <div className="topnav-right">
          <button className="search-pill" onClick={() => openModal({ type: 'command' })}>
            <Search /> <span>Buscar</span> <kbd>Ctrl K</kbd>
          </button>
          <button className="icon-btn btn-glass" onClick={() => openModal({ type: 'voice' })} aria-label="Falar com o Rudge" title="Falar com o Rudge">
            <Mic />
          </button>
          <button className="icon-btn btn-glass" onClick={() => setBellOpen((v) => !v)} aria-label="Notificações" title="Notificações">
            <Bell />
            {unread > 0 && <span className="dot">{unread > 9 ? '9+' : unread}</span>}
          </button>
          <button className="btn btn-primary btn-pill" onClick={() => openModal({ type: 'quick-add' })}>
            <Plus /> Novo
          </button>
          <div className="user-chip-wrap">
            <button className="user-chip" onClick={() => setUserOpen((v) => !v)} aria-expanded={userOpen}>
              <span className="avatar">{initials(s.settings.name, email)}</span>
              <span className="who">
                <small>{greeting()}</small>
                <b>{userName}</b>
              </span>
              <ChevronDown className="chev" />
            </button>
            {userOpen && (
              <>
                <div className="click-away" onClick={() => setUserOpen(false)} />
                <div className="user-menu glass strong">
                  <div className="um-head">
                    <b>{userName}</b>
                    <span>{email}</span>
                  </div>
                  <button onClick={() => go('configuracoes')}>
                    <Settings /> Configurações
                  </button>
                  <button onClick={() => go('instalar')}>
                    <Download /> Instalar app
                  </button>
                  <button onClick={logout}>
                    <LogOut /> Sair
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Trilho lateral (computador) */}
      <aside className="rail">
        <div className="rail-group glass solid">
          <ThemeSwitch />
        </div>
        <nav className="rail-group glass solid" aria-label="Navegação">
          {railItems.map((n) => (
            <button
              key={n.name}
              className={cx('rail-item', route.name === n.name && 'on')}
              onClick={() => go(n.name)}
              aria-label={n.label}
              data-tip={n.label}
            >
              <n.icon />
              {!!badges[n.name] && <span className="rail-badge">{badges[n.name]! > 9 ? '9+' : badges[n.name]}</span>}
            </button>
          ))}
        </nav>
      </aside>

      {/* Topo (mobile) */}
      <header className="mobile-top">
        <div className="brand">
          <BrandMark />
          <span className="brand-name">Rudge</span>
        </div>
        <button className="icon-btn btn-glass" onClick={() => openModal({ type: 'voice' })} aria-label="Falar">
          <Mic />
        </button>
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
        <div className="mobile-tabs only-mobile">
          <PillTabs id="m-tabs" route={route.name} onGo={go} />
        </div>
        {route.name !== 'inicio' && (
          <div className="page-head" key={`h-${route.name}`}>
            {meta.sub && <p className="overline">{meta.sub}</p>}
            <h1 className="page-title">{meta.title}</h1>
          </div>
        )}
        <div className="content stagger" key={route.name}>
          {children}
        </div>
      </main>

      {/* Barra de abas líquida (mobile) */}
      <div className="tabdock">
        <div className="dock-bar glass liquid">
          <LiquidTabBar
            id="dock"
            label="Navegação principal"
            tabs={dockTabs}
            value={moreOpen ? 'mais' : MORE.includes(route.name) ? 'mais' : route.name}
            onValueChange={(v) => (v === 'mais' ? setMoreOpen(true) : go(v as RouteName))}
          />
        </div>
        <button className="dock-add" onClick={() => openModal({ type: 'quick-add' })} aria-label="Adicionar">
          <Plus />
        </button>
      </div>

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
