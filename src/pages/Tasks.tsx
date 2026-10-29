import { useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, CalendarCheck, CheckCircle2, ListTodo, Mic, Plus } from 'lucide-react';
import type { AreaKey, Task } from '../lib/types';
import { useStore } from '../lib/store';
import { moveOverdueToToday, moveTodayOpenToTomorrow } from '../lib/actions';
import { openModal, useRoute, navigate, useNarrow } from '../lib/ui';
import { addDaysKey, dateKey, todayKey } from '../lib/date';
import { parseInput } from '../lib/nlp';
import { AREAS } from '../lib/goals';
import { ChipTabs, cx, Empty, StatCard, StatRow } from '../components/ui';
import { TaskRow, sortTasks } from '../components/TaskRow';
import { createFromText, ParseChips } from '../components/Quick';

type Filter = 'pendentes' | 'hoje' | 'semana' | 'concluidas';

export function Tasks() {
  const s = useStore();
  const narrow = useNarrow();
  const route = useRoute();
  const filter = (route.params.get('f') as Filter) || 'pendentes';
  const setFilter = (f: Filter) => navigate(`tarefas?f=${f}`);
  const [area, setArea] = useState<AreaKey | ''>('');
  const [text, setText] = useState('');
  const parsed = useMemo(() => parseInput(text), [text]);
  const today = todayKey();
  const tomorrow = addDaysKey(today, 1);
  const week = addDaysKey(today, 7);

  const tasks = s.tasks.filter((t) => !area || t.area === area || s.goals.find((g) => g.id === t.goalId)?.area === area);
  const open = tasks.filter((t) => !t.done);
  const counts = {
    pendentes: open.length,
    hoje: open.filter((t) => t.due && t.due <= today).length,
    semana: open.filter((t) => t.due && t.due <= week).length,
    concluidas: tasks.filter((t) => t.done).length,
  };

  const groups: { key: string; title: string; items: Task[]; action?: { label: string; run: () => void } }[] = useMemo(() => {
    const by = (fn: (t: Task) => boolean) => open.filter(fn).sort(sortTasks);
    if (filter === 'concluidas') {
      const done = tasks.filter((t) => t.done).sort((a, b) => (b.doneAt ?? '').localeCompare(a.doneAt ?? ''));
      return [{ key: 'done', title: 'Concluídas', items: done.slice(0, 200) }];
    }
    const overdue = by((t) => !!t.due && t.due < today);
    const todayList = by((t) => t.due === today);
    const out = [
      { key: 'overdue', title: 'Atrasadas', items: overdue, action: overdue.length ? { label: 'Mover para hoje', run: moveOverdueToToday } : undefined },
      {
        key: 'today',
        title: 'Hoje',
        items: todayList,
        action: todayList.length && new Date().getHours() >= 17 ? { label: 'Passar pendentes para amanhã', run: moveTodayOpenToTomorrow } : undefined,
      },
    ];
    if (filter === 'hoje') return out;
    out.push({ key: 'tomorrow', title: 'Amanhã', items: by((t) => t.due === tomorrow), action: undefined });
    out.push({ key: 'week', title: 'Próximos 7 dias', items: by((t) => !!t.due && t.due > tomorrow && t.due <= week), action: undefined });
    if (filter === 'semana') return out;
    out.push({ key: 'later', title: 'Mais tarde', items: by((t) => !!t.due && t.due > week), action: undefined });
    out.push({ key: 'nodate', title: 'Sem data', items: by((t) => !t.due), action: undefined });
    return out;
  }, [open, tasks, filter, today, tomorrow, week]);

  const visible = groups.filter((g) => g.items.length);

  function submit() {
    if (!text.trim()) return;
    if (createFromText(text, 'task')) setText('');
  }

  const overdueN = open.filter((t) => t.due && t.due < today).length;
  const weekAgo = addDaysKey(today, -6);
  const doneWeek = tasks.filter((t) => t.done && t.doneAt && dateKey(new Date(t.doneAt)) >= weekAgo).length;
  const allOpen = s.tasks.filter((t) => !t.done);
  const areaCount = (a: AreaKey) => allOpen.filter((t) => t.area === a || s.goals.find((g) => g.id === t.goalId)?.area === a).length;

  return (
    <>
      <StatRow>
        <StatCard icon={ListTodo} label="Pendentes" value={counts.pendentes} hint={`${counts.semana} em 7 dias`} onClick={() => setFilter('pendentes')} />
        <StatCard icon={CalendarCheck} label="Para hoje" value={counts.hoje} hint={counts.hoje ? 'foco do dia' : 'dia livre'} onClick={() => setFilter('hoje')} />
        <StatCard icon={AlertTriangle} label="Atrasadas" value={overdueN} hint={overdueN ? 'mover para hoje?' : 'em dia'} tone={overdueN ? 'warn' : undefined} />
        <StatCard icon={CheckCircle2} label="Concluídas" value={doneWeek} hint="últimos 7 dias" onClick={() => setFilter('concluidas')} />
      </StatRow>

      <div className="capture glass liquid">
        <Plus />
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder={narrow ? 'Nova tarefa… “relatório sexta 14h”' : 'Nova tarefa… ex.: “Enviar relatório sexta 14h !!! #carreira”'}
          aria-label="Nova tarefa"
        />
        <button className="icon-btn" onClick={() => openModal({ type: 'voice' })} aria-label="Falar" title="Falar com o Rudge">
          <Mic />
        </button>
        <button className="btn btn-primary" onClick={submit} disabled={!text.trim()} aria-label="Adicionar">
          <ArrowRight />
        </button>
      </div>
      {text && (
        <div className="parse-preview">
          <ParseChips p={parsed} mode="task" />
        </div>
      )}

      <div className="toolbar">
        <ChipTabs
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'pendentes', label: 'Pendentes', count: counts.pendentes },
            { value: 'hoje', label: 'Hoje', count: counts.hoje },
            { value: 'semana', label: '7 dias', count: counts.semana },
            { value: 'concluidas', label: 'Concluídas', count: counts.concluidas },
          ]}
        />
        <div className="spacer" />
        <button className="btn btn-glass" onClick={() => openModal({ type: 'task' })}>
          <Plus /> Nova tarefa
        </button>
      </div>
      <div className="area-chips">
        <button className={cx('chip', !area && 'on')} onClick={() => setArea('')}>
          Todas as áreas <span className="ct-count">{allOpen.length}</span>
        </button>
        {AREAS.map((a) => {
          const n = areaCount(a.key);
          return (
            <button key={a.key} className={cx('chip', area === a.key && 'on')} onClick={() => setArea(area === a.key ? '' : a.key)}>
              {a.label}
              {n > 0 && <span className="ct-count">{n}</span>}
            </button>
          );
        })}
      </div>

      {visible.length ? (
        visible.map((g) => (
          <section key={g.key} className="group-card glass">
            <div className="group-head">
              {g.title} <span className="count">{g.items.length}</span>
              <div className="spacer" />
              {g.action && (
                <button className="btn btn-sm btn-glass" onClick={g.action.run}>
                  {g.action.label}
                </button>
              )}
            </div>
            <div className="list">
              {g.items.map((t) => (
                <TaskRow key={t.id} task={t} showDate={g.key !== 'today' && g.key !== 'tomorrow'} />
              ))}
            </div>
          </section>
        ))
      ) : (
        <div className="glass card">
          {filter === 'concluidas' ? (
            <Empty icon={CheckCircle2} title="Nada concluído ainda" text="As tarefas concluídas aparecem aqui." />
          ) : (
            <Empty
              icon={ListTodo}
              title="Nenhuma tarefa pendente"
              text="Use o campo acima e escreva naturalmente — o Rudge entende datas e horários."
              action={
                <button className="btn btn-primary btn-sm" onClick={() => openModal({ type: 'task' })}>
                  <Plus /> Nova tarefa
                </button>
              }
            />
          )}
        </div>
      )}
    </>
  );
}
