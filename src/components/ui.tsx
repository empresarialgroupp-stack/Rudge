import { useEffect, useId, useRef, type ReactNode } from 'react';
import { CountUp } from './charts';
import {
  Briefcase,
  Check,
  GraduationCap,
  HeartPulse,
  House,
  Sparkles,
  Users,
  Wallet,
  X,
  type LucideIcon,
} from 'lucide-react';
import type { AreaKey, Priority } from '../lib/types';

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ');
}

export const AREA_ICON: Record<AreaKey, LucideIcon> = {
  saude: HeartPulse,
  financas: Wallet,
  carreira: Briefcase,
  estudos: GraduationCap,
  pessoal: Sparkles,
  relacionamentos: Users,
  casa: House,
};

export function AreaIcon({ area, size = 16 }: { area: AreaKey; size?: number }) {
  const I = AREA_ICON[area] ?? Sparkles;
  return <I width={size} height={size} />;
}

/** Marca do Rudge: "R" monolinha sobre vidro. */
export function BrandMark({ className = 'brand-mark' }: { className?: string }) {
  const id = 'bm' + useId().replace(/[^a-zA-Z0-9_-]/g, '');
  return (
    <svg className={className} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}bg`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2a2a2c" />
          <stop offset="1" stopColor="#000" />
        </linearGradient>
        <radialGradient id={`${id}gl`} cx="0.25" cy="0" r="0.9">
          <stop offset="0" stopColor="#fff" stopOpacity="0.35" />
          <stop offset="0.6" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}r`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" />
          <stop offset="1" stopColor="#c9c9cc" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="18" fill={`url(#${id}bg)`} />
      <rect width="64" height="64" rx="18" fill={`url(#${id}gl)`} />
      <rect x="0.75" y="0.75" width="62.5" height="62.5" rx="17.25" fill="none" stroke="#fff" strokeOpacity="0.22" strokeWidth="1.5" />
      <path
        d="M22 47V17h11.5a8.6 8.6 0 0 1 0 17.2H22M33.5 34.2 43 47"
        fill="none"
        stroke={`url(#${id}r)`}
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Modal({
  title,
  onClose,
  children,
  footer,
  size,
  className,
}: {
  title?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'wide' | 'narrow';
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  return (
    <div
      className="overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div ref={ref} className={cx('modal glass strong', size, className)} role="dialog" aria-modal="true">
        <div className="sheet-grip" />
        {title !== undefined && (
          <div className="modal-head">
            <h2>{title}</h2>
            <button className="icon-btn sm" onClick={onClose} aria-label="Fechar">
              <X />
            </button>
          </div>
        )}
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Checkbox({
  checked,
  onChange,
  priority = 0,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  priority?: Priority;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label ?? (checked ? 'Desmarcar' : 'Concluir')}
      className={cx('check', checked && 'on', !checked && priority >= 3 && 'p3', !checked && priority === 2 && 'p2')}
      onClick={(e) => {
        e.stopPropagation();
        onChange();
      }}
    >
      <Check />
    </button>
  );
}

export function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      className={cx('switch', on && 'on')}
      onClick={() => onChange(!on)}
    />
  );
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  full,
}: {
  options: { value: T; label: ReactNode; count?: number }[];
  value: T;
  onChange: (v: T) => void;
  full?: boolean;
}) {
  return (
    <div className={cx('segmented', full && 'full')} role="tablist">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          className={cx(o.value === value && 'on')}
          onClick={() => onChange(o.value)}
        >
          {o.label}
          {o.count !== undefined && <span className="count">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function ProgressBar({ value, marker, size }: { value: number; marker?: number; size?: 'lg' }) {
  return (
    <div className={cx('bar', size)} role="progressbar" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}>
      <i style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
      {marker !== undefined && marker > 0 && marker < 1 && <b style={{ left: `calc(${marker * 100}% - 1px)` }} title="Onde você deveria estar hoje" />}
    </div>
  );
}

export function ProgressRing({
  value,
  size = 52,
  stroke = 5,
  label,
  fontSize,
}: {
  value: number;
  size?: number;
  stroke?: number;
  label?: ReactNode;
  fontSize?: number;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className="ring-wrap" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle className="ring-track" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} />
        <circle
          className="ring-fill"
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v)}
        />
      </svg>
      <span className="ring-label" style={{ fontSize: fontSize ?? Math.round(size * 0.24) }}>
        {label ?? `${Math.round(v * 100)}%`}
      </span>
    </div>
  );
}

export function Empty({
  icon: Icon,
  title,
  text,
  action,
}: {
  icon: LucideIcon;
  title: string;
  text?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Icon />
      </div>
      <b>{title}</b>
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}

export function Prio({ level }: { level: Priority }) {
  if (!level) return null;
  return (
    <span className="prio" title={['', 'Baixa', 'Média', 'Alta'][level] + ' prioridade'}>
      <i className={level >= 1 ? 'on' : ''} />
      <i className={level >= 2 ? 'on' : ''} />
      <i className={level >= 3 ? 'on' : ''} />
    </span>
  );
}

/** Campo com rótulo. Use `group` quando o conteúdo é um grupo de botões (evita que o clique no rótulo acione o primeiro botão). */
export function Field({ label, children, hint, group }: { label: string; children: ReactNode; hint?: ReactNode; group?: boolean }) {
  const inner = (
    <>
      <span className="label">{label}</span>
      {children}
      {hint && <span className="muted" style={{ fontSize: 12 }}>{hint}</span>}
    </>
  );
  return group ? (
    <div className="field" role="group" aria-label={label}>
      {inner}
    </div>
  ) : (
    <label className="field">{inner}</label>
  );
}

export function DayPicker({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) {
  const labels = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
  const order = [1, 2, 3, 4, 5, 6, 0];
  return (
    <div className="daypicker">
      {order.map((d) => (
        <button
          type="button"
          key={d}
          className={cx(value.includes(d) && 'on')}
          onClick={() => onChange(value.includes(d) ? value.filter((x) => x !== d) : [...value, d].sort())}
          aria-pressed={value.includes(d)}
          aria-label={['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'][d]}
        >
          {labels[d]}
        </button>
      ))}
    </div>
  );
}

/** Cartão de número (estilo painel): ícone em círculo, rótulo, valor animado e selo. */
export function StatCard({
  icon: I,
  label,
  value,
  suffix,
  decimals,
  hint,
  tone,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  suffix?: ReactNode;
  decimals?: number;
  hint?: ReactNode;
  tone?: 'warn';
  onClick?: () => void;
}) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag className={cx('stat2 glass', onClick && 'clickable')} onClick={onClick}>
      <span className="s2-head">
        <span className="s2-icon">
          <I />
        </span>
        {label}
      </span>
      <span className="s2-row">
        <b className="s2-value">
          <CountUp value={value} decimals={decimals} />
          {suffix && <small>{suffix}</small>}
        </b>
        {hint !== undefined && hint !== '' && <span className={cx('s2-chip', tone)}>{hint}</span>}
      </span>
    </Tag>
  );
}

export function StatRow({ children, cols = 4 }: { children: ReactNode; cols?: number }) {
  return (
    <div className={`stat-row2 stagger c${cols}`} style={{ ['--cols' as string]: cols }}>
      {children}
    </div>
  );
}

/** Filtros em chips com bolinha e contagem ("Todas 12"). */
export function ChipTabs<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: ReactNode; count?: number }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="chip-tabs" role="tablist">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={o.value === value} className={cx(o.value === value && 'on')} onClick={() => onChange(o.value)}>
          <i className="ct-dot" />
          {o.label}
          {o.count !== undefined && <span className="ct-count">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}
