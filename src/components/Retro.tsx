import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarCheck, Flame, RotateCcw, Share2, Sparkles, Target, Timer, Trophy, X } from 'lucide-react';
import { useStore } from '../lib/store';
import { markRetroSeen } from '../lib/actions';
import { closeModal, toast } from '../lib/ui';
import { monthStats, prevMonth, type MonthStats } from '../lib/retro';
import { CountUp, Gauge } from './charts';
import { BrandMark, cx } from './ui';

const SLIDE_MS = 5500;

interface Slide {
  key: string;
  icon: typeof Flame;
  kicker: string;
  value?: number;
  suffix?: string;
  decimals?: number;
  title: string;
  sub?: string;
  visual?: 'gauge' | 'weeks';
}

function buildSlides(st: MonthStats): Slide[] {
  const out: Slide[] = [{ key: 'intro', icon: Sparkles, kicker: `${st.year}`, title: `Seu ${st.label} no Rudge`, sub: `${st.activeDays} dias com alguma conquista. Vamos ver?` }];
  out.push({ key: 'tasks', icon: CalendarCheck, kicker: 'Tarefas concluídas', value: st.tasksDone + st.remindersDone, title: st.tasksDone + st.remindersDone ? 'coisas resolvidas' : 'Um mês para recomeçar', sub: `${st.tasksDone} tarefas e ${st.remindersDone} lembretes${st.busiestWeekday ? ` · seu dia mais forte foi ${st.busiestWeekday}` : ''}` });
  if (st.bestStreak && st.bestStreak.days > 1) out.push({ key: 'streak', icon: Flame, kicker: 'Maior sequência', value: st.bestStreak.days, suffix: ' dias', title: st.bestStreak.title, sub: `${st.habitCheckins} check-ins de hábitos no mês` });
  if (st.topGoal) out.push({ key: 'goal', icon: Target, kicker: 'Meta que mais avançou', value: (st.topGoal.to - st.topGoal.from) * 100, suffix: ' pts', title: st.topGoal.title, sub: `de ${Math.round(st.topGoal.from * 100)}% para ${Math.round(st.topGoal.to * 100)}%`, visual: 'gauge' });
  if (st.bestWeek) out.push({ key: 'week', icon: Trophy, kicker: 'Melhor semana', value: st.bestWeek.count, suffix: ' conclusões', title: `semana de ${st.bestWeek.start.split('-').reverse().slice(0, 2).join('/')}`, visual: 'weeks' });
  if (st.focusMinutes > 0 || st.journal)
    out.push({
      key: 'focus',
      icon: Timer,
      kicker: st.focusMinutes ? 'Tempo de foco' : 'Diário',
      value: st.focusMinutes ? st.focusMinutes / 60 : st.journal!.avg,
      decimals: 1,
      suffix: st.focusMinutes ? ' h' : ' de nota',
      title: st.focusMinutes ? 'de foco sem distrações' : 'nota média dos seus dias',
      sub: st.journal ? `Diário em ${st.journal.days} dias · nota média ${st.journal.avg.toFixed(1)}${st.journal.best ? ` · “${st.journal.best}”` : ''}` : undefined,
    });
  out.push({ key: 'end', icon: Sparkles, kicker: 'Resumo', title: `Esse foi seu ${st.label}`, sub: st.topArea ? `Área em destaque: ${st.topArea}.` : 'Bora para o próximo mês.' });
  return out;
}

async function shareImage(st: MonthStats) {
  const W = 1080;
  const H = 1920;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(W * 0.2, 0, 50, W * 0.2, 0, H);
  grad.addColorStop(0, '#2a2a2c');
  grad.addColorStop(1, '#000');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  const font = (w: number, px: number) => `${w} ${px}px "Geist Variable", Geist, system-ui, sans-serif`;
  g.fillStyle = '#fff';
  g.font = font(650, 44);
  g.fillText('Rudge', 96, 150);
  g.fillStyle = 'rgba(255,255,255,.55)';
  g.font = font(500, 40);
  g.fillText(`${st.year}`, 96, 300);
  g.fillStyle = '#fff';
  g.font = font(650, 120);
  g.fillText(`Meu ${st.label}`, 90, 430);
  const rows: [string, string][] = [
    [`${st.tasksDone + st.remindersDone}`, 'coisas resolvidas'],
    ...(st.bestStreak ? [[`${st.bestStreak.days} dias`, `sequência · ${st.bestStreak.title}`] as [string, string]] : []),
    ...(st.topGoal ? [[`+${Math.round((st.topGoal.to - st.topGoal.from) * 100)} pts`, st.topGoal.title] as [string, string]] : []),
    ...(st.focusMinutes ? [[`${(st.focusMinutes / 60).toFixed(1)} h`, 'de foco'] as [string, string]] : []),
    [`${st.activeDays}`, 'dias com conquistas'],
  ];
  let y = 640;
  for (const [big, small] of rows.slice(0, 5)) {
    g.fillStyle = 'rgba(255,255,255,.08)';
    g.beginPath();
    g.roundRect(80, y - 110, W - 160, 200, 40);
    g.fill();
    g.fillStyle = '#fff';
    g.font = font(650, 88);
    g.fillText(big, 130, y + 20);
    g.fillStyle = 'rgba(255,255,255,.6)';
    g.font = font(500, 36);
    const txt = small.length > 34 ? small.slice(0, 33) + '…' : small;
    g.fillText(txt, 130, y + 70);
    y += 240;
  }
  g.fillStyle = 'rgba(255,255,255,.45)';
  g.font = font(500, 34);
  g.fillText('rudge.vercel.app', 96, H - 110);
  const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/png'));
  if (!blob) return;
  const file = new File([blob], `rudge-${st.month}.png`, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: `Meu ${st.label} no Rudge` });
      return;
    } catch {
      /* cancelado */
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  toast({ title: 'Imagem salva', icon: 'check' });
}

