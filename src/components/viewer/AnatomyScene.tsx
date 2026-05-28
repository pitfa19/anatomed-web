import { Suspense, forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Html, OrbitControls, OrthographicCamera } from '@react-three/drei';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import SystemLayer from './SystemLayer';
import CameraRig, { type CameraRigHandle } from './CameraRig';
import { sanitizeNodeName } from '../../lib/viewer/isolate';
import type { FitInfo } from '../../lib/viewer/fit';
import type { LandmarkAnchor, Part, PartsCatalog, SystemId, SystemMeta } from '../../lib/viewer/types';

export interface AnatomySceneHandle {
  recenter: () => void;
}

interface Props {
  activePartId: string | null;
  catalog: PartsCatalog;
  extras: ReadonlySet<string>;
  /** Set of partIds whose landmark labels (and connector lines) should be
   *  rendered. Anything not in this set is hidden. */
  labelsByPartId: ReadonlySet<string>;
  /** Called when the user clicks a 3D part. Same semantics as clicking a
   *  Part in the left "Odabrano" panel. */
  onPartClick: (part: Part) => void;
}

interface SystemRender {
  system: SystemMeta;
  visibleParts: Set<string>;
  activePartId: string | null;
  systemPartIds: string[];
}

const AnatomyScene = forwardRef<AnatomySceneHandle, Props>(function AnatomyScene(
  { activePartId, catalog, extras, labelsByPartId, onPartClick },
  ref,
) {
  const [anchorsBySystem, setAnchorsBySystem] = useState<Record<string, LandmarkAnchor[]>>({});
  const rigRef = useRef<CameraRigHandle>(null);
  const fitInfoRef = useRef<FitInfo | null>(null);
  const rootsRef = useRef(new Map<SystemId, THREE.Object3D>());

  useImperativeHandle(ref, () => ({
    recenter: () => rigRef.current?.recenter(),
  }), []);

  // Catalog part ids grouped by system (stable for the catalog lifetime).
  const partIdsBySystem = useMemo(() => {
    const m = new Map<SystemId, string[]>();
    for (const p of catalog.parts) {
      const arr = m.get(p.system) ?? [];
      arr.push(p.id);
      m.set(p.system, arr);
    }
    return m;
  }, [catalog]);

  const partsById = useMemo(() => {
    const m = new Map<string, Part>();
    for (const p of catalog.parts) m.set(p.id, p);
    return m;
  }, [catalog]);

  // One SystemLayer per system that has ≥1 visible part (active + extras).
  const systemRenders = useMemo<SystemRender[]>(() => {
    const bySystem = new Map<SystemId, Set<string>>();
    const add = (id: string) => {
      const p = partsById.get(id);
      if (!p) return;
      let s = bySystem.get(p.system);
      if (!s) { s = new Set(); bySystem.set(p.system, s); }
      s.add(id);
    };
    if (activePartId) add(activePartId);
    for (const id of extras) add(id);

    const activeSystem = activePartId ? partsById.get(activePartId)?.system ?? null : null;
    const out: SystemRender[] = [];
    for (const [sysId, visibleParts] of bySystem) {
      const system = catalog.systems.find((s) => s.id === sysId);
      if (!system) continue;
      out.push({
        system,
        visibleParts,
        activePartId: sysId === activeSystem ? activePartId : null,
        systemPartIds: partIdsBySystem.get(sysId) ?? [],
      });
    }
    return out;
  }, [activePartId, extras, catalog, partsById, partIdsBySystem]);

  // Aggregate anchors across systems, then drop the whole-bone anchor (its text
  // equals the owning part's own name — we only want subpart labels).
  const anchors = useMemo(() => {
    const flat: LandmarkAnchor[] = [];
    for (const list of Object.values(anchorsBySystem)) flat.push(...list);
    return flat.filter((a) => {
      const part = partsById.get(a.partId);
      if (part) {
        const text = a.text.trim().toLowerCase();
        if (text === part.name_en.trim().toLowerCase()) return false;
        if (part.name_lat && text === part.name_lat.trim().toLowerCase()) return false;
      }
      return true;
    });
  }, [anchorsBySystem, partsById]);

  // Name chips + their connector lines render only for parts whose labels are
  // toggled on.
  const chipAnchors = useMemo(
    () => anchors.filter((a) => labelsByPartId.has(a.partId)),
    [anchors, labelsByPartId],
  );
  // Thin grey leader lines from each labeled landmark's bone-surface point to
  // its chip. Skips degenerate anchors (no `-line` connector → surface ===
  // position). Keyed so r3f rebuilds (and disposes) the buffer on change.
  const connectors = useMemo(() => {
    const pts: number[] = [];
    for (const a of chipAnchors) {
      if (!a.surface || a.surface.distanceToSquared(a.position) < 1e-8) continue;
      pts.push(a.surface.x, a.surface.y, a.surface.z, a.position.x, a.position.y, a.position.z);
    }
    if (pts.length === 0) return null;
    return { positions: new Float32Array(pts), key: chipAnchors.map((a) => a.key).join(',') };
  }, [chipAnchors]);

  // Stable per-system anchor handlers so SystemLayer effect identities don't
  // churn (a fresh function would re-fire its visibility/anchor effect).
  const anchorHandlersRef = useRef(new Map<SystemId, (a: LandmarkAnchor[]) => void>());
  const getAnchorHandler = useCallback((sysId: SystemId) => {
    let fn = anchorHandlersRef.current.get(sysId);
    if (!fn) {
      fn = (a: LandmarkAnchor[]) => {
        setAnchorsBySystem((prev) => {
          if (a.length === 0 && !(sysId in prev)) return prev;
          return { ...prev, [sysId]: a };
        });
      };
      anchorHandlersRef.current.set(sysId, fn);
    }
    return fn;
  }, []);

  // Prune anchors for systems no longer rendered.
  useEffect(() => {
    const live = new Set(systemRenders.map((r) => r.system.id as string));
    setAnchorsBySystem((prev) => {
      let changed = false;
      const next: Record<string, LandmarkAnchor[]> = {};
      for (const [k, v] of Object.entries(prev)) {
        if (live.has(k)) next[k] = v;
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [systemRenders]);

  // Lookup from sanitized GLB node name to catalog Part for click resolution.
  const partsByName = useMemo(() => {
    const m = new Map<string, Part>();
    for (const p of catalog.parts) m.set(sanitizeNodeName(p.id), p);
    return m;
  }, [catalog]);

  // Walk a clicked/hovered object up to the nearest node matching a catalog
  // Part. Returns the Part only if it's currently rendered (active or an extra)
  // — the raycaster skips hidden meshes, but a visible mesh can resolve to a
  // non-selected ancestor, so we gate.
  const resolvePart = useCallback((obj: THREE.Object3D): Part | null => {
    let cur: THREE.Object3D | null = obj;
    while (cur) {
      const part = partsByName.get(cur.name);
      if (part) {
        return part.id === activePartId || extras.has(part.id) ? part : null;
      }
      cur = cur.parent;
    }
    return null;
  }, [partsByName, activePartId, extras]);

  const handleObjectClick = useCallback((obj: THREE.Object3D) => {
    const part = resolvePart(obj);
    if (part) onPartClick(part);
  }, [resolvePart, onPartClick]);

  // Hover → cursor-following name tooltip (text written straight to the DOM to
  // avoid a re-render per pointermove). No mesh/region highlight on hover —
  // subpart landmarks are revealed via the labels toggle (chips + connector
  // lines), not on hover.
  const tooltipRef = useRef<HTMLDivElement>(null);
  const handleHover = useCallback(
    (obj: THREE.Object3D | null, ev: PointerEvent | null) => {
      const tip = tooltipRef.current;
      if (!tip) return;
      const part = obj ? resolvePart(obj) : null;
      if (!part || !ev) {
        tip.style.display = 'none';
        return;
      }
      tip.textContent =
        part.name_lat && part.name_lat !== part.name_en
          ? `${part.name_en} · ${part.name_lat}`
          : part.name_en;
      tip.style.left = `${ev.clientX + 14}px`;
      tip.style.top = `${ev.clientY + 14}px`;
      tip.style.display = 'block';
    },
    [resolvePart],
  );

  const registerRoot = useCallback((sysId: SystemId, root: THREE.Object3D | null) => {
    if (root) rootsRef.current.set(sysId, root);
    else rootsRef.current.delete(sysId);
  }, []);

  const getRoots = useCallback(() => Array.from(rootsRef.current.values()), []);
  const handleFit = useCallback((info: FitInfo | null) => {
    fitInfoRef.current = info;
  }, []);

  const fitKey = useMemo(() => {
    const sys = systemRenders.map((r) => r.system.id).sort().join(',');
    const ex = Array.from(extras).sort().join(',');
    return `${activePartId ?? ''}|${ex}|${sys}`;
  }, [systemRenders, extras, activePartId]);

  return (
    <div className="relative h-full w-full">
      <div
        ref={tooltipRef}
        className="pointer-events-none fixed z-50 hidden whitespace-nowrap rounded-md border border-border/70 bg-surface/95 px-2 py-1 text-xs font-medium text-text-strong shadow-lg backdrop-blur"
        style={{ left: 0, top: 0 }}
      />
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
        minZoom={0.5}
        maxZoom={8}
      />
      <PanClamp fitInfoRef={fitInfoRef} />

      <Suspense fallback={null}>
        {systemRenders.map((r) => (
          <SystemLayer
            key={r.system.id}
            system={r.system}
            systemPartIds={r.systemPartIds}
            visibleParts={r.visibleParts}
            activePartId={r.activePartId}
            labelsByPartId={labelsByPartId}
            onAnchors={getAnchorHandler(r.system.id)}
            onObjectClick={handleObjectClick}
            onObjectHover={handleHover}
            registerRoot={registerRoot}
          />
        ))}
        <CameraRig ref={rigRef} fitKey={fitKey} getRoots={getRoots} onFit={handleFit} />
        {/* "Labels on" → thin grey connector lines from each landmark's bone
            surface to its chip. */}
        {connectors && (
          <lineSegments key={connectors.key}>
            <bufferGeometry>
              <bufferAttribute attach="attributes-position" args={[connectors.positions, 3]} />
            </bufferGeometry>
            <lineBasicMaterial color="#6b6b6b" transparent opacity={0.5} depthWrite={false} />
          </lineSegments>
        )}
        {/* "Labels on" → always-on name chips at the label anchor positions. */}
        {chipAnchors.map((a) => (
          <Html
            key={a.key}
            position={a.position}
            center
            zIndexRange={[10, 0]}
            style={{ pointerEvents: 'none', userSelect: 'none' }}
          >
            <div className="whitespace-nowrap rounded-md border border-border/60 bg-surface/70 px-1.5 py-0.5 text-[10px] text-text-strong shadow-sm backdrop-blur-sm">
              {a.text}
            </div>
          </Html>
        ))}
      </Suspense>
      </Canvas>
    </div>
  );
});

export default AnatomyScene;

/** Subscribes to OrbitControls 'change' and clamps `controls.target` to a
 *  sphere around the fit center, so the part body always stays partially in
 *  view. Radius shrinks with zoom. */
function PanClamp({ fitInfoRef }: { fitInfoRef: React.MutableRefObject<FitInfo | null> }) {
  const { controls } = useThree();
  useEffect(() => {
    const c = controls as OrbitControlsImpl | null;
    if (!c) return;
    const tmp = new THREE.Vector3();
    const onChange = () => {
      const fit = fitInfoRef.current;
      if (!fit) return;
      const cam = c.object as THREE.OrthographicCamera;
      const zoom = cam.isOrthographicCamera && cam.zoom > 0 ? cam.zoom : 1;
      const radius = fit.panRadius / zoom;
      tmp.copy(c.target).sub(fit.center);
      const d = tmp.length();
      if (d > radius) {
        tmp.multiplyScalar(radius / d);
        c.target.copy(fit.center).add(tmp);
      }
    };
    c.addEventListener('change', onChange);
    return () => {
      c.removeEventListener('change', onChange);
    };
  }, [controls, fitInfoRef]);
  return null;
}
