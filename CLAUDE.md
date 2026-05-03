# CLAUDE.md — web-prototype

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

Restart `npm run dev` after editing `.env.local` — Vite reads env vars only at server start.

PDF + indexed-data sourcing:

- `public/data/` and `public/models/` ship in-repo (committed). Bundled PDF index JSONs and `.glb` models load from there.
- The 5 bundled source PDFs and rendered page WebPs come from **Supabase Storage public buckets** (`pdfs`, `pdfs-rendered`) when `VITE_PDFS_BASE_URL` / `VITE_PDFS_RENDERED_BASE_URL` are set — which is the default for both local dev and prod. Without those env vars, `src/lib/data.ts` falls back to `/pdfs` and `/pdfs-rendered` paths under `public/`, which are gitignored and won't exist on a fresh clone.
- `public/pdfs-rendered/<slug>/` may exist locally as a development cache; `tools/upload_to_supabase.ts` reads from it to push to Supabase. `files/` (gitignored) holds the 5 source PDFs for the same uploader.

## Auth + credits (Supabase, hackathon-grade)

Plain username/password backed by a single Supabase table. **Not real auth** — no Supabase Auth, no email, no OAuth, no JWTs. Built for a hackathon demo.

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
- `/profile` is **intentionally not in the main `NAV` array** — it lives next to the theme toggle on the right.

### Non-security note

`SALT` is a fixed string. No per-user salt, no slow KDF, no rate limit. This stops *plaintext over the wire* and *trivial DB-dump-as-rainbow-table* — nothing else. Treat the credits balance as cosmetic state, not entitlement. Real auth = replace the shim with Supabase Auth and tighten RLS to `auth.uid()`.

## Storage backend (Supabase)

All PDFs live in the same Supabase project (`uafyfwyyqzunabpuftue`) but in different buckets with different access patterns.

### Public buckets (bundled PDFs, served to every visitor)

- `pdfs` — the 5 source PDFs as `<filename>.pdf`. Public read. 200 MB file limit, `application/pdf` only.
- `pdfs-rendered` — `<slug>/0001.webp`, `<slug>/0001.json`, `<slug>/meta.json` for each of the 5 slugs (skripta_a1/a2/a3, handout_a1, duale_reihe). Public read. 10 MB file limit, `image/webp` + `application/json`.
- Front-end reads via `VITE_PDFS_BASE_URL` / `VITE_PDFS_RENDERED_BASE_URL` (`src/lib/data.ts:21-24`). The values point at `https://<project>.supabase.co/storage/v1/object/public/<bucket>`.
- Uploads go through `tools/upload_to_supabase.ts` (one-shot, idempotent, concurrency 8). Requires `SUPABASE_SERVICE_ROLE_KEY` in `.env.local` — never committed, never shipped to the browser. Reads source PDFs from `<repo>/files/` (gitignored) and rendered from `public/pdfs-rendered/` (gitignored). Free-tier Supabase plans cap single-file uploads at 50 MB, so two oversized source PDFs (Skripta A1 53 MB, Duale Reihe 114 MB) are skipped — runtime never reads source PDFs (PdfViewer.tsx is dead code; only RenderedPdfViewer is mounted).

### Private bucket (per-user uploads)

- `user-pdfs` — keys `<user_id>/<slug>.pdf` and `<user_id>/<slug>.spans.json`. Private (no public URL). Anon RLS allows all CRUD scoped to `bucket_id = 'user-pdfs'`; the app filters by `user_id` on the client side.
- `public.user_pdfs` table tracks each upload with `user_id, slug, doc_label, total_pages, payload jsonb, pdf_path, spans_path, created_at`, unique on `(user_id, slug)`. RLS permissive `using (true)` for `anon` — same hackathon-grade posture as `users`. With this RLS, any anon-key holder can read every user's row. Tightening to `auth.uid() = user_id` requires switching off the auth shim.
- Wiring lives in `src/lib/cloudDocs.ts`: `cloudUploadDoc` fires from `UploadPdfButton.tsx` after `saveLocalDoc`; `cloudSyncToLocal` runs from `AuthContext.tsx` on login; `cloudDeleteDoc` mirrors local delete; `clearCloudScopedLocal` runs on logout.

## Home hero (`/`)

Layered anatomy reveal: full skeleton at the top of the page; on scroll the muscle layer fades in over the bones, reaching ~92% opacity after ~40% of a viewport-height of scroll.

