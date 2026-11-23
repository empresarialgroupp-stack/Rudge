// Entrada do Rudge: abertura com a marca, cabeçalho de tinta com curva, cortina entre telas e o
// teclado do PIN de 6 dígitos (vibra em vermelho ao errar, enche de verde ao acertar).
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useAnimate, useReducedMotion } from 'motion/react';
import { Delete, LockKeyhole } from 'lucide-react';
import { cx } from './ui';
import { ThemeToggle } from './ThemeToggle';
import { useStore } from '../lib/store';
import { checkPin, forgotPin, PIN_LENGTH, registerFail, savePin, turnOffPin, waitUntil } from '../lib/pin';

/* ---------------- formas (viewBox 100 × 100, esticado na tela) ---------------- */

/** Cabeçalho: começa mais baixo à esquerda, fundo da curva perto de 40% e sobe até o canto direito. */
export const shape = (right: number, low: number, left: number) =>
  `M0,0 L100,0 L100,${right} C86,${right + (low - right) * 0.7} 64,${low} 42,${low} C24,${low} 10,${left + (low - left) * 0.5} 0,${left} Z`;
const FULL = 'M0,0 L100,0 L100,100 C86,100 64,100 42,100 C24,100 10,100 0,100 Z';
export const LOGIN_SHAPE = shape(12, 32, 29);
export const PIN_SHAPE = shape(8, 25, 27);

/** Fundo de tinta (cor invertida do tema) que se transforma da tela cheia na curva do topo. */
export function InkHeader({ d, splash, children }: { d: string; splash: boolean; children: ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <>
      <svg className="ink-shape" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <motion.path
          initial={{ d: splash ? FULL : d }}
          animate={{ d }}
          transition={reduce ? { duration: 0 } : { delay: splash ? 0.75 : 0, duration: 0.9, ease: [0.76, 0, 0.24, 1] }}
        />
      </svg>
      {children}
    </>
  );
}

