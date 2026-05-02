import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, OrthographicCamera, useGLTF } from '@react-three/drei';
import { Link } from 'react-router-dom';
import { Box as BoxIcon, ExternalLink, Loader2 } from 'lucide-react';
import * as THREE from 'three';
import { applyMultiIsolation } from '../../lib/viewer/isolate';
import { getSystem, loadCatalog } from '../../lib/viewer/catalog';
import type { Anatomy3DConfig } from '../../lib/types';
import type { PartsCatalog, SystemId, SystemMeta } from '../../lib/viewer/types';

interface Props {
  config: Anatomy3DConfig;
}

interface SystemGroup {
  sys: SystemMeta;
  partIds: string[];
}

export default function InlineAnatomy3D({ config }: Props) {
  const [catalog, setCatalog] = useState<PartsCatalog | null>(null);

  useEffect(() => {
    let alive = true;
    loadCatalog()
      .then((c) => alive && setCatalog(c))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const groups = useMemo<SystemGroup[] | null>(() => {
    if (!catalog) return null;
    const bySys = new Map<SystemId, SystemGroup>();
    const push = (id: string, sysId: SystemId) => {
      const sys = getSystem(catalog, sysId);
      if (!sys) return;
      let g = bySys.get(sysId);
      if (!g) {
        g = { sys, partIds: [] };
        bySys.set(sysId, g);
      }
      if (!g.partIds.includes(id)) g.partIds.push(id);
    };
    push(config.focus.id, config.focus.system);
    for (const e of config.extras) push(e.id, e.system);
    return Array.from(bySys.values());
  }, [catalog, config]);

  const viewerHref = useMemo(() => {
    const params = new URLSearchParams();
    params.set('part', config.focus.id);
    if (config.extras.length > 0) {
      params.set('extras', config.extras.map((e) => e.id).join(','));
    }
    params.set('labels', config.focus.id);
    return `/viewer?${params.toString()}`;
  }, [config]);

  // Number of groups whose isolation effect has applied. MiniFit waits for
  // this to reach `groups.length` before fitting — otherwise the fit fires
  // on the first frame against the un-isolated full-body bbox and the
  // camera is locked off-target.
  const [readyGroups, setReadyGroups] = useState(0);
  useEffect(() => {
    setReadyGroups(0);
  }, [groups]);
  const handleGroupReady = useCallback(() => {
    setReadyGroups((n) => n + 1);
  }, []);
  const allReady = !!groups && groups.length > 0 && readyGroups >= groups.length;

  return (
    <div className="my-3 overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-text-strong">
          <BoxIcon size={12} className="shrink-0 text-accent" />
          <span className="truncate">{config.title}</span>
        </div>
        <Link
          to={viewerHref}
          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-accent/40 bg-accent/10 px-2 py-1 text-[11px] font-medium text-accent no-underline transition-colors hover:border-accent/60 hover:bg-accent/20"
        >
          <span className="hidden sm:inline">Otvori u 3D pregledniku</span>
          <span className="sm:hidden">Otvori 3D</span>
          <ExternalLink size={11} />
        </Link>
      </div>
      <div className="relative h-72 w-full bg-bg">
        {!groups ? (
          <div className="flex h-full items-center justify-center text-xs text-text-muted">
            <Loader2 size={14} className="mr-2 animate-spin" /> Učitavam katalog…
          </div>
        ) : groups.length === 0 ? (
          <div className="flex h-full items-center justify-center px-3 text-center text-xs text-text-muted">
            Nije moguće učitati 3D model za odabrane dijelove.
          </div>
        ) : (
          <Canvas dpr={[1, 2]} gl={{ antialias: true, alpha: true }}>
            <ambientLight intensity={0.7} />
            <directionalLight position={[5, 10, 5]} intensity={0.85} />
            <directionalLight position={[-5, -3, -5]} intensity={0.3} />
            <OrthographicCamera makeDefault position={[0, 1.2, 7]} near={0.01} far={1000} />
            <OrbitControls
              makeDefault
              enableDamping
              enableRotate
              enableZoom={false}
              enablePan={false}
            />
            <Suspense fallback={null}>
              {groups.map((g) => (
                <MiniGroup
                  key={g.sys.id}
                  system={g.sys}
                  partIds={g.partIds}
                  onReady={handleGroupReady}
                />
              ))}
            </Suspense>
            <MiniFit ready={allReady} />
          </Canvas>
        )}
      </div>
      {config.unmatched.length > 0 && (
        <div className="border-t border-border bg-surface-2/40 px-3 py-1.5 text-[10px] text-text-muted">
          Ne nalazim: {config.unmatched.join(', ')}
        </div>
      )}
    </div>
  );
}

interface MiniGroupProps {
  system: SystemMeta;
  partIds: string[];
  onReady: () => void;
}

function MiniGroup({ system, partIds, onReady }: MiniGroupProps) {
  const { scene: source } = useGLTF(system.glb);
  const cloned = useMemo(() => source.clone(true), [source]);
  const idsKey = useMemo(() => [...partIds].sort().join('|'), [partIds]);

  useEffect(() => {
    applyMiniTint(cloned, system.tint, system.id);
    applyMultiIsolation(cloned, partIds);
    cloned.traverse((o) => {
      if (o.name.includes('-lin')) o.visible = false;
    });
    // Signal that the visible bbox in this scene now reflects only the
    // requested parts — MiniFit waits for every group before framing.
    onReady();
  }, [cloned, system.tint, system.id, idsKey, partIds, onReady]);

  return <primitive object={cloned} />;
}

function MiniFit({ ready }: { ready: boolean }) {
  const { camera, size, scene, controls } = useThree();
  const fittedRef = useRef(false);

  // Reset when the config changes (parent flips ready back to false).
  useEffect(() => {
    if (!ready) fittedRef.current = false;
  }, [ready]);

  useFrame(() => {
    if (!ready) return;
    if (fittedRef.current) return;
    const ortho = camera as THREE.OrthographicCamera;
    if (!ortho.isOrthographicCamera) return;

    const box = new THREE.Box3();
    const tmp = new THREE.Box3();
    scene.updateMatrixWorld(true);
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || !o.visible) return;
      if (o.name.includes('-line')) return;
      const geo = m.geometry;
      if (!geo) return;
      if (!geo.boundingBox) geo.computeBoundingBox();
      if (!geo.boundingBox) return;
      tmp.copy(geo.boundingBox).applyMatrix4(o.matrixWorld);
      box.union(tmp);
    });
    if (box.isEmpty()) return;

    const center = box.getCenter(new THREE.Vector3());
    const sz = box.getSize(new THREE.Vector3());
    const dir = new THREE.Vector3();
    ortho.getWorldDirection(dir);
    ortho.position.copy(center).addScaledVector(dir, -Math.max(sz.length() * 2, 5));
    ortho.lookAt(center);

    const aspect = size.width / Math.max(size.height, 1);
    const fitWidth = Math.max(sz.x, sz.y * aspect) * 1.45;
    const fitHeight = fitWidth / aspect;
    ortho.left = -fitWidth / 2;
    ortho.right = fitWidth / 2;
    ortho.top = fitHeight / 2;
    ortho.bottom = -fitHeight / 2;
    ortho.zoom = 1;
    ortho.updateProjectionMatrix();

    // Pivot OrbitControls around the part center — without this, rotation
    // orbits the world origin and the bone swings out of frame.
    const c = controls as
      | { target?: THREE.Vector3; update?: () => void }
      | null;
    if (c?.target) {
      c.target.copy(center);
      c.update?.();
    }

    fittedRef.current = true;
  });

  return null;
}

const LINE_MAT = new THREE.MeshBasicMaterial({
  color: 0x6b6b6b,
  transparent: true,
  opacity: 0.25,
  depthWrite: false,
});

const THIN_THRESHOLDS: Record<SystemId, { maxOverMed: number; medOverMin: number }> = {
  nerves: { maxOverMed: 4, medOverMin: 3 },
  vessels: { maxOverMed: 4, medOverMin: 3 },
  insertions: { maxOverMed: 4, medOverMin: 3 },
  skeleton: { maxOverMed: 14, medOverMin: 6 },
  muscles: { maxOverMed: 14, medOverMin: 6 },
  organs: { maxOverMed: 14, medOverMin: 6 },
  joints: { maxOverMed: 14, medOverMin: 6 },
  regions: { maxOverMed: 14, medOverMin: 6 },
};

function applyMiniTint(root: THREE.Object3D, tint: string, systemId: SystemId) {
  const color = new THREE.Color(tint);
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    if (m.userData.__miniTinted) return;
    if (o.name.includes('-line')) {
      m.material = LINE_MAT;
    } else {
      m.material = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.55,
        metalness: 0.05,
      });
      thinIfElongated(m, systemId);
    }
    m.userData.__miniTinted = true;
  });
}

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
