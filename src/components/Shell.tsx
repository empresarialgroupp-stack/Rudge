import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
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
  NotebookPen,
  Menu,
  Mic,
  Plus,
  Search,
  Settings,
  Target,
  AlarmClock,
  WalletCards,
  type LucideIcon,
} from 'lucide-react';
import { useStore } from '../lib/store';
import { logout, useSession } from '../lib/auth';
import { navigate, openModal, useRoute, type RouteName } from '../lib/ui';
import { greeting, todayKey } from '../lib/date';
import { isHabitDueOn } from '../lib/goals';
import { occurrencesBetween } from '../lib/recurrence';
import { AnimatePresence } from 'motion/react';
import { BrandMark, cx, Leave, Modal } from './ui';
import { displayName } from '../lib/summary';
import { ThemeSwitch, ThemeToggle } from './ThemeToggle';
import { LiquidTabBar } from './LiquidTabBar';
import { FocusPill } from './FocusMode';
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
  { name: 'diario', label: 'Diário', icon: NotebookPen },
  { name: 'carteira', label: 'Carteira', icon: WalletCards },
];

export const PAGE_META: Record<RouteName, { title: string; sub?: string }> = {
  inicio: { title: 'Início', sub: 'Seu dia em um só lugar' },
  tarefas: { title: 'Tarefas', sub: 'Tudo o que precisa ser feito, organizado por prazo.' },
  metas: { title: 'Metas', sub: 'Objetivos com prazo, ritmo calculado e plano de ação.' },
  habitos: { title: 'Hábitos', sub: 'Pequenas ações diárias que constroem suas metas.' },
  lembretes: { title: 'Lembretes', sub: 'Peça e o Rudge lembra você na hora certa.' },
  agenda: { title: 'Agenda', sub: 'Tarefas, lembretes e prazos no calendário.' },
  revisao: { title: 'Revisão semanal', sub: 'Feche a semana e planeje a próxima em 5 minutos.' },
  diario: { title: 'Diário', sub: 'Um minuto por noite: o que deu certo, o que travou e a nota do dia.' },
  carteira: { title: 'Carteira', sub: 'Seus cartões, quanto entrou, quanto saiu e os 10% para guardar.' },
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
      .filter((r) => !r.done && !r.place)
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
    { name: 'diario', label: 'Diário' },
  ],
  [
    { name: 'tarefas', label: 'Tarefas' },
    { name: 'lembretes', label: 'Lembretes' },
  ],
  [
    { name: 'metas', label: 'Metas' },
    { name: 'habitos', label: 'Hábitos' },
  ],
  [{ name: 'carteira', label: 'Carteira' }],
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

/** Nomes curtos para a aba "onde estou" da barra de baixo. */
const DOCK_LABEL: Partial<Record<RouteName, string>> = { revisao: 'Revisão', instalar: 'Instalar', configuracoes: 'Ajustes' };

const MORE: RouteName[] = ['habitos', 'lembretes', 'agenda', 'revisao', 'diario', 'carteira', 'instalar', 'configuracoes'];

/**
 * Navegação do trilho lateral (computador). O destaque do item ativo é uma peça
 * única que desliza entre os itens (mesma mola do seletor de tema) e pode ser
 * arrastada: ao soltar, abre a página do item mais próximo.
 */
function RailNav({
  items,
  route,
  badges,
  onGo,
}: {
  items: NavDef[];
  route: RouteName;
  badges: Partial<Record<RouteName, number>>;
  onGo: (r: RouteName) => void;
}) {
  const navRef = useRef<HTMLElement>(null);
  const drag = useRef<{ id: number; startY: number; base: number; tops: number[]; moved: boolean } | null>(null);
  const skipClick = useRef(false);
  const [rest, setRest] = useState<number | null>(null); // posição de repouso (topo do item ativo)
  const [dragY, setDragY] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null); // item sob o destaque enquanto arrasta

  const active = items.findIndex((n) => n.name === route);
  const tops = () => Array.from(navRef.current?.querySelectorAll<HTMLElement>('.rail-item') ?? []).map((el) => el.offsetTop);

  useLayoutEffect(() => {
    setRest(active < 0 ? null : tops()[active] ?? null);
  }, [active, items.length]);

  const nearest = (y: number, list: number[]) => list.reduce((best, t, i) => (Math.abs(t - y) < Math.abs(list[best] - y) ? i : best), 0);

  const onDown = (e: ReactPointerEvent<HTMLElement>) => {
    skipClick.current = false;
    if (e.button !== 0 || active < 0) return;
    const item = (e.target as HTMLElement).closest('.rail-item');
    if (!item || !item.classList.contains('on')) return; // só o destaque é arrastável
    const list = tops();
    drag.current = { id: e.pointerId, startY: e.clientY, base: list[active], tops: list, moved: false };
  };

  const onMove = (e: ReactPointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dy = e.clientY - d.startY;
    if (!d.moved) {
      if (Math.abs(dy) < 5) return;
      d.moved = true;
      navRef.current?.setPointerCapture(e.pointerId);
    }
    const y = Math.min(d.tops[d.tops.length - 1], Math.max(d.tops[0], d.base + dy));
    setDragY(y);
    setOver(nearest(y, d.tops));
  };

  const onUp = (e: ReactPointerEvent<HTMLElement>, cancel = false) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (!d.moved) return;
    skipClick.current = true; // o clique que vem depois de soltar não deve navegar de novo
    const target = cancel || dragY == null ? active : nearest(dragY, d.tops);
    setDragY(null);
    setOver(null);
    if (target !== active && items[target]) onGo(items[target].name);
  };

  const dragging = dragY != null;
  const y = dragY ?? rest;
  const lit = over ?? active;

  return (
    <nav
      ref={navRef}
      className={cx('rail-group glass solid rail-nav', rest != null && 'has-thumb', dragging && 'dragging')}
      aria-label="Navegação"
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={(e) => onUp(e)}
      onPointerCancel={(e) => onUp(e, true)}
      onClickCapture={(e) => {
        if (skipClick.current) {
          skipClick.current = false;
          e.preventDefault();
          e.stopPropagation();
        }
      }}
    >
      {y != null && (
        <span className="rail-track" aria-hidden="true">
          <span className="rail-thumb" style={{ transform: `translateY(${y}px)${dragging ? ' scale(1.06)' : ''}` }} />
        </span>
      )}
      {items.map((n, i) => (
        <button
          key={n.name}
          className={cx('rail-item', i === lit && 'on')}
          onClick={() => onGo(n.name)}
          aria-label={n.label}
          aria-current={n.name === route ? 'page' : undefined}
          data-tip={n.label}
          draggable={false}
        >
          <n.icon />
          {!!badges[n.name] && <span className="rail-badge">{badges[n.name]! > 9 ? '9+' : badges[n.name]}</span>}
        </button>
      ))}
    </nav>
  );
}

