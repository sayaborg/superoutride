/**
 * SUPER MONACO GP's circuits from its ROMs ([SUPER MONACO GP road data](../../docs/super-monaco-gp-road-data.md#super-monaco-gps-courses)):
 * each course's heading table laid as straights and arcs from the race's line, closed exactly on the written plane, the
 * road level, its lanes, its materials and limits from the barriers' band tables, the road's surface and its marks as
 * strips, every other object a board, its Sections, sky, checkpoints, finish and grid.
 */
import { requireInput } from '../course/authoring-io.js';
import { computedValue } from '../authoring/course-joints.js';
import { CAMERA_DEFINITION } from '../../src/view/camera-definition.js';
import { COURSE_DOCUMENT_VERSION } from '../../src/course/course-document.js';
import { linearToRgb555, rgb555LinearChannel } from '../../src/image/image-filter.js';
import type { RomSet } from './rom-set.js';
import { profileOf, sectionProfile } from './road-profile.js';
import { bakeSky, SKY_WIDTH } from './sky-baking.js';
import { sectionPlan } from './path-plan.js';
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
  readSceneryList,
  type Band,
  type SceneryObject,
} from './super-monaco-gp-road.js';
import { largestPixels, largestSize, readSpritePalette, readViewTable } from './super-monaco-gp-sprites.js';
import { VIEWED } from './super-monaco-gp-dump.js';
import { boardName, FLAG, pixelUnits, superMonacoGpBoards, type BoardUse } from './super-monaco-gp-boards.js';
import { paletteName } from './pixel-grid.js';
import { SPRITE_SOURCE_TEXELS_PER_METER } from '../../src/image/sprite.js';
import { readRoadLayerColors, superMonacoGpSkyBands, uniformSkyBands } from './super-monaco-gp-backgrounds.js';

/** The conversion's version, recorded in the specification beside the courses it wrote. */
export const SUPER_MONACO_GP_CONVERSION_VERSION = 9;

/**
 * A step, metres: 96 units along the road, a unit 0.0349 / 9 m, as the clock (0.0349 s a tick) and the displayed km/h
 * (the camera moves 2.5 units a tick for each km/h) give it.
 */
export const STEP_METRES = (96 * 0.0349) / 9;
/** A lateral unit, metres: 1640 units between the barriers are a real Monaco street's 10 m. */
export const UNIT = 10 / 1640;
/** The original's pixels are 14 wide to 15 tall: its vertical amounts grow by this. */
export const UNIT_DOWN = (UNIT * 15) / 14;
/** The lap's line: every grid slot's lap count reaches its first lap at step 288. */
const LAP_LINE = 288;
/** The lanes, 512 units each, their centres at ±256 as the grid's; the plane runs on lane a's centre. */
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
 * 588 − 12s: the original's 12(23 − s) moved on 312 steps, so that the rearmost leaves the camera's distance behind it
 * past the line, as the format asks. Each slot's marks are the grid board's rows.
 */
const GRID = { slots: 24, first: 588, spacing: 12 } as const;
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
 * 1–6 and 7–12, the next kerb's palette swapping them), drawn as curbs.
 */
const KERBS = 0x050a;
const KERB_STEPS = 4;
const KERB_CLASSES = [
  [1, 6],
  [7, 12],
] as const;
/** A kerb stands on from the one before it within this many steps, alternating its palette. */
const KERB_GAP = 8;
/** A curb's end this near a whole stripe, metres, is drawn back this far short of it. */
const STRIPE_HAIR = 1e-3;
/** An object's height h that stands on the ground. */
const GROUND = -50;
/**
 * The boards whose foot is below the ground: an upright one (kind 8, the far buildings) stands on the ground; a flat
 * one 30 units below (h −80: the roadside buildings, stone walls and rock faces) folds at the ground's row, its
 * slanted foot lying on the nearer ground; any other (the supports and the tunnel mouths' rocks) keeps the original's
 * height, the head where what it holds is, its part below the ground hidden by the nearer ground.
 */
