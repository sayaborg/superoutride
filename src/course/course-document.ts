import type { RepeatElement } from './course-repeat.js';
import { COURSE_DOCUMENT_LIMITS } from './course-limits.js';
import { SESSION_RULE_LIMITS } from './session-rules.js';
import { TEXT_CHARACTERS } from '../image/text-tiles.js';
import { CourseInputError, courseFailure, courseSuccess, type CourseResult } from './course-diagnostics.js';
import {
  AdmissionError,
  readArray,
  readDocument,
  readEnum,
  readIdentified,
  readNumber,
  readRecord,
  readString,
} from '../core/admission.js';
import { readRgb555 } from '../image/rgb555.js';

const COURSE_DOCUMENT_VERSION = 48;
const ID = { maxLength: COURSE_DOCUMENT_LIMITS.idCodeUnits };

/** A station: `offset` metres (negative before) from a joint, the start of the plan element `joint` or `"end"`. */
export interface CoursePosition {
  readonly joint: string;
  readonly offset: number;
}

/** The joint at the end of a Section; no plan element has this id. */
export const SECTION_END_JOINT = 'end';

/**
 * One element of a Section's centreline: a straight, or an arc of `radius` turning `left` or `right`, each `length`
 * metres along the centreline.
 */
export type PlanElement =
  | { readonly kind: 'straight'; readonly id: string; readonly length: number }
  | {
      readonly kind: 'arc';
      readonly id: string;
      readonly length: number;
      readonly radius: number;
      readonly turn: 'left' | 'right';
    };

/**
 * A lateral position, metres right of the centreline: a number, or a named line plus `offset` — a Boundary, or a lane's
 * left edge, centre or right edge.
 */
export type Lateral =
  | number
  | { readonly boundary: string; readonly offset: number }
  | { readonly lane: string; readonly side: 'left' | 'center' | 'right'; readonly offset: number };

/** A width in metres: one number, or values at Positions from the Section's start to its end, straight between. */
export type CourseWidth = number | readonly { readonly at: CoursePosition; readonly width: number }[];

/** One element of a Section's cross-section, left to right: a lane, or a median between two lanes. */
export type LaneDocument =
  | { readonly kind: 'lane'; readonly id: string; readonly width: CourseWidth }
  | { readonly kind: 'median'; readonly width: CourseWidth };

interface BoundaryDocument {
  readonly id: string;
  readonly knots: readonly { readonly at: CoursePosition; readonly lateral: Lateral }[];
}

interface LinkDocument {
  readonly id: string;
  /** The lane the Link leaves by, at its Section's end; it continues as the next Section's centre lane. */
  readonly from: { readonly section: string; readonly lane: string };
  /** The Section the Link enters. */
  readonly to: string;
}

/**
 * A road Strip from `start` to `end` between its `left` and `right` edges (null: open to that side's infinity). Only
 * Boundaries carry lateral shape: an edge that varies refers to one.
 */
interface StripDocument {
  readonly kind: 'strip';
  readonly start: CoursePosition;
  readonly end: CoursePosition;
  readonly left: Lateral | null;
  readonly right: Lateral | null;
  readonly color: number | 'transparent' | null;
  readonly material: string | null;
}
export type StripElementDocument = RepeatElement<
  | StripDocument
  | {
      readonly kind: 'arrow';
      readonly at: CoursePosition;
      readonly lateral: Lateral;
      readonly width: number;
      readonly length: number;
      readonly direction: 'forward' | 'left' | 'right';
      readonly color: number;
    }
  | {
      readonly kind: 'text';
      readonly at: CoursePosition;
      readonly lateral: Lateral;
      readonly text: string;
      readonly height: number;
      readonly color: number;
    }
  | {
      readonly kind: 'curb';
      readonly start: CoursePosition;
      readonly end: CoursePosition;
      readonly left: Lateral;
      readonly right: Lateral;
      readonly stripe: number;
      readonly colors: readonly number[];
    }
>;

export interface EnvironmentDocument {
  readonly at: CoursePosition;
  readonly name: string;
  readonly background: { readonly image: string; readonly horizonY: number; readonly yawOrigin: number };
}
export interface SpriteDocument {
  readonly kind: 'sprite';
  readonly image: string;
  readonly palette: string;
  /** Null, or the id of a Link leaving the Section: the sprite shows when that Link is not chosen. */
  readonly unselectedLink: string | null;
  readonly at: CoursePosition;
  readonly lateral: Lateral;
  readonly groundOffset: number;
  /** The placement's solid part, a width across the road (m), or null when vehicles pass through it. */
  readonly body: SpriteBodyDocument | null;
}

