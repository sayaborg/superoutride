import { compileEnvelopeDriver, type EnvelopeDriver } from './envelope-driver.js';
import { SIM_DT } from './fixed-step.js';
import { assertBodyContactStability } from '../vehicle/physics/body-contact.js';
import { VEHICLE_SUBSTEPS } from '../vehicle/physics/vehicle-model.js';
import type { RivalEnvelope } from '../content/rival-envelope.js';
import type { CourseTimeBudgets } from '../content/course-time-budgets.js';
import type { PaceSchedule } from '../content/pace-schedule.js';
import type { SessionVehicle } from '../content/session-vehicle.js';
import type { CompiledCourse } from '../course/compiler/compiled-course.js';
import type { AheadAppearance, SeriesClass, StageInterval } from '../content/series-catalog.js';
import type { SessionConfiguration } from './session-configuration.js';
import { drawRivalPairs, rivalPoolPairs, type VehicleColor } from './free-play-field.js';
import type { CompiledVehicleDefinition } from '../vehicle/definition-document.js';
import { spriteSetColors } from '../vehicle/vehicle-sprite-set.js';
import { KILOMETERS_PER_HOUR_PER_METER_PER_SECOND } from '../vehicle/physics/vehicle-definitions.js';

const NO_RANK_LIMITS: Readonly<Record<string, number>> = Object.freeze({});

type GridSlot = CompiledCourse['gates']['grid'][number];

/**
 * A Session vehicle with its envelope; the envelope is null only for a player without one (a DEV-tuned vehicle, or a
 * delivery without measured products), whose Session has no rivals.
 */
export interface EntryVehicle {
  readonly vehicle: SessionVehicle;
  readonly envelope: RivalEnvelope | null;
}

/**
 * One competitor's resolved entry: its stable ID, grid slot or ahead appearance, color, pace ratio, stage interval,
 * Session vehicle and that vehicle's envelope.
 */
export interface SessionEntry extends EntryVehicle {
  readonly id: string;
  /** The grid slot of a competitor taking part from STAGE 1; null for one appearing ahead. */
  readonly slot: GridSlot | null;
  readonly ahead: AheadAppearance | null;
  /** A color of the vehicle's sprite set. */
  readonly color: string;
  /** An ARCADE rival's pace ratio; null for the player and for FREE PLAY rivals, which drive at a fixed utilization. */
  readonly pace: number | null;
  /** The stages the competitor takes part in; null for the whole run. */
  readonly stages: StageInterval | null;
}

/** A traffic vehicle candidate: its Session vehicle and envelope, its sprite colors and its driver, compiled once. */
export interface TrafficCandidate extends EntryVehicle {
  readonly envelope: RivalEnvelope;
  readonly colors: readonly string[];
  readonly driver: EnvelopeDriver;
}

/** The Session's resolved traffic: metres between traffic positions and the candidates drawn for them. */
export interface ResolvedTraffic {
  readonly spacing: number;
  readonly candidates: readonly TrafficCandidate[];
}

/**
 * What a Session of `configuration` needs besides the player's own vehicle and envelope, decided with its entries: the
 * FREE PLAY rival pairs it draws from (`rivalPool`), every other vehicle that may drive in it — ARCADE's class
 * entries, FREE PLAY's pool when it has rivals, and the traffic candidates — each with its Session vehicle and
 * envelope (`vehicleIds`, unique, in first-use order), the time budgets of its clock and ARCADE's pace schedule.
 */
export function sessionDemand(
  configuration: SessionConfiguration,
  arcade: SeriesClass | null,
  vehicles: readonly CompiledVehicleDefinition[],
) {
  const rivalPool = configuration.rivalPool === null ? [] : rivalPoolPairs(vehicles, configuration.rivalPool);
  const ids = [
    ...(configuration.mode === 'ARCADE'
      ? arcade!.entries.map((entry) => entry.vehicle)
      : configuration.rivalCount > 0
        ? rivalPool.map((pair) => pair.vehicle)
        : []),
    ...(configuration.traffic?.vehicles ?? []),
  ];
  return Object.freeze({
    rivalPool,
    vehicleIds: Object.freeze([...new Set(ids)]),
    budgets: configuration.timeLimit,
    paceSchedule: configuration.mode === 'ARCADE',
  });
}

const rivalId = (index: number) => `RIVAL_${String(index + 1).padStart(2, '0')}`;

