import type { ContentDelivery } from '../content/content-delivery.js';
import type { CameraDefinition } from '../view/camera.js';
import { SIM_DT } from '../race/fixed-step.js';
import { createVehicleSprites } from '../view/vehicle-sprites.js';
import type { createBrowserDrivingShell } from './driving-shell.js';
import { mountRunDevControls } from './run-controls.js';
import { createDrivingLifecycle } from './driving-lifecycle.js';
import { createCameraRig } from '../view/camera.js';
import { loadDeliveredCourse } from '../content/load-delivered-course.js';
import type { loadVehicleDefinitions } from '../content/vehicle-catalog.js';
import { createCourseRace } from '../race/course-race.js';
import type { CompetitorObservation } from '../race/competitor-observation.js';
import { runResult } from './run-result.js';
import { writeHud, type HudFacts } from './run-hud.js';
import type { TextLayer } from '../view/text-layer.js';
import type { createCoursePerformanceHud } from './course-performance-hud.js';
import { prepareSession } from '../race/session-preparation.js';
import { formPool } from '../race/free-play-field.js';
import { NO_TRAFFIC, type FreePlayRules } from '../content/free-play-rules.js';
import { loadSeriesClass, type loadSeriesCatalog, type SeriesClass } from '../content/series-catalog.js';
import { createSessionVehicle, type SessionVehicle } from '../content/session-vehicle.js';
import { isFreePlay, RULES_NAMES, sessionRequest, type RunRequest } from './run-request.js';
import type { CompiledCourse } from '../course/compiler/compiled-course.js';
import { createCourseScene } from '../view/course-scene.js';
import { createRenderMeasurements } from '../view/renderer.js';
import type { RunFrame, RunScreenState } from './run-screen.js';
import { drawVehicleLeanDebug } from './debug/vehicle-lean-debug.js';
import type { loadSurfaceMaterials } from '../content/surface-material-catalog.js';
import { compileSessionConfiguration, type SessionConfiguration } from '../race/session-configuration.js';
import type { DisplaySettings } from '../view/display-settings.js';
import type { createRaceSprites } from '../view/race-sprites.js';
import type { PlayerRecord } from './player-record.js';
import { createRunRecords, type RecordSelection } from './run-records.js';
import type { MusicCatalog } from '../content/recording-catalog.js';
import { createRunMusic } from './run-music.js';
import { createRunEffects } from './run-effects.js';
import type { WorkSlices } from '../core/work-slices.js';

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
  /** `dev=1`: the run builds its DEV controls and draws the bike lean indicator. */
  readonly dev: boolean;
  /** The player record, which a TIME ATTACK run's records update. */
  readonly player: PlayerRecord;
  /** Each catalog vehicle's identity (`sessionVehicleSha256`), which records are kept against. */
  readonly vehicleSha256: ReadonlyMap<string, string>;
  /** The camera definition in use. */
  cameraDefinition(): CameraDefinition;
  /** The DEV RESULT delay in use. */
  resultDelaySeconds(): number;
  /** A new Session seed; only the composition root draws randomness. */
  drawSeed(): number;
  /** New slices for a run's loading work, which yield to the page's frame loop between them. */
  workSlices(): WorkSlices;
}

/** What a run's assembly reports while it loads: the PRE-RACE card's progress and facts. */
export interface RunAssemblyReport {
  /** The share of the run's loading done, 0 to 1. */
  progress(fraction: number): void;
  /** The course and Session are known: the course, the player's start slot and field, and READY's record. */
  prepared(facts: {
    readonly course: CompiledCourse;
    readonly field: number;
    readonly bikes: boolean;
    readonly slot: number;
    /** READY's record in milliseconds; null when none yet, undefined when the run keeps none (all but TIME ATTACK). */
    readonly best: number | null | undefined;
  }): void;
}

/**
 * The attract demo's compiled courses: a demo run holds its course's compilation while it lives, so the classes of one
 * course compile it once, and a course no held run uses is released. A course that failed to load is loaded again by
 * the next run that asks for it.
 */
