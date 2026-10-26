/**
 * ENDURO RACER's course from its ROMs ([ENDURO RACER road data](../../docs/enduro-racer-road-data.md#enduro-racers-course)):
 * the five stages' road paths laid one after another from the entry and a straight past the goal, the road on them level
 * but for the crossings' bumps, its colors, stripes and materials, its Sections, skies, checkpoints, finish and grid.
 */
import { requireInput } from '../course/authoring-io.js';
import { computedValue } from '../authoring/course-joints.js';
import { CAMERA_DEFINITION } from '../../src/view/camera-definition.js';
import { COURSE_DOCUMENT_VERSION } from '../../src/course/course-document.js';
import { cameraDistance } from '../../src/view/camera.js';
import type { RomSet } from './rom-set.js';
import { paletteName } from './pixel-grid.js';
import { bySlope, moundKinks, slopeColor, type Mound, type Slope } from './jump-mound.js';
import { bendOf, profileOf, sectionProfile, type Change } from './road-profile.js';
import { placedChanges, screenPieces } from './screen-pieces.js';
import { crossingsOf, partedCrossings, roadCells } from './crossings.js';
import { BACK_WIDTH, bakeSky, SKY_WIDTH } from './sky-baking.js';
import { stageSky } from './enduro-racer-backgrounds.js';
import {
  evenly,
  headingPlan,
  pathHeadings,
  planFidelity,
  VECTOR_RESOLUTION,
  type PlanElement,
} from './heading-plan.js';
import { leastLaneRadius } from '../../src/course/plan-clearance.js';
import { CoursePath, type PathElement } from './course-path.js';
import {
  domainCuts,
  micrometre,
  repeated,
  sectionStations,
  WRITTEN_SLACK,
  type WrittenElement,
  writtenPlan,
} from './section-writing.js';
import { type Colors } from './road-tables.js';
import {
  assembleEnduroRacerPrograms,
  assembleEnduroRacerSprites,
  assembleEnduroRacerTiles,
  enduroRacerRoadRom,
} from './enduro-racer-rom.js';
import {
  readGroundColors,
  readRoadColors,
  readRoadPaths,
  readHills,
  readStage3Background,
  readWaterCrossings,
  STAGE_POSITIONS,
  STAGES,
  type WaterCrossing,
} from './enduro-racer-road.js';
import { readJumps, readScenery } from './enduro-racer-scenery.js';
import { bikeAhead, lateralLimit, readGrid } from './enduro-racer-dump.js';
import { ruleGrid, type GridKind, type OriginalPlace } from './grid-rule.js';
import { roadCrossSection, type CrossSection } from './enduro-racer-cross-section.js';
import { enduroRacerBoards } from './enduro-racer-boards.js';
import { enduroRacerObjects, type ObjectSpot } from './enduro-racer-objects.js';

/** The conversion's version, recorded in the specification beside the course it wrote. */
export const ENDURO_RACER_CONVERSION_VERSION = 24;
export const COURSE_ID = 'enduro-racer';
const COURSE_NAME = 'ENDURO RACER';

/** The program's ticks a second. */
const TICKS = 60;
/**
 * One road position, metres: the displayed speed is the speed word in km/h, and each tick of 1/60 s the 16.16 road
 * position gains it × 256.
 */
export const POSITION_METRES = 65536 / (256 * 3.6 * TICKS);
/**
 * A lane, metres, over the road's surface's half: K's 3.8 m (2026-10-26). It is the one measure of ENDURO RACER's sizes
 * across.
 */
export const LANE = 3.8;
/**
 * The ground's material by stage, left and right of P: stage 1's grass, stage 3's water and stage 5's sea (left of P)
 * `WATER`, stages 2's and 4's ground and stage 5's white sand `SAND`.
 */
const GROUND_MATERIALS = [
  { left: 'GRASS', right: 'GRASS' },
  { left: 'SAND', right: 'SAND' },
  { left: 'WATER', right: 'WATER' },
  { left: 'SAND', right: 'SAND' },
  { left: 'WATER', right: 'SAND' },
] as const;
/** The road's material, its surface and edge bands: the original's road is dirt, `WATER` over the water crossings. */
const ROAD_MATERIAL = 'DIRT';
const CROSSING_MATERIAL = 'WATER';
/**
 * The road's stripes: bands A and B change every 2 positions, and from position 0 band B comes first (the sub CPU's
 * colors 0x00FF0000 swapped on the position's bit 1, toggled by the pattern's 27 borders to the road's nearest line).
 */
