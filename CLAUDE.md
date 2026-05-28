# CLAUDE.md - web-prototype

Scoped guidance for the React/Vite web prototype. The Unity project's `CLAUDE.md` lives at `/Users/pitfa19/Documents/Anatom3d/CLAUDE.md`; this file overrides it when working inside this folder.

## Project Overview

A React 19 + Vite 8 + Tailwind 4 prototype of an anatomy-study web app. Seven routes:

| Route | Purpose |
|-------|---------|
| `/` | Home / landing |
| `/docs` | PDF viewer for the 5 indexed skripte (Skripta A1/A2/A3, Hand-Out A1, Duale Reihe). Search bar + per-doc hit list + rendered PDF pages with highlight overlay. |
| `/agent` | LLM chat assistant (Croatian, anatomy-only) with one tool: `search_skripte`. |
| `/revise` | Ponavljanje (study Q&A) with Leitner-box SRS. `/revise/today` = cross-topic due-card deck. |
| `/viewer` | three.js anatomy viewer. Search a body part → load that part's system .glb → isolate just that part. |
| `/login` | Username + password sign-in / sign-up. |
| `/profile` | User profile: username + AI-credits balance + three fake-purchase packets (2 €/5 €/10 €). |

## Building / running

```bash
npm install
cp .env.local.example .env.local   # then paste a real Anthropic API key
npm run dev                        # vite, default :5173
npm run build                      # tsc -b && vite build
npx tsc -b --noEmit                # type-check only
```

Restart `npm run dev` after editing `.env.local` - Vite reads env vars only at server start.

PDF + indexed-data sourcing:

- `public/data/` and `public/models/` ship in-repo (committed). Bundled PDF index JSONs and `.glb` models load from there.
- The 5 bundled source PDFs and rendered page WebPs come from **Supabase Storage public buckets** (`pdfs`, `pdfs-rendered`) when `VITE_PDFS_BASE_URL` / `VITE_PDFS_RENDERED_BASE_URL` are set - which is the default for both local dev and prod. Without those env vars, `src/lib/data.ts` falls back to `/pdfs` and `/pdfs-rendered` paths under `public/`, which are gitignored and won't exist on a fresh clone.
- `public/pdfs-rendered/<slug>/` may exist locally as a development cache; `tools/upload_to_supabase.ts` reads from it to push to Supabase. `files/` (gitignored) holds the 5 source PDFs for the same uploader.

## Auth + credits (Supabase, hackathon-grade)

Plain username/password backed by a single Supabase table. **Not real auth** - no Supabase Auth, no email, no OAuth, no JWTs. Built for a hackathon demo.

### Supabase project

- Project: `anatom3d` (id `uafyfwyyqzunabpuftue`, eu-west-1).
- One table: `public.users` with `id uuid pk`, `username text unique`, `password_hash text`, `credits int default 0`, `created_at timestamptz`.
- RLS enabled with three permissive policies (`anon_read` / `anon_insert` / `anon_update`, all `using (true)`). The browser hits the table directly with the publishable anon key. Don't lock these down without first replacing the auth shim.

### Files

| File | Purpose |
|------|---------|
| `src/lib/supabase.ts` | Singleton `createClient`. `auth.persistSession: false` because we don't use Supabase Auth. |
| `src/lib/auth.ts` | `hashPassword` (WebCrypto SHA-256 with module-level `SALT`), `signup`, `login`, `getUserById`, `addCredits`. `signup` maps Postgres `23505` to a Croatian "Korisničko ime je već zauzeto." |
| `src/lib/AuthContext.tsx` | `useAuth()`. Persists `userId` only under `anatom3d.auth.userId.v1`; on mount, refetches via `getUserById` so manual DB credit edits are visible after reload. |
| `src/routes/Login.tsx` | Single screen with `[Prijava \| Registracija]` toggle. |
| `src/routes/Profile.tsx` | Profile card + buy buttons. Packets hardcoded as `[{2, 20}, {5, 60}, {10, 150}]`. Each click calls `addCredits` + 2.2 s toast. Redirects to `/login` if not signed in. |

### Wiring

