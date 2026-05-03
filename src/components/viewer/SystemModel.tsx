import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import { useGLTF } from '@react-three/drei';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { applyIsolation, clearIsolation, collectAnchors, findPartByName } from '../../lib/viewer/isolate';
import type { IsolationFrame, LandmarkAnchor, SystemId, SystemMeta } from '../../lib/viewer/types';

export interface SystemModelHandle {
  recenter: () => void;
}

interface Props {
  system: SystemMeta;
  activePartId: string | null;
  /** Same-system extras (parts from THIS system the user has ticked in the
   *  neighbors panel). They piggy-back on the active scene's visibility,
   *  joining the "stay visible" set alongside the isolated target. */
  sameSystemExtras?: ReadonlySet<string>;
  /** Per-part labels switch - connector `-line` meshes are visible only when
   *  their owning part's id is in this set. Without this, lines would dangle
   *  with no label endpoint. */
  labelsByPartId: ReadonlySet<string>;
  /** Sanitized names of "whole-bone" connector meshes that must always stay
   *  hidden (paired with the dropped whole-bone label). */
  wholeBoneLineNames: ReadonlySet<string>;
  onAnchors: (anchors: LandmarkAnchor[]) => void;
  onFit?: (info: FitInfo | null) => void;
  /** Forwarded from AnatomyScene - receives the topmost clicked Object3D so
   *  the parent can resolve which catalog Part was hit. */
  onObjectClick?: (obj: THREE.Object3D) => void;
}

export interface FitInfo {
  center: THREE.Vector3;
  /** Half-extent used for pan clamping (loose: ~2× max bbox dimension). */
  panRadius: number;
}

