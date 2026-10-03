import { compileEnvelopeDriver, type EnvelopeDriver } from './envelope-driver.js';
import type { RivalEnvelope } from '../content/rival-envelope.js';
import type { CourseTimeBudgets } from '../content/course-time-budgets.js';
import type { PaceSchedule } from '../content/pace-schedule.js';
import type { SessionVehicle } from '../content/session-vehicle.js';
import type { CompiledCourse } from '../course/compiler/compiled-course.js';
import type { AheadAppearance, SeriesCourse, StageInterval } from '../content/series-catalog.js';
import type { SessionConfiguration } from './session-configuration.js';
import { drawRivalPairs, type VehicleColor } from './free-play-field.js';
import { spriteSetColors } from '../vehicle/vehicle-sprite-set.js';

const NO_RANK_LIMITS: Readonly<Record<string, number>> = Object.freeze({});

type GridSlot = CompiledCourse['gates']['grid'][number];

/** The most rivals a grid of `slots` holds: every slot but the player's. */
export function gridRivalCapacity(slots: number): number {
  return slots - 1;
}

/** A Session vehicle with its envelope; the envelope is null only for a DEV-tuned player, whose Session has no rivals. */
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

const rivalId = (index: number) => `RIVAL_${String(index + 1).padStart(2, '0')}`;

/**
 * Resolve one playable configuration before actors/ticks exist. Graph and catalog objects remain shared
 * references. `arcade` is the course's admitted series settings; a course without them has no ARCADE Session. Only
 * ARCADE has the clock. A Session without an envelope (a DEV-tuned vehicle) has no rivals and no time limit.
 * The resolved entries list the player first, then each rival. ARCADE takes the series entries: the player the
 * rearmost entry of its vehicle, standing in that entry's slot (`own`) or the rearmost of their slots (`last`), and
 * every other entry its own vehicle (from `field.vehicleOf`) and color. FREE PLAY stands the player in the grid's
 * last slot and the rivals in the slots in front, each a pair drawn from `field.rivalPool` by the Session seed;
 * TIME TRIAL stands the player alone in the grid's last slot, without traffic. Traffic candidates come from
 * `field.vehicleOf` with their drivers, compiled once. The player's color
 * is its entry's when the series fixes colors, else `field.playerColor`, else the vehicle's default color.
 */
export function resolveCourseSession(
  course: CompiledCourse,
  arcade: SeriesCourse | null,
  requested: SessionConfiguration,
  vehicle: SessionVehicle,
  envelope: RivalEnvelope | null,
  budgets: CourseTimeBudgets | null = null,
  field: {
    readonly playerColor?: string;
    /** Every other entry's Session vehicle; a Session with rivals requires it. */
    readonly vehicleOf?: (vehicleId: string) => EntryVehicle;
    /** FREE PLAY rival vehicle/color pairs; FREE PLAY with rivals requires them. */
    readonly rivalPool?: readonly VehicleColor[];
    /** The player vehicle's pace schedule on this course; ARCADE requires it. */
    readonly paceSchedule?: PaceSchedule;
  } = {},
) {
  const playerVehicleId = vehicle.vehicleDefinition.compiledVehicle.id;
  const defaultColor = vehicle.vehicleDefinition.listing.visuals.palette;
  if (requested.mode === 'ARCADE' && arcade === null) throw new RangeError('An untimed course has no ARCADE Session');
  const configuration: Readonly<SessionConfiguration> =
    requested.mode === 'ARCADE' && arcade !== null
      ? Object.freeze({
          mode: 'ARCADE',
          rivalCount: arcade.entries.length - 1,
          lapCount: arcade.laps,
          timeLimit: true,
          initialSpeed: requested.initialSpeed,
          seed: requested.seed,
          traffic: arcade.traffic,
        })
      : Object.freeze({ ...requested });
  if (configuration.mode === 'TIME_TRIAL' && configuration.traffic) throw new RangeError('TIME TRIAL has no traffic');
  if (!Number.isFinite(configuration.initialSpeed)) throw new RangeError('Session initialSpeed must be finite');
  if (configuration.mode === 'ARCADE' && !arcade?.series.vehicles.includes(playerVehicleId))
    throw new RangeError('ARCADE requires a series vehicle');
  if (configuration.lapCount > course.rules.maxLaps)
    throw new RangeError('Lap count exceeds the authored course limit');
  if (configuration.rivalCount > gridRivalCapacity(course.gates.grid.length))
    throw new RangeError('The authored grid cannot hold this field');
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
  // Each envelope's fixed driver, compiled once at the rival utilization: the runout check below and the race's unpaced
  // rivals use the same one.
  const rivalUtilization = 0.75;
  const drivers = new Map<RivalEnvelope, EnvelopeDriver>();
  const entries =
    configuration.mode === 'ARCADE'
      ? arcadeEntries(course, arcade!, { vehicle, envelope }, field.playerColor ?? defaultColor, field.vehicleOf!)
      : freePlayEntries(
          course,
          configuration,
          { vehicle, envelope },
          field.playerColor ?? defaultColor,
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
        (driver = compileEnvelopeDriver(entry.envelope, rivalUtilization, entry.envelope.maximumSpeed)),
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
  // Traffic drives each candidate vehicle's driver at the rival utilization, capped at the traffic speed fraction of
  // that vehicle's maximum speed; each is compiled once here.
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
              driver: compileEnvelopeDriver(
                candidate.envelope,
                rivalUtilization,
                configuration.traffic!.speed * candidate.envelope.maximumSpeed,
              ),
            });
          }),
        ),
      })
    : null;
  return Object.freeze({
    course,
    configuration,
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
  });
}

export type ResolvedCourseSession = ReturnType<typeof resolveCourseSession>;

/** ARCADE: the series entries, the player taking the rearmost entry of its vehicle. */
function arcadeEntries(
  course: CompiledCourse,
  arcade: SeriesCourse,
  player: EntryVehicle,
  chosenColor: string,
  vehicleOf: (vehicleId: string) => EntryVehicle,
): readonly SessionEntry[] {
  const { grid } = course.gates;
  const playerVehicleId = player.vehicle.vehicleDefinition.compiledVehicle.id;
  const gridEntries = arcade.entries.filter((entry) => entry.slot !== null);
  const own = [...gridEntries].reverse().find((entry) => entry.vehicle === playerVehicleId)!;
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
      color: arcade.series.fixedColors ? own.color : chosenColor,
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
  configuration: SessionConfiguration,
  player: EntryVehicle,
  playerColor: string,
  pool: readonly VehicleColor[],
  vehicleOf: (vehicleId: string) => EntryVehicle,
): readonly SessionEntry[] {
  const { grid } = course.gates;
  const { rivalCount, seed } = configuration;
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
