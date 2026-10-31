// Pilha de cartões no estilo carteira: passe o mouse para abrir em leque, arraste ou use as
// setas para trocar, escolha um cartão para ver saldo e movimentações.
// Mesma API do Wallet stack da Arc Pro (cards, label, currency, locale, onSelectedChange,
// className): se o plano Pro for contratado, basta trocar o import.
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent as RPointerEvent } from 'react';
import { animate, motion, useMotionValue, useReducedMotion, useSpring, type PanInfo } from 'motion/react';
import { ArrowDownLeft, ArrowUpRight, ChevronLeft, Nfc } from 'lucide-react';
import type { WalletStackCard } from '../lib/finance/types';
import { cx } from './ui';

export type { WalletStackCard };

interface Props {
  cards: WalletStackCard[];
  label?: string;
  currency?: string;
  locale?: string;
  onSelectedChange?: (card: WalletStackCard | null) => void;
  className?: string;
}

const RATIO = 53.98 / 85.6;
const VISIBLE = 3;
const SPRING = { type: 'spring', stiffness: 420, damping: 44, mass: 1 } as const;

function money(n: number, currency: string, locale: string) {
  return n.toLocaleString(locale, { style: 'currency', currency });
}

/** Marca de bandeira fictícia (dois anéis). */
function HaloMark() {
  return (
    <svg className="wsc-halo" viewBox="0 0 40 24" aria-hidden="true">
      <circle cx="14" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" opacity=".9" />
      <circle cx="26" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" opacity=".55" />
    </svg>
  );
}

function CardFace({ card }: { card: WalletStackCard }) {
  return (
    <>
      {card.image && <img className="wsc-art" src={card.image} alt="" aria-hidden="true" />}
      <span className="wsc-finish" aria-hidden="true" />
      <span className="wsc-light" aria-hidden="true" />
      <span className="wsc-top">
        <span className="wsc-issuer">{card.issuer}</span>
        <span className="wsc-product">{card.product}</span>
      </span>
      <span className="wsc-mid" aria-hidden="true">
        <span className="wsc-chip" />
        <Nfc className="wsc-nfc" />
      </span>
      <span className="wsc-num">
        <span aria-hidden="true">••••</span>
        <span aria-hidden="true">••••</span>
        <span aria-hidden="true">••••</span>
        <span>{card.lastFour}</span>
      </span>
      <span className="wsc-bottom">
        <span className="wsc-holder">{card.holder}</span>
        {card.expires && (
          <span className="wsc-exp">
            <small>Válido até</small>
            {card.expires}
          </span>
        )}
        <span className="wsc-network">{card.network === undefined ? <HaloMark /> : card.network}</span>
      </span>
    </>
  );
}

function Balance({ value, currency, locale, reduce }: { value: number; currency: string; locale: string; reduce: boolean }) {
  const [shown, setShown] = useState(reduce ? value : 0);
  useEffect(() => {
    if (reduce) return setShown(value);
    const c = animate(0, value, { duration: 0.7, ease: [0.22, 1, 0.36, 1], onUpdate: setShown });
    return () => c.stop();
  }, [value, reduce]);
  return <>{money(shown, currency, locale)}</>;
}

