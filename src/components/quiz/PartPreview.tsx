import { Suspense, useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { applyIsolation, clearIsolation, findPartByName } from '../../lib/viewer/isolate';
import type { IsolationFrame, SystemId, SystemMeta } from '../../lib/viewer/types';

// ─── camera fitting ────────────────────────────────────────────────────────────

function fitPartOrtho(
  camera: THREE.OrthographicCamera,
  scene: THREE.Object3D,
  partId: string,
  viewport: { width: number; height: number },
): boolean {
  const target = findPartByName(scene, partId);
  if (!target) return false;

  target.updateMatrixWorld(true);
  camera.updateMatrixWorld(true);

  const box = new THREE.Box3();
  const tmp = new THREE.Box3();
  target.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !o.visible || o.name.includes('-line')) return;
    if (m.geometry.boundingBox === null) m.geometry.computeBoundingBox();
    if (!m.geometry.boundingBox) return;
    tmp.copy(m.geometry.boundingBox).applyMatrix4(o.matrixWorld);
    box.union(tmp);
  });
  if (box.isEmpty()) return false;

  const center = box.getCenter(new THREE.Vector3());
  const sizeV = box.getSize(new THREE.Vector3());
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  camera.position.copy(center).addScaledVector(dir, -Math.max(sizeV.length() * 2, 5));
  camera.lookAt(center);
  camera.updateMatrixWorld(true);

  const aspect = viewport.width / Math.max(viewport.height, 1);
  const fw = Math.max(sizeV.x, sizeV.y * aspect) * 1.4;
  const fh = fw / aspect;
  camera.left = -fw / 2;
  camera.right = fw / 2;
  camera.top = fh / 2;
  camera.bottom = -fh / 2;
  camera.zoom = 1;
  camera.updateProjectionMatrix();
  return true;
}

// ─── material tinting (mirrors ExtraPart / SystemModel logic) ─────────────────

const LINE_MAT = new THREE.MeshBasicMaterial({
  color: 0x888888,
  transparent: true,
  opacity: 0.2,
  depthWrite: false,
});

const THIN: Record<SystemId, { mo: number; mm: number }> = {
  nerves:     { mo: 4,  mm: 3 },
  vessels:    { mo: 4,  mm: 3 },
  insertions: { mo: 4,  mm: 3 },
  skeleton:   { mo: 14, mm: 6 },
  muscles:    { mo: 14, mm: 6 },
  organs:     { mo: 14, mm: 6 },
  joints:     { mo: 14, mm: 6 },
  regions:    { mo: 14, mm: 6 },
};

function thinAxisAligned(m: THREE.Mesh, f: number) {
  if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
  const b = m.geometry.boundingBox;
  if (!b) return;
  const sx = b.max.x - b.min.x, sy = b.max.y - b.min.y, sz = b.max.z - b.min.z;
  const longest = sx >= sy && sx >= sz ? 'x' : sy >= sz ? 'y' : 'z';
  m.scale.set(longest === 'x' ? 1 : f, longest === 'y' ? 1 : f, longest === 'z' ? 1 : f);
}

function thinIfElongated(m: THREE.Mesh, sid: SystemId) {
  if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
  const b = m.geometry.boundingBox;
  if (!b) return;
  const [max, med, min] = [b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z]
    .sort((a, c) => c - a);
  if (!med || !min) return;
  const t = THIN[sid];
  if (max / med <= t.mo && med / min <= t.mm) return;
  const tgt = Math.min(Math.max(max * 0.01, 0.03), 0.3);
  const sx = b.max.x - b.min.x, sy = b.max.y - b.min.y, sz = b.max.z - b.min.z;
  m.scale.set(
    sx === max ? 1 : tgt / Math.max(sx, 1e-6),
    sy === max ? 1 : tgt / Math.max(sy, 1e-6),
    sz === max ? 1 : tgt / Math.max(sz, 1e-6),
  );
}

function applyTint(root: THREE.Object3D, tint: string, sid: SystemId) {
  const color = new THREE.Color(tint);
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    if (o.name.includes('-line')) {
      m.material = LINE_MAT;
      thinAxisAligned(m, 0.2);
    } else {
      m.material = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.05 });
      thinIfElongated(m, sid);
    }
  });
}

// ─── R3F scene component ───────────────────────────────────────────────────────

interface SceneProps {
  system: SystemMeta;
  partId: string;
  rotate: boolean;
}

function IsolatedScene({ system, partId, rotate }: SceneProps) {
  const { scene: raw } = useGLTF(system.glb);
  const cloned = useMemo(() => raw.clone(true), [raw]);
  const { camera, size } = useThree();
  const frameRef = useRef<IsolationFrame | null>(null);
  const postFitRef = useRef(12);
  const fittedRef = useRef(false);

  useEffect(() => {
    // Tint (always re-apply since clone may inherit stale materials)
    applyTint(cloned, system.tint, system.id as SystemId);
    // Isolate
    if (frameRef.current) { clearIsolation(frameRef.current, cloned); frameRef.current = null; }
    frameRef.current = applyIsolation(cloned, partId);
    // Reset rotation + schedule camera fit
    cloned.rotation.set(0, 0, 0);
    postFitRef.current = 12;
    fittedRef.current = false;
  }, [cloned, partId, system]);

  useFrame((_, delta) => {
    if (!fittedRef.current) {
      if (postFitRef.current > 0) {
        postFitRef.current--;
        const ok = fitPartOrtho(camera as THREE.OrthographicCamera, cloned, partId, size);
        if (ok && postFitRef.current <= 6) fittedRef.current = true;
      }
      return;
    }
    if (rotate) cloned.rotation.y += delta * 0.4;
  });

  return <primitive object={cloned} />;
}

// ─── public component ─────────────────────────────────────────────────────────

interface Props {
  system: SystemMeta;
  partId: string;
  rotate?: boolean;
  className?: string;
}

export default function PartPreview({ system, partId, rotate = true, className }: Props) {
  return (
    <Canvas
      orthographic
      camera={{ position: [0, 0, 10] }}
      gl={{ alpha: true, antialias: true }}
      style={{ pointerEvents: 'none' }}
      className={className}
    >
      <ambientLight intensity={0.8} />
      <directionalLight position={[5, 8, 3]} intensity={1.0} />
      <directionalLight position={[-3, -2, -5]} intensity={0.25} />
      <Suspense fallback={null}>
        <IsolatedScene system={system} partId={partId} rotate={rotate} />
      </Suspense>
    </Canvas>
  );
}
