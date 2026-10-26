/**
 * SUPER MONACO GP's circuits from its ROMs ([SUPER MONACO GP road data](../../docs/super-monaco-gp-road-data.md#super-monaco-gps-courses)):
 * each course's road path P laid as straights and arcs from the race's line by the plan from a point path, closed as its
 * points are, the road level, its lanes either side of P, its materials and limits from the barriers' band tables, the
 * road's surface and its marks as strips, every other object a board, its Sections, sky, checkpoints, finish and grid.
 */
import { requireInput } from '../course/authoring-io.js';
import { computedValue } from '../authoring/course-joints.js';
import { CAMERA_DEFINITION } from '../../src/view/camera-definition.js';
import { COURSE_DOCUMENT_VERSION } from '../../src/course/course-document.js';
import { linearToRgb555, rgb555LinearChannel } from '../../src/image/image-filter.js';
import type { RomSet } from './rom-set.js';
import { sectionProfile, type Profile } from './road-profile.js';
import { pointProfile } from './point-profile.js';
import { lensFactor, steepestGrade } from './screen-pieces.js';
import { instruction } from './program-words.js';
import { bakeSky, SKY_WIDTH } from './sky-baking.js';
import { leastLaneRadius } from '../../src/course/plan-clearance.js';
import { CoursePath } from './course-path.js';
import { pointPlan, onElement } from './point-plan.js';
import { COURSE_DOCUMENT_LIMITS } from '../../src/course/course-limits.js';
import {
  cutsByCount,
  domainCuts,
  laneCentre,
  micrometre,
  sectionStations,
  type WrittenElement,
  writtenPlan,
} from './section-writing.js';
import { ruleGrid, type GridPlace } from './grid-rule.js';
import { RUN_RULE_LIMITS } from '../../src/course/run-rules.js';
import {
  assembleSuperMonacoGpPrograms,
  assembleSuperMonacoGpSprites,
  assembleSuperMonacoGpTiles,
  type SuperMonacoGpPrograms,
} from './super-monaco-gp-rom.js';
import {
  EMPTY_GROUP,
  readCourseBands,
  readDescriptor,
  readGroup,
  readHeadings,
  readPath,
  readSceneryList,
  type Band,
  type SceneryObject,
} from './super-monaco-gp-road.js';
import { largestPixels, largestSize, readSpritePalette, readViewTable } from './super-monaco-gp-sprites.js';
import { VIEWED } from './super-monaco-gp-dump.js';
import {
  boardName,
  FLAG,
  pictureId,
  pixelUnits,
  superMonacoGpBoards,
  type BoardUse,
} from './super-monaco-gp-boards.js';
import { spriteTable } from './sprite-rules.js';
import { paletteName } from './pixel-grid.js';
import { SPRITE_SOURCE_TEXELS_PER_METER } from '../../src/image/sprite.js';
import { readRoadLayerColors, superMonacoGpSkyBands, uniformSkyBands } from './super-monaco-gp-backgrounds.js';

/** The conversion's version, recorded in the specification beside the courses it wrote. */
export const SUPER_MONACO_GP_CONVERSION_VERSION = 18;

/**
 * A step, metres: 96 units along the road, a unit 0.0349 / 9 m, as the clock (0.0349 s a tick) and the displayed km/h
 * (the camera moves 2.5 units a tick for each km/h) give it.
 */
export const STEP_METRES = (96 * 0.0349) / 9;
/** A lateral unit, metres: 1640 units between the barriers are K's 11 m (2026-10-26). */
export const UNIT = 11 / 1640;
/** The original's pixels are 14 wide to 15 tall: its vertical amounts grow by this. */
export const UNIT_DOWN = (UNIT * 15) / 14;
/**
 * The sub CPU's focal length, rows: its transform (S 0x3C5A–0x3E00) projects a camera-relative point across and up
 * alike by q = 0x80000 / (Z + 64), 512 pixels at the screen ([research notes](../../docs/research/super-monaco-gp.md),
 * Camera).
 */
const FOCAL_ROWS = 512;
/** The focal length, with the transform's dividend checked where it is written (`move.l #$80000, $4000(a6)`, S 0x3C72). */
function focalLength(sub: Uint8Array): number {
  instruction(sub, 0x3c72, [0x2d7c, 0x0008, 0x0000, 0x4000], "the transform's dividend");
  return FOCAL_ROWS;
}

/** The lap's line: every grid slot's lap count reaches its first lap at step 288. */
const LAP_LINE = 288;
/** A road path unit, metres: a step's 96 units are `STEP_METRES` (the scale along the road). */
export const PATH_UNIT = STEP_METRES / 96;
/** The road path's resolution, units: its points are integers. */
const PATH_RESOLUTION = 1;
/** The lanes, 512 units each, their centres at ±256 as the grid's. */
const LANE = 512 * UNIT;
const OFFSET = LANE / 2;
/**
 * The band tables' edges, units from P: a barrier's band covers to the barriers at 820 (the original hits at 700 plus
 * half a car, 105); an escape area's paving to the surface boards' edge at 992 and grass to its hit line, 1228 plus
 * half a car; the open band's paving to the side paving's outer edge.
 */
const BARRIER = 820;
const ESCAPE_PAVING = 992;
const ESCAPE = 1228 + 105;
const OPEN = 1720 + 992;
/** A band's edges move to the next band's over the 4 steps about their border. */
const BAND_RAMP = 2;
/** The surface boards, a step's flat boards across the road, 1984 units wide, and those that draw it. */
const SURFACE_BOARD = 0x0da4;
const SURFACE_HALF = 992;
const GRID_BOARD = 0x0dfe;
const START_BOARD = 0x1f4a;
export const SURFACE_FRAMES = Object.freeze(new Set([SURFACE_BOARD, GRID_BOARD, 0x0e1c, 0x0e3a, START_BOARD, 0x1f92]));
/** A flat board's pixel spans 8 units. */
const FLAT_PIXEL = 8;
/** The side paving: the surface board beside the road, 728–2712 units out. */
const SIDE_PAVING = { from: 1720 - 992, to: 1720 + 992 } as const;
/**
 * The centre line: a board's top row's columns 119–128, the line's ten pixels about the board's middle, drawn here 80
 * units wide and 2 steps long at its band's far end.
 */
