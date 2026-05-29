import { useMemo, useState } from 'react';
import { Check, Crosshair, Eye, EyeOff, Minus, Plus } from 'lucide-react';
import { useT } from '../../lib/i18n';
import type {
  Neighbor,
  NeighborMap,
  Part,
  PartsCatalog,
  SystemId,
  SystemMeta,
} from '../../lib/viewer/types';

interface Props {
  active: Part;
  catalog: PartsCatalog;
  /** Precomputed union of neighbors across active + all extras, deduped by
   *  min distance, with selected parts already filtered out. */
  /** The active part's neighbours, sorted nearest→farthest (includes ticked). */
  rows: Neighbor[];
  extras: Set<string>;
  labelsByPartId: ReadonlySet<string>;
  onToggle: (partId: string) => void;
  onToggleLabels: (partId: string) => void;
  onFocus: (part: Part) => void;
  /** Reveal more (+1) / fewer (−1) of a system, anchored to the active part. */
  onStep: (systemId: SystemId, dir: 1 | -1) => void;
  /** Reveal every neighbour of a system at once, or clear them all. */
  onToggleAll: (systemId: SystemId) => void;
}

interface Group {
  system: SystemMeta;
  rows: Array<{ neighbor: Neighbor; part: Part }>;
}

export default function NeighborsPanel({
  active,
  catalog,
  rows,
  extras,
  labelsByPartId,
  onToggle,
  onToggleLabels,
  onFocus,
  onStep,
  onToggleAll,
}: Props) {
  const t = useT();
  const partsById = useMemo(() => {
    const m = new Map<string, Part>();
    for (const p of catalog.parts) m.set(p.id, p);
    return m;
  }, [catalog]);

  const systemsById = useMemo(() => {
    const m = new Map<SystemId, SystemMeta>();
    for (const s of catalog.systems) m.set(s.id, s);
    return m;
  }, [catalog]);

  const groups = useMemo<Group[]>(() => {
    const buckets = new Map<SystemId, Group['rows']>();
    for (const n of rows) {
      const part = partsById.get(n.id);
      if (!part) continue;
      const arr = buckets.get(n.system) ?? [];
      arr.push({ neighbor: n, part });
      buckets.set(n.system, arr);
    }
    const out: Group[] = [];
    for (const sys of catalog.systems) {
      const grp = buckets.get(sys.id);
      if (!grp || grp.length === 0) continue;
      out.push({ system: sys, rows: grp.sort((a, b) => a.neighbor.dist - b.neighbor.dist) });
    }
    return out;
  }, [rows, catalog.systems, partsById]);

  const defaultSystem = useMemo(() => {
    if (groups.find((g) => g.system.id === active.system)) return active.system;
    return groups[0]?.system.id ?? null;
  }, [groups, active.system]);

  const [selected, setSelected] = useState<SystemId | null>(defaultSystem);
  // Re-sync default when active part changes - without a controlled key the
  // useState above persists across renders.
  const [lastActive, setLastActive] = useState(active.id);
  if (lastActive !== active.id) {
    setLastActive(active.id);
    setSelected(defaultSystem);
  }

  if (groups.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface p-3 text-xs text-text-muted">
        {t('viewer.noNeighbors')}
      </div>
    );
  }

  const activeGroup = groups.find((g) => g.system.id === selected) ?? groups[0]!;
  const shownInSystem = activeGroup.rows.filter((r) => extras.has(r.part.id)).length;
  const totalInSystem = activeGroup.rows.length;
  const canExpand = shownInSystem < totalInSystem;
  const canCollapse = shownInSystem > 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
          {t('viewer.neighbors')}
        </h2>
        {extras.size > 0 && (
          <span className="text-[10px] text-text-muted">{t('viewer.neighborsSelected', { n: extras.size })}</span>
        )}
      </div>

      <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 lg:flex-wrap lg:overflow-visible lg:pb-0">
        {groups.map((g) => {
          const isSel = g.system.id === activeGroup.system.id;
          const ticked = g.rows.filter((r) => extras.has(r.part.id)).length;
          return (
            <button
              key={g.system.id}
              type="button"
              onClick={() => setSelected(g.system.id)}
              className={
                'flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors lg:px-2 lg:py-1 lg:text-[11px] ' +
                (isSel
                  ? 'border-accent bg-accent/15 text-text-strong'
                  : 'border-border bg-surface text-text-muted hover:bg-surface-2 hover:text-text-strong')
              }
            >
              <span className="size-2 rounded-full" style={{ backgroundColor: g.system.tint }} />
              <span>{g.system.label_hr}</span>
              <span className="text-text-muted">·</span>
              <span>{g.rows.length}</span>
              {ticked > 0 && (
                <span className="ml-0.5 rounded-full bg-accent/30 px-1 text-[9px] text-text-strong">
                  {ticked}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between px-1">
        <span className="text-[10px] uppercase tracking-wider text-text-muted">
          {t('viewer.shown', { n: shownInSystem, total: totalInSystem })}
          <span className="ml-1 text-text-muted/70 normal-case tracking-normal">· {activeGroup.system.label_hr}</span>
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onToggleAll(activeGroup.system.id)}
            aria-pressed={!canExpand}
            title={
              canExpand
                ? t('viewer.showAllSystemTitle', { system: activeGroup.system.label_hr })
                : t('viewer.clearSystemTitle', { system: activeGroup.system.label_hr })
            }
            className={
              'mr-0.5 flex h-9 items-center rounded-md border px-2 text-[11px] font-medium transition-colors lg:h-6 ' +
              (!canExpand
                ? 'border-accent bg-accent/15 text-accent'
                : 'border-border bg-surface text-text-muted hover:bg-surface-2 hover:text-text-strong')
            }
          >
            {t('viewer.showAllSystem')}
          </button>
          <button
            type="button"
            onClick={() => onStep(activeGroup.system.id, -1)}
            disabled={!canCollapse}
            title={t('viewer.collapseLayerTitle')}
            aria-label={t('viewer.collapseLayer')}
            className="flex size-9 items-center justify-center rounded-md border border-border bg-surface text-text-muted transition-colors hover:bg-surface-2 hover:text-text-strong disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-surface disabled:hover:text-text-muted lg:size-6"
          >
            <Minus size={14} className="lg:hidden" />
            <Minus size={12} className="hidden lg:block" />
          </button>
          <button
            type="button"
            onClick={() => onStep(activeGroup.system.id, 1)}
            disabled={!canExpand}
            title={t('viewer.expandLayerTitle')}
            aria-label={t('viewer.expandLayer')}
            className="flex size-9 items-center justify-center rounded-md border border-border bg-surface text-text-muted transition-colors hover:bg-surface-2 hover:text-text-strong disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-surface disabled:hover:text-text-muted lg:size-6"
          >
            <Plus size={14} className="lg:hidden" />
            <Plus size={12} className="hidden lg:block" />
          </button>
        </div>
      </div>

      <ul className="min-h-0 flex-1 overflow-y-auto pr-1">
        {activeGroup.rows.map(({ neighbor, part }) => {
          const ticked = extras.has(part.id);
          const labelsOn = labelsByPartId.has(part.id);
          const sys = systemsById.get(neighbor.system);
          return (
            <li key={part.id}>
              <div
                className={
                  'group flex min-h-11 items-stretch gap-1 rounded-lg border text-sm transition-colors lg:min-h-0 ' +
                  (ticked
                    ? 'border-accent/50 bg-accent/10'
                    : 'border-transparent hover:bg-surface-2')
                }
              >
                <button
                  type="button"
                  onClick={() => onToggle(part.id)}
                  aria-pressed={ticked}
                  aria-label={ticked ? t('viewer.removeNamed', { name: part.name_en }) : t('viewer.addNamed', { name: part.name_en })}
                  className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-l-lg px-2 py-1 text-left active:bg-accent/15"
                >
                  <span
                    className={
                      'flex size-5 shrink-0 items-center justify-center rounded border transition-colors lg:size-4 ' +
                      (ticked
                        ? 'border-transparent text-bg'
                        : 'border-border bg-surface text-transparent')
                    }
                    style={ticked ? { backgroundColor: sys?.tint ?? 'var(--accent)' } : undefined}
                    aria-hidden="true"
                  >
                    <Check size={12} strokeWidth={3} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-text-strong">{part.name_en}</span>
                    {part.name_lat && part.name_lat !== part.name_en && (
                      <span className="block truncate text-[11px] italic text-text-muted">
                        {part.name_lat}
                      </span>
                    )}
                  </span>
                </button>
                {ticked && (
                  <button
                    type="button"
                    onClick={() => onToggleLabels(part.id)}
                    title={labelsOn ? t('viewer.hideLabels') : t('viewer.showLabels')}
                    aria-label={labelsOn ? t('viewer.hideLabels') : t('viewer.showLabels')}
                    className="flex size-9 shrink-0 items-center justify-center rounded text-text-muted hover:text-text-strong lg:size-7"
                  >
                    {labelsOn ? <Eye size={16} className="lg:hidden" /> : <EyeOff size={16} className="lg:hidden" />}
                    {labelsOn ? <Eye size={14} className="hidden lg:block" /> : <EyeOff size={14} className="hidden lg:block" />}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onFocus(part)}
                  title={t('viewer.setAsActive')}
                  aria-label={t('viewer.setAsActiveNamed', { name: part.name_en })}
                  className="flex size-9 shrink-0 items-center justify-center rounded-r-lg text-text-muted hover:text-text-strong lg:size-7 lg:opacity-0 lg:group-hover:opacity-100"
                >
                  <Crosshair size={16} className="lg:hidden" />
                  <Crosshair size={12} className="hidden lg:block" />
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {extras.size === 0 && (
        <p className="px-1 pb-1 text-[10px] text-text-muted">
          {t('viewer.neighborsHint')}
        </p>
      )}
    </div>
  );
}

// Re-export for convenience
export type { NeighborMap };
