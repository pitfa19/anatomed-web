import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import SearchBar from '../components/docs/SearchBar';
import SourcePicker from '../components/docs/SourcePicker';
import HitList from '../components/docs/HitList';
import PageList from '../components/docs/PageList';
import RenderedPdfViewer from '../components/docs/RenderedPdfViewer';
import UploadPdfButton from '../components/docs/UploadPdfButton';
import OnThisPagePanel from '../components/docs/OnThisPagePanel';
import {
  bumpLocalDocsCache,
  getRenderedSlug,
  getSourceForDoc,
  loadUnifiedIndex,
} from '../lib/data';
import { deleteLocalDoc, isLocalDocName } from '../lib/localDocs';
import { cloudDeleteDoc, isCloudTracked } from '../lib/cloudDocs';
import { useAuth } from '../lib/AuthContext';
import { findCatalogPartByTermAnyCase, loadCatalog } from '../lib/viewer/catalog';
import type { Part, PartsCatalog } from '../lib/viewer/types';
import type { Hit, UnifiedIndex } from '../lib/types';
import { Loader2, ArrowLeft, Box, X as XIcon } from 'lucide-react';
import { cn } from '../lib/cn';

export default function Docs() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [data, setData] = useState<UnifiedIndex | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [term, setTerm] = useState<string | null>(null);
  const [selectedDoc, setSelectedDoc] = useState<string | null>(null);
  const [hitIdx, setHitIdx] = useState<number | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // PDF page (1-based) currently focused. Driven by user nav OR by IO-based
  // scroll tracking inside PdfViewer.
  const [visiblePage, setVisiblePage] = useState(1);
  // Total pages reported by the PDF document on load.
  const [totalPages, setTotalPages] = useState(0);
  // Bumps when the user explicitly asks to center on the selected hit (clicks
  // a hit row, prev/next, deep-link). Lets the viewer re-scroll even if
  // occIdx didn't change (re-clicking the same hit).
  const [scrollNonce, setScrollNonce] = useState(0);

  useEffect(() => {
    loadUnifiedIndex()
      .then(setData)
      .catch((e) => setError(e.message ?? String(e)));
  }, []);

  const [catalog, setCatalog] = useState<PartsCatalog | null>(null);
  useEffect(() => {
    loadCatalog()
      .then(setCatalog)
      .catch(() => {
        /* 3D catalog is optional here — failure just hides the cross-link chip */
      });
  }, []);

  const part3D: Part | null = useMemo(() => {
    if (!catalog || !term) return null;
    return findCatalogPartByTermAnyCase(catalog, term);
  }, [catalog, term]);

  // Apply ?q=&doc=&page= once data is loaded. Re-applies whenever the URL
  // changes (e.g. user clicks another agent-generated link while already on
  // /docs).
  const lastAppliedKey = useRef<string | null>(null);
  useEffect(() => {
    if (!data) return;
    const q = searchParams.get('q');
    const doc = searchParams.get('doc');
    const pageStr = searchParams.get('page');
    const key = `${q ?? ''}|${doc ?? ''}|${pageStr ?? ''}`;
    if (lastAppliedKey.current === key) return;
    lastAppliedKey.current = key;
    if (!q && !doc) return;

    if (q) setTerm(q);
    if (doc) setSelectedDoc(doc);
    if (pageStr) {
      const p = Number(pageStr);
      if (Number.isFinite(p) && p >= 1) setVisiblePage(p);
    }
    if (q && doc) {
      const docHits = (data.index[q] ?? []).filter((h) => h.doc === doc);
      if (docHits.length > 0) {
        const targetPage = pageStr ? Number(pageStr) : docHits[0]!.page;
        const idx = docHits.findIndex((h) => h.page === targetPage);
        setHitIdx(idx >= 0 ? idx : 0);
        setScrollNonce((n) => n + 1);
      } else {
        setHitIdx(null);
      }
    }
  }, [data, searchParams]);

  const hitsByDoc = useMemo<Record<string, Hit[]>>(() => {
    if (!data || !term) return {};
    const out: Record<string, Hit[]> = {};
    const all = data.index[term] ?? [];
    for (const src of data.sources) out[src.doc] = [];
    for (const h of all) {
      if (!out[h.doc]) out[h.doc] = [];
      out[h.doc].push(h);
    }
    return out;
  }, [data, term]);

  const pagesByDoc = useMemo<Record<string, number>>(() => {
    if (!data) return {};
    const out: Record<string, number> = {};
    for (const src of data.sources) out[src.doc] = data.pages[src.doc]?.length ?? 0;
    return out;
  }, [data]);

  const selectedHits = selectedDoc ? hitsByDoc[selectedDoc] ?? [] : [];
  const inSearchMode = term !== null;
  const source = selectedDoc ? getSourceForDoc(selectedDoc) : null;
  const slug = selectedDoc ? getRenderedSlug(selectedDoc) : null;

  // Reset totalPages when switching docs so the new doc re-reports it.
  // Note: visiblePage is intentionally NOT reset here — every code path that
  // changes selectedDoc (pickDoc, URL-param effect) sets visiblePage itself,
  // and resetting here would clobber a deep-linked ?page= from the agent.
  useEffect(() => {
    setTotalPages(0);
  }, [selectedDoc]);

  function pickTerm(t: string) {
    setTerm(t);
    if (!selectedDoc) {
      setHitIdx(null);
      return;
    }
    const newHits = (data?.index?.[t] ?? []).filter((h) => h.doc === selectedDoc);
    if (newHits.length > 0) {
      setHitIdx(0);
      setVisiblePage(newHits[0]!.page);
      setScrollNonce((n) => n + 1);
    } else {
      setHitIdx(null);
    }
  }

  function clearTerm() {
    setTerm(null);
    setHitIdx(null);
  }

  function pickDoc(doc: string) {
    setSelectedDoc(doc);
    setVisiblePage(1);
    if (inSearchMode) {
      const docHits = (data?.index?.[term!] ?? []).filter((h) => h.doc === doc);
      if (docHits.length > 0) {
        setHitIdx(0);
        setVisiblePage(docHits[0]!.page);
        setScrollNonce((n) => n + 1);
      } else {
        setHitIdx(null);
      }
    }
    setDrawerOpen(false);
  }

  function backToSources() {
    setSelectedDoc(null);
    setHitIdx(null);
    setDrawerOpen(false);
  }

  function stepOcc(delta: number) {
    if (selectedHits.length === 0) return;
    setHitIdx((idx) => {
      const cur = idx ?? 0;
      const next = (cur + delta + selectedHits.length) % selectedHits.length;
      const nextHit = selectedHits[next];
      if (nextHit) setVisiblePage(nextHit.page);
      return next;
    });
    setScrollNonce((n) => n + 1);
  }

  function gotoPage(p: number) {
    if (!source || totalPages === 0) return;
    const clamped = Math.min(totalPages, Math.max(1, p));
    setVisiblePage(clamped);
    setDrawerOpen(false);
  }

  function pickHit(i: number) {
    setHitIdx(i);
    const h = selectedHits[i];
    if (h) setVisiblePage(h.page);
    setScrollNonce((n) => n + 1);
    setDrawerOpen(false);
  }

  function closeViewer() {
    setSelectedDoc(null);
    setHitIdx(null);
  }

  const localDocsSet = useMemo(() => {
    if (!data) return new Set<string>();
    return new Set(data.sources.filter((s) => isLocalDocName(s.doc)).map((s) => s.doc));
  }, [data]);

  const refreshData = useCallback(async () => {
    bumpLocalDocsCache();
    const fresh = await loadUnifiedIndex();
    setData(fresh);
    return fresh;
  }, []);

  const handleUploaded = useCallback(
    async (slug: string) => {
      const fresh = await refreshData();
      const newDocName = `${slug}.pdf`;
      if (fresh.sources.some((s) => s.doc === newDocName)) {
        setSelectedDoc(newDocName);
        setVisiblePage(1);
        setHitIdx(null);
      }
    },
    [refreshData],
  );

  const handleDelete = useCallback(
    async (doc: string) => {
      if (!isLocalDocName(doc)) return;
      const slug = doc.replace(/\.pdf$/i, '');
      const wasActive = selectedDoc === doc;
      const { evictLocalDoc } = await import('../lib/localPdfRender').catch(() => ({
        evictLocalDoc: undefined as ((s: string) => void) | undefined,
      }));
      try {
        await deleteLocalDoc(slug);
        evictLocalDoc?.(slug);
      } catch (err) {
        console.warn('deleteLocalDoc failed', err);
      }
      if (user && isCloudTracked(slug)) {
        try {
          await cloudDeleteDoc(user.id, slug);
        } catch (err) {
          console.warn('cloudDeleteDoc failed', err);
        }
      }
      if (wasActive) {
        setSelectedDoc(null);
        setHitIdx(null);
        setDrawerOpen(false);
      }
      await refreshData();
    },
    [selectedDoc, refreshData, user],
  );

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-sm text-warn">
        Greška učitavanja: {error}
      </div>
    );
  }
  if (!data) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-text-muted">
        <Loader2 size={16} className="animate-spin" /> Učitavam skripte…
      </div>
    );
  }

  // Landing layout: nothing selected → big search + big source cards centered.
  if (!selectedDoc) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:gap-8 sm:px-8 sm:py-16">
          <div className="flex flex-col gap-2 text-center">
            <h1 className="text-2xl font-semibold tracking-tight text-text-strong sm:text-4xl">
              Skripte
            </h1>
            <p className="text-sm text-text-muted sm:text-base">
              Pretraži termin ili otvori cijelu skriptu.
            </p>
          </div>
          <SearchBar
            terms={data.allTerms}
            value={term ?? ''}
            onPick={pickTerm}
            onClear={clearTerm}
            autoFocus
            size="lg"
          />
          {part3D && <ViewIn3DChip part={part3D} variant="hero" />}
          <SourcePicker
            term={term}
            hitsByDoc={hitsByDoc}
            pagesByDoc={pagesByDoc}
            sources={data.sources}
            selected={selectedDoc}
            onSelect={pickDoc}
            variant="hero"
            localDocs={localDocsSet}
            onDelete={handleDelete}
          />
          <UploadPdfButton onUploaded={handleUploaded} />
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-full overflow-hidden lg:gap-3 lg:p-3">
      {drawerOpen && (
        <button
          type="button"
          aria-label="Close menu"
          onClick={() => setDrawerOpen(false)}
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-[88vw] max-w-[320px] flex-col gap-3 overflow-hidden border-r border-border bg-bg p-3 shadow-xl transition-transform',
          drawerOpen ? 'translate-x-0' : '-translate-x-full',
          'lg:static lg:z-0 lg:w-[300px] lg:max-w-none lg:translate-x-0 lg:border-r-0 lg:p-0 lg:shadow-none',
        )}
      >
        <div className="flex items-center justify-between">
          <button
            onClick={backToSources}
            className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-text-muted hover:bg-surface hover:text-text-strong"
          >
            <ArrowLeft size={14} /> Sve skripte
          </button>
          <button
            onClick={() => setDrawerOpen(false)}
            aria-label="Close menu"
            className="rounded-md p-1.5 text-text-muted hover:bg-surface hover:text-text-strong lg:hidden"
          >
            <XIcon size={16} />
          </button>
        </div>
        <SearchBar
          terms={data.allTerms}
          value={term ?? ''}
          onPick={pickTerm}
          onClear={clearTerm}
        />
        {part3D && <ViewIn3DChip part={part3D} variant="sidebar" />}
        {!inSearchMode && selectedDoc && (
          <OnThisPagePanel
            doc={selectedDoc}
            page={visiblePage}
            unified={data}
            catalog={catalog}
            onGotoPage={gotoPage}
          />
        )}
        {inSearchMode ? (
          selectedHits.length > 0 ? (
            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              <HitList hits={selectedHits} selectedIdx={hitIdx} onPick={pickHit} />
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              <p className="mb-3 rounded-lg border border-border bg-surface p-3 text-sm text-text-muted">
                Nema rezultata za{' '}
                <span className="font-medium text-text-strong">{term}</span> u ovoj skripti.
              </p>
              {Object.values(hitsByDoc).some((h) => h.length > 0) && (
                <>
                  <p className="mb-1.5 text-xs uppercase tracking-wider text-text-muted">
                    Pronađeno u
                  </p>
                  <SourcePicker
                    term={term}
                    hitsByDoc={hitsByDoc}
                    pagesByDoc={pagesByDoc}
                    sources={data.sources}
                    selected={selectedDoc}
                    onSelect={pickDoc}
                    localDocs={localDocsSet}
                    onDelete={handleDelete}
                  />
                </>
              )}
            </div>
          )
        ) : (
          <PageList
            totalPages={totalPages}
            currentPage={visiblePage}
            onPick={gotoPage}
          />
        )}
      </aside>

      <div className="min-h-0 flex-1 overflow-hidden p-2 sm:p-3 lg:p-0">
        {source && slug ? (
          <RenderedPdfViewer
            source={source}
            slug={slug}
            page={visiblePage}
            totalPages={totalPages}
            onTotalPagesChange={setTotalPages}
            term={term ?? null}
            hits={inSearchMode ? selectedHits : []}
            occIdx={hitIdx ?? 0}
            scrollNonce={scrollNonce}
            onStepOcc={inSearchMode && selectedHits.length > 0 ? stepOcc : undefined}
            onGotoPage={gotoPage}
            onClose={closeViewer}
            onMenuClick={() => setDrawerOpen(true)}
          />
        ) : (
          <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-border bg-surface/40 p-10 text-center text-sm text-text-muted">
            Učitavam skriptu…
          </div>
        )}
      </div>
    </div>
  );
}

function ViewIn3DChip({ part, variant }: { part: Part; variant: 'hero' | 'sidebar' }) {
  const to = `/viewer?part=${encodeURIComponent(part.id)}`;
  if (variant === 'hero') {
    return (
      <Link
        to={to}
        className="mx-auto flex items-center gap-2 rounded-full border border-accent/40 bg-accent/10 px-3 py-1.5 text-sm font-medium text-accent transition-colors hover:bg-accent/20"
      >
        <Box size={14} />
        Pogledaj u 3D — {part.name_en}
      </Link>
    );
  }
  return (
    <Link
      to={to}
      className="flex items-center gap-2 rounded-lg border border-accent/40 bg-accent/10 px-2.5 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/20"
    >
      <Box size={12} />
      Pogledaj u 3D
    </Link>
  );
}