| File | Role |
|------|------|
| `src/routes/Home.tsx` | Owns `heroRef`; calls `useScrollProgress(heroRef)`; passes `muscleProgress` to `<HeroAnatomy3D>`. |
| `src/components/home/HeroAnatomy3D.tsx` | Single `<Canvas>`, two Suspense-bounded groups (`SkeletonGroup`, `MusclesGroup`). Shares `boneCenterRef` (alignment) and `progressRef` (opacity). Renders the full skeleton.glb and muscles.glb — no `applyMultiIsolation`. |
| `src/lib/useScrollProgress.ts` | RAF-throttled hook returning `clamp(-rect.top / triggerHeight, 0, 1)`. |

### Pitfalls

- **Scroll source on home**: `App.tsx` sets `<main className="overflow-y-auto">` only when `pathname === '/'`, so `<main>` scrolls (not `window`). `useScrollProgress` listens with **capture-phase on `document`** to catch scroll from any nested container. Don't switch to `window.addEventListener('scroll', …)` — the muscle reveal silently breaks.
- **Layer alignment**: `SkeletonGroup` writes `boneCenterRef.current = boxCenter` after fitting; `MusclesGroup` applies the **same** offset via `cloned.position.copy(boneCenter).multiplyScalar(-1)`. Done in `useFrame` (not `useEffect`) because muscle GLB can finish loading before skeleton GLB. An `appliedOffsetRef` flag prevents per-frame re-application.
- **Shared muscle material**: muscles.glb has ~3000 meshes. We assign **one** `MeshStandardMaterial({ transparent: true, depthWrite: false, opacity: 0 })` to all visible muscles and tween that single material's `.opacity`. `depthWrite: false` is required to avoid transparent-z-fighting. The muscle group's `.visible` flips off below opacity 0.01.

### Tunables (in `HeroAnatomy3D.tsx`)

- `PROGRESS_GAIN = 2.5` — multiplier on raw scroll progress.
- `target = Math.sqrt(raw) * 0.92` — sqrt ease-in capped at 0.92 so bones still show through.
- `mat.opacity += (target - mat.opacity) * 0.22` — per-frame lerp coefficient.

### Loading strategy

`skeleton.glb` (4.5 MB) preloads via `useGLTF.preload`. `muscles.glb` (13 MB) downloads in the background under its own `<Suspense fallback={null}>`. Whole hero pauses via `IntersectionObserver` when scrolled out of view. Don't re-add `applyMultiIsolation` to crop the hero; the camera fit must use a bbox of only kept parts (`box.setFromObject` walks geometry regardless of `.visible`).

## Agent Architecture (`src/lib/agent.ts`, `src/routes/Agent.tsx`)

### Hybrid model strategy

`chat()` runs a two-phase flow per user turn:

- **Phase 1 — Haiku 4.5 tool decision**, `max_tokens: 1024`. If `stop_reason === 'tool_use'`: tool block(s) run, push assistant turn + `tool_result` user turn, fall through. If text-only: **discard it**. Sonnet writes the answer fresh.
- **Phase 2 — Sonnet 4.6 answer loop**, up to `MAX_TOOL_ITERATIONS = 5`, `max_tokens: 1024`. Returns first text-only response.

Why: Haiku is fast at routing (~400 ms); Sonnet writes consistently good prose. Trade-off: chitchat without tools pays one extra round-trip.

**Critical pitfall**: never return Haiku's text directly to the user.

### Tool: `search_skripte` (`src/lib/tools.ts`)

Fuzzy-matches against `data.allTerms` from the unified PDF index, returns up to 3 terms × 5 hits. Each hit gives a deep link `/docs?q=<term>&doc=<doc-filename>&page=<n>` — the agent must include this verbatim (system prompt forbids URL editing).

### Rolling-window context

`Agent.tsx` keeps a 6-message sliding window. State (in `localStorage` under `anatomed.agent.chat.v1`):

```ts
{ messages: ChatMessage[]; summary: string; summarizedThrough: number }
```

Before `send()`: if `nextHistory.length - summarizedThrough > 6`, call `summarizeMessages()` (Haiku, ~400-token cap) on the older messages and merge into `summary`. Pass `summary` to `chat()` (prepended to system prompt). API receives at most 6 raw messages. `reset()` clears all three fields. Backwards-compat: a v1 array-only payload still loads.

### Status callback + Croatian directive

