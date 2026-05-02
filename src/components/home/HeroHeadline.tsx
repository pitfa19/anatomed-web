import { motion } from 'motion/react';
import { useReducedMotion } from '../../lib/useReducedMotion';

interface Props {
  eyebrow: string;
  line1: string;
  /** Highlighted second line, gets gradient text. */
  line2: string;
  subhead: string;
}

export default function HeroHeadline({ eyebrow, line1, line2, subhead }: Props) {
  const reduced = useReducedMotion();

  const container = {
    hidden: {},
    show: {
      transition: { staggerChildren: reduced ? 0 : 0.08, delayChildren: 0.05 },
    },
  };
  const word = {
    hidden: { opacity: 0, y: 18 },
    show: {
      opacity: 1,
      y: 0,
      transition: { duration: reduced ? 0 : 0.6, ease: [0.22, 1, 0.36, 1] as const },
    },
  };

  const renderWords = (s: string) =>
    s.split(' ').map((w, i) => (
      <motion.span
        key={`${w}-${i}`}
        variants={word}
        className="inline-block whitespace-pre"
      >
        {w}
        {i < s.split(' ').length - 1 ? ' ' : ''}
      </motion.span>
    ));

  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={container}
      className="flex flex-col gap-5"
    >
      <motion.span
        variants={word}
        className="inline-flex w-fit items-center gap-2 rounded-full border border-border bg-surface/70 px-3 py-1 text-xs font-medium text-text-muted backdrop-blur"
      >
        <span className="size-1.5 rounded-full bg-accent shadow-[0_0_8px_var(--color-accent)]" />
        {eyebrow}
      </motion.span>

      <h1 className="text-4xl font-semibold tracking-tight text-text-strong sm:text-5xl lg:text-6xl xl:text-7xl">
        <span className="block leading-[1.05]">{renderWords(line1)}</span>
        <span className="block leading-[1.05] text-accent">
          {line2.split(' ').map((w, i, arr) => (
            <motion.span
              key={`${w}-${i}`}
              variants={word}
              className="inline-block whitespace-pre"
            >
              {w}
              {i < arr.length - 1 ? ' ' : ''}
            </motion.span>
          ))}
        </span>
      </h1>

      <motion.p
        variants={word}
        className="max-w-xl text-base leading-relaxed text-text-muted sm:text-lg"
      >
        {subhead}
      </motion.p>
    </motion.div>
  );
}
