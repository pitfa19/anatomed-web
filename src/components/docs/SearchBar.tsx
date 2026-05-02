import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { fuzzyMatch } from '../../lib/data';

interface Props {
  terms: string[];
  value: string;
  onPick: (term: string) => void;
  onClear: () => void;
  onQueryChange?: (query: string) => void;
  autoFocus?: boolean;
  size?: 'md' | 'lg';
}

export default function SearchBar({
  terms,
  value,
  onPick,
  onClear,
  onQueryChange,
  autoFocus,
  size = 'md',
}: Props) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  useEffect(() => setQuery(value), [value]);

  useEffect(() => {
    if (!autoFocus) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [autoFocus]);

  const matches = useMemo(() => fuzzyMatch(query, terms, 12), [query, terms]);

  function pick(term: string) {
    setQuery(term);
    setOpen(false);
    onPick(term);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => Math.min(h + 1, matches.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const m = matches[highlight] ?? matches[0];
      if (m) pick(m);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  const isLg = size === 'lg';

  return (
    <div className="relative">
      <div
        className={
          'flex items-center gap-3 rounded-2xl border border-border bg-surface focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20 ' +
          (isLg ? 'px-5 py-4' : 'px-3 py-2')
        }
      >
        <Search size={isLg ? 22 : 16} className="text-text-muted" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            const next = e.target.value;
            setQuery(next);
            setOpen(true);
            setHighlight(0);
            onQueryChange?.(next);
            if (next.trim() === '') onClear();
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={onKeyDown}
          placeholder={
            isLg
              ? 'Pretraži anatomski termin…'
              : 'Pretraži termin (npr. fissura orbitalis)…'
          }
          aria-controls={listId}
          aria-expanded={open}
          className={
            'flex-1 bg-transparent text-text-strong outline-none placeholder:text-text-muted ' +
            (isLg ? 'text-lg' : 'text-sm')
          }
        />
        {query && (
          <button
            onClick={() => {
              setQuery('');
              onClear();
              onQueryChange?.('');
              inputRef.current?.focus();
            }}
            className="rounded-md p-1 text-text-muted hover:bg-surface-2 hover:text-text-strong"
            aria-label="Clear"
          >
            <X size={isLg ? 18 : 14} />
          </button>
        )}
        {!isLg && (
          <kbd className="hidden rounded border border-border bg-bg px-1.5 py-0.5 text-[10px] text-text-muted sm:inline">
            /
          </kbd>
        )}
      </div>
      {open && matches.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className={
            'absolute z-20 mt-2 max-h-80 w-full overflow-y-auto rounded-xl border border-border bg-surface py-1 shadow-xl'
          }
        >
          {matches.map((m, i) => (
            <li
              key={m}
              role="option"
              aria-selected={i === highlight}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(m)}
              onMouseEnter={() => setHighlight(i)}
              className={
                (isLg ? 'px-4 py-2 text-base ' : 'px-3 py-1.5 text-sm ') +
                'cursor-pointer ' +
                (i === highlight ? 'bg-accent/15 text-text-strong' : 'text-text hover:bg-surface-2')
              }
            >
              {m}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
