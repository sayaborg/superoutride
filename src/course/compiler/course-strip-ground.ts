import { expandCourseElements, shiftedCoursePosition } from '../course-repeat.js';
import { COURSE_DOCUMENT_LIMITS } from '../course-limits.js';
import { compileStripMaterial } from '../strip-material.js';
import { SURFACE_MATERIALS, type SurfaceMaterial, type SurfaceType } from '../surface-material.js';
import type { CompiledBoundary } from '../course-boundaries.js';
import type { CompiledCoursePosition } from '../course-geometry.js';
import { resolveLateralInterval, resolveCourseLateral } from './course-lateral.js';
import type { StripElementDocument, CoursePosition, Lateral } from '../course-document.js';
import { CourseInputError, requireCourse } from '../course-diagnostics.js';
import { STRIP_ACTIVE_LIMIT, compileStripGround, type StripPiece, type StripEdgeLine } from '../strip-ground.js';

/** A small authored 5 by 7 block alphabet; rows expand to runs of Strips. */
const GLYPHS: Readonly<Record<string, string>> = Object.freeze({
  A: '01110/10001/10001/11111/10001/10001/10001',
  B: '11110/10001/10001/11110/10001/10001/11110',
  C: '01111/10000/10000/10000/10000/10000/01111',
  D: '11110/10001/10001/10001/10001/10001/11110',
  E: '11111/10000/10000/11110/10000/10000/11111',
  F: '11111/10000/10000/11110/10000/10000/10000',
  G: '01111/10000/10000/10111/10001/10001/01111',
  H: '10001/10001/10001/11111/10001/10001/10001',
  I: '11111/00100/00100/00100/00100/00100/11111',
  J: '00111/00010/00010/00010/10010/10010/01100',
  K: '10001/10010/10100/11000/10100/10010/10001',
  L: '10000/10000/10000/10000/10000/10000/11111',
  M: '10001/11011/10101/10101/10001/10001/10001',
  N: '10001/11001/11001/10101/10011/10011/10001',
  O: '01110/10001/10001/10001/10001/10001/01110',
  P: '11110/10001/10001/11110/10000/10000/10000',
  Q: '01110/10001/10001/10001/10101/10010/01101',
  R: '11110/10001/10001/11110/10100/10010/10001',
  S: '01111/10000/10000/01110/00001/00001/11110',
  T: '11111/00100/00100/00100/00100/00100/00100',
  U: '10001/10001/10001/10001/10001/10001/01110',
  V: '10001/10001/10001/10001/10001/01010/00100',
  W: '10001/10001/10001/10101/10101/10101/01010',
  X: '10001/10001/01010/00100/01010/10001/10001',
  Y: '10001/10001/01010/00100/00100/00100/00100',
  Z: '11111/00001/00010/00100/01000/10000/11111',
  '0': '01110/10001/10011/10101/11001/10001/01110',
  '1': '00100/01100/00100/00100/00100/00100/01110',
  '2': '01110/10001/00001/00010/00100/01000/11111',
  '3': '11110/00001/00001/01110/00001/00001/11110',
  '4': '00010/00110/01010/10010/11111/00010/00010',
  '5': '11111/10000/10000/11110/00001/00001/11110',
  '6': '01110/10000/10000/11110/10001/10001/01110',
  '7': '11111/00001/00010/00100/01000/01000/01000',
  '8': '01110/10001/10001/01110/10001/10001/01110',
  '9': '01110/10001/10001/01111/00001/00001/01110',
});