- `main.tsx` wraps `<RouterProvider>` in `<AuthProvider>` (above the router so `useAuth` works in `App.tsx`'s header).
- `App.tsx` renders the right-side header chip: signed-out → `Prijava` link; signed-in → `<NavLink to="/profile">` showing username + live credit count from context.
- `/profile` is **intentionally not in the main `NAV` array** - it lives next to the theme toggle on the right.

### Non-security note

`SALT` is a fixed string. No per-user salt, no slow KDF, no rate limit. This stops *plaintext over the wire* and *trivial DB-dump-as-rainbow-table* - nothing else. Treat the credits balance as cosmetic state, not entitlement. Real auth = replace the shim with Supabase Auth and tighten RLS to `auth.uid()`.

## Storage backend (Supabase)

All PDFs live in the same Supabase project (`uafyfwyyqzunabpuftue`) but in different buckets with different access patterns.

### Public buckets (bundled PDFs, served to every visitor)

- `pdfs` - the 5 source PDFs as `<filename>.pdf`. Public read. 200 MB file limit, `application/pdf` only.
- `pdfs-rendered` - `<slug>/0001.webp`, `<slug>/0001.json`, `<slug>/meta.json` for each of the 5 slugs (skripta_a1/a2/a3, handout_a1, duale_reihe). Public read. 10 MB file limit, `image/webp` + `application/json`.
- Front-end reads via `VITE_PDFS_BASE_URL` / `VITE_PDFS_RENDERED_BASE_URL` (`src/lib/data.ts:21-24`). The values point at `https://<project>.supabase.co/storage/v1/object/public/<bucket>`.
- Uploads go through `tools/upload_to_supabase.ts` (one-shot, idempotent, concurrency 8). Requires `SUPABASE_SERVICE_ROLE_KEY` in `.env.local` - never committed, never shipped to the browser. Reads source PDFs from `<repo>/files/` (gitignored) and rendered from `public/pdfs-rendered/` (gitignored). Free-tier Supabase plans cap single-file uploads at 50 MB, so two oversized source PDFs (Skripta A1 53 MB, Duale Reihe 114 MB) are skipped - runtime never reads source PDFs (PdfViewer.tsx is dead code; only RenderedPdfViewer is mounted).

### Private bucket (per-user uploads)

- `user-pdfs` - keys `<user_id>/<slug>.pdf` and `<user_id>/<slug>.spans.json`. Private (no public URL). Anon RLS allows all CRUD scoped to `bucket_id = 'user-pdfs'`; the app filters by `user_id` on the client side.
- `public.user_pdfs` table tracks each upload with `user_id, slug, doc_label, total_pages, payload jsonb, pdf_path, spans_path, created_at`, unique on `(user_id, slug)`. RLS permissive `using (true)` for `anon` - same hackathon-grade posture as `users`. With this RLS, any anon-key holder can read every user's row. Tightening to `auth.uid() = user_id` requires switching off the auth shim.
- Wiring lives in `src/lib/cloudDocs.ts`: `cloudUploadDoc` fires from `UploadPdfButton.tsx` after `saveLocalDoc`; `cloudSyncToLocal` runs from `AuthContext.tsx` on login; `cloudDeleteDoc` mirrors local delete; `clearCloudScopedLocal` runs on logout.

## Home hero (`/`)

Layered anatomy reveal: full skeleton at the top of the page; on scroll the muscle layer fades in over the bones, reaching ~92% opacity after ~40% of a viewport-height of scroll.

| File | Role |
|------|------|
| `src/routes/Home.tsx` | Owns `heroRef`; calls `useScrollProgress(heroRef)`; passes `muscleProgress` to `<HeroAnatomy3D>`. |
| `src/components/home/HeroAnatomy3D.tsx` | Single `<Canvas>`, two Suspense-bounded groups (`SkeletonGroup`, `MusclesGroup`). Shares `boneCenterRef` (alignment) and `progressRef` (opacity). Renders the full skeleton.glb and muscles.glb - no `applyMultiIsolation`. |
| `src/lib/useScrollProgress.ts` | RAF-throttled hook returning `clamp(-rect.top / triggerHeight, 0, 1)`. |

### Pitfalls

- **Scroll source on home**: `App.tsx` sets `<main className="overflow-y-auto">` only when `pathname === '/'`, so `<main>` scrolls (not `window`). `useScrollProgress` listens with **capture-phase on `document`** to catch scroll from any nested container. Don't switch to `window.addEventListener('scroll', …)` - the muscle reveal silently breaks.
- **Layer alignment**: `SkeletonGroup` writes `boneCenterRef.current = boxCenter` after fitting; `MusclesGroup` applies the **same** offset via `cloned.position.copy(boneCenter).multiplyScalar(-1)`. Done in `useFrame` (not `useEffect`) because muscle GLB can finish loading before skeleton GLB. An `appliedOffsetRef` flag prevents per-frame re-application.
- **Shared muscle material**: muscles.glb has ~3000 meshes. We assign **one** `MeshStandardMaterial({ transparent: true, depthWrite: false, opacity: 0 })` to all visible muscles and tween that single material's `.opacity`. `depthWrite: false` is required to avoid transparent-z-fighting. The muscle group's `.visible` flips off below opacity 0.01.

### Tunables (in `HeroAnatomy3D.tsx`)

- `PROGRESS_GAIN = 2.5` - multiplier on raw scroll progress.
- `target = Math.sqrt(raw) * 0.92` - sqrt ease-in capped at 0.92 so bones still show through.
- `mat.opacity += (target - mat.opacity) * 0.22` - per-frame lerp coefficient.

### Loading strategy

`skeleton.glb` (4.5 MB) preloads via `useGLTF.preload`. `muscles.glb` (13 MB) downloads in the background under its own `<Suspense fallback={null}>`. Whole hero pauses via `IntersectionObserver` when scrolled out of view. Don't re-add `applyMultiIsolation` to crop the hero; the camera fit must use a bbox of only kept parts (`box.setFromObject` walks geometry regardless of `.visible`).

## Agent Architecture (`src/lib/agent.ts`, `src/routes/Agent.tsx`)

### Hybrid model strategy

`chat()` runs a two-phase flow per user turn:

- **Phase 1 - Haiku 4.5 tool decision**, `max_tokens: 1024`. If `stop_reason === 'tool_use'`: tool block(s) run, push assistant turn + `tool_result` user turn, fall through. If text-only: **discard it**. Sonnet writes the answer fresh.
- **Phase 2 - Sonnet 4.6 answer loop**, up to `MAX_TOOL_ITERATIONS = 5`, `max_tokens: 1024`. Returns first text-only response.

Why: Haiku is fast at routing (~400 ms); Sonnet writes consistently good prose. Trade-off: chitchat without tools pays one extra round-trip.

**Critical pitfall**: never return Haiku's text directly to the user.

### Tool: `search_skripte` (`src/lib/tools.ts`)

Fuzzy-matches against `data.allTerms` from the unified PDF index, returns up to 3 terms × 5 hits. Each hit gives a deep link `/docs?q=<term>&doc=<doc-filename>&page=<n>` - the agent must include this verbatim (system prompt forbids URL editing).

### Rolling-window context

`Agent.tsx` keeps a 6-message sliding window. State (in `localStorage` under `anatomed.agent.chat.v1`):

```ts
{ messages: ChatMessage[]; summary: string; summarizedThrough: number }
```

Before `send()`: if `nextHistory.length - summarizedThrough > 6`, call `summarizeMessages()` (Haiku, ~400-token cap) on the older messages and merge into `summary`. Pass `summary` to `chat()` (prepended to system prompt). API receives at most 6 raw messages. `reset()` clears all three fields. Backwards-compat: a v1 array-only payload still loads.

### Status callback + Croatian directive

`chat()` accepts `onStatus(status: ToolStatus)` - `null | {phase: 'thinking'} | {phase: 'tool', name, input} | {phase: 'summarizing'}`. `Agent.tsx` renders it as a chip via `ChatLog`'s `PendingIndicator`. Cleared in the `finally` block.

System prompt enforces Croatian standard (no Serbian/Bosnian forms - *talas → val, vazduh → zrak, hiljadu → tisuću*), no markdown tables, bullet lists with **bold** labels, no emoji, 4–8 lines + max-4 reference chips. If formatting changes, also update the markdown components in `src/components/agent/ChatLog.tsx`.

### Security caveat

`new Anthropic({ apiKey, dangerouslyAllowBrowser: true })` ships the key to every visitor. Fine for local prototyping. Before deploying, route LLM calls through a backend (or Vercel Function).

## Docs Deep Linking (`src/routes/Docs.tsx`)

Reads `?q=&doc=&page=` from the URL on mount and on changes. When the agent emits a chip:

1. Router does SPA navigation.
2. `useEffect` waits for `loadUnifiedIndex()`, then sets `term`, `selectedDoc`, `visiblePage`, `hitIdx`.
3. `scrollNonce` bumps so the viewer scrolls to the highlighted hit.

### `scrollNonce` - re-clicking same hit must re-center

The viewer's "scroll to current mark" effect in `RenderedPdfViewer.tsx` deps on `[inSearch, hits, occIdx, scrollNonce]` - explicitly **not** `visiblePages`. Any path changing the user-selected hit (URL params, `pickHit`, `pickDoc` in search mode, `pickTerm` with hits, `stepOcc`) bumps `scrollNonce` so manual scrolling doesn't yank back, and re-clicking the same hit re-centers. The highlight-class effect (`.hl-current`) is split out and *does* depend on `visiblePages` for newly-mounted marks.

### Don't reset `visiblePage` on `selectedDoc` change

The `[selectedDoc]` effect resets `totalPages` to 0 only. It used to also reset `visiblePage = 1` and clobbered deep-linked `?page=`. Every code path that changes `selectedDoc` (URL effect, `pickDoc`) now sets `visiblePage` itself.

### Current-page tracking - scroll-position based, not IntersectionObserver

Two separate mechanisms:

- **IntersectionObserver** (`rootMargin: 600px`) - tracks `visiblePages: Set<number>` for prerendering only.
- **`pageOffsetsRef`** + scroll listener - measures each `[data-page]` element top once per layout change (deps `[meta, containerWidth, totalPages, zoom]`), binary-searches `scrollTop + ~20% viewport height` against the offsets array on each RAF-throttled tick.

Old IO-only approach picked the wrong page when off-screen entries inside the expanded `rootMargin` had `ratio = 1.0`. Don't add a third source of truth.

### Zoom (PC only)

50–300% via `ZOOM_STEPS`. UI is `hidden lg:flex` (mobile/tablet hidden). `−` / percent (resets to 100%) / `+`; `Ctrl/Cmd + wheel` debounced to 90 ms; trackpad pinch dispatches `ctrlKey + wheel` so it works through the same path; `passive: false` for `preventDefault`. Pages render at `containerWidth * zoom`. Container uses `overflow-auto` (not `-y-auto`) so horizontal scrollbars appear when zoomed in. **Scroll-anchor preservation**: `applyZoom` captures `(pageIdx, ratioWithinPage)` *before* mutating zoom into `pendingZoomAnchorRef`; the `pageOffsetsRef` measurement effect, on next re-run, restores `scrollTop = newPageTop + newPageHeight * ratio`.

## 3D Viewer (`/viewer`)

`@react-three/fiber` + `@react-three/drei` over `three`. Search-driven: the catalog tells us which system a part lives in, that system's glb loads, and visibility is toggled per leaf mesh.

### Rendering architecture — one `SystemLayer` per system, NO per-part clone

Mirrors how the Unity original works (toggle `renderer.enabled`, never instantiate). `AnatomyScene.tsx` derives `systemRenders` (one entry per system that has ≥1 visible part) from `active + extras`, and renders **one `<SystemLayer>` per system** (`src/components/viewer/SystemLayer.tsx`). `SystemLayer` calls `useGLTF(system.glb)` and renders the **shared cached scene instance directly — no `scene.clone(true)`**. This is safe because every *other* GLB consumer (home hero, quiz, agent inline) clones before rendering, and each system is shown by at most one `SystemLayer`, so the shared instance is never double-mounted.

> ⚠️ Never render two `<SystemLayer>` for the same system, and never render a system's cached scene un-cloned anywhere else — both corrupt the shared graph. `systemRenders` dedupes by `systemId`.

**This replaced the old `SystemModel` (active system) + `ExtraPart` (one full-system `.clone(true)` per cross-system neighbour) pair — the clone-per-neighbour was the lag source (adding 52 muscle neighbours cloned `muscles.glb` 52×). Now it's a set of `.visible` flips: adding a whole 52-part layer costs ~one 50 ms frame.**

Visibility is driven by a **scene index** (`src/lib/viewer/sceneIndex.ts`, `buildSceneIndex`, cached on `scene.userData.__anatomedIndex`): `partMeshes` / `partLineMeshes` / `partAncestors` / `allLeaves` / `allLines` per sanitized partId. Each visibility pass: hide all leaves + lines, then for each visible part show its meshes + ancestor chain, and show its `-line` connectors iff `labelsByPartId.has(part)` and the name isn't a whole-bone line. O(visible parts), not an O(scene) traverse.

`applyIsolation` / `clearIsolation` still live in `isolate.ts` but are now used only by `applyMultiIsolation` (home/quiz/agent), not `/viewer`.

### Materials — one shared set per system

`src/lib/viewer/materials.ts` `getSystemMaterials(systemId, tint)` caches `{ solid, line }` per `systemId+tint`. `SystemLayer` assigns the single `solid` material to every leaf (replacing the old ~890-per-mesh `new MeshStandardMaterial`) and `line` to every `-line`. Assignment is idempotent via `scene.userData.__tinted`. (Meshes are **never** recolored on hover — see Hover below.)

### Camera fit — `CameraRig` + `src/lib/viewer/fit.ts`

`fitOrthoToBox` / `computeVisibleUnionBox` / `fitOrthoToObject` live in `fit.ts`. `<CameraRig>` (child of `AnatomyScene`, after the layers) owns the fit: on a `fitKey` change (active + extras + camera.uuid + viewport) it fits to the **union box of every visible mesh across all mounted system roots** (registered via `registerRoot`), excluding `-line`. The "Centriraj"/recenter button calls `CameraRig.recenter()`.

### Landmark labels - `.t` EMPTY anchors with glTF `extras`

Unity Z-Anatomy FBX encodes each anatomical landmark as an EMPTY transform named `<Landmark>.t` (e.g. `Body of femur.t`) parented to the bone. `tools/export_to_glb.py → tag_anchor_labels()` writes the human-readable label (`<name>.t` minus suffix) to each EMPTY's Blender `labelText` custom property. The Blender glTF exporter (`export_extras=True`) puts those into glTF `extras` → `node.userData.labelText` in three.js.

Don't try to derive labels from sanitized node names: `THREE.PropertyBinding.sanitizeNodeName` strips `.` and replaces whitespace with `_`, so `Body of femur.t` arrives as `Body_of_femurt` - unrecoverable. Most anchors live under `.r` bones; `findPartByTerm` in `catalog.ts` prefers `.r` so the user sees the labeled side.

### Camera controls - zoom/pan limits + Centriraj button

`<OrbitControls makeDefault enableDamping enableRotate enablePan enableZoom screenSpacePanning minZoom={0.5} maxZoom={8}>`. Default mouse buttons; touch pan/zoom works as expected. Flags set explicitly because default-undefined was prone to silent regressions.

A custom `<PanClamp>` listens to OrbitControls `change` and snaps `controls.target` back inside a sphere of radius `min(fitWidth, fitHeight) / 2 / camera.zoom`. The "Centriraj" button (lucide `Crosshair`) calls `CameraRig.recenter()` (refits to the visible union box).

#### Pitfall: stable callbacks + per-system anchor handlers

`SystemLayer`'s visibility/anchor effect and `CameraRig`'s fit must not churn function identities. `AnatomyScene` caches per-`systemId` anchor handlers in a `useRef(new Map())` (`getAnchorHandler`) and `useCallback`s `registerRoot` / `getRoots` / `handleFit` / `handleObjectClick` / `handleHover`. Don't inline these in JSX.

#### Pitfall: OrbitControls drift on deep-link mount → useFrame post-fit

Deep-linking `/viewer?part=<id>` can show a blank/half-framed canvas. Cause: `OrbitControls.update()` runs every frame and re-derives camera position from internal spherical state; on a fresh mount it hasn't settled (drei's `<OrthographicCamera makeDefault>` swaps the default camera once). Fix: `CameraRig` runs a `useFrame` post-fit loop calling the fit for the first **6 frames** after each `fitKey` change (runs after OrbitControls, overriding drift). `fitKey` includes `camera.uuid` so a StrictMode camera remount re-fits.

