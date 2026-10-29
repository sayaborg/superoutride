import { createStripBudget, type StripBudget } from '../strip-budget.js';
import { courseElementLeaves, shiftedCoursePosition } from '../course-repeat.js';
import { compileStripMaterial, validateMaterialContinuity } from '../strip-material.js';
import { clearanceClips } from '../plan-clearance.js';
import type { PlanPath } from '../geometry/plan-path.js';
import type { SurfaceMaterial, SurfaceMaterialCatalog } from '../surface-material.js';
import type { CompiledCoursePosition } from '../course-geometry.js';
import { courseLineLookup, resolveLateralInterval, resolveCourseLateral } from './course-lateral.js';
import type { CourseLines } from '../course-lanes.js';
import type {
  StripColorPair,
  StripElementDocument,
  CoursePosition,
  Lateral,
  WallStripElementDocument,
} from '../course-document.js';
import { requireCourse } from '../course-diagnostics.js';
import { STRIP_ACTIVE_LIMIT, compileStripGround } from '../strip-ground.js';
import type { WorkSlices } from '../../core/work-slices.js';
import { stripEdgeAt, type StripPiece, type StripEdgeLine } from '../strip-slabs.js';

/** A color pair's expanded piece: its stations and the Strip it expands. */
export interface StripColorPairExtent {
  readonly start: number;
  readonly end: number;
  readonly path: string;
}

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

/** Road Strip constructs, or a wall's Strips, whose knots give bottom and top as the left and right edges. */
export type CompiledStripElements = readonly StripElementDocument[] | readonly WallStripElementDocument[];

/**
 * Expand saved constructs in list order, pausing between expanded elements when `slices` is due; output is a disposable
 * compiler product.
 */
async function expandCourseStrips(
  elements: CompiledStripElements,
  length: number,
  path: string,
  resolve: (at: CoursePosition, path: string) => CompiledCoursePosition,
  lines: CourseLines,
  materialCatalog: SurfaceMaterialCatalog,
  budget: StripBudget,
  slices: WorkSlices,
) {
  // The colors as the Strips end any change (`to`), and as they begin it (`from`) where a color pair differs.
  const pieces: StripPiece[] = [],
    fromPieces: StripPiece[] = [];
  // Each color pair's expanded extent, for the appearance to hold to one change of sky.
  const pairs: StripColorPairExtent[] = [];
  const materialPieces: StripPiece<SurfaceMaterial | null>[] = [];
  const line = (start: number, end: number, from: number, to = from): StripEdgeLine => ({ start, end, from, to });
  let sourcePath = path;
  const extents: { start: number; end: number }[] = [];
  const track = (shape: Omit<StripPiece, 'value'>) => {
    requireCourse(
      shape.start >= 0 && shape.end > shape.start && shape.end <= length,
      sourcePath,
      'Expanded Strip interval must lie inside its Section or wall',
      'invalid_strip',
    );
    const piece = { ...shape, value: null };
    requireCourse(
      [shape.start, shape.end].every((s) => stripEdgeAt(piece, 'left', s) <= stripEdgeAt(piece, 'right', s)),
      sourcePath,
      'Strip left edge cannot exceed its right edge',
      'invalid_strip',
    );
    budget.spend('stripPieces', 1, path, "The Section's expanded Strip pieces");
    extents.push(shape);
  };
  const add = (piece: StripPiece<number | null | StripColorPair>) => {
    track(piece);
    const value = piece.value;
    if (value !== null && typeof value === 'object') {
      pairs.push({ start: piece.start, end: piece.end, path: sourcePath });
      pieces.push(Object.freeze({ ...piece, value: value.to }));
      fromPieces.push(Object.freeze({ ...piece, value: value.from }));
      return;
    }
    const plain = Object.freeze({ ...piece, value });
    pieces.push(plain);
    fromPieces.push(plain);
  };
  const rectangle = (start: number, end: number, left: number, right: number, color: number) =>
    add({ start, end, left: line(start, end, left), right: line(start, end, right), value: color });
  const strip = (
    knots: readonly {
      s: number;
      left: Lateral | null;
      right: Lateral | null;
      path: (side: 'left' | 'right') => string;
    }[],
    color: number | 'transparent' | null | StripColorPair,
    material: string | null,
    at: string,
  ) => {
    requireCourse(knots.length >= 2, at, 'A Strip requires at least two knots', 'invalid_strip');
    requireCourse(color !== null || material !== null, at, 'A Strip must change color or material', 'invalid_strip');
    let value: SurfaceMaterial | null = null;
    if (material !== null) {
      const resolved = materialCatalog.get(material);
      requireCourse(resolved !== undefined, `${at}/material`, 'Unknown material', 'unresolved_reference');
      value = resolved;
    }
    for (const side of ['left', 'right'] as const) {
      requireCourse(
        knots.every((k) => (k[side] === null) === (knots[0]![side] === null)),
        at,
        'An open side must stay open throughout a Strip',
        'invalid_strip',
      );
      requireCourse(
        material === null || knots[0]![side] !== null,
        at,
        'Material-bearing Strips require finite edges',
        'invalid_strip',
      );
    }
    for (let i = 1; i < knots.length; i++) {
      const a = knots[i - 1]!,
        b = knots[i]!;
      requireCourse(
        b.s > a.s && a.s >= 0 && b.s <= length,
        at,
        'Resolved Strip knots must strictly increase inside their Section or wall',
        'invalid_strip',
      );
      const edge = (side: 'left' | 'right') =>
        a[side] === null
          ? null
          : resolveLateralInterval(a[side]!, b[side]!, a.s, b.s, courseLineLookup(lines), a.path(side), b.path(side));
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
          materialPieces.push({ ...shape, value });
        }
      }
    }
  };
  const expand = (
    element: Exclude<StripElementDocument, { kind: 'repeat' }> | Exclude<WallStripElementDocument, { kind: 'repeat' }>,
    offset: number,
    at: string,
    repeated: boolean,
  ) => {
    sourcePath = at;
    const position = shiftedCoursePosition(resolve, offset, length);
    const edgePath = (side: 'left' | 'right') => `${at}/${side}`;
    switch (element.kind) {
      case 'strip':
        if ('knots' in element) {
          strip(
            element.knots.map((k, i) => ({
              s: position(k.at, `${at}/knots/${i}/at`).s,
              left: k.bottom,
              right: k.top,
              path: (side) => `${at}/knots/${i}/${side === 'left' ? 'bottom' : 'top'}`,
            })),
            element.color,
            null,
            at,
          );
          break;
        }
        requireCourse(
          !repeated || element.material === null,
          at,
          'Repeated constructs are color-only',
          'invalid_strip',
        );
        strip(
          [
            { s: position(element.start, `${at}/start`).s, left: element.left, right: element.right, path: edgePath },
            { s: position(element.end, `${at}/end`).s, left: element.left, right: element.right, path: edgePath },
          ],
          element.color,
          element.material,
          at,
        );
        break;
      case 'text': {
        const station = position(element.at, `${at}/at`).s;
        const lateral = resolveCourseLateral(element.lateral, station, lines, `${at}/lateral`);
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
    }
  };
  for (const leaf of courseElementLeaves<Parameters<typeof expand>[0]>(elements, path, budget.work)) {
    if (slices.due()) await slices.pause();
    expand(leaf.element, leaf.offset, leaf.path, leaf.repeated);
  }
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
  return { pieces, fromPieces: pairs.length ? fromPieces : null, pairs, materials: materialPieces };
}

