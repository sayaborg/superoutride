/**
 * CONTINENTAL CIRCUS's courses ([CONTINENTAL CIRCUS road data](../../../docs/continental-circus-road-data.md#its-courses)):
 * its conversion, each course a lap on its model ([Original road data](../../../docs/original-road-data.md#a-lap-on-its-model)),
 * K's course sources' circuit the original drew, laid from its curve table of records of their own lengths by the
 * shared `circuit-layout`: its heights its 3D road's, its road across its picture's, striped by its banks, its sky its
 * bands', its things its descriptions' pictures and bodies, its checkpoints theirs.
 */
import { leastLaneRadius as laneRadius } from '../../../src/course/plan-clearance.js';
import { courseModel } from '../shared/course-models.js';
import { courseOnModel, type LapInputs } from '../shared/model-lap.js';
import type { RomSet } from '../shared/rom-set.js';
import { crestTrials } from '../shared/crest-trials.js';
import { crossings } from '../shared/overpasses.js';
import { PASSAGE_STEP } from '../shared/shared-constants.js';
import { passageSteps } from '../shared/passage-steps.js';
import { curvePlan, type CurveInterval } from '../shared/curve-plan.js';
import { CoursePath } from '../shared/course-path.js';
import { OriginalOutputs, round1, round3, type Conversion } from '../shared/conversion.js';
import { layCourse } from '../shared/circuit-layout.js';
import { contractUnmet, romDiffers } from '../shared/conversion-errors.js';
import { groundMaterial } from '../shared/ground-material.js';
import { bakeSky, skyYawOrigin } from '../shared/sky-baking.js';
import { riseProfile } from '../shared/rise-profile.js';
import { bendOf, profileOf, withinRise, type Bend, type Kink, type Profile } from '../shared/road-profile.js';
import type { Band, Material, SurfacePart, SurfaceStrip } from '../shared/road-surface.js';
import { arrangements, drawnIntervals, shownPieces, type FeatureEdge, type RoadPicture } from '../shared/two-roads.js';
import { straightThrough } from '../shared/piecewise-linear.js';
import { micrometre } from '../shared/section-writing.js';
import type { Lateral } from '../../../src/course/course-document.js';
import { lensFactor, steepestGrade } from '../shared/screen-pieces.js';
import {
  CONTINENTAL_CIRCUS_COURSES,
  PICTURE_WIDTH,
  continentalCircusFill,
  continentalCircusSky,
  SKY_MIDDLE,
} from './continental-circus-backgrounds.js';
import {
  COMMAND,
  continentalCircusLap,
  curveTable,
  POSITION_METRES,
  type LapRecord,
} from './continental-circus-road.js';
import {
  continentalCircusBands,
  continentalCircusBoards,
  stationThings,
  stemOf,
  type BandOf,
} from './continental-circus-boards.js';
import { assembleContinentalCircusSprites } from './continental-circus-sprites.js';
import { BIG_SPRITE } from '../taito/z-sprites.js';
import {
  continentalCircusThings,
  THING_TYPE,
  zoneSideFace,
  type ContinentalCircusThing,
} from './continental-circus-things.js';
import { carLimit, continentalCircusRoadPicture, SCREEN_ROWS, UP } from './continental-circus-road-picture.js';
import {
  BANK_PERIOD,
  continentalCircusRoadColors,
  GROUP,
  roadEntry,
  stripeBank,
} from './continental-circus-road-colors.js';
import { lapHills, lapRises, SAMPLE_POSITIONS, type Rises } from './continental-circus-heights.js';
import { attributeOf, lapZones, zoneAttributes, type Attribute, type LinePart } from './continental-circus-zones.js';
import { lapPitLanes, pitLaneLevels, PROFILE_POSITIONS, roadB, type PitLane } from './continental-circus-pit-lanes.js';
import {
  assembleContinentalCircusMain,
  assembleContinentalCircusSub,
  assembleContinentalCircusTiles,
  CONTINENTAL_CIRCUS_ROAD_ROM,
} from './continental-circus-rom.js';

