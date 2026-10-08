import { useMemo, useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import type { AreaKey, Priority, Repeat, Subtask } from '../lib/types';
import { useStore, uid } from '../lib/store';
import {
  addHabit,
  addReminder,
  addTask,
  deleteHabit,
  deleteReminder,
  deleteTask,
  updateHabit,
  updateReminder,
  updateTask,
} from '../lib/actions';
import { closeModal, toast } from '../lib/ui';
import { addDays, dateKey, fromLocalInput, parseKey, timeOf, toLocalInput, todayKey } from '../lib/date';
import { AREAS } from '../lib/goals';
import { REPEAT_LABEL } from '../lib/recurrence';
import { cx, DayPicker, Field, Modal, Segmented, Switch } from './ui';

const REMIND_OPTS: { v: string; label: string }[] = [
  { v: 'none', label: 'Sem lembrete' },
  { v: '0', label: 'No horário' },
  { v: '5', label: '5 min antes' },
  { v: '10', label: '10 min antes' },
  { v: '15', label: '15 min antes' },
  { v: '30', label: '30 min antes' },
  { v: '60', label: '1 hora antes' },
  { v: '120', label: '2 horas antes' },
  { v: '1440', label: '1 dia antes' },
];

const REPEATS = Object.entries(REPEAT_LABEL) as [Repeat, string][];

function RepeatField({
  repeat,
  days,
  onChange,
}: {
  repeat: Repeat;
  days: number[];
  onChange: (r: Repeat, d: number[]) => void;
}) {
  return (
    <div className="stack sm">
      <Field label="Repetir">
        <select className="select" value={repeat} onChange={(e) => onChange(e.target.value as Repeat, days)}>
          {REPEATS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </Field>
      {repeat === 'weekly' && <DayPicker value={days} onChange={(d) => onChange(repeat, d)} />}
    </div>
  );
}

/* ---------------- Tarefa ---------------- */

export function TaskEditor({
  id,
  defaults,
}: {
  id?: string;
  defaults?: { due?: string; time?: string; title?: string; goalId?: string };
}) {
  const s = useStore();
  const existing = id ? s.tasks.find((t) => t.id === id) : undefined;
  const [title, setTitle] = useState(existing?.title ?? defaults?.title ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [due, setDue] = useState(existing?.due ?? defaults?.due ?? todayKey());
  const [time, setTime] = useState(existing?.time ?? defaults?.time ?? '');
  const [remind, setRemind] = useState<string>(
    existing ? (existing.remind == null ? 'none' : String(existing.remind)) : String(s.settings.defaultTaskRemind),
  );
  const [priority, setPriority] = useState<Priority>(existing?.priority ?? 0);
  const [area, setArea] = useState<AreaKey | ''>(existing?.area ?? '');
  const [goalId, setGoalId] = useState(existing?.goalId ?? defaults?.goalId ?? '');
  const [repeat, setRepeat] = useState<Repeat>(existing?.repeat ?? 'none');
  const [days, setDays] = useState<number[]>(existing?.days ?? []);
  const [subtasks, setSubtasks] = useState<Subtask[]>(existing?.subtasks ?? []);
  const [newSub, setNewSub] = useState('');

  const close = () => closeModal('task');

  function save() {
    if (!title.trim()) return;
    const patch = {
      title: title.trim(),
      notes: notes.trim() || undefined,
      due: due || undefined,
      time: due && time ? time : undefined,
      remind: due && time && remind !== 'none' ? Number(remind) : null,
      priority,
      area: area || undefined,
      goalId: goalId || undefined,
      repeat: due ? repeat : 'none',
      days: repeat === 'weekly' ? days : undefined,
      subtasks: newSub.trim() ? [...subtasks, { id: uid(), title: newSub.trim(), done: false }] : subtasks,
    };
    if (existing) updateTask(existing.id, patch);
    else {
      addTask(patch);
      toast({ title: 'Tarefa criada', body: patch.title, icon: 'check' });
    }
    close();
  }

  const quick = [
    { label: 'Hoje', v: todayKey() },
    { label: 'Amanhã', v: dateKey(addDays(new Date(), 1)) },
    { label: 'Próx. semana', v: dateKey(addDays(new Date(), ((8 - new Date().getDay()) % 7) || 7)) },
    { label: 'Sem data', v: '' },
  ];

  return (
    <Modal
      title={existing ? 'Editar tarefa' : 'Nova tarefa'}
      onClose={close}
      footer={
        <>
          {existing && (
            <button
              className="btn btn-danger"
              onClick={() => {
                deleteTask(existing.id);
                close();
              }}
            >
              <Trash2 /> Excluir
            </button>
          )}
          <div className="spacer" />
          <button className="btn btn-ghost" onClick={close}>
            Cancelar
          </button>
          <button className="btn btn-primary" onClick={save} disabled={!title.trim()}>
            Salvar
          </button>
        </>
      }
    >
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Field label="Título">
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="O que precisa ser feito?" autoFocus />
        </Field>
        <div className="row wrap">
          {quick.map((q) => (
            <button type="button" key={q.label} className={cx('chip', due === q.v && 'on')} onClick={() => setDue(q.v)}>
              {q.label}
            </button>
          ))}
        </div>
        <div className="grid-2">
          <Field label="Data">
            <input className="input" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </Field>
          <Field label="Horário">
            <input className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} disabled={!due} />
          </Field>
        </div>
        {due && time && (
          <Field label="Notificar">
            <select className="select" value={remind} onChange={(e) => setRemind(e.target.value)}>
              {REMIND_OPTS.map((o) => (
                <option key={o.v} value={o.v}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
        )}
        {due && (
          <RepeatField
            repeat={repeat}
            days={days}
            onChange={(r, d) => {
              setRepeat(r);
              setDays(r === 'weekly' && !d.length ? [parseKey(due).getDay()] : d);
            }}
          />
        )}
        <Field label="Prioridade" group>
          <Segmented
            full
            value={priority}
            onChange={setPriority}
            options={[
              { value: 0, label: 'Nenhuma' },
              { value: 1, label: 'Baixa' },
              { value: 2, label: 'Média' },
              { value: 3, label: 'Alta' },
            ]}
          />
        </Field>
        <div className="grid-2">
          <Field label="Área">
            <select className="select" value={area} onChange={(e) => setArea(e.target.value as AreaKey | '')}>
              <option value="">—</option>
              {AREAS.map((a) => (
                <option key={a.key} value={a.key}>
                  {a.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Meta vinculada">
            <select className="select" value={goalId} onChange={(e) => setGoalId(e.target.value)}>
              <option value="">—</option>
              {s.goals
                .filter((g) => g.status === 'active' || g.id === goalId)
                .map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.title}
                  </option>
                ))}
            </select>
          </Field>
        </div>
        <Field label="Subtarefas" group>
          <div className="subtasks">
            {subtasks.map((st) => (
              <div key={st.id} className={cx('subtask', st.done && 'done')}>
                <button
                  type="button"
                  className={cx('check', st.done && 'on')}
                  onClick={() => setSubtasks(subtasks.map((x) => (x.id === st.id ? { ...x, done: !x.done } : x)))}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                </button>
                <input value={st.title} onChange={(e) => setSubtasks(subtasks.map((x) => (x.id === st.id ? { ...x, title: e.target.value } : x)))} />
                <button type="button" className="icon-btn sm" onClick={() => setSubtasks(subtasks.filter((x) => x.id !== st.id))} aria-label="Remover">
                  <X />
                </button>
              </div>
            ))}
            <div className="subtask">
              <Plus width={16} height={16} style={{ color: 'var(--fg-4)', margin: '0 1px' }} />
              <input
                placeholder="Adicionar subtarefa"
                value={newSub}
                onChange={(e) => setNewSub(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (!newSub.trim()) return;
                    setSubtasks([...subtasks, { id: uid(), title: newSub.trim(), done: false }]);
                    setNewSub('');
                  }
                }}
              />
            </div>
          </div>
        </Field>
        <Field label="Notas">
          <textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Detalhes, links, contexto…" />
        </Field>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

/* ---------------- Lembrete ---------------- */

export function ReminderEditor({ id, defaults }: { id?: string; defaults?: { title?: string; at?: number } }) {
  const s = useStore();
  const existing = id ? s.reminders.find((r) => r.id === id) : undefined;
  const initialAt = existing ? Date.parse(existing.at) : defaults?.at ?? Date.now() + 60 * 60_000;
  const [title, setTitle] = useState(existing?.title ?? defaults?.title ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [when, setWhen] = useState(toLocalInput(roundTo5(initialAt)));
  const [repeat, setRepeat] = useState<Repeat>(existing?.repeat ?? 'none');
  const [days, setDays] = useState<number[]>(existing?.days ?? []);
  const close = () => closeModal('reminder');

  const at = when ? fromLocalInput(when) : NaN;
  const past = repeat === 'none' && at < Date.now() - 30_000;

  const presets = useMemo(() => {
    const now = new Date();
    const tonight = new Date(now);
    tonight.setHours(20, 0, 0, 0);
    const tomorrow9 = addDays(now, 1);
    tomorrow9.setHours(9, 0, 0, 0);
    const monday = addDays(now, ((8 - now.getDay()) % 7) || 7);
    monday.setHours(9, 0, 0, 0);
    return [
      { label: 'Em 10 min', at: now.getTime() + 10 * 60_000 },
      { label: 'Em 1 hora', at: now.getTime() + 60 * 60_000 },
      ...(tonight.getTime() > now.getTime() + 15 * 60_000 ? [{ label: 'Hoje 20:00', at: tonight.getTime() }] : []),
      { label: 'Amanhã 09:00', at: tomorrow9.getTime() },
      { label: 'Segunda 09:00', at: monday.getTime() },
    ];
  }, []);

  function save() {
    if (!title.trim() || isNaN(at) || past) return;
    const patch = {
      title: title.trim(),
      notes: notes.trim() || undefined,
      at: new Date(at).toISOString(),
      repeat,
      days: repeat === 'weekly' ? (days.length ? days : [new Date(at).getDay()]) : undefined,
      done: false,
      ackUntil: repeat !== 'none' ? new Date().toISOString() : undefined,
    };
    if (existing) updateReminder(existing.id, patch);
    else addReminder(patch);
    toast({ title: existing ? 'Lembrete atualizado' : 'Lembrete criado', body: `${patch.title} — ${new Date(at).toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}`, icon: 'bell' });
    close();
  }

  return (
    <Modal
      title={existing ? 'Editar lembrete' : 'Novo lembrete'}
      onClose={close}
      footer={
        <>
          {existing && (
            <button
              className="btn btn-danger"
              onClick={() => {
                deleteReminder(existing.id);
                close();
              }}
            >
              <Trash2 /> Excluir
            </button>
          )}
          <div className="spacer" />
          <button className="btn btn-ghost" onClick={close}>
            Cancelar
          </button>
          <button className="btn btn-primary" onClick={save} disabled={!title.trim() || past || isNaN(at)}>
            Salvar
          </button>
        </>
      }
    >
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Field label="Me lembre de…">
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: tomar o remédio" autoFocus />
        </Field>
        <div className="row wrap">
          {presets.map((p) => (
            <button type="button" key={p.label} className={cx('chip', Math.abs(at - p.at) < 60_000 && 'on')} onClick={() => setWhen(toLocalInput(p.at))}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="grid-2">
          <Field label="Data">
            <input
              className="input"
              type="date"
              value={when.split('T')[0]}
              onChange={(e) => e.target.value && setWhen(`${e.target.value}T${when.split('T')[1] ?? '09:00'}`)}
            />
          </Field>
          <Field label="Horário">
            <input
              className="input"
              type="time"
              value={when.split('T')[1] ?? ''}
              onChange={(e) => e.target.value && setWhen(`${when.split('T')[0]}T${e.target.value}`)}
            />
          </Field>
        </div>
        {past && <div className="login-error">Esse horário já passou — escolha um horário no futuro.</div>}
        <RepeatField
          repeat={repeat}
          days={days}
          onChange={(r, d) => {
            setRepeat(r);
            setDays(r === 'weekly' && !d.length && !isNaN(at) ? [new Date(at).getDay()] : d);
          }}
        />
        <Field label="Notas (aparecem na notificação)">
          <textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" />
        </Field>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

function roundTo5(ms: number) {
  const d = new Date(ms);
  d.setSeconds(0, 0);
  d.setMinutes(Math.ceil(d.getMinutes() / 5) * 5);
  return d.getTime();
}

/* ---------------- Hábito ---------------- */

const HABIT_IDEAS = [
  'Beber 2L de água',
  'Ler 20 páginas',
  'Exercício 30 min',
  'Meditar 10 min',
  'Planejar o dia',
  'Dormir antes das 23h',
  'Estudar 30 min',
  'Sem redes sociais após 22h',
];

export function HabitEditor({ id, defaults }: { id?: string; defaults?: { title?: string; goalId?: string } }) {
  const s = useStore();
  const existing = id ? s.habits.find((h) => h.id === id) : undefined;
  const [title, setTitle] = useState(existing?.title ?? defaults?.title ?? '');
  const [days, setDays] = useState<number[]>(existing?.days ?? [0, 1, 2, 3, 4, 5, 6]);
  const [remind, setRemind] = useState(existing?.remind ?? true);
  const [time, setTime] = useState(existing?.time ?? '09:00');
  const [area, setArea] = useState<AreaKey | ''>(existing?.area ?? '');
  const [goalId, setGoalId] = useState(existing?.goalId ?? defaults?.goalId ?? '');
  const close = () => closeModal('habit');

  function save() {
    if (!title.trim() || !days.length) return;
    const patch = { title: title.trim(), days, remind, time, area: area || undefined, goalId: goalId || undefined };
    if (existing) updateHabit(existing.id, patch);
    else {
      addHabit(patch);
      toast({ title: 'Hábito criado', body: remind ? `Lembrete às ${time}` : patch.title, icon: 'check' });
    }
    close();
  }

  const presets: { label: string; v: number[] }[] = [
    { label: 'Todo dia', v: [0, 1, 2, 3, 4, 5, 6] },
    { label: 'Dias úteis', v: [1, 2, 3, 4, 5] },
    { label: 'Fins de semana', v: [0, 6] },
    { label: 'Seg/Qua/Sex', v: [1, 3, 5] },
  ];

  return (
    <Modal
      title={existing ? 'Editar hábito' : 'Novo hábito'}
      onClose={close}
      footer={
        <>
          {existing && (
            <>
              <button
                className="btn btn-danger"
                onClick={() => {
                  deleteHabit(existing.id);
                  close();
                }}
              >
                <Trash2 /> Excluir
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => {
                  updateHabit(existing.id, { archived: !existing.archived });
                  close();
                }}
              >
                {existing.archived ? 'Reativar' : 'Arquivar'}
              </button>
            </>
          )}
          <div className="spacer" />
          <button className="btn btn-ghost" onClick={close}>
            Cancelar
          </button>
          <button className="btn btn-primary" onClick={save} disabled={!title.trim() || !days.length}>
            Salvar
          </button>
        </>
      }
    >
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Field label="Hábito">
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Ler 20 páginas" autoFocus />
        </Field>
        {!existing && !title && (
          <div className="row wrap">
            {HABIT_IDEAS.map((h) => (
              <button type="button" key={h} className="chip" onClick={() => setTitle(h)}>
                {h}
              </button>
            ))}
          </div>
        )}
        <Field label="Dias" group>
          <div className="stack sm">
            <div className="row wrap">
              {presets.map((p) => (
                <button
                  type="button"
                  key={p.label}
                  className={cx('chip', [...p.v].sort().join() === [...days].sort().join() && 'on')}
                  onClick={() => setDays(p.v)}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <DayPicker value={days} onChange={setDays} />
          </div>
        </Field>
        <div className="setting" style={{ padding: '4px 0' }}>
          <div className="s-text">
            <b>Lembrete diário</b>
            <span>Notifica no horário escolhido enquanto não for marcado.</span>
          </div>
          <input className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} disabled={!remind} style={{ width: 132 }} />
          <Switch on={remind} onChange={setRemind} label="Lembrete" />
        </div>
        <div className="grid-2">
          <Field label="Área">
            <select className="select" value={area} onChange={(e) => setArea(e.target.value as AreaKey | '')}>
              <option value="">—</option>
              {AREAS.map((a) => (
                <option key={a.key} value={a.key}>
                  {a.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Meta vinculada">
            <select className="select" value={goalId} onChange={(e) => setGoalId(e.target.value)}>
              <option value="">—</option>
              {s.goals
                .filter((g) => g.status === 'active' || g.id === goalId)
                .map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.title}
                  </option>
                ))}
            </select>
          </Field>
        </div>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

export function nowPlus(min: number) {
  return Date.now() + min * 60_000;
}

export function defaultTimeFor(key: string) {
  return key === todayKey() ? timeOf(new Date(roundTo5(Date.now() + 60 * 60_000))) : '09:00';
}
