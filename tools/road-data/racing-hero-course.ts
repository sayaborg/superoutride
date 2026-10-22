/**
 * RACING HERO's courses from its ROMs ([Original road data](../../docs/original-road-data.md#racing-heros-courses)):
 * each country's three sections' road tables laid one after another from the entry with a straight past its goal, the
 * road level but for the crossings' bumps; its lanes, materials and limits; the road's surface, its marks and the water
 * as Strips over a transparent ground; its Sections, sky, checkpoint, finish and grid.
 */
import { requireInput } from '../course/authoring-io.js';
import { computedValue } from '../authoring/course-joints.js';
import { CAMERA_DEFINITION } from '../../src/view/camera-definition.js';
import { MAXIMUM_VEHICLE_REACH } from '../../src/course/course-coordinate-domain.js';
import type { ZipFile } from './zip.js';
import { sectionProfile } from './outrun-course.js';
import { bendOf, profileOf, separatedCrossings } from './road-profile.js';
import { crossingsOf, overlappingCells } from './crossings.js';
import { bakeFittedSky, pixelDifference, SKY_WIDTH, wholeRepeats } from './sky-baking.js';
import { paletteRgb555 } from './road-tables.js';
import { spritePixels } from './sprite-pixels.js';
import { CoursePath, type PathElement } from './super-hang-on-geometry.js';
import { domainCuts, writtenPlan, type WrittenElement } from './super-hang-on-course.js';
import { otherPassages } from './enduro-racer-course.js';
import { cutsByCount, meanColor, ramped, SPRITE_ELEMENTS, STRIP_ELEMENTS } from './super-monaco-gp-course.js';
import { assembleRacingHeroMain, assembleRacingHeroSprites, assembleRacingHeroTiles } from './racing-hero-rom.js';
import {
  COUNTRIES,
  countrySections,
  expandObjects,
  readDescription,
  readObjects,
  readRoad,
  type RoadEntry,
} from './racing-hero-road.js';
import {
  EMPTY_DEFINITION,
  pictureSize,
  pixelUnits,
  readDefinition,
  readSpritePalette,
  SURFACE_ROUTINES,
  typeDefinition,
} from './racing-hero-sprites.js';
import { racingHeroSkyLayers, spritePaletteSet } from './racing-hero-backgrounds.js';
import { boardName, boardPalette, racingHeroBoards } from './racing-hero-boards.js';
import {
  drawnParts,
  objectX,
  sectionSpots,
  spotBox,
  spotLateralUnits,
  WATER_TYPE,
  type DrawnPart,
  type Spot,
} from './racing-hero-objects.js';

/** The conversion's version, recorded in the specification beside the courses it wrote. */
export const RACING_HERO_CONVERSION_VERSION = 2;

/**
 * A position, metres: the displayed km/h is 317/1024 of 16 positions a tick, a tick two of the clock's 60 frames a
 * second, so a second of 30 ticks runs 30 positions while the km/h is 4.953 a position a tick.
 */
export const POSITION_METRES = (16 * 317) / 1024 / 3.6 / 30;
/** A step: eight positions, the road table read once a step. */
const STEP = 8;
const STEP_METRES = STEP * POSITION_METRES;
/** A lateral unit, metres: the road's picture's lanes about 3.5 m. */
export const UNIT = 0.0065;
/** The original's pixels are 14 wide to 15 tall: its heights grow by this. */
export const UNIT_DOWN = (UNIT * 15) / 14;
/** A radius r's curve, which the sub CPU takes from the road's lateral slope each step (×512 a unit). */
const CURVE_DIVIDEND = 0x28be0;
export const curveOf = (radius: number) => (radius === 0 ? 0 : (Math.trunc(CURVE_DIVIDEND / radius) + 8) >> 4);
/** P's turn over a road entry, radians, left positive: a step turns CURVE × unit / (512 × a step's metres). */
const turnOf = (entry: RoadEntry) => ((-curveOf(entry.radius) * UNIT) / (512 * STEP_METRES)) * (entry.length / STEP);
/** The straight before GO (metres): the camera's distance behind the bike, as ENDURO RACER's. */
const ENTRY = 6;
/** The straight past the goal's section, positions: every vehicle stops before the course's end. */
const RUN_OUT = 6400;
/** The lanes, 392 units each either side of P, their centres in the original's three lanes' middle one. */
const LANE = 392 * UNIT;
const OFFSET = LANE / 2;
/** The goal's run out's road type. */
const RUN_OUT_TYPE = 7;
/**
 * The limits, units from P each side by road type: the fences' (and walls') inner faces, where the original's bike is
 * pushed back (its centre held within 624 and 368).
 */
