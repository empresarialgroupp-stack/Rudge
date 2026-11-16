// Visão geral da Carteira (cards de resumo, gráfico do mês, limite dos cartões e transações
// recentes). Versões próprias com motion, no espírito dos componentes da uiarc.dev.
// Só lê os dados: nada aqui grava ou apaga informação da conta.
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  BriefcaseBusiness,
  Bus,
  ChevronDown,
  CreditCard,
  HeartPulse,
  House,
  Landmark,
  Receipt,
  Repeat,
  Search,
  ShoppingBag,
  ShoppingCart,
  Undo2,
  Utensils,
  WalletCards,
  X,
  type LucideIcon,
} from 'lucide-react';
import { cx, Segmented } from './ui';
import { CountUp } from './charts';
import { brl, type Category, type FinanceCard } from '../lib/finance';
import { CATEGORY_LABEL } from '../lib/finance/sample';
import { activity, categoriesIn, compactBRL, compareMonths, daily, filterActivity, previousMonth, totals, type ActivityRow, type TxKind } from '../lib/finance/overview';

const EASE = [0.22, 1, 0.36, 1] as const;

export const CATEGORY_ICON: Record<Category, LucideIcon> = {
  salario: BriefcaseBusiness,
  pix: Banknote,
  mercado: ShoppingCart,
  restaurante: Utensils,
  transporte: Bus,
  assinatura: Repeat,
  compras: ShoppingBag,
  casa: House,
  saude: HeartPulse,
  fatura: Receipt,
  outros: WalletCards,
};