export function WalletStack({ cards, label = 'Wallet', currency = 'USD', locale = 'en-US', onSelectedChange, className }: Props) {
  const reduce = !!useReducedMotion();
  const [canHover] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.('(hover: hover)').matches);
  const n = cards.length;
  const [front, setFront] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const [fan, setFan] = useState(false);
  const [leaving, setLeaving] = useState<{ id: string; dir: 1 | -1; key: number } | null>(null);
  const [announce, setAnnounce] = useState('');
  const [w, setW] = useState(296);
  const stageRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const dragged = useRef(false);
  const rx = useSpring(useMotionValue(0), { stiffness: 300, damping: 30 });
  const ry = useSpring(useMotionValue(0), { stiffness: 300, damping: 30 });

  const open = openId ? (cards.find((c) => c.id === openId) ?? null) : null;
  const h = w * RATIO;
  // no celular não há hover: a pilha não abre em leque, então não reserva espaço para ele
  const peekMax = canHover ? h * 0.2 : h * 0.12;
  const peek = fan && !open ? peekMax : canHover ? h * 0.09 : peekMax;
  const visible = Math.min(VISIBLE, n);
  const base = (visible - 1) * peekMax;
  const stageH = open ? h : h + base;

  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => setW(el.clientWidth || 296);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (front >= n) setFront(0);
  }, [front, n]);

  const focusFront = (i: number) => {
    if (stageRef.current?.contains(document.activeElement)) requestAnimationFrame(() => cardRefs.current[i]?.focus());
  };

  function go(to: number, dir: 1 | -1) {
    if (!n) return;
    const next = ((to % n) + n) % n;
    if (next === front && !open) return;
    const prev = cards[front];
    setLeaving(dir === 1 ? { id: prev.id, dir, key: Date.now() } : { id: cards[next].id, dir, key: Date.now() });
    setFront(next);
    const c = cards[next];
    if (open) {
      setOpenId(c.id);
      onSelectedChange?.(c);
    }
    setAnnounce(`${c.issuer} ${c.product}, final ${c.lastFour}. Cartão ${next + 1} de ${n}.`);
    focusFront(next);
  }

  function setOpen(card: WalletStackCard | null) {
    setOpenId(card?.id ?? null);
    onSelectedChange?.(card);
    setAnnounce(card ? `${card.product} aberto. ${card.balanceLabel}: ${money(card.balance, currency, locale)}.` : 'Cartão de volta na carteira.');
    rx.set(0);
    ry.set(0);
  }

  function choose(i: number) {
    if (dragged.current) return;
    if (open && cards[i].id === open.id) return setOpen(null);
    setFront(i);
    setOpen(cards[i]);
  }

  function onKeyDown(e: KeyboardEvent) {
    const k = e.key;
    if (k === 'ArrowDown' || k === 'ArrowRight') go(front + 1, 1);
    else if (k === 'ArrowUp' || k === 'ArrowLeft') go(front - 1, -1);
    else if (k === 'Home') go(0, -1);
    else if (k === 'End') go(n - 1, 1);
    else if (k === 'Enter' || k === ' ') setOpen(open ? null : cards[front]);
    else if (k === 'Escape' && open) {
      setOpen(null);
      focusFront(front);
    } else return;
    e.preventDefault();
  }

  function onDragEnd(_: unknown, info: PanInfo) {
    const dy = info.offset.y;
    const vy = info.velocity.y;
    if (open) {
      if (dy > 70 || vy > 500) setOpen(null);
    } else if (dy > 48 || vy > 420) go(front + 1, 1);
    else if (dy < -48 || vy < -420) go(front - 1, -1);
    setTimeout(() => (dragged.current = false), 0);
  }

  function onPointerMove(e: RPointerEvent<HTMLButtonElement>) {
    if (reduce || e.pointerType !== 'mouse') return;
    const r = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    e.currentTarget.style.setProperty('--lx', `${px * 100}%`);
    e.currentTarget.style.setProperty('--ly', `${py * 100}%`);
    ry.set((px - 0.5) * 10);
    rx.set((0.5 - py) * 10);
  }
  function onPointerLeave(e: RPointerEvent<HTMLButtonElement>) {
    e.currentTarget.style.removeProperty('--lx');
    e.currentTarget.style.removeProperty('--ly');
    rx.set(0);
    ry.set(0);
  }

  function target(i: number) {
    const c = cards[i];
    const d = (i - front + n) % n;
    if (open) {
      return c.id === open.id ? { y: 0, scale: 1, opacity: 1 } : { y: h * 0.7, scale: 0.92, opacity: 0 };
    }
    const dd = Math.min(d, visible - 1);
    return { y: base - dd * peek, scale: 1 - dd * 0.045, opacity: d < visible ? 1 : 0 };
  }

  return (
    <div className={cx('wallet-stack', className)} style={{ '--ws-h': `${h}px` } as CSSProperties}>
      <div className="ws-head">
        <h3 className="ws-label" id="ws-label">
          {label}
        </h3>
        {open ? (
          <button className="ws-all" onClick={() => (setOpen(null), focusFront(front))}>
            <ChevronLeft /> Todos os cartões
          </button>
        ) : (
          <span className="ws-count">
            {n} {n === 1 ? 'cartão' : 'cartões'}
          </span>
        )}
      </div>

      <motion.div
        ref={stageRef}
        className={cx('ws-stage', open && 'is-open')}
        role="group"
        aria-labelledby="ws-label"
        aria-describedby="ws-hint"
        onKeyDown={onKeyDown}
        onPointerEnter={(e) => e.pointerType === 'mouse' && setFan(true)}
        onPointerLeave={() => setFan(false)}
        animate={{ height: stageH }}
        initial={false}
        transition={reduce ? { duration: 0 } : SPRING}
      >
        {cards.map((c, i) => {
          const d = (i - front + n) % n;
          const isFront = d === 0;
          const isOpen = open?.id === c.id;
          const t = target(i);
          const lv = leaving?.id === c.id ? leaving : null;
          const anim =
            lv && !reduce && !open
              ? lv.dir === 1
                ? { y: [base, base + h * 0.55, t.y], opacity: [1, 0, t.opacity], scale: [1, 0.96, t.scale] }
                : { y: [base + h * 0.55, t.y], opacity: [0, 1], scale: [0.96, t.scale] }
              : t;
          return (
            <motion.button
              key={c.id}
              ref={(el) => {
                cardRefs.current[i] = el;
              }}
              type="button"
              className={cx('ws-card', `v-${c.variant ?? 'metal'}`, isFront && 'front')}
              style={{
                zIndex: isOpen ? n + 1 : n - d,
                rotateX: isFront ? rx : 0,
                rotateY: isFront ? ry : 0,
                ...(c.tint ? ({ '--tint': c.tint } as CSSProperties) : null),
              }}
              initial={false}
              animate={anim}
              transition={reduce ? { duration: 0 } : lv ? { duration: 0.46, ease: [0.22, 1, 0.36, 1] } : SPRING}
              onAnimationComplete={() => lv && setLeaving((x) => (x?.key === lv.key ? null : x))}
              tabIndex={isFront || isOpen ? 0 : -1}
              aria-expanded={isOpen}
              aria-hidden={!open && d >= visible ? true : undefined}
              aria-label={`${c.issuer} ${c.product}, final ${c.lastFour}, cartão ${i + 1} de ${n}, ${c.balanceLabel} ${money(c.balance, currency, locale)}`}
              onClick={() => choose(i)}
              drag={isFront || isOpen ? 'y' : false}
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={0.4}
              dragSnapToOrigin
              onDragStart={() => (dragged.current = true)}
              onDragEnd={onDragEnd}
              onPointerMove={isFront ? onPointerMove : undefined}
              onPointerLeave={isFront ? onPointerLeave : undefined}
              whileHover={!open && fan && !isFront && !reduce ? { y: t.y - h * 0.06 } : undefined}
            >
              <CardFace card={c} />
            </motion.button>
          );
        })}
      </motion.div>
      <p id="ws-hint" className="sr-only">
        Use as setas para trocar de cartão, Enter para abrir e Esc para voltar.
      </p>
      <p className="sr-only" aria-live="polite">
        {announce}
      </p>

      <div className={cx('ws-activity', open && 'on')} inert={!open}>
        {open && (
          <motion.div key={open.id} initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
            <div className="ws-balance">
              <small>{open.balanceLabel}</small>
              <b>
                <Balance value={open.balance} currency={currency} locale={locale} reduce={reduce} />
              </b>
            </div>
            <ul className="ws-tx">
              {open.transactions.slice(0, 3).map((t, k) => (
                <motion.li
                  key={t.id}
                  initial={reduce ? false : { opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: reduce ? 0 : 0.12 + k * 0.06, duration: 0.3 }}
                >
                  <span className={cx('ws-tx-ic', t.amount > 0 && 'in')}>
                    {t.avatar ? <img src={t.avatar} alt="" /> : (t.icon ?? (t.amount > 0 ? <ArrowDownLeft /> : <ArrowUpRight />))}
                  </span>
                  <span className="ws-tx-body">
                    <b>{t.merchant}</b>
                    <small>{t.detail}</small>
                  </span>
                  <span className={cx('ws-tx-amt', t.amount > 0 && 'in')}>
                    {t.amount > 0 ? '+' : '−'}
                    {money(Math.abs(t.amount), currency, locale)}
                  </span>
                </motion.li>
              ))}
              {!open.transactions.length && <li className="ws-tx-empty">Sem movimentações.</li>}
            </ul>
          </motion.div>
        )}
      </div>
    </div>
  );
}