### Hover → name tooltip + subpart region glow (NO mesh recolor)

`SystemLayer` forwards r3f `onPointerMove`/`onPointerOut` to `AnatomyScene.handleHover(obj, ev, point)` (`point` = `e.point`, the world hit). `resolvePart` (shared with click; walks parents to a catalog node, gated on active/extra — raycaster already skips `visible===false`) gives the Part. The part **name** is written straight to a cursor-following `<div>` (a ref, not React state — no re-render per pointermove; lives in `AnatomyScene`'s wrapper, outside `<Canvas>`).

**Whole parts are deliberately never recolored on hover** (an earlier full-bone blue tint was rejected). The only highlight is the subpart region glow below.

### Landmark subparts — region glow on hover (`RegionHighlight`)

A bone's subparts (femur head/neck/condyles…) are NOT separate geometry — they're `<Landmark>.t` anchor nodes (`extras.labelText`) parented to the `.r` bone, each with a `-line` connector running to a point on the bone surface. `collectAnchors` (`isolate.ts`) returns each anchor's `position` (the `.t` label point) **and** `surface` (the connector's far vertex = the spot on the bone). `SystemLayer` always emits the **active** part's anchors (so this works with labels off).

On hover over the active bone, `handleHover` finds the nearest active anchor `surface` within `SNAP_DIST` (0.035 m) of the hit `point`; if found, `<RegionHighlight>` (a flat single-color disc sprite in the app accent `#2f6df6`, `depthTest:false`, ~0.85 opacity) snaps to that surface point and the tooltip shows the subpart name. Otherwise the tooltip shows the whole-part name and nothing is marked. **No leader lines, no dots** (both removed — the earlier versions were rejected). Connector `-line` meshes are no longer rendered at all.

