# 3D models

This directory holds the glTF binary (`.glb`) files and the parts catalog used by the `/viewer` route.

These files are **generated artifacts** produced from the Unity FBX sources at `Assets/Models/1.0 Models/`. To regenerate them:

```bash
cd /Users/pitfa19/Documents/Anatom3d
blender --background --python tools/export_to_glb.py
```

Outputs:

- `glb/skeleton.glb`, `glb/muscles.glb`, `glb/nerves.glb`, `glb/vessels.glb`,
  `glb/organs.glb`, `glb/joints.glb`, `glb/insertions.glb`, `glb/regions.glb`
- `parts-catalog.json` - flat list of selectable parts keyed by glTF mesh node name.

Until you run the export, `parts-catalog.json` is an empty stub and the `/viewer` route shows an empty-state screen with regenerate instructions.