/** A solid placement's body: its width across the road (m) and, for a movable one, how it moves (null: fixed). */
export interface SpriteBodyDocument {
  readonly width: number;
  readonly movable: MovableBodyDocument | null;
}
/**
 * How a movable body moves: its `mass` (kg), the elevation `launchDegrees` (0 or more, under 90) at which a hit throws
 * it, and the sprite images it shows while flying and once landed (`knocked`), drawn in the placement's palette.
 */
export interface MovableBodyDocument {
  readonly mass: number;
  readonly launchDegrees: number;
  readonly knocked: { readonly airborne: string; readonly landed: string };
}

/**
 * One color Strip of a wall: the road's Strip with height in place of lateral. Each knot gives the Strip's `bottom` and
 * `top` in metres above the road at that station, under the road Strip's edge rule (bottom <= top). Its color has the road Strip's meanings; a wall has no
 * material, so a wall Strip never leaves color unchanged and its color is not null.
 */
interface WallStripDocument {
  readonly kind: 'strip';
  readonly color: number | 'transparent';
  readonly knots: readonly { readonly at: CoursePosition; readonly bottom: number; readonly top: number }[];
}
export type WallStripElementDocument = RepeatElement<WallStripDocument>;

/**
 * A wall along a Boundary from `start` to `end`. A solid wall is a line vehicles cannot cross; `solid` is null for a
 * wall vehicles pass through. Its picture is its `strips`, read like the road's with height as lateral, each within
 * `[start, end]`. An invisible wall has no strips and must be solid.
 */
export interface WallDocument {
  readonly boundary: string;
  readonly start: CoursePosition;
  readonly end: CoursePosition;
  readonly solid: SolidWallDocument | null;
  readonly strips: readonly WallStripElementDocument[];
}

/**
 * A solid wall's ends, at `start` and at `end`: each null where it joins a course limit or another solid wall, or the
 * thickness (m) of a declared free end, a fixed object that wide; and its wall sound, an ID of the wall-sound document.
 */
export interface SolidWallDocument {
  readonly freeStart: number | null;
  readonly freeEnd: number | null;
  readonly sound: string;
}

/** A stretch of one side of a Section where no course limit runs: `side` from `start` to `end`. */
export interface OpenLimitDocument {
  readonly side: 'left' | 'right';
  readonly start: CoursePosition;
  readonly end: CoursePosition;
}

export interface SectionDocument {
  readonly id: string;
  /** The centreline from the Section's origin, facing +Z. */
  readonly plan: readonly PlanElement[];
  readonly profile: readonly { readonly at: CoursePosition; readonly y: number; readonly curveLength: number }[];
  /** The cross-section's lanes and medians, left to right; the centre of lane `centerLane` is the centreline. */
  readonly lanes: readonly LaneDocument[];
  readonly centerLane: string;
  readonly boundaries: readonly BoundaryDocument[];
  readonly strips: readonly StripElementDocument[];
  readonly walls: readonly WallDocument[];
  readonly openLimits: readonly OpenLimitDocument[];
  readonly sprites: readonly RepeatElement<SpriteDocument>[];
  readonly environments: readonly RepeatElement<EnvironmentDocument>[];
  readonly gates: readonly CourseGateDocument[];
}

export interface CourseLandmarkDocument {
  readonly kind: 'checkpoint' | 'finish';
  readonly id: string;
  readonly at: CoursePosition;
}

export type CourseGateDocument =
  | CourseLandmarkDocument
  /** The grid: each slot a lane at a Position, its lateral the lane's centre. */
  | { readonly kind: 'start'; readonly grid: readonly { readonly at: CoursePosition; readonly lane: string }[] }
  | { readonly kind: 'lock' | 'closure'; readonly at: CoursePosition };

/** Position-free course rules; series own ARCADE settings. */
export interface CourseRules {
  readonly maxLaps: number;
}

