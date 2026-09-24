import type { RepeatElement } from './course-repeat.js';
import { COURSE_DOCUMENT_LIMITS } from './course-limits.js';
import { SESSION_RULE_LIMITS } from './session-rules.js';
import { CourseInputError, courseFailure, courseSuccess, type CourseResult } from './course-diagnostics.js';

const COURSE_DOCUMENT_VERSION = 22;

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
}

interface LinkDocument {
  readonly id: string;
  readonly from: { readonly sectionId: string; readonly carriagewayId: string };
  readonly to: { readonly sectionId: string };
}

/** External content identity only; no I/O or claim of payload readiness at this boundary. */
export interface CourseAssetReference {
  readonly id: string;
  readonly format: 'superoutride.sprite-lod' | 'superoutride.tile-background';
  readonly version: 1 | 2;
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
  readonly palette: readonly number[] | null;
  readonly unselectedCarriagewayId: string | null;
  readonly at: CoursePosition;
  readonly lateral: Lateral;
  readonly groundOffset: number;
}

export interface SectionDocument {
  readonly id: string;
  readonly pis: readonly PlanPI[];
  readonly boundaries: readonly BoundaryDocument[];
  readonly strips: readonly StripElementDocument[];
  readonly sprites: readonly RepeatElement<SpriteDocument>[];
  readonly height: readonly { readonly at: CoursePosition; readonly y: number; readonly curveLength: number }[];
  readonly carriageways: readonly CarriagewayDocument[];
  readonly assetIds: readonly string[];
  readonly environments: readonly RepeatElement<EnvironmentDocument>[] | null;
  readonly fork: null | { readonly lock: CoursePosition; readonly closure: CoursePosition };
}

export interface CourseLandmarkDocument {
  readonly id: string;
  readonly sectionId: string;
  readonly carriagewayId: string;
  readonly at: CoursePosition;
}

interface CourseRulesDocument {
  readonly grid: readonly { readonly at: CoursePosition; readonly lateral: Lateral }[];
  readonly checkpoints: readonly CourseLandmarkDocument[];
  readonly finishes: readonly CourseLandmarkDocument[];
  readonly maxLaps: number;
  readonly classic: {
    readonly vehicleId: string;
    readonly rivalCount: number;
    readonly lapCount: number;
    readonly timeMargin: number;
  };
}

export interface CourseDocument {
  readonly format: 'superoutride.course';
  readonly version: typeof COURSE_DOCUMENT_VERSION;
  readonly id: string;
  readonly type: 'LINEAR' | 'BRANCH' | 'CIRCUIT';
  readonly entrySectionId: string;
  readonly rules: CourseRulesDocument | null;
  readonly sections: readonly SectionDocument[];
  readonly links: readonly LinkDocument[];
  readonly assets: readonly CourseAssetReference[];
}

function fail(code: ConstructorParameters<typeof CourseInputError>[0], path: string, message: string): never {
  throw new CourseInputError(code, path, message);
}

function record(value: unknown, path: string, fields: readonly string[]): Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  ) {
    fail('invalid_shape', path, 'Expected a plain JSON object');
  }
  const result = value as Record<string, unknown>;
  for (const key of Object.keys(result)) {
    if (!fields.includes(key)) {
      const escaped = key.replaceAll('~', '~0').replaceAll('/', '~1');
      fail(
        'unsupported_feature',
        `${path}/${escaped}`,
        `Field ${key} is not supported by CourseDocument v${COURSE_DOCUMENT_VERSION}`,
      );
    }
  }
  for (const key of fields) {
    if (!Object.hasOwn(result, key)) fail('invalid_shape', `${path}/${key}`, `Missing required field ${key}`);
  }
  return result;
}

function id(value: unknown, path: string): string {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim())
    fail('invalid_shape', path, 'Expected a nonempty stable ID without surrounding whitespace');
  if (value.length > COURSE_DOCUMENT_LIMITS.idCodeUnits)
    fail('resource_limit', path, `Stable ID exceeds ${COURSE_DOCUMENT_LIMITS.idCodeUnits} code units`);
  return value;
}

function number(value: unknown, path: string, min: number, max: number, exclusiveMin = false): number {
  if (typeof value !== 'number') fail('invalid_shape', path, 'Expected a number');
  if (!Number.isFinite(value) || value > max || (exclusiveMin ? value <= min : value < min)) {
    fail('invalid_numeric_domain', path, `Expected a finite number in ${exclusiveMin ? '(' : '['}${min}, ${max}]`);
  }
  return Object.is(value, -0) ? 0 : value;
}

