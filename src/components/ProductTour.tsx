import { type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion, useTransform, type MotionValue } from 'motion/react';
import { cx } from './ui';

/* -------------------------------------------------------------------------- */
/*  Product Tour (EasyUI, Surajmaurya1/easyui · product-tour)                   */
/*  Portado para o Rudge: framer-motion → motion/react, classes Tailwind →     */
/*  CSS com prefixo "pt-" no fim de app.css, textos em português.               */
/*                                                                             */
/*  <ProductTour open={open} steps={steps} onClose={(reason) => setOpen(false)} /> */
/*  O `target` de um passo é um seletor CSS ou uma função: () => elemento       */
/*  Sem `target`, o cartão aparece centralizado (boas-vindas / fim).            */
/* -------------------------------------------------------------------------- */

export type TourPlacement = 'auto' | 'top' | 'bottom' | 'left' | 'right';
export type TourTarget = string | (() => HTMLElement | null);

export type TourStep = {
  target?: TourTarget;
  title: string;
  body: ReactNode;
  placement?: TourPlacement;
  /** Espaço entre o elemento e a borda do recorte (padrão 8) */
  padding?: number;
  /** Raio do recorte. Padrão: o raio do próprio elemento + padding */
  radius?: number;
  /** false para nunca rolar a página até este alvo */
  scroll?: boolean;
};

export type TourCloseReason = 'done' | 'skip' | 'dismiss';

export interface ProductTourProps {
  steps: TourStep[];
  open: boolean;
  onClose: (reason: TourCloseReason) => void;
  onStepChange?: (index: number) => void;
  startAt?: number;
  closeOnOverlayClick?: boolean;
}

type Rect = { x: number; y: number; w: number; h: number; r: number };

const CARD_W = 340;
const SHEET_W = 440; // largura máxima do cartão encaixado embaixo em telas pequenas
const SMALL = 640; // abaixo disso o cartão vira uma folha presa embaixo
const cardWidth = (vw: number) => (vw < SMALL ? Math.min(SHEET_W, vw - 24) : CARD_W);
const EASE_OUT = [0.23, 1, 0.32, 1] as const;
const SPOT = { type: 'spring', stiffness: 380, damping: 38, mass: 0.9 } as const;
const CARD = { type: 'spring', stiffness: 320, damping: 34, mass: 0.9 } as const;

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);
const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

/* ------------------------------ DOM helpers -------------------------------- */

function resolve(t?: TourTarget): HTMLElement | null {
  if (!t) return null;
  return typeof t === 'string' ? document.querySelector<HTMLElement>(t) : t();
}

function rectOf(el: HTMLElement, s: TourStep): Rect {
  const b = el.getBoundingClientRect();
  const p = s.padding ?? 8;
  const w = b.width + p * 2;
  const h = b.height + p * 2;
  const cs = getComputedStyle(el).borderTopLeftRadius;
  let br = parseFloat(cs) || 0;
  if (cs.includes('%')) br = (br / 100) * Math.min(b.width, b.height);
  const r = s.radius ?? Math.min(Math.max(br + p, 8), Math.min(w, h) / 2);
  return { x: b.left - p, y: b.top - p, w, h, r };
}

// Acha o elemento (pode montar depois), rola até ele e espera a rolagem parar
async function prepare(s: TourStep, instant: boolean, bottomInset = 0) {
  if (!s.target) return null;
  let el = resolve(s.target);
  for (let i = 0; !el && i < 36; i++) {
    await frame();
    el = resolve(s.target);
  }
  if (!el) return null;

  const b = el.getBoundingClientRect();
  const M = 24;
  const visible = b.top >= M && b.bottom <= window.innerHeight - M - bottomInset && b.left >= 0 && b.right <= window.innerWidth;
  if (s.scroll !== false && !visible) {
    // scroll-margin faz o "center" cair na área ACIMA do cartão encaixado
    const prevMargin = el.style.scrollMarginBottom;
    if (bottomInset) el.style.scrollMarginBottom = `${bottomInset}px`;
    el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: instant ? 'auto' : 'smooth' });
    let last = el.getBoundingClientRect().top;
    let still = 0;
    const t0 = performance.now();
    while (still < 6 && performance.now() - t0 < 1000) {
      await frame();
      const top = el.getBoundingClientRect().top;
      still = Math.abs(top - last) < 0.5 ? still + 1 : 0;
      last = top;
    }
    el.style.scrollMarginBottom = prevMargin;
  }
  return el;
}

