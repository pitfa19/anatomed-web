import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import { useReducedMotion } from '../../lib/useReducedMotion';

interface Props {
  children: ReactNode;
  delay?: number;
  className?: string;
}

export default function SectionReveal({ children, delay = 0, className }: Props) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 24 }}
      whileInView={reduced ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-15%' }}
      transition={{
        duration: reduced ? 0 : 0.7,
        delay: reduced ? 0 : delay,
        ease: [0.22, 1, 0.36, 1] as const,
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