const STRIPE = 2;
const FIRST_BAND = 1;
/**
 * The straight past the goal, positions after the last stage's: chosen when every vehicle had to stop before the
 * course's end, which the run no longer requires.
 */
const GOAL_POSITIONS = 450;
/** Where the checkpoints and the finish stand: the CHECK banner's and the GOAL board's scenery types. */
const CHECK_TYPE = 0x48;
const GOAL_TYPE = 0x50;
/** The start's gate, positions: the start's templates stand at 1.5. */
const START_GATE = 1.5;
/**
 * The original's hit: a bike within 0x5A lateral units of an object's x either side, whatever the object's width. A
 * body is as wide as that or the object's colored pixels, whichever is narrower.
 */
const HIT_WIDTH = 2 * 0x5a;
/** The skies' horizon row, the generic skies'. */
const SKY_HORIZON = 320;
/**
 * The skies face as the original's backgrounds: at a stage's start heading, the same for every stage, the road's
 * vanishing point shows the back layer's pixel 1281.5 of 1536, here 1281.5 × 1504 / 1536 of the sky's 1504.
 */
const BACK_AT_HEADING = 1281.5;

/** Stations nearer than this are one: ten times the micrometre stations are written to. */
const EPSILON = 1e-5;

/** Stage s's sky (0 from), baked from its background, and its environment's name. */
export const skyName = (stage: number) => `enduror-${stage + 1}-sky`;
const stageName = (stage: number) => `STAGE ${stage + 1}`;

/** The road's colors a stretch shows: each feature's band A and band B, and the ground's left and right of P. */
interface RoadColors {
  readonly surface: readonly [number, number];
  readonly narrow: readonly [number, number];
  readonly middle: readonly [number, number];
}
interface ColorStretch {
  readonly from: number;
  readonly to: number;
  readonly stage: number;
  readonly ground: { readonly left: number; readonly right: number };
  readonly road: RoadColors;
  /** Over a water crossing. */
  readonly wet: boolean;
}

/** One Section to write: its id, P's metres it spans, and its stage (0 from; the goal's the last stage's). */
interface Piece {
  readonly id: string;
  readonly from: number;
  readonly to: number;
  readonly stage: number;
}

const pair = (colors: Colors, k: number) => [colors.rgb555[k]!, colors.rgb555[k + 1]!] as const;

/** ENDURO RACER's normal path's cycle, positions: its slope table is indexed by the position's low byte. */
const CYCLE = 256;
/** The level camera the grades' rule reads ENDURO RACER through stands this far behind the bike, positions. */
const READING_CAMERA = 4.19;
/**
 * A jump ([Original road data](../../docs/original-road-data.md#profile), Jumps and dips): K's rise, 1 m high and 3 m
 * either side of its top (K, 2026-10-26).
 */
const JUMP: Mound = { half: 3, height: 1 };