function literal<T extends string | number>(
  value: unknown,
  expected: T,
  path: string,
  code: 'unsupported_version' | 'unsupported_format',
): T {
  if (value !== expected) fail(code, path, `Expected ${JSON.stringify(expected)}`);
  return expected;
}

function array<T>(value: unknown, path: string, max: number, read: (value: unknown, path: string) => T): readonly T[] {
  if (!Array.isArray(value)) fail('invalid_shape', path, 'Expected an array');
  if (value.length > max) fail('resource_limit', path, `At most ${max} entries are admitted`);
  return Object.freeze(Array.from(value, (item, index) => read(item, `${path}/${index}`)));
}

function identified<T extends { readonly id: string }>(
  value: unknown,
  path: string,
  max: number,
  read: (value: unknown, path: string) => T,
): readonly T[] {
  const seen = new Set<string>();
  return array(value, path, max, (item, at) => {
    const result = read(item, at);
    if (seen.has(result.id)) fail('duplicate_id', `${at}/id`, `Duplicate ID ${JSON.stringify(result.id)} in ${path}`);
    seen.add(result.id);
    return result;
  });
}

function position(value: unknown, path: string): CoursePosition {
  const v = record(value, path, ['pi', 'offset']);
  return Object.freeze({
    pi: id(v.pi, `${path}/pi`),
    offset: number(
      v.offset,
      `${path}/offset`,
      -COURSE_DOCUMENT_LIMITS.lengthMeters,
      COURSE_DOCUMENT_LIMITS.lengthMeters,
    ),
  });
}

function planPI(value: unknown, path: string): PlanPI {
  const v = record(value, path, ['id', 'x', 'z', 'radius']);
  const bound = COURSE_DOCUMENT_LIMITS.coordinateMeters;
  return Object.freeze({
    id: id(v.id, `${path}/id`),
    x: number(v.x, `${path}/x`, -bound, bound),
    z: number(v.z, `${path}/z`, -bound, bound),
    radius: number(v.radius, `${path}/radius`, 0, COURSE_DOCUMENT_LIMITS.lengthMeters),
  });
}

function lateral(value: unknown, path: string): Lateral {
  const bound = COURSE_DOCUMENT_LIMITS.lateralMeters;
  if (typeof value === 'number') return number(value, path, -bound, bound);
  const v = record(value, path, ['boundary', 'offset']);
  return Object.freeze({
    boundary: id(v.boundary, `${path}/boundary`),
    offset: number(v.offset, `${path}/offset`, -bound, bound),
  });
}

function boundary(value: unknown, path: string): BoundaryDocument {
  const v = record(value, path, ['id', 'knots']);
  return Object.freeze({
    id: id(v.id, `${path}/id`),
    knots: array(v.knots, `${path}/knots`, COURSE_DOCUMENT_LIMITS.knots, (item, at) => {
      const knot = record(item, at, ['at', 'lateral']);
      return Object.freeze({
        at: position(knot.at, `${at}/at`),
        lateral: lateral(knot.lateral, `${at}/lateral`),
      });
    }),
  });
}

function carriageway(value: unknown, path: string): CarriagewayDocument {
  const v = record(value, path, ['id', 'left', 'right']);
  return Object.freeze({
    id: id(v.id, `${path}/id`),
    left: id(v.left, `${path}/left`),
    right: id(v.right, `${path}/right`),
  });
}

function rgb555(value: unknown, path: string): number {
  const color = number(value, path, 0, 32767);
  if (!Number.isInteger(color)) fail('invalid_numeric_domain', path, 'RGB555 must be an integer');
  return color;
}

