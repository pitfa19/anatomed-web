import { useEffect, useRef } from 'react';

/**
 * Cursor-following radial gradient spotlight. Place inside a `relative`
 * container; tracks mousemove on that container.
 *
 * Hidden via CSS on touch devices and when reduced-motion is requested.
 */
export default function CursorSpotlight() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const parent = el.parentElement;
    if (!parent) return;

    const onMove = (e: MouseEvent) => {
      const rect = parent.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      el.style.setProperty('--mx', `${x}%`);
      el.style.setProperty('--my', `${y}%`);
    };
    parent.addEventListener('mousemove', onMove);
    return () => parent.removeEventListener('mousemove', onMove);
  }, []);

  return <div ref={ref} className="cursor-spotlight" aria-hidden />;
}
