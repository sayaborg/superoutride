import { compilePlannedDriver, type PlannedDriver } from './planned-driver.js';
import { SIM_DT } from './fixed-step.js';
import { assertBodyContactStability } from '../vehicle/physics/body-contact.js';
import { createVehicleModel, VEHICLE_SUBSTEPS, type VehicleModel } from '../vehicle/physics/vehicle-model.js';
import { createVehicleLimits, type VehicleLimits } from '../vehicle/vehicle-limits.js';
import type { CourseTimeBudgets } from '../content/course-time-budgets.js';
import type { RacingLines } from '../content/racing-line.js';
import type { RunVehicle } from '../content/run-vehicle.js';
import type { CompiledCourse } from '../course/compiler/compiled-course.js';
import { courseStartGrid, type CompiledGridSlot } from '../course/compiler/course-rules.js';
import type {
  AheadAppearance,
  ClassRules,
  SeriesClass,
  SeriesEntry,
  StageInterval,
} from '../content/series-catalog.js';
import type { RunConfiguration } from './run-configuration.js';
import { drawRivalPairs, vehicleColors } from './free-play-field.js';
import type { CompiledVehicleDefinition } from '../vehicle/definition-document.js';
import { spriteSetColors } from '../vehicle/vehicle-sprite-set.js';
import { KILOMETERS_PER_HOUR_PER_METER_PER_SECOND } from '../vehicle/physics/vehicle-definitions.js';

const NO_RANK_LIMITS: Readonly<Record<string, number>> = Object.freeze({});

/** An entry's run vehicle. */
export interface EntryVehicle {
  readonly vehicle: RunVehicle;
}

/**
 * One competitor's resolved entry: its stable ID, grid slot or ahead appearance, color, stage interval and run
 * vehicle.
 */
export interface RunEntry extends EntryVehicle {
  readonly id: string;
  /** The grid slot of a competitor taking part from STAGE 1; null for one appearing ahead or a CHASE rival. */
  readonly slot: CompiledGridSlot | null;
  readonly ahead: AheadAppearance | null;
  /**
   * A CHASE rival's: the grid slot it passes the player in, the one after the player's (or, after the last, the one
   * before it); null for every other entry.
   */
  readonly beside: CompiledGridSlot | null;
  /** A color of the vehicle's sprite set. */
  readonly color: string;
  /** The stages the competitor takes part in; null for the whole run. */
  readonly stages: StageInterval | null;
}

/** A traffic vehicle candidate: its run vehicle, its sprite colors and its driver, compiled once. */
export interface TrafficCandidate extends EntryVehicle {
  readonly colors: readonly string[];
  /** Its integer share of the draw. */
  readonly weight: number;
  readonly driver: PlannedDriver;
}

/**
 * A run vehicle's mechanics model at the race's fixed step, the limits its drivers plan with, and its speed cap: the
 * steady speed on a level straight of the planning reference (unit grip, no rolling resistance).
 */
export interface RunMechanics {
  readonly model: VehicleModel;
  readonly limits: VehicleLimits;
  readonly speedCap: number;
}

/** A run vehicle's mechanics, as every run and its drivers build them. */
export function createRunMechanics(runVehicle: RunVehicle): RunMechanics {
  const model = createVehicleModel(runVehicle, SIM_DT);
  const limits = createVehicleLimits(model);
  return Object.freeze({ model, limits, speedCap: limits.speedCap(0) });
}

/** The run's resolved traffic: metres between traffic positions and the candidates drawn for them. */
export interface ResolvedTraffic {
  readonly spacing: number;
  readonly path: 'lane' | 'line';
  readonly candidates: readonly TrafficCandidate[];
}

/**
 * What a run of `configuration` needs besides the player's own vehicle: every other vehicle that may drive in it, its
 * class's entries in RACE and its traffic candidates, each with its run vehicle (`vehicleIds`, unique, in first-use
 * order), and the time budgets of its clock.
 */
