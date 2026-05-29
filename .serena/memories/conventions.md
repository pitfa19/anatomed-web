# Conventions & Fragile Invariants — anatomed-web

## Code style
- TS + functional React components, hooks. Tailwind utility classes inline (v4). `clsx` for conditional classes.
- Match surrounding file's idiom; lib logic is plain TS modules (no classes). Storage keys are versioned strings (e.g. `anatomed.agent.chat.v1`) — bump the version when the schema changes.
- Symbolic edits via Serena where a whole function/component changes; regex `replace_content` for a few lines inside a larger symbol.

## Bilingual product (hard rule)
UI + AI output is bilingual: **Croatian standard** (no Serbian/Bosnian forms: talas→val, vazduh→zrak, hiljadu→tisuću) plus English, toggled in the header; the agent answers in the active UI language. Both dicts in `lib/i18n/` (`hr.ts` + `en.ts`) must stay key-for-key identical: `en.ts` is typed `Dict = typeof hr`, so a missing or extra key fails the build. Copy is plain and human, **no em-dashes**. Agent system prompts in `lib/agent.ts` enforce the Croatian standard plus the format rules (no tables, no emoji, no em-dashes, natural voice); if you change those, also update the markdown overrides in `components/agent/ChatLog.tsx`.

## Do NOT change without reading CLAUDE.md's "Things to NOT change"
- `public/pdfs` & `public/data` **symlinks into `../Anatom3d/`** — breaking them 404s every doc, empties `/revise`, and breaks the agent `search_skripte` tool.
- pdfjs **transfers `ArrayBuffer`**: in `uploadIndexer.ts` build the `Blob` BEFORE `getDocument`, and pass pdfjs its own copy. The 0-byte assertion in `saveLocalDoc` is the regression tripwire — keep it.
- Agent flow: **Sonnet drives the whole streaming turn** (tool calls + the answer); Haiku (`SUMMARY_MODEL`) only does background rolling-window summarization and its text is never shown. The earlier Haiku tool-routing step was removed.
- `scrollNonce` deps in `RenderedPdfViewer.tsx` must NOT include `visiblePages` (page-yank regression).
- Viewer: anchor/fit callbacks passed to `SystemLayer` must stay referentially stable (else the camera re-fits every tick); `AnatomyScene` memoizes per-system handlers. Click-to-focus gates on active/extras because the three.js raycaster ignores `.visible`. (One `SystemLayer` per system replaced the old `SystemModel`/`ExtraPart` clone-per-neighbour — see CLAUDE.md.)
- `pageImageUrl` is `Promise<string>` — consume via `usePageImageSrc` (manages object-URL lifetime). Don't revert to sync.
- `loadUnifiedIndex()` caching (`unifiedCache`/`unifiedPromise` + `bundledDocsCache`) — hit on every Docs nav and agent tool call.

## Security posture (hackathon-grade — see CLAUDE.md)
Supabase auth is a shim: plain username/password, fixed `SALT`, one table, permissive `using(true)` RLS on `users`/`user_pdfs`. AI usage is a **daily token budget** (`DAILY_TOKEN_LIMIT`, reset at UTC midnight), enforced server-side in the `api/` Functions via the Supabase service role and logged in `token_transactions` (see CLAUDE.md "Auth + daily AI usage"); the old purchasable `credits` are gone (`users.credits` + `consume_tokens` RPC now legacy/unused). Don't tighten RLS without first replacing the auth shim. Anthropic key path: prod must route through `api/` Functions, never `dangerouslyAllowBrowser` client-side.
