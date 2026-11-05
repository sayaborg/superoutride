/**
 * POLE POSITION II's courses from its ROMs ([POLE POSITION II road data](../../../docs/pole-position-ii-road-data.md#pole-position-iis-courses)):
 * its conversion, each course's lap from its curve table laid out by the shared `circuit-layout`.
 */
import { contractUnmet, romDiffers } from '../shared/conversion-errors.js';
import { instruction } from '../cpu/program-words.js';
import { crestTrials } from '../shared/crest-trials.js';
import { curvePlan, curveRuns } from '../shared/curve-plan.js';
import { CoursePath } from '../shared/course-path.js';
import { OriginalOutputs, round1, round3, type Conversion } from '../shared/conversion.js';
import type { RomSet } from '../shared/rom-set.js';
import { roadPalette } from '../pole-position-hardware/colors.js';
import { PIXEL_ASPECT, SCREEN_COLUMNS } from '../pole-position-hardware/display.js';
import { skyYawOrigin } from '../shared/sky-baking.js';
import { CAMERA_DEFINITION } from '../../../src/view/camera-definition.js';
import { PANORAMA_COLUMNS, polePositionIISky } from './pole-position-ii-backgrounds.js';
import { assemblePolePositionII, type PolePositionII } from './pole-position-ii-rom.js';
import {
  BAND_UNITS,
  HIGH_UNITS,
  INTERVALS,
  intervalMetres,
  readCurveTables,
  readNames,
  readRoadPalettes,
  readStartLine,
} from './pole-position-ii-road.js';
import { crossSection, leastLaneRadius } from './pole-position-ii-cross-section.js';
import { layCourse } from '../shared/circuit-layout.js';
import {
  COURSE_IDS,
  CRAFT_HEIGHT,
  CRAFT_SCALE,
  LANE,
  LAPS,
  MODELS,
  ROAD_STEP_PIXELS,
  ROAD_WIDTH,
  SPEED_ENTRY,
  STEP_METRES,
  TEST,
  TEST_STRAIGHT,
} from './pole-position-ii-constants.js';
import {
  ARCH,
  CRAFT,
  FLAGMAN,
  GANTRY,
  PUDDLE,
  readBoardPictures,
  readCraft,
  readObjectReach,
  readObjects,
  readObjectScales,
  readProjection,
  readPuddleAhead,
  readScenery,
  readSceneryReach,
  readView,
} from './pole-position-ii-scenery.js';
import {
  archSprites,
  craftSprites,
  flagmanSprites,
  gantrySprites,
  puddleSprites,
  type LaidSprite,
} from './pole-position-ii-sprites.js';
import {
  boardName,
  composeSprites,
  objectImage,
  objectPart,
  polePositionIIBoards,
  type ObjectPart,
} from './pole-position-ii-boards.js';
import { paletteName, turned } from '../shared/pixel-grid.js';
import { courseModel } from '../shared/course-models.js';
import { courseOnModel, type LapInputs } from '../shared/model-lap.js';

/** The conversion's version, recorded in the specification beside the courses it wrote. */
export const POLE_POSITION_II_CONVERSION_VERSION = 10;

/**
 * TEST's lap with its two long straights made `TEST_STRAIGHT` intervals each (K, 2026-11-04), the intervals added or
 * taken at their beginnings, so that the table's start keeps its place before T1: its values in the table's order from
 * its start, and where each of the table's intervals lies on it (`place`): its interval as laid, or for an interval
 * taken, the start of its straight as laid.
 */
