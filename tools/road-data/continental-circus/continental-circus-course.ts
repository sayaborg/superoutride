/**
 * CONTINENTAL CIRCUS's courses ([CONTINENTAL CIRCUS road data](../../../docs/continental-circus-road-data.md#its-courses)):
 * its conversion, each course a lap on its model ([Original road data](../../../docs/original-road-data.md#a-lap-on-its-model)),
 * K's course sources' circuit the original drew, laid from its curve table of records of their own lengths by the
 * shared `circuit-layout`: its heights its 3D road's, its road across its picture's, striped by its banks, its sky its
 * bands'.
 */
import { leastLaneRadius as laneRadius } from '../../../src/course/plan-clearance.js';
import { courseModel } from '../shared/course-models.js';
import { courseOnModel, type LapInputs } from '../shared/model-lap.js';
import type { RomSet } from '../shared/rom-set.js';
import { crestTrials } from '../shared/crest-trials.js';
import { crossings } from '../shared/overpasses.js';
import { PASSAGE_STEP } from '../shared/shared-constants.js';
import { curvePlan, type CurveInterval } from '../shared/curve-plan.js';
import { CoursePath } from '../shared/course-path.js';
import { OriginalOutputs, round1, round3, type Conversion } from '../shared/conversion.js';
import { layCourse } from '../shared/circuit-layout.js';
import { romDiffers } from '../shared/conversion-errors.js';
import { groundMaterial } from '../shared/ground-material.js';
import { bakeSky, skyYawOrigin } from '../shared/sky-baking.js';
import { riseProfile } from '../shared/rise-profile.js';
import { bendOf, profileOf, withinRise, type Bend, type Kink, type Profile } from '../shared/road-profile.js';
import type { Band, Material, SurfacePart, SurfaceStrip } from '../shared/road-surface.js';
import { lensFactor, steepestGrade } from '../shared/screen-pieces.js';
import {
  CONTINENTAL_CIRCUS_COURSES,
  PICTURE_WIDTH,
  continentalCircusSky,
  SKY_MIDDLE,
} from './continental-circus-backgrounds.js';
import { continentalCircusLap, curveTable, POSITION_METRES } from './continental-circus-road.js';
import { carLimit, continentalCircusRoadPicture, SCREEN_ROWS, UP } from './continental-circus-road-picture.js';
import { BANK_PERIOD, continentalCircusRoadColors, GROUP, stripeBank } from './continental-circus-road-colors.js';
import { lapHills, lapRises, SAMPLE_POSITIONS, type Rises } from './continental-circus-heights.js';
import { lapZones, zoneAttributes, type Attribute, type LinePart } from './continental-circus-zones.js';
import {
  assembleContinentalCircusMain,
  assembleContinentalCircusSub,
  assembleContinentalCircusTiles,
  CONTINENTAL_CIRCUS_ROAD_ROM,
} from './continental-circus-rom.js';

/** The conversion's version, recorded in the specification beside the courses it wrote. */
export const CONTINENTAL_CIRCUS_CONVERSION_VERSION = 2;

/** The conversion's course ids, by the program's course numbers. */
export const COURSE_IDS = CONTINENTAL_CIRCUS_COURSES.map((name) => `continental-circus-${name.toLowerCase()}`);

/**
 * Each course's model, K's course sources' layout of the circuit the original drew (K, 2026-11-06), by the program's
 * course numbers.
 */
export const MODELS = Object.freeze([
  'jacarepagua_1978_1995',
  'watkins_glen_1975_1985',
  'dijon_prenois_extended_gp',
  'monaco_1976_1985',
  'hockenheim_1970_1981',
  'jarama_1967_1979',
  'long_beach_1976_1981',
  'suzuka_1962_1983',
] as const);

/**
 * What course `c` has its lap on its model solved from: its curve table from its line, each record its own length
 * (`curveTable`), its values negated, as the original's positive value bends the road right and a plan's turns left
 * ([Plan from a curve table](../../../docs/original-road-data.md#plan-from-a-curve-table)); its model, its road's width
 * and its lanes' least radius, its two lanes each half the road (K, 2026-11-05).
 */
