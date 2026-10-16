import { useMemo, useState } from 'react';
import {
  AlarmClock,
  ArrowRight,
  BarChart3,
  Bell,
  ChevronRight,
  ClipboardCheck,
  Download,
  Flame,
  ListTodo,
  Sparkles,
  Target,
  Wand2,
  type LucideIcon,
} from 'lucide-react';
import { useStore } from '../lib/store';
import { dismissSuggestion, moveOverdueToToday, toggleHabit, addTask, updateSettings } from '../lib/actions';
import { navigate, openModal, toast } from '../lib/ui';
import { addDays, dateKey, formatWhen, fromNow, startOfWeek, todayKey, WEEKDAYS_SHORT } from '../lib/date';
import { goalPace, goalProgress, habitStreak, isHabitDueOn } from '../lib/goals';
import { occurrencesBetween } from '../lib/recurrence';
import { getSuggestions, type Suggestion } from '../lib/suggestions';
import { parseInput } from '../lib/nlp';
import { permission, requestPermission } from '../lib/notify';
import { isStandalone } from '../lib/pwa';
import { enablePush, pushSupported } from '../lib/push';
import { useSession } from '../lib/auth';
import { greetingTitle, todaySummary } from '../lib/summary';
import { AreaIcon, Checkbox, cx, Empty, ProgressBar, ProgressRing, Segmented } from '../components/ui';
import { TaskRow, sortTasks } from '../components/TaskRow';
import { createFromText, ParseChips, type CaptureMode } from '../components/Quick';

const TONE_ICON: Record<Suggestion['tone'], LucideIcon> = {
  goal: Target,
  focus: ListTodo,
  habit: Flame,
  system: Bell,
  review: ClipboardCheck,
};

export async function enableNotifications() {
  const res = await requestPermission();
  if (res === 'granted') {
    updateSettings({ notifications: true });
    const push = pushSupported() ? await enablePush() : false;
    toast({
      title: 'Notificações ativadas',
      body: push
        ? 'Os avisos chegam mesmo com o Rudge fechado.'
        : 'O Rudge vai lembrar você enquanto estiver aberto ou minimizado.',
      icon: 'check',
    });
    return true;
  }
  if (res === 'denied') {
    toast({
      title: 'Notificações bloqueadas',
      body: 'Libere nas configurações do navegador (ícone de cadeado ao lado do endereço) e tente de novo.',
      icon: 'error',
      duration: 9000,
    });
  } else if (res === 'unsupported') {
    toast({
      title: 'Navegador sem suporte',
      body: 'No iPhone, instale o Rudge na Tela de Início primeiro. Veja “Instalar app”.',
      icon: 'info',
      duration: 9000,
    });
  }
  return false;
}

export function runSuggestion(sg: Suggestion) {
  const a = sg.action;
  switch (a.type) {
    case 'wizard':
      openModal({ type: 'goal-wizard', templateId: a.templateId });
      break;
    case 'overdue-today':
      moveOverdueToToday();
      break;
    case 'goal':
      openModal({ type: 'goal-detail', id: a.goalId });
      break;
    case 'navigate':
      navigate(a.to);
      break;
    case 'notifications':
      void enableNotifications();
      break;
    case 'install':
      navigate('instalar');
      break;
    case 'add-task':
      addTask({ title: a.title, due: todayKey(), priority: 2, goalId: a.goalId });
      toast({ title: 'Tarefa criada para hoje', body: a.title, icon: 'check' });
      break;
  }
}

