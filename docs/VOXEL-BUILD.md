# Voxel Build

Voxel Build is a separate, local Minecraft building engine for Codex. It renders world snapshots with your installed Minecraft textures and models. Codex creates the architecture, reviews PNGs and slices, corrects defects and commits checked edits through the Fabric bridge. The engine contains no AI model, API subscription, inference service or background agent. The animation editor remains separate.

## First setup

1. Use **Minecraft Java 1.21.11 with Fabric Loader 0.18.4 or newer**. Install Fabric through your launcher or the [official Fabric installer](https://fabricmc.net/use/installer/).
2. Close that Minecraft instance and run **Install Voxel Build Mod.cmd**, giving it the instance's game folder. It copies the bridge from `release/VoxelBuild/mods` and adds Fabric API only if none is installed. A compatible existing Fabric API is preserved based on its mod metadata, regardless of its filename or patch version. Alternatively copy both JARs there into the instance's `mods` folder yourself. For Modrinth/Prism, use that instance's folder, not an unrelated `.minecraft` directory. The installer refuses an API for a different Minecraft version or duplicate API mods instead of removing existing mods.
3. The Codex skill source is `skills/minecraft-builder`. `npm run builder:install-skill` registers it in this workspace and in your Codex skills folder. Start a new Codex task after installation if it has not appeared in discovery yet; in this workspace `AGENTS.md` also directs building requests to the skill.
4. Open your Minecraft world and use **F3+P** to disable pause on lost focus, so it keeps running while you type in Codex. Keep it out of the Escape pause menu and double-click **Start Voxel Build.cmd**. Codex can also start it through the skill. The renderer runs hidden; no animation UI is involved. The portable engine is `release/VoxelBuild-win32-x64/VoxelBuild.exe`; keep its folder intact.
5. Prompt Codex with a location and a brief. For example: **“Use $minecraft-builder to build a detailed medieval riverside inn near X 120, Y 64, Z -80 in my connected world. Plan the rooms, inspect all sides and interiors, fix mistakes, and verify it in Minecraft.”**

Codex connects to the actual instance's `config/voxel-build.json` and captures the chosen area. You can simply give the style and purpose and let Codex use the player's position to survey a site. Existing unrelated structures should be preserved. On a multiplayer server, the bridge must run on the logical server; a client-only installation cannot edit somebody else's server.

The mod listens only on `127.0.0.1:25578`, authenticates with a generated token and blocks browser-origin requests. Tokens stay in local files. Set `enabled=false` in its config and reopen the world to disable the bridge. It exposes bounded block-state operations, not Minecraft commands, shell execution or arbitrary NBT.

## Quality and efficiency

The skill requires site-aware planning, a dimensioned footprint, a material hierarchy, coherent structural motifs, usable circulation, staged checkpoints and actual visual inspection. It calls out roof joins, wall depth, repeated-module end conditions, random surface noise, blocked openings, unsupported masses and neglected rear elevations. Complex work uses durable local notes and a defect ledger.

Codex emits compact declarative plans using fill, shell, line, cylinder, ellipsoid and repeated/rotated components. Coordinates and state transforms are deterministic. It inspects summaries, targeted slices and image files instead of spending tokens on thousands of block-placement calls. Rendering happens on demand and stops while idle. Completed transaction payloads stay in disk journals instead of accumulating in the game heap, and the app keeps compact receipt metadata in active projects. There is no arbitrary iteration cap in the skill; corrections continue until the brief and observed defects are addressed.

Quality is not guaranteed by block count or an automated score. Codex must open the rendered images, judge the architecture and record specific review findings. The engine requires current perspective/top/elevation images and passing occupancy assertions before applying edits, but a review receipt alone cannot prove aesthetic quality. A small watch-house fixture under `builder/examples` demonstrates the workflow; it is not an automatic template for every request.

## Applying and correcting builds

Minecraft validates and supplies defaults for block states. Live staging uses those canonical states before review. Edits check the captured expected block before changing it. Transactions persist journals before application and run within a per-tick work budget. Interrupted work is retried using the same ID; crashes can require guarded rollback recovery. Undo affects the last transaction, and refuses to overwrite unrelated later changes. Large builds use multiple transactions and may be partly applied if one fails; whole-build atomicity is not provided.

The skill verifies the committed world against the expected result and checks again after ticks where physics matters. Captures are tiled, not globally atomic, so keep the surveyed site quiet. The work area limit is 500,000 cells including air; use coordinated projects for larger districts. Transactions are at most 8192 changed cells over 64 chunks. State parsing, chunk generation/loading, snapshot reads, journal writes and world saves can still briefly stall Minecraft despite the 4ms/1024-step application budget.

## Current boundaries

This release targets vanilla block states in Java 1.21.11. Existing block entities and their contents are protected. Creating/removing block-entity blocks, entities, sign text, inventories and custom NBT is not supported. This includes common decorative/functional blocks such as chests, signs and beds. Supported ordinary blocks still allow detailed architecture; Codex must disclose limitations relevant to your request rather than inventing support.

The preview reuses the existing Minecraft model renderer. Biome tint uses the existing plains approximation; fluids, some hardcoded entity geometry, light levels and resource-pack merging are simplified or unsupported. It does not simulate redstone, fluid flow, gravity or spawn safety. Strict placement suppresses neighbor cascades, so Codex must explicitly set stairs, door halves, pane/fence/wall connections and persistent leaves. Final behavior and appearance belong to Minecraft, and live verification is part of delivery.

No worlds in your Minecraft installation were changed by development testing. Real bridge integration tests use an isolated Fabric GameTest world. The engine and skill are usable once the bridge is installed in the intended instance.

## Development and checks

```
npm run builder:build
npm run builder:test
npm run builder:smoke
npm run builder:mod
npm run builder:mod -- -GameTests
npm run builder:package
npm run builder:check-skill
```

The mod build downloads Gradle 9.2.1 from the official distribution service, verifies SHA-256, and uses Java 21. The opt-in GameTest suite uses a separate test world and does not accept the Minecraft EULA on your behalf. Portable packaging reuses the installed Electron runtime and preserves the portable data folder. Node 22+ is needed for development/CLI; it is already available on this PC. The standalone renderer includes its runtime.

Use `node builder/cli.mjs help` for commands. The skill's `references/engine.md` documents the protocol and plan format. Runtime data goes in `builder-data`, or `VOXEL_BUILD_DATA`; portable launches directly use `builder-data` beside the executable, while the workspace launcher supplies the workspace data path. Set `VOXEL_BUILD_ASSETS` to a vanilla 1.21.11 client JAR if it is not installed under the standard launcher path.

See [verification](VOXEL-BUILD-VERIFICATION.md) for checks performed and the [preview](voxel-build-preview.png) for an actual engine render. Fabric API is redistributed under its Apache 2.0 license, retained inside its JAR. Minecraft assets are read from your installation and are not redistributed.

## Efficient coordinated builds

The installed skill now prefers a single manifest for district staging, audit and composite review. Prepared reports include labeled contact sheets and full-resolution PNGs. Repeated camera/light views reuse the mesh and composed snapshot; geometry or crop changes invalidate them. Explicit pins protect user-approved features during corrections. After opening the actual images, Codex records its findings and delivers guarded edits with verification. See [the performance update](VOXEL-BUILD-PERFORMANCE.md) for measured operation timings and their limits. No new Minecraft mod installation is required for these engine/skill improvements.
