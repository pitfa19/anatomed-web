import { useEffect, useRef, useState } from 'react';
import { Upload, X, Loader2, AlertTriangle } from 'lucide-react';
import { bumpLocalDocsCache, loadUnifiedIndex } from '../../lib/data';
import { deleteLocalDoc, saveLocalDoc } from '../../lib/localDocs';
import { cloudUploadDoc } from '../../lib/cloudDocs';
import { useAuth } from '../../lib/AuthContext';

interface Props {
  onUploaded: (slug: string) => void;
}

interface Progress {
  filename: string;
  stage: 'load' | 'page' | 'saving';
  current: number;
  total: number;
}

export default function UploadPdfButton({ onUploaded }: Props) {
  const { user } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const slugRef = useRef<string | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const inFlight = progress !== null;

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  function pickFile() {
    if (inFlight) return;
    setError(null);
    setWarning(null);
    inputRef.current?.click();
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) {
      e.target.value = '';
      return;
    }
    if (file.type && file.type !== 'application/pdf') {
      e.target.value = '';
      setError('Datoteka mora biti PDF.');
      return;
    }

    const filename = file.name;

    // Read the file IMMEDIATELY before clearing the input — some browsers
    // invalidate the File reference once the input is reset, and any awaited
    // work (loadUnifiedIndex, dynamic import) before we read the buffer can
    // race against that.
    let buffer: ArrayBuffer;
    try {
      buffer = await file.arrayBuffer();
    } catch (err) {
      e.target.value = '';
      setError(
        err instanceof Error
          ? `Ne mogu pročitati datoteku: ${err.message}`
          : 'Ne mogu pročitati datoteku.',
      );
      return;
    }
    e.target.value = '';
    if (buffer.byteLength === 0) {
      setError('Datoteka je prazna ili nedostupna.');
      return;
    }

    const ac = new AbortController();
    abortRef.current = ac;
    setProgress({ filename, stage: 'load', current: 0, total: 1 });
    setError(null);
    setWarning(null);

    try {
      const unified = await loadUnifiedIndex();
      const { indexAndExtractSpans, PdfPasswordError } = await import(
        '../../lib/uploadIndexer'
      );
      const result = await indexAndExtractSpans(
        { buffer, filename },
        unified.allTerms,
        {
          signal: ac.signal,
          onProgress: (p) => {
            setProgress({
              filename,
              stage: p.stage,
              current: p.current,
              total: p.total,
            });
          },
        },
      );
      slugRef.current = result.slug;

      setProgress({
        filename,
        stage: 'saving',
        current: 0,
        total: 1,
      });
      try {
        await saveLocalDoc(result);
      } catch (saveErr) {
        await deleteLocalDoc(result.slug).catch(() => {});
        if (
          saveErr &&
          typeof saveErr === 'object' &&
          'name' in saveErr &&
          (saveErr as { name: string }).name === 'QuotaExceededError'
        ) {
          throw new Error(
            'Nema dovoljno prostora za pohranu. Obriši druge dokumente i pokušaj ponovo.',
          );
        }
        throw saveErr;
      }

      if (user) {
        try {
          await cloudUploadDoc(user.id, result);
        } catch (cloudErr) {
          console.warn('cloudUploadDoc failed', cloudErr);
          setWarning(
            'Uploadano je lokalno, ali sinkronizacija sa Supabaseom nije uspjela.',
          );
        }
      }

      bumpLocalDocsCache();
      if (result.warning === 'no_searchable_text') {
        setWarning(
          'PDF nema tekstualni sloj — pretraga neće raditi (vjerojatno skenirani dokument).',
        );
      }
      onUploaded(result.slug);
      setProgress(null);

      // Use type-only check for PdfPasswordError to silence unused warning.
      void PdfPasswordError;
    } catch (err: unknown) {
      // Cleanup partial IDB writes if we know the slug.
      if (slugRef.current) {
        await deleteLocalDoc(slugRef.current).catch(() => {});
        slugRef.current = null;
      }
      if (
        err &&
        typeof err === 'object' &&
        'name' in err &&
        (err as { name: string }).name === 'AbortError'
      ) {
        setProgress(null);
        return;
      }
      if (
        err &&
        typeof err === 'object' &&
        'name' in err &&
        (err as { name: string }).name === 'PdfPasswordError'
      ) {
        setError('PDF je zaštićen lozinkom.');
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError(String(err));
      }
      setProgress(null);
    } finally {
      abortRef.current = null;
      slugRef.current = null;
    }
  }

  function cancel() {
    abortRef.current?.abort();
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={handleFile}
      />
      <button
        type="button"
        onClick={pickFile}
        disabled={inFlight}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-surface/50 p-4 text-sm text-text-muted transition-colors hover:border-accent/60 hover:bg-surface hover:text-text-strong disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Upload size={16} />
        Učitaj svoj PDF
      </button>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-warn/40 bg-warn/5 p-3 text-sm text-warn">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span className="flex-1">{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="rounded p-0.5 hover:bg-warn/10"
            aria-label="Zatvori"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {warning && (
        <div className="flex items-start gap-2 rounded-lg border border-accent/30 bg-accent/5 p-3 text-sm text-text-muted">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span className="flex-1">{warning}</span>
          <button
            type="button"
            onClick={() => setWarning(null)}
            className="rounded p-0.5 hover:bg-accent/10"
            aria-label="Zatvori"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {progress && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-2xl border border-border bg-bg p-5 shadow-xl">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-base font-semibold text-text-strong">Indeksiranje</div>
                <div className="truncate text-xs text-text-muted">{progress.filename}</div>
              </div>
              <Loader2 size={18} className="shrink-0 animate-spin text-accent" />
            </div>
            <ProgressBar progress={progress} />
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={cancel}
                className="rounded-md px-3 py-1.5 text-sm text-text-muted hover:bg-surface hover:text-text-strong"
              >
                Odustani
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ProgressBar({ progress }: { progress: Progress }) {
  const label =
    progress.stage === 'load'
      ? 'Učitavam PDF…'
      : progress.stage === 'saving'
      ? 'Spremam…'
      : `Indeksiram stranicu ${progress.current} / ${progress.total}`;
  const pct =
    progress.stage === 'load'
      ? progress.current >= progress.total
        ? 100
        : 5
      : progress.stage === 'saving'
      ? 95
      : progress.total > 0
      ? Math.round((progress.current / progress.total) * 90) + 5
      : 5;
  return (
    <div>
      <div className="mb-1.5 text-xs text-text-muted">{label}</div>
      <div className="h-2 overflow-hidden rounded-full bg-surface">
        <div
          className="h-full rounded-full bg-accent transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
