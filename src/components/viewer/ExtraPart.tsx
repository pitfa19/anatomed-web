import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useGLTF } from '@react-three/drei';
import { type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import {
  applyIsolation,
  clearIsolation,
  collectAnchors,
  findPartByName,
  sanitizeNodeName,
} from '../../lib/viewer/isolate';
import type { IsolationFrame, LandmarkAnchor, SystemId, SystemMeta } from '../../lib/viewer/types';

interface Props {
  partId: string;
  system: SystemMeta;
  /** When false, hide the part's connector `-line` meshes so they don't dangle
   *  without label endpoints. */
  labelsOn: boolean;
  /** Sanitized names of "whole-bone" connector meshes that must always stay
   *  hidden. */
  wholeBoneLineNames: ReadonlySet<string>;
  onAnchors?: (anchors: LandmarkAnchor[]) => void;
  /** Forwarded from AnatomyScene - receives the topmost clicked Object3D. */
  onObjectClick?: (obj: THREE.Object3D) => void;
}

/** Renders a single part from a *non-active* system at its original world
 *  position. The full system .glb is fetched (drei caches it) and cloned so
 *  this scene is independent from the cached one - needed because two
 *  `<primitive>` components can't share the same Object3D.
 *
 *  Tinting and visibility are applied in a `useEffect` so subsequent ExtraPart
 *  mounts of the same system don't fight each other (they each get their own
 *  clone). */
export default function ExtraPart({ partId, system, labelsOn, wholeBoneLineNames, onAnchors, onObjectClick }: Props) {
  const { scene: source } = useGLTF(system.glb);
  const cloned = useMemo(() => source.clone(true), [source]);
  const frameRef = useRef<IsolationFrame | null>(null);

  useEffect(() => {
    applyTint(cloned, system.tint, system.id);
    if (frameRef.current) {
      clearIsolation(frameRef.current, cloned);
      frameRef.current = null;
    }
    const frame = applyIsolation(cloned, partId);
    frameRef.current = frame;
    // Emit this extra's landmark anchors so AnatomyScene can render labels at
    // the connector-line endpoints (without them, only naked lines render).
    const target = findPartByName(cloned, partId);
    onAnchors?.(target ? collectAnchors(target, 'extra', partId) : []);
    // Defense-in-depth: hide every connector inside target. The line-
    // visibility effect below re-shows them when `labelsOn` is true.
    if (target) {
      target.traverse((o) => {
        if (o.name.includes('-lin')) o.visible = false;
      });
    }
  }, [cloned, partId, system.tint, onAnchors]);

  useEffect(
    () => () => {
      // On unmount (untick), retract any anchors we contributed.
      onAnchors?.([]);
    },
    [onAnchors],
  );

  // Connector visibility tracks the labels switch. Match by name only
  // (Mesh / Line / LineSegments - any export shape). Whole-bone connectors
  // stay hidden regardless of the switch.
  useEffect(() => {
    const target = findPartByName(cloned, partId);
    if (!target) return;
    target.traverse((o) => {
      if (!o.name.includes('-lin')) return;
      if (wholeBoneLineNames.has(o.name)) {
        o.visible = false;
        return;
      }
      o.visible = labelsOn;
    });
  }, [cloned, partId, labelsOn, wholeBoneLineNames]);

  // Only render if the target was found in this system's scene.
  const has = useMemo(
    () => cloned.getObjectByName(sanitizeNodeName(partId)) !== undefined,
    [cloned, partId],
  );

  const handleClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      if (!onObjectClick) return;
      e.stopPropagation();
      onObjectClick(e.object);
    },
    [onObjectClick],
  );

  if (!has) return null;

  return <primitive object={cloned} onClick={handleClick} />;
}

// Shared subtle material for every label connector across all ExtraParts -
// translucent mid-grey, unlit, no depth write so lines layer cleanly.
const LINE_MAT = new THREE.MeshBasicMaterial({
  color: 0x6b6b6b,
  transparent: true,
  opacity: 0.25,
  depthWrite: false,
});

function applyTint(root: THREE.Object3D, tint: string, systemId: SystemId) {
  const color = new THREE.Color(tint);
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    if (m.userData.__extraTinted) return;
    if (o.name.includes('-line')) {
      m.material = LINE_MAT;
      thinAxisAligned(m, 0.2);
    } else {
      m.material = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.55,
        metalness: 0.05,
      });
      thinIfElongated(m, systemId);
    }
    m.userData.__extraTinted = true;
  });
}

/** Keep the longest geometry-bbox axis at 1, shrink the other two by
 *  `factor`. Idempotent per mesh. */
function thinAxisAligned(m: THREE.Mesh, factor: number) {
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

/** Per-system thresholds - see SystemModel for rationale. Aggressive on
 *  thin systems (nerves / vessels / insertions), conservative elsewhere. */
const THIN_THRESHOLDS: Record<SystemId, { maxOverMed: number; medOverMin: number }> = {
  nerves:     { maxOverMed: 4,  medOverMin: 3 },
  vessels:    { maxOverMed: 4,  medOverMin: 3 },
  insertions: { maxOverMed: 4,  medOverMin: 3 },
  skeleton:   { maxOverMed: 14, medOverMin: 6 },
  muscles:    { maxOverMed: 14, medOverMin: 6 },
  organs:     { maxOverMed: 14, medOverMin: 6 },
  joints:     { maxOverMed: 14, medOverMin: 6 },
  regions:    { maxOverMed: 14, medOverMin: 6 },
};

/** Wire-like (long cylinder) or plate-like (flat sheet) meshes collapse to a
 *  uniform thin stroke. Same logic as SystemModel so cross-system extras
 *  render consistently. */
function thinIfElongated(m: THREE.Mesh, systemId: SystemId) {
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
  const target = Math.min(Math.max(max * 0.01, 0.03), 0.3);
  m.scale.set(
    sx === max ? 1 : target / Math.max(sx, 1e-6),
    sy === max ? 1 : target / Math.max(sy, 1e-6),
    sz === max ? 1 : target / Math.max(sz, 1e-6),
  );
}
