import { browserContent } from './browser-content.js';
import { createRaceSprites } from '../view/race-sprites.js';
import { createDisplaySettings } from '../view/display-settings.js';
import { mountStripControls } from './strip-controls.js';
import { createVehicleSprites } from '../view/vehicle-sprites.js';
import { createBrowserDrivingShell } from './driving-shell.js';
import { selectBrowserCourseMode } from './course-mode-selection.js';
import { mustGet } from './dom.js';
import { loadDeliveredCourse } from '../content/load-delivered-course.js';
import { createCourseGround } from '../course/compiler/course-ground.js';
import { RECOVERY_SETTINGS } from '../race/recovery.js';
import type { DrivingInput } from '../vehicle/driving-input.js';
import { loadVehicleDefinitions } from '../content/vehicle-catalog.js';
import { createCourseRace } from '../race/course-race.js';
import { createCoursePerformanceHud } from './course-performance-hud.js';
import { resolveCourseSession } from '../race/course-session.js';
import { readCourseTimeBudgets } from '../race/course-time-budgets.js';
import { isTimedCourse } from '../course/compiler/compiled-course.js';
import { createSessionVehicle } from '../race/session-vehicle.js';
import { readBrowserSessionSettings, mountCourseSessionControls } from './course-session-controls.js';
import { createCourseScene } from '../view/course-scene.js';
import { readVehicleEnvelope } from '../race/vehicle-envelope.js';
import { loadSurfaceMaterials } from '../content/surface-material-catalog.js';
import { requireLoaded } from '../content/content-load-error.js';
import type { AdmissionResult } from '../core/admission.js';
import { validateTireSoundMaterialIds } from '../audio/tire-surface-acoustics.js';

const canvas = mustGet<HTMLCanvasElement>('game');
const status = document.createElement('p');
status.setAttribute('role', 'status');
status.textContent = 'Loading course…';
canvas.insertAdjacentElement('afterend', status);

try {
  const content = await browserContent();
  const materials = await loadSurfaceMaterials(content);
  validateTireSoundMaterialIds(materials.source.materials.map((material) => material.id));
  const definitions = await loadVehicleDefinitions(content);
  const { vehicles, driving } = definitions;
  const mode = selectBrowserCourseMode(new URLSearchParams(location.search).get('mode')).query;
  const course = await loadDeliveredCourse(content, mode, materials);
  const ground = createCourseGround(course);
  const parameters = new URLSearchParams(location.search);
  const settings = readBrowserSessionSettings(parameters, course.rules.classic, vehicles);
  const preset = readBrowserSessionSettings(new URLSearchParams(), course.rules.classic, vehicles);
  const entry = vehicles.find((v) => v.compiledVehicle.id === settings.vehicleId)!;
  const vehicle = createSessionVehicle(entry, driving, materials);
  // Generated products are admitted with their delivered path as the diagnostic document.
  const admitProduct = async <T>(
    kind: 'envelope' | 'budget',
    id: string,
    read: (value: unknown, document: string) => Promise<AdmissionResult<T>>,
  ) => {
    const value = await content.json(kind, id);
    const document = content.manifest.files.find((file) => file.kind === kind && file.id === id)!.path;
    return requireLoaded(await read(value, document));
  };
  const vehicleId = vehicle.vehicleDefinition.compiledVehicle.id;
  const rivalEnvelope = await admitProduct('envelope', vehicleId, (value, document) =>
    readVehicleEnvelope(vehicle, value, document),
  );
  // A timed course's budgets must be delivered; a missing file stops loading rather than dropping the clock.
  const budgets =
    settings.timeLimit && isTimedCourse(course)
      ? await admitProduct('budget', `${mode}/${vehicleId}`, (value, document) =>
          readCourseTimeBudgets(course, vehicle, value, document),
        )
      : null;
  const session = resolveCourseSession(course, settings, vehicle, rivalEnvelope, budgets);
  const sprites = createVehicleSprites(entry);
  const displaySettings = createDisplaySettings();
  const scene = createCourseScene(course.entry, ground, course.gates, vehicles, displaySettings);
  const slot = session.grid[0]!;
  const shell = createBrowserDrivingShell(
    scene.world,
    slot.l,
    {
      s: slot.at.s,
      initialSpeed: session.initialSpeed,
      vehicle,
    },
    definitions,
  );
  const race = createCourseRace({
    session,
    player: {
      get vehicle() {
        return shell.vehicle;
      },
      get model() {
        return shell.model;
      },
      recovery: shell.recovery,
    },
    runtime: scene.runtime,
  });
  const raceSprites = createRaceSprites(sprites);
  const raceStatus = document.createElement('output');
  raceStatus.setAttribute('role', 'status');
  raceStatus.setAttribute('aria-label', 'Session status');
  raceStatus.setAttribute('aria-live', 'off');
  raceStatus.className = 'course-status';
  canvas.insertAdjacentElement('afterend', raceStatus);
  const lifecycle = shell.mountControls({
    world: () => scene.world,
    recoverySettings: RECOVERY_SETTINGS,
    canRecover: () => race.clock.status === 'RUNNING' && !manualPause && !document.hidden,
    recoveryL: race.recoveryL,
    observation: () => race.observe().player,
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
    lifecycle.update(step.recovered);
    performanceHud.step(performance.now() - started);
  };
  const render = () => {
    const started = performance.now(),
      observations = race.observe();
    const result = scene.render(
      shell.framebuffer,
      observations.player,
      lifecycle.camera,
      observations.player.brakeLampOn ? sprites.on : sprites.off,
      raceSprites(observations.rivals, lifecycle.camera),
    );
    shell.present(mode, input, lifecycle.camera, result.playerScreenY, observations);
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
  const controls = mountCourseSessionControls(
    canvas,
    settings,
    preset,
    course.rules.classic,
    course.rules.maxLaps,
    {
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
    },
    vehicles,
  );
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
