import { ArmatureIcon, LightIcon, CameraGlyph, BoneIcon } from './StudioIcons';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  ChevronLeft,
  ChevronRight,
  Repeat2,
  DiamondPlus,
  Circle,
  Box,
  ZoomIn,
  ZoomOut,
  Copy,
  ClipboardPaste,
  Maximize2,
  Magnet,
  Search,
  Focus,
  Brackets,
  ChevronsUpDown,
  Eye,
  Trash2,
  Scissors,
  BoxSelect,
  ListTree,
  Lock,
} from 'lucide-react';
import { IconButton, NumberField } from './components';
import type { IconType } from './components';
import { bones, boneLabels, trackId } from './model';
import type { Keyframe, Project, Selection } from './model';
import { GraphEditor } from './GraphEditor';
import { copyKeys, faceTrackId, isFaceTrack, keysOnTrack, selectionForKeyTrack } from './key-tools';
import type { CopiedKey, KeyRef, PasteOptions } from './key-tools';
import { lowerFrame, upperFrame, frameTicks } from './time-index';
import './timeline.css';
import { cameraEffectNames } from './camera-effects';
import type { CameraEvent } from './camera-effects';
export type SelectedKey = KeyRef | null;
type Props = {
  project: Project;
  frame: number;
  playing: boolean;
  loop: boolean;
  autoKey: boolean;
  selection: Selection;
  selectedKey: SelectedKey;
  onFrame: (f: number) => void;
  onPlay: () => void;
  onLoop: () => void;
  onAutoKey: () => void;
  onInsert: (track?: string) => void;
  onTiming: (duration: number, fps: number) => boolean;
  onSelectKey: (key: SelectedKey, s: Selection) => void;
  onPatchKey: (track: string, from: number, key: Keyframe) => void;
  onMoveKeys: (selection: KeyRef[], delta: number, anchor: KeyRef) => boolean;
  onDeleteKeys: (selection: KeyRef[]) => void;
  onPasteKeys: (keys: CopiedKey[], frame: number, options?: PasteOptions) => KeyRef[];
  onSelect: (s: Selection) => void;
  onRange: (range: [number, number] | undefined) => void;
  leftWidth: number;
  onEditFace?: (id: string) => void;
  cameraEvents?: readonly CameraEvent[];
};
const rowHeight = 26,
  padding = 14;
