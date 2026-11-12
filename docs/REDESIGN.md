# Interface and renderer revision — 0.2

User direction: black and white, restrained icons, functional DCC workspace similar to Blender. Replace the green interface and asset cards completely.

Layout: compact text application menus; conventional Layout / Animation / Lighting workspace tabs; viewport on the left, outliner above Properties in a resizable right dock; full-width Dope Sheet at the bottom. Add commands move into a text menu. The viewport has small monochrome move/rotate/scale tools. Inputs are compact numerical rows, property groups use understated separators, and selection uses neutral gray with white text. No decorative cards, green accents, welcome marketing copy, or rounded avatar badges.

Palette: #101010 background, #191919 panels, #222222 headers, #303030 controls, #3b3b3b dividers, #eeeeee primary text, #999999 secondary text. 11px system typography, 2px control corners. Standard mesh, armature, camera and light glyphs use a common 16px grid.

Minecraft assets: discover installed Java version JARs through a narrow desktop bridge. Decode texture PNGs, inherited block models and block-state variants/multipart definitions in a worker. Preserve the source version and show missing-resource coverage. Regular models, slabs, stairs, fences, crossed plants and cutout materials use their game definitions. Game resources remain local and are not redistributed inside the portable application.

Rendering: PBR materials with original albedo textures, alpha cutout/transmission, biome tint defaults, environment illumination, sun, point/spot/area lights. Add quality-scaled contact occlusion, soft shadow controls, optional restrained bloom, and selectable AgX/ACES tone mapping. The same pipeline must render viewport and exported PNGs. Draft disables expensive effects; rendering remains demand-driven.

Verification: asset-pixel identity tests against the installed JAR, inherited texture and variant tests, transparent/cutout material checks, desktop interaction and saved-project compatibility checks, clean image exports, updated UI screenshots and portable Windows package.
