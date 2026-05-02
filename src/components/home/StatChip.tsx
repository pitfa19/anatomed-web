import { useEffect, useRef, useState } from 'react';
import { motion, useInView, useMotionValue, animate } from 'motion/react';
import { useReducedMotion } from '../../lib/useReducedMotion';

interface Props {
  label: string;
  value: number;
  suffix?: string;
  /** ms */
  durationMs?: number;
  loading?: boolean;
}

export default function StatChip({
  label,
  value,
  suffix = '',
  durationMs = 1200,
  loading,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-10%' });
  const reduced = useReducedMotion();
  const mv = useMotionValue(0);
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (!inView || loading) return;
    if (reduced) {
      setDisplay(value);
      return;
    }
    const controls = animate(mv, value, {
      duration: durationMs / 1000,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => setDisplay(Math.round(v)),
    });
    return () => controls.stop();
  }, [inView, value, durationMs, reduced, loading, mv]);

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 8 }}
      animate={inView ? { opacity: 1, y: 0 } : { opacity: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className="flex flex-col rounded-xl border border-border bg-surface/80 px-3.5 py-2.5 backdrop-blur"
    >
      <span className="text-lg font-semibold tabular-nums text-text-strong sm:text-xl">
        {loading ? '–' : display.toLocaleString('hr-HR')}
        {!loading && suffix}
      </span>
      <span className="text-[11px] uppercase tracking-wider text-text-muted">{label}</span>
    </motion.div>
  );
}
