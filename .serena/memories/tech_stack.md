# Tech Stack — anatomed-web

- **Language:** TypeScript (`typescript ~6.0`), ESM (`"type": "module"`). Strict tsconfig (`tsc -b`).
- **Framework:** React 19 (`react`/`react-dom` ^19.2). Router: `react-router-dom` ^7 (data-router / `RouterProvider`).
- **Build:** Vite 8 (`@vitejs/plugin-react`). Tailwind 4 via `@tailwindcss/vite` (no separate PostCSS config; v4 CSS-first).
- **3D:** `three` ^0.169 + `@react-three/fiber` ^9 + `@react-three/drei` ^10. Viewer uses an OrthographicCamera.
- **LLM:** `@anthropic-ai/sdk` ^0.91. Models: Haiku 4.5 (tool routing) + Sonnet 4.6 (answers). In prod the key lives server-side in `api/` Vercel Functions; legacy browser path used `dangerouslyAllowBrowser` (see `mem:conventions` — reconcile before shipping).
- **Backend:** Supabase (`@supabase/supabase-js` ^2.105), project id `uafyfwyyqzunabpuftue` (eu-west-1). PDFs in Storage buckets; one `users` table + `user_pdfs`.
- **PDF:** `pdfjs-dist` ^5.4 (+ `react-pdf`). Dynamic-imported to keep bundle down.
- **Markdown:** `react-markdown` ^10 + `remark-gfm`. NOTE `@tailwindcss/typography` is **not installed** — `prose` styling comes from per-element component overrides in `ChatLog.tsx`.
- **Other:** `lucide-react` (icons), `motion` (animation), `clsx`.
- **Hosting:** Vercel (`vercel.ts`, `@vercel/node`, `@vercel/config`). `tsx` runs the TS build/upload tools.

Package manager: **npm** (`package-lock.json`). Node types pinned `@types/node` ^24.