export interface CourseDocument {
  readonly format: 'superoutride.course';
  readonly version: typeof COURSE_DOCUMENT_VERSION;
  /** The course's display name: one line of printable ASCII text. */
  readonly name: string;
  /** The Section a course run enters. */
  readonly entry: string;
  /** The most laps a Session may run on this course. */
  readonly maxLaps: number;
  readonly sections: readonly SectionDocument[];
  readonly links: readonly LinkDocument[];
}

function position(value: unknown, path: string): CoursePosition {
  const v = readRecord(value, path, ['joint', 'offset']);
  return Object.freeze({
    joint: readString(v.joint, `${path}/joint`, ID),
    offset: readNumber(v.offset, `${path}/offset`, {
      min: -COURSE_DOCUMENT_LIMITS.lengthMeters,
      max: COURSE_DOCUMENT_LIMITS.lengthMeters,
    }),
  });
}

function planElement(value: unknown, path: string): PlanElement {
  const kind = readEnum((value as { kind?: unknown } | null)?.kind, ['straight', 'arc'], `${path}/kind`);
  const v = readRecord(
    value,
    path,
    kind === 'arc' ? ['kind', 'id', 'length', 'radius', 'turn'] : ['kind', 'id', 'length'],
  );
  const id = readString(v.id, `${path}/id`, ID);
  if (id === SECTION_END_JOINT)
    throw new AdmissionError('invalid_value', `${path}/id`, `A plan element cannot be named ${JSON.stringify(id)}`);
  const length = readNumber(v.length, `${path}/length`, {
    min: 0,
    max: COURSE_DOCUMENT_LIMITS.lengthMeters,
    exclusiveMin: true,
  });
  if (kind === 'straight') return Object.freeze({ kind, id, length });
  return Object.freeze({
    kind,
    id,
    length,
    radius: readNumber(v.radius, `${path}/radius`, {
      min: 0,
      max: COURSE_DOCUMENT_LIMITS.lengthMeters,
      exclusiveMin: true,
    }),
    turn: readEnum(v.turn, ['left', 'right'], `${path}/turn`),
  });
}

function lateral(value: unknown, path: string): Lateral {
  const bound = COURSE_DOCUMENT_LIMITS.lateralMeters;
  if (typeof value === 'number') return readNumber(value, path, { min: -bound, max: bound });
  if (value && typeof value === 'object' && 'lane' in value) {
    const v = readRecord(value, path, ['lane', 'side', 'offset']);
    return Object.freeze({
      lane: readString(v.lane, `${path}/lane`, ID),
      side: readEnum(v.side, ['left', 'center', 'right'], `${path}/side`),
      offset: readNumber(v.offset, `${path}/offset`, { min: -bound, max: bound }),
    });
  }
  const v = readRecord(value, path, ['boundary', 'offset']);
  return Object.freeze({
    boundary: readString(v.boundary, `${path}/boundary`, ID),
    offset: readNumber(v.offset, `${path}/offset`, { min: -bound, max: bound }),
  });
}

function boundary(value: unknown, path: string): BoundaryDocument {
  const v = readRecord(value, path, ['id', 'knots']);
  return Object.freeze({
    id: readString(v.id, `${path}/id`, ID),
    knots: readArray(
      v.knots,
      `${path}/knots`,
      (item, at) => {
        const knot = readRecord(item, at, ['at', 'lateral']);
        return Object.freeze({
          at: position(knot.at, `${at}/at`),
          lateral: lateral(knot.lateral, `${at}/lateral`),
        });
      },
      { max: COURSE_DOCUMENT_LIMITS.knots },
    ),
  });
}

/** A width: zero or more, and positive somewhere; a list of values that are all the same is one number. */
function width(value: unknown, path: string): CourseWidth {
  const range = { min: 0, max: COURSE_DOCUMENT_LIMITS.lateralMeters };
  if (typeof value === 'number') {
    const w = readNumber(value, path, range);
    if (w === 0) throw new AdmissionError('invalid_value', path, 'A width that is always zero is not written');
    return w;
  }
  const knots = readArray(
    value,
    path,
    (item, at) => {
      const knot = readRecord(item, at, ['at', 'width']);
      return Object.freeze({ at: position(knot.at, `${at}/at`), width: readNumber(knot.width, `${at}/width`, range) });
    },
    { min: 2, max: COURSE_DOCUMENT_LIMITS.knots },
  );
  if (knots.every((knot) => knot.width === knots[0]!.width))
    throw new AdmissionError('invalid_value', path, 'A width with one value throughout is written as that number');
  return knots;
}