const CENTRE_LINE = { row: 0, from: 119, to: 128, half: 40, steps: 2 } as const;
/**
 * The grid: the original's 24 slots 12 steps apart past the line, lane a for even slots and b for odd, slot s at
 * 576 − 12s, the original's 12(23 − s) moved on as its line moves them, 300 steps. Each slot's marks are the grid
 * board's rows.
 */
const GRID = { slots: 24, first: 576, spacing: 12 } as const;
const GRID_MARKS = Object.freeze([
  { row: 2, back: 0, from: 80, to: 896 },
  { row: 22, back: 4, from: 64, to: 808 },
] as const);
const MARK_STEPS = 0.5;
/** The start line: its boards' row 6, in blocks of bright (8–10) and dark (11–13) pixels, 2 steps before each board. */
const START_LINE = { row: 6, steps: 2, bright: [8, 10], dark: [11, 13] } as const;
/** The road layer's colors: the ground, and the dark of the tunnel's background, RGB555. */
const GROUND_COLOR = 0x32;
const TUNNEL_DARK = 0x0842;
/** The race's tunnel: its dark ground from its mouth to its exit's, its dark sky as the camera reaches 9054 to 10750. */
const TUNNEL = { ground: [9032, 10860], sky: [9054, 10750] } as const;
/** The skies' horizon row, the generic skies'. */
const SKY_HORIZON = 320;
/** At heading 0 the road vanishes at the sky's column 354 × 1504 / 1536 (the layers' left edge 354 of 1536). */
const SKY_AT_HEADING = (354 * SKY_WIDTH) / 1536;
/** The kinds of the objects that stand as boards: flat, upright, and turning with the angle. */
const BOARD_KINDS = Object.freeze(new Set([0x04, 0x08, VIEWED]));
/**
 * The kerbs: the objects turning through view table 0x050A, 4 steps apart, each a blue and a white stripe (its pixels
 * 1–6 and 7–12, the next kerb's palette swapping them), drawn as stripes.
 */
const KERBS = 0x050a;
const KERB_STEPS = 4;
const KERB_CLASSES = [
  [1, 6],
  [7, 12],
] as const;
/** A kerb stands on from the one before it within this many steps, alternating its palette. */
const KERB_GAP = 8;
/** An object's height h that stands on the ground. */
const GROUND = -50;
/**
 * The boards whose foot is below the ground: an upright one (kind 8, the far buildings) stands on the ground; one K's
 * table stands on the original's ground line (the h −80 group: the roadside buildings, stone walls and rock faces)
 * folds there, its slanted foot lying on the nearer ground; any other (the supports and the tunnel mouths' rocks) keeps
 * the original's height, the head where what it holds is, its part below the ground hidden by the nearer ground.
 */
const UPRIGHT = 0x08;
/** An object on a curve's inside stands only within this of the curve's centre's distance (metres). */
const INSIDE_MARGIN = 2;

const EPSILON = 1e-5;

/** A course of the original: its form's number, id, name, checkpoints' steps and Sections' names. */
const COURSES = Object.freeze([
  { course: 1, id: 'super-monaco-gp', name: 'SUPER MONACO GP', checkpoints: [4697, 9538] },
  { course: 0, id: 'super-monaco-gp-qualifying', name: 'MONACO QUALIFYING', checkpoints: [4697] },
] as const);
export type SuperMonacoGpCourse = (typeof COURSES)[number];

/** The skies, by name. */
export const SKIES = Object.freeze({ fine: 'smgp-sky', tunnel: 'smgp-tunnel-sky' } as const);

/** A placed object of the scenery list: its step, as the list's word, and its object. */
interface Spot {
  readonly step: number;
  readonly mirrored: boolean;
  readonly object: SceneryObject;
}

/** The course's objects in its list's order: word k's group's objects stand at step k (mod N). */
function spotsOf(sub: Uint8Array, scenery: number, steps: number): Spot[] {
  return readSceneryList(sub, scenery).flatMap(({ mirrored, group }, k) =>
    group === EMPTY_GROUP ? [] : readGroup(sub, group).map((object) => ({ step: k % steps, mirrored, object })),
  );
}

/** Whether an object is a flat board of the road's surface, drawn as strips. */
const isSurface = (o: SceneryObject) => o.kind === 0x04 && SURFACE_FRAMES.has(o.frames);
/** Whether an object is a kerb, drawn as stripes. */
const isKerb = (o: SceneryObject) => o.kind === VIEWED && o.frames === KERBS;

/** The linear-light mean of RGB555 colors. */
export function meanColor(colors: readonly number[]): number {
  const sum = [0, 0, 0];
  for (const c of colors)
    [(c >> 10) & 31, (c >> 5) & 31, c & 31].forEach((v, i) => (sum[i]! += rgb555LinearChannel(v)));
  return linearToRgb555(sum[0]! / colors.length, sum[1]! / colors.length, sum[2]! / colors.length);
}

