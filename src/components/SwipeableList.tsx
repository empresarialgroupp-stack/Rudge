// Lista com linhas deslizáveis (adaptada de beui.dev/components/blocks/swipeable-list).
// Arraste a linha para o lado para ver as ações. No teclado: Tab até a linha,
// setas ← → abrem cada lado, Esc fecha.
import { Ellipsis } from 'lucide-react';
import { animate, motion, type PanInfo, useMotionValue, useReducedMotion } from 'motion/react';
import { type KeyboardEvent, type ReactNode, useCallback, useEffect, useId, useRef, useState } from 'react';

const cn = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

export const swipeableListMessages = {
  actionsFor: (title: string) => `Ações de ${title}`,
  showActions: 'Mostrar ações',
};

export type SwipeSide = 'left' | 'right';

export type SwipeableListValue = { id: string; side: SwipeSide };

export type SwipeActionTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger';

export type SwipeAction = {
  id: string;
  label: ReactNode;
  icon: ReactNode;
  tone?: SwipeActionTone;
  disabled?: boolean;
  onClick?: (item: SwipeableListItem) => void;
};

export type SwipeableListItem = {
  id: string;
  title?: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  leading?: ReactNode;
  content?: ReactNode;
  leftActions?: SwipeAction[];
  rightActions?: SwipeAction[];
  disabled?: boolean;
  /** toque/clique na linha (ignorado logo após arrastar) */
  onPress?: () => void;
  className?: string;
};

export interface SwipeableListProps {
  items: SwipeableListItem[];
  value?: SwipeableListValue | null;
  defaultValue?: SwipeableListValue | null;
  onValueChange?: (value: SwipeableListValue | null) => void;
  onAction?: (payload: { item: SwipeableListItem; action: SwipeAction; side: SwipeSide }) => void;
  actionWidth?: number;
  revealThreshold?: number;
  closeOnAction?: boolean;
  className?: string;
  renderItem?: (item: SwipeableListItem) => ReactNode;
}

// Mola de soltura: rebotes curtos e aberturas completas com a mesma sensação direta,
// perto das listas nativas do celular.
const ROW_SETTLE = { type: 'spring', stiffness: 560, damping: 48, mass: 0.82, restDelta: 0.5, restSpeed: 8 } as const;
const OPEN_DISTANCE_RATIO = 0.46;
const CLOSE_DISTANCE_RATIO = 0.72;
const OPEN_VELOCITY = 720;
const CLOSE_VELOCITY = 320;
const FLING_DISTANCE = 14;
const RELEASE_VELOCITY_LIMIT = 1500;

function useControllableSwipeValue({
  value,
  defaultValue,
  onValueChange,
}: {
  value?: SwipeableListValue | null;
  defaultValue?: SwipeableListValue | null;
  onValueChange?: (value: SwipeableListValue | null) => void;
}) {
  const [internalValue, setInternalValue] = useState(defaultValue ?? null);
  const isControlled = value !== undefined;
  const currentValue = isControlled ? value : internalValue;
  const setValue = useCallback(
    (next: SwipeableListValue | null) => {
      if (!isControlled) setInternalValue(next);
      onValueChange?.(next);
    },
    [isControlled, onValueChange],
  );
  return [currentValue, setValue] as const;
}

const isActionableSide = (value: number, sideWidth: number) => sideWidth > 0 && Math.abs(value) > 0;
const clampReleaseVelocity = (v: number) => Math.max(-RELEASE_VELOCITY_LIMIT, Math.min(RELEASE_VELOCITY_LIMIT, v));

function SwipeActionButton({
  action,
  actionWidth,
  side,
  focusable,
  onAction,
}: {
  action: SwipeAction;
  actionWidth: number;
  side: SwipeSide;
  focusable: boolean;
  onAction: (action: SwipeAction, side: SwipeSide) => void;
}) {
  return (
    <button
      type="button"
      disabled={action.disabled}
      tabIndex={focusable ? 0 : -1}
      aria-label={typeof action.label === 'string' ? action.label : undefined}
      onClick={() => onAction(action, side)}
      className={cn('swl-action', `tone-${action.tone ?? 'neutral'}`)}
      style={{ width: actionWidth }}
    >
      <span className="swl-action-icon">{action.icon}</span>
      <span className="swl-action-label" aria-hidden>
        {action.label}
      </span>
    </button>
  );
}

