import type { NotesEntry } from '../../lib/types';
import { useT } from '../../lib/i18n';

interface Props {
  notes: NotesEntry[];
}

export default function NotesTab({ notes }: Props) {
  const t = useT();
  if (notes.length === 0) {
    return <p className="text-sm text-text-muted">{t('revise.noNotes')}</p>;
  }
  return (
    <div className="flex flex-col gap-5">
      {notes.map((n, i) => (
        <section
          key={i}
          className="rounded-xl border border-border bg-surface p-4"
        >
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-accent">
            {n.heading}
          </h3>
          <ul className="flex flex-col gap-1.5">
            {n.bullets.map((b, j) => (
              <li
                key={j}
                className="text-sm leading-relaxed text-text"
                style={{ paddingLeft: b.indent * 16 }}
              >
                <span className="mr-2 text-text-muted">•</span>
                {b.text}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
