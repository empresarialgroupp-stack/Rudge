'use client';

// Ícone no formato dos ícones do Animate UI (o conjunto de lá não traz o Target).
import { motion, type Variants } from 'motion/react';

import { getVariants, useAnimateIconContext, IconWrapper, type IconProps } from '@animate-ui/react/icons';

type TargetProps = IconProps<keyof typeof animations>;

const ring = (delay: number, peak: number): Variants => ({
  initial: { scale: 1 },
  animate: {
    scale: [1, peak, 1],
    transition: { duration: 0.5, ease: 'easeInOut', delay },
  },
});

// Os anéis pulsam de dentro para fora, como um alvo sendo acertado.
const animations = {
  default: {
    center: ring(0, 1.5),
    middle: ring(0.12, 1.12),
    outer: ring(0.24, 1.06),
  } satisfies Record<string, Variants>,
} as const;

function IconComponent({ size, ...props }: TargetProps) {
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
      <motion.circle cx={12} cy={12} r={10} variants={variants.outer} initial="initial" animate={controls} />
      <motion.circle cx={12} cy={12} r={6} variants={variants.middle} initial="initial" animate={controls} />
      <motion.circle cx={12} cy={12} r={2} variants={variants.center} initial="initial" animate={controls} />
    </motion.svg>
  );
}

function Target(props: TargetProps) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export { animations, Target, Target as TargetIcon, type TargetProps, type TargetProps as TargetIconProps };
