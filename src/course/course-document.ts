import { CourseInputError, courseFailure, courseSuccess, type CourseResult } from './course-diagnostics.js';

interface GeometryRecipeIdentity {
  readonly id: string;
  readonly version: number;
}

export type CourseAnchor =
  | { readonly kind: 'absolute'; readonly s: number }
  | { readonly kind: 'primitive'; readonly primitiveId: string; readonly fraction: number };

export type PlanPrimitive =
  | { readonly id: string; readonly kind: 'straight'; readonly length: number }
  | { readonly id: string; readonly kind: 'arc'; readonly radius: number; readonly turn: number };

interface BoundaryDocument {
  readonly id: string;
  readonly knots: readonly { readonly anchor: CourseAnchor; readonly l: number }[];
}

export interface BandDocument {
  readonly id: string;
  readonly start: CourseAnchor;
  readonly end: CourseAnchor;
  readonly leftBoundaryId: string;
  readonly rightBoundaryId: string;
  readonly role: 'pavement' | 'shoulder' | 'median';
}

interface CarriagewayDocument {
  readonly id: string;
  readonly bandIds: readonly string[];
}

interface PortDocument {
  readonly id: string;
  readonly kind: 'entry' | 'exit';
  readonly anchor: CourseAnchor;
  readonly carriagewayId: string;
}

interface LinkDocument {
  readonly id: string;
  readonly source: { readonly sectionId: string; readonly portId: string };
  readonly destination: { readonly sectionId: string; readonly portId: string };
  readonly overlap: { readonly behind: number; readonly ahead: number };
}

/** External content identity only; no I/O or claim of payload readiness at this boundary. */
export interface CourseAssetReference {
  readonly id: string;
  readonly format: 'superoutride.sprite-lod';
  readonly version: 1;
  readonly sha256: string;
}

export interface SectionDocument {
  readonly id: string;
  readonly start: { readonly x: number; readonly z: number; readonly heading: number };
  readonly guide: { readonly margin: number; readonly mMin: number };
  readonly primitives: readonly PlanPrimitive[];
  readonly boundaries: readonly BoundaryDocument[];
  readonly bands: readonly BandDocument[];
  readonly height: readonly { readonly anchor: CourseAnchor; readonly y: number }[];
  readonly physicalBindings: readonly {
    readonly bandId: string;
    readonly sections: readonly { readonly anchor: CourseAnchor; readonly material: string }[];
  }[];
  readonly carriageways: readonly CarriagewayDocument[];
  readonly ports: readonly PortDocument[];
  readonly assetIds: readonly string[];
}

export interface CourseDocument {
  readonly format: 'superoutride.course';
  readonly version: 3;
  readonly id: string;
  readonly units: { readonly length: 'm'; readonly angle: 'deg' };
  readonly geometryRecipe: GeometryRecipeIdentity;
  readonly type: 'LINEAR' | 'BRANCH' | 'CIRCUIT';
  readonly entrySectionId: string;
  readonly sections: readonly SectionDocument[];
  readonly links: readonly LinkDocument[];
  readonly assets: readonly CourseAssetReference[];
}

/** Admission limits, independent of eventual game/device content budgets. */
export const COURSE_DOCUMENT_LIMITS = Object.freeze({
  jsonBytes: 4 * 1024 * 1024,
  idCodeUnits: 128,
  sections: 16,
  primitives: 2048,
  boundaries: 32,
  knots: 256,
  bands: 32,
  carriageways: 16,
  ports: 4,
  links: 48,
  assets: 256,
  coordinateMeters: 1_000_000,
  lengthMeters: 100_000,
  lateralMeters: 1000,
  heightMeters: 10000,
  rasterSegments: 16384,
  bandCells: 16384,
  linkCells: 8192,
});

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
      fail('unsupported_feature', `${path}/${escaped}`, `Field ${key} is not supported by CourseDocument v3`);
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
    fail('resource_limit', path, 'Stable ID exceeds 128 code units');
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
  code: 'unsupported_version' | 'unsupported_format' | 'unsupported_units',
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