const LIMITS: ReadonlyMap<number, number> = new Map([
  [4, 688],
  [3, 406],
  [7, 688],
]);
/** A road type's limit moves to the next's over the two steps either side of their border, positions. */
const LIMIT_RAMP = 2 * STEP;
/** A mark lies on the road this many positions before its surface object's point, as the original's eye sees it. */
const MARK_POSITIONS = 20;
/** A surface picture's marks are its pixels 6 and 7 (its top five rows), painted where they differ from its surface. */
const MARK_PIXELS = Object.freeze(new Set([6, 7]));
const MARK_SEEN = 0.1;
/** The run out's surface past the goal's section's last surface object: type C68's, without its marks. */
const RUN_OUT_SURFACE = 0xc68;
/** A water run goes on over gaps of at most this many positions. */
const WATER_GAP = 256;
/** The goal's section's scenery left out: the figures standing on the road after the goal and the row closing it. */
const AFTER_GOAL = Object.freeze([
  [800, 1256],
  [1760, 1832],
] as const);
/** Where the checkpoint and the finish stand: the CHECK and GOAL banners' position in B and the goal's section. */
const GATE_POSITION = 480;
/** Passages at least this far apart along the road may cross, metres; a passage runs on over gaps of this many steps. */
const PASSAGES_APART = 200;
const PASSAGE_GAP = 3;
/** An object on a curve's inside stands only within this of the curve's centre's distance (metres). */
const INSIDE_MARGIN = 2;
/** The grids: their slots, the last at GO in lane a, cars this far apart, bikes this. */
const GRID_SLOTS = 16;
const CAR_SPACING = 12;
const BIKE_SPACING = 3;
/**
 * The background on the sky: the original's heading turns 1/(2r) radians a step where P turns CURVE × UNIT /
 * (512 × a step's metres), CURVE about 0x28BE0 / (16r); the horizon's layers, 1280 pixels at speed 0x200, move
 * 4 × speed pixels a turn of the original's heading. Of their repeats in a turn of the plane, the whole number nearest
 * sets σ, the sky's pixels an original pixel across, so that they repeat whole in the sky's width.
 */
const HEADING_RATIO = (0.5 * 512 * STEP_METRES * 16) / (CURVE_DIVIDEND * UNIT);
const HORIZON_LAYER = { width: 1280, speed: 0x200 } as const;
export const SKY_REPEATS = Math.round(((4 * HORIZON_LAYER.speed) / HORIZON_LAYER.width) * HEADING_RATIO);
export const SKY_SCALE = SKY_WIDTH / (SKY_REPEATS * HORIZON_LAYER.width);
/** The skies' horizon row, the generic skies'; the background's point straight ahead at the race's start is column 0. */
const SKY_HORIZON = 320;
const SKY_AT_START = 0;

const round = (value: number, step = 1e-6) => Number((Math.round(value / step) * step).toFixed(6));
/** Stations nearer than this are one: ten times the micrometre stations are written to. */
const EPSILON = 1e-5;
/** Course positions nearer than this are one (a Section's ends are found from P's metres). */
const POSITION_HAIR = 1e-6;

export type RacingHeroCountry = (typeof COUNTRIES)[number];
export const courseId = (country: RacingHeroCountry) => `racing-hero-${country.id}`;
export const skyName = (country: RacingHeroCountry) => `rachero-${country.id}-sky`;
const SECTION_IDS = ['a', 'b', 'goal'] as const;

/** Every country's course document and report and its sky, from the ROM set's files by CRC-32. */
export function racingHeroCourses(files: ReadonlyMap<number, ZipFile>) {
  const main = assembleRacingHeroMain(files);
  const words = assembleRacingHeroSprites(files);
  const tiles = assembleRacingHeroTiles(files);
  const courses = COUNTRIES.map((country) => {
    const { layers, ramp } = racingHeroSkyLayers(main, tiles, country.section);
    return {
      ...racingHeroCourse(main, words, country),
      sky: {
        name: skyName(country),
        document: bakeFittedSky(skyName(country), layers, ramp, SKY_SCALE),
        layers: layers.map((l) => ({
          kind: l.kind,
          speed: l.speed,
          width: l.width,
          bottom: l.bottom,
          start: l.start,
          ...wholeRepeats(l.width, SKY_SCALE),
        })),
      },
    };
  });
  const boards = racingHeroBoards(
    main,
    words,
    courses.flatMap((c) => c.spots.map((spot) => ({ spot, set: c.set }))),
    UNIT,
  );
  return { courses, boards };
}