/** Entrada suave com atraso, desligada para quem pediu menos movimento. */
function Rise({ i = 0, className, children }: { i?: number; className?: string; children: ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: i * 0.06, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

function Money({ value, signed }: { value: number; signed?: boolean }) {
  const abs = Math.abs(value);
  const sign = signed ? (value > 0 ? '+ ' : value < 0 ? '− ' : '') : value < 0 ? '−' : '';
  return (
    <span className="money">
      {sign}R$&nbsp;
      <CountUp value={abs} decimals={2} />
    </span>
  );
}

function Delta({ value, good }: { value: number | null; good: 'up' | 'down' }) {
  if (value === null || !isFinite(value)) return null;
  const up = value >= 0;
  const ok = good === 'up' ? up : !up;
  const pct = Math.abs(value) >= 10 ? '+999%' : `${up ? '+' : '−'}${Math.round(Math.abs(value) * 100)}%`;
  return (
    <span className={cx('wv-delta', ok ? 'good' : 'bad')} title="Comparado aos mesmos dias do mês passado">
      {up ? <ArrowUpRight /> : <ArrowDownLeft />}
      {pct}
    </span>
  );
}

/* ---------------- 1. Cards de resumo ---------------- */

export function WalletSummary({ cards }: { cards: FinanceCard[] }) {
  const t = useMemo(() => totals(cards), [cards]);
  const m = useMemo(() => compareMonths(cards), [cards]);
  const used = t.limit ? t.bills / t.limit : 0;
  const items: { key: string; icon: LucideIcon; tone: string; label: string; value: ReactNode; sub: ReactNode }[] = [
    {
      key: 'cash',
      icon: Landmark,
      tone: 'violet',
      label: 'Saldo em conta',
      value: <Money value={t.cash} />,
      sub: t.accounts ? `${t.accounts} ${t.accounts === 1 ? 'conta' : 'contas'}` : 'Nenhuma conta',
    },
    {
      key: 'in',
      icon: ArrowDownLeft,
      tone: 'green',
      label: 'Entradas do mês',
      value: <Money value={m.received} />,
      sub: (
        <>
          <Delta value={m.receivedDelta} good="up" /> <span>vs. mês passado</span>
        </>
      ),
    },
    {
      key: 'out',
      icon: ArrowUpRight,
      tone: 'orange',
      label: 'Gastos do mês',
      value: <Money value={m.spent} />,
      sub: (
        <>
          <Delta value={m.spentDelta} good="down" /> <span>vs. mês passado</span>
        </>
      ),
    },
    {
      key: 'bill',
      icon: CreditCard,
      tone: 'pink',
      label: 'Faturas abertas',
      value: <Money value={t.bills} />,
      sub: t.limit ? `${Math.round(used * 100)}% do limite` : t.credits ? 'Sem limite informado' : 'Nenhum cartão de crédito',
    },
  ];
  return (
    <section className="wv-summary" aria-label="Resumo da carteira">
      {items.map((it, i) => (
        <Rise key={it.key} i={i} className="wv-kpi glass">
          <span className={cx('wv-kpi-icon', it.tone)} aria-hidden="true">
            <it.icon />
          </span>
          <span className="wv-kpi-body">
            <b className="wv-kpi-v">{it.value}</b>
            <span className="wv-kpi-sub">{it.sub}</span>
          </span>
          <span className="wv-kpi-l">{it.label}</span>
        </Rise>
      ))}
    </section>
  );
}

/* ---------------- 2. Gráfico do mês ---------------- */

function smooth(points: [number, number][]) {
  if (points.length < 2) return points.length ? `M${points[0][0]},${points[0][1]}` : '';
  let d = `M${points[0][0]},${points[0][1]}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const lo = Math.min(p1[1], p2[1]);
    const hi = Math.max(p1[1], p2[1]);
    const cy = (y: number) => Math.min(hi, Math.max(lo, y));
    d += ` C${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(1)},${cy(p1[1] + (p2[1] - p0[1]) / 6).toFixed(1)} ${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(1)},${cy(p2[1] - (p3[1] - p1[1]) / 6).toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

function niceTop(max: number) {
  const raw = Math.max(100, max) / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((k) => k * pow).find((s) => s >= raw) ?? raw;
  return { step, top: Math.ceil(Math.max(100, max) / step) * step };
}

interface Line {
  key: string;
  name: string;
  tone: 'in' | 'out' | 'prev';
  values: number[];
}

function FlowChart({ lines, days, monthLabel, height = 230 }: { lines: Line[]; days: number[]; monthLabel: string; height?: number }) {
  const id = 'wv' + useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const [w, setW] = useState(560);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(240, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const n = Math.max(...lines.map((l) => l.values.length), days.length, 1);
  const padL = 44;
  const padR = 8;
  const padT = 34;
  const padB = 24;
  const plotW = w - padL - padR;
  const plotH = height - padT - padB;
  const { step, top } = niceTop(Math.max(0, ...lines.flatMap((l) => l.values)));
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  const xAt = (i: number) => padL + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const yAt = (v: number) => padT + plotH * (1 - v / top);
  const every = Math.max(1, Math.ceil(n / Math.max(3, Math.floor(plotW / 56))));
  const main = lines[0];

  const onMove = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect();
    setHover(Math.max(0, Math.min(n - 1, Math.round(((clientX - r.left - padL) / plotW) * (n - 1)))));
  };
  const h = hover ?? null;
  const tipX = h === null ? 0 : xAt(h);

  return (
    <div
      className="wv-chart"
      ref={ref}
      style={{ height }}
      onPointerMove={(e) => onMove(e.clientX)}
      onPointerDown={(e) => onMove(e.clientX)}
      onPointerLeave={() => setHover(null)}
      role="img"
      aria-label={`Gráfico acumulado de ${monthLabel}: ${lines.map((l) => `${l.name} ${brl(l.values[l.values.length - 1] ?? 0)}`).join(', ')}`}
    >
      <svg width={w} height={height} aria-hidden="true">
        <defs>
          {lines.map((l) => (
            <linearGradient key={l.key} id={`${id}-${l.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" className={cx('wv-stop', l.tone)} stopOpacity="0.28" />
              <stop offset="1" className={cx('wv-stop', l.tone)} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={w - padR} y1={yAt(t)} y2={yAt(t)} className="wv-grid" />
            <text x={padL - 8} y={yAt(t) + 3.5} textAnchor="end" className="wv-axis">
              {compactBRL(t)}
            </text>
          </g>
        ))}
        {Array.from({ length: n }, (_, i) =>
          i === n - 1 || (i % every === 0 && n - 1 - i >= every * 0.6) ? (
            <text key={i} x={xAt(i)} y={height - 6} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'} className="wv-axis">
              {days[i] ?? i + 1}
            </text>
          ) : null,
        )}
        {[...lines].reverse().map((l) => {
          const pts = l.values.map((v, i): [number, number] => [xAt(i), yAt(v)]);
          const d = smooth(pts);
          const last = pts[pts.length - 1];
          return (
            <g key={l.key} className={cx('wv-series', l.tone)}>
              {l.tone !== 'prev' && last && (
                <motion.path
                  d={`${d} L${last[0]},${yAt(0)} L${pts[0][0]},${yAt(0)} Z`}
                  fill={`url(#${id}-${l.key})`}
                  initial={reduce ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.8, delay: 0.25 }}
                />
              )}
              <motion.path
                d={d}
                fill="none"
                className="wv-line"
                initial={reduce ? false : { pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 1.1, ease: EASE }}
              />
            </g>
          );
        })}
        {h !== null && (
          <g>
            <line x1={tipX} x2={tipX} y1={padT - 6} y2={padT + plotH} className="wv-cursor" />
            {lines.map((l) =>
              l.values[h] !== undefined ? <circle key={l.key} cx={tipX} cy={yAt(l.values[h])} r={4.5} className={cx('wv-dot', l.tone)} /> : null,
            )}
          </g>
        )}
      </svg>
      <AnimatePresence>
        {h !== null && main.values[h] !== undefined && (
          <motion.div
            key="pill"
            className="wv-pill money"
            style={{ left: Math.min(Math.max(tipX, 48), w - 48), top: Math.max(2, yAt(main.values[h]) - 34) }}
            initial={{ opacity: 0, y: 4, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.92 }}
            transition={{ duration: 0.15 }}
          >
            {brl(main.values[h])}
          </motion.div>
        )}
      </AnimatePresence>
      {h !== null && (
        <div className={cx('wv-tip glass strong', tipX > w / 2 && 'flip')} style={{ left: tipX }}>
          <b>
            Dia {days[h] ?? h + 1} de {monthLabel}
          </b>
          {lines.map((l) =>
            l.values[h] !== undefined ? (
              <div key={l.key} className="wv-tip-row">
                <i className={cx('wv-key', l.tone)} />
                {l.name}
                <span className="money">{brl(l.values[h])}</span>
              </div>
            ) : null,
          )}
        </div>
      )}
    </div>
  );
}

export function WalletFlow({ cards, scope }: { cards: FinanceCard[]; scope: string }) {
  const now = Date.now();
  // no comecinho do mês quase não há pontos: abre no mês passado se ele tiver movimento
  const [period, setPeriod] = useState<'now' | 'prev'>(() => (new Date(now).getDate() <= 2 && daily(cards, previousMonth(now), true).spent.some((v) => v > 0) ? 'prev' : 'now'));
  const when = period === 'now' ? now : previousMonth(now);
  const cur = useMemo(() => daily(cards, when), [cards, when]);
  const prev = useMemo(() => daily(cards, previousMonth(now), true), [cards, now]);
  const monthLabel = new Date(when).toLocaleDateString('pt-BR', { month: 'long' });
  const lines: Line[] = [
    { key: 'out', name: 'Gastos', tone: 'out', values: cur.spent },
    { key: 'in', name: 'Entradas', tone: 'in', values: cur.received },
  ];
  if (period === 'now') lines.push({ key: 'prev', name: 'Gastos do mês passado', tone: 'prev', values: prev.spent.slice(0, Math.max(cur.days.length, 1)) });
  const spent = cur.spent[cur.spent.length - 1] ?? 0;
  const received = cur.received[cur.received.length - 1] ?? 0;
  const net = received - spent;

  return (
    <section className="wv-flow glass" aria-label="Movimento do mês">
      <div className="wv-head">
        <div>
          <h3 className="wv-title">Movimento do mês</h3>
          <span className="wv-scope">{scope}</span>
        </div>
        <Segmented
          options={[
            { value: 'now', label: 'Este mês' },
            { value: 'prev', label: 'Mês passado' },
          ]}
          value={period}
          onChange={setPeriod}
        />
      </div>
      <div className="wv-big">
        <b className="money">{brl(spent)}</b>
        <span className="wv-big-l">gastos em {monthLabel}</span>
        <span className={cx('wv-chip', net < 0 ? 'bad' : 'good')}>
          <span className="money">
            {net < 0 ? 'Faltou ' : 'Sobrou '}
            {brl(Math.abs(net))}
          </span>
        </span>
      </div>
      <div className="wv-legend">
        {lines.map((l) => (
          <span key={l.key}>
            <i className={cx('wv-key', l.tone)} />
            {l.name}
          </span>
        ))}
      </div>
      <FlowChart key={period} lines={lines} days={cur.days} monthLabel={monthLabel} />
    </section>
  );
}

/* ---------------- 3. Limite usado (abaixo de "Meus cartões") ---------------- */

export function WalletLimit({ cards }: { cards: FinanceCard[] }) {
  const t = useMemo(() => totals(cards), [cards]);
  const reduce = useReducedMotion();
  if (!t.limit) return null;
  const used = Math.min(1, t.bills / t.limit);
  return (
    <div className="wv-limit">
      <div className="wv-limit-head">
        <span>Limite usado</span>
        <b className={cx(used > 0.3 && 'warn')}>{Math.round(used * 100)}%</b>
      </div>
      <div className="wv-limit-v">
        <b className="money">{brl(t.bills)}</b>
        <span className="money">de {brl(t.limit)}</span>
      </div>
      <div className="wv-meter" role="progressbar" aria-valuenow={Math.round(used * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Limite usado">
        <motion.i initial={reduce ? false : { width: 0 }} animate={{ width: `${used * 100}%` }} transition={{ duration: 0.9, ease: EASE, delay: 0.2 }} />
        <b style={{ left: '30%' }} title="Acima de 30% pesa no score" />
      </div>
    </div>
  );
}

/* ---------------- 4. Transações recentes ---------------- */

const KIND_LABEL: Record<TxKind, string> = { in: 'Entrada', out: 'Saída', bill: 'Fatura', refund: 'Estorno' };

function when(iso: string) {
  const d = new Date(iso);
  const date = d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '');
  const hasTime = d.getHours() !== 0 || d.getMinutes() !== 0;
  return { date, time: hasTime ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '' };
}

function TxIcon({ row }: { row: ActivityRow }) {
  const Icon = row.kind === 'refund' ? Undo2 : CATEGORY_ICON[row.category] ?? WalletCards;
  return (
    <span className={cx('wv-tx-icon', row.kind)} aria-hidden="true">
      <Icon />
    </span>
  );
}

const PAGE = 8;

export function WalletActivity({ cards, scope }: { cards: FinanceCard[]; scope: string }) {
  const rows = useMemo(() => activity(cards), [cards]);
  const cats = useMemo(() => categoriesIn(rows), [rows]);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<Category | 'all'>('all');
  const [kind, setKind] = useState<'all' | 'in' | 'out'>('all');
  const [limit, setLimit] = useState(PAGE);
  const list = useMemo(() => filterActivity(rows, { query, category, kind }), [rows, query, category, kind]);
  const shown = list.slice(0, limit);
  const reduce = useReducedMotion();
  const multi = cards.length > 1;

  useEffect(() => setLimit(PAGE), [query, category, kind, cards]);
  useEffect(() => {
    if (category !== 'all' && !cats.includes(category)) setCategory('all');
  }, [cats, category]);

  return (
    <section className="wv-activity glass" aria-label="Transações recentes">
      <div className="wv-head wv-head-wrap">
        <div>
          <h3 className="wv-title">Transações recentes</h3>
          <span className="wv-scope">
            {scope} · {list.length} {list.length === 1 ? 'transação' : 'transações'}
          </span>
        </div>
        <div className="wv-tools">
          <label className="wv-search">
            <Search aria-hidden="true" />
            <input type="search" placeholder="Buscar" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Buscar transação" />
            {query && (
              <button type="button" onClick={() => setQuery('')} aria-label="Limpar busca">
                <X />
              </button>
            )}
          </label>
          <label className="wv-select">
            <select value={category} onChange={(e) => setCategory(e.target.value as Category | 'all')} aria-label="Categoria">
              <option value="all">Todas as categorias</option>
              {cats.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABEL[c]}
                </option>
              ))}
            </select>
            <ChevronDown aria-hidden="true" />
          </label>
          <label className="wv-select">
            <select value={kind} onChange={(e) => setKind(e.target.value as 'all' | 'in' | 'out')} aria-label="Tipo">
              <option value="all">Entradas e saídas</option>
              <option value="in">Só entradas</option>
              <option value="out">Só saídas</option>
            </select>
            <ChevronDown aria-hidden="true" />
          </label>
        </div>
      </div>

      {list.length === 0 ? (
        <p className="wv-empty">{rows.length ? 'Nenhuma transação com esse filtro.' : 'Nenhuma transação ainda.'}</p>
      ) : (
        <div className="wv-table" role="table" aria-label="Transações">
          <div className={cx('wv-tr wv-th', !multi && 'no-card')} role="row">
            <span role="columnheader">Atividade</span>
            <span role="columnheader">Categoria</span>
            {multi && <span role="columnheader">Cartão</span>}
            <span role="columnheader">Data</span>
            <span role="columnheader" className="r">
              Valor
            </span>
            <span role="columnheader">Tipo</span>
          </div>
          <AnimatePresence initial={false}>
            {shown.map((r, i) => {
              const w = when(r.date);
              return (
                <motion.div
                  key={r.cardId + r.id}
                  layout={reduce ? false : 'position'}
                  className={cx('wv-tr', !multi && 'no-card')}
                  role="row"
                  initial={reduce ? false : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3, delay: Math.min(i, 8) * 0.025 }}
                >
                  <span role="cell" className="wv-td-main">
                    <TxIcon row={r} />
                    <span className="wv-td-text">
                      <b className="wv-private">{r.merchant}</b>
                      <small>
                        {r.categoryLabel} · {w.date}
                        {w.time && `, ${w.time}`}
                      </small>
                    </span>
                  </span>
                  <span role="cell" className="wv-td-cat">
                    {r.categoryLabel}
                  </span>
                  {multi && (
                    <span role="cell" className="wv-td-card">
                      <span className="wv-private">{r.cardName}</span>
                      <small>•••• {r.lastFour}</small>
                    </span>
                  )}
                  <span role="cell" className="wv-td-date">
                    {w.date}
                    {w.time && <small>{w.time}</small>}
                  </span>
                  <span role="cell" className={cx('wv-td-amt r', r.amount > 0 && 'in')}>
                    <span className="money">
                      {r.amount > 0 ? '+ ' : '− '}
                      {brl(Math.abs(r.amount))}
                    </span>
                  </span>
                  <span role="cell" className="wv-td-kind">
                    <span className={cx('wv-badge', r.kind)}>{KIND_LABEL[r.kind]}</span>
                  </span>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
      {list.length > limit && (
        <button type="button" className="btn btn-sm btn-glass btn-pill wv-more" onClick={() => setLimit((l) => l + PAGE * 2)}>
          Mostrar mais ({list.length - limit})
        </button>
      )}
    </section>
  );
}
