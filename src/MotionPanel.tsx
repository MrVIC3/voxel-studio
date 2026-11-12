import { useState } from 'react';
import { Section, NumberField } from './components';
import {
  applyMotion,
  captureMotion,
  keyCharacterPose,
  mirrorPose,
  motionNames,
  presetMotion,
  smoothCharacterPoseKeys,
} from './motion';
import type { Project } from './model';
import { BlenderMotionPanel } from './BlenderMotionPanel';
export function MotionPanel({
  project,
  id,
  frame,
  onCommit,
  onNotice,
}: {
  project: Project;
  id: string;
  frame: number;
  onCommit: (update: (p: Project) => Project) => void;
  onNotice: (message: string) => void;
}) {
  const [clipId, setClipId] = useState('Walk'),
    [cycles, setCycles] = useState(1),
    [speed, setSpeed] = useState(1),
    [travel, setTravel] = useState(0),
    [name, setName] = useState('My motion'),
    [length, setLength] = useState(48),
    [includeRoot, setIncludeRoot] = useState(false);
  const selectedClip = project.motionClips?.find((clip) => clip.id === clipId);
  const builtIn = motionNames.find((name) => name === clipId) || 'Walk';
  return (
    <>
      <Section title="Motion Library">
        <BlenderMotionPanel
          fps={project.fps}
          capacity={64 - (project.motionClips?.length || 0)}
          onImport={(clips) => {
            if (!clips.length) return;
            onCommit((p) => ({
              ...p,
              motionClips: [...(p.motionClips || []), ...clips].slice(0, 64),
            }));
            setClipId(clips[0].id);
            onNotice(
              `Added ${clips.length} Blender ${clips.length === 1 ? 'action' : 'actions'} to Motion Library.`,
            );
          }}
        />
        <label className="select-row">
          Motion
          <select
            aria-label="Motion clip"
            value={selectedClip?.id || builtIn}
            onChange={(e) => setClipId(e.target.value)}
          >
            <optgroup label="Built-in motions">
              {motionNames.map((n) => (
                <option key={n}>{n}</option>
              ))}
            </optgroup>
            {!!project.motionClips?.length && (
              <optgroup label="Project library">
                {project.motionClips.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </label>
        <div className="motion-settings">
          <label>
            Cycles
            <NumberField
              label="Motion cycles"
              value={cycles}
              min={1}
              max={30}
              step={1}
              onCommit={(v) => setCycles(Math.round(v))}
            />
          </label>
          <label>
            Speed
            <NumberField
              label="Motion speed"
              value={speed}
              min={0.25}
              max={4}
              step={0.25}
              onCommit={setSpeed}
            />
          </label>
          {includeRoot && (
            <label>
              Travel
              <NumberField
                label="Motion travel"
                value={travel}
                min={-100}
                max={100}
                step={1}
                onCommit={setTravel}
              />
            </label>
          )}
        </div>
        <label className="check-row">
          <input
            type="checkbox"
            checked={includeRoot}
            onChange={(e) => setIncludeRoot(e.target.checked)}
          />{' '}
          Include clip root motion
        </label>
        <button
          className="button full"
          onClick={() => {
            const clip = selectedClip || presetMotion(builtIn);
            onCommit((p) =>
              applyMotion(p, id, clip, frame, cycles, speed, includeRoot ? travel : 0, includeRoot),
            );
            onNotice(`Applied ${clip.name} from frame ${frame}.`);
          }}
        >
          Apply at Playhead
        </button>
        <p className="hint">
          Applies pose and face keys. Enable root motion to use authored jumps or travel.
        </p>
        {selectedClip && (
          <button
            className="button full"
            onClick={() => {
              onCommit((p) => ({
                ...p,
                motionClips: p.motionClips?.filter((clip) => clip.id !== selectedClip.id),
              }));
              setClipId('Walk');
              onNotice(`Removed ${selectedClip.name} from the project library.`);
            }}
          >
            Remove Action from Library
          </button>
        )}
        <div className="motion-capture">
          <input
            aria-label="Motion library name"
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <NumberField
            label="Capture motion length"
            value={length}
            min={1}
            max={3600}
            step={1}
            onCommit={(v) => setLength(Math.round(v))}
          />
        </div>
        <button
          className="button full"
          disabled={(project.motionClips?.length || 0) >= 64}
          onClick={() => {
            const clip = captureMotion(
              project,
              id,
              frame,
              Math.min(project.duration, frame + length),
              name,
            );
            if (!Object.keys(clip.tracks).length && !clip.faceKeys?.length) {
              onNotice('Animate this character before capturing a clip.');
              return;
            }
            onCommit((p) => ({ ...p, motionClips: [...(p.motionClips || []), clip] }));
            setClipId(clip.id);
            onNotice('Motion saved in the project library; apply it to another character.');
          }}
        >
          Capture to Project Library
        </button>
      </Section>
      <Section title="Pose Tools">
        <div className="pose-buttons">
          <button onClick={() => onCommit((p) => mirrorPose(p, id, frame, true))}>
            Mirror Pose
          </button>
          <button onClick={() => onCommit((p) => keyCharacterPose(p, id, frame))}>
            Key Full Pose
          </button>
        </div>
        <button className="button full" title="Convert pose keys inside the playback range to continuous spline interpolation"
          disabled={project.objects.find(object => object.id === id)?.locked}
          onClick={() => { onCommit(p => smoothCharacterPoseKeys(p,id)); onNotice('Smoothed pose keys in the playback range.'); }}>
          Smooth Pose Keys
        </button>
      </Section>
    </>
  );
}