export function Retro({ month: monthProp }: { month?: string }) {
  const s = useStore();
  const month = useMemo(() => {
    if (monthProp) return monthProp;
    const d = new Date();
    return d.getDate() <= 7 ? prevMonth(d) : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }, [monthProp]);
  const st = useMemo(() => monthStats(s, month), [s, month]);
  const slides = useMemo(() => buildSlides(st), [st]);
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const [t0, setT0] = useState(Date.now());
  const [now, setNow] = useState(Date.now());
  const held = useRef(0);
  const downAt = useRef(0);
  const close = () => closeModal('retro');

  useEffect(() => {
    if (month <= prevMonth()) markRetroSeen(month);
  }, [month]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 50);
    return () => clearInterval(t);
  }, []);
  const elapsed = paused ? held.current : now - t0;
  useEffect(() => {
    if (!paused && elapsed >= SLIDE_MS && i < slides.length - 1) {
      setI(i + 1);
      setT0(Date.now());
    }
  }, [elapsed, paused, i, slides.length]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const go = (d: number) => {
    setI((x) => Math.max(0, Math.min(slides.length - 1, x + d)));
    setT0(Date.now());
  };
  const slide = slides[i];
  const last = i === slides.length - 1;

  return (
    <div className="retro" role="dialog" aria-label={`Retrospectiva de ${st.label}`}>
      <div className="retro-bars">
        {slides.map((x, k) => (
          <i key={x.key}>
            <b style={{ width: k < i ? '100%' : k === i ? `${Math.min(100, (elapsed / SLIDE_MS) * 100)}%` : '0%' }} />
          </i>
        ))}
      </div>
      <div className="retro-top">
        <BrandMark className="brand-orb" />
        <span>Retrospectiva · {st.label}</span>
        <button className="icon-btn btn-glass" onClick={close} aria-label="Fechar">
          <X />
        </button>
      </div>

      <div
        className="retro-stage"
        onPointerDown={() => {
          downAt.current = Date.now();
          held.current = elapsed;
          setPaused(true);
        }}
        onPointerUp={(e) => {
          const hold = Date.now() - downAt.current > 250; // segurar = pausar
          setPaused(false);
          setT0(Date.now() - held.current);
          if (hold) return;
          const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
          go(e.clientX - r.left < r.width * 0.3 ? -1 : 1);
        }}
        onPointerCancel={() => setPaused(false)}
      >
        <div className={cx('retro-slide', `s-${slide.key}`)} key={slide.key}>
          <span className="retro-kicker">
            <slide.icon /> {slide.kicker}
          </span>
          {slide.value !== undefined && (
            <b className="retro-value">
              <CountUp value={slide.value} decimals={slide.decimals} duration={1200} />
              {slide.suffix && <small>{slide.suffix}</small>}
            </b>
          )}
          <h2 className="retro-title">{slide.title}</h2>
          {slide.sub && <p className="retro-sub">{slide.sub}</p>}
          {slide.visual === 'gauge' && st.topGoal && (
            <div className="retro-gauge">
              <Gauge value={st.topGoal.to} ticks={56} />
            </div>
          )}
          {slide.visual === 'weeks' && st.bestWeek && (
            <div className="retro-weeks">
              {st.bestWeek.weeks.map((w) => (
                <i key={w.start} className={cx(w.start === st.bestWeek!.start && 'on')} style={{ height: `${Math.max(6, (w.count / Math.max(1, st.bestWeek!.count)) * 100)}%` }} />
              ))}
            </div>
          )}
          {last && (
            <div className="retro-summary">
              <div>
                <b>{st.tasksDone + st.remindersDone}</b>
                <span>resolvidas</span>
              </div>
              <div>
                <b>{st.habitCheckins}</b>
                <span>check-ins</span>
              </div>
              <div>
                <b>{st.bestStreak?.days ?? 0}</b>
                <span>maior sequência</span>
              </div>
              <div>
                <b>{st.activeDays}</b>
                <span>dias ativos</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {last && (
        <div className="retro-actions">
          <button className="btn btn-primary btn-lg btn-pill" onClick={() => void shareImage(st)}>
            <Share2 /> Compartilhar imagem
          </button>
          <button
            className="btn btn-glass btn-pill"
            onClick={() => {
              setI(0);
              setT0(Date.now());
            }}
          >
            <RotateCcw /> Ver de novo
          </button>
        </div>
      )}
    </div>
  );
}