/** A wall's Strips: their color alone. */
export async function compileCourseStripColor(
  elements: CompiledStripElements,
  length: number,
  path: string,
  resolve: (at: CoursePosition, path: string) => CompiledCoursePosition,
  lines: CourseLines,
  materials: SurfaceMaterialCatalog,
  budget: StripBudget,
  slices: WorkSlices,
) {
  // A wall's Strips admit no color pair, so their colors are their pieces'.
  const { pieces } = await expandCourseStrips(elements, length, path, resolve, lines, materials, budget, slices);
  return compileStripGround(length, pieces, path, budget, slices);
}

/**
 * A Section's Strips: their color, and their material, its continuity checked as the document writes it, clipped where
 * the plan's chart would stop being one-to-one (`clearanceClips`).
 */
export async function compileCourseStrips(
  elements: CompiledStripElements,
  plan: PlanPath,
  path: string,
  resolve: (at: CoursePosition, path: string) => CompiledCoursePosition,
  lines: CourseLines,
  materials: SurfaceMaterialCatalog,
  budget: StripBudget,
  slices: WorkSlices,
) {
  const { length } = plan;
  const {
    pieces,
    fromPieces,
    pairs,
    materials: materialPieces,
  } = await expandCourseStrips(elements, length, path, resolve, lines, materials, budget, slices);
  const color = await compileStripGround(length, pieces, path, budget, slices);
  const colorFrom = fromPieces && (await compileStripGround(length, fromPieces, path, budget, slices));
  // The table as written is checked and read for its clips: the Section spends on the table it keeps.
  const written = await compileStripMaterial(length, materialPieces, path, createStripBudget(), slices);
  validateMaterialContinuity(written, path);
  const clips = clearanceClips(plan, written);
  if (!clips.length) budget.spend('stripSlabs', written.slabs.length, path, "The Section's resolved Strip slabs");
  return Object.freeze({
    color,
    colorFrom,
    pairs: Object.freeze(pairs),
    material: clips.length
      ? await compileStripMaterial(length, [...materialPieces, ...clips], path, budget, slices)
      : written,
  });
}
