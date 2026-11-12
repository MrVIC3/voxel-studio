# Release verification — 0.3.0

Verified on Windows x64, 24 October 2026.

- Production TypeScript/Vite build and portable Windows packaging succeeded. The executable reports version 0.3.0.
- All **34 automated tests** passed, including original imports, byte-identical game textures, model geometry, animation curves, batch key editing, motion retargeting, parenting, camera cuts, deterministic effects and two-bone IK.
- A regression test verifies that asynchronous skin loading retains the body's rest height and neutral feet remain at the character origin. The defect was discovered and corrected during cinematic production.
- The final packaged executable passed **13 new production workflow checks** with no page/renderer errors: command search; run-cycle generation; editable Bézier curves; hand attachments; locks; native project saving; hand IK; extruded Minecraft item props; vortex effects; tracked camera cuts; imported audio; decodable WebM with audio; and MP4/H.264 with AAC on this PC.
- The original 13 desktop workflow checks were run against the final packaged executable to check posing, playback, imports, saving/reopening, PNG export, frame sequences and a 110,592-block stress import. Machine-readable results are in test-results/smoke-results.json.
- Minecraft Java 1.21.11 supplies 3,517 original PNG resources, 2,390 model definitions and 1,168 block-state definitions. All loaded PNG hashes match their source archive entries. Special Minecraft renderer behavior still has the limitations documented in README.md.

## Cinematic production

**Ember Gate** is a complete 18-second sequence created from the editor's own scene format and exported through its real video exporter in a hidden Electron window. Desktop automation did not move the physical mouse.

- 432 frames at 24 FPS, 9 camera cuts, 56 scene objects, 4,292 blocks, 63 animation tracks and 6,695 keys.
- Two segmented Minecraft skin rigs, an IK guard hand, parented diamond/netherite swords, a ruined temple, animated flames, portal particles, timed sparks, an aerial attack, a shockwave and block debris.
- Original locally synthesized stereo soundtrack with timed percussion, whooshes and impacts.
- Selected PNG frames were inspected before the complete render. A blocked close-up and the asynchronous rig offset were corrected, and the film was rendered again.
- MP4 verified at 1280×720 with H.264 video and AAC audio, approximately 18.005 seconds including codec padding. WebM was exported separately from the same project. See showcase/movie-verification.json and showcase/render-report.json.
- The editable project, score, selected stills and both videos are in the workspace's showcase folder. The project embeds its character skins; remaining block/item resources are referenced from the installed Java version.

## Boundaries and performance

The renderer uses WebGL2 raster PBR, environment lighting, optional GTAO/bloom, filmic tone mapping and raster shadows. Area lights do not cast raster shadow maps. The showcase reported approximately 38,000 rendered triangles and 457 draw calls in High quality; this is scene integration evidence, not a low-end GPU FPS guarantee.

No general mesh modeler, physics engine, path tracer, nonlinear clip mixer or complete Minecraft special-renderer implementation is included. Two-bone IK assumes ordinary limb proportions. Parent changes preserve the current static transform; existing animation keys keep local coordinates. MP4/AAC encoding depends on device support. Resource-pack layering, multi-object editing and broader hardware profiling remain future work.

Mediabunny's unmodified source and MPL-2.0 license are included beside the portable executable under third-party-sources/mediabunny. Existing runtime/dependency notices are retained. See PRODUCTION-TOOLS.md and DEVELOPMENT-PLAN.md for usage and scope.
