"""Export a loaded Blender file as animation-only interchange for Voxel Studio.

Run with Blender --background --disable-autoexec FILE.blend
    --python-exit-code 2 --python bake_motion.py -- OUTPUT.glb
"""

import sys
from pathlib import Path

import bpy


def select_motion_objects(view_layer):
    objects = list(view_layer.objects)
    selected = [obj for obj in objects if obj.select_get()]
    # Keep object-based Minecraft rigs intact. Armature scenes can exclude static scenery.
    if not any(obj.type == "ARMATURE" for obj in objects):
        return None
    motion = set()
    for obj in objects:
        shape_keys = getattr(obj.data, "shape_keys", None)
        if obj.type in {"ARMATURE", "EMPTY"} or obj.animation_data or obj.constraints or (
            shape_keys and shape_keys.animation_data
        ):
            node = obj
            while node and node.name in view_layer.objects and node not in motion:
                motion.add(node)
                node = node.parent
    for obj in objects:
        obj.select_set(obj in motion)
    return selected


def export_motion(destination, mode=None):
    destination = Path(destination)
    if destination.suffix.lower() != ".glb":
        raise ValueError("Voxel Studio expects a GLB output path.")
    scene = bpy.context.scene
    mode = mode or ("NLA_TRACKS" if scene.get("voxel_motion_library") else "ACTIONS")
    properties = bpy.ops.export_scene.gltf.get_rna_type().properties
    view_layer = bpy.context.view_layer
    selected = select_motion_objects(view_layer)
    settings = {
        "filepath": str(destination),
        "check_existing": False,
        "export_format": "GLB",
        "use_active_scene": True,
        "use_selection": selected is not None,
        "export_yup": True,
        "export_animations": True,
        "export_animation_mode": mode,
        "export_frame_range": mode == "SCENE",
        "export_force_sampling": True,
        "export_anim_slide_to_zero": True,
        "export_anim_scene_split_object": False,
        "export_frame_step": 1,
        "export_rest_position_armature": True,
        "export_def_bones": False,
        "export_skins": True,
        "export_morph": True,
        "export_morph_animation": True,
        "export_morph_normal": False,
        "export_morph_tangent": False,
        "export_materials": "NONE",
        "export_image_format": "NONE",
        "export_cameras": False,
        "export_lights": False,
    }
    try:
        result = bpy.ops.export_scene.gltf(**{
            key: value for key, value in settings.items() if key in properties
        })
    finally:
        if selected is not None:
            for obj in view_layer.objects:
                obj.select_set(obj in selected)
    if "FINISHED" not in result or not destination.is_file():
        raise RuntimeError("Blender did not create an animation export.")
    print("VOXEL_MOTION_READY", flush=True)


if __name__ == "__main__":
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    if not 1 <= len(args) <= 2 or (len(args) == 2 and args[1] not in {"ACTIONS", "NLA_TRACKS", "SCENE"}):
        raise ValueError("Specify an output GLB and optionally ACTIONS, NLA_TRACKS, or SCENE after --.")
    export_motion(args[0], args[1] if len(args) == 2 else None)