function testLap(values: readonly number[]) {
  const n = values.length;
  const runs = curveRuns(values);
  const longest = runs
    .map((run, i) => ({ count: run.count, straight: run.sign === 0, i }))
    .filter((r) => r.straight)
    .sort((x, y) => y.count - x.count || x.i - y.i)
    .slice(0, 2)
    .map((r) => r.i);
  if (longest.length !== 2) throw romDiffers("TEST's table has no two straights");
  const out: number[] = [];
  const laid = new Array<number>(n);
  const kept = new Array<boolean>(n);
  let start = -1;
  runs.forEach((run, i) => {
    const made = longest.includes(i) ? TEST_STRAIGHT : run.count;
    // Intervals taken from, or added at, the run's beginning: the rest keep their places from its end.
    const shift = made - run.count;
    const first = out.length;
    for (let k = 0; k < made; k++) out.push(values[(run.from + Math.max(0, k - shift)) % n]!);
    for (let j = 0; j < run.count; j++) {
      laid[(run.from + j) % n] = first + Math.max(0, j + shift);
      kept[(run.from + j) % n] = j + shift >= 0;
    }
    const zero = (n - run.from) % n;
    if (zero < run.count && zero + shift >= 0) start = first + zero + shift;
  });
  if (start < 0) throw romDiffers("TEST's table start lies in no straight kept");
  return {
    values: [...out.slice(start), ...out.slice(0, start)],
    place: (j: number) => ({ interval: (laid[j]! - start + out.length) % out.length, kept: kept[j]! }),
  };
}

/**
 * Where the sky faces: the background's column at the screen's middle at GO, its scroll 0 there (the second program's
 * 0x05AE), the road vanishing at the middle.
 */
function skyFacing(p: PolePositionII) {
  instruction(p.second, 0x05ae, [0x8d08, 0xa101, 0x5d00, 0x8180, 0x6f00, 0xc000], "the background's scroll at GO");
  return skyYawOrigin(SCREEN_COLUMNS / 2, PANORAMA_COLUMNS * 8);
}

/**
 * How far behind the line the player stands at GO: the second program's 0x0658 takes this from its place, a share of
 * the interval before the line, `interval` metres as laid.
 */
function playerBehind(p: PolePositionII, interval: number) {
  const [units] = instruction(p.second, 0x0656, [0xa110, 0x0300, null, 0x6f00, 0x8184], "the player's place at GO");
  return (units! / HIGH_UNITS) * interval;
}

/**
 * The grid as the second program's 0x061C lays it at GO, its rule: the rivals ahead of the player from the line
 * (position 0) back in rows of two (its 0x0640), a row's first at lateral −0x300 (its 0x06AE), its second at +0x240 (its
 * 0x067C), each row 0x80 units behind the one before (its 0x0648); the player in the next place, its x 0x2600 in a
 * row's first (its 0x0650) and 0xE200 in its second (its 0x06B6), on the same sides.
 */
function readGrid(p: PolePositionII) {
  instruction(p.second, 0x061c, [0x210b, 0x8b00, 0x2101, 0x0000], 'the grid from the line');
  const [row] = instruction(p.second, 0x0640, [0xdfca, 0xab00, 0xe638, 0xdfe6, 0x0301, null], 'the rows of two');
  const [second] = instruction(p.second, 0x067c, [0x4db5, 0x0006, null], "a row's second lateral");
  const [first] = instruction(p.second, 0x06ae, [0x4db5, 0x0006, null], "a row's first lateral");
  const [firstX] = instruction(p.second, 0x0650, [0x4d05, 0x8188, null], "the player's x in a row's first place");
  const [secondX] = instruction(p.second, 0x06b6, [0x4d05, 0x8188, null], "the player's x in a row's second place");
  const word = (w: number) => (w << 16) >> 16;
  if (Math.sign(word(first!)) === Math.sign(word(firstX!)) || Math.sign(word(second!)) === Math.sign(word(secondX!)))
    throw romDiffers("The player's x at GO does not stand on its place's side");
  return {
    /** Slot k's place, units behind the line, and its lateral. */
    behind: (k: number) => Math.floor(k / 2) * row!,
    lateral: (k: number) => word(k % 2 === 0 ? first! : second!),
    x: [word(firstX!), word(secondX!)] as const,
  };
}

/** What course `c`'s lap on its model is solved from: its curve table, its model, its road's width and least radius. */
function lapInputs(tables: readonly (readonly number[])[], c: number): LapInputs {
  return { values: tables[c]!, model: courseModel(MODELS.get(c)!), roadWidth: ROAD_WIDTH, leastLaneRadius };
}

/** The courses with a model, each its id and what its lap on its model is solved from, for the solving command. */
export function polePositionIIModelLaps(set: RomSet): { course: string; inputs: LapInputs }[] {
  const tables = readCurveTables(assemblePolePositionII(set));
  return [...MODELS.keys()].map((c) => ({ course: COURSE_IDS[c]!, inputs: lapInputs(tables, c) }));
}

