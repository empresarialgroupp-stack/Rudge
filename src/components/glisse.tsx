// Ponte entre o Rudge e o Glisse (Liquid Glass da Apple para a web — https://glisse.kelvinzhang.com).
// O Glisse desenha cada aba com a mesma largura (--lg-tab-width); aqui essa largura é medida a partir
// do maior rótulo e, em controles de largura total, a partir do espaço disponível.
import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { SegmentedControl, TabBar } from 'glisse';

const join = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

function useTabWidth(
  wrap: RefObject<HTMLDivElement | null>,
  measure: RefObject<HTMLDivElement | null>,
  { count, pad, min, full }: { count: number; pad: number; min: number; full?: boolean },
) {
  const [w, setW] = useState(min);
  const calc = useRef(() => {});
  calc.current = () => {
    const m = measure.current;
    const el = wrap.current;
    if (!m || !el || !count) return;
    const need = Math.ceil(Math.max(0, ...[...m.children].map((c) => c.getBoundingClientRect().width))) + pad;
    const avail = full ? Math.floor((el.clientWidth - 1) / count) : 0;
    const next = Math.max(min, need, avail);
    setW((prev) => (prev === next ? prev : next));
  };
  // rótulos podem mudar a cada renderização (contadores)
  useLayoutEffect(() => calc.current());
  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => calc.current());
    ro.observe(el);
    document.fonts?.ready.then(() => calc.current()).catch(() => {});
    return () => ro.disconnect();
  }, []);
  return w;
}

/** Controle segmentado do Glisse (iOS 26) com a API de sempre do Rudge. */
export function GlassSegmented<T extends string | number>({
  options,
  value,
  onChange,
  full,
  label = 'Opções',
  className,
}: {
  options: { value: T; label: ReactNode; count?: number }[];
  value: T;
  onChange: (v: T) => void;
  full?: boolean;
  label?: string;
  className?: string;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const measure = useRef<HTMLDivElement>(null);
  const w = useTabWidth(wrap, measure, { count: options.length, pad: 28, min: 64, full });
  const face = (o: (typeof options)[number]) => (
    <span className="gs-face">
      {o.label}
      {o.count !== undefined && <span className="gs-count">{o.count}</span>}
    </span>
  );
  return (
    <div ref={wrap} className={join('gs-wrap', full && 'full', className)}>
      <SegmentedControl
        aria-label={label}
        items={options.map((o) => ({ value: String(o.value), label: face(o) }))}
        value={String(value)}
        onValueChange={(v) => {
          const o = options.find((x) => String(x.value) === v);
          if (o) onChange(o.value);
        }}
        style={{ '--lg-tab-width': `${w}px` } as CSSProperties}
      />
      <div ref={measure} className="gs-measure seg" aria-hidden="true">
        {options.map((o) => (
          <span key={String(o.value)}>{face(o)}</span>
        ))}
      </div>
    </div>
  );
}

export interface LiquidTab {
  value: string;
  label: string;
  icon?: ReactNode;
  /** mantido por compatibilidade; o Glisse desenha a lente sobre o próprio ícone */
  activeIcon?: ReactNode;
  badge?: number;
  /** o que o leitor de tela fala junto com o número */
  badgeLabel?: string;
}

/** Barra de abas do Glisse (iOS 26): a seleção desliza, segue o dedo e vira lente ao segurar. */
export function LiquidTabBar({
  tabs,
  value,
  onValueChange,
  label = 'Seções',
  id,
  className,
}: {
  tabs: LiquidTab[];
  value: string;
  onValueChange: (value: string) => void;
  /** mantido por compatibilidade: com ícone, o rótulo fica embaixo; sem ícone, só o texto */
  labels?: 'active' | 'always' | 'none';
  label?: string;
  id?: string;
  className?: string;
}) {
  const icons = tabs.some((t) => t.icon);
  const wrap = useRef<HTMLDivElement>(null);
  const measure = useRef<HTMLDivElement>(null);
  const w = useTabWidth(wrap, measure, { count: tabs.length, pad: icons ? 16 : 32, min: icons ? 64 : 72 });
  const items = tabs.map((t) => ({
    value: t.value,
    label: t.badge ? (
      <span className="gt-label" aria-label={`${t.label}, ${t.badgeLabel ?? `${t.badge} novos`}`}>
        {t.label}
      </span>
    ) : (
      t.label
    ),
    icon: t.icon ? (
      <span className="gt-icon">
        {t.icon}
        {!!t.badge && (
          <span className="gt-badge" aria-hidden="true">
            {t.badge > 9 ? '9+' : t.badge}
          </span>
        )}
      </span>
    ) : undefined,
  }));
  return (
    <div ref={wrap} id={id} className={join('gt-wrap', icons && 'icons', className)}>
      <TabBar aria-label={label} items={items} value={value} onValueChange={onValueChange} style={{ '--lg-tab-width': `${w}px` } as CSSProperties} />
      <div ref={measure} className={join('gs-measure', icons ? 'tab-icons' : 'tab')} aria-hidden="true">
        {tabs.map((t) => (
          <span key={t.value}>{t.label}</span>
        ))}
      </div>
    </div>
  );
}
