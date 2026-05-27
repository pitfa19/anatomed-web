import { useEffect, useRef } from 'react';
import { cn } from '../../lib/cn';
import { useT } from '../../lib/i18n';

interface Props {
  totalPages: number;
  currentPage: number;
  onPick: (page: number) => void;
}

export default function PageList({ totalPages, currentPage, onPick }: Props) {
  const t = useT();
  const ref = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const el = ref.current?.querySelector(`[data-page="${currentPage}"]`) as HTMLElement | null;
    el?.scrollIntoView({ block: 'nearest' });
  }, [currentPage]);

  return (
    <div className="flex min-h-0 flex-col">
      <p className="mb-1.5 text-xs uppercase tracking-wider text-text-muted">{t('docs.pages')}</p>
      <ul
        ref={ref}
        className="flex-1 overflow-y-auto rounded-lg border border-border bg-surface"
      >
        {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => {
          const isSel = p === currentPage;
          return (
            <li key={p}>
              <button
                data-page={p}
                onClick={() => onPick(p)}
                className={cn(
                  'flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm transition-colors sm:py-1.5',
                  isSel
                    ? 'bg-accent/15 text-text-strong'
                    : 'text-text hover:bg-surface-2',
                )}
              >
                <span>{t('docs.page', { n: p })}</span>
                {isSel && <span className="text-[10px] uppercase tracking-wider text-accent">{t('docs.currentPage')}</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
