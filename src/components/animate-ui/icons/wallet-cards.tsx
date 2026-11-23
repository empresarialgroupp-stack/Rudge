'use client';

// Ícone no formato dos ícones do Animate UI (o conjunto de lá não traz o WalletCards).
import { motion, type Variants } from 'motion/react';

import { getVariants, useAnimateIconContext, IconWrapper, type IconProps } from '@animate-ui/react/icons';

type WalletCardsProps = IconProps<keyof typeof animations>;

// O cartão de cima sobe e volta, e o bolso da carteira acompanha.
const animations = {
  default: {
    card: {
      initial: { y: 0 },
      animate: { y: [0, -2.5, 0], transition: { duration: 0.6, ease: 'easeInOut' } },
    },
    pocket: {
      initial: { y: 0 },
      animate: { y: [0, 1.5, 0], transition: { duration: 0.6, ease: 'easeInOut', delay: 0.08 } },
    },
    frame: {},
  } satisfies Record<string, Variants>,
} as const;

function IconComponent({ size, ...props }: WalletCardsProps) {
  const { controls } = useAnimateIconContext();
  const variants = getVariants(animations);

  return (
    <motion.svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <motion.path
        d="M3 11h3.75a2 2 0 0 1 1.6.8l.45.6a4 4 0 0 0 6.4 0l.45-.6a2 2 0 0 1 1.6-.8H21"
        variants={variants.pocket}
        initial="initial"
        animate={controls}
      />
      <motion.path d="M3 7h18" variants={variants.card} initial="initial" animate={controls} />
      <motion.rect x={3} y={3} width={18} height={18} rx={2} variants={variants.frame} initial="initial" animate={controls} />
    </motion.svg>
  );
}

function WalletCards(props: WalletCardsProps) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export { animations, WalletCards, WalletCards as WalletCardsIcon, type WalletCardsProps, type WalletCardsProps as WalletCardsIconProps };
