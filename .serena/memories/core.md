# Core — anatomed-web

React 19 / Vite 8 web app (package name `web-prototype`); the actively-developed browser version of ANATOMED (Croatian anatomy study app). Part of a multi-project parent at `../` (Unity app in `../Anatom3d`, Blender geometry source in `../Models-of-human-anatomy`).

## Authoritative deep doc
`CLAUDE.md` (project root) is the long-form, authoritative engineering doc — per-route deep dives, pitfalls, and a "Things to NOT change" list. **Read the relevant section there before editing any subsystem.** These Serena memories are a terse index + invariants, NOT a replacement.
Parent map: `../CLAUDE.md`. `TEHNICKA_DOKUMENTACIJA.md` is a frozen LUMEN competition deliverable — leave untouched, never fold dev notes into it.

## Source map (`src/`)
- `App.tsx` / `main.tsx` — shell, router + `AuthProvider` mount (provider is above the router).
- `routes/` — one file per page. Routes: `/` (Home), `/docs`, `/agent`, `/revise` (+`/revise/today`), `/viewer`, `/login`, `/profile`, plus `/decks*` and `/quiz*`.
- `components/` — grouped: `agent/ ai/ docs/ home/ quiz/ revise/ viewer/`.
- `lib/` — logic core: `agent.ts tools.ts data.ts auth.ts AuthContext.tsx supabase.ts srs.ts quiz.ts userDecks.ts localDocs.ts uploadIndexer.ts localPdfRender.ts cloudDocs.ts`; subdirs `lib/docs/` (`pageTermIndex.ts`) and `lib/viewer/` (`isolate.ts` — port of Unity `MeshManagement`).
- `api/` — Vercel Functions (server-side Anthropic key): `agent/chat.ts`, `decks/generate.ts`.
- `public/data/` + `public/models/` — committed PDF index JSONs, `.glb` + parts catalog. `public/pdfs` and `public/data` are **symlinks into `../Anatom3d/`** — if broken, every doc 404s.
- `tools/` — Python/TS build scripts (PDF index, question gen, glb export, Supabase upload).

## Domain memories
- Stack & version pins: `mem:tech_stack`
- Commands (dev/build/typecheck) + Darwin notes: `mem:suggested_commands`
- Code conventions, Croatian-language rules, fragile invariants: `mem:conventions`
- What to run before calling a task done: `mem:task_completion`

## Big subsystems (detail lives in CLAUDE.md)
3D viewer isolation (`lib/viewer/`, ported from Unity; one `SystemLayer` per system), agent streaming flow where Sonnet drives the whole turn and Haiku only summarizes (`lib/agent.ts`), `/docs` PDF deep-linking + rendered-page viewer, local-PDF upload pipeline (`uploadIndexer.ts` mirrors Python `build_pdf_index.py`), Leitner SRS (`lib/srs.ts`), the practical spotter quiz (`lib/quiz.ts` + `components/quiz/QuizScene.tsx`; region-isolate → click a structure, skeleton-only), Supabase hackathon-grade auth + a server-side daily AI-token usage gate (`api/` Functions + `lib/usage.ts`).