function lapInputs(sub: Uint8Array, halfMetres: number, c: number): LapInputs {
  const table = curveTable(sub, continentalCircusLap(sub, c));
  return {
    values: table.map((t) => -t.value),
    lengths: table.map((t) => t.length),
    model: courseModel(MODELS[c]!, `CONTINENTAL CIRCUS ${CONTINENTAL_CIRCUS_COURSES[c]!}`),
    roadWidth: 2 * halfMetres,
    leastLaneRadius: laneRadius(halfMetres),
  };
}

/** The courses, each its id and what its lap on its model is solved from, for the solving command. */
export function continentalCircusModelLaps(set: RomSet): { course: string; inputs: LapInputs }[] {
  const [main, sub] = [assembleContinentalCircusMain(set), assembleContinentalCircusSub(set)];
  const { halfMetres } = continentalCircusRoadPicture(main, set.data(CONTINENTAL_CIRCUS_ROAD_ROM));
  return COURSE_IDS.map((course, c) => ({ course, inputs: lapInputs(sub, halfMetres, c) }));
}

/**
 * The laps a race runs: one, its goal the lap's one thing of type 3, which sets the goal flag (S 0x2B8A to 0x2BF8) and
 * on which the main program stops the time (M 0x1E7E).
 */
const LAPS = 1;
/**
 * The heights' resolution, units over a sample (`SAMPLE_POSITIONS`): a unit and a half, as SUPER HANG-ON's 3D road's is
 * a unit and a half of its vectors' 4096 (`VECTOR_RESOLUTION`; default, K confirms at the stage's end).
 */
const RISE_RESOLUTION = 1.5;
/** The road's material, its body, its lines and its edges' bands (K, 2026-11-09). */
const ROAD: Material = 'ASPHALT';

/**
 * Where a lap position lies on the lap as laid, metres from its line ([Places and
 * patterns](../../../docs/original-road-data.md#places-and-patterns)): its record's interval's start there and its
 * share of the interval's length, `table` the intervals in the original's positions and `laid` as laid, both from the
 * line.
 */
function lapStations(table: readonly CurveInterval[], laid: readonly CurveInterval[]) {
  const [from, at] = [[0], [0]];
  table.forEach((t, i) => {
    from.push(from.at(-1)! + t.length);
    at.push(at.at(-1)! + laid[i]!.length);
  });
  return (p: number) => {
    let [lo, hi] = [0, table.length - 1];
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (from[mid]! <= p) lo = mid;
      else hi = mid - 1;
    }
    return at[lo]! + ((p - from[lo]!) / table[lo]!.length) * laid[lo]!.length;
  };
}

/**
 * A lap's heights at factor 1 ([Its courses laid](../../../docs/continental-circus-road-data.md#its-courses-laid)):
 * each queue of its hills' rises (`lapRises`) a rise table's ([Profile from a rise
 * table](../../../docs/original-road-data.md#profile-from-a-rise-table)), each grade at its station on the lap as laid,
 * its rise in metres (a unit `unit`, up) over its positions at the lap's mean position (`mean`, its length over its
 * positions), so that its grades are the clock's times one factor a lap ([Places and
 * patterns](../../../docs/original-road-data.md#places-and-patterns)), its resolution `RISE_RESOLUTION` units over a
 * sample so, and level again at its end, as the road is between queues; less its mean over its lap, so that the lap
 * closes in height. With its runs and the most its grade and its height depart from the tables'.
 */
