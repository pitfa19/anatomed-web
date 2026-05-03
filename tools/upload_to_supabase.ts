/**
 * One-shot uploader: pushes the 5 source PDFs and the pre-rendered page
 * WebPs + per-page span JSONs + per-doc meta.json to Supabase Storage.
 *
 * Usage:
 *   # Pull the service-role key from the Supabase dashboard (Settings → API)
 *   # and set it in .env.local *temporarily* for this run. Do NOT commit it.
 *   #
 *   #   SUPABASE_SERVICE_ROLE_KEY=eyJhbGc... \
 *   #   VITE_SUPABASE_URL=https://<project>.supabase.co \
 *   #   npx tsx tools/upload_to_supabase.ts
 *
 * Idempotent: existing objects at the same path are skipped.
 * Re-run anytime - only changed/missing files are uploaded.
 */
import { createClient } from '@supabase/supabase-js';
import { readFile, readdir, stat } from 'node:fs/promises';
import { readFileSync as readFileSyncCore } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;

// Tiny .env.local loader: only sets vars not already in process.env.
function loadEnvLocal(): void {
  try {
    const raw = readFileSyncCore(join(ROOT, '.env.local'), 'utf8');
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch {
    // .env.local missing is fine if vars are already exported.
  }
}
loadEnvLocal();

const SOURCE_PDFS_DIR = join(ROOT, 'files');
const SOURCE_PDFS = [
  'Skripta A1 ispravljena.pdf',
  'Skripta A2 ispravljena.pdf',
  'Skripta A3 ispravljena.pdf',
  'Hand-Out - A1 (Ivan Banovac).pdf',
  'Duale Reihe_Searchable.pdf',
];

const RENDERED_DIR = join(ROOT, 'public', 'pdfs-rendered');
const RENDERED_SLUGS = ['skripta_a1', 'skripta_a2', 'skripta_a3', 'handout_a1', 'duale_reihe'];

const SOURCE_BUCKET = 'pdfs';
const RENDERED_BUCKET = 'pdfs-rendered';

const url = process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url) {
  console.error('VITE_SUPABASE_URL is required.');
  process.exit(1);
}
if (!serviceKey) {
  console.error('SUPABASE_SERVICE_ROLE_KEY is required (Supabase Dashboard → Settings → API).');
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let uploaded = 0;
let skipped = 0;
let bytesUploaded = 0;

// existence cache: bucket -> prefix -> Set<filename>
const listCache = new Map<string, Map<string, Set<string>>>();

async function listPrefix(bucket: string, prefix: string): Promise<Set<string>> {
  const perBucket = listCache.get(bucket) ?? new Map<string, Set<string>>();
  if (!listCache.has(bucket)) listCache.set(bucket, perBucket);
  const cached = perBucket.get(prefix);
  if (cached) return cached;

  const names = new Set<string>();
  let offset = 0;
  const pageSize = 1000;
  for (;;) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .list(prefix, { limit: pageSize, offset });
    if (error) {
      // Bucket might not exist yet - surface as empty set; ensureBucket runs first.
      throw new Error(`list ${bucket}/${prefix}: ${error.message}`);
    }
    if (!data) break;
    for (const entry of data) {
      if (entry.name) names.add(entry.name);
    }
    if (data.length < pageSize) break;
    offset += pageSize;
  }
  perBucket.set(prefix, names);
  return names;
}

function rememberUploaded(bucket: string, prefix: string, name: string): void {
  const perBucket = listCache.get(bucket);
  const cached = perBucket?.get(prefix);
  cached?.add(name);
}

async function ensureBucket(name: string): Promise<void> {
  const { data: existing, error: listErr } = await supabase.storage.getBucket(name);
  if (existing && !listErr) {
    if (!existing.public) {
      const { error } = await supabase.storage.updateBucket(name, { public: true });
      if (error) throw new Error(`updateBucket(${name}): ${error.message}`);
      console.log(`  flipped ${name} to public`);
    } else {
      console.log(`  bucket ${name} exists (public)`);
    }
    return;
  }
  const { error } = await supabase.storage.createBucket(name, { public: true });
  if (error) throw new Error(`createBucket(${name}): ${error.message}`);
  console.log(`  created public bucket ${name}`);
}

function contentTypeFor(filename: string): string | undefined {
  if (filename.endsWith('.webp')) return 'image/webp';
  if (filename.endsWith('.json')) return 'application/json';
  if (filename.endsWith('.pdf')) return 'application/pdf';
  return undefined;
}

function isTransient(message: string): boolean {
  return /bad gateway|gateway timeout|service unavailable|fetch failed|network|ECONN|ETIMEDOUT|EAI_AGAIN|socket hang up|503|502|504/i.test(
    message,
  );
}