"Labels on" still renders always-on `<Html>` name chips at the `.t` positions for any part in `labelsByPartId` (`chipAnchors`) — the "names just on" option, independent of the hover disc.

#### Whole-bone anchor dropped

Each bone has a "whole-bone" `.t` anchor (`Femur.t` → labelText `Femur`). We drop it: `AnatomyScene` filters anchors whose `text` equals the owning Part's `name_en`/`name_lat`, so the active card's name isn't duplicated as a subpart.

### Connector lines — not rendered

`-line`/`-lin` Mesh nodes are kept hidden in every `SystemLayer` visibility pass (the leader-line look was removed in favour of the hover region glow). `collectAnchors` still reads their geometry to derive each landmark's `surface` point. The shared `getSystemMaterials().line` material is still assigned (harmless) but nothing shows it.

### Neighbours — per-system stepper anchored to the active part

`tools/export_to_glb.py → write_neighbors()` precomputes 30 nearest parts per part by **AABB-to-AABB closest-point distance** (insertions skipped both sides). Output `public/models/parts-neighbors.json` (~6 MB, lazy).

`Viewer.activeNeighbors` = `neighbors[active.id]` sorted nearest→farthest (the active part only — **not** the old shifting union of all extras; this makes stepping predictable). `<NeighborsPanel>` groups them by system into tabs; the selected tab shows `Prikazano N / total` with `− / +`:

- `+` → `stepSystem(sys, 1)`: add the next `STEP` (6) nearest of that system not yet in `extras`. Disabled at `N === total`.
- `−` → `stepSystem(sys, -1)`: remove the `STEP` farthest currently shown (and their labels). Disabled at `N === 0`.

Each system steps independently. The list keeps per-part checkboxes (fine-tune add/remove), eye (labels), and crosshair (promote to active → `focusFromNeighbor`, previous active demoted to extra). Instant because reveal is just `.visible` flips (see rendering architecture). The old `layerStacks` BFS-frontier model and `expandLayer`/`collapseLayer` are gone.

