import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Search } from 'lucide-react';
import { bundledPageImageUrl } from '../../lib/data';

const TERMS = ['Os capitatum', 'Femur'];

export default function BentoSkripteTile({ className }: { className?: string }) {
  const [termIdx, setTermIdx] = useState(0);
  const [typed, setTyped] = useState('');

  useEffect(() => {
    let cancel = false;
    let timeout: number;

    const run = () => {
      const target = TERMS[termIdx]!;
      setTyped('');
      let i = 0;
      const type = () => {
        if (cancel) return;
        if (i <= target.length) {
          setTyped(target.slice(0, i));
          i++;
          timeout = window.setTimeout(type, 60 + Math.random() * 40);
        } else {
          timeout = window.setTimeout(() => {
            if (cancel) return;
            setTermIdx((p) => (p + 1) % TERMS.length);
          }, 2200);
        }
      };
      type();
    };

    run();
    return () => {
      cancel = true;
      window.clearTimeout(timeout);
    };
  }, [termIdx]);

  return (
    <Link
      to={`/docs?q=${encodeURIComponent(TERMS[termIdx]!)}`}
      className={
        'group relative flex flex-col gap-4 overflow-hidden rounded-2xl border border-border bg-surface p-5 transition-all hover:border-accent/40 hover:bg-surface-2 ' +
        (className ?? '')
      }
    >
      <div className="absolute inset-x-0 top-0 h-px bg-accent opacity-50" />

      <div className="flex items-start justify-between">
        <span className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-text-muted">
          <BookOpen size={13} className="text-accent" />
          Skripte
        </span>
        <span className="rounded-full border border-border bg-bg px-2 py-0.5 text-[10px] uppercase tracking-wider text-text-muted">
          5 izvora
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
        {/* Left: search + result list */}
        <div className="flex flex-1 flex-col gap-3">
          <div className="flex items-center gap-2 rounded-xl border border-border bg-bg px-3 py-2.5 shadow-sm">
            <Search size={14} className="shrink-0 text-text-muted" />
            <span className="font-mono text-sm text-text-strong">
              {typed}
              <span className="caret ml-0.5 text-accent">▎</span>
            </span>
          </div>

          <div className="flex flex-col gap-1.5">
            {[
              { src: 'A1', page: 12, color: '#4a9eff' },
              { src: 'A2', page: 88, color: '#7c5cff' },
              { src: 'DR', page: 421, color: '#16a34a' },
            ].map((r) => (
              <div
                key={r.src}
                className="flex items-center gap-2 rounded-lg border border-border bg-bg/60 px-2.5 py-1.5 text-[11px]"
              >
                <span
                  className="flex size-5 items-center justify-center rounded-md text-[10px] font-semibold text-white"
                  style={{ background: r.color }}
                >
                  {r.src}
                </span>
                <span className="flex-1 truncate text-text">
                  …pojavnice za <em className="not-italic font-semibold">{TERMS[termIdx]}</em>…
                </span>
                <span className="text-text-muted">str. {r.page}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right: page thumbnail with pulsing highlight */}
        <div className="relative hidden w-44 shrink-0 overflow-hidden rounded-xl border border-border bg-bg shadow-md sm:block">
          <img
            src={bundledPageImageUrl('handout_a1', 1)}
            alt=""
            className="block aspect-[3/4] w-full object-cover"
            loading="lazy"
            decoding="async"
          />
          <div
            className="hl-pulse absolute left-[12%] top-[42%] h-2.5 w-[38%] rounded-sm"
            style={{ background: 'rgba(253, 224, 71, 0.85)' }}
          />
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-bg/90 to-transparent px-2 py-1.5 text-[10px] text-text-muted">
            Hand-Out · str. 1
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold text-text-strong">Pretraži. Otvori. Označi.</h3>
        <p className="mt-1 text-sm leading-relaxed text-text-muted">
          Pet skripti, više od stotinu termina po stranici. Pretraga ti pokaže gdje, viewer ti otvori stranicu, žuto označi pojam.
        </p>
      </div>
    </Link>
  );
}
