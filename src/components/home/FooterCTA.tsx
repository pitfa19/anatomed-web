import { Link } from 'react-router-dom';
import { ArrowRight, MessagesSquare } from 'lucide-react';
import { useT } from '../../lib/i18n';
import type { TKey } from '../../lib/i18n';

const SHORTCUTS: { keys: string[]; descKey: TKey }[] = [
  { keys: ['/'], descKey: 'home.shortcutFocusSearch' },
  { keys: ['↑', '↓'], descKey: 'home.shortcutNextHit' },
  { keys: ['Esc'], descKey: 'home.shortcutCloseViewer' },
  { keys: ['⌘', '+'], descKey: 'home.shortcutZoom' },
];

export default function FooterCTA() {
  const t = useT();
  return (
    <section className="relative overflow-hidden rounded-3xl border border-border bg-surface p-6 sm:p-10">
      {/* gradient slab */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background:
            'radial-gradient(circle at 20% 0%, rgba(74,158,255,0.30), transparent 55%), radial-gradient(circle at 80% 100%, rgba(255,92,177,0.28), transparent 55%)',
        }}
      />
      <div className="relative flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex max-w-xl flex-col gap-3">
          <h2 className="text-3xl font-semibold tracking-tight text-text-strong sm:text-4xl">
            {t('home.ctaTitle')}
          </h2>
          <p className="text-sm leading-relaxed text-text-muted sm:text-base">
            {t('home.ctaBody')}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/docs"
            className="inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm font-medium text-white shadow-sm transition-colors hover:opacity-90"
          >
            {t('home.openNotes')}
            <ArrowRight size={15} />
          </Link>
          <Link
            to="/agent"
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-5 py-3 text-sm font-medium text-text-strong transition-colors hover:bg-surface-2"
          >
            <MessagesSquare size={15} />
            {t('home.askAgent')}
          </Link>
        </div>
      </div>

      <div className="relative mt-8 grid grid-cols-2 gap-3 border-t border-border pt-6 sm:grid-cols-4">
        {SHORTCUTS.map((s) => (
          <div key={s.descKey} className="flex items-center gap-2.5">
            <div className="flex shrink-0 gap-1">
              {s.keys.map((k) => (
                <kbd
                  key={k}
                  className="flex min-w-[1.5rem] items-center justify-center rounded-md border border-border bg-bg px-1.5 py-0.5 text-[11px] font-medium text-text"
                >
                  {k}
                </kbd>
              ))}
            </div>
            <span className="text-xs text-text-muted">{t(s.descKey)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