/** Both circuits' documents and reports, their boards' images and their skies, from the ROM set. */
export function superMonacoGpCourses(set: RomSet) {
  const programs = assembleSuperMonacoGpPrograms(set);
  const words = assembleSuperMonacoGpSprites(set);
  const { main } = programs;
  const roadLayer = readRoadLayerColors(main).rgb555;
  // A flat board's picture, and its pixels' colors in a palette where `keep` holds.
  const pictures = new Map<number, ReturnType<typeof largestPixels>>();
  const picture = (frames: number) => {
    if (!pictures.has(frames)) pictures.set(frames, largestPixels(main, words, frames));
    return pictures.get(frames)!;
  };
  const colorsOf = (frames: number, palette: number, keep: (x: number, y: number, v: number) => boolean) => {
    const { width, pixels } = picture(frames);
    const rgb = readSpritePalette(main, palette).rgb555;
    const out: number[] = [];
    pixels.forEach((v, i) => {
      if (v > 0 && v < 15 && keep(i % width, Math.floor(i / width), v)) out.push(rgb[v - 1]!);
    });
    return out;
  };
  const marks = {
    surface: (palette: number) => meanColor(colorsOf(SURFACE_BOARD, palette, () => true)),
    centre: (palette: number) =>
      meanColor(
        colorsOf(
          SURFACE_BOARD,
          palette,
          (x, y) => y === CENTRE_LINE.row && x >= CENTRE_LINE.from && x <= CENTRE_LINE.to,
        ),
      ),
    // A grid mark: its row's pixels across the left slot's line, from −to to −from units.
    grid: (mark: (typeof GRID_MARKS)[number], palette: number) => {
      const middle = picture(GRID_BOARD).width / 2;
      const [a, b] = [middle - mark.to / FLAT_PIXEL, middle - mark.from / FLAT_PIXEL];
      return meanColor(colorsOf(GRID_BOARD, palette, (x, y) => y === mark.row && x >= a && x < b));
    },
    start: (palette: number) => startBlocks(picture(START_BOARD), readSpritePalette(main, palette).rgb555),
    // A kerb's two stripes: the mean colors of its view 0 picture's two classes of pixels.
    kerb: (palette: number) =>
      KERB_CLASSES.map(([a, b]) =>
        meanColor(colorsOf(readViewTable(programs.sub, KERBS)[0]!, palette, (_x, _y, v) => v >= a && v <= b)),
      ),
  };
  const laps = COURSES.map((course) =>
    superMonacoGpCourse(programs, course, {
      marks,
      ground: roadLayer[GROUND_COLOR]!,
      height: (frames: number) => largestSize(main, frames).height,
      width: (frames: number) => largestSize(main, frames).width,
    }),
  );
  // One factor for both laps, which share most of the road: the lens ratio within the grade limit.
  const factor = lensFactor(focalLength(programs.sub), Math.max(...laps.map((l) => l.steepest)));
  const courses = laps.map((l) => l.write(factor));
  const boards = superMonacoGpBoards(
    main,
    words,
    courses.flatMap((c) => c.uses.boards),
    UNIT,
  );
  // The skies: the fine set's background baked over its ramp, and the tunnel's dark.
  const skies = [
    { name: SKIES.fine, document: bakeSky(SKIES.fine, superMonacoGpSkyBands(main, assembleSuperMonacoGpTiles(set))) },
    { name: SKIES.tunnel, document: bakeSky(SKIES.tunnel, uniformSkyBands(TUNNEL_DARK)) },
  ];
  return { courses, boards, skies, factor };
}

/**
 * The start line's blocks across the road: row 6 of its board, runs of bright and dark pixels, each its lateral span
 * in units from P (the board's middle) and the linear-light mean of its pixels' colors.
 */
function startBlocks(picture: { width: number; pixels: Uint8Array }, rgb: readonly number[]) {
  const bright = (v: number) => v >= START_LINE.bright[0] && v <= START_LINE.bright[1];
  const dark = (v: number) => v >= START_LINE.dark[0] && v <= START_LINE.dark[1];
  const row = Array.from(picture.pixels.subarray(START_LINE.row * picture.width, (START_LINE.row + 1) * picture.width));
  const blocks: { from: number; to: number; color: number }[] = [];
  for (let x = 0; x < row.length;) {
    const v = row[x]!;
    if (!bright(v) && !dark(v)) {
      x++;
      continue;
    }
    let end = x;
    while (end < row.length && (bright(row[end]!) || dark(row[end]!)) && bright(row[end]!) === bright(v)) end++;
    blocks.push({
      from: (x - picture.width / 2) * FLAT_PIXEL,
      to: (end - picture.width / 2) * FLAT_PIXEL,
      color: meanColor(row.slice(x, end).map((p) => rgb[p - 1]!)),
    });
    x = end;
  }
  return blocks;
}

/** What a course is laid with beside its tables. */
interface CourseContext {
  readonly marks: {
    readonly surface: (palette: number) => number;
    readonly centre: (palette: number) => number;
    readonly grid: (mark: (typeof GRID_MARKS)[number], palette: number) => number;
    readonly start: (palette: number) => { from: number; to: number; color: number }[];
    readonly kerb: (palette: number) => number[];
  };
  readonly ground: number;
  /** A frame table's largest size's rows and columns. */
  readonly height: (frames: number) => number;
  readonly width: (frames: number) => number;
}

