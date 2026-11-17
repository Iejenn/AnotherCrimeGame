"""The sewer rat, built in Blender by script (v0.45 test). Follows docs/design.md §18 (small creature: max 400 triangles,
flat-shaded, solid colours). Writes public/models/creatures/rat.glb. (First try: not used in the game yet, see docs/design.md §18.)

Run (Blender's Python package, `pip install bpy`):  python scripts/blender/rat.py
The moving parts are separate objects with their pivots where they bend, named like the code-built rat's parts, so the
game animates it the same way (animateRat): `body` (everything hangs off it), `head` (pivot at the neck), `leg_0`..`leg_3`
(pivot at the hip), `tail` (pivot at its root). Low-poly and flat-shaded like the rest of the city. Size: about 0.6 tiles
long without the tail (1 Blender unit = 1 tile). Blender is Z-up and looks down -Y; the glTF export turns that into Y-up
with the rat facing +Z, which is how the game wants it.
"""
import math
import os

import bpy
from mathutils import Vector

OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'public', 'models', 'creatures', 'rat.glb')

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene


def mat(name, rgb, emit=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = (*rgb, 1)
    bsdf.inputs['Roughness'].default_value = 1.0
    if emit:
        bsdf.inputs['Emission Color'].default_value = (*rgb, 1)
        bsdf.inputs['Emission Strength'].default_value = emit
    return m


FUR = mat('fur', (0.20, 0.18, 0.16))
BELLY = mat('belly', (0.30, 0.27, 0.24))
SKIN = mat('skin', (0.62, 0.38, 0.38))
EYE = mat('eye', (1.0, 0.08, 0.04), emit=3.0)
TOOTH = mat('tooth', (0.85, 0.80, 0.62))


def link(obj, parent=None):
    if obj.name not in scene.collection.objects:
        scene.collection.objects.link(obj)
    if parent:
        obj.parent = parent
    return obj


def blob(name, balls, material, decimate=0.35, parent=None, origin=(0, 0, 0)):
    """Metaballs melted into one organic shape, turned into a low-poly mesh with its pivot at `origin`."""
    mb = bpy.data.metaballs.new(name)
    mb.resolution = 0.03
    mb.render_resolution = 0.03
    mb.threshold = 0.6
    for (x, y, z), r, (sx, sy, sz) in balls:
        e = mb.elements.new()
        e.co = (x - origin[0], y - origin[1], z - origin[2])
        e.radius = r
        e.type = 'ELLIPSOID'
        e.size_x, e.size_y, e.size_z = sx, sy, sz
    ob = bpy.data.objects.new(name + '_mb', mb)
    link(ob)
    bpy.context.view_layer.objects.active = ob
    for o in bpy.context.view_layer.objects:
        o.select_set(o == ob)
    bpy.ops.object.convert(target='MESH')
    ob = bpy.context.view_layer.objects.active
    ob.name = name
    ob.data.materials.clear()
    ob.data.materials.append(material)
    d = ob.modifiers.new('low', 'DECIMATE')
    d.ratio = decimate
    bpy.ops.object.modifier_apply(modifier='low')
    for p in ob.data.polygons:
        p.use_smooth = False
    ob.location = origin
    if parent:
        ob.parent = parent
        ob.location = Vector(origin) - parent.matrix_world.translation
    return ob


def prim(kind, name, loc, scale, material, parent, rot=(0, 0, 0), **kw):
    getattr(bpy.ops.mesh, f'primitive_{kind}_add')(location=loc, rotation=rot, **kw)
    ob = bpy.context.active_object
    ob.name = name
    ob.scale = scale
    ob.data.materials.append(material)
    for p in ob.data.polygons:
        p.use_smooth = False
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    world = ob.matrix_world.copy()
    ob.parent = parent
    ob.matrix_world = world
    return ob


# ---------- body: a pear shape, the haunches wider than the shoulders; a lighter belly ----------
body = blob('body', [
    ((0, 0.10, 0.17), 0.17, (1.0, 1.15, 0.85)),   # haunches
    ((0, -0.06, 0.17), 0.14, (0.95, 1.1, 0.85)),  # chest
    ((0, -0.16, 0.19), 0.10, (0.8, 0.9, 0.8)),    # shoulders
], FUR, decimate=0.08)
link(body)
belly = blob('belly', [((0, 0.02, 0.105), 0.13, (0.85, 1.6, 0.4))], BELLY, decimate=0.08, parent=body)
# A ridge of spiky fur along the back.
for i in range(4):
    prim('cone', f'spike_{i}', (0.025 * (1 if i % 2 else -1), 0.1 - i * 0.07, 0.33 - abs(i - 1.5) * 0.012), (0.03, 0.03, 0.06), FUR, body,
         rot=(math.radians(-60), 0, 0), vertices=4)

# ---------- head (pivot at the neck): a long pointed snout, pink nose, ears, red eyes, two yellow teeth ----------
neck = (0, -0.22, 0.22)
head = blob('head', [
    ((0, -0.29, 0.23), 0.095, (0.95, 1.1, 0.85)),  # skull
    ((0, -0.39, 0.205), 0.06, (0.75, 1.3, 0.7)),   # snout
], FUR, decimate=0.15, parent=body, origin=neck)
prim('ico_sphere', 'nose', (0, -0.455, 0.205), (0.022, 0.022, 0.02), SKIN, head, subdivisions=1)
for s in (-1, 1):
    prim('cylinder', f'ear_{s}', (s * 0.055, -0.27, 0.315), (0.045, 0.045, 0.008), SKIN, head, rot=(math.radians(80), 0, s * math.radians(25)), vertices=6)
    prim('ico_sphere', f'eye_{s}', (s * 0.05, -0.355, 0.255), (0.018, 0.018, 0.018), EYE, head, subdivisions=1)
    prim('cube', f'tooth_{s}', (s * 0.008, -0.43, 0.16), (0.007, 0.004, 0.016), TOOTH, head)

# ---------- legs (pivot at the hip / shoulder): a thin leg and a pink foot ----------
for i, (x, y) in enumerate([(-0.09, -0.12), (0.09, -0.12), (-0.11, 0.13), (0.11, 0.13)]):
    hip = bpy.data.objects.new(f'leg_{i}', None)
    link(hip, body)
    hip.location = (x, y, 0.12)
    prim('cube', f'leg_{i}_shin', (x, y, 0.065), (0.022, 0.025, 0.055), FUR, hip)
    prim('cube', f'leg_{i}_foot', (x, y - 0.02, 0.012), (0.028, 0.045, 0.012), SKIN, hip)

# ---------- tail (pivot at its root): a long, thin, tapering pink curve ----------
curve = bpy.data.curves.new('tail_curve', 'CURVE')
curve.dimensions = '3D'
curve.bevel_depth = 0.018
curve.bevel_resolution = 0
spline = curve.splines.new('BEZIER')
pts = [(0, 0.27, 0.15), (0.05, 0.42, 0.08), (-0.04, 0.58, 0.04), (0.06, 0.76, 0.03)]
spline.bezier_points.add(len(pts) - 1)
for bp, p, w in zip(spline.bezier_points, pts, (1.0, 0.75, 0.45, 0.15)):
    bp.co = p
    bp.handle_left_type = bp.handle_right_type = 'AUTO'
    bp.radius = w
spline.resolution_u = 3
tail = bpy.data.objects.new('tail_obj', curve)
link(tail)
bpy.context.view_layer.objects.active = tail
for o in bpy.context.view_layer.objects:
    o.select_set(o == tail)
bpy.ops.object.convert(target='MESH')
tail = bpy.context.view_layer.objects.active
tail.name = 'tail'
tail.data.materials.append(SKIN)
for p in tail.data.polygons:
    p.use_smooth = False
# Pivot at the root.
root = Vector(pts[0])
tail.data.transform(__import__('mathutils').Matrix.Translation(-root))
tail.location = root
tail.parent = body

os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_apply=True, export_yup=True, export_materials='EXPORT')
tris = sum(len(o.data.polygons) for o in scene.objects if o.type == 'MESH')
print(f'wrote {OUT} ({os.path.getsize(OUT)} bytes, {tris} faces)')