`chat()` accepts `onStatus(status: ToolStatus)` — `null | {phase: 'thinking'} | {phase: 'tool', name, input} | {phase: 'summarizing'}`. `Agent.tsx` renders it as a chip via `ChatLog`'s `PendingIndicator`. Cleared in the `finally` block.

System prompt enforces Croatian standard (no Serbian/Bosnian forms — *talas → val, vazduh → zrak, hiljadu → tisuću*), no markdown tables, bullet lists with **bold** labels, no emoji, 4–8 lines + max-4 reference chips. If formatting changes, also update the markdown components in `src/components/agent/ChatLog.tsx`.

### Security caveat

`new Anthropic({ apiKey, dangerouslyAllowBrowser: true })` ships the key to every visitor. Fine for local prototyping. Before deploying, route LLM calls through a backend (or Vercel Function).

## Docs Deep Linking (`src/routes/Docs.tsx`)

Reads `?q=&doc=&page=` from the URL on mount and on changes. When the agent emits a chip:

1. Router does SPA navigation.
2. `useEffect` waits for `loadUnifiedIndex()`, then sets `term`, `selectedDoc`, `visiblePage`, `hitIdx`.
3. `scrollNonce` bumps so the viewer scrolls to the highlighted hit.

### `scrollNonce` — re-clicking same hit must re-center

The viewer's "scroll to current mark" effect in `RenderedPdfViewer.tsx` deps on `[inSearch, hits, occIdx, scrollNonce]` — explicitly **not** `visiblePages`. Any path changing the user-selected hit (URL params, `pickHit`, `pickDoc` in search mode, `pickTerm` with hits, `stepOcc`) bumps `scrollNonce` so manual scrolling doesn't yank back, and re-clicking the same hit re-centers. The highlight-class effect (`.hl-current`) is split out and *does* depend on `visiblePages` for newly-mounted marks.

### Don't reset `visiblePage` on `selectedDoc` change

The `[selectedDoc]` effect resets `totalPages` to 0 only. It used to also reset `visiblePage = 1` and clobbered deep-linked `?page=`. Every code path that changes `selectedDoc` (URL effect, `pickDoc`) now sets `visiblePage` itself.

### Current-page tracking — scroll-position based, not IntersectionObserver

Two separate mechanisms:

- **IntersectionObserver** (`rootMargin: 600px`) — tracks `visiblePages: Set<number>` for prerendering only.
- **`pageOffsetsRef`** + scroll listener — measures each `[data-page]` element top once per layout change (deps `[meta, containerWidth, totalPages, zoom]`), binary-searches `scrollTop + ~20% viewport height` against the offsets array on each RAF-throttled tick.

Old IO-only approach picked the wrong page when off-screen entries inside the expanded `rootMargin` had `ratio = 1.0`. Don't add a third source of truth.

### Zoom (PC only)

50–300% via `ZOOM_STEPS`. UI is `hidden lg:flex` (mobile/tablet hidden). `−` / percent (resets to 100%) / `+`; `Ctrl/Cmd + wheel` debounced to 90 ms; trackpad pinch dispatches `ctrlKey + wheel` so it works through the same path; `passive: false` for `preventDefault`. Pages render at `containerWidth * zoom`. Container uses `overflow-auto` (not `-y-auto`) so horizontal scrollbars appear when zoomed in. **Scroll-anchor preservation**: `applyZoom` captures `(pageIdx, ratioWithinPage)` *before* mutating zoom into `pendingZoomAnchorRef`; the `pageOffsetsRef` measurement effect, on next re-run, restores `scrollTop = newPageTop + newPageHeight * ratio`.

## 3D Viewer (`/viewer`)

`@react-three/fiber` + `@react-three/drei` over `three`. Search-driven: the catalog tells us which system a part lives in, the glb for that system loads, and `applyIsolation` hides every other leaf mesh.

### Isolation algorithm — port of Unity `MeshManagement.IsolationClick()`

`src/lib/viewer/isolate.ts` mirrors `Assets/Scripts/MeshManagement.cs:318–367` + `SelectedObjectsManagement.cs:107–125, 226–256`:

1. **`applyIsolation(scene, partId)`** — walks the scene, hides every leaf mesh not in `partId`'s subtree (Unity's `DeleteNotSelected`). Returns `{ hidden, anchors }` so `clearIsolation` can restore exactly what was hidden.
2. Walks ancestors of the target setting `.visible = true` (Unity's `SetActiveParentsRecursively`).
3. **Filter**: skips nodes whose name contains `-lin` or `labels`. `-line` connector meshes outside the target subtree are hidden, but **inside the target subtree they stay visible** so each HTML label has a 3D grey line drawn from bone surface to label anchor.
4. **`collectAnchors(target)`** — gathers descendants whose glTF `extras.labelText` is set (FBX `.t` EMPTY anchors tagged at export) and returns `{ key, text, position }` triples in world coordinates.

`SystemModel.tsx` runs `applyIsolation` in a `useEffect` keyed on `[scene, activePartId]` and emits anchors via `onAnchors`. `AnatomyScene.tsx` renders drei `<Html center>` labels at each anchor. **Labels live as siblings of `<SystemModel>`, not inside any `<Bounds>`** — `<Html>` portal would corrupt drei's auto-fit math.

### Camera fit — `fitOrthoToObject(camera, controls, target, viewport)`

drei's `<Bounds fit>` was unreliable for orthographic + small-bone scale. `SystemModel.tsx` does an explicit fit:

1. World-space `Box3` from target's visible Mesh descendants (`-line`/`labels` excluded).
2. Aim the camera along its current direction; pull back by `max(boxDiag * 2, 5)`.
3. Set `left/right/top/bottom` to `boxSize * margin` (with aspect compensation), `zoom = 1`, `updateProjectionMatrix()`.
4. Move OrbitControls' `target` to box center and `update()`.

### Landmark labels — `.t` EMPTY anchors with glTF `extras`

Unity Z-Anatomy FBX encodes each anatomical landmark as an EMPTY transform named `<Landmark>.t` (e.g. `Body of femur.t`) parented to the bone. `tools/export_to_glb.py → tag_anchor_labels()` writes the human-readable label (`<name>.t` minus suffix) to each EMPTY's Blender `labelText` custom property. The Blender glTF exporter (`export_extras=True`) puts those into glTF `extras` → `node.userData.labelText` in three.js.

Don't try to derive labels from sanitized node names: `THREE.PropertyBinding.sanitizeNodeName` strips `.` and replaces whitespace with `_`, so `Body of femur.t` arrives as `Body_of_femurt` — unrecoverable. Most anchors live under `.r` bones; `findPartByTerm` in `catalog.ts` prefers `.r` so the user sees the labeled side.

### Camera controls — zoom/pan limits + Centriraj button

`<OrbitControls makeDefault enableDamping enableRotate enablePan enableZoom screenSpacePanning minZoom={0.5} maxZoom={8}>`. Default mouse buttons; touch pan/zoom works as expected. Flags set explicitly because default-undefined was prone to silent regressions.

A custom `<PanClamp>` listens to OrbitControls `change` and snaps `controls.target` back inside a sphere of radius `min(fitWidth, fitHeight) / 2 / camera.zoom`. The "Centriraj" button (lucide `Crosshair`) re-runs `fitOrthoToObject` on the active target only.

#### Pitfall: stable callbacks for `SystemModel`/`ExtraPart`

`SystemModel`'s isolation effect deps include `onAnchors` and `onFit`. Both **must** be referentially stable — otherwise every state tick re-fits the camera and the user can't pan/zoom. `AnatomyScene` caches per-`srcKey` anchor handlers in a `useRef(new Map(...))` (`getSrcAnchors`) and `useCallback`s `handleFit`. Don't replace either with inline arrows in JSX.

#### Pitfall: OrbitControls drift on deep-link mount → useFrame post-fit

Deep-linking `/viewer?part=<id>` sometimes shows blank/half-framed canvas; "Centriraj" or refresh fixes it. Cause: `OrbitControls.update()` runs every frame and re-derives camera position from internal spherical state; on a fresh mount the spherical hasn't settled (drei's `<OrthographicCamera makeDefault>` swaps the default camera once). Small spherical delta during early frames shifts the camera off the freshly-fit position.

Fix: `SystemModel` runs a `useFrame` post-fit loop calling `fitOrthoToObject` for the first **6 frames** after each isolation-key change. useFrame runs after OrbitControls, overriding drift. Also retries when r3f reports `size` 0×0 transiently. Don't merge into the isolation effect (must run *after* OrbitControls). Don't extend past ~10 frames. Include `camera.uuid` in `lastIsolationKeyRef` — StrictMode remounts the OrthographicCamera; without it the new camera never gets fit.

### Neighbors panel — branching + BFS layer stack

