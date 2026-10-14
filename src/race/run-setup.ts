import { compilePlannedDriver, type PlannedDriver } from './planned-driver.js';
import { SIM_DT } from './fixed-step.js';
import { assertBodyContactStability } from '../vehicle/physics/body-contact.js';
import { createVehicleModel, VEHICLE_SUBSTEPS, type VehicleModel } from '../vehicle/physics/vehicle-model.js';
import { createVehicleLimits, type VehicleLimits } from '../vehicle/vehicle-limits.js';
import type { CourseTimeBudgets } from '../content/course-time-budgets.js';
import type { PaceSchedule } from '../content/pace-schedule.js';
import type { RacingLines } from '../content/racing-line.js';
import type { RunVehicle } from '../content/run-vehicle.js';
import type { CompiledCourse } from '../course/compiler/compiled-course.js';
import { courseStartGrid, type CompiledGridSlot } from '../course/compiler/course-rules.js';
import type { AheadAppearance, SeriesClass, StageInterval } from '../content/series-catalog.js';
import type { RunConfiguration } from './run-configuration.js';
import { drawRivalPairs, rivalPoolPairs, type VehicleColor } from './free-play-field.js';
import type { CompiledVehicleDefinition } from '../vehicle/definition-document.js';
import { spriteSetColors } from '../vehicle/vehicle-sprite-set.js';
import { KILOMETERS_PER_HOUR_PER_METER_PER_SECOND } from '../vehicle/physics/vehicle-definitions.js';

const NO_RANK_LIMITS: Readonly<Record<string, number>> = Object.freeze({});

/** An entry's run vehicle. */
export interface EntryVehicle {
  readonly vehicle: RunVehicle;
}

/**
 * One competitor's resolved entry: its stable ID, grid slot or ahead appearance, color, pace ratio, stage interval,
 * and run vehicle.
 */
export interface RunEntry extends EntryVehicle {
  readonly id: string;
  /** The grid slot of a competitor taking part from STAGE 1; null for one appearing ahead. */
  readonly slot: CompiledGridSlot | null;
  readonly ahead: AheadAppearance | null;
  /** A color of the vehicle's sprite set. */
  readonly color: string;
  /** A RACE rival's pace ratio; null for the player and for FREE PLAY rivals, which drive at a fixed utilization. */
  readonly pace: number | null;
  /** The stages the competitor takes part in; null for the whole run. */
  readonly stages: StageInterval | null;
}

/** A traffic vehicle candidate: its run vehicle, its sprite colors and its driver, compiled once. */
export interface TrafficCandidate extends EntryVehicle {
  readonly colors: readonly string[];
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
  readonly candidates: readonly TrafficCandidate[];
}

/**
 * What a run of `configuration` needs besides the player's own vehicle, decided with its entries: the
 * FREE PLAY rival pairs it draws from (`rivalPool`), every other vehicle that may drive in it — RACE's class
 * entries, FREE PLAY's pool when it has rivals, and the traffic candidates — each with its run vehicle
 * (`vehicleIds`, unique, in first-use order), the time budgets of its clock and RACE's pace schedule.
 */