const UPRIGHT = 0x08;
const FLAT = 0x04;
const FOLDED = GROUND - 30;
/** An object on a curve's inside stands only within this of the curve's centre's distance (metres). */
const INSIDE_MARGIN = 2;

const round = (value: number, step = 1e-6) => Number((Math.round(value / step) * step).toFixed(6));
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
/** Whether an object is a kerb, drawn as curbs. */
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
  const courses = COURSES.map((course) =>
    superMonacoGpCourse(programs, course, {
      marks,
      ground: roadLayer[GROUND_COLOR]!,
      height: (frames: number) => largestSize(main, frames).height,
      width: (frames: number) => largestSize(main, frames).width,
    }),
  );
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
  return { courses, boards, skies };
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

/** A plan element over steps [from, to] of the lap (0 the line), its Section, and its turn (left positive). */
interface Element {
  readonly section: number;
  readonly from: number;
  readonly to: number;
  readonly turn: number;
  /**
   * A straight off the lap's line: closing may change its length. A straight a Section's border cuts is two straights;
   * the line's straight, which the lap's border cuts, keeps its length.
   */
  readonly free: boolean;
}

/** An element as written on the plane: its length, and an arc's radius and side. */
interface Written {
  readonly kind: 'straight' | 'arc';
  length: number;
  readonly radius?: number;
  readonly right?: boolean;
}

/** The pose after `written` from (0, 0) facing +y; headings counterclockwise. */
function laid(written: readonly Written[]) {
  let [x, y, h] = [0, 0, Math.PI / 2];
  const starts: { x: number; y: number; h: number }[] = [];
  for (const w of written) {
    starts.push({ x, y, h });
    if (w.kind === 'straight') {
      x += w.length * Math.cos(h);
      y += w.length * Math.sin(h);
    } else {
      const k = (w.right ? -1 : 1) / w.radius!;
      x += (Math.sin(h + k * w.length) - Math.sin(h)) / k;
      y += (Math.cos(h) - Math.cos(h + k * w.length)) / k;
      h += k * w.length;
    }
  }
  return { end: { x, y, h }, starts };
}

/**
 * The lap's elements written on the plane, closed: each element's plane length (an arc's on lane a's centre, `OFFSET`
 * left of P) and radius to the micrometre; then the last arc's length solved so that the lap turns exactly once right,
 * and the two free straights whose headings differ by at least 30° (|sin| ≥ 0.5) that close the position with the
 * least of their larger change, changed; those three lengths unrounded.
 */