/** The course's document and report, from the ROM set. */
export function enduroRacerCourse(set: RomSet) {
  const lane = LANE;
  const programs = assembleEnduroRacerPrograms(set);
  const { main, sub } = programs;
  const metres = POSITION_METRES;
  const cross = roadCrossSection(enduroRacerRoadRom(set));
  const unit = lane / cross.surface;
  // The heading table: the stages' road paths in running order, then the goal's straight ahead, as every path ends.
  const paths = readRoadPaths(sub);
  const goal = Array.from({ length: GOAL_POSITIONS }, () => [paths.at(-1)!.x.at(-1)!, paths.at(-1)!.y.at(-1)!]);
  const headings = pathHeadings({
    address: 0,
    x: [...paths.flatMap((p) => p.x), ...goal.map(([x]) => x!)],
    y: [...paths.flatMap((p) => p.y), ...goal.map(([, y]) => y!)],
  });
  const scenery = readScenery(main);
  const checks = scenery.filter((i) => i.type === CHECK_TYPE).map((i) => i.position);
  const [finish] = scenery.filter((i) => i.type === GOAL_TYPE).map((i) => i.position);
  requireInput(
    checks.length === STAGES - 1 && finish !== undefined,
    '/scenery',
    'The scenery has no CHECK banner at each stage after the first, or no GOAL board',
  );
  const water = readWaterCrossings(main).filter((w) => w.frame === 0);
  const skyChanges = [STAGE_POSITIONS, readStage3Background(main), 3 * STAGE_POSITIONS, 4 * STAGE_POSITIONS];
  const camera = cameraDistance(CAMERA_DEFINITION);
  const yawOrigin =
    ((SKY_WIDTH - ((BACK_AT_HEADING * SKY_WIDTH) / BACK_WIDTH - CAMERA_DEFINITION.centerX)) /
      CAMERA_DEFINITION.focalLength) *
    (180 / Math.PI);
  const stages = Array.from({ length: STAGES }, (_, s) => {
    const road = readRoadColors(main, s),
      ground = readGroundColors(main, s);
    return {
      road: { surface: pair(road, 0), narrow: pair(road, 2), middle: pair(road, 4) },
      ground: { left: ground.rgb555[3]!, right: ground.rgb555[1]! },
    };
  });
  const words = assembleEnduroRacerSprites(set);
  const objects = enduroRacerObjects(main, unit);
  // The jumps: K's rise at each (`JUMP`).
  const jumps = readJumps(main).jumps;
  const pictures = enduroRacerBoards(main, words, objects.uses, unit);
  const colored = new Map(pictures.map((p) => [p.name, p.colored]));
  const width = new Map(pictures.map((p) => [p.name, p.width]));
  // A picture shown both on the ground and raised off it shows its `-raised` image raised.
  const split = new Set(pictures.filter((p) => p.split).map((p) => p.name));
  const spots = objects.spots.map((spot) =>
    spot.height !== 0 && split.has(spot.image) ? { ...spot, image: `${spot.image}-raised` } : spot,
  );
  const built = layCourse({
    headings,
    metres,
    unit,
    lane,
    cross,
    entry: camera - bikeAhead(programs) * metres,
    camera,
    go: bikeAhead(programs),
    rivals: readGrid(programs).map((rival) => ({ position: rival.position, x: rival.x * unit })),
    jumps: jumps.map((jump) => jump.position),
    hills: readHills(main).map((hill) => hill.start),
    limit: lateralLimit(programs) * unit,
    checks,
    finish,
    water,
    skyChanges,
    stages,
    yawOrigin,
    spots,
    colored: (image) => colored.get(image)!,
    width: (image) => width.get(image)!,
  });
  // Each stage's sky, baked from its background over its ground's color (stage 5's the sea).
  const planes = assembleEnduroRacerTiles(set);
  const skies = stages.map(({ ground }, s) => ({
    name: skyName(s),
    document: bakeSky(skyName(s), stageSky(main, planes, s, ground.left)),
  }));
  return {
    ...built,
    cross,
    unit,
    metres,
    checks,
    finish,
    yawOrigin,
    pictures,
    skies,
    hitWidth: HIT_WIDTH * unit,
    // The jumps' shape, and how they join.
    jumps: { count: jumps.length, ...JUMP, ...built.mounds },
  };
}

/** What the course is laid from. */
interface CourseInputs {
  /**
   * The heading table: the stages' road paths' headings in running order, then the goal's (radians counterclockwise).
   */
  readonly headings: readonly number[];
  readonly metres: number;
  readonly unit: number;
  /** A lane's width, metres: `LANE`. */
  readonly lane: number;
  readonly cross: CrossSection;
  /** P's metres before position 0; the camera's distance behind the bike; GO, the bike's position at the start. */
  readonly entry: number;
  readonly camera: number;
  readonly go: number;
  /** The jumps' positions. */
  readonly jumps: readonly number[];
  /** The hills' starts, the hills' table's (`readHills`). */
  readonly hills: readonly number[];
  /** The rivals on the grid at GO: their positions and x, metres from P. */
  readonly rivals: readonly { readonly position: number; readonly x: number }[];
  /** The bike's lateral limit, metres either side of P: the ground and the course limits reach it. */
  readonly limit: number;
  /** The checkpoints' and the finish's positions, the water crossings and where the skies change. */
  readonly checks: readonly number[];
  readonly finish: number;
  readonly water: readonly WaterCrossing[];
  readonly skyChanges: readonly number[];
  readonly stages: readonly {
    readonly road: RoadColors;
    readonly ground: { readonly left: number; readonly right: number };
  }[];
  /** The yaw origin of a Section whose start faces the course's start, degrees. */
  readonly yawOrigin: number;
  /** The objects, and each picture's colored width and width, metres. */
  readonly spots: readonly ObjectSpot[];
  readonly colored: (image: string) => number;
  readonly width: (image: string) => number;
}

