import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Loader2, ArrowLeft, X as XIcon, Crosshair, BookOpen, Eye, EyeOff, Plus } from 'lucide-react';
import { useGLTF, useProgress } from '@react-three/drei';
import { cn } from '../lib/cn';
import { useT } from '../lib/i18n';
import PartSearchBar from '../components/viewer/PartSearchBar';
import AnatomyScene, { type AnatomySceneHandle } from '../components/viewer/AnatomyScene';
import NeighborsPanel from '../components/viewer/NeighborsPanel';
import { getSystem, loadCatalog, loadNeighbors } from '../lib/viewer/catalog';
import { fuzzyMatch, loadUnifiedIndex } from '../lib/data';
import type { UnifiedIndex } from '../lib/types';
import type { Neighbor, NeighborMap, Part, PartsCatalog, SystemId, SystemMeta } from '../lib/viewer/types';

export default function Viewer() {
  const t = useT();
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
  }

  const STEP = 6;

  /** Reveal more (dir +1) or fewer (dir −1) structures of one system, anchored
   *  to the ACTIVE part's neighbour list (sorted by distance). Predictable and
   *  per-system independent — `+` adds the next `STEP` nearest of that system
   *  not yet shown; `−` removes the `STEP` farthest currently shown. */
  function stepSystem(systemId: SystemId, dir: 1 | -1) {
    if (!neighbors || !active) return;
    const ids = (neighbors[active.id] ?? [])
      .filter((n) => n.system === systemId)
      .map((n) => n.id); // already sorted nearest → farthest
    if (ids.length === 0) return;

    if (dir > 0) {
      const toAdd: string[] = [];
      for (const id of ids) {
        if (!extras.has(id)) {
          toAdd.push(id);
          if (toAdd.length >= STEP) break;
        }
      }
      if (toAdd.length === 0) return;
      setExtras((prev) => {
        const next = new Set(prev);
        for (const id of toAdd) next.add(id);
        return next;
      });
    } else {
      const toRemove: string[] = [];
      for (let i = ids.length - 1; i >= 0 && toRemove.length < STEP; i--) {
        if (extras.has(ids[i]!)) toRemove.push(ids[i]!);
      }
      if (toRemove.length === 0) return;
      setExtras((prev) => {
        const next = new Set(prev);
        for (const id of toRemove) next.delete(id);
        return next;
      });
      setLabelsByPartId((prev) => {
        let changed = false;
        const next = new Set(prev);
        for (const id of toRemove) if (next.delete(id)) changed = true;
        return changed ? next : prev;
      });
    }
  }

  /** One-shot version of stepSystem: reveal EVERY neighbour of a system at
   *  once, or clear them all if already fully shown. The ±STEP stepper stays
   *  for fine control; this is for users who find it too slow. Cheap because
   *  reveal is just `.visible` flips (see the rendering architecture). */
  function toggleSystemAll(systemId: SystemId) {
    if (!neighbors || !active) return;
    const ids = (neighbors[active.id] ?? [])
      .filter((n) => n.system === systemId)
      .map((n) => n.id);
    if (ids.length === 0) return;
    const allShown = ids.every((id) => extras.has(id));
    if (allShown) {
      setExtras((prev) => {
        const next = new Set(prev);
        for (const id of ids) next.delete(id);
        return next;
      });
      setLabelsByPartId((prev) => {
        let changed = false;
        const next = new Set(prev);
        for (const id of ids) if (next.delete(id)) changed = true;
        return changed ? next : prev;
      });
    } else {
      setExtras((prev) => {
        const next = new Set(prev);
        for (const id of ids) next.add(id);
        return next;
      });
    }
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
    setDrawerOpen(false);
  }

  /** Search-bar pick → start fresh: clear all extras, labels, layers,
   *  and set new active. */
  function freshSearch(part: Part) {
    setExtras(new Set());
    setLabelsByPartId(new Set());
    setActive(part);
    setDrawerOpen(false);
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
    setActive(part);
  }

  /** Reset to landing. */
  function clearAll() {
    setExtras(new Set());
    setLabelsByPartId(new Set());
    setActive(null);
    setLandingQuery('');
    setDrawerOpen(false);
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

  // The active part's neighbours, sorted nearest → farthest, excluding only the
  // active itself. Anchored to the active part (not the shifting union of
  // extras) so per-system stepping is predictable. Already-ticked parts stay in
  // the list so they show ticked and can be unticked inline.
  const activeNeighbors = useMemo<Neighbor[]>(() => {
    if (!neighbors || !active) return [];
    return (neighbors[active.id] ?? [])
      .filter((n) => n.id !== active.id)
      .slice()
      .sort((a, b) => a.dist - b.dist);
  }, [neighbors, active]);

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-sm text-warn">
        {t('viewer.catalogError', { error })}
      </div>
    );
  }

  if (!catalog) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-text-muted">
        <Loader2 size={16} className="animate-spin" /> {t('viewer.loadingCatalog')}
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
          <Loader2 size={16} className="animate-spin" /> {t('viewer.loadingPart', { name: pendingPart.name_en })}
        </div>
      );
    }
    return (
      <div className="h-full overflow-y-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:gap-8 sm:px-8 sm:py-16">
          <div className="flex flex-col gap-2 text-center">
            <h1 className="text-2xl font-semibold tracking-tight text-text-strong sm:text-4xl">
              {t('viewer.title')}
            </h1>
            <p className="text-sm text-text-muted sm:text-base">
              {t('viewer.landingHint')}
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
              {t('viewer.findInNotes', { term: pdfMatches[0]! })}
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
          aria-label={t('viewer.closeMenu')}
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
            <ArrowLeft size={14} /> {t('viewer.search')}
          </button>
          <button
            onClick={() => setDrawerOpen(false)}
            aria-label={t('viewer.closeMenu')}
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
                  {active.side === 'r' ? t('viewer.sideRight') : t('viewer.sideLeft')}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => toggleLabels(active.id)}
              aria-label={labelsByPartId.has(active.id) ? t('viewer.hideLabels') : t('viewer.showLabels')}
              title={labelsByPartId.has(active.id) ? t('viewer.hideLabels') : t('viewer.showLabels')}
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
                {t('viewer.selectedCount', { n: extras.size })}
              </p>
              <button
                type="button"
                onClick={clearExtras}
                className="rounded-md px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-text-muted hover:bg-surface-2 hover:text-warn"
              >
                {t('viewer.clearAll')}
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
                      title={t('viewer.setAsActive')}
                      className="max-w-[140px] truncate text-text-strong hover:text-accent"
                    >
                      {part.name_en}
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleLabels(id)}
                      aria-label={labelsOn ? t('viewer.hideLabels') : t('viewer.showLabels')}
                      title={labelsOn ? t('viewer.hideLabels') : t('viewer.showLabels')}
                      className="rounded p-0.5 text-text-muted hover:text-text-strong"
                    >
                      {labelsOn ? <Eye size={11} /> : <EyeOff size={11} />}
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleExtra(id)}
                      aria-label={t('viewer.remove')}
                      title={t('viewer.remove')}
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
            rows={activeNeighbors}
            extras={extras}
            labelsByPartId={labelsByPartId}
            onToggle={toggleExtra}
            onToggleLabels={toggleLabels}
            onToggleAll={toggleSystemAll}
            onFocus={focusFromNeighbor}
            onStep={stepSystem}
          />
        )}
      </aside>

      <div className="min-h-0 flex-1 overflow-hidden p-2 pb-20 sm:p-3 sm:pb-20 lg:p-0 lg:pb-0">
        <div className="relative h-full overflow-hidden rounded-2xl border border-border bg-surface">
          <AnatomyScene
            ref={sceneRef}
            activePartId={active.id}
            catalog={catalog}
            extras={extras}
            labelsByPartId={labelsByPartId}
            onPartClick={focusFromNeighbor}
          />
          <ModelLoadingOverlay />
          <div className="absolute right-4 bottom-4 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => sceneRef.current?.recenter()}
              aria-label={t('viewer.recenter')}
              title={t('viewer.recenterTitle')}
              className="flex size-11 items-center justify-center rounded-full border border-border bg-surface text-text-muted shadow-md transition-colors hover:bg-surface-2 hover:text-text-strong lg:size-10"
            >
              <Crosshair size={18} />
            </button>
          </div>
        </div>
      </div>

      <MobileDock
        active={active}
        activeSystem={activeSystem}
        catalog={catalog}
        extras={extras}
        onOpenDrawer={() => setDrawerOpen(true)}
        onFocusExtra={focusFromNeighbor}
        onRemoveExtra={toggleExtra}
      />
    </div>
  );
}