/** One circuit: its plan, Sections, strips, gates and skies. */
function superMonacoGpCourse(programs: SuperMonacoGpPrograms, course: SuperMonacoGpCourse, context: CourseContext) {
  const { main, sub } = programs;
  const descriptor = readDescriptor(sub, course.course);
  const headings = readHeadings(sub, descriptor.headings);
  const N = headings.length;
  /** A step of the original as a step of the lap, which begins at the line. */
  const lap = (step: number) => (((step - LAP_LINE) % N) + N) % N;
  const spots = spotsOf(sub, descriptor.scenery, N);

  // The materials' edges each side, units from P, by step of the lap: each band's, moving to the next's over the
  // 4 steps about their border.
  const bands = readCourseBands(main, course.course, N);
  const left = bandEdges(bands.left, lap, N),
    right = bandEdges(bands.right, lap, N);
  const borders = [...new Set([...left.borders, ...right.borders])];

  // The plan: the road path's points from the line round to it again, P by the plan from a point path, no turn tighter
  // than its lanes keep (a lane either side of P).
  const road = readPath(sub, descriptor.path, N);
  const points: [number, number][] = [[0, 0]];
  for (let q = 1; q < N; q++) {
    const k = (LAP_LINE + q - 1) % N;
    points.push([points[q - 1]![0] + road.dx[k]!, points[q - 1]![1] + road.dy[k]!]);
  }
  const least = leastLaneRadius(LANE) / PATH_UNIT;
  const plan = pointPlan(points, PATH_RESOLUTION, () => least);
  // P laid from the plan's elements, metres, and each lap step's station along it (fractional steps between).
  const line = new CoursePath(
    plan.elements.map((e, i) => ({
      start: plan.elements.slice(0, i).reduce((sum, x) => sum + x.length, 0) * PATH_UNIT,
      length: e.length * PATH_UNIT,
      turn: e.turn,
    })),
  );
  const stationAt = [...plan.stations, plan.length].map((s) => s * PATH_UNIT);
  const station = (q: number) => {
    const k = Math.min(N - 1, Math.max(0, Math.floor(q)));
    return stationAt[k]! + (q - k) * (stationAt[k + 1]! - stationAt[k]!);
  };

  // The Sections: one a sector between the checkpoints, cut where its road comes near itself and into the fewest parts
  // where its boards would pass 2048 (Original road data's Sections' cuts).
  const boards = spots
    .filter(({ object }) => !isSurface(object) && !isKerb(object))
    .map(({ step }) => lap(step))
    .sort((a, b) => a - b);
  const sectors = [0, ...course.checkpoints.map(lap), N];
  const gateMetres = sectors.map(station);
  // The lap step at `u` metres along P, the nearest whole one.
  const stepAt = (u: number) => {
    let [lo, hi] = [0, N];
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (station(mid) <= u) lo = mid;
      else hi = mid;
    }
    return u - station(lo) < station(hi) - u ? lo : hi;
  };
  const sections: { id: string; from: number; to: number }[] = [];
  for (let k = 0; k + 1 < sectors.length; k++) {
    const [from, to] = [sectors[k]!, sectors[k + 1]!];
    const passages = domainCuts(line, station(from), station(to), leastLaneRadius(LANE), gateMetres).map(stepAt);
    [from, ...passages].forEach((a, i) => {
      const [b, id] = [passages[i] ?? to, `sector-${k + 1}${i === 0 ? '' : `-${i + 1}`}`];
      const cuts = cutsByCount(
        boards.filter((q) => q >= a && q < b),
        COURSE_DOCUMENT_LIMITS.spriteElements,
      );
      if (!cuts.length) sections.push({ id, from: a, to: b });
      else
        [a, ...cuts].forEach((c, j) =>
          sections.push({ id: `${id}${String.fromCharCode(0x61 + j)}`, from: c, to: cuts[j] ?? b }),
        );
    });
  }

  // Each Section's plan as P has it, unrounded, so the lap closes as P does; its start's station the lengths before it.
  const written = sections.map((section) =>
    writtenPlan(line, { from: station(section.from), to: station(section.to) }, true),
  );
  const origins = written.reduce((o, w) => [...o, o.at(-1)! + w.reduce((sum, e) => sum + e.length, 0)], [0]);
  /** The station of step q of the lap: its Section's start's, and the metres along P from there. */
  const stationOf = (q: number) => {
    const s = Math.max(0, sections.filter((section) => section.from <= q).length - 1);
    return origins[s]! + station(q) - station(sections[s]!.from);
  };
  // The profile: the road path's heights from the line round to it again, its rises summed at the plan's scale, by the
  // profile from a point path at the path's resolution, broken at the Sections' cuts; at a factor, the heights and the
  // resolution times it, so that its runs are the same and it is the profile times the factor.
  const heights = [0];
  for (let q = 1; q < N; q++) heights.push(heights[q - 1]! + road.dz[(LAP_LINE + q - 1) % N]! * PATH_UNIT);
  const hillsAt = (factor: number) =>
    pointProfile(
      heights.map((_, q) => stationOf(q)),
      heights.map((h) => h * factor),
      origins.at(-1)!,
      PATH_RESOLUTION * PATH_UNIT * factor,
      origins.slice(1, -1),
    );
  const level = hillsAt(1);
  /** P's direction at step q, clockwise from the original's heading 0 (the path's y). */
  const thetaAt = (q: number) => {
    const u = station(q) / PATH_UNIT;
    const k = Math.max(
      0,
      plan.elements.findIndex((_, i) => plan.elements.slice(0, i + 1).reduce((sum, e) => sum + e.length, 0) > u),
    );
    const before = plan.elements.slice(0, k).reduce((sum, e) => sum + e.length, 0);
    const { t } = onElement(plan.elements[k]!, u - before);
    return Math.atan2(t[0], t[1]);
  };
  /** P's radius at step q, and whether it turns right there (Infinity on a straight). */
  const curveAt = (q: number) => {
    const u = station(q);
    const e = line.elements.find((x) => u >= x.start && u < x.start + x.length) ?? line.elements.at(-1)!;
    return { radius: e.turn === 0 ? Infinity : e.length / Math.abs(e.turn), right: e.turn < 0 };
  };

  // The surface boards' bands: each flat surface board across the road (x 0) colors the road from the board before it.
  const surface = spots
    .filter(({ object }) => object.kind === 0x04 && object.frames === SURFACE_BOARD && object.x === 0)
    .map(({ step, object }) => ({ q: lap(step) || N, palette: object.flags & 0xff }))
    .sort((a, b) => a.q - b.q);
  // The road's asphalt: each surface board and each of the grid's boards across the road (x 0), asphalt drawn with
  // the grid's lines, colors it from the board before it, the same colors one band; the lap closes, from the last
  // board to the line in the first's color. The bands must cover the lap.
  const grid = spots
    .filter(({ object }) => object.frames === GRID_BOARD && object.x === 0)
    .map(({ step, object }) => ({ q: lap(step) || N, palette: object.flags & 0xff }));
  const asphalt: { from: number; to: number; color: number }[] = [];
  const band = (from: number, to: number, color: number) => {
    const last = asphalt.at(-1);
    if (last && last.color === color) last.to = to;
    else asphalt.push({ from, to, color });
  };
  let previous = 0;
  for (const board of [...surface, ...grid].sort((a, b) => a.q - b.q)) {
    band(previous, board.q, context.marks.surface(board.palette));
    previous = board.q;
  }
  if (asphalt.length && previous < N) band(previous, N, asphalt[0]!.color);
  requireInput(
    asphalt.length > 0 &&
      asphalt[0]!.from === 0 &&
      asphalt.at(-1)!.to === N &&
      asphalt.every((b, i) => i === 0 || b.from === asphalt[i - 1]!.to),
    `/${course.id}/surface`,
    "The road's surface does not cover the lap",
  );
  const paving = spots
    .filter(({ object }) => object.kind === 0x04 && object.frames === SURFACE_BOARD && object.x !== 0)
    .map(({ step, mirrored, object }) => ({
      q: lap(step) || N,
      side: Math.sign(mirrored ? -object.x : object.x),
      palette: object.flags & 0xff,
    }))
    .sort((a, b) => a.q - b.q);
  const startBoards = spots
    .filter(({ object }) => object.kind === 0x04 && object.frames === START_BOARD)
    .map(({ step, object }) => ({ q: lap(step), palette: object.flags & 0xff }));
  const gridPalette = spots.find(({ object }) => object.frames === GRID_BOARD)!.object.flags & 0xff;

  // Every other object a board at its step's station, its lateral from P; on a curve's inside, one past the curve's
  // centre's distance less `INSIDE_MARGIN` is left out.
  const uses = { boards: [] as BoardUse[] };
  const table = spriteTable();
  // The kerbs: each at its step, its middle's lateral and width units from P.
  const kerbs = spots
    .filter(({ object }) => isKerb(object))
    .map(({ step, mirrored, object }) => ({
      q: lap(step),
      units: (mirrored ? -object.x : object.x) / 4,
      width: context.width(readViewTable(sub, KERBS)[0]!) * pixelUnits(object.b1),
      palette: object.flags & FLAG.palette,
    }))
    .sort((a, b) => a.units - b.units || a.q - b.q);
  const objects: ObjectSpot[] = [];
  const inside: { step: number; x: number; image: string }[] = [];
  for (const { step, mirrored, object } of spots) {
    if (isSurface(object) || isKerb(object)) continue;
    requireInput(BOARD_KINDS.has(object.kind), '/scenery', `An object of kind ${object.kind} is not a board`);
    const q = lap(step);
    const units = (mirrored ? -object.x : object.x) / 4;
    const palette = object.flags & FLAG.palette;
    const middle = (object.flags & FLAG.middle) !== 0;
    // A board shows its picture mirrored as its flags and the list's word, together, mirror it; one turning through a
    // view table shows its view 0, mirrored as its flags alone mirror it. One with its base point at its middle has its
    // bottom half its height below h.
    const viewed = object.kind === VIEWED;
    const frames = viewed ? readViewTable(sub, object.frames)[0]! : object.frames;
    const bottom = middle ? object.height - (context.height(frames) * pixelUnits(object.b1)) / 2 : object.height;
    const below = bottom < GROUND;
    requireInput(!below || !viewed, '/scenery', 'A board turning through views stands below the ground');
    const group = !below
      ? null
      : object.kind === UPRIGHT
        ? 'standing'
        : table.get(pictureId({ frames, b1: object.b1 }))?.base === 'groundLine'
          ? 'folded'
          : 'original';
    const use = {
      frames,
      b1: object.b1,
      mirrored: ((object.flags & FLAG.mirrored) !== 0) !== (!viewed && mirrored),
      flipped: (object.flags & FLAG.flipped) !== 0,
      palette,
      ...(group === 'folded' ? { fold: (GROUND - bottom) * UNIT_DOWN * SPRITE_SOURCE_TEXELS_PER_METER } : {}),
    };
    uses.boards.push(use);
    const image = boardName(use);
    const curve = curveAt(q);
    const lateralMetres = units * UNIT;
    if ((curve.right ? lateralMetres : -lateralMetres) > curve.radius - INSIDE_MARGIN) {
      inside.push({ step, x: units, image });
      continue;
    }
    // It stands on its bottom edge at the original's height, but a board below the ground as its group stands.
    const groundOffset = group === 'standing' || group === 'folded' ? 0 : (bottom - GROUND) * UNIT_DOWN;
    objects.push({ q, units, image, palette, groundOffset, ...(group ? { below: group } : {}) });
  }

  /** The course with its heights times `factor`. */
  const write = (factor: number) => {
    const hills = hillsAt(factor);
    if (hills.runs.length !== level.runs.length) throw new Error("The profile's runs changed with its factor");
    const documents = sections.map((section, s) =>
      sectionDocument({
        course,
        section,
        index: s,
        last: s === sections.length - 1,
        plan: written[s]!,
        origin: origins[s]!,
        stationOf,
        lap,
        N,
        theta0: thetaAt(section.from),
        edgeAt: (side: number, which: 'paving' | 'limit', q: number) => (side < 0 ? left : right).at(which, q),
        borders,
        surface,
        asphalt,
        paving,
        startBoards,
        gridPalette,
        objects: objects.filter(({ q }) => q >= section.from && q < section.to),
        kerbs,
        profile: hills.profile,
        context,
      }),
    );
    const links = sections.map((section, s) => {
      const next = sections[(s + 1) % sections.length]!;
      return { id: `${section.id}-to-${next.id}`, from: { section: section.id, lane: 'a' }, to: next.id };
    });
    return {
      course,
      document: {
        format: 'superoutride.course',
        version: COURSE_DOCUMENT_VERSION,
        name: course.name,
        entry: sections[0]!.id,
        maxLaps: 30,
        bearing: 0,
        sections: documents,
        links,
      },
      plan,
      written,
      hills,
      sections: sections.map((section, s) => ({
        ...section,
        steps: [section.from, section.to].map((q) => (q + LAP_LINE) % N),
        boards: boards.filter((q) => q >= section.from && q < section.to).length,
        origin: origins[s]!,
      })),
      stationOf,
      lap,
      /** The original's step of step q of the lap. */
      stepOf: (q: number) => (q + LAP_LINE) % N,
      N,
      spots,
      uses,
      objects,
      kerbs,
      inside,
    };
  };
  return { steepest: steepestGrade(level.profile), write };
}

