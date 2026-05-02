import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';

useGLTF.preload('/models/glb/skeleton.glb');

const BONE_TINT = '#e8d8b9';
const MUSCLE_TINT = '#b34a4a';

// Multiplier on the raw scroll progress (0..1 over one viewport-height).
// 2.5× → muscles reach full opacity after ~40% of a viewport scroll, so the
// reveal feels prompt rather than slow.
const PROGRESS_GAIN = 2.5;

function bboxFromVisibleMeshes(root: THREE.Object3D): THREE.Box3 {
  const box = new THREE.Box3();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !o.visible) return;
    box.expandByObject(m);
  });
  return box;
}

type SharedRefs = {
  /** Set by SkeletonGroup once the bone bbox is known. Both groups subtract
   *  this from their cloned scene origin so the muscle layer registers
   *  exactly with the bones. */
  boneCenter: React.MutableRefObject<THREE.Vector3 | null>;
  /** Driven from outside via the muscleProgress prop, read inside useFrame to
   *  tween the shared muscle material's opacity. */
  progress: React.MutableRefObject<number>;
};

interface SkeletonGroupProps extends SharedRefs {
  paused: boolean;
  reduced: boolean;
  rotationSpeed: number;
  marginScale: number;
}

function SkeletonGroup({
  boneCenter,
  paused,
  reduced,
  rotationSpeed,
  marginScale,
}: SkeletonGroupProps) {
  const { scene } = useGLTF('/models/glb/skeleton.glb') as unknown as {
    scene: THREE.Group;
  };
  const cloned = useMemo(() => scene.clone(true), [scene]);
  const groupRef = useRef<THREE.Group>(null);
  const { camera, size } = useThree();

  useEffect(() => {
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

    const box = bboxFromVisibleMeshes(cloned);
    if (box.isEmpty()) return;

    const center = box.getCenter(new THREE.Vector3());
    const bsize = box.getSize(new THREE.Vector3());
    cloned.position.sub(center);
    boneCenter.current = center.clone();

    const cam = camera as THREE.PerspectiveCamera;
    const fovRad = (cam.fov * Math.PI) / 180;
    const aspect = size.width / Math.max(1, size.height);
    const fitDim = Math.max(bsize.y, bsize.x / aspect);
    const distance = (fitDim / 2 / Math.tan(fovRad / 2)) * marginScale;
    cam.position.set(0, 0, distance);
    cam.lookAt(0, 0, 0);
    cam.near = Math.max(0.1, distance / 100);
    cam.far = distance * 10;
    cam.updateProjectionMatrix();
  }, [cloned, camera, marginScale, size.width, size.height, boneCenter]);

  useFrame((_, delta) => {
    if (paused || reduced || !groupRef.current) return;
    groupRef.current.rotation.y += delta * rotationSpeed;
  });

  return (
    <group ref={groupRef} name="hero-skeleton-group">
      <primitive object={cloned} />
    </group>
  );
}

function MusclesGroup({ boneCenter, progress }: SharedRefs) {
  const { scene } = useGLTF('/models/glb/muscles.glb') as unknown as {
    scene: THREE.Group;
  };
  const cloned = useMemo(() => scene.clone(true), [scene]);
  const groupRef = useRef<THREE.Group>(null);
  const sharedMatRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const appliedOffsetRef = useRef(false);
  const { scene: r3fScene } = useThree();

  useEffect(() => {
    const sharedMat = new THREE.MeshStandardMaterial({
      color: MUSCLE_TINT,
      roughness: 0.65,
      metalness: 0.0,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    sharedMatRef.current = sharedMat;

    cloned.traverse((o) => {
      if (o.name.includes('-lin') || o.name.includes('labels')) {
        o.visible = false;
        return;
      }
      const m = o as THREE.Mesh;
      if (!m.isMesh || !o.visible) return;
      m.material = sharedMat;
    });

    return () => {
      sharedMat.dispose();
      sharedMatRef.current = null;
    };
  }, [cloned]);

  useFrame(() => {
    // Apply the same world-space shift the skeleton used. We do this in
    // useFrame instead of useEffect because the skeleton's bone-center may
    // not be set yet on first muscle-mount: the muscles GLB can finish
    // loading before the skeleton GLB.
    if (!appliedOffsetRef.current && boneCenter.current) {
      cloned.position.copy(boneCenter.current).multiplyScalar(-1);
      appliedOffsetRef.current = true;
    }

    // Mirror the rotating skeleton group so muscles stay aligned.
    const skeleton = r3fScene.getObjectByName('hero-skeleton-group');
    if (skeleton && groupRef.current) {
      groupRef.current.rotation.y = skeleton.rotation.y;
    }

    const mat = sharedMatRef.current;
    if (!mat) return;
    const raw = Math.min(1, Math.max(0, progress.current * PROGRESS_GAIN));
    // Slight ease-in (sqrt) so muscles start showing immediately on scroll
    // instead of lagging behind a smoothstep curve.
    const target = Math.sqrt(raw) * 0.92;
    mat.opacity += (target - mat.opacity) * 0.22;
    if (groupRef.current) {
      groupRef.current.visible = mat.opacity > 0.01;
    }
  });

  return (
    <group ref={groupRef} name="hero-muscles-group">
      <primitive object={cloned} />
    </group>
  );
}

interface Props {
  /** 0..1; drives muscle layer opacity. */
  muscleProgress?: number;
  reduced?: boolean;
  rotationSpeed?: number;
  marginScale?: number;
  fov?: number;
}

export default function HeroAnatomy3D({
  muscleProgress = 0,
  reduced = false,
  rotationSpeed = 0.18,
  marginScale = 1.1,
  fov = 32,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);
  const progressRef = useRef(muscleProgress);
  const boneCenterRef = useRef<THREE.Vector3 | null>(null);

  useEffect(() => {
    progressRef.current = muscleProgress;
  }, [muscleProgress]);

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
          <SkeletonGroup
            boneCenter={boneCenterRef}
            progress={progressRef}
            paused={paused}
            reduced={reduced}
            rotationSpeed={rotationSpeed}
            marginScale={marginScale}
          />
        </Suspense>
        <Suspense fallback={null}>
          <MusclesGroup boneCenter={boneCenterRef} progress={progressRef} />
        </Suspense>
      </Canvas>
    </div>
  );
}
