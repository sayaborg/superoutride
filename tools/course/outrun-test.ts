/**
 * OUTRUN TEST's course document, written by a deterministic production-only generator: `npm run outrun-test` writes
 * `content/courses/outrun-test.course.json` and prints each stage's length and planning estimate as JSON. The course is OutRun's
 * structure: five rows of stages (1+2+3+4+5) whose ends fork left to the same position in the next row and right to the
 * next position, and five goals in the last row. Every stage is one Section; the generator owns its plan, profile,
 * lanes, fork, gates and surfaces, from the stage table below.
 */
import { formatSavedJson } from '../../src/content/saved-json.js';
import { atomicWrite, reportError } from './authoring-io.js';
import { readCourseDocument } from '../../src/course/course-document.js';
import {
  BAND,
  createStageContext,
  DEFAULT_SURFACES,
  type Lateral,
  type StageContext,
  type Surfaces,
} from './outrun-test/context.js';
import { coastline, COASTLINE_SURFACES } from './outrun-test/row1.js';
import { CLIFF_SURFACES, cliffRoad, gateway, GATEWAY_SURFACES, gatewayWidths } from './outrun-test/row2.js';
import {
  farmland,
  FARMLAND_SURFACES,
  oldTown,
  OLD_TOWN_SURFACES,
  TUNNEL_SURFACES,
  tunnelRun,
} from './outrun-test/row3.js';
import {
  ALPINE_SURFACES,
  alpinePass,
  desert,
  DESERT_SURFACES,
  forest,
  FOREST_SURFACES,
  lakeside,
  LAKESIDE_SURFACES,
} from './outrun-test/row4.js';
import {
  downhill,
  DOWNHILL_SURFACES,
  interchange,
  INTERCHANGE_SURFACES,
  metropolis,
  METROPOLIS_SURFACES,
  riviera,
  RIVIERA_SURFACES,
  ruins,
  RUINS_SURFACES,
} from './outrun-test/row5.js';

type Turn = 'left' | 'right';
/** A plan element: a straight of `length`, or an arc of `length` and `radius` turning `turn`. */
type Element = { length: number; radius?: number; turn?: Turn };
/** A PVI at station `s` (metres from the stage's start) of height `y` with a vertical curve `curve` metres long. */
type Pvi = { s: number; y: number; curve: number };
/** A lane width that changes: values at stations, straight between (the first at 0, the last at the end). */
type Width = number | readonly (readonly [s: number, width: number])[];

/** One stage's authored design: its name, plan body, profile body, extra lanes and character. */
interface StageDesign {
  readonly id: string;
  readonly name: string;
  /** The stage's body: arcs and straights between its entry straight and its final straight. */
  readonly body: readonly Element[];
  /** PVIs over the body, stations from the body's start; the stage is level at both ends. */
  readonly hills?: readonly Pvi[];
  /** Lane widths over the whole stage (stations from the stage's start), keyed by lane id; omitted lanes keep defaults. */
  readonly widths?: (length: number, fork: number) => Readonly<Record<string, Width>>;
  /** The stage's sky (a course image) and its ground's colors and materials. */
  readonly sky?: string;
  readonly surfaces?: Partial<Surfaces>;
  /** The stage's own scenery: surfaces, Boundaries, walls, open limits, sprites and environments. */
  readonly scenery?: (ctx: StageContext) => void;
}

const S = (length: number): Element => ({ length });
const R = (radius: number, length: number): Element => ({ length, radius, turn: 'right' });
const L = (radius: number, length: number): Element => ({ length, radius, turn: 'left' });
/** A turn by `degrees` at `radius`. */
const Rd = (radius: number, degrees: number) => R(radius, round((radius * degrees * Math.PI) / 180));
const Ld = (radius: number, degrees: number) => L(radius, round((radius * degrees * Math.PI) / 180));
const round = (value: number, step = 1) => Math.round(value / step) * step;

/** The lane width of every road at a stage's ends: each exit road and every stage's first road are two such lanes. */
const LANE = 3.6;
/** The entry straight's length, over which the stage's own cross-section starts. */
const ENTRY = 200;
/** The final straight: the second road's lanes appear, the median opens, lock, closure and the roads part. */
const FINAL = 900;
/** A goal stage's final straight: the finish, then the runout. */
const GOAL_FINAL = 900;
const RUNOUT = 450;

/**
 * The stages by row, left to right: difficulty rises to the right in every row. Plans are sized from TESTAROSSA's
 * limits (`SIZING`) so each stage takes about 90 s at the reference driver's utilization (see `estimate`).
 */
