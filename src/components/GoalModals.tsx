import { useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Flame,
  Minus,
  Pause,
  Pencil,
  Play,
  Plus,
  Sparkles,
  Trash2,
  X,
  RefreshCw,
  CalendarClock,
  ListOrdered,
  Timer,
} from 'lucide-react';
import type { AreaKey, CheckinFreq, Goal, Milestone } from '../lib/types';
import { useStore, uid } from '../lib/store';
import {
  addGoal,
  addTask,
  bumpGoal,
  deleteGoal,
  setGoalStatus,
  setGoalValue,
  setMilestones,
  toggleMilestone,
  updateGoal,
  changeGoalDeadline,
  splitGoalIntoSteps,
} from '../lib/actions';
import { closeModal, openModal, toast } from '../lib/ui';
import { addDays, addDaysKey, dateKey, diffDays, formatWhen, parseKey, shortDate, todayKey, WEEKDAYS } from '../lib/date';
import { AREA_LABEL, AREAS, fmtNum, goalPace, goalProgress, habitStreak, recalcGoal } from '../lib/goals';
import { TEMPLATES, templateById, type GoalTemplate } from '../lib/templates';
import { AreaIcon, cx, DayPicker, Field, Modal, ProgressBar, ProgressRing, Segmented, Switch } from './ui';

/* ---------------- Assistente ---------------- */

interface Draft {
  area: AreaKey;
  templateId?: string;
  title: string;
  why: string;
  kind: 'numeric' | 'milestones';
  startValue: number;
  target: number;
  unit: string;
  deadline: string;
  milestones: Milestone[];
  habitOn: boolean;
  habitTitle: string;
  habitDays: number[];
  habitTime: string;
  habitCounts: boolean;
  checkin: CheckinFreq;
  checkinTime: string;
  checkinWeekday: number;
  firstStep: string;
}

function fromTemplate(t: GoalTemplate): Draft {
  return {
    area: t.area,
    templateId: t.id,
    title: t.title,
    why: '',
    kind: t.kind,
    startValue: t.startValue ?? 0,
    target: t.target ?? 10,
    unit: t.unit ?? '',
    deadline: dateKey(addDays(new Date(), t.days)),
    milestones: (t.milestones ?? []).map((m) => ({ id: uid(), title: m, done: false })),
    habitOn: !!t.habit,
    habitTitle: t.habit?.title ?? '',
    habitDays: t.habit?.days ?? [1, 2, 3, 4, 5],
    habitTime: t.habit?.time ?? '09:00',
    habitCounts: !!t.habitCounts,
    checkin: t.checkin,
    checkinTime: t.checkin === 'daily' ? '20:00' : '19:00',
    checkinWeekday: 0,
    firstStep: t.firstStep,
  };
}

function blank(area: AreaKey): Draft {
  return {
    area,
    title: '',
    why: '',
    kind: 'numeric',
    startValue: 0,
    target: 10,
    unit: '',
    deadline: dateKey(addDays(new Date(), 90)),
    milestones: [],
    habitOn: false,
    habitTitle: '',
    habitDays: [1, 2, 3, 4, 5],
    habitTime: '09:00',
    habitCounts: false,
    checkin: 'weekly',
    checkinTime: '19:00',
    checkinWeekday: 0,
    firstStep: '',
  };
}

/** Etapas automáticas para metas numéricas: 25/50/75/100% com datas proporcionais. */
function autoMilestones(d: Draft): Milestone[] {
  const total = Math.max(1, diffDays(d.deadline, todayKey()));
  const whole = Number.isInteger(d.startValue) && Number.isInteger(d.target);
  const seen = new Set<number>();
  const out: Milestone[] = [];
  for (const f of [0.25, 0.5, 0.75, 1]) {
    const raw = d.startValue + (d.target - d.startValue) * f;
    const v = whole ? Math.round(raw) : Math.round(raw * 10) / 10;
    if (v === d.startValue || seen.has(v)) continue;
    seen.add(v);
    out.push({
      id: uid(),
      title: `${f === 1 ? 'Chegar a' : 'Atingir'} ${fmtNum(v)}${d.unit ? ' ' + d.unit : ''}`,
      done: false,
      due: addDaysKey(todayKey(), Math.round(total * f)),
    });
  }
  return out;
}

