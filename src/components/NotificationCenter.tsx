import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlarmClock,
  BellOff,
  ClipboardCheck,
  Flame,
  ListTodo,
  Sun,
  Target,
  Trash2,
  Moon,
  Bell,
  Timer,
  MapPin,
  Sparkles,
  Check,
  Clock,
  type LucideIcon,
} from 'lucide-react';
import type { InboxItem, NotifKind } from '../lib/types';
import { useStore } from '../lib/store';
import { clearInbox, dismissInbox, markInboxRead, restoreInbox } from '../lib/actions';
import { buildQueue, handleAction, stillPending, type NotifData, type QueueItem } from '../lib/scheduler';
import { formatWhen, fromNow } from '../lib/date';
import { navigate, toast } from '../lib/ui';
import { Empty, Segmented } from './ui';
import { SwipeableList, type SwipeAction, type SwipeableListItem } from './SwipeableList';

const ACTIONABLE: NotifKind[] = ['reminder', 'task', 'habit'];

/** Descobre o item de origem de um aviso (avisos antigos não guardavam: lê da chave). */
export function inboxRef(n: InboxItem): { refId?: string; occ?: number } {
  if (n.refId) return { refId: n.refId, occ: n.occ };
  const m = /^(rem|task|habit):([^:]+):(.+)$/.exec(n.key);
  if (!m) return {};
  if (m[1] === 'habit') {
    const [y, mo, d] = m[3].split('-').map(Number);
    return { refId: m[2], occ: y && mo && d ? new Date(y, mo - 1, d, 12).getTime() : undefined };
  }
  const occ = Number(m[3]);
  return { refId: m[2], occ: Number.isFinite(occ) ? occ : undefined };
}

function toData(n: { key: string; kind: NotifKind; url: string; title: string; body: string; snoozeMin?: number }, ref: { refId?: string; occ?: number }): NotifData {
  return { key: n.key, kind: n.kind, url: n.url, title: n.title, body: n.body, refId: ref.refId, occ: ref.occ, snoozeMin: n.snoozeMin || 10 };
}

const doneAction = (data: NotifData): SwipeAction => ({
  id: 'done',
  label: 'Concluir',
  icon: <Check />,
  tone: 'success',
  onClick: () => handleAction('done', data),
});

export const KIND_ICON: Record<NotifKind, LucideIcon> = {
  reminder: AlarmClock,
  task: ListTodo,
  habit: Flame,
  goal: Target,
  deadline: Target,
  briefing: Sun,
  review: Moon,
  weekly: ClipboardCheck,
  snooze: AlarmClock,
  focus: Timer,
  place: MapPin,
  retro: Sparkles,
  test: Bell,
};

export function NotificationCenter({ onClose }: { onClose: () => void }) {
  const s = useStore();
  const [tab, setTab] = useState<'recent' | 'next'>('recent');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(markInboxRead, 1200);
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    setTimeout(() => document.addEventListener('mousedown', onDown), 0);
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const upcoming = useMemo(() => {
    const now = Date.now();
    return buildQueue(s, now)
      .filter((q) => q.at > now && q.at < now + 48 * 3_600_000)
      .slice(0, 25);
  }, [s]);

  const inbox = useMemo(() => s.inbox.filter((n) => !n.dismissed), [s.inbox]);

  const open = (url: string) => {
    navigate(url);
    onClose();
  };

  const recentItems: SwipeableListItem[] = inbox.map((n) => {
    const I = KIND_ICON[n.kind] ?? Bell;
    const ref = inboxRef(n);
    const pending = ACTIONABLE.includes(n.kind) && stillPending({ kind: n.kind, ...ref });
    const data = toData(n, ref);
    const min = data.snoozeMin;
    return {
      id: n.id,
      onPress: () => open(n.url),
      content: <NotifContent icon={I} title={n.title} body={n.body} when={fromNow(n.at)} unread={!n.read} />,
      title: n.title,
      leftActions: pending
        ? [
            doneAction(data),
            { id: 'snooze', label: `Adiar ${min} min`, icon: <Clock />, tone: 'warning', onClick: () => handleAction('snooze', data) },
          ]
        : [],
      rightActions: [
        {
          id: 'dismiss',
          label: 'Apagar',
          icon: <Trash2 />,
          tone: 'danger',
          onClick: () => {
            dismissInbox(n.id);
            toast({ title: 'Aviso apagado', body: n.title, icon: 'check', actions: [{ label: 'Desfazer', run: () => restoreInbox(n.id) }] });
          },
        },
      ],
    };
  });

  const nextItems: SwipeableListItem[] = upcoming.map((q: QueueItem) => {
    const I = KIND_ICON[q.kind] ?? Bell;
    const pending = ACTIONABLE.includes(q.kind) && stillPending(q);
    return {
      id: q.key,
      onPress: () => open(q.url),
      content: <NotifContent icon={I} title={q.title} body={formatWhen(q.at)} when={fromNow(q.at)} />,
      title: q.title,
      leftActions: pending ? [doneAction(toData(q, q))] : [],
    };
  });

  return (
    <div ref={ref} className="popover glass strong" role="dialog" aria-label="Notificações">
      <div className="popover-head">
        <b>Notificações</b>
        {tab === 'recent' && inbox.length > 0 && (
          <button className="icon-btn sm" onClick={clearInbox} title="Limpar" aria-label="Limpar">
            <Trash2 />
          </button>
        )}
      </div>
      <div style={{ padding: '0 14px 10px' }}>
        <Segmented
          full
          value={tab}
          onChange={setTab}
          options={[
            { value: 'recent', label: 'Recentes', count: inbox.length },
            { value: 'next', label: 'Próximas 48h', count: upcoming.length },
          ]}
        />
      </div>
      <div className="popover-body">
        {tab === 'recent' &&
          (inbox.length ? (
            <>
              <SwipeableList items={recentItems} className="notif-swipe" />
              <p className="swl-hint">Arraste um aviso para o lado para concluir, adiar ou apagar.</p>
            </>
          ) : (
            <Empty icon={BellOff} title="Nada por aqui" text="Os avisos disparados pelo Rudge aparecem nesta lista." />
          ))}
        {tab === 'next' &&
          (upcoming.length ? (
            <SwipeableList items={nextItems} className="notif-swipe" />
          ) : (
            <Empty icon={Bell} title="Sem avisos programados" text="Crie lembretes, hábitos com horário ou metas com check-in." />
          ))}
      </div>
    </div>
  );
}

function NotifContent({ icon: I, title, body, when, unread }: { icon: LucideIcon; title: string; body: string; when: string; unread?: boolean }) {
  return (
    <div className={`notif-item ${unread ? 'unread' : ''}`}>
      <div className="lead-icon">
        <I />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <b>{title}</b>
        <p>{body}</p>
      </div>
      <span className="when">{when}</span>
    </div>
  );
}
