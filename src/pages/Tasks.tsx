import { useMemo, useState } from 'react';
import { ArrowRight, CheckCircle2, ListTodo, Plus } from 'lucide-react';
import type { AreaKey, Task } from '../lib/types';
import { useStore } from '../lib/store';
import { moveOverdueToToday, moveTodayOpenToTomorrow } from '../lib/actions';
import { openModal, useRoute, navigate } from '../lib/ui';
import { addDaysKey, todayKey } from '../lib/date';
import { parseInput } from '../lib/nlp';
import { AREAS } from '../lib/goals';
import { cx, Empty, Segmented } from '../components/ui';
import { TaskRow, sortTasks } from '../components/TaskRow';
import { createFromText, ParseChips } from '../components/Quick';

type Filter = 'pendentes' | 'hoje' | 'semana' | 'concluidas';

export function Tasks() {
  const s = useStore();
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

  return (
    <>
      <div className="capture glass liquid">
        <Plus />
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="Nova tarefa… ex.: “Enviar relatório sexta 14h !!! #carreira”"
          aria-label="Nova tarefa"
        />
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
        <Segmented
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
      <div className="row wrap" style={{ marginBottom: 14 }}>
        <button className={cx('chip', !area && 'on')} onClick={() => setArea('')}>
          Todas as áreas
        </button>
        {AREAS.map((a) => (
          <button key={a.key} className={cx('chip', area === a.key && 'on')} onClick={() => setArea(area === a.key ? '' : a.key)}>
            {a.label}
          </button>
        ))}
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