/** An object placed: its station, lateral, picture, height and body. */
interface Placed {
  readonly s: number;
  readonly lateral: number;
  readonly image: string;
  readonly palette: number;
  readonly groundOffset: number;
  readonly body: number | null;
}

/**
 * The course: P laid from the entry (a straight to position 0, then its heading table's plan); its Sections, one a
 * stage and the goal's, each cut where its road comes near itself; their strips, skies, gates and level
 * profile with the crossings' bumps.
 */
function layCourse(inputs: CourseInputs) {
  const { metres, unit, cross } = inputs;
  /** P's metres at course position `q`: stage s's position p is 2048s + p. */
  const along = (q: number) => inputs.entry + q * metres;
  const last = STAGES * STAGE_POSITIONS;
  const gateMetres = [START_GATE, ...inputs.checks, inputs.finish].map(along);
  // The road's lanes, a lane either side of P, keep the least radius the format lets them keep (`leastLaneRadius`).
  const edges = cross.edges * unit;
  const reach = leastLaneRadius(inputs.lane);

  /**
   * P laid from plan elements `planned` (a straight to position 0, then the plan, straights one after another one), and
   * its Sections: one a stage and the goal's, each cut again where its road comes near itself.
   */
  const lay = (planned: readonly PlanElement[]) => {
    const elements: PathElement[] = [];
    const push = (length: number, turn: number) => {
      const start = elements.length ? elements.at(-1)!.start + elements.at(-1)!.length : 0;
      const last = elements.at(-1);
      if (last && last.turn === 0 && turn === 0)
        elements[elements.length - 1] = { ...last, length: last.length + length };
      else elements.push({ start, length, turn });
    };
    push(inputs.entry, 0);
    for (const e of planned) push((e.to - e.from) * metres, e.turn);
    const path = new CoursePath(elements);
    const pieces: Piece[] = [];
    for (let stage = 0; stage <= STAGES; stage++) {
      const from = stage === 0 ? 0 : along(STAGE_POSITIONS * stage);
      const to = stage === STAGES ? path.length : along(STAGE_POSITIONS * (stage + 1));
      const stem = stage === STAGES ? 'goal' : `stage-${stage + 1}`;
      const cuts = domainCuts(path, from, to, reach, gateMetres, { finish: along(inputs.finish) });
      [from, ...cuts].forEach((a, i) =>
        pieces.push({
          id: i === 0 ? stem : `${stem}-${i + 1}`,
          from: a,
          to: cuts[i] ?? to,
          stage: Math.min(stage, STAGES - 1),
        }),
      );
    }
    return { path, pieces };
  };
  const plan = headingPlan(evenly(inputs.headings), VECTOR_RESOLUTION, metres, () => reach);
  const { path, pieces } = lay(plan.elements);
  const stationOf = along;
  const end = path.length;

  // The colors along the road: each stage's from its start, the road's in the ground's colors over the water.
  const stretches: ColorStretch[] = [];
  inputs.stages.forEach(({ road, ground }, stage) => {
    const from = stage === 0 ? 0 : stationOf(STAGE_POSITIONS * stage);
    const to = stage === STAGES - 1 ? end : stationOf(STAGE_POSITIONS * (stage + 1));
    const wet = inputs.water
      .map((w) => [stationOf(w.from), stationOf(w.to)] as const)
      .filter(([a, b]) => a < to && b > from);
    const water = {
      surface: [ground.left, ground.left],
      narrow: [ground.left, ground.left],
      middle: [ground.left, ground.left],
    } as const;
    let at = from;
    for (const [a, b] of wet) {
      stretches.push({ from: at, to: a, stage, ground, road, wet: false });
      stretches.push({ from: a, to: b, stage, ground, road: water, wet: true });
      at = b;
    }
    stretches.push({ from: at, to, stage, ground, road, wet: false });
  });

  // The objects: each at its position's station, its x right of P, but none whose base point or body stands on another
  // passage's road (to its edge bands' outer edges), which the original never shows together.
  const cells = roadCells(path, { from: 0, to: end, step: metres, sides: () => [edges, edges] });
  const placed: Placed[] = [];
  const dropped: { position: number; x: number; what: string }[] = [];
  const passedThrough: { position: number; x: number; what: string }[] = [];
  for (const spot of inputs.spots) {
    const u = along(spot.position),
      fromP = spot.x * unit;
    // The objects on the road are passed through: the drivers do not steer around them.
    const body = spot.hit && !spot.onRoad ? Math.min(HIT_WIDTH * unit, inputs.colored(spot.image)) : null;
    if (cells.onOtherPassage(u, fromP, (body ?? 0) / 2)) {
      dropped.push({ position: spot.position, x: spot.x, what: spot.what });
      continue;
    }
    if (spot.hit && spot.onRoad) passedThrough.push({ position: spot.position, x: spot.x, what: spot.what });
    placed.push({
      s: u,
      lateral: fromP,
      image: spot.image,
      palette: spot.palette,
      groundOffset: spot.height,
      body,
    });
  }
  requireInput(
    placed.every((o) => o.s < end),
    `/${COURSE_ID}`,
    "An object stands past the course's end",
  );

  // The crossings: passages at least 200 m apart whose roads, to the edge bands' outer edges, overlap, kept apart on the
  // screen's grades.
  const crossings = crossingsOf(cells.pairs, metres);
  const mounds = moundKinks(inputs.jumps.map((position) => ({ top: stationOf(position), ...JUMP })));
  const kinks = mounds.kinks;
  // The grades by the screen's pieces: from position 0 cycle by cycle to the stages' end, stage 3 level, each hill's
  // stretch, from the last cycle start at or before its start, its piece and every other cycle the normal path's, each
  // from the reading camera's place when the road position is its first; level beyond.
  const { enduroRacer: screen } = screenPieces();
  requireInput(screen.hills.length === inputs.hills.length, `/${COURSE_ID}`, "The pieces' hills are not the ROMs'");
  const hillAt = new Map(inputs.hills.map((start, k) => [Math.floor(start / CYCLE) * CYCLE, k]));
  const grades: Change[] = [];
  for (let c = 0; c < last;) {
    const k = hillAt.get(c);
    const piece = k === undefined ? screen.cycle : screen.hills[k]!;
    const cycles = k === undefined ? 1 : screen.hills[k]!.cycles;
    const level = c >= 2 * STAGE_POSITIONS && c < 3 * STAGE_POSITIONS;
    requireInput(
      [...hillAt.keys()].every((h) => h === c || h < c || h >= c + cycles * CYCLE),
      `/${COURSE_ID}`,
      `A hill's stretch from ${c} shares a cycle with another's`,
    );
    if (!level) grades.push(...placedChanges(piece, along(c + inputs.go - READING_CAMERA), end));
    c += cycles * CYCLE;
  }
  const parted = partedCrossings(grades, crossings, end, kinks);
  // Each Section's plan as written, and its start: the lengths written before it, so seams agree exactly.
  const written = pieces.map((piece) => writtenPlan(path, piece));
  const origins = written.reduce((o, plan) => [...o, o.at(-1)! + plan.reduce((sum, e) => sum + e.length, 0)], [0]);
  const profile = profileOf(parted.changes.map(bendOf), origins.slice(1, -1), kinks);

  // The stripes' bands: band `band` (0 A, 1 B) over position q where ⌊q / 2⌋ + FIRST_BAND is odd for B.
  const bands = { path, metres, entry: inputs.entry };
  const startHeading = path.pose(0).heading;
  const documents = pieces.map((piece, i) =>
    sectionDocument(piece, {
      inputs,
      path,
      bands,
      elements: written[i]!,
      origin: origins[i]!,
      first: i === 0,
      last: i === pieces.length - 1,
      stretches,
      limit: inputs.limit,
      objects: placed.filter((o) => o.s >= origins[i]! && o.s < origins[i + 1]!),
      checkpoints: inputs.checks.map((q, k) => ({ id: `${COURSE_ID}-CP${k + 1}`, s: stationOf(q) })),
      finish: { id: `${COURSE_ID}-GOAL`, s: stationOf(inputs.finish) },
      grid: stationOf(inputs.go),
      rivals: inputs.rivals.map((rival) => ({
        ahead: stationOf(rival.position) - stationOf(inputs.go),
        right: rival.x,
      })),
      lane: inputs.lane,
      slopes: mounds.slopes,
      profile,
      skyChanges: inputs.skyChanges.map((q) => stationOf(q)),
      startHeading,
    }),
  );
  const links = pieces.slice(1).map((piece, i) => ({
    id: `${pieces[i]!.id}-${piece.id}`,
    from: { section: pieces[i]!.id, lane: 'a' },
    to: piece.id,
  }));
  requireInput(stationOf(last) < end, `/${COURSE_ID}`, 'The goal lies past the course');
  return {
    document: {
      format: 'superoutride.course',
      version: COURSE_DOCUMENT_VERSION,
      name: COURSE_NAME,
      entry: pieces[0]!.id,
      maxLaps: 1,
      bearing: 0,
      sections: documents,
      links,
    },
    path,
    plan: {
      ...plan,
      fidelity: planFidelity(
        evenly(inputs.headings),
        plan.elements,
        plan.start,
        metres,
        VECTOR_RESOLUTION,
        plan.widened,
      ),
    },
    pieces,
    profile,
    screenProfile: profileOf(grades.map(bendOf)),
    mounds: { runs: mounds.runs, joined: mounds.joined, longest: mounds.longest },
    stationOf,
    placed,
    ground: inputs.limit - inputs.lane,
    dropped,
    passedThrough,
    crossings: crossings.map((crossing, k) => ({ passages: crossing.passages, ...parted.partings[k]! })),
    rampRadius: parted.radius,
  };
}

