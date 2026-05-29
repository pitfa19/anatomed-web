import { Suspense, useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { OrbitControls, OrthographicCamera, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { applyMultiIsolation, sanitizeNodeName } from '../../lib/viewer/isolate';
import type { Part, PartsCatalog, SystemMeta } from '../../lib/viewer/types';

/** Scene used inside QuizGame. Loads the chosen system's GLB and isolates just
 *  the current question's group (e.g. the carpus), fitting the camera to it.
 *  The player sees only that group and is judged on which member they click -
 *  isolating to a handful of sibling bones is what makes finding a single
 *  element tractable (you can't reliably hit one bone on the whole skeleton). */
interface Props {
  system: SystemMeta;
  catalog: PartsCatalog;
  /** Catalog ids of the group to show; everything else is hidden. Changing
   *  this set re-isolates and re-fits the camera. */
  groupMemberIds: string[];
  /** Catalog ids to highlight as the correct answer after a click (both sides
   *  for paired bones, so clicking either lights up). Empty = no highlight. */
  highlightPartIds: readonly string[];
  onPartClick: (part: Part) => void;
}

export default function QuizScene({
  system,
  catalog,
  groupMemberIds,
  highlightPartIds,
  onPartClick,
}: Props) {
  return (
    <Canvas dpr={[1, 2]} gl={{ antialias: true, alpha: true }}>
      <ambientLight intensity={0.7} />
      <directionalLight position={[5, 10, 5]} intensity={0.85} />
      <directionalLight position={[-5, -3, -5]} intensity={0.3} />

      <OrthographicCamera makeDefault position={[0, 1.2, 7]} near={0.01} far={1000} />
      <OrbitControls
        makeDefault
        enableDamping
        enableRotate
        enablePan
        enableZoom
        screenSpacePanning
        minZoom={0.3}
        maxZoom={8}
      />

      <Suspense fallback={null}>
        <IsolatedGroup
          system={system}
          catalog={catalog}
          groupMemberIds={groupMemberIds}
          highlightPartIds={highlightPartIds}
          onPartClick={onPartClick}
        />
      </Suspense>
    </Canvas>
  );
}

function IsolatedGroup({
  system,
  catalog,
  groupMemberIds,
  highlightPartIds,
  onPartClick,
}: Props) {
  const { scene: source } = useGLTF(system.glb);
  // Clone so the per-question visibility flips never mutate the shared cached
  // scene (every other GLB consumer clones too - see CLAUDE.md viewer notes).
  const cloned = useMemo(() => source.clone(true), [source]);
  const { camera, controls, size } = useThree();

  const partsByName = useMemo(() => {
    const m = new Map<string, Part>();
    for (const p of catalog.parts) {
      if (p.system === system.id) m.set(sanitizeNodeName(p.id), p);
    }
    return m;
  }, [catalog, system.id]);

  // Only parts in the isolated group are valid click targets.
  const memberIdSet = useMemo(() => new Set(groupMemberIds), [groupMemberIds]);

  // Tint once. Clone shares materials with the source by default, so we assign
  // fresh materials (clone-local) guarded by a userData flag.
  useEffect(() => {
    applySystemTint(cloned, system.tint);
  }, [cloned, system.tint]);

  // Re-isolate whenever the group changes: show everything, then hide all but
  // the region's subtrees + their `-line`/labels connectors.
  const groupKey = useMemo(() => [...groupMemberIds].sort().join('|'), [groupMemberIds]);
  useEffect(() => {
    cloned.traverse((o) => {
      o.visible = true;
    });
    applyMultiIsolation(cloned, groupMemberIds);
    cloned.traverse((o) => {
      if (o.name.includes('-lin') || o.name.toLowerCase().includes('labels')) {
        o.visible = false;
      }
    });
  }, [cloned, groupKey, groupMemberIds]);

  // Camera fit. Keep RE-trying every frame until several *successful* fits land
  // (non-empty bbox + a measured canvas), then release to user control. The old
  // fixed frame counter raced the GLB load / first layout and could drain
  // before anything was fittable, leaving a blank canvas ("structure doesn't
  // load"). We re-arm the fit on:
  //   - group change (a new structure to frame),
  //   - camera identity change (drei swaps the default ortho camera on mount),
  //   - viewport resize (the ortho frustum is aspect-dependent; without this,
  //     resizing the window pushed the structure off-screen and it vanished).
  const fitRef = useRef({ pending: true, good: 0 });
  useEffect(() => {
    fitRef.current = { pending: true, good: 0 };
  }, [groupKey, cloned, camera, size.width, size.height]);

  // useFrame runs after OrbitControls, so a successful fit overrides drift.
  useFrame(() => {
    const st = fitRef.current;
    if (!st.pending) return;
    if (size.width === 0 || size.height === 0) return;
    if (!fitOrthoToVisible(camera, controls, cloned, size)) return; // not ready
    st.good += 1;
    if (st.good >= 8) st.pending = false;
  });

  // Highlight overlay: swap each answer part's subtree material with an
  // emissive accent so the user sees the correct answer. Highlights every id
  // (both sides of a paired bone, e.g. the skull's parietals); ids whose node
  // is hidden (e.g. the unshown left side of a hand) simply have no effect.
  // Restored on change.
  const highlightedRef = useRef<{ mesh: THREE.Mesh; mat: THREE.Material | THREE.Material[] }[]>([]);
  const highlightKey = useMemo(() => [...highlightPartIds].sort().join('|'), [highlightPartIds]);
  useEffect(() => {
    for (const { mesh, mat } of highlightedRef.current) {
      mesh.material = mat;
    }
    highlightedRef.current = [];
    if (highlightPartIds.length === 0) return;
    const accent = new THREE.MeshStandardMaterial({
      color: 0x10b981,
      emissive: 0x10b981,
      emissiveIntensity: 0.6,
      roughness: 0.4,
      metalness: 0.0,
    });
    for (const id of highlightPartIds) {
      const target = findByName(cloned, sanitizeNodeName(id));
      if (!target) continue;
      target.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        if (o.name.includes('-lin')) return;
        highlightedRef.current.push({ mesh: m, mat: m.material });
        m.material = accent;
      });
    }
    // highlightKey is the stable signal; the array identity is intentionally ignored.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloned, highlightKey]);

  // Clickability: walk EVERY intersection under the cursor (sorted near→far)
  // and pick the first that resolves to a part IN THE ISOLATED GROUP. Two
  // problems this solves:
  //  - The three.js raycaster ignores `.visible`, so a hidden occluder (e.g.
  //    the sternum in front of the spine) is still hit. We skip non-members
  //    and fall through to the visible group bone behind them.
  //  - The old handler inspected only the topmost hit and stopped propagation,
  //    so a click that landed on an occluder or an unresolvable sliver was
  //    lost ("I click but can't select it").
  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    for (const hit of e.intersections) {
      let cur: THREE.Object3D | null = hit.object;
      while (cur) {
        const part = partsByName.get(cur.name);
        if (part) {
          if (memberIdSet.has(part.id)) {
            onPartClick(part);
            return;
          }
          break; // resolved to a non-member (hidden occluder) - try next hit
        }
        cur = cur.parent;
      }
    }
  };

  return <primitive object={cloned} onClick={handleClick} />;
}

function findByName(root: THREE.Object3D, name: string): THREE.Object3D | null {
  let found: THREE.Object3D | null = null;
  root.traverse((o) => {
    if (!found && o.name === name) found = o;
  });
  return found;
}

function applySystemTint(root: THREE.Object3D, tint: string) {
  const color = new THREE.Color(tint);
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    if (m.userData.__quizTinted) return;
    if (o.name.includes('-line') || o.name.includes('-lin')) return;
    m.material = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.55,
      metalness: 0.05,
    });
    m.userData.__quizTinted = true;
  });
}

