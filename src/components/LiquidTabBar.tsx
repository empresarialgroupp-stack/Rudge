// Barra de abas "líquida": uma lente desliza até a aba escolhida e redesenha,
// invertido, o que passa por baixo dela (os ícones de contorno ficam preenchidos).
// Implementação própria do Rudge a partir da especificação do "Liquid tab bar".
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent as RPointerEvent, type ReactNode } from 'react';
import { AnimatePresence, animate, motion, motionValue, useMotionValue, useReducedMotion, useTransform, type MotionValue } from 'motion/react';
import { cx } from './ui';

export interface LiquidTab {
  value: string;
  label: string;
  icon?: ReactNode;
  /** desenhado dentro da lente (padrão: o mesmo ícone, preenchido) */
  activeIcon?: ReactNode;
  badge?: number;
  /** o que o leitor de tela fala junto com o número */
  badgeLabel?: string;
}

export const liquidTabId = (id: string, value: string) => `${id}-tab-${value}`;
export const liquidPanelId = (id: string, value: string) => `${id}-panel-${value}`;

const SLOT = 44; // slot do ícone
const PAD = 4; // respiro interno da barra
const OPEN = 12; // rótulo aberto: começa colado no ícone e termina com respiro
const TEXT_PAD = 16; // abas só com texto
const MORPH = { type: 'spring', stiffness: 420, damping: 38, mass: 1 } as const;