/** Marca "RUDGE": no centro durante a abertura e no canto do cabeçalho depois. */
export function InkBrand({ splash, line, splashLine }: { splash: boolean; line: ReactNode; splashLine: string }) {
  return (
    <div className={cx('ink-brand', splash && 'is-splash')}>
      <motion.div layout transition={{ duration: 0.9, ease: [0.76, 0, 0.24, 1] }} className="ink-brand-in">
        <motion.b layout="position" className="ink-word">
          RUDGE
        </motion.b>
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={splash ? 's' : 'h'}
            className="ink-line"
            initial={{ opacity: 0, y: 6, filter: 'blur(4px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -6, filter: 'blur(4px)' }}
            transition={{ duration: 0.3 }}
          >
            {splash ? splashLine : line}
          </motion.span>
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

/** Abertura: fica em "true" por um instante e depois vira o cabeçalho. Só toca uma vez por carregamento. */
let splashPlayed = false;
export function useSplash(ms = 900, enabled = true) {
  const reduce = useReducedMotion();
  const [splash, setSplash] = useState(() => enabled && !splashPlayed && !reduce);
  useEffect(() => {
    splashPlayed = true;
    if (!splash) return;
    const t = setTimeout(() => setSplash(false), ms);
    return () => clearTimeout(t);
  }, [splash, ms]);
  return splash;
}

/** Botão de tinta que encolhe numa pílula com duas bolinhas líquidas enquanto carrega. */
export function InkButton({ busy, children, disabled, type = 'submit', onClick }: { busy: boolean; children: ReactNode; disabled?: boolean; type?: 'submit' | 'button'; onClick?: () => void }) {
  return (
    <button className={cx('ink-btn', busy && 'busy')} type={type} disabled={disabled || busy} aria-busy={busy} onClick={onClick}>
      <span className="ink-btn-label">{children}</span>
      <span className="goo-dots" aria-hidden="true">
        <i />
        <i />
      </span>
    </button>
  );
}

/** Filtro "goo" que faz as bolinhas se fundirem como líquido. */
export function GooFilter() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
      <filter id="rudge-goo">
        <feGaussianBlur in="SourceGraphic" stdDeviation="2.6" result="b" />
        <feColorMatrix in="b" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -9" />
      </filter>
    </svg>
  );
}

/* ---------------- cortina entre telas ---------------- */

type Job = { id: number; covered: () => void };
let job: Job | null = null;
let seq = 0;
const cl = new Set<() => void>();
const setJob = (j: Job | null) => {
  job = j;
  cl.forEach((f) => f());
};

/** Passa a cortina de tinta de baixo para cima; `covered` roda com a tela toda coberta. */
export function playCurtain(covered: () => void) {
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return covered();
  if (job) {
    const prev = job.covered;
    job.covered = () => (prev(), covered());
    return;
  }
  setJob({ id: ++seq, covered });
}

const C = (t0: number, t1: number, b0: number, b1: number) => `M0,${t0} C30,${t1} 70,${t1} 100,${t0} L100,${b0} C70,${b1} 30,${b1} 0,${b0} Z`;

export function CurtainHost() {
  const j = useSyncExternalStore(
    (f) => (cl.add(f), () => cl.delete(f)),
    () => job,
    () => null,
  );
  const [scope, animate] = useAnimate<SVGPathElement>();
  useEffect(() => {
    if (!j || !scope.current) return;
    let alive = true;
    void (async () => {
      await animate(scope.current, { d: [C(100, 100, 100, 100), C(55, 30, 100, 100), C(-2, -2, 100, 100)] }, { duration: 0.6, ease: [0.65, 0, 0.35, 1] });
      j.covered();
      await new Promise((r) => setTimeout(r, 140));
      if (!alive) return;
      await animate(scope.current, { d: [C(-2, -2, 100, 100), C(-2, -2, 45, 20), C(-2, -2, -2, -2)] }, { duration: 0.65, ease: [0.65, 0, 0.35, 1] });
      if (alive) setJob(null);
    })();
    return () => {
      alive = false;
    };
  }, [j, animate, scope]);
  if (!j) return null;
  return (
    <svg className="curtain" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <path ref={scope} d={C(100, 100, 100, 100)} />
    </svg>
  );
}

/** Camada de tela cheia acima de tudo (portal no body, fora de vidros com backdrop-filter). */
export function EntryLayer({ children }: { children: ReactNode }) {
  return createPortal(<div className="entry-layer">{children}</div>, document.body);
}

/* ---------------- PIN ---------------- */

type Status = 'idle' | 'err' | 'ok';

export function PinBoxes({ value, status }: { value: string; status: Status }) {
  return (
    <div className={cx('pin-row', status)} role="img" aria-label={`${value.length} de ${PIN_LENGTH} dígitos`}>
      {Array.from({ length: PIN_LENGTH }, (_, i) => (
        <span key={i} className={cx('pin-box', i < value.length && 'filled', i === value.length && status === 'idle' && 'cur')} style={{ '--i': i } as React.CSSProperties}>
          <i className="liquid" />
          <b className="dot" />
        </span>
      ))}
    </div>
  );
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

export function Keypad({ onDigit, onBack, extra, disabled }: { onDigit: (d: string) => void; onBack: () => void; extra?: ReactNode; disabled?: boolean }) {
  return (
    <div className="keypad">
      {KEYS.map((k) => (
        <button key={k} type="button" className="key" disabled={disabled} onClick={() => onDigit(k)}>
          {k}
        </button>
      ))}
      <div className="key-extra">{extra}</div>
      <button type="button" className="key" disabled={disabled} onClick={() => onDigit('0')}>
        0
      </button>
      <button type="button" className="key key-back" disabled={disabled} onClick={onBack} aria-label="Apagar dígito">
        <Delete />
      </button>
    </div>
  );
}

export type PinFlow = 'unlock' | 'create' | 'change' | 'off';

/**
 * Tela do PIN.
 * unlock: confere e chama onDone. create: digita e confirma um PIN novo.
 * change: confere o atual e cria outro. off: confere o atual e desliga.
 */
export function PinScreen({ flow, onDone, onCancel, cancelLabel = 'Cancelar', splash: withSplash = false }: { flow: PinFlow; onDone: () => void; onCancel?: () => void; cancelLabel?: string; splash?: boolean }) {
  const splash = useSplash(700, withSplash);
  const { settings } = useStore();
  const [step, setStep] = useState<'current' | 'new' | 'confirm'>(flow === 'create' ? 'new' : 'current');
  const [value, setValue] = useState('');
  const [first, setFirst] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(() => waitUntil());
  const [now, setNow] = useState(Date.now());
  const [confirmForgot, setConfirmForgot] = useState(false);
  const done = useRef(false);

  useEffect(() => {
    if (!wait) return;
    const t = setInterval(() => {
      setNow(Date.now());
      if (Date.now() >= wait) setWait(undefined);
    }, 500);
    return () => clearInterval(t);
  }, [wait]);

  const locked = !!wait && wait > now;
  const name = settings.name?.trim().split(/\s+/)[0];

  const title =
    step === 'current'
      ? flow === 'unlock'
        ? 'Digite seu PIN'
        : 'Digite o PIN atual'
      : step === 'new'
        ? 'Crie seu PIN'
        : 'Confirme o PIN';
  const sub =
    step === 'current'
      ? flow === 'unlock'
        ? 'O mesmo PIN no celular e no computador.'
        : 'Para mexer no PIN, confirme que é você.'
      : step === 'new'
        ? 'Seis números para abrir o Rudge sem precisar do e-mail. Vale em todos os seus aparelhos.'
        : 'Digite os mesmos seis números de novo.';

  function fail(text: string) {
    setStatus('err');
    setMsg(text);
    navigator.vibrate?.([30, 40, 30]);
    setTimeout(() => {
      setStatus('idle');
      setValue('');
    }, 620);
  }

  function succeed(after: () => void) {
    done.current = true;
    setStatus('ok');
    setMsg('');
    navigator.vibrate?.(15);
    setTimeout(after, 760);
  }

  async function complete(pin: string) {
    if (step === 'current') {
      setBusy(true);
      const ok = await checkPin(pin);
      setBusy(false);
      if (!ok) {
        const until = registerFail();
        if (until) setWait(until);
        return fail(until ? 'Muitas tentativas. Aguarde um pouco.' : 'PIN incorreto. Tente de novo.');
      }
      if (flow === 'unlock') return succeed(onDone);
      if (flow === 'off') return succeed(() => (turnOffPin(), onDone()));
      // change: segue para o PIN novo
      setStatus('ok');
      setTimeout(() => {
        setStatus('idle');
        setValue('');
        setStep('new');
      }, 520);
      return;
    }
    if (step === 'new') {
      if (/^(\d)\1+$/.test(pin) || '0123456789'.includes(pin) || '9876543210'.includes(pin)) return fail('Fácil demais de adivinhar. Escolha outro.');
      setFirst(pin);
      setTimeout(() => {
        setValue('');
        setStep('confirm');
      }, 180);
      return;
    }
    if (pin !== first) {
      fail('Os PINs não são iguais. Comece de novo.');
      setTimeout(() => setStep('new'), 620);
      return;
    }
    setBusy(true);
    await savePin(pin);
    setBusy(false);
    succeed(onDone);
  }

  function digit(d: string) {
    if (busy || locked || status !== 'idle' || done.current) return;
    if (msg) setMsg('');
    const next = (value + d).slice(0, PIN_LENGTH);
    setValue(next);
    if (next.length === PIN_LENGTH) void complete(next);
  }
  function back() {
    if (busy || status !== 'idle') return;
    setValue((v) => v.slice(0, -1));
  }

  // teclado físico (computador)
  const keyRef = useRef({ digit, back });
  keyRef.current = { digit, back };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (/^\d$/.test(e.key)) keyRef.current.digit(e.key);
      else if (e.key === 'Backspace') keyRef.current.back();
      else if (e.key === 'Escape' && onCancel) onCancel();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const wait_s = locked ? Math.ceil((wait! - now) / 1000) : 0;

  return (
    <div className={cx('entry entry-pin', splash && 'is-splash')} role="dialog" aria-modal="true" aria-label={title}>
      <InkHeader d={PIN_SHAPE} splash={splash}>
        <InkBrand
          splash={splash}
          splashLine="Seu sistema pessoal de organização"
          line={name ? `Olá, ${name}. Bom te ver de volta.` : 'Bom te ver de volta.'}
        />
      </InkHeader>
      <div className="corner entry-corner">
        <ThemeToggle />
      </div>
      <motion.div
        className="entry-body pin-body"
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: withSplash ? 1.1 : 0.1, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={step}
            className="pin-head"
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.22 }}
          >
            <h2>
              <LockKeyhole /> {title}
            </h2>
            <p>{sub}</p>
          </motion.div>
        </AnimatePresence>
        <PinBoxes value={value} status={status} />
        <p className={cx('pin-msg', status === 'err' && 'is-err')} role="status" aria-live="polite">
          {locked ? `Muitas tentativas. Tente de novo em ${wait_s} s.` : msg || ' '}
        </p>
        <Keypad
          onDigit={digit}
          onBack={back}
          disabled={locked}
          extra={
            flow === 'unlock' ? (
              <button type="button" className="key-link" onClick={() => setConfirmForgot(true)}>
                Esqueci
              </button>
            ) : null
          }
        />
        {onCancel && (
          <button type="button" className="entry-link pin-cancel" onClick={onCancel}>
            {cancelLabel}
          </button>
        )}
      </motion.div>

      <AnimatePresence>
        {confirmForgot && (
          <motion.div className="pin-forgot" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div
              className="pin-forgot-card glass"
              initial={{ y: 30, scale: 0.96 }}
              animate={{ y: 0, scale: 1 }}
              exit={{ y: 20, scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            >
              <h3>Esqueceu o PIN?</h3>
              <p>Você sai da conta neste aparelho e entra de novo pelo e-mail. Depois cria um PIN novo. Nenhum dado é perdido.</p>
              <div className="row">
                <button type="button" className="btn btn-ghost" onClick={() => setConfirmForgot(false)}>
                  Voltar
                </button>
                <button type="button" className="btn btn-primary" onClick={() => void forgotPin()}>
                  Entrar pelo e-mail
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