/** Frame all visible (non-connector) meshes. Returns false if the camera
 *  isn't an ortho camera or nothing fittable is visible yet (so the caller can
 *  retry on a later frame once the GLB/layout is ready). */
function fitOrthoToVisible(
  camera: THREE.Camera,
  controls: unknown,
  root: THREE.Object3D,
  viewport: { width: number; height: number },
): boolean {
  if (!(camera as THREE.OrthographicCamera).isOrthographicCamera) return false;
  const ortho = camera as THREE.OrthographicCamera;
  root.updateMatrixWorld(true);

  const box = new THREE.Box3();
  const tmp = new THREE.Box3();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    if (!o.visible) return;
    if (o.name.includes('-line') || o.name.includes('-lin')) return;
    if (m.geometry.boundingBox === null) m.geometry.computeBoundingBox();
    if (!m.geometry.boundingBox) return;
    tmp.copy(m.geometry.boundingBox).applyMatrix4(o.matrixWorld);
    box.union(tmp);
  });
  if (box.isEmpty()) return false;

  const center = box.getCenter(new THREE.Vector3());
  const sizeV = box.getSize(new THREE.Vector3());

  ortho.updateMatrixWorld(true);
  const dir = new THREE.Vector3();
  ortho.getWorldDirection(dir);
  ortho.position.copy(center).addScaledVector(dir, -Math.max(sizeV.length() * 2, 5));
  ortho.lookAt(center);
  ortho.updateMatrixWorld(true);

  const aspect = viewport.width / viewport.height;
  const margin = 1.2;
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
  return true;
}