async function uploadFile(
  localPath: string,
  bucket: string,
  prefix: string,
  filename: string,
): Promise<void> {
  const existing = await listPrefix(bucket, prefix);
  if (existing.has(filename)) {
    skipped++;
    return;
  }
  const data = await readFile(localPath);
  const path = prefix ? `${prefix}/${filename}` : filename;
  const maxAttempts = 5;
  let lastErr = '';
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const { error } = await supabase.storage.from(bucket).upload(path, data, {
      contentType: contentTypeFor(filename),
      upsert: false,
    });
    if (!error) {
      uploaded++;
      bytesUploaded += data.byteLength;
      rememberUploaded(bucket, prefix, filename);
      if (uploaded % 50 === 0) {
        console.log(`  …${uploaded} uploaded (${(bytesUploaded / 1e6).toFixed(1)} MB)`);
      }
      return;
    }
    // Race / leftover from a prior partial run - tolerate "already exists" as a skip.
    if (/exists/i.test(error.message)) {
      skipped++;
      rememberUploaded(bucket, prefix, filename);
      return;
    }
    lastErr = error.message;
    if (!isTransient(error.message) || attempt === maxAttempts) {
      throw new Error(`upload ${bucket}/${path}: ${error.message}`);
    }
    const delayMs = 500 * 2 ** (attempt - 1) + Math.floor(Math.random() * 250);
    console.warn(`  retry ${attempt}/${maxAttempts - 1} for ${path} after ${delayMs}ms: ${error.message}`);
    await new Promise((r) => setTimeout(r, delayMs));
  }
  throw new Error(`upload ${bucket}/${path}: gave up - ${lastErr}`);
}

// Free-tier Supabase plans cap single-object upload at 50 MB regardless of the
// bucket's `file_size_limit`. Anything larger is skipped here; the runtime
// `/docs` flow only needs rendered WebPs (uploaded separately) and never
// dereferences the source PDF URL anyway (PdfViewer.tsx is unused; only
// RenderedPdfViewer is mounted from Docs.tsx).
const PROJECT_FILE_SIZE_LIMIT = 50 * 1024 * 1024;

async function uploadSourcePdfs(): Promise<void> {
  console.log(`\n[1/2] Source PDFs (${SOURCE_PDFS.length} files)`);
  for (const filename of SOURCE_PDFS) {
    const localPath = join(SOURCE_PDFS_DIR, filename);
    let info;
    try {
      info = await stat(localPath);
    } catch {
      console.warn(`  ! missing: ${localPath} - skipping`);
      continue;
    }
    if (info.size > PROJECT_FILE_SIZE_LIMIT) {
      console.warn(
        `  ! ${filename} is ${(info.size / 1e6).toFixed(1)} MB - exceeds project upload limit (${(PROJECT_FILE_SIZE_LIMIT / 1e6).toFixed(0)} MB), skipping`,
      );
      continue;
    }
    const before = uploaded;
    await uploadFile(localPath, SOURCE_BUCKET, '', filename);
    const verb = uploaded > before ? 'uploaded' : 'skipped';
    console.log(`  ${verb}: ${SOURCE_BUCKET}/${filename} (${(info.size / 1e6).toFixed(1)} MB)`);
  }
}

const CONCURRENCY = 8;

async function runPool<T>(items: T[], fn: (item: T) => Promise<void>): Promise<void> {
  let i = 0;
  const workers = Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    for (;;) {
      const idx = i++;
      if (idx >= items.length) return;
      await fn(items[idx]);
    }
  });
  await Promise.all(workers);
}

async function uploadRenderedSlug(slug: string): Promise<void> {
  const dir = join(RENDERED_DIR, slug);
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    console.warn(`  ! missing rendered dir: ${dir} - skipping`);
    return;
  }
  const visible = entries.filter((e) => !e.startsWith('.'));
  console.log(`  ${slug}: ${visible.length} files`);
  // Pre-warm the prefix listing so workers don't all try to populate it concurrently.
  await listPrefix(RENDERED_BUCKET, slug);
  await runPool(visible, async (entry) => {
    const localPath = join(dir, entry);
    await uploadFile(localPath, RENDERED_BUCKET, slug, entry);
  });
}

async function uploadRendered(): Promise<void> {
  console.log(`\n[2/2] Rendered pages (${RENDERED_SLUGS.length} docs)`);
  for (const slug of RENDERED_SLUGS) {
    await uploadRenderedSlug(slug);
  }
}

async function main(): Promise<void> {
  console.log('Ensuring public buckets exist…');
  await ensureBucket(SOURCE_BUCKET);
  await ensureBucket(RENDERED_BUCKET);
  await uploadSourcePdfs();
  await uploadRendered();
  console.log(
    `\nDone. Uploaded ${uploaded} files (${(bytesUploaded / 1e6).toFixed(1)} MB), skipped ${skipped} existing.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