`tools/export_to_glb.py → write_neighbors()` precomputes 30 nearest parts per part using **AABB-to-AABB closest-point distance** (center-to-center fails for elongated bones). Insertions are skipped from both sides — they're attachment markers, not anatomy users want as neighbors. Output: `public/models/parts-neighbors.json` (~6 MB, lazy-loaded).

`<NeighborsPanel>` is fed `rows: Neighbor[]` from `Viewer.unionedNeighbors` (union of `[active.id, ...extras]` neighbours, **excluding already-selected**). Per-row interactions:

- **Checkbox** → flips membership in `extras: Set<string>`.
- **Name area** → makes this the new **active** part; previous active is **demoted to an extra**.
- **Eye/EyeOff** (only on ticked rows) → toggles labels for that part.

#### "Odabrano" pill row + clear-extras

Between the active card and the panel, an "Odabrano · N" pill row renders one chip per extra: system-color dot, name, eye, X. Clicking name promotes to active. `max-h-32` overflow-y-auto so it stays usable when many parts selected. `Očisti sve` clears all extras and layer stacks.

#### Layer stack ("Sloj N · ±")

Per-system toolbar:

- `+` → `expandLayer(systemId)`: gather every neighbour of `[active.id, ...extras]` in that system not already selected, add all to `extras`, push array onto `layerStacks[systemId]`. No-op when frontier empty.
- `−` → `collapseLayer(systemId)`: pop top, remove ids from `extras` and `labelsByPartId`. Disabled when stack empty.

Each system has an independent stack. Manual ticks/unticks don't push/pop. Stacks reset on `freshSearch`, `clearAll`, `clearExtras`, `focusFromNeighbor` — moving the centre invalidates BFS layers.

#### Same-system vs cross-system extras

`<AnatomyScene>` splits `extras`:

- **Same-system extras** flow into `<SystemModel>` as `sameSystemExtras`. After isolation, each is re-enabled and its anchors collected with `collectAnchors(extra, 'extra', extraPartId)`. Piggy-back on the active scene graph.
- **Cross-system extras** each render as `<ExtraPart>` which `useGLTF(otherSystem.glb)`, **clones the scene** (`scene.clone(true)`), runs isolation against the clone, emits anchors.

Anchors are aggregated into one keyed dict, then flattened. Each carries `origin` (`'active'|'extra'`) + `partId`. `fitOrthoToObject` for the active includes same-system extras in its bbox; cross-system aren't (re-fit via Centriraj).

#### Click-to-focus in 3D

`AnatomyScene` builds `partsByName` from `catalog.parts` (key = `sanitizeNodeName(part.id)`), forwards a stable `handleObjectClick(obj)` to `<SystemModel>` and each `<ExtraPart>`. They call it from `onClick` on `<primitive>` after `e.stopPropagation()`. It walks parents to find a catalog Part. **Important**: gates on `part.id === activePartId || extras.has(part.id)` — three.js's raycaster doesn't filter by `visible`, so without this gate hidden meshes would still be clickable.

### Per-part labels

`labelsByPartId: Set<string>` in `Viewer.tsx`, default empty. Mutated by:

- Eye buttons on the active card and on each ticked neighbour row.
- `clearExtras`, `freshSearch`, `clearAll`, `collapseLayer` clean up entries.

`<AnatomyScene>` filters `visibleAnchors` by `labelsByPartId.has(a.partId)` — independent of active/extra status. Each `LandmarkAnchor` carries `partId` (stamped by `collectAnchors(target, origin, partId)`). Chips render as drei `<Html>` with `bg-surface/70 backdrop-blur-sm border-border/60 text-[10px]`.

#### Whole-bone anchor + connector dropped

Z-Anatomy FBX includes a "whole-bone" `.t` anchor on each bone (`Femur.t` with labelText `Femur`) plus `Femur-line`. We drop these — the active card already names the bone and the chunky connector is disruptive. `AnatomyScene` filters anchors whose `text` matches the owning Part's `name_en`/`name_lat` (case-insensitive) and computes `wholeBoneLineNames: Set<string>` passed to `SystemModel`/`ExtraPart`; their line-visibility effects always set `visible = false` on those mesh names. Subpart connectors still toggle normally.

### Connector lines

`-line`/`-lin`-prefixed Mesh nodes that are descendants of an active/extra target stay visible during isolation **iff that part's labels are on**. Material is shared `MeshBasicMaterial({ color: 0x6b6b6b, opacity: 0.25, transparent, depthWrite: false })`. Geometry is non-uniformly **scaled per-mesh** by `thinAxisAligned(m, 0.2)`: longest axis stays 1, others shrink 5×.

