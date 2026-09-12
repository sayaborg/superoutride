import { composeBrowserCourseContent } from './browser/course-mode-selection.js';
import { createBrowserDrivingShell } from './browser/driving-shell.js';
import {
  createLinearHighwayRuntime,
  LINEAR_PLAYER_START_L,
  LINEAR_RECOVERY_PROFILE,
} from './dev/courses/linear-highway.js';
import { advanceVehicleWithRecovery } from './gameplay/recovery.js';
import type { DrivingInput } from './input/driving-input.js';
import { renderDriving } from './render/renderer.js';
import { deriveVehicleSpriteFamily } from './render/vehicle-presentation.js';
import { createFarBackground } from './visual/far-background.js';
import { createSpriteAssets } from './visual/sprite-assets.js';

const { mode: selectedCourseMode, content: runtime } = composeBrowserCourseContent(
  'LINEAR',
  { linear: createLinearHighwayRuntime },
  new URLSearchParams(location.search).get('mode'),
);
const spriteAssets = createSpriteAssets();
const background = createFarBackground();
const world = { guide: runtime.guide, height: runtime.heightProfile, surfaces: runtime.surfaceMap };
const shell = createBrowserDrivingShell(world, LINEAR_PLAYER_START_L);
const { framebuffer, inputManager } = shell;

let input: DrivingInput = { steering: 0, throttle: false, brake: false };
const lifecycle = shell.mountControls({ world: () => world, recoveryProfile: LINEAR_RECOVERY_PROFILE });

function tick(dt: number): void {
  input = inputManager.sample();
  const recovered = advanceVehicleWithRecovery(world, shell.vehicle, {
    state: shell.recovery,
    input,
    dt,
    profile: LINEAR_RECOVERY_PROFILE,
  });
  lifecycle.update(dt, recovered !== null);
}

function render(): void {
  const { camera } = lifecycle;
  const spriteFamily = deriveVehicleSpriteFamily(shell.presentation);
  const stats = renderDriving(
    framebuffer,
    {
      background,
      guide: runtime.guide,
      camera,
      vehicle: shell.vehicle,
      terrainProfile: runtime.terrainProfile,
      groundProfile: runtime.groundProfile,
      worldSprites: [],
      assets: spriteAssets,
      playerKind: spriteFamily,
    },
    {},
  );
  shell.present(selectedCourseMode.query, input, camera, stats.playerScreenY);
}

shell.start(tick, render);
