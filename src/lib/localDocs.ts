import type { Hit, PdfDoc, SourceMeta } from './types';
import type { RenderedMeta, RenderedPageSpan } from './data';

const DB_NAME = 'anatomed-local-docs';
const DB_VERSION = 1;
const STORE_DOCS = 'docs';
const STORE_SPANS = 'pageSpans';
const STORE_PDF = 'pdfBlobs';
const STORE_IMAGES = 'pageImages';

export interface LocalDocRecord {
  slug: string;
  doc_name: string;
  doc_label: string;
  total_pages: number;
  terms: string[];
  index: Record<string, Hit[]>;
  pages: Record<string, string>;
  meta: RenderedMeta;
  sourceMeta: SourceMeta;
  createdAt: number;
}

export interface LocalDocSummary {
  slug: string;
  doc_name: string;
  doc_label: string;
  total_pages: number;
  sourceMeta: SourceMeta;
  createdAt: number;
}

export interface IndexResultLike {
  slug: string;
  pdfDoc: PdfDoc;
  meta: RenderedMeta;
  pageSpans: Map<number, RenderedPageSpan[]>;
  pdfBlob: Blob;
  sourceMeta: SourceMeta;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_DOCS)) {
        db.createObjectStore(STORE_DOCS, { keyPath: 'slug' });
      }
      if (!db.objectStoreNames.contains(STORE_SPANS)) {
        db.createObjectStore(STORE_SPANS, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(STORE_PDF)) {
        db.createObjectStore(STORE_PDF, { keyPath: 'slug' });
      }
      if (!db.objectStoreNames.contains(STORE_IMAGES)) {
        db.createObjectStore(STORE_IMAGES, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function spanKey(slug: string, page: number): string {
  return `${slug}|${page}`;
}

function tx(
  db: IDBDatabase,
  stores: string[],
  mode: IDBTransactionMode,
): IDBTransaction {
  return db.transaction(stores, mode);
}

function awaitTx(t: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error ?? new Error('Transaction aborted'));
  });
}

function reqPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveLocalDoc(r: IndexResultLike): Promise<void> {
  if (!r.pdfBlob || r.pdfBlob.size === 0) {
    throw new Error('Refusing to save local doc: pdfBlob is empty');
  }
  const db = await openDb();

  // Step 1: PDF blob.
  {
    const t = tx(db, [STORE_PDF], 'readwrite');
    t.objectStore(STORE_PDF).put({ slug: r.slug, blob: r.pdfBlob });
    await awaitTx(t);
  }

  // Step 2: per-page spans (chunked into one transaction).
  {
    const t = tx(db, [STORE_SPANS], 'readwrite');
    const store = t.objectStore(STORE_SPANS);
    for (const [page, spans] of r.pageSpans.entries()) {
      store.put({ key: spanKey(r.slug, page), slug: r.slug, page, spans });
    }
    await awaitTx(t);
  }

  // Step 3: docs record LAST — its presence flags the doc as complete.
  {
    const t = tx(db, [STORE_DOCS], 'readwrite');
    const record: LocalDocRecord = {
      slug: r.slug,
      doc_name: r.pdfDoc.doc_name,
      doc_label: r.pdfDoc.doc_label,
      total_pages: r.pdfDoc.total_pages,
      terms: r.pdfDoc.terms,
      index: r.pdfDoc.index,
      pages: r.pdfDoc.pages,
      meta: r.meta,
      sourceMeta: r.sourceMeta,
      createdAt: Date.now(),
    };
    t.objectStore(STORE_DOCS).put(record);
    await awaitTx(t);
  }
}

let cleanedThisSession = false;

export async function listLocalDocs(): Promise<LocalDocSummary[]> {
  if (!cleanedThisSession) {
    cleanedThisSession = true;
    await cleanupOrphans();
  }
  const db = await openDb();
  const t = tx(db, [STORE_DOCS], 'readonly');
  const all = await reqPromise(
    t.objectStore(STORE_DOCS).getAll() as IDBRequest<LocalDocRecord[]>,
  );
  return all
    .map((d) => ({
      slug: d.slug,
      doc_name: d.doc_name,
      doc_label: d.doc_label,
      total_pages: d.total_pages,
      sourceMeta: d.sourceMeta,
      createdAt: d.createdAt,
    }))
    .sort((a, b) => a.createdAt - b.createdAt);
}

export async function loadLocalPdfDoc(slug: string): Promise<PdfDoc> {
  const db = await openDb();
  const t = tx(db, [STORE_DOCS], 'readonly');
  const rec = await reqPromise(
    t.objectStore(STORE_DOCS).get(slug) as IDBRequest<LocalDocRecord | undefined>,
  );
  if (!rec) throw new Error(`Local doc not found: ${slug}`);
  return {
    doc_name: rec.doc_name,
    doc_label: rec.doc_label,
    total_pages: rec.total_pages,
    terms: rec.terms,
    index: rec.index,
    pages: rec.pages,
  };
}

export async function loadLocalRenderedMeta(slug: string): Promise<RenderedMeta> {
  const db = await openDb();
  const t = tx(db, [STORE_DOCS], 'readonly');
  const rec = await reqPromise(
    t.objectStore(STORE_DOCS).get(slug) as IDBRequest<LocalDocRecord | undefined>,
  );
  if (!rec) throw new Error(`Local doc not found: ${slug}`);
  return rec.meta;
}

