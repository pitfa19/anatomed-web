"""Re-export the *vessels* and *nerves* systems to .glb straight from the
upstream Z-Anatomy `Startup.blend`, NOT from the Unity FBX.

Why this exists
---------------
In `Startup.blend` (the master atlas in `Models-of-human-anatomy/Z-Anatomy.zip`)
vessels and nerves are **CURVE objects with a ~0.5 mm round bevel** — i.e. thin
schematic tubes. FBX can't store curves, so the Unity export baked them into
fat solid mesh bars (15-160 mm thick). Those fat bars are what `anatomed-web`'s
`/viewer` rendered as grotesquely thick / "elongated" vessels and nerves.

This script reads the curves' *evaluated* geometry (bevel applied) directly,
so the tubes stay thin. Object names are preserved, so the existing
`parts-catalog.json` / `parts-neighbors.json` keep matching. The blend sits in
the same coordinate space as the FBX-derived skeleton, and `export_yup=True`
applies the same Z-up→Y-up conversion, so output lands exactly on `skeleton.glb`
(verified: `Femur.l` matches to the millimetre).

Run (Blender headless), passing the extracted blend + output dir after `--`:

    # one-time: extract the master blend from the upstream repo
    cd ../Models-of-human-anatomy && unzip -o Z-Anatomy.zip "Z-Anatomy/Startup.blend" -d /tmp/za

    blender --background --python tools/export_vessels_nerves_from_blend.py -- \
        /tmp/za/Z-Anatomy/Startup.blend  public/models/glb  [bevel_mult]

`bevel_mult` (optional, default 1.0) scales every curve's bevel depth — bump it
if 0.5 mm tubes render too thin in the browser.

Only `nerves.glb` and `vessels.glb` are touched. All other systems still come
from `Anatom3d/tools/export_to_glb.py` (FBX → glb).
"""

import bpy
import re
import sys
from pathlib import Path

# (collection-name substring, output .glb, system id)
SYSTEMS = [
    ("Cardiovascular", "vessels.glb", "vessels"),
    ("Nervous",        "nerves.glb",  "nerves"),
]

# Z-Anatomy auxiliary suffixes: .i/.j = group/leader-line helper meshes,
# .g/.s/.t = label text (FONT). The real anatomical parts carry none of these
# (laterality is .l/.r, which we keep). Mirrors the FBX pipeline's intent.
AUX_SUFFIX = re.compile(r"\.(i|j|g|s|t)$")


def find_collection(name_sub: str):
    for c in bpy.data.collections:
        if name_sub.lower() in c.name.lower():
            return c
    return None


def export_system(blend: str, out_dir: Path, name_sub: str, out_name: str,
                  bevel_mult: float, bevel_res: int, res_u: int) -> int:
    bpy.ops.wm.open_mainfile(filepath=blend)
    coll = find_collection(name_sub)
    if coll is None:
        print(f"[err] collection matching '{name_sub}' not found")
        return 0

    keep = [
        o for o in coll.all_objects
        if o.type in ("CURVE", "MESH") and not AUX_SUFFIX.search(o.name)
    ]
    print(f"[info] '{coll.name}': {len(keep)} candidate parts (curves+meshes, no aux suffix)")

    # Tune curve tessellation. Curve data is often shared, so touch each
    # datablock once. `bevel_mult` scales tube thickness; `bevel_res` sets the
    # ring segment count (tubes are sub-mm — a coarse ring is invisible but
    # slashes vertex count); `res_u` caps path samples per segment. Lower values
    # shrink the .glb dramatically without a visible difference at this scale.
    seen = set()
    for o in keep:
        if o.type == "CURVE" and o.data.name not in seen:
            cu = o.data
            if bevel_mult != 1.0:
                cu.bevel_depth *= bevel_mult
            if bevel_res >= 0:
                cu.bevel_resolution = bevel_res
            if res_u > 0:
                cu.resolution_u = min(cu.resolution_u, res_u)
                cu.render_resolution_u = 0  # eval uses resolution_u
            seen.add(cu.name)
    print(f"[info] tuned {len(seen)} curve datablocks "
          f"(bevel x{bevel_mult}, bevel_res={bevel_res}, res_u<={res_u})")

    # Bake evaluated geometry (bevel + modifiers applied) into fresh meshes,
    # carrying the original world matrix. Avoids curve→mesh operator / view-layer
    # visibility / parenting pitfalls entirely.
    dg = bpy.context.evaluated_depsgraph_get()
    export_coll = bpy.data.collections.new("__EXPORT__")
    bpy.context.scene.collection.children.link(export_coll)

    pending = []  # (new_object, desired_name)
    for o in keep:
        ev = o.evaluated_get(dg)
        try:
            me = bpy.data.meshes.new_from_object(ev)
        except RuntimeError:
            me = None
        if me is None or len(me.vertices) == 0:
            continue  # empties / point-only curves contribute no geometry
        me.materials.clear()
        nobj = bpy.data.objects.new("__EXP_TMP__", me)
        nobj.matrix_world = o.matrix_world.copy()
        export_coll.objects.link(nobj)
        pending.append((nobj, o.name))

    keep_ids = {id(n) for n, _ in pending}
    # Delete every original object so the baked copies can reclaim their names
    # (object.new() would otherwise suffix a colliding name with .001).
    for o in list(bpy.data.objects):
        if id(o) not in keep_ids:
            bpy.data.objects.remove(o, do_unlink=True)
    for nobj, name in pending:
        nobj.name = name

    bpy.ops.object.select_all(action="DESELECT")
    for nobj, _ in pending:
        nobj.select_set(True)
    if pending:
        bpy.context.view_layer.objects.active = pending[0][0]

    out_path = out_dir / out_name
    out_path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(out_path),
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=False,          # geometry already baked via new_from_object
        export_materials="NONE",
        export_extras=True,
        export_animations=False,
        export_skins=False,
        export_morph=False,
    )
    print(f"[done] wrote {out_path} ({len(pending)} parts)")
    return len(pending)


def main() -> int:
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    if len(argv) < 2:
        print("usage: ... -- <Startup.blend> <out_dir> [bevel_mult]")
        return 1
    blend = argv[0]
    out_dir = Path(argv[1])
    bevel_mult = float(argv[2]) if len(argv) > 2 else 1.0
    bevel_res = int(argv[3]) if len(argv) > 3 else 2     # ring segments (round bevel)
    res_u = int(argv[4]) if len(argv) > 4 else 6         # cap path samples / segment
    print(f"[info] blend={blend} out={out_dir} bevel_mult={bevel_mult} bevel_res={bevel_res} res_u<={res_u}")
    for name_sub, out_name, sys_id in SYSTEMS:
        export_system(blend, out_dir, name_sub, out_name, bevel_mult, bevel_res, res_u)
    return 0


if __name__ == "__main__":
    sys.exit(main())