#### Click-to-focus in 3D

`resolvePart(obj)` (in `AnatomyScene`, shared by click + hover) walks parents to a catalog Part keyed by `sanitizeNodeName(part.id)`, gated on `active/extra`. Click → `focusFromNeighbor`.

### Mesh thinning for placeholder geometry

Some FBX-sourced parts (now only `insertions`) export as fat cylindrical bars or flat plates instead of thin sheets/wires. `thinIfElongated(m, systemId)` (now in `src/lib/viewer/thin.ts`, used by `SystemLayer`) runs when materials are assigned. Triggers when `max/med > maxOverMed` (wire-like) OR `med/min > medOverMin` (plate-like). Per-system `THIN_THRESHOLDS`: `insertions = 4/3` aggressive; solids `= 14/6`. Both non-longest axes scaled to `target = clamp(max * 0.01, 0.03, 0.3)`.

**`nerves` and `vessels` early-return from `thinIfElongated`** — they ship as real thin curve-tubes (see "Vessels & nerves geometry" below); the `0.03` floor would *re-fatten* genuine 1 mm tubes to 3 cm. `/viewer` uses the single `thin.ts` copy; `agent/InlineAnatomy3D.tsx` and `quiz/PartPreview.tsx` still carry their own copies (keep the nerves/vessels guard in those if you touch them).

### `/docs` "Na ovoj stranici" 3D side-rail

When a doc is open and not in search mode, the sidebar lists every catalog-matched anatomical term with an indexed hit on the visible page. Each row links to `/viewer?part=<id>`.

| File | Role |
|------|------|
| `src/lib/docs/pageTermIndex.ts` | `getTermsForPage(unified, doc, page)`. Lazily inverts `unified.index` (term → hits[]) into `(doc, page) → terms[]`, memoized via `WeakMap`. Cache invalidates when `bumpLocalDocsCache()` runs. |
| `src/components/docs/OnThisPagePanel.tsx` | Filters page terms through `findCatalogPartByTermAnyCase`, dedupes by `part.id`. |
| `src/routes/Docs.tsx` | Mounts panel between single-term `<ViewIn3DChip>` and search/page-browser branches. Gated on `!inSearchMode && selectedDoc`. |

#### Filter to `exact: true` hits - non-negotiable

`Hit.exact === false` when the term matched as substring of a longer word. Croatian generates aggressive false positives: `pons` in `preponska`, `ren` in `okrenuta`, `palma` in `palmarno`. `buildPerDoc()` skips any hit where `h.exact === false`. Don't drop this filter.

#### Empty state with jump-to-content

The panel never returns `null` once a doc is open. When current page has zero catalog hits:

- If the doc has any catalog-matched page anywhere → "Sljedeća stranica s 3D-strukturama: str. N" button → `onGotoPage(N)` → `Docs.tsx#gotoPage` → `setVisiblePage(N)`.
- If the doc has zero anywhere → "Ova skripta nema indeksiranih 3D-struktura."

`pageTermIndex.ts` exposes catalog-aware helpers (2-level WeakMap keyed `unified → catalog → perDocSortedPages`): `nextPageWithCatalogMatch`, `docHasAnyCatalogMatch`. Build cost ~12M comparisons but runs once per `(UnifiedIndex, PartsCatalog)` pair (both stable singletons).

#### Catalog coverage caveat

`parts-catalog.json` models whole bones and major muscles - not bone-internal landmarks. So a page listing `acetabulum`, `os ilium`, `crista iliaca`, etc. shows just one row: `Os coxae`. Joints/ligaments aren't in the catalog (no `articulatio coxae`, no `lig. teres`). Expanding coverage = adding sub-part anchors in `tools/export_to_glb.py`, not changing this code.

### Unified search cross-link `/docs` ↔ `/viewer`

`findCatalogPartByTermAnyCase(catalog, term)` does case-insensitive exact-name lookup against `name_en`/`name_lat`. Three integrations:

- **`/docs` → `/viewer`**: when picked term resolves to a catalog part, "Pogledaj u 3D - &lt;name&gt;" chip appears between search bar and source picker. Links to `/viewer?part=<id>`.
- **`/viewer` → `/docs`**: when query doesn't match a part but matches at least one PDF term, "Pronađi u skriptama: &lt;term&gt;" link below the search.
- **Deep link**: `/viewer?part=<id>` is read on mount; auto-isolates if matches.

`SearchBar` gained an optional `onQueryChange` prop for the viewer's "as-you-type" cross-link without coupling to its `onPick` semantics.

### Parts catalog

`public/models/parts-catalog.json` - flat list with stable glTF node IDs, English + Latin names, `system` discriminator. Generated by `tools/export_to_glb.py` (Blender). Catalog is committed but starts empty; route shows empty-state with regenerate instructions until you run the script.

`PartSearchBar.tsx` wraps `src/components/docs/SearchBar.tsx` so the search UX matches `/docs` - same `fuzzyMatch`, same keyboard nav, same chip styling. Catalog parts formatted as `"English · Latin"`; the picker reverse-looks-up the `Part`.

### Materials

FBX→glTF strips materials; the viewer tints at runtime. Tints (`system.tint`): bones ivory, muscles red, vessels crimson, nerves yellow, organs pink, joints tan, regions blue-grey. See "Materials — one shared set per system" above for how `SystemLayer` assigns them (one shared `solid` per system, not per mesh).

### Regenerating .glb files

```bash
cd /Users/pitfa19/Documents/Anatom3d
blender --background --python tools/export_to_glb.py
```

Outputs `public/models/glb/<system>.glb` and `public/models/parts-catalog.json`. Re-run only when FBX sources change. Optional: `gltfpack -cc -i in.glb -o in.glb`.

**Exception — `nerves.glb` and `vessels.glb` are NOT regenerated by this script.** Re-running `export_to_glb.py` overwrites them with the broken fat-bar geometry; re-run `export_vessels_nerves_from_blend.py` (below) afterwards to restore the good versions.

### Vessels & nerves geometry (sourced from the Z-Anatomy blend, not FBX)

