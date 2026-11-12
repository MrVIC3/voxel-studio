# Ember Gate — production plan

An original 18-second Minecraft action sequence, 432 frames at 24 FPS. Made with Voxel Studio's native scene objects and keyframe evaluation, then exported through its actual video exporter. No desktop pointer control.

1. Frames 0–71: move through a ruined forest temple toward a glowing portal; the hero approaches with a diamond sword.
2. Frames 72–119: a close camera introduces the hero and the opposing swordsman. Hand controls and segmented limbs establish a guarded pose.
3. Frames 120–215: a three-beat sword exchange. Camera cuts preserve screen direction; each clash triggers timed sparks and a synchronized impact.
4. Frames 216–287: retreat, an arcing leap and a turning attack. A wider moving camera shows the full body animation and the environment.
5. Frames 288–359: the portal charges into a vortex and a shockwave. The finishing strike throws block debris and knocks the opponent away.
6. Frames 360–431: the effects settle; hold a clean final hero composition while the camera eases toward the temple.

Lighting: cool environment and moonlight, warm braziers, a colored portal key light, restrained bloom and contact occlusion. Use original Java textures and stock game skins from the installed JAR. Soundtrack: locally synthesized original pulse, percussion, wind and timed impacts; no external music.

Deliver the editable `.voxel` project, the exported video, selected stills and production notes. Inspect stills from the actual exporter before rendering the full sequence; fix framing, silhouettes and lighting problems found in those images. The final showcase doubles as a stress test of camera cuts, Bézier motion, segmented rigs, IK, parented item props, world geometry, transparency, deterministic particles and synchronized audio.