/**
 * A board to place: its step of the lap, lateral units from P, image, palette, height above the road (metres) and,
 * where its foot is below the ground, its group.
 */
interface ObjectSpot {
  readonly q: number;
  readonly units: number;
  readonly image: string;
  readonly palette: number;
  readonly groundOffset: number;
  readonly below?: 'original' | 'folded' | 'standing';
}

/** A value moving linearly from `before` at `border − ramp` to `after` at `border + ramp`, at `q` between them. */
export const ramped = (before: number, after: number, border: number, ramp: number, q: number) =>
  before + ((after - before) * (q - (border - ramp))) / (2 * ramp);

/** A band's edges, units from P: its paving's and its materials' outer edge, the course's limit. */
interface Edges {
  readonly paving: number;
  readonly limit: number;
}

/** A band kind's edges: |t1| 2 an escape area, 0 open, any other (1 or 4) a barrier. */
function edgesOf(t1: number): Edges {
  const kind = Math.abs(t1);
  if (kind === 2) return { paving: ESCAPE_PAVING, limit: ESCAPE };
  if (kind === 0) return { paving: OPEN, limit: OPEN };
  return { paving: BARRIER, limit: BARRIER };
}

/**
 * A side's edges by step of the lap: its bands in lap order (each from the entry before it, the first from step 0),
 * runs of equal edges joined, and between two runs the edges moving linearly over the 4 steps about their border.
 */