function lanes(value: unknown, path: string): SectionDocument['lanes'] {
  const ids = new Set<string>();
  const list = readArray(
    value,
    path,
    (item, at): LaneDocument => {
      const kind = readEnum((item as { kind?: unknown } | null)?.kind, ['lane', 'median'], `${at}/kind`);
      if (kind === 'median') {
        const v = readRecord(item, at, ['kind', 'width']);
        return Object.freeze({ kind, width: width(v.width, `${at}/width`) });
      }
      const v = readRecord(item, at, ['kind', 'id', 'width']);
      const id = readString(v.id, `${at}/id`, ID);
      if (ids.has(id)) throw new AdmissionError('duplicate_id', `${at}/id`, `Duplicate lane ID ${JSON.stringify(id)}`);
      ids.add(id);
      return Object.freeze({ kind, id, width: width(v.width, `${at}/width`) });
    },
    { min: 1, max: COURSE_DOCUMENT_LIMITS.lanes },
  );
  list.forEach((element, i) => {
    if (element.kind !== 'median') return;
    if (i === 0 || i === list.length - 1 || list[i - 1]!.kind === 'median')
      throw new AdmissionError('invalid_value', `${path}/${i}`, 'A median lies between two lanes');
  });
  return list;
}

function repeated<T>(
  value: unknown,
  path: string,
  limit: number,
  leaf: (value: unknown, path: string) => T,
  depth = 0,
): RepeatElement<T> {
  if (depth > COURSE_DOCUMENT_LIMITS.repeatDepth)
    throw new CourseInputError(
      'resource_limit',
      path,
      `Repeat nesting exceeds ${COURSE_DOCUMENT_LIMITS.repeatDepth} levels`,
    );
  if (value && typeof value === 'object' && (value as Record<string, unknown>).kind === 'repeat') {
    const v = readRecord(value, path, ['kind', 'every', 'count', 'elements']);
    const count = readNumber(v.count, `${path}/count`, {
      min: 2,
      max: COURSE_DOCUMENT_LIMITS.repeatCount,
      integer: true,
    });
    return Object.freeze({
      kind: 'repeat',
      every: readNumber(v.every, `${path}/every`, {
        min: 0,
        max: COURSE_DOCUMENT_LIMITS.lengthMeters,
        exclusiveMin: true,
      }),
      count,
      elements: readArray(v.elements, `${path}/elements`, (item, at) => repeated(item, at, limit, leaf, depth + 1), {
        min: 1,
        max: limit,
      }),
    });
  }
  return leaf(value, path);
}

