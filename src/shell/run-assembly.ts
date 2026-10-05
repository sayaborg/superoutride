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
import type { CompetitorObservation } from '../race/competitor-observation.js';
import { runResult } from './run-result.js';
import { writeHud, type HudFacts } from './run-hud.js';
import { fuelCutRpm } from '../vehicle/physics/automatic-powertrain.js';
import type { TextLayer } from '../view/text-layer.js';
import type { createCoursePerformanceHud } from './course-performance-hud.js';
import { prepareSession } from '../race/session-preparation.js';
import { formPool } from '../race/free-play-field.js';
import { NO_TRAFFIC, type FreePlayRules } from '../content/free-play-rules.js';
import { loadSeriesCourse, type loadSeriesCatalog } from '../content/series-catalog.js';
import { createSessionVehicle, type SessionVehicle } from '../content/session-vehicle.js';
import type { RunRequest } from './run-request.js';
import { createCourseScene } from '../view/course-scene.js';
import { createRenderMeasurements } from '../view/renderer.js';
import type { RunFrame, RunScreenState } from './run-screen.js';
import { drawVehicleDebugHud } from './vehicle-debug-hud.js';
import { drawVehicleLeanDebug } from './debug/vehicle-lean-debug.js';
import { drawVehicleYawDebug } from './debug/vehicle-yaw-debug.js';
import type { loadSurfaceMaterials } from '../content/surface-material-catalog.js';
import { compileSessionConfiguration, type SessionConfiguration } from '../race/session-configuration.js';
import type { DisplaySettings } from '../view/display-settings.js';
import type { createRaceSprites } from '../view/race-sprites.js';
import type { PlayerRecord } from './player-record.js';
import { comparedRecord, judgeRun, type RecordJudgement, type RecordSelection } from './run-records.js';
import type { MusicCatalog } from '../content/recording-catalog.js';
import { createRunMusic } from './run-music.js';
import { createRunEffects } from './run-effects.js';

/** The one run the page drives: its fixed step, its frame, its result and its disposal. */
export interface Run extends RunFrame {
  dispose(): void;
}
/** The page-lifetime objects a run is assembled from and drives; the composition root supplies them. */
export interface RunPage {
  readonly content: ContentDelivery;
  readonly materials: Awaited<ReturnType<typeof loadSurfaceMaterials>>;
  readonly series: Awaited<ReturnType<typeof loadSeriesCatalog>>;
  readonly freePlay: FreePlayRules;
  /** The delivered tracks; a run plays its request's. */
  readonly music: MusicCatalog;
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
  /** The player record, which a run reaching GOAL updates. */
  readonly player: PlayerRecord;
  /** The camera definition in use. */
  cameraDefinition(): CameraDefinition;
  /** The DEV RESULT delay in use. */
  resultDelaySeconds(): number;
  /** A new Session seed; only the composition root draws randomness. */
  drawSeed(): number;
}

/**
 * Assemble a run for `request`, started at once: the run lifetime of the course, its Session settings, field, products
 * and scene, the player's sprites and camera, and the run's DEV controls. `state` is its run screen's state, which the
 * run's DEV controls and race end change.
 */