/** A surface type's look: its surface's half-width (units), its color and its marks across, each with its color. */
interface SurfaceLook {
  readonly half: number;
  readonly color: number;
  readonly marks: readonly { readonly from: number; readonly to: number; readonly color: number }[];
}

/** One section of a country: its course position's start, its road, objects and road type at a position. */
interface Part {
  readonly start: number;
  readonly length: number;
  readonly road: readonly RoadEntry[];
  readonly roadType: (position: number) => number;
}

function racingHeroCourse(main: Uint8Array, words: Uint32Array, country: RacingHeroCountry) {
  const id = courseId(country);
  const set = spritePaletteSet(main, country.section);
  const descriptions = countrySections(main, country.section).map((k) => readDescription(main, k));
  const parts: Part[] = [];
  for (const d of descriptions) {
    const road = readRoad(main, d.road).entries;
    const start = parts.length ? parts.at(-1)!.start + parts.at(-1)!.length : 0;
    const roadType = (position: number) => {
      let at = 0;
      for (const e of road) if (position < (at += e.length)) return e.type & 7;
      return road.at(-1)!.type & 7;
    };
    parts.push({ start, length: road.reduce((sum, e) => sum + e.length, 0), road, roadType });
  }
  const goalPart = parts[2]!;
  const last = goalPart.start + goalPart.length;
  const total = last + RUN_OUT;
  /** The road type at course position q: the entry's A's first, the run out's 7. */
  const typeAt = (q: number) => {
    if (q >= last) return RUN_OUT_TYPE;
    const part = [...parts].reverse().find((p) => q >= p.start) ?? parts[0]!;
    return part.roadType(Math.max(0, q - part.start));
  };

  // P: the entry's straight, each road entry an element (equal curves one after another one), the run out's straight.
  const elements: PathElement[] = [];
  const curves: number[] = [];
  const push = (length: number, turn: number, curve: number) => {
    const end = elements.length ? elements.at(-1)!.start + elements.at(-1)!.length : 0;
    if (curves.at(-1) === curve) {
      const e = elements.at(-1)!;
      elements[elements.length - 1] = { ...e, length: e.length + length, turn: e.turn + turn };
    } else {
      elements.push({ start: end, length, turn });
      curves.push(curve);
    }
  };
  push(ENTRY, 0, 0);
  for (const part of parts) for (const e of part.road) push(e.length * POSITION_METRES, turnOf(e), curveOf(e.radius));
  push(RUN_OUT * POSITION_METRES, 0, 0);
  const path = new CoursePath(elements, OFFSET);
  const along = (q: number) => ENTRY + q * POSITION_METRES;
  const stationOf = (q: number) => path.station(along(q));
  const positionAt = (u: number) => (u - ENTRY) / POSITION_METRES;

  // The surface types' looks, in the country's palette set.
  const looks = new Map<number, SurfaceLook>();
  const lookOf = (t: number, mirrored: boolean): SurfaceLook | null => {
    const key = t * 2 + (mirrored ? 1 : 0);
    if (!looks.has(key)) {
      const surface = drawnParts(main, t, mirrored).filter((p) => p.y === 0);
      if (!surface.length) return null;
      looks.set(key, surfaceLook(main, words, surface, pixelUnits(readDefinition(main, t).routine), set));
    }
    return looks.get(key)!;
  };
  const isEmpty = (t: number) => typeDefinition(main, t) === EMPTY_DEFINITION;

  // The surface objects in running order: each a type with its look at its course position.
  const surfaceObjects = descriptions.flatMap((d, k) =>
    expandObjects(readObjects(main, d.surface))
      .filter((o) => o.position < parts[k]!.length && !isEmpty(o.type))
      .flatMap((o) => {
        if (!SURFACE_ROUTINES.has(readDefinition(main, o.type).routine)) return [];
        const look = lookOf(o.type, (o.flags & 0x20) !== 0);
        return look ? [{ q: parts[k]!.start + o.position, type: o.type, look }] : [];
      }),
  );
  const runOutLook = lookOf(RUN_OUT_SURFACE, false)!;
  /** The surface's stretches: each object's from the one before it (the first's from the entry), the run out's last. */
  const surfaces: { from: number; to: number; look: SurfaceLook; marks: boolean }[] = [];
  surfaceObjects.forEach((o, k) =>
    surfaces.push({
      from: k ? surfaceObjects[k - 1]!.q : -ENTRY / POSITION_METRES,
      to: o.q,
      look: o.look,
      marks: true,
    }),
  );
  surfaces.push({ from: surfaceObjects.at(-1)!.q, to: total, look: { ...runOutLook, marks: [] }, marks: false });
  /** The visible road's half-width at course position q, units: the surface stretch's there. */
  const visibleAt = (q: number) => (surfaces.find((s) => q >= s.from && q < s.to) ?? surfaces.at(-1)!).look.half;

  const water = waterColor(main, words, set);
  // The water: the scenery's runs of 0EC each side, a Strip from the run's first object to past its last by the gap
  // before it, its inner edge each object's X.
  const waters = descriptions.flatMap((d, k) => {
    const objects = expandObjects(readObjects(main, d.scenery)).filter(
      (o) => o.type === WATER_TYPE && o.position < parts[k]!.length,
    );
    return [1, -1].flatMap((side) => {
      const runs: { q: number; x: number }[][] = [];
      for (const o of objects.filter((o) => Math.sign(o.lateral) === side)) {
        const q = parts[k]!.start + o.position;
        const run = runs.at(-1);
        const knot = { q, x: objectX(o.lateral, parts[k]!.roadType(o.position)) };
        if (run && q - run.at(-1)!.q <= WATER_GAP) run.push(knot);
        else runs.push([knot]);
      }
      return runs.map((run) => {
        const gap = run.length > 1 ? run.at(-1)!.q - run.at(-2)!.q : WATER_GAP;
        return { side, knots: [...run, { q: run.at(-1)!.q + gap, x: run.at(-1)!.x }], color: water };
      });
    });
  });

  // The objects RH-4 stands: each section's by its tables, then none on a curve's inside past its centre less
  // INSIDE_MARGIN, none on another passage's visible road.
  const onOtherPassage = otherPassages(path, (u) => visibleAt(positionAt(u)) * UNIT);
  const spots: (Spot & { readonly lateral: number })[] = [];
  const left: { position: number; type: number; why: string }[] = [];
  descriptions.forEach((d, k) => {
    const part = parts[k]!;
    const found = sectionSpots(
      main,
      {
        start: part.start,
        length: part.length,
        roadType: part.roadType,
        scenery: expandObjects(readObjects(main, d.scenery)),
        surface: expandObjects(readObjects(main, d.surface)),
        hidden: k === 2 ? AFTER_GOAL : [],
      },
      isEmpty,
    );
    left.push(...found.left);
    for (const spot of found.spots) {
      const lateral = spotLateralUnits(spot) * UNIT;
      const u = along(spot.position);
      const e = elements.find((el) => u >= el.start && u < el.start + el.length) ?? elements.at(-1)!;
      const radius = e.turn === 0 ? Infinity : e.length / Math.abs(e.turn);
      if ((e.turn < 0 ? lateral : -lateral) > radius - INSIDE_MARGIN)
        left.push({ position: spot.position, type: spot.type, why: "on a curve's inside" });
      else if (onOtherPassage(u, lateral, 0))
        left.push({ position: spot.position, type: spot.type, why: "on another passage's road" });
      else spots.push({ ...spot, lateral });
    }
  });

  // The crossings: passages at least 200 m apart whose visible roads overlap, kept apart on the level road.
  const pairs = overlappingCells(path, {
    from: 0,
    to: path.length,
    step: STEP_METRES,
    sides: (u) => {
      const half = visibleAt(positionAt(u)) * UNIT;
      return [half, half];
    },
    apart: PASSAGES_APART,
  }).map(([a, b]) => [path.station(a), path.station(b)] as [number, number]);
  const crossings = crossingsOf(pairs, PASSAGE_GAP * STEP_METRES);
  const separated = separatedCrossings([], crossings, path.planeLength);

  // The limits each side, units from P, by course position: the road type's, moving to the next type's over the two
  // steps either side of their border.
  const borders = [...new Set([...parts.flatMap((p) => roadBorders(p)), last])]
    .filter((q) => LIMITS.get(typeAt(q - 1)) !== LIMITS.get(typeAt(q)))
    .sort((a, b) => a - b);
  const limitAt = (q: number) => {
    for (const b of borders)
      if (Math.abs(q - b) <= LIMIT_RAMP)
        return ramped(LIMITS.get(typeAt(b - 1))!, LIMITS.get(typeAt(b))!, b, LIMIT_RAMP, q);
    return LIMITS.get(typeAt(q))!;
  };

  // The Sections: A, B and the goal's with the run out, each cut where its sprites or Strips would pass the format's
  // bounds, then where its coordinate domain passes over itself.
  const gates = [0, parts[1]!.start + GATE_POSITION, goalPart.start + GATE_POSITION];
  const gateMetres = gates.map(along);
  const reach = Math.max(...LIMITS.values()) * UNIT + MAXIMUM_VEHICLE_REACH;
  const context: Layout = {
    path,
    stationOf,
    along,
    positionAt,
    total,
    surfaces,
    waters,
    limitAt,
    borders,
  };
  const pieces: Piece[] = [];
  parts.forEach((part, k) => {
    const from = k === 0 ? -ENTRY / POSITION_METRES : part.start;
    const to = k === 2 ? total : parts[k + 1]!.start;
    const inside = spots
      .filter((s) => s.position >= from && s.position < to)
      .map((s) => s.position)
      .sort((a, b) => a - b);
    const cuts = cutsByCount(inside, SPRITE_ELEMENTS, (c) =>
      [from, ...c].every((a, j) => stripsOf(context, a, c[j] ?? to).strips.length <= STRIP_ELEMENTS),
    );
    const stem = SECTION_IDS[k]!;
    const counted = [from, ...cuts].map((a, j) => ({ from: along(a), to: along(cuts[j] ?? to) }));
    const ends = counted.flatMap(({ from: a, to: b }) => {
      const domain = domainCuts(path, a, b, reach, gateMetres, true);
      return [a, ...domain].map((x, j) => ({ from: x, to: domain[j] ?? b }));
    });
    ends.forEach((e, j) => pieces.push({ id: j === 0 ? stem : `${stem}-${j + 1}`, ...e }));
  });
  requireInput(pieces.length <= 128, `/${id}`, 'The course has more Sections than the format holds');

  // Each Section's plan as written, and its start: the lengths written before it, so seams agree exactly.
  const written = pieces.map((piece) => writtenPlan(path, piece));
  const origins = written.reduce((o, plan) => [...o, o.at(-1)! + plan.reduce((sum, e) => sum + e.length, 0)], [0]);
  const profile = profileOf(separated.changes.map(bendOf), origins.slice(1, -1));
  const startHeading = path.pose(along(0)).heading;
  // The sprites: each at its position's station and its picture's middle across, standing on its picture's bottom
  // edge: the object's height less the rows its picture reaches below the point.
  const sprites = spots.map((spot) => ({
    position: spot.position,
    s: stationOf(spot.position),
    lateral: spot.lateral,
    image: boardName(spot),
    palette: boardPalette(spot.parts[0]!.palette, set),
    groundOffset: (spot.height - spotBox(spot).bottom * spot.pixel) * UNIT_DOWN,
  }));
  const documents = pieces.map((piece, i) =>
    sectionDocument(piece, {
      layout: context,
      country,
      elements: written[i]!,
      origin: origins[i]!,
      first: i === 0,
      last: i === pieces.length - 1,
      profile,
      checkpoint: { id: `${id}-CP1`, s: stationOf(gates[1]!) },
      finish: { id: `${id}-GOAL`, s: stationOf(gates[2]!) },
      grid: stationOf(0),
      startHeading,
      sprites: sprites.filter(
        (o) => o.position >= positionAt(piece.from) - 1e-9 && o.position < positionAt(piece.to) - 1e-9,
      ),
    }),
  );
  const links = pieces.slice(1).map((piece, i) => ({
    id: `${pieces[i]!.id}-${piece.id}`,
    from: { section: pieces[i]!.id, lane: 'a' },
    to: piece.id,
  }));
  return {
    country,
    id,
    document: {
      format: 'superoutride.course',
      version: 52,
      name: country.name,
      entry: pieces[0]!.id,
      maxLaps: 1,
      bearing: 0,
      sections: documents,
      links,
    },
    path,
    parts,
    pieces: pieces.map((piece, i) => ({
      ...piece,
      origin: origins[i]!,
      sprites: spots.filter((s) => along(s.position) >= piece.from && along(s.position) < piece.to).length,
      strips: (documents[i]!.strips as unknown[]).length,
    })),
    curves,
    profile,
    stationOf,
    spots,
    left,
    waters,
    set,
    crossings: crossings.map((crossing, k) => {
      const moves = separated.separations.filter((m) => m.crossing === k);
      return {
        passages: crossing.passages,
        levels: moves[0]?.levels ?? null,
        held: moves[0]?.held ?? null,
        half: moves[0]?.half ?? null,
        moves: moves.length,
        heights: crossing.passages.map((p) => profile.height((p.from + p.to) / 2)),
      };
    }),
    runOut: path.planeLength - stationOf(gates[2]!),
    steepest: steepestGrade(profile, path.planeLength),
  };
}

