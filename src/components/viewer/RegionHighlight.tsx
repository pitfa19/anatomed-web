import { useMemo } from 'react';
import * as THREE from 'three';

/** App accent (`--color-accent` in index.css). */
const ACCENT = '#2f6df6';

/** Flat solid-color disc texture — one even fill with a thin anti-aliased edge
 *  (not a gradient), built once. */
const DISC_TEXTURE = (() => {
  const size = 128;
  const r = size / 2;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  // Solid fill across the whole disc; only the outermost ~6% fades, purely to
  // smooth the edge so it doesn't alias when scaled up.
  const g = ctx.createRadialGradient(r, r, 0, r, r, r);
  g.addColorStop(0, ACCENT);
  g.addColorStop(0.94, ACCENT);
  g.addColorStop(1, 'rgba(47,109,246,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();

/** A camera-facing flat disc snapped to a landmark's bone-surface point — reads
 *  as "this spot of the bone is selected". `depthTest: false` so the marked
 *  spot always shows through. */
export default function RegionHighlight({
  position,
  size = 0.05,
}: {
  position: THREE.Vector3;
  size?: number;
}) {
  const material = useMemo(
    () =>
      new THREE.SpriteMaterial({
        map: DISC_TEXTURE,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        depthTest: false,
      }),
    [],
  );
  return <sprite position={position} scale={[size, size, size]} material={material} />;
}
