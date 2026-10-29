import { useMemo } from 'react';
import { ArrowDown, ArrowUp, CalendarClock, Check, Play, Sparkles, Star, X } from 'lucide-react';
import type { DayPlan } from '../lib/types';
import { useStore } from '../lib/store';
import { acceptDayPlan, dismissDayPlan, saveDayPlan, toggleTask } from '../lib/actions';
import { currentPlan, estimateMinutes, planSummary } from '../lib/planner';
import { parseKey, timeOf, todayKey } from '../lib/date';
import { openModal, toast } from '../lib/ui';
import { cx } from './ui';

/** Recalcula os horários mantendo a ordem escolhida. */
function reflow(plan: DayPlan, order: string[], durations: Map<string, number>): DayPlan {
  if (!plan.slots.length) return plan;
  let cursor = parseKey(plan.date, plan.slots[0].start).getTime();
  const slots = order.map((taskId) => {
    const dur = (durations.get(taskId) ?? 30) * 60_000;
    const slot = { taskId, start: timeOf(new Date(cursor)), end: timeOf(new Date(cursor + dur)) };
    cursor += dur + 15 * 60_000;
    return slot;
  });
  return { ...plan, slots };
}

export function PlanCard() {
  const s = useStore();
  const today = todayKey();
  const plan = useMemo(() => currentPlan(s, today), [s, today]);
  const byId = useMemo(() => new Map(s.tasks.map((t) => [t.id, t])), [s.tasks]);
  const durations = useMemo(() => new Map(s.tasks.map((t) => [t.id, estimateMinutes(t)])), [s.tasks]);

  if (!s.settings.plan.enabled || plan.status === 'dismissed') return null;
  const accepted = plan.status === 'accepted';
  const prio = new Set(plan.priorities);
  const rows = plan.slots.length
    ? plan.slots
    : plan.priorities.map((taskId) => ({ taskId, start: byId.get(taskId)?.time ?? '', end: '' }));
  if (!rows.length) return null;

  const move = (i: number, d: number) => {
    const order = plan.slots.map((x) => x.taskId);
    const j = i + d;
    if (j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    saveDayPlan(reflow(plan, order, durations));
  };
  const remove = (taskId: string) => {
    const order = plan.slots.map((x) => x.taskId).filter((id) => id !== taskId);
    saveDayPlan({ ...reflow({ ...plan, slots: plan.slots.filter((x) => x.taskId !== taskId) }, order, durations), priorities: plan.priorities.filter((id) => id !== taskId) });
  };
  const togglePrio = (taskId: string) => {
    const has = prio.has(taskId);
    const priorities = has ? plan.priorities.filter((id) => id !== taskId) : [...plan.priorities, taskId].slice(-3);
    saveDayPlan({ ...plan, priorities });
  };

  return (
    <section className={cx('card glass liquid plan-card', accepted && 'accepted')} id="plano">
      <div className="card-head">
        <h2 className="card-title">
          {accepted ? <CalendarClock /> : <Sparkles />} {accepted ? 'Seu dia' : 'Seu dia está pronto'}
        </h2>
        <span className="plan-sum">{planSummary(plan)}</span>
      </div>

      <ol className="plan-list">
        {rows.map((r, i) => {
          const t = byId.get(r.taskId);
          if (!t) return null;
          return (
            <li key={r.taskId} className={cx('plan-row', t.done && 'done', prio.has(r.taskId) && 'prio')}>
              <span className="plan-time">{r.start || '—'}</span>
              <span className="plan-dot" />
              <button className="plan-title" onClick={() => openModal({ type: 'task', id: t.id })}>
                {t.title}
                {r.end && <small>até {r.end}</small>}
              </button>
              <span className="plan-actions">
                {accepted ? (
                  <>
                    <button className="icon-btn sm" title="Focar nesta tarefa" aria-label="Focar" onClick={() => openModal({ type: 'focus', taskId: t.id })}>
                      <Play />
                    </button>
                    <button className="icon-btn sm" title="Concluir" aria-label="Concluir" onClick={() => toggleTask(t.id, !t.done)}>
                      <Check />
                    </button>
                  </>
                ) : (
                  <>
                    <button className={cx('icon-btn sm', prio.has(r.taskId) && 'on')} title="Prioridade do dia" aria-label="Prioridade" onClick={() => togglePrio(r.taskId)}>
                      <Star />
                    </button>
                    {plan.slots.length > 1 && (
                      <>
                        <button className="icon-btn sm mv" aria-label="Subir" disabled={i === 0} onClick={() => move(i, -1)}>
                          <ArrowUp />
                        </button>
                        <button className="icon-btn sm mv" aria-label="Descer" disabled={i === rows.length - 1} onClick={() => move(i, 1)}>
                          <ArrowDown />
                        </button>
                      </>
                    )}
                    <button className="icon-btn sm" aria-label="Tirar do plano" onClick={() => remove(r.taskId)}>
                      <X />
                    </button>
                  </>
                )}
              </span>
            </li>
          );
        })}
      </ol>

      {!accepted && (
        <div className="row" style={{ marginTop: 12, gap: 8 }}>
          <button
            className="btn btn-primary btn-pill"
            onClick={() => {
              acceptDayPlan(plan);
              toast({ title: 'Plano aceito', body: 'Horários adicionados — o Rudge avisa antes de cada um.', icon: 'check' });
            }}
          >
            <Check /> Aceitar plano
          </button>
          <button className="btn btn-ghost btn-pill" onClick={() => dismissDayPlan(plan)}>
            Agora não
          </button>
        </div>
      )}
    </section>
  );
}