// The ARCADE class entry the player takes: the rearmost grid entry of its vehicle.
const ownEntry = (arcade: SeriesClass, vehicleId: string) =>
  arcade.entries.filter((entry) => entry.slot !== null && entry.vehicle === vehicleId).at(-1);

/**
 * The player's color in a Session: with ARCADE settings whose series fixes colors, its own entry's; else the chosen
 * color, else the vehicle's default color. Selection screens show the same color.
 */
export function sessionPlayerColor(
  arcade: SeriesClass | null,
  vehicle: CompiledVehicleDefinition,
  chosen: string | null,
): string {
  const own = arcade?.series.fixedColors ? ownEntry(arcade, vehicle.compiledVehicle.id) : undefined;
  return own?.color ?? chosen ?? vehicle.listing.visuals.palette;
}

/**
 * Resolve one admitted Session configuration (`compileSessionConfiguration`) with its `seed` before actors/ticks
 * exist. Graph and catalog objects remain shared references. `arcade` is the Session's admitted class, which
 * ARCADE reads. A Session without an envelope (a DEV-tuned vehicle, or no measured products) has no rivals and no time limit. The resolved
 * entries list the player first, then each rival. ARCADE takes the class's entries: the player the rearmost entry of
 * its vehicle, standing in that entry's slot (`own`) or the rearmost of their slots (`last`), and every other entry
 * its own vehicle (from `field.vehicleOf`) and color. FREE PLAY stands the player in the grid's last slot and the
 * rivals in the slots in front, each a pair drawn from `field.rivalPool` (the configuration's pool's pairs) by the
 * Session seed; TIME TRIAL stands the player alone in the grid's last slot, without traffic. Traffic candidates come
 * from `field.vehicleOf` with their drivers, compiled once. The player's color is `sessionPlayerColor`'s.
 */
export function resolveCourseSession(
  course: CompiledCourse,
  arcade: SeriesClass | null,
  configuration: SessionConfiguration,
  seed: number,
  vehicle: SessionVehicle,
  envelope: RivalEnvelope | null,
  budgets: CourseTimeBudgets | null = null,
  field: {
    /** Every other entry's Session vehicle; a Session with rivals requires it. */
    readonly vehicleOf?: (vehicleId: string) => EntryVehicle;
    /** FREE PLAY rival vehicle/color pairs; FREE PLAY with rivals requires them. */
    readonly rivalPool?: readonly VehicleColor[];
    /** The player vehicle's pace schedule on this course; ARCADE requires it. */
    readonly paceSchedule?: PaceSchedule;
  } = {},
) {
  // The Session's body contact: its driving definition's spring-damper, the one every contact in the Session reads,
  // admitted stable at the race's fixed step.
  const { bodyContact } = vehicle.drivingDefinition.compiledDriving;
  assertBodyContactStability(bodyContact, SIM_DT, VEHICLE_SUBSTEPS);
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff)
    throw new RangeError('Session seed must be a 32-bit unsigned integer');
  if (vehicle.vehicleDefinition.compiledVehicle.id !== configuration.vehicleId)
    throw new Error("The Session vehicle is not the configuration's vehicle");
  const playerColor = sessionPlayerColor(
    configuration.mode === 'ARCADE' ? arcade : null,
    vehicle.vehicleDefinition,
    configuration.color,
  );
  if (configuration.mode === 'ARCADE' && !field.paceSchedule)
    throw new RangeError("ARCADE requires the player vehicle's delivered pace schedule");
  if (configuration.timeLimit && !budgets)
    throw new RangeError('A time limit requires current, complete reference runs');
  if (!envelope && (configuration.rivalCount > 0 || configuration.timeLimit))
    throw new RangeError('A Session without an envelope has no rivals and no time limit');
  if (configuration.rivalCount > 0 && !field.vehicleOf)
    throw new RangeError('A Session with rivals requires their Session vehicles');
  if (configuration.traffic && !field.vehicleOf)
    throw new RangeError('A Session with traffic requires its Session vehicles');
  // Each envelope's fixed driver, compiled once at the rival utilization: the runout check below, the race's unpaced
  // rivals and the takeover after GOAL use the same one; traffic drivers use the same utilization.
  const rivalUtilization = 0.75;
  const drivers = new Map<RivalEnvelope, EnvelopeDriver>();
  const entries =
    configuration.mode === 'ARCADE'
      ? arcadeEntries(course, arcade!, { vehicle, envelope }, playerColor, field.vehicleOf!)
      : freePlayEntries(
          course,
          configuration.rivalCount,
          seed,
          { vehicle, envelope },
          playerColor,
          field.rivalPool ?? [],
          field.vehicleOf!,
        );
  // Runout covers the whole field: the entry needing the longest stop from its maximum speed decides it.
  let longest: { readonly entry: SessionEntry; readonly distance: number } | null = null;
  for (const entry of entries) {
    if (!entry.envelope) continue;
    let driver = drivers.get(entry.envelope);
    if (!driver)
      drivers.set(
        entry.envelope,
        (driver = compileEnvelopeDriver(entry.envelope, rivalUtilization, entry.envelope.maximumSpeed, true)),
      );
    const distance = entry.envelope.maximumSpeed ** 2 / (2 * driver.braking);
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
            if (!candidate.envelope) throw new RangeError(`Traffic vehicle ${id} has no envelope`);
            return Object.freeze({
              ...candidate,
              envelope: candidate.envelope,
              colors: spriteSetColors(candidate.vehicle.vehicleDefinition.spriteSet),
              // Traffic never changes lanes to pass; it follows a slower vehicle in its lane and merges where its lane ends.
              driver: compileEnvelopeDriver(candidate.envelope, rivalUtilization, trafficSpeed, false),
            });
          }),
        ),
      })
    : null;
  return Object.freeze({
    course,
    configuration,
    /** The Session's 32-bit unsigned random seed; rival target exits and traffic derive from it. */
    seed,
    entries,
    traffic,
    /** The fixed driver of an entry's envelope, at the rival utilization and the envelope's maximum speed. */
    driverOf(envelope: RivalEnvelope): EnvelopeDriver {
      const driver = drivers.get(envelope);
      if (!driver) throw new Error('The envelope belongs to no Session entry');
      return driver;
    },
    budgets: configuration.timeLimit ? budgets : null,
    /** The player vehicle's pace schedule; ARCADE only. */
    paceSchedule: configuration.mode === 'ARCADE' ? field.paceSchedule! : null,
    /** Rank limit N by gate ID; ARCADE only. */
    rankLimits: configuration.mode === 'ARCADE' && arcade ? arcade.rankLimits : NO_RANK_LIMITS,
    bodyContact,
  });
}

