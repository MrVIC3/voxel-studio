import { useMemo, useRef, useState } from 'react';
import { Download, Film, Upload } from 'lucide-react';
import { Modal, NumberField } from './components';
import { parseGltfMotion } from './blender/gltf';
import type { GltfSource } from './blender/gltf';
import { loadBlenderLibrarySource } from './blender/library';
import { bakeMotionAction, listMotionRigs, motionActionNames } from './blender/retarget';
import type { ImportedMotion, JointMapping, Target } from './blender/retarget';
import { boneLabels, bones } from './model';
import './blender/motion-panel.css';

type BakeMode = 'ACTIONS' | 'NLA_TRACKS' | 'SCENE';
type DesktopBlender = {
  bakeBlenderMotion?: (data: Uint8Array, mode?: BakeMode) => Promise<Uint8Array>;
};
type Props = { fps: number; capacity: number; onImport: (clips: ImportedMotion[]) => void };

export function BlenderMotionPanel({ fps, capacity, onImport }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const serial = useRef(0);
  const [open, setOpen] = useState(false);
  const [blendFile, setBlendFile] = useState<File>();
  const [bakeMode, setBakeMode] = useState<BakeMode | ''>('');
  const [title, setTitle] = useState('Blender Animation');
  const [source, setSource] = useState<GltfSource>();
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [rig, setRig] = useState(0);
  const [turn, setTurn] = useState<0 | 90 | 180 | 270>(0);
  const [scale, setScale] = useState(1);
  const [inPlace, setInPlace] = useState(false);
  const [mapping, setMapping] = useState<JointMapping>({});
  const [control, setControl] = useState<Target>('body');
  const [jointSearch, setJointSearch] = useState('');
  const [actionSearch, setActionSearch] = useState('');
  const [selected, setSelected] = useState<number[]>([]);
  const rigs = useMemo(() => (source ? listMotionRigs(source) : []), [source]);
  const actions = useMemo(() => (source ? motionActionNames(source) : []), [source]);
  const visibleActions = actions.filter((action) =>
    action.name.toLowerCase().includes(actionSearch.trim().toLowerCase()),
  );
  const mappedJoint = mapping[control];
  const candidateJoints = useMemo(() => {
    if (!source) return [];
    const needle = jointSearch.trim().toLowerCase();
    const nodes = source.document.nodes;
    const matches = nodes
      .flatMap((node, index) =>
        index !== mappedJoint &&
        typeof node.name === 'string' &&
        node.name.toLowerCase().includes(needle)
          ? [index]
          : [],
      )
      .slice(0, 256);
    if (typeof mappedJoint === 'number') matches.unshift(mappedJoint);
    return matches;
  }, [source, jointSearch, mappedJoint]);
  const close = () => {
    serial.current++;
    setOpen(false);
    setBusy('');
    setBlendFile(undefined);
  };

  const prepare = async (
    name: string,
    label: string,
    task: () => Promise<GltfSource>,
    retryFile?: File,
  ) => {
    const request = ++serial.current;
    setOpen(true);
    setSource(undefined);
    setBlendFile(undefined);
    setBusy(label);
    setError('');
    setTitle(name);
    setSelected([]);
    setActionSearch('');
    setRig(0);
    setTurn(0);
    setScale(1);
    setInPlace(false);
    setMapping({});
    setJointSearch('');
    try {
      const value = await task();
      if (request !== serial.current) return;
      setSource(value);
      setSelected(value.document.animations.length === 1 ? [0] : []);
    } catch (e) {
      if (request === serial.current) {
        setError(e instanceof Error ? e.message : 'Could not load the animation.');
        setBlendFile(retryFile);
      }
    } finally {
      if (request === serial.current) setBusy('');
    }
  };
  const bakeBlend = (file: File) => {
    void prepare(
      'Import Blender Animation',
      'Baking animation in Blender…',
      async () => {
        const desktop = (window as Window & { desktop?: DesktopBlender }).desktop;
        if (!desktop?.bakeBlenderMotion)
          throw Error(
            'Direct .blend import needs the Voxel Studio desktop app and a local Blender installation. You can also export a GLB with animations from Blender.',
          );
        const exported = await desktop.bakeBlenderMotion(
          new Uint8Array(await file.arrayBuffer()),
          bakeMode || undefined,
        );
        return parseGltfMotion(new Uint8Array(exported));
      },
      file,
    );
  };
  const importFiles = (files: File[]) => {
    const projects = files.filter((f) => /\.(blend|glb|gltf)$/i.test(f.name));
    if (!files.length) return;
    if (
      projects.length === 1 &&
      /\.blend$/i.test(projects[0].name) &&
      projects[0].size <= 128 * 1024 * 1024
    ) {
      serial.current++;
      setOpen(true);
      setTitle('Import Blender Animation');
      setError('');
      setBusy('');
      setSource(undefined);
      setBlendFile(projects[0]);
      setBakeMode('');
      setSelected([]);
      return;
    }
    void prepare('Import Blender Animation', 'Reading animation…', async () => {
      if (projects.length !== 1)
        throw Error(
          'Choose one .blend, .glb or .gltf file at a time. A .gltf can include its companion .bin files.',
        );
      if (files.reduce((sum, file) => sum + file.size, 0) > 128 * 1024 * 1024)
        throw Error('Animation files must total less than 128 MB.');
      const file = projects[0],
        data = new Uint8Array(await file.arrayBuffer());
      const companion = new Map<string, Uint8Array>();
      for (const asset of files) {
        if (asset === file) continue;
        if (companion.has(asset.name)) throw Error('Companion files have duplicate names.');
        companion.set(asset.name, new Uint8Array(await asset.arrayBuffer()));
      }
      return parseGltfMotion(data, companion);
    });
  };
  const importSelection = async () => {
    if (!source || !selected.length || selected.length > capacity) return;
    const request = ++serial.current;
    setBusy('Retargeting animation…');
    setError('');
    const clips: ImportedMotion[] = [];
    let totalKeys = 0;
    try {
      for (const index of selected) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        if (request !== serial.current) return;
        const clip = bakeMotionAction(source, index, { fps, rig, turn, scale, inPlace, mapping });
        totalKeys +=
          Object.values(clip.tracks).reduce((sum, keys) => sum + (keys?.length || 0), 0) +
          (clip.faceKeys?.length || 0);
        if (totalKeys > 250000)
          throw Error('This batch exceeds 250,000 baked keys. Select fewer or shorter actions.');
        clips.push(clip);
      }
      if (request === serial.current) {
        onImport(clips);
        close();
      }
    } catch (e) {
      if (request === serial.current)
        setError(e instanceof Error ? e.message : 'Could not retarget the selected actions.');
    } finally {
      if (request === serial.current) setBusy('');
    }
  };
  return (
    <>
      <div className="blender-motion-entry">
        <button className="button" disabled={capacity <= 0} onClick={() => input.current?.click()}>
          <Upload size={13} /> Import Blender
        </button>
        <button
          className="button"
          disabled={capacity <= 0}
          onClick={() =>
            void prepare(
              'Blender Motion Library',
              'Loading Blender actions…',
              loadBlenderLibrarySource,
            )
          }
        >
          <Film size={13} /> Blender Presets
        </button>
        <input
          aria-label="Blender animation file"
          ref={input}
          type="file"
          multiple
          hidden
          accept=".blend,.glb,.gltf,.bin,application/octet-stream"
          onChange={(e) => {
            const files = Array.from(e.currentTarget.files || []);
            e.currentTarget.value = '';
            importFiles(files);
          }}
        />
      </div>
      {open && (
        <Modal
          title={title}
          subtitle="Add editable, retargeted actions to your project motion library."
          onClose={close}
        >
          <div className="modal-body blender-motion-dialog">
            {busy && (
              <p className="hint" role="status">
                {busy}
              </p>
            )}
            {error && (
              <p className="blender-motion-error" role="alert">
                {error}
              </p>
            )}
            {blendFile && (
              <>
                <p className="hint">{blendFile.name}</p>
                <label className="select-row">
                  Bake mode
                  <select
                    aria-label="Blender bake mode"
                    value={bakeMode}
                    onChange={(e) => setBakeMode(e.target.value as BakeMode | '')}
                  >
                    <option value="">Automatic</option>
                    <option value="ACTIONS">Individual Actions</option>
                    <option value="NLA_TRACKS">Named NLA Tracks</option>
                    <option value="SCENE">Entire Scene Timeline</option>
                  </select>
                </label>
                <p className="hint">
                  The desktop app opens the file in background Blender and samples its animation.
                  Scene Timeline bakes constraints and layer blending over the Blender scene range.
                </p>
              </>
            )}
            {source && (
              <>
                <label className="select-row">
                  Source rig
                  <select
                    aria-label="Blender source rig"
                    value={rig}
                    disabled={!!busy}
                    onChange={(e) => {
                      setRig(+e.target.value);
                      setMapping({});
                    }}
                  >
                    {rigs.map((choice, index) => (
                      <option value={index} key={index}>
                        {choice.name} · {Object.keys(choice.mapping).length} joints
                      </option>
                    ))}
                  </select>
                </label>
                <div className="blender-motion-actions">
                  <strong>Actions</strong>
                  <button
                    className="button compact"
                    disabled={!!busy || (!selected.length && !visibleActions.length)}
                    onClick={() =>
                      setSelected(
                        selected.length
                          ? []
                          : visibleActions.slice(0, capacity).map((action) => action.index),
                      )
                    }
                  >
                    {selected.length
                      ? 'Clear selection'
                      : actionSearch.trim()
                        ? 'Select results'
                        : 'Select all'}
                  </button>
                </div>
                <input
                  type="search"
                  aria-label="Search Blender actions"
                  placeholder="Find an action"
                  value={actionSearch}
                  onChange={(e) => setActionSearch(e.target.value)}
                />
                <div className="blender-motion-list" aria-label="Blender actions">
                  {!visibleActions.length && <p className="hint">No actions match.</p>}
                  {visibleActions.map((action) => (
                    <label key={action.index}>
                      <input
                        type="checkbox"
                        disabled={
                          !!busy ||
                          (!selected.includes(action.index) && selected.length >= capacity)
                        }
                        checked={selected.includes(action.index)}
                        onChange={(e) =>
                          setSelected(
                            e.target.checked
                              ? [...selected, action.index].sort((a, b) => a - b)
                              : selected.filter((i) => i !== action.index),
                          )
                        }
                      />
                      {action.name}
                    </label>
                  ))}
                </div>
                <details className="blender-motion-options">
                  <summary>Retargeting options</summary>
                  <label className="select-row">
                    Facing correction
                    <select
                      aria-label="Facing correction"
                      value={turn}
                      disabled={!!busy}
                      onChange={(e) => setTurn(+e.target.value as typeof turn)}
                    >
                      {[0, 90, 180, 270].map((angle) => (
                        <option key={angle} value={angle}>
                          {angle === 0 ? 'Automatic' : `Automatic + ${angle}°`}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="select-row">
                    Translation scale
                    <NumberField
                      label="Blender translation scale"
                      value={scale}
                      min={0.01}
                      max={100}
                      step={0.1}
                      onCommit={setScale}
                    />
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={inPlace}
                      disabled={!!busy}
                      onChange={(e) => setInPlace(e.target.checked)}
                    />{' '}
                    Remove horizontal root travel
                  </label>
                  <p className="hint">
                    Scale defaults to the source leg length. Named facial shapes map to the
                    character's animated face.
                  </p>
                  <div className="blender-mapping">
                    <label className="select-row">
                      Studio control
                      <select
                        aria-label="Studio control to remap"
                        value={control}
                        disabled={!!busy}
                        onChange={(e) => {
                          setControl(e.target.value as Target);
                          setJointSearch('');
                        }}
                      >
                        <option value="root">Character root</option>
                        {bones.map((bone) => (
                          <option key={bone} value={bone}>
                            {boneLabels[bone]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <input
                      aria-label="Find a Blender joint"
                      placeholder="Filter source joint names…"
                      value={jointSearch}
                      onChange={(e) => setJointSearch(e.target.value)}
                    />
                    <label className="select-row">
                      Source joint
                      <select
                        aria-label="Source joint mapping"
                        disabled={!!busy}
                        value={
                          mapping[control] === null
                            ? 'none'
                            : mapping[control] === undefined
                              ? 'auto'
                              : String(mapping[control])
                        }
                        onChange={(e) => {
                          const value = e.target.value;
                          setMapping((previous) => ({
                            ...previous,
                            [control]:
                              value === 'auto' ? undefined : value === 'none' ? null : +value,
                          }));
                        }}
                      >
                        <option value="auto">
                          Automatic ·{' '}
                          {source.document.nodes[rigs[rig]?.mapping[control] ?? -1]?.name ||
                            'unmapped'}
                        </option>
                        <option value="none">Do not import</option>
                        {candidateJoints.map((index) => (
                          <option value={index} key={index}>
                            {source.document.nodes[index].name || 'Unnamed node'} · {index}
                          </option>
                        ))}
                      </select>
                    </label>
                    <p className="hint">
                      Remap one control at a time. Keep source nodes unique. Search if the joint you
                      need is not among the first 256 matches.
                    </p>
                  </div>
                </details>
                <p className="hint">
                  {selected.length} selected · {capacity} library slots · baked at {fps} FPS. Apply
                  an imported action using Motion Library.
                </p>
              </>
            )}
          </div>
          <footer>
            <button className="button" onClick={close}>
              Close
            </button>
            {blendFile ? (
              <button className="button primary" onClick={() => bakeBlend(blendFile)}>
                Bake Animation
              </button>
            ) : (
              <button
                className="button primary"
                disabled={!source || !selected.length || !!busy}
                onClick={() => void importSelection()}
              >
                <Download size={13} /> Add {selected.length || ''}{' '}
                {selected.length === 1 ? 'Action' : 'Actions'}
              </button>
            )}
          </footer>
        </Modal>
      )}
    </>
  );
}