function bandEdges(side: readonly Band[], lap: (step: number) => number, N: number) {
  const starts = side.map((band, i) => ({ start: lap(i === 0 ? 0 : side[i - 1]!.end), edges: edgesOf(band.t1) }));
  starts.sort((a, b) => a.start - b.start);
  const runs = starts.filter((r, i) => {
    const before = starts[(i - 1 + starts.length) % starts.length]!.edges;
    return starts.length === 1 || before.paving !== r.edges.paving || before.limit !== r.edges.limit;
  });
  const plain = (q: number) => {
    const w = ((q % N) + N) % N;
    return ([...runs].reverse().find((r) => r.start <= w) ?? runs.at(-1)!).edges;
  };
  const borders = runs.length > 1 ? runs.map((r) => r.start) : [];
  return {
    borders,
    at(which: keyof Edges, q: number) {
      for (const b of [...borders, ...borders.map((x) => x + N), ...borders.map((x) => x - N)])
        if (Math.abs(q - b) <= BAND_RAMP) return ramped(plain(b - 1)[which], plain(b)[which], b, BAND_RAMP, q);
      return plain(q)[which];
    },
  };
}

/** One Section's document. */
function sectionDocument(input: {
  readonly course: SuperMonacoGpCourse;
  readonly section: { readonly id: string; readonly from: number; readonly to: number };
  readonly index: number;
  readonly last: boolean;
  readonly plan: readonly WrittenElement[];
  readonly origin: number;
  readonly stationOf: (q: number) => number;
  readonly lap: (step: number) => number;
  readonly N: number;
  /** P's direction at the Section's start, clockwise from the original's heading 0. */
  readonly theta0: number;
  readonly edgeAt: (side: number, which: 'paving' | 'limit', q: number) => number;
  readonly borders: readonly number[];
  readonly surface: readonly { readonly q: number; readonly palette: number }[];
  /** The road's asphalt bands over the lap, steps, and their colors. */
  readonly asphalt: readonly { readonly from: number; readonly to: number; readonly color: number }[];
  readonly paving: readonly { readonly q: number; readonly side: number; readonly palette: number }[];
  readonly startBoards: readonly { readonly q: number; readonly palette: number }[];
  readonly gridPalette: number;
  readonly objects: readonly ObjectSpot[];
  readonly kerbs: readonly {
    readonly q: number;
    readonly units: number;
    readonly width: number;
    readonly palette: number;
  }[];
  readonly profile: Profile;
  readonly context: CourseContext;
}) {
  const { section, origin, stationOf, context, course, plan } = input;
  const stations = sectionStations(plan);
  const { size, joint } = stations;
  const at = (s: number) => stations.at(s - origin);
  const end = { joint, offset: size };
  const lateral = (units: number) => micrometre(units * UNIT);
  const strips: unknown[] = [];
  type Edge = number | { boundary: string; offset: number } | null;
  const strip = (a: number, b: number, left: Edge, right: Edge, color: number | null, material: string | null) => {
    const [start, stop] = [at(a), at(b)];
    if (stop.offset - start.offset > EPSILON)
      strips.push({ kind: 'strip', start, end: stop, left, right, color, material });
  };
  const span = (from: number, to: number) => {
    const [a, b] = [Math.max(from, section.from), Math.min(to, section.to)];
    return b > a ? [stationOf(a), b >= section.to ? origin + size : stationOf(b)] : null;
  };

  // The ground: the road layer's ground color, the tunnel's dark from its mouth to its exit.
  strips.push({
    kind: 'strip',
    start: at(origin),
    end,
    left: null,
    right: null,
    color: context.ground,
    material: null,
  });
  if (course.course === 1) {
    const dark = span(input.lap(TUNNEL.ground[0]), input.lap(TUNNEL.ground[1]));
    if (dark) strip(dark[0]!, dark[1]!, null, null, TUNNEL_DARK, null);
  }

  // The materials: paving between the paving edges, grass out to the limits; the limits are the materials' outer edges.
  const knotSteps = [
    section.from,
    ...input.borders.flatMap((b) => [b - BAND_RAMP, b + BAND_RAMP]).filter((q) => q > section.from && q < section.to),
    section.to,
  ].sort((a, b) => a - b);
  const boundary = (id: string, side: number, which: 'paving' | 'limit') => ({
    id,
    knots: [...new Set(knotSteps)].map((q) => ({
      at: q === section.to ? end : at(stationOf(q)),
      lateral: lateral(side * input.edgeAt(side, which, q)),
    })),
  });
  const boundaries = [
    boundary('paving-left', -1, 'paving'),
    boundary('limit-left', -1, 'limit'),
    boundary('paving-right', 1, 'paving'),
    boundary('limit-right', 1, 'limit'),
  ];
  const ref = (id: string) => ({ boundary: id, offset: 0 });
  strips.push(
    {
      kind: 'strip',
      start: at(origin),
      end,
      left: ref('paving-left'),
      right: ref('paving-right'),
      color: null,
      material: 'ASPHALT',
    },
    {
      kind: 'strip',
      start: at(origin),
      end,
      left: ref('limit-left'),
      right: ref('paving-left'),
      color: null,
      material: 'GRASS',
    },
    {
      kind: 'strip',
      start: at(origin),
      end,
      left: ref('paving-right'),
      right: ref('limit-right'),
      color: null,
      material: 'GRASS',
    },
  );

  // The road's surface: its asphalt bands, the side paving each board's color from the board before it, the centre
  // line at each surface board.
  for (const band of input.asphalt) {
    const r = span(band.from, band.to);
    if (r) strip(r[0]!, r[1]!, lateral(-SURFACE_HALF), lateral(SURFACE_HALF), band.color, null);
  }
  for (const side of [-1, 1]) {
    const boards = input.paving.filter((p) => p.side === side);
    boards.forEach((board, k) => {
      const before = boards[k - 1];
      const from = before && board.q - before.q <= 10 ? before.q : board.q - 10;
      const r = span(from, board.q);
      const [l, rr] = side < 0 ? [-SIDE_PAVING.to, -SIDE_PAVING.from] : [SIDE_PAVING.from, SIDE_PAVING.to];
      if (r) strip(r[0]!, r[1]!, lateral(l), lateral(rr), context.marks.surface(board.palette), null);
    });
  }
  for (const board of input.surface) {
    const r = span(board.q - CENTRE_LINE.steps, board.q);
    if (r)
      strip(
        r[0]!,
        r[1]!,
        lateral(-CENTRE_LINE.half),
        lateral(CENTRE_LINE.half),
        context.marks.centre(board.palette),
        null,
      );
  }
  // The kerbs: each run of kerbs at one lateral, up to KERB_GAP apart with their palettes alternating, as wide as its
  // first about its x and in its colors, its kerbs evenly from the first to the last, each two stripes KERB_STEPS / 2
  // long, before it and after it. A run's kerbs within the Section are one repeat of the first's stripes; a kerb across
  // the Section's ends is its own stripes, cut there.
  const kerbRun = (run: typeof input.kerbs) => {
    const [first, last] = [run[0]!, run.at(-1)!];
    const colors = context.marks.kerb(first.palette);
    const [left, right] = [lateral(first.units - first.width / 2), lateral(first.units + first.width / 2)];
    const s0 = stationOf(first.q);
    const every = run.length > 1 ? (stationOf(last.q) - s0) / (run.length - 1) : 0;
    // A stripe's length: KERB_STEPS / 2 of the run's mean metres a step, from half a kerb before the first to after the last.
    const half =
      ((stationOf(last.q + KERB_STEPS / 2) - stationOf(first.q - KERB_STEPS / 2)) / (last.q - first.q + KERB_STEPS)) *
      (KERB_STEPS / 2);
    const stripes = (s: number) =>
      [
        [s - half, s],
        [s, s + half],
      ].flatMap(([a, b], k) => {
        const [from, to] = [Math.max(a!, origin), Math.min(b!, origin + size)];
        return to - from > EPSILON
          ? [{ kind: 'strip', start: at(from), end: at(to), left, right, color: colors[k]!, material: null }]
          : [];
      });
    const inside = run
      .map((_, k) => k)
      .filter((k) => s0 + k * every - half >= origin && s0 + k * every + half <= origin + size);
    for (const [k] of run.entries())
      if (!inside.includes(k)) strips.push(...stripes(s0 + k * every));
      else if (k === inside[0])
        strips.push(
          ...(inside.length > 1
            ? [{ kind: 'repeat', every: micrometre(every), count: inside.length, elements: stripes(s0 + k * every) }]
            : stripes(s0 + k * every)),
        );
  };
  // The runs; then runs at one lateral in one palette, their kerbs and the gap between them all one spacing, as one.
  const runs: (typeof input.kerbs)[number][][] = [];
  for (const kerb of input.kerbs) {
    const before = runs.at(-1)?.at(-1);
    if (before && kerb.units === before.units && kerb.q - before.q <= KERB_GAP && kerb.palette !== before.palette)
      runs.at(-1)!.push(kerb);
    else runs.push([kerb]);
  }
  const spacing = (run: readonly { q: number }[]) => new Set(run.slice(1).map((kerb, k) => kerb.q - run[k]!.q));
  const joined = runs.reduce<(typeof input.kerbs)[number][][]>((out, next) => {
    const last = out.at(-1);
    const both = last && [...last, ...next];
    if (both && last[0]!.units === next[0]!.units && last[0]!.palette === next[0]!.palette && spacing(both).size === 1)
      out[out.length - 1] = both;
    else out.push(next);
    return out;
  }, []);
  joined.forEach(kerbRun);

  // The grid's marks, each slot's, then the start line over them.
  for (let slot = 0; slot < GRID.slots; slot++) {
    const q = input.lap(GRID.first - GRID.spacing * slot);
    const side = slot % 2 ? 1 : -1;
    for (const mark of GRID_MARKS) {
      const r = span(q - mark.back, q - mark.back + MARK_STEPS);
      const [l, rr] = side < 0 ? [-mark.to, -mark.from] : [mark.from, mark.to];
      if (r) strip(r[0]!, r[1]!, lateral(l), lateral(rr), context.marks.grid(mark, input.gridPalette), null);
    }
  }
  for (const board of input.startBoards) {
    const r = span(board.q - START_LINE.steps, board.q);
    if (r)
      for (const block of context.marks.start(board.palette))
        strip(r[0]!, r[1]!, lateral(block.from), lateral(block.to), block.color, null);
  }

  // The gates: the start's grid in the first Section, the checkpoints at the sectors' ends, the finish at the lap's.
  // The cars' grid is the original's; the bikes' the rule's, its player's slot the cars' last that a run uses, the
  // barriers the limits.
  const gates: unknown[] = [];
  if (input.index === 0) {
    const slots = Array.from({ length: GRID.slots }, (_, slot) => ({
      s: stationOf(input.lap(GRID.first - GRID.spacing * slot)),
      lateral: laneCentre(slot % 2 ? 'b' : 'a'),
      l: slot % 2 ? OFFSET : -OFFSET,
    }));
    const player = slots[RUN_RULE_LIMITS.competitors - 1]!;
    const bikeGrid = ruleGrid({
      kind: 'bike',
      player,
      originals: [],
      lanes: ['a', 'b'],
      laneWidth: LANE,
      limits: [BARRIER * UNIT + player.l, BARRIER * UNIT - player.l],
    });
    const written = (slot: GridPlace) => ({ at: at(slot.s), lateral: slot.lateral });
    gates.push({ kind: 'start', grid: slots.map(written), bikeGrid: bikeGrid.map(written) });
  }
  if (input.last) gates.push({ kind: 'finish', id: `${course.id}-FINISH`, at: end });
  else {
    const k = course.checkpoints.findIndex((c) => input.lap(c) === section.to);
    if (k >= 0) gates.push({ kind: 'checkpoint', id: `${course.id}-CP${k + 1}`, at: end });
  }

  // The skies: the fine sky, the tunnel's dark one as the camera reaches 9054, the fine one again at 10750.
  const changes =
    course.course === 1
      ? [
          { q: input.lap(TUNNEL.sky[0]), sky: SKIES.tunnel },
          { q: input.lap(TUNNEL.sky[1]), sky: SKIES.fine },
        ]
      : [];
  const skyAt = (q: number) => {
    let sky: string = SKIES.fine;
    for (const c of changes) if (q >= c.q) sky = c.sky;
    return sky;
  };
  const { theta0 } = input;
  let yaw = ((-theta0 - (SKY_AT_HEADING - CAMERA_DEFINITION.centerX) / CAMERA_DEFINITION.focalLength) * 180) / Math.PI;
  const period = ((SKY_WIDTH / CAMERA_DEFINITION.focalLength) * 180) / Math.PI;
  while (yaw < -360) yaw += period;
  while (yaw > 360) yaw -= period;
  const environment = (s: number, q: number) => ({
    at: at(s),
    name: course.name,
    background: { image: skyAt(q), horizonY: SKY_HORIZON, yawOrigin: micrometre(yaw) },
    arrival: 'cut',
  });
  const environments = [
    environment(origin, section.from),
    ...changes.filter((c) => c.q > section.from && c.q < section.to).map((c) => environment(stationOf(c.q), c.q)),
  ];

  return {
    id: section.id,
    plan,
    profile: sectionProfile(input.profile, origin, origin + size, true, true).map(({ s, y, curveLength }) => ({
      at: { joint, offset: computedValue(s - origin) },
      y,
      curveLength,
    })),
    lanes: [
      { kind: 'lane', id: 'a', width: micrometre(LANE) },
      { kind: 'lane', id: 'b', width: micrometre(LANE) },
    ],
    centerLane: 'a',
    centerLateral: micrometre(-OFFSET),
    boundaries,
    strips,
    walls: [],
    openLimits: [],
    sprites: input.objects.map((o) => ({
      kind: 'sprite',
      image: o.image,
      palette: paletteName(o.palette),
      at: at(stationOf(o.q)),
      lateral: lateral(o.units),
      groundOffset: micrometre(o.groundOffset),
      unselectedLink: null,
      body: null,
    })),
    environments,
    gates,
  };
}