/** How the stripes' bands lie along the plane: P, a position's metres and P's metres before position 0. */
interface Bands {
  readonly path: CoursePath;
  readonly metres: number;
  readonly entry: number;
}

/**
 * Where band `band` (0 A, 1 B) lies over stations `[a, b]`: positions q with ⌊q / 2⌋ + FIRST_BAND + band even, which
 * each of P's elements lays at even stations, so each element's are one repeat.
 */
function bandSpans(bands: Bands, band: 0 | 1, a: number, b: number) {
  const { path, metres, entry } = bands;
  const spans: { from: number; to: number; every: number; count: number }[] = [];
  for (const e of path.elements) {
    const [u0, u1] = [Math.max(e.start, a), Math.min(e.start + e.length, b)];
    if (u1 - u0 <= 1e-9) continue;
    const width = STRIPE * metres;
    const period = 2 * width;
    // The band's first start at or before u0: its stretches begin at position 2k × STRIPE (k + FIRST_BAND + band even).
    const phase = ((FIRST_BAND + band) % 2 === 0 ? 0 : 1) * width;
    let start = entry + phase + Math.floor((u0 - entry - phase) / period) * period;
    const out: { from: number; to: number }[] = [];
    for (; start < u1 - 1e-9; start += period) {
      const [x, y] = [Math.max(start, u0), Math.min(start + width, u1)];
      if (y - x > EPSILON) out.push({ from: x, to: y });
    }
    // Whole stretches one after another are one repeat; a cut one at either end stands alone.
    const whole = (s: { from: number; to: number }) => Math.abs(s.to - s.from - width) < EPSILON;
    let k = 0;
    while (k < out.length) {
      let n = 1;
      while (whole(out[k]!) && k + n < out.length && whole(out[k + n]!)) n++;
      spans.push({ ...out[k]!, every: period, count: n });
      k += n;
    }
  }
  return spans;
}