export function createDemoCourses() {
  const courses = new Map<string, { readonly compiling: Promise<CompiledCourse>; holders: number }>();
  return Object.freeze({
    /** Hold the course `id`, compiled by `load` unless a held run's compilation is shared; release it once. */
    hold(id: string, load: () => Promise<CompiledCourse>) {
      let entry = courses.get(id);
      if (!entry) {
        const created = { compiling: load(), holders: 0 };
        courses.set(id, created);
        created.compiling.catch(() => {
          if (courses.get(id) === created) courses.delete(id);
        });
        entry = created;
      }
      entry.holders++;
      let released = false;
      const held = entry;
      return Object.freeze({
        compiling: held.compiling,
        release() {
          if (released) return;
          released = true;
          if (--held.holders === 0 && courses.get(id) === held) courses.delete(id);
        },
      });
    },
  });
}
/**
 * The attract demo's courses, when a run is the demo's: no player input reaches it (the player's Session driver drives)
 * and it sounds and records nothing.
 */
export type DemoCourses = ReturnType<typeof createDemoCourses>;

/** Shares of a run's loading: its course's files, then the course compiled, then its Session prepared. */
const LOADING_SHARES = Object.freeze({ files: 0.7, compiled: 0.8, prepared: 0.9 });

/**
 * Assemble a run for `request`, started at once: the run lifetime of the course, its Session settings, field, products
 * and scene, the player's sprites and camera, and the run's DEV controls. `state` is its run screen's state, which the
 * run's DEV controls and race end change.
 */
export async function assembleRun(
  page: RunPage,
  request: RunRequest,
  state: RunScreenState,
  report?: RunAssemblyReport,
  demo?: DemoCourses,
): Promise<Run> {
  const { content, materials, series } = page;
  // A class run drives its class on the class's course; FREE PLAY drives the course it names.
  let named: SeriesClass | null = null,
    courseId: string;
  if (!isFreePlay(request)) {
    named = series.seriesClass(request.seriesId, request.classId);
    if (!named) throw new RangeError(`Unknown class ${request.classId} of series ${request.seriesId}`);
    courseId = named.course;
  } else courseId = request.courseId;
  const load = () =>
    loadDeliveredCourse(
      content,
      courseId,
      materials,
      (files, total) => report?.progress((LOADING_SHARES.files * files) / total),
      {
        slices: page.workSlices(),
        compiled: (fraction) =>
          report?.progress(LOADING_SHARES.files + (LOADING_SHARES.compiled - LOADING_SHARES.files) * fraction),
      },
    );
  // A demo run holds its course while it lives.
  const held = demo?.hold(courseId, load) ?? null;
  try {
    const run = await assembleCourseRun(
      page,
      request,
      state,
      report,
      held?.compiling ?? load(),
      named,
      demo !== undefined,
    );
    if (!held) return run;
    return Object.freeze({
      ...run,
      dispose() {
        run.dispose();
        held.release();
      },
    });
  } catch (error) {
    held?.release();
    throw error;
  }
}

