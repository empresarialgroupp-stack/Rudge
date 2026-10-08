import { AlarmClock, Bell, CalendarDays, Clock, ListChecks, Pencil, Repeat, Target, Trash2 } from 'lucide-react';
import type { Task } from '../lib/types';
import { deleteTask, toggleTask } from '../lib/actions';
import { openModal } from '../lib/ui';
import { relativeDay, todayKey } from '../lib/date';
import { AREA_LABEL } from '../lib/goals';
import { useStore } from '../lib/store';
import { AreaIcon, Checkbox, cx, Prio } from './ui';

export function TaskRow({ task, showDate = true }: { task: Task; showDate?: boolean }) {
  const s = useStore();
  const today = todayKey();
  const overdue = !task.done && task.due && task.due < today;
  const goal = task.goalId ? s.goals.find((g) => g.id === task.goalId) : undefined;
  const subs = task.subtasks ?? [];
  const open = () => openModal({ type: 'task', id: task.id });

  return (
    <div className={cx('item', task.done && 'done')}>
      <Checkbox checked={task.done} priority={task.priority} onChange={() => toggleTask(task.id)} />
      <div className="item-main" onClick={open}>
        <div className="item-title">{task.title}</div>
        <div className="item-meta">
          {showDate && task.due && (
            <span className={cx('meta', overdue && 'strong')}>
              {overdue ? <AlarmClock /> : <CalendarDays />}
              {overdue ? `Atrasada · ${relativeDay(task.due)}` : relativeDay(task.due)}
            </span>
          )}
          {task.time && (
            <span className="meta">
              <Clock /> {task.time}
            </span>
          )}
          {task.remind != null && task.time && !task.done && (
            <span className="meta" title="Com notificação">
              <Bell />
            </span>
          )}
          {task.repeat && task.repeat !== 'none' && (
            <span className="meta" title="Recorrente">
              <Repeat />
            </span>
          )}
          {subs.length > 0 && (
            <span className="meta">
              <ListChecks /> {subs.filter((x) => x.done).length}/{subs.length}
            </span>
          )}
          {goal && (
            <span className="meta">
              <Target /> {goal.title}
            </span>
          )}
          {task.area && !goal && (
            <span className="meta">
              <AreaIcon area={task.area} size={12} /> {AREA_LABEL[task.area]}
            </span>
          )}
          <Prio level={task.priority} />
        </div>
      </div>
      <div className="item-actions hide-mobile">
        <button className="icon-btn sm" onClick={open} aria-label="Editar">
          <Pencil />
        </button>
        <button className="icon-btn sm" onClick={() => deleteTask(task.id)} aria-label="Excluir">
          <Trash2 />
        </button>
      </div>
    </div>
  );
}

/** Ordena: atrasadas/hoje por prioridade e horário. */
export function sortTasks(a: Task, b: Task) {
  if (a.done !== b.done) return a.done ? 1 : -1;
  if ((a.due ?? '9999') !== (b.due ?? '9999')) return (a.due ?? '9999').localeCompare(b.due ?? '9999');
  if (a.priority !== b.priority) return b.priority - a.priority;
  return (a.time ?? '99:99').localeCompare(b.time ?? '99:99');
}