function lapProfile(
  queues: readonly Rises[],
  station: (p: number) => number,
  length: number,
  unit: number,
  mean: number,
) {
  const resolution = (RISE_RESOLUTION * unit) / (SAMPLE_POSITIONS * mean);
  const [bends, kinks]: [Bend[], Kink[]] = [[], []];
  const tables = queues.map((queue) => {
    const grades = queue.grades.map((g) => (g * unit) / mean);
    const at = (i: number) => station(queue.positions[i]!);
    const rise = riseProfile(grades, resolution, at);
    const queueBends = rise.changes.map(bendOf);
    const end = at(grades.length - 1);
    const left = profileOf(queueBends).grade(end);
    bends.push(...queueBends);
    if (left !== 0) kinks.push({ at: end, change: -left });
    return { grades, at, runs: rise.runs, departure: rise.departure };
  });
  const closes = profileOf(bends, [], kinks).height(length);
  if (closes !== 0) kinks.unshift({ at: 0, change: -closes / length });
  const profile = profileOf(bends, [], kinks);
  // Each table's heights, its grades joined straight between its stations, from the profile's at its start, against
  // the profile's, less the lap's mean grade.
  const drop = closes / length;
  const height = Math.max(
    ...tables.map(({ grades, at }) => {
      let [h, most] = [profile.height(at(0)), 0];
      for (let i = 1; i < grades.length; i++) {
        h += ((grades[i - 1]! + grades[i]!) / 2 - drop) * (at(i) - at(i - 1));
        most = Math.max(most, Math.abs(profile.height(at(i)) - h));
      }
      return most;
    }),
  );
  return {
    bends,
    kinks,
    runs: tables.reduce((n, t) => n + t.runs, 0),
    departure: { grade: Math.max(...tables.map((t) => t.departure)), height },
  };
}

/** A road times `factor`: its bends' curvatures and its kinks' changes. */
const times = (road: { bends: readonly Bend[]; kinks: readonly Kink[] }, factor: number) => ({
  bends: road.bends.map((b) => ({ ...b, curvature: b.curvature * factor })),
  kinks: road.kinks.map((k) => ({ ...k, change: k.change * factor })),
});

/**
 * A color's runs over one bank period from place 0 (`BANK_PERIOD`), as the bank at each place gives it (`color`): each
 * its first place, its positions and its color, neighbours of one color one run, the last joined to the first round
 * the period.
 */
function periodRuns(bank: (place: number) => number, color: (bank: number) => number) {
  const runs: { from: number; length: number; color: number }[] = [];
  for (let place = 0; place < BANK_PERIOD; place += 4) {
    const c = color(bank(place));
    const last = runs.at(-1);
    if (last && last.color === c) last.length += 4;
    else runs.push({ from: place, length: 4, color: c });
  }
  return runs;
}

/** A color's run over one bank period: its first place, its positions and its color. */
type Run = { readonly from: number; readonly length: number; readonly color: number };

/** Whether two periods' runs are one. */
const sameRuns = (x: readonly Run[], y: readonly Run[]) =>
  x.length === y.length &&
  x.every((r, k) => r.from === y[k]!.from && r.length === y[k]!.length && r.color === y[k]!.color);

/** Of runs over a period, the color the most positions take (of as many the first). */
function mostColor(runs: readonly { length: number; color: number }[]) {
  const total = new Map<number, number>();
  for (const r of runs) total.set(r.color, (total.get(r.color) ?? 0) + r.length);
  return [...total].reduce((best, c) => (c[1] > best[1] ? c : best))[0];
}

/** A lap's heights as the report gives them: its steepest grade, %, and its highest and lowest, metres from the line's. */
function heightsReport(profile: Profile, length: number) {
  const heights = Array.from({ length: Math.ceil(length) + 1 }, (_, k) => profile.height(Math.min(k, length)));
  return {
    steepest: round1(100 * steepestGrade(profile)),
    highest: round1(Math.max(...heights)),
    lowest: round1(Math.min(...heights)),
    closes: round3(profile.height(length)),
  };
}