const ROWS: readonly (readonly StageDesign[])[] = [
  [
    {
      id: 'coastline',
      name: 'COASTLINE',
      sky: 'sky-coast',
      surfaces: COASTLINE_SURFACES,
      scenery: coastline,
      body: [
        Ld(1400, 18),
        S(600),
        Rd(1000, 30),
        S(500),
        Ld(900, 34),
        S(700),
        Rd(1200, 26),
        S(400),
        Ld(800, 30),
        S(500),
        Rd(1500, 20),
      ],
      hills: [
        { s: 800, y: 6, curve: 300 },
        { s: 1600, y: -4, curve: 300 },
        { s: 2600, y: 8, curve: 300 },
        { s: 3700, y: 0, curve: 300 },
      ],
    },
  ],
  [
    {
      id: 'gateway',
      name: 'GATEWAY',
      sky: 'sky-country',
      surfaces: GATEWAY_SURFACES,
      widths: gatewayWidths,
      scenery: gateway,
      body: [
        Rd(700, 40),
        S(500),
        Ld(600, 50),
        S(400),
        Rd(800, 45),
        S(600),
        Ld(500, 40),
        S(300),
        Rd(900, 35),
        S(500),
        Ld(700, 30),
        S(400),
        Rd(600, 40),
      ],
      hills: [
        { s: 600, y: 8, curve: 250 },
        { s: 1400, y: 0, curve: 250 },
        { s: 2200, y: 10, curve: 250 },
        { s: 3100, y: 2, curve: 250 },
        { s: 3900, y: 9, curve: 250 },
      ],
    },
    {
      id: 'cliff-road',
      name: 'CLIFF ROAD',
      sky: 'sky-cliff',
      surfaces: CLIFF_SURFACES,
      scenery: cliffRoad,
      body: [
        Rd(250, 70),
        S(200),
        Ld(180, 80),
        S(150),
        Rd(300, 60),
        S(300),
        Ld(220, 90),
        S(180),
        Rd(160, 75),
        S(250),
        Ld(260, 65),
        S(200),
        Rd(200, 85),
        S(300),
        Ld(350, 50),
        S(200),
        Rd(170, 80),
        S(250),
        Ld(240, 70),
      ],
      hills: [
        { s: 500, y: 12, curve: 200 },
        { s: 1500, y: 25, curve: 200 },
        { s: 2600, y: 18, curve: 200 },
        { s: 3500, y: 6, curve: 200 },
      ],
    },
  ],
  [
    {
      id: 'farmland',
      name: 'FARMLAND',
      sky: 'sky-farm',
      surfaces: FARMLAND_SURFACES,
      // Its crests: the body's high PVIs, past the entry straight.
      scenery: (ctx) => farmland(ctx, [700, 1300, 2300, 2900, 3900]),
      body: [
        Rd(600, 30),
        S(900),
        Ld(500, 40),
        S(1000),
        Rd(450, 45),
        S(800),
        Ld(700, 25),
        S(900),
        Rd(500, 40),
        S(700),
        Ld(550, 35),
      ],
      // Crests that lift the car on the straights, landing downhill.
      hills: [
        { s: 500, y: 14, curve: 60 },
        { s: 700, y: 4, curve: 80 },
        { s: 1100, y: 16, curve: 60 },
        { s: 1350, y: 2, curve: 80 },
        { s: 2100, y: 12, curve: 60 },
        { s: 2350, y: 0, curve: 80 },
        { s: 2700, y: 14, curve: 60 },
        { s: 2950, y: 2, curve: 80 },
        { s: 3700, y: 10, curve: 60 },
        { s: 3950, y: 0, curve: 80 },
      ],
    },
    {
      id: 'old-town',
      name: 'OLD TOWN',
      sky: 'sky-town',
      surfaces: OLD_TOWN_SURFACES,
      scenery: oldTown,
      body: [
        Rd(45, 85),
        S(350),
        Ld(40, 90),
        S(300),
        Rd(60, 80),
        S(400),
        Ld(50, 85),
        S(250),
        Rd(45, 90),
        S(400),
        Ld(70, 70),
        S(300),
        Rd(55, 85),
        S(350),
        Ld(45, 90),
      ],
      // Lane b narrows to nothing through the town and returns before the fork.
      widths: (length) => ({
        b: [
          [0, LANE],
          [600, LANE],
          [750, 0],
          [length - FINAL - 400, 0],
          [length - FINAL - 250, LANE],
          [length, LANE],
        ],
      }),
    },
    {
      id: 'tunnel-run',
      name: 'TUNNEL RUN',
      sky: 'sky-mountain',
      surfaces: TUNNEL_SURFACES,
      scenery: tunnelRun,
      body: [
        Rd(160, 60),
        S(200),
        Ld(140, 75),
        S(250),
        Rd(200, 70),
        S(200),
        Ld(120, 80),
        S(300),
        Rd(180, 65),
        S(220),
        Ld(150, 70),
        S(250),
        Rd(130, 85),
        S(200),
        Ld(220, 55),
        S(250),
        Rd(140, 80),
        S(200),
        Ld(170, 70),
      ],
      hills: [
        { s: 600, y: 15, curve: 150 },
        { s: 1600, y: 30, curve: 150 },
        { s: 2600, y: 20, curve: 150 },
        { s: 3400, y: 5, curve: 150 },
      ],
    },
  ],
  [
    {
      id: 'lakeside',
      name: 'LAKESIDE',
      sky: 'sky-lake',
      surfaces: LAKESIDE_SURFACES,
      scenery: lakeside,
      body: [
        Ld(1000, 40),
        S(400),
        Rd(1200, 45),
        S(300),
        Ld(900, 50),
        S(500),
        Rd(1100, 40),
        S(300),
        Ld(1300, 35),
        S(300),
        Rd(1000, 20),
      ],
      hills: [
        { s: 1000, y: 3, curve: 300 },
        { s: 2200, y: -2, curve: 300 },
        { s: 3400, y: 4, curve: 300 },
      ],
    },
    {
      id: 'desert',
      name: 'DESERT',
      sky: 'sky-desert',
      surfaces: DESERT_SURFACES,
      scenery: desert,
      body: [Rd(2000, 8), S(2200), Ld(1600, 10), S(2000), Rd(1800, 9), S(900), Ld(2000, 6)],
      // Undulations: long, low waves.
      hills: [
        { s: 400, y: 5, curve: 200 },
        { s: 800, y: -2, curve: 200 },
        { s: 1200, y: 6, curve: 200 },
        { s: 1600, y: -1, curve: 200 },
        { s: 2000, y: 5, curve: 200 },
        { s: 2700, y: -3, curve: 200 },
        { s: 3100, y: 4, curve: 200 },
        { s: 3500, y: -2, curve: 200 },
        { s: 3900, y: 6, curve: 200 },
        { s: 4300, y: 0, curve: 200 },
      ],
    },
    {
      id: 'alpine-pass',
      name: 'ALPINE PASS',
      sky: 'sky-mountain',
      surfaces: ALPINE_SURFACES,
      // The summit stretch: the body's highest PVIs, past the entry straight.
      scenery: (ctx) => alpinePass(ctx, [1350, 2000]),
      // Switchbacks up the pass, a summit road, and back down.
      body: [
        Rd(120, 40),
        S(250),
        Ld(28, 170),
        S(250),
        Rd(28, 170),
        S(250),
        Ld(28, 170),
        S(250),
        Rd(200, 60),
        S(250),
        Ld(180, 70),
        S(200),
        Rd(30, 160),
        S(170),
        Ld(30, 160),
        S(170),
        Rd(150, 40),
      ],
      hills: [
        { s: 100, y: 0, curve: 80 },
        { s: 1200, y: 120, curve: 80 },
        { s: 1550, y: 126, curve: 120 },
        { s: 1800, y: 120, curve: 80 },
        { s: 2700, y: 0, curve: 80 },
      ],
    },
    {
      id: 'forest',
      name: 'FOREST',
      sky: 'sky-forest',
      surfaces: FOREST_SURFACES,
      scenery: forest,
      body: [
        Rd(110, 70),
        Ld(100, 75),
        Rd(90, 80),
        Ld(120, 70),
        Rd(100, 75),
        Ld(85, 80),
        Rd(115, 70),
        Ld(95, 75),
        Rd(105, 70),
        Ld(90, 80),
        Rd(120, 65),
        Ld(100, 75),
        Rd(85, 80),
        Ld(110, 70),
        Rd(95, 75),
        Ld(100, 70),
        Rd(110, 70),
        Ld(95, 75),
        Rd(90, 80),
      ],
      hills: [
        { s: 400, y: 4, curve: 150 },
        { s: 1000, y: -3, curve: 150 },
        { s: 1600, y: 5, curve: 150 },
        { s: 2200, y: -2, curve: 150 },
      ],
      // A narrow road: its two lanes narrow to 3 m between the entry and the fork.
      widths: (length) =>
        Object.fromEntries(
          ['a', 'b'].map((lane) => [
            lane,
            [
              [0, LANE],
              [ENTRY, 3],
              [length - FINAL - 100, 3],
              [length - FINAL, LANE],
              [length, LANE],
            ],
          ]),
        ),
    },
  ],
  [
    {
      id: 'riviera',
      name: 'RIVIERA',
      sky: 'sky-seafront',
      surfaces: RIVIERA_SURFACES,
      scenery: riviera,
      body: [
        Rd(1200, 30),
        S(700),
        Ld(1000, 35),
        S(600),
        Rd(1400, 25),
        S(800),
        Ld(1100, 30),
        S(500),
        Rd(1300, 20),
        S(500),
        Ld(1200, 25),
      ],
    },
    {
      id: 'interchange',
      name: 'INTERCHANGE',
      sky: 'sky-country',
      surfaces: INTERCHANGE_SURFACES,
      scenery: interchange,
      body: [
        Ld(600, 40),
        S(500),
        Rd(500, 50),
        S(400),
        Ld(700, 35),
        S(600),
        Rd(550, 45),
        S(400),
        Ld(800, 30),
        S(500),
        Rd(450, 45),
        S(400),
        Ld(600, 40),
        S(300),
        Rd(700, 30),
      ],
      hills: [
        { s: 900, y: 6, curve: 300 },
        { s: 1900, y: 0, curve: 300 },
        { s: 2800, y: 7, curve: 300 },
        { s: 3600, y: 0, curve: 300 },
      ],
      // Lanes appear and end: a third lane each side joins and leaves twice.
      widths: () => ({
        w: [
          [0, 0],
          [500, 0],
          [650, LANE],
          [1500, LANE],
          [1650, 0],
          [2600, 0],
          [2750, LANE],
          [3500, LANE],
          [3650, 0],
        ],
        e: [
          [0, 0],
          [900, 0],
          [1050, LANE],
          [2100, LANE],
          [2250, 0],
          [3100, 0],
          [3250, LANE],
          [4000, LANE],
          [4150, 0],
        ],
      }),
    },
    {
      id: 'downhill',
      name: 'DOWNHILL',
      sky: 'sky-mountain',
      surfaces: DOWNHILL_SURFACES,
      // The ridge: the descent's middle straight between two jumps.
      scenery: (ctx) => downhill(ctx, [1400, 2000]),
      body: [
        Rd(400, 50),
        S(700),
        Ld(350, 60),
        S(800),
        Rd(450, 45),
        S(700),
        Ld(300, 55),
        S(500),
        Rd(500, 40),
        S(600),
        Ld(380, 50),
        S(500),
        Rd(420, 45),
      ],
      // A long descent with big jumps on its straights.
      hills: [
        { s: 300, y: -15, curve: 150 },
        { s: 900, y: -20, curve: 40 },
        { s: 1150, y: -45, curve: 100 },
        { s: 1900, y: -60, curve: 40 },
        { s: 2150, y: -88, curve: 100 },
        { s: 2900, y: -100, curve: 40 },
        { s: 3150, y: -125, curve: 100 },
        { s: 3900, y: -140, curve: 150 },
      ],
    },
    {
      id: 'ruins',
      name: 'RUINS',
      sky: 'sky-country',
      surfaces: RUINS_SURFACES,
      scenery: ruins,
      body: [
        Ld(150, 70),
        S(250),
        Rd(180, 80),
        S(200),
        Ld(130, 75),
        S(300),
        Rd(160, 85),
        S(250),
        Ld(200, 60),
        S(200),
        Rd(140, 80),
        S(300),
        Ld(170, 70),
        S(250),
        Rd(150, 75),
        S(200),
        Ld(190, 65),
        S(300),
        Rd(160, 80),
      ],
      hills: [
        { s: 500, y: 5, curve: 100 },
        { s: 1200, y: 1, curve: 100 },
        { s: 1900, y: 7, curve: 100 },
        { s: 2600, y: 2, curve: 100 },
      ],
    },
    {
      id: 'metropolis',
      name: 'METROPOLIS',
      sky: 'sky-city',
      surfaces: METROPOLIS_SURFACES,
      scenery: metropolis,
      body: [
        Rd(50, 88),
        S(500),
        Ld(55, 90),
        S(450),
        Rd(60, 85),
        S(600),
        Ld(50, 90),
        S(400),
        Rd(65, 80),
        S(500),
        Ld(55, 88),
        S(450),
        Rd(300, 40),
      ],
      // Wide avenues: the second road's lanes join the first early.
      widths: () => ({}),
    },
  ],
];

