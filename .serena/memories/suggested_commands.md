# Suggested Commands — anatomed-web

Run from project root (`ANATOMED/anatomed-web`).

## Dev / build
```bash
npm install
cp .env.local.example .env.local   # then paste real keys (Anthropic, Supabase)
npm run dev        # vite, http://localhost:5173
npm run build      # tsc -b && vite build
npm run preview    # serve the built dist/
npm run lint       # eslint .
npx tsc -b --noEmit   # type-check only
```
- **Restart `npm run dev` after editing `.env.local`** — Vite reads env only at server start.

## Python tools (PEP 668 — system Python is externally-managed on macOS)
Use the venv, never system pip:
```bash
python3 -m venv tools/.venv
tools/.venv/bin/pip install anthropic
tools/.venv/bin/python tools/generate_questions.py --all
```
glb regeneration runs in Blender from the Unity project:
```bash
cd ../Anatom3d && blender --background --python tools/export_to_glb.py
```

## Darwin (macOS) notes
Default shell is `zsh`. BSD coreutils — `sed -i ''` needs the empty backup arg; `find`/`grep` lack some GNU flags. Prefer Serena's `search_for_pattern` / `find_file` over raw `grep`/`find`.
