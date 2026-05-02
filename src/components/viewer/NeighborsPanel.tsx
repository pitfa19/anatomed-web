import { useMemo, useState } from 'react';
import { Crosshair, Eye, EyeOff, Minus, Plus } from 'lucide-react';
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
  rows: Neighbor[];
  extras: Set<string>;
  labelsByPartId: ReadonlySet<string>;
  /** Per-system BFS expansion stacks; depth = layerStacks[systemId].length. */
  layerStacks: Record<string, string[][]>;
  onToggle: (partId: string) => void;
  onToggleLabels: (partId: string) => void;
  onFocus: (part: Part) => void;
  onExpandLayer: (systemId: SystemId) => void;
  onCollapseLayer: (systemId: SystemId) => void;
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
  layerStacks,
  onToggle,
  onToggleLabels,
  onFocus,
  onExpandLayer,
  onCollapseLayer,
}: Props) {
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
  // Re-sync default when active part changes — without a controlled key the
  // useState above persists across renders.
  const [lastActive, setLastActive] = useState(active.id);
  if (lastActive !== active.id) {
    setLastActive(active.id);
    setSelected(defaultSystem);
  }

  if (groups.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface p-3 text-xs text-text-muted">
        Nema susjeda za prikaz.
      </div>
    );
  }

  const activeGroup = groups.find((g) => g.system.id === selected) ?? groups[0]!;
  const layerDepth = (layerStacks[activeGroup.system.id] ?? []).length;
  // Frontier === rows: `rows` already excludes selected parts, so a non-empty
  // active group implies there's something to expand into.
  const canExpand = activeGroup.rows.length > 0;
  const canCollapse = layerDepth > 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
          Susjedi
        </h2>
        {extras.size > 0 && (
          <span className="text-[10px] text-text-muted">{extras.size} odabrano</span>
        )}
      </div>

      <div className="flex flex-wrap gap-1">
        {groups.map((g) => {
          const isSel = g.system.id === activeGroup.system.id;
          const ticked = g.rows.filter((r) => extras.has(r.part.id)).length;
          return (
            <button
              key={g.system.id}
              type="button"
              onClick={() => setSelected(g.system.id)}
              className={
                'flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] transition-colors ' +
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
          Sloj {layerDepth}
          <span className="ml-1 text-text-muted/70 normal-case tracking-normal">· {activeGroup.system.label_hr}</span>
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onCollapseLayer(activeGroup.system.id)}
            disabled={!canCollapse}
            title="Skupi posljednji sloj"
            aria-label="Skupi sloj"
            className="flex size-6 items-center justify-center rounded-md border border-border bg-surface text-text-muted transition-colors hover:bg-surface-2 hover:text-text-strong disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-surface disabled:hover:text-text-muted"
          >
            <Minus size={12} />
          </button>
          <button
            type="button"
            onClick={() => onExpandLayer(activeGroup.system.id)}
            disabled={!canExpand}
            title="Proširi za jedan sloj"
            aria-label="Proširi sloj"
            className="flex size-6 items-center justify-center rounded-md border border-border bg-surface text-text-muted transition-colors hover:bg-surface-2 hover:text-text-strong disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-surface disabled:hover:text-text-muted"
          >
            <Plus size={12} />
          </button>
        </div>
      </div>

      <ul className="min-h-0 flex-1 overflow-y-auto pr-1">
        {activeGroup.rows.map(({ neighbor, part }) => {
          const ticked = extras.has(part.id);
          const labelsOn = labelsByPartId.has(part.id);
          const distCm = Math.round(neighbor.dist * 100);
          const sys = systemsById.get(neighbor.system);
          return (
            <li key={part.id}>
              <div
                className={
                  'group flex items-start gap-2 rounded-lg border px-2 py-1.5 text-sm transition-colors ' +
                  (ticked
                    ? 'border-accent/50 bg-accent/10'
                    : 'border-transparent hover:bg-surface-2')
                }
              >
                <input
                  type="checkbox"
                  className="mt-1 cursor-pointer"
                  checked={ticked}
                  onChange={() => onToggle(part.id)}
                  style={{ accentColor: sys?.tint }}
                  aria-label={`Prikaži ${part.name_en} u 3D`}
                />
                <button
                  type="button"
                  onClick={() => onFocus(part)}
                  title="Postavi kao izabrano"
                  className="flex min-w-0 flex-1 cursor-pointer items-start gap-1 text-left"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-text-strong">{part.name_en}</span>
                    {part.name_lat && part.name_lat !== part.name_en && (
                      <span className="block truncate text-[11px] italic text-text-muted">
                        {part.name_lat}
                      </span>
                    )}
                  </span>
                  <Crosshair
                    size={12}
                    className="mt-1 shrink-0 text-text-muted opacity-0 transition-opacity group-hover:opacity-100"
                  />
                </button>
                {ticked && (
                  <button
                    type="button"
                    onClick={() => onToggleLabels(part.id)}
                    title={labelsOn ? 'Sakrij oznake' : 'Prikaži oznake'}
                    aria-label={labelsOn ? 'Sakrij oznake' : 'Prikaži oznake'}
                    className="mt-0.5 shrink-0 rounded p-0.5 text-text-muted hover:text-text-strong"
                  >
                    {labelsOn ? <Eye size={14} /> : <EyeOff size={14} />}
                  </button>
                )}
                <span className="shrink-0 text-[10px] text-text-muted">{distCm} cm</span>
              </div>
            </li>
          );
        })}
      </ul>

      {extras.size === 0 && (
        <p className="px-1 pb-1 text-[10px] text-text-muted">
          Označi susjedne dijelove ili koristi <Plus size={10} className="inline" /> za proširenje sloja.
        </p>
      )}
    </div>
  );
}

// Re-export for convenience
export type { NeighborMap };