function stripElement(value: unknown, path: string): StripElementDocument {
  return repeated(value, path, COURSE_DOCUMENT_LIMITS.stripElements, stripLeaf);
}
function stripLeaf(value: unknown, path: string): Exclude<StripElementDocument, { kind: 'repeat' }> {
  const kind = value && typeof value === 'object' ? (value as Record<string, unknown>).kind : undefined;
  const metre = (value: unknown, at: string, positive = false) =>
    readNumber(value, at, { min: 0, max: COURSE_DOCUMENT_LIMITS.lengthMeters, exclusiveMin: positive });
  if (kind === 'strip') {
    const v = readRecord(value, path, ['kind', 'start', 'end', 'left', 'right', 'color', 'material']);
    return Object.freeze({
      kind,
      start: position(v.start, `${path}/start`),
      end: position(v.end, `${path}/end`),
      left: v.left === null ? null : lateral(v.left, `${path}/left`),
      right: v.right === null ? null : lateral(v.right, `${path}/right`),
      color: v.color === null || v.color === 'transparent' ? v.color : readRgb555(v.color, `${path}/color`),
      material: v.material === null ? null : readString(v.material, `${path}/material`, ID),
    });
  }
  if (kind === 'arrow') {
    const v = readRecord(value, path, ['kind', 'at', 'lateral', 'width', 'length', 'direction', 'color']);
    return Object.freeze({
      kind,
      at: position(v.at, `${path}/at`),
      lateral: lateral(v.lateral, `${path}/lateral`),
      width: metre(v.width, `${path}/width`, true),
      length: metre(v.length, `${path}/length`, true),
      direction: readEnum(v.direction, ['forward', 'left', 'right'] as const, `${path}/direction`),
      color: readRgb555(v.color, `${path}/color`),
    });
  }
  if (kind === 'text') {
    const v = readRecord(value, path, ['kind', 'at', 'lateral', 'text', 'height', 'color']);
    // A wrong type is a shape error; a string outside the character set is a value error.
    if (typeof v.text !== 'string') throw new CourseInputError('invalid_shape', `${path}/text`, 'Expected a string');
    if (v.text.length > COURSE_DOCUMENT_LIMITS.textCodeUnits)
      throw new CourseInputError(
        'resource_limit',
        `${path}/text`,
        `Strip text exceeds ${COURSE_DOCUMENT_LIMITS.textCodeUnits} code units`,
      );
    if (!/^[A-Z0-9 ]+$/.test(v.text))
      throw new CourseInputError(
        'invalid_value',
        `${path}/text`,
        'Strip text supports one or more uppercase ASCII letters, digits or spaces',
      );
    return Object.freeze({
      kind,
      at: position(v.at, `${path}/at`),
      lateral: lateral(v.lateral, `${path}/lateral`),
      text: v.text,
      height: metre(v.height, `${path}/height`, true),
      color: readRgb555(v.color, `${path}/color`),
    });
  }
  if (kind === 'curb') {
    const v = readRecord(value, path, ['kind', 'start', 'end', 'left', 'right', 'stripe', 'colors']);
    const colors = readArray(v.colors, `${path}/colors`, readRgb555, {
      min: 2,
      max: COURSE_DOCUMENT_LIMITS.curbColors,
    });
    return Object.freeze({
      kind,
      start: position(v.start, `${path}/start`),
      end: position(v.end, `${path}/end`),
      left: lateral(v.left, `${path}/left`),
      right: lateral(v.right, `${path}/right`),
      stripe: metre(v.stripe, `${path}/stripe`, true),
      colors,
    });
  }
  throw new CourseInputError('unsupported_feature', `${path}/kind`, 'Unknown Strip authoring construct');
}

