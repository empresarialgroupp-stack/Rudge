'use client';

// Ícone no formato dos ícones do Animate UI (o conjunto de lá não traz o ListTodo).
import { motion, type Variants } from 'motion/react';

import { getVariants, useAnimateIconContext, IconWrapper, type IconProps } from '@animate-ui/react/icons';

type ListTodoProps = IconProps<keyof typeof animations>;

const line = (delay: number): Variants => ({
  initial: { pathLength: 1, opacity: 1 },
  animate: {
    pathLength: [0, 1],
    opacity: [0, 1],
    transition: { duration: 0.35, ease: 'easeInOut', delay },
  },
});

const animations = {
  default: {
    box: {
      initial: { scale: 1 },
      animate: { scale: [1, 0.82, 1], transition: { duration: 0.4, ease: 'easeInOut' } },
    },
    check: line(0.3),
    line1: line(0),
    line2: line(0.15),
    line3: line(0.3),
  } satisfies Record<string, Variants>,
} as const;

function IconComponent({ size, ...props }: ListTodoProps) {
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
      <motion.path d="M13 5h8" variants={variants.line1} initial="initial" animate={controls} />
      <motion.path d="M13 12h8" variants={variants.line2} initial="initial" animate={controls} />
      <motion.path d="M13 19h8" variants={variants.line3} initial="initial" animate={controls} />
      <motion.path d="m3 17 2 2 4-4" variants={variants.check} initial="initial" animate={controls} />
      <motion.rect x={3} y={4} width={6} height={6} rx={1} variants={variants.box} initial="initial" animate={controls} />
    </motion.svg>
  );
}

function ListTodo(props: ListTodoProps) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export { animations, ListTodo, ListTodo as ListTodoIcon, type ListTodoProps, type ListTodoProps as ListTodoIconProps };
