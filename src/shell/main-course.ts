import { browserContent } from './browser-content.js';
import { createRaceSprites } from '../view/race-sprites.js';
import { createDisplaySettings } from '../view/display-settings.js';
import { mountStripControls } from './strip-controls.js';
import { readSpriteAssets, createVehiclePaletteVariant } from '../image/sprite-assets.js';
import { createBrowserDrivingShell } from './driving-shell.js';
import { selectBrowserCourseMode } from './course-mode-selection.js';
import { mustGet } from './dom.js';
import { loadDeliveredCourse } from '../course/load-delivered-course.js';
import { createCourseGround } from '../course/compiler/course-ground.js';
import { RECOVERY_SETTINGS } from '../race/recovery.js';
import type { DrivingInput } from '../vehicle/driving-input.js';
import { deriveVehicleSpriteFamily } from '../view/vehicle-visuals.js';
import { VEHICLE_CATALOG } from '../vehicle/vehicle-catalog.js';
import { createCourseRace } from '../race/course-race.js';
import { createCoursePerformanceHud } from './course-performance-hud.js';
import { resolveCourseSession } from '../race/course-session.js';
import { readCourseTimeBudgets } from '../race/course-time-budgets.js';
import { browserSessionVehicle } from './session-vehicle.js';
import { readBrowserSessionSettings, mountCourseSessionControls } from './course-session-controls.js';
import { createCourseScene } from './course-scene.js';
import { readVehicleEnvelope } from '../race/vehicle-envelope.js';

const canvas = mustGet<HTMLCanvasElement>('game');
const status = document.createElement('p');
status.setAttribute('role', 'status');
status.textContent = 'Loading course…';
canvas.insertAdjacentElement('afterend', status);

try {
  const content = await browserContent();
  const mode = selectBrowserCourseMode(new URLSearchParams(location.search).get('mode')).query;
  const course = await loadDeliveredCourse(content, mode);
  const ground = createCourseGround(course);
  if (!course.rules) throw new RangeError('Playable courses require saved Session rules');
  const parameters = new URLSearchParams(location.search);
  const settings = readBrowserSessionSettings(parameters, course.rules.classic);
  const preset = readBrowserSessionSettings(new URLSearchParams(), course.rules.classic);
  const entry = VEHICLE_CATALOG.find((v) => v.compiledVehicle.id === settings.vehicleId)!;
  const vehicle = browserSessionVehicle(entry);
  const rivalEnvelope = await readVehicleEnvelope(vehicle, await content.json('envelope', vehicle.compiledVehicle.id));
  const budgets = settings.countdown
    ? await readCourseTimeBudgets(
        course,
        vehicle,
        await content.json('budget', `${mode}/${vehicle.compiledVehicle.id}`),
      )
    : null;
  const session = resolveCourseSession(course, settings, vehicle, rivalEnvelope, budgets);
  const sprites = readSpriteAssets(await content.json('image', 'vehicles'));

  const braking =
    vehicle.compiledVehicle.id === 'TESTAROSSA'
      ? Object.freeze({
          ...sprites,
          car: createVehiclePaletteVariant(sprites.car, sprites.car.assets[0]![0]!.paletteChoices[1]!),
        })
      : sprites;
  const displaySettings = createDisplaySettings();
  const scene = createCourseScene(course.entry, ground, sprites, course.gates, displaySettings);
  const slot = session.grid[0]!;
  const shell = createBrowserDrivingShell(scene.world, slot.l, {
    s: slot.at.s,
    initialSpeed: session.initialSpeed,
    vehicle,
  });
  const race = createCourseRace({
    session,
    player: {
      get vehicle() {
        return shell.vehicle;
      },
      recovery: shell.recovery,
    },
    runtime: scene.runtime,
  });
  const raceSprites = createRaceSprites(sprites, vehicle);
  const raceStatus = document.createElement('output');
  raceStatus.setAttribute('role', 'status');
  raceStatus.setAttribute('aria-label', 'Session status');
  raceStatus.setAttribute('aria-live', 'off');
  raceStatus.className = 'course-status';
  canvas.insertAdjacentElement('afterend', raceStatus);
  const lifecycle = shell.mountControls({
    world: () => scene.world,
    recoverySettings: RECOVERY_SETTINGS,
    configurationLocked: true,
    canRecover: () => race.clock.status === 'RUNNING' && !manualPause && !document.hidden,
    recoveryL: race.recoveryL,
    resync: () => {
      race.resyncPlayer();
    },
  });
  const performanceHud = createCoursePerformanceHud(canvas, scene.metrics, scene.groundMetrics);
  let input: DrivingInput = { steering: 0, throttle: false, brake: false };
  let manualPause = false;
  const tick = (dt: number) => {
    const started = performance.now();
    input = shell.inputManager.sample();
    const step = race.advance(input, dt);
    lifecycle.update(dt, step.recovered);
    performanceHud.step(performance.now() - started);
  };
  const render = () => {
    const started = performance.now(),
      observations = race.observe();
    const result = scene.render(
      shell.framebuffer,
      shell.vehicle,
      lifecycle.camera,
      deriveVehicleSpriteFamily(shell.presentation),
      raceSprites(observations.rivals, lifecycle.camera),
      input.brake ? braking : sprites,
    );
    shell.present(mode, input, lifecycle.camera, result.playerScreenY, observations.rivals);
    raceStatus.textContent = manualPause ? 'PAUSED' : race.label();
    performanceHud.frame(started, result.stripGround);
    if (race.clock.status === 'GOAL' || race.clock.status === 'GAME_OVER') {
      controls.complete();
      shell.stop();
      shell.inputManager.setSuspended(true);
    }
  };
  const suspend = () => {
    shell.stop();
    shell.inputManager.setSuspended(true);
  };
  const controls = mountCourseSessionControls(canvas, settings, preset, course.rules.maxLaps, {
    start: () => {
      shell.inputManager.setSuspended(true);
      shell.inputManager.setSuspended(false);
      race.start();
    },
    pause: (paused) => {
      manualPause = paused;
      if (paused) {
        suspend();
        raceStatus.textContent = 'PAUSED';
      } else shell.start(tick, render);
    },
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) suspend();
    else if (!manualPause && (race.clock.status === 'RUNNING' || race.clock.status === 'READY'))
      shell.start(tick, render);
  });
  mountStripControls(displaySettings.stripMethod, (value) => {
    displaySettings.setStripMethod(value);
    render();
  });
  status.remove();
  shell.start(tick, render);
  if (parameters.get('autostart') === '1') controls.begin();
} catch (error) {
  console.error('Course could not start', error);
  status.textContent = `Course could not start: ${error instanceof Error ? error.message : String(error)} `;
  const retry = document.createElement('button');
  retry.textContent = 'Retry';
  retry.onclick = () => location.reload();
  status.append(retry);
}