/** The conversion's version, recorded in the specification beside the courses it wrote. */
export const CONTINENTAL_CIRCUS_CONVERSION_VERSION = 6;

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
 * A pit lane's profile's samples a knot: every fourth, the profile read straight between its samples as its heights
 * are, so that a pit lane's knots lie within the format's 1,024 a Boundary (default; K confirms at the stage's end).
 */
const KNOT_SAMPLES = 4;

/** A road's picture across, left to right: each piece's sides, metres from its centre, its part of a line and its pen. */
interface PictureAcross {
  readonly halfMetres: number;
  readonly bodyPen: number;
  readonly lines: readonly { readonly from: number; readonly to: number; readonly pen: number }[];
  readonly left: readonly { readonly from: number; readonly to: number; readonly pen: number }[];
  readonly right: readonly { readonly from: number; readonly to: number; readonly pen: number }[];
}

/** A road's pieces across, left to right: its left edge's bands, its body between and under its lines, its right's. */
function piecesAcross(picture: PictureAcross) {
  const { halfMetres, bodyPen, lines } = picture;
  const piece = (from: number, to: number, part: LinePart, pen: number) => ({ from, to, part, pen });
  return [
    ...[...picture.left].sort((a, b) => a.from - b.from).map((b) => piece(b.from, b.to, 'left', b.pen)),
    piece(-halfMetres, lines[0]!.from, 'body', bodyPen),
    ...lines.flatMap((line, k) => [
      piece(line.from, line.to, 'body', line.pen),
      piece(line.to, lines[k + 1]?.from ?? halfMetres, 'body', bodyPen),
    ]),
    ...[...picture.right].sort((a, b) => a.from - b.from).map((b) => piece(b.from, b.to, 'right', b.pen)),
  ];
}

/** Pieces across as two roads' picture takes them: each its left side and paint, then the outside. */
const roadPicture = (pieces: ReturnType<typeof piecesAcross>, bodyPen: number): RoadPicture => [
  ...pieces.map((p) => ({
    at: p.from,
    right: p.part !== 'body' ? ('edge' as const) : p.pen === bodyPen ? ('surface' as const) : ('line' as const),
  })),
  { at: pieces.at(-1)!.to, right: 'outside' },
];

/**
 * A pit lane's centre, metres right of P, at its knots on the lap as laid (`station`): road B's centre lies its half
 * width `half` and its profile (`lateral` metres a unit) left of road A's, every `KNOT_SAMPLES`th sample's at its first
 * position, its last its profile's end, where it is 0.
 */
function pitLaneKnots(pit: PitLane, station: (p: number) => number, half: number, lateral: number) {
  const count = pit.samples.length;
  const at = Array.from({ length: Math.ceil(count / KNOT_SAMPLES) }, (_, k) => k * KNOT_SAMPLES);
  return [...at, count].map((k) => {
    const p = pit.from + k * PROFILE_POSITIONS;
    return [station(p), micrometre(-(half + (pit.samples[k] ?? 0) * lateral))] as [number, number];
  });
}

/** The most a profile read straight between its knots departs from it read straight between its samples, units. */
function profileDeparts(samples: readonly number[]) {
  const value = (k: number) => samples[k] ?? 0;
  let most = 0;
  for (let k = 0; k < samples.length; k++) {
    const k0 = k - (k % KNOT_SAMPLES);
    const k1 = Math.min(k0 + KNOT_SAMPLES, samples.length);
    most = Math.max(most, Math.abs(value(k0) + ((value(k1) - value(k0)) * (k - k0)) / (k1 - k0) - value(k)));
  }
  return most;
}

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

/** The commands that place a thing (S 0xC112, 0xC27E, 0xC19E). */
const THING_COMMANDS: readonly number[] = [COMMAND.thing, COMMAND.pitThing, COMMAND.finishThing];

/**
 * A lap's things ([Its things placed](../../../docs/continental-circus-road-data.md#its-things-placed)): each station's
 * descriptions, the records of one running position in their order, a pit lane's thing (command 4) only within its
 * lap's pit lanes (`pits`), which the original places only while its word 0x84590 is set (S 0xC27E), here always
 * (default; K confirms at the stage's end).
 */
function lapThings(records: readonly LapRecord[], pits: readonly PitLane[], name: string) {
  const stations = new Map<number, number[]>();
  for (const r of records.filter((x) => THING_COMMANDS.includes(x.command))) {
    if (r.command === COMMAND.pitThing && !pits.some((p) => r.at >= p.from && r.at <= p.to))
      throw contractUnmet(`${name}'s pit lane's thing at ${r.at} lies in no pit lane`);
    stations.set(r.at, [...(stations.get(r.at) ?? []), r.argument]);
  }
  return [...stations].map(([at, addresses]) => ({ at, addresses }));
}

/**
 * A band's side: a side face's, from its lateral outward, its band beyond its outer edge alone; any other's both.
 */
const sideOf = (t: ContinentalCircusThing): BandOf['sides'] =>
  t.type !== THING_TYPE.sideFace ? 'both' : t.lateral < 0 ? 'left' : 'right';

/** A band of one description, `contcirc-<its address>`, or a zone's side face, `contcirc-zone-<its kind>`. */
const bandOf = (t: ContinentalCircusThing, name = stemOf([t.address])): BandOf => ({
  name,
  described: [t],
  sides: sideOf(t),
});

/**
 * A passage's face's opening ([Things of several pieces](../../../docs/original-road-data.md#things-of-several-pieces)):
 * the clear columns about its point `x` in its row on the ground (`base` rows above its bottom edge), pixels either side.
 */
function openingOf(face: {
  readonly picture: { readonly width: number; readonly height: number; readonly pixels: ArrayLike<number> };
  readonly x: number;
  readonly base: number;
}) {
  const { width, height, pixels } = face.picture;
  const row = (height - 1 - Math.round(face.base)) * width;
  const point = Math.floor(face.x);
  if (pixels[row + point]) throw contractUnmet("A passage's face has no opening at its point");
  let [left, right] = [point, point];
  while (left > 0 && !pixels[row + left - 1]) left--;
  while (right < width - 1 && !pixels[row + right + 1]) right++;
  return Math.min(face.x - left, right + 1 - face.x);
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
  const fill = roadEntry(continentalCircusFill(main, sub, tiles));
  // A lateral unit, metres: the road's half width over 0x40000 (`HALF_WIDTH_UNITS`); a height unit is UP of it, a row
  // at a distance as a unit across is a column ([Its scale across](../../../docs/continental-circus-road-data.md#its-road-across)).
  const lateral = halfMetres / 0x40000;
  const unit = lateral * UP;
  const limit = carLimit(sub) * pixelMetres;
  const outputs = new OriginalOutputs();
  // Its things: each lap's stations' descriptions, each joined thing one picture, drawn once for all its courses, a
  // pixel its own car's line's at its full size; its side faces and ceilings are bands, not among them.
  const sprites = assembleContinentalCircusSprites(set);
  const described = continentalCircusThings(sub);
  const joined = stationThings(sub, sprites, pixelMetres);
  const zoneFace = zoneSideFace(sub);
  // Each course's lap on its model, its stations, and its heights at factor 1.
  const laps = COURSE_IDS.map((id, c) => {
    const lap = continentalCircusLap(sub, c);
    const name = CONTINENTAL_CIRCUS_COURSES[c]!;
    const inputs = lapInputs(sub, halfMetres, c);
    const laid = courseOnModel(id, `CONTINENTAL CIRCUS ${name}`, inputs);
    const table = curveTable(sub, lap);
    const station = lapStations(table, laid.intervals);
    const heights = lapProfile(lapRises(lapHills(main, lap)), station, laid.length, unit, laid.length / lap.length);
    const lapZoneList = lapZones(sub, lap);
    const zones = lapZoneList.map((z) => ({ kind: z.kind, from: station(z.from), to: station(z.to) }));
    // Its pit lanes, road A's words in them open road's: no zone lies in one.
    const pits = lapPitLanes(sub, lap);
    if (pits.some((p) => lapZoneList.some((z) => z.from < p.to && z.to > p.from)))
      throw contractUnmet(`${name}'s zone lies in a pit lane`);
    // Its stations' things, and its bands fixed on the screen ([Its bands](../../../docs/continental-circus-road-data.md#its-bands)):
    // each side face and ceiling a band of its own; a tunnel's start whose thing spans the road's centre (JAPAN's
    // bridge) that thing and its station's side faces one band across the road, a passage as far as the tunnel's end;
    // and each zone of the zone task's side face's kind that face, its zone's end less its `nearer` positions.
    const stations = lapThings(lap.records, pits, name).map((t) => ({ ...t, groups: joined(t.addresses) }));
    const spans = (group: readonly number[]) =>
      group.some((a) =>
        described(a).pieces.some((p) => -BIG_SPRITE < described(a).lateral + p.x && described(a).lateral + p.x <= 0),
      );
    const isOf = (type: number) => (t: { addresses: readonly number[] }) =>
      t.addresses.some((a) => described(a).type === type);
    const passages = stations.flatMap((t) => {
      const face = isOf(THING_TYPE.tunnelStart)(t) ? t.groups.find(spans) : undefined;
      if (!face) return [];
      const end = stations.find((u) => u.at > t.at && isOf(THING_TYPE.tunnelEnd)(u));
      if (!end) throw contractUnmet(`${name}'s passage at ${t.at} has no tunnel's end`);
      const addresses = t.addresses.filter((a) => face.includes(a) || described(a).type === THING_TYPE.sideFace);
      return [
        {
          at: t.at,
          to: end.at,
          face,
          band: { name: stemOf(addresses), described: addresses.map(described), sides: 'both' as const },
        },
      ];
    });
    const things = stations.map((t) => ({
      ...t,
      things: t.groups.filter((g) => !passages.some((p) => p.at === t.at && p.face === g)),
    }));
    const screenBands = [
      ...stations.flatMap((t) =>
        t.addresses
          .map(described)
          .filter(
            (d) =>
              d.type <= THING_TYPE.sideFace && !passages.some((p) => p.at === t.at && p.band.described.includes(d)),
          )
          .map((d) => ({ at: t.at, band: bandOf(d) })),
      ),
      ...lapZoneList
        .filter((z) => z.kind === zoneFace.kind)
        .map((z) => ({
          at: z.to - zoneFace.nearer.by,
          band: bandOf(zoneFace.face, `contcirc-zone-${z.kind.toString(16)}`),
        })),
    ];
    return { id, c, name, lap, laid, station, heights, inputs, zones, pits, things, fixed: { screenBands, passages } };
  });
  const keyOf = (addresses: readonly number[]) => addresses.join('+');
  const boards = new Map(
    continentalCircusBoards(
      main,
      sub,
      sprites,
      laps.flatMap((l) => l.things.flatMap((t) => t.things)),
      pixelMetres,
      lateral,
    ).map((b) => [keyOf(b.addresses), b]),
  );
  for (const b of boards.values()) outputs.file(b.image.path, b.image.bytes);
  const bandBoards = new Map(
    continentalCircusBands(
      main,
      sub,
      sprites,
      laps.flatMap((l) => [...l.fixed.screenBands, ...l.fixed.passages].map((b) => b.band)),
      pixelMetres,
      lateral,
    ).map((b) => [b.name, b]),
  );
  for (const b of bandBoards.values()) for (const image of b.images) outputs.file(image.path, image.bytes);
  // The grades' factor, one for the eight: the lens ratio, its eye's rows at a distance over its screen's, within the
  // grade limit by the steepest grade any course reaches at factor 1.
  const steepest = Math.max(...laps.map((l) => steepestGrade(profileOf(l.heights.bends, [], l.heights.kinks))));
  const focalRows = POSITION_METRES / unit;
  const factor = lensFactor(focalRows, SCREEN_ROWS, steepest);
  // Road B, the pit lane: its picture, its parts' groups as the main program writes its words, and the two roads' order.
  const pitLane = picture.pitLane;
  const roadBGroups = roadB(main).map((w) => attributeOf(w).group);
  const levels = pitLaneLevels(main, attributes.openWords);
  const pitDeparts = Math.max(...laps.flatMap((l) => l.pits.map((p) => profileDeparts(p.samples))), 0);
  const courses = laps.map(({ id, c, name, lap, laid, station, heights, inputs, zones, pits, things, fixed }) => {
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
    const roadAPieces = piecesAcross(picture);
    const across = roadAPieces.map((p) => pieceOf(p.from, p.to, p.part, p.pen));
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
    // the ground its pixel 0 gives; beyond an edge whose word draws no ground, BG0's fill's color, the road's colors'
    // entry, unstriped; a part whose colors are open road's not laid again.
    const beyondRuns: Run[] = [{ from: 0, length: BANK_PERIOD, color: colors(fill.bank, fill.group, fill.pixel) }];
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
    // Its pit lanes, each road B beside road A as two roads ([Its pit lanes](../../../docs/continental-circus-road-data.md#its-pit-lanes)):
    // its centre a Boundary through its knots, and each piece of its picture where it shows over road A in the
    // TC0150ROD's order (`shownPieces`), cut where the arrangement changes (`arrangements`) and drawn in where it narrows
    // to nothing (`drawnIntervals`), a place's colors in its word's group by its place, of no material.
    const roadBPieces = piecesAcross(pitLane);
    const pictures = [roadPicture(roadAPieces, picture.bodyPen), roadPicture(roadBPieces, pitLane.bodyPen)];
    const pitLines = pits.map((pit, j) => ({
      id: `pit-lane-${j + 1}`,
      knots: pitLaneKnots(pit, station, pitLane.halfMetres, lateral),
    }));
    const pitStrips = pitLines.flatMap(({ id: line, knots }) => {
      const centre = straightThrough(knots);
      const edgesAt = (s: number) => pictures.map((p, r) => p.map((e) => (r === 0 ? e.at : centre.at(s) + e.at)));
      const regimes = arrangements(
        knots[0]![0],
        knots.at(-1)![0],
        knots.map(([s]) => s),
        (s) => edgesAt(s).flat(),
        (s) => {
          const shown = shownPieces(edgesAt(s), pictures, levels).filter((p) => p.road === 1);
          return { key: JSON.stringify(shown), intervals: shown };
        },
      );
      const lateralAt = (e: FeatureEdge, s: number) => (e.road === 0 ? e.at : centre.at(s) + e.at);
      const written = (e: FeatureEdge): Lateral =>
        e.road === 0 ? micrometre(e.at) : { boundary: line, offset: micrometre(e.at) };
      return [...drawnIntervals(regimes, (p) => (s: number) => lateralAt(p.right, s) - lateralAt(p.left, s))].flatMap(
        ({ interval, from, to }) => {
          const piece = roadBPieces[interval.piece]!;
          const group = roadBGroups[piece.part === 'left' ? 0 : piece.part === 'right' ? 1 : 2]!;
          return placeStrips(
            runsOf(group, piece.pen),
            from,
            to,
            zero,
            mean,
            written(interval.left),
            written(interval.right),
          );
        },
      );
    });
    const surface = [
      { parts, every: period, count: Math.ceil((length - zero) / period) + 1 },
      ...zoneStrips,
      ...pitStrips,
    ];
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
    // Its things at their stations, each its picture at its point, with its body; its checkpoints the stations of its
    // descriptions of type 2 (default; K confirms at the stage's end: the original sets its flag as the car comes
    // within 0x100 positions of it, S 0x2B2A to 0x2B36, 0x2D54).
    const objects = things.flatMap((t) =>
      t.things.map((addresses) => {
        const board = boards.get(keyOf(addresses))!;
        return {
          s: station(t.at),
          lateral: board.lateral,
          height: board.groundOffset,
          image: board.name,
          palette: board.palette,
          body: board.body,
        };
      }),
    );
    // Its bands at their stations, each its picture, with its body, and its bands beyond its edges; a passage's at equal
    // steps from its start as far as its tunnel's end, so fine that the eye sees nothing through them (`passageSteps`),
    // its body on its first, at its start.
    const bandsAt = (at: number, name: string, withBody: boolean) => {
      const band = bandBoards.get(name)!;
      return band.names.map((image, k) => ({
        s: at,
        lateral: band.lateral,
        height: band.groundOffset + (k ? band.rise : 0),
        image,
        palette: band.palette,
        body: k === 0 && withBody ? band.body : null,
      }));
    };
    const { screenBands, passages } = fixed;
    const steps = passages.map((p) => {
      const { face } = bandBoards.get(p.band.name)!;
      const [from, to] = [station(p.at), station(p.to)];
      const laid = passageSteps(face.picture, { ...face, half: openingOf(face) }, pixelMetres * UP, to - from);
      return { from, ...laid, name: p.band.name };
    });
    const bandObjects = [
      ...screenBands.flatMap((b) => bandsAt(station(b.at), b.band.name, true)),
      ...steps.flatMap((p) =>
        Array.from({ length: p.steps }, (_, k) => bandsAt(p.from + k * p.step, p.name, k === 0)).flat(),
      ),
    ];
    const checkpoints = things
      .filter((t) => t.addresses.some((a) => described(a).type === THING_TYPE.checkpoint))
      .map((t, k) => ({ id: `${id}-CP${k + 1}`, s: station(t.at) }));
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
      objects: [...objects, ...bandObjects],
      checkpoints,
      limits,
      lane: halfMetres,
      leastLaneRadius: laneRadius(halfMetres),
      lines: pitLines,
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
      // Its pit lanes: each its stretch's start and end, metres from the line, and its centre's farthest from P, left.
      pitLanes: pitLines.map(({ knots }) => ({
        from: round1(knots[0]![0]),
        to: round1(knots.at(-1)![0]),
        farthest: round3(-Math.min(...knots.map(([, x]) => x))),
      })),
      // Its things: its descriptions placed, its pictures placed and distinct, those with a body, and its
      // checkpoints, metres from the line.
      things: {
        placements: things.reduce((n, t) => n + t.things.flat().length, 0),
        pictures: objects.length,
        distinct: new Set(objects.map((o) => o.image)).size,
        bodies: objects.filter((o) => o.body).length,
        checkpoints: checkpoints.map((k) => round1(k.s)),
      },
      // Its bands: each its image, station, metres from the line, and whether it has a body; its passages' steps.
      bands: [
        ...screenBands.map((b) => ({
          image: b.band.name,
          at: round1(station(b.at)),
          body: !!bandBoards.get(b.band.name)!.body,
        })),
        ...steps.map((p) => ({ image: p.name, at: round1(p.from), steps: p.steps, step: round3(p.step) })),
      ],
      startFromLine: round3(-start),
      gridFromLine: [course.grid[0]!, course.grid.at(-1)!].map((slot) => round3(length - slot.s)),
      heights: {
        ...heightsReport(profile, length),
        runs: heights.runs,
        // The model's factor, and the most the grade and the height depart from the ROM's, as laid.
        factor: round3(within.factor),
        departs: {
          grade: round3(heights.departure.grade * scaled),
          height: round3(heights.departure.height * scaled),
        },
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
      // Its things' pictures: how many, those joined of several descriptions, and the most body parts one has.
      pictures: {
        count: boards.size,
        joined: [...boards.values()].filter((b) => b.addresses.length > 1).length,
        mostParts: Math.max(...[...boards.values()].map((b) => b.body?.length ?? 0)),
      },
      heightUnitMetres: Number(unit.toPrecision(5)),
      limit: round3(limit),
      // Road B, the pit lane: its half width, its lines, and the most its knots depart from its profile, metres.
      pitLane: {
        half: round3(pitLane.halfMetres),
        lines: pitLane.lines.map((l) => [round3(l.from), round3(l.to)]),
        departs: Number((pitDeparts * lateral).toPrecision(3)),
      },
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
  left: Lateral | null,
  right: Lateral | null,
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