export async function loadLocalPageSpans(
  slug: string,
  page: number,
): Promise<RenderedPageSpan[]> {
  const db = await openDb();
  const t = tx(db, [STORE_SPANS], 'readonly');
  const rec = await reqPromise(
    t.objectStore(STORE_SPANS).get(spanKey(slug, page)) as IDBRequest<
      { spans: RenderedPageSpan[] } | undefined
    >,
  );
  return rec?.spans ?? [];
}

export async function loadLocalPdfBlob(slug: string): Promise<Blob> {
  const db = await openDb();
  const t = tx(db, [STORE_PDF], 'readonly');
  const rec = await reqPromise(
    t.objectStore(STORE_PDF).get(slug) as IDBRequest<{ blob: Blob } | undefined>,
  );
  if (!rec) throw new Error(`Local PDF blob not found: ${slug}`);
  return rec.blob;
}

export async function loadLocalPageImageBlob(
  slug: string,
  page: number,
): Promise<Blob | null> {
  const db = await openDb();
  const t = tx(db, [STORE_IMAGES], 'readonly');
  const rec = await reqPromise(
    t.objectStore(STORE_IMAGES).get(spanKey(slug, page)) as IDBRequest<
      { blob: Blob } | undefined
    >,
  );
  return rec?.blob ?? null;
}

export async function saveLocalPageImageBlob(
  slug: string,
  page: number,
  blob: Blob,
): Promise<void> {
  const db = await openDb();
  const t = tx(db, [STORE_IMAGES], 'readwrite');
  t.objectStore(STORE_IMAGES).put({
    key: spanKey(slug, page),
    slug,
    page,
    blob,
  });
  await awaitTx(t);
}

export async function deleteLocalDoc(slug: string): Promise<void> {
  const db = await openDb();
  // Docs record first so listLocalDocs immediately reflects removal.
  {
    const t = tx(db, [STORE_DOCS], 'readwrite');
    t.objectStore(STORE_DOCS).delete(slug);
    await awaitTx(t);
  }
  {
    const t = tx(db, [STORE_PDF], 'readwrite');
    t.objectStore(STORE_PDF).delete(slug);
    await awaitTx(t);
  }
  for (const store of [STORE_SPANS, STORE_IMAGES]) {
    const t = tx(db, [store], 'readwrite');
    const req = t.objectStore(store).openCursor();
    await new Promise<void>((resolve, reject) => {
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) {
          resolve();
          return;
        }
        const v = cursor.value as { slug: string };
        if (v.slug === slug) cursor.delete();
        cursor.continue();
      };
      req.onerror = () => reject(req.error);
    });
    await awaitTx(t);
  }
}

export async function cleanupOrphans(): Promise<void> {
  const db = await openDb();
  // Collect known slugs.
  const knownSlugs = new Set<string>();
  {
    const t = tx(db, [STORE_DOCS], 'readonly');
    const all = await reqPromise(
      t.objectStore(STORE_DOCS).getAllKeys() as IDBRequest<IDBValidKey[]>,
    );
    for (const k of all) knownSlugs.add(String(k));
  }

  // Drop pdfBlobs whose slug isn't in docs.
  {
    const t = tx(db, [STORE_PDF], 'readwrite');
    const req = t.objectStore(STORE_PDF).openCursor();
    await new Promise<void>((resolve, reject) => {
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) {
          resolve();
          return;
        }
        const v = cursor.value as { slug: string };
        if (!knownSlugs.has(v.slug)) cursor.delete();
        cursor.continue();
      };
      req.onerror = () => reject(req.error);
    });
    await awaitTx(t);
  }

  // Drop pageSpans + pageImages whose slug isn't in docs.
  for (const store of [STORE_SPANS, STORE_IMAGES]) {
    const t = tx(db, [store], 'readwrite');
    const req = t.objectStore(store).openCursor();
    await new Promise<void>((resolve, reject) => {
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) {
          resolve();
          return;
        }
        const v = cursor.value as { slug: string };
        if (!knownSlugs.has(v.slug)) cursor.delete();
        cursor.continue();
      };
      req.onerror = () => reject(req.error);
    });
    await awaitTx(t);
  }

  // Drop docs whose pdfBlob is 0 bytes — corrupt records from a prior bug
  // where the source ArrayBuffer was detached by pdfjs before the Blob was
  // built. The bytes are gone, the doc cannot render; clean it out so the
  // user re-uploads instead of seeing a permanently broken entry.
  const corruptSlugs: string[] = [];
  {
    const t = tx(db, [STORE_PDF], 'readonly');
    const req = t.objectStore(STORE_PDF).openCursor();
    await new Promise<void>((resolve, reject) => {
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) {
          resolve();
          return;
        }
        const v = cursor.value as { slug: string; blob?: Blob };
        if (knownSlugs.has(v.slug) && (!v.blob || v.blob.size === 0)) {
          corruptSlugs.push(v.slug);
        }
        cursor.continue();
      };
      req.onerror = () => reject(req.error);
    });
    await awaitTx(t);
  }
  for (const slug of corruptSlugs) {
    await deleteLocalDoc(slug);
  }
}

export function makeLocalSlug(filename: string): string {
  const base = filename
    .replace(/\.pdf$/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32) || 'doc';
  const suffix = Math.random().toString(36).slice(2, 8);
  return `local-${base}-${suffix}`;
}

export function isLocalSlug(slug: string): boolean {
  return slug.startsWith('local-');
}

export function isLocalDocName(doc: string): boolean {
  return doc.startsWith('local-') && doc.endsWith('.pdf');
}

export function localDocNameToSlug(doc: string): string {
  return doc.replace(/\.pdf$/i, '');
}