/**
 * Course `c`'s lap: TEST's from its own table, its intervals the clock's, turned once round; a course with a model, its
 * lap on its model as solved (`model-laps.json`), which must meet the rule. With its report's figures, and where each of
 * its table's intervals lies on it (`place`, TEST's `testLap`'s).
 */
function courseLap(tables: readonly (readonly number[])[], c: number, metres: number, name: string) {
  if (c === TEST) {
    const { values, place } = testLap(tables[c]!);
    if (values.length !== INTERVALS) throw new Error("TEST's lap lost intervals");
    const turning = values.reduce((sum, v) => sum + v, 0) * metres;
    const scale = (2 * Math.PI * Math.sign(turning)) / turning;
    const intervals = values.map((value) => ({ value, length: metres }));
    return { intervals, scale, length: INTERVALS * metres, report: {}, place };
  }
  return {
    ...courseOnModel(COURSE_IDS[c]!, name, lapInputs(tables, c)),
    place: (j: number) => ({ interval: j, kept: true }),
  };
}

/** The least distance between two of `points`, metres. */
const nearest = (points: readonly { x: number; y: number }[]) =>
  Math.min(...points.flatMap((a, i) => points.slice(i + 1).map((b) => Math.hypot(a.x - b.x, a.y - b.y))));

/** An object's part as a course stands it: its image, color, place in the object and how it stands. */
interface StoodPart {
  readonly image: ReturnType<typeof objectImage>;
  readonly color: number;
  readonly part: ObjectPart;
  /** Its column: its base point's pixels right of the object's column. */
  readonly column: number;
  /** Whether it floats at its bottom's height, and whether it has a body (its colored columns). */
  readonly floats: boolean;
  readonly body: boolean;
}

/**
 * The objects' parts by kind ([its objects](../../../docs/pole-position-ii-road-data.md#pole-position-iis-objects)),
 * each kind's pixel its share of a board's (`pixel`): the gantry (unlit, K, 2026-11-05) and the arch cut where their
 * columns' middles lie `beyond` lateral units or more from their middle, the sides standing with bodies, the middle and
 * the gantry's lamps floating without; a puddle lying about its middle row at its column; the flagman standing at its
 * column. A right side its left one's
 * reflection is that mirrored.
 */
function objectParts(p: PolePositionII, pixel: number, beyond: number) {
  const scales = readObjectScales(p);
  const parts = new Map<number, StoodPart[]>();
  const stood = (
    kind: number,
    name: string,
    part: ObjectPart | undefined,
    color: number,
    how: Partial<StoodPart> & { lies?: boolean; mirrored?: boolean; anchor?: number } = {},
  ) => {
    if (!part) return;
    const metres = pixel * scales.get(kind)!;
    const image = objectImage(p, name, part, color, metres, how);
    const column = how.anchor === undefined ? part.left + part.picture.width / 2 : 0;
    const list = parts.get(kind) ?? [];
    list.push({ image, color, part, column, floats: how.floats === true, body: how.body === true });
    parts.set(kind, list);
  };
  const sides = (kind: number, routine: number, laid: readonly LaidSprite[], lamps: number) => {
    const composed = composeSprites(p, laid);
    const limit = beyond / scales.get(kind)!;
    const side = (at: number) => {
      const middle = composed.left + (at % composed.width) + 0.5;
      return Math.abs(middle) >= limit ? Math.sign(middle) : 0;
    };
    const body = (at: number) => composed.owner[at]! >= lamps;
    const name = `polepos2-${routine.toString(16).padStart(4, '0')}`;
    const left = objectPart(composed, (at) => body(at) && side(at) < 0);
    const right = objectPart(composed, (at) => body(at) && side(at) > 0);
    const color = laid[lamps]!.color;
    stood(kind, `${name}-left`, left, color, { body: true });
    // A right side its left one's reflection is the left's image mirrored, standing where the right does.
    if (left && right && mirrorsOf(left, right))
      stood(kind, `${name}-left-mirrored`, { ...right, picture: left.picture }, color, { body: true, mirrored: true });
    else stood(kind, `${name}-right`, right, color, { body: true });
    stood(
      kind,
      `${name}-middle`,
      objectPart(composed, (at) => body(at) && side(at) === 0),
      color,
      { floats: true },
    );
    if (lamps)
      stood(
        kind,
        `${name}-lights`,
        objectPart(composed, (at) => !body(at)),
        laid[0]!.color,
        { floats: true },
      );
  };
  sides(GANTRY, 0x136e, gantrySprites(p, 0), 2);
  sides(ARCH, 0x1a9e, archSprites(p), 0);
  const puddle = puddleSprites(p);
  const pool = objectPart(composeSprites(p, puddle), () => true);
  stood(PUDDLE, 'polepos2-150a', pool, puddle[0]!.color, { lies: true, anchor: pool ? -pool.left : 0 });
  const flagman = flagmanSprites(p, 0);
  const flag = objectPart(composeSprites(p, flagman), () => true);
  stood(FLAGMAN, 'polepos2-180e', flag, flagman[0]!.color, { anchor: flag ? -flag.left : 0 });
  return { parts, scales };
}