/** The rest of `assembleRun` once its course is compiling: the run on that course. */
async function assembleCourseRun(
  page: RunPage,
  request: RunRequest,
  state: RunScreenState,
  report: RunAssemblyReport | undefined,
  compiling: Promise<CompiledCourse>,
  named: SeriesClass | null,
  demo: boolean,
): Promise<Run> {
  const { content, materials, vehicles, driving, displaySettings, raceSprites, shell, performanceHud } = page;
  const course = await compiling;
  report?.progress(LOADING_SHARES.compiled);
  const arcade = named && loadSeriesClass(content, named, course, vehicles);
  // The one path from a request to a Session: its admission and the products it needs, loaded once.
  const prepared = await prepareSession(
    content,
    { vehicles, driving, materials, freePlay: page.freePlay },
    course,
    arcade,
    sessionRequest(request),
  );
  const settings = prepared.configuration;
  const { vehicle } = prepared;
  const entry = vehicle.vehicleDefinition;
  // What a TIME ATTACK run records against: its class on its course; other runs record nothing.
  const selection: RecordSelection | null =
    settings.mode === 'TIME_ATTACK' && !demo
      ? {
          seriesId: arcade!.series.id,
          classId: arcade!.id,
          courseSha256: course.identity.buildSha256,
          vehicleSha256: page.vehicleSha256,
          goals: course.gates.intervals.flatMap((interval) => (interval.finish ? [interval.finish.id] : [])),
          vehicleId: settings.vehicleId,
          circuit: course.type === 'CIRCUIT',
        }
      : null;
  /**
   * The one assembly of a Session, its scene (with a new Route runtime) and its race. The run's start and every
   * DEV tuning rebuild pass through it; the page's devices persist.
   */
  const build = (tuned: { readonly vehicle: SessionVehicle; readonly configuration: SessionConfiguration } | null) => {
    // The composition root alone draws randomness: every assembly, a DEV rebuild included, takes a new seed from it.
    const session = prepared.resolve(page.drawSeed(), tuned);
    const scene = createCourseScene(course.entry, course.gates, vehicles, displaySettings);
    // The player drives by its own steering rule for the vehicle's form, read once as the camera's is.
    const race = createCourseRace({
      session,
      runtime: scene.runtime,
      playerSteering: page.player.settings.steering[entry.listing.form],
    });
    // The Session's records; a DEV-tuned Session compares with and records nothing.
    const records = selection && !tuned ? createRunRecords(page.player, selection) : null;
    return { session, scene, race, records };
  };
  let active = build(null);
  report?.progress(LOADING_SHARES.prepared);
  // The player's color is resolved with the Session; a DEV rebuild keeps it.
  const sprites = createVehicleSprites(entry, active.session.entries[0]!.color);
  const lifecycle = createDrivingLifecycle(createCameraRig(), {
    world: () => active.scene.world,
    cameraDefinition: page.cameraDefinition,
    observation: () => active.race.observe().player,
    yawSource: page.player.settings.cameras[entry.listing.form],
  });
  // The run's DEV controls, only with DEV and never in the attract demo.
  const devControls =
    page.dev && !demo
      ? mountRunDevControls(vehicle, {
          canRecover: () => state.live && active.race.outcome.status === 'RUNNING',
          recover: () => {
            active.race.recoverPlayer();
            lifecycle.reset();
          },
          // A tuned driving definition has no delivered identity, so the rebuilt Session has no
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
                  // A run without a finish is rebuilt with the course's most laps.
                  lapCount: active.session.configuration.lapCount ?? course.rules.maxLaps,
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
  // The run's track, which the request names among the delivered tracks; MUSIC OFF has none.
  const track = request.track === null ? null : page.music.find((t) => t.id === request.track);
  if (track === undefined) throw new RangeError(`Unknown track ${request.track}`);
  const music = createRunMusic(shell, track);
  const effects = createRunEffects((effect) => shell.playRecording(`effects/${effect}`, 'effects'));
  // The goal a run's Route reaches once the race has decided it (`race.routeLinks`): the last FINISH along it.
  const finishes = new Map(
    course.gates.intervals.flatMap((interval) => (interval.finish ? [[interval.section, interval.finish.id]] : [])),
  );
  const routeGoal = (links: readonly string[] | null) => {
    if (links === null) return null;
    const sections = [course.entry, ...links.map((id) => course.links.find((link) => link.id === id)!.to.section)];
    return sections.reduce<string | null>((goal, section) => finishes.get(section) ?? goal, null);
  };
  // The record READY shows, with the name of the vehicle it was set with.
  const readyRecord = (): HudFacts['record'] => {
    const shown = active.records?.shown;
    if (!shown) return null;
    const listing = vehicles.find((v) => v.compiledVehicle.id === shown.vehicleId)?.listing;
    return { timeMs: shown.timeMs, vehicle: listing ? listing.metadata.model.toUpperCase() : shown.vehicleId };
  };
  // The PRE-RACE card's facts: the field, the player's slot on its grid and the record READY shows.
  if (report) {
    const { entries } = active.session;
    const slot = entries[0]!.slot!;
    const grid = course.gates.bikeGrid?.includes(slot) ? course.gates.bikeGrid : course.gates.grid;
    report.prepared({
      course,
      field: entries.length,
      bikes: entries.every((e) => e.vehicle.vehicleDefinition.listing.form === 'bike'),
      slot: grid.indexOf(slot) + 1,
      best: active.records ? (active.records.shown?.timeMs ?? null) : undefined,
    });
  }
  // DEV only: the frame's render measurements and the performance HUD's timings; the product path takes neither.
  const measurements = page.dev ? createRenderMeasurements() : null;
  const tick = () => {
    const started = performanceHud ? performance.now() : 0;
    const { race } = active;
    // The attract demo takes no input: the player's Session driver drives, and nothing sounds or is recorded.
    const step = race.advance(demo ? null : shell.inputManager.sample());
    lifecycle.update(step.recovered);
    // The background's transitions run in the screen's fixed steps, from the camera's station.
    active.scene.advance(lifecycle.camera);
    // A lap that set a record sounds NEW RECORD as it completes.
    if (active.records?.step(race.events, race.player.id, routeGoal(race.routeLinks))) effects.newRecord();
    if (!demo) {
      effects.step(race, race);
      // Each contact of the player's that began in the step sounds once, as it begins.
      for (const start of race.playerContacts.starts) shell.playImpact(start.counterpart, start.work);
      performanceHud?.step(performance.now() - started);
    }
    if (race.outcome.status === 'GOAL' || race.outcome.status === 'GAME_OVER') {
      if (afterEndingSeconds + SIM_DT / 2 >= page.resultDelaySeconds()) {
        state.finish();
        if (!demo) effects.result(active.records?.outcome().newRecord ?? false);
      } else afterEndingSeconds += SIM_DT;
    }
  };
  // The scene is drawn first; presenting follows the run screen's text.
  // The Session's course and the name of its rules, which the HUD shows during READY, and the player vehicle's
  // tachometer scale and steering picture from its definitions; a DEV rebuild's Session gives its own rules and tuned
  // definition.
  const hudSession = ({
    configuration,
    entries,
  }: {
    readonly configuration: SessionConfiguration;
    readonly entries: readonly { readonly vehicle: SessionVehicle }[];
  }) => {
    const { vehicleDefinition } = entries[0]!.vehicle;
    const { redlineRpm } = vehicleDefinition.compiledVehicle.powertrain;
    return {
      courseName: course.name,
      rules: RULES_NAMES[configuration.mode],
      redlineRpm,
      steeringPicture: vehicleDefinition.steeringPicture,
      brakeSign: page.player.settings.brakeSign,
    };
  };
  // Rivals and traffic are drawn and voiced by the same rules: one reused list of their observations per frame. Every
  // vehicle, the player included, casts its picture's shadow by one rule.
  const otherVehicles: CompetitorObservation[] = [];
  const draw = () => {
    const { scene, race } = active;
    const started = performanceHud ? performance.now() : 0,
      observations = race.observe();
    otherVehicles.length = 0;
    otherVehicles.push(...observations.rivals, ...observations.traffic);
    const others = raceSprites(otherVehicles, lifecycle.camera, scene.world);
    // The renderer reads no clock; with DEV its caller times the scene render for the performance HUD.
    const renderStarted = performanceHud ? performance.now() : 0;
    scene.render(
      shell.framebuffer,
      {
        vehicle: observations.player,
        set: observations.player.brakeLampOn ? sprites.on : sprites.off,
        reach: entry.compiledVehicle.reach,
      },
      lifecycle.camera,
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
            camera: lifecycle.camera,
            session: hudSession(active.session),
            record: readyRecord(),
            split: active.records?.split ?? null,
          },
          text,
          menu,
        ),
      present() {
        const { player } = observations;
        shell.updateAudio(player, otherVehicles, race.playerContacts.rubs);
        music.update(race, race.outcome.status, state.live);
        // With DEV, the bike lean indicator is drawn over the frame at the player's screen point.
        shell.present(
          measurements && player.form === 'bike'
            ? (ctx) => drawVehicleLeanDebug(ctx, measurements.playerScreenX, measurements.playerScreenY, player)
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
    result: () => runResult(active.race, active.records?.outcome() ?? null),
    end() {
      // The attract demo is never ended so; it takes no menu commands.
      if (demo || !active.race.endable) return false;
      active.race.end();
      return true;
    },
    dispose() {
      music.stop();
      effects.stop();
      devControls?.dispose();
    },
  };
}