export function runDemand(configuration: RunConfiguration, runClass: ClassRules) {
  const ids = [
    ...(configuration.mode === 'RACE' ? runClass.entries.map((entry) => entry.vehicle) : []),
    ...(configuration.traffic?.vehicles ?? []),
  ];
  return Object.freeze({
    vehicleIds: Object.freeze([...new Set(ids)]),
    budgets: configuration.timeLimit,
  });
}

/**
 * The class with the player alone, in `vehicleId`: its own grid entry in the first slot, without traffic, clock, rank
 * limits or a start of its own. TIME ATTACK runs it, and so does DEV's rebuilt run.
 */
export function aloneClass<C extends ClassRules>(runClass: C, vehicleId: string): C {
  const own = ownEntry(runClass, vehicleId)!;
  return Object.freeze({
    ...runClass,
    entries: Object.freeze([Object.freeze({ ...own, slot: 0, stages: null, ahead: null })]),
    playerSlot: 'first',
    chase: null,
    rankLimits: Object.freeze({}),
    traffic: null,
    timeMargin: null,
  });
}

const rivalId = (index: number) => `RIVAL_${String(index + 1).padStart(2, '0')}`;

// The grid a field starts from: the course's bike grid when every competitor rides a bike (`courseStartGrid`).
const fieldGrid = (course: CompiledCourse, field: readonly EntryVehicle[]) =>
  courseStartGrid(
    course.gates,
    field.every((entry) => entry.vehicle.vehicleDefinition.listing.form === 'bike'),
  );

// The RACE class entry the player takes: the rearmost grid entry of its vehicle.
// An entry without a vehicle is the player's own vehicle (a class of any vehicle).
const ownEntry = <E extends SeriesEntry>(runClass: { readonly entries: readonly E[] }, vehicleId: string | null) =>
  runClass.entries.filter((entry) => entry.slot !== null && (entry.vehicle ?? vehicleId) === vehicleId).at(-1);

/**
 * The player's color in a run: in a class whose colors are fixed (RACE and TIME ATTACK alike), its own entry's;
 * else the chosen color, else the vehicle's default color. Selection screens show the same color.
 */
export function runPlayerColor(
  runClass: Pick<SeriesClass, 'entries' | 'fixedColors'> | null,
  vehicle: CompiledVehicleDefinition,
  chosen: string | null,
): string {
  const own = runClass?.fixedColors ? ownEntry(runClass, vehicle.compiledVehicle.id) : undefined;
  return own?.color ?? chosen ?? vehicle.listing.visuals.palette;
}

/**
 * Resolve one admitted run configuration (`compileRunConfiguration`) with its `seed` before actors/ticks
 * exist. Graph and catalog objects remain shared references. `runClass` is the run's admitted class on its course.
 * The resolved entries list the player first, then each rival. RACE takes the class's entries (`classEntries`): the
 * player the rearmost entry of its vehicle, standing in that entry's slot (`own`), the rearmost of their slots (`last`)
 * or the frontmost (`first`), and every other entry its own vehicle (from `field.vehicleOf`) and color; TIME ATTACK
 * stands the player alone in the grid's first slot (`aloneClass`), without traffic. The grid is the
 * slots the field's vehicles start from (`courseStartGrid`), whose last is the sixteenth or a shorter grid's last. Traffic
 * candidates come from `field.vehicleOf` with their drivers, compiled once. The player's color is
 * `runPlayerColor`'s.
 */