// Escolhe o lado com espaço (o preferido primeiro) e mantém dentro da tela
function place(r: Rect | null, cw: number, ch: number, vw: number, vh: number, pref: TourPlacement = 'auto', dock?: number) {
  const M = 16;
  const G = 14;
  if (!r) return { x: (vw - cw) / 2, y: (vh - ch) / 2 };
  if (dock !== undefined) {
    // telas pequenas: folha embaixo. Rudge: se o alvo está preso embaixo (barra de abas do celular),
    // o cartão sobe e fica logo acima dele, para não cobrir o que está sendo mostrado.
    const sheetY = Math.max(12, vh - ch - dock);
    if (r.y + r.h > sheetY - G) return { x: (vw - cw) / 2, y: Math.max(12, r.y - G - ch) };
    return { x: (vw - cw) / 2, y: sheetY };
  }

  const room = {
    bottom: vh - (r.y + r.h) - M - ch - G,
    top: r.y - M - ch - G,
    right: vw - (r.x + r.w) - M - cw - G,
    left: r.x - M - cw - G,
  };
  const all = ['bottom', 'top', 'right', 'left'] as const;
  const order = pref === 'auto' ? all : [pref, ...all.filter((s) => s !== pref)];
  const side = order.find((s) => room[s] >= 0) ?? all.reduce((a, b) => (room[a] > room[b] ? a : b));

  let x = r.x + r.w / 2 - cw / 2;
  let y = r.y + r.h / 2 - ch / 2;
  if (side === 'bottom') y = r.y + r.h + G;
  if (side === 'top') y = r.y - G - ch;
  if (side === 'right') x = r.x + r.w + G;
  if (side === 'left') x = r.x - G - cw;

  return { x: clamp(x, M, Math.max(M, vw - cw - M)), y: clamp(y, M, Math.max(M, vh - ch - M)) };
}

/* -------------------------------- Component -------------------------------- */

const slide = {
  enter: (d: number) => ({ opacity: 0, x: d * 20, filter: 'blur(3px)' }),
  center: { opacity: 1, x: 0, filter: 'blur(0px)' },
  exit: (d: number) => ({ opacity: 0, x: d * -20, filter: 'blur(3px)' }),
};

