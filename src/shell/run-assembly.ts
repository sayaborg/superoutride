import type { ContentDelivery } from '../content/content-manifest.js';
import type { CameraDefinition } from '../view/camera.js';
import { SIM_DT } from '../race/fixed-step.js';
import { createVehicleSprites } from '../view/vehicle-sprites.js';
import type { createBrowserDrivingShell } from './driving-shell.js';
import { mountRunDevControls } from './run-controls.js';
import { createDrivingLifecycle } from './driving-lifecycle.js';
import { createCameraRig } from '../view/camera.js';
import type { BrowserCourseSelection } from './course-selection.js';
import { loadDeliveredCourse } from '../content/load-delivered-course.js';
import type { loadVehicleDefinitions } from '../content/vehicle-catalog.js';
import { createCourseRace } from '../race/course-race.js';
import { runResult } from './race-status-hud.js';
import { writeHud } from './run-hud.js';
import { fuelCutRpm } from '../vehicle/physics/automatic-powertrain.js';
import type { TextLayer } from '../view/text-layer.js';
import type { createCoursePerformanceHud } from './course-performance-hud.js';
import { resolveCourseSession, type EntryVehicle } from '../race/course-session.js';
import { rivalPoolPairs } from '../race/free-play-field.js';
import { readCourseTimeBudgets, type CourseTimeBudgets } from '../content/course-time-budgets.js';
import { readPaceSchedule } from '../content/pace-schedule.js';
import { loadSeriesCourse, type loadSeriesCatalog } from '../content/series-catalog.js';
import { createSessionVehicle, type SessionVehicle } from '../content/session-vehicle.js';
import { runSettings, type RunRequest } from './run-request.js';
import { createCourseScene } from '../view/course-scene.js';
import type { RunFrame, RunScreenState } from './run-screen.js';
import { drawVehicleDebugHud } from './vehicle-debug-hud.js';
import { drawVehicleLeanDebug } from './debug/vehicle-lean-debug.js';
import { drawVehicleYawDebug } from './debug/vehicle-yaw-debug.js';
import { readRivalEnvelope, type RivalEnvelope } from '../content/rival-envelope.js';
import type { loadSurfaceMaterials } from '../content/surface-material-catalog.js';
import { admitProduct } from '../content/delivered-product.js';
import { compileSessionConfiguration, type SessionConfiguration } from '../race/session-configuration.js';
import type { DisplaySettings } from '../view/display-settings.js';
import type { createRaceSprites } from '../view/race-sprites.js';

/** The one run the page drives: its fixed step, its frame, its result and its disposal. */
export interface Run extends RunFrame {
  dispose(): void;
}
/** The page-lifetime objects a run is assembled from and drives; the composition root supplies them. */
export interface RunPage {
  readonly content: ContentDelivery;
  readonly materials: Awaited<ReturnType<typeof loadSurfaceMaterials>>;
  readonly series: Awaited<ReturnType<typeof loadSeriesCatalog>>;
  readonly vehicles: Awaited<ReturnType<typeof loadVehicleDefinitions>>['vehicles'];
  readonly driving: Awaited<ReturnType<typeof loadVehicleDefinitions>>['driving'];
  readonly displaySettings: DisplaySettings;
  readonly raceSprites: ReturnType<typeof createRaceSprites>;
  readonly shell: ReturnType<typeof createBrowserDrivingShell>;
  /** The DEV performance HUD; null without DEV. */
  readonly performanceHud: ReturnType<typeof createCoursePerformanceHud> | null;
  /** `dev=1`: the run builds its DEV controls and draws the DEV HUDs. */
  readonly dev: boolean;
  readonly courses: readonly BrowserCourseSelection[];
  /** The camera definition in use. */
  cameraDefinition(): CameraDefinition;
  /** The DEV RESULT delay in use. */
  resultDelaySeconds(): number;
  /** A new Session seed; only the composition root draws randomness. */
  drawSeed(): number;
}

/**
 * The run lifetime: the course, its Session settings, field, products and scene, the player's sprites and camera,
 * and the run's DEV controls.
 */
/**
 * Assemble a run for `request`, started at once; `state` is its run screen's state, which the run's DEV controls and
 * race end change.
 */
