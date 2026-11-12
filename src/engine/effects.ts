import * as THREE from 'three';
import type { ParticleEffect } from '../model';
export const effectDefaults: ParticleEffect = {
  kind: 'sparks',
  seed: 17,
  count: 180,
  start: 0,
  end: 36,
  color: '#ffd59a',
  size: 0.065,
  spread: 2,
  speed: 4,
  gravity: 2,
  loop: false,
};
export function particleState(
  effect: ParticleEffect,
  index: number,
  frame: number,
): { position: [number, number, number]; alpha: number } {
  const random = (offset: number) => {
    const n = Math.sin((index + 1) * 127.1 + (effect.seed + offset) * 311.7) * 43758.5453123;
    return n - Math.floor(n);
  };
  let progress = (frame - effect.start) / Math.max(1, effect.end - effect.start);
  if (progress < 0 || (!effect.loop && progress > 1)) return { position: [0, 0, 0], alpha: 0 };
  if (effect.loop) progress = ((progress % 1) + 1) % 1;
  const theta = random(1) * Math.PI * 2,
    radius = random(2),
    height = random(3),
    speed = effect.speed;
  if (effect.kind === 'embers') {
    const age = (progress + random(4)) % 1;
    return {
      position: [
        Math.cos(theta) * radius * effect.spread + Math.sin(age * 7 + theta) * 0.2,
        age * speed,
        Math.sin(theta) * radius * effect.spread,
      ],
      alpha: Math.sin(age * Math.PI) * (0.35 + height * 0.65),
    };
  }
  if (effect.kind === 'ring') {
    const angle = (index / Math.max(1, effect.count)) * Math.PI * 2,
      rad = 0.2 + progress * effect.spread * 2;
    return {
      position: [Math.cos(angle) * rad, (random(5) - 0.5) * 0.1, Math.sin(angle) * rad],
      alpha: (1 - progress) ** 2,
    };
  }
  if (effect.kind === 'vortex') {
    const angle = theta + progress * Math.PI * 6 + height * 5,
      rad = effect.spread * (0.35 + 0.65 * radius) * (1 - progress * 0.35);
    return {
      position: [Math.cos(angle) * rad, height * speed, Math.sin(angle) * rad],
      alpha: Math.sin(progress * Math.PI) * (0.5 + radius * 0.5),
    };
  }
  const age = Math.max(0, progress - random(4) * 0.12),
    elevation = 0.15 + height * 1.5,
    v = (0.4 + radius * 0.6) * speed;
  return {
    position: [
      Math.cos(theta) * age * v * effect.spread,
      Math.sin(elevation) * age * v - effect.gravity * age * age,
      Math.sin(theta) * age * v * effect.spread,
    ],
    alpha: Math.max(0, 1 - progress) ** 1.8,
  };
}
export function effectMesh(effect: ParticleEffect): THREE.Group {
  const root = new THREE.Group(),
    geometry = new THREE.BufferGeometry(),
    positions = new Float32Array(effect.count * 3),
    colors = new Float32Array(effect.count * 4),
    color = new THREE.Color(effect.color);
  geometry.setAttribute(
    'position',
    new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage),
  );
  geometry.setAttribute(
    'color',
    new THREE.BufferAttribute(colors, 4).setUsage(THREE.DynamicDrawUsage),
  );
  const material = new THREE.PointsMaterial({
    size: effect.size,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  root.add(points);
  root.userData.animate = (_seconds: number, frame: number) => {
    for (let i = 0; i < effect.count; i++) {
      const particle = particleState(effect, i, frame);
      positions.set(particle.position, i * 3);
      colors.set([color.r * 3, color.g * 3, color.b * 3, particle.alpha], i * 4);
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.color.needsUpdate = true;
  };
  root.userData.animate(0, 0);
  return root;
}
