# Architectural quality implementation

Installed in the local engine and both Minecraft builder skill locations.

Implemented: architectural design compilation; named component roles and persisted per-cell ownership; explicit cross-component replacements; transformed clearance volumes, socket coincidences and attachment support checks; five dimension-constrained assemblies (recessed masonry bay, gateway, gable roof, stair and buttress); declared path diagnostics on known full-block floors; revision-bound structured image evidence; structure-focused framing; and local reference side-by-side/overlay comparison with manual normalized landmarks. Existing CAS/receipt/recovery protections remain in force.

The offline castle example has 21 named components, recessed masonry, a framed timber gable, hollow stair-block roof, tower ladders, a furnished beamed hall and a declared gate-to-hall route. Its compile checks detected a real sill obstruction during development. Visual inspection led to deeper tower facade assemblies after the first draft remained flat. The example is a tooling prototype, not proof of universal professional design quality.

Verification: 31 unit/integration/regression tests pass. The packaged Electron app compiled the example and rendered overview, close-up, player-eye interior and section images with no missing assets; a generic review was rejected. The castle prototype was rendered offline and no Minecraft blocks were edited during this upgrade.

Limits: path checks are conservative declared grid paths, not general collision-aware movement; attachments only check occupied support cells, not every Minecraft support rule. Assemblies cover a narrow starter library. Landmark correspondences and camera alignment remain manual. Structured evidence requires actual agent inspection and cannot certify taste or truthful critique. Neutral/depth passes, broad style coverage and independent quality evaluation remain future work.

Use the installed skill references/architecture.md for the exact schema. CLI: design <id> <design.json>, compare <comparison.json>; manifests accept per-project design. Rendering accepts overview/detail/interior/section/reference labels. Architectural review expects a JSON assessment citing current receipt UUIDs.

Preview: [castle](architectural-castle-preview.png), [interior](architectural-castle-interior.png).

## Spatial and reference correction update

Corrected unequal tower heights, half-block window-pair misalignment, an incorrectly positioned side buttress, asymmetric crenellations/ladders/planting, floating wall-walk crenels, and glazing that had opaque gable material directly behind it. The prototype now declares whole-build bilateral state symmetry and face-connected geometry. Six window recess profiles enforce explicit air/glass depth samples. Symmetric reviews require all four elevations and top.

Added local camera fitting from at least six manually observed image/world landmark correspondences, residual reporting, tolerance rejection, source-image hash binding and calibrated reference rendering. A fit validates viewpoint alignment, not the architectural reconstruction itself. Automatic landmark discovery and general real-image fidelity are unproven.

Validation: 35 tests pass; 6/6 construction regression cases pass (one valid baseline plus five deliberate failures). The packaged app compiled and rendered the corrected prototype with all elevations, detail, interior and section evidence. Model weights have not been trained. No world blocks were changed by this upgrade.