/** The profile's steepest grade over stations [0, end], sampled every metre. */
function steepestGrade(profile: ReturnType<typeof profileOf>, end: number): number {
  let steepest = 0;
  for (let s = 0; s <= end; s++) steepest = Math.max(steepest, Math.abs(profile.grade(s)));
  return steepest;
}

/** A part's road types' borders, course positions: where an entry's type differs from the one before it. */
function roadBorders(part: Part): number[] {
  const out: number[] = [];
  let at = part.start;
  part.road.forEach((e, k) => {
    if (k && (e.type & 7) !== (part.road[k - 1]!.type & 7)) out.push(at);
    at += e.length;
  });
  return [part.start, ...out];
}

/** A surface type's look from its surface parts: their colored half-width, mean color and marks, in palette set `set`. */
function surfaceLook(
  main: Uint8Array,
  words: Uint32Array,
  surface: readonly DrawnPart[],
  pixel: number,
  set: 'A' | 'B',
): SurfaceLook {
  // The parts drawn together, the first on top: each column's pixels and their colors.
  const left = Math.min(...surface.map((p) => p.x)),
    right = Math.max(...surface.map((p) => p.x + p.width));
  const height = Math.max(...surface.map((p) => p.height));
  const width = right - left;
  const grid = new Int16Array(width * height).fill(-1);
  const colors = new Int32Array(width * height);
  for (const part of [...surface].reverse()) {
    const pixels = spritePixels(words, pictureSize(main, part.picture));
    const rgb = readSpritePalette(main, part.palette, set).words.map(paletteRgb555);
    for (let y = 0; y < part.height; y++)
      for (let x = 0; x < part.width; x++) {
        const v = pixels[y * part.width + (part.mirrored ? part.width - 1 - x : x)]!;
        if (!v) continue;
        const i = y * width + part.x - left + x;
        grid[i] = v;
        colors[i] = rgb[v]!;
      }
  }
  const plain: number[] = [],
    marked: number[] = [];
  const markColumns = new Set<number>();
  let lo = Infinity,
    hi = -Infinity;
  grid.forEach((v, i) => {
    if (v < 0) return;
    const x = i % width;
    lo = Math.min(lo, x);
    hi = Math.max(hi, x + 1);
    if (MARK_PIXELS.has(v)) {
      marked.push(colors[i]!);
      markColumns.add(x);
    } else plain.push(colors[i]!);
  });
  const color = meanColor(plain);
  const marks: { from: number; to: number; color: number }[] = [];
  const columns = [...markColumns].sort((a, b) => a - b);
  for (let k = 0; k < columns.length;) {
    let j = k;
    while (j + 1 < columns.length && columns[j + 1] === columns[j]! + 1) j++;
    const [a, b] = [columns[k]!, columns[j]! + 1];
    const pixels: number[] = [];
    grid.forEach((v, i) => {
      const x = i % width;
      if (MARK_PIXELS.has(v) && x >= a && x < b) pixels.push(colors[i]!);
    });
    marks.push({ from: (a + left) * pixel, to: (b + left) * pixel, color: meanColor(pixels) });
    k = j + 1;
  }
  return {
    half: Math.max(-(lo + left), hi + left) * pixel,
    color,
    marks: marks.filter((m) => pixelDifference(m.color, color) >= MARK_SEEN),
  };
}