function repeated<T>(
  value: unknown,
  path: string,
  limit: number,
  leaf: (value: unknown, path: string) => T,
  depth = 0,
): RepeatElement<T> {
  if (depth > COURSE_DOCUMENT_LIMITS.repeatDepth)
    fail('resource_limit', path, `Repeat nesting exceeds ${COURSE_DOCUMENT_LIMITS.repeatDepth} levels`);
  if (value && typeof value === 'object' && (value as Record<string, unknown>).kind === 'repeat') {
    const v = record(value, path, ['kind', 'every', 'count', 'elements']);
    const count = number(v.count, `${path}/count`, 1, COURSE_DOCUMENT_LIMITS.repeatCount);
    if (!Number.isInteger(count)) fail('invalid_numeric_domain', `${path}/count`, 'Repeat count must be an integer');
    return Object.freeze({
      kind: 'repeat',
      every: number(v.every, `${path}/every`, 0, COURSE_DOCUMENT_LIMITS.lengthMeters, true),
      count,
      elements: array(v.elements, `${path}/elements`, limit, (item, at) => repeated(item, at, limit, leaf, depth + 1)),
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
    number(value, at, 0, COURSE_DOCUMENT_LIMITS.lengthMeters, positive);
  if (kind === 'strip') {
    const v = record(value, path, ['kind', 'color', 'material', 'knots']);
    return Object.freeze({
      kind,
      color: v.color === null || v.color === 'transparent' ? v.color : rgb555(v.color, `${path}/color`),
      material: v.material === null ? null : id(v.material, `${path}/material`),
      knots: array(v.knots, `${path}/knots`, COURSE_DOCUMENT_LIMITS.knots, (item, at) => {
        const knot = record(item, at, ['at', 'left', 'right']);
        return Object.freeze({
          at: position(knot.at, `${at}/at`),
          left: knot.left === null ? null : lateral(knot.left, `${at}/left`),
          right: knot.right === null ? null : lateral(knot.right, `${at}/right`),
        });
      }),
    });
  }
  if (kind === 'arrow') {
    const v = record(value, path, ['kind', 'at', 'lateral', 'width', 'length', 'direction', 'color']);
    if (v.direction !== 'forward' && v.direction !== 'left' && v.direction !== 'right')
      fail('invalid_shape', `${path}/direction`, 'Arrow direction is forward, left or right');
    return Object.freeze({
      kind,
      at: position(v.at, `${path}/at`),
      lateral: lateral(v.lateral, `${path}/lateral`),
      width: metre(v.width, `${path}/width`, true),
      length: metre(v.length, `${path}/length`, true),
      direction: v.direction,
      color: rgb555(v.color, `${path}/color`),
    });
  }
  if (kind === 'text') {
    const v = record(value, path, ['kind', 'at', 'lateral', 'text', 'height', 'color']);
    if (
      typeof v.text !== 'string' ||
      !/^[A-Z0-9 ]+$/.test(v.text) ||
      v.text.length > COURSE_DOCUMENT_LIMITS.textCodeUnits
    )
      fail(
        'invalid_shape',
        `${path}/text`,
        `Strip text supports 1–${COURSE_DOCUMENT_LIMITS.textCodeUnits} uppercase ASCII letters, digits or spaces`,
      );
    return Object.freeze({
      kind,
      at: position(v.at, `${path}/at`),
      lateral: lateral(v.lateral, `${path}/lateral`),
      text: v.text,
      height: metre(v.height, `${path}/height`, true),
      color: rgb555(v.color, `${path}/color`),
    });
  }
  if (kind === 'curb') {
    const v = record(value, path, ['kind', 'start', 'end', 'left', 'right', 'stripe', 'colors']);
    const colors = array(v.colors, `${path}/colors`, 2, rgb555);
    if (colors.length !== 2) fail('invalid_shape', `${path}/colors`, 'A curb needs two RGB555 colors');
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
  return fail('unsupported_feature', `${path}/kind`, 'Unknown Strip authoring construct');
}

function environment(value: unknown, path: string): EnvironmentDocument {
  const e = record(value, path, ['at', 'name', 'background']);
  const b = record(e.background, `${path}/background`, ['assetId', 'horizonY', 'yawOrigin']);
  return Object.freeze({
    at: position(e.at, `${path}/at`),
    name: id(e.name, `${path}/name`),
    background: Object.freeze({
      assetId: id(b.assetId, `${path}/background/assetId`),
      horizonY: number(b.horizonY, `${path}/background/horizonY`, 0, Number.MAX_SAFE_INTEGER),
      yawOrigin: number(b.yawOrigin, `${path}/background/yawOrigin`, -360, 360),
    }),
  });
}
function sprite(value: unknown, path: string): SpriteDocument {
  const s = record(value, path, [
    'kind',
    'image',
    'palette',
    'at',
    'lateral',
    'groundOffset',
    'unselectedCarriagewayId',
  ]);
  if (s.kind !== 'sprite') fail('unsupported_feature', `${path}/kind`, 'Expected sprite');
  const palette = s.palette === null ? null : array(s.palette, `${path}/palette`, 16, rgb555);
  if (palette !== null && palette.length !== 16)
    fail('invalid_shape', `${path}/palette`, 'Expected 16 indexed palette slots');
  return Object.freeze({
    kind: 'sprite',
    image: id(s.image, `${path}/image`),
    palette,
    at: position(s.at, `${path}/at`),
    lateral: lateral(s.lateral, `${path}/lateral`),
    groundOffset: number(
      s.groundOffset,
      `${path}/groundOffset`,
      -COURSE_DOCUMENT_LIMITS.heightMeters,
      COURSE_DOCUMENT_LIMITS.heightMeters,
    ),
    unselectedCarriagewayId:
      s.unselectedCarriagewayId === null ? null : id(s.unselectedCarriagewayId, `${path}/unselectedCarriagewayId`),
  });
}
function environments(value: unknown, path: string): SectionDocument['environments'] {
  if (value === null) return null;
  return array(value, path, COURSE_DOCUMENT_LIMITS.environmentKnots, (item, at) =>
    repeated(item, at, COURSE_DOCUMENT_LIMITS.environmentKnots, environment),
  );
}

function section(value: unknown, path: string): SectionDocument {
  const v = record(value, path, [
    'id',
    'pis',
    'boundaries',
    'strips',
    'sprites',
    'height',
    'carriageways',
    'assetIds',
    'environments',
    'fork',
  ]);
  const fork = v.fork === null ? null : record(v.fork, `${path}/fork`, ['lock', 'closure']);
  return Object.freeze({
    id: id(v.id, `${path}/id`),
    pis: identified(v.pis, `${path}/pis`, COURSE_DOCUMENT_LIMITS.pis, planPI),
    boundaries: identified(v.boundaries, `${path}/boundaries`, COURSE_DOCUMENT_LIMITS.boundaries, boundary),
    strips: array(v.strips, `${path}/strips`, COURSE_DOCUMENT_LIMITS.stripElements, (item, at) =>
      stripElement(item, at),
    ),
    sprites: array(v.sprites, `${path}/sprites`, COURSE_DOCUMENT_LIMITS.spriteElements, (item, at) =>
      repeated(item, at, COURSE_DOCUMENT_LIMITS.spriteElements, sprite),
    ),
    height: array(v.height, `${path}/height`, COURSE_DOCUMENT_LIMITS.heightNodes, (item, at) => {
      const node = record(item, at, ['at', 'y', 'curveLength']);
      return Object.freeze({
        at: position(node.at, `${at}/at`),
        y: number(node.y, `${at}/y`, -COURSE_DOCUMENT_LIMITS.heightMeters, COURSE_DOCUMENT_LIMITS.heightMeters),
        curveLength: number(
          node.curveLength,
          `${at}/curveLength`,
          -COURSE_DOCUMENT_LIMITS.lengthMeters,
          COURSE_DOCUMENT_LIMITS.lengthMeters,
        ),
      });
    }),
    carriageways: identified(v.carriageways, `${path}/carriageways`, COURSE_DOCUMENT_LIMITS.carriageways, carriageway),
    assetIds: array(v.assetIds, `${path}/assetIds`, COURSE_DOCUMENT_LIMITS.sectionAssets, id),
    environments: environments(v.environments, `${path}/environments`),
    fork:
      fork === null
        ? null
        : Object.freeze({
            lock: position(fork.lock, `${path}/fork/lock`),
            closure: position(fork.closure, `${path}/fork/closure`),
          }),
  });
}

function rules(value: unknown, path: string): CourseRulesDocument | null {
  if (value === null) return null;
  const v = record(value, path, ['grid', 'checkpoints', 'finishes', 'maxLaps', 'classic']);
  const c = record(v.classic, path + '/classic', ['vehicleId', 'rivalCount', 'lapCount', 'timeMargin']);
  const integer = (value: unknown, at: string, min: number, max: number) => {
    const n = number(value, at, min, max);
    if (!Number.isInteger(n)) fail('invalid_numeric_domain', at, 'Expected an integer');
    return n;
  };
  const landmark = (value: unknown, at: string): CourseLandmarkDocument => {
    const g = record(value, at, ['id', 'sectionId', 'carriagewayId', 'at']);
    return Object.freeze({
      id: id(g.id, at + '/id'),
      sectionId: id(g.sectionId, at + '/sectionId'),
      carriagewayId: id(g.carriagewayId, at + '/carriagewayId'),
      at: position(g.at, at + '/at'),
    });
  };
  return Object.freeze({
    grid: array(v.grid, path + '/grid', COURSE_DOCUMENT_LIMITS.grid, (value, at) => {
      const slot = record(value, at, ['at', 'lateral']);
      return Object.freeze({ at: position(slot.at, at + '/at'), lateral: lateral(slot.lateral, at + '/lateral') });
    }),
    checkpoints: identified(v.checkpoints, path + '/checkpoints', COURSE_DOCUMENT_LIMITS.checkpoints, landmark),
    finishes: identified(v.finishes, path + '/finishes', COURSE_DOCUMENT_LIMITS.finishes, landmark),
    maxLaps: integer(v.maxLaps, path + '/maxLaps', 1, SESSION_RULE_LIMITS.laps),
    classic: Object.freeze({
      vehicleId: id(c.vehicleId, path + '/classic/vehicleId'),
      rivalCount: integer(c.rivalCount, path + '/classic/rivalCount', 0, SESSION_RULE_LIMITS.rivals),
      lapCount: integer(c.lapCount, path + '/classic/lapCount', 1, SESSION_RULE_LIMITS.laps),
      timeMargin: number(c.timeMargin, path + '/classic/timeMargin', 0, SESSION_RULE_LIMITS.timeMargin, true),
    }),
  });
}

/** Own and normalize schema-valid authoring, including semantically incomplete drafts. */
export function readCourseDocument(input: unknown): CourseResult<CourseDocument> {
  try {
    // Reject an identified older schema before requiring the current schema's fields.
    if (input && typeof input === 'object' && Object.hasOwn(input, 'version'))
      literal((input as Record<string, unknown>).version, COURSE_DOCUMENT_VERSION, '/version', 'unsupported_version');
    const v = record(input, '', [
      'rules',
      'format',
      'version',
      'id',
      'type',
      'entrySectionId',
      'sections',
      'links',
      'assets',
    ]);
    const format = literal(v.format, 'superoutride.course', '/format', 'unsupported_format');
    const version = literal(v.version, COURSE_DOCUMENT_VERSION, '/version', 'unsupported_version');
    if (v.type !== 'LINEAR' && v.type !== 'BRANCH' && v.type !== 'CIRCUIT')
      fail('unsupported_feature', '/type', 'Supported topology types are LINEAR, BRANCH and CIRCUIT');
    const result: CourseDocument = Object.freeze({
      format,
      version,
      id: id(v.id, '/id'),
      type: v.type,
      entrySectionId: id(v.entrySectionId, '/entrySectionId'),
      rules: rules(v.rules, '/rules'),
      sections: identified(v.sections, '/sections', COURSE_DOCUMENT_LIMITS.sections, section),
      links: identified(v.links, '/links', COURSE_DOCUMENT_LIMITS.links, (item, at) => {
        const link = record(item, at, ['id', 'from', 'to']);
        const from = record(link.from, `${at}/from`, ['sectionId', 'carriagewayId']);
        const to = record(link.to, `${at}/to`, ['sectionId']);
        return Object.freeze({
          id: id(link.id, `${at}/id`),
          from: Object.freeze({
            sectionId: id(from.sectionId, `${at}/from/sectionId`),
            carriagewayId: id(from.carriagewayId, `${at}/from/carriagewayId`),
          }),
          to: Object.freeze({ sectionId: id(to.sectionId, `${at}/to/sectionId`) }),
        });
      }),
      assets: identified(v.assets, '/assets', COURSE_DOCUMENT_LIMITS.assets, (item, at) => {
        const a = record(item, at, ['id', 'format', 'version', 'sha256']);
        if (typeof a.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(a.sha256))
          fail('invalid_shape', `${at}/sha256`, 'Expected lowercase SHA-256 of saved sprite-lod bytes');
        return Object.freeze({
          id: id(a.id, `${at}/id`),
          format:
            a.format === 'superoutride.tile-background'
              ? a.format
              : literal(a.format, 'superoutride.sprite-lod', `${at}/format`, 'unsupported_format'),
          version:
            a.format === 'superoutride.tile-background'
              ? literal(a.version, 1, `${at}/version`, 'unsupported_version')
              : literal(a.version, 2, `${at}/version`, 'unsupported_version'),
          sha256: a.sha256,
        });
      }),
    });
    if (new TextEncoder().encode(JSON.stringify(result)).byteLength > COURSE_DOCUMENT_LIMITS.jsonBytes)
      fail('resource_limit', '', `Document exceeds ${COURSE_DOCUMENT_LIMITS.jsonBytes} UTF-8 bytes`);
    return courseSuccess(result);
  } catch (error) {
    if (error instanceof CourseInputError) return courseFailure(error);
    throw error;
  }
}