export function runDemand(
  configuration: RunConfiguration,
  runClass: SeriesClass | null,
  vehicles: readonly CompiledVehicleDefinition[],
) {
  const rivalPool = configuration.rivalPool === null ? [] : rivalPoolPairs(vehicles, configuration.rivalPool);
  const ids = [
    ...(configuration.mode === 'RACE'
      ? runClass!.entries.map((entry) => entry.vehicle)
      : configuration.rivalCount > 0
        ? rivalPool.map((pair) => pair.vehicle)
        : []),
    ...(configuration.traffic?.vehicles ?? []),
  ];
  return Object.freeze({
    rivalPool,
    vehicleIds: Object.freeze([...new Set(ids)]),
    budgets: configuration.timeLimit,
    paceSchedule: configuration.mode === 'RACE',
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
const ownEntry = (runClass: SeriesClass, vehicleId: string) =>
  runClass.entries.filter((entry) => entry.slot !== null && entry.vehicle === vehicleId).at(-1);

/**
 * The player's color in a run: in a class whose colors are fixed (RACE and TIME ATTACK alike), its own entry's;
 * else the chosen color, else the vehicle's default color. Selection screens show the same color.
 */
export function runPlayerColor(
  runClass: SeriesClass | null,
  vehicle: CompiledVehicleDefinition,
  chosen: string | null,
): string {
  const own = runClass?.fixedColors ? ownEntry(runClass, vehicle.compiledVehicle.id) : undefined;
  return own?.color ?? chosen ?? vehicle.listing.visuals.palette;
}

/**
 * Resolve one admitted run configuration (`compileRunConfiguration`) with its `seed` before actors/ticks
 * exist. Graph and catalog objects remain shared references. `runClass` is the run's admitted class, which
 * RACE reads. The resolved
 * entries list the player first, then each rival. RACE takes the class's entries: the player the rearmost entry of
 * its vehicle, standing in that entry's slot (`own`) or the rearmost of their slots (`last`), and every other entry
 * its own vehicle (from `field.vehicleOf`) and color. FREE PLAY stands the player in the grid's last slot and the
 * rivals in the slots in front, each a pair drawn from `field.rivalPool` (the configuration's pool's pairs) by the
 * Run seed; TIME ATTACK stands the player alone in the grid's last slot, without traffic. The grid is the slots
 * the field's vehicles start from (`courseStartGrid`), whose last is the sixteenth or a shorter grid's last. Traffic
 * candidates come from `field.vehicleOf` with their drivers, compiled once. The player's color is
 * `runPlayerColor`'s.
 */
export function resolveRunSetup(
  course: CompiledCourse,
  runClass: SeriesClass | null,
  configuration: RunConfiguration,
  seed: number,
  vehicle: RunVehicle,
  budgets: CourseTimeBudgets | null = null,
  field: {
    /** Every other entry's run vehicle; a run with rivals requires it. */
    readonly vehicleOf?: (vehicleId: string) => EntryVehicle;
    /** FREE PLAY rival vehicle/color pairs; FREE PLAY with rivals requires them. */
    readonly rivalPool?: readonly VehicleColor[];
    /** The player vehicle's pace schedule on this course; RACE requires it. */
    readonly paceSchedule?: PaceSchedule;
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
  const playerColor = runPlayerColor(
    configuration.mode === 'FREE_PLAY' ? null : runClass,
    vehicle.vehicleDefinition,
    configuration.color,
  );
  if (configuration.mode === 'RACE' && !field.paceSchedule)
    throw new RangeError("RACE requires the player vehicle's delivered pace schedule");
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
  // Each vehicle's fixed driver, compiled once at the rival utilization and its speed cap: the runout check below, the
  // race's unpaced rivals and the player's run driver use the same one; traffic drivers use the same utilization.
  const rivalUtilization = 0.75;
  const drivers = new Map<RunVehicle, PlannedDriver>();
  const driverOf = (runVehicle: RunVehicle) => {
    let driver = drivers.get(runVehicle);
    if (!driver) {
      const { model, limits, speedCap } = mechanicsOf(runVehicle);
      drivers.set(runVehicle, (driver = compilePlannedDriver(model, limits, rivalUtilization, speedCap, true)));
    }
    return driver;
  };
  const entries =
    configuration.mode === 'RACE'
      ? classEntries(course, runClass!, { vehicle }, playerColor, field.vehicleOf!)
      : freePlayEntries(
          course,
          configuration.rivalCount,
          seed,
          { vehicle },
          playerColor,
          field.rivalPool ?? [],
          field.vehicleOf!,
        );
  // Runout covers the whole field: the entry needing the longest stop from its maximum speed decides it.
  let longest: { readonly entry: RunEntry; readonly distance: number } | null = null;
  for (const entry of entries) {
    const driver = driverOf(entry.vehicle);
    const distance = driver.speedCap ** 2 / (2 * driver.braking);
    if (!longest || distance > longest.distance) longest = { entry, distance };
  }
  if (longest)
    for (const { finish } of course.gates.intervals) {
      if (!finish || finish.section.outgoing.length !== 0) continue;
      const available = finish.section.coordinates.domain.end - finish.at.s;
      if (available < longest.distance)
        throw new RangeError(
          `FINISH ${finish.id}: ${available.toFixed(2)} m of runout; ${longest.entry.vehicle.vehicleDefinition.compiledVehicle.id} requires ${longest.distance.toFixed(2)} m to stop from maximum speed`,
        );
    }
  // Traffic drives each candidate vehicle's driver at the rival utilization, capped at the one traffic speed, converted
  // from km/h here once (a vehicle slower than it keeps its own maximum speed); each driver is compiled once here.
  const trafficSpeed = configuration.traffic
    ? configuration.traffic.speedKilometersPerHour / KILOMETERS_PER_HOUR_PER_METER_PER_SECOND
    : 0;
  const traffic: ResolvedTraffic | null = configuration.traffic
    ? Object.freeze({
        spacing: 1000 / configuration.traffic.density,
        candidates: Object.freeze(
          configuration.traffic.vehicles.map((id) => {
            const candidate = field.vehicleOf!(id);
            const { model, limits, speedCap } = mechanicsOf(candidate.vehicle);
            return Object.freeze({
              ...candidate,
              colors: spriteSetColors(candidate.vehicle.vehicleDefinition.spriteSet),
              // Traffic never changes lanes to pass; it follows a slower vehicle in its lane and merges where its lane ends.
              driver: compilePlannedDriver(model, limits, rivalUtilization, Math.min(trafficSpeed, speedCap), false),
            });
          }),
        ),
      })
    : null;
  return Object.freeze({
    course,
    configuration,
    /** The run's 32-bit unsigned random seed; rival target exits and traffic derive from it. */
    seed,
    entries,
    traffic,
    /** A run vehicle's model, limits and speed cap. */
    mechanicsOf,
    /** The course's racing lines, which rivals and the player's run driver drive; null without them. */
    racingLines: field.racingLines ?? null,
    /** The fixed driver of a run vehicle, at the rival utilization and its speed cap. */
    driverOf,
    budgets: configuration.timeLimit ? budgets : null,
    /** The player vehicle's pace schedule; RACE only. */
    paceSchedule: configuration.mode === 'RACE' ? field.paceSchedule! : null,
    /** Rank limit N by gate ID; RACE only. */
    rankLimits: configuration.mode === 'RACE' && runClass ? runClass.rankLimits : NO_RANK_LIMITS,
    bodyContact,
  });
}

export type RunSetup = ReturnType<typeof resolveRunSetup>;

/** RACE: the class's entries, the player taking the rearmost entry of its vehicle. */
function classEntries(
  course: CompiledCourse,
  runClass: SeriesClass,
  player: EntryVehicle,
  playerColor: string,
  vehicleOf: (vehicleId: string) => EntryVehicle,
): readonly RunEntry[] {
  const playerVehicleId = player.vehicle.vehicleDefinition.compiledVehicle.id;
  const gridEntries = runClass.entries.filter((entry) => entry.slot !== null);
  const own = ownEntry(runClass, playerVehicleId)!;
  const others = runClass.entries.filter((entry) => entry !== own);
  const rivals = others.map((entry) => vehicleOf(entry.vehicle));
  const grid = fieldGrid(course, [player, ...rivals]);
  // `own` keeps every grid entry's slot; `last` gives the player the rearmost of the grid entries' slots and the
  // other grid entries, in order, the slots in front of it. Entries appearing ahead have no slot.
  const slots = gridEntries.map((entry) => entry.slot!);
  const otherGridSlots = runClass.playerSlot === 'own' ? null : slots.slice(0, -1);
  let gridIndex = 0;
  const slotOf = (entry: (typeof others)[number]) =>
    entry.slot === null ? null : grid[otherGridSlots ? otherGridSlots[gridIndex++]! : entry.slot]!;
  return Object.freeze([
    Object.freeze({
      id: 'PLAYER',
      slot: grid[runClass.playerSlot === 'own' ? own.slot! : slots.at(-1)!]!,
      ahead: null,
      color: playerColor,
      pace: null,
      stages: null,
      ...player,
    }),
    ...others.map((entry, index) =>
      Object.freeze({
        id: rivalId(index),
        slot: slotOf(entry),
        ahead: entry.ahead,
        color: entry.color,
        pace: entry.pace,
        stages: entry.stages,
        ...rivals[index]!,
      }),
    ),
  ]);
}

/**
 * FREE PLAY: the player in the grid's last slot and the drawn rivals in the slots directly in front of it; TIME ATTACK,
 * which has no rivals, is the player alone there.
 */
function freePlayEntries(
  course: CompiledCourse,
  rivalCount: number,
  seed: number,
  player: EntryVehicle,
  playerColor: string,
  pool: readonly VehicleColor[],
  vehicleOf: (vehicleId: string) => EntryVehicle,
): readonly RunEntry[] {
  const playerVehicleId = player.vehicle.vehicleDefinition.compiledVehicle.id;
  const drawn = drawRivalPairs(seed, rivalCount, pool, { vehicle: playerVehicleId, color: playerColor });
  const rivals = drawn.map((pair) => vehicleOf(pair.vehicle));
  const grid = fieldGrid(course, [player, ...rivals]);
  const first = grid.length - 1 - rivalCount;
  return Object.freeze([
    Object.freeze({
      id: 'PLAYER',
      slot: grid.at(-1)!,
      ahead: null,
      color: playerColor,
      pace: null,
      stages: null,
      ...player,
    }),
    ...drawn.map((pair, index) =>
      Object.freeze({
        id: rivalId(index),
        slot: grid[first + index]!,
        ahead: null,
        color: pair.color,
        pace: null,
        stages: null,
        ...rivals[index]!,
      }),
    ),
  ]);
}
