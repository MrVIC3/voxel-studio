# Efficient build workflow

Use the maintained manifest runner instead of recreating project loops, file copying, stage reset and delivery code. No command here generates design approval. The agent must inspect the images and author findings.

## Manifest

Save paths relative to the manifest. Plans, rules and render options accept inline objects or filenames. Bounds are inclusive absolute Minecraft coordinates; +X east, +Z south. Do not reuse the example dimensions for unrelated requests.

```json
{
  "version": 1,
  "briefFile": "BRIEF.md",
  "projects": [
    {
      "id": "hall-west",
      "bounds": {"min": [0,64,0], "max": [31,95,31]},
      "checkpoint": "site",
      "fromCheckpoint": "site",
      "plan": "west.json",
      "rules": "west-rules.json"
    },
    {
      "id": "hall-east",
      "bounds": {"min": [32,64,0], "max": [63,95,31]},
      "checkpoint": "site",
      "fromCheckpoint": "site",
      "plan": "east.json"
    }
  ],
  "renders": [
    {"views": ["perspective","top","front","back","right","left"], "size": [1200,900]},
    {"views": ["perspective"], "size": [1200,900], "camera": {"position": [31,69,-12], "target": [31,75,15], "fov": 65}}
  ]
}
```

`node <skill>/scripts/vbuild.mjs prepare <manifest.json>`:

- Resolves existing projects and disjoint bounds before staging; creates missing projects by capturing the actual world. `offline:true` is only for a separate non-deliverable prototype.
- Creates `checkpoint` once, without replacing an earlier source checkpoint. Compiles `fromCheckpoint` in memory then stages atomically; no intermediate restore revision. A failed compile does not alter the draft.
- Stages every district, preserving the revision when its final edit map is identical, then audits and renders the composition. A failing audit yields `fix-audit` and a nonzero CLI exit before expensive rendering.
- Returns `inspect-images`, immutable image paths, contact sheets, missing assets and render timings. Saves the full result beside the manifest as `.prepare.report.json`.

Omit `fromCheckpoint` for a deliberately additive small correction. Use it for a regenerated complete stage so removed generator operations do not leave ghost blocks. After committing, the baseline has advanced: the old source checkpoint is intentionally invalid. Capture/initialize a bounded new edit project or checkpoint the clean current baseline for a new stage. Never disable that baseline check.

A correction to one district can omit `plan` for the others while retaining them in the manifest for composite inspection. For genuinely independent distant work, use separate manifests. Engine commands serialize; do not race multiple CLI processes against one engine.

Open the sheet and relevant individual/cropped PNGs. Write concrete observed findings to `REVIEW.md`, then:

```
node <skill>/scripts/vbuild.mjs deliver <manifest.json> <REVIEW.md>
```

This explicitly records the agent's image review, preflights every district, commits sequential guarded transactions and verifies all districts. Without a findings file it requires existing reviews. Reports beside the manifest distinguish `verified`, `inspect-images` after canonicalization, and `fix-mismatches`. Errors stop delivery, preserving pending IDs/receipts for recovery. Never report completion from `inspect-images` or a partially applied build.

## Geometry helpers

Import `Voxels` from `<skill>/scripts/geometry.mjs` in a local JS generator. It is a helper, not a replacement for architectural design. It accepts a bounded integer-coordinate scene (up to 20 million cells), a palette, and exact block states. Its methods:

- `set([x,y,z], block)`, `get([x,y,z])`, `fill(min,max,block)`.
- `ring(center,outerRadius,innerRadius,block)` for planar disks/rings.
- `ellipsoid(center,[rx,ry,rz],block)` for sculpted volumes.
- `tube(integerPoints,radius,block)` for a six-neighbor connected centerline and thickened ribs. Radius zero still connects diagonal segments. Use deliberate control points; this does not design anatomy.
- `arch(origin,width,springHeight,rise,block,radius=0)` for a pointed XY arch; transform/repeat its component in the engine.
- `connectivity()` reports non-air component sizes and representative coordinates. It is diagnostic; distant islands/chains need intentional attachment logic.
- `plan(bounds?)` exports exact maximal X spans, including explicit air cuts. Large lists are grouped into compiler components. A single exported district must be at most 500,000 cells.
- `partition([{id,bounds}, ...])` emits disjoint district plans, rejecting overlaps or uncovered geometry. Do not silently clip outlying decorative tips.

```js
import {writeFile} from 'node:fs/promises';
import {Voxels} from '/absolute/path/to/skill/scripts/geometry.mjs';
const b={min:[0,64,0],max:[31,95,31]};
const v=new Voxels(b,{stone:'minecraft:stone_bricks'});
v.fill([0,64,0],[31,64,31],'stone');
v.arch([5,65,8],12,6,8,'stone',1);
await writeFile('west.json',JSON.stringify(v.plan()));
console.log(JSON.stringify({blocks:v.blocks.size,connectivity:v.connectivity()}));
```

Author successful visual motifs once as plan components or generator functions. Keep their proportions, palette roles, rotations, end caps and interfaces explicit. Retain an approved motif's source and review image; reuse its logic where it fits the next brief, adapting the design rather than stamping identical buildings everywhere. Keep details out of exposed transit space and maintain a player-scale hierarchy.

## Preserve user-approved details

After the user explicitly prefers a feature, create a pin file:

```json
{"name":"approved-eyes","bounds":{"min":[101,82,209],"max":[109,84,211]}}
```

`pin <id> <pin.json>` snapshots exact draft cells in that region, including air. Subsequent audit rule lists retain pins. A regression fails review/commit; restoring those cells passes again. Use `unpin <id> approved-eyes` when a new user request intentionally changes that feature. Pin only the intended detail, not the whole build, and do not use a pin to prevent authorized refinement.

## Diagnose actual time

`timings` returns the last 200 local command timings (also `builder-data/timings.json`), with no tokens or block dumps. Render receipts report block count, mesh-cache hit, mesh milliseconds and total renderer milliseconds. Image encoding/readback and disk/transport still take time even on a cache hit. Cache one scene to bound GPU memory; a changed crop/geometry evicts it.

Use compact summaries, not full snapshots. Re-render targeted defects with context, then a final coherent contact set. Choose readable image sizes for the feature being judged; do not reduce detail or skip inspection to meet an invented deadline. `node builder/benchmark.mjs` measures exact-output CPU hot paths; `node builder/tests/performance-render.cjs` benchmarks the saved arena offline when present. These measure specific operations, not total agent thought time or a guaranteed cost reduction.
