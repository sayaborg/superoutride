import type { RepeatElement } from './course-repeat.js';
import { COURSE_DOCUMENT_LIMITS } from './course-limits.js';
import { SHA256_TEXT } from '../core/content-digest.js';
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
  readRgb555,
  readString,
} from '../core/admission.js';

const COURSE_DOCUMENT_VERSION = 39;
const ID = { maxLength: COURSE_DOCUMENT_LIMITS.idCodeUnits };

export interface CoursePosition {
  readonly pi: string;
  readonly offset: number;
}

export interface PlanPI {
  readonly id: string;
  readonly x: number;
  readonly z: number;
  readonly radius: number;
}

export type Lateral = number | { readonly boundary: string; readonly offset: number };

interface BoundaryDocument {
  readonly id: string;
  readonly knots: readonly { readonly at: CoursePosition; readonly lateral: Lateral }[];
}

interface CarriagewayDocument {
  readonly id: string;
  readonly left: string;
  readonly right: string;
  /** The number of lanes dividing the road between its Boundaries equally. */
  readonly lanes: number;
}

interface LinkDocument {
  readonly id: string;
  readonly from: { readonly sectionId: string; readonly carriagewayId: string };
  readonly to: { readonly sectionId: string };
}

/** External content identity only; no I/O or claim of payload readiness at this boundary. */
export interface CourseAssetReference {
  readonly id: string;
  readonly sha256: string;
}