export function ProductTour({ steps, open, onClose, onStepChange, startAt = 0, closeOnOverlayClick = false }: ProductTourProps) {
  const uid = useId().replace(/:/g, '');
  const reduce = useReducedMotion();

  const [mounted, setMounted] = useState(false);
  const [index, setIndex] = useState(startAt);
  const [ready, setReady] = useState(false);
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setIndex(clamp(startAt, 0, steps.length - 1));
    else setReady(false);
  }

  // Recorte + cartão, movidos por motion values
  const sx = useMotionValue(0);
  const sy = useMotionValue(0);
  const sw = useMotionValue(0);
  const sh = useMotionValue(0);
  const sr = useMotionValue(0);
  const cxv = useMotionValue(0);
  const cyv = useMotionValue(0);
  const regionH = useMotionValue(0);

  // <rect> do SVG não aceita largura, altura ou rx negativos
  const safeW = useTransform(sw, (v) => Math.max(0, v));
  const safeH = useTransform(sh, (v) => Math.max(0, v));
  const safeR = useTransform(sr, (v) => Math.max(0, v));

  const rectRef = useRef<Rect | null>(null);
  const elRef = useRef<HTMLElement | null>(null);
  const cardHRef = useRef(0);
  const firstRef = useRef(true);
  const preparingRef = useRef(false);
  const movingRef = useRef(false);
  const dirRef = useRef(1);
  const moveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const roRef = useRef<ResizeObserver | null>(null);
  const prevFocus = useRef<Element | null>(null);

  const cardRef = useRef<HTMLDivElement>(null);
  const regionRef = useRef<HTMLDivElement>(null);
  const contentEl = useRef<HTMLDivElement | null>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const safeRef = useRef<HTMLDivElement>(null);

  const step = steps[index];
  const stepRef = useRef(step);
  stepRef.current = step;

  const move = (mv: MotionValue<number>, to: number, mode: 'spring' | 'instant', spring: typeof SPOT | typeof CARD = SPOT) => {
    if (mode === 'instant' || reduce) {
      mv.stop();
      mv.set(to);
    } else animate(mv, to, spring);
  };

  const layoutCut = (mode: 'spring' | 'instant', intro = false) => {
    const r = rectRef.current;
    const c = r ?? { x: window.innerWidth / 2, y: window.innerHeight / 2, w: 0, h: 0, r: 0 };
    if (intro && !reduce && r) {
      // o recorte começa largo e fecha no alvo
      sx.set(c.x - 48);
      sy.set(c.y - 48);
      sw.set(Math.max(0, c.w + 96));
      sh.set(Math.max(0, c.h + 96));
      sr.set(Math.max(0, c.r + 16));
    }
    move(sx, c.x, mode);
    move(sy, c.y, mode);
    move(sw, Math.max(0, c.w), mode);
    move(sh, Math.max(0, c.h), mode);
    move(sr, Math.max(0, c.r), mode);
  };

  const layoutCard = (mode: 'spring' | 'instant') => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const cw = cardWidth(vw);
    const safe = parseFloat(getComputedStyle(safeRef.current ?? document.body).paddingBottom) || 0;
    const dock = vw < SMALL ? 12 + safe : undefined;
    const p = place(rectRef.current, cw, cardHRef.current, vw, vh, stepRef.current.placement, dock);
    move(cxv, p.x, mode, CARD);
    move(cyv, p.y, mode, CARD);
  };

  const go = (i: number) => {
    if (i < 0) return;
    if (i >= steps.length) return onClose('done');
    dirRef.current = i > index ? 1 : -1;
    setIndex(i);
    onStepChange?.(i);
  };

  useEffect(() => setMounted(true), []);

  // 1) Troca de passo: acha o alvo → rola → mede → leva o recorte com mola
  useEffect(() => {
    if (!open || !mounted) return;
    let cancelled = false;
    preparingRef.current = true;
    (async () => {
      const s = steps[index];
      const compact = window.innerWidth < SMALL;
      if (compact) await frame(); // deixa o conteúdo novo informar a altura antes
      if (cancelled) return;
      const safe = parseFloat(getComputedStyle(safeRef.current ?? document.body).paddingBottom) || 0;
      const inset = compact ? Math.max(cardHRef.current, 200) + 12 + safe + 12 : 0;
      const el = await prepare(s, !!reduce, inset);
      if (cancelled) return;
      elRef.current = el;
      rectRef.current = el ? rectOf(el, s) : null;
      roRef.current?.disconnect();
      if (el) roRef.current?.observe(el);
      preparingRef.current = false;

      movingRef.current = true; // enquanto "move", rolagem/redimensionamento redirecionam a mola
      clearTimeout(moveTimer.current);
      moveTimer.current = setTimeout(() => (movingRef.current = false), 700);

      const intro = firstRef.current;
      firstRef.current = false;
      layoutCut('spring', intro);
      layoutCard(intro ? 'instant' : 'spring');
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, index, mounted]);

  // 2) Mede o conteúdo do cartão para animar a altura e posicionar certo
  useEffect(() => {
    if (!open || !mounted) return;
    const el = contentEl.current;
    if (!el) return;
    const report = () => {
      const card = cardRef.current;
      const region = regionRef.current;
      if (!card || !region) return;
      const vh = window.innerHeight;
      const cap = window.innerWidth < SMALL ? vh * 0.4 : vh - 160; // texto longo rola dentro do cartão
      const contentH = Math.min(el.offsetHeight, Math.max(96, cap));
      const chrome = card.offsetHeight - region.offsetHeight; // topo + rodapé
      const first = cardHRef.current === 0;
      cardHRef.current = contentH + chrome;
      move(regionH, contentH, first ? 'instant' : 'spring', CARD);
      if (!preparingRef.current) layoutCard(first ? 'instant' : 'spring');
      setReady(true);
    };
    const ro = new ResizeObserver(report);
    ro.observe(el);
    report();
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, index, mounted]);

  // 3) Mantém o recorte colado no alvo ao rolar / redimensionar
  useEffect(() => {
    if (!open || !mounted) return;
    let raf = 0;
    const update = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (preparingRef.current) return;
        const s = stepRef.current;
        const el = elRef.current?.isConnected ? elRef.current : resolve(s.target);
        if (el) {
          elRef.current = el;
          rectRef.current = rectOf(el, s);
        }
        const mode = movingRef.current ? 'spring' : 'instant';
        layoutCut(mode);
        layoutCard(mode);
      });
    };
    roRef.current = new ResizeObserver(update);
    if (elRef.current) roRef.current.observe(elRef.current);
    window.addEventListener('scroll', update, { capture: true, passive: true });
    window.addEventListener('resize', update);
    window.visualViewport?.addEventListener('resize', update); // barras do celular / zoom
    return () => {
      cancelAnimationFrame(raf);
      window.visualViewport?.removeEventListener('resize', update);
      roRef.current?.disconnect();
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mounted]);

  // Trava a rolagem da pessoa (scrollIntoView continua funcionando) + zera ao fechar
  useEffect(() => {
    if (!open) {
      firstRef.current = true;
      cardHRef.current = 0;
      rectRef.current = null;
      elRef.current = null;
      return;
    }
    const stop = (e: Event) => {
      if (cardRef.current?.contains(e.target as Node)) return; // o texto do cartão pode rolar
      e.preventDefault();
    };
    window.addEventListener('wheel', stop, { passive: false });
    window.addEventListener('touchmove', stop, { passive: false });
    return () => {
      window.removeEventListener('wheel', stop);
      window.removeEventListener('touchmove', stop);
    };
  }, [open]);

  // Teclado: ← → navegam, Esc fecha
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose('dismiss');
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        go(index + 1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        go(index - 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, index]);

  // Foco: entra no cartão quando pronto e volta para onde estava ao fechar
  useEffect(() => {
    if (!open) return;
    prevFocus.current = document.activeElement;
    return () => (prevFocus.current as HTMLElement | null)?.focus?.({ preventScroll: true });
  }, [open]);
  useEffect(() => {
    if (open && ready) nextRef.current?.focus({ preventScroll: true });
  }, [open, ready]);

  const trapTab = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab') return;
    const f = cardRef.current?.querySelectorAll<HTMLElement>('button');
    if (!f?.length) return;
    const first = f[0];
    const last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  if (!mounted) return null;
  const isLast = index === steps.length - 1;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="tour"
          className="pt-root"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: EASE_OUT }}
        >
          {/* Camada escura com recorte em mola (bloqueia cliques na página) */}
          <svg className="pt-dim" aria-hidden onClick={closeOnOverlayClick ? () => onClose('dismiss') : undefined}>
            <defs>
              <mask id={`${uid}-mask`} maskUnits="userSpaceOnUse" x="0" y="0" width="100%" height="100%">
                <rect width="100%" height="100%" fill="white" />
                <motion.rect x={sx} y={sy} width={safeW} height={safeH} rx={safeR} fill="black" />
              </mask>
            </defs>
            <rect width="100%" height="100%" fill="black" fillOpacity={0.6} mask={`url(#${uid}-mask)`} />
            <motion.rect x={sx} y={sy} width={safeW} height={safeH} rx={safeR} fill="none" stroke="white" strokeOpacity={0.35} strokeWidth={1.5} />
          </svg>

          {/* Lê env(safe-area-inset-bottom) para o cartão não ficar sobre a barra de início do iPhone */}
          <div ref={safeRef} aria-hidden className="pt-safe" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }} />

          {/* Cartão que acompanha o recorte */}
          <motion.div
            ref={cardRef}
            role="dialog"
            aria-modal="true"
            aria-label="Tour do Rudge"
            onKeyDown={trapTab}
            className="pt-card"
            style={{ x: cxv, y: cyv }}
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: ready ? 1 : 0, scale: ready ? 1 : 0.96 }}
            transition={{ duration: 0.2, ease: EASE_OUT }}
          >
            <div className="pt-top">
              <span>
                {index + 1} de {steps.length}
              </span>
              <button type="button" onClick={() => onClose('skip')} className="pt-skip">
                Pular
              </button>
            </div>

            <motion.div ref={regionRef} className="pt-region" style={{ height: regionH }} aria-live="polite">
              <AnimatePresence mode="popLayout" initial={false} custom={dirRef.current}>
                <motion.div
                  key={index}
                  ref={(el) => {
                    if (el) contentEl.current = el;
                  }}
                  custom={dirRef.current}
                  variants={slide}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ duration: 0.2, ease: EASE_OUT }}
                  className="pt-content"
                >
                  <h2 className="pt-title">{step.title}</h2>
                  <div className="pt-body">{step.body}</div>
                </motion.div>
              </AnimatePresence>
            </motion.div>

            <div className="pt-foot">
              <div className="pt-dots">
                {steps.map((_, i) => (
                  <button key={i} type="button" aria-label={`Ir para o passo ${i + 1}`} aria-current={i === index} onClick={() => go(i)} className="pt-dot">
                    <span className={cx(i === index && 'on')} />
                  </button>
                ))}
              </div>
              <div className="pt-actions">
                {index > 0 && (
                  <button type="button" onClick={() => go(index - 1)} className="pt-btn ghost">
                    Voltar
                  </button>
                )}
                <button ref={nextRef} type="button" onClick={() => go(index + 1)} className="pt-btn solid">
                  {isLast ? 'Concluir' : 'Próximo'}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export default ProductTour;
