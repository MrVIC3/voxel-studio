import { useState } from 'react';
import { Camera, Crosshair, Film, Focus, Route, ScanLine } from 'lucide-react';
import { NumberField } from './components';
import type { CameraMove } from './camera-rail';
import { cameraMoveNames } from './camera-rail';
import type { Keyframe, SceneObject } from './model';

export function CameraRailPanel(p: {
  camera?: SceneObject;
  keys: Keyframe[];
  frame: number;
  fps: number;
  lens: number;
  flying: boolean;
  guides: boolean;
  preview: boolean;
  onCapture: () => void;
  onRecall: (frame?: number) => void;
  onFly: () => void;
  onPreview: () => void;
  onGuides: () => void;
  onLens: (lens: number) => void;
  onMode: (mode: 'smooth' | 'linear') => void;
  onMove: (move: CameraMove, frames: number) => void;
  onCut: () => void;
}) {
  const [move, setMove] = useState<CameraMove>('orbit'),
    [seconds, setSeconds] = useState(3);
  const [page, setPage] = useState(0),
    last = Math.max(0, Math.ceil(p.keys.length / 12) - 1),
    pageIndex = Math.min(last, page);
  return (
    <section className="rail-panel property-section" aria-label="Camera path studio">
      <div className="rail-panel-heading">
        <Route size={16} />
        <div>
          <h3>Camera Path</h3>
          <p>
            {p.camera?.name || 'Capture your first view'}{' '}
            {p.camera ? `· ${p.keys.length} keys` : ''}
          </p>
        </div>
      </div>
      <button className="button primary full" onClick={p.onCapture}>
        <Camera size={15} />
        Capture View Key <kbd>K</kbd>
      </button>
      <div className="rail-actions">
        <button className="button" disabled={!p.camera} onClick={() => p.onRecall()}>
          <Crosshair size={13} />
          Recall View
        </button>
        <button className="button" aria-pressed={p.flying} onClick={p.onFly}>
          <ScanLine size={13} />
          {p.flying ? 'Exit Fly' : 'Fly View'}
        </button>
      </div>
      <div className="rail-actions">
        <button className="button" aria-pressed={p.preview} onClick={p.onPreview}>
          <Film size={13} />
          {p.preview ? 'Exit Preview' : 'Preview Cut'}
        </button>
        <button className="button" onClick={p.onCut} disabled={!p.camera}>
          Cut Here
        </button>
      </div>
      <p className="hint">
        {p.flying
          ? 'W A S D to fly · Q / E down / up · right-drag to look · scroll for speed.'
          : 'Compose a view, capture it, move the playhead and repeat. The selected subject guides generated moves.'}
      </p>
      <label className="select-row">
        View Lens
        <NumberField
          label="Capture lens angle"
          value={p.lens}
          min={10}
          max={120}
          step={1}
          onCommit={p.onLens}
        />
      </label>
      <div className="rail-actions">
        <label className="check-row">
          <input type="checkbox" checked={p.guides} onChange={p.onGuides} />
          Path overlay
        </label>
        <select
          aria-label="Camera path interpolation"
          disabled={!p.camera}
          value={p.camera?.cameraRail || ''}
          onChange={(e) => p.onMode(e.target.value as 'smooth' | 'linear')}
        >
          <option value="" disabled>
            Original Keys
          </option>
          <option value="smooth">Smooth Rail</option>
          <option value="linear">Linear Rail</option>
        </select>
      </div>
      <div className="rail-move">
        <select
          aria-label="Camera move"
          value={move}
          onChange={(e) => setMove(e.target.value as CameraMove)}
        >
          {Object.entries(cameraMoveNames).map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
        <NumberField
          label="Camera move duration in seconds"
          value={seconds}
          min={0.5}
          max={30}
          onCommit={setSeconds}
        />
        <span>s</span>
      </div>
      <button
        className="button full"
        onClick={() => p.onMove(move, Math.max(4, Math.round(seconds * p.fps)))}
      >
        <Focus size={13} />
        Build Camera Move
      </button>
      {p.keys.length > 0 && (
        <div className="rail-keys">
          <div className="rail-key-title">
            Waypoints{' '}
            <small>
              {pageIndex + 1} / {last + 1}
            </small>
            <button
              aria-label="Previous waypoints"
              disabled={pageIndex === 0}
              onClick={() => setPage(pageIndex - 1)}
            >
              ‹
            </button>
            <button
              aria-label="Next waypoints"
              disabled={pageIndex === last}
              onClick={() => setPage(pageIndex + 1)}
            >
              ›
            </button>
          </div>
          {p.keys.slice(pageIndex * 12, (pageIndex + 1) * 12).map((key) => (
            <button
              key={key.frame}
              className={p.frame === key.frame ? 'selected' : ''}
              onClick={() => p.onRecall(key.frame)}
            >
              Frame {key.frame}
              <span>{key.fov?.toFixed(0) || '—'}°</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
