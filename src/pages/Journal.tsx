import { useMemo, useState } from 'react';
import { Activity, Check, Flame, NotebookPen, Smile, Sparkles, ThumbsDown, ThumbsUp } from 'lucide-react';
import { useStore } from '../lib/store';
import { saveJournal } from '../lib/actions';
import { addDaysKey, relativeDay, todayKey } from '../lib/date';
import { toast } from '../lib/ui';
import { journalHabitImpact } from '../lib/stats';
import { LineChart } from '../components/charts';
import { cx, Empty, StatCard, StatRow } from '../components/ui';

const SCORES = [
  { v: 1, label: 'Ruim' },
  { v: 2, label: 'Fraco' },
  { v: 3, label: 'Ok' },
  { v: 4, label: 'Bom' },
  { v: 5, label: 'Ótimo' },
];

export function Journal() {
  const s = useStore();
  const today = todayKey();
  const entry = s.journal[today];
  const [good, setGood] = useState(entry?.good ?? '');
  const [blocked, setBlocked] = useState(entry?.blocked ?? '');
  const [score, setScore] = useState(entry?.score ?? 0);

  const entries = useMemo(() => Object.entries(s.journal).sort(([a], [b]) => b.localeCompare(a)), [s.journal]);
  const last30 = useMemo(() => {
    const keys = Array.from({ length: 30 }, (_, i) => addDaysKey(today, i - 29));
    return { labels: keys.map((k) => `${Number(k.slice(8))}/${Number(k.slice(5, 7))}`), values: keys.map((k) => s.journal[k]?.score ?? 0) };
  }, [s.journal, today]);
  const impact = useMemo(() => journalHabitImpact(s), [s]);
  const scores = entries.map(([, e]) => e.score);
  const avg = scores.length ? scores.slice(0, 30).reduce((n, x) => n + x, 0) / Math.min(30, scores.length) : 0;
  let streak = 0;
  for (let k = entry ? today : addDaysKey(today, -1); s.journal[k]; k = addDaysKey(k, -1)) streak++;

  function save() {
    if (!score) return toast({ title: 'Dê uma nota para o dia', icon: 'info' });
    saveJournal(today, { good: good.trim(), blocked: blocked.trim(), score });
    toast({ title: 'Diário salvo', body: 'Boa noite — amanhã o Rudge monta seu dia.', icon: 'check' });
  }

  return (
    <>
      <StatRow cols={3}>
        <StatCard icon={Smile} label="Nota média" value={avg} decimals={1} hint="últimos 30 registros" />
        <StatCard icon={Flame} label="Dias seguidos" value={streak} suffix=" d" hint={entry ? 'hoje já foi' : 'falta hoje'} />
        <StatCard icon={NotebookPen} label="Registros" value={entries.length} hint="desde o início" />
      </StatRow>

      <section className="card glass liquid journal-today">
        <div className="card-head">
          <h2 className="card-title">
            <NotebookPen /> {entry ? 'Hoje (já registrado — pode editar)' : 'Como foi hoje?'}
          </h2>
          <span className="link">{relativeDay(today)}</span>
        </div>
        <div className="journal-grid">
          <label className="field">
            <span className="label">
              <ThumbsUp width={13} /> O que deu certo?
            </span>
            <textarea className="textarea" value={good} onChange={(e) => setGood(e.target.value)} placeholder="Ex.: fechei a proposta da Onyx" />
          </label>
          <label className="field">
            <span className="label">
              <ThumbsDown width={13} /> O que travou?
            </span>
            <textarea className="textarea" value={blocked} onChange={(e) => setBlocked(e.target.value)} placeholder="Ex.: muitas interrupções à tarde" />
          </label>
        </div>
        <div className="label" style={{ margin: '12px 0 8px' }}>
          Nota do dia
        </div>
        <div className="score-row" role="radiogroup" aria-label="Nota do dia">
          {SCORES.map((x) => (
            <button key={x.v} role="radio" aria-checked={score === x.v} className={cx('score', score === x.v && 'on', score >= x.v && 'fill')} onClick={() => setScore(x.v)}>
              <b>{x.v}</b>
              <span>{x.label}</span>
            </button>
          ))}
        </div>
        <div className="row" style={{ marginTop: 14 }}>
          <div className="spacer" />
          <button className="btn btn-primary btn-pill" onClick={save}>
            <Check /> Salvar
          </button>
        </div>
      </section>

      {entries.length >= 3 && (
        <section className="card glass" style={{ marginTop: 14 }}>
          <div className="card-head">
            <h2 className="card-title">
              <Activity /> Nota dos últimos 30 dias
            </h2>
          </div>
          <LineChart labels={last30.labels} series={[{ name: 'Nota', values: last30.values, tone: 'solid' }]} height={200} />
        </section>
      )}

      <section className="card glass" style={{ marginTop: 14 }}>
        <div className="card-head">
          <h2 className="card-title">
            <Sparkles /> Hábitos que combinam com seus melhores dias
          </h2>
        </div>
        {impact.length ? (
          <div className="rank-list">
            {impact.map((x, i) => (
              <div key={x.id} className={cx('rank', i === 0 && x.diff > 0 && 'first')}>
                <span className="rank-n">{i + 1}</span>
                <span className="rank-body">
                  <span className="rank-top">
                    <b>{x.title}</b>
                    <span className="v">{x.diff >= 0 ? '+' : ''}{x.diff.toFixed(1)}</span>
                  </span>
                  <span className="rank-sub">
                    Nota {x.withAvg.toFixed(1)} nos dias em que fez · {x.withoutAvg.toFixed(1)} quando não fez
                  </span>
                  <span className="rank-bar">
                    <i style={{ width: `${(x.withAvg / 5) * 100}%` }} />
                  </span>
                </span>
              </div>
            ))}
          </div>
        ) : (
          <Empty icon={Sparkles} title="Ainda aprendendo" text="Com algumas semanas de diário, o Rudge mostra quais hábitos aparecem nos seus melhores dias." />
        )}
      </section>

      {entries.length > 0 && (
        <section className="card glass" style={{ marginTop: 14 }}>
          <div className="card-head">
            <h2 className="card-title">
              <NotebookPen /> Registros
            </h2>
          </div>
          <div className="journal-list">
            {entries.slice(0, 21).map(([d, e]) => (
              <div key={d} className="journal-item">
                <span className="j-score">{e.score}</span>
                <div>
                  <b>{relativeDay(d)}</b>
                  {e.good && <p>✓ {e.good}</p>}
                  {e.blocked && <p className="muted">✕ {e.blocked}</p>}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
