import { useEffect, useState, type RefObject } from 'react';

/**
 * Returns a normalized 0..1 value that ramps as the referenced element
 * scrolls upward through the viewport. 0 = element top is at (or below)
 * viewport top; 1 = element has scrolled up by `triggerHeight` (default =
 * window.innerHeight).
 *
 * Scrolls inside any ancestor — uses a capture-phase scroll listener on
 * `document`, so it works whether the page itself scrolls or some inner
 * container does (e.g. `<main className="overflow-y-auto">` on the home
 * route).
 *
 * Updates throttled by requestAnimationFrame. SSR-safe.
 */
export function useScrollProgress(
  ref: RefObject<HTMLElement | null>,
  triggerHeight?: number,
): number {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let raf = 0;
    let mounted = true;

    const compute = () => {
      raf = 0;
      if (!mounted) return;
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const denom = Math.max(1, triggerHeight ?? window.innerHeight);
      // rect.top decreases (becomes negative) as the element scrolls upward.
      const p = Math.min(1, Math.max(0, -rect.top / denom));
      setProgress((prev) => (Math.abs(prev - p) > 0.001 ? p : prev));
    };

    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(compute);
    };

    compute();
    // capture: true catches scroll events from any nested scroll container.
    document.addEventListener('scroll', onScroll, { capture: true, passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => {
      mounted = false;
      if (raf) cancelAnimationFrame(raf);
      document.removeEventListener('scroll', onScroll, { capture: true });
      window.removeEventListener('resize', onScroll);
    };
  }, [ref, triggerHeight]);

  return progress;
}