function SwipeableListRow({
  item,
  actionWidth,
  revealThreshold,
  openValue,
  setOpenValue,
  closeOnAction,
  onAction,
  renderItem,
}: {
  item: SwipeableListItem;
  actionWidth: number;
  revealThreshold: number;
  openValue: SwipeableListValue | null;
  setOpenValue: (value: SwipeableListValue | null) => void;
  closeOnAction: boolean;
  onAction?: SwipeableListProps['onAction'];
  renderItem?: (item: SwipeableListItem) => ReactNode;
}) {
  const reduce = useReducedMotion();
  const railId = useId();
  const railRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  // Quando o teclado abre um lado, o foco segue para as ações assim que o trilho deixa de ser inerte.
  const focusActions = useRef(false);
  // Arrastou agora há pouco: o "clique" que vem junto com o soltar não abre o aviso.
  const dragged = useRef(false);
  const x = useMotionValue(0);
  const animationRef = useRef<{ stop: () => void } | null>(null);
  const commandedTargetRef = useRef(0);
  const leftActions = item.leftActions ?? [];
  const rightActions = item.rightActions ?? [];
  const leftWidth = leftActions.length * actionWidth;
  const rightWidth = rightActions.length * actionWidth;
  const openSide = openValue?.id === item.id ? openValue.side : null;
  const targetX = openSide === 'left' ? leftWidth : openSide === 'right' ? -rightWidth : 0;

  const settleX = useCallback(
    (nextX: number, velocity = 0) => {
      commandedTargetRef.current = nextX;
      animationRef.current?.stop();
      if (reduce) {
        x.set(nextX);
        return;
      }
      animationRef.current = animate(x, nextX, {
        ...ROW_SETTLE,
        velocity: clampReleaseVelocity(velocity),
        onComplete: () => x.set(nextX),
      });
    },
    [reduce, x],
  );

  useEffect(() => () => animationRef.current?.stop(), []);

  useEffect(() => {
    if (commandedTargetRef.current === targetX) return;
    settleX(targetX);
  }, [settleX, targetX]);

  const getTargetX = useCallback(
    (side: SwipeSide | null) => (side === 'left' ? leftWidth : side === 'right' ? -rightWidth : 0),
    [leftWidth, rightWidth],
  );

  const snapTo = useCallback(
    (side: SwipeSide | null, velocity = 0) => {
      setOpenValue(side ? { id: item.id, side } : null);
      settleX(getTargetX(side), velocity);
    },
    [getTargetX, item.id, setOpenValue, settleX],
  );

  const onDragStart = useCallback(() => {
    dragged.current = true;
    animationRef.current?.stop();
    if (openValue && openValue.id !== item.id) setOpenValue(null);
  }, [item.id, openValue, setOpenValue]);

  const onDragEnd = useCallback(
    (_: PointerEvent, info: PanInfo) => {
      setTimeout(() => (dragged.current = false), 80);
      const velocity = info.velocity.x;
      const latest = x.get();
      const leftOpenThreshold = Math.max(revealThreshold, leftWidth * OPEN_DISTANCE_RATIO);
      const rightOpenThreshold = Math.max(revealThreshold, rightWidth * OPEN_DISTANCE_RATIO);

      if (openSide === 'left') {
        if (latest < leftWidth * CLOSE_DISTANCE_RATIO || velocity < -CLOSE_VELOCITY) return snapTo(null, velocity);
        return snapTo('left', velocity);
      }
      if (openSide === 'right') {
        if (Math.abs(latest) < rightWidth * CLOSE_DISTANCE_RATIO || velocity > CLOSE_VELOCITY) return snapTo(null, velocity);
        return snapTo('right', velocity);
      }
      if (
        isActionableSide(latest, leftWidth) &&
        (latest > leftOpenThreshold || (velocity > OPEN_VELOCITY && latest > FLING_DISTANCE))
      )
        return snapTo('left', velocity);
      if (
        isActionableSide(latest, rightWidth) &&
        (latest < -rightOpenThreshold || (velocity < -OPEN_VELOCITY && latest < -FLING_DISTANCE))
      )
        return snapTo('right', velocity);
      snapTo(null, velocity);
    },
    [leftWidth, openSide, revealThreshold, rightWidth, snapTo, x],
  );

  const handleAction = useCallback(
    (action: SwipeAction, side: SwipeSide) => {
      action.onClick?.(item);
      onAction?.({ item, action, side });
      if (closeOnAction) {
        // o trilho fica inerte ao fechar; mantém o foco na linha
        if (railRef.current?.contains(document.activeElement)) toggleRef.current?.focus();
        snapTo(null);
      }
    },
    [closeOnAction, item, onAction, snapTo],
  );

  useEffect(() => {
    if (!openSide || !focusActions.current) return;
    focusActions.current = false;
    railRef.current?.querySelector<HTMLButtonElement>(`[data-side="${openSide}"] button:not(:disabled)`)?.focus();
  }, [openSide]);

  const hasActions = leftWidth > 0 || rightWidth > 0;
  const openFromKeyboard = (side: SwipeSide) => {
    if ((side === 'left' ? leftWidth : rightWidth) === 0) return;
    focusActions.current = true;
    snapTo(side);
  };

  // Teclado no lugar do gesto: setas movem a linha como o dedo, Esc fecha.
  const onToggleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      if (openSide === 'left') snapTo(null);
      else openFromKeyboard('right');
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      if (openSide === 'right') snapTo(null);
      else openFromKeyboard('left');
    } else if (event.key === 'Escape' && openSide) {
      event.preventDefault();
      event.stopPropagation();
      snapTo(null);
    }
  };

  const onRailKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    toggleRef.current?.focus();
    snapTo(null);
  };

  const onSurfaceClick = () => {
    if (dragged.current) return;
    if (openSide) return snapTo(null);
    item.onPress?.();
  };

  const defaultContent = (
    <div className="swl-content">
      {item.leading ? <div className="swl-leading">{item.leading}</div> : null}
      <div className="swl-text">
        {item.title ? <div className="swl-title">{item.title}</div> : null}
        {item.description ? <div className="swl-desc">{item.description}</div> : null}
      </div>
      {item.meta ? <div className="swl-meta">{item.meta}</div> : null}
    </div>
  );

  return (
    <div className={cn('swl-row', openSide && 'open', item.disabled && 'disabled', item.className)}>
      <div ref={railRef} id={railId} aria-hidden={!openSide} inert={!openSide} onKeyDown={onRailKeyDown} className="swl-rail">
        <div data-side="left" className="swl-side left">
          {leftActions.map((action) => (
            <SwipeActionButton
              key={action.id}
              action={action}
              actionWidth={actionWidth}
              focusable={openSide === 'left'}
              onAction={handleAction}
              side="left"
            />
          ))}
        </div>
        <div data-side="right" className="swl-side right">
          {rightActions.map((action) => (
            <SwipeActionButton
              key={action.id}
              action={action}
              actionWidth={actionWidth}
              focusable={openSide === 'right'}
              onAction={handleAction}
              side="right"
            />
          ))}
        </div>
      </div>

      <motion.div
        drag={item.disabled || !hasActions ? false : 'x'}
        dragConstraints={{ left: -rightWidth, right: leftWidth }}
        dragElastic={0.04}
        dragMomentum={false}
        dragDirectionLock
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onClick={onSurfaceClick}
        style={{ x }}
        // touch-pan-y: a linha cuida do gesto lateral, a página continua rolando na vertical
        className={cn('swl-surface', hasActions && 'draggable')}
      >
        {renderItem ? renderItem(item) : (item.content ?? defaultContent)}
        {hasActions && !item.disabled ? (
          <button
            ref={toggleRef}
            type="button"
            aria-label={
              typeof item.title === 'string' ? swipeableListMessages.actionsFor(item.title) : swipeableListMessages.showActions
            }
            aria-expanded={openSide !== null}
            aria-controls={railId}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              if (openSide) snapTo(null);
              else openFromKeyboard(leftWidth > 0 ? 'left' : 'right');
            }}
            onKeyDown={onToggleKeyDown}
            className="swl-toggle"
          >
            <Ellipsis aria-hidden />
          </button>
        ) : null}
      </motion.div>
    </div>
  );
}

export function SwipeableList({
  items,
  value,
  defaultValue = null,
  onValueChange,
  onAction,
  actionWidth = 64,
  revealThreshold = 34,
  closeOnAction = true,
  className,
  renderItem,
}: SwipeableListProps) {
  const [openValue, setOpenValue] = useControllableSwipeValue({ value, defaultValue, onValueChange });
  return (
    <div className={cn('swl', className)}>
      {items.map((item) => (
        <SwipeableListRow
          key={item.id}
          item={item}
          actionWidth={actionWidth}
          revealThreshold={revealThreshold}
          openValue={openValue}
          setOpenValue={setOpenValue}
          closeOnAction={closeOnAction}
          onAction={onAction}
          renderItem={renderItem}
        />
      ))}
    </div>
  );
}