function environment(value: unknown, path: string): EnvironmentDocument {
  const e = readRecord(value, path, ['at', 'name', 'background']);
  const b = readRecord(e.background, `${path}/background`, ['image', 'horizonY', 'yawOrigin']);
  return Object.freeze({
    at: position(e.at, `${path}/at`),
    name: readString(e.name, `${path}/name`, ID),
    background: Object.freeze({
      image: readString(b.image, `${path}/background/image`, ID),
      horizonY: readNumber(b.horizonY, `${path}/background/horizonY`, { min: 0, max: Number.MAX_SAFE_INTEGER }),
      yawOrigin: readNumber(b.yawOrigin, `${path}/background/yawOrigin`, { min: -360, max: 360 }),
    }),
  });
}
function sprite(value: unknown, path: string): SpriteDocument {
  const s = readRecord(value, path, [
    'kind',
    'image',
    'palette',
    'at',
    'lateral',
    'groundOffset',
    'unselectedLink',
    'body',
  ]);
  if (s.kind !== 'sprite') throw new CourseInputError('unsupported_feature', `${path}/kind`, 'Expected sprite');
  return Object.freeze({
    kind: 'sprite',
    image: readString(s.image, `${path}/image`, ID),
    palette: readString(s.palette, `${path}/palette`, ID),
    at: position(s.at, `${path}/at`),
    lateral: lateral(s.lateral, `${path}/lateral`),
    groundOffset: readNumber(s.groundOffset, `${path}/groundOffset`, {
      min: -COURSE_DOCUMENT_LIMITS.heightMeters,
      max: COURSE_DOCUMENT_LIMITS.heightMeters,
    }),
    unselectedLink: s.unselectedLink === null ? null : readString(s.unselectedLink, `${path}/unselectedLink`, ID),
    body: s.body === null ? null : spriteBody(s.body, `${path}/body`),
  });
}
function spriteBody(value: unknown, path: string): SpriteBodyDocument {
  const b = readRecord(value, path, ['width', 'movable']);
  return Object.freeze({
    width: readNumber(b.width, `${path}/width`, {
      min: 0,
      max: COURSE_DOCUMENT_LIMITS.lateralMeters,
      exclusiveMin: true,
    }),
    movable: b.movable === null ? null : movableBody(b.movable, `${path}/movable`),
  });
}
function movableBody(value: unknown, path: string): MovableBodyDocument {
  const m = readRecord(value, path, ['mass', 'launchDegrees', 'knocked']);
  const knocked = readRecord(m.knocked, `${path}/knocked`, ['airborne', 'landed']);
  return Object.freeze({
    mass: readNumber(m.mass, `${path}/mass`, {
      min: 0,
      max: COURSE_DOCUMENT_LIMITS.objectMassKilograms,
      exclusiveMin: true,
    }),
    launchDegrees: readNumber(m.launchDegrees, `${path}/launchDegrees`, { min: 0, max: 90, exclusiveMax: true }),
    knocked: Object.freeze({
      airborne: readString(knocked.airborne, `${path}/knocked/airborne`, ID),
      landed: readString(knocked.landed, `${path}/knocked/landed`, ID),
    }),
  });
}
function wallStrip(value: unknown, path: string): WallStripDocument {
  const v = readRecord(value, path, ['kind', 'color', 'knots']);
  if (v.kind !== 'strip')
    throw new CourseInputError('unsupported_feature', `${path}/kind`, 'Unknown wall Strip construct');
  const height = { min: -COURSE_DOCUMENT_LIMITS.wallHeightMeters, max: COURSE_DOCUMENT_LIMITS.wallHeightMeters };
  return Object.freeze({
    kind: 'strip',
    color: v.color === 'transparent' ? v.color : readRgb555(v.color, `${path}/color`),
    knots: readArray(
      v.knots,
      `${path}/knots`,
      (item, at) => {
        const knot = readRecord(item, at, ['at', 'bottom', 'top']);
        return Object.freeze({
          at: position(knot.at, `${at}/at`),
          bottom: readNumber(knot.bottom, `${at}/bottom`, height),
          top: readNumber(knot.top, `${at}/top`, height),
        });
      },
      { max: COURSE_DOCUMENT_LIMITS.knots },
    ),
  });
}
function wall(value: unknown, path: string): WallDocument {
  const v = readRecord(value, path, ['boundary', 'start', 'end', 'solid', 'strips']);
  const solid = v.solid === null ? null : solidWall(v.solid, `${path}/solid`);
  const strips = readArray(
    v.strips,
    `${path}/strips`,
    (item, at) => repeated(item, at, COURSE_DOCUMENT_LIMITS.stripElements, wallStrip),
    { max: COURSE_DOCUMENT_LIMITS.stripElements },
  );
  if (strips.length === 0 && !solid)
    throw new CourseInputError('invalid_value', `${path}/solid`, 'An invisible wall (no strips) must be solid');
  return Object.freeze({
    boundary: readString(v.boundary, `${path}/boundary`, ID),
    start: position(v.start, `${path}/start`),
    end: position(v.end, `${path}/end`),
    solid,
    strips,
  });
}
function solidWall(value: unknown, path: string): SolidWallDocument {
  const v = readRecord(value, path, ['freeStart', 'freeEnd', 'sound']);
  const thickness = (end: unknown, at: string) =>
    end === null
      ? null
      : readNumber(end, at, { min: 0, max: COURSE_DOCUMENT_LIMITS.lateralMeters, exclusiveMin: true });
  return Object.freeze({
    freeStart: thickness(v.freeStart, `${path}/freeStart`),
    freeEnd: thickness(v.freeEnd, `${path}/freeEnd`),
    sound: readString(v.sound, `${path}/sound`),
  });
}
function openLimit(value: unknown, path: string): OpenLimitDocument {
  const v = readRecord(value, path, ['side', 'start', 'end']);
  return Object.freeze({
    side: readEnum(v.side, ['left', 'right'] as const, `${path}/side`),
    start: position(v.start, `${path}/start`),
    end: position(v.end, `${path}/end`),
  });
}

function environments(value: unknown, path: string): SectionDocument['environments'] {
  return readArray(
    value,
    path,
    (item, at) => repeated(item, at, COURSE_DOCUMENT_LIMITS.environmentKnots, environment),
    { min: 1, max: COURSE_DOCUMENT_LIMITS.environmentKnots },
  );
}

