import { useMemo, useState } from 'react';
import { Activity, ArrowLeft, ArrowRight, Check, CheckCircle2, Flame, ListTodo, Target, Trash2 } from 'lucide-react';
import { useStore } from '../lib/store';
import { addTask, deleteTask, finishWeeklyReview, rescheduleTasks, toggleTask, bumpGoal } from '../lib/actions';
import { navigate, openModal, toast } from '../lib/ui';
import { addDays, addDaysKey, dateKey, relativeDay, todayKey } from '../lib/date';
import { fmtNum, goalPace, isHabitDueOn } from '../lib/goals';
import { AreaIcon, cx, Empty, ProgressBar, Segmented, StatCard, StatRow } from '../components/ui';
import { LineChart } from '../components/charts';
import { dailyBreakdown } from '../lib/stats';

export function Review() {
  const s = useStore();
  const [step, setStep] = useState(0);
  const [prios, setPrios] = useState(['', '', '']);
  const [range, setRange] = useState<14 | 30 | 90>(30);
  const series = useMemo(() => dailyBreakdown(s, range), [s, range]);
  const today = todayKey();
  const weekAgo = addDaysKey(today, -6);
  const nextMonday = dateKey(addDays(new Date(), ((8 - new Date().getDay()) % 7) || 7));

  const stats = useMemo(() => {
    const doneTasks = s.tasks.filter((t) => t.doneAt && dateKey(new Date(t.doneAt)) >= weekAgo).length;
    let scheduled = 0;
    let done = 0;
    for (let i = 0; i < 7; i++) {
      const k = addDaysKey(today, -i);
      for (const h of s.habits) {
        if (!isHabitDueOn(h, k) || k < h.createdAt.slice(0, 10)) continue;
        scheduled++;
        if (h.log.includes(k)) done++;
      }
    }
    const goalLogs = s.goals.reduce((n, g) => n + g.log.filter((l) => l.date.slice(0, 10) >= weekAgo && l.note !== 'Início').length, 0);
    return { doneTasks, habitRate: scheduled ? done / scheduled : 0, habitDone: done, goalLogs };
  }, [s, today, weekAgo]);

  const pending = s.tasks.filter((t) => !t.done && (!t.due || t.due < today));
  const active = s.goals.filter((g) => g.status === 'active');
  const steps = ['Sua semana', 'Pendências', 'Metas', 'Próxima semana'];

  function finish() {
    const list = prios.map((p) => p.trim()).filter(Boolean);
    list.forEach((title, i) => addTask({ title, due: addDaysKey(nextMonday, i), priority: 3 }));
    finishWeeklyReview();
    toast({ title: 'Revisão concluída', body: list.length ? `${list.length} prioridade(s) planejadas para a semana.` : 'Boa semana!', icon: 'spark' });
    navigate('inicio');
  }

  return (
    <div style={{ maxWidth: 980 }}>
      <div className="steps">
        {steps.map((_, i) => (
          <i key={i} className={i <= step ? 'on' : ''} />
        ))}
      </div>
      <div className="row" style={{ marginBottom: 14 }}>
        <h2 style={{ margin: 0, fontSize: 19, fontWeight: 650, letterSpacing: '-0.02em' }}>
          {step + 1}. {steps[step]}
        </h2>
        {s.lastWeeklyReview && <span className="muted" style={{ marginLeft: 'auto', fontSize: 12.5 }}>Última revisão: {relativeDay(s.lastWeeklyReview).toLowerCase()}</span>}
      </div>

      {step === 0 && (
        <div className="stack">
          <StatRow cols={3}>
            <StatCard icon={CheckCircle2} label="Tarefas concluídas" value={stats.doneTasks} hint="últimos 7 dias" />
            <StatCard icon={Flame} label="Hábitos" value={stats.habitRate * 100} suffix="%" hint={`${stats.habitDone} check-ins`} />
            <StatCard icon={Target} label="Registros em metas" value={stats.goalLogs} hint="atualizações" />
          </StatRow>
          <section className="card glass">
            <div className="card-head">
              <h2 className="card-title">
                <Activity /> Seu ritmo
              </h2>
              <div className="legend-inline">
                <span>
                  <i className="dot solid" /> Tarefas
                </span>
                <span>
                  <i className="dot soft" /> Hábitos
                </span>
                <span>
                  <i className="dot dim" /> Lembretes
                </span>
              </div>
              <Segmented
                value={range}
                onChange={setRange}
                options={[
                  { value: 14, label: '14 d' },
                  { value: 30, label: '30 d' },
                  { value: 90, label: '90 d' },
                ]}
              />
            </div>
            <LineChart
              key={range}
              labels={series.labels}
              series={[
                { name: 'Tarefas', values: series.tasks, tone: 'solid' },
                { name: 'Hábitos', values: series.habits, tone: 'soft' },
                { name: 'Lembretes', values: series.reminders, tone: 'dim' },
              ]}
            />
          </section>
          <div className="callout">
            <Check />
            <span>
              Reconheça o que você fez. Em seguida vamos limpar as pendências, ajustar as metas e escolher as 3 prioridades da próxima semana.
            </span>
          </div>
        </div>
      )}

      {step === 1 && (
        <section className="group-card glass">
          {pending.length ? (
            <div className="list">
              {pending.map((t) => (
                <div key={t.id} className="item">
                  <div className="item-main" onClick={() => openModal({ type: 'task', id: t.id })}>
                    <div className="item-title">{t.title}</div>
                    <div className="item-meta">
                      <span className="meta">{t.due ? `Atrasada · ${relativeDay(t.due)}` : 'Sem data'}</span>
                    </div>
                  </div>
                  <div className="row wrap" style={{ gap: 4, justifyContent: 'flex-end' }}>
                    <button className="chip" onClick={() => toggleTask(t.id, true)}>
                      Feita
                    </button>
                    <button className="chip" onClick={() => rescheduleTasks([t.id], today)}>
                      Hoje
                    </button>
                    <button className="chip" onClick={() => rescheduleTasks([t.id], nextMonday)}>
                      Próx. semana
                    </button>
                    <button className="icon-btn sm" onClick={() => deleteTask(t.id)} aria-label="Excluir">
                      <Trash2 />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Empty icon={ListTodo} title="Nenhuma pendência" text="Sem tarefas atrasadas ou sem data. Excelente." />
          )}
        </section>
      )}

      {step === 2 && (
        <div className="stack sm">
          {active.length ? (
            active.map((g) => {
              const pace = goalPace(g);
              return (
                <div key={g.id} className="glass card">
                  <div className="row" style={{ marginBottom: 10 }}>
                    <AreaIcon area={g.area} />
                    <b style={{ flex: 1, minWidth: 0 }}>{g.title}</b>
                    <span className={cx('chip', pace.status === 'behind' && 'warn')}>{pace.label}</span>
                  </div>
                  <ProgressBar value={pace.progress} marker={pace.expected} />
                  <p className="muted" style={{ margin: '10px 0', fontSize: 12.5 }}>{pace.advice}</p>
                  <div className="row wrap">
                    {g.kind === 'numeric' ? (
                      <>
                        <span className="chip num">
                          {fmtNum(g.current ?? 0)} / {fmtNum(g.target ?? 0)} {g.unit}
                        </span>
                        <button className="btn btn-sm btn-glass" onClick={() => bumpGoal(g.id, 1)}>
                          +1
                        </button>
                      </>
                    ) : (
                      <span className="chip">
                        {g.milestones.filter((m) => m.done).length}/{g.milestones.length} etapas
                      </span>
                    )}
                    <button className="btn btn-sm btn-ghost" onClick={() => openModal({ type: 'goal-detail', id: g.id })}>
                      Atualizar
                    </button>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="glass card">
              <Empty
                icon={Target}
                title="Nenhuma meta ativa"
                text="Uma boa revisão termina com pelo menos uma meta em andamento."
                action={
                  <button className="btn btn-primary btn-sm" onClick={() => openModal({ type: 'goal-wizard' })}>
                    Criar meta
                  </button>
                }
              />
            </div>
          )}
        </div>
      )}

      {step === 3 && (
        <div className="glass card stack">
          <p className="muted" style={{ margin: 0 }}>
            Quais são as 3 coisas que, se feitas, tornam a próxima semana um sucesso? Elas entram como tarefas de alta prioridade a partir de {relativeDay(nextMonday).toLowerCase()}.
          </p>
          {prios.map((p, i) => (
            <div key={i} className="row">
              <span className="chip solid num">{i + 1}</span>
              <input
                className="input"
                value={p}
                placeholder={['Ex.: Finalizar proposta do cliente X', 'Ex.: 3 treinos na semana', 'Ex.: Organizar finanças do mês'][i]}
                onChange={(e) => setPrios(prios.map((x, j) => (j === i ? e.target.value : x)))}
              />
            </div>
          ))}
        </div>
      )}

      <div className="row" style={{ marginTop: 18 }}>
        {step > 0 && (
          <button className="btn btn-ghost" onClick={() => setStep(step - 1)}>
            <ArrowLeft /> Voltar
          </button>
        )}
        <div className="spacer" />
        {step < 3 ? (
          <button className="btn btn-primary" onClick={() => setStep(step + 1)}>
            Continuar <ArrowRight />
          </button>
        ) : (
          <button className="btn btn-primary" onClick={finish}>
            <Check /> Concluir revisão
          </button>
        )}
      </div>
    </div>
  );
}