// The exit lanes: every stage's road is lanes a and b; c and d join for the fork, after the median m.
const BASE_LANES = ['w', 'a', 'b', 'm', 'c', 'd', 'e'] as const;

interface Joint {
  readonly id: string;
  readonly s: number;
}

/** A Position measured from the joint nearest station `s`, the earlier of two as near. */
function positionOf(joints: readonly Joint[], s: number) {
  let best = joints[0]!;
  for (const joint of joints) if (Math.abs(joint.s - s) < Math.abs(best.s - s)) best = joint;
  return { joint: best.id, offset: round(s - best.s, 1e-6) };
}

/** A stage's plan: the entry straight, the body and the final straight, consecutive straights joined. */
function planOf(design: StageDesign, goal: boolean) {
  const elements: Element[] = [];
  for (const element of [S(ENTRY), ...design.body, S(goal ? GOAL_FINAL : FINAL)]) {
    const last = elements.at(-1);
    if (last && !last.radius && !element.radius) elements[elements.length - 1] = S(last.length + element.length);
    else elements.push(element);
  }
  return elements;
}

/** A Width record: one number, or values at Positions. */
function widthOf(width: Width, joints: readonly Joint[], length: number) {
  if (typeof width === 'number') return width;
  const values = width.map(([s, w]) => [Math.min(length, Math.max(0, s)), w] as const);
  if (values.every(([, w]) => w === values[0]![1])) return values[0]![1];
  if (values[0]![0] !== 0) values.unshift([0, values[0]![1]]);
  if (values.at(-1)![0] !== length) values.push([length, values.at(-1)![1]]);
  return values.map(([s, w]) => ({ at: positionOf(joints, s), width: w }));
}

