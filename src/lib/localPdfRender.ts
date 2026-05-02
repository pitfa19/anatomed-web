import * as pdfjs from 'pdfjs-dist';
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { loadLocalPdfBlob } from './localDocs';

if (!pdfjs.GlobalWorkerOptions.workerSrc) {
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
}

const RENDER_DPI = 200;
const SCALE = RENDER_DPI / 72;
const WEBP_QUALITY = 0.8;

const docCache = new Map<string, Promise<pdfjs.PDFDocumentProxy>>();

async function getDoc(slug: string): Promise<pdfjs.PDFDocumentProxy> {
  const cached = docCache.get(slug);
  if (cached) return cached;
  const p = (async () => {
    const blob = await loadLocalPdfBlob(slug);
    const buf = await blob.arrayBuffer();
    // Note: pdfjs transfers `data.buffer` to the worker thread, detaching
    // `buf` on the main side. Don't read `buf` after this await.
    const task = pdfjs.getDocument({ data: new Uint8Array(buf) });
    return task.promise;
  })();
  docCache.set(slug, p);
  try {
    return await p;
  } catch (err) {
    docCache.delete(slug);
    throw err;
  }
}

export function evictLocalDoc(slug: string): void {
  const p = docCache.get(slug);
  if (!p) return;
  docCache.delete(slug);
  p.then((doc) => doc.destroy()).catch(() => {});
}

export async function renderLocalPageToBlob(
  slug: string,
  pageNum: number,
): Promise<Blob> {
  const doc = await getDoc(slug);
  const page = await doc.getPage(pageNum);
  const viewport = page.getViewport({ scale: SCALE });
  const w = Math.ceil(viewport.width);
  const h = Math.ceil(viewport.height);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    page.cleanup();
    throw new Error('Failed to acquire 2D context for canvas');
  }

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);

  try {
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;
  } catch (err) {
    page.cleanup();
    throw err;
  }

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('canvas.toBlob returned null'))),
      'image/webp',
      WEBP_QUALITY,
    );
  });

  page.cleanup();
  return blob;
}