/** The water's color: the mean of its largest size's colored pixels, in palette set `set`. */
function waterColor(main: Uint8Array, words: Uint32Array, set: 'A' | 'B'): number {
  const out: number[] = [];
  for (const part of drawnParts(main, WATER_TYPE, false)) {
    const rgb = readSpritePalette(main, part.palette, set).words.map(paletteRgb555);
    for (const v of spritePixels(words, pictureSize(main, part.picture))) if (v) out.push(rgb[v]!);
  }
  return meanColor(out);
}

/** What every Section of a course is written from. */
interface Layout {
  readonly path: CoursePath;
  readonly stationOf: (q: number) => number;
  readonly along: (q: number) => number;
  readonly positionAt: (u: number) => number;
  readonly total: number;
  readonly surfaces: readonly { from: number; to: number; look: SurfaceLook; marks: boolean }[];
  readonly waters: readonly {
    readonly side: number;
    readonly knots: readonly { readonly q: number; readonly x: number }[];
    readonly color: number;
  }[];
  readonly limitAt: (q: number) => number;
  readonly borders: readonly number[];
}

/** One Section to write: its id and P's metres it spans. */
interface Piece {
  readonly id: string;
  readonly from: number;
  readonly to: number;
}

type Lateral = number | { readonly boundary: string; readonly offset: number } | null;
/** A Strip over course positions [from, to], laterals units from P (null open), and a Boundary's knots by position. */
interface StripSpan {
  readonly from: number;
  readonly to: number;
  readonly left: number | string | null;
  readonly right: number | string | null;
  readonly color: number | null;
  readonly material: string | null;
}