const SystemModel = forwardRef<SystemModelHandle, Props>(function SystemModel(
  { system, activePartId, sameSystemExtras, labelsByPartId, wholeBoneLineNames, onAnchors, onFit, onObjectClick },
  ref,
) {
  const { scene } = useGLTF(system.glb);
  const frameRef = useRef<IsolationFrame | null>(null);
  const { camera, size, controls } = useThree();

  // Guard: short-circuit the isolation effect when nothing meaningful has
  // changed. Without this, the effect's `fitOrthoToObject` call kept
  // resetting the camera target and orthographic zoom - which the user saw
  // as "pan returns to center" and "wheel zoom does nothing". Captures the
  // last (scene, activePartId, sameSystemExtras-key) we ran for.
  const lastIsolationKeyRef = useRef<string>('');
  // Counts the remaining frames during which `useFrame` should re-run
  // `fitOrthoToObject`. OrbitControls' `update()` runs every frame and, on
  // a fresh deep-link mount, can drift the camera before its internal
  // spherical state settles - leaving the user with a misframed (or even
  // empty) viewport until they click Centriraj. Running the fit inside
  // useFrame guarantees it executes AFTER OrbitControls each frame and
  // overrides that drift. After the counter decrements to 0 the post-fit
  // is a no-op so the user's interactive pan/zoom is left alone.
  const pendingPostFitFramesRef = useRef(0);

  useImperativeHandle(ref, () => ({
    recenter: () => {
      if (!activePartId) return;
      const target = findPartByName(scene, activePartId);
      if (!target) return;
      const fit = fitOrthoToObject(camera, controls, target, size);
      onFit?.(fit);
    },
  }), [activePartId, scene, camera, controls, size, onFit]);

  useEffect(() => {
    const extrasKey = sameSystemExtras
      ? Array.from(sameSystemExtras).sort().join(',')
      : '';
    // Include camera.uuid: in dev StrictMode (and any future r3f path that
    // remounts the OrthographicCamera) the default camera can be replaced
    // with a fresh instance whose position resets to the JSX-prop default.
    // Without this, the effect's key would match and the new camera would
    // never get fit to the active part - model invisible until manual recenter.
    const currentKey = `${scene.uuid}|${activePartId ?? ''}|${extrasKey}|${camera.uuid}`;
    if (currentKey === lastIsolationKeyRef.current) return;
    lastIsolationKeyRef.current = currentKey;

    if (frameRef.current) {
      clearIsolation(frameRef.current, scene);
      frameRef.current = null;
    }
    applySystemTint(scene, system.tint, system.id);
    if (activePartId) {
      const frame = applyIsolation(scene, activePartId);
      frameRef.current = frame;
      // Reveal same-system extras: re-enable visibility on each requested part
      // and walk its ancestors so visibility cascade lights it up.
      const extraObjects: THREE.Object3D[] = [];
      const extraAnchors = [];
      if (sameSystemExtras) {
        for (const id of sameSystemExtras) {
          if (id === activePartId) continue;
          const extra = findPartByName(scene, id);
          if (!extra) continue;
          extra.traverse((o) => {
            o.visible = true;
          });
          for (let p = extra.parent; p; p = p.parent) p.visible = true;
          extraObjects.push(extra);
          extraAnchors.push(...collectAnchors(extra, 'extra', id));
        }
      }
      onAnchors([...frame.anchors, ...extraAnchors]);
      const target = findPartByName(scene, activePartId);
      // Defense-in-depth: hide every connector inside target and each same-
      // system extra. The line-visibility effect below re-shows them when
      // labels are on. Without this, lines added by `extra.traverse` above
      // can flash visible until the next effect runs.
      const hideLinesIn = (root: THREE.Object3D) => {
        root.traverse((o) => {
          if (o.name.includes('-lin')) o.visible = false;
        });
      };
      if (target) hideLinesIn(target);
      for (const e of extraObjects) hideLinesIn(e);
      // Expand fit to include same-system extras so the user sees what they
      // ticked. Cross-system extras (in cloned scenes) aren't reachable here
      // - Centriraj button refits on just the target if needed.
      // Skip when size is 0×0 (transient race during deep-link mount); the
      // useFrame post-fit loop below will retry on each subsequent frame.
      const sizeValid = size.width > 0 && size.height > 0;
      const fit = target && sizeValid
        ? fitOrthoToObject(camera, controls, target, size, 1.25, extraObjects)
        : null;
      onFit?.(fit);
      // Schedule the post-fit override loop (see useFrame above). 6 frames
      // covers the OrbitControls settling window and any 1-2 frame layout
      // race where r3f's `size` arrives 0×0.
      pendingPostFitFramesRef.current = 6;
    } else {
      onAnchors([]);
      onFit?.(null);
    }
  }, [scene, activePartId, system.tint, sameSystemExtras, camera, size, controls, onAnchors, onFit]);


  // Post-fit override loop. Runs `fitOrthoToObject` AFTER OrbitControls'
  // own `update()` call each frame - for the first few frames following an
  // isolation change. Once `pendingPostFitFramesRef` decrements to 0, this
  // is a no-op and the user's interactive pan/zoom is left alone.
  useFrame(() => {
    if (pendingPostFitFramesRef.current <= 0) return;
    pendingPostFitFramesRef.current--;
    if (!activePartId) return;
    const target = findPartByName(scene, activePartId);
    if (!target) return;
    const extraObjects: THREE.Object3D[] = [];
    if (sameSystemExtras) {
      for (const id of sameSystemExtras) {
        if (id === activePartId) continue;
        const extra = findPartByName(scene, id);
        if (extra) extraObjects.push(extra);
      }
    }
    const fit = fitOrthoToObject(camera, controls, target, size, 1.25, extraObjects);
    if (fit) onFit?.(fit);
  });

  // Connector visibility tracked per-part. Match by name token only (covers
  // `Mesh`, `Line`, `LineSegments` - the FBX→glTF export can produce any of
  // these for the connector geometry). `-lin` matches `-line` plus any
  // similarly-prefixed variants.
  useEffect(() => {
    if (!activePartId) return;
    const setLines = (root: THREE.Object3D, visible: boolean) => {
      root.traverse((o) => {
        if (!o.name.includes('-lin')) return;
        // Whole-bone connector - never render, regardless of labels switch.
        if (wholeBoneLineNames.has(o.name)) {
          o.visible = false;
          return;
        }
        o.visible = visible;
      });
    };
    const target = findPartByName(scene, activePartId);
    if (target) setLines(target, labelsByPartId.has(activePartId));
    if (sameSystemExtras) {
      for (const id of sameSystemExtras) {
        if (id === activePartId) continue;
        const extra = findPartByName(scene, id);
        if (extra) setLines(extra, labelsByPartId.has(id));
      }
    }
  }, [scene, activePartId, sameSystemExtras, labelsByPartId, wholeBoneLineNames]);

  const handleClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      if (!onObjectClick) return;
      e.stopPropagation();
      onObjectClick(e.object);
    },
    [onObjectClick],
  );

  return <primitive object={scene} onClick={handleClick} />;
});

export default SystemModel;

// Single shared material for every label connector. Subtle: translucent mid-
// grey so lines never compete with the bone surface.
const LINE_MAT = new THREE.MeshBasicMaterial({
  color: 0x6b6b6b,
  transparent: true,
  opacity: 0.25,
  depthWrite: false,
});

