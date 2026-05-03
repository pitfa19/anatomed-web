import * as pdfjs from 'pdfjs-dist';
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { Hit, PdfDoc, SourceMeta } from './types';
import type { RenderedMeta, RenderedPageSpan } from './data';
import { makeLocalSlug } from './localDocs';

if (!pdfjs.GlobalWorkerOptions.workerSrc) {
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
}

const CONTEXT_CHARS = 60;
const MIN_TERM_LEN = 3;

export class PdfPasswordError extends Error {
  constructor(msg = 'PDF is password-protected') {
    super(msg);
    this.name = 'PdfPasswordError';
  }
}

export type ProgressStage = 'load' | 'page';
export interface ProgressEvent {
  stage: ProgressStage;
  current: number;
  total: number;
}

export interface IndexResult {
  slug: string;
  pdfDoc: PdfDoc;
  meta: RenderedMeta;
  pageSpans: Map<number, RenderedPageSpan[]>;
  pdfBlob: Blob;
  sourceMeta: SourceMeta;
  /** Set when no terms were found at all and no spans had any text - likely a scanned PDF. */
  warning?: 'no_searchable_text';
}

interface IndexOpts {
  onProgress?: (e: ProgressEvent) => void;
  signal?: AbortSignal;
  /** Override slug (testing). */
  slug?: string;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function stripExt(name: string): string {
  return name.replace(/\.pdf$/i, '');
}

function checkAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException('Upload aborted', 'AbortError');
  }
}

/**
 * Find term occurrences on a single page. Port of find_hits() from
 * tools/build_pdf_index.py. For each term: try \bterm\b first (exact=true),
 * fall back to substring (exact=false), capture 60-char pre/post context.
 */
function findHitsOnPage(
  pageText: string,
  pageNum: number,
  docName: string,
  terms: string[],
): Array<{ term: string; hit: Hit }> {
  const out: Array<{ term: string; hit: Hit }> = [];
  const textLower = pageText.toLowerCase();

  for (const term of terms) {
    const termLower = term.toLowerCase();
    if (termLower.length < MIN_TERM_LEN) continue;

    let start = -1;
    let end = -1;
    let exact = false;

    const exactRe = new RegExp(`\\b${escapeRegex(termLower)}\\b`);
    const m = exactRe.exec(textLower);
    if (m) {
      start = m.index;
      end = m.index + m[0].length;
      exact = true;
    } else {
      const idx = textLower.indexOf(termLower);
      if (idx === -1) continue;
      start = idx;
      end = idx + termLower.length;
      exact = false;
    }

    const pre = pageText.slice(Math.max(0, start - CONTEXT_CHARS), start).trim();
    const matched = pageText.slice(start, end);
    const post = pageText.slice(end, end + CONTEXT_CHARS).trim();

    out.push({
      term,
      hit: {
        doc: docName,
        page: pageNum,
        exact,
        pre,
        match: matched,
        post,
      },
    });
  }

  return out;
}

