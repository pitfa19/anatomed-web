"""Render a 512x512 PNG thumbnail per catalog Part.

Reads ``public/models/parts-catalog.json`` and ``public/models/glb/*.glb``,
isolates each part in turn, frames an orthographic camera on its bbox, and
writes ``public/models/thumbs/<sanitized_id>.png`` with a transparent
background.

Run:
    blender --background --python tools/render_part_thumbnails.py

Re-render only one system:
    blender --background --python tools/render_part_thumbnails.py -- --systems=muscles

Limit for smoke testing:
    blender --background --python tools/render_part_thumbnails.py -- --systems=skeleton --limit=5

The runtime (``src/lib/quiz.ts``) maps each part id to a thumbnail filename
using the same ``re.sub`` pair below as ``THREE.PropertyBinding.sanitizeNodeName``,
so the output filenames line up with the GLB node names.
"""

import argparse
import json
import os
import re
import sys
import time
from typing import Iterable, Optional

import bpy
from mathutils import Vector

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CATALOG_PATH = os.path.join(REPO, "public/models/parts-catalog.json")
GLB_DIR = os.path.join(REPO, "public/models/glb")
THUMB_DIR = os.path.join(REPO, "public/models/thumbs")

# Mirror src/lib/quiz.ts QUIZ_SYSTEMS — only systems we actually quiz on.
DEFAULT_SYSTEMS = ("skeleton", "muscles", "organs")

SIZE = 512
MARGIN = 1.20  # extra room around the part inside the frame


def sanitize(name: str) -> str:
    """Match THREE.PropertyBinding.sanitizeNodeName."""
    return re.sub(r"[^\w-]", "", re.sub(r"\s", "_", name))


# ---- scene / render setup ---------------------------------------------------

def reset_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for block in (
        bpy.data.meshes,
        bpy.data.materials,
        bpy.data.images,
        bpy.data.cameras,
        bpy.data.lights,
        bpy.data.objects,
        bpy.data.collections,
    ):
        for x in list(block):
            if x.users == 0:
                block.remove(x)


def setup_render() -> None:
    sc = bpy.context.scene
    # Prefer EEVEE for speed. Naming changed across Blender versions — accept
    # whichever string this build understands.
    eevee_choices = ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE")
    for engine in eevee_choices:
        try:
            sc.render.engine = engine
            break
        except TypeError:
            continue
    sc.render.resolution_x = SIZE
    sc.render.resolution_y = SIZE
    sc.render.resolution_percentage = 100
    sc.render.film_transparent = True
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGBA"
    # Standard view transform — runtime is Tailwind on neutral surface, so the
    # filmic LUT washes out the system tint.
    sc.view_settings.view_transform = "Standard"
    sc.view_settings.look = "None"
    sc.display_settings.display_device = "sRGB"


def add_lights() -> None:
    """Three-light setup: a strong sun key, a softer fill, and ambient. The
    same configuration the runtime uses (ambient + two directionals)."""
    bpy.ops.object.light_add(type="SUN", location=(5, 10, 5))
    key = bpy.context.active_object
    key.data.energy = 4.0
    key.rotation_euler = (0.4, 0.5, 0.0)
    bpy.ops.object.light_add(type="SUN", location=(-5, -3, -5))
    fill = bpy.context.active_object
    fill.data.energy = 1.5
    fill.rotation_euler = (-0.3, -0.4, 0.6)
    # Lift shadows so dark crevices read.
    sc = bpy.context.scene
    sc.world = bpy.data.worlds.new("World") if not sc.world else sc.world
    sc.world.use_nodes = True
    bg = sc.world.node_tree.nodes.get("Background")
    if bg is not None:
        bg.inputs[0].default_value = (1.0, 1.0, 1.0, 1.0)
        bg.inputs[1].default_value = 0.6


def add_camera() -> bpy.types.Object:
    cam_data = bpy.data.cameras.new("ThumbCam")
    cam_data.type = "ORTHO"
    cam_obj = bpy.data.objects.new("ThumbCam", cam_data)
    bpy.context.collection.objects.link(cam_obj)
    bpy.context.scene.camera = cam_obj
    return cam_obj


