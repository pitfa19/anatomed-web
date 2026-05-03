import { supabase } from './supabase';
import {
  type IndexResultLike,
  saveLocalDoc,
  deleteLocalDoc,
  listLocalDocs,
} from './localDocs';
import type { Hit, PdfDoc, SourceMeta } from './types';
import type { RenderedMeta, RenderedPageSpan } from './data';

const BUCKET = 'user-pdfs';
const CLOUD_SLUGS_KEY = 'anatom3d.cloud.slugs.v1';

interface CloudPayload {
  doc_name: string;
  terms: string[];
  index: Record<string, Hit[]>;
  pages: Record<string, string>;
  meta: RenderedMeta;
  sourceMeta: SourceMeta;
}

interface CloudPdfRow {
  id: string;
  user_id: string;
  slug: string;
  doc_label: string;
  total_pages: number;
  payload: CloudPayload;
  spans_path: string;
  pdf_path: string;
  created_at: string;
}

interface SpansFile {
  spans: Array<{ page: number; spans: RenderedPageSpan[] }>;
}

function pdfPath(userId: string, slug: string): string {
  return `${userId}/${slug}.pdf`;
}

function spansPath(userId: string, slug: string): string {
  return `${userId}/${slug}.spans.json`;
}

function readCloudSlugs(): Set<string> {
  try {
    const raw = localStorage.getItem(CLOUD_SLUGS_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

function writeCloudSlugs(slugs: Set<string>): void {
  localStorage.setItem(CLOUD_SLUGS_KEY, JSON.stringify(Array.from(slugs)));
}

export function trackCloudSlug(slug: string): void {
  const s = readCloudSlugs();
  s.add(slug);
  writeCloudSlugs(s);
}

export function untrackCloudSlug(slug: string): void {
  const s = readCloudSlugs();
  s.delete(slug);
  writeCloudSlugs(s);
}

export function getTrackedCloudSlugs(): string[] {
  return Array.from(readCloudSlugs());
}

export async function cloudListDocs(userId: string): Promise<CloudPdfRow[]> {
  const { data, error } = await supabase
    .from('user_pdfs')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as CloudPdfRow[];
}

export async function cloudUploadDoc(
  userId: string,
  result: IndexResultLike,
): Promise<void> {
  const pPath = pdfPath(userId, result.slug);
  const sPath = spansPath(userId, result.slug);

  const { error: pdfErr } = await supabase.storage
    .from(BUCKET)
    .upload(pPath, result.pdfBlob, {
      contentType: 'application/pdf',
      upsert: true,
    });
  if (pdfErr) throw new Error(`PDF upload: ${pdfErr.message}`);

  const spansArr: Array<{ page: number; spans: RenderedPageSpan[] }> = [];
  for (const [page, spans] of result.pageSpans.entries()) {
    spansArr.push({ page, spans });
  }
  const spansBlob = new Blob([JSON.stringify({ spans: spansArr } satisfies SpansFile)], {
    type: 'application/json',
  });
  const { error: spansErr } = await supabase.storage
    .from(BUCKET)
    .upload(sPath, spansBlob, { contentType: 'application/json', upsert: true });
  if (spansErr) throw new Error(`Spans upload: ${spansErr.message}`);

  const payload: CloudPayload = {
    doc_name: result.pdfDoc.doc_name,
    terms: result.pdfDoc.terms,
    index: result.pdfDoc.index,
    pages: result.pdfDoc.pages,
    meta: result.meta,
    sourceMeta: result.sourceMeta,
  };

  const { error: rowErr } = await supabase
    .from('user_pdfs')
    .upsert(
      {
        user_id: userId,
        slug: result.slug,
        doc_label: result.pdfDoc.doc_label,
        total_pages: result.pdfDoc.total_pages,
        payload,
        pdf_path: pPath,
        spans_path: sPath,
      },
      { onConflict: 'user_id,slug' },
    );
  if (rowErr) throw new Error(`DB upsert: ${rowErr.message}`);

  trackCloudSlug(result.slug);
}

async function downloadJson<T>(path: string): Promise<T> {
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error) throw new Error(`download ${path}: ${error.message}`);
  const text = await data.text();
  return JSON.parse(text) as T;
}

async function downloadBlob(path: string): Promise<Blob> {
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error) throw new Error(`download ${path}: ${error.message}`);
  return data;
}

export async function cloudFetchToLocal(row: CloudPdfRow): Promise<void> {
  const [pdfBlob, spansFile] = await Promise.all([
    downloadBlob(row.pdf_path),
    downloadJson<SpansFile>(row.spans_path),
  ]);
  const pageSpans = new Map<number, RenderedPageSpan[]>();
  for (const entry of spansFile.spans) pageSpans.set(entry.page, entry.spans);

  const pdfDoc: PdfDoc = {
    doc_name: row.payload.doc_name,
    doc_label: row.doc_label,
    total_pages: row.total_pages,
    terms: row.payload.terms,
    index: row.payload.index,
    pages: row.payload.pages,
  };

  const result: IndexResultLike = {
    slug: row.slug,
    pdfDoc,
    meta: row.payload.meta,
    pageSpans,
    pdfBlob,
    sourceMeta: row.payload.sourceMeta,
  };
  await saveLocalDoc(result);
  trackCloudSlug(row.slug);
}

export async function cloudSyncToLocal(userId: string): Promise<void> {
  const rows = await cloudListDocs(userId);
  const localSummaries = await listLocalDocs();
  const localSlugs = new Set(localSummaries.map((s) => s.slug));
  for (const row of rows) {
    if (localSlugs.has(row.slug)) {
      // Already in IDB - just remember it's cloud-scoped.
      trackCloudSlug(row.slug);
      continue;
    }
    try {
      await cloudFetchToLocal(row);
    } catch (e) {
      console.warn(`[cloudDocs] failed to sync ${row.slug}:`, e);
    }
  }
}

export async function cloudDeleteDoc(userId: string, slug: string): Promise<void> {
  await supabase.storage.from(BUCKET).remove([pdfPath(userId, slug), spansPath(userId, slug)]);
  const { error } = await supabase
    .from('user_pdfs')
    .delete()
    .eq('user_id', userId)
    .eq('slug', slug);
  if (error) throw new Error(error.message);
  untrackCloudSlug(slug);
}

export async function clearCloudScopedLocal(): Promise<void> {
  const slugs = getTrackedCloudSlugs();
  for (const slug of slugs) {
    try {
      await deleteLocalDoc(slug);
    } catch (e) {
      console.warn(`[cloudDocs] failed to drop ${slug} from IDB:`, e);
    }
  }
  writeCloudSlugs(new Set());
}

export function isCloudTracked(slug: string): boolean {
  return readCloudSlugs().has(slug);
}