/** The stage's lanes: a and b throughout; c and d appear for the fork; the median opens and the roads part. */
function lanesOf(design: StageDesign, length: number, entry: boolean, goal: boolean) {
  const fork = length - FINAL;
  const defaults: Record<string, Width> = goal
    ? { w: 0, a: LANE, b: LANE, m: 0, c: 0, d: 0, e: 0 }
    : {
        w: 0,
        a: LANE,
        b: LANE,
        // The median opens to 4 m before the lock and parts the roads after closure.
        m: [
          [0, 0],
          [fork + 150, 0],
          [fork + 250, 4],
          [fork + 700, 4],
          [length, 24],
        ],
        c: [
          [0, 0],
          [fork, 0],
          [fork + 150, LANE],
          [length, LANE],
        ],
        d: [
          [0, 0],
          [fork, 0],
          [fork + 150, LANE],
          [length, LANE],
        ],
        e: 0,
      };
  // The course's entry is a divided 3+3 highway that merges into six lanes before narrowing to the fork's four.
  if (entry)
    Object.assign(defaults, {
      w: [
        [0, LANE],
        [2600, LANE],
        [fork - 300, LANE],
        [fork - 100, 0],
      ],
      m: [
        [0, 4],
        [1200, 4],
        [1400, 0],
        [fork + 150, 0],
        [fork + 250, 4],
        [fork + 700, 4],
        [length, 24],
      ],
      c: LANE,
      d: LANE,
      e: [
        [0, LANE],
        [fork - 300, LANE],
        [fork - 100, 0],
      ],
    });
  return { ...defaults, ...design.widths?.(length, fork) };
}

