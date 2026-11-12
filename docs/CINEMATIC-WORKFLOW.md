# Cinematic workflow

## Animate a character

1. Select the character in the Outliner and open **Motion Library**. Choose **Blender Presets** for one of the 21 bundled actions, or **Import Blender** for a local file.
2. Select an action and add it to the project library. Set the playhead, cycle count, speed and travel, then choose **Apply at Playhead**. Applying writes body and face keys over the action interval on the affected tracks. Undo restores the previous animation.
3. Open **Facial Performance** to key gaze, eyelids, brows, smile and jaw independently. The circle markers in the Dope Sheet jump to that frame and open the face controls. Adjust the eye row and spacing for a custom skin.
4. Filter the Dope Sheet by track name, animation or selected character. Shift-drag a box around keys, Shift-click to toggle individual keys, and drag a selected key to move the group. A move or paste that overlaps a different key is rejected. Use Ctrl-scroll to zoom around the cursor. **[** and **]** set the playback range. When many baked keys fit in a few pixels, zoom in to see individual markers.

The included [Blender project](blender/voxel-studio-motion-library.blend) is editable. See the [Blender guide](blender/README.md) and the [facial controls guide](FACIAL-PERFORMANCE.md) for mapping and file support.

## Place a camera

1. Open **Shots**. Frame the view with the viewport orbit controls, or choose **Fly View**. Fly with **WASD**, use **Q/E** for height, hold **Shift** to boost, right-drag to look, and scroll to change speed.
2. Set **View Lens** and press **K**. Move to another frame, compose the second view and press **K** again. A waypoint stores position, orientation and field of view.
3. Select the camera to see its path. Click a waypoint to jump to it and recall the view. **Smooth Rail** eases the path through the waypoints and interpolates orientation along the shortest 3D rotation. **Linear Rail** connects positions directly. Set a key to **Constant** in the Graph Editor for a hold. A camera with a tracking target aims at that target during playback.
4. For a starting move, select a subject, choose **Orbit**, **Push In**, **Rise & Reveal**, or **Side Tracking**, and choose **Build Camera Move**. This creates a camera, five editable keys and a cut at the playhead. Use **Cut Here** to switch to an existing camera.

## Light and render

1. Select the actor or build and open **Lighting**. Apply a cinematic look to position a rig around the subject. Edit the generated area lights in the Outliner.
2. Refine the haze, shadowed sun shafts, bloom, tone and grain. Use **Focus selected subject** for tracked depth of field, or set a fixed distance. Use Draft for staging, Balanced for look development, or High for more expensive effects.
3. Preview the cut and export a PNG, PNG sequence, MP4 or WebM. Preview and export share the same camera and lighting evaluation. The renderer uses WebGL2 rasterization and screen-space lens effects. Draft simplifies the atmosphere and disables cinematic blur and shafts. Performance depends on the scene, output size, and hardware.

**The Gatekeeper** is an editable seven-second demonstration in the workspace's `showcase/` folder. It uses the original Ember Gate set with four new camera rails, a reworked Blue Hour look, and four retargeted Blender actions.
