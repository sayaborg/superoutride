import { browserContent } from './browser-content.js';
import { createRaceSprites } from '../view/race-sprites.js';
import { createDisplaySettings } from '../view/display-settings.js';
import { mountStripControls } from './strip-controls.js';
import { DEFAULT_RESULT_DELAY_SECONDS, mountResultDelayControls } from './result-delay-controls.js';
import { mountCameraControls } from './camera-controls.js';
import { CAMERA_DEFINITION } from '../view/camera-definition.js';
import { SIM_DT } from '../race/fixed-step.js';
import { createVehicleSprites } from '../view/vehicle-sprites.js';
import { createBrowserDrivingShell } from './driving-shell.js';
import { mountRunControls } from './run-controls.js';
import type { BrowserCourseId, BrowserCourseSelection } from './course-selection.js';
import { mustGet } from './dom.js';
import { loadDeliveredCourse } from '../content/load-delivered-course.js';
import { loadVehicleDefinitions } from '../content/vehicle-catalog.js';
import { loadEngineSounds } from '../content/engine-sound-catalog.js';
import { createCourseRace } from '../race/course-race.js';
import { raceStatusText } from './race-status-hud.js';
import { createCoursePerformanceHud } from './course-performance-hud.js';
import { resolveCourseSession, type EntryVehicle } from '../race/course-session.js';
import { rivalPoolPairs } from '../race/free-play-field.js';
import { readCourseTimeBudgets, type CourseTimeBudgets } from '../content/course-time-budgets.js';
import { readPaceSchedule } from '../content/pace-schedule.js';
import { loadSeriesCatalog, loadSeriesCourse } from '../content/series-catalog.js';
import { createSessionVehicle, type SessionVehicle } from '../content/session-vehicle.js';
import { readBrowserSessionSettings, mountCourseSessionControls } from './course-session-controls.js';
import { createCourseScene } from '../view/course-scene.js';
import { createRunState, type RunFacts } from './run-state.js';
import { readRivalEnvelope, type RivalEnvelope } from '../content/rival-envelope.js';
import { loadSurfaceMaterials } from '../content/surface-material-catalog.js';
import { admitProduct } from '../content/delivered-product.js';
import { compileSessionConfiguration, type SessionConfiguration } from '../race/session-configuration.js';
import { resolveSurfaceSoundRecords } from '../audio/surface-sounds.js';
import { loadSurfaceSounds } from '../content/surface-sound-catalog.js';
import { loadAudioSettings } from '../content/audio-catalog.js';
import { browserStorage, openPlayerRecord } from './player-record.js';
import { spriteSetHasColor } from '../vehicle/vehicle-sprite-set.js';
import { loadTextTiles } from '../content/text-tiles-catalog.js';
import { TEXT_PALETTES } from '../image/text-tiles.js';
import { createTextLayer, TEXT_COLUMNS, TEXT_ROWS } from '../view/text-layer.js';

/** PAUSED is centred in the text grid while the run is paused. */
const PAUSED = 'PAUSED';
const PAUSED_COLUMN = (TEXT_COLUMNS - PAUSED.length) / 2;
const PAUSED_ROW = Math.floor((TEXT_ROWS - 1) / 2);

/** The one run the page drives: its fixed step, its frame and its Session controls. */
type Run = {
  readonly tick: () => void;
  readonly render: () => void;
  readonly controls: { show(facts: RunFacts): void; begin(): void };
};