/** A built stage: its Section, its outgoing Links, its length and its planning estimate in seconds. */
interface Built {
  readonly section: Record<string, unknown>;
  readonly links: readonly Record<string, unknown>[];
  readonly length: number;
  readonly estimate: number;
}

/**
 * TESTAROSSA's speed-indexed acceleration, braking and lateral limits as measured when the stages were sized, kept so
 * the generated course stays as authored.
 */
const SIZING: {
  readonly maximumSpeed: number;
  readonly rows: readonly { speed: number; acceleration: number; braking: number; lateral: number }[];
} = Object.freeze({
  maximumSpeed: 83.01171733550791,
  rows: [
    { speed: 5, acceleration: 7.971121546951972, braking: 13.697454897092518, lateral: 4.836725274532194 },
    { speed: 15, acceleration: 7.333755058136738, braking: 14.163743740548096, lateral: 22.88963045383348 },
    { speed: 25, acceleration: 4.813428656859685, braking: 14.734078993206339, lateral: 22.38633789286054 },
    { speed: 35, acceleration: 3.326855050473867, braking: 14.998827611890633, lateral: 21.93519498688467 },
    { speed: 45, acceleration: 2.8004672073500245, braking: 15.322431887152348, lateral: 21.525080112372247 },
    { speed: 55, acceleration: 1.8498304065199562, braking: 15.523213626353325, lateral: 21.360578540874283 },
    { speed: 65, acceleration: 0.9921668896573692, braking: 15.812030673380235, lateral: 21.54131897968735 },
    { speed: 75, acceleration: 0.52037804980651, braking: 16.346187056081902, lateral: 21.578238596913753 },
    {
      speed: 83.01171733550791,
      acceleration: 0.0030402258538515525,
      braking: 16.346187056081902,
      lateral: 21.641575004709605,
    },
  ],
});
/** The reference driver's utilization (`REFERENCE_DRIVER`). */
const UTILIZATION = 0.9;
const at = (key: 'acceleration' | 'braking' | 'lateral', v: number) => {
  const rows = SIZING.rows;
  if (v <= rows[0]!.speed) return rows[0]![key];
  for (let i = 1; i < rows.length; i++)
    if (v <= rows[i]!.speed) {
      const a = rows[i - 1]!,
        b = rows[i]!,
        t = (v - a.speed) / (b.speed - a.speed);
      return a[key] + (b[key] - a[key]) * t;
    }
  return rows.at(-1)![key];
};

