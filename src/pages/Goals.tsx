import { useEffect, useState } from 'react';
import { Award, CalendarClock, Plus, Sparkles, Target, TrendingUp } from 'lucide-react';
import { useStore } from '../lib/store';
import { navigate, openModal, useRoute } from '../lib/ui';
import { fmtNum, goalPace, goalProgress, AREA_LABEL } from '../lib/goals';
import { proposeGoals } from '../lib/suggestions';
import { shortDate } from '../lib/date';
import { AreaIcon, cx, Empty, ProgressBar, ProgressRing, Segmented } from '../components/ui';

type Tab = 'active' | 'paused' | 'done';

export function Goals() {
  const s = useStore();
  const route = useRoute();
  const [tab, setTab] = useState<Tab>('active');

  // abre o detalhe quando vem de uma notificação (#/metas?id=...)
  const idParam = route.params.get('id');
  useEffect(() => {
    if (idParam && s.goals.some((g) => g.id === idParam)) {
      openModal({ type: 'goal-detail', id: idParam });
      navigate('metas');
    }
  }, [idParam, s.goals]);

  const list = s.goals.filter((g) => g.status === tab);
  const active = s.goals.filter((g) => g.status === 'active');
  const avg = active.length ? active.reduce((n, g) => n + goalProgress(g), 0) / active.length : 0;
  const onTrack = active.filter((g) => ['on', 'ahead', 'open'].includes(goalPace(g).status)).length;
  const proposals = proposeGoals(s, 8);

  return (
    <>
      <div className="kpis" style={{ marginBottom: 18 }}>
        <div className="kpi glass">
          <ProgressRing value={avg} size={50} stroke={5} />
          <div className="kpi-body">
            <div className="kpi-label">
              <TrendingUp /> Progresso médio
            </div>
            <div className="kpi-value">{Math.round(avg * 100)}%</div>
          </div>
        </div>
        <div className="kpi glass">
          <div className="kpi-body">
            <div className="kpi-label">
              <Target /> Ativas
            </div>
            <div className="kpi-value">{active.length}</div>
            <div className="kpi-hint">{onTrack} no ritmo</div>
          </div>
        </div>
        <div className="kpi glass">
          <div className="kpi-body">
            <div className="kpi-label">
              <CalendarClock /> Fora do ritmo
            </div>
            <div className="kpi-value">{active.length - onTrack}</div>
            <div className="kpi-hint">precisam de atenção</div>
          </div>
        </div>
        <div className="kpi glass">
          <div className="kpi-body">
            <div className="kpi-label">
              <Award /> Concluídas
            </div>
            <div className="kpi-value">{s.goals.filter((g) => g.status === 'done').length}</div>
            <div className="kpi-hint">desde o início</div>
          </div>
        </div>
      </div>

      {proposals.length > 0 && (
        <>
          <div className="section-title">
            <Sparkles width={13} /> Propostas para você
          </div>
          <div className="proposals">
            {proposals.map((t) => (
              <div key={t.id} className="proposal glass">
                <div className="p-area">
                  <AreaIcon area={t.area} /> {AREA_LABEL[t.area]}
                </div>
                <b>{t.title}</b>
                <p>{t.pitch}</p>
                <button className="btn btn-sm btn-glass" onClick={() => openModal({ type: 'goal-wizard', templateId: t.id })}>
                  <Plus /> Adotar meta
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="toolbar" style={{ marginTop: 8 }}>
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'active', label: 'Ativas', count: active.length },
            { value: 'paused', label: 'Pausadas', count: s.goals.filter((g) => g.status === 'paused').length },
            { value: 'done', label: 'Concluídas', count: s.goals.filter((g) => g.status === 'done').length },
          ]}
        />
        <div className="spacer" />
        <button className="btn btn-primary" onClick={() => openModal({ type: 'goal-wizard' })}>
          <Sparkles /> Nova meta
        </button>
      </div>

      {list.length ? (
        <div className="goals-grid">
          {list.map((g) => {
            const pace = goalPace(g);
            const next = g.milestones.find((m) => !m.done);
            return (
              <article key={g.id} className="goal-card glass" onClick={() => openModal({ type: 'goal-detail', id: g.id })}>
                <div className="g-top">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="g-area">
                      <AreaIcon area={g.area} /> {AREA_LABEL[g.area]}
                    </div>
                    <h3>{g.title}</h3>
                  </div>
                  <ProgressRing value={pace.progress} size={58} stroke={5} />
                </div>
                <div>
                  <ProgressBar value={pace.progress} marker={g.status === 'active' ? pace.expected : undefined} />
                  <div className="row" style={{ justifyContent: 'space-between', marginTop: 8, fontSize: 12.5, color: 'var(--fg-3)' }}>
                    <span>
                      {g.kind === 'numeric'
                        ? `${fmtNum(g.current ?? 0)} / ${fmtNum(g.target ?? 0)} ${g.unit ?? ''}`
                        : `${g.milestones.filter((m) => m.done).length} de ${g.milestones.length} etapas`}
                    </span>
                    {g.deadline && <span>até {shortDate(g.deadline)}</span>}
                  </div>
                </div>
                {g.status === 'active' && <div className="g-advice">{pace.advice}</div>}
                <div className="g-foot">
                  <span className={cx('chip', (pace.status === 'behind' || pace.status === 'overdue') && 'warn', pace.status === 'done' && 'solid')}>
                    {g.status === 'paused' ? 'Pausada' : pace.label}
                  </span>
                  {next && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Próximo: {next.title}</span>}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="glass card">
          <Empty
            icon={Target}
            title={tab === 'active' ? 'Nenhuma meta ativa' : tab === 'paused' ? 'Nenhuma meta pausada' : 'Nenhuma meta concluída ainda'}
            text={tab === 'active' ? 'Escolha uma proposta acima ou crie a sua com o assistente — ele calcula o ritmo e configura lembretes.' : undefined}
            action={
              tab === 'active' ? (
                <button className="btn btn-primary btn-sm" onClick={() => openModal({ type: 'goal-wizard' })}>
                  <Sparkles /> Criar meta
                </button>
              ) : undefined
            }
          />
        </div>
      )}
    </>
  );
}
