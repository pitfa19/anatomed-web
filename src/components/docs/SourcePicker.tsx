import type { SourceMeta, Hit } from '../../lib/types';
import { ChevronRight, Trash2 } from 'lucide-react';
import { useT, plural } from '../../lib/i18n';

interface Props {
  /** When null we render the picker in browse mode (any source clickable, shows page count). */
  term: string | null;
  /** Per-source hit list. Empty when term is null. */
  hitsByDoc: Record<string, Hit[]>;
  /** Page count by doc, used for browse-mode subtitle. */
  pagesByDoc: Record<string, number>;
  sources: SourceMeta[];
  selected: string | null;
  onSelect: (doc: string) => void;
  /** "compact" = small cards in side rail; "hero" = big cards on landing screen. */
  variant?: 'compact' | 'hero';
  /** Doc names that are user-uploaded (deletable). */
  localDocs?: Set<string>;
  /** Delete handler for local docs. */
  onDelete?: (doc: string) => void;
}

export default function SourcePicker({
  term,
  hitsByDoc,
  pagesByDoc,
  sources,
  selected,
  onSelect,
  variant = 'compact',
  localDocs,
  onDelete,
}: Props) {
  const t = useT();
  const isBrowse = !term;
  const totalHits = isBrowse
    ? 0
    : Object.values(hitsByDoc).reduce((acc, arr) => acc + arr.length, 0);

  if (!isBrowse && totalHits === 0) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-8 text-center">
        <p className="text-base text-text-muted">
          {t('docs.noResultsFor', { term: term ?? '' })}
        </p>
      </div>
    );
  }

  const isHero = variant === 'hero';

  return (
    <div
      className={
        isHero
          ? 'grid grid-cols-1 gap-3 sm:grid-cols-2'
          : 'grid grid-cols-2 gap-2 lg:grid-cols-1 xl:grid-cols-2'
      }
    >
      {sources.map((src) => {
        const hits = hitsByDoc[src.doc] ?? [];
        const has = isBrowse ? true : hits.length > 0;
        const isSel = selected === src.doc;
        const isLocal = localDocs?.has(src.doc) ?? false;
        const showDelete = isLocal && !!onDelete;
        const pageCount = pagesByDoc[src.doc] ?? 0;
        const stat = isBrowse
          ? plural(t.lang, pageCount, {
              one: t('docs.pagesCountOne', { n: pageCount }),
              few: t('docs.pagesCountFew', { n: pageCount }),
              many: t('docs.pagesCountMany', { n: pageCount }),
            })
          : has
          ? plural(t.lang, hits.length, {
              one: t('docs.resultsCountOne', { n: hits.length }),
              few: t('docs.resultsCountFew', { n: hits.length }),
              many: t('docs.resultsCountMany', { n: hits.length }),
            })
          : t('docs.noResults');
        return (
          <div key={src.doc} className="relative">
            <button
              type="button"
              disabled={!has}
              onClick={() => onSelect(src.doc)}
              className={
                (isHero
                  ? 'group flex w-full items-center gap-4 rounded-2xl border p-5 text-left transition-all '
                  : 'group flex w-full items-center justify-between rounded-xl border p-3 text-left transition-colors ') +
                (isSel
                  ? 'border-accent bg-accent/10'
                  : has
                  ? 'border-border bg-surface hover:-translate-y-0.5 hover:border-accent/40 hover:bg-surface-2 hover:shadow-sm'
                  : 'cursor-not-allowed border-border bg-surface opacity-40')
              }
            >
              <span
                className={
                  'flex shrink-0 items-center justify-center rounded-xl font-semibold text-white ' +
                  (isHero ? 'size-14 text-base' : 'size-9 text-xs')
                }
                style={{ background: src.color }}
              >
                {src.badge}
              </span>
              <div className="flex-1 min-w-0">
                <div
                  className={
                    'truncate font-semibold text-text-strong ' +
                    (isHero ? 'text-lg' : 'text-sm')
                  }
                >
                  {src.label}
                </div>
                <div className={isHero ? 'text-sm text-text-muted' : 'text-xs text-text-muted'}>
                  {stat}
                </div>
              </div>
              {isHero && has && !showDelete && (
                <ChevronRight
                  size={20}
                  className="text-text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-accent"
                />
              )}
            </button>
            {showDelete && (
              <button
                type="button"
                aria-label={t('docs.deleteSource', { label: src.label })}
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm(t('docs.deleteSourceConfirm', { label: src.label }))) {
                    onDelete!(src.doc);
                  }
                }}
                className={
                  'absolute rounded-md p-1.5 text-text-muted transition-colors hover:bg-warn/10 hover:text-warn ' +
                  (isHero ? 'right-3 top-3' : 'right-2 top-2')
                }
              >
                <Trash2 size={isHero ? 16 : 14} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
