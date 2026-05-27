import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDown, Box, ChevronRight } from 'lucide-react';
import type { UnifiedIndex } from '../../lib/types';
import type { Part, PartsCatalog } from '../../lib/viewer/types';
import { findCatalogPartByTermAnyCase } from '../../lib/viewer/catalog';
import {
  docHasAnyCatalogMatch,
  getTermsForPage,
  nextPageWithCatalogMatch,
} from '../../lib/docs/pageTermIndex';
import { useT } from '../../lib/i18n';

interface Props {
  doc: string;
  page: number;
  unified: UnifiedIndex;
  catalog: PartsCatalog | null;
  onGotoPage: (page: number) => void;
}

interface Item {
  part: Part;
  label: string;
}

export default function OnThisPagePanel({ doc, page, unified, catalog, onGotoPage }: Props) {
  const t = useT();
  const items = useMemo<Item[]>(() => {
    if (!catalog) return [];
    const seen = new Set<string>();
    const out: Item[] = [];
    for (const term of getTermsForPage(unified, doc, page)) {
      const part = findCatalogPartByTermAnyCase(catalog, term);
      if (!part || seen.has(part.id)) continue;
      seen.add(part.id);
      out.push({ part, label: part.name_lat || part.name_en || term });
    }
    return out;
  }, [unified, doc, page, catalog]);

  if (items.length === 0) {
    if (!catalog || !docHasAnyCatalogMatch(unified, catalog, doc)) {
      return (
        <section className="rounded-lg border border-border bg-surface px-3 py-2 text-xs text-text-muted">
          {t('docs.noIndexed3d')}
        </section>
      );
    }
    const nextPage = nextPageWithCatalogMatch(unified, catalog, doc, page);
    return (
      <section className="rounded-lg border border-border bg-surface">
        <header className="flex items-center justify-between px-3 py-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
            {t('docs.onThisPage')}
          </span>
          <span className="text-[11px] text-text-muted">0</span>
        </header>
        {nextPage !== null && (
          <button
            type="button"
            onClick={() => onGotoPage(nextPage)}
            className="flex w-full items-center gap-2 border-t border-border px-3 py-2 text-left text-xs text-accent hover:bg-surface-2"
          >
            <ArrowDown size={12} className="shrink-0" />
            <span className="flex-1">
              {t('docs.nextPageWith3d')}{' '}
              <strong className="font-semibold">{t('docs.pageShort', { n: nextPage })}</strong>
            </span>
          </button>
        )}
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-border bg-surface">
      <header className="flex items-center justify-between px-3 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
          Na ovoj stranici
        </span>
        <span className="text-[11px] text-text-muted">{items.length}</span>
      </header>
      <ul className="border-t border-border">
        {items.map(({ part, label }) => (
          <li key={part.id}>
            <Link
              to={`/viewer?part=${encodeURIComponent(part.id)}`}
              className="flex items-center gap-2 px-3 py-2 text-sm text-text hover:bg-surface-2"
            >
              <Box size={13} className="shrink-0 text-accent" />
              <span className="flex-1 truncate">{label}</span>
              <ChevronRight size={13} className="shrink-0 text-text-muted" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