### Mesh thinning for placeholder geometry

Some parts (under `nerves`, `vessels`, `insertions`) export as fat cylindrical bars or flat plates instead of thin sheets/wires (e.g. Tentorium cerebelli as a yellow rectangular bar). `thinIfElongated(m, systemId)` runs after the system tint is assigned. Triggers when `max/med > maxOverMed` (wire-like) OR `med/min > medOverMin` (plate-like). Per-system in `THIN_THRESHOLDS`: `nerves/vessels/insertions = 4/3` aggressive; `skeleton/muscles/organs/joints/regions = 14/6` conservative (femur untouched). Both non-longest axes scaled to `target = clamp(max * 0.01, 0.03, 0.3)`. `fitOrthoToObject` excludes `-line` from the bbox.

### `/docs` "Na ovoj stranici" 3D side-rail

When a doc is open and not in search mode, the sidebar lists every catalog-matched anatomical term with an indexed hit on the visible page. Each row links to `/viewer?part=<id>`.

| File | Role |
|------|------|
| `src/lib/docs/pageTermIndex.ts` | `getTermsForPage(unified, doc, page)`. Lazily inverts `unified.index` (term → hits[]) into `(doc, page) → terms[]`, memoized via `WeakMap`. Cache invalidates when `bumpLocalDocsCache()` runs. |
| `src/components/docs/OnThisPagePanel.tsx` | Filters page terms through `findCatalogPartByTermAnyCase`, dedupes by `part.id`. |
| `src/routes/Docs.tsx` | Mounts panel between single-term `<ViewIn3DChip>` and search/page-browser branches. Gated on `!inSearchMode && selectedDoc`. |

#### Filter to `exact: true` hits — non-negotiable

`Hit.exact === false` when the term matched as substring of a longer word. Croatian generates aggressive false positives: `pons` in `preponska`, `ren` in `okrenuta`, `palma` in `palmarno`. `buildPerDoc()` skips any hit where `h.exact === false`. Don't drop this filter.

#### Empty state with jump-to-content

The panel never returns `null` once a doc is open. When current page has zero catalog hits:

- If the doc has any catalog-matched page anywhere → "Sljedeća stranica s 3D-strukturama: str. N" button → `onGotoPage(N)` → `Docs.tsx#gotoPage` → `setVisiblePage(N)`.
- If the doc has zero anywhere → "Ova skripta nema indeksiranih 3D-struktura."

`pageTermIndex.ts` exposes catalog-aware helpers (2-level WeakMap keyed `unified → catalog → perDocSortedPages`): `nextPageWithCatalogMatch`, `docHasAnyCatalogMatch`. Build cost ~12M comparisons but runs once per `(UnifiedIndex, PartsCatalog)` pair (both stable singletons).

#### Catalog coverage caveat

`parts-catalog.json` models whole bones and major muscles — not bone-internal landmarks. So a page listing `acetabulum`, `os ilium`, `crista iliaca`, etc. shows just one row: `Os coxae`. Joints/ligaments aren't in the catalog (no `articulatio coxae`, no `lig. teres`). Expanding coverage = adding sub-part anchors in `tools/export_to_glb.py`, not changing this code.

### Unified search cross-link `/docs` ↔ `/viewer`

`findCatalogPartByTermAnyCase(catalog, term)` does case-insensitive exact-name lookup against `name_en`/`name_lat`. Three integrations:

- **`/docs` → `/viewer`**: when picked term resolves to a catalog part, "Pogledaj u 3D — &lt;name&gt;" chip appears between search bar and source picker. Links to `/viewer?part=<id>`.
- **`/viewer` → `/docs`**: when query doesn't match a part but matches at least one PDF term, "Pronađi u skriptama: &lt;term&gt;" link below the search.
- **Deep link**: `/viewer?part=<id>` is read on mount; auto-isolates if matches.

`SearchBar` gained an optional `onQueryChange` prop for the viewer's "as-you-type" cross-link without coupling to its `onPick` semantics.

### Parts catalog

`public/models/parts-catalog.json` — flat list with stable glTF node IDs, English + Latin names, `system` discriminator. Generated by `tools/export_to_glb.py` (Blender). Catalog is committed but starts empty; route shows empty-state with regenerate instructions until you run the script.

`PartSearchBar.tsx` wraps `src/components/docs/SearchBar.tsx` so the search UX matches `/docs` — same `fuzzyMatch`, same keyboard nav, same chip styling. Catalog parts formatted as `"English · Latin"`; the picker reverse-looks-up the `Part`.

