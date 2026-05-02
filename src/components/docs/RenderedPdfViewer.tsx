import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Menu,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { Hit, SourceMeta } from '../../lib/types';
import {
  loadRenderedMeta,
  loadRenderedPageText,
  pageImageUrl,
  type RenderedMeta,
  type RenderedPageSpan,
  type RenderedPageText,
} from '../../lib/data';
import { cn } from '../../lib/cn';

const RENDER_MARGIN_PX = 600;

const ZOOM_STEPS = [0.5, 0.67, 0.8, 1.0, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0] as const;
const ZOOM_MIN = ZOOM_STEPS[0];
const ZOOM_MAX = ZOOM_STEPS[ZOOM_STEPS.length - 1];

function nextZoom(current: number, dir: 1 | -1): number {
  if (dir === 1) {
    for (const z of ZOOM_STEPS) if (z > current + 0.001) return z;
    return ZOOM_MAX;
  }
  for (let i = ZOOM_STEPS.length - 1; i >= 0; i--) {
    if (ZOOM_STEPS[i]! < current - 0.001) return ZOOM_STEPS[i]!;
  }
  return ZOOM_MIN;
}

interface Props {
  source: SourceMeta;
  /** The slug under /pdfs-rendered/ for this doc. */
  slug: string;
  /** Currently focused 1-based page number. */
  page: number;
  /** Mirrors meta.total_pages once loaded; 0 while loading. */
  totalPages: number;
  onTotalPagesChange: (n: number) => void;
  term?: string | null;
  hits?: Hit[];
  occIdx?: number;
  /** Bumps when the user actively requests a center-on-hit scroll
   * (clicking a hit, stepping prev/next, deep-linking from the agent).
   * Distinct from occIdx so re-clicking the same hit still re-scrolls. */
  scrollNonce?: number;
  onStepOcc?: (delta: number) => void;
  onGotoPage: (page: number) => void;
  onClose: () => void;
  onMenuClick?: () => void;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export default function RenderedPdfViewer({
  source,
  slug,
  page,
  totalPages,
  onTotalPagesChange,
  term,
  hits = [],
  occIdx = 0,
  scrollNonce = 0,
  onStepOcc,
  onGotoPage,
  onClose,
  onMenuClick,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const ioSourceRef = useRef(false);
  const lastScrolledPageRef = useRef(0);

  // Refs for IO callback to avoid reattaching observers on every page change.
  const pageRef = useRef(page);
  const onGotoPageRef = useRef(onGotoPage);
  useEffect(() => {
    pageRef.current = page;
  }, [page]);
  useEffect(() => {
    onGotoPageRef.current = onGotoPage;
  }, [onGotoPage]);

  const intersectingRef = useRef<Set<number>>(new Set([1]));
  const pageOffsetsRef = useRef<number[]>([]);
  const [containerWidth, setContainerWidth] = useState(0);
  const [meta, setMeta] = useState<RenderedMeta | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [visiblePages, setVisiblePages] = useState<Set<number>>(() => new Set([1]));
  const [zoom, setZoom] = useState(1);
  // Anchor preserved across zoom changes: pageIdx + ratio within the page,
  // so the same content stays under the user after layout shifts.
  const pendingZoomAnchorRef = useRef<{ pageIdx: number; ratio: number } | null>(null);

  const applyZoom = useCallback((updater: (z: number) => number) => {
    setZoom((prev) => {
      const root = scrollRef.current;
      const offsets = pageOffsetsRef.current;
      if (root && offsets.length > 0) {
        let curIdx = Math.max(0, (pageRef.current || 1) - 1);
        if (curIdx >= offsets.length) curIdx = offsets.length - 1;
        const pageTop = offsets[curIdx] ?? 0;
        const nextTop =
          offsets[curIdx + 1] ?? pageTop + Math.max(1, root.clientHeight);
        const pageHeight = Math.max(1, nextTop - pageTop);
        const within = root.scrollTop - pageTop;
        const ratio = within / pageHeight;
        pendingZoomAnchorRef.current = { pageIdx: curIdx, ratio };
      }
      const next = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, updater(prev)));
      return next;
    });
  }, []);

  const hasHits = hits.length > 0;
  const inSearch = !!term && hasHits;