export function resolveRunSetup(
  course: CompiledCourse,
  runClass: ClassRules,
  configuration: RunConfiguration,
  seed: number,
  vehicle: RunVehicle,
  budgets: CourseTimeBudgets | null = null,
  field: {
    /** Every other entry's run vehicle; a run with rivals requires it. */
    readonly vehicleOf?: (vehicleId: string) => EntryVehicle;
    /** The course's racing lines; without them drivers' racing line is the centre lane. */
    readonly racingLines?: RacingLines | null;
  } = {},
) {
  // The run's body contact: its driving definition's spring-damper, the one every contact in the run reads,
  // admitted stable at the race's fixed step.
  const { bodyContact } = vehicle.drivingDefinition.compiledDriving;
  assertBodyContactStability(bodyContact, SIM_DT, VEHICLE_SUBSTEPS);
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff)
    throw new RangeError('Run seed must be a 32-bit unsigned integer');
  if (vehicle.vehicleDefinition.compiledVehicle.id !== configuration.vehicleId)
    throw new Error("The run vehicle is not the configuration's vehicle");
  const playerColor = runPlayerColor(runClass, vehicle.vehicleDefinition, configuration.color);
  if (configuration.timeLimit && !budgets)
    throw new RangeError('A time limit requires current, complete reference runs');
  if (configuration.rivalCount > 0 && !field.vehicleOf)
    throw new RangeError('A run with rivals requires their run vehicles');
  if (configuration.traffic && !field.vehicleOf) throw new RangeError('A run with traffic requires its run vehicles');
  // Each run vehicle's model and limits, built once; entries and traffic sharing a vehicle share them.
  const mechanics = new Map<RunVehicle, RunMechanics>();
  const mechanicsOf = (runVehicle: RunVehicle) => {
    let resolved = mechanics.get(runVehicle);
    if (!resolved) mechanics.set(runVehicle, (resolved = createRunMechanics(runVehicle)));
    return resolved;
  };
  // The roles' utilizations (K, 2026-11-12), the run vehicle's driving definition's: the standard driver, which drives
  // the player's vehicle on request and after GOAL, and traffic.
  const { roles } = vehicle.drivingDefinition.compiledDriving;
  // Each vehicle's standard driver, compiled once at the standard utilization and its speed cap.
  const drivers = new Map<RunVehicle, PlannedDriver>();
  const driverOf = (runVehicle: RunVehicle) => {
    let driver = drivers.get(runVehicle);
    if (!driver) {
      const { model, limits, speedCap } = mechanicsOf(runVehicle);
      drivers.set(
        runVehicle,
        (driver = compilePlannedDriver(model, limits, roles.standard.utilization, speedCap, true)),
      );
    }
    return driver;
  };
  // TIME ATTACK starts the player alone; with no rivals, it reads no other run vehicle.
  const started = configuration.mode === 'RACE' ? runClass : aloneClass(runClass, configuration.vehicleId);
  const entries = classEntries(course, started, seed, { vehicle }, playerColor, field.vehicleOf!);
  // Traffic drives each candidate vehicle's driver at the traffic utilization, capped at the one traffic speed,
  // converted from km/h here once (a vehicle slower than it keeps its own maximum speed); each driver is compiled
  // once here.
  const trafficSpeed = configuration.traffic
    ? configuration.traffic.speedKilometersPerHour / KILOMETERS_PER_HOUR_PER_METER_PER_SECOND
    : 0;
  const traffic: ResolvedTraffic | null = configuration.traffic
    ? Object.freeze({
        spacing: 1000 / configuration.traffic.density,
        path: configuration.traffic.path,
        candidates: Object.freeze(
          configuration.traffic.vehicles.map((id, index) => {
            const candidate = field.vehicleOf!(id);
            const { model, limits, speedCap } = mechanicsOf(candidate.vehicle);
            return Object.freeze({
              ...candidate,
              colors: spriteSetColors(candidate.vehicle.vehicleDefinition.spriteSet),
              weight: configuration.traffic!.weights[index]!,
              // Traffic never changes lanes to pass; it follows a slower vehicle in its lane and merges where its lane ends.
              driver: compilePlannedDriver(
                model,
                limits,
                roles.traffic.utilization,
                Math.min(trafficSpeed, speedCap),
                false,
              ),
            });
          }),
        ),
      })
    : null;
  return Object.freeze({
    course,
    configuration,
    /** The run's 32-bit unsigned random seed; traffic derives from it. */
    seed,
    entries,
    traffic,
    /** A run vehicle's model, limits and speed cap. */
    mechanicsOf,
    /** The course's racing lines, which rivals and the player's run driver drive; null without them. */
    racingLines: field.racingLines ?? null,
    /** The standard driver of a run vehicle, at the standard utilization and its speed cap. */
    driverOf,
    budgets: configuration.timeLimit ? budgets : null,
    /** Rank limit N by gate ID; RACE only. */
    rankLimits: configuration.mode === 'RACE' ? runClass.rankLimits : NO_RANK_LIMITS,
    bodyContact,
  });
}