/**
 * The airship's or plane's parts in course `c` ([its objects](../../../docs/pole-position-ii-road-data.md#its-craft)):
 * each sprite of its arrangement a part, as much of it as shows over those before, in its one color, a source pixel
 * `pixel` metres; with each part's place in the arrangement, metres right of its colored middle and above its lowest
 * colored pixel.
 */
function craftParts(p: PolePositionII, c: number, x: number, pixel: number) {
  const laid = craftSprites(p, c, x);
  const composed = composeSprites(p, laid);
  const whole = objectPart(composed, () => true)!;
  const middle = whole.left + whole.picture.width / 2;
  return laid.flatMap((sprite, k) => {
    const part = objectPart(composed, (at) => composed.owner[at] === k);
    if (!part) return [];
    const hex = (v: number) => v.toString(16).padStart(2, '0');
    const name = `polepos2-16fc-${hex(sprite.code)}-${hex(sprite.color)}`;
    return [
      {
        image: objectImage(p, name, part, sprite.color, pixel),
        color: sprite.color,
        lateral: (part.left + part.picture.width / 2 - middle) * pixel,
        rise: (part.bottom - whole.bottom) * pixel * PIXEL_ASPECT,
      },
    ];
  });
}

/**
 * Where the craft lies as seen from this game's camera at GO: its distance and height from the camera, and its lateral
 * from the camera's facing, the camera `CAMERA_DEFINITION`'s distance behind the grid's first slot, `slot` (a station
 * of the lap and its lateral from P), where a run alone starts.
 */
function craftReport(
  path: CoursePath,
  slot: { readonly s: number; readonly lateral: number },
  at: number,
  lowest: number,
) {
  const behind = CAMERA_DEFINITION.focalLength / 40;
  const camera = path.aside((slot.s - behind + path.length) % path.length, slot.lateral);
  const craft = path.aside(at, 0);
  const [dx, dy] = [craft.x - camera.x, craft.y - camera.y];
  return {
    station: round3(at),
    distance: round1(Math.hypot(dx, dy)),
    height: round1(lowest - CAMERA_DEFINITION.height),
    aside: round1(dx * Math.sin(camera.heading) - dy * Math.cos(camera.heading)),
  };
}

/** Whether `right` is `left` reflected, pixel for pixel. */
const mirrorsOf = (left: ObjectPart, right: ObjectPart) =>
  left.picture.width === right.picture.width &&
  left.picture.height === right.picture.height &&
  left.bottom === right.bottom &&
  left.left + left.picture.width === -right.left &&
  turned(left.picture.pixels, left.picture.width, true).every((pen, at) => pen === right.picture.pixels[at]);

