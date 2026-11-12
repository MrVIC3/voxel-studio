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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { MAX_PROJECT_BLOCKS } from './import-limits';
import { createStage, editVoxel, routeKeys, stageFor } from './staging';
import {
  ArrowDownToLine,
  ArrowUpRight,
  Box,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Copy,
  Diamond,
  DiamondPlus,
  Eye,
  EyeOff,
  FilePlus2,
  FolderOpen,
  Grid2X2,
  Hand,
  Layers3,
  LoaderCircle,
  Magnet,
  Maximize,
  MoreHorizontal,
  MousePointer2,
  Move,
  PanelLeftClose,
  PanelRightClose,
  Plus,
  Redo2,
  RotateCcw,
  RotateCw,
  Save,
  Scaling,
  Search,
  Settings2,
  SlidersHorizontal,
  Sun,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import { StudioEngine } from './engine/StudioEngine';
import type { Quality } from './engine/StudioEngine';
import {
  bones,
  boneLabels,
  clone,
  defaultLighting,
  demoProject,
  emptyProject,
  getTransform,
  identity,
  lookAtTransform,
  insertKey,
  trackId,
  uid,
  validateProject,
} from './model';
import type {
  BoneName,
  Keyframe,
  Lighting,
  Project,
  SceneObject,
  Selection,
  Transform,
  Vec3,
} from './model';
import { IconButton, Modal, NumberField, Section, Slider, VectorField } from './components';
import { ImportDialog, ExportDialog, HelpDialog } from './dialogs';
import { Timeline } from './Timeline';
import type { SelectedKey } from './Timeline';
import { clearRecovery, readRecovery, saveFile, writeRecovery } from './storage';
import { CommandPalette } from './CommandPalette';
import { MotionPanel } from './MotionPanel';
import { applyMotion, keyCharacterPose, presetMotion, smoothCharacterPoseKeys } from './motion';
import { BlockTools, EquipmentPanel, MovementPanel, SurfacePanel } from './ProductionPanels';
import { ShotPanel } from './ShotPanel';
import { CameraRailPanel } from './CameraRailPanel';
import { cameraMoveNames, designCameraMove } from './camera-rail';
import type { CameraMove } from './camera-rail';
import { cameraAtFrame, shotAtFrame } from './sequence';
import { CameraEffectsPanel } from './CameraEffectsPanel';
import type { CameraEffects } from './camera-effects';
import { EffectPanel } from './EffectPanel';
import { RigPanel } from './RigPanel';
import { FaceWorkspace } from './FaceWorkspace';
import { defaultFaceRig, evaluateFace, setFaceKey } from './face';
import type { FaceEdit } from './FacePanel';
import { CinematicPanel } from './CinematicPanel';
import { applyCinematicPreset } from './cinematic';
import { effectDefaults } from './engine/effects';
import { copyObjects, descendants, hierarchyRows, pasteObjects, removeObjects } from './scene-tools';
import { defaultWind, windControls } from './wind';
import type { WindSettings } from './wind';
import { deleteKeys, isFaceTrack, keyTrackOwner, moveKeys, pasteKeyBatch } from './key-tools';
import type { EditorCommand } from './CommandPalette';
import { AssetDialog } from './AssetDialog';
import type { MinecraftAssets } from './engine/minecraft';

const objectIcon = (type: SceneObject['type']) =>
  type === 'character'
    ? ArmatureIcon
    : type === 'camera'
      ? CameraGlyph
      : type === 'light'
        ? LightIcon
        : MeshIcon;
const blankTextures: Record<string, string> = {};
function App() {
  const [flyView,setFlyView]=useState(false),[viewLens,setViewLens]=useState(40),[cameraGuides,setCameraGuides]=useState(true);
  const [route, setRoute] = useState<{ actor: string; start: number; points: Vec3[] }>();
  const [routeSeconds, setRouteSeconds] = useState(3);
  const [routeFacing, setRouteFacing] = useState(true);
  const [routeWalk, setRouteWalk] = useState(false);
  const [blockTool, setBlockTool] = useState<'place' | 'remove' | 'replace'>();
  const [brush, setBrush] = useState('minecraft:stone');
  const [shotsTab,setShotsTab]=useState<'path'|'effects'|'cuts'>('path');
  const [project, setProject] = useState<Project>(demoProject),
    [selection, setSelection] = useState<Selection>({ id: 'character' }),
    [frame, setFrame] = useState(0),
    [playing, setPlaying] = useState(false),
    [loop, setLoop] = useState(true),
    [autoKey, setAutoKey] = useState(false);
  const [workspace, setWorkspace] = useState<'scene' | 'animate' | 'lighting' | 'shots' | 'face'>('scene'),
    [mode, setMode] = useState<'translate' | 'rotate' | 'scale'>('translate'),
    [local, setLocal] = useState(false),
    [snap, setSnap] = useState(false),
    [quality, setQuality] = useState<Quality>('balanced'),
    [shading, setShading] = useState<'rendered' | 'solid' | 'wireframe'>('rendered'),
    [helpers, setHelpers] = useState(true),
    [preview, setPreview] = useState(false);
  const [modal, setModal] = useState<'import' | 'export' | 'help' | null>(null),
    [toast, setToast] = useState(''),
    [report, setReport] = useState<string[] | null>(null),
    [error, setError] = useState(''),
    [dirty, setDirty] = useState(false),
    [autosaved, setAutosaved] = useState(false),
    [recovery, setRecovery] = useState<Project | null>(null),
    [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['character'])),
    [search, setSearch] = useState(''),
    [selectedKey, setSelectedKey] = useState<SelectedKey>(null),
    [liveTransform, setLiveTransform] = useState<Transform | null>(null),
    [interpolation, setInterpolation] = useState<Keyframe['interpolation']>('smooth');
  const [gameAssets, setGameAssets] = useState<MinecraftAssets | null>(null),
    [assetVersions, setAssetVersions] = useState<string[]>([]),
    [assetsLoading, setAssetsLoading] = useState(false),
    [assetsError, setAssetsError] = useState(''),
    [assetDialog, setAssetDialog] = useState(false),
    [addMenu, setAddMenu] = useState(false);
  const assetsWorker = useRef<Worker | null>(null);
  const sceneClipboard = useRef<(ReturnType<typeof copyObjects> & { cut: boolean }) | Transform | undefined>(undefined);
  const soundtrack = useRef<HTMLAudioElement | null>(null);
  const [commandOpen, setCommandOpen] = useState(false);
  const [leftWidth, setLeftWidth] = useState(224),
    [rightWidth, setRightWidth] = useState(304),
    [timelineHeight, setTimelineHeight] = useState(240),
    [showLeft, setShowLeft] = useState(true),
    [showRight, setShowRight] = useState(true),
    [fileMenu, setFileMenu] = useState(false),
    [historyVersion, setHistoryVersion] = useState(0),
    [stats, setStats] = useState({ calls: 0, triangles: 0, fps: 0 });
  const [confirmation, setConfirmation] = useState<{
    title: string;
    message: string;
    action: () => void;
  } | null>(null);
  const viewport = useRef<HTMLDivElement>(null),
    engine = useRef<StudioEngine | null>(null),
    projectRef = useRef(project),
    frameRef = useRef(frame),
    history = useRef<Project[]>([]),
    future = useRef<Project[]>([]),
    openInput = useRef<HTMLInputElement>(null),
    toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  projectRef.current = project;
  frameRef.current = frame;
  const notice = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 6000);
  }, []);
  const commit = useCallback((update: Project | ((p: Project) => Project)) => {
    const old = projectRef.current,
      next = typeof update === 'function' ? update(old) : update;
    if (next === old) return;
    history.current.push(old);
    if (history.current.length > 40) history.current.shift();
    future.current = [];
    projectRef.current = next;
    setProject(next);
    setDirty(true);
    setAutosaved(false);
    setHistoryVersion((v) => v + 1);
  }, []);
  const choose = useCallback((s: Selection) => {
    setSelection(s);
    setSelectedKey(null);
    setLiveTransform(null);
    setRoute(undefined);
    setBlockTool(undefined);
  }, []);
  const seek = useCallback((f: number) => {
    setFrame(Math.max(0, Math.min(projectRef.current.duration, Math.round(f))));
    setPlaying(false);
    setLiveTransform(null);
  }, []);
  const editTransform = useCallback(
    (s: NonNullable<Selection>, t: Transform) => {
      setPlaying(false);
      commit((p) => {
        const o = p.objects.find((o) => o.id === s.id);
        if (!o) return p;
        const objects = p.objects.map((o) =>
          o.id === s.id
            ? s.bone
              ? { ...o, pose: { ...o.pose, [s.bone]: clone(t) } }
              : { ...o, transform: clone(t) }
            : o,
        );
        let next = { ...p, objects };
        if (autoKey || p.tracks[trackId(s)]?.length)
          next = insertKey(next, s, frameRef.current, t, interpolation);
        return next;
      });
      setLiveTransform(null);
    },
    [commit, autoKey, interpolation],
  );
  const callbacks = useRef({ choose, editTransform, notice });
  callbacks.current = { choose, editTransform, notice };
  useEffect(() => {
    if (!viewport.current) return;
    try {
      engine.current = new StudioEngine(viewport.current, {
        select: (s) => callbacks.current.choose(s),
        transform: (s, t, done) => {
          setPlaying(false);
          if (done) callbacks.current.editTransform(s, t);
          else setLiveTransform(t);
        },
        stats: setStats,
        error: setError,
      });
    } catch (e) {
      setError(
        `The 3D viewport could not start: ${e instanceof Error ? e.message : String(e)}. WebGL2 graphics support is required.`,
      );
    }
    return () => {
      engine.current?.destroy();
      engine.current = null;
    };
  }, []);
  useEffect(() => {
    engine.current?.setProject(project);
  }, [project]);
  useEffect(() => {
    if (!playing) engine.current?.setFrame(frame);
  }, [frame, playing]);
  useEffect(() => {
    engine.current?.select(selection);
  }, [selection]);
  useEffect(() => {
    engine.current?.setMode(mode);
  }, [mode]);
  useEffect(() => {
    engine.current?.setSpace(local);
  }, [local]);
  useEffect(() => {
    engine.current?.setSnap(snap);
  }, [snap]);
  useEffect(() => {
    engine.current?.setQuality(quality);
  }, [quality]);
  useEffect(() => {
    engine.current?.setShading(shading);
  }, [shading]);
  useEffect(() => {
    engine.current?.setHelpers(helpers);
  }, [helpers]);
  useEffect(() => {
    engine.current?.setPreview(preview);
    if(preview)setFlyView(false);
  }, [preview]);
  useEffect(() => { engine.current?.setViewportSuspended(workspace==='face'); }, [workspace]);
  useEffect(()=>{engine.current?.setFlight(flyView);},[flyView]);
  useEffect(()=>{engine.current?.setCameraGuide(cameraGuides);},[cameraGuides]);
  useEffect(() => {
    engine.current?.frameSelection(true);
  }, []);
  useEffect(() => {
    readRecovery()
      .then((value) => {
        if (value) {
          try {
            setRecovery(validateProject(value));
          } catch {
            notice('An incompatible recovery save was ignored.');
          }
        }
      })
      .catch(() => notice('Local recovery storage is unavailable. Save project files regularly.'));
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [notice]);
  useEffect(() => {
    if (!dirty || recovery) return;
    const timer = setTimeout(() => {
      writeRecovery({
        ...project,
        assetVersion: gameAssetsRef.current?.version || project.assetVersion,
      })
        .then(() => setAutosaved(true))
        .catch(() => notice('Recovery save failed. Save your project to a file.'));
    }, 1400);
    return () => clearTimeout(timer);
  }, [project, dirty, recovery, notice]);
  useEffect(() => {
    const before = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', before);
    return () => window.removeEventListener('beforeunload', before);
  }, [dirty]);
  useEffect(() => {
    if (!playing) return;
    const duration = Math.min(project.duration, project.playbackRange?.[1] ?? project.duration),
      first = project.playbackRange?.[0] || 0,
      fps = project.fps,
      startFrame =
        frameRef.current >= duration || frameRef.current < first ? first : frameRef.current,
      start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const f = startFrame + ((now - start) * fps) / 1000;
      if (f >= duration && !loop) {
        setFrame(duration);
        setPlaying(false);
        return;
      }
      const sample = Math.min(duration, loop ? first + ((f - first) % (duration - first + 1)) : f);
      if (engine.current && !engine.current.exporting && workspace !== 'face') engine.current.setFrame(sample);
      setFrame(Math.floor(sample));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, project.duration, project.fps, project.playbackRange, loop, workspace]);
  const undo = useCallback(() => {
    const prev = history.current.pop();
    if (!prev) return;
    future.current.push(projectRef.current);
    projectRef.current = prev;
    setProject(prev);
    setFrame((f) => Math.min(f, prev.duration));
    setDirty(true);
    setHistoryVersion((v) => v + 1);
    setLiveTransform(null);
    setPlaying(false);
  }, []);
  useEffect(() => {
    soundtrack.current?.pause();
    const audio = project.audio ? new Audio(project.audio.data) : null;
    soundtrack.current = audio;
    return () => audio?.pause();
  }, [project.audio?.data]);
  useEffect(() => {
    const audio = soundtrack.current,
      track = project.audio;
    if (!audio || !track) return;
    const time = (frame - track.startFrame) / project.fps;
    audio.volume = Math.min(1, track.volume);
    if (time < 0 || (!Number.isNaN(audio.duration) && time >= audio.duration)) {
      audio.pause();
      return;
    }
    if (Math.abs(audio.currentTime - time) > 0.15) audio.currentTime = Math.max(0, time);
    if (playing && audio.paused) audio.play().catch(() => {});
    else if (!playing) audio.pause();
  }, [frame, playing, project.audio, project.fps]);
  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    history.current.push(projectRef.current);
    projectRef.current = next;
    setProject(next);
    setFrame((f) => Math.min(f, next.duration));
    setDirty(true);
    setHistoryVersion((v) => v + 1);
    setLiveTransform(null);
    setPlaying(false);
  }, []);
  useEffect(() => {
    if (selection && !project.objects.some((o) => o.id === selection.id)) choose(null);
  }, [project, selection, choose]);
  const gameAssetsRef = useRef(gameAssets);
  gameAssetsRef.current = gameAssets;
  const save = useCallback(async () => {
    setSaving(true);
    try {
      const p = projectRef.current;
      const saved = await saveFile(
        `${p.name.replace(/[^a-z0-9 _-]/gi, '').trim() || 'scene'}.voxel`,
        new TextEncoder().encode(
          JSON.stringify({ ...p, assetVersion: gameAssetsRef.current?.version || p.assetVersion }),
        ),
        'Voxel Studio project',
      );
      if (saved) {
        if (projectRef.current === p) {
          setDirty(false);
          await clearRecovery();
        }
        notice('Project saved. Skins, textures and builds are embedded.');
      }
    } catch (e) {
      notice(`Save failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  }, [notice]);
  const replaceProject = (next: Project) => {
    history.current = [];
    future.current = [];
    projectRef.current = next;
    setProject(next);
    choose(
      next.objects.find((o) => o.type === 'character')
        ? { id: next.objects.find((o) => o.type === 'character')!.id }
        : null,
    );
    setFrame(0);
    setPlaying(false);
    setDirty(false);
    setAutosaved(false);
    setRecovery(null);
    clearRecovery().catch(() => {});
    setPreview(false);
    setSelectedKey(null);
    setHistoryVersion((v) => v + 1);
    setExpanded(new Set(next.objects.filter((o) => o.type === 'character').map((o) => o.id)));
    setTimeout(() => engine.current?.frameSelection(true), 30);
  };
  const guarded = (title: string, action: () => void) => {
    setFileMenu(false);
    if (dirty)
      setConfirmation({
        title,
        message:
          'Your current project has unsaved changes. Save it first if you want to keep them.',
        action,
      });
    else action();
  };
  const openProject = async (file: File | undefined) => {
    if (!file) return;
    try {
      if (file.size > 100 * 1024 * 1024) throw Error('Project exceeds 100 MB.');
      const p = validateProject(JSON.parse(await file.text()));
      replaceProject(p);
      notice(`Opened ${p.name}`);
    } catch (e) {
      notice(`Could not open project: ${e instanceof Error ? e.message : String(e)}`);
    }
  };
  const insert = useCallback(() => {
    if (!selection) return;
    const t = liveTransform || getTransform(projectRef.current, selection, frameRef.current);
    commit((p) => insertKey(p, selection, frameRef.current, t, interpolation));
    setSelectedKey({ track: trackId(selection), frame: frameRef.current });
    notice(`Keyframe inserted at frame ${frameRef.current}.`);
  }, [selection, liveTransform, interpolation, commit, notice]);
  const deleteSelection = useCallback(() => {
    if (selectedKey) {
      commit(p => deleteKeys(p,[selectedKey]));
      setSelectedKey(null);
      return;
    }
    if (!selection) return;
    if (selection.bone) {
      editTransform(selection, identity());
      return;
    }
    commit((p) => removeObjects(p, new Set([selection.id])));
    choose(null);
  }, [selectedKey, selection, commit, editTransform, choose]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target?.closest?.('input,select,textarea,[contenteditable]') ||
        modal ||
        confirmation ||
        report ||
        commandOpen ||
        assetDialog
      )
        return;
      const ctrl = e.ctrlKey || e.metaKey;
      if ((ctrl && e.key.toLowerCase() === 'k') || e.key === 'F3') {
        e.preventDefault();
        setCommandOpen(true);
        return;
      }
      if (workspace !== 'face' && ctrl && ['c','x','v'].includes(e.key.toLowerCase())) {
        e.preventDefault();
        const key = e.key.toLowerCase();
        if (key === 'v') pasteSelection();
        else copySelection(key === 'x');
        return;
      }
      if (!ctrl && e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        duplicate();
        return;
      }
      if (ctrl && e.key.toLowerCase() === 's') {
        e.preventDefault();
        save();
        return;
      }
      if (ctrl && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        guarded('Open another project', () => openInput.current?.click());
        return;
      }
      if (ctrl && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
        return;
      }
      if (ctrl && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
        return;
      }
      if (ctrl) return;
      if (workspace==='face') {
        const key=e.key.toLowerCase();
        if (key==='escape') { e.preventDefault(); setWorkspace('animate'); return; }
        if (key==='i') {
          if (faceActor?.face?.enabled && !faceActor.locked) {
            e.preventDefault();
            const at=frameRef.current, keys=projectRef.current.faceTracks?.[faceActor.id];
            editFace({keys:setFaceKey(keys,at,evaluateFace(faceActor.face,keys,at,project.fps,faceActor.id,false))});
          }
          return;
        }
        if (![' ','arrowleft','arrowright'].includes(key)) return;
      }
      switch (e.key.toLowerCase()) {
        case ' ':
          e.preventDefault();
          setPlaying((p) => !p);
          break;
        case 'g':
          setMode('translate');
          break;
        case 'r':
          setMode('rotate');
          break;
        case 's':
          setMode('scale');
          break;
        case 'f':
          engine.current?.frameSelection();
          break;
        case 'home':
          e.preventDefault();
          engine.current?.frameSelection(true);
          break;
        case 'i':
          if (e.shiftKey && object?.type==='character' && !object.locked) {
            e.preventDefault(); setPlaying(false);
            commit(p=>keyCharacterPose(p,object.id,frameRef.current));
            notice('Keyed the full character pose.');
          } else if (!e.shiftKey) insert();
          break;
        case 'k':
          e.preventDefault();captureViewKey();
          break;
        case 'v':
          e.preventDefault(); toggleFly();
          break;
        case 't':
          if (e.shiftKey) { e.preventDefault(); bringSelection(); }
          break;
        case 'b':
          if (e.shiftKey) { e.preventDefault(); newBuild(); }
          else if (object?.type === 'build' && !object.locked) {
            e.preventDefault(); setPreview(false); setBlockTool(mode => mode ? undefined : 'place');
          }
          break;
        case 'p':
          if (object?.type === 'character' && !object.locked) startRoute();
          break;
        case 'm':
          if (object?.type === 'character' && !object.locked) selectMovement();
          break;
        case 'arrowleft':
          e.preventDefault();
          seek(frameRef.current - 1);
          break;
        case 'arrowright':
          e.preventDefault();
          seek(frameRef.current + 1);
          break;
        case 'delete':
        case 'backspace':
          e.preventDefault();
          deleteSelection();
          break;
        case 'escape':
          if(route)setRoute(undefined);else if(blockTool)setBlockTool(undefined);else if(flyView)setFlyView(false);else choose(null);
          break;
        case '0':
          setPreview((p) => !p);
          break;
        case '1':
          engine.current?.view('front');
          break;
        case '3':
          engine.current?.view('right');
          break;
        case '7':
          engine.current?.view('top');
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  useEffect(() => {
    if (!fileMenu) return;
    const close = () => setFileMenu(false);
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [fileMenu]);
  const addObject = (
    type: SceneObject['type'],
    block?: string,
    lightType?: 'point' | 'area' | 'spot',
  ) => {
    if (projectRef.current.objects.length >= 500) {
      notice('Scene limit: 500 objects.');
      return;
    }
    const base: SceneObject = {
      id: uid(),
      name:
        type === 'character'
          ? 'Character'
          : type === 'camera'
            ? 'Camera'
            : type === 'light'
              ? 'Point light'
              : type === 'group'
                ? 'Group'
                : type === 'item'
                  ? 'Diamond Sword'
                  : type === 'effect'
                    ? 'Impact Sparks'
                    : block?.replace('minecraft:', '').replaceAll('_', ' ') || 'Block',
      type,
      visible: true,
      transform: identity(),
    };
    if (type === 'character') {
      base.transform.position = [0, 0.5, 0];
      setExpanded((e) => new Set([...e, base.id]));
    }
    if (type === 'item') {
      base.item = 'minecraft:item/diamond_sword';
      base.transform.position = [0, 1, 0];
    }
    if (type === 'effect') {
      base.effect = { ...effectDefaults, start: frame, end: Math.min(36000, frame + 36) };
      base.transform.position = [0, 1, 0];
    }
    if (type === 'block') {
      base.block = block || 'minecraft:grass_block';
      base.transform.position = [0, 0.5, 0];
    }
    if (type === 'light') {
      base.color = '#ffffff';
      base.lightType = lightType || 'point';
      base.width = 4;
      base.height = 4;
      base.angle = 45;
      base.lightShadows = lightType === 'spot';
      if (lightType) {
        base.name = lightType === 'area' ? 'Area Light' : 'Spot Light';
        base.transform = lookAtTransform([3, 5, 4], [0, 1, 0]);
      }
      base.intensity = 20;
      if (!lightType) base.transform.position = [2, 4, 2];
    }
    if (type === 'camera') {
      base.transform = engine.current?.cameraTransform() || identity();
      base.fov = 40;
    }
    commit((p) => ({
      ...p,
      duration: Math.max(p.duration, base.effect?.end || 0),
      objects: [...p.objects, base],
    }));
    choose({ id: base.id });
    notice(`Added ${base.name}.`);
  };
  const onImport = (o: SceneObject, warnings: string[]) => {
    if (projectRef.current.objects.length >= 500) {
      notice('Scene limit: 500 objects.');
      return;
    }
    const count = projectRef.current.objects.reduce(
      (n, o) => n + (o.voxels?.blocks.length || 0),
      0,
    );
    if (count + (o.voxels?.blocks.length || 0) > MAX_PROJECT_BLOCKS) {
      notice(`Project exceeds ${MAX_PROJECT_BLOCKS.toLocaleString()} imported blocks. Remove a build first.`);
      return;
    }
    commit((p) => ({ ...p, objects: [...p.objects, o] }));
    choose({ id: o.id });
    setExpanded((e) => new Set([...e, o.id]));
    if (warnings.length) setReport(warnings);
    setTimeout(() => engine.current?.frameSelection(), 50);
  };
  const updateObject = (patch: Partial<SceneObject>) => {
    if (!selection) return;
    commit((p) => ({
      ...p,
      objects: p.objects.map((o) => (o.id === selection.id ? { ...o, ...patch } : o)),
    }));
  };
  const updateLighting = (patch: Partial<Lighting>) =>
    commit((p) => ({ ...p, lighting: { ...p.lighting, ...patch } }));
  const wind = project.wind ?? defaultWind;
  const updateWind = (patch: Partial<WindSettings>) =>
    commit((p) => ({ ...p, wind: { ...(p.wind ?? defaultWind), ...patch } }));
  const pasteScene = (data: ReturnType<typeof copyObjects>, cut = false) => {
    try {
      const pasted = pasteObjects(projectRef.current, data, cut);
      commit(pasted.project);
      choose({ id: pasted.id });
      notice('Pasted scene selection.');
      return true;
    } catch (error) {
      if (error instanceof Error) notice(error.message);
      return false;
    }
  };
  const copySelection = (cut = false) => {
    if (!selection) return;
    if (selection.bone) {
      if (cut) return;
      sceneClipboard.current = clone(liveTransform || getTransform(project, selection, frameRef.current));
      notice('Copied bone transform.');
      return;
    }
    const data = copyObjects(projectRef.current, selection.id);
    if (!data.objects.length || (cut && data.objects.some((entry) => entry.locked))) return;
    sceneClipboard.current = { ...data, cut };
    if (cut) {
      commit((p) => removeObjects(p, new Set([selection.id])));
      choose(null);
    }
    notice(cut ? 'Cut scene selection.' : 'Copied scene selection.');
  };
  const pasteSelection = () => {
    const data = sceneClipboard.current;
    if (!data) return;
    if ('objects' in data) {
      if (pasteScene(data, data.cut) && data.cut) sceneClipboard.current = { ...data, cut: false };
    }
    else if (selection?.bone && !object?.locked) {
      editTransform(selection, data);
      notice('Pasted bone transform.');
    }
  };
  const duplicate = () => {
    if (selection) pasteScene(copyObjects(projectRef.current, selection.id));
  };
  const pose = (kind: 'neutral' | 'walk' | 'wave') => {
    if (!selection) return;
    commit((p) => {
      const object = p.objects.find((o) => o.id === selection.id);
      if (object?.type !== 'character') return p;
      const poses: Partial<Record<BoneName, Transform>> = {};
      for (const b of bones) poses[b] = identity();
      if (kind === 'walk') {
        poses.leftArm!.rotation[0] = -0.65;
        poses.rightArm!.rotation[0] = 0.65;
        poses.leftLeg!.rotation[0] = 0.65;
        poses.rightLeg!.rotation[0] = -0.65;
      }
      if (kind === 'wave') {
        poses.rightArm!.rotation = [-2.4, 0, 0.45];
        poses.head!.rotation[1] = -0.2;
      }
      let next = {
        ...p,
        objects: p.objects.map((o) => (o.id === object.id ? { ...o, pose: poses } : o)),
      };
      for (const bone of bones)
        if (autoKey || p.tracks[`${object.id}/${bone}`]?.length)
          next = insertKey(next, { id: object.id, bone }, frame, poses[bone]!, interpolation);
      return next;
    });
  };
  const resizePanel = (e: React.PointerEvent, kind: 'left' | 'right' | 'timeline') => {
    e.preventDefault();
    const startX = e.clientX,
      startY = e.clientY,
      start = kind === 'left' ? leftWidth : kind === 'right' ? rightWidth : timelineHeight;
    const move = (event: PointerEvent) => {
      if (kind === 'left')
        setRightWidth(Math.max(250, Math.min(440, rightWidth - event.clientX + startX)));
      if (kind === 'right')
        setRightWidth(Math.max(240, Math.min(440, start - event.clientX + startX)));
      if (kind === 'timeline')
        setTimelineHeight(
          Math.max(150, Math.min(window.innerHeight * 0.5, start - event.clientY + startY)),
        );
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const loadArchive = useCallback(async (bytes: Uint8Array, version: string, source: string) => {
    setAssetsLoading(true);
    setAssetsError('');
    assetsWorker.current?.terminate();
    try {
      const worker = new Worker(new URL('./engine/assets.worker.ts', import.meta.url), {
        type: 'module',
      });
      assetsWorker.current = worker;
      const buffer = bytes.slice().buffer;
      const assets = await new Promise<MinecraftAssets>((resolve, reject) => {
        worker.onmessage = (e) =>
          e.data.error ? reject(Error(e.data.error)) : resolve(e.data.assets);
        worker.onerror = (e) => reject(Error(e.message || 'Resource decoder failed.'));
        worker.postMessage({ bytes: buffer, version, source }, [buffer]);
      });
      worker.terminate();
      assetsWorker.current = null;
      engine.current?.setAssets(assets);
      setGameAssets(assets);
    } catch (error) {
      setAssetsError(error instanceof Error ? error.message : String(error));
    } finally {
      setAssetsLoading(false);
    }
  }, []);
  const loadGameVersion = useCallback(
    async (version: string) => {
      setAssetsLoading(true);
      try {
        const result = await window.desktop!.minecraftAssets(version);
        await loadArchive(result.bytes, version, 'Minecraft Java ' + version);
      } catch (error) {
        setAssetsError(error instanceof Error ? error.message : String(error));
        setAssetsLoading(false);
      }
    },
    [loadArchive],
  );
  useEffect(() => {
    let active = true;
    if (window.desktop)
      window.desktop
        .minecraftVersions()
        .then((versions) => {
          if (!active) return;
          setAssetVersions(versions);
          if (versions.length) {
            const preferred = projectRef.current.assetVersion;
            loadGameVersion(preferred && versions.includes(preferred) ? preferred : versions[0]);
          } else
            setAssetsError(
              'No installed Java version found. Load a version JAR from Minecraft Resources.',
            );
        })
        .catch((error) => setAssetsError(String(error)));
    return () => {
      active = false;
      assetsWorker.current?.terminate();
    };
  }, [loadGameVersion]);
  useEffect(() => {
    if (
      project.assetVersion &&
      assetVersions.includes(project.assetVersion) &&
      gameAssets?.version !== project.assetVersion &&
      !assetsLoading
    )
      loadGameVersion(project.assetVersion);
  }, [project.assetVersion, assetVersions]);
  const object = project.objects.find((o) => o.id === selection?.id),
    transform = selection ? liveTransform || getTransform(project, selection, frame) : identity(),
    lighting = project.lighting;
  const faceActors=project.objects.filter(o=>o.type==='character');
  const faceActor=object?.type==='character'?object:faceActors[0];
  const openFace=(id?:string)=>{
    const actor=id?faceActors.find(o=>o.id===id):faceActor;
    if(actor)choose({id:actor.id});
    setPreview(false);setFlyView(false);setPlaying(false);setWorkspace('face');
  };
  const editCharacter = (patch: Pick<SceneObject, 'characterLook' | 'characterLayers'>) => {
    if (!faceActor || faceActor.locked) return;
    commit((p) => ({ ...p, objects: p.objects.map((o) => o.id === faceActor.id ? { ...o, ...patch } : o) }));
  };
  const editFace=({config,keys}:FaceEdit)=>{
    if (!faceActor || faceActor.locked) return;
    setPlaying(false);
    commit(p=>({...p,
      ...(config?{objects:p.objects.map(o=>o.id===faceActor.id?{...o,face:config}:o)}:{}),
      ...(keys?{faceTracks:{...p.faceTracks,[faceActor.id]:keys}}:{}),
    }));
  };
  const catalog = useMemo(() => ({
    blocks: Object.keys(gameAssets?.blockstates || {}).filter(id => !/:(air|void_air|cave_air|structure_void|moving_piston|light|barrier)$/.test(id)).sort(),
    items: Object.keys(gameAssets?.textures || {}).filter(id => id.startsWith('minecraft:item/')).sort(),
  }), [gameAssets]);
  const equip = (hand: 'leftHand' | 'rightHand', item: string) => {
    if (object?.type !== 'character' || object.locked) return;
    const attached = project.objects.find(o => o.parentId === object.id && o.equipmentSlot === hand);
    if (!item && attached) { commit(p=>removeObjects(p, new Set([attached.id]))); return; }
    if (!item || (!attached && project.objects.length >= 500)) return;
    const name = item.slice(item.indexOf('/') + 1).replaceAll('_',' ').slice(0,85);
    const prop: SceneObject = attached
      ? { ...attached, name, item }
      : { id: uid(), type: 'item', name, visible: true, item, parentId: object.id, parentBone: hand,
        equipmentSlot: hand, transform: { ...identity(), position: [0,-.3,0], rotation: [0,0, hand === 'rightHand' ? -Math.PI*.75 : Math.PI*.75] } };
    commit(p=>({...p,objects:attached ? p.objects.map(o=>o.id===attached.id?prop:o) : [...p.objects,prop]}));
  };
  const toggleFly = () => { setPreview(false); setFlyView(value => !value); };
  const movement = (actor: SceneObject, at = frameRef.current) => {
    const current = projectRef.current;
    const existing = stageFor(current, actor);
    const id = existing?.id || uid();
    const next = existing ? current : createStage(current, actor, at, id);
    return { id, next, stage: next.objects.find(o => o.id === id) };
  };
  const selectMovement = () => {
    if (!object || object.type !== 'character') return;
    const { id, next, stage } = movement(object);
    if (!stage) { notice('Could not create a movement control. Check scene capacity and locks.'); return; }
    commit(next);
    choose({ id });
    setWorkspace('scene');
    notice('Move this control to position the actor independently of its pose.');
  };
  const bringSelection = () => {
    const studio = engine.current;
    if (!object || object.locked || !studio || preview) return;
    if (object.type === 'character') {
      const { id, next, stage } = movement(object);
      if (!stage || stage.locked) return;
      const at = frameRef.current;
      const existing = stageFor(project, object);
      const parentPosition = studio.viewportPosition(existing?.id || object.id);
      const world = existing && studio.worldPosition(object.id);
      const actorPosition = world && studio.stageLocal(id, world);
      const currentStage = getTransform(next, { id }, at);
      if (actorPosition) for (let axis=0;axis<3;axis++)
        parentPosition[axis] -= actorPosition[axis] - currentStage.position[axis];
      const t = { ...currentStage, position: parentPosition };
      commit(autoKey || next.tracks[id]?.length ? insertKey(next, { id }, at, t, interpolation) : {
        ...next, objects: next.objects.map(o => o.id === id ? { ...o, transform: t } : o),
      });
      choose({ id });
    } else {
      editTransform({ id: object.id }, { ...getTransform(project, { id: object.id }, frameRef.current), position: studio.viewportPosition(object.id) });
    }
    notice('Brought selection to the viewport camera.');
  };
  const startRoute = () => {
    if (object?.type !== 'character' || object.locked) return;
    const position = engine.current?.worldPosition(stageFor(project, object)?.id || object.id);
    if (!position) return;
    setPlaying(false); setPreview(false); setBlockTool(undefined);
    setRoute({ actor: object.id, start: frameRef.current, points: [position] });
    setWorkspace('scene'); setShowRight(true);
  };
  const finishRoute = () => {
    const studio = engine.current;
    if (!route || !studio || object?.id !== route.actor) return;
    const at = route.start;
    const existing = stageFor(project, object), { id, next, stage } = movement(object, at);
    if (!stage || stage.locked) return;
    const length = Math.min(36000 - at, Math.max(route.points.length - 1, Math.round(routeSeconds * project.fps)));
    studio.setFrame(at);
    const points = route.points.map(point => studio.stageLocal(existing?.id || object.id, point));
    const base = getTransform(next, { id }, at);
    const heading = getTransform(next, { id: object.id }, at).rotation[1];
    const keys = routeKeys(points, at, length, { ...base, frame: at, interpolation: 'linear' }, routeFacing ? heading : undefined);
    if (!keys.length) { studio.setFrame(frameRef.current); notice('Add another waypoint or start a path earlier.'); return; }
    const old = next.tracks[id] || [];
    const before = old.filter(key => key.frame < at);
    if (at > 0 && before.at(-1)?.frame !== at - 1)
      before.push({ ...getTransform(next, { id }, at - 1), frame: at - 1, interpolation: 'step' });
    const end = at + length;
    let result = { ...next, duration: Math.max(next.duration, end), tracks: {
      ...next.tracks, [id]: [...before, ...keys, ...old.filter(key => key.frame > end)],
    } };
    if (routeWalk) result = applyMotion(result, object.id, presetMotion('Walk'), at, Math.ceil(length / 24), 1, 0, false, end);
    commit(result);
    seek(at);
    setRoute(undefined);
    choose({ id });
    notice('Movement path saved as editable keys on the Movement control.');
  };
  const newBuild = () => {
    if (project.objects.length >= 500) return;
    const id = uid();
    commit(p => ({ ...p, objects: [...p.objects, { id, name: 'Block Build', type: 'build', visible: true, transform: identity(), voxels: { blocks: [], palette: [] } }] }));
    choose({ id }); setWorkspace('scene'); setShowRight(true); setPreview(false); setBlockTool('place');
  };
  const editableBuild = object?.type === 'build' && !object.locked ? object.id : undefined;
  useEffect(() => {
    const studio = engine.current;
    if (!studio) return;
    if (route && selection?.id === route.actor && !preview) {
      studio.setViewportTool({ type: 'route', height: route.points[0][1], point: point => setRoute(current => {
        if (!current || current.points.length >= 64) return current;
        const last = current.points.at(-1)!;
        return Math.hypot(...point.map((n,i)=>n-last[i])) < 0.1 ? current : { ...current, points: [...current.points,point] };
      }) });
      studio.setRouteGuide(route.points);
    } else {
      studio.setRouteGuide([]);
      studio.setViewportTool(blockTool && editableBuild && !preview ? { type: 'blocks', id: editableBuild, mode: blockTool,
        point: cell => commit(p => editVoxel(p, editableBuild, cell, blockTool === 'remove' ? undefined : brush, blockTool)),
      } : undefined);
    }
    return () => studio.setViewportTool(undefined);
  }, [route, selection?.id, editableBuild, blockTool, brush, preview, commit]);
  const selectedTrack = selection ? project.tracks[trackId(selection)] : undefined,
    selectedFace = selectedKey && isFaceTrack(selectedKey.track),
    selectedKeys = selectedKey && (selectedFace
      ? project.faceTracks?.[keyTrackOwner(selectedKey.track)] : project.tracks[selectedKey.track]);
  const keyInterpolation = (selectedKey && selectedKeys?.find(k=>k.frame===selectedKey.frame)?.interpolation)
    || (selectedFace ? 'smooth' : interpolation);
  const changeInterpolation = (value: Keyframe['interpolation']) => {
    if (object?.locked) return;
    if (selectedFace && selectedKey) {
      if (value !== 'smooth' && value !== 'linear' && value !== 'step') return;
      const actor = keyTrackOwner(selectedKey.track);
      commit(p => ({...p,faceTracks:{...p.faceTracks,[actor]:(p.faceTracks?.[actor]??[])
        .map(key=>key.frame===selectedKey.frame?{...key,interpolation:value}:key)}}));
      return;
    }
    setInterpolation(value);
    if (selectedKey && project.tracks[selectedKey.track])
      commit((p) => ({
        ...p,
        tracks: {
          ...p.tracks,
          [selectedKey.track]: p.tracks[selectedKey.track].map((k) =>
            k.frame === selectedKey.frame ? { ...k, interpolation: value } : k,
          ),
        },
      }));
  };
  const startAnimation = () => {
    if (modal) return;
    setPlaying((p) => !p);
  };
  const railCamera=object?.type==='camera'?object:project.objects.find(o=>o.id===cameraAtFrame(project,frame));
  const activeCameraCut=shotAtFrame(project,frame);
  const editCameraEffects=(camera:string,scope:'camera'|'cut',cameraEffects?:CameraEffects)=>{
    const cut=activeCameraCut?.id;
    setPlaying(false);
    commit(p=>{
      if(p.objects.find(o=>o.id===camera)?.locked || (scope==='cut'&&!cut))return p;
      const duration=Math.max(p.duration,...(cameraEffects?.events??[]).map(e=>Math.min(36000,e.start+e.duration)));
      return scope==='cut' ? {...p,duration,shots:p.shots?.map(shot=>shot.id===cut?{...shot,cameraEffects}:shot)}
        : {...p,duration,objects:p.objects.map(o=>o.id===camera?{...o,cameraEffects}:o)};
    });
  };
  const previewCameraEffects=(camera:string,scope:'camera'|'cut')=>{
    engine.current?.setPreviewCamera(scope==='camera'?camera:undefined);
    setFlyView(false);setPreview(true);
  };
  const captureViewKey=()=>{
    const studio=engine.current;if(!studio)return;
    if(preview){notice('Exit camera preview to compose and capture a new view.');return;}
    const current=projectRef.current,at=frameRef.current;
    if(railCamera?.locked){notice('Unlock this camera before capturing a view key.');return;}
    if(!railCamera&&current.objects.length>=500){notice('Scene limit: 500 objects.');return;}
    const camera:SceneObject=railCamera||{id:uid(),name:'Camera Path',type:'camera',visible:true,transform:studio.cameraTransform(),fov:studio.camera.fov,cameraRail:'smooth'};
    const transform=studio.cameraTransform(camera.id),fov=studio.camera.fov;
    commit(p=>{
      const old=p.tracks[camera.id]||[],previous=old.find(k=>k.frame===at),key:Keyframe={...previous,...transform,frame:at,fov,interpolation:previous?.interpolation||'smooth'};
      return {...p,activeCameraId:p.activeCameraId||camera.id,objects:railCamera?p.objects.map(o=>o.id===camera.id?{...o,cameraRail:old.length?o.cameraRail:o.cameraRail||'smooth'}:o):[...p.objects,camera],tracks:{...p.tracks,[camera.id]:[...old.filter(k=>k.frame!==at),key].sort((a,b)=>a.frame-b.frame)}};
    });
    choose({id:camera.id});setSelectedKey({track:camera.id,frame:at});setWorkspace('shots');setPlaying(false);notice(`Captured ${camera.name} · frame ${at}.`);
  };
  const recallView=(at?:number)=>{
    if(!railCamera)return;const studio=engine.current;if(!studio)return;
    setPlaying(false);setPreview(false);setFlyView(false);
    studio.setPreview(false);studio.setFlight(false);
    if(at!==undefined){seek(at);studio.setFrame(at);}
    studio.recallCamera(railCamera.id);setViewLens(studio.camera.fov);
  };
  const addCameraCut=()=>{
    if(!railCamera)return;
    const at=frameRef.current,id=railCamera.id;
    commit(p=>{
      const before=p.shots||[];if(before.length>=256&&!before.some(s=>s.frame===at))return p;
      return {...p,shots:[...before.filter(s=>s.frame!==at),{id:uid(),name:railCamera.name.slice(0,100),frame:at,cameraId:id}].sort((a,b)=>a.frame-b.frame)};
    });
    engine.current?.setPreviewCamera(undefined);
    setPreview(true);
  };
  const buildCameraMove=(move:CameraMove,frames:number)=>{
    const studio=engine.current;if(!studio)return;
    const at=frameRef.current, length=Math.min(frames,36000-at),p=projectRef.current;
    if(length<4||p.objects.length>=500||(p.shots?.length||0)>=256){notice('Not enough scene time or space for a new shot.');return;}
    const subject=studio.subjectBounds(selection?.id),view=studio.cameraTransform(),keys=designCameraMove(move,subject.center,view.position,subject.radius,at,length,studio.camera.fov),id=uid();
    const name=cameraMoveNames[move];
    const camera:SceneObject={id,name,type:'camera',visible:true,transform:keys[0],fov:studio.camera.fov,cameraRail:'smooth'};
    commit({...p,duration:Math.max(p.duration,at+length),objects:[...p.objects,camera],tracks:{...p.tracks,[id]:keys},activeCameraId:p.activeCameraId||id,shots:[...(p.shots||[]).filter(s=>s.frame!==at),{id:uid(),name,frame:at,cameraId:id}].sort((a,b)=>a.frame-b.frame)});
    choose({id});setPlaying(false);setPreview(false);notice(`Created ${name} with ${keys.length} editable camera keys.`);
  };
  const commands: EditorCommand[] = [
    { id: 'smooth-actor', label: 'Smooth character pose keys', group: 'Animation', enabled: object?.type === 'character' && !object.locked, run: () => {
      if (object?.type !== 'character' || object.locked) return;
      commit(p => smoothCharacterPoseKeys(p, object.id));
      notice('Smoothed character pose keys in the playback range.');
    } },
    {id:'copy',label:'Copy selection',group:'Edit',shortcut:'Ctrl C',enabled:!!selection,run:()=>copySelection()},
    {id:'cut',label:'Cut selected object',group:'Edit',shortcut:'Ctrl X',enabled:!!selection&&!selection.bone&&!object?.locked,run:()=>copySelection(true)},
    {id:'paste',label:'Paste selection',group:'Edit',shortcut:'Ctrl V',enabled:!!sceneClipboard.current,run:pasteSelection},
    {id:'face-workspace',label:'Open Character Editor',group:'Animation',run:()=>openFace()},
    {id:'fly-view',label:'Toggle fly navigation',group:'Viewport',shortcut:'V',run:toggleFly},
    {id:'bring-selection',label:'Bring selected object to view',group:'Viewport',shortcut:'Shift T',enabled:!!object&&!object.locked,run:bringSelection},
    {id:'draw-route',label:'Draw character movement path',group:'Animation',shortcut:'P',enabled:object?.type==='character'&&!object.locked,run:startRoute},
    {id:'new-build',label:'New editable block build',group:'Scene',shortcut:'Shift B',run:newBuild},
    {id:'select-movement',label:'Select separate character movement control',group:'Animation',shortcut:'M',enabled:object?.type==='character'&&!object.locked,run:selectMovement},
    {id:'capture-view-key',label:'Capture camera view key',group:'Camera',shortcut:'K',run:captureViewKey},
    { id: 'save', label: 'Save project', group: 'File', shortcut: 'Ctrl S', run: save },
    {
      id: 'open',
      label: 'Open project',
      group: 'File',
      shortcut: 'Ctrl O',
      run: () => guarded('Open project', () => openInput.current?.click()),
    },
    {
      id: 'new',
      label: 'New empty scene',
      group: 'File',
      run: () => guarded('New scene', () => replaceProject(emptyProject())),
    },
    { id: 'import', label: 'Import Minecraft asset', group: 'File', run: () => setModal('import') },
    {
      id: 'export',
      label: 'Export render',
      group: 'File',
      run: () => {
        setPlaying(false);
        setModal('export');
      },
    },
    {
      id: 'undo',
      label: 'Undo',
      group: 'Edit',
      shortcut: 'Ctrl Z',
      enabled: !!history.current.length,
      run: undo,
    },
    {
      id: 'redo',
      label: 'Redo',
      group: 'Edit',
      shortcut: 'Ctrl Shift Z',
      enabled: !!future.current.length,
      run: redo,
    },
    {
      id: 'duplicate',
      label: 'Duplicate selected object',
      group: 'Object',
      shortcut: 'Shift D',
      enabled: !!selection,
      run: duplicate,
    },
    {
      id: 'delete',
      label: 'Delete selection',
      group: 'Edit',
      shortcut: 'Delete',
      enabled: !!selection || !!selectedKey,
      run: deleteSelection,
    },
    ...(['character', 'block', 'camera', 'group', 'item', 'effect'] as const).map((type) => ({
      id: `add-${type}`,
      label: `Add ${type}`,
      group: 'Add',
      run: () => addObject(type),
    })),
    ...(['point', 'spot', 'area'] as const).map((type) => ({
      id: `light-${type}`,
      label: `Add ${type} light`,
      group: 'Add',
      run: () => addObject('light', undefined, type),
    })),
    {
      id: 'frame-all',
      label: 'Frame all objects',
      group: 'View',
      shortcut: 'Home',
      run: () => engine.current?.frameSelection(true),
    },
    {
      id: 'frame-selected',
      label: 'Frame selection',
      group: 'View',
      shortcut: 'F',
      enabled: !!selection,
      run: () => engine.current?.frameSelection(),
    },
    {
      id: 'camera-view',
      label: 'Toggle camera preview',
      group: 'View',
      shortcut: '0',
      run: () => setPreview((v) => !v),
    },
    ...(['front', 'right', 'top', 'perspective'] as const).map((axis) => ({
      id: `view-${axis}`,
      label: `${axis[0].toUpperCase() + axis.slice(1)} view`,
      group: 'View',
      run: () => engine.current?.view(axis),
    })),
    {
      id: 'insert-key',
      label: 'Insert keyframe',
      group: 'Animation',
      shortcut: 'I',
      enabled: !!selection,
      run: insert,
    },
    {
      id: 'play',
      label: playing ? 'Pause animation' : 'Play animation',
      group: 'Animation',
      shortcut: 'Space',
      run: startAnimation,
    },
    {
      id: 'pose-neutral',
      label: 'Reset character pose',
      group: 'Pose',
      enabled: object?.type === 'character',
      run: () => pose('neutral'),
    },
    {
      id: 'lighting',
      label: 'Lighting workspace',
      group: 'Workspace',
      run: () => setWorkspace('lighting'),
    },
    {
      id: 'shots',
      label: 'Camera shots and sequence',
      group: 'Workspace',
      run: () => setWorkspace('shots'),
    },
    {
      id: 'animation',
      label: 'Animation workspace',
      group: 'Workspace',
      run: () => {
        setWorkspace('animate');
        setTimelineHeight(Math.max(300, timelineHeight));
      },
    },
    {
      id: 'resources',
      label: 'Minecraft resources',
      group: 'Resources',
      run: () => setAssetDialog(true),
    },
    ...(['draft', 'balanced', 'high'] as const).map((tier) => ({
      id: `quality-${tier}`,
      label: `${tier[0].toUpperCase() + tier.slice(1)} viewport quality`,
      group: 'Rendering',
      run: () => setQuality(tier),
    })),
  ];
  return (
    <div
      className="app"
      data-outliner={showLeft}
      data-inspector={showRight}
      data-face-workspace={workspace==='face'}
      style={
        {
          '--left-width': `${showLeft ? leftWidth : 0}px`,
          '--right-width': `${showRight ? rightWidth : 0}px`,
          '--dock-width': `${showLeft || showRight ? rightWidth : 0}px`,
          '--outliner-height': `${showLeft ? 210 : 0}px`,
          '--timeline-height': `${workspace==='face'?0:timelineHeight}px`,
        } as CSSProperties
      }
    >
      <header className="app-header">
        <div className="brand">Voxel Studio</div>
        <div className="file-menu-wrap" onPointerDown={(e) => e.stopPropagation()}>
          <button
            className={`header-menu ${fileMenu ? 'active' : ''}`}
            onClick={() => setFileMenu((v) => !v)}
          >
            File
            <ChevronDown size={12} />
          </button>
          {fileMenu && (
            <div className="dropdown file-dropdown">
              {[
                {
                  icon: FilePlus2,
                  label: 'New empty scene',
                  hint: '',
                  action: () => guarded('Create a new scene', () => replaceProject(emptyProject())),
                },
                {
                  icon: Layers3,
                  label: 'Open woodland example',
                  hint: '',
                  action: () => guarded('Open example', () => replaceProject(demoProject())),
                },
                {
                  icon: FolderOpen,
                  label: 'Open project…',
                  hint: 'Ctrl O',
                  action: () => guarded('Open project', () => openInput.current?.click()),
                },
                {
                  icon: Save,
                  label: 'Save project…',
                  hint: 'Ctrl S',
                  action: () => {
                    setFileMenu(false);
                    save();
                  },
                },
                {
                  icon: ArrowDownToLine,
                  label: 'Import asset…',
                  hint: '',
                  action: () => {
                    setModal('import');
                    setFileMenu(false);
                  },
                },
                {
                  icon: ArrowUpRight,
                  label: 'Export render…',
                  hint: '',
                  action: () => {
                    setModal('export');
                    setFileMenu(false);
                    setPlaying(false);
                  },
                },
              ].map((item) => (
                <button key={item.label} onClick={item.action}>
                  <item.icon size={15} />
                  <span>{item.label}</span>
                  <kbd>{item.hint}</kbd>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="project-identity">
          <input
            aria-label="Project name"
            key={project.name}
            defaultValue={project.name}
            maxLength={100}
            onBlur={(e) => {
              const name = e.target.value.trim() || 'Untitled scene';
              if (name !== project.name) commit((p) => ({ ...p, name }));
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
            }}
          />
          <span
            className={`saved-dot ${dirty ? 'unsaved' : ''}`}
            title={dirty ? 'Unsaved changes' : 'Project file saved'}
          />
        </div>
        <div className="header-history">
          <IconButton
            icon={Undo2}
            label="Undo (Ctrl Z)"
            onClick={undo}
            disabled={!history.current.length}
          />
          <IconButton
            icon={Redo2}
            label="Redo (Ctrl Shift Z)"
            onClick={redo}
            disabled={!future.current.length}
          />
        </div>
        <div className="header-actions">
          <IconButton
            icon={Search}
            label="Command search (F3 / Ctrl K)"
            onClick={() => setCommandOpen(true)}
          />
          <button className="button" onClick={() => setModal('import')}>
            <ArrowDownToLine size={15} />
            Import
          </button>
          <button className="button" disabled={saving} onClick={save}>
            {saving ? <LoaderCircle className="spin" size={15} /> : <Save size={15} />}Save
          </button>
          <button
            className="button primary"
            onClick={() => {
              setPlaying(false);
              setModal('export');
            }}
          >
            <ArrowUpRight size={15} />
            Export
          </button>
          <IconButton
            icon={CircleHelp}
            label="Help and keyboard shortcuts"
            onClick={() => setModal('help')}
          />
        </div>
      </header>
      <nav className="workspace-bar">
        <div className="workspace-tabs">
          {(
            [
              { id: 'scene', icon: Layers3, label: 'Layout' },
              { id: 'animate', icon: Diamond, label: 'Animation' },
              { id: 'face', icon: Eye, label: 'Character' },
              { id: 'lighting', icon: Sun, label: 'Lighting' },
              { id: 'shots', icon: CameraGlyph, label: 'Shots' },
            ] as const
          ).map((tab) => (
            <button
              className={workspace === tab.id ? 'selected' : ''}
              key={tab.id}
              onClick={() => {
                if(tab.id==='face')openFace();else setWorkspace(tab.id);
                if (tab.id === 'animate') setTimelineHeight(Math.max(timelineHeight, 320));
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="viewport-bar">
          <span className="view-type">
            <Box size={13} />
            {preview ? 'Scene camera' : 'User perspective'}
            <ChevronDown size={11} />
          </span>
          <div className="viewport-options">
            <div className="add-menu-wrap">
              <button className="editor-menu" onClick={() => setAddMenu((v) => !v)}>
                Add
              </button>
              {addMenu && (
                <div className="dropdown add-dropdown">
                  {[
                    { type: 'character', label: 'Character', icon: ArmatureIcon },
                    { type: 'block', label: 'Mesh Block', icon: MeshIcon },
                    { type: 'camera', label: 'Camera', icon: CameraGlyph },
                    { type: 'group', label: 'Group', icon: Layers3 },
                    { type: 'item', label: 'Minecraft Item', icon: MeshIcon },
                    { type: 'effect', label: 'Particle Effect', icon: DiamondPlus },
                    { type: 'light', label: 'Point Light', icon: LightIcon },
                  ].map((item) => (
                    <button
                      key={item.label}
                      onClick={() => {
                        addObject(item.type as SceneObject['type']);
                        setAddMenu(false);
                      }}
                    >
                      <item.icon size={14} />
                      {item.label}
                    </button>
                  ))}
                  <button onClick={() => { newBuild(); setAddMenu(false); }}><Box size={14}/> Block Build</button>
                  <button
                    onClick={() => {
                      addObject('light', undefined, 'area');
                      setAddMenu(false);
                    }}
                  >
                    <LightIcon size={14} />
                    Area Light
                  </button>
                  <button
                    onClick={() => {
                      addObject('light', undefined, 'spot');
                      setAddMenu(false);
                    }}
                  >
                    <LightIcon size={14} />
                    Spot Light
                  </button>
                </div>
              )}
            </div>
            <IconButton
              icon={PanelLeftClose}
              label="Toggle scene panel"
              active={!showLeft}
              onClick={() => setShowLeft((v) => !v)}
            />
            <IconButton
              icon={Grid2X2}
              label="Toggle viewport overlays"
              active={helpers}
              onClick={() => setHelpers((v) => !v)}
            />
            <select
              aria-label="Viewport shading"
              value={shading}
              onChange={(e) => setShading(e.target.value as typeof shading)}
            >
              <option value="rendered">Rendered</option>
              <option value="solid">Studio fill</option>
              <option value="wireframe">Wireframe</option>
            </select>
            <span className="divider" />
            <select
              aria-label="Viewport quality"
              value={quality}
              onChange={(e) => setQuality(e.target.value as Quality)}
            >
              <option value="draft">Draft</option>
              <option value="balanced">Balanced</option>
              <option value="high">High quality</option>
            </select>
            <IconButton
              icon={PanelRightClose}
              label="Toggle properties panel"
              active={!showRight}
              onClick={() => setShowRight((v) => !v)}
            />
          </div>
        </div>
      </nav>
      <main className="editor-main">
        {showLeft && (
          <aside className="scene-panel">
            <div className="panel-heading">
              <span className="panel-kicker">Scene Collection</span>
              <span className="count-badge">{project.objects.length}</span>
            </div>
            <div className="scene-search">
              <Search size={14} />
              <input
                aria-label="Search objects"
                placeholder="Search objects…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="collection-label">
              <ChevronDown size={13} />
              <Layers3 size={13} />
              <span>Scene 01</span>
            </div>
            <div className="object-list">
              {hierarchyRows(project.objects)
                .filter(({ object: o }) => o.name.toLowerCase().includes(search.toLowerCase()))
                .map(({ object: o, depth }) => {
                  const Icon = objectIcon(o.type),
                    isExpanded = expanded.has(o.id);
                  return (
                    <div key={o.id}>
                      <div
                        style={{ paddingLeft: depth * 12 }}
                        className={`object-row ${selection?.id === o.id && !selection.bone ? 'selected' : ''} ${!o.visible ? 'hidden-object' : ''}`}
                      >
                        <button
                          className="expand-button"
                          disabled={o.type !== 'character'}
                          aria-label={`Expand ${o.name}`}
                          onClick={() =>
                            setExpanded((set) => {
                              const next = new Set(set);
                              if (next.has(o.id)) next.delete(o.id);
                              else next.add(o.id);
                              return next;
                            })
                          }
                        >
                          {o.type === 'character' &&
                            (isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />)}
                        </button>
                        <button className="object-select" onClick={() => choose({ id: o.id })}>
                          <Icon size={15} />
                          <span>{o.name}</span>
                        </button>
                        <button
                          className="visibility-button"
                          aria-label={`${o.visible ? 'Hide' : 'Show'} ${o.name}`}
                          title={`${o.visible ? 'Hide' : 'Show'} object`}
                          onClick={() =>
                            commit((p) => ({
                              ...p,
                              objects: p.objects.map((obj) =>
                                obj.id === o.id ? { ...obj, visible: !obj.visible } : obj,
                              ),
                            }))
                          }
                        >
                          {o.visible ? <Eye size={12} /> : <EyeOff size={12} />}
                        </button>
                      </div>
                      {o.type === 'character' &&
                        isExpanded &&
                        bones.map((b) => (
                          <button
                            key={b}
                            className={`bone-row ${selection?.id === o.id && selection.bone === b ? 'selected' : ''}`}
                            onClick={() => {
                              choose({ id: o.id, bone: b });
                              setMode('rotate');
                            }}
                          >
                            <span className="bone-connector" />
                            <BoneIcon size={12} />
                            <span>{boneLabels[b]}</span>
                            {project.tracks[`${o.id}/${b}`]?.length > 0 && (
                              <Diamond size={8} className="track-dot" />
                            )}
                          </button>
                        ))}
                    </div>
                  );
                })}
              {!project.objects.length && (
                <div className="empty-panel">
                  <Box size={28} />
                  <p>No objects in this collection.</p>
                  <button onClick={() => setModal('import')}>Import an asset</button>
                </div>
              )}
            </div>
            <div
              className="scene-light-row"
              onClick={() => setWorkspace('lighting')}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter') setWorkspace('lighting');
              }}
            >
              <Sun size={14} />
              <span>Environment lighting</span>
              <Settings2 size={12} />
            </div>
            <div className="asset-shelf">
              <div className="panel-heading">
                <span className="panel-kicker">Add Object</span>
                <Plus size={13} />
              </div>
              <div className="asset-grid">
                {[
                  { icon: ArmatureIcon, label: 'Character', type: 'character' },
                  { icon: Box, label: 'Block', type: 'block' },
                  { icon: CameraGlyph, label: 'Camera', type: 'camera' },
                  { icon: LightIcon, label: 'Point light', type: 'light' },
                ].map((a) => (
                  <button key={a.label} onClick={() => addObject(a.type as SceneObject['type'])}>
                    <a.icon size={21} strokeWidth={1.3} />
                    <span>{a.label}</span>
                    <Plus size={10} />
                  </button>
                ))}
              </div>
              <button className="asset-import" onClick={() => setModal('import')}>
                <ArrowDownToLine size={13} />
                Import skin, build or world
              </button>
            </div>
            <div
              className="panel-resize right-edge"
              onPointerDown={(e) => resizePanel(e, 'left')}
            />
          </aside>
        )}
        <section className="viewport-shell" aria-label="Scene workspace">
          <div className="viewport-canvas" ref={viewport} />
          {workspace==='face'&&<FaceWorkspace actors={faceActors} actor={faceActor} project={project}
            skin={faceActor&&gameAssets?.textures[`minecraft:entity/player/${faceActor.slim?'slim':'wide'}/alex`]}
            textures={gameAssets?.textures}
            keys={faceActor&&project.faceTracks?.[faceActor.id]} frame={frame} duration={project.duration}
            fps={project.fps} autoKey={autoKey} playing={playing} onActor={openFace}
            onSeek={seek} onPlay={startAnimation} onEdit={editFace} onAutoKey={()=>setAutoKey(v=>!v)}
            onHeadwear={visible=>commit(p=>({...p,objects:p.objects.map(o=>o.id===faceActor?.id
              ?{...o,characterLayers:{...o.characterLayers,headwear:{offset:o.characterLayers?.headwear?.offset??0,visible}}}:o)}))}
            onLayers={characterLayers=>editCharacter({characterLayers})}
            onLook={characterLook=>editCharacter({characterLook})}/>}
          <div className="viewport-caption">
            <span>{preview ? 'CAMERA PERSPECTIVE' : 'USER PERSPECTIVE'}</span>
            <small>
              {object
                ? `${object.name}${selection?.bone ? ' / ' + boneLabels[selection.bone] : ''}`
                : 'Scene overview'}
              {!preview && ' · ' + (local ? 'Local' : 'World')}
            </small>
          </div>
          <div className="transform-toolbar">
            {[
              { icon: MoveIcon, label: 'Move (G)', value: 'translate' },
              { icon: RotateIcon, label: 'Rotate (R)', value: 'rotate' },
              { icon: ScaleIcon, label: 'Scale (S)', value: 'scale' },
            ].map((t) => (
              <IconButton
                key={t.value}
                icon={t.icon}
                label={t.label}
                active={mode === t.value}
                onClick={() => setMode(t.value as typeof mode)}
              />
            ))}
            <span />
            <IconButton
              icon={Maximize}
              label="Frame selection (F)"
              onClick={() => engine.current?.frameSelection()}
            />
            <IconButton
              icon={CameraGlyph}
              label="Camera preview (Numpad 0)"
              active={preview}
              onClick={() => setPreview((v) => !v)}
            />
            {workspace==='shots'&&<IconButton icon={DiamondPlus} label="Capture camera view key (K)" disabled={preview} onClick={captureViewKey}/>}
          </div>
          <div className="viewport-top-controls">
            <IconButton icon={Hand} label={flyView ? 'Exit fly navigation (V)' : 'Fly navigation (V)'} active={flyView} onClick={toggleFly}/>
            <button onClick={() => setLocal((v) => !v)} title="Transform coordinate space">
              {local ? 'Local' : 'World'}
              <ChevronDown size={10} />
            </button>
            <IconButton
              icon={Magnet}
              label="Snap transforms: 0.25 blocks / 15 degrees"
              active={snap}
              onClick={() => setSnap((v) => !v)}
            />
          </div>
          <div className="view-gizmo">
            <button
              className="axis-y"
              title="Top view (7)"
              onClick={() => engine.current?.view('top')}
            >
              Y
            </button>
            <button
              className="axis-z"
              title="Front view (1)"
              onClick={() => engine.current?.view('front')}
            >
              Z
            </button>
            <button
              className="axis-x"
              title="Right view (3)"
              onClick={() => engine.current?.view('right')}
            >
              X
            </button>
            <button
              className="gizmo-center"
              title="Perspective view"
              onClick={() => engine.current?.view('perspective')}
            />
          </div>
          <div className="viewport-bottom">
            <span>
              <MousePointer2 size={11} />
              Orbit <b>drag</b>
              <i />
              Pan <b>RMB</b>
              <i />
              Zoom <b>scroll</b>
              <i />
              Frame <kbd>F</kbd>
            </span>
            <button onClick={() => engine.current?.frameSelection(true)}>
              <Maximize size={12} />
              Frame All
            </button>
          </div>
          {preview && (
            <div className="camera-preview-tag">
              <CameraGlyph size={13} />
              Scene camera · 16:9
              <button onClick={() => setPreview(false)}>
                <X size={12} />
              </button>
            </div>
          )}
          {!project.objects.length && (
            <div className="viewport-empty">
              <div className="empty-cube">
                <Box size={38} strokeWidth={1} />
              </div>
              <h2>Empty Scene</h2>
              <p>Add an object or import Minecraft assets.</p>
              <button className="button primary" onClick={() => setModal('import')}>
                <Plus size={14} />
                Import your first asset
              </button>
            </div>
          )}
          {error && (
            <div className="viewport-error" role="alert">
              <h3>Graphics engine</h3>
              <p>{error}</p>
              <button className="button" onClick={() => setError('')}>
                Dismiss
              </button>
            </div>
          )}
          {recovery && (
            <div className="recovery-banner">
              <Save size={15} />
              <div>
                <strong>Previous session found</strong>
                <span>
                  {recovery.name} · {recovery.objects.length} objects
                </span>
              </div>
              <button
                onClick={() => {
                  replaceProject(recovery);
                  setDirty(true);
                  notice('Recovered your previous session.');
                }}
              >
                Restore
              </button>
              <button aria-label="Dismiss recovery" onClick={() => setRecovery(null)}>
                <X size={13} />
              </button>
            </div>
          )}
        </section>
        {showRight && (
          <aside className="inspector">
            <div
              className="panel-resize left-edge"
              onPointerDown={(e) => resizePanel(e, 'right')}
            />
            <div className="panel-heading">
              <span className="panel-kicker">
                {workspace === 'lighting'
                  ? 'World Properties'
                  : workspace === 'shots'
                    ? 'Camera Studio'
                    : 'Object Properties'}
              </span>
              <SlidersHorizontal size={13} />
            </div>
            <div className="inspector-scroll">
              {workspace === 'shots' ? (
                <>
                <nav className="camera-workspace-tabs" aria-label="Camera studio tools">
                  {([['path','Path'],['effects','Effects'],['cuts','Cuts']] as const).map(([tab,label])=><button key={tab} className="button compact" aria-pressed={shotsTab===tab} onClick={()=>setShotsTab(tab)}>{label}</button>)}
                </nav>
                {shotsTab==='path'&&<CameraRailPanel camera={railCamera} keys={railCamera?project.tracks[railCamera.id]||[]:[]} frame={frame} fps={project.fps} lens={viewLens} flying={flyView} guides={cameraGuides} preview={preview} onCapture={captureViewKey} onRecall={recallView} onFly={()=>{setPreview(false);setFlyView(v=>!v);}} onPreview={()=>{engine.current?.setPreviewCamera(undefined);setPreview(v=>!v);}} onGuides={()=>setCameraGuides(v=>!v)} onLens={lens=>{setViewLens(lens);engine.current?.setViewLens(lens);}} onMode={cameraRail=>railCamera&&commit(p=>({...p,objects:p.objects.map(o=>o.id===railCamera.id?{...o,cameraRail}:o)}))} onMove={buildCameraMove} onCut={addCameraCut}/>}
                {shotsTab==='effects'&&<CameraEffectsPanel camera={railCamera} shot={activeCameraCut} objects={project.objects}
                  frame={frame} fps={project.fps} preview={preview} onCamera={id=>{choose({id});if(preview)engine.current?.setPreviewCamera(id);}}
                  onCreate={()=>addObject('camera')} onPreview={previewCameraEffects} onChange={editCameraEffects} onFrame={seek}/>}
                {shotsTab==='cuts'&&<ShotPanel
                  project={project}
                  frame={frame}
                  onCommit={commit}
                  onFrame={seek}
                  onSelect={(s) => {
                    choose(s);
                    setWorkspace('scene');
                  }}
                  onCreateCamera={() => addObject('camera')}
                />}</>
              ) : workspace === 'lighting' ? (
                <>
                  <div className="inspector-title">
                    <div className="object-type-icon">
                      <Sun size={20} />
                    </div>
                    <div>
                      <h2>Scene lighting</h2>
                      <p>Sun, sky and atmosphere</p>
                    </div>
                  </div>
                  <CinematicPanel lighting={lighting} onApply={mode=>{const context=engine.current?.cinematicContext(selection?.id);commit(p=>applyCinematicPreset(p,mode,context));}} onChange={cinematic=>updateLighting({cinematic})} onPreview={cinematic=>engine.current?.previewLighting({cinematic})} onFocus={()=>engine.current?.cinematicContext(selection?.id)}/>
                  <Section title="Foliage wind">
                    <label className="check-row"><input type="checkbox" checked={wind.enabled}
                      onChange={(e) => updateWind({ enabled: e.target.checked })}/> Animate foliage</label>
                    {wind.enabled && windControls.map(([key, label, min, max, step]) => (
                      <Slider key={key} label={label} value={wind[key]} min={min} max={max} step={step}
                        onChange={(value) => updateWind({ [key]: value })}/>
                    ))}
                  </Section>
                  <Section title="Lighting presets">
                    <button
                      className="button full studio-setup"
                      onClick={() => {
                        const target = object?.transform.position || [0, 0, 0],
                          center: [number, number, number] = [
                            target[0],
                            target[1] + 1.2,
                            target[2],
                          ];
                        const specs = [
                          {
                            name: 'Key',
                            position: [center[0] + 4, center[1] + 4, center[2] + 4],
                            intensity: 8,
                            width: 4,
                            height: 4,
                            color: '#fff0dd',
                          },
                          {
                            name: 'Fill',
                            position: [center[0] - 4, center[1] + 2, center[2] + 3],
                            intensity: 3,
                            width: 5,
                            height: 5,
                            color: '#dfeaff',
                          },
                          {
                            name: 'Rim',
                            position: [center[0] - 1, center[1] + 4, center[2] - 4],
                            intensity: 12,
                            width: 3,
                            height: 3,
                            color: '#ffffff',
                          },
                        ];
                        commit((p) => ({
                          ...p,
                          lighting: {
                            ...p.lighting,
                            sun: 0,
                            ambient: 0.25,
                            environment: 0.15,
                            sky: '#242424',
                            ground: true,
                            ao: true,
                            aoIntensity: 0.7,
                            toneMapping: 'agx',
                          },
                          objects: [
                            ...p.objects.filter((o) => !o.id.startsWith('studio-light-')),
                            ...specs.map((spec, i) => ({
                              id: 'studio-light-' + i,
                              name: spec.name + ' · Area',
                              type: 'light' as const,
                              visible: true,
                              lightType: 'area' as const,
                              color: spec.color,
                              intensity: spec.intensity,
                              width: spec.width,
                              height: spec.height,
                              transform: lookAtTransform(
                                spec.position as [number, number, number],
                                center,
                              ),
                            })),
                          ],
                        }));
                      }}
                    >
                      Add Three-Point Studio Rig
                    </button>
                    <div className="lighting-presets">
                      {[
                        {
                          name: 'Daylight',
                          values: {
                            ...defaultLighting,
                            azimuth: -35,
                            elevation: 50,
                            sky: '#81969d',
                            warmth: '#fff0d9',
                          },
                        },
                        {
                          name: 'Golden hour',
                          values: {
                            ...defaultLighting,
                            sun: 3.5,
                            ambient: 1.1,
                            elevation: 18,
                            sky: '#a3988e',
                            warmth: '#ffba72',
                            exposure: 1.1,
                          },
                        },
                        {
                          name: 'Moonlight',
                          values: {
                            ...defaultLighting,
                            sun: 0.6,
                            ambient: 0.55,
                            elevation: 35,
                            sky: '#242e46',
                            warmth: '#9ab7ed',
                            exposure: 1.05,
                          },
                        },
                      ].map((preset) => (
                        <button key={preset.name} onClick={() => updateLighting(preset.values)}>
                          <span style={{ background: preset.values.sky }} />
                          {preset.name}
                        </button>
                      ))}
                    </div>
                  </Section>
                  <Section title="Sunlight">
                    <Slider
                      label="Strength"
                      value={lighting.sun}
                      min={0}
                      max={6}
                      onPreview={(sun) => engine.current?.previewLighting({ sun })}
                      onChange={(sun) => updateLighting({ sun })}
                    />
                    <Slider
                      label="Elevation"
                      value={lighting.elevation}
                      min={0}
                      max={90}
                      step={1}
                      suffix="°"
                      onPreview={(elevation) => engine.current?.previewLighting({ elevation })}
                      onChange={(elevation) => updateLighting({ elevation })}
                    />
                    <Slider
                      label="Direction"
                      value={lighting.azimuth}
                      min={-180}
                      max={180}
                      step={1}
                      suffix="°"
                      onPreview={(azimuth) => engine.current?.previewLighting({ azimuth })}
                      onChange={(azimuth) => updateLighting({ azimuth })}
                    />
                    <label className="color-field">
                      Light color
                      <input
                        type="color"
                        aria-label="Sun color"
                        value={lighting.warmth}
                        onChange={(e) => updateLighting({ warmth: e.target.value })}
                      />
                      <span>{lighting.warmth}</span>
                    </label>
                    <label className="check-row">
                      <input
                        type="checkbox"
                        checked={lighting.shadows}
                        onChange={(e) => updateLighting({ shadows: e.target.checked })}
                      />
                      Cast shadows
                    </label>
                  </Section>
                  <Section title="Sky and atmosphere">
                    <Slider
                      label="Sky fill"
                      value={lighting.ambient}
                      min={0}
                      max={4}
                      onPreview={(ambient) => engine.current?.previewLighting({ ambient })}
                      onChange={(ambient) => updateLighting({ ambient })}
                    />
                    <label className="color-field">
                      Background
                      <input
                        type="color"
                        aria-label="Sky background"
                        value={lighting.sky}
                        onChange={(e) => updateLighting({ sky: e.target.value })}
                      />
                      <span>{lighting.sky}</span>
                    </label>
                    <Slider
                      label="Fog"
                      value={lighting.fog}
                      min={0}
                      max={1}
                      onPreview={(fog) => engine.current?.previewLighting({ fog })}
                      onChange={(fog) => updateLighting({ fog })}
                    />
                    <Slider
                      label="Exposure"
                      value={lighting.exposure}
                      min={0.1}
                      max={3}
                      onPreview={(exposure) => engine.current?.previewLighting({ exposure })}
                      onChange={(exposure) => updateLighting({ exposure })}
                    />
                    <label className="check-row">
                      <input
                        type="checkbox"
                        checked={lighting.ground}
                        onChange={(e) => updateLighting({ ground: e.target.checked })}
                      />
                      Studio ground plane
                    </label>
                  </Section>
                  <Section title="Color Management">
                    <label className="select-row">
                      View Transform
                      <select
                        aria-label="View transform"
                        value={lighting.toneMapping || 'agx'}
                        onChange={(e) =>
                          updateLighting({ toneMapping: e.target.value as Lighting['toneMapping'] })
                        }
                      >
                        <option value="agx">AgX</option>
                        <option value="aces">ACES Filmic</option>
                        <option value="neutral">Neutral</option>
                      </select>
                    </label>
                    <Slider
                      label="Environment"
                      value={lighting.environment ?? 0.25}
                      min={0}
                      max={2}
                      onPreview={(environment) => engine.current?.previewLighting({ environment })}
                      onChange={(environment) => updateLighting({ environment })}
                    />
                    <Slider
                      label="Shadow Softness"
                      value={lighting.softness ?? 2.5}
                      min={0.1}
                      max={6}
                      onPreview={(softness) => engine.current?.previewLighting({ softness })}
                      onChange={(softness) => updateLighting({ softness })}
                    />
                  </Section>
                  <Section title="Render Effects">
                    <label className="check-row">
                      <input
                        type="checkbox"
                        checked={lighting.ao !== false}
                        onChange={(e) => updateLighting({ ao: e.target.checked })}
                      />
                      Contact Occlusion
                    </label>
                    <Slider
                      label="Occlusion Strength"
                      value={lighting.aoIntensity ?? 0.8}
                      min={0}
                      max={2}
                      onPreview={(aoIntensity) => engine.current?.previewLighting({ aoIntensity })}
                      onChange={(aoIntensity) => updateLighting({ aoIntensity })}
                    />
                    <label className="check-row">
                      <input
                        type="checkbox"
                        checked={lighting.bloom === true}
                        onChange={(e) => updateLighting({ bloom: e.target.checked })}
                      />
                      Bloom
                    </label>
                    <Slider
                      label="Bloom Strength"
                      value={lighting.bloomStrength ?? 0.12}
                      min={0}
                      max={1}
                      onPreview={(bloomStrength) =>
                        engine.current?.previewLighting({ bloomStrength })
                      }
                      onChange={(bloomStrength) => updateLighting({ bloomStrength })}
                    />
                    <p className="hint">
                      Draft bypasses contact occlusion and bloom. Balanced computes occlusion at
                      half resolution; High uses full resolution.
                    </p>
                  </Section>
                  <Section title="Viewport performance">
                    <label className="select-row">
                      Quality
                      <select
                        value={quality}
                        onChange={(e) => setQuality(e.target.value as Quality)}
                      >
                        <option value="draft">Draft · 512px shadows</option>
                        <option value="balanced">Balanced · 1024px shadows</option>
                        <option value="high">High · 2048px shadows</option>
                      </select>
                    </label>
                    <p className="hint">
                      Raster lighting and baked corner shading. Rendering pauses when the scene is
                      idle.
                    </p>
                  </Section>
                </>
              ) : object && selection ? (
                <>
                  <div className="inspector-title">
                    <div className="object-type-icon">
                      {selection.bone ? <Box size={19} /> : <UserRoundIcon type={object.type} />}
                    </div>
                    <div>
                      {selection.bone ? (
                        <h2>{boneLabels[selection.bone]}</h2>
                      ) : (
                        <input
                          className="object-name-input"
                          aria-label="Object name"
                          key={object.id + object.name}
                          defaultValue={object.name}
                          maxLength={100}
                          onBlur={(e) => {
                            const name = e.target.value.trim() || object.name;
                            if (name !== object.name) updateObject({ name });
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') e.currentTarget.blur();
                          }}
                        />
                      )}
                      <p>
                        {selection.bone
                          ? object.name
                          : object.type === 'character'
                            ? `${object.slim ? 'Slim' : 'Classic'} rig · ${bones.length} bones`
                            : object.type === 'build'
                              ? `${object.voxels?.blocks.length.toLocaleString()} blocks · chunk mesh`
                              : object.type === 'camera'
                                ? 'Perspective camera'
                                : object.type === 'light'
                                  ? 'Point light'
                                  : 'Minecraft block'}
                      </p>
                    </div>
                  </div>
                  <Section
                    title="Transform"
                    aside={
                      <button
                        className="section-action"
                        title="Reset transform"
                        onClick={() => editTransform(selection, identity())}
                      >
                        <RotateCcw size={12} />
                      </button>
                    }
                  >
                    <fieldset className="transform-fields" disabled={object.locked}>
                      <VectorField
                        label="Position"
                        value={transform.position}
                        onCommit={(position) =>
                          editTransform(selection, { ...transform, position })
                        }
                      />
                      <VectorField
                        label="Rotation"
                        value={transform.rotation}
                        rotation
                        onCommit={(rotation) =>
                          editTransform(selection, { ...transform, rotation })
                        }
                      />
                      <VectorField
                        label="Scale"
                        value={transform.scale}
                        scale
                        onCommit={(scale) => editTransform(selection, { ...transform, scale })}
                      />
                    </fieldset>
                  </Section>
                  {!selection.bone && (
                    <Section title="Parent & Attachment">
                      <label className="select-row">
                        Attach to
                        <select
                          aria-label="Object parent"
                          value={
                            object.parentId
                              ? `${object.parentId}${object.parentBone ? '/' + object.parentBone : ''}`
                              : ''
                          }
                          onChange={(e) => {
                            const [parentId, parentBone] = e.target.value.split('/');
                            const transform =
                              engine.current?.attachmentTransform(
                                object.id,
                                parentId || undefined,
                                parentBone,
                              ) || object.transform;
                            updateObject({
                              parentId: parentId || undefined,
                              parentBone: parentBone as BoneName | undefined,
                              transform,
                            });
                          }}
                        >
                          <option value="">Scene root</option>
                          {project.objects
                            .filter((o) => !descendants(project.objects, object.id).has(o.id))
                            .map((o) => (
                              <optgroup key={o.id} label={o.name}>
                                <option value={o.id}>{o.name}</option>
                                {o.type === 'character' &&
                                  bones.map((bone) => (
                                    <option key={bone} value={`${o.id}/${bone}`}>
                                      {o.name} / {boneLabels[bone]}
                                    </option>
                                  ))}
                              </optgroup>
                            ))}
                        </select>
                      </label>
                      <label className="check-row">
                        <input
                          type="checkbox"
                          checked={!!object.locked}
                          onChange={(e) => updateObject({ locked: e.target.checked })}
                        />
                        Lock transforms
                      </label>
                      <p className="hint">
                        Attached objects follow the parent or bone. Transform fields and animation
                        keys use the parent's local coordinates.
                      </p>
                    </Section>
                  )}
                  <Section title="Animation">
                    <label className="select-row">
                      Interpolation
                      <select
                        aria-label="Keyframe interpolation"
                        value={keyInterpolation}
                        disabled={object.locked}
                        onChange={(e) =>
                          changeInterpolation(e.target.value as Keyframe['interpolation'])
                        }
                      >
                        <option value="smooth">Smooth</option>
                        {!selectedFace && <option value="spline">Continuous spline</option>}
                        <option value="linear">Linear</option>
                        <option value="step">Constant</option>
                        {!selectedFace && <option value="bezier">Bézier</option>}
                      </select>
                    </label>
                    <button className="insert-key-button" onClick={insert}>
                      <DiamondPlus size={14} />
                      Insert keyframe<kbd>I</kbd>
                    </button>
                    <p className="hint">
                      {selectedKey
                        ? `Selected key: frame ${selectedKey.frame}. Drag it in the timeline or press Delete.`
                        : selectedTrack?.length
                          ? `${selectedTrack.length} keys. Changes update a key at the playhead.`
                          : 'Pose this object, then insert a key at the current frame.'}
                    </p>
                  </Section>
                  {object.type === 'character' && (
                    <>
                      <MovementPanel staged={!!stageFor(project,object)} route={route?.actor===object.id ? route.points.length : 0}
                        locked={!!object.locked} seconds={routeSeconds} facing={routeFacing} walk={routeWalk}
                        onMovement={selectMovement} onStart={startRoute} onFinish={finishRoute} onCancel={()=>setRoute(undefined)}
                        onRemove={()=>setRoute(value=>value&&({...value,points:value.points.slice(0,-1)}))}
                        onSeconds={setRouteSeconds} onFacing={setRouteFacing} onWalk={setRouteWalk}/>
                      <EquipmentPanel actor={object} objects={project.objects} items={catalog.items}
                        onEquip={equip} onArmor={armor=>updateObject({armor})}/>
                      <MotionPanel
                        project={project}
                        id={object.id}
                        frame={frame}
                        onCommit={commit}
                        onNotice={notice}
                      />
                      <button className="button full" onClick={()=>openFace(object.id)}><Eye size={14}/> Open Character Editor</button>
                      <RigPanel
                        project={project}
                        id={object.id}
                        onCommit={commit}
                        onSelect={choose}
                        getPosition={(bone) =>
                          engine.current?.boneTargetPosition(object.id, bone) || [0, 1, 0]
                        }
                      />
                      <Section title="Quick poses">
                        <div className="pose-buttons">
                          <button onClick={() => pose('neutral')}>Neutral</button>
                          <button onClick={() => pose('walk')}>Walk</button>
                          <button onClick={() => pose('wave')}>Wave</button>
                        </div>
                      </Section>
                      {!selection.bone && (
                        <Section title="Character">
                          <label className="check-row">
                            <input
                              type="checkbox"
                              checked={!!object.slim}
                              onChange={(e) => updateObject({ slim: e.target.checked })}
                            />
                            Slim arms
                          </label>
                          <button className="button full" onClick={() => setModal('import')}>
                            <ArrowDownToLine size={13} />
                            Import another skin
                          </button>
                          <p className="hint">
                            Select a body part in the scene list to pose it. Click a selected
                            character again to pick a bone.
                          </p>
                        </Section>
                      )}
                    </>
                  )}
                  {object.type === 'effect' && (
                    <EffectPanel
                      effect={object.effect || effectDefaults}
                      onChange={(effect) => updateObject({ effect })}
                    />
                  )}
                  {object.type === 'item' && (
                    <Section title="Minecraft Item">
                      <select
                        className="full"
                        aria-label="Minecraft item"
                        value={object.item || 'minecraft:item/diamond_sword'}
                        onChange={(e) => updateObject({ item: e.target.value })}
                      >
                        {Object.keys(gameAssets?.textures || {})
                          .filter((name) => name.startsWith('minecraft:item/'))
                          .sort()
                          .map((name) => (
                            <option key={name} value={name}>
                              {name.replace('minecraft:item/', '').replaceAll('_', ' ')}
                            </option>
                          ))}
                      </select>
                      <p className="hint">
                        The original item sprite is extruded into a 3D silhouette. Attach it to a
                        hand using Parent & Attachment.
                      </p>
                    </Section>
                  )}
                  {object.type === 'build' && <BlockTools mode={blockTool} brush={brush} locked={!!object.locked}
                    blocks={catalog.blocks} onBrush={setBrush} onMode={mode=>{setRoute(undefined);setPreview(false);setBlockTool(mode);}}/>}
                  {['build','block','item'].includes(object.type) &&
                    <SurfacePanel value={object.surfaceEffect} onChange={surfaceEffect=>updateObject({surfaceEffect})}/>}
                  {object.type === 'block' && (
                    <Section title="Block material">
                      <select
                        className="full"
                        aria-label="Block type"
                        value={object.block || 'minecraft:grass_block'}
                        onChange={(e) => updateObject({ block: e.target.value })}
                      >
                        {(gameAssets
                          ? Object.keys(gameAssets.blockstates)
                              .filter(
                                (id) =>
                                  id.startsWith('minecraft:') &&
                                  !/:(air|void_air|cave_air|structure_void|moving_piston|light|barrier)$/.test(
                                    id,
                                  ),
                              )
                              .map((id) => id.replace('minecraft:', ''))
                              .sort()
                          : ['grass_block', 'stone', 'oak_planks']
                        ).map((b) => (
                          <option key={b} value={`minecraft:${b}`}>
                            {b.replaceAll('_', ' ')}
                          </option>
                        ))}
                      </select>
                    </Section>
                  )}
                  {object.type === 'light' && (
                    <Section title="Light">
                      <label className="select-row">
                        Type
                        <select
                          aria-label="Light type"
                          value={object.lightType || 'point'}
                          onChange={(e) =>
                            updateObject({ lightType: e.target.value as SceneObject['lightType'] })
                          }
                        >
                          <option value="point">Point</option>
                          <option value="area">Area</option>
                          <option value="spot">Spot</option>
                        </select>
                      </label>
                      {object.lightType === 'area' && (
                        <div className="field-pair">
                          <label>
                            Size X
                            <NumberField
                              label="Area width"
                              value={object.width ?? 4}
                              min={0.01}
                              max={100}
                              onCommit={(width) => updateObject({ width })}
                            />
                          </label>
                          <label>
                            Size Y
                            <NumberField
                              label="Area height"
                              value={object.height ?? 4}
                              min={0.01}
                              max={100}
                              onCommit={(height) => updateObject({ height })}
                            />
                          </label>
                        </div>
                      )}
                      {object.lightType === 'spot' && (
                        <>
                          <Slider
                            label="Spot Angle"
                            value={object.angle ?? 45}
                            min={1}
                            max={85}
                            step={1}
                            suffix="°"
                            onChange={(angle) => updateObject({ angle })}
                          />
                        </>
                      )}
                      {object.lightType !== 'area' && (
                        <label className="check-row">
                          <input
                            type="checkbox"
                            checked={object.lightShadows === true}
                            onChange={(e) => updateObject({ lightShadows: e.target.checked })}
                          />
                          Cast Shadows
                        </label>
                      )}
                      <Slider
                        label="Power"
                        value={object.intensity ?? 20}
                        min={0}
                        max={150}
                        onChange={(intensity) => updateObject({ intensity })}
                      />
                      <label className="color-field">
                        Color
                        <input
                          aria-label="Point light color"
                          type="color"
                          value={object.color || '#ffd8a3'}
                          onChange={(e) => updateObject({ color: e.target.value })}
                        />
                      </label>
                      <p className="hint">
                        Point lights use inverse-square falloff. Area lights provide broad PBR
                        illumination without shadow maps. Point and spot shadows are optional.
                      </p>
                    </Section>
                  )}
                  {object.type === 'camera' && (
                    <Section title="Camera">
                      <button
                        className="button full"
                        onClick={() => {
                          commit((p) => ({ ...p, activeCameraId: object.id }));
                          setPreview(true);
                        }}
                      >
                        {project.activeCameraId === object.id
                          ? 'Active Camera'
                          : 'Use as Active Camera'}
                      </button>
                      <label className="select-row">
                        Track target
                        <select
                          aria-label="Camera tracking target"
                          value={
                            object.cameraTarget
                              ? `${object.cameraTarget}${object.targetBone ? '/' + object.targetBone : ''}`
                              : ''
                          }
                          onChange={(e) => {
                            const [cameraTarget, targetBone] = e.target.value.split('/');
                            updateObject({
                              cameraTarget: cameraTarget || undefined,
                              targetBone: targetBone as BoneName | undefined,
                            });
                          }}
                        >
                          <option value="">Manual orientation</option>
                          {project.objects
                            .filter(
                              (o) =>
                                o.id !== object.id && o.type !== 'camera' && o.type !== 'light',
                            )
                            .map((o) => (
                              <optgroup key={o.id} label={o.name}>
                                <option value={o.id}>{o.name}</option>
                                {o.type === 'character' &&
                                  bones.map((b) => (
                                    <option key={b} value={`${o.id}/${b}`}>
                                      {o.name} / {boneLabels[b]}
                                    </option>
                                  ))}
                              </optgroup>
                            ))}
                        </select>
                      </label>
                      <Slider
                        label="Field of view"
                        value={object.fov || 40}
                        min={10}
                        max={100}
                        step={1}
                        suffix="°"
                        onChange={(fov) => updateObject({ fov })}
                      />
                      <button
                        className="button full"
                        onClick={() =>
                          editTransform(selection, engine.current?.cameraTransform() || identity())
                        }
                      >
                        <CameraGlyph size={14} />
                        Camera from view
                      </button>
                      <button className="button full" onClick={() => setPreview((v) => !v)}>
                        <Eye size={14} />
                        {preview ? 'Exit camera preview' : 'Preview scene camera'}
                      </button>
                      <p className="hint">
                        Tracking keeps the camera aimed at the target while either object moves. The
                        Shots workspace adds timed cuts for preview and export.
                      </p>
                    </Section>
                  )}
                  <Section title="Object actions">
                    <div className="object-actions">
                      <button className="button" onClick={duplicate}>
                        <Copy size={13} />
                        Duplicate
                      </button>
                      <button
                        className="button danger-subtle"
                        onClick={() => {
                          setSelectedKey(null);
                          if (selection.bone) editTransform(selection, identity());
                          else {
                            commit((p) => removeObjects(p, new Set([selection.id])));
                            choose(null);
                          }
                        }}
                      >
                        <Trash2 size={13} />
                        {selection.bone ? 'Reset' : 'Delete'}
                      </button>
                    </div>
                  </Section>
                </>
              ) : (
                <div className="no-selection">
                  <MousePointer2 size={29} strokeWidth={1.2} />
                  <h3>Select something</h3>
                  <p>
                    Choose an object in the viewport or scene collection to edit its properties.
                  </p>
                  <button className="button" onClick={() => setWorkspace('lighting')}>
                    <Sun size={14} />
                    Scene lighting
                  </button>
                </div>
              )}
            </div>
            <div className="inspector-bottom">
              <span className="local-dot" />
              Local workspace
              <CircleHelp size={12} onClick={() => setModal('help')} />
            </div>
          </aside>
        )}
      </main>
      <div className="timeline-resize" onPointerDown={(e) => resizePanel(e, 'timeline')} />
      <Timeline
        project={project}
        frame={frame}
        playing={playing}
        loop={loop}
        autoKey={autoKey}
        selection={selection}
        selectedKey={selectedKey}
        onFrame={seek}
        onPlay={startAnimation}
        onLoop={() => setLoop((v) => !v)}
        onAutoKey={() => setAutoKey((v) => !v)}
        onInsert={track=>{
          if (!track || !isFaceTrack(track)) {insert();return;}
          const id=keyTrackOwner(track), current=projectRef.current, actor=current.objects.find(o=>o.id===id);
          if (actor?.type!=='character' || actor.locked) return;
          const at=frameRef.current, config={...(actor.face??defaultFaceRig),enabled:true}, keys=current.faceTracks?.[id];
          commit({...current,objects:current.objects.map(o=>o.id===id?{...o,face:config}:o),
            faceTracks:{...current.faceTracks,[id]:setFaceKey(keys,at,evaluateFace(config,keys,at,current.fps,id,false))}});
          setSelectedKey({track,frame:at});
          notice(`Face key inserted at frame ${at}.`);
        }}
        onTiming={(duration, fps) => {
          const current=projectRef.current;
          const last=Math.max(1,...Object.values(current.tracks).map(keys=>keys.at(-1)?.frame||0),...Object.values(current.faceTracks||{}).map(keys=>keys.at(-1)?.frame||0),current.shots?.at(-1)?.frame||0);
          if(duration<last){notice(`Animation or camera cuts reach frame ${last}. Move or remove those keys before shortening the scene.`);return false;}
          commit((p) => ({
            ...p,
            duration,
            fps,
            playbackRange: p.playbackRange
              ? [Math.min(p.playbackRange[0], duration), Math.min(p.playbackRange[1], duration)]
              : undefined,
          }));
          seek(Math.min(frame, duration));
          return true;
        }}
        onSelectKey={(key, s) => {
          if (s?.id !== selection?.id || s?.bone !== selection?.bone) choose(s);
          setSelectedKey(key);
        }}
        onRange={playbackRange=>commit(p=>({...p,playbackRange}))}
        onSelect={choose}
        onEditFace={openFace}
        cameraEvents={(activeCameraCut?.cameraId===railCamera?.id ? activeCameraCut?.cameraEffects ?? railCamera?.cameraEffects : railCamera?.cameraEffects)?.events.filter(event=>event.start<=project.duration)}
        onMoveKeys={(keys, delta, anchor) => {
          const current = projectRef.current,
            next = moveKeys(current, keys, delta);
          if (next === current) {
            const locked = keys.some(key => current.objects.some(o => o.id === keyTrackOwner(key.track) && o.locked));
            notice(locked ? 'Unlock the selected tracks before moving their keys.' : 'Keys cannot overlap existing unselected keys.');
            return false;
          }
          commit(next);
          setSelectedKey({...anchor,frame:anchor.frame+delta});
          seek(anchor.frame + delta);
          return true;
        }}
        onDeleteKeys={(keys) => {
          const current = projectRef.current, locked = new Set(current.objects.filter(o=>o.locked).map(o=>o.id));
          const editable = keys.filter(key=>!locked.has(keyTrackOwner(key.track)));
          commit(deleteKeys(current,editable));
          setSelectedKey(null);
          notice(editable.length ? `Deleted ${editable.length} ${editable.length===1?'key':'keys'}.${editable.length<keys.length?' Locked tracks were skipped.':''}` : 'Unlock these tracks before deleting their keys.');
        }}
        onPasteKeys={(keys, frame, options) => {
          const result = pasteKeyBatch(projectRef.current,keys,frame,options);
          if(result.error) notice(result.error);
          if(result.keys.length){
            commit(result.project);
            seek(frame);
            notice(`Pasted ${result.keys.length} ${result.keys.length===1?'key':'keys'} at frame ${frame}.${result.replaced?` Replaced ${result.replaced}.`:''}`);
          }
          return result.keys;
        }}
        onPatchKey={(track, from, key) => {
          if(from!==key.frame&&projectRef.current.tracks[track]?.some(k=>k.frame===key.frame)){notice('That frame already contains a key.');return;}
          commit((p) => ({
            ...p,
            tracks: {
              ...p.tracks,
              [track]: [
                ...(p.tracks[track] || []).filter((k) => k.frame !== from && k.frame !== key.frame),
                key,
              ].sort((a, b) => a.frame - b.frame),
            },
          }));
          setSelectedKey({ track, frame: key.frame });
          seek(key.frame);
        }}
        leftWidth={210}
      />
      <footer className="status-bar">
        <button className="resource-status" onClick={() => setAssetDialog(true)}>
          {assetsLoading
            ? 'Loading Minecraft resources…'
            : gameAssets
              ? 'Minecraft ' + gameAssets.version + ' · Original Assets'
              : 'Minecraft Resources Required'}
        </button>
        <div>
          <span className="local-dot" />
          {saving
            ? 'Saving project…'
            : dirty
              ? autosaved
                ? 'Recovery saved locally'
                : 'Unsaved changes'
              : 'Ready'}
          <span className="status-separator" />
          {project.objects.length} objects
        </div>
        <div>
          <span>
            {stats.fps === 0 ? 'Idle · on-demand rendering' : `${stats.fps} viewport fps`}
          </span>
          <span className="status-separator" />
          <span>{stats.calls} draws</span>
          <span>{stats.triangles.toLocaleString()} triangles</span>
          <span className="status-separator" />
          <span>WebGL2</span>
          <span className="quality-tag">{quality}</span>
        </div>
      </footer>
      <input
        ref={openInput}
        type="file"
        accept=".voxel,.json"
        hidden
        aria-label="Open project file"
        onChange={(e) => {
          openProject(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={16} />
          <span>{toast}</span>
          <button aria-label="Dismiss notification" onClick={() => setToast('')}>
            <X size={13} />
          </button>
        </div>
      )}
      {assetDialog && (
        <AssetDialog
          assets={gameAssets}
          versions={assetVersions}
          loading={assetsLoading}
          error={assetsError}
          missing={[...(engine.current?.library.missing || [])]}
          onVersion={loadGameVersion}
          onArchive={async (file) =>
            loadArchive(new Uint8Array(await file.arrayBuffer()), file.name, file.name)
          }
          onClose={() => setAssetDialog(false)}
        />
      )}
      {commandOpen && <CommandPalette commands={commands} onClose={() => setCommandOpen(false)} />}
      {modal === 'import' && (
        <ImportDialog
          onClose={() => setModal(null)}
          onObject={onImport}
          onTextures={(textures) =>
            commit((p) => ({ ...p, textures: { ...(p.textures || blankTextures), ...textures } }))
          }
          onNotice={notice}
        />
      )}
      {modal === 'export' && (
        <ExportDialog
          project={project}
          frame={frame}
          engine={engine.current}
          onClose={() => setModal(null)}
          onNotice={notice}
        />
      )}
      {modal === 'help' && <HelpDialog onClose={() => setModal(null)} />}
      {report && (
        <Modal
          title="Import complete"
          subtitle="The asset is ready to edit."
          onClose={() => setReport(null)}
        >
          <div className="modal-body import-report">
            {report.map((message, i) => (
              <p key={i}>
                {i === 0 && <CheckCircle2 size={16} />}
                <span>{message}</span>
              </p>
            ))}
          </div>
          <footer>
            <button className="button primary" onClick={() => setReport(null)}>
              Continue editing
            </button>
          </footer>
        </Modal>
      )}
      {confirmation && (
        <Modal title={confirmation.title} onClose={() => setConfirmation(null)}>
          <div className="modal-body">
            <p>{confirmation.message}</p>
          </div>
          <footer>
            <button className="button" onClick={() => setConfirmation(null)}>
              Cancel
            </button>
            <button
              className="button"
              onClick={async () => {
                await save();
              }}
            >
              Save project
            </button>
            <button
              className="button primary"
              onClick={() => {
                confirmation.action();
                setConfirmation(null);
              }}
            >
              Continue
            </button>
          </footer>
        </Modal>
      )}
    </div>
  );
}
function UserRoundIcon({ type }: { type: SceneObject['type'] }) {
  const Icon = objectIcon(type);
  return <Icon size={20} strokeWidth={1.6} />;
}
export default App;
