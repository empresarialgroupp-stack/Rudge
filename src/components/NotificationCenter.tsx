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
  type LucideIcon,
} from 'lucide-react';
import type { NotifKind } from '../lib/types';
import { useStore } from '../lib/store';
import { clearInbox, markInboxRead } from '../lib/actions';
import { buildQueue } from '../lib/scheduler';
import { formatWhen, fromNow } from '../lib/date';
import { navigate } from '../lib/ui';
import { Empty, Segmented } from './ui';

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

  return (
    <div ref={ref} className="popover glass strong" role="dialog" aria-label="Notificações">
      <div className="popover-head">
        <b>Notificações</b>
        {tab === 'recent' && s.inbox.length > 0 && (
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
            { value: 'recent', label: 'Recentes', count: s.inbox.length },
            { value: 'next', label: 'Próximas 48h', count: upcoming.length },
          ]}
        />
      </div>
      <div className="popover-body">
        {tab === 'recent' &&
          (s.inbox.length ? (
            s.inbox.map((n) => {
              const I = KIND_ICON[n.kind] ?? Bell;
              return (
                <div
                  key={n.id}
                  className={`notif-item ${n.read ? '' : 'unread'}`}
                  onClick={() => {
                    navigate(n.url);
                    onClose();
                  }}
                >
                  <div className="lead-icon">
                    <I />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <b>{n.title}</b>
                    <p>{n.body}</p>
                  </div>
                  <span className="when">{fromNow(n.at)}</span>
                </div>
              );
            })
          ) : (
            <Empty icon={BellOff} title="Nada por aqui" text="Os avisos disparados pelo Rudge aparecem nesta lista." />
          ))}
        {tab === 'next' &&
          (upcoming.length ? (
            upcoming.map((q) => {
              const I = KIND_ICON[q.kind] ?? Bell;
              return (
                <div
                  key={q.key}
                  className="notif-item"
                  onClick={() => {
                    navigate(q.url);
                    onClose();
                  }}
                >
                  <div className="lead-icon">
                    <I />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <b>{q.title}</b>
                    <p>{formatWhen(q.at)}</p>
                  </div>
                  <span className="when">{fromNow(q.at)}</span>
                </div>
              );
            })
          ) : (
            <Empty icon={Bell} title="Sem avisos programados" text="Crie lembretes, hábitos com horário ou metas com check-in." />
          ))}
      </div>
    </div>
  );
}