interface MobileDockProps {
  active: Part;
  activeSystem: SystemMeta | null;
  catalog: PartsCatalog;
  extras: Set<string>;
  onOpenDrawer: () => void;
  onFocusExtra: (part: Part) => void;
  onRemoveExtra: (id: string) => void;
}

/** Persistent bottom dock on mobile only. Always visible on the canvas, lets
 *  the user swap/remove selected parts in one tap without opening the drawer.
 *  Hidden at lg+ since the desktop sidebar already exposes everything. */
function MobileDock({
  active,
  activeSystem,
  catalog,
  extras,
  onOpenDrawer,
  onFocusExtra,
  onRemoveExtra,
}: MobileDockProps) {
  const t = useT();
  const extraParts = useMemo(() => {
    const byId = new Map(catalog.parts.map((p) => [p.id, p]));
    const out: Part[] = [];
    for (const id of extras) {
      const p = byId.get(id);
      if (p) out.push(p);
    }
    return out;
  }, [extras, catalog]);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] lg:hidden">
      <div className="pointer-events-auto flex items-center gap-1.5 rounded-2xl border border-border bg-surface/95 p-1.5 shadow-lg backdrop-blur">
        <button
          type="button"
          onClick={onOpenDrawer}
          aria-label={t('viewer.openActiveDetails')}
          className="flex h-11 min-w-0 max-w-[40%] shrink-0 items-center gap-1.5 rounded-xl px-2 text-left text-text-strong active:bg-surface-2"
        >
          <span
            className="size-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: activeSystem?.tint }}
          />
          <span className="min-w-0 truncate text-sm font-medium">{active.name_en}</span>
        </button>

        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {extraParts.length === 0 ? (
            <span className="px-1 text-[11px] text-text-muted">
              {t('viewer.addNeighbors')}
            </span>
          ) : (
            extraParts.map((p) => {
              const sys = catalog.systems.find((s) => s.id === p.system);
              return (
                <div
                  key={p.id}
                  className="flex h-9 shrink-0 items-center gap-0.5 rounded-full border border-border bg-bg pl-2 text-xs"
                >
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: sys?.tint }}
                  />
                  <button
                    type="button"
                    onClick={() => onFocusExtra(p)}
                    title={t('viewer.setAsActive')}
                    className="max-w-[110px] truncate px-1.5 text-text-strong"
                  >
                    {p.name_en}
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemoveExtra(p.id)}
                    aria-label={t('viewer.removeNamed', { name: p.name_en })}
                    className="flex size-8 items-center justify-center rounded-full text-text-muted hover:text-warn"
                  >
                    <XIcon size={14} />
                  </button>
                </div>
              );
            })
          )}
        </div>

        <button
          type="button"
          onClick={onOpenDrawer}
          aria-label={t('viewer.addParts')}
          className="flex h-11 shrink-0 items-center gap-1 rounded-xl bg-accent/15 px-3 text-sm font-medium text-accent active:bg-accent/25"
        >
          <Plus size={16} /> {t('viewer.add')}
        </button>
      </div>
    </div>
  );
}

/** Shown while any GLTF (the system glb or a cross-system extra) is streaming.
 *  drei's `useProgress` reads THREE.DefaultLoadingManager so this works for
 *  every loader started by `useGLTF`. */
function ModelLoadingOverlay() {
  const t = useT();
  const { active } = useProgress();
  if (!active) return null;
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-bg/30 backdrop-blur-sm">
      <div className="flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-sm text-text-muted shadow">
        <Loader2 size={14} className="animate-spin" /> {t('viewer.loadingModel')}
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
  const t = useT();
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-12 text-sm text-text-muted">
        <h1 className="text-2xl font-semibold tracking-tight text-text-strong">{t('viewer.title')}</h1>
        <p>
          {t('viewer.emptyCatalogIntro')}
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