function fitOrthoToObject(
  camera: THREE.Camera,
  controls: unknown,
  target: THREE.Object3D,
  viewport: { width: number; height: number },
  margin = 1.25,
  alsoInclude: THREE.Object3D[] = [],
): FitInfo | null {
  if (!(camera as THREE.OrthographicCamera).isOrthographicCamera) return null;
  const ortho = camera as THREE.OrthographicCamera;

  // Ensure world matrices are current. On the very first isolation effect
  // after a deep-link mount, three.js may not have rendered a frame yet, so
  // every node's matrixWorld is identity - the bbox would land at the
  // origin and the fit would aim the camera at the wrong point. After the
  // first frame this is a no-op.
  target.updateMatrixWorld(true);
  for (const extra of alsoInclude) extra.updateMatrixWorld(true);

  const box = new THREE.Box3();
  const tmp = new THREE.Box3();
  const ingest = (root: THREE.Object3D) => {
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      if (!o.visible) return;
      if (o.name.includes('-line')) return;
      if (m.geometry.boundingBox === null) m.geometry.computeBoundingBox();
      tmp.copy(m.geometry.boundingBox!).applyMatrix4(o.matrixWorld);
      box.union(tmp);
    });
  };
  ingest(target);
  for (const extra of alsoInclude) ingest(extra);
  if (box.isEmpty()) return null;

  const center = box.getCenter(new THREE.Vector3());
  const sizeV = box.getSize(new THREE.Vector3());

  // Same matrix-staleness issue as the bbox above: on the very first effect
  // after a deep-link mount, the camera's matrixWorld may still be identity,
  // so `getWorldDirection` returns the default −z and the position calc
  // ignores wherever the JSX `position` prop tried to put the camera.
  ortho.updateMatrixWorld(true);
  const dir = new THREE.Vector3();
  ortho.getWorldDirection(dir);
  ortho.position.copy(center).addScaledVector(dir, -Math.max(sizeV.length() * 2, 5));
  ortho.lookAt(center);
  ortho.updateMatrixWorld(true);

  const aspect = viewport.width / viewport.height;
  const fitWidth = Math.max(sizeV.x, sizeV.y * aspect) * margin;
  const fitHeight = fitWidth / aspect;
  ortho.left = -fitWidth / 2;
  ortho.right = fitWidth / 2;
  ortho.top = fitHeight / 2;
  ortho.bottom = -fitHeight / 2;
  ortho.zoom = 1;
  ortho.updateProjectionMatrix();

  const c = controls as { target?: THREE.Vector3; update?: () => void } | null;
  if (c?.target) {
    c.target.copy(center);
    c.update?.();
  }

  return {
    center: center.clone(),
    // Pan radius = half the smaller frustum dimension, so at zoom=1 the part
    // center can drift to the visible edge but the part body never leaves
    // the viewport completely. PanClamp scales this by 1/zoom so the
    // guarantee holds at every zoom level. Floored for very small parts.
    panRadius: Math.max(Math.min(fitWidth, fitHeight) / 2, 0.5),
  };
}

function applySystemTint(root: THREE.Object3D, tint: string, systemId: SystemId) {
  const color = new THREE.Color(tint);
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    if (m.userData.__tinted) return;
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
    m.userData.__tinted = true;
  });
}

/** Non-uniform local scale so a thin object renders as a stroke. Keeps the
 *  longest geometry-bbox axis at 1, shrinks the other two by `factor`.
 *  Idempotent - applied once per mesh. */
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

/** Per-system thinning thresholds. Thin systems (nerves / vessels / insertions)
 *  often export as fat cylindrical bars or flat plates instead of the wires /
 *  sheets they represent - be aggressive. Solid systems (skeleton / muscles /
 *  organs / joints / regions) stay conservative so long bones aren't
 *  affected. */
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

/** Collapse cylindrical/plate placeholder meshes to a uniform thin stroke.
 *  Triggers when the longest axis is much larger than the median (wire-like)
 *  OR the median is much larger than the min (plate-like). Both non-longest
 *  axes end up the same world-space size so plates and cylinders alike
 *  render as a single line. */
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
  // Aim for ~1% of length, clamped so very long parts don't blow up.
  const target = Math.min(Math.max(max * 0.01, 0.03), 0.3);
  m.scale.set(
    sx === max ? 1 : target / Math.max(sx, 1e-6),
    sy === max ? 1 : target / Math.max(sy, 1e-6),
    sz === max ? 1 : target / Math.max(sz, 1e-6),
  );
}
