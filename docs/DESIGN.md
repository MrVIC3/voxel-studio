# Voxel Studio — product and interface design

Design established before implementation, 24 October 2026.

## Product
A local Windows desktop workspace for staging, posing, lighting and animating Minecraft scenes. Projects are portable JSON files with embedded skins and block data. No account or paid rendering service.

## Layout
At 1440 × 900: 46px application bar, 42px workspace bar, 228px scene column, flexible viewport, 274px inspector, 224px timeline, 25px status bar. Side columns collapse on narrower displays. The viewport always receives remaining space. Panel edges can be resized. All actions use labels or tooltips with keyboard hints.

The top bar contains the product mark, project name, undo/redo, import, save, and export. The workspace bar selects Scene / Animate / Lighting and offers viewport shading and performance quality. The left column has searchable scene objects, visibility controls, character bone hierarchy, and an asset shelf. The viewport has a vertical transform toolbar and a small orientation control. The right inspector has editable transform vectors, character pose controls, camera settings, or scene lighting. The timeline has transport, duration, FPS, tracks, draggable playhead and keyframe diamonds.

## Visual system
Background #171b1e; panels #202529; raised controls #2b3236; dividers #343c40. Primary text #e4e9e7, secondary #99a6a4. Sage accent #b6d6a3, selected backgrounds #354737. Axes use muted red, green and blue. System Segoe UI typography; 12px body, 11px labels, 18px panel title. Four-pixel spacing grid, 5px control corners, minimal shadows. Lucide line icons at 15px. No gradients on interface panels, oversized cards or ornamental dashboards.

## Interaction
- Left drag orbits, right drag pans, wheel zooms. Click selects an object. F frames selection; Home frames the scene.
- G / R / S select move / rotate / scale gizmos. Transform fields are directly editable. Character bones can be selected in the hierarchy and posed using rotation gizmos or degree fields.
- I inserts a complete transform key at the current frame. Space toggles playback. Arrow keys step frames. Keyframe interpolation supports smooth, linear and step. Tracks are per object or bone. Keyframes can be moved and deleted.
- Ctrl+S saves, Ctrl+O opens, Ctrl+Z / Ctrl+Shift+Z undo/redo. Delete removes the selection. Save recovery locally after edits. Confirm before replacing a modified project.
- Import is explicit about supported formats and any simplifications. Errors stay visible in a toast and never silently substitute a demo asset.

## Rendering architecture
Three.js WebGL2, an imperative scene loop separate from React, render only on scene changes when idle, capped device pixel ratio, reusable block textures/materials, exposed-face voxel meshes grouped into spatial chunks. PBR rough materials, directional shadow sun and hemispherical sky fill, fog, filmic tone mapping. Three quality tiers control resolution and shadow maps; no ray tracing required. Display actual draw calls and triangle counts.

## Import contracts
Skin PNG: 64×64 modern and 64×32 legacy, classic/slim arms, six independently animated body parts and transparent outer layer. Sponge schematic v2/v3, vanilla structure NBT, legacy MCEdit schematic and Litematica regions. Java Anvil .mca and zipped world region files use bounded region selection to avoid loading an entire world. Import decoding runs in a worker. Standard blocks use original procedural pixel textures with representative colors; special block state models and modded blocks are simplified to cubes. Resource pack textures can override block textures. Bedrock LevelDB worlds are outside the initial implementation.

## Animation and output
Frame-based timeline, bone and object transforms, interpolated keys, loop toggle, adjustable FPS and duration. Add camera, characters, blocks, and point lights. Camera preview uses a 16:9 composition frame. Export a clean PNG still or a deterministic PNG frame sequence in ZIP; optional real-time WebM video with honest codec/support reporting. Project loading validates data and limits before allocating GPU resources.

## Verification and delivery
Validate parsing with generated NBT fixtures, keyframe interpolation and project validation tests. Compile TypeScript and production bundles. Run the real UI in Chromium for import/pose/keyframe/save/export checks and screenshots. Package a Windows portable app and provide a double-click launcher. Report compatibility limits and distinguish tested behavior from hardware performance targets.

## Design references
- Blender conventions inform panel placement and transform shortcuts; implementation is original.
- Three.js optimization guidance: https://threejs.org/manual/pages/optimize-lots-of-objects.html
- Three.js transform controls: https://threejs.org/docs/pages/TransformControls.html
- Sponge schematic v3: https://github.com/SpongePowered/Schematic-Specification/blob/master/versions/schematic-3.md
- Electron isolation: https://www.electronjs.org/docs/latest/tutorial/context-isolation
