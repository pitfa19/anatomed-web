import * as THREE from 'three';

/** Camera-angle opacity for a leader line, adapted from Z-Anatomy's Unity
 *  `Line.cs`. A leader is most legible when the camera looks *across* it and
 *  becomes an ambiguous dot when viewed end-on (its direction parallel to the
 *  view direction). We fade toward `min` as the line goes edge-on so the scene
 *  stays uncluttered, but never below `min` so a line is always at least
 *  faintly visible (the user's complaint was that lines were invisible).
 *
 *  `lineDir` and `viewDir` need not be normalized.
 *  Returns an opacity in [min, max]. */
export function angleLineOpacity(
  lineDir: THREE.Vector3,
  viewDir: THREE.Vector3,
  min = 0.35,
  max = 0.9,
): number {
  const a = lineDir.lengthSq();
  const b = viewDir.lengthSq();
  if (a < 1e-12 || b < 1e-12) return max;
  // |cos| of the angle between the line and the view direction. 1 = end-on
  // (worst), 0 = perpendicular (best).
  const cos = Math.abs(lineDir.dot(viewDir)) / Math.sqrt(a * b);
  // Quartic falloff biased so only near-end-on lines dim noticeably.
  const crossFactor = 1 - cos * cos * cos * cos; // 1 perpendicular → 0 end-on
  return min + (max - min) * crossFactor;
}
