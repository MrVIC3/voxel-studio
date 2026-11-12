# Architectural builds

Use this path for detailed architectural requests. The ordinary voxel primitives remain available for authored components and non-architectural work; they do not certify architectural quality.

## Author and compile

`design <id> <design.json>` stages a complete design atomically. A manifest project may supply `design` as an object or relative filename instead of `plan`. Architectural projects reject subsequent raw-plan staging so contracts cannot be accidentally bypassed. Regenerating an uncommitted design replaces the previous generated draft; source hash and component changes invalidate review even when the final voxels happen to match. After a live commit changes the baseline, create a new captured edit project for the next stage; do not silently reuse the old source.

Design schema:

```json
{
  "version":1,
  "intent":"Compact masonry hall with recessed openings and a usable entrance.",
  "frame":{"min":[-2,0,-3],"max":[20,18,20]},
  "palette":{"wall":"minecraft:stone_bricks","trim":"minecraft:polished_andesite"},
  "components":[
    {"id":"facade","role":"recessed window bay","type":"wall-bay","at":[2,1,2],"rotate":0,"parameters":{"width":7,"height":9}}
  ],
  "evidence":["overview","detail","interior"],
  "routes":[],
  "links":[]
}
```

Coordinates in each component are local; `at` and `rotate` transform its operations, clearance volumes, sockets and attachments together. Components can be built-in assemblies or authored `operations`. Palette values must be real block states. Every component requires a unique ID and a meaningful role.

Built-in assemblies: `wall-bay` (odd width 5..21, height 7..25, optional `window:false`), `gateway` (odd width 7..17, height 8..20), `gable-roof` (odd width 7..25, depth 5..31, rise exactly floor(width/2)), `straight-stair` (width 2..5, rise 1..20), `buttress` (height 5..24). These are useful construction techniques, not a complete style library. Roof stair material uses the palette's `roofStair` bare block ID, not a state with properties already attached. Inspect assembly joins and adapted dimensions.

An authored component can declare `clearances:[{min,max}]`, `attachments:[{at,support}]`, and `sockets:{landing:[x,y,z]}`. Links are pairs of fully qualified socket names, e.g. `["stair.top","walk.landing"]`, which must resolve to exactly the same coordinate. Socket checks enforce coincidence, not a full physical connection simulation.

Cross-component writes are rejected, including identical blocks. Intentional intersections require `replace:["previous-component-id"]` on the later component. Limit this list to real interfaces: a doorway may cut its facade; an interior shelf may replace its wall backing. Do not populate it with every previous component to silence errors. Final architectural clearances and attachment support occupancy are checked after all components; per-cell ownership is persisted under the project's `provenance/` directory. Keep summaries in agent context, not those voxel lists.

Declared `routes` have an ID and a consecutive list of integer foot positions. The current validator checks two air cells, headroom on upward steps and known full-block floors. It deliberately rejects unsupported floor shapes. It does NOT simulate slabs, ladders, stair collision, jumping or arbitrary player movement. Tower ladder access must still be inspected in Minecraft; do not claim those paths were automatically proven. Preserve the requested functionality rather than quietly making towers decorative.

## Evidence and review

Render options accept `label: overview|detail|interior|section|reference`. The design frame is the default single-project crop, making the structure legible rather than framing the terrain capture. Detail needs an explicit camera or crop; interior needs an explicit player-eye camera; section needs cutaway bounds. Full resolution PNGs, contact sheets and receipt UUIDs are returned.

After actually inspecting the images, pass a JSON assessment to `review <id> <assessment.json>` or `deliver <manifest> <assessment.json>`:

```json
{
  "designHash":"COPY_CURRENT_INFO_ARCHITECTURE_HASH",
  "defects":[],
  "criteria":[
    {"category":"composition","findings":"Specific observed proportions, hierarchy and remaining tradeoffs.","evidence":["OVERVIEW_RECEIPT_UUID"]},
    {"category":"detail","findings":"Specific observed reveals, corners, roof interfaces and corrections.","evidence":["DETAIL_RECEIPT_UUID"]},
    {"category":"functionality","findings":"Specific observed interior, circulation and support findings.","evidence":["INTERIOR_RECEIPT_UUID","SECTION_RECEIPT_UUID"]}
  ]
}
```

Replace the illustrative strings with actual evidence. Every required design evidence label must be cited. Each criterion requires substantive findings and current receipt IDs. Open defects prevent acceptance. Resolved defect records should include location, symptom, correction and confirming evidence. A reference requirement also requires a `reference` criterion. This only enforces an evidence record: it cannot tell whether praise is truthful or geometry is aesthetically good. Reject weak architecture after inspection even if all mechanical checks pass.