export type ResolvedCourseSession = ReturnType<typeof resolveCourseSession>;

/** ARCADE: the class's entries, the player taking the rearmost entry of its vehicle. */
function arcadeEntries(
  course: CompiledCourse,
  arcade: SeriesClass,
  player: EntryVehicle,
  playerColor: string,
  vehicleOf: (vehicleId: string) => EntryVehicle,
): readonly SessionEntry[] {
  const { grid } = course.gates;
  const playerVehicleId = player.vehicle.vehicleDefinition.compiledVehicle.id;
  const gridEntries = arcade.entries.filter((entry) => entry.slot !== null);
  const own = ownEntry(arcade, playerVehicleId)!;
  const others = arcade.entries.filter((entry) => entry !== own);
  // `own` keeps every grid entry's slot; `last` gives the player the rearmost of the grid entries' slots and the
  // other grid entries, in order, the slots in front of it. Entries appearing ahead have no slot.
  const slots = gridEntries.map((entry) => entry.slot!);
  const otherGridSlots = arcade.playerSlot === 'own' ? null : slots.slice(0, -1);
  let gridIndex = 0;
  const slotOf = (entry: (typeof others)[number]) =>
    entry.slot === null ? null : grid[otherGridSlots ? otherGridSlots[gridIndex++]! : entry.slot]!;
  return Object.freeze([
    Object.freeze({
      id: 'PLAYER',
      slot: grid[arcade.playerSlot === 'own' ? own.slot! : slots.at(-1)!]!,
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
        ...vehicleOf(entry.vehicle),
      }),
    ),
  ]);
}

/**
 * FREE PLAY: the player in the grid's last slot and the drawn rivals in the slots directly in front of it; TIME TRIAL,
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
): readonly SessionEntry[] {
  const { grid } = course.gates;
  const first = grid.length - 1 - rivalCount;
  const playerVehicleId = player.vehicle.vehicleDefinition.compiledVehicle.id;
  const drawn = drawRivalPairs(seed, rivalCount, pool, { vehicle: playerVehicleId, color: playerColor });
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
        ...vehicleOf(pair.vehicle),
      }),
    ),
  ]);
}
