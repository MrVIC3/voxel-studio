# Facial performance

Open the **Face** workspace and choose an actor. Turn on **Animate eyes and expressions** to fit a facial rig over the skin. The original PNG is kept intact. The isolated 3D preview uses the actor’s skin and facial rig. Drag to orbit or choose Front, Three-quarter, or Profile.

- **Automatic blinks and gaze** gives a character brief blinks and subtle changes in eye direction when it has no face keys. It follows scene time, so an exported frame matches the same frame in preview.
- Drag the **Gaze** pad to aim both eyes, or focus it and use the arrow keys. Use **Expression** to adjust gaze precisely and edit blink, brows, mouth curve, and jaw.
- Use **Insert Key** or press **I**, then scrub the dedicated face timeline and make the next pose. Once a face has keys, pose changes write a key at the playhead. Copy a pose and paste it as a key on any actor. **Move key** retimes it, and **Face key easing** controls the transition to the next key.
- In the scene Dope Sheet, click a round facial marker to open the Face workspace at that frame. Both timelines use the same scene playhead and face tracks.
- **Cinematic 3D** uses separate eye whites, irises, pupils, catchlights, eyelids, brows, lips, teeth and tongue. **Classic pixels** keeps the flat style. Existing projects keep their chosen style.
- **Eye Dimensions** sets exact width, height, depth, offsets, tilt and gaze travel. Edit **Both eyes**, **Left eye**, or **Right eye**. Iris and pupil have their own dimensions. Lids have independent width, height and depth. The renderer keeps the visible iris and pupil within the opening as the lids close.
- Use **Fit to Skin** for eye row, spacing, iris color, brow and mouth sizing. Use **Face Layers** to isolate the features you want to edit or hide headwear.
- In **Layout → Character Layers**, adjust visibility and thickness for the base skin, headwear, jacket, sleeves, trousers and equipped armor. Each shell follows the same pose and connected joints.

Imported motion clips can include facial curves. A clip with facial keys controls the exact expression rather than adding procedural blinks on top. For Blender interchange, the recognized shape-key names are `VoxelLookX`, `VoxelLookY`, `VoxelBlink`, `VoxelBrow`, `VoxelSmile`, and `VoxelJaw`. Look, brow, and smile are signed controls; blink and jaw range from 0 to 1.

To verify the UI and renderer after building the desktop app, run `node scripts/face-smoke.cjs`. It uses a hidden window and a separate test profile, then saves a two-key blink project and renders the open and closed eyes through PNG export.