/**
 * A stage's time at the reference utilization from rest-free entry at `entrySpeed`: the speed each metre allows by
 * curvature, then forward (acceleration with grade) and backward (braking) passes. A planning estimate only; `npm run
 * measure` measures the course.
 */
function estimate(plan: readonly Element[], grade: (s: number) => number, entrySpeed: number) {
  const curvature: number[] = [];
  for (const e of plan) for (let i = 0; i < e.length; i++) curvature.push(e.radius ? 1 / e.radius : 0);
  const limit = curvature.map((k) => {
    if (k === 0) return SIZING.maximumSpeed;
    let v = SIZING.maximumSpeed;
    for (let n = 0; n < 20; n++) v = Math.min(SIZING.maximumSpeed, Math.sqrt((UTILIZATION * at('lateral', v)) / k));
    return v;
  });
  const v = [...limit];
  v[0] = Math.min(v[0]!, entrySpeed);
  for (let i = 1; i < v.length; i++) {
    const a = Math.max(0, at('acceleration', v[i - 1]!) - 9.81 * grade(i));
    v[i] = Math.min(v[i]!, Math.sqrt(v[i - 1]! ** 2 + 2 * a));
  }
  for (let i = v.length - 2; i >= 0; i--)
    v[i] = Math.min(v[i]!, Math.sqrt(v[i + 1]! ** 2 + 2 * UTILIZATION * at('braking', v[i + 1]!)));
  return {
    seconds: v.reduce((sum, speed) => sum + 1 / Math.max(1, speed), 0),
    exitSpeed: v.at(-1)!,
  };
}

/** The heading at a plan's end from its start, degrees, positive to the right. */
const endHeading = (plan: readonly Element[]) =>
  plan.reduce(
    (sum, e) => sum + (e.radius ? ((e.turn === 'right' ? 1 : -1) * e.length * 180) / (Math.PI * e.radius) : 0),
    0,
  );
const wrapDegrees = (degrees: number) => ((((degrees + 180) % 360) + 360) % 360) - 180;

/**
 * Each stage's sky yaw origin, degrees: the entry's 0, and each other stage's chosen so the sky's direction in the world
 * continues from its left-most predecessor across the seam (another predecessor arrives with the sky turned by the
 * difference of their headings).
 */
const yawOrigins = new Map<string, number>();
ROWS.forEach((stages, row) =>
  stages.forEach((design, position) => {
    const before = row === 0 ? null : (ROWS[row - 1]![position] ?? ROWS[row - 1]![position - 1]!);
    if (!before) yawOrigins.set(design.id, 0);
    else
      yawOrigins.set(
        design.id,
        round(wrapDegrees(yawOrigins.get(before.id)! - endHeading(planOf(before, false))), 1e-6),
      );
  }),
);

/** Placeholder skies until each stage's own: three course skies in turn, so every stage start changes its sky. */
const PLACEHOLDER_SKIES = ['coast-sky', 'gateway-sky', 'hill-sky'];