/** CONTINENTAL CIRCUS's courses, from the ROM set: each one's document, crest trials and report. */
export function continentalCircusCourses(set: RomSet) {
  const [main, sub, tiles] = [
    assembleContinentalCircusMain(set),
    assembleContinentalCircusSub(set),
    assembleContinentalCircusTiles(set),
  ];
  const picture = continentalCircusRoadPicture(main, set.data(CONTINENTAL_CIRCUS_ROAD_ROM));
  const { halfMetres, pixelMetres } = picture;
  const bank = stripeBank(main);
  const attributes = zoneAttributes(main, sub);
  // A lateral unit, metres: the road's half width over 0x40000 (`HALF_WIDTH_UNITS`); a height unit is UP of it, a row
  // at a distance as a unit across is a column ([Its scale across](../../../docs/continental-circus-road-data.md#its-road-across)).
  const lateral = halfMetres / 0x40000;
  const unit = lateral * UP;
  const limit = carLimit(sub) * pixelMetres;
  const outputs = new OriginalOutputs();
  // Each course's lap on its model, its stations, and its heights at factor 1.
  const laps = COURSE_IDS.map((id, c) => {
    const lap = continentalCircusLap(sub, c);
    const name = CONTINENTAL_CIRCUS_COURSES[c]!;
    const inputs = lapInputs(sub, halfMetres, c);
    const laid = courseOnModel(id, `CONTINENTAL CIRCUS ${name}`, inputs);
    const table = curveTable(sub, lap);
    const station = lapStations(table, laid.intervals);
    const heights = lapProfile(lapRises(lapHills(main, lap)), station, laid.length, unit, laid.length / lap.length);
    const zones = lapZones(sub, lap).map((z) => ({ kind: z.kind, from: station(z.from), to: station(z.to) }));
    return { id, c, name, lap, laid, station, heights, inputs, zones };
  });
  // The grades' factor, one for the eight: the lens ratio, its eye's rows at a distance over its screen's, within the
  // grade limit by the steepest grade any course reaches at factor 1.
  const steepest = Math.max(...laps.map((l) => steepestGrade(profileOf(l.heights.bends, [], l.heights.kinks))));
  const focalRows = POSITION_METRES / unit;
  const factor = lensFactor(focalRows, SCREEN_ROWS, steepest);
  const courses = laps.map(({ id, c, name, lap, laid, station, heights, inputs, zones }) => {
    const { length, scale, report } = laid;
    const pieces = curvePlan(laid.intervals, scale);
    const model = inputs.model;
    const within = withinRise(times(heights, factor), length, model.elevation);
    const road = within.road;
    const profile = profileOf(road.bends, [], road.kinks);
    // The road across and along it: each band of its picture its bank's color by its place, its base the color most of
    // a period takes, the rest the surface's Strips repeated at the period at the lap's mean position, from the race's
    // first lap's place of its line (default; K confirms at the stage's end).
    const colors = continentalCircusRoadColors(main, c);
    const mean = length / lap.length;
    const period = BANK_PERIOD * mean;
    const zero = -(lap.place % BANK_PERIOD) * mean;
    const runsOf = (group: number, pen: number) => periodRuns(bank, (b) => colors(b, group, pen));
    const ground = runsOf(GROUP.edge, 0);
    const materials = [...new Set(ground.map((r) => groundMaterial(r.color)))];
    if (materials.length !== 1) throw romDiffers(`${name}'s ground's shades differ in material`);
    // No water lies beside its roads: a ground the rule makes WATER (MONACO's bluish grey, a town's) is SAND (default;
    // K confirms at the stage's end).
    const groundIs: Material = materials[0] === 'WATER' ? 'SAND' : materials[0]!;
    const edge = picture.right.at(-1)!.to;
    const pieceOf = (from: number, to: number, part: LinePart, pen: number) => {
      const runs = runsOf(attributes.open[part].group, pen);
      return { from, to, part, pen, runs, base: mostColor(runs) };
    };
    const lines = picture.lines;
    const across = [
      ...[...picture.left].sort((a, b) => a.from - b.from).map((b) => pieceOf(b.from, b.to, 'left', b.pen)),
      pieceOf(-halfMetres, lines[0]!.from, 'body', picture.bodyPen),
      ...lines.flatMap((line, k) => [
        pieceOf(line.from, line.to, 'body', line.pen),
        pieceOf(line.to, lines[k + 1]?.from ?? halfMetres, 'body', picture.bodyPen),
      ]),
      ...[...picture.right].sort((a, b) => a.from - b.from).map((b) => pieceOf(b.from, b.to, 'right', b.pen)),
    ];
    const bands: Band[] = across.map((p) => ({ left: p.from, right: p.to, colors: [p.base], material: ROAD }));
    const groundBase = mostColor(ground);
    const parts: SurfacePart[] = [
      ...across.flatMap((p) =>
        p.runs.filter((r) => r.color !== p.base).map((r) => ({ ...partAt(r, zero, mean), left: p.from, right: p.to })),
      ),
      ...ground
        .filter((r) => r.color !== groundBase)
        .flatMap((r) => [
          { ...partAt(r, zero, mean), left: null, right: -edge },
          { ...partAt(r, zero, mean), left: edge, right: null },
        ]),
    ];
    // Its zones, each a place's colors over its stretch, at once at its ends ([Its zones](../../../docs/continental-circus-road-data.md#its-zones)):
    // each part its zone's kind gives another word in that word's group by its place, its bands and, beyond an edge,
    // the ground its pixel 0 gives; beyond an edge whose word draws no ground, the course's ground beyond the road
    // (default; K confirms at the stage's end); a part whose colors are open road's not laid again.
    const beyondRuns: Run[] = [{ from: 0, length: BANK_PERIOD, color: groundBase }];
    const groundOf = (a: Attribute) => (a.ground ? runsOf(a.group, 0) : beyondRuns);
    const zoneStrips = zones.flatMap((z) => {
      const words = attributes.of(z.kind);
      return [
        ...across.map((p) => ({ left: p.from, right: p.to, open: p.runs, runs: runsOf(words[p.part].group, p.pen) })),
        { left: null, right: -edge, open: ground, runs: groundOf(words.left) },
        { left: edge, right: null, open: ground, runs: groundOf(words.right) },
      ]
        .filter((p) => !sameRuns(p.runs, p.open))
        .flatMap((p) => placeStrips(p.runs, z.from, z.to, zero, mean, p.left, p.right));
    });
    const surface = [{ parts, every: period, count: Math.ceil((length - zero) / period) + 1 }, ...zoneStrips];
    const sky = `${id}-sky`;
    outputs.file(`images/${sky}.json`, JSON.stringify(bakeSky(sky, continentalCircusSky(main, sub, tiles, c), UP)));
    const limits = {
      left: [
        [0, -limit],
        [length, -limit],
      ] as const,
      right: [
        [0, limit],
        [length, limit],
      ] as const,
      ground: groundIs,
    };
    const start = station(lap.length - lap.start) - length;
    const course = layCourse({
      id,
      name,
      lap: { pieces, length },
      crossSection: { bands, edge },
      surface,
      laps: LAPS,
      // Its own car alone, on the road's centre, its start's place on the lap as laid before the line.
      grid: { places: [{ ahead: start, right: 0 }] },
      sky,
      beyond: groundBase,
      road,
      interval: period,
      startLine: [],
      // The facing layer's column at the camera's centre at the start's heading, the line's.
      skyYawOrigin: skyYawOrigin(SKY_MIDDLE, PICTURE_WIDTH),
      objects: [],
      limits,
      lane: halfMetres,
      leastLaneRadius: laneRadius(halfMetres),
    });
    outputs.course(id, course.document);
    outputs.crestTrials(id, crestTrials(course.heights, course.write));
    const path = new CoursePath(pieces);
    const tightest = Math.min(...path.elements.filter((e) => e.turn !== 0).map((e) => e.length / Math.abs(e.turn)));
    const scaled = factor * within.factor;
    return {
      course: `courses/${id}.course.json`,
      name,
      intervals: laid.intervals.length,
      pieces: path.elements.length,
      length: round3(path.length),
      sections: course.sections,
      valueCurvature: Number(scale.toPrecision(4)),
      tightestRadius: round1(tightest),
      positionMetres: Number(mean.toPrecision(5)),
      stripes: { period: round3(period), parts: parts.length },
      // Its zones: each its kind, and its stretch's start and length, metres.
      zones: zones.map((z) => ({
        kind: `0x${z.kind.toString(16)}`,
        at: round1(z.from),
        length: round3(z.to - z.from),
      })),
      ground: { colors: [...new Set(ground.map((r) => r.color))], material: groundIs },
      startFromLine: round3(-start),
      gridFromLine: [course.grid[0]!, course.grid.at(-1)!].map((slot) => round3(length - slot.s)),
      heights: {
        ...heightsReport(profile, length),
        runs: heights.runs,
        // The model's factor, and the most the grade and the height depart from the ROM's, as laid.
        factor: round3(within.factor),
        departs: { grade: round3(heights.departure.grade * scaled), height: round3(heights.departure.height * scaled) },
        // Where it crosses itself, its two passages' stations and heights.
        passages: crossings(pieces, length, PASSAGE_STEP).map((x) => ({
          at: x.map(round1),
          heights: x.map((s) => round1(profile.height(s))),
        })),
      },
      ...report,
    };
  });
  return {
    outputs,
    report: {
      laps: LAPS,
      lateralMetres: Number(lateral.toPrecision(5)),
      heightUnitMetres: Number(unit.toPrecision(5)),
      limit: round3(limit),
      // The grades' factor: the lens ratio, its eye's rows over its screen's, and the steepest grade at factor 1.
      grades: {
        factor: round3(factor),
        lens: round3(focalRows / SCREEN_ROWS),
        steepest: round3(steepest),
      },
      courses,
    },
  };
}

