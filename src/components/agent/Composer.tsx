import { useEffect, useRef, useState } from 'react';
import { ArrowUp } from 'lucide-react';

interface Props {
  onSend: (text: string) => void;
  pending: boolean;
  initial?: string;
}

export default function Composer({ onSend, pending, initial }: Props) {
  const [value, setValue] = useState(initial ?? '');
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (initial != null) {
      setValue(initial);
      ref.current?.focus();
      autoresize();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  function autoresize() {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 220) + 'px';
  }

  function send() {
    const t = value.trim();
    if (!t || pending) return;
    onSend(t);
    setValue('');
    requestAnimationFrame(autoresize);
  }

  return (
    <div className="border-t border-border bg-surface/60 p-3 backdrop-blur sm:p-4">
      <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border border-border bg-surface px-3 py-2 focus-within:border-accent">
        <textarea
          ref={ref}
          rows={1}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            autoresize();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Pitaj agenta…"
          className="max-h-[220px] flex-1 resize-none bg-transparent py-1 text-sm text-text-strong outline-none placeholder:text-text-muted"
        />
        <button
          onClick={send}
          disabled={!value.trim() || pending}
          className="flex size-8 items-center justify-center rounded-lg bg-accent text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-30"
          aria-label="Send"
        >
          <ArrowUp size={16} />
        </button>
      </div>
      <p className="mt-1.5 text-center text-[10px] text-text-muted">
        Mock odgovori - backend nije spojen.
      </p>
    </div>
  );
}
