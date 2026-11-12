import test from 'node:test';
import assert from 'node:assert/strict';
import { Euler, Vector3 } from 'three';
import { applyCinematicPreset, cinematicLooks, isCinematicSettings } from '../src/cinematic';
import { defaultLighting, demoProject, identity, validateProject } from '../src/model';
import type { SceneObject } from '../src/model';

test('every cinematic look survives project save and restore with a distinct grade', () => {
  const styles = new Set<string>();
  for (const look of cinematicLooks) {
    const p = applyCinematicPreset(demoProject(), look.id);
    const restored = validateProject(JSON.parse(JSON.stringify(p)));
    const settings = restored.lighting.cinematic!;
    assert.equal(settings.mode, look.id);
    assert.ok(settings.rigIds.length > 0 && settings.rigIds.length <= 3);
    assert.ok(
      settings.rigIds.every((id) =>
        restored.objects.some((o) => o.id === id && o.lightType === 'area'),
      ),
    );
    styles.add([settings.shadowTint, settings.highlightTint, settings.contrast].join('/'));
  }
  assert.equal(styles.size, cinematicLooks.length);
});

test('preset fixtures face the subject, scale with the scene and keep the focus reference', () => {
  const center: [number, number, number] = [120, 30, -65];
  const p = applyCinematicPreset(demoProject(), 'studio', {
    center,
    radius: 3,
    floor: 27,
    towardCamera: [1, 0, 0],
    focusDistance: 8.5,
    focusSubject: 'character',
  });
  const settings = p.lighting.cinematic!;
  assert.equal(settings.focusSubject, 'character');
  assert.equal(settings.focusDistance, 8.5);
  assert.equal(settings.hazeBase, 27);
  for (const id of settings.rigIds) {
    const { transform } = p.objects.find((o) => o.id === id)!;
    const toTarget = new Vector3(...center).sub(new Vector3(...transform.position)).normalize();
    const lightNormal = new Vector3(0, 0, -1).applyEuler(new Euler(...transform.rotation));
    assert.ok(toTarget.dot(lightNormal) > 0.999);
  }
  const first = p.objects.find((o) => o.id === settings.rigIds[0])!;
  assert.ok(first.transform.position[0] > center[0], 'softbox key faces the camera side');
});

test('switching looks replaces owned fixtures while preserving manual and animated lights', () => {
  const p = demoProject();
  const manual: SceneObject = {
    id: 'manual',
    name: 'Manual light',
    type: 'light',
    transform: identity(),
    visible: true,
  };
  p.objects.push(manual);
  const noir = applyCinematicPreset(p, 'noir');
  const [animated, ...replaceable] = noir.lighting.cinematic!.rigIds;
  noir.tracks[animated] = [{ ...identity(), frame: 0, interpolation: 'linear' }];
  const studio = applyCinematicPreset(noir, 'studio');
  assert.ok(studio.objects.some((o) => o.id === animated));
  assert.deepEqual(studio.tracks[animated], noir.tracks[animated]);
  assert.ok(studio.objects.some((o) => o.id === manual.id));
  assert.ok(replaceable.every((id) => !studio.objects.some((o) => o.id === id)));
  const standard = applyCinematicPreset(studio, 'standard');
  assert.deepEqual(standard.lighting, defaultLighting);
  assert.equal(standard.objects.length, p.objects.length + 1);
});

test('loaded looks reject invalid values and avoid exceeding the scene object limit', () => {
  const p = demoProject();
  p.objects = Array.from({ length: 499 }, (_, i) => ({
    id: `group-${i}`,
    name: `Group ${i}`,
    type: 'group',
    visible: true,
    transform: identity(),
  }));
  p.tracks = {};
  const result = applyCinematicPreset(p, 'noir');
  assert.equal(result.objects.length, 500);
  const settings = result.lighting.cinematic!;
  assert.equal(settings.rigIds.length, 1);
  assert.ok(isCinematicSettings(settings));
  for (const malformed of [
    { focusDistance: 0 },
    { hazeHeight: Infinity },
    { lightShafts: 2 },
    { hazeTint: 'red' },
    { rigIds: ['manual'] },
  ]) {
    assert.equal(isCinematicSettings({ ...settings, ...malformed }), false);
  }
});