/** A run's stretch on the lap as laid: its place from the period's start, less the line's, at the lap's mean position. */
const partAt = (run: Run, zero: number, mean: number) => ({
  from: zero + run.from * mean,
  to: zero + (run.from + run.length) * mean,
  color: run.color,
});

/**
 * A place's colors over stations `[from, to]` between laterals `left` and `right`, at once at its ends: its runs in
 * every period from station `zero` at the lap's mean position (`mean`) within it, the color most of the stretch takes
 * over the whole and each other run over its part, the periods wholly within one repeat and the rest cut at the ends.
 */
function placeStrips(
  runs: readonly Run[],
  from: number,
  to: number,
  zero: number,
  mean: number,
  left: number | null,
  right: number | null,
): SurfaceStrip[] {
  const period = BANK_PERIOD * mean;
  const parts = runs.map((r) => ({ ...partAt(r, zero, mean), left, right }));
  const [first, last] = [Math.ceil((from - zero) / period - 1e-9), Math.floor((to - zero) / period + 1e-9)];
  const whole = Math.max(0, last - first);
  const cut: SurfacePart[] = [];
  for (let k = Math.floor((from - zero) / period); zero + k * period < to; k++)
    if (k < first || k >= last)
      for (const p of parts) {
        const [a, b] = [Math.max(from, p.from + k * period), Math.min(to, p.to + k * period)];
        if (b - a > 1e-6) cut.push({ ...p, from: a, to: b });
      }
  const metres = (ps: readonly SurfacePart[], color: number) =>
    ps.reduce((n, p) => n + (p.color === color ? p.to - p.from : 0), 0);
  const cover = (color: number) => metres(cut, color) + whole * metres(parts, color);
  const base = runs.map((r) => r.color).reduce((best, c) => (cover(c) > cover(best) ? c : best));
  const shifted = parts
    .filter((p) => p.color !== base)
    .map((p) => ({ ...p, from: p.from + first * period, to: p.to + first * period }));
  const ends = cut.filter((p) => p.color !== base);
  return [
    { parts: [{ from, to, left, right, color: base }], every: period, count: 1 },
    ...(ends.length ? [{ parts: ends, every: period, count: 1 }] : []),
    ...(whole > 0 && shifted.length ? [{ parts: shifted, every: period, count: whole }] : []),
  ];
}

export const CONTINENTAL_CIRCUS_CONVERSION: Conversion = (set) => {
  const { outputs, report } = continentalCircusCourses(set);
  return { outputs, report: { conversion: CONTINENTAL_CIRCUS_CONVERSION_VERSION, ...report } };
};
