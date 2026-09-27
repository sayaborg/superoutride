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
import type { DrivingInput } from '../vehicle/driving-input.js';
import { loadVehicleDefinitions } from '../content/vehicle-catalog.js';
import { createCourseRace } from '../race/course-race.js';
import { raceStatusText } from './race-status-hud.js';
import { createCoursePerformanceHud } from './course-performance-hud.js';
import { resolveCourseSession } from '../race/course-session.js';
import { readCourseTimeBudgets, type CourseTimeBudgets } from '../content/course-time-budgets.js';
import { isTimedCourse } from '../course/compiler/compiled-course.js';
import { createSessionVehicle, type SessionVehicle } from '../content/session-vehicle.js';
import { readBrowserSessionSettings, mountCourseSessionControls } from './course-session-controls.js';
import { createCourseScene } from '../view/course-scene.js';
import { readRivalEnvelope, type RivalEnvelope } from '../content/rival-envelope.js';
import { loadSurfaceMaterials } from '../content/surface-material-catalog.js';
import { admitProduct } from '../content/delivered-product.js';
import { compileSessionConfiguration, type SessionConfiguration } from '../race/session-configuration.js';
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
  const vehicleId = vehicle.vehicleDefinition.compiledVehicle.id;
  const rivalEnvelope = await admitProduct(content, 'envelope', vehicleId, (value, document) =>
    readRivalEnvelope(vehicle, value, document),
  );
  // A timed course's budgets must be delivered; a missing file stops loading rather than dropping the clock.
  const budgets =
    settings.timeLimit && isTimedCourse(course)
      ? await admitProduct(content, 'budget', `${mode}/${vehicleId}`, (value, document) =>
          readCourseTimeBudgets(course, vehicle, value, document),
        )
      : null;
  const sprites = createVehicleSprites(entry);
  const displaySettings = createDisplaySettings();
  const raceSprites = createRaceSprites(sprites);
  /**
   * The one assembly of a Session, its scene (with a new Route runtime) and its race. Startup and every DEV
   * tuning rebuild pass through it; the shell and its devices persist.
   */
  const build = (
    sessionVehicle: SessionVehicle,
    settings: Omit<SessionConfiguration, 'seed'>,
    envelope: RivalEnvelope | null,
    sessionBudgets: CourseTimeBudgets | null,
    tuned: boolean,
  ) => {
    // The composition root alone draws randomness: every assembly, a DEV rebuild included, picks a new seed.
    const seed = crypto.getRandomValues(new Uint32Array(1))[0]!;
    const configuration = compileSessionConfiguration({ ...settings, seed });
    const session = resolveCourseSession(course, configuration, sessionVehicle, envelope, sessionBudgets);
    const scene = createCourseScene(course.entry, ground, course.gates, vehicles, displaySettings);
    const race = createCourseRace({ session, runtime: scene.runtime });
    return { session, scene, race, tuned };
  };
  let active = build(vehicle, settings, rivalEnvelope, budgets, false);
  const shell = createBrowserDrivingShell(vehicle);
  const raceStatus = document.createElement('output');
  raceStatus.setAttribute('role', 'status');
  raceStatus.setAttribute('aria-label', 'Session status');
  raceStatus.setAttribute('aria-live', 'off');
  raceStatus.className = 'course-status';
  canvas.insertAdjacentElement('afterend', raceStatus);
  const lifecycle = shell.mountControls({
    world: () => active.scene.world,
    canRecover: () => active.race.clock.status === 'RUNNING' && !manualPause && !document.hidden,
    observation: () => active.race.observe().player,
    recover: () => active.race.recoverPlayer(),
    // A tuned driving definition has no delivered identity, so the rebuilt Session has no envelope,
    // time budgets, rivals or time limit. It starts from the grid at once; reloading the page restores the product Session.
    rebuildSession: (driving) => {
      active = build(
        createSessionVehicle(entry, driving, materials),
        {
          mode: 'CUSTOM',
          rivalCount: 0,
          lapCount: active.session.configuration.lapCount,
          timeLimit: false,
          initialSpeed: 0,
        },
        null,
        null,
        true,
      );
      manualPause = false;
      lifecycle.update(true);
      controls.restart();
      shell.start(tick, render);
    },
  });
  const performanceHud = createCoursePerformanceHud(canvas, active.scene.groundMetrics);
  let input: DrivingInput = { steering: 0, throttle: false, brake: false };
  let manualPause = false;
  const tick = () => {
    const started = performance.now();
    input = shell.inputManager.sample();
    const step = active.race.advance(input);
    lifecycle.update(step.recovered);
    performanceHud.step(performance.now() - started);
  };
  const render = () => {
    const { scene, race, tuned } = active;
    const started = performance.now(),
      observations = race.observe();
    const result = scene.render(
      shell.framebuffer,
      observations.player,
      lifecycle.camera,
      observations.player.brakeLampOn ? sprites.on : sprites.off,
      raceSprites(observations.rivals, lifecycle.camera),
    );
    shell.present(mode, input, lifecycle.camera, result.playerScreenY, observations, race.playerDiagnostics);
    raceStatus.textContent = raceStatusText(race, { paused: manualPause, tuned });
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
        active.race.start();
      },
      pause: (paused) => {
        manualPause = paused;
        if (paused) {
          suspend();
          raceStatus.textContent = raceStatusText(active.race, { paused: true });
        } else shell.start(tick, render);
      },
    },
    vehicles,
  );
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) suspend();
    else if (!manualPause && (active.race.clock.status === 'RUNNING' || active.race.clock.status === 'READY'))
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
