import { useCallback, useEffect, useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import { type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { collectAnchors } from '../../lib/viewer/isolate';
import { buildSceneIndex } from '../../lib/viewer/sceneIndex';
import { getSystemMaterials } from '../../lib/viewer/materials';
import { thinAxisAligned, thinIfElongated } from '../../lib/viewer/thin';
import type { LandmarkAnchor, SystemId, SystemMeta } from '../../lib/viewer/types';

interface Props {
  system: SystemMeta;
  /** All catalog part ids belonging to this system (for the scene index). */
  systemPartIds: string[];
  /** Part ids of THIS system that should be visible (active + any extras). */
  visibleParts: ReadonlySet<string>;
  /** The active part id, iff it lives in this system; else null. */
  activePartId: string | null;
  /** Parts whose landmark labels + connector lines should render. */
  labelsByPartId: ReadonlySet<string>;
  onAnchors: (anchors: LandmarkAnchor[]) => void;
  onObjectClick?: (obj: THREE.Object3D) => void;
  onObjectHover?: (obj: THREE.Object3D | null, ev: PointerEvent | null, point: THREE.Vector3 | null) => void;
  /** Registers/unregisters this system's live scene root for camera fitting. */
  registerRoot: (systemId: SystemId, root: THREE.Object3D | null) => void;
}

/** Renders ONE system's GLB exactly once (the shared `useGLTF` instance — no
 *  clone) and drives every visible part by toggling mesh `.visible` via a
 *  prebuilt scene index. This replaces the old SystemModel (active system) +
 *  ExtraPart (per cross-system clone) pair. Safe to mutate the shared instance
 *  because every other route (home/quiz/agent) clones before rendering, and
 *  each system is rendered by at most one SystemLayer. */
export default function SystemLayer({
  system,
  systemPartIds,
  visibleParts,
  activePartId,
  labelsByPartId,
  onAnchors,
  onObjectClick,
  onObjectHover,
  registerRoot,
}: Props) {
  const { scene } = useGLTF(system.glb);
  const index = useMemo(() => buildSceneIndex(scene, systemPartIds), [scene, systemPartIds]);

  // Assign shared materials + thin placeholder geometry ONCE per cached scene.
  useEffect(() => {
    const flag = scene.userData as { __tinted?: string };
    if (flag.__tinted === system.tint) return;
    const mats = getSystemMaterials(system.id, system.tint);
    for (const m of index.allLeaves) {
      m.material = mats.solid;
      m.userData.baseMaterial = mats.solid;
      if (!m.userData.__thinned) {
        thinIfElongated(m, system.id);
        m.userData.__thinned = true;
      }
    }
    for (const m of index.allLines) {
      m.material = mats.line;
      m.userData.baseMaterial = mats.line;
      if (!m.userData.__thinned) {
        thinAxisAligned(m, 0.35);
        m.userData.__thinned = true;
      }
    }
    flag.__tinted = system.tint;
  }, [scene, index, system.id, system.tint]);

  // Register the scene root so CameraRig can include it in the union-box fit.
  useEffect(() => {
    registerRoot(system.id, scene);
    return () => registerRoot(system.id, null);
  }, [registerRoot, system.id, scene]);

  const visibleKey = useMemo(
    () => Array.from(visibleParts).sort().join(','),
    [visibleParts],
  );
  const labelsKey = useMemo(
    () => Array.from(labelsByPartId).sort().join(','),
    [labelsByPartId],
  );

  // Drive visibility: hide everything (incl. all `-line` connectors — no longer
  // rendered), then show each visible part + its ancestor chain. Emit landmark
  // anchors for the ACTIVE part always (so the hover region-highlight works
  // even with labels off) plus any part whose labels are on (for chips).
  useEffect(() => {
    for (const m of index.allLeaves) m.visible = false;
    for (const m of index.allLines) m.visible = false;

    const anchors: LandmarkAnchor[] = [];
    for (const id of visibleParts) {
      const key = sanitize(id);
      const meshes = index.partMeshes.get(key);
      if (!meshes) continue;
      for (const m of meshes) m.visible = true;
      for (const anc of index.partAncestors.get(key) ?? []) anc.visible = true;

      const isActive = id === activePartId;
      if (isActive || labelsByPartId.has(id)) {
        const node = index.partNode.get(key);
        if (node) anchors.push(...collectAnchors(node, isActive ? 'active' : 'extra', id));
      }
    }
    onAnchors(anchors);
  }, [
    index,
    visibleKey,
    labelsKey,
    activePartId,
    onAnchors,
    visibleParts,
    labelsByPartId,
  ]);

  const handleClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      if (!onObjectClick) return;
      e.stopPropagation();
      onObjectClick(e.object);
    },
    [onObjectClick],
  );

  const handleMove = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      if (!onObjectHover) return;
      e.stopPropagation();
      onObjectHover(e.object, e.nativeEvent, e.point);
    },
    [onObjectHover],
  );

  const handleOut = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      if (!onObjectHover) return;
      e.stopPropagation();
      onObjectHover(null, null, null);
    },
    [onObjectHover],
  );

  return (
    <primitive
      object={scene}
      onClick={handleClick}
      onPointerMove={handleMove}
      onPointerOut={handleOut}
    />
  );
}

function sanitize(id: string): string {
  return THREE.PropertyBinding.sanitizeNodeName(id);
}