/** POLE POSITION II's courses, from the ROM set: each one's document, crest trials and report. */
export function polePositionIICourses(set: RomSet) {
  const p = assemblePolePositionII(set);
  const tables = readCurveTables(p);
  const names = readNames(p);
  const palettes = readRoadPalettes(p);
  const startLine = readStartLine(p);
  const outputs = new OriginalOutputs();
  // The boards: their places, pictures and reach, a lateral unit and a source pixel in metres by the road's steps.
  const scenery = readScenery(p);
  const pictures = readBoardPictures(p);
  const reach = readSceneryReach(p);
  const projection = readProjection(p);
  const lateralMetres = (STEP_METRES * projection.lateral) / ROAD_STEP_PIXELS;
  const pixelMetres = (STEP_METRES * projection.pixel) / ROAD_STEP_PIXELS;
  const boards = polePositionIIBoards(
    p,
    scenery.flat().map((place) => pictures[place.kind]!),
    pixelMetres,
  );
  for (const { image } of boards) outputs.file(image.path, image.bytes);
  // The objects beside the boards: their parts, each kind's pixel its share of a board's.
  const reached = readObjectReach(p);
  const { parts, scales } = objectParts(p, pixelMetres, (reached.beyond * lateralMetres) / pixelMetres);
  const ahead = readPuddleAhead(p);
  // The airship or plane: at a third of the original's screen's size, distance and height above its eye about the
  // original's camera (CRAFT_SCALE); a source pixel a board's at the line it is drawn 1:1 on, as far as boards are drawn.
  const craft = readCraft(p);
  const view = readView(p);
  const craftPixel = (pixelMetres * (view.farthest + view.behind) * CRAFT_SCALE) / (view.oneToOne + view.behind);
  const eye = (STEP_METRES / ROAD_STEP_PIXELS) * PIXEL_ASPECT;
  const crafts = COURSE_IDS.map((_, c) => craftParts(p, c, craft.x, craftPixel));
  const objectImages = [
    ...new Map([...[...parts.values()].flat(), ...crafts.flat()].map((part) => [part.image.name, part.image])).values(),
  ];
  for (const { image } of objectImages) outputs.file(image.path, image.bytes);
  const boardOf = new Map(boards.map((b) => [b.name, b]));
  const grid = readGrid(p);
  const { factor, metres } = intervalMetres(p, SPEED_ENTRY);
  const courses = COURSE_IDS.map((id, c) => {
    const { intervals, scale, length, report, place } = courseLap(tables, c, metres, names[c]!);
    const pieces = curvePlan(intervals, scale);
    // A road position's high word at its curve table position on the lap as laid: its interval's start and its share
    // of it, an interval TEST's lap took at its straight's start as laid.
    const starts = [0];
    for (const { length: l } of intervals) starts.push(starts.at(-1)! + l);
    const station = (position: number) => {
      const { interval: i, kept } = place(position >> 8);
      return starts[i]! + (kept ? ((position & 255) / HIGH_UNITS) * intervals[i]!.length : 0);
    };
    const objects = scenery[c]!.map((place) => {
      const picture = pictures[place.kind]!;
      const board = boardOf.get(boardName(picture))!;
      return {
        s: station(place.position),
        lateral: -place.lateral * lateralMetres,
        image: board.name,
        palette: paletteName(picture.color),
        body: Math.min(board.colored, 2 * reach.across * lateralMetres),
      };
    });
    // Each object's parts at its curve table position (a puddle's 0x64 units nearer, as it is drawn), its lateral and its
    // parts' places in it, the floating ones at their bottoms' heights.
    const placed = readObjects(p, c).flatMap((place) =>
      parts.get(place.kind)!.map((part) => {
        const metres = pixelMetres * scales.get(place.kind)!;
        return {
          kind: place.kind,
          s: station(place.kind === PUDDLE ? place.position - ahead : place.position),
          lateral: -place.lateral * lateralMetres + part.column * metres,
          height: part.floats ? part.part.bottom * metres * PIXEL_ASPECT : 0,
          image: part.image.name,
          palette: paletteName(part.color),
          body: part.body ? Math.min(part.image.colored, part.image.width) : null,
        };
      }),
    );
    // The craft at one station, the original's camera's distance a third of the boards' farthest ahead of the car's
    // place at GO, measured by the clock's interval; its lowest pixel at the original's eye + a third of the rest.
    const go = length - playerBehind(p, intervals.at(-1)!.length);
    const forward = ((view.farthest + view.behind) * CRAFT_SCALE - view.behind) * (metres / HIGH_UNITS);
    const craftAt = (go + forward) % length;
    const lowest = eye + (CRAFT_HEIGHT - eye) * CRAFT_SCALE;
    const flying = crafts[c]!.map((part) => ({
      kind: CRAFT,
      s: craftAt,
      lateral: part.lateral,
      height: lowest + part.rise,
      image: part.image.name,
      palette: paletteName(part.color),
      body: null,
    }));
    placed.push(...flying);
    const lap = { pieces, length };
    // The road across: its palettes in turn along an interval, a band each, and the start line's rows.
    const palette = (k: number) => roadPalette(p.road, p.colors, k);
    if (palettes[c]!.length * BAND_UNITS !== HIGH_UNITS)
      throw romDiffers("A course's palettes do not fill an interval");
    const across = crossSection(palettes[c]!.map(palette));
    const interval = length / INTERVALS;
    // The start line's rows at their curve table positions.
    const rows = Array.from({ length: startLine.width / startLine.row }, (_, r) => {
      const at = startLine.from + r * startLine.row;
      const two = startLine.palettes[c]!;
      const turn = Math.floor(at / startLine.row) % two.length;
      return { from: station(at), to: station(at + startLine.row), bands: crossSection([palette(two[turn]!)]).bands };
    });
    const sky = `${id}-sky`;
    // The ground beyond the road is its picture's edge, step 0, in the course's first palette.
    outputs.file(`images/${sky}.json`, JSON.stringify(polePositionIISky(p, c, sky, palette(palettes[c]![0]!)[0]!)));
    const laid = layCourse({
      id: names[c]!.toLowerCase(),
      name: names[c]!,
      lap,
      crossSection: across,
      sky,
      laps: LAPS,
      // The cars by the second program's rule, each at its curve table position behind the line, beside P as an object.
      grid: {
        rule: (k) => ({
          ahead: grid.behind(k) === 0 ? 0 : station(tables[c]!.length * HIGH_UNITS - grid.behind(k)) - length,
          right: -grid.lateral(k) * lateralMetres,
        }),
      },
      interval,
      startLine: rows,
      objects: [...objects, ...placed],
      skyYawOrigin: skyFacing(p),
      lane: LANE,
      leastLaneRadius,
    });
    outputs.course(id, laid.document);
    outputs.crestTrials(id, crestTrials(laid.heights, laid.write));
    const path = new CoursePath(pieces);
    const tightest = Math.min(...path.elements.filter((e) => e.turn !== 0).map((e) => e.length / Math.abs(e.turn)));
    if (tightest < leastLaneRadius) throw contractUnmet(`${names[c]}'s tightest arc is tighter than its lanes keep`);
    return {
      course: `courses/${id}.course.json`,
      name: names[c],
      intervals: intervals.length,
      pieces: path.elements.length,
      length: round3(path.length),
      sections: laid.sections,
      valueCurvature: Number(scale.toPrecision(4)),
      tightestRadius: round1(tightest),
      objects: objects.length,
      nearestObjects: round1(nearest(objects.map((o) => path.aside(o.s, o.lateral)))),
      placed: placed.map((o) => ({
        image: o.image,
        s: round3(o.s),
        lateral: round3(o.lateral),
        height: round3(o.height),
        body: o.body === null ? null : round3(o.body),
      })),
      gridFromLine: [laid.grid[0]!, laid.grid.at(-1)!].map((slot) => round3(length - slot.s)),
      craft: craftReport(new CoursePath(pieces), laid.grid[0] as { s: number; lateral: number }, craftAt, lowest),
      gantryFromLine: round3(placed.find((o) => o.kind === GANTRY)!.s - rows[0]!.from),
      ...report,
    };
  });
  return {
    outputs,
    report: {
      names,
      speedFactor: factor,
      intervalMetres: round3(metres),
      laps: LAPS,
      boards: boards.map((b) => ({ name: b.name, colored: round3(b.colored), width: round3(b.width) })),
      objectImages: objectImages.map((o) => ({ name: o.name, width: round3(o.width), bytes: o.image.bytes.length })),
      lateralMetres: Number(lateralMetres.toPrecision(5)),
      pixelMetres: Number(pixelMetres.toPrecision(5)),
      // A row's first and second cars' laterals, metres right of P, and the player's x in those places.
      grid: { right: [0, 1].map((k) => round3(-grid.lateral(k) * lateralMetres)), playerX: grid.x },
      courses,
    },
  };
}

export const POLE_POSITION_II_CONVERSION: Conversion = (set) => {
  const { outputs, report } = polePositionIICourses(set);
  return { outputs, report: { conversion: POLE_POSITION_II_CONVERSION_VERSION, ...report } };
};
