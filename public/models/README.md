# 3D models

This directory holds the glTF binary (`.glb`) files and the parts catalog used by the `/viewer` route.

These files are **generated artifacts**. Most are produced from the Unity FBX sources at `Assets/Models/1.0 Models/`:

```bash
cd /Users/pitfa19/Documents/Anatom3d
blender --background --python tools/export_to_glb.py
```

> ⚠️ **`nerves.glb` and `vessels.glb` are the exception** — they come from the upstream Z-Anatomy `Startup.blend` via `anatomed-web/tools/export_vessels_nerves_from_blend.py`, NOT from `export_to_glb.py` (FBX baked their thin curve-tubes into fat bars). Running `export_to_glb.py` overwrites them with the broken geometry; re-run the blend exporter afterward. See `anatomed-web/CLAUDE.md` → "Vessels & nerves geometry".

Outputs:

- `glb/skeleton.glb`, `glb/muscles.glb`, `glb/nerves.glb`, `glb/vessels.glb`,
  `glb/organs.glb`, `glb/joints.glb`, `glb/insertions.glb`, `glb/regions.glb`
- `parts-catalog.json` - flat list of selectable parts keyed by glTF mesh node name.

Until you run the export, `parts-catalog.json` is an empty stub and the `/viewer` route shows an empty-state screen with regenerate instructions.
