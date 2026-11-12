import {
  ArmatureIcon,
  LightIcon,
  CameraGlyph,
  MeshIcon,
  BoneIcon,
  MoveIcon,
  RotateIcon,
  ScaleIcon,
} from './StudioIcons';
import { useEffect, useRef, useState } from 'react';
import { MAX_IMPORT_BLOCKS } from './import-limits';
import {
  Box,
  Mountain,
  Palette,
  Upload,
  FileImage,
  Film,
  Image,
  Check,
  AlertCircle,
  LoaderCircle,
  FolderOpen,
  ArrowUpRight,
} from 'lucide-react';
import { Modal, NumberField } from './components';
import type { ImportOptions, ImportResult } from './engine/importers';
import { readZip } from './engine/importers';
import { zip } from 'fflate';
import type { Project, SceneObject } from './model';
import { identity, uid } from './model';
import { readDataURL, saveFile } from './storage';
import type { StudioEngine } from './engine/StudioEngine';
type ImportMode = 'skin' | 'build' | 'world' | 'textures';
export function ImportDialog({
  onClose,
  onObject,
  onTextures,
  onNotice,
}: {
  onClose: () => void;
  onObject: (o: SceneObject, warnings: string[]) => void;
  onTextures: (textures: Record<string, string>) => void;
  onNotice: (s: string) => void;
}) {
  const [mode, setMode] = useState<ImportMode>('skin'),
    [file, setFile] = useState<File | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [slim, setSlim] = useState(false);
  const [options, setOptions] = useState<ImportOptions>({
    centerX: 0,
    centerZ: 0,
    radius: 0,
    minY: 0,
    maxY: 128,
  });
  const input = useRef<HTMLInputElement>(null),
    worker = useRef<Worker | null>(null);
  useEffect(() => () => worker.current?.terminate(), []);
  const changeMode = (m: ImportMode) => {
    if (busy) return;
    setMode(m);
    setFile(null);
    setError('');
  };
  const choose = (f: File | undefined) => {
    if (!f) return;
    setFile(f);
    setError('');
    const m = /r\.(-?\d+)\.(-?\d+)\.mca$/i.exec(f.name);
    if (m)
      setOptions((o) => ({
        ...o,
        centerX: Number(m[1]) * 32 + 16,
        centerZ: Number(m[2]) * 32 + 16,
      }));
  };
  const importAsset = async () => {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      if (file.size > 128 * 1024 * 1024)
        throw Error('File exceeds 128 MB. Extract a smaller schematic or a single region file.');
      if (mode === 'skin') {
        if (file.size > 1024 * 1024) throw Error('Skin image exceeds 1 MB.');
        const url = await readDataURL(file),
          img = new window.Image();
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(Error('This file is not a valid PNG skin.'));
          img.src = url;
        });
        if (
          !url.startsWith('data:image/png;') ||
          img.width !== 64 ||
          ![32, 64].includes(img.height)
        )
          throw Error('Skins must be 64×64 or 64×32 PNG images.');
        onObject(
          {
            id: uid(),
            name: file.name.replace(/\.png$/i, ''),
            type: 'character',
            visible: true,
            transform: identity(),
            skin: url,
            slim,
          },
          [],
        );
        onClose();
      } else if (mode === 'textures') {
        const files = readZip(new Uint8Array(await file.arrayBuffer()), (name) =>
          /(?:^|\/)assets\/minecraft\/textures\/block\/[^/]+\.png$/i.test(name),
        );
        const textures: Record<string, string> = {};
        let total = 0;
        for (const [name, bytes] of Object.entries(files)) {
          if (Object.keys(textures).length >= 2048)
            throw Error('Resource pack contains too many textures.');
          total += bytes.length;
          if (total > 24 * 1024 * 1024)
            throw Error('Block textures exceed 24 MB. Use a lower resolution pack.');
          const url = await readDataURL(new Blob([bytes.slice().buffer], { type: 'image/png' }));
          const img = new window.Image();
          await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = () => reject(Error(`Invalid PNG: ${name}`));
            img.src = url;
          });
          if (img.width > 1024 || img.height > 32768)
            throw Error('Resource textures may be at most 1024 pixels wide.');
          textures[name.split('/').pop()!.slice(0, -4)] = url;
        }
        if (!Object.keys(textures).length)
          throw Error(
            'No assets/minecraft/textures/block/*.png found. Choose a Java resource pack ZIP or version JAR.',
          );
        onTextures(textures);
        onNotice(
          `Loaded ${Object.keys(textures).length} block textures. Animated textures use their first frame.`,
        );
        onClose();
      } else {
        if (mode === 'world' && options.minY > options.maxY)
          throw Error('Minimum height must be below maximum height.');
        const buffer = await file.arrayBuffer(),
          w = new Worker(new URL('./engine/import.worker.ts', import.meta.url), { type: 'module' });
        worker.current = w;
        const result = await new Promise<ImportResult>((resolve, reject) => {
          w.onmessage = (e) =>
            e.data.error ? reject(Error(e.data.error)) : resolve(e.data.result);
          w.onerror = (e) => reject(Error(e.message || 'Import worker stopped.'));
          w.postMessage({ bytes: buffer, name: file.name, options }, [buffer]);
        });
        w.terminate();
        worker.current = null;
        onObject(
          {
            id: uid(),
            name: file.name.replace(/\.[^.]+$/, ''),
            type: 'build',
            visible: true,
            transform: identity(),
            voxels: result.voxels,
          },
          [
            `${result.voxels.blocks.length.toLocaleString()} blocks imported. Original origin: ${result.origin.join(', ')}.`,
            ...result.warnings,
          ],
        );
        onClose();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const types = {
    skin: '.png',
    build: '.schem,.schematic,.nbt,.litematic',
    world: '.mca,.zip',
    textures: '.zip,.jar',
  };
  return (
    <Modal
      title="Import into your scene"
      subtitle="Your files stay on this computer."
      onClose={onClose}
      wide
    >
      <div className="import-tabs">
        {(
          [
            { id: 'skin', icon: ArmatureIcon, label: 'Character' },
            { id: 'build', icon: Box, label: 'Build' },
            { id: 'world', icon: Mountain, label: 'Java world' },
            { id: 'textures', icon: Palette, label: 'Textures' },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            disabled={busy}
            className={mode === t.id ? 'selected' : ''}
            onClick={() => changeMode(t.id)}
          >
            <t.icon size={18} />
            {t.label}
          </button>
        ))}
      </div>
      <div className="modal-body">
        <p className="import-description">
          {mode === 'skin'
            ? 'Import a Minecraft skin as a fully poseable 3D character. Both classic and slim rigs include all six body parts and the outer skin layer.'
            : mode === 'build'
              ? 'Load a WorldEdit schematic, vanilla structure, or Litematica build. Solid geometry is optimized into chunks with internal faces removed.'
              : mode === 'world'
                ? 'Import a bounded area from a Java Overworld ZIP or an Anvil region file. Coordinates below are in chunks (1 chunk = 16 blocks).'
                : 'Use your own Java resource pack or Minecraft version JAR for block textures. Textures stay embedded in your project.'}
        </p>
        <input
          ref={input}
          type="file"
          accept={types[mode]}
          hidden
          onChange={(e) => choose(e.target.files?.[0])}
          aria-label="Choose import file"
        />
        <button
          className={`file-drop ${file ? 'has-file' : ''}`}
          disabled={busy}
          onClick={() => input.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (!busy) choose(e.dataTransfer.files[0]);
          }}
        >
          <div className="drop-icon">{file ? <FileImage size={24} /> : <Upload size={24} />}</div>
          <strong>{file ? file.name : 'Choose a file or drop it here'}</strong>
          <span>
            {file
              ? `${(file.size / 1024).toFixed(1)} KB · Click to choose another file`
              : types[mode].replaceAll(',', '  ·  ')}
          </span>
        </button>
        {mode === 'skin' && (
          <label className="check-row">
            <input type="checkbox" checked={slim} onChange={(e) => setSlim(e.target.checked)} />
            Slim arms (Alex model)
          </label>
        )}
        {mode === 'world' && (
          <div className="world-options">
            <div className="field-pair">
              <label>
                Center chunk X
                <NumberField
                  label="Center chunk X"
                  value={options.centerX}
                  step={1}
                  onCommit={(n) => setOptions((o) => ({ ...o, centerX: Math.round(n) }))}
                />
              </label>
              <label>
                Center chunk Z
                <NumberField
                  label="Center chunk Z"
                  value={options.centerZ}
                  step={1}
                  onCommit={(n) => setOptions((o) => ({ ...o, centerZ: Math.round(n) }))}
                />
              </label>
            </div>
            <div className="field-pair">
              <label>
                Minimum Y
                <NumberField
                  label="Minimum Y"
                  value={options.minY}
                  min={-2048}
                  max={2048}
                  step={1}
                  onCommit={(n) => setOptions((o) => ({ ...o, minY: Math.round(n) }))}
                />
              </label>
              <label>
                Maximum Y
                <NumberField
                  label="Maximum Y"
                  value={options.maxY}
                  min={-2048}
                  max={2048}
                  step={1}
                  onCommit={(n) => setOptions((o) => ({ ...o, maxY: Math.round(n) }))}
                />
              </label>
            </div>
            <label className="select-row">
              Area
              <select
                value={options.radius}
                onChange={(e) => setOptions((o) => ({ ...o, radius: Number(e.target.value) }))}
              >
                <option value={0}>1 × 1 chunk · 16 × 16 blocks</option>
                <option value={1}>3 × 3 chunks · 48 × 48 blocks</option>
                <option value={2}>5 × 5 chunks · 80 × 80 blocks</option>
              </select>
            </label>
            <p className="hint">
              Center block: {options.centerX * 16}, {options.centerZ * 16}. Limit: {MAX_IMPORT_BLOCKS.toLocaleString()} solid
              blocks. ZIP imports use the Overworld; import individual region files for other
              dimensions. LZ4-compressed chunks require conversion.
            </p>
          </div>
        )}
        {mode === 'build' && (
          <p className="hint">
            Sponge v2/v3 · MCEdit · Structure NBT · Litematica. Block shapes and textures come from
            your selected Minecraft resources. Mobs and block-entity contents are excluded.
          </p>
        )}
        {mode === 'textures' && (
          <p className="hint">
            Import texture overrides here. Use Minecraft Resources in the status bar to load a
            complete game JAR or resource pack, including models and animated textures.
          </p>
        )}
        {error && (
          <div className="error-message" role="alert">
            <AlertCircle size={16} />
            {error}
          </div>
        )}
      </div>
      <footer>
        <button className="button" onClick={onClose}>
          {busy ? 'Cancel import' : 'Cancel'}
        </button>
        <button className="button primary" disabled={!file || busy} onClick={importAsset}>
          {busy ? <LoaderCircle size={15} className="spin" /> : <Upload size={15} />}{' '}
          {busy ? 'Importing…' : 'Import asset'}
        </button>
      </footer>
    </Modal>
  );
}
export function ExportDialog({
  project,
  frame,
  engine,
  onClose,
  onNotice,
}: {
  project: Project;
  frame: number;
  engine: StudioEngine | null;
  onClose: () => void;
  onNotice: (s: string) => void;
}) {
  const [format, setFormat] = useState<'png' | 'sequence' | 'webm' | 'mp4'>('png'),
    [resolution, setResolution] = useState('1280'),
    [start, setStart] = useState(0),
    [end, setEnd] = useState(project.duration),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(0),
    [error, setError] = useState('');
  const cancel = useRef(false);
  useEffect(
    () => () => {
      cancel.current = true;
    },
    [],
  );
  const run = async () => {
    if (!engine) return;
    setBusy(true);
    setError('');
    cancel.current = false;
    setProgress(0);
    const width = Number(resolution),
      height = Math.round((width * 9) / 16),
      safeName = project.name.replace(/[^a-z0-9 _-]/gi, '').trim() || 'scene';
    try {
      let data: Uint8Array, name: string;
      if (format === 'png') {
        data = await engine.capturePNG(width, height, frame);
        name = `${safeName}-${String(frame).padStart(4, '0')}.png`;
      } else if (format === 'webm' || format === 'mp4') {
        if (end < start) throw Error('End frame must be at or after start frame.');
        if (end - start + 1 > 3600) throw Error('Export at most 3,600 video frames per batch.');
        data = await engine.captureVideo(width, height, start, end, format, {
          isCanceled: () => cancel.current,
          onProgress: setProgress,
        });
        name = `${safeName}.${format}`;
      } else {
        if (end < start) throw Error('End frame must be at or after start frame.');
        if (end - start + 1 > 600) throw Error('Export at most 600 frames per batch.');
        const files: Record<string, Uint8Array> = {};
        let size = 0;
        for (let f = start; f <= end; f++) {
          if (cancel.current) return;
          const png = await engine.capturePNG(width, height, f);
          size += png.length;
          if (size > 350 * 1024 * 1024)
            throw Error('Sequence exceeds 350 MB. Export in shorter batches.');
          files[`${safeName}_${String(f).padStart(5, '0')}.png`] = png;
          setProgress((f - start + 1) / (end - start + 1));
          await new Promise((r) => setTimeout(r, 0));
        }
        files['sequence.txt'] = new TextEncoder().encode(
          `Voxel Studio\n${project.name}\nFrames: ${start} through ${end}, inclusive\nFPS: ${project.fps}\nResolution: ${width} x ${height}\nImport the PNG sequence into your video editor at ${project.fps} fps.\n`,
        );
        data = await new Promise<Uint8Array>((resolve, reject) =>
          zip(files, { level: 0 }, (e, d) => (e ? reject(e) : resolve(d))),
        );
        name = `${safeName}-frames.zip`;
      }
      if (cancel.current) return;
      const saved = await saveFile(
        name,
        data,
        format === 'png'
          ? 'PNG image'
          : format === 'sequence'
            ? 'PNG frame sequence'
            : `${format.toUpperCase()} video`,
      );
      if (saved) {
        onNotice(`Exported ${name}`);
        onClose();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title="Export your scene"
      subtitle="Frame-accurate renders with camera cuts and scene lighting."
      onClose={() => {
        cancel.current = true;
        onClose();
      }}
    >
      <div className="modal-body">
        <div className="export-formats">
          <button
            className={format === 'png' ? 'selected' : ''}
            disabled={busy}
            onClick={() => setFormat('png')}
          >
            <Image size={23} />
            <strong>Still image</strong>
            <span>PNG · current frame</span>
          </button>
          <button
            className={format === 'sequence' ? 'selected' : ''}
            disabled={busy}
            onClick={() => setFormat('sequence')}
          >
            <Film size={23} />
            <strong>Animation</strong>
            <span>PNG sequence · ZIP</span>
          </button>
        </div>
        <label className="select-row">
          Output
          <select
            aria-label="Export format"
            disabled={busy}
            value={format}
            onChange={(e) => setFormat(e.target.value as typeof format)}
          >
            <option value="png">PNG still image</option>
            <option value="sequence">PNG sequence ZIP</option>
            <option value="webm">WebM video · VP9 / VP8</option>
            <option value="mp4">MP4 video · H.264</option>
          </select>
        </label>
        <label className="select-row">
          Resolution
          <select
            disabled={busy}
            value={resolution}
            onChange={(e) => setResolution(e.target.value)}
          >
            <option value="640">640 × 360 · Preview</option>
            <option value="1280">1280 × 720 · HD</option>
            <option value="1920">1920 × 1080 · Full HD</option>
            <option value="2560">2560 × 1440 · QHD</option>
            <option value="3840">3840 × 2160 · 4K</option>
          </select>
        </label>
        {format !== 'png' ? (
          <>
            <div className="field-pair">
              <label>
                Start frame
                <NumberField
                  label="Export start frame"
                  value={start}
                  min={0}
                  max={project.duration}
                  step={1}
                  onCommit={(n) => setStart(Math.round(n))}
                />
              </label>
              <label>
                End frame
                <NumberField
                  label="Export end frame"
                  value={end}
                  min={0}
                  max={project.duration}
                  step={1}
                  onCommit={(n) => setEnd(Math.round(n))}
                />
              </label>
            </div>
            <p className="hint">
              {end - start + 1} frames · {((end - start + 1) / project.fps).toFixed(2)} seconds at{' '}
              {project.fps} fps. Lossless frames are rendered individually, independent of playback
              speed.{' '}
              {format === 'sequence'
                ? 'Import the sequence into a video editor to encode it.'
                : 'Video is encoded locally with your camera sequence and effects.'}
            </p>
          </>
        ) : (
          <p className="hint">
            Frame {frame} · Lighting, shadows and your selected quality settings are applied. Grid
            and editor overlays are excluded.
          </p>
        )}
        <div className="export-note">
          <Check size={16} />
          Local render · no uploads · no watermark
        </div>
        {busy && (
          <div className="progress">
            <div style={{ width: `${Math.max(3, progress * 100)}%` }} />
            <span>
              {format === 'sequence'
                ? `Rendering ${Math.round(progress * 100)}%`
                : `Rendering image… ${Math.round(progress * 100)}%`}
            </span>
          </div>
        )}
        {error && (
          <div className="error-message" role="alert">
            <AlertCircle size={16} />
            {error}
          </div>
        )}
      </div>
      <footer>
        <button
          className="button"
          onClick={() => {
            cancel.current = true;
            onClose();
          }}
        >
          {busy ? 'Cancel render' : 'Cancel'}
        </button>
        <button className="button primary" disabled={busy || !engine} onClick={run}>
          {busy ? <LoaderCircle size={15} className="spin" /> : <ArrowUpRight size={15} />}{' '}
          {busy ? 'Rendering…' : 'Export'}
        </button>
      </footer>
    </Modal>
  );
}
export function HelpDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Quick Start" subtitle="Stage. Pose. Animate. Render." onClose={onClose} wide>
      <div className="modal-body help-body">
        <div>
          <h3>01 · Build your scene</h3>
          <p>
            Use Import for your skins, schematics and Java worlds. Add characters, blocks, cameras
            and lights from the Add menu. The starter woodland is fully editable.
          </p>
          <h3>02 · Pose and animate</h3>
          <p>
            Select a character, then select a bone in the scene list. Rotate the gizmo or enter
            degrees in the inspector. Press I to insert a key at the playhead. Move to another
            frame, change the pose, and insert another key. Edits on existing animated tracks update
            the current frame automatically.
          </p>
          <h3>03 · Light and export</h3>
          <p>
            Open Lighting to adjust the sun, sky fill, exposure and fog. Position a camera with
            “Camera from view”, then preview it with Numpad 0. Export PNG stills or lossless
            animation sequences.
          </p>
          <h3>Performance</h3>
          <p>
            Balanced caps viewport resolution and uses 1024px sun shadows. Draft uses 512px shadows
            and 1× resolution. Large builds use chunk meshes with hidden faces removed. The viewport
            stops rendering while idle. Scene size and your GPU still determine performance.
          </p>
        </div>
        <div className="shortcut-list">
          {[
            ['Orbit', 'Left drag'],
            ['Pan', 'Right drag'],
            ['Zoom', 'Scroll'],
            ['Move / Rotate / Scale', 'G / R / S'],
            ['Frame selection', 'F'],
            ['Frame all', 'Home'],
            ['Play / Pause', 'Space'],
            ['Insert keyframe', 'I'],
            ['Key full character pose', 'Shift I'],
            ['Step frame', '← / →'],
            ['Delete object / selected key', 'Delete'],
            ['Save / Open', 'Ctrl S / O'],
            ['Undo / Redo', 'Ctrl Z / Shift Z'],
            ['Camera preview', 'Numpad 0'],
            ['Toggle fly navigation', 'V'],
            ['Fly / change altitude / boost', 'WASD / Q E / Shift'],
            ['Bring selected object to view', 'Shift T'],
            ['Select separate movement control', 'M'],
            ['Draw a character path', 'P'],
            ['Block placement / new block build', 'B / Shift B'],
            ['Capture camera view', 'K'],
          ].map(([label, key]) => (
            <div key={label}>
              <span>{label}</span>
              <kbd>{key}</kbd>
            </div>
          ))}
        </div>
      </div>
      <footer>
        <button className="button primary" onClick={onClose}>
          Back to workspace
        </button>
      </footer>
    </Modal>
  );
}