/**
 * The Strips and Boundaries over course positions [from, to] (the Section's), in drawing order: the water, the road's
 * material between the limits, the surface's colors (equal ones one after another one), the marks.
 */
function stripsOf(layout: Layout, from: number, to: number) {
  const strips: StripSpan[] = [];
  const boundaries: { id: string; knots: { q: number; units: number }[] }[] = [];
  const clip = (a: number, b: number) => [Math.max(a, from), Math.min(b, to)] as const;
  // The water: its inner edge a Boundary through its objects' X (positive left, so −X right of P), a number where
  // the X does not change; its outer edge open.
  layout.waters.forEach((water, w) => {
    const [a, b] = clip(water.knots[0]!.q, water.knots.at(-1)!.q);
    if (b - a <= POSITION_HAIR) return;
    const xs = new Set(water.knots.map((k) => k.x));
    let edge: number | string;
    if (xs.size === 1) edge = -water.knots[0]!.x;
    else {
      const id = `water-${w + 1}`;
      const xAt = (q: number) => {
        const k = water.knots.findIndex((knot) => knot.q >= q);
        if (k <= 0) return water.knots[Math.max(k, 0)]!.x;
        const [p, n] = [water.knots[k - 1]!, water.knots[k]!];
        return p.x + ((n.x - p.x) * (q - p.q)) / (n.q - p.q);
      };
      // Knots within a hair of the ends (a cut at an object's position) are the ends'.
      const inner = water.knots
        .filter((k) => k.q > a + POSITION_HAIR && k.q < b - POSITION_HAIR)
        .map((k) => ({ q: k.q, units: -k.x }));
      boundaries.push({ id, knots: [{ q: a, units: -xAt(a) }, ...inner, { q: b, units: -xAt(b) }] });
      edge = id;
    }
    const [left, right] = water.side > 0 ? [null, edge] : [edge, null];
    strips.push({ from: a, to: b, left, right, color: water.color, material: null });
  });
  // The road's material between the limits.
  const knots = [from, ...layout.borders.flatMap((b) => [b - LIMIT_RAMP, b + LIMIT_RAMP]), to]
    .filter((q) => q >= from && q <= to)
    .sort((a, b) => a - b);
  const limits = [...new Set(knots)];
  boundaries.push(
    { id: 'limit-left', knots: limits.map((q) => ({ q, units: -layout.limitAt(q) })) },
    { id: 'limit-right', knots: limits.map((q) => ({ q, units: layout.limitAt(q) })) },
  );
  strips.push({ from, to, left: 'limit-left', right: 'limit-right', color: null, material: 'ASPHALT' });
  // The surface, each stretch in its type's color and width, equal stretches one after another one.
  let run: { from: number; to: number; look: SurfaceLook } | null = null;
  const flush = () => {
    if (!run) return;
    const [a, b] = clip(run.from, run.to);
    if (b - a > POSITION_HAIR)
      strips.push({
        from: a,
        to: b,
        left: -run.look.half,
        right: run.look.half,
        color: run.look.color,
        material: null,
      });
    run = null;
  };
  for (const s of layout.surfaces) {
    if (run && run.look.color === s.look.color && run.look.half === s.look.half && run.to === s.from) run.to = s.to;
    else {
      flush();
      run = { from: s.from, to: s.to, look: s.look };
    }
  }
  flush();
  // The marks, MARK_POSITIONS before each surface object's point.
  for (const s of layout.surfaces) {
    if (!s.marks) continue;
    const [a, b] = clip(s.to - MARK_POSITIONS, s.to);
    if (b - a <= POSITION_HAIR) continue;
    for (const mark of s.look.marks)
      strips.push({ from: a, to: b, left: mark.from, right: mark.to, color: mark.color, material: null });
  }
  return { strips, boundaries };
}

