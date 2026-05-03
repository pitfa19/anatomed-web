import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { applyMultiIsolation, findPartByName } from '../../lib/viewer/isolate';

useGLTF.preload('/models/glb/skeleton.glb');

const BONE_TINT = '#e8d8b9';

interface InnerProps {
  partIds: string[];
  paused: boolean;
  reduced: boolean;
  rotationSpeed: number;
  marginScale: number;
}

function BoneGroup({
  partIds,
  paused,
  reduced,
  rotationSpeed,
  marginScale,
}: InnerProps) {
  const { scene } = useGLTF('/models/glb/skeleton.glb') as unknown as {
    scene: THREE.Group;
  };
  const cloned = useMemo(() => scene.clone(true), [scene]);
  const groupRef = useRef<THREE.Group>(null);
  const { camera, size } = useThree();

  useEffect(() => {
    applyMultiIsolation(cloned, partIds);
    // applyMultiIsolation keeps label-connector lines visible inside the
    // target subtree (the /viewer route uses them for label leaders); the
    // home hero is decorative, no labels shown, so we hide them and tint the
    // remaining visible meshes in the same pass.
    cloned.traverse((o) => {
      if (o.name.includes('-lin') || o.name.includes('labels')) {
        o.visible = false;
        return;
      }
      const m = o as THREE.Mesh;
      if (!m.isMesh || !o.visible) return;
      m.material = new THREE.MeshStandardMaterial({
        color: BONE_TINT,
        roughness: 0.55,
        metalness: 0.05,
      });
    });

    const box = new THREE.Box3();
    for (const id of partIds) {
      const part = findPartByName(cloned, id);
      if (part) box.expandByObject(part);
    }
    if (box.isEmpty()) return;

    const center = box.getCenter(new THREE.Vector3());
    const bsize = box.getSize(new THREE.Vector3());
    cloned.position.sub(center);

    const cam = camera as THREE.PerspectiveCamera;
    const fovRad = (cam.fov * Math.PI) / 180;
    // Fit whichever dimension is larger relative to the canvas aspect.
    const aspect = size.width / Math.max(1, size.height);
    const fitHeight = bsize.y;
    const fitWidth = bsize.x / aspect;
    const fitDim = Math.max(fitHeight, fitWidth);
    const distance = (fitDim / 2 / Math.tan(fovRad / 2)) * marginScale;
    cam.position.set(0, 0, distance);
    cam.lookAt(0, 0, 0);
    cam.near = Math.max(0.1, distance / 100);
    cam.far = distance * 10;
    cam.updateProjectionMatrix();
  }, [cloned, partIds, camera, marginScale, size.width, size.height]);

  useFrame((_, delta) => {
    if (paused || reduced || !groupRef.current) return;
    groupRef.current.rotation.y += delta * rotationSpeed;
  });

  return (
    <group ref={groupRef}>
      <primitive object={cloned} />
    </group>
  );
}

export interface IsolatedBonesCanvasProps {
  /** Stable reference - pass via useMemo or top-level constant. */
  partIds: string[];
  reduced?: boolean;
  /** Radians per second. */
  rotationSpeed?: number;
  /** Camera fit margin (1.0 = tight, 1.5 = roomy). */
  marginScale?: number;
  fov?: number;
}

export default function IsolatedBonesCanvas({
  partIds,
  reduced = false,
  rotationSpeed = 0.22,
  marginScale = 1.15,
  fov = 32,
}: IsolatedBonesCanvasProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) setPaused(!e.isIntersecting);
      },
      { threshold: 0 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={wrapRef} className="h-full w-full">
      <Canvas
        dpr={[1, 1.5]}
        camera={{ position: [0, 0, 9], fov }}
        gl={{ antialias: true, alpha: true }}
        style={{ background: 'transparent' }}
      >
        <ambientLight intensity={0.65} />
        <directionalLight position={[4, 6, 6]} intensity={0.95} color="#ffffff" />
        <directionalLight position={[-5, -2, -4]} intensity={0.32} color="#cfd8e8" />
        <Suspense fallback={null}>
          <BoneGroup
            partIds={partIds}
            paused={paused}
            reduced={reduced}
            rotationSpeed={rotationSpeed}
            marginScale={marginScale}
          />
        </Suspense>
      </Canvas>
    </div>
  );
}