In the Unity FBX, vessels and nerves are baked solid meshes — and badly: FBX can't store curves, so the original Z-Anatomy CURVE objects (thin tubes with a ~0.5 mm round bevel) became fat solid bars 15-160 mm thick. `/viewer` rendered them as grotesquely thick, "elongated" blobs (e.g. the abdominal aorta as a rectangular column, intercostal nerves as one giant slab).

Fix: `nerves.glb` and `vessels.glb` are re-exported **straight from the upstream `Startup.blend`** (`../Models-of-human-anatomy/Z-Anatomy.zip`), reading the curves' evaluated (beveled) geometry so the tubes stay thin. Object names are preserved, so `parts-catalog.json` / `parts-neighbors.json` keep matching (≈93 % vessels / ≈96 % nerves catalog IDs resolve; the rest are degenerate entries). The blend is in the same coordinate space as the FBX skeleton, and `export_yup=True` applies the same Z-up→Y-up swap, so output lands on `skeleton.glb` exactly (verified: `Femur.l` matches to the mm) — cross-system extras (e.g. sciatic nerve + femur) align with no correction.

```bash
# one-time: extract the master blend from the upstream repo
cd ../Models-of-human-anatomy && unzip -o Z-Anatomy.zip "Z-Anatomy/Startup.blend" -d /tmp/za
cd ../anatomed-web
blender --background --python tools/export_vessels_nerves_from_blend.py -- \
    /tmp/za/Z-Anatomy/Startup.blend  public/models/glb  1.0 2 6
# then bump the ?v= cache-buster on the nerves/vessels entries in parts-catalog.json
```

