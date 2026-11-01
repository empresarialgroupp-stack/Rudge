// Alert (adaptado de uiarc.dev/components/alert — mesma API): mensagem persistente no fluxo da página.
// Troque tone/title/children no mesmo Alert para ele "morfar" entre estados em vez de trocar de componente.
import { useLayoutEffect, useRef, useState, type ComponentProps, type HTMLAttributes, type ReactNode } from 'react';
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from 'motion/react';
import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from 'lucide-react';

export type AlertTone = 'info' | 'success' | 'warning' | 'danger';

export interface AlertProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title' | 'children'> {
  /** Título. Um título novo sobe por cima do anterior. */
  title: string;
  /** Cor e ícone. danger usa role="alert"; os outros, role="status". */
  tone?: AlertTone;
  /** Detalhes abaixo do título. Textos fazem crossfade quando mudam. */
  children?: ReactNode;
  /** Controla a presença. Ao esconder, a altura recolhe e o alerta some. */
  open?: boolean;
  /** Mostra o botão de fechar. Sem `open`, o alerta recolhe primeiro e depois chama isto. */
  onDismiss?: () => void;
}

const ICONS = { info: Info, success: CircleCheck, warning: TriangleAlert, danger: CircleAlert } as const;
const SPRING = { type: 'spring', stiffness: 420, damping: 38, mass: 0.9 } as const;

export function Alert({ title, tone = 'info', children, open, onDismiss, className, ...props }: AlertProps) {
  const reduce = useReducedMotion();
  const [selfOpen, setSelfOpen] = useState(true);
  const controlled = open !== undefined;
  const shown = controlled ? open : selfOpen;
  const dismissedRef = useRef(false);

  function dismiss() {
    if (controlled) onDismiss?.();
    else {
      dismissedRef.current = true;
      setSelfOpen(false);
    }
  }

  const fade = reduce ? { duration: 0.12 } : { duration: 0.22, ease: [0.22, 1, 0.36, 1] as const };

  return (
    <AnimatePresence
      initial={false}
      onExitComplete={() => {
        if (dismissedRef.current) {
          dismissedRef.current = false;
          onDismiss?.();
        }
      }}
    >
      {shown && (
        <motion.div
          key="arc-alert"
          className="arc-alert-presence"
          initial={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
          animate={reduce ? { opacity: 1 } : { opacity: 1, height: 'auto' }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
          transition={reduce ? fade : { height: SPRING, opacity: fade }}
          style={{ overflow: reduce ? undefined : 'hidden' }}
        >
          <AlertBody
            {...props}
            className={className}
            title={title}
            tone={tone}
            reduce={!!reduce}
            fade={fade}
            onDismiss={onDismiss ? dismiss : undefined}
          >
            {children}
          </AlertBody>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

interface BodyProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title' | 'children'> {
  title: string;
  tone: AlertTone;
  children?: ReactNode;
  reduce: boolean;
  fade: object;
  onDismiss?: () => void;
}

function AlertBody({ title, tone, children, reduce, fade, onDismiss, className, ...props }: BodyProps) {
  const Icon = ICONS[tone];
  const innerRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | 'auto'>('auto');

  // a altura acompanha o texto com uma mola quando o conteúdo muda
  useLayoutEffect(() => {
    const el = innerRef.current;
    if (!el || reduce || typeof ResizeObserver === 'undefined') return;
    setHeight(el.offsetHeight);
    const ro = new ResizeObserver(() => setHeight(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [reduce]);

  const textKey = typeof children === 'string' || typeof children === 'number' ? String(children) : 'node';
  const rise = reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -10 } };

  return (
    <div {...props} className={`arc-alert${className ? ` ${className}` : ''}`} data-tone={tone} role={tone === 'danger' ? 'alert' : 'status'}>
      <motion.div className="arc-alert-sizer" animate={{ height }} initial={false} transition={reduce ? { duration: 0 } : SPRING}>
        <div ref={innerRef} className="arc-alert-inner">
          <span className="arc-alert-icon" aria-hidden="true">
            <AnimatePresence initial={false} mode="popLayout">
              <Swap
                as="span"
                key={tone}
                className="arc-alert-icon-glyph"
                initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.6, filter: 'blur(4px)' }}
                animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1, filter: 'blur(0px)' }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.6, filter: 'blur(4px)' }}
                transition={reduce ? fade : SPRING}
              >
                <Icon />
              </Swap>
            </AnimatePresence>
          </span>
          <div className="arc-alert-copy">
            <AnimatePresence initial={false} mode="popLayout">
              <Swap key={title} className="arc-alert-title" {...rise} transition={fade}>
                {title}
              </Swap>
            </AnimatePresence>
            {children != null && children !== false && (
              <AnimatePresence initial={false} mode="popLayout">
                <Swap key={textKey} className="arc-alert-desc" {...(textKey === 'node' ? {} : rise)} transition={fade}>
                  {children}
                </Swap>
              </AnimatePresence>
            )}
          </div>
          {onDismiss && (
            <button type="button" className="arc-alert-dismiss" onClick={onDismiss} aria-label={`Dispensar: ${title}`}>
              <X />
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}

/** Cópia que entra/sai; enquanto sai fica aria-hidden para o leitor de tela ler só o texto atual. */
function Swap({ as, ...props }: ComponentProps<typeof motion.div> & { as?: 'span' }) {
  const present = useIsPresent();
  const hidden = present ? undefined : true;
  if (as === 'span') return <motion.span {...(props as ComponentProps<typeof motion.span>)} aria-hidden={hidden} />;
  return <motion.div {...props} aria-hidden={hidden} />;
}