/** Página nova começa do topo (a troca acontece com a anterior já invisível). */
function ScrollTop() {
  useLayoutEffect(() => {
    if (window.scrollY > 0) window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, []);
  return null;
}

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

  // Celular estreito: as abas do topo rolam para o lado; a aba da página atual fica sempre à vista.
  const mTabs = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const show = () => {
      const box = mTabs.current;
      const on = box?.querySelector<HTMLElement>('.ltb-row:not(.ltb-ink) .ltb-slot.on');
      if (!box || !on || box.scrollWidth <= box.clientWidth) return;
      const b = box.getBoundingClientRect();
      const r = on.getBoundingClientRect();
      if (r.left < b.left + 8) box.scrollLeft += r.left - b.left - 8;
      else if (r.right > b.right - 8) box.scrollLeft += r.right - b.right + 8;
    };
    show();
    // as larguras das abas são medidas depois da primeira pintura
    const t = setTimeout(show, 450);
    return () => clearTimeout(t);
  }, [route.name]);

  const go = (name: RouteName) => {
    navigate(name);
    setMoreOpen(false);
    setUserOpen(false);
  };

  const railItems: NavDef[] = [...NAV, { name: 'instalar', label: 'Instalar app', icon: Download }, { name: 'configuracoes', label: 'Configurações', icon: Settings }];

  const moreBadge = (badges.lembretes ?? 0) + (badges.habitos ?? 0);
  // Fora das três abas fixas, a quarta aba mostra a página em que a pessoa está (e continua abrindo o menu).
  const here = MORE.includes(route.name) ? route.name : null;
  const dockTabs = useMemo(() => {
    const cur = here ? railItems.find((n) => n.name === here) : undefined;
    const HereIcon = cur?.icon ?? Menu;
    const dockBadge = (here ? badges[here] : moreBadge) ?? 0;
    return [
      { value: 'inicio', label: 'Início', icon: <House /> },
      { value: 'tarefas', label: 'Tarefas', icon: <ListTodo />, badge: badges.tarefas || undefined, badgeLabel: badges.tarefas ? `${badges.tarefas} para hoje` : undefined },
      { value: 'metas', label: 'Metas', icon: <Target /> },
      {
        value: 'mais',
        label: here ? DOCK_LABEL[here] ?? PAGE_META[here].title : 'Mais',
        icon: <HereIcon />,
        // na página atual o contador é o dela (igual ao do trilho do computador); em "Mais", a soma
        badge: dockBadge || undefined,
        badgeLabel: `${dockBadge} pendentes, abrir menu`,
      },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [badges, moreBadge, here]);

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
            <AnimatePresence>
            {userOpen && (
              <Leave key="user-menu" ms={180}>
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
              </Leave>
            )}
            </AnimatePresence>
          </div>
        </div>
      </header>

      {/* Trilho lateral (computador) */}
      <aside className="rail">
        <div className="rail-group glass solid">
          <ThemeSwitch />
        </div>
        <RailNav items={railItems} route={route.name} badges={badges} onGo={go} />
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
        <div className="mobile-tabs only-mobile" ref={mTabs}>
          <PillTabs id="m-tabs" route={route.name} onGo={go} />
        </div>
        {/* troca de página: a atual sai num fade curto e a nova entra subindo */}
        <AnimatePresence mode="wait" initial={false}>
          <Leave key={route.name} ms={150} className="page-view">
            <ScrollTop />
            {route.name !== 'inicio' && (
              <div className="page-head">
                {meta.sub && <p className="overline">{meta.sub}</p>}
                <h1 className="page-title">{meta.title}</h1>
              </div>
            )}
            <div className="content stagger">{children}</div>
          </Leave>
        </AnimatePresence>
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

      <AnimatePresence>
      {moreOpen && (
        <Leave key="more" ms={280}>
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
        </Leave>
      )}
      </AnimatePresence>

      <FocusPill />
      <AnimatePresence>
        {bellOpen && (
          <Leave key="bell" ms={180}>
            <NotificationCenter onClose={() => setBellOpen(false)} />
          </Leave>
        )}
      </AnimatePresence>
    </div>
  );
}
