import { useMemo, useState } from 'react';
import { AlarmClock, Bell, CalendarDays, ChevronLeft, ChevronRight, Flame, ListTodo, Plus, Target } from 'lucide-react';
import { useStore } from '../lib/store';
import { openModal } from '../lib/ui';
import { addDays, dateKey, longDate, MONTHS, parseKey, timeOf, todayKey, WEEKDAYS_SHORT } from '../lib/date';
import { occurrencesBetween } from '../lib/recurrence';
import { isHabitDueOn } from '../lib/goals';
import { toggleHabit } from '../lib/actions';
import { Checkbox, cx, Empty, StatCard, StatRow } from '../components/ui';
import { TaskRow, sortTasks } from '../components/TaskRow';

export function CalendarPage() {
  const s = useStore();
  const today = todayKey();
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [sel, setSel] = useState(today);

  const gridStart = addDays(cursor, -cursor.getDay());
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const rangeFrom = gridStart.getTime();
  const rangeTo = addDays(gridStart, 42).getTime();

  const index = useMemo(() => {
    const map: Record<string, { tasks: number; rems: { id: string; title: string; at: number }[]; goals: { id: string; title: string; kind: 'prazo' | 'etapa' }[] }> = {};
    const get = (k: string) => (map[k] ??= { tasks: 0, rems: [], goals: [] });
    for (const t of s.tasks) if (t.due && !t.done) get(t.due).tasks++;
    for (const r of s.reminders) {
      if (r.done) continue;
      const ack = r.ackUntil ? Date.parse(r.ackUntil) : 0;
      for (const at of occurrencesBetween({ at: Date.parse(r.at), repeat: r.repeat, days: r.days }, rangeFrom, rangeTo)) {
        if (at > ack) get(dateKey(new Date(at))).rems.push({ id: r.id, title: r.title, at });
      }
    }
    for (const g of s.goals) {
      if (g.status !== 'active') continue;
      if (g.deadline) get(g.deadline).goals.push({ id: g.id, title: g.title, kind: 'prazo' });
      for (const m of g.milestones) if (m.due && !m.done) get(m.due).goals.push({ id: g.id, title: `${m.title} · ${g.title}`, kind: 'etapa' });
    }
    return map;
  }, [s.tasks, s.reminders, s.goals, rangeFrom, rangeTo]);

  const dayTasks = s.tasks.filter((t) => t.due === sel || (sel === today && !t.done && t.due && t.due < today)).sort(sortTasks);
  const selInfo = index[sel];
  const selHabits = s.habits.filter((h) => isHabitDueOn(h, sel));
  const selDate = parseKey(sel);

  const monthKey = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
  const month = Object.entries(index).filter(([k]) => k.startsWith(monthKey));
  const mTasks = month.reduce((n, [, v]) => n + v.tasks, 0);
  const mRems = month.reduce((n, [, v]) => n + v.rems.length, 0);
  const mGoals = month.reduce((n, [, v]) => n + v.goals.length, 0);
  const busiest = month.reduce<[string, number] | null>((b, [k, v]) => {
    const n = v.tasks + v.rems.length + v.goals.length;
    return !b || n > b[1] ? [k, n] : b;
  }, null);

  return (
    <>
    <StatRow>
      <StatCard icon={ListTodo} label="Tarefas no mês" value={mTasks} hint={MONTHS[cursor.getMonth()]} />
      <StatCard icon={AlarmClock} label="Lembretes" value={mRems} hint="programados" />
      <StatCard icon={Target} label="Prazos e etapas" value={mGoals} hint="de metas" />
      <StatCard
        icon={CalendarDays}
        label="Dia mais cheio"
        value={busiest ? Number(busiest[0].slice(8)) : 0}
        hint={busiest ? `${busiest[1]} ${busiest[1] === 1 ? 'item' : 'itens'}` : 'mês livre'}
        onClick={busiest ? () => setSel(busiest[0]) : undefined}
      />
    </StatRow>
    <div className="cal-layout">
      <section className="cal glass">
        <div className="cal-head">
          <h3>
            {MONTHS[cursor.getMonth()]} {cursor.getFullYear()}
          </h3>
          <button
            className="btn btn-sm btn-glass"
            onClick={() => {
              const d = new Date();
              setCursor(new Date(d.getFullYear(), d.getMonth(), 1));
              setSel(today);
            }}
          >
            Hoje
          </button>
          <button className="icon-btn sm" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} aria-label="Mês anterior">
            <ChevronLeft />
          </button>
          <button className="icon-btn sm" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} aria-label="Próximo mês">
            <ChevronRight />
          </button>
        </div>
        <div className="cal-grid">
          {WEEKDAYS_SHORT.map((w) => (
            <div key={w} className="cal-dow">
              {w}
            </div>
          ))}
          {cells.map((d) => {
            const k = dateKey(d);
            const info = index[k];
            const dots: string[] = [];
            if (info) {
              for (let i = 0; i < Math.min(info.tasks, 3); i++) dots.push('t');
              for (let i = 0; i < Math.min(info.rems.length, 2); i++) dots.push('r');
              if (info.goals.length) dots.push('g');
            }
            return (
              <button
                key={k}
                className={cx('cal-day', d.getMonth() !== cursor.getMonth() && 'out', k === today && 'today', k === sel && 'sel')}
                onClick={() => setSel(k)}
                aria-label={longDate(d)}
              >
                <span className="n">{d.getDate()}</span>
                <span className="dots">
                  {dots.slice(0, 5).map((c, i) => (
                    <i key={i} className={c === 't' ? '' : c} />
                  ))}
                </span>
              </button>
            );
          })}
        </div>
        <div className="legend">
          <span>
            <i /> Tarefas
          </span>
          <span>
            <i className="r" /> Lembretes
          </span>
          <span>
            <i className="g" /> Prazos e etapas de metas
          </span>
        </div>
      </section>

      <section className="card glass">
        <div className="card-head">
          <h2 className="card-title">
            <CalendarDays /> {longDate(selDate)}
          </h2>
        </div>
        <div className="row wrap" style={{ marginBottom: 12 }}>
          <button className="btn btn-sm btn-glass" onClick={() => openModal({ type: 'task', defaults: { due: sel } })}>
            <Plus /> Tarefa
          </button>
          <button
            className="btn btn-sm btn-glass"
            onClick={() => openModal({ type: 'reminder', defaults: { at: Math.max(parseKey(sel, '09:00').getTime(), Date.now() + 60 * 60_000) } })}
          >
            <Bell /> Lembrete
          </button>
        </div>

        {!dayTasks.length && !selInfo?.rems.length && !selInfo?.goals.length && !selHabits.length && (
          <Empty icon={CalendarDays} title="Nada neste dia" text="Adicione uma tarefa ou lembrete para esta data." />
        )}

        {dayTasks.length > 0 && (
          <>
            <div className="section-title" style={{ marginTop: 6 }}>
              <ListTodo width={13} /> Tarefas
            </div>
            <div className="list">
              {dayTasks.map((t) => (
                <TaskRow key={t.id} task={t} showDate={t.due !== sel} />
              ))}
            </div>
          </>
        )}

        {!!selInfo?.rems.length && (
          <>
            <div className="section-title" style={{ marginTop: 14 }}>
              <AlarmClock width={13} /> Lembretes
            </div>
            <div className="list">
              {selInfo.rems
                .sort((a, b) => a.at - b.at)
                .map((r) => (
                  <div key={`${r.id}${r.at}`} className="item" style={{ cursor: 'pointer' }} onClick={() => openModal({ type: 'reminder', id: r.id })}>
                    <span className="chip num">{timeOf(new Date(r.at))}</span>
                    <div className="item-main">
                      <div className="item-title">{r.title}</div>
                    </div>
                  </div>
                ))}
            </div>
          </>
        )}

        {selHabits.length > 0 && (
          <>
            <div className="section-title" style={{ marginTop: 14 }}>
              <Flame width={13} /> Hábitos
            </div>
            <div className="habit-pills">
              {selHabits.map((h) => (
                <div key={h.id} className={cx('habit-pill', h.log.includes(sel) && 'done')}>
                  {sel <= today ? (
                    <Checkbox checked={h.log.includes(sel)} onChange={() => toggleHabit(h.id, sel)} />
                  ) : (
                    <span className="chip num">{h.time}</span>
                  )}
                  <span className="h-title">{h.title}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {!!selInfo?.goals.length && (
          <>
            <div className="section-title" style={{ marginTop: 14 }}>
              <Target width={13} /> Metas
            </div>
            {selInfo.goals.map((g, i) => (
              <div key={i} className="item" style={{ cursor: 'pointer' }} onClick={() => openModal({ type: 'goal-detail', id: g.id })}>
                <span className="chip solid">{g.kind === 'prazo' ? 'Prazo' : 'Etapa'}</span>
                <div className="item-main">
                  <div className="item-title">{g.title}</div>
                </div>
              </div>
            ))}
          </>
        )}
      </section>
    </div>
    </>
  );
}
