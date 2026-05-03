/**
 * One-shot uploader: pushes the 5 source PDFs and the pre-rendered page WebPs
 * + per-page span JSONs + per-doc meta.json to Vercel Blob.
 *
 * Usage:
 *   BLOB_READ_WRITE_TOKEN=$(vercel env pull --environment=development && grep BLOB_READ_WRITE_TOKEN .env.development.local | cut -d= -f2-)
 *   npx tsx tools/upload_to_blob.ts
 *
 * Idempotent: existing blobs at the same pathname are skipped (head() check).
 * Re-run anytime — only changed/missing files are uploaded.
 */
import { put, head } from '@vercel/blob';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, basename } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;

// Source PDFs live in the sibling Anatom3d repo (matches the original
// public/pdfs symlink target). The five filenames must match the keys in
// PDF_URLS in src/lib/data.ts.
const SOURCE_PDFS_DIR = join(ROOT, '..', 'Anatom3d', 'files');
const SOURCE_PDFS = [
  'Skripta A1 ispravljena.pdf',
  'Skripta A2 ispravljena.pdf',
  'Skripta A3 ispravljena.pdf',
  'Hand-Out - A1 (Ivan Banovac).pdf',
  'Duale Reihe_Searchable.pdf',
];

// Rendered slugs match RENDERED_SLUGS in src/lib/data.ts.
const RENDERED_DIR = join(ROOT, 'public', 'pdfs-rendered');
const RENDERED_SLUGS = ['skripta_a1', 'skripta_a2', 'skripta_a3', 'handout_a1', 'duale_reihe'];

const token = process.env.BLOB_READ_WRITE_TOKEN;
if (!token) {
  console.error('BLOB_READ_WRITE_TOKEN is required.');
  process.exit(1);
}

let uploaded = 0;
let skipped = 0;
let bytesUploaded = 0;

async function existsOnBlob(pathname: string): Promise<boolean> {
  try {
    await head(pathname, { token });
    return true;
  } catch {
    return false;
  }
}

async function uploadFile(localPath: string, pathname: string, contentType?: string) {
  if (await existsOnBlob(pathname)) {
    skipped++;
    return;
  }
  const data = await readFile(localPath);
  await put(pathname, data, {
    access: 'public',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType,
    token,
  });
  uploaded++;
  bytesUploaded += data.byteLength;
  if (uploaded % 50 === 0) {
    console.log(`  …${uploaded} uploaded (${(bytesUploaded / 1e6).toFixed(1)} MB)`);
  }
}

function contentTypeFor(filename: string): string | undefined {
  if (filename.endsWith('.webp')) return 'image/webp';
  if (filename.endsWith('.json')) return 'application/json';
  if (filename.endsWith('.pdf')) return 'application/pdf';
  return undefined;
}

async function uploadSourcePdfs() {
  console.log(`\n[1/2] Source PDFs (${SOURCE_PDFS.length} files)`);
  for (const filename of SOURCE_PDFS) {
    const localPath = join(SOURCE_PDFS_DIR, filename);
    let info;
    try {
      info = await stat(localPath);
    } catch {
      console.warn(`  ! missing: ${localPath} — skipping`);
      continue;
    }
    const pathname = `pdfs/${filename}`;
    const before = uploaded;
    await uploadFile(localPath, pathname, 'application/pdf');
    const verb = uploaded > before ? 'uploaded' : 'skipped';
    console.log(`  ${verb}: ${pathname} (${(info.size / 1e6).toFixed(1)} MB)`);
  }
}

async function uploadRenderedSlug(slug: string) {
  const dir = join(RENDERED_DIR, slug);
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    console.warn(`  ! missing rendered dir: ${dir} — skipping`);
    return;
  }
  console.log(`  ${slug}: ${entries.length} files`);
  for (const entry of entries) {
    if (entry.startsWith('.')) continue;
    const localPath = join(dir, entry);
    const pathname = `pdfs-rendered/${slug}/${entry}`;
    await uploadFile(localPath, pathname, contentTypeFor(entry));
  }
}

async function uploadRendered() {
  console.log(`\n[2/2] Rendered pages (${RENDERED_SLUGS.length} docs)`);
  for (const slug of RENDERED_SLUGS) {
    await uploadRenderedSlug(slug);
  }
}

async function main() {
  await uploadSourcePdfs();
  await uploadRendered();
  console.log(`\nDone. Uploaded ${uploaded} files (${(bytesUploaded / 1e6).toFixed(1)} MB), skipped ${skipped} existing.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
