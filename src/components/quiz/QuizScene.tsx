import { Suspense, useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { OrbitControls, OrthographicCamera, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { sanitizeNodeName } from '../../lib/viewer/isolate';
import type { Part, PartsCatalog, SystemMeta } from '../../lib/viewer/types';

/** Scene used inside QuizGame. Loads the chosen system's GLB, fits the whole
 *  system in view, and forwards every click to a part-resolution handler.
 *  No isolation — the player sees every part and is judged on which one they
 *  clicked. */
interface Props {
  system: SystemMeta;
  catalog: PartsCatalog;
  /** Re-fits the camera and clears any post-grade highlight. Bumped by the
   *  parent at the start of each new question. */
  questionEpoch: number;
  /** When non-null, briefly highlights the named part (in the active system)
   *  so the player can see the correct answer after a wrong click. */
  highlightPartId: string | null;
  onPartClick: (part: Part) => void;
}

export default function QuizScene({
  system,
  catalog,
  questionEpoch,
  highlightPartId,
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
        <SystemFull
          system={system}
          catalog={catalog}
          questionEpoch={questionEpoch}
          highlightPartId={highlightPartId}
          onPartClick={onPartClick}
        />
      </Suspense>
    </Canvas>
  );
}

interface FullProps extends Props {}

function SystemFull({
  system,
  catalog,
  questionEpoch,
  highlightPartId,
  onPartClick,
}: FullProps) {
  const { scene } = useGLTF(system.glb);
  const { camera, controls, size } = useThree();

  const partsByName = useMemo(() => {
    const m = new Map<string, Part>();
    for (const p of catalog.parts) {
      if (p.system === system.id) m.set(sanitizeNodeName(p.id), p);
    }
    return m;
  }, [catalog, system.id]);

  // First load: tint, ensure everything visible, hide all `-line` connectors.
  useEffect(() => {
    applySystemTint(scene, system.tint);
    scene.traverse((o) => {
      if (o.name.includes('-lin') || o.name.toLowerCase().includes('labels')) {
        o.visible = false;
      } else {
        o.visible = true;
      }
    });
  }, [scene, system.tint]);

  // Camera fit on every new question. We fit on a fresh frame after the GLB
  // is in scene; useFrame overrides any OrbitControls drift on first mount.
  const postFitFramesRef = useRef(0);
  const lastEpochRef = useRef<number>(-1);
  useEffect(() => {
    if (lastEpochRef.current === questionEpoch) return;
    lastEpochRef.current = questionEpoch;
    postFitFramesRef.current = 6;
  }, [questionEpoch]);

  useFrame(() => {
    if (postFitFramesRef.current <= 0) return;
    postFitFramesRef.current--;
    if (size.width === 0 || size.height === 0) return;
    fitOrthoToSystem(camera, controls, scene, size);
  });

  // Highlight overlay: when `highlightPartId` is set, swap the matching part
  // subtree's material with an emissive accent so the user can see what they
  // should have clicked. Cleared when `highlightPartId` goes back to null.
  const highlightedRef = useRef<{ mesh: THREE.Mesh; mat: THREE.Material | THREE.Material[] }[]>([]);
  useEffect(() => {
    // Always restore previous highlight first.
    for (const { mesh, mat } of highlightedRef.current) {
      mesh.material = mat;
    }
    highlightedRef.current = [];
    if (!highlightPartId) return;
    const target = findByName(scene, sanitizeNodeName(highlightPartId));
    if (!target) return;
    const accent = new THREE.MeshStandardMaterial({
      color: 0x10b981,
      emissive: 0x10b981,
      emissiveIntensity: 0.6,
      roughness: 0.4,
      metalness: 0.0,
    });
    target.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      if (o.name.includes('-lin')) return;
      highlightedRef.current.push({ mesh: m, mat: m.material });
      m.material = accent;
    });
  }, [scene, highlightPartId]);

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    let cur: THREE.Object3D | null = e.object;
    while (cur) {
      const part = partsByName.get(cur.name);
      if (part) {
        onPartClick(part);
        return;
      }
      cur = cur.parent;
    }
  };

  return <primitive object={scene} onClick={handleClick} />;
}

function findByName(root: THREE.Object3D, name: string): THREE.Object3D | null {
  let found: THREE.Object3D | null = null;
  root.traverse((o) => {
    if (!found && o.name === name) found = o;
  });
  return found;
}

const TINTED = new WeakSet<THREE.Material>();

function applySystemTint(root: THREE.Object3D, tint: string) {
  const color = new THREE.Color(tint);
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    if (o.name.includes('-line') || o.name.includes('-lin')) return;
    const cur = m.material as THREE.Material | undefined;
    if (cur && TINTED.has(cur)) return;
    const mat = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.55,
      metalness: 0.05,
    });
    TINTED.add(mat);
    m.material = mat;
  });
}

function fitOrthoToSystem(
  camera: THREE.Camera,
  controls: unknown,
  root: THREE.Object3D,
  viewport: { width: number; height: number },
): void {
  if (!(camera as THREE.OrthographicCamera).isOrthographicCamera) return;
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
  if (box.isEmpty()) return;

  const center = box.getCenter(new THREE.Vector3());
  const sizeV = box.getSize(new THREE.Vector3());

  ortho.updateMatrixWorld(true);
  const dir = new THREE.Vector3();
  ortho.getWorldDirection(dir);
  ortho.position.copy(center).addScaledVector(dir, -Math.max(sizeV.length() * 2, 5));
  ortho.lookAt(center);
  ortho.updateMatrixWorld(true);

  const aspect = viewport.width / viewport.height;
  const margin = 1.15;
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
}
