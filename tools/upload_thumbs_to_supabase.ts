/**
 * One-shot uploader: pushes per-part PNG thumbnails to the public Supabase
 * Storage bucket `thumbs`. Runs after `tools/render_part_thumbnails.py`.
 *
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY=... \
 *   VITE_SUPABASE_URL=https://<project>.supabase.co \
 *   npx tsx tools/upload_thumbs_to_supabase.ts
 *
 * Idempotent: existing objects at the same path are skipped.
 */
import { createClient } from '@supabase/supabase-js';
import { readFile, readdir } from 'node:fs/promises';
import { readFileSync as readFileSyncCore } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;

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
    // missing .env.local is fine if vars are already exported
  }
}
loadEnvLocal();

const THUMBS_DIR = join(ROOT, 'public', 'models', 'thumbs');
const BUCKET = 'thumbs';
const CONCURRENCY = 8;

const url = process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url) {
  console.error('VITE_SUPABASE_URL is required.');
  process.exit(1);
}
if (!serviceKey) {
  console.error('SUPABASE_SERVICE_ROLE_KEY is required.');
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let uploaded = 0;
let skipped = 0;
let bytesUploaded = 0;

const existing = new Set<string>();

async function loadExisting(): Promise<void> {
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .list('', { limit: 1000, offset });
    if (error) throw new Error(`list ${BUCKET}: ${error.message}`);
    if (!data) break;
    for (const entry of data) if (entry.name) existing.add(entry.name);
    if (data.length < 1000) break;
    offset += 1000;
  }
  console.log(`  ${existing.size} thumbnails already in bucket`);
}

function isTransient(message: string): boolean {
  return /bad gateway|gateway timeout|service unavailable|fetch failed|network|ECONN|ETIMEDOUT|EAI_AGAIN|socket hang up|503|502|504/i.test(
    message,
  );
}

async function uploadOne(filename: string): Promise<void> {
  if (existing.has(filename)) {
    skipped++;
    return;
  }
  const data = await readFile(join(THUMBS_DIR, filename));
  const maxAttempts = 5;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(filename, data, { contentType: 'image/png', upsert: false });
    if (!error) {
      uploaded++;
      bytesUploaded += data.byteLength;
      existing.add(filename);
      if (uploaded % 50 === 0) {
        console.log(`  …${uploaded} uploaded (${(bytesUploaded / 1e6).toFixed(1)} MB)`);
      }
      return;
    }
    if (/exists/i.test(error.message)) {
      skipped++;
      existing.add(filename);
      return;
    }
    if (!isTransient(error.message) || attempt === maxAttempts) {
      throw new Error(`upload ${BUCKET}/${filename}: ${error.message}`);
    }
    const delay = 500 * 2 ** (attempt - 1) + Math.floor(Math.random() * 250);
    console.warn(`  retry ${attempt}/${maxAttempts - 1} for ${filename} after ${delay}ms: ${error.message}`);
    await new Promise((r) => setTimeout(r, delay));
  }
}

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

async function main(): Promise<void> {
  console.log('Loading existing object index…');
  await loadExisting();

  let entries: string[];
  try {
    entries = await readdir(THUMBS_DIR);
  } catch {
    console.error(`Missing ${THUMBS_DIR} - run tools/render_part_thumbnails.py first.`);
    process.exit(1);
  }
  const pngs = entries.filter((e) => e.endsWith('.png'));
  console.log(`Uploading ${pngs.length} PNGs to ${BUCKET}/…`);
  await runPool(pngs, uploadOne);
  console.log(
    `\nDone. Uploaded ${uploaded} files (${(bytesUploaded / 1e6).toFixed(1)} MB), skipped ${skipped} existing.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
