import { ExternalLink } from 'lucide-react';
import type { LinksGroup } from '../../lib/types';

interface Props {
  links: LinksGroup[];
}

export default function LinksTab({ links }: Props) {
  if (links.length === 0) {
    return <p className="text-sm text-text-muted">Nema linkova.</p>;
  }
  return (
    <div className="flex flex-col gap-5">
      {links.map((g, i) => (
        <section key={i}>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-muted">
            {g.group}
          </h3>
          <ul className="flex flex-col gap-1.5">
            {g.items.map((it, j) => (
              <li key={j}>
                <a
                  href={it.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface p-3 text-sm text-text-strong transition-colors hover:border-accent-2/40 hover:bg-surface-2"
                >
                  <span>{it.name}</span>
                  <ExternalLink size={14} className="text-text-muted" />
                </a>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
