import { createM83LinearHighwayRuntime } from '../dist/dev/m8-3-linear-highway.js';
import { createArcadeVehicle, updateArcadeVehicle } from '../dist/physics/arcade-vehicle-physics.js';
import { DEFAULT_VEHICLE_CATALOG_ENTRY } from '../dist/vehicle/vehicle-catalog.js';
import { DEFAULT_BROWSER_TIRE_FRICTION_CALIBRATION } from '../dist/browser/tire-friction-selection.js';
import { createM5CameraRig, updateM5Camera } from '../dist/camera/m5-camera.js';
import { CURRENT_M5_CAMERA_PROFILE } from '../dist/camera/current-camera-profile.js';
import { renderM5Driving } from '../dist/render/m5-renderer.js';
import { SoftwareSurface } from '../dist/render/software-surface.js';
import { createM3FarBackground } from '../dist/visual/far-background.js';
import { createM4SpriteAssets } from '../dist/visual/m4-sprite-assets.js';
import { createDynamicVehicleCourseSprite } from '../dist/world/dynamic-vehicle-sprite.js';
import { SIM_DT } from '../dist/core/constants.js';

const runtime = createM83LinearHighwayRuntime();
const { guide, heightProfile: height, surfaceMap: surfaces } = runtime;
const entry = DEFAULT_VEHICLE_CATALOG_ENTRY;
const assets = createM4SpriteAssets();
const background = createM3FarBackground();
const canvas = document.getElementById('frame');
const ctx = canvas.getContext('2d', { alpha: false });
const data = ctx.createImageData(320, 240);
const target = new SoftwareSurface(320, 240, new Uint32Array(data.data.buffer));
const output = document.getElementById('result');
const button = document.getElementById('run');
const input = { steering: 0, throttle: 1, brake: 0 };
const frames = 120;
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

function trial(count, observe) {
  const actors = Array.from({ length: count }, (_, i) => createArcadeVehicle(entry.profile,
    guide, height, surfaces, 45 + i * 6, 0, 45, undefined,
    DEFAULT_BROWSER_TIRE_FRICTION_CALIBRATION, entry.torqueProtection));
  const rig = createM5CameraRig();
  let physicsMs = 0;
  let renderMs = 0;
  let presentMs = 0;
  for (let frame = 0; frame < frames; frame++) {
    let start = performance.now();
    for (const actor of actors) updateArcadeVehicle(guide, height, surfaces, actor, input, SIM_DT);
    physicsMs += performance.now() - start;
    start = performance.now();
    const camera = updateM5Camera(rig, guide, height, actors[0], CURRENT_M5_CAMERA_PROFILE, SIM_DT);
    const sprites = actors.slice(1).map((actor, i) => createDynamicVehicleCourseSprite(
      `probe-${i}`, actor, camera.yaw, assets.car, height));
    renderM5Driving(target, background, guide, camera, actors[0], runtime.terrainProfile,
      runtime.groundProfile, sprites, assets, 'car', undefined, observe);
    renderMs += performance.now() - start;
    start = performance.now();
    ctx.putImageData(data, 0, 0);
    presentMs += performance.now() - start;
  }
  // The checksum makes equal end-state/frame work visible without timing a readback.
  let checksum = 0;
  for (const pixel of target.pixels) checksum = (Math.imul(checksum, 31) + pixel) >>> 0;
  return { physicsMs: physicsMs / frames, renderMs: renderMs / frames,
    presentMs: presentMs / frames, checksum, state: actors.map(a => [a.x, a.y, a.z, a.yaw]) };
}

button.addEventListener('click', async () => {
  button.disabled = true;
  try {
    const report = { userAgent: navigator.userAgent, logicalSize: '320x240', framesPerTrial: frames,
      simulationDt: SIM_DT, input, warmupTrials: 2, measuredPairedTrials: 3, rows: [] };
    trial(1, false); trial(1, true);
    for (const count of [1, 4, 8, 17]) {
      const modes = [[], []];
      for (let pair = 0; pair < 3; pair++) {
        for (const mode of pair % 2 ? [1, 0] : [0, 1]) {
          modes[mode].push(trial(count, !!mode));
          output.textContent = `Measuring ${count} actors, pair ${pair + 1}/3`;
          await new Promise(resolve => requestAnimationFrame(resolve));
        }
      }
      const reference = JSON.stringify([modes[0][0].checksum, modes[0][0].state]);
      if (!modes.flat().every(r => JSON.stringify([r.checksum, r.state]) === reference)) {
        throw new Error('diagnostic on/off state or frame mismatch');
      }
      report.rows.push({ actors: count, checksum: modes[0][0].checksum,
        diagnosticsOff: summarize(modes[0]), diagnosticsOn: summarize(modes[1]) });
    }
    output.textContent = JSON.stringify(report, null, 2);
  } catch (error) {
    output.textContent = String(error.stack ?? error);
  } finally {
    button.disabled = false;
  }
});

function summarize(rows) {
  return Object.fromEntries(['physicsMs', 'renderMs', 'presentMs'].map(key => [key, median(rows.map(r => r[key]))]));
}