interface StripDocument {
  readonly kind: 'strip';
  readonly color: number | 'transparent' | null;
  readonly material: string | null;
  readonly knots: readonly {
    readonly at: CoursePosition;
    readonly left: Lateral | null;
    readonly right: Lateral | null;
  }[];
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
  readonly background: { readonly assetId: string; readonly horizonY: number; readonly yawOrigin: number };
}
export interface SpriteDocument {
  readonly kind: 'sprite';
  readonly image: string;
  readonly palette: string;
  readonly unselectedCarriagewayId: string | null;
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
 * A wall along a Boundary from `from` to `to`. A solid wall is a line vehicles cannot cross; `solid` is null for a wall
 * vehicles pass through. Its picture is its `strips`, read like the road's with height as lateral, each within
 * `[from, to]`. An invisible wall has no strips and must be solid.
 */
export interface WallDocument {
  readonly boundary: string;
  readonly from: CoursePosition;
  readonly to: CoursePosition;
  readonly solid: SolidWallDocument | null;
  readonly strips: readonly WallStripElementDocument[];
}

/**
 * A solid wall's ends, at `from` and at `to`: each null where it joins a course limit or another solid wall, or the
 * thickness (m) of a declared free end, a fixed object that wide.
 */
export interface SolidWallDocument {
  readonly freeFrom: number | null;
  readonly freeTo: number | null;
}

/** A stretch of one side of a Section where no course limit runs: `side` from `from` to `to`. */
export interface OpenLimitDocument {
  readonly side: 'left' | 'right';
  readonly from: CoursePosition;
  readonly to: CoursePosition;
}

export interface SectionDocument {
  readonly id: string;
  readonly pis: readonly PlanPI[];
  readonly boundaries: readonly BoundaryDocument[];
  readonly strips: readonly StripElementDocument[];
  readonly walls: readonly WallDocument[];
  readonly openLimits: readonly OpenLimitDocument[];
  readonly sprites: readonly RepeatElement<SpriteDocument>[];
  readonly height: readonly { readonly at: CoursePosition; readonly y: number; readonly curveLength: number }[];
  readonly carriageways: readonly CarriagewayDocument[];
  readonly environments: readonly RepeatElement<EnvironmentDocument>[];
  readonly gates: readonly CourseGateDocument[];
}

export interface CourseLandmarkDocument {
  readonly kind: 'checkpoint' | 'finish';
  readonly id: string;
  readonly carriageway: string;
  readonly at: CoursePosition;
}

export type CourseGateDocument =
  | CourseLandmarkDocument
  | { readonly kind: 'start'; readonly grid: readonly { readonly at: CoursePosition; readonly lateral: Lateral }[] }
  | { readonly kind: 'lock' | 'closure'; readonly at: CoursePosition };

/** Position-free course rules; series own ARCADE settings. */
export interface CourseRulesDocument {
  readonly maxLaps: number;
}

export interface CourseDocument {
  readonly format: 'superoutride.course';
  readonly version: typeof COURSE_DOCUMENT_VERSION;
  /** The course's display name: one line of printable ASCII text. */
  readonly name: string;
  readonly entrySectionId: string;
  readonly rules: CourseRulesDocument;
  readonly sections: readonly SectionDocument[];
  readonly links: readonly LinkDocument[];
  readonly assets: readonly CourseAssetReference[];
}

function position(value: unknown, path: string): CoursePosition {
  const v = readRecord(value, path, ['pi', 'offset']);
  return Object.freeze({
    pi: readString(v.pi, `${path}/pi`, ID),
    offset: readNumber(v.offset, `${path}/offset`, {
      min: -COURSE_DOCUMENT_LIMITS.lengthMeters,
      max: COURSE_DOCUMENT_LIMITS.lengthMeters,
    }),
  });
}

function planPI(value: unknown, path: string): PlanPI {
  const v = readRecord(value, path, ['id', 'x', 'z', 'radius']);
  const bound = COURSE_DOCUMENT_LIMITS.coordinateMeters;
  return Object.freeze({
    id: readString(v.id, `${path}/id`, ID),
    x: readNumber(v.x, `${path}/x`, { min: -bound, max: bound }),
    z: readNumber(v.z, `${path}/z`, { min: -bound, max: bound }),
    radius: readNumber(v.radius, `${path}/radius`, { min: 0, max: COURSE_DOCUMENT_LIMITS.lengthMeters }),
  });
}

function lateral(value: unknown, path: string): Lateral {
  const bound = COURSE_DOCUMENT_LIMITS.lateralMeters;
  if (typeof value === 'number') return readNumber(value, path, { min: -bound, max: bound });
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

function carriageway(value: unknown, path: string): CarriagewayDocument {
  const v = readRecord(value, path, ['id', 'left', 'right', 'lanes']);
  return Object.freeze({
    id: readString(v.id, `${path}/id`, ID),
    left: readString(v.left, `${path}/left`, ID),
    right: readString(v.right, `${path}/right`, ID),
    lanes: readNumber(v.lanes, `${path}/lanes`, {
      min: 1,
      max: COURSE_DOCUMENT_LIMITS.carriagewayLanes,
      integer: true,
    }),
  });
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
      min: 1,
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
    const v = readRecord(value, path, ['kind', 'color', 'material', 'knots']);
    return Object.freeze({
      kind,
      color: v.color === null || v.color === 'transparent' ? v.color : readRgb555(v.color, `${path}/color`),
      material: v.material === null ? null : readString(v.material, `${path}/material`, ID),
      knots: readArray(
        v.knots,
        `${path}/knots`,
        (item, at) => {
          const knot = readRecord(item, at, ['at', 'left', 'right']);
          return Object.freeze({
            at: position(knot.at, `${at}/at`),
            left: knot.left === null ? null : lateral(knot.left, `${at}/left`),
            right: knot.right === null ? null : lateral(knot.right, `${at}/right`),
          });
        },
        { max: COURSE_DOCUMENT_LIMITS.knots },
      ),
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
  const b = readRecord(e.background, `${path}/background`, ['assetId', 'horizonY', 'yawOrigin']);
  return Object.freeze({
    at: position(e.at, `${path}/at`),
    name: readString(e.name, `${path}/name`, ID),
    background: Object.freeze({
      assetId: readString(b.assetId, `${path}/background/assetId`, ID),
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
    'unselectedCarriagewayId',
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
    unselectedCarriagewayId:
      s.unselectedCarriagewayId === null
        ? null
        : readString(s.unselectedCarriagewayId, `${path}/unselectedCarriagewayId`, ID),
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
  const v = readRecord(value, path, ['boundary', 'from', 'to', 'solid', 'strips']);
  const solid = v.solid === null ? null : solidWall(v.solid, `${path}/solid`);
  const strips = readArray(
    v.strips,
    `${path}/strips`,
    (item, at) => repeated(item, at, COURSE_DOCUMENT_LIMITS.wallStrips, wallStrip),
    { max: COURSE_DOCUMENT_LIMITS.wallStrips },
  );
  if (strips.length === 0 && !solid)
    throw new CourseInputError('invalid_value', `${path}/solid`, 'An invisible wall (no strips) must be solid');
  return Object.freeze({
    boundary: readString(v.boundary, `${path}/boundary`, ID),
    from: position(v.from, `${path}/from`),
    to: position(v.to, `${path}/to`),
    solid,
    strips,
  });
}
function solidWall(value: unknown, path: string): SolidWallDocument {
  const v = readRecord(value, path, ['freeFrom', 'freeTo']);
  const thickness = (end: unknown, at: string) =>
    end === null
      ? null
      : readNumber(end, at, { min: 0, max: COURSE_DOCUMENT_LIMITS.lateralMeters, exclusiveMin: true });
  return Object.freeze({
    freeFrom: thickness(v.freeFrom, `${path}/freeFrom`),
    freeTo: thickness(v.freeTo, `${path}/freeTo`),
  });
}
function openLimit(value: unknown, path: string): OpenLimitDocument {
  const v = readRecord(value, path, ['side', 'from', 'to']);
  return Object.freeze({
    side: readEnum(v.side, ['left', 'right'] as const, `${path}/side`),
    from: position(v.from, `${path}/from`),
    to: position(v.to, `${path}/to`),
  });
}

function environments(value: unknown, path: string): SectionDocument['environments'] {
  return readArray(
    value,
    path,
    (item, at) => repeated(item, at, COURSE_DOCUMENT_LIMITS.environmentKnots, environment),
    { max: COURSE_DOCUMENT_LIMITS.environmentKnots },
  );
}

function section(value: unknown, path: string): SectionDocument {
  const v = readRecord(value, path, [
    'id',
    'pis',
    'boundaries',
    'strips',
    'walls',
    'openLimits',
    'sprites',
    'height',
    'carriageways',
    'environments',
    'gates',
  ]);
  return Object.freeze({
    id: readString(v.id, `${path}/id`, ID),
    pis: readIdentified(v.pis, `${path}/pis`, planPI, { max: COURSE_DOCUMENT_LIMITS.pis }),
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
    height: readArray(
      v.height,
      `${path}/height`,
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
    carriageways: readIdentified(v.carriageways, `${path}/carriageways`, carriageway, {
      max: COURSE_DOCUMENT_LIMITS.carriageways,
    }),
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
          const slot = readRecord(item, at, ['at', 'lateral']);
          return Object.freeze({ at: position(slot.at, `${at}/at`), lateral: lateral(slot.lateral, `${at}/lateral`) });
        },
        { max: COURSE_DOCUMENT_LIMITS.startGridSlots },
      ),
    });
  }
  if (kind === 'checkpoint' || kind === 'finish') {
    const v = readRecord(value, path, ['kind', 'id', 'carriageway', 'at']);
    return Object.freeze({
      kind,
      id: readString(v.id, `${path}/id`, ID),
      carriageway: readString(v.carriageway, `${path}/carriageway`, ID),
      at: position(v.at, `${path}/at`),
    });
  }
  if (kind === 'lock' || kind === 'closure') {
    const v = readRecord(value, path, ['kind', 'at']);
    return Object.freeze({ kind, at: position(v.at, `${path}/at`) });
  }
  throw new CourseInputError('invalid_gate', `${path}/kind`, 'Unknown gate kind');
}

function rules(value: unknown, path: string): CourseRulesDocument {
  const v = readRecord(value, path, ['maxLaps']);
  return Object.freeze({
    maxLaps: readNumber(v.maxLaps, path + '/maxLaps', { min: 1, max: SESSION_RULE_LIMITS.laps, integer: true }),
  });
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
      ['rules', 'format', 'version', 'name', 'entrySectionId', 'sections', 'links', 'assets'],
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
      entrySectionId: readString(v.entrySectionId, '/entrySectionId', ID),
      rules: rules(v.rules, '/rules'),
      sections: readIdentified(v.sections, '/sections', section, { max: COURSE_DOCUMENT_LIMITS.sections }),
      links: readIdentified(
        v.links,
        '/links',
        (item, at) => {
          const link = readRecord(item, at, ['id', 'from', 'to']);
          const from = readRecord(link.from, `${at}/from`, ['sectionId', 'carriagewayId']);
          const to = readRecord(link.to, `${at}/to`, ['sectionId']);
          return Object.freeze({
            id: readString(link.id, `${at}/id`, ID),
            from: Object.freeze({
              sectionId: readString(from.sectionId, `${at}/from/sectionId`, ID),
              carriagewayId: readString(from.carriagewayId, `${at}/from/carriagewayId`, ID),
            }),
            to: Object.freeze({ sectionId: readString(to.sectionId, `${at}/to/sectionId`, ID) }),
          });
        },
        { max: COURSE_DOCUMENT_LIMITS.links },
      ),
      assets: readIdentified(
        v.assets,
        '/assets',
        (item, at) => {
          const a = readRecord(item, at, ['id', 'sha256']);
          const sha256 = readString(a.sha256, `${at}/sha256`, {
            ...SHA256_TEXT,
            patternMessage: 'Expected lowercase SHA-256 of saved sprite-lod bytes',
          });
          return Object.freeze({ id: readString(a.id, `${at}/id`, ID), sha256 });
        },
        { max: COURSE_DOCUMENT_LIMITS.assets },
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
    return courseSuccess(result);
  } catch (error) {
    if (error instanceof AdmissionError) return courseFailure(error, document);
    throw error;
  }
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