def assign_tint(objs: Iterable[bpy.types.Object], hex_color: str) -> None:
    """Single principled BSDF material per system, pulled from the system tint
    to match in-app colors. GLB import strips materials, so without this every
    mesh renders as flat white."""
    rgb = hex_to_rgb(hex_color)
    mat = bpy.data.materials.new(name=f"tint-{hex_color}")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf is not None:
        bsdf.inputs["Base Color"].default_value = (rgb[0], rgb[1], rgb[2], 1.0)
        # Bone-ish surface — slightly rough, no metalness.
        bsdf.inputs["Roughness"].default_value = 0.55
        # Property name varies by Blender version.
        for k in ("Metallic", "Specular", "Specular IOR Level"):
            if k in bsdf.inputs:
                if k == "Metallic":
                    bsdf.inputs[k].default_value = 0.05
    for obj in objs:
        if obj.type != "MESH":
            continue
        obj.data.materials.clear()
        obj.data.materials.append(mat)


def hex_to_rgb(h: str) -> tuple:
    h = h.lstrip("#")
    if len(h) != 6:
        return (0.8, 0.75, 0.6)
    r = int(h[0:2], 16) / 255.0
    g = int(h[2:4], 16) / 255.0
    b = int(h[4:6], 16) / 255.0
    # Convert sRGB hex → linear (Blender shaders work in linear).
    def s2l(c: float) -> float:
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return (s2l(r), s2l(g), s2l(b))


# ---- per-part isolation + framing ------------------------------------------

def imported_meshes() -> list:
    return [o for o in bpy.data.objects if o.type == "MESH"]


def find_target(name: str) -> Optional[bpy.types.Object]:
    """Match the catalog id against Blender object names. Tries the raw name
    first (Blender preserves dots and spaces from glTF), then falls back to
    sanitized form, then a startswith match for Blender's `.001` suffixes."""
    candidates = [name, sanitize(name)]
    seen = set()
    candidates = [c for c in candidates if not (c in seen or seen.add(c))]
    for cand in candidates:
        obj = bpy.data.objects.get(cand)
        if obj is not None:
            return obj
    for cand in candidates:
        for o in bpy.data.objects:
            if o.name == cand:
                return o
        for o in bpy.data.objects:
            if o.name.startswith(cand + ".") and o.type == "MESH":
                return o
    return None


def collect_subtree(root: bpy.types.Object) -> set:
    """Every descendant of ``root`` (including the root itself)."""
    out = {root}
    stack = [root]
    while stack:
        node = stack.pop()
        for child in node.children:
            out.add(child)
            stack.append(child)
    return out


def is_connector(obj: bpy.types.Object) -> bool:
    """Drop label-anchor lines and `labels` empties so they never show in the
    bbox or the render."""
    n = obj.name.lower()
    return "-lin" in n or "labels" in n


def isolate(target: bpy.types.Object) -> set:
    """Hide every mesh that isn't part of the target subtree. Returns the set
    of objects we toggled so we can restore them after rendering."""
    subtree = collect_subtree(target)
    toggled = set()
    for o in bpy.data.objects:
        if o.type != "MESH":
            continue
        if o in subtree and not is_connector(o):
            if o.hide_render:
                o.hide_render = False
                toggled.add(o)
            o.hide_viewport = False
        else:
            if not o.hide_render:
                o.hide_render = True
                toggled.add(o)
    return toggled


def restore_visibility(toggled: set) -> None:
    for o in toggled:
        o.hide_render = not o.hide_render


def world_bbox(root: bpy.types.Object) -> Optional[tuple]:
    """Bbox over visible mesh descendants of ``root``, in world space."""
    pts = []
    for o in collect_subtree(root):
        if o.type != "MESH" or o.hide_render or is_connector(o):
            continue
        for corner in o.bound_box:
            pts.append(o.matrix_world @ Vector(corner))
    if not pts:
        return None
    mn = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    mx = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return mn, mx