export function LiquidTabBar({
  tabs,
  value,
  onValueChange,
  labels = 'active',
  label = 'Seções',
  id: idProp,
  className,
}: {
  tabs: LiquidTab[];
  value: string;
  onValueChange: (value: string) => void;
  labels?: 'active' | 'always' | 'none';
  label?: string;
  id?: string;
  className?: string;
}) {
  const autoId = 'ltb' + useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const id = idProp ?? autoId;
  const reduce = !!useReducedMotion();
  const sel = Math.max(0, tabs.findIndex((t) => t.value === value));

  // larguras dos rótulos, medidas em cópias escondidas
  const measureRef = useRef<HTMLSpanElement>(null);
  const [labelW, setLabelW] = useState<number[]>(() => tabs.map(() => 0));
  const sig = tabs.map((t) => t.label).join('|');
  useLayoutEffect(() => {
    const read = () => {
      const el = measureRef.current;
      if (el) setLabelW([...el.children].map((c) => Math.ceil((c as HTMLElement).getBoundingClientRect().width)));
    };
    read();
    document.fonts?.ready.then(read).catch(() => {});
  }, [sig]);

  const showLabel = useCallback(
    (i: number, selected: number) => labels === 'always' || (labels === 'active' && i === selected) || !tabs[i].icon,
    [labels, tabs],
  );
  const slotWidth = useCallback(
    (i: number, selected: number) => {
      const t = tabs[i];
      if (!t.icon) return labelW[i] + TEXT_PAD * 2;
      return showLabel(i, selected) && labelW[i] ? SLOT + labelW[i] + OPEN : SLOT;
    },
    [tabs, labelW, showLabel],
  );
  const layout = useCallback(
    (selected: number) => {
      const w = tabs.map((_, i) => slotWidth(i, selected));
      const x: number[] = [];
      w.reduce((acc, v, i) => ((x[i] = acc), acc + v), PAD);
      return { w, x };
    },
    [tabs, slotWidth],
  );

  // valores animados compartilhados pelas duas camadas (normal e invertida)
  const widths = useRef<MotionValue<number>[]>([]);
  const fades = useRef<MotionValue<number>[]>([]);
  if (widths.current.length !== tabs.length) {
    widths.current = tabs.map((_, i) => motionValue(slotWidth(i, sel)));
    fades.current = tabs.map((_, i) => motionValue(showLabel(i, sel) ? 1 : 0));
  }
  const lensX = useMotionValue(PAD);
  const lensW = useMotionValue(SLOT);
  const lean = useMotionValue(0);
  const shownX = useTransform([lensX, lean], ([a, b]: number[]) => a + b);
  const clip = useTransform([shownX, lensW], ([x, w]: number[]) => `inset(${PAD}px calc(100% - ${x + w}px) ${PAD}px ${x}px round 999px)`);

  const first = useRef(true);
  const dragging = useRef(false);
  useLayoutEffect(() => {
    if (dragging.current) return;
    const { w, x } = layout(sel);
    const jump = first.current || reduce || !labelW.some(Boolean);
    first.current = !labelW.some(Boolean);
    const t = jump ? { duration: 0 } : MORPH;
    const anims = [animate(lensX, x[sel], t), animate(lensW, w[sel], t), animate(lean, 0, t)];
    widths.current.forEach((mv, i) => anims.push(animate(mv, w[i], t)));
    fades.current.forEach((mv, i) => {
      const on = showLabel(i, sel);
      anims.push(animate(mv, on ? 1 : 0, jump ? { duration: 0 } : on ? { delay: 0.16, duration: 0.2 } : { duration: 0.06 }));
    });
    return () => anims.forEach((a) => a.stop());
  }, [sel, layout, labelW, reduce, lensX, lensW, lean, showLabel]);

  // ---------- teclado (tabindex itinerante) ----------
  const btns = useRef<(HTMLButtonElement | null)[]>([]);
  const focusNext = useRef<number | null>(null);
  useEffect(() => {
    if (focusNext.current !== null) {
      btns.current[focusNext.current]?.focus();
      focusNext.current = null;
    }
  }, [sel]);
  const onKey = (e: KeyboardEvent) => {
    const n = tabs.length;
    let to: number | null = null;
    if (e.key === 'ArrowRight') to = (sel + 1) % n;
    else if (e.key === 'ArrowLeft') to = (sel - 1 + n) % n;
    else if (e.key === 'Home') to = 0;
    else if (e.key === 'End') to = n - 1;
    if (to === null) return;
    e.preventDefault();
    focusNext.current = to;
    btns.current[to]?.focus();
    if (to !== sel) onValueChange(tabs[to].value);
  };

  // ---------- inclinação ao passar o mouse ----------
  const onHover = (i: number, e: RPointerEvent) => {
    if (reduce || e.pointerType !== 'mouse' || dragging.current) return;
    animate(lean, i === sel ? 0 : Math.sign(i - sel) * 5, { type: 'spring', stiffness: 300, damping: 26 });
  };

  // ---------- arrastar / arremessar a lente ----------
  const drag = useRef<{ x0: number; px: number; moved: boolean; samples: [number, number][] } | null>(null);
  const onDown = (i: number, e: RPointerEvent<HTMLButtonElement>) => {
    if (i !== sel || e.button !== 0) return;
    drag.current = { x0: lensX.get(), px: e.clientX, moved: false, samples: [[e.timeStamp, e.clientX]] };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onMove = (e: RPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.px;
    if (!d.moved && Math.abs(dx) < 4) return;
    if (!d.moved) {
      d.moved = true;
      dragging.current = true;
      lensX.stop();
      animate(lean, 0, { duration: 0.1 });
    }
    const { x } = layout(sel);
    const min = x[0];
    const max = x[x.length - 1] + layout(sel).w[x.length - 1] - lensW.get();
    let nx = d.x0 + dx;
    if (nx < min) nx = min - rubber(min - nx);
    if (nx > max) nx = max + rubber(nx - max);
    lensX.set(nx);
    d.samples.push([e.timeStamp, e.clientX]);
    if (d.samples.length > 12) d.samples.shift();
  };
  const onUp = (e: RPointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d || !d.moved) return;
    e.preventDefault();
    d.samples.push([e.timeStamp, e.clientX]); // uma pausa antes de soltar zera o impulso
    const [t1, x1] = d.samples[d.samples.length - 1];
    const [t0, x0] = d.samples.find(([t]) => t1 - t <= 100) ?? d.samples[d.samples.length - 1];
    const v = t1 > t0 ? ((x1 - x0) / (t1 - t0)) * 1000 : 0; // px/s
    const { x, w } = layout(sel);
    const center = lensX.get() + lensW.get() / 2 + v * 0.12;
    let to = 0;
    let best = Infinity;
    x.forEach((xi, i) => {
      const dist = Math.abs(xi + w[i] / 2 - center);
      if (dist < best) ((best = dist), (to = i));
    });
    if (to === sel && Math.abs(v) > 380) to = Math.max(0, Math.min(tabs.length - 1, sel + Math.sign(v)));
    dragging.current = false;
    if (to !== sel) onValueChange(tabs[to].value);
    else animate(lensX, x[sel], MORPH);
  };
  const wasDrag = useRef(false);

  const row = (ink: boolean) =>
    tabs.map((t, i) => {
      const on = i === sel;
      const badge = t.badge ? (
        <span className="ltb-badge" aria-hidden="true">
          <Rolling n={t.badge} />
        </span>
      ) : null;
      const inner = (
        <>
          {t.icon && <span className={cx('ltb-icon', ink && 'filled')}>{ink ? (t.activeIcon ?? t.icon) : t.icon}</span>}
          {labels !== 'none' || !t.icon ? (
            <motion.span className="ltb-label" style={{ opacity: fades.current[i] }}>
              {t.label}
            </motion.span>
          ) : null}
          {badge}
        </>
      );
      if (ink)
        return (
          <motion.span key={t.value} className={cx('ltb-slot', !t.icon && 'text')} style={{ width: widths.current[i] }}>
            {inner}
          </motion.span>
        );
      return (
        <motion.button
          key={t.value}
          ref={(el) => {
            btns.current[i] = el;
          }}
          type="button"
          role="tab"
          id={liquidTabId(id, t.value)}
          aria-selected={on}
          aria-controls={liquidPanelId(id, t.value)}
          aria-label={t.badge ? `${t.label}, ${t.badgeLabel ?? `${t.badge} novos`}` : t.label}
          tabIndex={on ? 0 : -1}
          className={cx('ltb-slot', !t.icon && 'text', on && 'on')}
          style={{ width: widths.current[i] }}
          onClick={() => {
            if (wasDrag.current) return void (wasDrag.current = false);
            if (!on) onValueChange(t.value);
          }}
          onPointerEnter={(e) => onHover(i, e)}
          onPointerDown={(e) => onDown(i, e)}
          onPointerMove={onMove}
          onPointerUp={(e) => {
            wasDrag.current = !!drag.current?.moved;
            onUp(e);
          }}
          onPointerCancel={onUp}
        >
          {inner}
        </motion.button>
      );
    });

  return (
    <div
      role="tablist"
      aria-label={label}
      className={cx('ltb', className)}
      onKeyDown={onKey}
      onPointerLeave={() => !dragging.current && animate(lean, 0, { type: 'spring', stiffness: 300, damping: 26 })}
    >
      <span className="ltb-measure" ref={measureRef} aria-hidden="true">
        {tabs.map((t) => (
          <span key={t.value} className="ltb-label">
            {t.label}
          </span>
        ))}
      </span>
      <motion.span className="ltb-lens" style={{ x: shownX, width: lensW }} aria-hidden="true" />
      <div className="ltb-row">{row(false)}</div>
      <motion.div className="ltb-row ltb-ink" style={{ clipPath: clip }} aria-hidden="true">
        {row(true)}
      </motion.div>
    </div>
  );
}

/** resistência ao passar das pontas */
function rubber(d: number) {
  return (1 - 1 / (d / 120 + 1)) * 120;
}

/** número com dígitos que rolam ao mudar */
function Rolling({ n }: { n: number }) {
  const prev = useRef(n);
  const dir = n >= prev.current ? 1 : -1;
  useEffect(() => {
    prev.current = n;
  }, [n]);
  const text = n > 99 ? '99+' : String(n);
  return (
    <span className="ltb-roll">
      <AnimatePresence initial={false} mode="popLayout" custom={dir}>
        <motion.span
          key={text}
          custom={dir}
          initial={{ y: `${dir * 100}%`, opacity: 0 }}
          animate={{ y: '0%', opacity: 1 }}
          exit={{ y: `${-dir * 100}%`, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 500, damping: 34 }}
        >
          {text}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