function section(value: unknown, path: string): SectionDocument {
  const v = readRecord(value, path, [
    'id',
    'plan',
    'profile',
    'lanes',
    'centerLane',
    'boundaries',
    'strips',
    'walls',
    'openLimits',
    'sprites',
    'environments',
    'gates',
  ]);
  return Object.freeze({
    id: readString(v.id, `${path}/id`, ID),
    plan: readIdentified(v.plan, `${path}/plan`, planElement, { max: COURSE_DOCUMENT_LIMITS.planElements }),
    profile: readArray(
      v.profile,
      `${path}/profile`,
      (item, at) => {
        const node = readRecord(item, at, ['at', 'y', 'curveLength']);
        return Object.freeze({
          at: position(node.at, `${at}/at`),
          y: readNumber(node.y, `${at}/y`, {
            min: -COURSE_DOCUMENT_LIMITS.heightMeters,
            max: COURSE_DOCUMENT_LIMITS.heightMeters,
          }),
          curveLength: readNumber(node.curveLength, `${at}/curveLength`, {
            min: 0,
            max: COURSE_DOCUMENT_LIMITS.lengthMeters,
          }),
        });
      },
      { max: COURSE_DOCUMENT_LIMITS.heightNodes },
    ),
    lanes: lanes(v.lanes, `${path}/lanes`),
    centerLane: readString(v.centerLane, `${path}/centerLane`, ID),
    boundaries: readIdentified(v.boundaries, `${path}/boundaries`, boundary, {
      max: COURSE_DOCUMENT_LIMITS.boundaries,
    }),
    strips: readArray(v.strips, `${path}/strips`, (item, at) => stripElement(item, at), {
      max: COURSE_DOCUMENT_LIMITS.stripElements,
    }),
    walls: readArray(v.walls, `${path}/walls`, wall, { max: COURSE_DOCUMENT_LIMITS.walls }),
    openLimits: readArray(v.openLimits, `${path}/openLimits`, openLimit, { max: COURSE_DOCUMENT_LIMITS.openLimits }),
    sprites: readArray(
      v.sprites,
      `${path}/sprites`,
      (item, at) => repeated(item, at, COURSE_DOCUMENT_LIMITS.spriteElements, sprite),
      { max: COURSE_DOCUMENT_LIMITS.spriteElements },
    ),
    environments: environments(v.environments, `${path}/environments`),
    gates: readArray(v.gates, `${path}/gates`, gate, { max: COURSE_DOCUMENT_LIMITS.gates }),
  });
}

function gate(value: unknown, path: string): CourseGateDocument {
  const kind = value && typeof value === 'object' ? (value as Record<string, unknown>).kind : undefined;
  if (kind === 'start') {
    const v = readRecord(value, path, ['kind', 'grid']);
    return Object.freeze({
      kind,
      grid: readArray(
        v.grid,
        `${path}/grid`,
        (item, at) => {
          const slot = readRecord(item, at, ['at', 'lane']);
          return Object.freeze({ at: position(slot.at, `${at}/at`), lane: readString(slot.lane, `${at}/lane`, ID) });
        },
        { max: COURSE_DOCUMENT_LIMITS.startGridSlots },
      ),
    });
  }
  if (kind === 'checkpoint' || kind === 'finish') {
    const v = readRecord(value, path, ['kind', 'id', 'at']);
    return Object.freeze({
      kind,
      id: readString(v.id, `${path}/id`, ID),
      at: position(v.at, `${path}/at`),
    });
  }
  if (kind === 'lock' || kind === 'closure') {
    const v = readRecord(value, path, ['kind', 'at']);
    return Object.freeze({ kind, at: position(v.at, `${path}/at`) });
  }
  throw new CourseInputError('invalid_gate', `${path}/kind`, 'Unknown gate kind');
}

/**
 * The only course-document admission: own and normalize schema-valid authoring, including semantically
 * incomplete drafts, as a detached deeply frozen value. Diagnostics name `document` when supplied.
 */