function anchor(value: unknown, path: string): CourseAnchor {
  const kind = value && typeof value === 'object' ? (value as Record<string, unknown>).kind : undefined;
  if (kind === 'absolute') {
    const v = record(value, path, ['kind', 's']);
    return Object.freeze({ kind, s: number(v.s, `${path}/s`, 0, COURSE_DOCUMENT_LIMITS.lengthMeters) });
  }
  if (kind === 'primitive') {
    const v = record(value, path, ['kind', 'primitiveId', 'fraction']);
    return Object.freeze({
      kind,
      primitiveId: id(v.primitiveId, `${path}/primitiveId`),
      fraction: number(v.fraction, `${path}/fraction`, 0, 1),
    });
  }
  return fail('unsupported_feature', `${path}/kind`, 'Supported anchors are absolute and primitive');
}

function primitive(value: unknown, path: string): PlanPrimitive {
  const kind = value && typeof value === 'object' ? (value as Record<string, unknown>).kind : undefined;
  if (kind === 'straight') {
    const v = record(value, path, ['id', 'kind', 'length']);
    return Object.freeze({
      id: id(v.id, `${path}/id`),
      kind,
      length: number(v.length, `${path}/length`, 0, COURSE_DOCUMENT_LIMITS.lengthMeters, true),
    });
  }
  if (kind === 'arc') {
    const v = record(value, path, ['id', 'kind', 'radius', 'turn']);
    const turn = number(v.turn, `${path}/turn`, -360, 360);
    if (turn === 0) fail('invalid_numeric_domain', `${path}/turn`, 'An arc must have a nonzero signed turn');
    return Object.freeze({
      id: id(v.id, `${path}/id`),
      kind,
      radius: number(v.radius, `${path}/radius`, 0, COURSE_DOCUMENT_LIMITS.lengthMeters, true),
      turn,
    });
  }
  return fail('unsupported_feature', `${path}/kind`, 'Supported plan primitives are straight and arc');
}

function boundary(value: unknown, path: string): BoundaryDocument {
  const v = record(value, path, ['id', 'knots']);
  return Object.freeze({
    id: id(v.id, `${path}/id`),
    knots: array(v.knots, `${path}/knots`, COURSE_DOCUMENT_LIMITS.knots, (item, at) => {
      const knot = record(item, at, ['anchor', 'l']);
      return Object.freeze({
        anchor: anchor(knot.anchor, `${at}/anchor`),
        l: number(knot.l, `${at}/l`, -COURSE_DOCUMENT_LIMITS.lateralMeters, COURSE_DOCUMENT_LIMITS.lateralMeters),
      });
    }),
  });
}

function band(value: unknown, path: string): BandDocument {
  const v = record(value, path, ['id', 'start', 'end', 'leftBoundaryId', 'rightBoundaryId', 'role']);
  if (v.role !== 'pavement' && v.role !== 'shoulder' && v.role !== 'median')
    fail('unsupported_feature', `${path}/role`, 'Supported roles are pavement, shoulder and median');
  return Object.freeze({
    id: id(v.id, `${path}/id`),
    start: anchor(v.start, `${path}/start`),
    end: anchor(v.end, `${path}/end`),
    leftBoundaryId: id(v.leftBoundaryId, `${path}/leftBoundaryId`),
    rightBoundaryId: id(v.rightBoundaryId, `${path}/rightBoundaryId`),
    role: v.role,
  });
}

function carriageway(value: unknown, path: string): CarriagewayDocument {
  const v = record(value, path, ['id', 'bandIds']);
  return Object.freeze({
    id: id(v.id, `${path}/id`),
    bandIds: array(v.bandIds, `${path}/bandIds`, COURSE_DOCUMENT_LIMITS.bands, id),
  });
}

