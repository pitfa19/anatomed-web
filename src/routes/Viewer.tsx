import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Loader2, ArrowLeft, X as XIcon, Crosshair, BookOpen, Eye, EyeOff } from 'lucide-react';
import { useGLTF, useProgress } from '@react-three/drei';
import { cn } from '../lib/cn';
import PartSearchBar from '../components/viewer/PartSearchBar';
import AnatomyScene, { type AnatomySceneHandle } from '../components/viewer/AnatomyScene';
import NeighborsPanel from '../components/viewer/NeighborsPanel';
import { getSystem, loadCatalog, loadNeighbors } from '../lib/viewer/catalog';
import { fuzzyMatch, loadUnifiedIndex } from '../lib/data';
import type { UnifiedIndex } from '../lib/types';
import type { Neighbor, NeighborMap, Part, PartsCatalog, SystemId, SystemMeta } from '../lib/viewer/types';

export default function Viewer() {
  const [catalog, setCatalog] = useState<PartsCatalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<Part | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const sceneRef = useRef<AnatomySceneHandle>(null);
  const [searchParams] = useSearchParams();
  const [pdfIndex, setPdfIndex] = useState<UnifiedIndex | null>(null);
  const [landingQuery, setLandingQuery] = useState('');
  const [neighbors, setNeighbors] = useState<NeighborMap | null>(null);
  const [extras, setExtras] = useState<Set<string>>(new Set());
  /** Set of partIds for which to render landmark labels. Default empty -
   *  labels are off for every selected part on first toggle/search. */
  const [labelsByPartId, setLabelsByPartId] = useState<Set<string>>(new Set());
  /** Per-system BFS expansion stacks. Each entry is the list of partIds that
   *  one "+" click added at that step, so a "−" click can pop the latest
   *  ring back out. Reset on active change / fresh search / clear. */
  const [layerStacks, setLayerStacks] = useState<Record<string, string[][]>>({});

  useEffect(() => {
    loadNeighbors()
      .then(setNeighbors)
      .catch(() => {
        /* neighbors are optional - if missing, panel just hides */
      });
  }, []);

  function toggleExtra(id: string) {
    setExtras((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
    // Drop labels-state when an extra is removed so re-adding starts off.
    setLabelsByPartId((s) => {
      if (!s.has(id)) return s;
      const n = new Set(s);
      n.delete(id);
      return n;
    });
  }

  function toggleLabels(id: string) {
    setLabelsByPartId((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  /** Clear every extra (and their labels state) without dropping the active. */
  function clearExtras() {
    setExtras(new Set());
    setLabelsByPartId((s) => {
      if (active && s.has(active.id)) {
        const n = new Set<string>();
        n.add(active.id);
        return n;
      }
      return new Set();
    });
    setLayerStacks({});
  }

  /** Push the next BFS layer of `systemId` neighbours onto `extras` and
   *  record it on the per-system stack so a "−" click can undo this step. */
  function expandLayer(systemId: SystemId) {
    if (!neighbors || !active) return;
    const selected = new Set<string>([active.id, ...extras]);
    const frontier = new Set<string>();
    for (const id of selected) {
      const list = neighbors[id] ?? [];
      for (const n of list) {
        if (n.system === systemId && !selected.has(n.id)) frontier.add(n.id);
      }
    }
    if (frontier.size === 0) return;
    setExtras((prev) => {
      const next = new Set(prev);
      for (const id of frontier) next.add(id);
      return next;
    });
    setLayerStacks((prev) => ({
      ...prev,
      [systemId]: [...(prev[systemId] ?? []), Array.from(frontier)],
    }));
  }

  /** Pop the latest expansion ring for `systemId`. Removes those parts from
   *  `extras` (and from labels). Manually-toggled extras and other systems'
   *  layers are untouched. */
  function collapseLayer(systemId: SystemId) {
    const stack = layerStacks[systemId];
    if (!stack || stack.length === 0) return;
    const top = stack[stack.length - 1]!;
    setExtras((prev) => {
      const next = new Set(prev);
      for (const id of top) next.delete(id);
      return next;
    });
    setLabelsByPartId((prev) => {
      let changed = false;
      const next = new Set(prev);
      for (const id of top) {
        if (next.delete(id)) changed = true;
      }
      return changed ? next : prev;
    });
    setLayerStacks((prev) => ({
      ...prev,
      [systemId]: stack.slice(0, -1),
    }));
  }

  /** Promote a neighbor to active without clearing the rest of the scene.
   *  The previous active becomes an extra so the user keeps their context as
   *  they walk anatomically (femur → tibia → patella → …). Labels-state for
   *  the demoted active stays - only newly-focused part defaults to off.
   *  Layer stacks reset because BFS layers are defined relative to the
   *  active part, and the centre just moved. */
  function focusFromNeighbor(part: Part) {
    setExtras((s) => {
      const n = new Set(s);
      if (active && active.id !== part.id) n.add(active.id);
      n.delete(part.id);
      return n;
    });
    setActive(part);
    setLayerStacks({});
  }

  /** Search-bar pick → start fresh: clear all extras, labels, layers,
   *  and set new active. */
  function freshSearch(part: Part) {
    setExtras(new Set());
    setLabelsByPartId(new Set());
    setLayerStacks({});
    setActive(part);
  }

  /** Deep-link entry point that preserves the extras + labels passed via
   *  query params (used by the agent's inline 3D viewer to hand off the
   *  exact configuration shown in chat). */
  function freshSearchWithConfig(
    part: Part,
    nextExtras: Set<string>,
    nextLabels: Set<string>,
  ) {
    setExtras(nextExtras);
    setLabelsByPartId(nextLabels);
    setLayerStacks({});
    setActive(part);
  }

  /** Reset to landing. */
  function clearAll() {
    setExtras(new Set());
    setLabelsByPartId(new Set());
    setLayerStacks({});
    setActive(null);
    setLandingQuery('');
  }

  useEffect(() => {
    loadCatalog()
      .then(setCatalog)
      .catch((e) => setError(e.message ?? String(e)));
  }, []);

  useEffect(() => {
    loadUnifiedIndex()
      .then(setPdfIndex)
      .catch(() => {
        /* PDF cross-link is optional */
      });
  }, []);

  // Resolve the ?part=<id> deep-link synchronously during render. Computing
  // pendingPart here (instead of inside an effect that pushes via setActive)
  // lets us skip the landing-hero render between catalog-load and active-set,
  // so the canvas's parent layout doesn't churn under r3f's Canvas mount.
  const pendingPartId = searchParams.get('part');
  const pendingExtrasRaw = searchParams.get('extras');
  const pendingLabelsRaw = searchParams.get('labels');
  const pendingPart = useMemo(
    () => (catalog && pendingPartId
      ? catalog.parts.find((p) => p.id === pendingPartId) ?? null
      : null),
    [catalog, pendingPartId],
  );

  /** Filter a CSV id list against the catalog so query-string typos can't
   *  push unknown ids into `extras`/`labels`. */
  function parseIdCsv(raw: string | null, cat: PartsCatalog): Set<string> {
    if (!raw) return new Set();
    const known = new Set(cat.parts.map((p) => p.id));
    const out = new Set<string>();
    for (const id of raw.split(',')) {
      const t = id.trim();
      if (t && known.has(t)) out.add(t);
    }
    return out;
  }

  const pendingExtras = useMemo<Set<string>>(
    () => (catalog ? parseIdCsv(pendingExtrasRaw, catalog) : new Set()),
    [catalog, pendingExtrasRaw],
  );
  const pendingLabels = useMemo<Set<string>>(
    () => (catalog ? parseIdCsv(pendingLabelsRaw, catalog) : new Set()),
    [catalog, pendingLabelsRaw],
  );

  const lastAppliedPart = useRef<string | null>(null);
  useEffect(() => {
    if (!pendingPart) return;
    if (lastAppliedPart.current === pendingPart.id) return;
    if (active?.id === pendingPart.id) return;
    lastAppliedPart.current = pendingPart.id;
    if (pendingExtras.size > 0 || pendingLabels.size > 0) {
      freshSearchWithConfig(pendingPart, pendingExtras, pendingLabels);
    } else {
      freshSearch(pendingPart);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingPart]);

  // Warm drei's GLTF cache the moment the catalog resolves - in parallel with
  // the React state transition rather than after the canvas mounts. Preload
  // every system referenced by the focus + extras so cross-system parts from
  // the agent handoff don't pop in late.
  useEffect(() => {
    if (!catalog || !pendingPart) return;
    const sysIds = new Set<string>([pendingPart.system]);
    const byId = new Map(catalog.parts.map((p) => [p.id, p]));
    for (const id of pendingExtras) {
      const p = byId.get(id);
      if (p) sysIds.add(p.system);
    }
    for (const id of sysIds) {
      const sys = catalog.systems.find((s) => s.id === id);
      if (sys) useGLTF.preload(sys.glb);
    }
  }, [catalog, pendingPart, pendingExtras]);

  // PDF terms matching the current landing-search query - used to surface a
  // "Pronađi u skriptama" cross-link when the user types something that
  // doesn't match a 3D part but does have hits in the indexed PDFs.
  const pdfMatches: string[] = useMemo(() => {
    if (!pdfIndex || landingQuery.trim().length < 2) return [];
    return fuzzyMatch(landingQuery, pdfIndex.allTerms, 3);
  }, [pdfIndex, landingQuery]);

  // Union of neighbors across active + every extra, deduped (min dist wins),
  // excluding parts that are themselves selected. As more extras are toggled
  // on, more neighbors become available - the "branching" model.
  const unionedNeighbors = useMemo<Neighbor[]>(() => {
    if (!neighbors || !active) return [];
    const selected = new Set<string>([active.id, ...extras]);
    const byId = new Map<string, Neighbor>();
    for (const id of selected) {
      const list = neighbors[id] ?? [];
      for (const n of list) {
        if (selected.has(n.id)) continue;
        const prev = byId.get(n.id);
        if (!prev || n.dist < prev.dist) byId.set(n.id, n);
      }
    }
    return Array.from(byId.values()).sort((a, b) => a.dist - b.dist);
  }, [neighbors, active, extras]);

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-sm text-warn">
        Greška učitavanja kataloga: {error}
      </div>
    );
  }

  if (!catalog) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-text-muted">
        <Loader2 size={16} className="animate-spin" /> Učitavam katalog…
      </div>
    );
  }

  if (catalog.parts.length === 0) {
    return <EmptyCatalog />;
  }

  const activeSystem: SystemMeta | null = active ? getSystem(catalog, active.system) : null;

  if (!active) {
    if (pendingPart) {
      return (
        <div className="flex h-full items-center justify-center gap-2 text-sm text-text-muted">
          <Loader2 size={16} className="animate-spin" /> Učitavam {pendingPart.name_en}…
        </div>
      );
    }
    return (
      <div className="h-full overflow-y-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:gap-8 sm:px-8 sm:py-16">
          <div className="flex flex-col gap-2 text-center">
            <h1 className="text-2xl font-semibold tracking-tight text-text-strong sm:text-4xl">
              3D anatomija
            </h1>
            <p className="text-sm text-text-muted sm:text-base">
              Pretraži dio tijela - automatski ćemo izolirati taj dio iz cijelog sustava.
            </p>
          </div>
          <PartSearchBar
            catalog={catalog}
            active={null}
            onPick={freshSearch}
            onClear={clearAll}
            onQueryChange={setLandingQuery}
            autoFocus
            size="lg"
          />
          {pdfMatches.length > 0 && (
            <Link
              to={`/docs?q=${encodeURIComponent(pdfMatches[0]!)}`}
              className="mx-auto flex items-center gap-2 rounded-full border border-accent/40 bg-accent/10 px-3 py-1.5 text-sm text-accent transition-colors hover:bg-accent/20"
            >
              <BookOpen size={14} />
              Pronađi u skriptama: {pdfMatches[0]}
            </Link>
          )}
          <SystemHints catalog={catalog} />
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-full overflow-hidden lg:gap-3 lg:p-3">
      {drawerOpen && (
        <button
          type="button"
          aria-label="Close menu"
          onClick={() => setDrawerOpen(false)}
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-[88vw] max-w-[320px] flex-col gap-3 overflow-hidden border-r border-border bg-bg p-3 shadow-xl transition-transform',
          drawerOpen ? 'translate-x-0' : '-translate-x-full',
          'lg:static lg:z-0 lg:w-[300px] lg:max-w-none lg:translate-x-0 lg:border-r-0 lg:p-0 lg:shadow-none',
        )}
      >
        <div className="flex items-center justify-between">
          <button
            onClick={clearAll}
            className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-text-muted hover:bg-surface hover:text-text-strong"
          >
            <ArrowLeft size={14} /> Pretraga
          </button>
          <button
            onClick={() => setDrawerOpen(false)}
            aria-label="Close menu"
            className="rounded-md p-1.5 text-text-muted hover:bg-surface hover:text-text-strong lg:hidden"
          >
            <XIcon size={16} />
          </button>
        </div>

        <PartSearchBar
          catalog={catalog}
          active={active}
          onPick={freshSearch}
          onClear={clearAll}
        />

        {activeSystem && (
          <div className="flex items-start gap-2 rounded-xl border border-border bg-surface p-3">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] uppercase tracking-wider text-text-muted">
                {activeSystem.label_hr}
              </p>
              <p className="mt-1 text-base font-medium text-text-strong">{active.name_en}</p>
              {active.name_lat && active.name_lat !== active.name_en && (
                <p className="text-sm italic text-text-muted">{active.name_lat}</p>
              )}
              {active.side && (
                <p className="mt-2 text-xs text-text-muted">
                  {active.side === 'r' ? 'desno' : 'lijevo'}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => toggleLabels(active.id)}
              aria-label={labelsByPartId.has(active.id) ? 'Sakrij oznake' : 'Prikaži oznake'}
              title={labelsByPartId.has(active.id) ? 'Sakrij oznake' : 'Prikaži oznake'}
              className="shrink-0 rounded-md p-1.5 text-text-muted hover:bg-surface-2 hover:text-text-strong"
            >
              {labelsByPartId.has(active.id) ? <Eye size={16} /> : <EyeOff size={16} />}
            </button>
          </div>
        )}

        {extras.size > 0 && (
          <div className="flex shrink-0 flex-col gap-1.5 rounded-xl border border-border bg-surface p-2.5">
            <div className="flex items-center justify-between px-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                Odabrano · {extras.size}
              </p>
              <button
                type="button"
                onClick={clearExtras}
                className="rounded-md px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-text-muted hover:bg-surface-2 hover:text-warn"
              >
                Očisti sve
              </button>
            </div>
            <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto pr-1">
              {Array.from(extras).map((id) => {
                const part = catalog.parts.find((p) => p.id === id);
                if (!part) return null;
                const sys = catalog.systems.find((s) => s.id === part.system);
                const labelsOn = labelsByPartId.has(id);
                return (
                  <div
                    key={id}
                    className="flex items-center gap-1 rounded-full border border-border bg-bg py-0.5 pl-1.5 pr-0.5 text-[11px]"
                  >
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: sys?.tint }}
                    />
                    <button
                      type="button"
                      onClick={() => focusFromNeighbor(part)}
                      title="Postavi kao izabrano"
                      className="max-w-[140px] truncate text-text-strong hover:text-accent"
                    >
                      {part.name_en}
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleLabels(id)}
                      aria-label={labelsOn ? 'Sakrij oznake' : 'Prikaži oznake'}
                      title={labelsOn ? 'Sakrij oznake' : 'Prikaži oznake'}
                      className="rounded p-0.5 text-text-muted hover:text-text-strong"
                    >
                      {labelsOn ? <Eye size={11} /> : <EyeOff size={11} />}
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleExtra(id)}
                      aria-label="Ukloni"
                      title="Ukloni"
                      className="rounded p-0.5 text-text-muted hover:text-warn"
                    >
                      <XIcon size={11} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {neighbors && (
          <NeighborsPanel
            active={active}
            catalog={catalog}
            rows={unionedNeighbors}
            extras={extras}
            labelsByPartId={labelsByPartId}
            layerStacks={layerStacks}
            onToggle={toggleExtra}
            onToggleLabels={toggleLabels}
            onFocus={focusFromNeighbor}
            onExpandLayer={expandLayer}
            onCollapseLayer={collapseLayer}
          />
        )}
      </aside>

      <div className="min-h-0 flex-1 overflow-hidden p-2 sm:p-3 lg:p-0">
        <div className="relative h-full overflow-hidden rounded-2xl border border-border bg-surface">
          <AnatomyScene
            ref={sceneRef}
            system={activeSystem}
            activePartId={active.id}
            catalog={catalog}
            extras={extras}
            labelsByPartId={labelsByPartId}
            onPartClick={focusFromNeighbor}
          />
          <ModelLoadingOverlay />
          <div className="absolute bottom-4 right-4 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => sceneRef.current?.recenter()}
              aria-label="Centriraj"
              title="Centriraj na izolirani dio"
              className="flex size-10 items-center justify-center rounded-full border border-border bg-surface text-text-muted shadow-md transition-colors hover:bg-surface-2 hover:text-text-strong"
            >
              <Crosshair size={18} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Shown while any GLTF (the system glb or a cross-system extra) is streaming.
 *  drei's `useProgress` reads THREE.DefaultLoadingManager so this works for
 *  every loader started by `useGLTF`. */
function ModelLoadingOverlay() {
  const { active } = useProgress();
  if (!active) return null;
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-bg/30 backdrop-blur-sm">
      <div className="flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-sm text-text-muted shadow">
        <Loader2 size={14} className="animate-spin" /> Učitavam model…
      </div>
    </div>
  );
}

function SystemHints({ catalog }: { catalog: PartsCatalog }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {catalog.systems.map((s) => (
        <div
          key={s.id}
          className="flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2.5 text-sm"
        >
          <span
            className="size-3 rounded-full"
            aria-hidden
            style={{ backgroundColor: s.tint }}
          />
          <span className="font-medium text-text-strong">{s.label_hr}</span>
          <span className="ml-auto text-xs text-text-muted">{s.label_en}</span>
        </div>
      ))}
    </div>
  );
}

function EmptyCatalog() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-12 text-sm text-text-muted">
        <h1 className="text-2xl font-semibold tracking-tight text-text-strong">3D anatomija</h1>
        <p>
          Katalog dijelova još nije generiran. Pokreni izvoz iz Unityja da bi
          vidio modele:
        </p>
        <pre className="overflow-x-auto rounded-lg border border-border bg-surface p-3 text-xs">
          <code>
            {'cd /Users/pitfa19/Documents/Anatom3d\n'}
            {'blender --background --python tools/export_to_glb.py'}
          </code>
        </pre>
        <p>
          Skripta čita FBX-ove iz <code>Assets/Models/1.0 Models/</code>,
          producira <code>.glb</code> datoteke u{' '}
          <code>web-prototype/public/models/glb/</code> i generira{' '}
          <code>parts-catalog.json</code>.
        </p>
      </div>
    </div>
  );
}