/** Expand saved constructs in list order; output is a disposable compiler product. */
function expandCourseStrips(
  elements: readonly StripElementDocument[],
  length: number,
  path: string,
  resolve: (at: CoursePosition, path: string) => CompiledCoursePosition,
  boundaries: ReadonlyMap<string, CompiledBoundary>,
) {
  const pieces: StripPiece[] = [];
  const materials: StripPiece<SurfaceMaterial | null>[] = [];
  const line = (start: number, end: number, from: number, to = from): StripEdgeLine => ({ start, end, from, to });
  const extents: { start: number; end: number }[] = [];
  const track = (shape: { start: number; end: number }) => {
    requireCourse(
      extents.length < COURSE_DOCUMENT_LIMITS.stripExpansion,
      path,
      `Expanded Strip pieces exceed ${COURSE_DOCUMENT_LIMITS.stripExpansion}`,
      'resource_limit',
    );
    extents.push(shape);
  };
  const add = (piece: StripPiece) => {
    if (piece.start < 0 || piece.end > length)
      throw new CourseInputError('invalid_profile', path, 'Expanded Strip extends outside its Section');
    track(piece);
    pieces.push(Object.freeze(piece));
  };
  const rectangle = (start: number, end: number, left: number, right: number, color: number) =>
    add({ start, end, left: line(start, end, left), right: line(start, end, right), value: color });
  const strip = (
    knots: readonly { s: number; left: Lateral | null; right: Lateral | null }[],
    color: number | 'transparent' | null,
    material: string | null,
    at: string,
  ) => {
    requireCourse(knots.length >= 2, at, 'A Strip requires at least two knots', 'invalid_profile');
    requireCourse(color !== null || material !== null, at, 'A Strip must change color or material', 'invalid_profile');
    let value: SurfaceMaterial | null = null;
    if (material !== null) {
      requireCourse(
        Object.hasOwn(SURFACE_MATERIALS, material),
        `${at}/material`,
        'Unknown material',
        'unresolved_reference',
      );
      value = SURFACE_MATERIALS[material as SurfaceType];
    }
    for (const side of ['left', 'right'] as const) {
      requireCourse(
        knots.every((k) => (k[side] === null) === (knots[0]![side] === null)),
        at,
        'An open side must stay open throughout a Strip',
        'invalid_profile',
      );
      requireCourse(
        material === null || knots[0]![side] !== null,
        at,
        'Material-bearing Strips require finite edges',
        'invalid_profile',
      );
    }
    for (let i = 1; i < knots.length; i++) {
      const a = knots[i - 1]!,
        b = knots[i]!;
      requireCourse(
        b.s > a.s && a.s >= 0 && b.s <= length,
        at,
        'Resolved Strip knots must strictly increase inside the Section',
        'invalid_profile',
      );
      const edge = (side: 'left' | 'right') =>
        a[side] === null
          ? null
          : resolveLateralInterval(
              a[side]!,
              b[side]!,
              a.s,
              b.s,
              (id) => boundaries.get(id),
              `${at}/knots/${i}/${side}`,
            );
      const left = edge('left'),
        right = edge('right');
      const stops = [
        ...new Set([a.s, b.s, ...[left, right].flatMap((e) => e?.vertices.map((k) => k.at.s) ?? [])]),
      ].sort((a, b) => a - b);
      for (let j = 1; j < stops.length; j++) {
        const start = stops[j - 1]!,
          end = stops[j]!;
        const select = (edge: typeof left) =>
          edge === null ? null : edge.lines[edge.vertices.findIndex((k) => k.at.s > start) - 1]!;
        const shape = { start, end, left: select(left), right: select(right) };
        if (color !== null) add({ ...shape, value: color === 'transparent' ? null : color });
        if (value !== null) {
          if (color === null) track(shape);
          materials.push({ ...shape, value });
        }
      }
    }
  };
  const expand = (
    element: Exclude<StripElementDocument, { kind: 'repeat' }>,
    offset: number,
    at: string,
    repeated: boolean,
  ) => {
    const position = shiftedCoursePosition(resolve, offset, length);
    switch (element.kind) {
      case 'strip':
        requireCourse(
          !repeated || element.material === null,
          at,
          'Repeated constructs are color-only',
          'invalid_profile',
        );
        strip(
          element.knots.map((k, i) => ({
            s: position(k.at, `${at}/knots/${i}/at`).s,
            left: k.left,
            right: k.right,
          })),
          element.color,
          element.material,
          at,
        );
        break;
      case 'curb': {
        const start = position(element.start, `${at}/start`).s;
        const end = position(element.end, `${at}/end`).s;
        requireCourse(end > start, at, 'Curb extent must be positive', 'invalid_profile');
        const count = Math.ceil((end - start) / element.stripe);
        requireCourse(
          count <= COURSE_DOCUMENT_LIMITS.stripExpansion,
          at,
          `Curb expansion exceeds ${COURSE_DOCUMENT_LIMITS.stripExpansion} stripes`,
          'resource_limit',
        );
        for (let i = 0; i < count; i++)
          strip(
            [
              { s: start + i * element.stripe, left: element.left, right: element.right },
              { s: Math.min(end, start + (i + 1) * element.stripe), left: element.left, right: element.right },
            ],
            element.colors[i % 2]!,
            null,
            at,
          );
        break;
      }
      case 'text': {
        const station = position(element.at, `${at}/at`).s;
        const lateral = resolveCourseLateral(element.lateral, station, boundaries, `${at}/lateral`);
        const cell = element.height / 7;
        for (let char = 0; char < element.text.length; char++) {
          if (element.text[char] === ' ') continue;
          const rows = GLYPHS[element.text[char]!]!.split('/');
          rows.forEach((row, y) => {
            for (let x = 0; x < 5; x++)
              if (row[x] === '1') {
                const start = x;
                while (x + 1 < 5 && row[x + 1] === '1') x++;
                rectangle(
                  station + (6 - y) * cell,
                  station + (7 - y) * cell,
                  lateral + (char * 6 + start) * cell,
                  lateral + (char * 6 + x + 1) * cell,
                  element.color,
                );
              }
          });
        }
        break;
      }
      case 'arrow': {
        const station = position(element.at, `${at}/at`).s;
        const lateral = resolveCourseLateral(element.lateral, station, boundaries, `${at}/lateral`);
        const vertices = [
          [-0.18, 0],
          [0.18, 0],
          [0.18, 0.55],
          [0.5, 0.55],
          [0, 1],
          [-0.5, 0.55],
          [-0.18, 0.55],
        ].map(([x, y]) => {
          const l = element.direction === 'forward' ? x! : element.direction === 'right' ? y! - 0.5 : 0.5 - y!;
          const s = element.direction === 'forward' ? y! : 0.5 + x!;
          return { l: lateral + l * element.width, s: station + s * element.length };
        });
        const stations = [...new Set(vertices.map((p) => p.s))].sort((a, b) => a - b);
        for (let i = 0; i + 1 < stations.length; i++) {
          const start = stations[i]!,
            end = stations[i + 1]!,
            middle = start + (end - start) / 2;
          const edges = vertices
            .map((a, j) => ({ a, b: vertices[(j + 1) % vertices.length]! }))
            .filter(({ a, b }) => middle > Math.min(a.s, b.s) && middle < Math.max(a.s, b.s));
          const atS = (edge: (typeof edges)[number], s: number) =>
            edge.a.l + ((edge.b.l - edge.a.l) * (s - edge.a.s)) / (edge.b.s - edge.a.s);
          edges.sort((a, b) => atS(a, middle) - atS(b, middle));
          for (let j = 0; j + 1 < edges.length; j += 2)
            add({
              start,
              end,
              left: line(start, end, atS(edges[j]!, start), atS(edges[j]!, end)),
              right: line(start, end, atS(edges[j + 1]!, start), atS(edges[j + 1]!, end)),
              value: element.color,
            });
        }
        break;
      }
    }
  };
  expandCourseElements(elements, path, COURSE_DOCUMENT_LIMITS.stripExpansion, expand);
  const events = extents
    .flatMap(({ start, end }) => [
      { s: start, delta: 1 },
      { s: end, delta: -1 },
    ])
    .sort((a, b) => a.s - b.s || a.delta - b.delta);
  let active = 0;
  for (const event of events) {
    active += event.delta;
    requireCourse(
      active <= STRIP_ACTIVE_LIMIT,
      path,
      `Active Strips exceed ${STRIP_ACTIVE_LIMIT} at s=${event.s}`,
      'resource_limit',
    );
  }
  return { pieces, materials };
}

export function compileCourseStrips(
  elements: readonly StripElementDocument[],
  length: number,
  path: string,
  resolve: (at: CoursePosition, path: string) => CompiledCoursePosition,
  boundaries: ReadonlyMap<string, CompiledBoundary>,
) {
  try {
    const { pieces, materials } = expandCourseStrips(elements, length, path, resolve, boundaries);
    return Object.freeze({
      color: compileStripGround(length, pieces),
      material: compileStripMaterial(length, materials),
    });
  } catch (error) {
    if (error instanceof RangeError)
      throw new CourseInputError(
        /exceed|limit/i.test(error.message) ? 'resource_limit' : 'invalid_profile',
        path,
        error.message,
      );
    throw error;
  }
}
