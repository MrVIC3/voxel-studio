# Voxel Build efficiency update

The local engine and installed Minecraft builder skill now use coordinated manifests, reusable exact voxel geometry, atomic source-checkpoint staging, unchanged-draft detection, immutable render outputs and contact sheets, one resident GPU mesh and one composed snapshot cache. Pins preserve explicitly approved details, including surrounding empty cells. Composite review becomes stale when any included district changes. Durable CAS transactions, live verification and actual agent image inspection remain required. No second model or paid generation API is introduced.

Measured on 2026-10-26T18:55:56.470Z in this workspace:

| Operation | Before / first render | Updated / cached | Evidence |
| --- | --- | --- | --- |
| compile saved 58,827-block arena district | 84.15 ms | 51.16 ms (1.64x) | 9 alternating measurements; identical output |
| unpack saved 58,827-block arena district | 46.46 ms | 25.79 ms (1.8x) | 9 alternating measurements; identical output |
| Repeat full-arena perspective, 307,184 blocks | 5839 ms cache-disabled median | 822 ms cached median (7.10x) | 3 alternating pairs; pixel-identical PNGs |

These measurements are specific operations. They do not establish a 50-minute-to-N-minute whole-build improvement or a measured token-cost reduction. Agent design and judgment still take time. Avoiding bespoke orchestration, per-block model output, unnecessary regeneration, full-scene remeshing and repeated large context reads is intended to reduce that time and token use.

Use `prepare <manifest>` for coordinated staging/audit/render, open its actual images, then `deliver <manifest> <observed-findings.txt>` for reviewed placement and verification. Manifests resolve paths relative to their own file. No automatic aesthetic score or generated approval substitutes for image inspection. Reuse authored components while adapting composition and end conditions to the request.

Verification: 24 engine/geometry/manifest/mock-bridge tests pass, including interrupted submissions, external edits, source-stage atomicity, pin regressions, stale composite reviews and full manifest delivery. Real Electron smoke tests validate actual Minecraft assets, contact sheets, identical cached PNGs and invalidation on crop. Benchmarks run offline from saved snapshots and do not modify Minecraft. Detailed machine results are in test-results/builder-performance/. The installed skills are checked by builder/check-skill.cjs. The optional upstream Python skill checker could not start because its runtime lacks PyYAML.