### Materials

FBX→glTF strips materials. `SystemModel.tsx` assigns one `MeshStandardMaterial` per system at runtime, tinted by `system.tint`. Defaults: bones ivory, muscles red, vessels crimson, nerves yellow, organs pink, joints tan, regions blue-grey.

### Regenerating .glb files

```bash
cd /Users/pitfa19/Documents/Anatom3d
blender --background --python tools/export_to_glb.py
```

Outputs `public/models/glb/<system>.glb` and `public/models/parts-catalog.json`. Re-run only when FBX sources change. Optional: `gltfpack -cc -i in.glb -o in.glb`.

### FBX transform sanitizer (`sanitize_transforms()`)

`NervousSystem22-55.fbx` ships with five corrupted leaves (`Falx cerebri`, `Tentorium cerebelli.l/r`, `Choroid plexus.l/r`) — massive `scale.y`/`location.y` cancelled by their parent dural containers' tiny `scale.z`, leaving the world matrix with `[2][1] ≈ −2,254,790` and rendering as a 400K-unit yellow shaft. Naive local-scale clamping doubles the previously-cancelled axis.

Fix: identify leaves with `|scale| > 1000` or `|location| > 50`, clamp any matrix cell with `|v| > 50` to zero, detach from parent, bake cleaned matrix into vertices, reset `matrix_world`. Detached leaves still appear in the catalog. `strip_container_geometry()` turns empty parents into transform-only nodes.

#### Fit-to-cranium (`fit_intracranial_to_cranium`)

Sanitized leaves still emerge ~1.5–1.7× too large. A second pass references the skeleton's cranium bbox:

1. `compute_cranium_bbox()` runs once at `main()` against `SkeletalSystem30.fbx`, unioning Frontal/Parietal/Occipital/Temporal.
2. `fit_intracranial_to_cranium(cranium_bbox)` runs only when `sys_id == "nerves"`. Per-leaf occupancy ratios in `INTRACRANIAL_OCCUPANCY` (Falx 0.65, Tentorium 0.40, Choroid 0.25). Leaf bbox computed by walking `obj.data.vertices` directly — `obj.bound_box` is stale after `obj.data.transform()`. Isotropic scale baked into mesh data when longest axis exceeds `fraction × cranium_max_axis`.

If a future asset renders giant, check the export log for `[fix]` lines first; extend this routine rather than patching at runtime.

## Markdown Rendering (`src/components/agent/ChatLog.tsx`)

- `remark-gfm` plugin enabled — tables, autolinks, strikethrough.
- Custom `a` component: `/docs?` links render as button chips (book icon + truncated label + chevron) using React Router's `<Link>`. Other internal links use `<Link>` plain. External links open in a new tab.
- `max-w-3xl mx-auto` container; prose body `max-w-prose break-words`.
- The `prose` Tailwind class is a marker — `@tailwindcss/typography` is **not installed**. Styling comes from per-element `components` overrides. Install the plugin if you want full prose defaults.

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
- `doc_name = '<slug>.pdf'` — synthetic identifier used as the unified-index key
- `sourceMeta.label = stripExt(filename)` — friendly display

Helpers: `isLocalSlug` / `isLocalDocName` / `localDocNameToSlug` in `localDocs.ts`. Dispatchers in `data.ts` (`loadRenderedMeta`, `loadRenderedPageText`, `pageImageUrl`) all branch on these.

### Cache invalidation

`bumpLocalDocsCache()` clears `unifiedCache` + `unifiedPromise` but preserves `bundledDocsCache` (the 5 bundled JSONs never change in-session). Called after every save/delete.

### Critical pitfall: pdfjs transfers `data.buffer`

`pdfjs.getDocument({ data: someUint8Array })` calls `postMessage(..., [data.buffer])`. The underlying `ArrayBuffer` is **transferred to the worker and detached** on the main side. Code reading the same buffer afterward — including `new Blob([arrayBuffer])` — sees 0 bytes.

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

1. UI — `SourcePicker.tsx` only renders `Trash2` when `localDocs?.has(src.doc) && onDelete`.
2. `Docs.tsx → handleDelete` early-returns if `!isLocalDocName(doc)`.
3. `deleteLocalDoc(slug)` only operates on IDB stores; bundled live in `public/`.

`evictLocalDoc(slug)` (in `localPdfRender.ts`) tears down the in-memory `PDFDocumentProxy` cache.

