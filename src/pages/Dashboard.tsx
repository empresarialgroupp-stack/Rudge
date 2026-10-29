import { useEffect, useMemo, useState } from 'react';
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
  Camera,
  Mic,
  NotebookPen,
  Plus,
  Timer,
  TrendingDown,
  TrendingUp,
  Trophy,
  type LucideIcon,
} from 'lucide-react';
import { useStore } from '../lib/store';
import { dismissSuggestion, moveOverdueToToday, toggleHabit, addTask, updateSettings, retimeReminder, updateHabit } from '../lib/actions';
import { navigate, openModal, toast, useNarrow, useRoute } from '../lib/ui';
import { capitalize, dateKey, formatWhen, fromNow, greeting, MONTHS, timeOf, todayKey, WEEKDAYS } from '../lib/date';
import { goalPace, goalProgress, habitStreak, isHabitDueOn } from '../lib/goals';
import { occurrencesBetween } from '../lib/recurrence';
import { getSuggestions, type Suggestion } from '../lib/suggestions';
import { parseInput } from '../lib/nlp';
import { permission, requestPermission } from '../lib/notify';
import { isStandalone } from '../lib/pwa';
import { enablePush, pushSupported } from '../lib/push';
import { useSession } from '../lib/auth';
import { displayName } from '../lib/summary';
import { dailyCounts, periodSeries, type PeriodMode } from '../lib/stats';
import { BarChart, CountUp, Gauge, Sparkline } from '../components/charts';
import { PlanCard } from '../components/PlanCard';
import { prevMonth } from '../lib/retro';
import { Checkbox, cx, Empty, Segmented } from '../components/ui';
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
    case 'retime':
      if (a.kind === 'reminder') retimeReminder(a.id, a.time);
      else updateHabit(a.id, { time: a.time });
      dismissSuggestion(sg.id);
      toast({ title: `Horário mudado para ${a.time}`, body: 'O Rudge passa a avisar no novo horário.', icon: 'check' });
      break;
    case 'add-task':
      addTask({ title: a.title, due: todayKey(), priority: 2, goalId: a.goalId });
      toast({ title: 'Tarefa criada para hoje', body: a.title, icon: 'check' });
      break;
  }
}