export async function assembleRun(page: RunPage, request: RunRequest, state: RunScreenState): Promise<Run> {
  const { content, materials, series, vehicles, driving, displaySettings, raceSprites, shell, performanceHud } = page;
  const { courseId } = request;
  const course = await loadDeliveredCourse(content, courseId, materials);
  // The course's ARCADE settings come from the one series holding it; a course in no series is untimed.
  const arcade = loadSeriesCourse(content, series, course);
  const settings = runSettings(request, arcade, vehicles, course.rules.maxLaps);
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
  // The player's chosen color for the vehicle.
  const playerColor = request.color ?? undefined;
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
    // The composition root alone draws randomness: every assembly, a DEV rebuild included, takes a new seed from it.
    const seed = page.drawSeed();
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
  const lifecycle = createDrivingLifecycle(createCameraRig(), {
    world: () => active.scene.world,
    cameraDefinition: page.cameraDefinition,
    observation: () => active.race.observe().player,
  });
  // The run's DEV controls, only with DEV.
  const devControls = page.dev
    ? mountRunDevControls(vehicle, {
        canRecover: () => state.live && active.race.outcome.status === 'RUNNING',
        recover: () => {
          active.race.recoverPlayer();
          lifecycle.reset();
        },
        // A tuned driving definition has no delivered identity, so the rebuilt Session has no envelope,
        // time budgets, rivals or time limit. It starts from the grid at once, unpaused; a new run restores the
        // product Session and the delivered definition.
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
          start();
          state.restart();
        },
      })
    : null;
  // Every Session shares the compiled course's ground, so its maximum is derived once.
  performanceHud?.setCourse({
    maxActiveStrips: Math.max(...course.sections.map((section) => section.color.metrics.maxActiveStrips)),
  });
  let afterEndingSeconds = 0;
  const tick = () => {
    const started = performance.now();
    const { race } = active;
    const step = race.advance(shell.inputManager.sample());
    lifecycle.update(step.recovered);
    performanceHud?.step(performance.now() - started);
    if (race.outcome.status === 'GOAL' || race.outcome.status === 'GAME_OVER') {
      if (afterEndingSeconds + SIM_DT / 2 >= page.resultDelaySeconds()) state.finish();
      else afterEndingSeconds += SIM_DT;
    }
  };
  // The scene is drawn first; presenting follows the run screen's text.
  // The Session's course and mode, which the HUD shows during READY, and the player vehicle's tachometer scale from
  // its definitions; a DEV rebuild's tuned definition gives its own.
  const hudSession = ({ entries }: { readonly entries: readonly { readonly vehicle: SessionVehicle }[] }) => {
    const { vehicleDefinition, drivingDefinition } = entries[0]!.vehicle;
    const { redlineRpm } = vehicleDefinition.compiledVehicle.powertrain;
    return {
      courseName: course.name,
      mode: settings.mode,
      redlineRpm,
      fuelCutRpm: fuelCutRpm(redlineRpm, drivingDefinition.compiledDriving.powertrain.fuelCutRedlineMargin),
    };
  };
  const draw = () => {
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
    return {
      writeHud: (text: TextLayer, menu: boolean) =>
        writeHud(
          {
            race,
            player: observations.player,
            input: shell.inputManager.lastSample,
            session: hudSession(active.session),
          },
          text,
          menu,
        ),
      present() {
        const { player } = observations;
        shell.updateAudio(player, observations.rivals);
        // The DEV vehicle HUD diagnoses mechanics internals through the race's DEV-only diagnostics.
        shell.present(
          devControls
            ? (ctx) => {
                const { vehicle, model } = race.playerDiagnostics;
                drawVehicleDebugHud(
                  ctx,
                  page.courses,
                  courseId,
                  shell.inputManager.lastSample,
                  vehicle,
                  model,
                  devControls.driving,
                  devControls.definition,
                  tuned,
                );
                if (player.form === 'bike')
                  drawVehicleLeanDebug(ctx, result.playerScreenX, result.playerScreenY, player);
                drawVehicleYawDebug(ctx, result.playerScreenX, result.playerScreenY, vehicle, lifecycle.camera.yaw);
              }
            : undefined,
        );
        performanceHud?.frame(started, result.stripGround, renderMilliseconds);
      },
    };
  };
  // A run starts at once: driving input and the camera are reset and the race enters READY.
  const start = () => {
    shell.inputManager.reset();
    lifecycle.reset();
    active.race.start();
  };
  start();
  return {
    tick,
    draw,
    result: () => runResult(active.race),
    dispose() {
      devControls?.dispose();
    },
  };
}