function section(value: unknown, path: string): SectionDocument {
  const v = record(value, path, [
    'id',
    'start',
    'guide',
    'primitives',
    'boundaries',
    'bands',
    'height',
    'physicalBindings',
    'carriageways',
    'ports',
    'assetIds',
  ]);
  const start = record(v.start, `${path}/start`, ['x', 'z', 'heading']);
  const guide = record(v.guide, `${path}/guide`, ['margin', 'mMin']);
  const limit = COURSE_DOCUMENT_LIMITS.coordinateMeters;
  const mMin = number(guide.mMin, `${path}/guide/mMin`, 0, 1, true);
  if (mMin === 1) fail('invalid_numeric_domain', `${path}/guide/mMin`, 'Guide mMin must be less than one');
  return Object.freeze({
    id: id(v.id, `${path}/id`),
    start: Object.freeze({
      x: number(start.x, `${path}/start/x`, -limit, limit),
      z: number(start.z, `${path}/start/z`, -limit, limit),
      heading: number(start.heading, `${path}/start/heading`, -360, 360),
    }),
    guide: Object.freeze({
      margin: number(guide.margin, `${path}/guide/margin`, 0, COURSE_DOCUMENT_LIMITS.lateralMeters, true),
      mMin,
    }),
    primitives: identified(v.primitives, `${path}/primitives`, COURSE_DOCUMENT_LIMITS.primitives, primitive),
    boundaries: identified(v.boundaries, `${path}/boundaries`, COURSE_DOCUMENT_LIMITS.boundaries, boundary),
    bands: identified(v.bands, `${path}/bands`, COURSE_DOCUMENT_LIMITS.bands, band),
    height: array(v.height, `${path}/height`, COURSE_DOCUMENT_LIMITS.knots, (item, at) => {
      const node = record(item, at, ['anchor', 'y']);
      return Object.freeze({
        anchor: anchor(node.anchor, `${at}/anchor`),
        y: number(node.y, `${at}/y`, -COURSE_DOCUMENT_LIMITS.heightMeters, COURSE_DOCUMENT_LIMITS.heightMeters),
      });
    }),
    physicalBindings: array(
      v.physicalBindings,
      `${path}/physicalBindings`,
      COURSE_DOCUMENT_LIMITS.bands,
      (item, at) => {
        const binding = record(item, at, ['bandId', 'sections']);
        return Object.freeze({
          bandId: id(binding.bandId, `${at}/bandId`),
          sections: array(binding.sections, `${at}/sections`, COURSE_DOCUMENT_LIMITS.knots, (item, at) => {
            const section = record(item, at, ['anchor', 'material']);
            return Object.freeze({
              anchor: anchor(section.anchor, `${at}/anchor`),
              material: id(section.material, `${at}/material`),
            });
          }),
        });
      },
    ),
    carriageways: identified(v.carriageways, `${path}/carriageways`, COURSE_DOCUMENT_LIMITS.carriageways, carriageway),
    ports: identified(v.ports, `${path}/ports`, COURSE_DOCUMENT_LIMITS.ports, (item, at) => {
      const p = record(item, at, ['id', 'kind', 'anchor', 'carriagewayId']);
      if (p.kind !== 'entry' && p.kind !== 'exit')
        fail('unsupported_feature', `${at}/kind`, 'Port kind must be entry or exit');
      return Object.freeze({
        id: id(p.id, `${at}/id`),
        kind: p.kind,
        anchor: anchor(p.anchor, `${at}/anchor`),
        carriagewayId: id(p.carriagewayId, `${at}/carriagewayId`),
      });
    }),
    assetIds: array(v.assetIds, `${path}/assetIds`, COURSE_DOCUMENT_LIMITS.assets, id),
  });
}

