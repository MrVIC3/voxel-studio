# Blender animation in Voxel Studio

## Apply a motion preset

Select a character and open **Motion Library → Blender Presets**. Choose one or more actions, then add them to the project. Put the playhead at the intended start and click **Apply at Playhead**. The action writes editable body, root and facial keys where those channels are present. It keeps its duration in seconds when moved between project frame rates. Use **Cycles** to repeat a walk, run or other looping action. **Travel** adds distance in the character’s forward direction.

The 21 bundled takes have editable body and face animation in [the Blender source file](voxel-studio-motion-library.blend). In Blender’s NLA Editor, unmute the matching Body and Face tracks for the take you want to preview. The file opens with Idle Breath enabled.

| Use | Takes |
| --- | --- |
| Repeatable movement | Cinematic Walk, Driven Run, Stealth Walk |
| Background and reaction | Idle Breath, Alert Scan, Curious Peek, Attentive Listening, Affirmative Nod, Head Shake |
| Gestures and props | Friendly Wave, Lively Dialogue, Point Ahead, Pick Up and Inspect, Victory Cheer |
| Action and transitions | Vault and Land, Heavy Blade Strike, Sudden Recoil, Crouch to Stand, Guard Stance Loop, Guarded Sidestep, Quarter Turn Left |

Enable **Include clip root motion** to use the authored travel on walk, run, stealth, vault, sidestep and turn. The locomotion loops plant their feet at the authored travel speed, and repeated cycles accumulate travel. When using a separately drawn route, leave root motion off and match the route speed to the clip to minimize sliding. Pick Up and Inspect supplies the reaching and carrying pose. The held item can be staged separately.

## Import an animation

In the Windows desktop app, choose **Motion Library → Import Blender**, select a `.blend`, and click **Bake Animation**. The desktop app uses a local Blender installation in the background. Blender 4.3.2 and 5.2 LTS were tested. If Blender is installed in a custom folder, set `VOXEL_STUDIO_BLENDER` to the absolute path of `blender.exe` before starting Voxel Studio.

| Bake mode             | Choose it when                                                                                                                                            |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Automatic             | You want individual actions from a typical file, or named tracks from the supplied motion library.                                                        |
| Individual Actions    | You want reusable actions from the active scene.                                                                                                          |
| Named NLA Tracks      | You want each named track exported independently. Use matching NLA track names on the body and facial shape keys to group them into one action.           |
| Entire Scene Timeline | Your motion depends on the evaluated timeline, such as overlapping NLA strips or evaluated IK and constraints. Set the Blender scene’s frame range first. |

An animated `.glb` also imports directly. For a separate `.gltf`, select it alongside its companion `.bin` files. In Blender’s glTF exporter, enable animation, choose the animation mode, and include the animated armature and face mesh in the export. See the [Blender glTF exporter manual](https://docs.blender.org/manual/en/latest/addons/import_export/scene_gltf2.html).

After loading, select the source rig and actions. Voxel Studio recognizes common humanoid bone names, including Mixamo and Blender `.L`/`.R` conventions. **Retargeting options** lets you override joint mappings, adjust facing and translation scale, and remove horizontal travel while keeping vertical motion. A Studio character with IK controls enabled may need those controls disabled on limbs driven by baked rotation keys.

The importer transfers sampled transforms to Voxel Studio’s humanoid rig and maps facial performance to its face controls. It recognizes common eye and jaw bone rotations plus named face shapes. Use `VoxelLookX`, `VoxelLookY`, `VoxelBlink`, `VoxelBrow`, `VoxelSmile` and `VoxelJaw` for direct mapping. Blink and jaw use values from 0 to 1, and the other controls use −1 to 1. Compatible named shapes take precedence over their corresponding bone rotations. Retargeting adapts motion to the proportions and supported joints of the character. For projects with externally linked rigs or scripted dependencies, bake motion in Blender and import the resulting GLB.

## Rebuild the library

Run from the project root with an installed Blender executable on your PATH.

```powershell
blender --background --factory-startup --disable-autoexec --python-exit-code 2 --python scripts/blender/create_motion_library.py -- docs/blender/voxel-studio-motion-library.blend src/blender/voxel-motion-library.glb
npx tsx scripts/blender/sync-running-preset.ts
npx tsx --test tests/blender-motion.test.ts
```
