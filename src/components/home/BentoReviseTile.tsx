import { Link } from 'react-router-dom';
import { GraduationCap } from 'lucide-react';

const QUESTIONS = [
  'Kojim arterijama se opskrbljuje glava femura?',
  'Što čini medijastinum?',
  'Granice trigonum cervicale anterius?',
];

interface CardProps {
  text: string;
  rotBase: number;
  yBase: number;
  yHover: number;
  zIndex: number;
}

function StackCard({ text, rotBase, yBase, yHover, zIndex }: CardProps) {
  return (
    <div
      className="absolute left-1/2 top-1/2 w-[80%] rounded-xl border border-border bg-bg px-3 py-2.5 text-xs text-text shadow-md transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] sm:w-[72%]"
      style={
        {
          zIndex,
          '--tx': '-50%',
          '--ty-base': `calc(-50% + ${yBase}px)`,
          '--ty-hover': `calc(-50% + ${yHover}px)`,
          '--rot-base': `${rotBase}deg`,
          transform: 'translate(var(--tx), var(--ty-base)) rotate(var(--rot-base))',
          transition: 'transform 500ms cubic-bezier(0.22, 1, 0.36, 1)',
        } as React.CSSProperties
      }
      onMouseEnter={(e) => {
        const parent = e.currentTarget.parentElement;
        if (!parent) return;
        Array.from(parent.children).forEach((c) => {
          (c as HTMLElement).style.transform =
            'translate(var(--tx), var(--ty-hover)) rotate(0deg)';
        });
      }}
      onMouseLeave={(e) => {
        const parent = e.currentTarget.parentElement;
        if (!parent) return;
        Array.from(parent.children).forEach((c) => {
          (c as HTMLElement).style.transform =
            'translate(var(--tx), var(--ty-base)) rotate(var(--rot-base))';
        });
      }}
    >
      <span className="line-clamp-2">{text}</span>
    </div>
  );
}

export default function BentoReviseTile({ className }: { className?: string }) {
  return (
    <Link
      to="/revise"
      className={
        'group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-border bg-surface p-5 transition-all hover:border-accent/40 hover:bg-surface-2 ' +
        (className ?? '')
      }
    >
      <div className="flex items-start justify-between">
        <span className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-text-muted">
          <GraduationCap size={13} className="text-accent" />
          Ponavljanje
        </span>
        <span className="rounded-full border border-border bg-bg px-2 py-0.5 text-[10px] uppercase tracking-wider text-text-muted">
          Q&amp;A
        </span>
      </div>

      <div className="relative my-2 h-36 sm:h-40">
        {QUESTIONS.map((q, i) => (
          <StackCard
            key={i}
            text={q}
            rotBase={(i - 1) * 5}
            yBase={(i - 1) * 6}
            yHover={(i - 1) * 28}
            zIndex={i}
          />
        ))}
      </div>

      <div>
        <h3 className="text-base font-semibold text-text-strong">Pitanja koja te love.</h3>
        <p className="mt-0.5 text-xs leading-relaxed text-text-muted">
          Mali setovi po temama. Quizlet kartice. Tvoje napredovanje, lokalno.
        </p>
      </div>
    </Link>
  );
}