/** Own and normalize schema-valid authoring, including semantically incomplete drafts. */
export function readCourseDocument(input: unknown): CourseResult<CourseDocument> {
  try {
    // Reject an identified older schema before requiring the current schema's fields.
    if (input && typeof input === 'object' && Object.hasOwn(input, 'version'))
      literal((input as Record<string, unknown>).version, 3, '/version', 'unsupported_version');
    const v = record(input, '', [
      'format',
      'version',
      'id',
      'units',
      'geometryRecipe',
      'type',
      'entrySectionId',
      'sections',
      'links',
      'assets',
    ]);
    const format = literal(v.format, 'superoutride.course', '/format', 'unsupported_format');
    const version = literal(v.version, 3, '/version', 'unsupported_version');
    const units = record(v.units, '/units', ['length', 'angle']);
    const recipe = record(v.geometryRecipe, '/geometryRecipe', ['id', 'version']);
    const recipeVersion = number(recipe.version, '/geometryRecipe/version', 1, 65535);
    if (!Number.isInteger(recipeVersion))
      fail('invalid_numeric_domain', '/geometryRecipe/version', 'Recipe version must be an integer');
    if (v.type !== 'LINEAR' && v.type !== 'BRANCH' && v.type !== 'CIRCUIT')
      fail('unsupported_feature', '/type', 'Supported topology types are LINEAR, BRANCH and CIRCUIT');
    const result: CourseDocument = Object.freeze({
      format,
      version,
      id: id(v.id, '/id'),
      units: Object.freeze({
        length: literal(units.length, 'm', '/units/length', 'unsupported_units'),
        angle: literal(units.angle, 'deg', '/units/angle', 'unsupported_units'),
      }),
      geometryRecipe: Object.freeze({ id: id(recipe.id, '/geometryRecipe/id'), version: recipeVersion }),
      type: v.type,
      entrySectionId: id(v.entrySectionId, '/entrySectionId'),
      sections: identified(v.sections, '/sections', COURSE_DOCUMENT_LIMITS.sections, section),
      links: identified(v.links, '/links', COURSE_DOCUMENT_LIMITS.links, (item, at) => {
        const link = record(item, at, ['id', 'source', 'destination', 'overlap']);
        const endpoint = (value: unknown, path: string) => {
          const p = record(value, path, ['sectionId', 'portId']);
          return Object.freeze({
            sectionId: id(p.sectionId, `${path}/sectionId`),
            portId: id(p.portId, `${path}/portId`),
          });
        };
        const overlap = record(link.overlap, `${at}/overlap`, ['behind', 'ahead']);
        return Object.freeze({
          id: id(link.id, `${at}/id`),
          source: endpoint(link.source, `${at}/source`),
          destination: endpoint(link.destination, `${at}/destination`),
          overlap: Object.freeze({
            behind: number(overlap.behind, `${at}/overlap/behind`, 0, COURSE_DOCUMENT_LIMITS.lengthMeters, true),
            ahead: number(overlap.ahead, `${at}/overlap/ahead`, 0, COURSE_DOCUMENT_LIMITS.lengthMeters, true),
          }),
        });
      }),
      assets: identified(v.assets, '/assets', COURSE_DOCUMENT_LIMITS.assets, (item, at) => {
        const a = record(item, at, ['id', 'format', 'version', 'sha256']);
        if (typeof a.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(a.sha256))
          fail('invalid_shape', `${at}/sha256`, 'Expected lowercase SHA-256 of saved sprite-lod bytes');
        return Object.freeze({
          id: id(a.id, `${at}/id`),
          format: literal(a.format, 'superoutride.sprite-lod', `${at}/format`, 'unsupported_format'),
          version: literal(a.version, 1, `${at}/version`, 'unsupported_version'),
          sha256: a.sha256,
        });
      }),
    });
    if (new TextEncoder().encode(JSON.stringify(result)).byteLength > COURSE_DOCUMENT_LIMITS.jsonBytes)
      fail('resource_limit', '', 'Document exceeds 4 MiB UTF-8');
    return courseSuccess(result);
  } catch (error) {
    if (error instanceof CourseInputError) return courseFailure(error);
    throw error;
  }
}

export function parseCourseDocument(text: string): CourseResult<CourseDocument> {
  if (typeof text !== 'string') throw new TypeError('CourseDocument JSON must be a string');
  if (
    text.length > COURSE_DOCUMENT_LIMITS.jsonBytes ||
    new TextEncoder().encode(text).byteLength > COURSE_DOCUMENT_LIMITS.jsonBytes
  ) {
    return courseFailure(new CourseInputError('resource_limit', '', 'Document exceeds 4 MiB UTF-8'));
  }
  let input: unknown;
  try {
    input = JSON.parse(text);
  } catch (error) {
    if (error instanceof SyntaxError) return courseFailure(new CourseInputError('parse_failure', '', error.message));
    throw error;
  }
  return readCourseDocument(input);
}

export function saveCourseDocument(input: unknown): CourseResult<string> {
  const result = readCourseDocument(input);
  return result.ok ? courseSuccess(JSON.stringify(result.value)) : result;
}
