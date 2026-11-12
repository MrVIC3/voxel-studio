# Voxel Studio 0.5

A local Windows editor for Minecraft Java animation with a cinematic camera studio, editable character performances, Blender action import, shader-based lighting, and a Dope Sheet. It uses original textures from your installed game.

## Start

Extract the portable Windows archive and run **VoxelStudio.exe**. Keep the extracted folder together. The portable build includes its runtime. In a source checkout, use **Start Voxel Studio.cmd** after installing the development dependencies.

The bottom-left **Minecraft Resources** control selects a game version. Use an installed Java version or load a Java version JAR or resource archive manually. The app loads Minecraft resources locally from your installation or the archive you select.

## Workspace

- **Layout / Animation / Lighting:** compact grayscale headers, a large viewport, a right-side Outliner and Properties editor, and a full-width Dope Sheet. Drag dividers to resize panels.
- **Add:** characters, any block in the selected game's catalog, cameras, point lights, spot lights and area lights.
- **Animate:** select a character bone and press **I** to key its pose. Use **Motion Library** to import a Blender action or choose from the bundled presets. Drag across the Dope Sheet to select keys across tracks. The character summary row groups face, bone, and transform keys at each frame.
- **Light:** use the Lighting workspace to apply Golden Hour, Blue Hour, Neon Noir, Studio Portrait, or Overcast Film. Adjust the editable rig, height fog, light shafts, lens focus, bloom, color grade and grain. The sun and eligible point/spot lights cast raster shadows. Area lights provide soft PBR illumination.
- **Camera:** open **Shots → Path** to capture a view with **K** or generate an editable camera move. Use **Effects** for lens presets, depth of field, shake rigs, and timed effects. Use **Cuts** to sequence cameras. [Camera Studio guide](docs/CAMERA-STUDIO.md)
- **Save:** native `.voxel` projects include geometry, keyframes, imported skins and texture overrides. Original game resources are referenced by version and loaded from the installation. Keep that version installed when sharing/reopening a project. Recovery is stored locally.
- **Export:** PNG stills, lossless PNG sequences, MP4, and WebM. The renderer uses the same animation, lens and lighting evaluation in preview and export.

## Controls

See **[Cinematic workflow](docs/CINEMATIC-WORKFLOW.md)** for a shot setup walkthrough and **[Production tools](docs/PRODUCTION-TOOLS.md)** for the Graph Editor, IK controls, hand attachments, particle effects and sound.

| Action | Control |
| --- | --- |
| Orbit / pan / zoom | Left drag / right drag / scroll |
| Move / rotate / scale | G / R / S |
| Frame selection / frame all | F / Home |
| Front / right / top view | 1 / 3 / 7 |
| Camera preview | 0 |
| Capture view key | K |
| Set playback in/out | [ / ] |
| Go to previous/next transform key | Shift Left / Shift Right over the timeline |
| Insert key / play | I / Space |
| Previous / next frame | Left / right arrows |
| Undo / redo | Ctrl Z / Ctrl Shift Z |
| Save / open | Ctrl S / Ctrl O |
| Remove selected object or key | Delete |

Select bones in the Outliner, or click an already-selected character. World/Local changes transform coordinates. Snapping uses 0.25 blocks, 15 degrees and 0.1 scale steps.

## Imports and original Minecraft appearance

| Source | Support |
| --- | --- |
| PNG skins | Modern 64×64 and legacy 64×32, classic/slim arms, 14 pose channels, elbow/knee joints and outer layers |
| WorldEdit `.schem` | Sponge versions 2 and 3 |
| MCEdit `.schematic` | Legacy numeric block IDs, with simplified metadata mapping |
| Structure `.nbt` | Java palettes, block states and positions |
| `.litematic` | Multiple regions, negative dimensions and packed block states |
| Anvil `.mca` | Legacy/modern section palettes, packed/padded states, gzip/zlib/raw chunks |
| World `.zip` | Bounded Overworld chunk selection |
| Java version `.jar` / resources `.zip` | Original PNGs, model inheritance, face textures/UVs, block-state variants/multipart rules and animated texture frames |
| Blender `.blend`, `.glb`, `.gltf` | Baked humanoid actions and supported facial channels, automatic and manual joint mapping. Direct `.blend` uses local Blender. [Blender import guide](docs/blender/README.md) |

Regular blocks use the game's original image files and JSON geometry: stairs, slabs, fences, doors and plants retain their shapes. Foliage uses alpha cutouts; glass and water are transparent. Texture animations follow the timeline. Common blocks whose rendering is hardcoded in Minecraft, including chests, beds, signs and shulker boxes, have dedicated geometry adapters using the original entity textures.

**Accuracy boundaries:** this is not a full implementation of Minecraft's renderer. Biome tint currently uses plains colors. Block-entity text, inventories, banner patterns, custom player heads, mobs, portal shaders, fluid levels/flow and some hardcoded entity geometry are simplified or omitted. Model-only resource packs must include their referenced parent models/textures; partial packs do not automatically merge every missing resource. Missing models use an explicit fallback. The source PNG bytes are preserved, but these rendering differences mean not every block is yet visually identical to the game.

World import X/Z controls use **chunk coordinates**: divide block coordinates by 16 and round down. Imports are centered horizontally with the lowest block center at Y=0. Place a character's feet at Y=0.5 to stand on those blocks. ZIP world imports use the Overworld; load a dimension's `.mca` directly for another dimension. Bedrock/LevelDB, external `.mcc` chunks and LZ4-compressed chunks are unsupported.

## Performance

The interactive renderer uses WebGL2 rasterization. No RTX hardware is required by that method. There is no low-end GPU FPS guarantee: driver, scene complexity, resolution and lighting settings still matter.

Geometry is batched into spatial chunks and atlases, and hidden full-block faces are removed. Rendering stops while idle. Imports decode in workers. Draft keeps the cinematic grade with distance fog and lightweight shadows. Balanced adds quarter-resolution volumetrics and half-resolution AO. High uses half-resolution volumetrics, full-resolution AO and higher shadow and lens quality.

Limits: 1,000,000 solid blocks per import, 2,000,000 per project, 500 scene objects, 4,096 palette states per build; 128 MB input/decompression budget, 100 MB project file, 16 million NBT volume cells. Timeline: 36,000 frames, up to 120 FPS. Sequence export: 600 frames and 350 MB per batch. Video export: 3,600 frames per batch. Imported audio: 20 MB. Effects: 5,000 particles per emitter, 100,000 per project. General-purpose physics, arbitrary mesh modeling, path tracing and a nonlinear clip mixer are not included. MP4/H.264 and AAC encoding depend on device support; WebM is also available.

## Development

Node.js 22+ and npm are required for development; the packaged application includes its own runtime.

```powershell
npm install
npm run desktop
npm test
npx tsx scripts/prepare-fixtures.ts
npm run test:desktop
node scripts/review-v02.cjs
npm run package
```

Design decisions precede implementation in `docs/REDESIGN.md`. Actual screenshots are under `docs/`; test evidence is under `test-results/`. See `docs/VERIFICATION.md` for checks performed. Dependency notices are in `THIRD_PARTY_NOTICES.md` and the portable runtime's license files. Independently developed; not affiliated with Mojang or Microsoft.


## Codex world building

A separate **Voxel Build** engine, **Fabric 1.21.11 bridge**, portable renderer and **minecraft-builder** Codex skill are included. See [Voxel Build setup and workflow](docs/VOXEL-BUILD.md). Start it with **Start Voxel Build.cmd**; the original animation application remains separate.
