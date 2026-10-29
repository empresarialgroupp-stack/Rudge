import { useMemo, useState } from 'react';
import { AlarmClock, ArrowRight, Bell, BellRing, Check, CheckCircle2, Clock, Mic, Pencil, Repeat, RotateCcw, Trash2 } from 'lucide-react';
import type { Reminder } from '../lib/types';
import { useStore } from '../lib/store';
import { completeReminder, deleteReminder, postponeReminder, reopenReminder } from '../lib/actions';
import { openModal, toast, useNarrow } from '../lib/ui';
import { addDays, formatWhen, fromNow } from '../lib/date';
import { describeRule, nextOccurrence } from '../lib/recurrence';
import { parseInput } from '../lib/nlp';
import { permission } from '../lib/notify';
import { cx, Empty, StatCard, StatRow } from '../components/ui';
import { createFromText, ParseChips } from '../components/Quick';
import { enableNotifications } from './Dashboard';

function RemRow({ r, at, overdue }: { r: Reminder; at?: number | null; overdue?: boolean }) {
  const [menu, setMenu] = useState(false);
  const rule = { at: Date.parse(r.at), repeat: r.repeat, days: r.days };
  const tomorrow9 = addDays(new Date(), 1);
  tomorrow9.setHours(9, 0, 0, 0);
  return (
    <div className={cx('item', r.done && 'done')}>
      <div className="lead-icon">{r.repeat !== 'none' ? <Repeat /> : overdue ? <BellRing /> : <Bell />}</div>
      <div className="item-main" onClick={() => openModal({ type: 'reminder', id: r.id })}>
        <div className="item-title">{r.title}</div>
        <div className="item-meta">
          {at && (
            <span className={cx('meta', overdue && 'strong')}>
              {overdue ? 'Venceu ' : ''}
              {formatWhen(at)} · {fromNow(at)}
            </span>
          )}
          {r.repeat !== 'none' && <span className="chip outline">{describeRule(rule)}</span>}
          {r.notes && <span className="meta">{r.notes}</span>}
        </div>
        {menu && (
          <div className="row wrap" style={{ marginTop: 10 }} onClick={(e) => e.stopPropagation()}>
            {[
              { label: '+10 min', at: Date.now() + 10 * 60_000 },
              { label: '+1 hora', at: Date.now() + 60 * 60_000 },
              { label: 'Amanhã 09:00', at: tomorrow9.getTime() },
            ].map((p) => (
              <button
                key={p.label}
                className="chip"
                onClick={() => {
                  postponeReminder(r.id, p.at);
                  setMenu(false);
                  toast({ title: 'Lembrete adiado', body: formatWhen(p.at), icon: 'bell' });
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="item-actions" style={{ opacity: 1 }}>
        {r.done ? (
          <button className="icon-btn sm" title="Reabrir" onClick={() => reopenReminder(r.id)} aria-label="Reabrir">
            <RotateCcw />
          </button>
        ) : (
          <>
            {r.repeat === 'none' && (
              <button className="icon-btn sm" title="Adiar" onClick={() => setMenu((v) => !v)} aria-label="Adiar">
                <AlarmClock />
              </button>
            )}
            <button
              className="icon-btn sm"
              title={r.repeat === 'none' ? 'Concluir' : 'Concluir esta ocorrência'}
              onClick={() => {
                completeReminder(r.id, at ?? undefined);
                toast({ title: 'Lembrete concluído', body: r.title, icon: 'check' });
              }}
              aria-label="Concluir"
            >
              <Check />
            </button>
          </>
        )}
        <button className="icon-btn sm" onClick={() => openModal({ type: 'reminder', id: r.id })} aria-label="Editar">
          <Pencil />
        </button>
        <button className="icon-btn sm" onClick={() => deleteReminder(r.id)} aria-label="Excluir">
          <Trash2 />
        </button>
      </div>
    </div>
  );
}

export function Reminders() {
  const s = useStore();
  const narrow = useNarrow();
  const [text, setText] = useState('');
  const [showDone, setShowDone] = useState(false);
  const parsed = useMemo(() => parseInput(text), [text]);
  const now = Date.now();
  const perm = permission();

  const { overdue, soon, week, later, recurring, done } = useMemo(() => {
    const active = s.reminders.filter((r) => !r.done);
    const once = active.filter((r) => r.repeat === 'none');
    const t = (r: Reminder) => Date.parse(r.at);
    return {
      overdue: once.filter((r) => t(r) <= now).sort((a, b) => t(a) - t(b)),
      soon: once.filter((r) => t(r) > now && t(r) <= now + 86_400_000).sort((a, b) => t(a) - t(b)),
      week: once.filter((r) => t(r) > now + 86_400_000 && t(r) <= now + 7 * 86_400_000).sort((a, b) => t(a) - t(b)),
      later: once.filter((r) => t(r) > now + 7 * 86_400_000).sort((a, b) => t(a) - t(b)),
      recurring: active
        .filter((r) => r.repeat !== 'none')
        .map((r) => ({ r, next: nextOccurrence({ at: t(r), repeat: r.repeat, days: r.days }, Math.max(now, r.ackUntil ? Date.parse(r.ackUntil) : 0)) }))
        .sort((a, b) => (a.next ?? Infinity) - (b.next ?? Infinity)),
      done: s.reminders.filter((r) => r.done).sort((a, b) => (b.doneAt ?? '').localeCompare(a.doneAt ?? '')),
    };
  }, [s.reminders, now]);

  function submit() {
    if (!text.trim()) return;
    if (createFromText(text, 'reminder')) setText('');
  }

  const sections = [
    { key: 'overdue', title: 'Aguardando você', items: overdue, overdue: true },
    { key: 'soon', title: 'Próximas 24 horas', items: soon },
    { key: 'week', title: 'Próximos 7 dias', items: week },
    { key: 'later', title: 'Mais adiante', items: later },
  ].filter((x) => x.items.length);

  const empty = !sections.length && !recurring.length;

  const activeN = s.reminders.filter((r) => !r.done).length;
  const doneWeek = s.reminders.filter((r) => r.done && r.doneAt && Date.parse(r.doneAt) >= now - 7 * 86_400_000).length;

  return (
    <>
      <StatRow>
        <StatCard icon={Bell} label="Ativos" value={activeN} hint={overdue.length ? `${overdue.length} aguardando` : 'em dia'} tone={overdue.length ? 'warn' : undefined} />
        <StatCard icon={Clock} label="Próximas 24 h" value={soon.length} hint={soon[0] ? fromNow(Date.parse(soon[0].at)) : 'nenhum'} />
        <StatCard icon={Repeat} label="Recorrentes" value={recurring.length} hint={recurring[0]?.next ? fromNow(recurring[0].next) : '—'} />
        <StatCard icon={CheckCircle2} label="Concluídos" value={doneWeek} hint="últimos 7 dias" />
      </StatRow>

      {perm !== 'granted' || !s.settings.notifications ? (
        <div className="banner glass">
          <BellRing />
          <div className="b-text">
            <b>Notificações desativadas.</b> Ative para receber os lembretes mesmo com o Rudge minimizado.
          </div>
          <button className="btn btn-sm btn-primary" onClick={() => void enableNotifications()}>
            Ativar
          </button>
        </div>
      ) : null}

      <div className="capture glass liquid">
        <AlarmClock />
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder={narrow ? 'Me lembre de… “remédio todo dia 8h”' : 'Me lembre de… ex.: “tomar remédio todo dia às 8h”'}
          aria-label="Novo lembrete"
        />
        <button className="icon-btn" onClick={() => openModal({ type: 'voice' })} aria-label="Falar" title="Falar com o Rudge">
          <Mic />
        </button>
        <button className="btn btn-primary" onClick={submit} disabled={!text.trim()} aria-label="Criar">
          <ArrowRight />
        </button>
      </div>
      {text && (
        <div className="parse-preview">
          <ParseChips p={parsed} mode="reminder" />
        </div>
      )}

      <div className="toolbar">
        <div className="spacer" />
        <button className="btn btn-glass" onClick={() => openModal({ type: 'reminder' })}>
          <Bell /> Novo lembrete
        </button>
      </div>

      {sections.map((sec) => (
        <section key={sec.key} className="group-card glass">
          <div className="group-head">
            {sec.title} <span className="count">{sec.items.length}</span>
          </div>
          <div className="list">
            {sec.items.map((r) => (
              <RemRow key={r.id} r={r} at={Date.parse(r.at)} overdue={sec.overdue} />
            ))}
          </div>
        </section>
      ))}

      {recurring.length > 0 && (
        <section className="group-card glass">
          <div className="group-head">
            Recorrentes <span className="count">{recurring.length}</span>
          </div>
          <div className="list">
            {recurring.map(({ r, next }) => (
              <RemRow key={r.id} r={r} at={next} />
            ))}
          </div>
        </section>
      )}

      {empty && (
        <div className="glass card">
          <Empty
            icon={AlarmClock}
            title="Nenhum lembrete ativo"
            text="Escreva como falaria: “me lembre de pagar a fatura dia 10 às 9h” ou “beber água a cada dia às 15h”."
            action={
              <button className="btn btn-primary btn-sm" onClick={() => openModal({ type: 'reminder' })}>
                <Bell /> Novo lembrete
              </button>
            }
          />
        </div>
      )}

      {done.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setShowDone((v) => !v)}>
            {showDone ? 'Ocultar' : 'Mostrar'} concluídos ({done.length})
          </button>
          {showDone && (
            <section className="group-card glass" style={{ marginTop: 8 }}>
              <div className="list">
                {done.slice(0, 50).map((r) => (
                  <RemRow key={r.id} r={r} at={Date.parse(r.at)} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </>
  );
}