  // Load doc metadata when slug changes.
  useEffect(() => {
    setMeta(null);
    setMetaError(null);
    intersectingRef.current = new Set([1]);
    setVisiblePages(new Set([1]));
    lastScrolledPageRef.current = 0;
    if (scrollRef.current) scrollRef.current.scrollTop = 0;

    let cancelled = false;
    loadRenderedMeta(slug)
      .then((m) => {
        if (cancelled) return;
        setMeta(m);
        onTotalPagesChange(m.total_pages);
      })
      .catch((err) => {
        if (cancelled) return;
        setMetaError(err?.message ?? String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [slug, onTotalPagesChange]);

  // Track container width; set page widths from ratio of meta.pages[i].
  useEffect(() => {
    const el = measureRef.current;
    if (!el) return;
    const apply = (w: number) => {
      const next = Math.max(280, Math.floor(w));
      setContainerWidth((prev) => (prev === next ? prev : next));
    };
    apply(el.clientWidth);
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) apply(e.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // IO: track which page placeholders should render (i.e. are within the
  // expanded prerender margin). Throttled to one batch per frame. The
  // "current page" is driven by scroll position separately — see below.
  useEffect(() => {
    const root = scrollRef.current;
    if (!root || totalPages === 0) return;

    let rafId = 0;
    let pendingChanged = false;

    const flush = () => {
      rafId = 0;
      if (pendingChanged) {
        setVisiblePages(new Set(intersectingRef.current));
        pendingChanged = false;
      }
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
          } else if (intersecting.has(p)) {
            intersecting.delete(p);
            pendingChanged = true;
          }
        }
        if (!rafId && pendingChanged) rafId = requestAnimationFrame(flush);
      },
      { root, rootMargin: `${RENDER_MARGIN_PX}px 0px`, threshold: 0 },
    );
    const els = root.querySelectorAll('[data-page]');
    els.forEach((el) => io.observe(el));
    return () => {
      io.disconnect();
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [totalPages]);

  // Current-page tracking based on actual scroll position. Way more reliable
  // than IntersectionObserver ratio comparisons: we measure each page's top
  // offset once per layout change and binary-search scrollTop on each scroll.
  useEffect(() => {
    const root = scrollRef.current;
    if (!root || !meta || containerWidth === 0) {
      pageOffsetsRef.current = [];
      return;
    }
    let cancelled = false;
    const id = requestAnimationFrame(() => {
      if (cancelled) return;
      const rootRect = root.getBoundingClientRect();
      const els = Array.from(root.querySelectorAll<HTMLElement>('[data-page]'));
      // Sort by data-page just in case DOM order ever drifts.
      els.sort((a, b) => Number(a.dataset.page) - Number(b.dataset.page));
      const offsets: number[] = [];
      for (const el of els) {
        const r = el.getBoundingClientRect();
        offsets.push(r.top - rootRect.top + root.scrollTop);
      }
      pageOffsetsRef.current = offsets;

      // Restore the scroll anchor captured before this zoom change so the
      // same content stays under the user.
      const anchor = pendingZoomAnchorRef.current;
      if (anchor && offsets.length > 0) {
        const pageTop = offsets[anchor.pageIdx] ?? 0;
        const nextTop =
          offsets[anchor.pageIdx + 1] ??
          pageTop + Math.max(1, root.clientHeight);
        const pageHeight = Math.max(1, nextTop - pageTop);
        ioSourceRef.current = true;
        root.scrollTop = pageTop + pageHeight * anchor.ratio;
        pendingZoomAnchorRef.current = null;
      }
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(id);
    };
  }, [meta, containerWidth, totalPages, zoom]);

  useEffect(() => {
    const root = scrollRef.current;
    if (!root || totalPages === 0) return;

    const computeCurrentPage = (): number => {
      const offsets = pageOffsetsRef.current;
      if (offsets.length === 0) return pageRef.current || 1;
      // Anchor a bit below the viewport top so the indicator flips when the
      // next page actually starts dominating the viewport, not when its top
      // edge first touches the viewport.
      const anchor =
        root.scrollTop + Math.min(96, Math.max(48, root.clientHeight * 0.2));
      // Binary search for the largest index whose offset ≤ anchor.
      let lo = 0;
      let hi = offsets.length - 1;
      let ans = 0;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (offsets[mid]! <= anchor) {
          ans = mid;
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }
      return ans + 1;
    };

    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        const cur = computeCurrentPage();
        if (cur !== pageRef.current) {
          ioSourceRef.current = true;
          onGotoPageRef.current(cur);
        }
      });
    };
    root.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => root.removeEventListener('scroll', onScroll);
  }, [totalPages]);

  // External nav: scroll the requested page into view.
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
      target.scrollIntoView({ behavior: 'auto', block: 'start' });
    }
  }, [page, totalPages]);

