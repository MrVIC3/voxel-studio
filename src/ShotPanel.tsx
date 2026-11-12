import { useState } from 'react';
import { Camera, Plus, Trash2 } from 'lucide-react';
import { NumberField, Section } from './components';
import { uid } from './model';
import type { Project, Selection } from './model';
import { cameraAtFrame, shotAtFrame } from './sequence';
import { applyCinematicPreset, cinematicLooks } from './cinematic';
import type { CinematicMode } from './cinematic';
import type { Lighting } from './model';
import { readDataURL } from './storage';
export function ShotPanel({
  project,
  frame,
  onCommit,
  onFrame,
  onSelect,
  onCreateCamera,
}: {
  project: Project;
  frame: number;
  onCommit: (update: (p: Project) => Project) => void;
  onFrame: (frame: number) => void;
  onSelect: (selection: Selection) => void;
  onCreateCamera: () => void;
}) {
  const [name, setName] = useState('New shot'),
    cameras = project.objects.filter((o) => o.type === 'camera');
  const [chosen, setChosen] = useState(''),
    camera = chosen || cameraAtFrame(project, frame) || cameras[0]?.id || '';
  const activeShot = shotAtFrame(project, frame);
  const saveLook = (lighting?: Lighting) => {
    if (!activeShot) return;
    onCommit((p) => ({
      ...p,
      shots: p.shots?.map((shot) =>
        shot.id === activeShot.id
          ? {
              ...shot,
              lighting: lighting && {
                ...lighting,
                cinematic: lighting.cinematic && { ...lighting.cinematic, rigIds: [] },
              },
            }
          : shot,
      ),
    }));
  };
  return (
    <>
      <div className="inspector-title">
        <div>
          <h2>Camera Sequence</h2>
          <p>Stage shots, then cut between cameras.</p>
        </div>
      </div>
      <Section title="Shot Camera">
        <label className="select-row">
          Camera
          <select
            aria-label="Shot camera"
            value={camera}
            onChange={(e) => {
              setChosen(e.target.value);
              onCommit((p) => ({ ...p, activeCameraId: e.target.value }));
            }}
          >
            {cameras.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <div className="object-actions">
          <button className="button" onClick={onCreateCamera}>
            <Camera size={13} />
            From View
          </button>
          <button className="button" disabled={!camera} onClick={() => onSelect({ id: camera })}>
            Camera Properties
          </button>
        </div>
        <input
          className="full"
          aria-label="Shot name"
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
        />
        <button
          className="button full"
          disabled={!camera || (project.shots?.length || 0) >= 256}
          onClick={() =>
            onCommit((p) => ({
              ...p,
              shots: [
                ...(p.shots || []).filter((s) => s.frame !== frame),
                { id: uid(), name: name.trim() || 'Shot', frame, cameraId: camera },
              ].sort((a, b) => a.frame - b.frame),
            }))
          }
        >
          <Plus size={13} />
          Add Cut at Frame {frame}
        </button>
      </Section>
      <Section title="Sequence">
        {project.shots?.length ? (
          project.shots.map((shot, i) => (
            <div className="shot-row" key={shot.id}>
              <button
                className="shot-name"
                onClick={() => {
                  onFrame(shot.frame);
                  onSelect({ id: shot.cameraId });
                }}
              >
                <small>{String(i + 1).padStart(2, '0')}</small>
                {shot.name}
                <span>{project.objects.find((o) => o.id === shot.cameraId)?.name}</span>
              </button>
              <NumberField
                label={`Shot ${i + 1} frame`}
                value={shot.frame}
                min={0}
                max={project.duration}
                step={1}
                onCommit={(v) =>
                  onCommit((p) => ({
                    ...p,
                    shots: p.shots!.some((s) => s.id !== shot.id && s.frame === Math.round(v))
                      ? p.shots
                      : p
                          .shots!.map((s) =>
                            s.id === shot.id ? { ...s, frame: Math.round(v) } : s,
                          )
                          .sort((a, b) => a.frame - b.frame),
                  }))
                }
              />
              <button
                aria-label={`Remove shot ${i + 1}`}
                onClick={() =>
                  onCommit((p) => ({ ...p, shots: p.shots!.filter((s) => s.id !== shot.id) }))
                }
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))
        ) : (
          <p className="hint">
            Add a cut at the playhead. Each cut stays active until the next cut; preview and export
            follow the same sequence.
          </p>
        )}
      </Section>
      <Section title="Lighting by Shot">
        {activeShot ? (
          <>
            <p className="hint">
              {activeShot.name} · {activeShot.lighting ? 'Shot look saved' : 'Scene lighting'}
            </p>
            <label className="select-row">
              Quick look
              <select
                aria-label="Shot lighting preset"
                value=""
                onChange={(event) => {
                  const id = event.target.value as CinematicMode | 'crimson' | 'whiteout';
                  if (!id) return;
                  const lighting = applyCinematicPreset(
                    project,
                    id === 'crimson' ? 'noir' : id === 'whiteout' ? 'overcast' : id,
                  ).lighting;
                  if (id === 'crimson' && lighting.cinematic) {
                    Object.assign(lighting, { sky: '#290610', warmth: '#ff688a', sun: 1.65 });
                    Object.assign(lighting.cinematic, {
                      hazeTint: '#a50f37',
                      shadowTint: '#790923',
                      highlightTint: '#ff647d',
                      atmosphere: 0.46,
                      saturation: 1.32,
                    });
                  }
                  if (id === 'whiteout' && lighting.cinematic) {
                    Object.assign(lighting, { sky: '#d9e2eb', warmth: '#ffffff', exposure: 1.45 });
                    Object.assign(lighting.cinematic, {
                      hazeTint: '#dce7ef',
                      atmosphere: 0.62,
                      saturation: 0.22,
                    });
                  }
                  saveLook(lighting);
                }}
              >
                <option value="">Choose a preset…</option>
                {cinematicLooks.map((look) => (
                  <option key={look.id} value={look.id}>
                    {look.name}
                  </option>
                ))}
                <option value="crimson">Crimson Impact</option>
                <option value="whiteout">Whiteout</option>
              </select>
            </label>
            <div className="object-actions">
              <button className="button" onClick={() => saveLook(project.lighting)}>
                Capture Scene Look
              </button>
              <button className="button" disabled={!activeShot.lighting} onClick={() => saveLook()}>
                Use Scene Lighting
              </button>
            </div>
            <p className="hint">
              Changes apply at this cut in Camera Preview and export. Scene light objects keep their
              own settings.
            </p>
          </>
        ) : (
          <p className="hint">Add a camera cut first.</p>
        )}
      </Section>
      <Section title="Playback Range">
        <div className="field-pair">
          <label>
            Start
            <NumberField
              label="Playback range start"
              value={project.playbackRange?.[0] || 0}
              min={0}
              max={project.playbackRange?.[1] ?? project.duration}
              step={1}
              onCommit={(v) =>
                onCommit((p) => ({
                  ...p,
                  playbackRange: [Math.round(v), p.playbackRange?.[1] ?? p.duration],
                }))
              }
            />
          </label>
          <label>
            End
            <NumberField
              label="Playback range end"
              value={project.playbackRange?.[1] ?? project.duration}
              min={project.playbackRange?.[0] || 0}
              max={project.duration}
              step={1}
              onCommit={(v) =>
                onCommit((p) => ({
                  ...p,
                  playbackRange: [p.playbackRange?.[0] || 0, Math.round(v)],
                }))
              }
            />
          </label>
        </div>
        <button
          className="button full"
          onClick={() => onCommit((p) => ({ ...p, playbackRange: undefined }))}
        >
          Use Full Scene Range
        </button>
      </Section>
      <Section title="Soundtrack">
        <label className="audio-import button full">
          {project.audio ? 'Replace Audio…' : 'Import Audio…'}
          <input
            aria-label="Import soundtrack"
            type="file"
            accept="audio/wav,audio/mpeg,audio/ogg,audio/mp4,.wav,.mp3,.ogg,.m4a"
            hidden
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file || file.size > 20 * 1024 * 1024) return;
              const data = await readDataURL(file);
              onCommit((p) => ({
                ...p,
                audio: { name: file.name, data, startFrame: 0, volume: 1 },
              }));
            }}
          />
        </label>
        {project.audio && (
          <>
            <p className="hint">{project.audio.name}</p>
            <div className="field-pair">
              <label>
                Start frame
                <NumberField
                  label="Audio start frame"
                  value={project.audio.startFrame}
                  min={0}
                  max={36000}
                  step={1}
                  onCommit={(startFrame) =>
                    onCommit((p) => ({
                      ...p,
                      audio: { ...p.audio!, startFrame: Math.round(startFrame) },
                    }))
                  }
                />
              </label>
              <label>
                Volume
                <NumberField
                  label="Audio volume"
                  value={project.audio.volume}
                  min={0}
                  max={2}
                  step={0.1}
                  onCommit={(volume) => onCommit((p) => ({ ...p, audio: { ...p.audio!, volume } }))}
                />
              </label>
            </div>
            <button
              className="button full"
              onClick={() => onCommit((p) => ({ ...p, audio: undefined }))}
            >
              Remove Audio
            </button>
            <p className="hint">
              Sound is synchronized during playback and included in WebM/MP4 exports. The source
              audio is embedded in the project.
            </p>
          </>
        )}
      </Section>
    </>
  );
}