export function readCourseDocument(input: unknown, document = ''): CourseResult<CourseDocument> {
  try {
    // Format and version are checked before the current schema's fields.
    const v = readDocument(
      input,
      ['format', 'version', 'name', 'entry', 'maxLaps', 'sections', 'links'],
      'superoutride.course',
      COURSE_DOCUMENT_VERSION,
    );
    const result: CourseDocument = Object.freeze({
      format: 'superoutride.course',
      version: COURSE_DOCUMENT_VERSION,
      name: readString(v.name, '/name', {
        maxLength: COURSE_DOCUMENT_LIMITS.nameCodeUnits,
        pattern: TEXT_CHARACTERS,
        patternMessage: 'Expected printable ASCII text',
      }),
      entry: readString(v.entry, '/entry', ID),
      maxLaps: readNumber(v.maxLaps, '/maxLaps', { min: 1, max: SESSION_RULE_LIMITS.laps, integer: true }),
      sections: readIdentified(v.sections, '/sections', section, { max: COURSE_DOCUMENT_LIMITS.sections }),
      links: readIdentified(
        v.links,
        '/links',
        (item, at) => {
          const link = readRecord(item, at, ['id', 'from', 'to']);
          const from = readRecord(link.from, `${at}/from`, ['section', 'lane']);
          return Object.freeze({
            id: readString(link.id, `${at}/id`, ID),
            from: Object.freeze({
              section: readString(from.section, `${at}/from/section`, ID),
              lane: readString(from.lane, `${at}/from/lane`, ID),
            }),
            to: readString(link.to, `${at}/to`, ID),
          });
        },
        { max: COURSE_DOCUMENT_LIMITS.links },
      ),
    });
    const gateIds = new Set<string>();
    let gateCount = 0;
    result.sections.forEach((section, i) => {
      gateCount += section.gates.length;
      if (gateCount > COURSE_DOCUMENT_LIMITS.gates)
        throw new CourseInputError(
          'invalid_gate',
          `/sections/${i}/gates`,
          `Course admits at most ${COURSE_DOCUMENT_LIMITS.gates} gates`,
        );
      section.gates.forEach((gate, j) => {
        if ('id' in gate) {
          if (gateIds.has(gate.id))
            throw new CourseInputError('invalid_gate', `/sections/${i}/gates/${j}/id`, `Duplicate gate ID ${gate.id}`);
          gateIds.add(gate.id);
        }
      });
    });
    if (courseImageNames(result).length > COURSE_DOCUMENT_LIMITS.images)
      throw new CourseInputError(
        'resource_limit',
        '/sections',
        `A course uses at most ${COURSE_DOCUMENT_LIMITS.images} images`,
      );
    return courseSuccess(result);
  } catch (error) {
    if (error instanceof AdmissionError) return courseFailure(error, document);
    throw error;
  }
}

/**
 * The images a course uses, by name, each once in order of first use: its environments' backgrounds and its sprites'
 * images, a movable body's knocked images included. They are the files `content/images/<name>.json`.
 */
export function courseImageNames(document: CourseDocument): readonly string[] {
  const names = new Set<string>();
  for (const section of document.sections) {
    visitElements(section.environments, (environment) => names.add(environment.background.image));
    visitElements(section.sprites, (sprite) => {
      names.add(sprite.image);
      if (sprite.body?.movable) names.add(sprite.body.movable.knocked.airborne).add(sprite.body.movable.knocked.landed);
    });
  }
  return [...names];
}

/** The images of a course's solid sprites, by name, sorted: their dimensions give its roadside objects' shapes. */
export function courseSolidImageNames(document: CourseDocument): readonly string[] {
  const names = new Set<string>();
  for (const section of document.sections)
    visitElements(section.sprites, (sprite) => {
      if (sprite.body !== null) names.add(sprite.image);
    });
  return [...names].sort();
}

function visitElements<T>(elements: readonly RepeatElement<T>[], leaf: (element: T) => void): void {
  for (const element of elements)
    if ((element as { kind?: unknown }).kind === 'repeat')
      visitElements((element as { elements: RepeatElement<T>[] }).elements, leaf);
    else leaf(element as T);
}

/**
 * Admit a saved course document from its raw bytes. The byte ceiling measures the input as saved,
 * before UTF-8 decoding and JSON parsing; the parsed value then passes `readCourseDocument`.
 */
export function readCourseDocumentBytes(bytes: Uint8Array, document = ''): CourseResult<CourseDocument> {
  if (bytes.byteLength > COURSE_DOCUMENT_LIMITS.jsonBytes)
    return courseFailure(
      new CourseInputError('resource_limit', '', `Document exceeds ${COURSE_DOCUMENT_LIMITS.jsonBytes} UTF-8 bytes`),
      document,
    );
  let input: unknown;
  try {
    input = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof TypeError)
      return courseFailure(new CourseInputError('parse_failure', '', error.message), document);
    throw error;
  }
  return readCourseDocument(input, document);
}
