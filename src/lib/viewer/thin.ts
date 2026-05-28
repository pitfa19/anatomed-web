import * as THREE from 'three';
import type { SystemId } from './types';

/** Geometry-thinning helpers shared by every 3D viewer surface (the main
 *  `/viewer`, the agent inline canvas, the quiz preview). Some FBX-sourced
 *  parts export as fat cylindrical bars or flat plates instead of the thin
 *  wires / sheets they represent; these collapse them to a uniform stroke.
 *
 *  All operations mutate `mesh.scale` and are idempotent per mesh (guarded by
 *  `mesh.userData.__thinned`). */

/** Keep the longest geometry-bbox axis at scale 1, shrink the other two by
 *  `factor`. Used on `-line` connector meshes so they render as thin strokes. */
export function thinAxisAligned(m: THREE.Mesh, factor: number): void {
  if (m.geometry.boundingBox === null) m.geometry.computeBoundingBox();
  const b = m.geometry.boundingBox;
  if (!b) return;
  const sx = b.max.x - b.min.x;
  const sy = b.max.y - b.min.y;
  const sz = b.max.z - b.min.z;
  const longest = sx >= sy && sx >= sz ? 'x' : sy >= sz ? 'y' : 'z';
  m.scale.set(
    longest === 'x' ? 1 : factor,
    longest === 'y' ? 1 : factor,
    longest === 'z' ? 1 : factor,
  );
}

/** Per-system thresholds. Aggressive on thin placeholder systems
 *  (`insertions`), conservative elsewhere so long bones aren't squashed.
 *  `nerves`/`vessels` are excluded entirely (real thin curve-tubes — see the
 *  early-return in `thinIfElongated`) but kept here for table symmetry. */
export const THIN_THRESHOLDS: Record<SystemId, { maxOverMed: number; medOverMin: number }> = {
  nerves:     { maxOverMed: 4,  medOverMin: 3 },
  vessels:    { maxOverMed: 4,  medOverMin: 3 },
  insertions: { maxOverMed: 4,  medOverMin: 3 },
  skeleton:   { maxOverMed: 14, medOverMin: 6 },
  muscles:    { maxOverMed: 14, medOverMin: 6 },
  organs:     { maxOverMed: 14, medOverMin: 6 },
  joints:     { maxOverMed: 14, medOverMin: 6 },
  regions:    { maxOverMed: 14, medOverMin: 6 },
};

/** Collapse wire-like (long cylinder) or plate-like (flat sheet) placeholder
 *  meshes to a uniform thin stroke. Both non-longest axes end up the same
 *  world-space size so plates and cylinders alike render as a single line. */
export function thinIfElongated(m: THREE.Mesh, systemId: SystemId): void {
  // nerves/vessels now ship as real thin curve-tubes (re-exported from the
  // Z-Anatomy Startup.blend); collapsing them would re-fatten genuine geometry
  // to the 0.03 m floor below.
  if (systemId === 'nerves' || systemId === 'vessels') return;
  if (m.geometry.boundingBox === null) m.geometry.computeBoundingBox();
  const b = m.geometry.boundingBox;
  if (!b) return;
  const sx = b.max.x - b.min.x;
  const sy = b.max.y - b.min.y;
  const sz = b.max.z - b.min.z;
  const sorted = [sx, sy, sz].sort((a, c) => c - a);
  const max = sorted[0];
  const med = sorted[1];
  const min = sorted[2];
  if (med === 0 || min === 0) return;
  const t = THIN_THRESHOLDS[systemId];
  const wireLike = max / med > t.maxOverMed;
  const plateLike = med / min > t.medOverMin;
  if (!wireLike && !plateLike) return;
  // Aim for ~1% of length, clamped so very long parts don't blow up.
  const target = Math.min(Math.max(max * 0.01, 0.03), 0.3);
  m.scale.set(
    sx === max ? 1 : target / Math.max(sx, 1e-6),
    sy === max ? 1 : target / Math.max(sy, 1e-6),
    sz === max ? 1 : target / Math.max(sz, 1e-6),
  );
}
