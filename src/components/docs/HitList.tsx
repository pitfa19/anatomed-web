import type { Hit } from '../../lib/types';

interface Props {
  hits: Hit[];
  selectedIdx: number | null;
  onPick: (idx: number) => void;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function snippetHtml(pre: string, match: string, post: string): string {
  return `${escapeHtml(pre)}<mark class="hl">${escapeHtml(match)}</mark>${escapeHtml(post)}`;
}

export default function HitList({ hits, selectedIdx, onPick }: Props) {
  if (hits.length === 0) return null;
  return (
    <ul className="flex flex-col gap-2">
      {hits.map((h, i) => {
        const isSel = i === selectedIdx;
        return (
          <li key={i}>
            <button
              onClick={() => onPick(i)}
              className={
                'w-full rounded-xl border p-3 text-left transition-colors ' +
                (isSel
                  ? 'border-accent bg-accent/10'
                  : 'border-border bg-surface hover:border-accent/40 hover:bg-surface-2')
              }
            >
              <div className="mb-1 flex items-center justify-between">
                <span className="rounded bg-bg px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-text-muted">
                  Stranica {h.page}
                </span>
                {h.exact && (
                  <span className="rounded bg-accent-2/15 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-accent-2">
                    Točno
                  </span>
                )}
              </div>
              <p
                className="text-sm leading-relaxed text-text"
                dangerouslySetInnerHTML={{ __html: snippetHtml(h.pre, h.match, h.post) }}
              />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