Use the complete offline example under `builder/examples/architectural-castle/`: regenerate its design with `node .../generate.mjs`. The renderer test `node builder/tests/architecture-render.cjs` runs in an isolated offline app and produces overview, detail, interior and section evidence. It never replaces a user's castle.

## Design discipline

Before expanding a detailed building: settle masses, palette roles, usable footprint, roofs and routes; then inspect a representative wall/window and corner at close range. Build depth through reveals and structural layers. Do not hide blank gables behind flattering camera angles or turn low roofs into solid stepped pyramids. Review back and side elevations and keep quiet surfaces where the style calls for them. Preserve user-approved details with pins.

The compiler supplies repeatable assembly and correctness checks. Local landmark-based camera fitting and spatial regression checks are available below. Automatic landmark extraction, broader component styles, general collision-aware navigation, neutral/depth render passes and broad quality evaluation remain future work. The agent still compares supplied references manually and must not claim these unavailable capabilities.
## Reference comparison

`compare <comparison.json>` works locally even when the engine is closed. Supply `reference` and `render` image paths relative to that file, optional `output`, and optional `landmarks:[{name,reference:[x,y],render:[x,y]}]` using normalized 0..1 coordinates. It writes a self-contained HTML side-by-side comparison with an adjustable overlay plus a JSON report of landmark distances. Use matching cameras and comparable subject crops; the overlay deliberately stretches the actual image into the reference rectangle, so unmatched aspect/crop can mislead. The agent identifies corresponding landmarks manually. This is an inspection workspace, not automatic reconstruction or a quality score.
## Spatial accuracy and failure regression checks

For a symmetric request declare `quality.symmetry` with axis `x` or `z`, integer/half-integer `plane`, and centered inclusive `bounds` covering the intended geometry. It compares exact occupied/air cells and mirrored facing, connection, stair-hand and door-hinge states. Localized `exceptions:[{bounds,reason}]` require explicit architectural rationale. Do not shrink the checked region or add exceptions simply to suppress defects. Exotic direction properties are not all modeled; inspect those manually.

Use `quality.connected:{bounds}` on a structure that is intended to form one face-connected assembly. It rejects separate voxel islands, including mirror-paired floating details that symmetry alone would miss. Do not impose this on intentionally separated floating islands; define appropriate regions/contracts instead.

Every window bay supplies an automatic depth profile distinguishing its front air, recessed air and glazing layer. Add `quality.profiles:[{name,points:[{at,kind,block?}]}]` for critical silhouettes/sections; kinds are `air`, `occupied` or exact `block`. Profiles test specified samples, not every possible architectural mistake. Both symmetry and profiles run during staging and prevent acceptance of failing geometry. Symmetric architectural reviews must cite all four elevations and top.

`node builder/quality-benchmark.mjs` evaluates corrected geometry and injected defects based on observed failures. Its report distinguishes rejection of offset window pairs, extra blocks, mirror-paired floating blocks, filled recesses and blocked routes. Extend these cases when new actual failures occur; retain held-out checks. This is regression learning in the local tool, not AI model fine-tuning or proof of professional quality.

## Reference camera fitting

The comparison file may include `calibration:{points:[{name,world:[x,y,z],image:[u,v]}],initial:{position,target,fov},aspect,tolerance}`. Provide at least six correctly observed pairs, preferably spread across different depths. Image coordinates are normalized to the SAME cropped reference used for comparison. World coordinates are physical coordinates; a Minecraft block center is its integer cell coordinate plus 0.5 in each axis. The local fitter assumes no camera roll and begins near the estimated viewpoint. It cannot discover correspondences or recover hidden geometry. Incorrect world points can mislead it.

The tool saves residuals in `camera-fit.json`; only an accepted fit produces `reference-camera.json`. A rejected fit removes a stale generated camera file and returns a failing CLI exit. Default maximum point error is 0.025 of normalized image dimensions; do not loosen tolerances to disguise poor correspondence. Validate important landmarks omitted from fitting separately to check overfitting.

A design may bind the reference via `reference:{imageHash:"SHA256_OF_SOURCE_IMAGE",calibration:{...}}` and include `reference` in required evidence. Compilation rejects a failed fit. A `label:reference` render then uses the fitted camera and requires the calibrated aspect ratio. Changing the design/reference invalidates review. Compare the rendered silhouette, proportions, opening layout and material roles against the image; record specific differences and fix them. Camera fit acceptance is NOT building accuracy acceptance.
