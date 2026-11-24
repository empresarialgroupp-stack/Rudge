/*
 * From Uiverse.io by dexter-st - https://uiverse.io/dexter-st/breezy-zebra-94
 * MIT License, Copyright (c) dexter-st
 */

// Neon liquid button, enviado pelo André. Mesmo HTML/CSS do original, em React,
// com as classes trocadas para o prefixo "s-neon-" (CSS no fim de site.css) para
// não colidir com o resto da landing. As cores são as variáveis do próprio
// componente, ajustadas para o dourado da seção da lista de espera.

import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react';
import { cn } from './cn';

const LAYERS: CSSProperties[] = [
  { animationDelay: '0s', animationDuration: '25s' },
  { animationDelay: '0.15s', animationDuration: '15.9s' },
  { animationDelay: '0.53s', animationDuration: '26.4s' },
  { animationDelay: '0.45s', animationDuration: '17.8s' },
  { animationDelay: '1.6s', animationDuration: '19.2s' },
  { animationDelay: '1.6s', animationDuration: '29.2s' },
  { animationDelay: '1.6s', animationDuration: '20.2s' },
];

export interface NeonLiquidButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  children: ReactNode;
  wrapperClassName?: string;
}

export function NeonLiquidButton({ children, wrapperClassName, className, type = 'button', ...rest }: NeonLiquidButtonProps) {
  return (
    <div className={cn('s-neon-wrapper', wrapperClassName)} data-busy={rest.disabled ? '' : undefined}>
      <div className="s-neon-light" />
      {LAYERS.map((style, i) => (
        <div key={i} className="s-neon-layer" style={style} />
      ))}
      <button type={type} className={cn('s-neon-btn', className)} {...rest}>
        {children}
      </button>
      <div className="s-neon-text" aria-hidden="true">
        {children}
      </div>
    </div>
  );
}

export default NeonLiquidButton;