Trailing args after the blend path + out dir: `bevel_mult` (tube thickness ×, default 1.0), `bevel_res` (ring segments, default 2 — sub-mm tubes don't need more), `res_u` (path-sample cap, default 6). The last two keep file size sane (~30 MB each vs ~80 MB at full res). Notes:

- The exporter **flattens the hierarchy** (each part is an independent root), so isolating e.g. "Abdominal aorta" shows just that vessel, not its whole branch tree — consistent with how bones isolate. Use the neighbours panel / layer-expand to add related vessels.
- Auxiliary Z-Anatomy objects (`.i/.j/.g/.s/.t` suffixes = helper meshes + FONT labels) are excluded. Landmark `.t` label anchors are therefore dropped for these two systems (they're mostly used on bones anyway).
- `nerves.glb` size is dominated by solid CNS/sense-organ meshes (brain, spinal cord), not curves, so it shrinks less than `vessels.glb`.

### FBX transform sanitizer (`sanitize_transforms()`)

`NervousSystem22-55.fbx` ships with five corrupted leaves (`Falx cerebri`, `Tentorium cerebelli.l/r`, `Choroid plexus.l/r`) - massive `scale.y`/`location.y` cancelled by their parent dural containers' tiny `scale.z`, leaving the world matrix with `[2][1] ≈ −2,254,790` and rendering as a 400K-unit yellow shaft. Naive local-scale clamping doubles the previously-cancelled axis.

Fix: identify leaves with `|scale| > 1000` or `|location| > 50`, clamp any matrix cell with `|v| > 50` to zero, detach from parent, bake cleaned matrix into vertices, reset `matrix_world`. Detached leaves still appear in the catalog. `strip_container_geometry()` turns empty parents into transform-only nodes.

#### Fit-to-cranium (`fit_intracranial_to_cranium`)

Sanitized leaves still emerge ~1.5–1.7× too large. A second pass references the skeleton's cranium bbox:

1. `compute_cranium_bbox()` runs once at `main()` against `SkeletalSystem30.fbx`, unioning Frontal/Parietal/Occipital/Temporal.
2. `fit_intracranial_to_cranium(cranium_bbox)` runs only when `sys_id == "nerves"`. Per-leaf occupancy ratios in `INTRACRANIAL_OCCUPANCY` (Falx 0.65, Tentorium 0.40, Choroid 0.25). Leaf bbox computed by walking `obj.data.vertices` directly - `obj.bound_box` is stale after `obj.data.transform()`. Isotropic scale baked into mesh data when longest axis exceeds `fraction × cranium_max_axis`.

If a future asset renders giant, check the export log for `[fix]` lines first; extend this routine rather than patching at runtime.

## Markdown Rendering (`src/components/agent/ChatLog.tsx`)

- `remark-gfm` plugin enabled - tables, autolinks, strikethrough.
- Custom `a` component: `/docs?` links render as button chips (book icon + truncated label + chevron) using React Router's `<Link>`. Other internal links use `<Link>` plain. External links open in a new tab.
- `max-w-3xl mx-auto` container; prose body `max-w-prose break-words`.
- The `prose` Tailwind class is a marker - `@tailwindcss/typography` is **not installed**. Styling comes from per-element `components` overrides. Install the plugin if you want full prose defaults.

## Local PDF Uploads (`/docs` → "Učitaj svoj PDF")

End-to-end TS port of `tools/build_pdf_index.py` + on-demand renderer that runs entirely in the browser. Users upload arbitrary PDFs at runtime; results persist in IndexedDB and surface in `/docs` and the agent's tool alongside the bundled five.

### Pipeline

```
file picker → arrayBuffer immediately → indexAndExtractSpans (pdfjs) → saveLocalDoc (IDB)
                                                                              ↓
                       view a page → pageImageUrl(slug, n) → render-on-demand → cache WebP in IDB
```

Upload time = text + per-span bbox extraction (~150–250 ms/page). Original PDF blob stored verbatim. View time = render to 200-DPI WebP via pdfjs + `canvas.toBlob`, cached. First view ~400 ms, subsequent instant. In-memory `Map<slug, Promise<PDFDocumentProxy>>` (`localPdfRender.ts`) keeps parsed PDF open across page renders.

### Files

| File | Role |
|------|------|
| `src/lib/uploadIndexer.ts` | TS port of `find_hits` from `build_pdf_index.py`. Extracts text + spans (Y-flip from pdfjs's BL-origin to top-left points). Lazy chunk. |
| `src/lib/localPdfRender.ts` | On-demand single-page rasterization. Lazy chunk. |
| `src/lib/localDocs.ts` | IndexedDB layer. DB `anatomed-local-docs` v1. |
| `src/components/docs/UploadPdfButton.tsx` | File picker + progress modal + abort + error surfaces. |

### IndexedDB schema (`anatomed-local-docs` v1)

| Store | Key | Value | Notes |
|-------|-----|-------|-------|
| `docs` | `slug` | full record | Written **last**; existence flags doc complete. |
| `pdfBlobs` | `slug` | `{ slug, blob }` | Original PDF for on-demand render. |
| `pageSpans` | `${slug}\|${page}` | `{ slug, page, spans }` | RenderedPageSpan[] with PDF-point top-left coords. |
| `pageImages` | `${slug}\|${page}` | `{ slug, page, blob }` | WebP cache, lazy. |

Atomicity: pdfBlob → all pageSpans → docs (last). `cleanupOrphans()` runs once per session on first `listLocalDocs()` and prunes anything whose slug isn't in `docs`. Also drops docs whose `pdfBlob.size === 0` (one-time migration from a prior detach bug).

### Slug & doc_name

To avoid colliding with bundled doc_names:

- `slug = 'local-' + kebab(filename, 32 chars) + '-' + nanoid(6)`
- `doc_name = '<slug>.pdf'` - synthetic identifier used as the unified-index key
- `sourceMeta.label = stripExt(filename)` - friendly display

Helpers: `isLocalSlug` / `isLocalDocName` / `localDocNameToSlug` in `localDocs.ts`. Dispatchers in `data.ts` (`loadRenderedMeta`, `loadRenderedPageText`, `pageImageUrl`) all branch on these.

### Cache invalidation

`bumpLocalDocsCache()` clears `unifiedCache` + `unifiedPromise` but preserves `bundledDocsCache` (the 5 bundled JSONs never change in-session). Called after every save/delete.

### Critical pitfall: pdfjs transfers `data.buffer`

`pdfjs.getDocument({ data: someUint8Array })` calls `postMessage(..., [data.buffer])`. The underlying `ArrayBuffer` is **transferred to the worker and detached** on the main side. Code reading the same buffer afterward - including `new Blob([arrayBuffer])` - sees 0 bytes.

`uploadIndexer.ts` builds the `Blob` *before* handing the buffer to pdfjs, and gives pdfjs an explicit copy:

```ts
const pdfBlob = new Blob([arrayBuffer], { type: 'application/pdf' });   // first
const pdfjsData = new Uint8Array(arrayBuffer.byteLength);
pdfjsData.set(new Uint8Array(arrayBuffer));                              // copy
const loadingTask = pdfjs.getDocument({ data: pdfjsData, password: '' });
```

`localPdfRender.ts` does `getDocument({ data: new Uint8Array(buf) })` and never reads `buf` again. `saveLocalDoc(r)` asserts `r.pdfBlob.size > 0` so any future regression fails loudly.

### Read file *before* clearing the input

`UploadPdfButton.tsx → handleFile`: `await file.arrayBuffer()` runs *before* `e.target.value = ''`. Some browsers invalidate the `File` reference once the input resets. Indexer accepts either a `File` or `{ buffer, filename }`; the button passes the latter.

### Bundle weight

`uploadIndexer` and `localPdfRender` are dynamic-imported. pdfjs-dist (~1 MB) ships as separate chunks. Verify via `npm run build` and inspect `dist/assets/`.

### Deleting local docs

Three layers protect bundled docs:

1. UI - `SourcePicker.tsx` only renders `Trash2` when `localDocs?.has(src.doc) && onDelete`.
2. `Docs.tsx → handleDelete` early-returns if `!isLocalDocName(doc)`.
3. `deleteLocalDoc(slug)` only operates on IDB stores; bundled live in `public/`.

`evictLocalDoc(slug)` (in `localPdfRender.ts`) tears down the in-memory `PDFDocumentProxy` cache.

## Ponavljanje SRS (`/revise`, `/revise/today`)

Spaced-repetition over the existing topic Q&A JSON in `public/data/ponavljanje/`. Replaces the old tap-to-reveal accordion.

### Flow

1. `/revise` lists topics with "Danas - N kartica" hero strip → `/revise/today`. Each topic shows a `<DueBadge>` if any cards due.
2. Open topic → `QuestionsTab` shows the full set. Tap question → answer expands; under the answer are three pills `Krivo` / `Teško` / `Znam`.
3. Grading runs `gradeCard(prevState, grade)`, persists, collapses, drops from visible list (in `?due=1`).
4. `/revise/today` aggregates `dueCardsForTopic` across non-Quizlet topics, deterministically shuffles (seeded by `Date.now()` at session start), walks one at a time.

### Storage

`pona.srs.v1.<topicId>.<qIndex>` →

```ts
type CardState = {
  box: 1 | 2 | 3 | 4 | 5;
  lastReviewedAt: number;
  dueAt: number;
  history: { at: number; grade: 'wrong' | 'hard' | 'good' }[]; // capped at 20
};
```

Box → next interval: `1d / 3d / 7d / 14d / 30d`. `Krivo` → box 1; `Teško` → `min(prev+1, 3)`; `Znam` → `min(prev+1, 5)`.

### Legacy migration

Old `pona_<topicId>_q<i>` boolean keys migrate to `box: 2` on first read in `migrateLegacyKey()` (called via `dueCardsForTopic` and `QuestionsTab` mount). Legacy key deleted after.

### Files

| File | Role |
|------|------|
| `src/lib/srs.ts` | Pure Leitner: `loadCard`, `saveCard`, `gradeCard`, `isDue`, `dueCardsForTopic`, `dueCountForTopic`, `migrateLegacyKey`, `resetTopic`, deterministic `shuffle`. |
| `src/components/revise/GradeButtons.tsx` | Three pill buttons with hint label. |
| `src/components/revise/DueBadge.tsx` | "X" pill, `null` when 0. |
| `src/routes/ReviseToday.tsx` | Cross-topic walker. |
| `src/routes/Revise.tsx` | Topic list + Today hero + per-topic badges. |
| `src/routes/ReviseTopic.tsx` | Header carries due badge + "Vježbaj samo X na redu →" link to `?due=1`. |
| `src/components/revise/QuestionsTab.tsx` | Expand-to-grade. Honors `?due=1`. Renders source-doc chip when `Question.source` is set. |

### Gotchas

- `QuestionsTab` keeps a `tick` counter to force the `dueOnly`-filtered list to recompute after each grade.
- `Revise.tsx` lazy-loads each topic's question count via `loadReviseTopic` (cached) on mount - pre-warms the cache.
- Source-chip deep links use `/docs?q=&doc=&page=`. `Question.source.doc` holds a short slug (`skripta_a1`) mapped to full PDF doc-name inside `QuestionsTab`/`ReviseToday`.

## Question generation (`tools/generate_questions.py`)

Build-time pipeline. Reads `Assets/StreamingAssets/<doc>.json` page text, calls Claude Sonnet 4.6 with a Croatian system prompt + few-shot from `neurocranium.json`, runs each generated `source.snippet` through a phrase-grounding check, writes `public/data/ponavljanje/<topicId>.json` and flips that topic's `index.json` badge from `Quizlet` → `A1-Auto`.

All 10 previously-Quizlet topics already filled in (~90 cards across vertebrae/shoulder/arm/hand/hip/leg/foot). Total bank ≈99 questions. Re-run only to refresh content.

### Run

System Python on macOS is externally-managed (PEP 668) - use `tools/.venv` instead:

```bash
# one-time
python3 -m venv tools/.venv
tools/.venv/bin/pip install anthropic

# generate
export ANTHROPIC_API_KEY="$(grep '^VITE_ANTHROPIC_API_KEY=' .env.local | cut -d'=' -f2-)"
tools/.venv/bin/python tools/generate_questions.py --topic quizlet_vertebrae      # one
tools/.venv/bin/python tools/generate_questions.py --all                          # batch
tools/.venv/bin/python tools/generate_questions.py --topic quizlet_arm --dry-run  # no API call
```

### Source corpus: prefer `handout_a1`

`Assets/StreamingAssets/handout_a1.json` (Hand-Out A1 by Ivan Banovac, 82 pages) is far better organized for bone/joint Q&A than the longer skriptas - each page is one tight chapter. Most recipes in `tools/topic_recipes.json` source from it; `skripta_a1` is supplementary. To pick a page range: count Latin term occurrences across handout pages, take the densest cluster.

### Verifier: 5-gram phrase overlap, not strict substring

Page text contains HTML markup and bullet glyphs. Strict substring fails because the model rejoins broken bullets and removes glyphs. The verifier normalizes both snippet and page (strips HTML, replaces glyphs/dashes with spaces, drops punctuation, lowercases, collapses whitespace), then accepts if (a) normalized snippet is a substring, OR (b) ≥70% of contiguous 5-grams from the snippet appear in the page. Don't tighten - Claude legitimately compresses fragmented bullet lists.

### Other knobs

- `max_tokens: 8192` (default 4096 truncates 12-question topics like arm).
- Refusal threshold: <60% verified → exit non-zero, no write. Fix is almost always wrong page ranges, not a verifier tweak.
- `load_existing_links()` is a stub returning `[]`. Re-generating wipes any manually-added links - paste them back into the topic JSON's `links: []` after.

## Non-React tools

`tools/build_pdf_index.py`, `build_combined_index.py`, `render_pdfs.py` - Python scripts shared with Unity. Run from `Anatom3d/`, see root `CLAUDE.md`. The TS upload in `uploadIndexer.ts` mirrors `build_pdf_index.py`; if you change one, mirror in the other.

## Common Operations

| Task | Where |
|------|-------|
| Add a new agent tool | `src/lib/tools.ts` (push to `TOOL_DEFINITIONS`, add case to `runTool`), then mention in system prompt in `src/lib/agent.ts`. |
| Tune Croatian / formatting rules | `SYSTEM_PROMPT` in `src/lib/agent.ts`. Also revisit `ChatLog.tsx` markdown components if rules imply new elements. |
| Change context-window size | `WINDOW_SIZE` in `src/routes/Agent.tsx`. Storage key versioned (`anatomed.agent.chat.v1`); bump if schema changes. |
| Add a new bundled PDF | Update `BUNDLED_SOURCES`, `PDF_FILES`, `PDF_URLS`, `RENDERED_SLUGS` in `src/lib/data.ts`. Re-run Python indexer + renderer in `tools/`. |
| Tweak local upload pipeline | `src/lib/uploadIndexer.ts` (text + spans) and `src/lib/localPdfRender.ts` (rasterization). Both dynamic-imported. |
| Inspect / wipe local docs | DevTools → Application → IndexedDB → `anatomed-local-docs`. Or `deleteLocalDoc(slug)` from console. |

## Things to NOT change without thinking

- The `dangerouslyAllowBrowser: true` flag - leave for prototyping; remove when moving to backend.
- `loadUnifiedIndex()`'s caching (`unifiedCache` / `unifiedPromise` + `bundledDocsCache`) - hit on every Docs nav and every agent tool call. `bundledDocsCache` survives `bumpLocalDocsCache` so uploads don't refetch the 5 bundled JSONs.
- `scrollNonce` deps in `RenderedPdfViewer.tsx` - adding `visiblePages` back reintroduces "page yanks back when you scroll".
- The `Blob`-before-`getDocument` ordering in `uploadIndexer.ts` - pdfjs transfers the `ArrayBuffer`, building the Blob after stores 0 bytes.
- The 0-byte assertion in `saveLocalDoc` - only thing that makes a future regression of the detach bug fail loudly.
- `pageOffsetsRef` measurement effect deps `[meta, containerWidth, totalPages, zoom]` - every input affecting page heights must re-trigger remeasurement.
- Static `pageImageUrl` is now `Promise<string>`. Anything calling it must go through `usePageImageSrc` (manages object-URL lifetime, revokes on unmount/slug-page change). Reverting to sync breaks local docs entirely.
- `public/pdfs` and `public/data` symlinks pointing into `../Anatom3d/` - if either is removed or broken, the dev server returns 404 for every doc, the agent's `search_skripte` tool returns nothing, and `/revise` shows empty topics.