export function Dashboard() {
  const s = useStore();
  const route = useRoute();
  // atalhos vindos das notificações: #/inicio?plano=1 · ?retro=2026-10 · ?foco=1
  const qp = route.params.toString();
  useEffect(() => {
    const p = new URLSearchParams(qp);
    if (p.get('retro')) openModal({ type: 'retro', month: p.get('retro')! });
    if (p.get('foco')) openModal({ type: 'focus' });
    if (p.get('plano')) setTimeout(() => document.getElementById('plano')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 400);
    if (p.toString()) history.replaceState(null, '', '#/inicio');
  }, [qp]);
  const narrow = useNarrow();
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
      if (r.done || r.place) continue;
      const ack = r.ackUntil ? Date.parse(r.ackUntil) : 0;
      for (const at of occurrencesBetween({ at: Date.parse(r.at), repeat: r.repeat, days: r.days }, now - 6 * 3_600_000, now + 3 * 86_400_000)) {
        if (at > ack && (at > now || r.repeat === 'none')) list.push({ id: r.id, title: r.title, at });
      }
    }
    return list.sort((a, b) => a.at - b.at).slice(0, 5);
  }, [s.reminders, now]);

  const activeGoals = s.goals.filter((g) => g.status === 'active');
  const behind = activeGoals.filter((g) => goalPace(g).status === 'behind').length;

  const habitsToday = s.habits.filter((h) => isHabitDueOn(h, today));
  const habitsDone = habitsToday.filter((h) => h.log.includes(today)).length;
  const bestStreak = s.habits.reduce((m, h) => Math.max(m, habitStreak(h)), 0);

  const suggestions = getSuggestions(s, {
    notificationsOk: permission() === 'granted' && s.settings.notifications,
    installed: isStandalone(),
  }).slice(0, 4);

  const daily = useMemo(() => dailyCounts(s, 7), [s]);
  const [period, setPeriod] = useState<PeriodMode>('semanas');
  const series = useMemo(() => periodSeries(s, period), [s, period]);
  const tasksDelta = daily.tasks[6] - daily.tasks[5];
  const habitsDelta = daily.habits[6] - daily.habits[5];

  // meta principal: a ativa com prazo mais próximo (ou a primeira)
  const mainGoal = [...activeGoals].sort((a, b) => (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999'))[0];
  const mainPace = mainGoal ? goalPace(mainGoal) : undefined;
  const onPace = activeGoals.length - behind;
  const ranking = [...activeGoals].map((g) => ({ g, p: goalProgress(g) })).sort((a, b) => b.p - a.p).slice(0, 5);
  const remindersToday = nextReminders.filter((r) => dateKey(new Date(r.at)) === today);

  const clock = useClock();
  const userName = s.settings.name || displayName(s, session?.email);

  function submit() {
    if (!text.trim()) return;
    if (createFromText(text, mode)) setText('');
  }

  return (
    <>
      <div className="dash-top stagger">
        <div className="welcome">
          <span className="date-chip">
            <i className="live" /> {clock}
          </span>
          <h1 className="welcome-title">
            {greeting()}
            {userName ? `, ${userName}` : ''}!
          </h1>
          <p className="welcome-sub">
            {focus.length ? (
              <>
                Hoje você tem <b>{focus.length} {focus.length === 1 ? 'tarefa' : 'tarefas'}</b>
              </>
            ) : (
              <>Nenhuma tarefa pendente para hoje</>
            )}
            {remindersToday.length > 0 && (
              <>
                {' '}e <b>{remindersToday.length} {remindersToday.length === 1 ? 'lembrete' : 'lembretes'}</b>
              </>
            )}
            {behind > 0 ? (
              <>
                {' '}— <b>{behind} {behind === 1 ? 'meta' : 'metas'}</b> fora do ritmo.
              </>
            ) : (
              '.'
            )}
          </p>
          <div className="welcome-actions">
            <button className="btn btn-primary btn-pill" onClick={() => openModal({ type: 'task' })}>
              <Plus /> Nova tarefa
            </button>
            <button className="btn btn-glass btn-pill" onClick={() => openModal({ type: 'focus' })}>
              <Timer /> Focar
            </button>
            <button className="btn btn-glass btn-pill" onClick={() => openModal({ type: 'voice' })}>
              <Mic /> Falar
            </button>
          </div>
        </div>

        <button className="kpi2 glass" onClick={() => navigate('tarefas?f=hoje')}>
          <div className="k-head">
            <span>Tarefas de hoje</span>
            <span className="k-icon">
              <ListTodo />
            </span>
          </div>
          <div className="k-value">
            <CountUp value={doneToday.length} />
            <small>/{totalToday}</small>
            <Delta n={tasksDelta} />
          </div>
          <div className="k-foot">
            <span>concluídas · 7 dias</span>
            <Sparkline data={daily.tasks} />
          </div>
        </button>

        <button className="kpi2 glass" onClick={() => navigate('habitos')}>
          <div className="k-head">
            <span>Hábitos</span>
            <span className="k-icon">
              <Flame />
            </span>
          </div>
          <div className="k-value">
            <CountUp value={habitsDone} />
            <small>/{habitsToday.length}</small>
            <Delta n={habitsDelta} />
          </div>
          <div className="k-foot">
            <span>melhor sequência · {bestStreak} d</span>
            <Sparkline data={daily.habits} />
          </div>
        </button>

        <button className="kpi2 glass" onClick={() => navigate('lembretes')}>
          <div className="k-head">
            <span>Próximo lembrete</span>
            <span className="k-icon">
              <AlarmClock />
            </span>
          </div>
          <div className="k-value">{nextReminders[0] ? fromNow(nextReminders[0].at) : '—'}</div>
          <div className="k-foot">
            <span className="k-ellipsis">{nextReminders[0]?.title ?? 'nenhum programado'}</span>
            <span className="k-times">
              {nextReminders.filter((r, i, a) => a.findIndex((x) => x.id === r.id) === i).slice(0, 3).map((r) => (
                <i key={`${r.id}-${r.at}`}>{timeOf(new Date(r.at))}</i>
              ))}
            </span>
          </div>
        </button>
      </div>

      <div className="capture glass liquid">
        <Wand2 />
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder={narrow ? (mode === 'task' ? 'Nova tarefa… “pagar internet amanhã 10h”' : 'Me lembre de… “ligar pro João em 30 min”') : mode === 'task' ? 'Capture uma tarefa… ex.: “Pagar internet amanhã 10h !!”' : 'Me lembre de… ex.: “ligar pro João em 30 min”'}
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
        <button className="icon-btn" onClick={() => openModal({ type: 'photo' })} aria-label="Capturar por foto" title="Capturar por foto">
          <Camera />
        </button>
        <button className="icon-btn" onClick={() => openModal({ type: 'voice' })} aria-label="Falar" title="Falar com o Rudge">
          <Mic />
        </button>
        <button className="btn btn-primary" onClick={submit} disabled={!text.trim()} aria-label="Adicionar">
          <ArrowRight />
        </button>
      </div>
      {text && (
        <div className="parse-preview">
          <ParseChips p={parsed} mode={mode} />
        </div>
      )}

      <PlanCard />

      {new Date().getDate() <= 7 && (!s.seenRetro || s.seenRetro < prevMonth()) && (
        <button className="banner glass liquid retro-banner" onClick={() => openModal({ type: 'retro', month: prevMonth() })}>
          <Sparkles />
          <span className="b-text">
            <b>Sua retrospectiva do mês está pronta</b> — tarefas feitas, maior sequência, meta que mais avançou e melhor semana.
          </span>
          <ChevronRight />
        </button>
      )}

      {!s.journal[today] && new Date().getHours() >= Math.max(17, Number(s.settings.review.time.slice(0, 2)) - 2) && (
        <button className="banner glass journal-banner" onClick={() => navigate('diario')}>
          <NotebookPen />
          <span className="b-text">
            <b>Diário de 1 minuto</b> — o que deu certo, o que travou e a nota do dia.
          </span>
          <ChevronRight />
        </button>
      )}

      <div className="dash-row stagger">
        <section className="card glass">
          <div className="card-head">
            <h2 className="card-title">
              <BarChart3 /> Produtividade
            </h2>
            <div className="legend-inline">
              <span>
                <i className="dot solid" /> Tarefas e lembretes
              </span>
              <span>
                <i className="dot soft" /> Hábitos
              </span>
            </div>
            <Segmented
              value={period}
              onChange={setPeriod}
              options={[
                { value: 'semanas', label: 'Semanas' },
                { value: 'meses', label: 'Meses' },
              ]}
            />
          </div>
          <BarChart
            key={period}
            labels={series.labels}
            current={series.labels.length - 1}
            series={[
              { name: 'Tarefas e lembretes', values: series.tasks, tone: 'solid' },
              { name: 'Hábitos', values: series.habits, tone: 'soft' },
            ]}
          />
        </section>

        <section className="card glass gauge-card">
          <div className="card-head">
            <h2 className="card-title">
              <Target /> Meta principal
            </h2>
            <button className="link" onClick={() => navigate('metas')}>
              Todas <ChevronRight />
            </button>
          </div>
          {mainGoal && mainPace ? (
            <>
              <button className="gauge-wrap" onClick={() => openModal({ type: 'goal-detail', id: mainGoal.id })}>
                <Gauge value={mainPace.progress} />
                <div className="gauge-center">
                  <b>
                    <CountUp value={mainPace.progress * 100} decimals={1} />%
                  </b>
                  <span>{mainGoal.title}</span>
                </div>
              </button>
              <div className="gauge-stats">
                <div>
                  <span>Metas ativas</span>
                  <b>
                    <CountUp value={activeGoals.length} />
                  </b>
                </div>
                <div className="r">
                  <span>No ritmo</span>
                  <b>
                    <CountUp value={onPace} />
                  </b>
                </div>
              </div>
              <div className="gauge-foot">
                <TrendingUp />
                <span>
                  {mainPace.label}
                  {mainPace.daysLeft !== undefined && mainPace.daysLeft >= 0 ? ` · ${mainPace.daysLeft} dias restantes` : ''}
                </span>
              </div>
            </>
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
      </div>

      <div className="dash-grid">
        <div className="dash-col stagger">
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
        </div>

        <div className="dash-col stagger">
          {ranking.length > 0 && (
            <section className="card glass">
              <div className="card-head">
                <h2 className="card-title">
                  <Trophy /> Metas por progresso
                </h2>
                <button className="link" onClick={() => navigate('metas')}>
                  Todas <ChevronRight />
                </button>
              </div>
              <div className="rank-list">
                {ranking.map(({ g, p }, i) => {
                  const pace = goalPace(g);
                  return (
                    <button key={g.id} className={cx('rank', i === 0 && 'first')} onClick={() => openModal({ type: 'goal-detail', id: g.id })}>
                      <span className="rank-n">{i + 1}</span>
                      <span className="rank-body">
                        <span className="rank-top">
                          <b>{g.title}</b>
                          <span className="v">{Math.round(p * 100)}%</span>
                        </span>
                        <span className="rank-sub">
                          {pace.label}
                          {pace.daysLeft !== undefined && pace.daysLeft >= 0 ? ` · ${pace.daysLeft} dias` : ''}
                        </span>
                        <span className="rank-bar">
                          <i style={{ width: `${Math.max(2, p * 100)}%`, animationDelay: `${120 + i * 70}ms` }} />
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

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

function Delta({ n }: { n: number }) {
  if (!n) return null;
  return (
    <span className={cx('delta', n < 0 && 'down')} title="em relação a ontem">
      {n > 0 ? <TrendingUp /> : <TrendingDown />}
      {n > 0 ? `+${n}` : n}
    </span>
  );
}

/** "Segunda, 26 out · 16:17", atualizado a cada minuto. */
function useClock() {
  const fmt = () => {
    const d = new Date();
    const wd = capitalize(WEEKDAYS[d.getDay()]);
    return `${wd}, ${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)} · ${timeOf(d)}`;
  };
  const [v, setV] = useState(fmt);
  useEffect(() => {
    const t = setInterval(() => setV(fmt()), 15_000);
    return () => clearInterval(t);
  }, []);
  return v;
}