/** One Section's document. */
function sectionDocument(
  piece: Piece,
  context: {
    readonly layout: Layout;
    readonly country: RacingHeroCountry;
    readonly elements: readonly WrittenElement[];
    readonly origin: number;
    readonly first: boolean;
    readonly last: boolean;
    readonly profile: ReturnType<typeof profileOf>;
    readonly checkpoint: { readonly id: string; readonly s: number };
    readonly finish: { readonly id: string; readonly s: number };
    readonly grid: number;
    readonly startHeading: number;
    readonly sprites: readonly {
      readonly s: number;
      readonly lateral: number;
      readonly image: string;
      readonly palette: string;
      readonly groundOffset: number;
    }[];
  },
) {
  const { layout, elements, origin } = context;
  const { path } = layout;
  // The Section's length is its elements' as written, and every station lies within it.
  const size = elements.reduce((sum, e) => sum + e.length, 0);
  const joint = elements[0]!.id;
  const at = (s: number) => {
    const offset = round(s - origin);
    return { joint, offset: offset > size - EPSILON ? size : Math.max(0, offset) };
  };
  const stationAt = (q: number) =>
    q <= layout.positionAt(piece.from) + 1e-9
      ? origin
      : q >= layout.positionAt(piece.to) - 1e-9
        ? origin + size
        : layout.stationOf(q);
  const lateral = (units: number) => round(OFFSET + units * UNIT);
  const { strips, boundaries } = stripsOf(layout, layout.positionAt(piece.from), layout.positionAt(piece.to));
  const edge = (e: number | string | null): Lateral =>
    e === null ? null : typeof e === 'string' ? { boundary: e, offset: 0 } : lateral(e);

  // The gates.
  const gates: unknown[] = [];
  const inside = (s: number) => s > origin + 1e-6 && s <= origin + size + 1e-6;
  if (context.first)
    gates.push({
      kind: 'start',
      grid: Array.from({ length: GRID_SLOTS }, (_, i) => ({
        at: at(context.grid + (GRID_SLOTS - 1 - i) * CAR_SPACING),
        lane: (GRID_SLOTS - 1 - i) % 2 ? 'b' : 'a',
      })),
      bikeGrid: Array.from({ length: GRID_SLOTS }, (_, i) => ({
        at: at(context.grid + (GRID_SLOTS - 1 - i) * BIKE_SPACING),
        lane: (GRID_SLOTS - 1 - i) % 2 ? 'b' : 'a',
      })),
    });
  if (inside(context.checkpoint.s))
    gates.push({ kind: 'checkpoint', id: context.checkpoint.id, at: at(context.checkpoint.s) });
  if (inside(context.finish.s)) gates.push({ kind: 'finish', id: context.finish.id, at: at(context.finish.s) });

  // The sky: the country's, its background's point straight ahead at the race's start at the sky's column 0, facing
  // the world as the course's start does.
  const theta0 = context.startHeading - path.pose(piece.from).heading;
  let yaw = ((-theta0 - (SKY_AT_START - CAMERA_DEFINITION.centerX) / CAMERA_DEFINITION.focalLength) * 180) / Math.PI;
  const period = ((SKY_WIDTH / CAMERA_DEFINITION.focalLength) * 180) / Math.PI;
  while (yaw < -360) yaw += period;
  while (yaw > 360) yaw -= period;

  return {
    id: piece.id,
    plan: elements,
    profile: sectionProfile(context.profile, origin, origin + size, !context.first, !context.last).map(
      ({ s, y, curveLength }) => ({ at: { joint, offset: computedValue(s - origin) }, y, curveLength }),
    ),
    lanes: [
      { kind: 'lane', id: 'a', width: round(LANE) },
      { kind: 'lane', id: 'b', width: round(LANE) },
    ],
    centerLane: 'a',
    boundaries: boundaries.map((b) => ({
      id: b.id,
      knots: b.knots.map((k) => ({ at: at(stationAt(k.q)), lateral: lateral(k.units) })),
    })),
    strips: strips.map((s) => ({
      kind: 'strip',
      start: at(stationAt(s.from)),
      end: at(stationAt(s.to)),
      left: edge(s.left),
      right: edge(s.right),
      color: s.color,
      material: s.material,
    })),
    walls: [],
    openLimits: [],
    sprites: [...context.sprites]
      .sort((a, b) => a.s - b.s || a.lateral - b.lateral)
      .map((o) => ({
        kind: 'sprite',
        image: o.image,
        palette: o.palette,
        at: at(o.s),
        lateral: round(OFFSET + o.lateral),
        groundOffset: round(o.groundOffset),
        unselectedLink: null,
        body: null,
      })),
    environments: [
      {
        at: at(origin),
        name: context.country.name,
        background: { image: skyName(context.country), horizonY: SKY_HORIZON, yawOrigin: round(yaw) },
        arrival: 'cut',
      },
    ],
    gates,
  };
}
