import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BellOff, Clock3, Minimize2, Pause, Play, Plus, Square } from 'lucide-react';
import { useStore } from '../lib/store';
import { extendFocus, pauseFocus, resumeFocus, startFocus, updateSettings } from '../lib/actions';
import { closeModal, openModal, useModals } from '../lib/ui';
import { todayKey } from '../lib/date';
import { completeFocus, focusLeft } from '../lib/focus';
import { sortTasks } from './TaskRow';
import { LiquidTabBar } from './LiquidTabBar';
import { cx } from './ui';
import { FocusMusicButton } from './Integrations';
import { FocusClock, FocusClockPicker, mmss } from './FocusClock';
import type { FocusClockStyle } from '../lib/types';

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

/** Tempo parado até a tela do foco ficar só com o relógio. */
const CALM_AFTER = 4000;

/**
 * Tela calma: depois de alguns segundos sem mexer, some tudo menos o relógio.
 * Mouse mexendo, tecla ou toque trazem os controles de volta; no celular, tocar
 * numa área vazia com os controles à mostra esconde de novo.
 */
function useCalm(enabled: boolean) {
  const [calm, setCalm] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const wake = useCallback(() => {
    setCalm(false);
    clearTimeout(timer.current);
    if (enabled) timer.current = setTimeout(() => setCalm(true), CALM_AFTER);
  }, [enabled]);
  useEffect(() => {
    wake();
    return () => clearTimeout(timer.current);
  }, [wake]);
  const onPointerMove = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse') wake();
  };
  const onPointerDown = (e: React.PointerEvent) => {
    const onControl = (e.target as HTMLElement).closest('button, a, input, select, textarea');
    if (enabled && e.pointerType !== 'mouse' && !calm && !onControl) {
      clearTimeout(timer.current);
      setCalm(true);
    } else wake();
  };
  useEffect(() => {
    window.addEventListener('keydown', wake);
    window.addEventListener('wheel', wake, { passive: true });
    return () => {
      window.removeEventListener('keydown', wake);
      window.removeEventListener('wheel', wake);
    };
  }, [wake]);
  return { calm: enabled && calm, onPointerMove, onPointerDown };
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
  const initial = taskId ? s.tasks.find((t) => t.id === taskId) : undefined;
  const [pick, setPick] = useState(initial?.id ?? '');
  const [label, setLabel] = useState(initial?.title ?? '');
  const [dur, setDur] = useState('25');
  const clock = s.settings.focusClock;
  const [choosing, setChoosing] = useState(!clock);
  const [choice, setChoice] = useState<FocusClockStyle | undefined>(clock);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const held = f ? s.inbox.filter((i) => i.at >= f.start && i.kind !== 'focus').length : 0;

  if (!f && (choosing || !clock)) {
    return (
      <div className="focus-screen" role="dialog" aria-label="Escolher relógio do Modo foco">
        <button className="icon-btn btn-glass focus-close" onClick={close} aria-label="Fechar">
          <Minimize2 />
        </button>
        <div className="focus-setup focus-choose">
          <h2>Escolha seu relógio</h2>
          <p className="muted">Ele aparece sempre que você entra no Modo foco. Dá para trocar depois nas Configurações.</p>
          <FocusClockPicker value={choice} onChange={setChoice} />
          <button
            className="btn btn-primary btn-lg btn-pill focus-go"
            disabled={!choice}
            onClick={() => {
              updateSettings({ focusClock: choice });
              setChoosing(false);
            }}
          >
            Continuar
          </button>
        </div>
      </div>
    );
  }

  if (!f) {
    const task = s.tasks.find((t) => t.id === pick);
    const ms = Number(dur) * 60_000;
    const choose = (id: string, title: string) => {
      if (pick === id) {
        setPick('');
        setLabel('');
      } else {
        setPick(id);
        setLabel(title);
      }
    };
    const start = () =>
      startFocus({ title: label.trim() || 'Foco livre', taskId: task?.id, goalId: goalId ?? task?.goalId, minutes: Number(dur) });
    return (
      <div className="focus-screen" role="dialog" aria-label="Modo foco">
        <button className="icon-btn btn-glass focus-close" onClick={close} aria-label="Fechar">
          <Minimize2 />
        </button>
        <button className="icon-btn btn-glass focus-switch" onClick={() => setChoosing(true)} aria-label="Trocar relógio" title="Trocar relógio">
          <Clock3 />
        </button>
        <div className="focus-setup">
          <FocusClock style={clock} left={ms} total={ms} idle />
          <form
            className="focus-form"
            onSubmit={(e) => {
              e.preventDefault();
              start();
            }}
          >
            <input
              className="focus-label"
              placeholder="No que você vai focar?"
              aria-label="No que você vai focar (opcional)"
              enterKeyHint="go"
              maxLength={80}
              value={label}
              onChange={(e) => {
                setLabel(e.target.value);
                if (task && e.target.value !== task.title) setPick('');
              }}
            />
            <span className="focus-hint">Opcional. Ex.: ler um livro</span>
          </form>
          {options.length > 0 && (
            <div className="focus-tasks" role="group" aria-label="Tarefas de hoje">
              {options.map((t) => (
                <button key={t.id} type="button" className={cx('focus-task', pick === t.id && 'on')} aria-pressed={pick === t.id} onClick={() => choose(t.id, t.title)}>
                  {t.title}
                </button>
              ))}
            </div>
          )}
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
          <button className="btn btn-primary btn-lg btn-pill focus-go" onClick={start}>
            <Play /> Começar
          </button>
          <p className="muted focus-note">
            <BellOff width={14} /> Avisos em silêncio até o fim
          </p>
        </div>
      </div>
    );
  }

  const left = f.pausedLeft ?? Math.max(0, f.until - now);
  const total = f.minutes * 60_000;
  const paused = f.pausedLeft !== undefined;
  return <FocusRun f={f} left={left} total={total} paused={paused} clock={clock} held={held} close={close} />;
}

function FocusRun({
  f,
  left,
  total,
  paused,
  clock,
  held,
  close,
}: {
  f: NonNullable<ReturnType<typeof useStore>['focus']>;
  left: number;
  total: number;
  paused: boolean;
  clock?: FocusClockStyle;
  held: number;
  close: () => void;
}) {
  // pausado, os controles ficam sempre à mostra
  const { calm, onPointerMove, onPointerDown } = useCalm(!paused);
  return (
    <div
      className={cx('focus-screen running', paused && 'paused', calm && 'calm')}
      role="dialog"
      aria-label="Modo foco"
      onPointerMove={onPointerMove}
      onPointerDown={onPointerDown}
    >
      <button className="icon-btn btn-glass focus-close" onClick={close} aria-label="Minimizar" title="Minimizar">
        <Minimize2 />
      </button>
      <div className="focus-run">
        <FocusClock
          style={clock}
          left={left}
          total={total}
          paused={paused}
          caption={paused ? 'Pausado' : `termina às ${new Date(f.until).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`}
        />
        <div className="focus-extras" aria-hidden={calm || undefined}>
          <div className="focus-extras-in">
            <span className="focus-title">{f.title}</span>
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
              <FocusMusicButton />
            </div>
            <p className="muted focus-note">
              <BellOff width={14} /> {held ? `${held} ${held === 1 ? 'aviso guardado' : 'avisos guardados'} para depois` : 'Avisos em silêncio'}
            </p>
          </div>
        </div>
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