export function Dashboard() {
  const s = useStore();
  const session = useSession();
  const today = todayKey();
  const [mode, setMode] = useState<CaptureMode>('task');
  const [text, setText] = useState('');
  const parsed = useMemo(() => parseInput(text), [text]);

  const open = s.tasks.filter((t) => !t.done);
  const focus = open.filter((t) => t.due && t.due <= today).sort(sortTasks);
  const doneToday = s.tasks.filter((t) => t.done && t.doneAt && dateKey(new Date(t.doneAt)) === today);
  const totalToday = focus.length + doneToday.length;

  const now = Date.now();
  const nextReminders = useMemo(() => {
    const list: { id: string; title: string; at: number }[] = [];
    for (const r of s.reminders) {
      if (r.done) continue;
      const ack = r.ackUntil ? Date.parse(r.ackUntil) : 0;
      for (const at of occurrencesBetween({ at: Date.parse(r.at), repeat: r.repeat, days: r.days }, now - 6 * 3_600_000, now + 3 * 86_400_000)) {
        if (at > ack && (at > now || r.repeat === 'none')) list.push({ id: r.id, title: r.title, at });
      }
    }
    return list.sort((a, b) => a.at - b.at).slice(0, 5);
  }, [s.reminders, now]);

  const activeGoals = s.goals.filter((g) => g.status === 'active');
  const avgGoal = activeGoals.length ? activeGoals.reduce((n, g) => n + goalProgress(g), 0) / activeGoals.length : 0;
  const behind = activeGoals.filter((g) => goalPace(g).status === 'behind').length;

  const habitsToday = s.habits.filter((h) => isHabitDueOn(h, today));
  const habitsDone = habitsToday.filter((h) => h.log.includes(today)).length;
  const bestStreak = s.habits.reduce((m, h) => Math.max(m, habitStreak(h)), 0);

  const suggestions = getSuggestions(s, {
    notificationsOk: permission() === 'granted' && s.settings.notifications,
    installed: isStandalone(),
  }).slice(0, 4);

  const week = useMemo(() => {
    const start = startOfWeek(new Date());
    return Array.from({ length: 7 }, (_, i) => {
      const key = dateKey(addDays(start, i));
      const tasks = s.tasks.filter((t) => t.doneAt && dateKey(new Date(t.doneAt)) === key).length;
      const habits = s.habits.filter((h) => h.log.includes(key)).length;
      return { key, dow: addDays(start, i).getDay(), n: tasks + habits };
    });
  }, [s.tasks, s.habits]);
  const weekMax = Math.max(4, ...week.map((w) => w.n));
  const weekTotal = week.reduce((n, w) => n + w.n, 0);

  function submit() {
    if (!text.trim()) return;
    if (createFromText(text, mode)) setText('');
  }

  return (
    <>
      <div className="hero only-mobile">
        <h1>{greetingTitle(s, session?.email)}</h1>
        <p>{todaySummary(s)}</p>
      </div>

      <div className="capture glass liquid">
        <Wand2 />
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder={mode === 'task' ? 'Capture uma tarefa… ex.: “Pagar internet amanhã 10h !!”' : 'Me lembre de… ex.: “ligar pro João em 30 min”'}
          aria-label="Captura rápida"
        />
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: 'task', label: 'Tarefa' },
            { value: 'reminder', label: 'Lembrete' },
          ]}
        />
        <button className="btn btn-primary" onClick={submit} disabled={!text.trim()} aria-label="Adicionar">
          <ArrowRight />
        </button>
      </div>
      {text && (
        <div className="parse-preview">
          <ParseChips p={parsed} mode={mode} />
        </div>
      )}

      <div className="kpis">
        <div className="kpi glass">
          <ProgressRing value={totalToday ? doneToday.length / totalToday : 0} size={50} stroke={5} />
          <div className="kpi-body">
            <div className="kpi-label">
              <ListTodo /> Hoje
            </div>
            <div className="kpi-value">
              {doneToday.length}
              <small>/{totalToday}</small>
            </div>
            <div className="kpi-hint">tarefas concluídas</div>
          </div>
        </div>
        <div className="kpi glass">
          <ProgressRing value={avgGoal} size={50} stroke={5} />
          <div className="kpi-body">
            <div className="kpi-label">
              <Target /> Metas
            </div>
            <div className="kpi-value">{activeGoals.length}</div>
            <div className="kpi-hint">{activeGoals.length ? (behind ? `${behind} fora do ritmo` : 'todas no ritmo') : 'nenhuma ativa'}</div>
          </div>
        </div>
        <div className="kpi glass">
          <ProgressRing value={habitsToday.length ? habitsDone / habitsToday.length : 0} size={50} stroke={5} />
          <div className="kpi-body">
            <div className="kpi-label">
              <Flame /> Hábitos
            </div>
            <div className="kpi-value">
              {habitsDone}
              <small>/{habitsToday.length}</small>
            </div>
            <div className="kpi-hint">melhor sequência: {bestStreak} d</div>
          </div>
        </div>
        <div className="kpi glass">
          <div className="kpi-body">
            <div className="kpi-label">
              <AlarmClock /> Próximo lembrete
            </div>
            <div className="kpi-value" style={{ fontSize: 20 }}>
              {nextReminders[0] ? fromNow(nextReminders[0].at) : '—'}
            </div>
            <div className="kpi-hint">{nextReminders[0]?.title ?? 'nenhum programado'}</div>
          </div>
        </div>
      </div>

      <div className="dash-grid">
        <div className="dash-col">
          <section className="card glass">
            <div className="card-head">
              <h2 className="card-title">
                <ListTodo /> Foco de hoje
              </h2>
              <button className="link" onClick={() => navigate('tarefas')}>
                Ver todas <ChevronRight />
              </button>
            </div>
            {focus.length || doneToday.length ? (
              <div className="list">
                {focus.slice(0, 8).map((t) => (
                  <TaskRow key={t.id} task={t} showDate={t.due !== today} />
                ))}
                {doneToday.slice(0, 3).map((t) => (
                  <TaskRow key={t.id} task={t} showDate={false} />
                ))}
                {focus.length > 8 && (
                  <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start', marginTop: 6 }} onClick={() => navigate('tarefas')}>
                    + {focus.length - 8} tarefas
                  </button>
                )}
              </div>
            ) : (
              <Empty
                icon={ListTodo}
                title="Dia livre"
                text="Nenhuma tarefa para hoje. Escolha até 3 prioridades para avançar."
                action={
                  <button className="btn btn-glass btn-sm" onClick={() => openModal({ type: 'task' })}>
                    Adicionar tarefa
                  </button>
                }
              />
            )}
          </section>

          <section className="card glass">
            <div className="card-head">
              <h2 className="card-title">
                <Target /> Metas em andamento
              </h2>
              <button className="link" onClick={() => navigate('metas')}>
                Todas <ChevronRight />
              </button>
            </div>
            {activeGoals.length ? (
              activeGoals.slice(0, 4).map((g) => {
                const pace = goalPace(g);
                return (
                  <div key={g.id} className="goal-mini" onClick={() => openModal({ type: 'goal-detail', id: g.id })}>
                    <div className="top">
                      <AreaIcon area={g.area} />
                      <b>{g.title}</b>
                      <span className="pct">{Math.round(pace.progress * 100)}%</span>
                    </div>
                    <ProgressBar value={pace.progress} marker={pace.expected} />
                    <div className="bottom">
                      <span>{pace.label}</span>
                      <span>{pace.daysLeft !== undefined ? `${Math.max(0, pace.daysLeft)} dias restantes` : ''}</span>
                    </div>
                  </div>
                );
              })
            ) : (
              <Empty
                icon={Target}
                title="Nenhuma meta ativa"
                text="O assistente propõe metas concretas e monta o plano com etapas e lembretes."
                action={
                  <button className="btn btn-primary btn-sm" onClick={() => openModal({ type: 'goal-wizard' })}>
                    <Sparkles /> Criar meta
                  </button>
                }
              />
            )}
          </section>

          <section className="card glass">
            <div className="card-head">
              <h2 className="card-title">
                <BarChart3 /> Sua semana
              </h2>
              <span className="link">{weekTotal} conclusões</span>
            </div>
            <div className="week-chart">
              {week.map((w) => (
                <div className="col" key={w.key}>
                  <div className={cx('barv', w.n > 0 && 'on')} style={{ height: `${Math.max(4, (w.n / weekMax) * 100)}%` }}>
                    {w.n > 0 && <span>{w.n}</span>}
                  </div>
                  <span className={cx('d', w.key === today && 'today')}>{WEEKDAYS_SHORT[w.dow]}</span>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="dash-col">
          <section className="card glass liquid">
            <div className="card-head">
              <h2 className="card-title">
                <Sparkles /> Rudge sugere
              </h2>
            </div>
            {suggestions.length ? (
              suggestions.map((sg) => {
                const I = TONE_ICON[sg.tone];
                return (
                  <div className="suggestion" key={sg.id}>
                    <div className="s-icon">
                      <I />
                    </div>
                    <div className="s-body">
                      <b>{sg.title}</b>
                      <p>{sg.body}</p>
                      <div className="s-actions">
                        <button className="btn btn-sm btn-primary" onClick={() => runSuggestion(sg)}>
                          {sg.cta}
                        </button>
                        <button className="btn btn-sm btn-ghost" onClick={() => dismissSuggestion(sg.id)}>
                          Agora não
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <Empty icon={Sparkles} title="Tudo em ordem" text="Sem pendências ou alertas. Continue assim." />
            )}
          </section>

          <section className="card glass">
            <div className="card-head">
              <h2 className="card-title">
                <Flame /> Hábitos de hoje
              </h2>
              <button className="link" onClick={() => navigate('habitos')}>
                Gerenciar <ChevronRight />
              </button>
            </div>
            {habitsToday.length ? (
              <div className="habit-pills">
                {habitsToday.map((h) => {
                  const done = h.log.includes(today);
                  return (
                    <div key={h.id} className={cx('habit-pill', done && 'done')}>
                      <Checkbox checked={done} onChange={() => toggleHabit(h.id)} label={h.title} />
                      <span className="h-title">{h.title}</span>
                      <span className="streak">
                        <Flame /> {habitStreak(h)}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <Empty
                icon={Flame}
                title="Sem hábitos para hoje"
                text="Hábitos diários com lembrete são o motor das suas metas."
                action={
                  <button className="btn btn-glass btn-sm" onClick={() => openModal({ type: 'habit' })}>
                    Criar hábito
                  </button>
                }
              />
            )}
          </section>

          <section className="card glass">
            <div className="card-head">
              <h2 className="card-title">
                <AlarmClock /> Próximos lembretes
              </h2>
              <button className="link" onClick={() => navigate('lembretes')}>
                Todos <ChevronRight />
              </button>
            </div>
            {nextReminders.length ? (
              <div className="list">
                {nextReminders.map((r) => (
                  <div key={`${r.id}-${r.at}`} className="item" onClick={() => openModal({ type: 'reminder', id: r.id })} style={{ cursor: 'pointer' }}>
                    <div className="lead-icon">
                      <Bell />
                    </div>
                    <div className="item-main">
                      <div className="item-title">{r.title}</div>
                      <div className="item-meta">
                        <span className={cx('meta', r.at < now && 'strong')}>{r.at < now ? `Atrasado · ${formatWhen(r.at)}` : formatWhen(r.at)}</span>
                      </div>
                    </div>
                    <span className="chip">{fromNow(r.at)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <Empty
                icon={AlarmClock}
                title="Nenhum lembrete"
                text="Peça: “me lembre de pagar o boleto amanhã às 10h”."
                action={
                  <button className="btn btn-glass btn-sm" onClick={() => openModal({ type: 'reminder' })}>
                    Novo lembrete
                  </button>
                }
              />
            )}
          </section>

          {!isStandalone() && (
            <button className="banner glass" onClick={() => navigate('instalar')} style={{ textAlign: 'left' }}>
              <Download />
              <span className="b-text">
                <b>Instale o Rudge</b> no computador e no celular — passo a passo dentro do app.
              </span>
              <ChevronRight />
            </button>
          )}
        </div>
      </div>
    </>
  );
}
