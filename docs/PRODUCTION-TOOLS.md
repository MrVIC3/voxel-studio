# Production tools — 0.3

- **Graph Editor:** select it in the animation editor selector. Choose a position, rotation or scale channel and a key. Edit its value, choose an easing preset, or drag the two segment handles. Each channel can have an independent Bézier curve, including anticipation and overshoot.
- **Dope Sheet:** Shift-click keys for multiple selection and drag them together. Ctrl A selects the current track's keys while the timeline is focused. Copy/Paste buttons and Ctrl C / Ctrl V duplicate keys at the playhead. Group moves reject collisions with unselected keys.
- **Motion Library:** apply Walk, Run, Jump, Sword Slash or Wave at the playhead. Set cycles, speed and travel. Capture existing character animation into the project library and apply it to another character. Operations produce ordinary editable keys; they are not a nonlinear clip mixer.
- **Pose tools:** Mirror Pose and Key Full Pose operate across the rig.
- **Rigging:** the original skin is split into upper/lower limbs, with hand and foot pivots. Create hand/foot controls in Inverse Kinematics, then move or animate those controls. Disable IK to return to bone animation. Existing six-bone projects retain their upper-limb motion. The solver assumes ordinary limb lengths; non-uniformly scaled rigs may need manual adjustment.
- **Parenting:** use Parent & Attachment to attach props to groups, objects or bones. Held items normally attach to a hand. Transforms and animation keys are local to the parent. Parenting preserves the current static transform; existing animation keys retain their local values. Deleting a parent also removes descendants and their tracks.
- **Minecraft Items:** Add → Minecraft Item creates a 3D extrusion from the original item sprite. Pick another item in Properties and attach it to a hand.
- **Effects:** Add → Particle Effect offers impact sparks, embers, shockwave rings and vortices. Set the frame interval, seed, particle count, color, size and motion. Seeking and exported frames use the same deterministic particle state. Bloom adds glow in Balanced and High quality.
- **Shots:** choose a camera and add a cut at the playhead. Cuts appear in the Dope Sheet and drive both preview and export. Camera target tracking follows an object or bone. The Shots workspace also controls the playback range and soundtrack.
- **Audio and video:** import WAV/MP3/OGG/M4A audio, set its offset and volume, then export WebM or MP4 directly. Every frame is evaluated and encoded at project FPS, regardless of rendering speed. Audio is embedded in the project and aligned to the exported range. Encoder availability depends on the device. PNG sequence export remains available.
- **Command Search:** F3 or Ctrl K searches actions. Use arrows and Enter. Shift D duplicates the selection.
- **Precision fields:** arithmetic such as `90/2` is accepted. Arrow keys adjust values; Shift increases the step, Alt decreases it. Leaving an unchanged field does not add an undo entry.

The interface remains monochrome. Particle and Minecraft texture colors belong to the scene. Advanced controls are grouped in collapsible property sections.