export type RunSetup = ReturnType<typeof resolveRunSetup>;

/**
 * Where a class's RACE starts its field, by its course grid's slot indices, the player in `playerVehicleId`: the
 * player's slot, and each other entry, in entry order, with its slot, null for one appearing ahead. The player takes
 * the rearmost grid entry of its vehicle; `own` keeps every grid entry's slot, `last` gives the player the rearmost of
 * the grid entries' slots and the other grid entries, in order, the slots in front of it, and `first` the frontmost,
 * and them the slots behind it.
 */
export function classGridSlots<E extends SeriesEntry>(
  runClass: { readonly entries: readonly E[]; readonly playerSlot: SeriesClass['playerSlot'] },
  playerVehicleId: string | null,
) {
  const own = ownEntry(runClass, playerVehicleId)!;
  const slots = runClass.entries.filter((entry) => entry.slot !== null).map((entry) => entry.slot!);
  const otherGridSlots =
    runClass.playerSlot === 'own' ? null : runClass.playerSlot === 'last' ? slots.slice(0, -1) : slots.slice(1);
  let gridIndex = 0;
  return Object.freeze({
    player: runClass.playerSlot === 'own' ? own.slot! : runClass.playerSlot === 'last' ? slots.at(-1)! : slots[0]!,
    others: Object.freeze(
      runClass.entries
        .filter((entry) => entry !== own)
        .map((entry) =>
          Object.freeze({
            entry,
            slot: entry.slot === null ? null : otherGridSlots ? otherGridSlots[gridIndex++]! : entry.slot,
          }),
        ),
    ),
  });
}

/**
 * RACE: the class's entries, the player taking the rearmost entry of its vehicle (`classGridSlots`). Entries without a
 * color, the player's vehicle in a class of any vehicle, take colors the run's seed draws among that vehicle's, apart
 * from the player's while it has others (`drawRivalPairs`).
 */
function classEntries(
  course: CompiledCourse,
  runClass: ClassRules,
  seed: number,
  player: EntryVehicle,
  playerColor: string,
  vehicleOf: (vehicleId: string) => EntryVehicle,
): readonly RunEntry[] {
  const playerVehicle = player.vehicle.vehicleDefinition;
  const slots = classGridSlots(runClass, playerVehicle.compiledVehicle.id);
  const rivals = slots.others.map(({ entry }) => vehicleOf(entry.vehicle));
  const grid = fieldGrid(course, [player, ...rivals]);
  const drawn = drawRivalPairs(
    seed,
    slots.others.filter(({ entry }) => entry.color === null).length,
    vehicleColors(playerVehicle),
    { vehicle: playerVehicle.compiledVehicle.id, color: playerColor },
  );
  let draw = 0;
  return Object.freeze([
    Object.freeze({
      id: 'PLAYER',
      slot: grid[slots.player]!,
      ahead: null,
      beside: null,
      color: playerColor,
      stages: null,
      ...player,
    }),
    ...slots.others.map(({ entry, slot }, index) =>
      Object.freeze({
        id: rivalId(index),
        slot: slot === null ? null : grid[slot]!,
        ahead: entry.ahead,
        beside: slot === null && entry.ahead === null ? (grid[slots.player + 1] ?? grid[slots.player - 1]!) : null,
        color: entry.color ?? drawn[draw++]!.color,
        stages: entry.stages,
        ...rivals[index]!,
      }),
    ),
  ]);
}