function closedPlan(elements: readonly Element[]) {
  const written: Written[] = elements.map((e) => {
    const length = (e.to - e.from) * STEP_METRES;
    if (e.turn === 0) return { kind: 'straight', length: round(length) };
    const plane = round(length - OFFSET * e.turn);
    return { kind: 'arc', length: plane, radius: round(plane / Math.abs(e.turn)), right: e.turn < 0 };
  });
  const signed = (w: Written) => (w.kind === 'arc' ? ((w.right ? -1 : 1) * w.length) / w.radius! : 0);
  const last = written.map((w) => w.kind).lastIndexOf('arc');
  const others = written.reduce((sum, w, i) => sum + (i === last ? 0 : signed(w)), 0);
  const needed = -2 * Math.PI - others;
  const arc = written[last]!;
  requireInput(needed < 0 === arc.right, '/plan', 'The last arc cannot close the lap’s turn');
  arc.length = Math.abs(needed) * arc.radius!;
  const { end, starts } = laid(written);
  let best: { i: number; j: number; di: number; dj: number } | null = null;
  const free = elements.map((e, i) => (e.free ? i : -1)).filter((i) => i >= 0);
  for (const i of free)
    for (const j of free) {
      if (j <= i) continue;
      const [a, b] = [starts[i]!.h, starts[j]!.h];
      const det = Math.cos(a) * Math.sin(b) - Math.sin(a) * Math.cos(b);
      if (Math.abs(det) < 0.5) continue;
      const di = (-end.x * Math.sin(b) + end.y * Math.cos(b)) / det;
      const dj = (-end.y * Math.cos(a) + end.x * Math.sin(a)) / det;
      if (written[i]!.length + di <= 0 || written[j]!.length + dj <= 0) continue;
      if (!best || Math.max(Math.abs(di), Math.abs(dj)) < Math.max(Math.abs(best.di), Math.abs(best.dj)))
        best = { i, j, di, dj };
    }
  requireInput(best, '/plan', 'No two straights close the lap');
  written[best.i]!.length += best.di;
  written[best.j]!.length += best.dj;
  const closed = laid(written).end;
  requireInput(
    Math.hypot(closed.x, closed.y) < 1e-9 && Math.abs(closed.h - Math.PI / 2 + 2 * Math.PI) < 1e-12,
    '/plan',
    'The lap does not close',
  );
  return { written, changed: [last, best.i, best.j], starts: laid(written).starts, error: end };
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

  // The plan: the headings from the line round to it again, as SUPER HANG-ON's road paths, laid once a lap.
  const turned = Array.from({ length: N + 1 }, (_, k) => (2 * Math.PI * headings[(LAP_LINE + k) % N]!) / 1024);
  const plan = sectionPlan(
    { x: turned.map((t) => 4096 * Math.sin(t)), y: turned.map((t) => 4096 * Math.cos(t)) } as never,
    STEP_METRES,
  );

  // The Sections: one a sector between the checkpoints, cut into the fewest parts where its boards would pass 2048.
  const boards = spots
    .filter(({ object }) => !isSurface(object) && !isKerb(object))
    .map(({ step }) => lap(step))
    .sort((a, b) => a - b);
  const sectors = [0, ...course.checkpoints.map(lap), N];
  const sections: { id: string; from: number; to: number }[] = [];
  for (let k = 0; k + 1 < sectors.length; k++) {
    const [from, to] = [sectors[k]!, sectors[k + 1]!];
    const cuts = cutsByCount(
      boards.filter((q) => q >= from && q < to),
      SPRITE_ELEMENTS,
    );
    if (!cuts.length) sections.push({ id: `sector-${k + 1}`, from, to });
    else
      [from, ...cuts].forEach((a, j) =>
        sections.push({ id: `sector-${k + 1}${String.fromCharCode(0x61 + j)}`, from: a, to: cuts[j] ?? to }),
      );
  }

  // The plan's elements cut at the Sections' borders, and closed on the written plane.
  const elements: Element[] = [];
  sections.forEach((section, s) => {
    for (const e of plan.segments) {
      const [a, b] = [Math.max(e.from, section.from), Math.min(e.to, section.to)];
      if (b <= a) continue;
      elements.push({
        section: s,
        from: a,
        to: b,
        turn: (e.turn * (b - a)) / (e.to - e.from),
        free: e.turn === 0 && a > 0 && b < N,
      });
    }
  });
  const closed = closedPlan(elements);
  const { written } = closed;
  const stations = written.reduce((o, w) => [...o, o.at(-1)! + w.length], [0]);
  /** The station across from step q of the lap: each element's steps spread evenly over its written length. */
  const stationOf = (q: number) => {
    let i = elements.findIndex((e) => q >= e.from && q < e.to);
    if (i < 0) i = elements.length - 1;
    const e = elements[i]!;
    return stations[i]! + ((q - e.from) / (e.to - e.from)) * written[i]!.length;
  };
  const origins = sections.map(
    (section) => stations[elements.findIndex((e) => e.section === sections.indexOf(section))]!,
  );
  origins.push(stations.at(-1)!);

  // The materials' edges each side, units from P, by step of the lap: each band's, moving to the next's over the
  // 4 steps about their border.
  const bands = readCourseBands(main, course.course, N);
  const left = bandEdges(bands.left, lap, N),
    right = bandEdges(bands.right, lap, N);

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
        : object.kind === FLAT && object.height === FOLDED
          ? 'folded'
          : 'original';
    const use = {
      frames,
      b1: object.b1,
      mirrored: ((object.flags & FLAG.mirrored) !== 0) !== (!viewed && mirrored),
      flipped: (object.flags & FLAG.flipped) !== 0,
      palette,
      ...(group === 'folded' ? { fold: (GROUND - FOLDED) * UNIT_DOWN * SPRITE_SOURCE_TEXELS_PER_METER } : {}),
    };
    uses.boards.push(use);
    const image = boardName(use);
    const e = elements.findIndex((el) => q >= el.from && q < el.to);
    const w = written[e < 0 ? elements.length - 1 : e]!;
    const lateralMetres = OFFSET + units * UNIT;
    if (w.kind === 'arc' && (w.right ? lateralMetres : -lateralMetres) > w.radius! - INSIDE_MARGIN) {
      inside.push({ step, x: units, image });
      continue;
    }
    // It stands on its bottom edge at the original's height, but a board below the ground as its group stands.
    const groundOffset = group === 'standing' || group === 'folded' ? 0 : (bottom - GROUND) * UNIT_DOWN;
    objects.push({ q, units, image, palette, groundOffset, ...(group ? { below: group } : {}) });
  }

  const documents = sections.map((section, s) =>
    sectionDocument({
      course,
      section,
      index: s,
      last: s === sections.length - 1,
      elements: elements.map((e, i) => ({ e, w: written[i]! })).filter(({ e }) => e.section === s),
      origin: origins[s]!,
      size: origins[s + 1]! - origins[s]!,
      stationOf,
      lap,
      N,
      headingAt: (i: number) => closed.starts[i]!.h,
      firstElement: elements.findIndex((e) => e.section === s),
      edgeAt: (side: number, which: 'paving' | 'limit', q: number) => (side < 0 ? left : right).at(which, q),
      borders: [...new Set([...left.borders, ...right.borders])],
      surface,
      asphalt,
      paving,
      startBoards,
      gridPalette,
      objects: objects.filter(({ q }) => q >= section.from && q < section.to),
      kerbs,
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
    elements,
    closed,
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

/** A Section's sprite elements and Strip elements at most (the course format's bounds). */
export const SPRITE_ELEMENTS = 2048;
export const STRIP_ELEMENTS = 2048;

/**
 * Where a stretch's objects at sorted places `at` (n of them) are cut into the fewest parts of at most `limit` each
 * that `fits` takes (by default every cut does): k parts, the j-th cut (1 ≤ j < k) at the place of the ⌊j·n/k⌋-th
 * object (0 from), whose place's objects go to the later part. No cut where all fit in one part.
 */
export function cutsByCount(
  at: readonly number[],
  limit: number,
  fits: (cuts: readonly number[]) => boolean = () => true,
): number[] {
  for (let k = Math.max(1, Math.ceil(at.length / limit)); k <= at.length + 1; k++) {
    const cuts = Array.from({ length: k - 1 }, (_, j) => at[Math.floor(((j + 1) * at.length) / k)]!);
    const ends = [-Infinity, ...cuts, Infinity];
    const counts = cuts
      .map((_, j) => j)
      .concat(k - 1)
      .map((j) => at.filter((q) => q >= ends[j]! && q < ends[j + 1]!).length);
    if (counts.every((n) => n <= limit) && fits(cuts)) return cuts;
  }
  throw new RangeError(`No cuts part ${at.length} objects into parts of at most ${limit}`);
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
  readonly elements: readonly { readonly e: Element; readonly w: Written }[];
  readonly origin: number;
  readonly size: number;
  readonly stationOf: (q: number) => number;
  readonly lap: (step: number) => number;
  readonly N: number;
  readonly headingAt: (element: number) => number;
  readonly firstElement: number;
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
  readonly context: CourseContext;
}) {
  const { section, origin, size, stationOf, context, course } = input;
  const plan = input.elements.map(({ w }, i) => {
    const id = `${w.kind === 'straight' ? 's' : 'c'}${i}`;
    // The closing lengths stay as solved; the others are written to the micrometre.
    const length = w.length;
    return w.kind === 'straight'
      ? { kind: 'straight', id, length }
      : { kind: 'arc', id, length, radius: w.radius!, turn: w.right ? 'right' : 'left' };
  });
  const joint = plan[0]!.id;
  const at = (s: number) => {
    const offset = round(s - origin);
    return { joint, offset: offset > size - EPSILON ? size : Math.max(0, offset) };
  };
  const end = { joint, offset: size };
  const lateral = (units: number) => round(OFFSET + units * UNIT);
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
  // The kerbs: each run of kerbs at one lateral, KERB_STEPS apart (up to KERB_GAP) with their palettes alternating, a
  // curb from half a kerb's steps before the first to half after the last, two stripes a kerb in the first's colors.
  const curb = (run: typeof input.kerbs) => {
    const [first, last] = [run[0]!, run.at(-1)!];
    const [from, to] = [Math.max(0, first.q - KERB_STEPS / 2), Math.min(input.N, last.q + KERB_STEPS / 2)];
    const r = span(from, to);
    if (!r) return;
    // An end within a hair past a whole stripe is drawn back a little short of it, so no stripe is empty.
    const stripe = round((stationOf(to) - stationOf(from)) / (2 * run.length));
    const [a, b] = [round(r[0]!), round(r[1]!)];
    const whole = Math.floor((b - a) / stripe + STRIPE_HAIR / stripe);
    const end = Math.abs(b - a - whole * stripe) < STRIPE_HAIR ? a + whole * stripe - STRIPE_HAIR : b;
    if (end - a <= EPSILON) return;
    strips.push({
      kind: 'curb',
      start: at(a),
      end: at(end),
      left: lateral(first.units - first.width / 2),
      right: lateral(first.units + first.width / 2),
      stripe,
      colors: context.marks.kerb(first.palette),
    });
  };
  let kerbRun: (typeof input.kerbs)[number][] = [];
  for (const kerb of input.kerbs) {
    const before = kerbRun.at(-1);
    if (before && (kerb.units !== before.units || kerb.q - before.q > KERB_GAP || kerb.palette === before.palette)) {
      curb(kerbRun);
      kerbRun = [];
    }
    kerbRun.push(kerb);
  }
  if (kerbRun.length) curb(kerbRun);

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
  const gates: unknown[] = [];
  if (input.index === 0)
    gates.push({
      kind: 'start',
      grid: Array.from({ length: GRID.slots }, (_, slot) => ({
        at: at(stationOf(input.lap(GRID.first - GRID.spacing * slot))),
        lane: slot % 2 ? 'b' : 'a',
      })),
      bikeGrid: null,
    });
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
  const theta0 = Math.PI / 2 - input.headingAt(input.firstElement);
  let yaw = ((-theta0 - (SKY_AT_HEADING - CAMERA_DEFINITION.centerX) / CAMERA_DEFINITION.focalLength) * 180) / Math.PI;
  const period = ((SKY_WIDTH / CAMERA_DEFINITION.focalLength) * 180) / Math.PI;
  while (yaw < -360) yaw += period;
  while (yaw > 360) yaw -= period;
  const environment = (s: number, q: number) => ({
    at: at(s),
    name: course.name,
    background: { image: skyAt(q), horizonY: SKY_HORIZON, yawOrigin: round(yaw) },
    arrival: 'cut',
  });
  const environments = [
    environment(origin, section.from),
    ...changes.filter((c) => c.q > section.from && c.q < section.to).map((c) => environment(stationOf(c.q), c.q)),
  ];

  return {
    id: section.id,
    plan,
    profile: sectionProfile(profileOf([]), origin, origin + size, true, true).map(({ s, y, curveLength }) => ({
      at: { joint, offset: computedValue(s - origin) },
      y,
      curveLength,
    })),
    lanes: [
      { kind: 'lane', id: 'a', width: round(LANE) },
      { kind: 'lane', id: 'b', width: round(LANE) },
    ],
    centerLane: 'a',
    centerLateral: 0,
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
      groundOffset: round(o.groundOffset),
      unselectedLink: null,
      body: null,
    })),
    environments,
    gates,
  };
}
