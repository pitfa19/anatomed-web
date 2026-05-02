import { Suspense, forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Html, OrbitControls, OrthographicCamera } from '@react-three/drei';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import SystemModel, { type FitInfo, type SystemModelHandle } from './SystemModel';
import ExtraPart from './ExtraPart';
import { sanitizeNodeName } from '../../lib/viewer/isolate';
import type { LandmarkAnchor, Part, PartsCatalog, SystemMeta } from '../../lib/viewer/types';

export interface AnatomySceneHandle {
  recenter: () => void;
}

interface Props {
  system: SystemMeta | null;
  activePartId: string | null;
  catalog: PartsCatalog;
  extras: ReadonlySet<string>;
  /** Set of partIds whose landmark labels (and connector lines) should be
   *  rendered. Anything not in this set is hidden — applies to active and
   *  every extra alike. */
  labelsByPartId: ReadonlySet<string>;
  /** Called when the user clicks a 3D part. Same semantics as clicking a
   *  Part in the left "Odabrano" panel. */
  onPartClick: (part: Part) => void;
}

const AnatomyScene = forwardRef<AnatomySceneHandle, Props>(function AnatomyScene(
  { system, activePartId, catalog, extras, labelsByPartId, onPartClick },
  ref,
) {
  // Anchors keyed by source: 'active' = SystemModel (which now also contains
  // same-system extras' anchors); 'extra:<partId>' = each cross-system ExtraPart.
  const [anchorsBySrc, setAnchorsBySrc] = useState<Record<string, LandmarkAnchor[]>>({});
  const modelRef = useRef<SystemModelHandle>(null);
  const fitInfoRef = useRef<FitInfo | null>(null);

  useImperativeHandle(ref, () => ({
    recenter: () => modelRef.current?.recenter(),
  }), []);

  // Split extras into same-system (handled by the active SystemModel) and
  // cross-system (each rendered in its own ExtraPart).
  const { sameSystemExtras, crossSystemExtras } = useMemo(() => {
    const same = new Set<string>();
    const cross: Part[] = [];
    if (!system) return { sameSystemExtras: same, crossSystemExtras: cross };
    const byId = new Map<string, Part>();
    for (const p of catalog.parts) byId.set(p.id, p);
    for (const id of extras) {
      const p = byId.get(id);
      if (!p) continue;
      if (p.system === system.id) same.add(id);
      else cross.push(p);
    }
    return { sameSystemExtras: same, crossSystemExtras: cross };
  }, [extras, system, catalog]);

  // Index parts by id so we can match an anchor's `text` against its owning
  // part's display name to drop the "whole-bone" label (e.g. a "Femur"
  // anchor on the Femur part — we only want subpart labels).
  const partsById = useMemo(() => {
    const m = new Map<string, Part>();
    for (const p of catalog.parts) m.set(p.id, p);
    return m;
  }, [catalog]);

  // Aggregated anchor list — flattened from per-source slices, then filtered
  // per-part against `labelsByPartId`, with the whole-bone anchor dropped.
  const visibleAnchors = useMemo(() => {
    const flat: LandmarkAnchor[] = [];
    for (const list of Object.values(anchorsBySrc)) flat.push(...list);
    return flat.filter((a) => {
      if (!labelsByPartId.has(a.partId)) return false;
      const part = partsById.get(a.partId);
      if (part) {
        const text = a.text.trim().toLowerCase();
        if (text === part.name_en.trim().toLowerCase()) return false;
        if (part.name_lat && text === part.name_lat.trim().toLowerCase()) return false;
      }
      return true;
    });
  }, [anchorsBySrc, labelsByPartId, partsById]);

  // Cache per-srcKey handlers so the function identity passed to SystemModel /
  // ExtraPart is stable across renders. Without this, every render created a
  // fresh `onAnchors` function, which re-fired SystemModel's isolation effect,
  // which called `fitOrthoToObject` (resetting zoom and pan to fit) — making
  // it impossible for the user to zoom or move away from center.
  const handlersRef = useRef(new Map<string, (a: LandmarkAnchor[]) => void>());
  const getSrcAnchors = useCallback((srcKey: string) => {
    let fn = handlersRef.current.get(srcKey);
    if (!fn) {
      fn = (a: LandmarkAnchor[]) => {
        setAnchorsBySrc((prev) => {
          if (a.length === 0 && !(srcKey in prev)) return prev;
          return { ...prev, [srcKey]: a };
        });
      };
      handlersRef.current.set(srcKey, fn);
    }
    return fn;
  }, []);

  // Stable onFit handler — same reasoning as above. The inline arrow form was
  // a fresh ref every render, also re-firing the isolation/fit effect.
  const handleFit = useCallback((info: FitInfo | null) => {
    fitInfoRef.current = info;
  }, []);

  // Lookup table from sanitized GLB node name to catalog Part. Used by the
  // 3D click handler to translate `event.object` into a Part.
  const partsByName = useMemo(() => {
    const m = new Map<string, Part>();
    for (const p of catalog.parts) m.set(sanitizeNodeName(p.id), p);
    return m;
  }, [catalog]);

  // Sanitized names of every "whole-bone" connector mesh — the `-line` mesh
  // paired with the part's own labelText (e.g. "Femur-line" on the Femur).
  // We never want to render these: the whole-bone label is filtered out of
  // `visibleAnchors`, so the connector would dangle into empty space.
  const wholeBoneLineNames = useMemo(() => {
    const s = new Set<string>();
    for (const p of catalog.parts) {
      s.add(sanitizeNodeName(p.name_en) + '-line');
      if (p.name_lat) s.add(sanitizeNodeName(p.name_lat) + '-line');
    }
    return s;
  }, [catalog]);

  // Walk the clicked object's parents until we find a node whose name matches
  // a catalog Part. Only act if the part is currently rendered (active or
  // toggled on as an extra) — three.js raycaster hits hidden meshes too, so
  // without this gate the user could focus parts that aren't visible.
  const handleObjectClick = useCallback((obj: THREE.Object3D) => {
    let cur: THREE.Object3D | null = obj;
    while (cur) {
      const part = partsByName.get(cur.name);
      if (part) {
        if (part.id === activePartId || extras.has(part.id)) {
          onPartClick(part);
        }
        return;
      }
      cur = cur.parent;
    }
  }, [partsByName, onPartClick, activePartId, extras]);

  // Drop anchors for cross-system extras that are no longer mounted.
  useEffect(() => {
    setAnchorsBySrc((prev) => {
      const allowed = new Set(['active', ...crossSystemExtras.map((p) => `extra:${p.id}`)]);
      let changed = false;
      const next: Record<string, LandmarkAnchor[]> = {};
      for (const [k, v] of Object.entries(prev)) {
        if (allowed.has(k)) next[k] = v;
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [crossSystemExtras]);

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
        minZoom={0.5}
        maxZoom={8}
      />
      <PanClamp fitInfoRef={fitInfoRef} />

      <Suspense fallback={null}>
        {system ? (
          <>
            <SystemModel
              ref={modelRef}
              system={system}
              activePartId={activePartId}
              sameSystemExtras={sameSystemExtras}
              labelsByPartId={labelsByPartId}
              wholeBoneLineNames={wholeBoneLineNames}
              onAnchors={getSrcAnchors('active')}
              onFit={handleFit}
              onObjectClick={handleObjectClick}
            />
            {crossSystemExtras.map((p) => {
              const sys = catalog.systems.find((s) => s.id === p.system);
              if (!sys) return null;
              return (
                <ExtraPart
                  key={p.id}
                  partId={p.id}
                  system={sys}
                  labelsOn={labelsByPartId.has(p.id)}
                  wholeBoneLineNames={wholeBoneLineNames}
                  onAnchors={getSrcAnchors(`extra:${p.id}`)}
                  onObjectClick={handleObjectClick}
                />
              );
            })}
            {visibleAnchors.map((a) => (
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
          </>
        ) : null}
      </Suspense>
    </Canvas>
  );
});

export default AnatomyScene;

/** Subscribes to OrbitControls 'change' and clamps `controls.target` to a
 *  sphere around the fit center. The radius is `fit.panRadius / camera.zoom`,
 *  so as the user zooms in the allowed pan distance shrinks proportionally —
 *  the part body always stays at least partially in view. */
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
