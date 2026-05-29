# Conventions & Fragile Invariants — anatomed-web

## Code style
- TS + functional React components, hooks. Tailwind utility classes inline (v4). `clsx` for conditional classes.
- Match surrounding file's idiom; lib logic is plain TS modules (no classes). Storage keys are versioned strings (e.g. `anatomed.agent.chat.v1`) — bump the version when the schema changes.
- Symbolic edits via Serena where a whole function/component changes; regex `replace_content` for a few lines inside a larger symbol.

## Croatian-language product (hard rule)
All UI + AI output is **Croatian standard** — no Serbian/Bosnian forms (talas→val, vazduh→zrak, hiljadu→tisuću). Agent system prompt in `lib/agent.ts` enforces this; if you change formatting rules there, also update the markdown component overrides in `components/agent/ChatLog.tsx`. English-toggle is planned but not built.

## Do NOT change without reading CLAUDE.md's "Things to NOT change"
- `public/pdfs` & `public/data` **symlinks into `../Anatom3d/`** — breaking them 404s every doc, empties `/revise`, and breaks the agent `search_skripte` tool.
- pdfjs **transfers `ArrayBuffer`**: in `uploadIndexer.ts` build the `Blob` BEFORE `getDocument`, and pass pdfjs its own copy. The 0-byte assertion in `saveLocalDoc` is the regression tripwire — keep it.
- Agent flow: **never return Haiku's text to the user** — Haiku only routes tools, Sonnet writes the answer.
- `scrollNonce` deps in `RenderedPdfViewer.tsx` must NOT include `visiblePages` (page-yank regression).
- Viewer: `onAnchors`/`onFit` passed to `SystemModel`/`ExtraPart` must stay referentially stable (else camera re-fits every tick). Click-to-focus gates on `activePartId`/`extras` because three.js raycaster ignores `.visible`.
- `pageImageUrl` is `Promise<string>` — consume via `usePageImageSrc` (manages object-URL lifetime). Don't revert to sync.
- `loadUnifiedIndex()` caching (`unifiedCache`/`unifiedPromise` + `bundledDocsCache`) — hit on every Docs nav and agent tool call.

## Security posture (hackathon-grade — see CLAUDE.md)
Supabase auth is a shim: plain username/password, fixed `SALT`, one table, permissive `using(true)` RLS on `users`/`user_pdfs`. Credits are cosmetic, not entitlement. Don't tighten RLS without first replacing the auth shim. Verify the Anthropic key path: prod must route through `api/` Functions, never `dangerouslyAllowBrowser` client-side.
