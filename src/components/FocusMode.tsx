import { useEffect, useMemo, useState } from 'react';
import { BellOff, Minimize2, Pause, Play, Plus, Square, Timer } from 'lucide-react';
import { useStore } from '../lib/store';
import { extendFocus, pauseFocus, resumeFocus, startFocus } from '../lib/actions';
import { closeModal, openModal, useModals } from '../lib/ui';
import { todayKey } from '../lib/date';
import { completeFocus, focusLeft } from '../lib/focus';
import { sortTasks } from './TaskRow';
import { LiquidTabBar } from './LiquidTabBar';
import { cx } from './ui';

const DURATIONS = ['15', '25', '45', '60'];

function useNow(active: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

const mmss = (ms: number) => {
  const t = Math.ceil(ms / 1000);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

/** Anel de tracinhos: os acesos são o tempo que falta. */
function Ring({ value, ticks = 96 }: { value: number; ticks?: number }) {
  const on = Math.round(Math.max(0, Math.min(1, value)) * ticks);
  return (
    <svg className="focus-ring" viewBox="0 0 300 300" aria-hidden="true">
      {Array.from({ length: ticks }, (_, i) => {
        const a = (i / ticks) * Math.PI * 2 - Math.PI / 2;
        const long = i % 8 === 0;
        const r1 = long ? 118 : 124;
        return (
          <line
            key={i}
            x1={150 + r1 * Math.cos(a)}
            y1={150 + r1 * Math.sin(a)}
            x2={150 + 140 * Math.cos(a)}
            y2={150 + 140 * Math.sin(a)}
            className={cx('fr-tick', i < on && 'on')}
          />
        );
      })}
    </svg>
  );
}

export function FocusMode({ taskId, goalId }: { taskId?: string; goalId?: string }) {
  const s = useStore();
  const f = s.focus;
  const now = useNow(!!f);
  const close = () => closeModal('focus');
  const today = todayKey();
  const options = useMemo(
    () => s.tasks.filter((t) => !t.done && (!t.due || t.due <= today)).sort(sortTasks).slice(0, 12),
    [s.tasks, today],
  );
  const [pick, setPick] = useState(taskId ?? options[0]?.id ?? '');
  const [free, setFree] = useState('');
  const [dur, setDur] = useState('25');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const held = f ? s.inbox.filter((i) => i.at >= f.start && i.kind !== 'focus').length : 0;

  if (!f) {
    const task = s.tasks.find((t) => t.id === pick);
    const title = (pick === '__free' ? free.trim() : task?.title) || '';
    return (
      <div className="focus-screen" role="dialog" aria-label="Modo foco">
        <button className="icon-btn btn-glass focus-close" onClick={close} aria-label="Fechar">
          <Minimize2 />
        </button>
        <div className="focus-setup">
          <span className="focus-badge">
            <Timer /> Modo foco
          </span>
          <h2>No que você vai focar?</h2>
          <select className="select" value={pick} onChange={(e) => setPick(e.target.value)}>
            {options.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
            <option value="__free">Outra coisa…</option>
          </select>
          {pick === '__free' && <input className="input" autoFocus placeholder="Ex.: estudar inglês" value={free} onChange={(e) => setFree(e.target.value)} />}
          <div className="focus-durs">
            <LiquidTabBar
              id="focus-dur"
              label="Duração"
              labels="always"
              tabs={DURATIONS.map((d) => ({ value: d, label: `${d} min` }))}
              value={dur}
              onValueChange={setDur}
            />
          </div>
          <p className="muted focus-note">
            <BellOff width={14} /> Os avisos ficam em silêncio até o fim e esperam na central de notificações.
          </p>
          <button
            className="btn btn-primary btn-lg btn-pill"
            disabled={!title}
            onClick={() => startFocus({ title, taskId: pick !== '__free' ? pick : undefined, goalId: goalId ?? task?.goalId, minutes: Number(dur) })}
          >
            <Play /> Começar {dur} min
          </button>
        </div>
      </div>
    );
  }

  const left = f.pausedLeft ?? Math.max(0, f.until - now);
  const total = f.minutes * 60_000;
  const paused = f.pausedLeft !== undefined;
  return (
    <div className={cx('focus-screen running', paused && 'paused')} role="dialog" aria-label="Modo foco">
      <button className="icon-btn btn-glass focus-close" onClick={close} aria-label="Minimizar" title="Minimizar">
        <Minimize2 />
      </button>
      <div className="focus-run">
        <div className="focus-dial">
          <Ring value={left / total} />
          <div className="focus-center">
            <span className="focus-time" aria-live="off">
              {mmss(left)}
            </span>
            <span className="focus-title">{f.title}</span>
            <span className="focus-state">{paused ? 'Pausado' : `termina às ${new Date(f.until).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`}</span>
          </div>
        </div>
        <div className="focus-controls">
          <button className="btn btn-glass btn-pill" onClick={() => extendFocus(5)}>
            <Plus /> 5 min
          </button>
          <button className="btn btn-primary btn-lg btn-pill" onClick={() => (paused ? resumeFocus() : pauseFocus())}>
            {paused ? <Play /> : <Pause />} {paused ? 'Retomar' : 'Pausar'}
          </button>
          <button
            className="btn btn-glass btn-pill"
            onClick={() => {
              completeFocus(true);
              close();
            }}
          >
            <Square /> Encerrar
          </button>
        </div>
        <p className="muted focus-note">
          <BellOff width={14} /> {held ? `${held} ${held === 1 ? 'aviso guardado' : 'avisos guardados'} para depois` : 'Avisos em silêncio'}
        </p>
      </div>
    </div>
  );
}

/** Pílula flutuante quando o foco está minimizado. */
export function FocusPill() {
  const s = useStore();
  const modals = useModals();
  const now = useNow(!!s.focus);
  if (!s.focus || modals.some((m) => m.type === 'focus')) return null;
  const left = focusLeft(now);
  return (
    <button className="focus-pill glass strong" onClick={() => openModal({ type: 'focus' })}>
      <i className={cx('fp-dot', s.focus.pausedLeft !== undefined && 'paused')} />
      <b>{mmss(left)}</b>
      <span>{s.focus.title}</span>
    </button>
  );
}