def frame_camera(cam: bpy.types.Object, target: bpy.types.Object) -> bool:
    """Position the orthographic camera so the part fills the frame from a
    fixed front-ish angle. Returns False if the bbox is empty (caller skips
    rendering for this part)."""
    bb = world_bbox(target)
    if bb is None:
        return False
    mn, mx = bb
    center = (mn + mx) * 0.5
    size = mx - mn
    longest = max(size.x, size.y, size.z, 0.001)

    # Slight 3/4 angle so volumes read better than a strict orthographic profile.
    direction = Vector((0.4, -1.0, 0.25)).normalized()
    distance = max(longest * 3.0, 5.0)
    cam.location = center + direction * (-distance)
    cam.rotation_mode = "QUATERNION"
    look = (center - cam.location).normalized()
    # Build a quaternion looking from cam.location toward center, with +Z up.
    cam.rotation_quaternion = look.to_track_quat("-Z", "Y")

    cam.data.type = "ORTHO"
    cam.data.ortho_scale = max(size.x, size.y, size.z) * MARGIN

    return True


# ---- main loop --------------------------------------------------------------

def render_system(
    system: dict,
    parts: list,
    out_dir: str,
    limit: Optional[int],
) -> tuple:
    glb_url: str = system["glb"]
    # parts-catalog.json paths look like "/models/glb/skeleton.glb?v=…" — strip
    # the cache-buster and the leading slash so we resolve a real file.
    glb_path = glb_url.split("?", 1)[0]
    if glb_path.startswith("/"):
        glb_path = glb_path[1:]
    full_glb = os.path.join(REPO, "public", glb_path)
    if not os.path.exists(full_glb):
        candidate = os.path.join(GLB_DIR, f"{system['id']}.glb")
        if os.path.exists(candidate):
            full_glb = candidate
        else:
            print(f"[skip system] {system['id']}: GLB not found ({full_glb})")
            return 0, 0

    print(f"[system] {system['id']} → {full_glb}")
    reset_scene()
    setup_render()
    add_lights()
    cam = add_camera()
    bpy.ops.import_scene.gltf(filepath=full_glb, merge_vertices=False)
    assign_tint(imported_meshes(), system["tint"])

    # Hide every mesh once up front; the per-part isolate() will reveal what's
    # needed and re-hide afterwards.
    for o in imported_meshes():
        o.hide_render = True

    in_system = [p for p in parts if p["system"] == system["id"]]
    if limit is not None:
        in_system = in_system[:limit]
    print(f"  {len(in_system)} parts to render")

    rendered = 0
    skipped = 0
    t0 = time.time()
    for i, part in enumerate(in_system, start=1):
        part_id = part["id"]
        target = find_target(part_id)
        if target is None:
            skipped += 1
            print(f"  [skip] {part_id}: not found in GLB")
            continue
        toggled = isolate(target)
        try:
            ok = frame_camera(cam, target)
            if not ok:
                skipped += 1
                continue
            out_path = os.path.join(out_dir, f"{sanitize(part_id)}.png")
            bpy.context.scene.render.filepath = out_path
            bpy.ops.render.render(write_still=True)
            rendered += 1
            if i % 25 == 0:
                elapsed = time.time() - t0
                print(f"  {i}/{len(in_system)}  ({elapsed:.1f}s, {elapsed/i:.2f}s/img)")
        finally:
            restore_visibility(toggled)
    return rendered, skipped


def parse_args() -> argparse.Namespace:
    # Blender swallows args before `--`; everything after is for us.
    argv = sys.argv
    if "--" in argv:
        argv = argv[argv.index("--") + 1:]
    else:
        argv = []
    p = argparse.ArgumentParser()
    p.add_argument("--systems", default=",".join(DEFAULT_SYSTEMS),
                   help="Comma-separated system ids to render.")
    p.add_argument("--limit", type=int, default=None,
                   help="Render at most N parts per system (smoke test).")
    return p.parse_args(argv)


def main() -> None:
    args = parse_args()
    requested = [s.strip() for s in args.systems.split(",") if s.strip()]
    os.makedirs(THUMB_DIR, exist_ok=True)
    with open(CATALOG_PATH, "r", encoding="utf-8") as f:
        catalog = json.load(f)

    by_id = {s["id"]: s for s in catalog["systems"]}
    total_rendered = 0
    total_skipped = 0
    for sys_id in requested:
        sys_meta = by_id.get(sys_id)
        if sys_meta is None:
            print(f"[skip system] {sys_id}: not in catalog")
            continue
        r, s = render_system(sys_meta, catalog["parts"], THUMB_DIR, args.limit)
        total_rendered += r
        total_skipped += s
    print(f"\nDone. Rendered {total_rendered}, skipped {total_skipped}. Output: {THUMB_DIR}")


if __name__ == "__main__":
    main()