export function GoalWizard({ templateId }: { templateId?: string }) {
  const tpl = templateById(templateId);
  const [step, setStep] = useState(tpl ? 2 : 0);
  const [d, setD] = useState<Draft>(tpl ? fromTemplate(tpl) : blank('saude'));
  const [newMs, setNewMs] = useState('');
  const close = () => closeModal('goal-wizard');
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));

  const areaTemplates = TEMPLATES.filter((t) => t.area === d.area);
  const deadlineQuick = [
    { label: '30 dias', v: dateKey(addDays(new Date(), 30)) },
    { label: '3 meses', v: dateKey(addDays(new Date(), 90)) },
    { label: '6 meses', v: dateKey(addDays(new Date(), 182)) },
    { label: 'Fim do ano', v: `${new Date().getFullYear()}-12-31` },
  ];

  const canNext =
    step === 0 ||
    step === 1 ||
    (step === 2 && d.title.trim() && d.deadline > todayKey() && (d.kind === 'milestones' || d.target !== d.startValue)) ||
    step === 3;

  function goToPlan() {
    if (d.kind === 'numeric' && !d.milestones.length) set({ milestones: autoMilestones(d) });
    setStep(3);
  }

  function create() {
    const goal = addGoal(
      {
        title: d.title.trim(),
        why: d.why.trim() || undefined,
        area: d.area,
        kind: d.kind,
        startValue: d.kind === 'numeric' ? d.startValue : undefined,
        target: d.kind === 'numeric' ? d.target : undefined,
        current: d.kind === 'numeric' ? d.startValue : undefined,
        unit: d.kind === 'numeric' ? d.unit.trim() || undefined : undefined,
        start: todayKey(),
        deadline: d.deadline,
        milestones: d.milestones.filter((m) => m.title.trim()),
        checkin: { freq: d.checkin, time: d.checkinTime, weekday: d.checkinWeekday },
        templateId: d.templateId,
        habitCounts: d.habitOn && d.habitCounts && d.kind === 'numeric',
      },
      {
        habit: d.habitOn && d.habitTitle.trim()
          ? { title: d.habitTitle.trim(), days: d.habitDays, time: d.habitTime, remind: true, area: d.area }
          : undefined,
        firstStep: d.firstStep.trim() || undefined,
      },
    );
    close();
    toast({
      title: 'Meta criada',
      body: `${goal.title}${d.habitOn ? ' · hábito e lembretes configurados' : ''}`,
      icon: 'spark',
      actions: [{ label: 'Abrir', run: () => openModal({ type: 'goal-detail', id: goal.id }) }],
    });
  }

  const titles = ['Escolha uma área da vida', 'Escolha uma proposta', 'Defina a meta', 'Monte o plano'];

  return (
    <Modal
      title={titles[step]}
      onClose={close}
      size="wide"
      footer={
        <>
          {step > 0 && (
            <button className="btn btn-ghost" onClick={() => setStep(step - 1)}>
              <ArrowLeft /> Voltar
            </button>
          )}
          <div className="spacer" />
          {step < 3 ? (
            <button
              className="btn btn-primary"
              disabled={!canNext}
              onClick={() => (step === 2 ? goToPlan() : setStep(step + 1))}
            >
              Continuar <ArrowRight />
            </button>
          ) : (
            <button className="btn btn-primary" onClick={create}>
              <Check /> Criar meta
            </button>
          )}
        </>
      }
    >
      <div className="steps">
        {[0, 1, 2, 3].map((i) => (
          <i key={i} className={i <= step ? 'on' : ''} />
        ))}
      </div>

      {step === 0 && (
        <div className="stack">
          <p className="muted" style={{ margin: 0 }}>Onde você quer evoluir agora? O Rudge propõe metas concretas e monta o plano.</p>
          <div className="area-grid">
            {AREAS.map((a) => (
              <button
                key={a.key}
                className={cx('area-tile', d.area === a.key && 'on')}
                onClick={() => {
                  setD(blank(a.key));
                  setStep(1);
                }}
              >
                <AreaIcon area={a.key} size={20} />
                {a.label}
              </button>
            ))}
            <button
              className="area-tile"
              onClick={() => {
                setD(blank('pessoal'));
                setStep(2);
              }}
            >
              <Plus width={20} height={20} />
              Do zero
            </button>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="stack sm">
          {areaTemplates.map((t) => (
            <button
              key={t.id}
              className={cx('tpl', d.templateId === t.id && 'on')}
              onClick={() => {
                setD(fromTemplate(t));
                setStep(2);
              }}
            >
              <div className="empty-icon" style={{ width: 34, height: 34, borderRadius: 10, display: 'grid', placeItems: 'center', background: 'var(--chip)', flex: 'none' }}>
                <AreaIcon area={t.area} />
              </div>
              <div>
                <b>{t.title}</b>
                <span>{t.pitch}</span>
              </div>
            </button>
          ))}
          <button
            className="tpl"
            onClick={() => {
              setD(blank(d.area));
              setStep(2);
            }}
          >
            <div className="empty-icon" style={{ width: 34, height: 34, borderRadius: 10, display: 'grid', placeItems: 'center', background: 'var(--chip)', flex: 'none' }}>
              <Pencil width={16} />
            </div>
            <div>
              <b>Escrever minha própria meta</b>
              <span>O Rudge ajuda a deixá-la mensurável e com prazo.</span>
            </div>
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="stack">
          <Field label="Meta" hint="Seja específico: o que, quanto e até quando.">
            <input className="input" value={d.title} onChange={(e) => set({ title: e.target.value })} placeholder="Ex.: Ler 12 livros em um ano" autoFocus />
          </Field>
          <div className="grid-2">
            <Field label="Área">
              <select className="select" value={d.area} onChange={(e) => set({ area: e.target.value as AreaKey })}>
                {AREAS.map((a) => (
                  <option key={a.key} value={a.key}>
                    {a.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Como medir" group>
              <Segmented
                full
                value={d.kind}
                onChange={(kind) => set({ kind, milestones: kind === 'numeric' ? [] : d.milestones })}
                options={[
                  { value: 'numeric', label: 'Número' },
                  { value: 'milestones', label: 'Etapas' },
                ]}
              />
            </Field>
          </div>
          {d.kind === 'numeric' && (
            <div className="grid-3">
              <Field label="Valor atual">
                <input className="input num" type="number" inputMode="decimal" value={d.startValue} onChange={(e) => set({ startValue: Number(e.target.value), milestones: [] })} />
              </Field>
              <Field label="Meta">
                <input className="input num" type="number" inputMode="decimal" value={d.target} onChange={(e) => set({ target: Number(e.target.value), milestones: [] })} />
              </Field>
              <Field label="Unidade">
                <input className="input" value={d.unit} onChange={(e) => set({ unit: e.target.value, milestones: [] })} placeholder="livros, kg, R$…" />
              </Field>
            </div>
          )}
          <Field label="Prazo" group>
            <div className="stack sm">
              <div className="row wrap">
                {deadlineQuick.map((q) => (
                  <button key={q.label} type="button" className={cx('chip', d.deadline === q.v && 'on')} onClick={() => set({ deadline: q.v, milestones: d.kind === 'numeric' ? [] : d.milestones })}>
                    {q.label}
                  </button>
                ))}
              </div>
              <input className="input" type="date" min={addDaysKey(todayKey(), 1)} value={d.deadline} onChange={(e) => set({ deadline: e.target.value, milestones: d.kind === 'numeric' ? [] : d.milestones })} />
            </div>
          </Field>
          <Field label="Por que isso importa para você?" hint="Seu motivo aparece no detalhe da meta para lembrar você nos dias difíceis.">
            <textarea className="textarea" value={d.why} onChange={(e) => set({ why: e.target.value })} placeholder="Ex.: ter mais energia para minha família" style={{ minHeight: 64 }} />
          </Field>
          {d.kind === 'numeric' && d.title && d.deadline > todayKey() && d.target !== d.startValue && (
            <div className="callout">
              <Sparkles />
              <span>
                Ritmo necessário: <b>{fmtNum(Math.abs(d.target - d.startValue) / Math.max(1, diffDays(d.deadline, todayKey()) / 7))} {d.unit} por semana</b> durante{' '}
                {diffDays(d.deadline, todayKey())} dias.
              </span>
            </div>
          )}
        </div>
      )}

      {step === 3 && (
        <div className="stack">
          <Field label={d.kind === 'numeric' ? 'Marcos do caminho' : 'Etapas'} group>
            <div>
              {d.milestones.map((m, i) => (
                <div className="milestone" key={m.id}>
                  <span className="chip outline num">{i + 1}</span>
                  <input value={m.title} onChange={(e) => set({ milestones: d.milestones.map((x) => (x.id === m.id ? { ...x, title: e.target.value } : x)) })} />
                  {m.due && <span className="muted" style={{ fontSize: 12 }}>{shortDate(m.due)}</span>}
                  <button className="icon-btn sm" onClick={() => set({ milestones: d.milestones.filter((x) => x.id !== m.id) })} aria-label="Remover">
                    <X />
                  </button>
                </div>
              ))}
              <div className="milestone">
                <Plus width={16} style={{ color: 'var(--fg-4)', margin: '0 5px' }} />
                <input
                  placeholder="Adicionar etapa e pressionar Enter"
                  value={newMs}
                  onChange={(e) => setNewMs(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newMs.trim()) {
                      set({ milestones: [...d.milestones, { id: uid(), title: newMs.trim(), done: false }] });
                      setNewMs('');
                    }
                  }}
                />
              </div>
            </div>
          </Field>

          <div className="glass flat" style={{ padding: 14, borderRadius: 16 }}>
            <div className="setting" style={{ paddingTop: 0 }}>
              <div className="s-text">
                <b>Criar hábito de apoio</b>
                <span>Ação recorrente com lembrete que move a meta.</span>
              </div>
              <Switch on={d.habitOn} onChange={(habitOn) => set({ habitOn })} />
            </div>
            {d.habitOn && (
              <div className="stack sm" style={{ paddingTop: 6 }}>
                <input className="input" value={d.habitTitle} onChange={(e) => set({ habitTitle: e.target.value })} placeholder="Ex.: Ler 20 páginas" />
                <div className="row wrap">
                  <DayPicker value={d.habitDays} onChange={(habitDays) => set({ habitDays })} />
                  <input className="input" type="time" value={d.habitTime} onChange={(e) => set({ habitTime: e.target.value })} style={{ width: 132 }} />
                </div>
                {d.kind === 'numeric' && (
                  <label className="row" style={{ fontSize: 13, color: 'var(--fg-2)', cursor: 'pointer' }}>
                    <Switch on={d.habitCounts} onChange={(habitCounts) => set({ habitCounts })} />
                    Cada vez que eu marcar o hábito, somar +1 {d.unit || 'na meta'}
                  </label>
                )}
              </div>
            )}
          </div>

          <div className="glass flat" style={{ padding: 14, borderRadius: 16 }}>
            <div className="setting" style={{ paddingTop: 0 }}>
              <div className="s-text">
                <b>Check-in da meta</b>
                <span>Notificação para registrar progresso e ver o ritmo.</span>
              </div>
            </div>
            <div className="row wrap">
              <Segmented
                value={d.checkin}
                onChange={(checkin) => set({ checkin })}
                options={[
                  { value: 'daily', label: 'Diário' },
                  { value: 'weekly', label: 'Semanal' },
                  { value: 'none', label: 'Desligado' },
                ]}
              />
              {d.checkin === 'weekly' && (
                <select className="select" style={{ width: 150 }} value={d.checkinWeekday} onChange={(e) => set({ checkinWeekday: Number(e.target.value) })}>
                  {WEEKDAYS.map((w, i) => (
                    <option key={i} value={i}>
                      {w}
                    </option>
                  ))}
                </select>
              )}
              {d.checkin !== 'none' && <input className="input" type="time" value={d.checkinTime} onChange={(e) => set({ checkinTime: e.target.value })} style={{ width: 132 }} />}
            </div>
          </div>

          <Field label="Primeiro passo (vira uma tarefa para hoje)">
            <input className="input" value={d.firstStep} onChange={(e) => set({ firstStep: e.target.value })} placeholder="A menor ação que inicia a meta" />
          </Field>
        </div>
      )}
    </Modal>
  );
}

/* ---------------- Detalhe ---------------- */

function Sparkline({ goal }: { goal: Goal }) {
  const pts = goal.log.filter((l) => l.note !== 'Etapa atualizada');
  if (goal.kind !== 'numeric' || pts.length < 2) return null;
  const w = 600;
  const h = 80;
  const t0 = Date.parse(pts[0].date);
  const t1 = Math.max(Date.parse(pts[pts.length - 1].date), t0 + 1);
  const vals = pts.map((p) => p.value);
  const lo = Math.min(...vals, goal.target ?? 0, goal.startValue ?? 0);
  const hi = Math.max(...vals, goal.target ?? 0, goal.startValue ?? 0);
  const x = (t: number) => ((t - t0) / (t1 - t0)) * (w - 8) + 4;
  const y = (v: number) => h - 6 - ((v - lo) / Math.max(1e-9, hi - lo)) * (h - 12);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(Date.parse(p.date)).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const area = `${line} L${x(t1).toFixed(1)},${h} L${x(t0).toFixed(1)},${h} Z`;
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-label="Evolução">
      <defs>
        <linearGradient id="sparkfill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className="stop-a" />
          <stop offset="1" className="stop-b" />
        </linearGradient>
      </defs>
      <path className="area" d={area} />
      <path className="line" d={line} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function GoalDetail({ id }: { id: string }) {
  const s = useStore();
  const goal = s.goals.find((g) => g.id === id);
  const [val, setVal] = useState<string>('');
  const [newMs, setNewMs] = useState('');
  const close = () => closeModal('goal-detail');
  const habits = useMemo(() => s.habits.filter((h) => h.goalId === id), [s.habits, id]);
  const tasks = useMemo(() => s.tasks.filter((t) => t.goalId === id && !t.done), [s.tasks, id]);

  if (!goal) return null;
  const pace = goalPace(goal);
  const recalc = recalcGoal(goal);
  const focusMin = s.focusSessions.filter((f) => f.goalId === goal.id).reduce((n, f) => n + f.minutes, 0);
  const progress = goalProgress(goal);
  const unit = goal.unit ?? '';
  const step = goal.target !== undefined && Math.abs(goal.target - (goal.startValue ?? 0)) >= 50 ? 10 : 1;

  return (
    <Modal
      title={
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <AreaIcon area={goal.area} /> {AREA_LABEL[goal.area]}
        </span>
      }
      onClose={close}
      size="wide"
      footer={
        <>
          <button
            className="btn btn-danger"
            onClick={() => {
              deleteGoal(goal.id);
              close();
            }}
          >
            <Trash2 /> Excluir
          </button>
          <div className="spacer" />
          {goal.status !== 'done' && (
            <button className="btn btn-ghost" onClick={() => setGoalStatus(goal.id, goal.status === 'paused' ? 'active' : 'paused')}>
              {goal.status === 'paused' ? <><Play /> Retomar</> : <><Pause /> Pausar</>}
            </button>
          )}
          <button className="btn btn-glass" onClick={() => openModal({ type: 'goal-edit', id: goal.id })}>
            <Pencil /> Editar
          </button>
          {goal.status !== 'done' ? (
            <button className="btn btn-primary" onClick={() => setGoalStatus(goal.id, 'done')}>
              <CheckCircle2 /> Concluir
            </button>
          ) : (
            <button className="btn btn-primary" onClick={() => setGoalStatus(goal.id, 'active')}>
              Reabrir
            </button>
          )}
        </>
      }
    >
      <div className="stack">
        <div className="row" style={{ gap: 18, alignItems: 'center' }}>
          <ProgressRing value={progress} size={92} stroke={7} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <h3 style={{ margin: 0, fontSize: 20, fontWeight: 650, letterSpacing: '-0.025em', lineHeight: 1.25 }}>{goal.title}</h3>
            <div className="row wrap" style={{ marginTop: 8, gap: 6 }}>
              <span className={cx('chip', pace.status === 'behind' || pace.status === 'overdue' ? 'warn' : pace.status === 'done' ? 'solid' : '')}>{goal.status === 'paused' ? 'Pausada' : pace.label}</span>
              {goal.deadline && (
                <span className="chip outline">
                  Prazo {shortDate(goal.deadline)}
                  {pace.daysLeft !== undefined && pace.daysLeft >= 0 && ` · ${pace.daysLeft} dias`}
                </span>
              )}
            </div>
          </div>
        </div>

        {goal.why && (
          <div className="callout">
            <Sparkles />
            <span>
              <b>Seu porquê:</b> {goal.why}
            </span>
          </div>
        )}

        <div>
          <ProgressBar value={progress} marker={pace.expected} size="lg" />
          <div className="row" style={{ justifyContent: 'space-between', marginTop: 8, fontSize: 12.5, color: 'var(--fg-3)' }}>
            <span>{Math.round(progress * 100)}% concluído</span>
            {goal.deadline && pace.status !== 'done' && <span>Esperado hoje: {Math.round(pace.expected * 100)}%</span>}
          </div>
        </div>

        {goal.status !== 'done' && <div className="g-advice">{pace.advice}</div>}

        {recalc && (
          <div className="recalc glass flat">
            <div className="recalc-head">
              <RefreshCw /> <b>Ritmo recalculado</b>
            </div>
            <p>{recalc.message}</p>
            <div className="row wrap" style={{ gap: 8 }}>
              {recalc.newDeadline && (
                <button className="btn btn-sm btn-primary" onClick={() => changeGoalDeadline(goal.id, recalc.newDeadline!)}>
                  <CalendarClock /> Mudar prazo para {shortDate(recalc.newDeadline)}
                </button>
              )}
              {recalc.steps.length > 0 && (
                <button className="btn btn-sm btn-glass" onClick={() => splitGoalIntoSteps(goal.id, recalc.steps)}>
                  <ListOrdered /> Quebrar em {recalc.steps.length} etapas
                </button>
              )}
            </div>
            {recalc.steps.length > 0 && (
              <div className="recalc-steps">
                {recalc.steps.map((x) => (
                  <span key={x.due + x.value} className="chip outline">
                    {x.title} · {shortDate(x.due)}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {focusMin > 0 && (
          <div className="callout">
            <Timer />
            <span>
              <b>{focusMin >= 60 ? `${fmtNum(focusMin / 60)} h` : `${focusMin} min`}</b> de foco dedicados a esta meta.
            </span>
          </div>
        )}

        {goal.kind === 'numeric' && (
          <div className="glass flat" style={{ padding: 16, borderRadius: 16 }}>
            <div className="stat-row" style={{ marginBottom: 14 }}>
              <div className="stat">
                <span>Início</span>
                <b>{fmtNum(goal.startValue ?? 0)}</b>
              </div>
              <div className="stat">
                <span>Atual</span>
                <b>
                  {fmtNum(goal.current ?? 0)} <small className="muted" style={{ fontSize: 12 }}>{unit}</small>
                </b>
              </div>
              <div className="stat">
                <span>Meta</span>
                <b>{fmtNum(goal.target ?? 0)}</b>
              </div>
            </div>
            <div className="label" style={{ marginBottom: 8 }}>Registrar progresso</div>
            <div className="stepper">
              <button className="btn btn-glass" onClick={() => bumpGoal(goal.id, -step)} aria-label="Diminuir">
                <Minus />
              </button>
              <button className="btn btn-glass" onClick={() => bumpGoal(goal.id, step)} aria-label="Aumentar">
                <Plus /> {step}
              </button>
              <input
                className="input num"
                type="number"
                inputMode="decimal"
                placeholder={`Novo valor (${unit || 'total'})`}
                value={val}
                onChange={(e) => setVal(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && val !== '') {
                    setGoalValue(goal.id, Number(val));
                    setVal('');
                  }
                }}
              />
              <button
                className="btn btn-primary"
                disabled={val === ''}
                onClick={() => {
                  setGoalValue(goal.id, Number(val));
                  setVal('');
                  toast({ title: 'Progresso registrado', icon: 'check' });
                }}
              >
                Salvar
              </button>
            </div>
            <div style={{ marginTop: 14 }}>
              <Sparkline goal={goal} />
            </div>
          </div>
        )}

        <div>
          <div className="section-title">
            {goal.kind === 'numeric' ? 'Marcos' : 'Etapas'} <span className="count">{goal.milestones.filter((m) => m.done).length}/{goal.milestones.length}</span>
          </div>
          {goal.milestones.map((m) => (
            <div key={m.id} className={cx('milestone', m.done && 'done')}>
              <button className={cx('check', m.done && 'on')} onClick={() => toggleMilestone(goal.id, m.id)} aria-label="Concluir etapa">
                <Check />
              </button>
              <span style={{ flex: 1 }}>{m.title}</span>
              {m.due && <span className="muted" style={{ fontSize: 12 }}>{shortDate(m.due)}</span>}
              <button className="icon-btn sm" onClick={() => setMilestones(goal.id, goal.milestones.filter((x) => x.id !== m.id))} aria-label="Remover">
                <X />
              </button>
            </div>
          ))}
          <div className="milestone">
            <Plus width={16} style={{ color: 'var(--fg-4)', margin: '0 3px' }} />
            <input
              placeholder="Adicionar etapa"
              value={newMs}
              onChange={(e) => setNewMs(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newMs.trim()) {
                  setMilestones(goal.id, [...goal.milestones, { id: uid(), title: newMs.trim(), done: false }]);
                  setNewMs('');
                }
              }}
            />
          </div>
        </div>

        <div className="grid-2">
          <div>
            <div className="section-title">Hábitos de apoio</div>
            {habits.length ? (
              habits.map((h) => (
                <div key={h.id} className="habit-pill" style={{ cursor: 'pointer' }} onClick={() => openModal({ type: 'habit', id: h.id })}>
                  <span className="h-title">{h.title}</span>
                  <span className="streak">
                    <Flame /> {habitStreak(h)}
                  </span>
                </div>
              ))
            ) : (
              <button className="btn btn-sm btn-glass" onClick={() => openModal({ type: 'habit', defaults: { goalId: goal.id } })}>
                <Plus /> Vincular hábito
              </button>
            )}
          </div>
          <div>
            <div className="section-title">Próximas ações</div>
            {tasks.slice(0, 4).map((t) => (
              <div key={t.id} className="habit-pill" style={{ cursor: 'pointer' }} onClick={() => openModal({ type: 'task', id: t.id })}>
                <span className="h-title">{t.title}</span>
              </div>
            ))}
            <button
              className="btn btn-sm btn-glass"
              onClick={() => {
                addTask({ title: `Avançar na meta: ${goal.title}`, due: todayKey(), priority: 2, goalId: goal.id, area: goal.area });
                toast({ title: 'Tarefa criada para hoje', icon: 'check' });
              }}
            >
              <Plus /> Tarefa para hoje
            </button>
          </div>
        </div>

        {goal.checkin.freq !== 'none' && (
          <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>
            Check-in {goal.checkin.freq === 'daily' ? 'diário' : `toda ${WEEKDAYS[goal.checkin.weekday]}`} às {goal.checkin.time}.
            {goal.log.length > 1 && ` Último registro: ${formatWhen(Date.parse(goal.log[goal.log.length - 1].date)).toLowerCase()}.`}
          </p>
        )}
      </div>
    </Modal>
  );
}

/* ---------------- Edição ---------------- */

export function GoalEdit({ id }: { id: string }) {
  const s = useStore();
  const goal = s.goals.find((g) => g.id === id);
  const [title, setTitle] = useState(goal?.title ?? '');
  const [why, setWhy] = useState(goal?.why ?? '');
  const [area, setArea] = useState<AreaKey>(goal?.area ?? 'pessoal');
  const [deadline, setDeadline] = useState(goal?.deadline ?? '');
  const [startValue, setStartValue] = useState(goal?.startValue ?? 0);
  const [target, setTarget] = useState(goal?.target ?? 0);
  const [unit, setUnit] = useState(goal?.unit ?? '');
  const [freq, setFreq] = useState<CheckinFreq>(goal?.checkin.freq ?? 'weekly');
  const [time, setTime] = useState(goal?.checkin.time ?? '19:00');
  const [weekday, setWeekday] = useState(goal?.checkin.weekday ?? 0);
  const close = () => closeModal('goal-edit');
  if (!goal) return null;

  function save() {
    if (!goal || !title.trim()) return;
    updateGoal(goal.id, {
      title: title.trim(),
      why: why.trim() || undefined,
      area,
      deadline: deadline || undefined,
      ...(goal.kind === 'numeric' ? { startValue, target, unit: unit.trim() || undefined } : {}),
      checkin: { freq, time, weekday },
    });
    toast({ title: 'Meta atualizada', icon: 'check' });
    close();
  }

  return (
    <Modal
      title="Editar meta"
      onClose={close}
      footer={
        <>
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
      <div className="stack">
        <Field label="Meta">
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <div className="grid-2">
          <Field label="Área">
            <select className="select" value={area} onChange={(e) => setArea(e.target.value as AreaKey)}>
              {AREAS.map((a) => (
                <option key={a.key} value={a.key}>
                  {a.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Prazo">
            <input className="input" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </Field>
        </div>
        {goal.kind === 'numeric' && (
          <div className="grid-3">
            <Field label="Início">
              <input className="input num" type="number" value={startValue} onChange={(e) => setStartValue(Number(e.target.value))} />
            </Field>
            <Field label="Meta">
              <input className="input num" type="number" value={target} onChange={(e) => setTarget(Number(e.target.value))} />
            </Field>
            <Field label="Unidade">
              <input className="input" value={unit} onChange={(e) => setUnit(e.target.value)} />
            </Field>
          </div>
        )}
        <Field label="Por quê">
          <textarea className="textarea" value={why} onChange={(e) => setWhy(e.target.value)} />
        </Field>
        <Field label="Check-in" group>
          <div className="row wrap">
            <Segmented
              value={freq}
              onChange={setFreq}
              options={[
                { value: 'daily', label: 'Diário' },
                { value: 'weekly', label: 'Semanal' },
                { value: 'none', label: 'Desligado' },
              ]}
            />
            {freq === 'weekly' && (
              <select className="select" style={{ width: 150 }} value={weekday} onChange={(e) => setWeekday(Number(e.target.value))}>
                {WEEKDAYS.map((w, i) => (
                  <option key={i} value={i}>
                    {w}
                  </option>
                ))}
              </select>
            )}
            {freq !== 'none' && <input className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} style={{ width: 132 }} />}
          </div>
        </Field>
        {goal.deadline && parseKey(goal.deadline) < new Date() && (
          <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>O prazo atual já passou — defina uma nova data para recalcular o ritmo.</p>
        )}
      </div>
    </Modal>
  );
}