  // Apply `.hl-current` to the right <mark>; re-applies as new pages mount
  // (visiblePages changes). Does NOT scroll — scrolling is handled below so
  // the user is free to scroll the page without being yanked back.
  useEffect(() => {
    if (!inSearch) return;
    const root = scrollRef.current;
    if (!root) return;
    root.querySelectorAll('mark.hl.hl-current').forEach((m) => m.classList.remove('hl-current'));

    const cur = hits[occIdx];
    if (!cur) return;

    let localIdx = 0;
    for (let i = 0; i < occIdx; i++) {
      if (hits[i]!.page === cur.page) localIdx++;
    }
    const pageEl = root.querySelector(`[data-page="${cur.page}"]`);
    const marks = pageEl?.querySelectorAll('mark.hl');
    const mark = marks?.[localIdx] as HTMLElement | undefined;
    if (mark) mark.classList.add('hl-current');
  }, [inSearch, hits, occIdx, visiblePages]);

  // Scroll to current mark — only on user-initiated nav (occIdx change OR
  // explicit scrollNonce bump for re-clicking the same hit). NOT on
  // visiblePages changes, so manual scrolling stays sticky.
  useEffect(() => {
    if (!inSearch) return;
    const root = scrollRef.current;
    if (!root) return;
    const cur = hits[occIdx];
    if (!cur) return;

    let localIdx = 0;
    for (let i = 0; i < occIdx; i++) {
      if (hits[i]!.page === cur.page) localIdx++;
    }

    let attempts = 0;
    let rafId = 0;
    const tryScroll = () => {
      attempts++;
      const pageEl = root.querySelector(`[data-page="${cur.page}"]`);
      const marks = pageEl?.querySelectorAll('mark.hl');
      const mark = marks?.[localIdx] as HTMLElement | undefined;
      if (mark) {
        mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      if (attempts < 60) rafId = requestAnimationFrame(tryScroll);
    };
    rafId = requestAnimationFrame(tryScroll);
    return () => cancelAnimationFrame(rafId);
  }, [inSearch, hits, occIdx, scrollNonce]);

  // Ctrl/Cmd + wheel zoom (PC). Trackpad pinch-zoom also dispatches as
  // ctrlKey + wheel events on most browsers, so this handles both.
  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    let lastWheelTs = 0;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const now = performance.now();
      // Debounce so a single trackpad swipe doesn't fly through every step.
      if (now - lastWheelTs < 90) return;
      lastWheelTs = now;
      applyZoom((z) => nextZoom(z, e.deltaY < 0 ? 1 : -1));
    };
    root.addEventListener('wheel', onWheel, { passive: false });
    return () => root.removeEventListener('wheel', onWheel);
  }, [applyZoom]);

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

          <div className="hidden items-center gap-0.5 rounded-lg border border-border bg-surface px-1 py-1 lg:flex">
            <button
              onClick={() => applyZoom((z) => nextZoom(z, -1))}
              disabled={zoom <= ZOOM_MIN + 0.001}
              className="rounded p-1.5 text-text-muted hover:bg-surface-2 hover:text-text-strong disabled:opacity-30"
              aria-label="Zoom out"
              title="Zoom out (Ctrl+wheel)"
            >
              <ZoomOut size={16} />
            </button>
            <button
              onClick={() => applyZoom(() => 1)}
              className="min-w-[3.25rem] rounded px-1 py-1 text-[11px] tabular-nums text-text-muted hover:bg-surface-2 hover:text-text-strong"
              aria-label="Reset zoom"
              title="Reset zoom"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              onClick={() => applyZoom((z) => nextZoom(z, 1))}
              disabled={zoom >= ZOOM_MAX - 0.001}
              className="rounded p-1.5 text-text-muted hover:bg-surface-2 hover:text-text-strong disabled:opacity-30"
              aria-label="Zoom in"
              title="Zoom in (Ctrl+wheel)"
            >
              <ZoomIn size={16} />
            </button>
          </div>

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

      <div ref={scrollRef} className="flex-1 overflow-auto bg-surface-2/40">
        <div
          ref={measureRef}
          className="pointer-events-none invisible mx-auto w-full max-w-3xl"
          style={{ height: 0 }}
          aria-hidden
        />
        {metaError && (
          <div className="mx-auto mt-3 max-w-3xl rounded-lg border border-warn/40 bg-warn/5 p-4 text-sm text-warn">
            Greška učitavanja: {metaError}
          </div>
        )}
        {!meta && !metaError && (
          <div className="flex h-64 items-center justify-center gap-2 text-sm text-text-muted">
            <Loader2 size={16} className="animate-spin" /> Učitavam skriptu…
          </div>
        )}
        {meta && containerWidth > 0 && (
          <div
            className="mx-auto flex flex-col items-center gap-3 px-2 py-3 sm:gap-4 sm:px-4 sm:py-5"
            style={{ width: containerWidth * zoom }}
          >
            {meta.pages.map((dim, i) => {
              const p = i + 1;
              const w = containerWidth * zoom;
              const renderedH = (dim.h / dim.w) * w;
              const shouldRender = visiblePages.has(p);
              return (
                <PageBlock
                  key={p}
                  pageNum={p}
                  slug={slug}
                  width={w}
                  height={renderedH}
                  pageDim={dim}
                  shouldRender={shouldRender}
                  term={term ?? null}
                />
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

interface PageBlockProps {
  pageNum: number;
  slug: string;
  width: number;
  height: number;
  pageDim: { w: number; h: number };
  shouldRender: boolean;
  term: string | null;
}

interface PageImageState {
  src: string | null;
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
}

function usePageImageSrc(slug: string, page: number, enabled: boolean): PageImageState {
  const [state, setState] = useState<PageImageState>({
    src: null,
    status: 'idle',
    error: null,
  });
  useEffect(() => {
    if (!enabled) {
      setState({ src: null, status: 'idle', error: null });
      return;
    }
    let cancelled = false;
    let allocated: string | null = null;
    setState({ src: null, status: 'loading', error: null });
    pageImageUrl(slug, page)
      .then((u) => {
        if (cancelled) {
          if (u.startsWith('blob:')) URL.revokeObjectURL(u);
          return;
        }
        allocated = u.startsWith('blob:') ? u : null;
        setState({ src: u, status: 'ready', error: null });
      })
      .catch((err) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        // eslint-disable-next-line no-console
        console.error(`pageImageUrl(${slug}, ${page}) failed:`, err);
        setState({ src: null, status: 'error', error: msg });
      });
    return () => {
      cancelled = true;
      if (allocated) URL.revokeObjectURL(allocated);
    };
  }, [slug, page, enabled]);
  return state;
}

function PageBlock({ pageNum, slug, width, height, pageDim, shouldRender, term }: PageBlockProps) {
  const { src: imgSrc, status, error } = usePageImageSrc(slug, pageNum, shouldRender);
  return (
    <div
      data-page={pageNum}
      className="relative w-full bg-white shadow-sm"
      style={{ width, height }}
    >
      <div className="absolute left-2 top-2 z-10 rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-white">
        {pageNum}
      </div>
      {shouldRender && (
        <>
          {status === 'loading' && (
            <div className="absolute inset-0 flex items-center justify-center text-text-muted">
              <Loader2 size={18} className="animate-spin" />
            </div>
          )}
          {status === 'error' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 p-4 text-center text-xs text-warn">
              <span className="font-medium">Greška renderiranja</span>
              <span className="text-text-muted">{error}</span>
            </div>
          )}
          {imgSrc && (
            <img
              src={imgSrc}
              alt={`Stranica ${pageNum}`}
              loading="lazy"
              decoding="async"
              width={width}
              height={height}
              className="block h-full w-full select-none"
            />
          )}
          {term && <PageTextOverlay slug={slug} pageNum={pageNum} pageDim={pageDim} term={term} />}
        </>
      )}
    </div>
  );
}

interface PageTextOverlayProps {
  slug: string;
  pageNum: number;
  pageDim: { w: number; h: number };
  term: string;
}

interface MatchRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

function computeMatches(spans: RenderedPageSpan[], term: string): MatchRect[] {
  const re = new RegExp(escapeRegex(term), 'gi');
  const out: MatchRect[] = [];
  for (const span of spans) {
    const text = span.t;
    if (!text) continue;
    const len = text.length;
    if (len === 0) continue;
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const idx = m.index;
      const mlen = m[0].length;
      // Approximate match position as a fraction of the span (treats glyphs
      // as roughly equal-width — close enough for highlight overlays).
      out.push({
        left: span.x + (idx / len) * span.w,
        top: span.y,
        width: (mlen / len) * span.w,
        height: span.h,
      });
      // Guard against zero-length regex (shouldn't happen, but…).
      if (m[0].length === 0) re.lastIndex++;
    }
  }
  return out;
}

function PageTextOverlay({ slug, pageNum, pageDim, term }: PageTextOverlayProps) {
  const [data, setData] = useState<RenderedPageText | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadRenderedPageText(slug, pageNum).then((d) => {
      if (!cancelled) setData(d);
    });
    return () => {
      cancelled = true;
    };
  }, [slug, pageNum]);

  const matches = useMemo(() => {
    if (!data) return [];
    return computeMatches(data.s, term);
  }, [data, term]);

  if (matches.length === 0) return null;
  return (
    <div className="image-overlay pointer-events-none absolute inset-0 z-[1]">
      {matches.map((m, i) => (
        <mark
          key={i}
          className="hl absolute block"
          style={{
            left: `${(m.left / pageDim.w) * 100}%`,
            top: `${(m.top / pageDim.h) * 100}%`,
            width: `${(m.width / pageDim.w) * 100}%`,
            height: `${(m.height / pageDim.h) * 100}%`,
          }}
        />
      ))}
    </div>
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
