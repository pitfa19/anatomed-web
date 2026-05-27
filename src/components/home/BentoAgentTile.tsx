import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { MessagesSquare, BookOpen, ChevronRight } from 'lucide-react';
import { useT } from '../../lib/i18n';

const QUESTION = 'Što čini acetabulum?';
const ANSWER =
  'Acetabulum tvore dijelovi triju kostiju zdjelice: os ilium, os ischii i os pubis. Sastaju se u Y-hrskavici i čine zglobnu jamu za glavu femura.';
const SOURCE_LABEL = 'Skripta A1 · str. 12';
const SOURCE_LINK = '/docs?q=acetabulum&doc=Skripta%20A1%20ispravljena.pdf&page=12';

export default function BentoAgentTile({ className }: { className?: string }) {
  const t = useT();
  const [typed, setTyped] = useState('');
  const [showChip, setShowChip] = useState(false);

  useEffect(() => {
    let cancel = false;
    let timeout: number;

    const run = () => {
      setTyped('');
      setShowChip(false);

      // Delay before typing starts
      timeout = window.setTimeout(() => {
        if (cancel) return;
        let i = 0;
        const tick = () => {
          if (cancel) return;
          if (i <= ANSWER.length) {
            setTyped(ANSWER.slice(0, i));
            i++;
            timeout = window.setTimeout(tick, 22 + Math.random() * 18);
          } else {
            setShowChip(true);
            timeout = window.setTimeout(run, 6500);
          }
        };
        tick();
      }, 800);
    };

    run();
    return () => {
      cancel = true;
      window.clearTimeout(timeout);
    };
  }, []);

  return (
    <Link
      to={`/agent?prompt=${encodeURIComponent(QUESTION)}`}
      className={
        'group relative flex flex-col gap-3 overflow-hidden rounded-2xl border border-border bg-surface p-5 transition-all hover:border-accent/40 hover:bg-surface-2 ' +
        (className ?? '')
      }
    >
      <div className="flex items-start justify-between">
        <span className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-text-muted">
          <MessagesSquare size={13} className="text-accent" />
          Agent
        </span>
        <span className="rounded-full border border-border bg-bg px-2 py-0.5 text-[10px] uppercase tracking-wider text-text-muted">
          chat
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-2 overflow-hidden">
        <div className="self-end max-w-[92%] rounded-2xl rounded-br-sm bg-accent/20 px-3 py-2 text-xs font-medium text-text-strong">
          {QUESTION}
        </div>
        <div className="self-start min-h-[5.5rem] max-w-[96%] rounded-2xl rounded-bl-sm border border-border bg-surface-2 px-3 py-2 text-xs leading-relaxed text-text shadow-sm">
          {typed}
          {!showChip && <span className="caret ml-0.5 text-accent">▎</span>}
          {showChip && (
            <div className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-border bg-bg px-2 py-1 text-[11px] text-accent">
              <BookOpen size={11} />
              <span className="truncate">{SOURCE_LABEL}</span>
              <ChevronRight size={11} />
            </div>
          )}
        </div>
      </div>

      <div className="mt-auto">
        <h3 className="text-sm font-semibold text-text-strong">{t('home.agentTitle')}</h3>
        <p className="mt-0.5 text-[11px] leading-relaxed text-text-muted">
          {t('home.agentBody')}
        </p>
      </div>

      {/* Hidden link click target - actual link is the wrapper */}
      <span className="sr-only">{SOURCE_LINK}</span>
    </Link>
  );
}