const refId = (track: string, frame: number) => track + '\0' + frame;
const clamp = (n: number, low: number, high: number) => Math.max(low, Math.min(high, n));
function trackGesture(
  el: HTMLElement,
  initial: React.PointerEvent,
  move: (e: PointerEvent) => void,
  finish: () => void,
  cancel: () => void,
  trackEdge?: (event: PointerEvent) => boolean,
) {
  const pointer = initial.pointerId;
  let last = initial.nativeEvent,
    raf = 0;
  const update = (event: PointerEvent) => {
    if (event.pointerId !== pointer) return;
    last = event;
    move(event);
    if (trackEdge && !raf) raf = requestAnimationFrame(tick);
  };
  const tick = () => {
    raf = 0;
    if (trackEdge?.(last)) {
      move(last);
      raf = requestAnimationFrame(tick);
    }
  };
  const cleanup = () => {
    cancelAnimationFrame(raf);
    el.removeEventListener('pointermove', update);
    el.removeEventListener('pointerup', up);
    el.removeEventListener('pointercancel', abort);
    el.removeEventListener('lostpointercapture', abort);
  };
  const up = (event: PointerEvent) => {
      if (event.pointerId !== pointer) return;
      cleanup();
      finish();
    },
    abort = (event: PointerEvent) => {
      if (event.pointerId !== pointer) return;
      cleanup();
      cancel();
    };
  el.setPointerCapture(pointer);
  el.addEventListener('pointermove', update);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', abort);
  el.addEventListener('lostpointercapture', abort);
}
type Region = { x: number; y: number; w: number; h: number };
type TimelineRow = {
  key: string;
  name: string;
  selection: NonNullable<Selection>;
  icon: IconType;
  bone: boolean;
  group: boolean;
  face: boolean;
  summary?: Map<number, KeyRef[]>;
  summaryFrames?: { frame: number }[];
  locked?: boolean;
};
type Menu = { x: number; y: number; frame?: number; row?: TimelineRow };
const unique = (keys: KeyRef[]) => [
  ...new Map(keys.map((key) => [refId(key.track, key.frame), key])).values(),
];
export function Timeline(p: Props) {
  const { duration, tracks, shots, playbackRange, faceTracks } = p.project;
  const [zoom, setZoom] = useState(1),
    [editor, setEditor] = useState<'dope' | 'graph'>('dope'),
    [filter, setFilter] = useState('all'),
    [query, setQuery] = useState(''),
    [snap, setSnap] = useState(false),
    [follow, setFollow] = useState(true);
  const [collapsed, setCollapsed] = useState(new Set<string>()),
    [size, setSize] = useState({ w: 700, h: 170 }),
    [scroll, setScroll] = useState({ x: 0, y: 0 }),
    [drag, setDrag] = useState<number | null>(null),
    [region, setRegion] = useState<Region | null>(null);
  const [selected, setSelected] = useState<KeyRef[]>([]),
    [clipboard, setClipboard] = useState<CopiedKey[]>([]);
  const [activeRow, setActiveRow] = useState<string>(),
    [menu, setMenu] = useState<Menu>();
  const rangeAnchor = useRef<{ row: string; frame: number } | undefined>(undefined);
  const lastMarkerClick = useRef<{ row: string; frame: number; time: number } | undefined>(
    undefined,
  );
  const scroller = useRef<HTMLDivElement>(null),
    trackArea = useRef<HTMLDivElement>(null),
    root = useRef<HTMLElement>(null);
  const selectedIds = useMemo(
    () => new Set(selected.map((k) => refId(k.track, k.frame))),
    [selected],
  );
  const selectedTracks = useMemo(() => {
    const result = new Map<string, KeyRef[]>();
    for (const key of selected) {
      const track = result.get(key.track);
      if (track) track.push(key);
      else result.set(key.track, [key]);
    }
    for (const track of result.values()) track.sort((a, b) => a.frame - b.frame);
    return result;
  }, [selected]);
  useEffect(() => {
    if (!p.selectedKey) {
      setSelected([]);
      return;
    }
    const key = p.selectedKey;
    setSelected((keys) =>
      keys.some((k) => k.track === key.track && k.frame === key.frame) ? keys : [key],
    );
  }, [p.selectedKey?.track, p.selectedKey?.frame]);
  useEffect(
    () =>
      setSelected((keys) =>
        keys.filter((k) => {
          const list = keysOnTrack(p.project, k.track);
          return list[lowerFrame(list, k.frame)]?.frame === k.frame;
        }),
      ),
    [tracks, faceTracks],
  );
  useEffect(() => {
    if (!menu) return;
    const close = (e: PointerEvent) => {
      if (!(e.target as HTMLElement).closest('.timeline-context')) setMenu(undefined);
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [menu]);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const measure = () =>
      setSize({ w: Math.max(80, el.clientWidth - p.leftWidth), h: el.clientHeight });
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    measure();
    return () => observer.disconnect();
  }, [p.leftWidth, editor]);
  const width = Math.min(260000, Math.max(size.w, Math.ceil(size.w * zoom))),
    span = Math.max(1, width - padding * 2),
    px = span / duration;
  const frameX = (frame: number) => padding + frame * px;
  const nice = frameTicks(duration, px),
    leftFrame = clamp((scroll.x - padding) / px, 0, duration),
    rightFrame = clamp((scroll.x + size.w - padding) / px, 0, duration);
  const ticks = Array.from(
    { length: Math.ceil((rightFrame - leftFrame) / nice) + 4 },
    (_, i) => (Math.floor(leftFrame / nice) + i) * nice,
  ).filter((f) => f <= duration);
  const zoomTo = (factor: number, cursor?: number) => {
    const el = scroller.current;
    if (!el) return;
    const screen = cursor ?? clamp(frameX(p.frame) - el.scrollLeft, 0, size.w);
    const position = (el.scrollLeft + screen - padding) / span,
      next = clamp(zoom * factor, 1, Math.min(128, 260000 / size.w));
    if (next === zoom) return;
    setZoom(next);
    requestAnimationFrame(() => {
      el.scrollLeft = Math.max(
        0,
        padding + position * Math.max(1, size.w * next - padding * 2) - screen,
      );
      setScroll({ x: el.scrollLeft, y: el.scrollTop });
    });
  };
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const handler = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      zoomTo(
        Math.exp(-event.deltaY * 0.006),
        clamp(event.clientX - el.getBoundingClientRect().left - p.leftWidth, 0, size.w),
      );
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, [zoom, size.w, editor, p.leftWidth, span]);
  useEffect(() => {
    const el = scroller.current;
    if (!p.playing || !follow || !el) return;
    const x = frameX(p.frame);
    if (x < el.scrollLeft || x > el.scrollLeft + size.w - 26)
      el.scrollLeft = Math.max(0, x - size.w * 0.2);
  }, [p.frame, p.playing, follow, size.w, px]);
  const rows = useMemo(() => {
    const search = query.trim().toLowerCase();
    const matches = (name: string) => name.toLowerCase().includes(search);
    return p.project.objects.flatMap((o) => {
      if (filter === 'selected' && o.id !== p.selection?.id) return [];
      const icon =
        o.type === 'character'
          ? ArmatureIcon
          : o.type === 'camera'
            ? CameraGlyph
            : o.type === 'light'
              ? LightIcon
              : Box;
      const character = o.type === 'character';
      const base: TimelineRow = {
        key: character ? `summary:${o.id}` : o.id,
        name: o.name,
        selection: { id: o.id },
        icon,
        bone: false,
        group: character,
        face: false,
        locked: o.locked,
      };
      if (!character)
        return matches(o.name) && (filter !== 'animated' || tracks[o.id]?.length) ? [base] : [];
      const activeBone = p.selection?.id === o.id ? p.selection.bone : undefined;
      const channels: TimelineRow[] = [
        { ...base, key: o.id, name: 'Object Transform', group: false, bone: true },
        {
          ...base,
          key: faceTrackId(o.id),
          name: 'Face',
          icon: Eye,
          group: false,
          bone: true,
          face: true,
        },
        ...bones
          .filter(
            (bone) =>
              tracks[`${o.id}/${bone}`]?.length ||
              activeBone === bone ||
              filter === 'selected' ||
              (search && matches(boneLabels[bone])),
          )
          .map((bone): TimelineRow => ({
            key: o.id + '/' + bone,
            name: boneLabels[bone],
            selection: { id: o.id, bone },
            icon: BoneIcon,
            bone: true,
            group: false,
            face: false,
            locked: o.locked,
          })),
      ];
      const visible = channels.filter(
        (row) =>
          (matches(o.name) || matches(row.name)) &&
          (filter !== 'animated' || keysOnTrack(p.project, row.key).length > 0),
      );
      if ((search || filter === 'animated') && !visible.length) return [];
      const summary = new Map<number, KeyRef[]>();
      for (const row of visible)
        for (const key of keysOnTrack(p.project, row.key)) {
          const group = summary.get(key.frame) ?? [];
          if (!group.length) summary.set(key.frame, group);
          group.push({ track: row.key, frame: key.frame });
        }
      const summaryFrames = [...summary.keys()].sort((a, b) => a - b).map((frame) => ({ frame }));
      return [
        { ...base, summary, summaryFrames },
        ...(collapsed.has(base.key) && !search ? [] : visible),
      ];
    });
  }, [p.project.objects, p.selection, tracks, faceTracks, collapsed, query, filter]);
  const baseRulerHeight = shots?.length ? 45 : 26;
  const rulerHeight = baseRulerHeight + (p.cameraEvents?.length ? 20 : 0),
    firstRow = Math.max(0, Math.floor((scroll.y - rulerHeight) / rowHeight) - 5),
    lastRow = Math.min(rows.length, Math.ceil((scroll.y + size.h) / rowHeight) + 5);
  const keyWindow = <T extends { frame: number }>(list: readonly T[], track: string) => {
    const start = lowerFrame(list, leftFrame - 12 / px),
      end = upperFrame(list, rightFrame + 12 / px);
    if (px >= 4 || end - start < 60) return list.slice(start, end);
    const visible: T[] = [],
      selection = selectedTracks.get(track) || [],
      playheadIndex = lowerFrame(list, p.frame);
    for (let index = start; index < end;) {
      const first = list[index],
        bin = Math.floor(frameX(first.frame) / 5),
        endFrame = ((bin + 1) * 5 - padding) / px;
      const next = Math.min(end, Math.max(index + 1, lowerFrame(list, endFrame)));
      const picked = selection[lowerFrame(selection, first.frame)];
      const at =
        picked && picked.frame <= list[next - 1].frame
          ? lowerFrame(list, picked.frame)
          : clamp(playheadIndex, index, next - 1);
      visible.push(list[at]);
      index = next;
    }
    return visible;
  };
  const editFace = (id: string, frame?: number) => {
    if (frame !== undefined) p.onFrame(frame);
    if (p.onEditFace) {
      p.onEditFace(id);
      return;
    }
    p.onSelect({ id });
    requestAnimationFrame(() => {
      const section = document.querySelector<HTMLButtonElement>(
        '.inspector .section-collapse[aria-label="Toggle Facial Performance section"]',
      );
      if (section?.getAttribute('aria-expanded') === 'false') section.click();
      section?.focus({ preventScroll: true });
      section?.scrollIntoView({ block: 'start', inline: 'nearest' });
    });
  };
  const quantize = (frame: number) =>
    clamp(
      Math.round(frame / (snap ? Math.max(1, Math.min(nice, 10)) : 1)) *
        (snap ? Math.max(1, Math.min(nice, 10)) : 1),
      0,
      duration,
    );
  const pickSelection = (keys: KeyRef[], primary?: KeyRef) => {
    setSelected(keys);
    const head = primary || keys[0] || null;
    p.onSelectKey(head, head ? selectionForKeyTrack(head.track) : p.selection);
  };
  const focus = () => root.current?.focus({ preventScroll: true });
  const keysInRows = (list: TimelineRow[], first = 0, last = duration) =>
    unique(
      list.flatMap((row) => {
        if (row.summary)
          return [...row.summary]
            .filter(([at]) => at >= first && at <= last)
            .flatMap(([, refs]) => refs);
        const keys = keysOnTrack(p.project, row.key);
        return keys
          .slice(lowerFrame(keys, first), upperFrame(keys, last))
          .map((key) => ({ track: row.key, frame: key.frame }));
      }),
    );
  const editKeys = () => (selected.length ? selected : p.selectedKey ? [p.selectedKey] : []);
  const visibleRows = rows.filter((row) => !row.group || collapsed.has(row.key));
  const selectAll = () =>
    pickSelection(
      editor === 'graph' && p.selection
        ? keysOnTrack(p.project, trackId(p.selection)).map((key) => ({
            track: trackId(p.selection!),
            frame: key.frame,
          }))
        : keysInRows(visibleRows),
    );
  const frameAt = (clientX: number) => {
    const el = scroller.current!;
    return (el.scrollLeft + clientX - el.getBoundingClientRect().left - p.leftWidth - padding) / px;
  };
  const scrollEdge = (event: PointerEvent, vertically: boolean) => {
    const el = scroller.current!;
    const bounds = el.getBoundingClientRect();
    const speed = (at: number, min: number, max: number) =>
      clamp(at - clamp(at, min, max), -26, 26);
    const { scrollLeft, scrollTop } = el;
    el.scrollLeft += speed(event.clientX, bounds.left + p.leftWidth + 16, bounds.right - 23);
    if (vertically)
      el.scrollTop += speed(event.clientY, bounds.top + rulerHeight + 12, bounds.bottom - 22);
    return el.scrollLeft !== scrollLeft || el.scrollTop !== scrollTop;
  };
  const scrub = (e: React.PointerEvent<HTMLElement>) => {
    const el = scroller.current;
    if (e.button !== 0 || !el) return;
    e.preventDefault();
    focus();
    const update = (x: number) => p.onFrame(quantize(frameAt(x)));
    update(e.clientX);
    trackGesture(
      el,
      e,
      (event) => update(event.clientX),
      () => {},
      () => {},
      (event) => scrollEdge(event, false),
    );
  };
  const marquee = (e: React.PointerEvent, row?: TimelineRow) => {
    const el = scroller.current,
      area = trackArea.current;
    if (e.button !== 0 || !el || !area) return;
    e.preventDefault();
    focus();
    if (row) setActiveRow(row.key);
    const coords = (clientX: number, clientY: number) => {
      const bounds = area.getBoundingClientRect();
      return {
        x: clamp(clientX - bounds.left - p.leftWidth, 0, width),
        y: clamp(clientY - bounds.top, 0, rows.length * rowHeight),
      };
    };
    const start = coords(e.clientX, e.clientY),
      pointerX = e.clientX,
      pointerY = e.clientY;
    let current: Region | undefined;
    trackGesture(
      el,
      e,
      (event) => {
        if (!current && Math.hypot(event.clientX - pointerX, event.clientY - pointerY) < 4) return;
        const end = coords(event.clientX, event.clientY);
        current = {
          x: Math.min(start.x, end.x),
          y: Math.min(start.y, end.y),
          w: Math.abs(start.x - end.x),
          h: Math.abs(start.y - end.y),
        };
        setRegion(current);
      },
      () => {
        if (!current) {
          p.onFrame(quantize(frameAt(pointerX)));
          return;
        }
        const { x, y, w, h } = current;
        const found = keysInRows(
          rows.slice(Math.floor(y / rowHeight), Math.floor((y + h) / rowHeight) + 1),
          (x - padding) / px,
          (x + w - padding) / px,
        );
        const foundIds = new Set(found.map((key) => refId(key.track, key.frame)));
        const next =
          e.ctrlKey || e.metaKey
            ? selected.filter((key) => !foundIds.has(refId(key.track, key.frame)))
            : e.shiftKey
              ? unique([...selected, ...found])
              : found;
        pickSelection(next);
        setRegion(null);
      },
      () => setRegion(null),
      (event) => !!current && scrollEdge(event, true),
    );
  };
  const shiftBatch = (batch: KeyRef[], delta: number, anchor = batch[0]) => {
    if (!batch.length) return;
    const min = batch.reduce((v, key) => Math.min(v, key.frame), Infinity),
      max = batch.reduce((v, key) => Math.max(v, key.frame), -Infinity);
    const shift = clamp(delta, -min, duration - max);
    if (shift && p.onMoveKeys(batch, shift, anchor))
      setSelected(batch.map((key) => ({ ...key, frame: key.frame + shift })));
  };
  const keyPress = (
    row: TimelineRow,
    frame: number,
    refs: KeyRef[],
    shift: boolean,
    ctrl: boolean,
  ) => {
    setActiveRow(row.key);
    if (shift && rangeAnchor.current) {
      const anchor = rangeAnchor.current;
      const a = rows.findIndex((r) => r.key === anchor.row),
        b = rows.indexOf(row);
      const channels = a < 0 ? [row] : rows.slice(Math.min(a, b), Math.max(a, b) + 1);
      const found = keysInRows(
        channels,
        Math.min(anchor.frame, frame),
        Math.max(anchor.frame, frame),
      );
      pickSelection(unique([...selected, ...found, ...refs]), refs[0]);
      return;
    }
    rangeAnchor.current = { row: row.key, frame };
    const inside = refs.every((key) => selectedIds.has(refId(key.track, key.frame)));
    if (ctrl) {
      const ids = new Set(refs.map((key) => refId(key.track, key.frame)));
      pickSelection(
        inside
          ? selected.filter((key) => !ids.has(refId(key.track, key.frame)))
          : unique([...selected, ...refs]),
        inside ? undefined : refs[0],
      );
    } else if (shift) pickSelection(unique([...selected, ...refs]), refs[0]);
    else pickSelection(inside ? selected : refs, refs[0]);
  };
  const dragKey = (
    e: React.PointerEvent<HTMLButtonElement>,
    row: TimelineRow,
    frame: number,
    refs: KeyRef[],
  ) => {
    const el = scroller.current;
    if (e.button !== 0 || !el) return;
    e.stopPropagation();
    const modified = e.shiftKey || e.ctrlKey || e.metaKey;
    const batch = refs.every((key) => selectedIds.has(refId(key.track, key.frame)))
      ? selected
      : refs;
    keyPress(row, frame, refs, e.shiftKey, e.ctrlKey || e.metaKey);
    e.preventDefault();
    focus();
    if (modified) return;
    const start = e.clientX,
      initialFrame = frameAt(start);
    const min = batch.reduce((v, k) => Math.min(v, k.frame), Infinity),
      max = batch.reduce((v, k) => Math.max(v, k.frame), -Infinity);
    let delta = 0,
      moving = false;
    trackGesture(
      el,
      e,
      (event) => {
        if (!moving && Math.abs(event.clientX - start) < 4) return;
        moving = true;
        const target = frame + frameAt(event.clientX) - initialFrame;
        delta = row.locked
          ? 0
          : clamp(
              (snap && !event.altKey ? quantize(target) : Math.round(target)) - frame,
              -min,
              duration - max,
            );
        setDrag(delta);
      },
      () => {
        if (moving) shiftBatch(batch, delta, refs[0]);
        else {
          const previous = lastMarkerClick.current,
            time = performance.now();
          lastMarkerClick.current = { row: row.key, frame, time };
          if (
            row.face &&
            previous?.row === row.key &&
            previous.frame === frame &&
            time - previous.time < 500
          )
            editFace(row.selection.id, frame);
          else p.onFrame(frame);
        }
        setDrag(null);
      },
      () => setDrag(null),
      (event) => moving && scrollEdge(event, false),
    );
  };
  const remove = () => {
    const keys = editKeys();
    if (keys.length) p.onDeleteKeys(keys);
    setSelected([]);
    focus();
  };
  const copy = (cut = false) => {
    const refs = editKeys();
    const editable = cut
      ? refs.filter(
          (key) =>
            !p.project.objects.find((object) => object.id === selectionForKeyTrack(key.track).id)
              ?.locked,
        )
      : refs;
    if (!editable.length) return;
    setClipboard(copyKeys(p.project, editable));
    if (cut) remove();
    else focus();
  };
  const paste = (at = p.frame, options?: PasteOptions) => {
    const keys = p.onPasteKeys(clipboard, at, options);
    if (keys.length) pickSelection(keys, keys[0]);
    focus();
  };
  const openMenu = (e: React.MouseEvent, row?: TimelineRow, refs?: KeyRef[]) => {
    e.preventDefault();
    e.stopPropagation();
    if (refs?.length && !refs.every((key) => selectedIds.has(refId(key.track, key.frame))))
      pickSelection(refs);
    if (row) setActiveRow(row.key);
    focus();
    setMenu({
      x: Math.min(e.clientX, window.innerWidth - 242),
      y: Math.min(e.clientY, window.innerHeight - 326),
      row,
      frame:
        scroller.current &&
        (e.target as HTMLElement).closest('.ruler-scale,.track-lane,.timeline-blank')
          ? quantize(frameAt(e.clientX))
          : undefined,
    });
  };
  const targetRow =
    rows.find(
      (row) =>
        row.key === activeRow &&
        row.selection.id === p.selection?.id &&
        (row.group || row.selection.bone === p.selection?.bone),
    ) ?? rows.find((row) => !row.group && p.selection && row.key === trackId(p.selection));
  const pasteToRow = (row: TimelineRow, at: number) =>
    paste(at, { target: row.group ? row.selection.id : row.key, character: row.group });
  const jump = (direction: number) => {
    const row = targetRow;
    const keys =
      row?.summaryFrames ??
      keysOnTrack(p.project, row?.key ?? (p.selection ? trackId(p.selection) : ''));
    const key =
      direction < 0 ? keys[lowerFrame(keys, p.frame) - 1] : keys[upperFrame(keys, p.frame)];
    if (!key) return;
    p.onFrame(key.frame);
    focus();
    const el = scroller.current;
    if (el && (frameX(key.frame) < el.scrollLeft || frameX(key.frame) > el.scrollLeft + size.w))
      el.scrollLeft = Math.max(0, frameX(key.frame) - size.w / 2);
  };
  const fitSelected = () => {
    const keys = editKeys();
    if (!keys.length) {
      fit();
      return;
    }
    const first = keys.reduce((v, key) => Math.min(v, key.frame), Infinity),
      last = keys.reduce((v, key) => Math.max(v, key.frame), -Infinity);
    const next = clamp(
      duration / Math.max(12, (last - first) * 1.3),
      1,
      Math.min(128, 260000 / size.w),
    );
    setZoom(next);
    requestAnimationFrame(() => {
      const el = scroller.current;
      if (el)
        el.scrollLeft = Math.max(
          0,
          padding + (((first + last) / 2) * (size.w * next - 2 * padding)) / duration - size.w / 2,
        );
    });
  };
  const rangeStart = () => p.onRange([p.frame, Math.max(p.frame, playbackRange?.[1] ?? duration)]);
  const rangeEnd = () => p.onRange([Math.min(p.frame, playbackRange?.[0] ?? 0), p.frame]);
  const fit = () => {
    setZoom(1);
    if (scroller.current) scroller.current.scrollLeft = 0;
  };
  return (
    <section
      className="timeline"
      ref={root}
      aria-label="Animation timeline"
      tabIndex={0}
      onKeyDown={(e) => {
        if ((e.target as HTMLElement).closest('input,select,textarea,[contenteditable]')) return;
        const ctrl = e.ctrlKey || e.metaKey,
          key = e.key.toLowerCase();
        if (ctrl && (key === 'c' || key === 'x')) {
          e.preventDefault();
          e.stopPropagation();
          copy(key === 'x');
        } else if (ctrl && key === 'v') {
          e.preventDefault();
          e.stopPropagation();
          if (e.shiftKey && targetRow) pasteToRow(targetRow, p.frame);
          else paste();
        } else if (ctrl && key === 'a') {
          e.preventDefault();
          e.stopPropagation();
          if (e.shiftKey) pickSelection([]);
          else selectAll();
        } else if (key === 'delete' || key === 'backspace') {
          e.preventDefault();
          e.stopPropagation();
          remove();
        } else if (key === 'escape') {
          e.stopPropagation();
          if (menu) setMenu(undefined);
          else pickSelection([]);
        } else if (e.altKey && (key === 'arrowleft' || key === 'arrowright')) {
          e.preventDefault();
          e.stopPropagation();
          shiftBatch(editKeys(), (key === 'arrowleft' ? -1 : 1) * (e.shiftKey ? 10 : 1));
        } else if (key === 'f' && !ctrl && editor === 'dope') {
          e.preventDefault();
          e.stopPropagation();
          fitSelected();
        } else if (key === ' ' && !ctrl) {
          e.preventDefault();
          e.stopPropagation();
          if (!e.repeat) p.onPlay();
        } else if (key === 'i' && !ctrl && !e.shiftKey) {
          e.preventDefault();
          e.stopPropagation();
          p.onInsert(targetRow?.face ? targetRow.key : undefined);
        } else if (e.shiftKey && (key === 'arrowleft' || key === 'arrowright')) {
          e.preventDefault();
          e.stopPropagation();
          jump(key === 'arrowleft' ? -1 : 1);
        } else if (key === '[') {
          e.preventDefault();
          rangeStart();
        } else if (key === ']') {
          e.preventDefault();
          rangeEnd();
        }
      }}
    >
      <div className="timeline-transport">
        <div className="timeline-title">
          <select
            className="editor-selector"
            aria-label="Animation editor"
            value={editor}
            onChange={(e) => setEditor(e.target.value as 'dope' | 'graph')}
          >
            <option value="dope">Dope Sheet</option>
            <option value="graph">Graph Editor</option>
          </select>
        </div>
        <div className="transport-buttons">
          <IconButton
            icon={SkipBack}
            label="First frame"
            onClick={() => p.onFrame(playbackRange?.[0] ?? 0)}
          />
          <IconButton
            icon={ChevronLeft}
            label="Previous key (Shift Left)"
            onClick={() => jump(-1)}
          />
          <IconButton
            icon={p.playing ? Pause : Play}
            label={p.playing ? 'Pause (Space)' : 'Play (Space)'}
            onClick={p.onPlay}
            className="play-button"
          />
          <IconButton icon={ChevronRight} label="Next key (Shift Right)" onClick={() => jump(1)} />
          <IconButton
            icon={SkipForward}
            label="Last frame"
            onClick={() => p.onFrame(playbackRange?.[1] ?? duration)}
          />
          <span className="divider" />
          <IconButton icon={Repeat2} label="Loop playback" onClick={p.onLoop} active={p.loop} />
          <IconButton
            icon={Circle}
            label="Auto key: insert a key whenever a transform changes"
            onClick={p.onAutoKey}
            active={p.autoKey}
            className={p.autoKey ? 'recording' : ''}
          />
        </div>
        <div className="timeline-timing">
          <label>
            Frame{' '}
            <NumberField
              label="Current frame"
              value={p.frame}
              min={0}
              max={duration}
              step={1}
              onCommit={(n) => p.onFrame(Math.round(n))}
            />
          </label>
          <span className="muted">/</span>
          <NumberField
            label="Scene duration in frames"
            value={duration}
            min={1}
            max={36000}
            step={1}
            onCommit={(n) => p.onTiming(Math.round(n), p.project.fps)}
          />
          <select
            aria-label="Frames per second"
            value={p.project.fps}
            onChange={(e) => p.onTiming(duration, Number(e.target.value))}
          >
            {[...new Set([12, 24, 25, 30, 48, 60, 120, p.project.fps])]
              .sort((a, b) => a - b)
              .map((n) => (
                <option key={n} value={n}>
                  {n} fps
                </option>
              ))}
          </select>
        </div>
        <div className="timeline-actions">
          <button
            className="button compact"
            disabled={!p.selection}
            onClick={() => p.onInsert(targetRow?.face ? targetRow.key : undefined)}
          >
            <DiamondPlus size={14} />
            Add Key
          </button>
        </div>
      </div>
      {editor === 'graph' ? (
        <GraphEditor
          project={p.project}
          selection={p.selection}
          frame={p.frame}
          selectedKey={p.selectedKey}
          onFrame={p.onFrame}
          onSelectKey={p.onSelectKey}
          onPatchKey={p.onPatchKey}
          onInsert={() => p.onInsert()}
        />
      ) : (
        <>
          <div className="timeline-toolstrip">
            <div className="track-filter">
              <Search size={12} />
              <input
                aria-label="Filter timeline tracks"
                placeholder="Find tracks"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <select
                aria-label="Timeline track filter"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                <option value="all">All</option>
                <option value="animated">Animated</option>
                <option value="selected">Selected</option>
              </select>
            </div>
            <div className="timeline-edit-tools" aria-label="Keyframe editing">
              <IconButton
                icon={BoxSelect}
                label="Select all visible keys (Ctrl A)"
                onClick={() => {
                  selectAll();
                  focus();
                }}
              />
              <button
                className="timeline-edit-button"
                title="Copy selected keys (Ctrl C)"
                disabled={!editKeys().length}
                onClick={() => copy()}
              >
                <Copy size={13} />
                Copy
              </button>
              <button
                className="timeline-edit-button"
                title="Paste keys at playhead (Ctrl V)"
                disabled={!clipboard.length}
                onClick={() => paste()}
              >
                <ClipboardPaste size={13} />
                Paste
              </button>
              <button
                className="timeline-edit-button"
                title="Delete selected keys (Delete)"
                disabled={!editKeys().length}
                onClick={remove}
              >
                <Trash2 size={13} />
                Delete
              </button>
            </div>
            <span className="timeline-selected-count" aria-live="polite">
              {drag
                ? `${drag > 0 ? '+' : ''}${drag} frames`
                : [
                    selected.length ? `${selected.length} selected` : '',
                    clipboard.length ? `${clipboard.length} copied` : '',
                  ]
                    .filter(Boolean)
                    .join(' · ') || 'Drag to select'}
            </span>
            <div className="timeline-view-tools">
              <IconButton
                icon={Brackets}
                label="Set range start at playhead ([)"
                onClick={rangeStart}
              />
              <IconButton
                icon={Brackets}
                label="Set range end at playhead (])"
                className="flip-icon"
                onClick={rangeEnd}
              />
              {playbackRange && (
                <button
                  className="range-reset"
                  onClick={() => p.onRange(undefined)}
                  title="Clear playback range"
                >
                  {playbackRange[0]}–{playbackRange[1]} ×
                </button>
              )}
              <IconButton
                icon={Magnet}
                label="Snap timeline to grid"
                active={snap}
                onClick={() => setSnap((v) => !v)}
              />
              <IconButton
                icon={Focus}
                label="Follow playhead during playback"
                active={follow}
                onClick={() => setFollow((v) => !v)}
              />
              <IconButton
                icon={ZoomOut}
                label="Zoom out timeline"
                onClick={() => zoomTo(1 / 1.5)}
              />
              <IconButton icon={ZoomIn} label="Zoom in timeline" onClick={() => zoomTo(1.5)} />
              <IconButton
                icon={Focus}
                label="Frame selected keys (F)"
                disabled={!editKeys().length}
                onClick={fitSelected}
              />
              <IconButton icon={Maximize2} label="Fit entire timeline" onClick={fit} />
            </div>
          </div>
          <div
            className="timeline-scroll timeline-virtual"
            ref={scroller}
            onContextMenu={(e) => openMenu(e)}
            onPointerDown={(e) => {
              if (e.button !== 1 || !scroller.current) return;
              e.preventDefault();
              focus();
              const el = scroller.current,
                x = el.scrollLeft + e.clientX,
                y = el.scrollTop + e.clientY;
              trackGesture(
                el,
                e,
                (event) => {
                  el.scrollLeft = x - event.clientX;
                  el.scrollTop = y - event.clientY;
                },
                () => {},
                () => {},
              );
            }}
            onScroll={(e) =>
              setScroll({ x: e.currentTarget.scrollLeft, y: e.currentTarget.scrollTop })
            }
          >
            <div
              className="timeline-content"
              style={{ width: width + p.leftWidth, minHeight: '100%' }}
            >
              <div
                className={'timeline-ruler ' + (shots?.length ? 'has-shots' : '')}
                style={
                  {
                    height: rulerHeight,
                    '--camera-fx-strip': p.cameraEvents?.length ? '20px' : '0px',
                  } as React.CSSProperties
                }
              >
                <div className="track-label ruler-label" style={{ width: p.leftWidth }}>
                  <IconButton
                    icon={ListTree}
                    label="Expand or collapse character tracks"
                    onClick={() => {
                      const groups = rows.filter((row) => row.group).map((row) => row.key);
                      setCollapsed(
                        groups.every((id) => collapsed.has(id)) ? new Set() : new Set(groups),
                      );
                    }}
                  />
                  <span>Tracks</span>
                </div>
                <div
                  className="ruler-scale"
                  style={{ width, height: rulerHeight }}
                  onPointerDown={scrub}
                >
                  {playbackRange && (
                    <div
                      className="timeline-range"
                      style={{
                        left: frameX(playbackRange[0]),
                        width: Math.max(2, (playbackRange[1] - playbackRange[0]) * px),
                      }}
                    />
                  )}
                  {ticks.map((f) => (
                    <span key={f} className="ruler-tick" style={{ left: frameX(f) }}>
                      {f}
                    </span>
                  ))}
                  <span className="playhead-label" style={{ left: frameX(p.frame) }}>
                    {p.frame}
                  </span>
                  {(shots || []).map((s) => (
                    <button
                      key={s.id}
                      className="shot-marker"
                      style={{ left: frameX(s.frame) }}
                      title={s.name + ' · frame ' + s.frame}
                      aria-label={'Camera cut ' + s.name + ' at ' + s.frame}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() => p.onFrame(s.frame)}
                    >
                      {s.name}
                    </button>
                  ))}
                  {p.cameraEvents?.map((event) => (
                    <button
                      key={event.id}
                      className="camera-fx-marker"
                      aria-label={`${cameraEffectNames[event.kind]} at frame ${event.start}`}
                      title={`${cameraEffectNames[event.kind]} · ${event.start}–${event.start + event.duration}`}
                      style={{
                        left: frameX(event.start),
                        top: baseRulerHeight,
                        width: Math.max(6, Math.min(duration - event.start, event.duration) * px),
                      }}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() => p.onFrame(event.start)}
                    >
                      {cameraEffectNames[event.kind]}
                    </button>
                  ))}
                </div>
              </div>
              <div
                className="timeline-track-area"
                ref={trackArea}
                style={{ height: rows.length * rowHeight }}
              >
                {rows.slice(firstRow, lastRow).map((row, i) => {
                  const laneKeys = row.summary ? [] : keysOnTrack(p.project, row.key);
                  const count = row.summary?.size ?? laneKeys.length;
                  const markers = row.summary
                    ? keyWindow(row.summaryFrames ?? [], row.key)
                    : keyWindow(laneKeys, row.key);
                  return (
                    <div
                      className={
                        'timeline-row ' +
                        (row.face ? 'face-track-row ' : '') +
                        (row.group ? 'summary-track-row ' : '') +
                        (row.locked ? 'locked-track-row ' : '') +
                        (targetRow?.key === row.key ? 'selected' : '')
                      }
                      key={(row.face ? 'face:' : 'track:') + row.key}
                      style={{ top: (firstRow + i) * rowHeight, height: rowHeight }}
                    >
                      <div
                        className={'track-label ' + (row.bone ? 'bone-track' : '')}
                        style={{ width: p.leftWidth }}
                        onContextMenu={(e) => openMenu(e, row)}
                      >
                        {row.group && (
                          <button
                            className="track-fold"
                            title={
                              collapsed.has(row.key)
                                ? 'Expand character tracks'
                                : 'Collapse character tracks'
                            }
                            aria-label={
                              (collapsed.has(row.key) ? 'Expand ' : 'Collapse ') +
                              row.name +
                              ' tracks'
                            }
                            aria-expanded={!collapsed.has(row.key)}
                            onClick={() =>
                              setCollapsed((s) => {
                                const n = new Set(s);
                                if (n.has(row.key)) n.delete(row.key);
                                else n.add(row.key);
                                return n;
                              })
                            }
                          >
                            {collapsed.has(row.key) ? (
                              <ChevronRight size={11} />
                            ) : (
                              <ChevronsUpDown size={11} />
                            )}
                          </button>
                        )}
                        <button
                          className="track-name"
                          title={row.face ? 'Double-click to open Character Editor' : row.name}
                          aria-pressed={targetRow?.key === row.key}
                          onClick={(e) => {
                            setActiveRow(row.key);
                            rangeAnchor.current = undefined;
                            if (e.shiftKey)
                              pickSelection(unique([...editKeys(), ...keysInRows([row])]));
                            else if (
                              row.selection.id !== p.selection?.id ||
                              row.selection.bone !== p.selection?.bone
                            )
                              p.onSelect(row.selection);
                            focus();
                          }}
                          onDoubleClick={() =>
                            row.face ? editFace(row.selection.id) : pickSelection(keysInRows([row]))
                          }
                        >
                          <row.icon size={13} />
                          <span>{row.name}</span>
                        </button>
                        {row.locked && (
                          <span className="timeline-lock" title="Track is locked">
                            <Lock size={11} />
                          </span>
                        )}
                        {!!count && (
                          <button
                            className="track-key-count"
                            title="Select all keys on this track"
                            aria-label={`Select all keys on ${row.name}`}
                            onClick={() => {
                              setActiveRow(row.key);
                              pickSelection(keysInRows([row]));
                              focus();
                            }}
                          >
                            {count}
                          </button>
                        )}
                      </div>
                      <div
                        className="track-lane"
                        style={{
                          width,
                          backgroundSize: nice * px + 'px 100%',
                          backgroundPosition: padding + 'px 0',
                        }}
                        onPointerDown={(e) => marquee(e, row)}
                        onContextMenu={(e) => openMenu(e, row)}
                      >
                        {markers.map((k) => {
                          const refs = row.summary?.get(k.frame) ?? [
                            { track: row.key, frame: k.frame },
                          ];
                          const picked = refs.every((ref) =>
                            selectedIds.has(refId(ref.track, ref.frame)),
                          );
                          const partial =
                            !picked &&
                            refs.some((ref) => selectedIds.has(refId(ref.track, ref.frame)));
                          return (
                            <button
                              key={k.frame}
                              className={`keyframe ${row.face ? 'face-keyframe ' : ''}${row.group ? 'summary-keyframe ' : ''}${picked ? 'selected ' : partial ? 'part-selected ' : ''}${k.frame === p.frame ? 'at-playhead' : ''}`}
                              aria-label={`${row.face ? 'Facial' : row.name} keyframe ${k.frame}`}
                              aria-pressed={picked}
                              title={`Frame ${k.frame}${row.group ? ` · ${refs.length} channel keys` : 'interpolation' in k ? ` · ${k.interpolation}` : ''}${row.face ? ' · Double-click to edit face' : ''}`}
                              style={{ left: frameX(k.frame + (picked ? drag || 0 : 0)) }}
                              onPointerDown={(e) => dragKey(e, row, k.frame, refs)}
                              onContextMenu={(e) => openMenu(e, row, refs)}
                              onClick={(e) => {
                                if (e.detail === 0) {
                                  keyPress(row, k.frame, refs, e.shiftKey, e.ctrlKey || e.metaKey);
                                  p.onFrame(k.frame);
                                }
                              }}
                            >
                              <span />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
                {region && (
                  <div
                    className="timeline-marquee"
                    style={{
                      left: p.leftWidth + region.x,
                      top: region.y,
                      width: region.w,
                      height: region.h,
                    }}
                  />
                )}
              </div>
              {!!rows.length && (
                <div
                  className="timeline-blank"
                  style={{ marginLeft: p.leftWidth, width }}
                  onPointerDown={(e) => marquee(e)}
                />
              )}
              {!rows.length && (
                <div className="timeline-empty">
                  No matching tracks. Clear the filter or add a keyframe.
                </div>
              )}
              <div
                className="playhead-line"
                style={{ top: rulerHeight, minHeight: 0, left: p.leftWidth + frameX(p.frame) }}
              />
            </div>
          </div>
        </>
      )}
      {menu && (
        <div
          className="timeline-context"
          style={{ left: menu.x, top: menu.y }}
          role="group"
          aria-label="Timeline actions"
        >
          <strong>
            {menu.frame === undefined ? (menu.row?.name ?? 'Timeline') : `Frame ${menu.frame}`}
          </strong>
          {[
            {
              label: 'Select All Visible Keys',
              shortcut: 'Ctrl A',
              icon: BoxSelect,
              run: selectAll,
            },
            {
              label: 'Select Track Keys',
              icon: ListTree,
              disabled: !menu.row,
              run: () => menu.row && pickSelection(keysInRows([menu.row])),
            },
            {
              label: 'Copy',
              shortcut: 'Ctrl C',
              icon: Copy,
              disabled: !editKeys().length,
              run: () => copy(),
            },
            {
              label: 'Cut',
              shortcut: 'Ctrl X',
              icon: Scissors,
              disabled: !editKeys().length,
              run: () => copy(true),
            },
            {
              label: 'Paste at Playhead',
              shortcut: 'Ctrl V',
              icon: ClipboardPaste,
              disabled: !clipboard.length,
              run: () => paste(),
            },
            {
              label: 'Paste Here',
              icon: ClipboardPaste,
              disabled: !clipboard.length || menu.frame === undefined,
              run: () => paste(menu.frame),
            },
            {
              label: 'Paste and Replace Here',
              icon: ClipboardPaste,
              disabled: !clipboard.length,
              run: () => paste(menu.frame ?? p.frame, { replace: true }),
            },
            {
              label: menu.row?.group ? 'Paste to Character' : 'Paste to Track',
              shortcut: 'Ctrl Shift V',
              icon: ClipboardPaste,
              disabled: !clipboard.length || !(menu.row ?? targetRow),
              run: () => {
                const row = menu.row ?? targetRow;
                if (row) pasteToRow(row, menu.frame ?? p.frame);
              },
            },
            {
              label: 'Delete',
              shortcut: 'Delete',
              icon: Trash2,
              disabled: !editKeys().length,
              run: remove,
            },
            ...(menu.row?.face
              ? [
                  {
                    label: 'Open Face Editor',
                    icon: Eye,
                    run: () => editFace(menu.row!.selection.id, menu.frame),
                  },
                ]
              : []),
          ].map((action) => (
            <button
              key={action.label}
              disabled={'disabled' in action && action.disabled}
              onClick={() => {
                setMenu(undefined);
                action.run();
                focus();
              }}
            >
              <action.icon size={14} />
              <span>{action.label}</span>
              {'shortcut' in action && <kbd>{action.shortcut}</kbd>}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