export async function indexAndExtractSpans(
  input: File | { buffer: ArrayBuffer; filename: string },
  termList: string[],
  opts: IndexOpts = {},
): Promise<IndexResult> {
  const { onProgress, signal } = opts;
  const filename = 'filename' in input ? input.filename : input.name;
  const slug = opts.slug ?? makeLocalSlug(filename);
  const docName = `${slug}.pdf`;
  const docLabel = stripExt(filename);

  // De-dupe term list while preserving display casing.
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const t of termList) {
    const lc = t.toLowerCase();
    if (lc.length < MIN_TERM_LEN || seen.has(lc)) continue;
    seen.add(lc);
    terms.push(t);
  }

  onProgress?.({ stage: 'load', current: 0, total: 1 });
  checkAborted(signal);

  const arrayBuffer =
    'buffer' in input ? input.buffer : await input.arrayBuffer();
  if (arrayBuffer.byteLength === 0) {
    throw new Error('PDF datoteka je prazna ili se nije mogla pročitati.');
  }
  checkAborted(signal);

  // Build the Blob NOW, while the buffer is still valid. pdfjs-dist transfers
  // ownership of the Uint8Array's underlying ArrayBuffer to its worker thread,
  // which detaches it on the main side - so any later read (including
  // `new Blob([arrayBuffer])`) would see 0 bytes.
  const pdfBlob = new Blob([arrayBuffer], { type: 'application/pdf' });

  // Hand pdfjs a fresh, independent copy so the detach can't affect anything
  // else we still hold.
  const pdfjsData = new Uint8Array(arrayBuffer.byteLength);
  pdfjsData.set(new Uint8Array(arrayBuffer));

  let pdf: pdfjs.PDFDocumentProxy;
  try {
    const loadingTask = pdfjs.getDocument({
      data: pdfjsData,
      // Disable so we don't pop a browser prompt; surface as our typed error.
      password: '',
    });
    pdf = await loadingTask.promise;
  } catch (err: unknown) {
    if (
      err &&
      typeof err === 'object' &&
      'name' in err &&
      (err as { name: string }).name === 'PasswordException'
    ) {
      throw new PdfPasswordError();
    }
    throw err;
  }

  onProgress?.({ stage: 'load', current: 1, total: 1 });

  const totalPages = pdf.numPages;
  const pagesMeta: { w: number; h: number }[] = [];
  const pageSpans = new Map<number, RenderedPageSpan[]>();
  const index: Record<string, Hit[]> = {};
  const termsFoundSet = new Set<string>();
  const pages: Record<string, string> = {};
  let anyText = false;

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    checkAborted(signal);
    onProgress?.({ stage: 'page', current: pageNum - 1, total: totalPages });

    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1 });
    const pageW = viewport.width;
    const pageH = viewport.height;
    pagesMeta.push({ w: round2(pageW), h: round2(pageH) });

    const tc = await page.getTextContent();
    const spans: RenderedPageSpan[] = [];
    const textParts: string[] = [];

    for (const it of tc.items as Array<{
      str?: string;
      transform?: number[];
      width?: number;
      height?: number;
    }>) {
      const str = it.str ?? '';
      if (!str) {
        continue;
      }
      textParts.push(str);
      if (!str.trim() || !it.transform) {
        continue;
      }
      const transform = it.transform;
      const fontHeight = Math.abs(transform[3] ?? 0) || Math.abs(transform[0] ?? 0);
      const xUserBL = transform[4] ?? 0;
      const yBaselineBL = transform[5] ?? 0;
      const xTL = xUserBL;
      const yTL = pageH - yBaselineBL - fontHeight;
      const w = it.width ?? 0;
      spans.push({
        x: round1(xTL),
        y: round1(yTL),
        w: round1(w),
        h: round1(fontHeight),
        t: str,
      });
    }
    pageSpans.set(pageNum, spans);

    const pageText = textParts.join('\n');
    if (pageText.trim()) {
      anyText = true;
      const hits = findHitsOnPage(pageText, pageNum, docName, terms);
      for (const { term, hit } of hits) {
        if (!index[term]) index[term] = [];
        index[term].push(hit);
        termsFoundSet.add(term);
      }
    }
    pages[String(pageNum)] = '';

    page.cleanup();
  }

  onProgress?.({ stage: 'page', current: totalPages, total: totalPages });

  await pdf.cleanup();
  await pdf.destroy();

  const termsFound = Array.from(termsFoundSet).sort((a, b) => a.localeCompare(b));

  const sourceMeta: SourceMeta = {
    doc: docName,
    label: docLabel,
    badge: 'LOCAL',
    color: '#64748b',
  };

  const pdfDoc: PdfDoc = {
    doc_name: docName,
    doc_label: docLabel,
    total_pages: totalPages,
    terms: termsFound,
    index,
    pages,
  };

  const meta: RenderedMeta = {
    total_pages: totalPages,
    pages: pagesMeta,
  };

  const result: IndexResult = {
    slug,
    pdfDoc,
    meta,
    pageSpans,
    pdfBlob,
    sourceMeta,
  };
  if (!anyText) {
    result.warning = 'no_searchable_text';
  }
  return result;
}
