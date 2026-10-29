import { useEffect, useState } from 'react';
import { Award, CalendarClock, Plus, Sparkles, Target, TrendingUp } from 'lucide-react';
import type { AreaKey } from '../lib/types';
import { useStore } from '../lib/store';
import { navigate, openModal, useRoute } from '../lib/ui';
import { fmtNum, goalPace, goalProgress, AREA_LABEL, AREAS } from '../lib/goals';
import { proposeGoals } from '../lib/suggestions';
import { shortDate } from '../lib/date';
import { AreaIcon, ChipTabs, cx, Empty, ProgressBar, StatCard, StatRow } from '../components/ui';
import { CountUp, Gauge } from '../components/charts';

type Tab = 'active' | 'paused' | 'done';

export function Goals() {
  const s = useStore();
  const route = useRoute();
  const [tab, setTab] = useState<Tab>('active');
  const [area, setArea] = useState<AreaKey | ''>('');

  // abre o detalhe quando vem de uma notificação (#/metas?id=...)
  const idParam = route.params.get('id');
  useEffect(() => {
    if (idParam && s.goals.some((g) => g.id === idParam)) {
      openModal({ type: 'goal-detail', id: idParam });
      navigate('metas');
    }
  }, [idParam, s.goals]);

  const inTab = s.goals.filter((g) => g.status === tab);
  const list = inTab.filter((g) => !area || g.area === area);
  const active = s.goals.filter((g) => g.status === 'active');
  const avg = active.length ? active.reduce((n, g) => n + goalProgress(g), 0) / active.length : 0;
  const onTrack = active.filter((g) => ['on', 'ahead', 'open'].includes(goalPace(g).status)).length;
  const proposals = proposeGoals(s, 8);

  return (
    <>
      <StatRow>
        <StatCard icon={TrendingUp} label="Progresso médio" value={avg * 100} suffix="%" hint={`${active.length} ${active.length === 1 ? 'meta' : 'metas'}`} />
        <StatCard icon={Target} label="Ativas" value={active.length} hint={`${onTrack} no ritmo`} onClick={() => setTab('active')} />
        <StatCard
          icon={CalendarClock}
          label="Fora do ritmo"
          value={active.length - onTrack}
          hint={active.length - onTrack ? 'precisam de atenção' : 'tudo no ritmo'}
          tone={active.length - onTrack ? 'warn' : undefined}
        />
        <StatCard icon={Award} label="Concluídas" value={s.goals.filter((g) => g.status === 'done').length} hint="desde o início" onClick={() => setTab('done')} />
      </StatRow>

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
        <ChipTabs
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

      {inTab.length > 0 && (
        <div className="area-chips">
          <button className={cx('chip', !area && 'on')} onClick={() => setArea('')}>
            Todas <span className="ct-count">{inTab.length}</span>
          </button>
          {AREAS.filter((x) => inTab.some((g) => g.area === x.key)).map((x) => (
            <button key={x.key} className={cx('chip', area === x.key && 'on')} onClick={() => setArea(area === x.key ? '' : x.key)}>
              <AreaIcon area={x.key} size={13} /> {x.label} <span className="ct-count">{inTab.filter((g) => g.area === x.key).length}</span>
            </button>
          ))}
        </div>
      )}

      {list.length ? (
        <div className="goals-grid">
          {list.map((g) => {
            const pace = goalPace(g);
            const next = g.milestones.find((m) => !m.done);
            return (
              <article key={g.id} className="goal-card glass" onClick={() => openModal({ type: 'goal-detail', id: g.id })}>
                <div className="g-visual">
                  <span className={cx('g-badge', (pace.status === 'behind' || pace.status === 'overdue') && 'warn', pace.status === 'done' && 'solid')}>
                    <i /> {g.status === 'paused' ? 'Pausada' : pace.label}
                  </span>
                  <Gauge value={pace.progress} ticks={44} size={220} />
                  <b className="g-pct">
                    <CountUp value={pace.progress * 100} />%
                  </b>
                </div>
                <div className="g-top">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h3>{g.title}</h3>
                    <div className="g-sub">
                      {g.kind === 'numeric'
                        ? `${fmtNum(g.current ?? 0)} / ${fmtNum(g.target ?? 0)} ${g.unit ?? ''}`
                        : `${g.milestones.filter((m) => m.done).length} de ${g.milestones.length} etapas`}
                      {g.deadline && ` · até ${shortDate(g.deadline)}`}
                    </div>
                  </div>
                  <span className="g-area-tag">
                    <AreaIcon area={g.area} size={13} /> {AREA_LABEL[g.area]}
                  </span>
                </div>
                <ProgressBar value={pace.progress} marker={g.status === 'active' ? pace.expected : undefined} />
                {g.status === 'active' && <div className="g-advice">{pace.advice}</div>}
                {next && <div className="g-next">Próximo: {next.title}</div>}
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
