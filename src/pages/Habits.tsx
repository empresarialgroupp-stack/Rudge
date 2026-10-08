import { useState } from 'react';
import { Bell, Check, Flame, Plus, Target, Trophy } from 'lucide-react';
import type { Habit } from '../lib/types';
import { useStore } from '../lib/store';
import { toggleHabit } from '../lib/actions';
import { openModal } from '../lib/ui';
import { addDays, dateKey, todayKey, WEEKDAYS_MIN, startOfWeek } from '../lib/date';
import { habitBestStreak, habitRate, habitStreak, isHabitDueOn } from '../lib/goals';
import { cx, Empty, ProgressRing, Segmented } from '../components/ui';

function Heatmap({ habit }: { habit: Habit }) {
  const weeks = 18;
  const start = addDays(startOfWeek(new Date()), -7 * (weeks - 1));
  const set = new Set(habit.log);
  const today = todayKey();
  const cells = [];
  for (let i = 0; i < weeks * 7; i++) {
    const d = addDays(start, i);
    const key = dateKey(d);
    const due = habit.days.includes(d.getDay());
    const cls = key > today ? 'future' : set.has(key) ? 'on' : due ? '' : 'off';
    cells.push(<i key={key} className={cls} title={key} />);
  }
  return <div className="heatmap">{cells}</div>;
}

export function Habits() {
  const s = useStore();
  const [view, setView] = useState<'active' | 'archived'>('active');
  const [expanded, setExpanded] = useState<string | null>(null);
  const today = todayKey();
  const habits = s.habits.filter((h) => (view === 'active' ? !h.archived : h.archived));
  const due = s.habits.filter((h) => isHabitDueOn(h, today));
  const done = due.filter((h) => h.log.includes(today)).length;
  const days = Array.from({ length: 7 }, (_, i) => addDays(new Date(), i - 6));

  return (
    <>
      <div className="kpis" style={{ marginBottom: 18 }}>
        <div className="kpi glass">
          <ProgressRing value={due.length ? done / due.length : 0} size={50} stroke={5} />
          <div className="kpi-body">
            <div className="kpi-label">
              <Check /> Hoje
            </div>
            <div className="kpi-value">
              {done}
              <small>/{due.length}</small>
            </div>
          </div>
        </div>
        <div className="kpi glass">
          <div className="kpi-body">
            <div className="kpi-label">
              <Flame /> Maior sequência atual
            </div>
            <div className="kpi-value">{s.habits.reduce((m, h) => Math.max(m, habitStreak(h)), 0)} d</div>
          </div>
        </div>
        <div className="kpi glass">
          <div className="kpi-body">
            <div className="kpi-label">
              <Trophy /> Recorde
            </div>
            <div className="kpi-value">{s.habits.reduce((m, h) => Math.max(m, habitBestStreak(h)), 0)} d</div>
          </div>
        </div>
        <div className="kpi glass">
          <div className="kpi-body">
            <div className="kpi-label">
              <Target /> Consistência 30d
            </div>
            <div className="kpi-value">
              {s.habits.length ? Math.round((s.habits.filter((h) => !h.archived).reduce((n, h) => n + habitRate(h), 0) / Math.max(1, s.habits.filter((h) => !h.archived).length)) * 100) : 0}%
            </div>
          </div>
        </div>
      </div>

      <div className="toolbar">
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { value: 'active', label: 'Ativos', count: s.habits.filter((h) => !h.archived).length },
            { value: 'archived', label: 'Arquivados', count: s.habits.filter((h) => h.archived).length },
          ]}
        />
        <div className="spacer" />
        <button className="btn btn-primary" onClick={() => openModal({ type: 'habit' })}>
          <Plus /> Novo hábito
        </button>
      </div>

      {habits.length ? (
        <section className="glass" style={{ padding: 4 }}>
          {habits.map((h) => {
            const streak = habitStreak(h);
            const goal = h.goalId ? s.goals.find((g) => g.id === h.goalId) : undefined;
            return (
              <div key={h.id}>
                <div className="habit-row">
                  <div className="h-info" onClick={() => setExpanded(expanded === h.id ? null : h.id)}>
                    <b>{h.title}</b>
                    <div className="h-meta">
                      <span className="streak">
                        <Flame /> {streak} {streak === 1 ? 'dia' : 'dias'}
                      </span>
                      <span>{Math.round(habitRate(h) * 100)}% em 30 dias</span>
                      {h.remind && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <Bell width={12} /> {h.time}
                        </span>
                      )}
                      {goal && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <Target width={12} /> {goal.title}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="week-dots">
                    {days.map((d) => {
                      const key = dateKey(d);
                      const isDue = h.days.includes(d.getDay());
                      const on = h.log.includes(key);
                      return (
                        <button
                          key={key}
                          className={cx(on && 'on', !isDue && !on && 'off', key === today && 'today')}
                          onClick={() => toggleHabit(h.id, key)}
                          aria-label={`${key} ${on ? 'feito' : 'não feito'}`}
                          aria-pressed={on}
                        >
                          {WEEKDAYS_MIN[d.getDay()]}
                          <i>{on && <Check />}</i>
                        </button>
                      );
                    })}
                  </div>
                </div>
                {expanded === h.id && (
                  <div style={{ padding: '0 14px 16px' }}>
                    <div className="row wrap" style={{ alignItems: 'flex-end', gap: 18 }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div className="label" style={{ marginBottom: 8 }}>Últimas 18 semanas</div>
                        <Heatmap habit={h} />
                      </div>
                      <div className="stat-row" style={{ minWidth: 260 }}>
                        <div className="stat">
                          <span>Atual</span>
                          <b>{streak}</b>
                        </div>
                        <div className="stat">
                          <span>Recorde</span>
                          <b>{habitBestStreak(h)}</b>
                        </div>
                        <div className="stat">
                          <span>Total</span>
                          <b>{h.log.length}</b>
                        </div>
                      </div>
                    </div>
                    <button className="btn btn-sm btn-glass" style={{ marginTop: 12 }} onClick={() => openModal({ type: 'habit', id: h.id })}>
                      Editar hábito
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </section>
      ) : (
        <div className="glass card">
          <Empty
            icon={Flame}
            title={view === 'active' ? 'Nenhum hábito ainda' : 'Nenhum hábito arquivado'}
            text={view === 'active' ? 'Comece pequeno: um hábito, um horário, todo dia. O Rudge lembra você.' : undefined}
            action={
              view === 'active' ? (
                <button className="btn btn-primary btn-sm" onClick={() => openModal({ type: 'habit' })}>
                  <Plus /> Criar hábito
                </button>
              ) : undefined
            }
          />
        </div>
      )}
    </>
  );
}
