# Engine commands and schema

Use `node <skill>/scripts/vbuild.mjs <action> ...`; this wrapper finds the app through `engine.json`. Pass absolute input file paths outside the app workspace. Output is compact JSON; errors, failed assertions and live mismatches exit nonzero. Coordinates are absolute Minecraft block cells, inclusive bounds: +X east, +Y up, +Z south.

For coordinated builds prefer the manifest [workflow](workflow.md); use individual commands for targeted inspection, corrections or recovery. `prepare` and `deliver` preserve the same audit/review/CAS safeguards. `timings` reports local command durations.

## Session

```
start
status
connect <actual-instance/config/voxel-build.json>
init <id> <minX,minY,minZ> <maxX,maxY,maxZ> [--offline]
info <id>
notes <id> <brief.txt>
capture <id>
shutdown
```

`start` launches a hidden Electron app. The world must be open and unpaused, with the bridge installed on its logical server. A client mod cannot edit a remote multiplayer server. Config `enabled=false` disables the bridge on next startup; loopback port defaults to 25578. `status` never prints tokens. Session/auth files and projects live in app-local `builder-data`, overridden with `VOXEL_BUILD_DATA`. Keep project notes, plans, renders, checkpoints and receipts together. Game journals live in `<world>/voxel-build/journal`.

`init` captures terrain; offline projects cannot commit. To deliver an offline design, capture a live project and restage its plan against that terrain. `capture` refreshes only a clean draft and retains world identity. Work areas have a 500,000-cell limit including air. Use separate districts for larger sites, avoiding overlapping live edits. Captures tile 32-cube reads and are not globally atomic; compare-and-set protects changed cells at commit time.

## Declarative plans

```
stage <id> <plan.json>
audit <id> [rules.json]
checkpoint <id> <name>
restore <id> <name>
```

Stage overlays existing edits, with last-write-wins operations. API `stage` also accepts `fromCheckpoint`; prefer this atomic regeneration of a complete stage (exposed by manifests) to a separate restore. A checkpoint must share the current baseline. Identical final edit maps preserve revision and review. Without a source checkpoint, old placements omitted by a regenerated plan remain. A failed compile leaves the draft unchanged. Checkpoints restore only against the same baseline: undo committed transactions first if necessary. New stages/restores/captures invalidate visual review.

```json
{
 "version":1,"origin":[100,64,200],
 "palette":{"wall":"minecraft:stone_bricks","post":"minecraft:stripped_spruce_log[axis=y]"},
 "components":{"bay":[
   {"op":"fill","from":[0,0,0],"to":[0,4,0],"block":"post"},
   {"op":"fill","from":[1,0,0],"to":[3,3,0],"block":"wall"}
 ]},
 "operations":[
   {"op":"fill","from":[0,-1,0],"to":[14,-1,10],"block":"wall"},
   {"op":"use","component":"bay","at":[0,0,0],"count":4,"step":[4,0,0],"rotate":0},
   {"op":"set","at":[7,1,0],"block":"minecraft:air"}
 ]
}
```

All operation positions are local to `origin`, then nested component transforms. Blocks accept palette aliases or literal state strings. Use `minecraft:air` to remove cells. Supported ops:

| op | fields | result |
| --- | --- | --- |
| set | at, block | one cell |
| fill | from, to, block | inclusive cuboid |
| box | from, to, block | six boundary faces; does not clear existing interior |
| line | from, to, block | rounded inclusive integer line |
| cylinder | from, to, block, hollow? | vertical elliptical cylinder; hollow has no caps |
| ellipsoid | from, to, block, hollow? | solid or one-cell voxel surface |
| use | component, at?, rotate?, count?, step? | component instance/repetition |

`use` supports count 1..4096, rotation 0/90/180/270, integer translations and repeat steps. Positive 90 rotates north to east and +X to +Z. Facing, x/z axes and directional connection keys rotate; rail shapes, integer rotation properties, mirrors and arbitrary NBT do not. Parent transforms compose, and repeat step is in parent coordinates. At most 10,000 top-level ops, eight nested component levels and two million expanded operation/placement steps; split large work into stages. Write local JS/Python generators to emit JSON when useful, without dumping per-block lists into chat.

## Visual and numeric inspection

```
inspect <id> [region.json]
slice <id> <x|y|z> <coordinate> [region.json]
render <id> [options.json]
review <id> <findings.txt>
```

A region is `{"min":[100,64,200],"max":[120,80,220]}`. Slice returns numeric material IDs/legend and rows from maximum to minimum along its reported vertical axis; read bounds and axes before interpreting orientation. Limit slices to 16,384 cells, usually much less. Inspect returns counts and a bounded sample.