function buildStage(design: StageDesign, row: number, position: number): Built {
  // The stage's index in row order, left to right.
  const index = ROWS.slice(0, row).reduce((n, stages) => n + stages.length, 0) + position;
  const goal = row === ROWS.length - 1;
  const entry = row === 0;
  const plan = planOf(design, goal);
  const joints: Joint[] = [];
  let length = 0;
  const planRecords = plan.map((element, i) => {
    const id = `${element.radius ? 'arc' : 'straight'}-${i + 1}`;
    joints.push({ id, s: length });
    length += element.length;
    return element.radius
      ? { kind: 'arc', id, length: element.length, radius: element.radius, turn: element.turn }
      : { kind: 'straight', id, length: element.length };
  });
  joints.push({ id: 'end', s: length });
  const at = (s: number) => positionOf(joints, s);

  // The profile: level at both ends, the body's PVIs shifted past the entry straight.
  // A goal stage ends level at its last height; every other stage ends where it began, at height 0.
  const hills = (design.hills ?? []).map((p) => ({ ...p, s: p.s + ENTRY }));
  const endY = goal ? (hills.at(-1)?.y ?? 0) : 0;
  const pvis: Pvi[] = [{ s: 0, y: 0, curve: 0 }];
  if (hills.length)
    pvis.push({ s: ENTRY / 2, y: 0, curve: ENTRY / 2 }, ...hills, {
      s: length - (goal ? GOAL_FINAL : FINAL) + 100,
      y: endY,
      curve: 100,
    });
  pvis.push({ s: length, y: endY, curve: 0 });
  const grade = (s: number) => {
    for (let i = 1; i < pvis.length; i++)
      if (s <= pvis[i]!.s) return (pvis[i]!.y - pvis[i - 1]!.y) / (pvis[i]!.s - pvis[i - 1]!.s);
    return 0;
  };

  const widths = lanesOf(design, length, entry, goal);
  const lanes = BASE_LANES.map((id) =>
    id === 'm'
      ? { kind: 'median', width: widthOf(widths.m!, joints, length) }
      : { kind: 'lane', id, width: widthOf(widths[id]!, joints, length) },
  ).filter((lane) => lane.width !== 0 || ['a', 'b'].includes((lane as { id?: string }).id ?? ''));
  const ctxOptions = () => ({
    id: design.id,
    length,
    joints,
    plan,
    lanes: lanes.flatMap((lane) => ((lane as { id?: string }).id ? [(lane as { id: string }).id] : [])),
    final: length - (goal ? GOAL_FINAL : FINAL),
    fork: !goal,
    finish: goal ? length - RUNOUT : null,
    entryEnd: ENTRY,
  });
  const ctx = createStageContext(ctxOptions());
  const { has, edge, roadLeft, roadRight, leftLane, rightLane } = ctx;
  const surfaces = { ...DEFAULT_SURFACES, ...design.surfaces };
  const verge = surfaces.verge.width;
  const whole = (left: Lateral | null, right: Lateral | null) => ({ start: at(0), end: at(length), left, right });
  // The stage's own scenery, written into the context's records.
  design.scenery?.(ctx);

  // The ground: beyond the verges, the verges and the road, each in two colors of bands; the median; the stage's own
  // surfaces; then the rumble strips and the lane lines over them.
  const strips: unknown[] = [
    { kind: 'strip', ...whole(null, null), color: surfaces.ground[0], material: null },
    {
      kind: 'strip',
      ...whole(roadLeft(verge), roadLeft()),
      color: surfaces.verge.colors[0],
      material: surfaces.verge.material,
    },
    { kind: 'strip', ...whole(roadLeft(), roadRight()), color: surfaces.road[0], material: 'ASPHALT' },
    {
      kind: 'strip',
      ...whole(roadRight(), roadRight(verge)),
      color: surfaces.verge.colors[0],
      material: surfaces.verge.material,
    },
    ...(has('m')
      ? [
          {
            kind: 'strip',
            ...whole(edge('b', 'right'), edge('c', 'left')),
            color: surfaces.median.colors[0],
            material: surfaces.median.material,
          },
        ]
      : []),
  ];
  const base = createStageContext(ctxOptions());
  base.bands(0, length, null, roadLeft(verge), surfaces.ground[1], BAND);
  base.bands(0, length, roadRight(verge), null, surfaces.ground[1], BAND);
  base.bands(0, length, roadLeft(verge), roadLeft(), surfaces.verge.colors[1], BAND);
  base.bands(0, length, roadRight(), roadRight(verge), surfaces.verge.colors[1], BAND);
  base.bands(0, length, roadLeft(), roadRight(), surfaces.road[1], BAND);
  if (has('m')) base.bands(0, length, edge('b', 'right'), edge('c', 'left'), surfaces.median.colors[1], BAND);
  const lines = createStageContext(ctxOptions());
  if (surfaces.rumble) {
    lines.bands(0, length, roadLeft(0.9), roadLeft(), surfaces.rumble[0], 8, 4);
    lines.bands(4, length, roadLeft(0.9), roadLeft(), surfaces.rumble[1], 8, 4);
    lines.bands(0, length, roadRight(), roadRight(0.9), surfaces.rumble[0], 8, 4);
    lines.bands(4, length, roadRight(), roadRight(0.9), surfaces.rumble[1], 8, 4);
  }
  // Solid edge lines inside each road's edges, dashed lines between its lanes.
  const solid = (lateral: { lane: string; side: 'left' | 'right' }, inward: number) =>
    lines.strip(
      0,
      length,
      edge(lateral.lane, lateral.side, inward > 0 ? 0.15 : -0.3),
      edge(lateral.lane, lateral.side, inward > 0 ? 0.3 : -0.15),
      surfaces.line,
    );
  solid({ lane: leftLane, side: 'left' }, 1);
  solid({ lane: rightLane, side: 'right' }, -1);
  if (has('m')) {
    solid({ lane: 'b', side: 'right' }, -1);
    solid({ lane: 'c', side: 'left' }, 1);
  }
  const dashes = (lane: string, from: number) =>
    lines.bands(from, length, edge(lane, 'right', -0.08), edge(lane, 'right', 0.08), surfaces.line, 12, 6);
  // Between each two lanes that touch: from the start, or for the second road's lanes from the fork straight.
  lanes.forEach((lane, i) => {
    const following = lanes[i + 1] as { kind: string; id?: string } | undefined;
    const id = (lane as { id?: string }).id;
    if (!id || following?.kind !== 'lane') return;
    dashes(id, !entry && ['c', 'd'].includes(following.id!) && id !== 'b' ? ctx.final : 0);
  });
  strips.push(...base.records.strips, ...ctx.records.strips, ...lines.records.strips);

  // Gates: the start grid on the entry; a checkpoint at each forking stage's end, its lock and closure; a goal's finish.
  const fork = length - FINAL;
  const gates: unknown[] = [];
  if (entry)
    gates.push({
      kind: 'start',
      grid: Array.from({ length: 16 }, (_, i) => ({ at: at(196 - 12 * i), lane: i % 2 ? 'b' : 'a' })),
      bikeGrid: null,
    });
  if (goal) gates.push({ kind: 'finish', id: `${design.id}-GOAL`, at: at(length - RUNOUT) });
  else
    gates.push(
      { kind: 'lock', at: at(fork + 300) },
      { kind: 'closure', at: at(fork + 700) },
      { kind: 'checkpoint', id: `${design.id}-CP`, at: at(length) },
    );

  const next = goal ? [] : [ROWS[row + 1]![position]!, ROWS[row + 1]![position + 1]!];
  const links = next.map((to, exit) => ({
    id: `${design.id}-${exit ? 'right' : 'left'}`,
    from: { section: design.id, lane: exit ? 'c' : 'a' },
    to: to.id,
  }));
  // The fork's signs: a warning past the lock and a closed sign at closure, on each road its Link does not take.
  links.forEach((link, exit) => {
    const lane = exit ? 'c' : 'a';
    ctx.sprite('fork-warning', fork + 330, edge(lane, 'right'), { unselectedLink: link.id });
    ctx.sprite('fork-closed', fork + 700, edge(lane, 'right'), { unselectedLink: link.id });
  });
  // The gates: the start gantry over the grid, a checkpoint arch just past every other stage's start (its predecessor's
  // checkpoint is the seam) and a goal arch over each finish.
  if (entry) ctx.sprite('start-gantry', 205, edge('a', 'center'));
  else ctx.sprite('arch-checkpoint', 12, edge('a', 'right'));
  if (goal) ctx.sprite('arch-goal', length - RUNOUT, edge('a', 'right'));
  const yawOrigin = yawOrigins.get(design.id)!;

  const section = {
    id: design.id,
    plan: planRecords,
    profile: pvis.map((p) => ({ at: at(p.s), y: p.y, curveLength: p.curve })),
    lanes,
    centerLane: 'a',
    boundaries: ctx.records.boundaries,
    strips,
    walls: ctx.records.walls,
    openLimits: ctx.records.openLimits,
    sprites: ctx.records.sprites,
    environments: [
      {
        at: at(0),
        name: design.name,
        background: { image: design.sky ?? PLACEHOLDER_SKIES[index % 3]!, horizonY: 320, yawOrigin },
        // Stage starts alternate the two transitions; the course's entry has nothing to arrive from.
        arrival: index === 0 ? 'cut' : index % 2 ? 'wipe' : 'rise',
      },
      // The stage's own environments keep its sky's direction.
      ...ctx.records.environments.map((e) => {
        const knot = e as { background: Record<string, unknown> };
        return { ...knot, background: { ...knot.background, yawOrigin } };
      }),
    ],
    gates,
  };
  return { section, links, length, estimate: estimate(plan, grade, entry ? 0 : 75).seconds };
}

try {
  const built = ROWS.flatMap((stages, row) => stages.map((design, position) => buildStage(design, row, position)));
  const course = {
    format: 'superoutride.course',
    version: 52,
    name: 'OUTRUN TEST',
    entry: ROWS[0]![0]!.id,
    maxLaps: 1,
    bearing: 0,
    sections: built.map((b) => b.section),
    links: built.flatMap((b) => b.links),
  };
  // The course passes the shared reader before it is written; the build compiles it in full.
  const read = readCourseDocument(course, 'content/courses/outrun-test.course.json');
  if (!read.ok) throw Object.assign(new Error('OUTRUN TEST does not read'), { diagnostics: read.diagnostics });
  // Written as the repository formats its JSON.
  const file = new URL('../../content/courses/outrun-test.course.json', import.meta.url).pathname;
  await atomicWrite(file, formatSavedJson(course));
  console.log(
    JSON.stringify({
      ok: true,
      course: 'content/courses/outrun-test.course.json',
      stages: built.map((b) => ({
        id: b.section.id,
        length: b.length,
        estimateSeconds: Math.round(b.estimate * 10) / 10,
      })),
    }),
  );
} catch (error) {
  reportError(error);
}