/** Start the page and the run of the course boot selected from the delivered courses. */
export async function startCourse(
  courses: readonly BrowserCourseSelection[],
  selection: BrowserCourseSelection,
): Promise<void> {
  const canvas = mustGet<HTMLCanvasElement>('game');
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  status.textContent = 'Loading course…';
  canvas.insertAdjacentElement('afterend', status);

  try {
    // The page lifetime: delivered content, catalogs, settings and browser devices are created once.
    const content = await browserContent();
    const materials = await loadSurfaceMaterials(content);
    const materialIds = materials.source.materials.map((material) => material.id);
    const surfaceSounds = {
      materialIds,
      surfaces: resolveSurfaceSoundRecords(await loadSurfaceSounds(content), materialIds),
    };
    const definitions = await loadVehicleDefinitions(content, await loadEngineSounds(content));
    const { vehicles, driving } = definitions;
    const parameters = new URLSearchParams(location.search);
    const series = await loadSeriesCatalog(content, vehicles);
    const player = openPlayerRecord(browserStorage());
    const displaySettings = createDisplaySettings();
    const textLayer = createTextLayer(await loadTextTiles(content));
    const raceSprites = createRaceSprites(vehicles);
    // The one run; the page's frame callbacks drive it.
    let run: Run | null = null;
    const shell = createBrowserDrivingShell(
      courses,
      vehicles,
      surfaceSounds,
      await loadAudioSettings(content),
      player,
      {
        tick: () => run?.tick(),
        render: () => run?.render(),
      },
    );
    const raceStatus = document.createElement('output');
    raceStatus.setAttribute('role', 'status');
    raceStatus.setAttribute('aria-label', 'Session status');
    raceStatus.setAttribute('aria-live', 'off');
    raceStatus.className = 'course-status';
    canvas.insertAdjacentElement('afterend', raceStatus);
    // The camera definition in use: the product's until a DEV adjustment replaces it.
    let cameraDefinition = CAMERA_DEFINITION;
    const performanceHud = createCoursePerformanceHud(canvas);
    // RESULT (today, finishing the run state) follows GOAL or GAME OVER after the DEV delay, counted in fixed steps
    // while the loop, the field, rendering and sound continue.
    let resultDelaySeconds = DEFAULT_RESULT_DELAY_SECONDS;
    // The one run state drives the shell once begun; it starts the run unless the page is hidden.
    const runState = createRunState(window, document, shell.setRunning, (facts) => run?.controls.show(facts));
    mountResultDelayControls(resultDelaySeconds, (seconds) => (resultDelaySeconds = seconds));
    mountCameraControls((definition) => (cameraDefinition = definition));
    mountStripControls(displaySettings.stripMethod, (value) => {
      displaySettings.setStripMethod(value);
      run?.render();
    });

    /**
     * The run lifetime: the course, its Session settings, field, products and scene, the player's sprites and camera,
     * and the run's DEV controls.
     */
    const assembleRun = async (courseId: BrowserCourseId) => {
      const course = await loadDeliveredCourse(content, courseId, materials);
      // The course's ARCADE settings come from the one series holding it; a course in no series is untimed.
      const arcade = loadSeriesCourse(content, series, course);
      const settings = readBrowserSessionSettings(parameters, arcade, vehicles);
      const entry = vehicles.find((v) => v.compiledVehicle.id === settings.vehicleId)!;
      const vehicle = createSessionVehicle(entry, driving, materials);
      const vehicleId = vehicle.vehicleDefinition.compiledVehicle.id;
      const rivalEnvelope = await admitProduct(content, 'envelope', vehicleId, (value, document) =>
        readRivalEnvelope(vehicle, value, document),
      );
      // Every other vehicle in the field (series entries, or the FREE PLAY rival pool) drives its own Session vehicle
      // and envelope.
      const rivalPool = settings.rivalPool === null ? [] : rivalPoolPairs(vehicles, settings.rivalPool);
      const fieldVehicles = new Map<string, EntryVehicle>([[vehicleId, { vehicle, envelope: rivalEnvelope }]]);
      const fieldIds =
        settings.mode === 'ARCADE'
          ? arcade!.entries.map((e) => e.vehicle)
          : settings.rivalCount > 0
            ? rivalPool.map((pair) => pair.vehicle)
            : [];
      for (const id of new Set(fieldIds)) {
        if (fieldVehicles.has(id)) continue;
        const other = createSessionVehicle(
          vehicles.find((v) => v.compiledVehicle.id === id)!,
          driving,
          materials,
        );
        fieldVehicles.set(id, {
          vehicle: other,
          envelope: await admitProduct(content, 'envelope', id, (value, document) =>
            readRivalEnvelope(other, value, document),
          ),
        });
      }
      const vehicleOf = (id: string) => fieldVehicles.get(id)!;
      // The player's chosen color for the vehicle, from the player record when its sprite set has it.
      const recordedColor = player.settings.vehicleColors[vehicleId];
      const playerColor =
        recordedColor !== undefined && spriteSetHasColor(entry.spriteSet, recordedColor) ? recordedColor : undefined;
      // A timed course's budgets must be delivered; a missing file stops loading rather than dropping the clock.
      const budgets =
        settings.timeLimit && arcade
          ? await admitProduct(content, 'budget', `${courseId}/${vehicleId}`, (value, document) =>
              readCourseTimeBudgets(course, vehicle, value, document),
            )
          : null;
      // ARCADE admits the player vehicle's pace schedule once.
      const paceSchedule =
        settings.mode === 'ARCADE'
          ? await admitProduct(content, 'schedule', `${courseId}/${vehicleId}`, (value, document) =>
              readPaceSchedule(course, vehicle, value, document),
            )
          : undefined;
      /**
       * The one assembly of a Session, its scene (with a new Route runtime) and its race. The run's start and every
       * DEV tuning rebuild pass through it; the page's devices persist.
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
        const session = resolveCourseSession(course, arcade, configuration, sessionVehicle, envelope, sessionBudgets, {
          playerColor,
          vehicleOf,
          rivalPool,
          paceSchedule,
        });
        const scene = createCourseScene(course.entry, course.gates, vehicles, displaySettings);
        const race = createCourseRace({ session, runtime: scene.runtime });
        return { session, scene, race, tuned };
      };
      let active = build(vehicle, settings, rivalEnvelope, budgets, false);
      // The player's color is resolved with the Session; a DEV rebuild keeps it.
      const sprites = createVehicleSprites(entry, active.session.entries[0]!.color);
      const runControls = mountRunControls(vehicle, {
        world: () => active.scene.world,
        cameraDefinition: () => cameraDefinition,
        canRecover: () => runState.running && active.race.outcome.status === 'RUNNING',
        observation: () => active.race.observe().player,
        recover: () => active.race.recoverPlayer(),
        // A tuned driving definition has no delivered identity, so the rebuilt Session has no envelope,
        // time budgets, rivals or time limit. It starts from the grid at once, unpaused; reloading the page restores
        // the product Session.
        rebuildSession: (driving) => {
          active = build(
            createSessionVehicle(entry, driving, materials),
            {
              mode: 'FREE_PLAY',
              rivalCount: 0,
              lapCount: active.session.configuration.lapCount,
              timeLimit: false,
              initialSpeed: 0,
            },
            null,
            null,
            true,
          );
          lifecycle.update(true);
          afterEndingSeconds = 0;
          controls.begin();
          runState.restart();
        },
      });
      const { lifecycle } = runControls;
      // Every Session shares the compiled course's ground, so its maximum is derived once.
      performanceHud.setCourse({
        maxActiveStrips: Math.max(...course.sections.map((section) => section.color.metrics.maxActiveStrips)),
      });
      let afterEndingSeconds = 0;
      const tick = () => {
        const started = performance.now();
        const { race } = active;
        const step = race.advance(shell.inputManager.sample());
        lifecycle.update(step.recovered);
        performanceHud.step(performance.now() - started);
        if (race.outcome.status === 'GOAL' || race.outcome.status === 'GAME_OVER') {
          if (afterEndingSeconds + SIM_DT / 2 >= resultDelaySeconds) runState.finish();
          else afterEndingSeconds += SIM_DT;
        }
      };
      const render = () => {
        const { scene, race, tuned } = active;
        const started = performance.now(),
          observations = race.observe();
        const others = raceSprites(observations.rivals, lifecycle.camera);
        // The renderer reads no clock; its caller times the scene render for the performance HUD.
        const renderStarted = performance.now();
        const result = scene.render(
          shell.framebuffer,
          observations.player,
          lifecycle.camera,
          observations.player.brakeLampOn ? sprites.on : sprites.off,
          others,
        );
        const renderMilliseconds = performance.now() - renderStarted;
        // The text layer draws over the scene before the frame is presented.
        textLayer.clear();
        if (runState.paused) textLayer.write(PAUSED_COLUMN, PAUSED_ROW, PAUSED, TEXT_PALETTES.WHITE);
        textLayer.draw(shell.framebuffer);
        shell.present(courseId, lifecycle.camera, result.playerScreenX, result.playerScreenY, observations, {
          ...race.playerDiagnostics,
          driving: runControls.driving,
          definition: runControls.definition,
        });
        raceStatus.textContent = raceStatusText(race, { tuned });
        performanceHud.frame(started, result.stripGround, renderMilliseconds);
      };
      const controls = mountCourseSessionControls(
        canvas,
        settings,
        arcade,
        course.rules.maxLaps,
        {
          start: () => {
            shell.inputManager.reset();
            lifecycle.reset();
            active.race.start();
          },
          togglePause: () => {
            runState.setPaused(!runState.paused);
            if (!runState.paused) canvas.focus();
          },
        },
        vehicles,
      );
      return { tick, render, controls };
    };
    run = await assembleRun(selection.query);
    status.remove();
    runState.begin();
    if (parameters.get('autostart') === '1') run.controls.begin();
  } catch (error) {
    console.error('Course could not start', error);
    status.textContent = `Course could not start: ${error instanceof Error ? error.message : String(error)} `;
    const retry = document.createElement('button');
    retry.textContent = 'Retry';
    retry.onclick = () => location.reload();
    status.append(retry);
  }
}