For a large build split across districts, pass `context:["other-project-id", "another-id"]` in render options. Up to 32 projects from the same world/dimension can be composed into one image, with at most 500,000 non-air blocks and a 20-million-cell render envelope. This never expands any project's editing bounds. The actual composite views are recorded against every included district revision, allowing a coherent whole-scene review before committing each bounded district.

Render defaults to perspective, front (-Z), back (+Z), left (-X), right (+X), top. Options may include `bounds`, `views`, `size:[960,720]`, `night:true`, `camera:{position:[x,y,z],target:[x,y,z],fov:55}`. Camera is world-space and affects perspective/interior views. A bounds crop removes geometry outside the crop, permitting cutaways; interpret cut faces accordingly. Render 256..2048 pixels per dimension, at most eight views. Framing-specific hashes keep different cameras/crops/night views in separate files. A labeled contact-sheet path accompanies the full-resolution images. Geometry-identical requests reuse one resident mesh; cropping or geometry changes invalidate it. Open images with `view_image`; the review command cannot look at them for you.

Rendering is on demand. It loads the installed vanilla 1.21.11 JAR, or `VOXEL_BUILD_ASSETS`. It reuses Voxel Studio's model pipeline: missing resources are reported; biome tint, block-entity appearance and fluids have known limitations. Custom resource pack merging is not provided. Night mode is a dim static preview with emissive textures, not Minecraft light-level, spawn-safety or redstone simulation.

`pin <id> <name-and-region.json>` stores a preserve rule for exact occupied and empty draft cells in that region. Normal audit rule replacement retains these pins. `unpin <id> <name>` removes one when the user intentionally requests changing that feature.

Audit rules are an array:

```json
[
 {"name":"door clearance","kind":"empty","bounds":{"min":[105,65,200],"max":[106,67,202]}},
 {"name":"foundation","kind":"solid","bounds":{"min":[100,63,200],"max":[114,63,210]}},
 {"name":"ridge","kind":"block","block":"minecraft:spruce_planks","bounds":{"min":[107,78,200],"max":[107,78,210]}}
]
```

Rules are reused until replaced. Solid means occupied, not collision-solid. Isolated samples are hints. Neither automated checks nor material counts certify design quality. Review rejects images whose composite context revisions changed. Commit also rejects stale reviewed context. Review requires this revision's perspective/top/two more views, no missing resources, no failed rules and specific findings of at least 40 characters. The agent must actually inspect those images.

## Delivery and recovery

```
commit <id>
verify <id>
undo <id>
recover <id> [interrupted-job-id]
```

Minecraft validates/canonicalizes states before application. If defaults change the draft, commit returns `needsReview`: render, inspect, review the new revision and retry. Commits are spatially grouped into at most 8192 changes/64 chunks per transaction. The bridge prevalidates expected states and rechecks each cell while applying. It uses a 4ms/1024-step per-tick budget for application, but state parsing, snapshot reads, chunk loading, journal I/O and world flushes can briefly stall the game.

The engine persists intent before submission. If the network times out, resume the game and run commit again: it resubmits the saved ID/body. Do not invent IDs, alter receipts or recapture to hide conflicts. An interrupted job requires recover; recovery scans expected before/after states backwards, preserving foreign edits. Undo reverses the last single transaction, not an entire multi-transaction build. Repeated undo handles earlier transactions. Multi-transaction operations can be partly applied; there is no whole-build atomicity guarantee. Check info after recovery and review again.

Block entities cannot be created/removed, including chests, signs, beds and lantern variants that use block entities. The renderer supports some existing entities, but rendering support does not grant editing support. Entities, commands, inventories, NBT and remote control are not exposed. Exact-state placement suppresses neighbor cascades: explicitly author fence/pane/wall connections, stairs and door halves, and inspect support. Verify after world ticks when gravity, foliage or fluid behavior matters; the preview does not simulate them. Live verify compares the bounded world against the complete expected draft and reports mismatches without silently overwriting anything.

Commands serialize; a second command can get a busy response during a render/commit. Wait for completion rather than starting competing sessions. Logs are in `builder-data/engine.log`. The animation app is separate.

## Architectural designs

`design <id> <design.json>` and manifest project `design` enable named assemblies, overlap/clearance/attachment/socket contracts, route diagnostics, persisted provenance and structured evidence reviews. See [architecture.md](architecture.md) for the schema and actual limitations.