/** One Section's document. */
function sectionDocument(
  piece: Piece,
  context: {
    readonly inputs: CourseInputs;
    readonly path: CoursePath;
    readonly bands: Bands;
    readonly elements: readonly WrittenElement[];
    readonly origin: number;
    readonly first: boolean;
    readonly last: boolean;
    readonly stretches: readonly ColorStretch[];
    /** The bike's lateral limit, metres either side of P. */
    readonly limit: number;
    readonly objects: readonly Placed[];
    readonly checkpoints: readonly { readonly id: string; readonly s: number }[];
    readonly finish: { readonly id: string; readonly s: number };
    readonly grid: number;
    readonly rivals: readonly OriginalPlace[];
    readonly lane: number;
    /** The jumps' slopes, stations, their road's colors brightened or darkened. */
    readonly slopes: readonly Slope[];
    readonly profile: ReturnType<typeof profileOf>;
    readonly skyChanges: readonly number[];
    readonly startHeading: number;
  },
) {
  const { inputs, path, elements, origin } = context;
  const { unit, cross } = inputs;
  // The Section's length is its elements' as written, and every station lies within it.
  const stations = sectionStations(elements);
  const { size, joint } = stations;
  const at = (s: number) => stations.at(s - origin);

  // The lanes: a and b, a lane each either side of P; the centre lane a.
  const lanes = [
    { kind: 'lane', id: 'a', width: inputs.lane },
    { kind: 'lane', id: 'b', width: inputs.lane },
  ];
  const lateral = (fromP: number) => micrometre(fromP);
  const [surface, inner, middle, edges] = [
    cross.surface * unit,
    cross.inner * unit,
    cross.middle * unit,
    cross.edges * unit,
  ];

  type Edge = number | Lateral | null;
  const strip = (a: number, b: number, left: Edge, right: Edge, color: number | null, material: string | null) => ({
    kind: 'strip',
    start: at(a),
    end: at(b),
    left,
    right,
    color,
    material,
  });
  const strips: unknown[] = [];
  /** Band `band`'s stretches over stations `[a, b]` between `left` and `right` in `color`. */
  const banded = (band: 0 | 1, a: number, b: number, left: Edge, right: Edge, color: number) => {
    for (const span of bandSpans(context.bands, band, a, b)) {
      // A repeat's last stretch, at its rounded steps, must still end within the Section: else it stands alone.
      const every = micrometre(span.every);
      const width = span.to - span.from;
      let count = span.count;
      if (count > 1 && micrometre(span.from - origin) + (count - 1) * every + micrometre(width) > size) {
        const from = span.from + (count - 1) * span.every;
        strips.push(strip(from, from + width, left, right, color, null));
        count--;
      }
      const element = strip(span.from, span.to, left, right, color, null);
      strips.push(count === 1 ? element : { kind: 'repeat', every, count, elements: [element] });
    }
  };
  // The stretches within the Section, an end within `EPSILON` of one of the Section's ends taken as that end: the
  // Section's start is the sum of its plan's lengths as written, which parts from the stations by micrometres.
  const snap = (s: number) =>
    Math.abs(s - origin) < EPSILON ? origin : Math.abs(s - origin - size) < EPSILON ? origin + size : s;
  const own = context.stretches
    .map((t) => ({ ...t, from: snap(Math.max(t.from, origin)), to: snap(Math.min(t.to, origin + size)) }))
    .filter((t) => t.to - t.from > EPSILON);
  // The ground: its right color everywhere and its left one left of P, its material out to the boundaries.
  for (const t of own) {
    strips.push(strip(t.from, t.to, null, null, t.ground.right, null));
    if (t.ground.left !== t.ground.right) strips.push(strip(t.from, t.to, null, lateral(0), t.ground.left, null));
    const material = GROUND_MATERIALS[t.stage]!;
    strips.push(strip(t.from, t.to, boundary('outer-left'), boundary('outer-right'), null, material.right));
    if (material.left !== material.right)
      strips.push(strip(t.from, t.to, boundary('outer-left'), lateral(0), null, material.left));
  }
  // The road: its surface to the edge bands' outer edges in band B, band A over it, then the edge bands' narrow and
  // middle bands over that.
  const features = [
    { left: -edges, right: edges, colors: (t: ColorStretch) => t.road.surface },
    ...[
      [-edges, -middle],
      [-inner, -surface],
      [surface, inner],
      [middle, edges],
    ].map(([l, r]) => ({ left: l!, right: r!, colors: (t: ColorStretch) => t.road.narrow })),
    ...[
      [-middle, -inner],
      [inner, middle],
    ].map(([l, r]) => ({ left: l!, right: r!, colors: (t: ColorStretch) => t.road.middle })),
  ];
  // On the jumps' slopes the road's colors are brightened or darkened (`slopeColor`), its stripes cut where they end.
  for (const t of own)
    for (const { from, to, facing } of bySlope(t.from, t.to, context.slopes)) {
      const [a, b] = [slopeColor(t.road.surface[0], facing), slopeColor(t.road.surface[1], facing)];
      strips.push(strip(from, to, lateral(-edges), lateral(edges), b, t.wet ? CROSSING_MATERIAL : ROAD_MATERIAL));
      if (a !== b) banded(0, from, to, lateral(-edges), lateral(edges), a);
    }
  for (const f of features.slice(1))
    for (const t of own)
      for (const { from, to, facing } of bySlope(t.from, t.to, context.slopes)) {
        const colors = f.colors(t),
          under = t.road.surface;
        for (const band of [0, 1] as const)
          if (colors[band] !== under[band])
            banded(band, from, to, lateral(f.left), lateral(f.right), slopeColor(colors[band], facing));
      }

  // The gates.
  const gates: unknown[] = [];
  const inside = (s: number) => s > origin + WRITTEN_SLACK && s <= origin + size + WRITTEN_SLACK;
  // The player's slot at GO on P, where the original's bike stands, the bike's lateral limit either side; the bikes'
  // grid with the original's rivals abreast.
  if (context.first) {
    const player = { s: context.grid, lateral: 0 };
    const grid = (kind: GridKind, originals: readonly OriginalPlace[]) =>
      ruleGrid({
        kind,
        player,
        originals,
        lanes: ['a', 'b'],
        laneWidth: context.lane,
        limits: [context.limit, context.limit],
      }).map((slot) => ({ at: at(slot.s), lateral: slot.lateral }));
    gates.push({ kind: 'start', grid: grid('car', []), bikeGrid: grid('bike', context.rivals) });
  }
  for (const c of context.checkpoints) if (inside(c.s)) gates.push({ kind: 'checkpoint', id: c.id, at: at(c.s) });
  if (inside(context.finish.s)) gates.push({ kind: 'finish', id: context.finish.id, at: at(context.finish.s) });

  // The skies: the one in force at the piece's start, then each change inside it, 6 m before the bike reaches its
  // position; each facing as the original's stage start heading does.
  const skyAt = (s: number) => context.skyChanges.filter((c) => c <= s + WRITTEN_SLACK).length;
  const turned = (((path.pose(piece.from).heading - context.startHeading) * 180) / Math.PI) % 360;
  const yawOrigin = inputs.yawOrigin + (turned > 180 ? turned - 360 : turned <= -180 ? turned + 360 : turned);
  const environment = (s: number) => ({
    at: at(s),
    name: stageName(skyAt(s)),
    background: { image: skyName(skyAt(s)), horizonY: SKY_HORIZON, yawOrigin: micrometre(yawOrigin) },
    arrival: 'cut',
  });
  const environments = [
    environment(origin),
    ...context.skyChanges
      .filter((c) => c > origin + WRITTEN_SLACK && c < origin + size - WRITTEN_SLACK)
      .map(environment),
  ];

  return {
    id: piece.id,
    plan: elements,
    profile: sectionProfile(context.profile, origin, origin + size, !context.first, !context.last).map(
      ({ s, y, curveLength }) => ({ at: { joint, offset: computedValue(s - origin) }, y, curveLength }),
    ),
    lanes,
    centerLane: 'a',
    centerLateral: micrometre(-inputs.lane / 2),
    boundaries: [
      {
        id: 'outer-left',
        knots: [origin, origin + size].map((s) => ({ at: at(s), lateral: lateral(-context.limit) })),
      },
      {
        id: 'outer-right',
        knots: [origin, origin + size].map((s) => ({ at: at(s), lateral: lateral(context.limit) })),
      },
    ],
    strips,
    walls: [],
    openLimits: [],
    sprites: repeated(
      [...context.objects]
        .sort((a, b) => a.s - b.s || a.lateral - b.lateral)
        .map((o) => ({
          kind: 'sprite',
          image: o.image,
          palette: paletteName(o.palette),
          at: at(o.s),
          lateral: micrometre(o.lateral),
          groundOffset: micrometre(o.groundOffset),
          unselectedLink: null,
          body: o.body === null ? null : { width: micrometre(o.body), movable: null },
        })),
    ),
    environments,
    gates,
  };
}

type Lateral = { readonly boundary: string; readonly offset: number };
const boundary = (id: string): Lateral => ({ boundary: id, offset: 0 });