## Ponavljanje SRS (`/revise`, `/revise/today`)

Spaced-repetition over the existing topic Q&A JSON in `public/data/ponavljanje/`. Replaces the old tap-to-reveal accordion.

### Flow

1. `/revise` lists topics with "Danas — N kartica" hero strip → `/revise/today`. Each topic shows a `<DueBadge>` if any cards due.
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
- `Revise.tsx` lazy-loads each topic's question count via `loadReviseTopic` (cached) on mount — pre-warms the cache.
- Source-chip deep links use `/docs?q=&doc=&page=`. `Question.source.doc` holds a short slug (`skripta_a1`) mapped to full PDF doc-name inside `QuestionsTab`/`ReviseToday`.

## Question generation (`tools/generate_questions.py`)

Build-time pipeline. Reads `Assets/StreamingAssets/<doc>.json` page text, calls Claude Sonnet 4.6 with a Croatian system prompt + few-shot from `neurocranium.json`, runs each generated `source.snippet` through a phrase-grounding check, writes `public/data/ponavljanje/<topicId>.json` and flips that topic's `index.json` badge from `Quizlet` → `A1-Auto`.

All 10 previously-Quizlet topics already filled in (~90 cards across vertebrae/shoulder/arm/hand/hip/leg/foot). Total bank ≈99 questions. Re-run only to refresh content.

### Run

System Python on macOS is externally-managed (PEP 668) — use `tools/.venv` instead:

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

`Assets/StreamingAssets/handout_a1.json` (Hand-Out A1 by Ivan Banovac, 82 pages) is far better organized for bone/joint Q&A than the longer skriptas — each page is one tight chapter. Most recipes in `tools/topic_recipes.json` source from it; `skripta_a1` is supplementary. To pick a page range: count Latin term occurrences across handout pages, take the densest cluster.

### Verifier: 5-gram phrase overlap, not strict substring

Page text contains HTML markup and bullet glyphs. Strict substring fails because the model rejoins broken bullets and removes glyphs. The verifier normalizes both snippet and page (strips HTML, replaces glyphs/dashes with spaces, drops punctuation, lowercases, collapses whitespace), then accepts if (a) normalized snippet is a substring, OR (b) ≥70% of contiguous 5-grams from the snippet appear in the page. Don't tighten — Claude legitimately compresses fragmented bullet lists.

### Other knobs

- `max_tokens: 8192` (default 4096 truncates 12-question topics like arm).
- Refusal threshold: <60% verified → exit non-zero, no write. Fix is almost always wrong page ranges, not a verifier tweak.
- `load_existing_links()` is a stub returning `[]`. Re-generating wipes any manually-added links — paste them back into the topic JSON's `links: []` after.

## Non-React tools

`tools/build_pdf_index.py`, `build_combined_index.py`, `render_pdfs.py` — Python scripts shared with Unity. Run from `Anatom3d/`, see root `CLAUDE.md`. The TS upload in `uploadIndexer.ts` mirrors `build_pdf_index.py`; if you change one, mirror in the other.

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

- The `dangerouslyAllowBrowser: true` flag — leave for prototyping; remove when moving to backend.
- `loadUnifiedIndex()`'s caching (`unifiedCache` / `unifiedPromise` + `bundledDocsCache`) — hit on every Docs nav and every agent tool call. `bundledDocsCache` survives `bumpLocalDocsCache` so uploads don't refetch the 5 bundled JSONs.
- `scrollNonce` deps in `RenderedPdfViewer.tsx` — adding `visiblePages` back reintroduces "page yanks back when you scroll".
- The `Blob`-before-`getDocument` ordering in `uploadIndexer.ts` — pdfjs transfers the `ArrayBuffer`, building the Blob after stores 0 bytes.
- The 0-byte assertion in `saveLocalDoc` — only thing that makes a future regression of the detach bug fail loudly.
- `pageOffsetsRef` measurement effect deps `[meta, containerWidth, totalPages, zoom]` — every input affecting page heights must re-trigger remeasurement.
- Static `pageImageUrl` is now `Promise<string>`. Anything calling it must go through `usePageImageSrc` (manages object-URL lifetime, revokes on unmount/slug-page change). Reverting to sync breaks local docs entirely.
- `public/pdfs` and `public/data` symlinks pointing into `../Anatom3d/` — if either is removed or broken, the dev server returns 404 for every doc, the agent's `search_skripte` tool returns nothing, and `/revise` shows empty topics.
