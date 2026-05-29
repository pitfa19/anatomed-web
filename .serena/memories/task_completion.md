# Task Completion — anatomed-web

After a code change, before considering it done:

1. **Type-check:** `npx tsc -b --noEmit` (or `npm run build`, which runs `tsc -b` then `vite build`). Strict TS — must pass clean.
2. **Lint:** `npm run lint` (`eslint .`). React-hooks + react-refresh plugins are active; respect hook-deps warnings (several viewer/docs effects depend on exact dep arrays — see `mem:conventions`).
3. **No automated test suite** exists. Verify behavior by running `npm run dev` and exercising the affected route in the browser. Playwright MCP is available for browser-driven checks.
4. If you touched the local-PDF pipeline, the agent prompt, or the 3D viewer, re-read the matching CLAUDE.md section to confirm you didn't violate a listed invariant.
5. If you changed bundle-relevant code (pdfjs, dynamic imports), confirm chunks via `npm run build` and inspect `dist/assets/`.

Note: `uploadIndexer.ts` (TS) mirrors `tools/build_pdf_index.py` (Python) — change one, mirror the other.
