---
name: minecraft-builder
description: Plan, construct, render, refine and verify detailed Minecraft Java 1.21.11 builds through the local Voxel Build engine and Fabric bridge. Use for building or editing the connected world, not animation or unrelated plugin development.
---

# Minecraft Builder

Use Voxel Build as this agent's local geometry, rendering and world-editing tool. You design and judge the build; no other AI, paid inference service or background model is involved. Optimize repeated mechanics, never the user's design ambition or visual inspection.

Read [workflow.md](references/workflow.md) for the manifest workflow and reusable geometry helpers. Read the relevant sections of [engine.md](references/engine.md) for API/schema or recovery details, and [craft.md](references/craft.md) for architectural or sculpture decisions. Do not load the whole source tree, previous block lists or every reference on each correction.

## Establish the site once

Run `node <skill>/scripts/vbuild.mjs status`; use `start` if needed. The real world must be open and unpaused, with the bridge on its logical server. Connect using the actual launcher's instance `config/voxel-build.json`. Never print tokens. A client-only mod cannot edit a remote multiplayer server.

Inspect the requested location, then capture its actual terrain with live `init` or a manifest. Never substitute empty terrain when the bridge is unavailable. Offline projects are prototypes and cannot commit. Keep existing unrelated structures and user edits. A building request authorizes ordinary construction and iterative correction: do not request approval for each stage. If an unrelated build would have to be destroyed, use a clear site or resolve that specific scope decision.

For detailed castles, houses and similar architecture, read [architecture.md](references/architecture.md) and use the architectural design path. Author named components, explicit interfaces and circulation requirements; inspect close-up and interior evidence before recording the required structured assessment. Declare the intended symmetry axis and critical depth profiles, and inspect all elevations. For image-driven work, identify actual reference landmarks, fit the comparison camera, bind the source reference to the design and record visible discrepancies before refinement. Run the regression cases when changing these tools. Mechanical acceptance alone does not certify the design.

## Design once, iterate locally

Persist a concise brief: dimensioned coordinates, reference hierarchy, approach, silhouette, palette roles, support/roof strategy, circulation, focal points and the user's explicitly preferred details. Save one deterministic generator and manifest under `builds/<name>/`. Reuse geometry helpers and successful authored components; do not rewrite transport, partitioning, compression or rendering scripts per build. Reuse construction logic without forcing every request into the same template.

Work above 500,000 cells requires disjoint districts; composite renders inspect the whole composition. Choose district seams early. A shared generator must expose coherent parts (such as floor, arcade, statues, sculpture wings), so a correction changes the responsible part rather than rebuilding design logic. Save stage checkpoints and a short defect ledger. Large model reasoning should go toward composition and craftsmanship, not per-voxel output or repeated setup.

Block out the silhouette, circulation and major supports first. Review those proportions, then develop one representative bay/join/roof or sculpture joint before repeating it. Finish with coherent material depth, interfaces and accents. Prioritize mistakes by visible impact; avoid polishing detail that will be discarded after a massing correction. Never put an arbitrary cap on refinement when observed defects remain.

## Prepare, inspect, refine

Prefer `prepare <manifest.json>` to individual district commands. It stages, audits and renders a whole coordinated build and writes a compact report. `fromCheckpoint` atomically regenerates a stage without ghost blocks from omitted operations. Identical staging keeps the revision and review. Read the reported failures and image paths, not full saved snapshots.

Open the actual contact-sheet PNG and inspect perspective, top and at least two elevations at a legible scale. Open individual full-resolution images or cropped views for small defects; add entrance/player-eye, interior or section views when relevant. Review the rear and district seams. Sheets are real renders, not concept art. Render outputs have immutable framing-specific filenames. Camera/lighting changes reuse the resident mesh; a geometry/crop change invalidates it.

Maintain occupancy assertions for entrances, paths, stair headroom and required clear combat space. For thin horns, chains, ribs or sculpture limbs, use the connected tube helper and check connectivity before rendering. Connectivity and counts are diagnostics, not aesthetic scores; intended hanging pieces can be separate. Explicitly author stair/door halves, slab types, fences/panes/walls and persistent leaves. Preview rendering does not simulate neighbor updates or physics.

When the user explicitly likes a feature, pin that region with `pin <id> <name-and-region.json>` before broader corrections. Pins preserve exact occupied AND empty cells through later audit changes and block delivery on regression. Unpin only when a new user request changes that feature. Fix the identified defect without unsolicited changes to approved colors, faces or proportions. Reuse unaffected components, then render the new final revision before review.

## Deliver and verify

Record specific findings only after looking at the actual images. `deliver <manifest.json> <findings.txt>` records that explicit review, commits the guarded deltas and verifies every district. It never invents approval, and it refuses unreviewed districts or stale composite context. A successful review command alone does not mean the design looks good.

Checkpoint significant revisions and before live delivery. Canonical block defaults that change the draft require new renders/review. Existing block entities are protected; creating block entities, NBT and entities is unsupported. Keep CAS checks and durable transaction IDs. After an ambiguous timeout, resume Minecraft and retry the SAME commit; do not recapture or invent IDs to hide conflicts. Interrupted jobs need guarded recovery; multi-transaction delivery can be partial. See engine.md when these occur.

Verify the actual world after commit, and again after ticks where fluid/gravity/foliage behavior matters. Preserve foreign changes when resolving mismatches. Finish when the brief is met and observed defects are resolved, or explain a concrete blocker. Report location, completed features, live verification and material limitations concisely. Use `timings` to distinguish geometry, render, transport and world work; never promise a whole-build speedup from a microbenchmark.