export async function assembleRun(page: RunPage, request: RunRequest, state: RunScreenState): Promise<Run> {
  const { content, materials, series, vehicles, driving, displaySettings, raceSprites, shell, performanceHud } = page;
  const { courseId } = request;
  const course = await loadDeliveredCourse(content, courseId, materials);
  // The course's ARCADE settings come from the one series holding it; a course in no series is untimed.
  const arcade = loadSeriesCourse(content, series, course);
  // The one path from a request to a Session: its admission and the products it needs, loaded once.
  const prepared = await prepareSession(
    content,
    { vehicles, driving, materials, freePlay: page.freePlay },
    course,
    arcade,
    request,
  );
  const settings = prepared.configuration;
  const { vehicle, vehicleSha256 } = prepared;
  const vehicleId = settings.vehicleId;
  const entry = vehicle.vehicleDefinition;
  /**
   * The one assembly of a Session, its scene (with a new Route runtime) and its race. The run's start and every
   * DEV tuning rebuild pass through it; the page's devices persist.
   */
  const build = (tuned: { readonly vehicle: SessionVehicle; readonly configuration: SessionConfiguration } | null) => {
    // The composition root alone draws randomness: every assembly, a DEV rebuild included, takes a new seed from it.
    const session = prepared.resolve(page.drawSeed(), tuned);
    const scene = createCourseScene(course.entry, course.gates, vehicles, displaySettings);
    const race = createCourseRace({ session, runtime: scene.runtime });
    // The Session's records: the HUD's record, resolved once the TIME TRIAL route is decided, and the judgement made
    // when the product Session reaches GOAL. A DEV-tuned Session compares with and records nothing.
    const records = {
      hud: undefined as HudFacts['record'] | undefined,
      judgement: null as RecordJudgement | null,
      recorded: false,
    };
    return { session, scene, race, tuned: tuned !== null, records };
  };
  let active = build(null);
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
          active = build({
            vehicle: createSessionVehicle(entry, driving),
            configuration: compileSessionConfiguration(
              {
                mode: 'FREE_PLAY',
                vehicleId: settings.vehicleId,
                color: settings.color,
                lapCount: active.session.configuration.lapCount,
                rivalCount: 0,
                rivalPool: formPool(page.freePlay, entry).id,
                traffic: NO_TRAFFIC,
              },
              course,
              arcade,
              { vehicles, freePlay: page.freePlay },
            ),
          });
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
  // The run's track, which the request names among the delivered tracks.
  const track = page.music.find((t) => t.id === request.track);
  if (!track) throw new RangeError(`Unknown track ${request.track}`);
  const music = createRunMusic(shell, track);
  const effects = createRunEffects((effect) => shell.playRecording(`effects/${effect}`, 'effects'));
  // What the run records against, and the records before it, which the HUD compares with.
  const selection: RecordSelection = {
    rules: settings.mode === 'ARCADE' ? { mode: settings.mode, seriesId: arcade!.series.id } : { mode: settings.mode },
    courseId,
    vehicleId,
    lapCount: settings.lapCount,
    courseSha256: course.identity.buildSha256,
    vehicleSha256,
    goals: course.gates.intervals.flatMap((interval) => (interval.finish ? [interval.finish.id] : [])),
  };
  const recordsBefore = page.player.records;
  // The active Session's HUD record.
  const runRecord = (): HudFacts['record'] => {
    if (active.tuned) return null;
    const { records } = active;
    if (records.hud === undefined) records.hud = comparedRecord(recordsBefore, selection, active.race.routeLinks);
    return records.hud ?? null;
  };
  // The product Session's judgement against the records, made once when it reaches GOAL.
  const record = () => {
    const { race, records } = active;
    records.recorded = true;
    const { player, routeLinks } = race;
    records.judgement = judgeRun(page.player.records, {
      ...selection,
      routeLinks,
      goal: player.finishGateId!,
      finishSeconds: race.outcome.endSeconds!,
      crossingSeconds: player.crossingSeconds,
      bestLapSeconds: player.bestLapSeconds,
    });
    if (records.judgement?.records) page.player.updateRecords(records.judgement.records);
  };
  // DEV only: the frame's render measurements and the performance HUD's timings; the product path takes neither.
  const measurements = page.dev ? createRenderMeasurements() : null;
  const tick = () => {
    const started = performanceHud ? performance.now() : 0;
    const { race } = active;
    const step = race.advance(shell.inputManager.sample());
    effects.step(race, race);
    lifecycle.update(step.recovered);
    performanceHud?.step(performance.now() - started);
    if (race.outcome.status === 'GOAL' || race.outcome.status === 'GAME_OVER') {
      if (race.outcome.status === 'GOAL' && !active.records.recorded && !active.tuned) record();
      if (afterEndingSeconds + SIM_DT / 2 >= page.resultDelaySeconds()) state.finish();
      else afterEndingSeconds += SIM_DT;
    }
  };
  // The scene is drawn first; presenting follows the run screen's text.
  // The Session's course and mode, which the HUD shows during READY, and the player vehicle's tachometer scale from
  // its definitions; a DEV rebuild's Session gives its own mode and tuned definition.
  const hudSession = ({
    configuration,
    entries,
  }: {
    readonly configuration: SessionConfiguration;
    readonly entries: readonly { readonly vehicle: SessionVehicle }[];
  }) => {
    const { vehicleDefinition, drivingDefinition } = entries[0]!.vehicle;
    const { redlineRpm } = vehicleDefinition.compiledVehicle.powertrain;
    return {
      courseName: course.name,
      mode: configuration.mode,
      redlineRpm,
      fuelCutRpm: fuelCutRpm(redlineRpm, drivingDefinition.compiledDriving.powertrain.fuelCutRedlineMargin),
    };
  };
  // Rivals and traffic are drawn and voiced by the same rules: one reused list of their observations per frame.
  const otherVehicles: CompetitorObservation[] = [];
  const draw = () => {
    const { scene, race, tuned } = active;
    const started = performanceHud ? performance.now() : 0,
      observations = race.observe();
    otherVehicles.length = 0;
    otherVehicles.push(...observations.rivals, ...observations.traffic);
    const others = raceSprites(otherVehicles, lifecycle.camera);
    // The renderer reads no clock; with DEV its caller times the scene render for the performance HUD.
    const renderStarted = performanceHud ? performance.now() : 0;
    scene.render(
      shell.framebuffer,
      observations.player,
      lifecycle.camera,
      observations.player.brakeLampOn ? sprites.on : sprites.off,
      others,
      observations.knocked,
      measurements,
    );
    const renderMilliseconds = performanceHud ? performance.now() - renderStarted : 0;
    return {
      writeHud: (text: TextLayer, menu: boolean) =>
        writeHud(
          {
            race,
            player: observations.player,
            input: shell.inputManager.lastSample,
            session: hudSession(active.session),
            record: runRecord(),
          },
          text,
          menu,
        ),
      present() {
        const { player } = observations;
        shell.updateAudio(player, otherVehicles, race.playerContacts.rubs);
        music.update(race, race.outcome.status, state.live);
        // The DEV vehicle HUD diagnoses mechanics internals through the race's DEV-only diagnostics.
        shell.present(
          devControls && measurements
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
                  drawVehicleLeanDebug(ctx, measurements.playerScreenX, measurements.playerScreenY, player);
                drawVehicleYawDebug(
                  ctx,
                  measurements.playerScreenX,
                  measurements.playerScreenY,
                  vehicle,
                  lifecycle.camera.yaw,
                );
              }
            : undefined,
        );
        if (performanceHud && measurements)
          performanceHud.frame(started, measurements.stripGround, renderMilliseconds, measurements.wallPixels);
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
    result: () => runResult(active.race, active.records.judgement),
    dispose() {
      music.stop();
      effects.stop();
      devControls?.dispose();
    },
  };
}
