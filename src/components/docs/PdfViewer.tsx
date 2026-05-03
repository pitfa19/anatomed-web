import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/TextLayer.css';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Menu,
  X,
} from 'lucide-react';
import type { Hit, SourceMeta } from '../../lib/types';
import { cn } from '../../lib/cn';

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const DEFAULT_PAGE_HEIGHT = 1100;
// How far above/below the viewport a page must be to stay mounted. Pages
// outside this band unmount to keep memory bounded on huge PDFs.
const RENDER_MARGIN_PX = 300;

interface Props {
  source: SourceMeta;
  pdfUrl: string;
  /** PDF page (1-based) currently focused. Reflects external nav and scroll position. */
  page: number;
  /** Total pages (mirrors what onTotalPagesChange reported). */
  totalPages: number;
  onTotalPagesChange: (n: number) => void;
  term?: string | null;
  hits?: Hit[];
  occIdx?: number;
  onStepOcc?: (delta: number) => void;
  onGotoPage: (page: number) => void;
  onClose: () => void;
  /** Mobile-only: opens the side drawer. Hidden on lg+. */
  onMenuClick?: () => void;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export default function PdfViewer({
  source,
  pdfUrl,
  page,
  totalPages,
  onTotalPagesChange,
  term,
  hits = [],
  occIdx = 0,
  onStepOcc,
  onGotoPage,
  onClose,
  onMenuClick,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const ioSourceRef = useRef(false);
  const lastScrolledPageRef = useRef<number>(0);
  // Refs hold the latest `page`/`onGotoPage` so the IntersectionObserver
  // callback always reads fresh values without us re-attaching the observer
  // on every page change (1333 attachments × 1333 elements = freeze).
  const pageRef = useRef(page);
  const onGotoPageRef = useRef(onGotoPage);
  useEffect(() => {
    pageRef.current = page;
  }, [page]);
  useEffect(() => {
    onGotoPageRef.current = onGotoPage;
  }, [onGotoPage]);

  // Set of page numbers currently intersecting (or near) the viewport.
  // Pages outside this set unmount, so memory stays bounded on huge PDFs.
  const intersectingRef = useRef<Set<number>>(new Set([1]));
  const [pageWidth, setPageWidth] = useState(0);
  const [estPageHeight, setEstPageHeight] = useState(DEFAULT_PAGE_HEIGHT);
  const [visiblePages, setVisiblePages] = useState<Set<number>>(() => new Set([1]));
  const [docError, setDocError] = useState<string | null>(null);
  const [docLoading, setDocLoading] = useState(true);

  const hasHits = hits.length > 0;
  const inSearch = !!term && hasHits;

  // Track inner content width (the column the PDF pages render into).
  useEffect(() => {
    const el = measureRef.current;
    if (!el) return;
    const apply = (w: number) => {
      const next = Math.max(280, Math.floor(w));
      setPageWidth((prev) => (prev === next ? prev : next));
    };
    apply(el.clientWidth);
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) apply(e.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Reset state when the document changes.
  useEffect(() => {
    setDocLoading(true);
    setDocError(null);
    setEstPageHeight(DEFAULT_PAGE_HEIGHT);
    intersectingRef.current = new Set([1]);
    setVisiblePages(new Set([1]));
    lastScrolledPageRef.current = 0;
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [pdfUrl]);

  // IntersectionObserver: track which page placeholders are in/near the
  // viewport (= the set of pages we mount), and which one is the "current"
  // page (= highest intersection ratio). Attached once per document.
  // rAF-throttled to avoid thrashing React state during fast scroll.
  useEffect(() => {
    const root = scrollRef.current;
    if (!root || totalPages === 0) return;

    let rafId = 0;
    let pendingChanged = false;
    let pendingBestPage = 0;
    let pendingBestRatio = -1;

    const flush = () => {
      rafId = 0;
      if (pendingChanged) {
        setVisiblePages(new Set(intersectingRef.current));
        pendingChanged = false;
      }
      if (pendingBestPage && pendingBestPage !== pageRef.current) {
        ioSourceRef.current = true;
        onGotoPageRef.current(pendingBestPage);
      }
      pendingBestPage = 0;
      pendingBestRatio = -1;
    };

    const io = new IntersectionObserver(
      (entries) => {
        const intersecting = intersectingRef.current;
        for (const e of entries) {
          const p = Number((e.target as HTMLElement).dataset.page);
          if (!p) continue;
          if (e.isIntersecting) {
            if (!intersecting.has(p)) {
              intersecting.add(p);
              pendingChanged = true;
            }
            if (e.intersectionRatio > pendingBestRatio) {
              pendingBestRatio = e.intersectionRatio;
              pendingBestPage = p;
            }
          } else if (intersecting.has(p)) {
            intersecting.delete(p);
            pendingChanged = true;
          }
        }
        if (!rafId) rafId = requestAnimationFrame(flush);
      },
      { root, rootMargin: `${RENDER_MARGIN_PX}px 0px`, threshold: [0, 0.25, 0.6] },
    );
    const els = root.querySelectorAll('[data-page]');
    els.forEach((el) => io.observe(el));
    return () => {
      io.disconnect();
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [totalPages]);

  // External nav: scroll the requested page placeholder into view.
  useEffect(() => {
    if (totalPages === 0) return;
    if (ioSourceRef.current) {
      ioSourceRef.current = false;
      return;
    }
    if (lastScrolledPageRef.current === page) return;
    const root = scrollRef.current;
    if (!root) return;
    const target = root.querySelector(`[data-page="${page}"]`) as HTMLElement | null;
    if (target) {
      lastScrolledPageRef.current = page;
      // Instant scroll - smooth across hundreds of pages on a 1333-page PDF
      // is unusable, and the intermediate IO firings overshoot the target.
      target.scrollIntoView({ behavior: 'auto', block: 'start' });
    }
  }, [page, totalPages]);

  // Apply ".hl-current" to the right <mark> for the current occurrence.
  // Retries on rAF until the page's text layer has rendered.
  useEffect(() => {
    if (!inSearch) return;
    const root = scrollRef.current;
    if (!root) return;
    // Clear any prior current marker.
    root.querySelectorAll('mark.hl.hl-current').forEach((m) => m.classList.remove('hl-current'));

    const cur = hits[occIdx];
    if (!cur) return;

    let localIdx = 0;
    for (let i = 0; i < occIdx; i++) {
      if (hits[i]!.page === cur.page) localIdx++;
    }

    let attempts = 0;
    let rafId = 0;
    const tryApply = () => {
      attempts++;
      const pageEl = root.querySelector(`[data-page="${cur.page}"]`);
      const marks = pageEl?.querySelectorAll('mark.hl');
      const mark = marks?.[localIdx] as HTMLElement | undefined;
      if (mark) {
        mark.classList.add('hl-current');
        mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      if (attempts < 60) {
        rafId = requestAnimationFrame(tryApply);
      }
    };
    rafId = requestAnimationFrame(tryApply);
    return () => cancelAnimationFrame(rafId);
  }, [inSearch, hits, occIdx, visiblePages]);

  // Keyboard nav.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        if (inSearch && onStepOcc) {
          e.preventDefault();
          onStepOcc(1);
        } else if (page < totalPages) {
          e.preventDefault();
          onGotoPage(page + 1);
        }
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        if (inSearch && onStepOcc) {
          e.preventDefault();
          onStepOcc(-1);
        } else if (page > 1) {
          e.preventDefault();
          onGotoPage(page - 1);
        }
      } else if (e.key === 'Home') {
        e.preventDefault();
        onGotoPage(1);
      } else if (e.key === 'End') {
        e.preventDefault();
        onGotoPage(totalPages);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, onStepOcc, onGotoPage, inSearch, page, totalPages]);

  const documentOptions = useMemo(
    () => ({
      cMapUrl: 'https://unpkg.com/pdfjs-dist@5.4.296/cmaps/',
      cMapPacked: true,
      // Critical for huge PDFs (DR is 114 MB / 1333 pages): disable
      // background prefetching so the browser only fetches the byte ranges
      // for pages currently being rendered.
      disableAutoFetch: true,
      disableStream: true,
    }),
    [],
  );

  const pixelRatio = useMemo(() => {
    if (typeof window === 'undefined') return 1;
    return window.devicePixelRatio || 1;
  }, []);

  const customTextRenderer = useMemo(() => {
    if (!term) return undefined;
    const re = new RegExp(`(${escapeRegex(term)})`, 'gi');
    return ({ str }: { str: string }) =>
      str.replace(re, '<mark class="hl">$1</mark>');
  }, [term]);

  const handleDocumentLoad = useCallback(
    (pdf: { numPages: number }) => {
      setDocLoading(false);
      onTotalPagesChange(pdf.numPages);
    },
    [onTotalPagesChange],
  );

  const handlePageLoad = useCallback(
    ({ originalWidth, originalHeight }: { originalWidth: number; originalHeight: number }) => {
      if (pageWidth > 0 && originalWidth > 0) {
        const h = (originalHeight / originalWidth) * pageWidth;
        setEstPageHeight((prev) => (Math.abs(prev - h) > 4 ? h : prev));
      }
    },
    [pageWidth],
  );

  const pageNumbers = useMemo(() => {
    const arr: number[] = new Array(totalPages);
    for (let i = 0; i < totalPages; i++) arr[i] = i + 1;
    return arr;
  }, [totalPages]);

  return (
    <section className="flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-surface">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-surface-2 px-3 py-2 sm:px-5 sm:py-3">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          {onMenuClick && (
            <button
              onClick={onMenuClick}
              aria-label="Open menu"
              className="rounded-md border border-border bg-surface p-2 text-text-muted hover:bg-surface-2 hover:text-text-strong lg:hidden"
            >
              <Menu size={16} />
            </button>
          )}
          <span
            className="flex size-8 items-center justify-center rounded-lg text-[11px] font-semibold text-white sm:size-9 sm:text-xs"
            style={{ background: source.color }}
          >
            {source.badge}
          </span>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-text-strong sm:text-base">
              {source.label}
            </div>
            {term && <div className="truncate text-[11px] text-accent sm:text-xs">{term}</div>}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          {inSearch && onStepOcc && (
            <div className="flex items-center gap-0.5 rounded-lg border border-border bg-surface px-1 py-1">
              <button
                onClick={() => onStepOcc(-1)}
                className="rounded p-1 text-text-muted hover:bg-surface-2 hover:text-text-strong"
                aria-label="Previous occurrence"
                title="Previous (↑)"
              >
                <ChevronLeft size={14} />
              </button>
              <span className="px-1 text-[11px] tabular-nums text-text-muted">
                {occIdx + 1}/{hits.length}
                <span className="hidden sm:inline"> pojava</span>
              </span>
              <button
                onClick={() => onStepOcc(1)}
                className="rounded p-1 text-text-muted hover:bg-surface-2 hover:text-text-strong"
                aria-label="Next occurrence"
                title="Next (↓)"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          )}

          <div className="flex items-center gap-0.5 rounded-lg border border-border bg-surface px-0.5 py-1 sm:px-1">
            <button
              onClick={() => onGotoPage(1)}
              disabled={page <= 1}
              className="hidden rounded p-1.5 text-text-muted hover:bg-surface-2 hover:text-text-strong disabled:opacity-30 sm:inline-flex"
              aria-label="First page"
            >
              <ChevronFirst size={16} />
            </button>
            <button
              onClick={() => onGotoPage(Math.max(1, page - 1))}
              disabled={page <= 1}
              className="rounded p-1.5 text-text-muted hover:bg-surface-2 hover:text-text-strong disabled:opacity-30"
              aria-label="Previous page"
            >
              <ChevronLeft size={16} />
            </button>
            <PageInput page={page} totalPages={totalPages} onCommit={onGotoPage} />
            <span className="pr-1 text-[11px] text-text-muted sm:text-xs">/ {totalPages || '–'}</span>
            <button
              onClick={() => onGotoPage(Math.min(totalPages, page + 1))}
              disabled={page >= totalPages}
              className="rounded p-1.5 text-text-muted hover:bg-surface-2 hover:text-text-strong disabled:opacity-30"
              aria-label="Next page"
            >
              <ChevronRight size={16} />
            </button>
            <button
              onClick={() => onGotoPage(totalPages)}
              disabled={page >= totalPages}
              className="hidden rounded p-1.5 text-text-muted hover:bg-surface-2 hover:text-text-strong disabled:opacity-30 sm:inline-flex"
              aria-label="Last page"
            >
              <ChevronLast size={16} />
            </button>
          </div>

          <button
            onClick={onClose}
            className="rounded-lg border border-border bg-surface p-2 text-text-muted hover:bg-surface-2 hover:text-text-strong"
            aria-label="Close viewer"
            title="Close (Esc)"
          >
            <X size={16} />
          </button>
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto bg-surface-2/40">
        <div ref={measureRef} className="mx-auto w-full max-w-3xl px-2 py-3 sm:px-4 sm:py-5">
          {docError && (
            <div className="rounded-lg border border-warn/40 bg-warn/5 p-4 text-sm text-warn">
              Greška učitavanja PDF-a: {docError}
            </div>
          )}
          {pageWidth > 0 && (
            <Document
              file={pdfUrl}
              onLoadSuccess={handleDocumentLoad}
              onLoadError={(err) => {
                setDocLoading(false);
                setDocError(err?.message ?? String(err));
              }}
              options={documentOptions}
              loading={
                <div className="flex h-64 items-center justify-center gap-2 text-sm text-text-muted">
                  <Loader2 size={16} className="animate-spin" /> Učitavam PDF…
                </div>
              }
              className="flex flex-col items-center gap-3 sm:gap-4"
            >
              {pageNumbers.map((p) => {
                const shouldRender = visiblePages.has(p);
                return (
                  <div
                    key={p}
                    data-page={p}
                    className="relative w-full"
                    style={{ minHeight: `${estPageHeight}px` }}
                  >
                    <div className="absolute left-2 top-2 z-10 rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-white">
                      {p}
                    </div>
                    {shouldRender ? (
                      <Page
                        pageNumber={p}
                        width={pageWidth}
                        devicePixelRatio={pixelRatio}
                        renderAnnotationLayer={false}
                        renderTextLayer={!!term}
                        onLoadSuccess={handlePageLoad}
                        customTextRenderer={customTextRenderer}
                        loading={
                          <div
                            className="flex w-full items-center justify-center bg-white text-text-muted shadow-sm"
                            style={{ height: estPageHeight }}
                          >
                            <Loader2 size={16} className="animate-spin" />
                          </div>
                        }
                        className="bg-white shadow-sm"
                      />
                    ) : (
                      <div
                        className="w-full bg-white/60 shadow-sm"
                        style={{ height: estPageHeight }}
                      />
                    )}
                  </div>
                );
              })}
            </Document>
          )}
          {docLoading && pageWidth === 0 && (
            <div className="flex h-64 items-center justify-center gap-2 text-sm text-text-muted">
              <Loader2 size={16} className="animate-spin" /> Učitavam PDF…
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function PageInput({
  page,
  totalPages,
  onCommit,
}: {
  page: number;
  totalPages: number;
  onCommit: (p: number) => void;
}) {
  const [value, setValue] = useState(String(page));

  useEffect(() => {
    setValue(String(page));
  }, [page]);

  function commit() {
    if (value === '') {
      setValue(String(page));
      return;
    }
    const v = Number(value);
    if (Number.isNaN(v)) {
      setValue(String(page));
      return;
    }
    const clamped = Math.min(totalPages, Math.max(1, v));
    setValue(String(clamped));
    if (clamped !== page) onCommit(clamped);
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      value={value}
      onChange={(e) => {
        const next = e.target.value.replace(/[^0-9]/g, '');
        setValue(next);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commit();
          (e.target as HTMLInputElement).blur();
        } else if (e.key === 'Escape') {
          setValue(String(page));
          (e.target as HTMLInputElement).blur();
        }
      }}
      onFocus={(e) => e.target.select()}
      onBlur={commit}
      className={cn(
        'w-12 bg-transparent px-1 text-center text-sm font-medium tabular-nums text-text-strong outline-none',
      )}
      aria-label="Page number"
    />
  );
}
