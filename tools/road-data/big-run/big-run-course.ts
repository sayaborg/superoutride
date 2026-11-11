/**
 * BIG RUN's conversion ([BIG RUN road data](../../../docs/big-run-road-data.md#its-conversion)): its six courses, each
 * its stage from its start, laid on back for its grid, to the first record past its goal, laid by `road-layout` with
 * road 2 as P and road 1 beside it, its heights, lanes, pictures, colors, materials and skies as its programs give them.
 */
import type {
  CoursePosition,
  EnvironmentDocument,
  LaneDocument,
  Lateral,
  StripDocument,
} from '../../../src/course/course-document.js';
import { CAMERA_DEFINITION } from '../../../src/view/camera-definition.js';
import { cameraDistance } from '../../../src/view/camera.js';
import { instruction } from '../cpu/program-words.js';
import { contractUnmet } from '../shared/conversion-errors.js';
import { round1, round3, OriginalOutputs, type Conversion } from '../shared/conversion.js';
import { CoursePath } from '../shared/course-path.js';
import { crestTrials } from '../shared/crest-trials.js';
import { groundMaterial } from '../shared/ground-material.js';
import { gridReach, type StartGrids } from '../shared/grid-rule.js';
import { PiecewiseLinear, straightThrough } from '../shared/piecewise-linear.js';
import type { ProgramLimits } from '../shared/program-limits.js';
import { layRoad } from '../shared/road-layout.js';
import type { Bend, Kink } from '../shared/road-profile.js';
import type { Material } from '../shared/road-surface.js';
import type { RomSet } from '../shared/rom-set.js';
import { lensFactor } from '../shared/screen-pieces.js';
import { micrometre, simplified, spriteElement, stripElement } from '../shared/section-writing.js';
import { bakeSky, sectionYawOrigin, SKY_HORIZON, skyYawOrigin } from '../shared/sky-baking.js';
import { lanesOverTwoRoads, type DrivenLanes } from '../shared/two-roads.js';
import { bigRunBoards, boardName } from './big-run-boards.js';
import { bigRunObjects, ownCarUnits, spritePalette, type BigRunObject } from './big-run-objects.js';
import { spritePen } from '../jaleco/zoom-sprites.js';
import { bigRunScenes, bigRunSky, PLANE_TURN, SKY_MIDDLE, STAGES, type BigRunScene } from './big-run-backgrounds.js';
import { bigRunProfile, steepestRecordGrade } from './big-run-heights.js';
import { bigRunPlan } from './big-run-plan.js';
import {
  lineRuns,
  nearestLine,
  paintedRuns,
  roadPictureOf,
  rowEntry,
  SKY_ENTRIES,
  skyChangeAt,
  stagePalettes,
  STRIPE_PERIOD,
  stripes,
  townEnd,
  type LayerPalette,
} from './big-run-road-picture.js';
import {
  assembleBigRunMain,
  assembleBigRunRoadCpu,
  assembleBigRunSprites,
  BIG_RUN_ROAD_ROMS,
  BIG_RUN_TILE_ROMS,
  concatenated,
} from './big-run-rom.js';
import {
  bigRunRoad,
  heldStretches,
  positionMetres,
  stageCheckpoint,
  stageGoal,
  stageGrid,
  TICK_SECONDS,
  type BigRunPlanRecord,
  type BigRunProfileRecord,
  type BigRunRoad,
} from './big-run-road.js';

export const BIG_RUN_CONVERSION_VERSION = 1;

/** Its courses' names, a stage each (K, 2026-11-09). */
const NAMES = Object.freeze([
  'STARTING RUN',
  'SPECIAL STAGE 1',
  'SPECIAL STAGE 2',
  'SPECIAL STAGE 3',
  'SPECIAL STAGE 4',
  'VICTORY RUN',
]);
const idOf = (name: string) => `big-run-${name.toLowerCase().replace(/ /g, '-')}`;

/**
 * Its scale across (K, 2026-11-09): its own car's straight picture (`ownCarUnits`) is as wide as a Peugeot 405 Turbo 16
 * Grand Raid, 1.76 m (Ultimatecarpage).
 */
const CAR_METRES = 1.76;

/** Its screen: 224 rows shown at 4:3 of 256 columns, a pixel 7/6 as wide as high. */
const SCREEN_ROWS = 224;
const PIXEL_ASPECT = 7 / 6;
/**
 * Its eye's focal length, pixels: a row's depth z and scale s (R1's tables at 0x1ADC and 0x1B9A, s 16,384 a pixel a
 * unit) keep (z + F) × s = F × 16,384; the slice whose scale is nearest half gives F.
 */
function focalRows(road1: Uint8Array) {
  const at = (k: number) =>
    [
      road1[0x1adc + 2 * k]! * 256 + road1[0x1adc + 2 * k + 1]!,
      road1[0x1b9a + 2 * k]! * 256 + road1[0x1b9a + 2 * k + 1]!,
    ] as const;
  let k = 0;
  while (at(k)[1] > 0x2000) k++;
  const [z, s] = at(k);
  return (z * s) / (0x4000 - s);
}

/** The ground between the roads' pictures, beyond their ends, is the course's to its limits, this far out, units. */
const LIMIT_UNITS = 512;
/** How far apart in height the two roads may be where they share their plan for both to be drawn, metres (K, 2026-11-11). */
const DRAWN_APART = 1;
/** A course's road past its goal, at most, positions: the camera's distance behind the car, as the finish needs. */
const RUN_OUT = 2000;
/** No Section is cut this near the grid's front, positions. */
const GRID_CLEAR = 1000;
/** The material beneath a clear run, which shows no ground: the desert's. */
const CLEAR_GROUND: Material = 'SAND';
/** Road 1's lateral is sampled this often along a parting, positions. */
const SAMPLE = 500;
/** A stripe's part: the stripes' runs are whole multiples of it, positions. */
const STRIPE_PART = 15;
/** The ramp's sets: the first, and the last its change fades to. */
const LAST_SKY_SET = 15;
/** The sky's change: two of its entries a call, a call a tick, through its 16 sets (M 0xBC66 to 0xBCD6). */
const SKY_FADE_TICKS = 48;
/** The speed a sky's change is laid at, km/h: its fade's ticks laid over the road a car covers at it. */
const FADE_KMH = 200;

/** Strips over a period laid as runs, `runs` positions from the period's start, repeated from `zero` over `[a, b]`. */
function periodic<T>(
  run: { readonly from: number; readonly to: number },
  period: number,
  zero: number,
  a: number,
  b: number,
  strip: (from: number, to: number) => T,
) {
  const out: (T | { kind: 'repeat'; every: number; count: number; elements: T[] })[] = [];
  const length = run.to - run.from;
  const phase = zero + run.from;
  let first = phase + Math.ceil((a - phase) / period - 1e-9) * period;
  // A run begun before `a`.
  if (first - period + length > a + 1e-6) out.push(strip(a, Math.min(b, first - period + length)));
  const every = micrometre(period);
  let count = 0;
  while (first + count * period + length <= b + 1e-9) count++;
  if (count > 0 && micrometre(first + length) + (count - 1) * every > b) count--;
  if (count > 0) {
    const element = strip(first, first + length);
    out.push(count === 1 ? element : { kind: 'repeat', every, count, elements: [element] });
  }
  first += count * period;
  if (first < b - 1e-6) out.push(strip(first, Math.min(b, first + length)));
  return out;
}

/**
 * A sprite's pixel at its descriptor's scale 128, units across: the objects' zoom at distance d (M 0xAB28: the table at
 * 0x11DE00, a word a position, its low byte the zoom, 128 a tile's own size) over the road's pixels a unit there,
 * 600 ÷ (d + 600) ([its camera](../../../docs/big-run-road-data.md#its-camera)), at the distance 600 ahead.
 */
function spritePixelUnits(main: Uint8Array) {
  const [high, low] = instruction(main, 0xab28, [0x43f9, null, null], "the objects' zoom (lea)");
  const d = EYE;
  const zoom = main[high * 0x10000 + low + 2 * d + 1]!;
  return zoom / 128 / (EYE / (d + EYE));
}
/** An object's flags: mirrored (bit 8, M 0xB186), and a hit (bits 9 and 10, M 0xB52A to 0xB540). */
const MIRRORED = 0x100;
const HIT = 0x600;
/** A screen pixel's height over its width: 256 × 224 shown at 4:3. */
const SCREEN_PIXEL_HEIGHT = 6 / 7;
/** Its eye's distance behind the plane a unit is a pixel at, positions. */
const EYE = 600;

/** BIG RUN's courses from its ROM set. */
export function bigRunCourses(set: RomSet) {
  const main = assembleBigRunMain(set);
  const cpus = [assembleBigRunRoadCpu(set, 0), assembleBigRunRoadCpu(set, 1)] as const;
  const programOf = (road: BigRunRoad) => cpus[road - 1]!;
  const rom = concatenated(set, BIG_RUN_ROAD_ROMS);
  const tiles = [concatenated(set, BIG_RUN_TILE_ROMS[0]!), concatenated(set, BIG_RUN_TILE_ROMS[1]!)] as const;
  const metres = positionMetres(main);
  const outputs = new OriginalOutputs();
  // Its town's picture, whose lanes its two roads keep wherever they go (K, 2026-11-11).
  const town = paintedRuns(lineRuns(rom, nearestLine(programOf(2), 2, 0, 0, true)));
  const lanes = lanesOverTwoRoads(roadPictureOf(town));
  // Each stage's end, past its goal by RUN_OUT or to the first record of either road past it, and its tables to it.
  const stages = Array.from({ length: STAGES }, (_, stage) => {
    const goal = stageGoal(main, stage);
    const reach = (road: BigRunRoad) => bigRunRoad(programOf(road), road, stage, goal + RUN_OUT);
    const after = [1, 2]
      .flatMap((r) => {
        const t = reach(r as BigRunRoad);
        return [...t.plan, ...t.profile].map((p) => p.start);
      })
      .filter((s) => s > goal);
    const end = Math.min(goal + RUN_OUT, ...after);
    return {
      stage,
      goal,
      end,
      roads: [bigRunRoad(programOf(1), 1, stage, end), bigRunRoad(programOf(2), 2, stage, end)],
    };
  });
  // Its heights' factor: its lens ratio, or the grades' limit over its steepest grade where that is less (K, 2026-11-09).
  const steepest = Math.max(...stages.flatMap((s) => s.roads.map((t) => steepestRecordGrade(t.profile, s.goal))));
  const f = lensFactor(focalRows(cpus[0]), SCREEN_ROWS, steepest);
  const skies = new Set<string>();
  const sprites = assembleBigRunSprites(set);
  const carUnits = ownCarUnits(main, (tile, x, y) => spritePen(sprites, tile, x, y));
  const ACROSS = CAR_METRES / carUnits;
  // A sprite's pixel at scale 128, metres: its zoom at a distance over the road's pixels a unit there (M 0x11DE00).
  const unitMetres = spritePixelUnits(main) * ACROSS;
  // Its objects' boards: one a descriptor and mirroring over every stage, a palette each set of its colors a stage's
  // sprites' palette gives the entry its objects take.
  const paletteNames = new Map<string, Map<string, string>>();
  const usesOf = new Map<
    string,
    { descriptor: number; mirrored: boolean; palettes: { name: string; colors: readonly number[] }[] }
  >();
  const paletteOf = (stage: number, o: BigRunObject) =>
    paletteNames.get(boardName(o.descriptor, (o.flags & MIRRORED) !== 0))!.get(`${stage} ${o.color}`)!;
  for (const { stage, end } of stages) {
    const colors = spritePalette(main, stage);
    for (const o of bigRunObjects(main, stage)) {
      if (o.kind !== 0 || o.position >= end) continue;
      const entry = colors[o.color];
      if (!entry)
        throw contractUnmet(`${NAMES[stage]}'s objects take sprite colors ${o.color} its stage loads none of`);
      const mirrored = (o.flags & MIRRORED) !== 0;
      const key = boardName(o.descriptor, mirrored);
      const use = usesOf.get(key) ?? { descriptor: o.descriptor, mirrored, palettes: [] };
      usesOf.set(key, use);
      const names = paletteNames.get(key) ?? new Map<string, string>();
      paletteNames.set(key, names);
      if (names.has(`${stage} ${o.color}`)) continue;
      const same = use.palettes.find((p) => p.colors.join() === entry.join());
      const name =
        same?.name ??
        `p${String(o.color).padStart(3, '0')}${use.palettes.some((p) => p.name.startsWith(`p${String(o.color).padStart(3, '0')}`)) ? `-${stage}` : ''}`;
      if (!same) use.palettes.push({ name, colors: entry });
      names.set(`${stage} ${o.color}`, name);
    }
  }
  const boards = new Map(
    bigRunBoards(main, sprites, [...usesOf.values()], unitMetres, SCREEN_PIXEL_HEIGHT).map((b) => [b.name, b]),
  );
  for (const b of boards.values()) outputs.file(b.image.path, b.image.bytes);
  const courses = stages.map(({ stage, goal, end, roads: [road1, road2] }) => {
    const name = NAMES[stage]!;
    const id = idOf(name);
    const town0 = stage === 0 ? townEnd(programOf(2), 2) : 0;
    const inTown = (p: number) => p < town0;
    // Its plan: road 2 as P, road 1 beside it.
    const plan = bigRunPlan(road1!.plan, road2!.plan, end, metres, () => 0);
    const leaving = plan.beside.partings.filter((g) => !g.meets);
    const leavesAt = leaving.length ? leaving[0]!.from : Infinity;
    // Road 1's centre, units across from P: where it parts and meets P again, its own; where it leaves, P's.
    const knots = [
      ...new Set([
        0,
        end,
        ...road1!.plan.map((r) => r.start),
        ...road2!.plan.map((r) => r.start),
        ...plan.beside.partings.flatMap((g) =>
          g.meets
            ? Array.from({ length: Math.ceil((g.to - g.from) / SAMPLE) + 1 }, (_, k) =>
                Math.min(g.to, g.from + k * SAMPLE),
              )
            : [g.from],
        ),
      ]),
    ]
      .filter((p) => p >= 0 && p <= end)
      .sort((a, b) => a - b);
    const lateral1 = straightThrough(
      knots.map((p) => [p, p >= leavesAt ? 0 : (plan.beside.lateralAt(p) * metres) / ACROSS] as const),
    );
    // A road that leaves P and never meets it again, the road not taken (K, 2026-11-09), drawn as far as it heads within
    // 60° of P, where its lateral is taken across P; its lanes none of the course's.
    const notTaken: number[] = [];
    if (leavesAt < end)
      for (let p = leavesAt; p <= end; p += SAMPLE) {
        try {
          notTaken.push(p, plan.beside.lateralAt(p));
        } catch {
          break;
        }
      }
    const notTakenEnd = notTaken.length ? notTaken[notTaken.length - 2]! : leavesAt;
    const shown1 = straightThrough([
      ...knots.filter((p) => p < leavesAt).map((p) => [p, lateral1.at(p)] as const),
      ...Array.from(
        { length: notTaken.length / 2 },
        (_, k) => [notTaken[2 * k]!, (notTaken[2 * k + 1]! * metres) / ACROSS] as const,
      ),
      ...(notTakenEnd < end ? [[end, 0] as const] : []),
    ]);
    // The road the original holds the car on, where it does; its heights the course's there (K, 2026-11-11).
    const held = heldStretches(main, stage);
    const heldOn = (p: number): BigRunRoad => held.find((h) => h.from <= p && p < h.to)?.road ?? 2;
    const onRoad1 = held.filter((h) => h.road === 1);
    const profileRecords: BigRunProfileRecord[] = [
      ...road2!.profile.filter((r) => !onRoad1.some((h) => r.start >= h.from && r.start < h.to)),
      ...road1!.profile.filter((r) => onRoad1.some((h) => r.start >= h.from && r.start < h.to)),
    ].sort((a, b) => a.start - b.start);
    for (const h of onRoad1)
      if (!road1!.profile.some((r) => r.start === h.from) || !road2!.profile.some((r) => r.start === h.to))
        throw contractUnmet(`${name}'s stretch held on road 1 does not start and end at the roads' records`);
    const heights = bigRunProfile(profileRecords, end);
    const otherHeights = [bigRunProfile(road1!.profile, end).profile, bigRunProfile(road2!.profile, end).profile];
    // The grid: the own car's slot (the first) and the others', each on its road (laterals units across).
    const grid = stageGrid(main, stage);
    const slotLateral = (k: number) => {
      const slot = grid[k]!;
      return (slot.road === 1 ? lateral1.at(slot.position) : 0) + slot.lateral;
    };
    const ownLateral = slotLateral(0) * ACROSS;
    // The lanes along P, road 1's and road 2's, metres.
    const along = lanes.lanesAlong(lateral1, new PiecewiseLinear([{ from: 0, to: end, a: 0, b: 0 }]));
    const laneNames = ['a', 'b', 'c', 'm', 'd', 'e', 'f'] as const;
    const laneAt = (lane: keyof DrivenLanes, p: number) => along.widths[lane].at(p) * ACROSS;
    const leftEdge = (p: number) => (along.centreLane.at(p) - along.widths.a.at(p) - along.widths.b.at(p) / 2) * ACROSS;
    const rightEdge = (p: number) => leftEdge(p) + laneNames.reduce((sum, l) => sum + laneAt(l, p), 0);
    const stand = (s: number): StartGrids => {
      const lefts = laneNames.filter((l) => laneAt(l, grid[0]!.position) > 0);
      let x = leftEdge(grid[0]!.position);
      let own = lefts[0]!;
      for (const l of lefts) {
        if (ownLateral >= x) own = l;
        x += laneAt(l, grid[0]!.position);
      }
      const k = lefts.indexOf(own);
      const pair = k + 1 < lefts.length ? [own, lefts[k + 1]!] : [lefts[k - 1]!, own];
      const boundary =
        leftEdge(grid[0]!.position) +
        lefts.slice(0, lefts.indexOf(pair[1]!)).reduce((sum, l) => sum + laneAt(l, grid[0]!.position), 0);
      return {
        origin: { s, lateral: micrometre(ownLateral) },
        originals: {
          car: {
            places: grid.map((slot, j) => ({
              ahead: (slot.position - grid[0]!.position) * metres,
              right: slotLateral(j) * ACROSS - ownLateral,
            })),
          },
        },
        limits: [
          ownLateral - leftEdge(grid[0]!.position) + LIMIT_UNITS * ACROSS,
          rightEdge(grid[0]!.position) - ownLateral + LIMIT_UNITS * ACROSS,
        ],
        lanes: [pair[0]!, pair[1]!],
        meet: boundary - ownLateral,
        laneWidth: Math.min(...pair.map((l) => laneAt(l as keyof DrivenLanes, grid[0]!.position))),
      };
    };
    // Laid on back for its grid and the camera behind its rearmost slot.
    const back = Math.ceil(gridReach(stand(0)) + cameraDistance(CAMERA_DEFINITION));
    const station = (p: number) => back + p * metres;
    const positionOf = (s: number) => (s - back) / metres;
    // Its plan's pieces, metres: an arc after an arc of its own radius and side one arc, as the format holds them.
    const pieces: { length: number; turn: number }[] = [{ length: back, turn: 0 }];
    for (const e of plan.p.elements) {
      const piece = { length: (e.to - e.from) * metres, turn: e.turn };
      const last = pieces.at(-1)!;
      const same =
        last.turn !== 0 && piece.turn !== 0 && Math.abs(last.turn / last.length - piece.turn / piece.length) < 1e-12;
      if (same) pieces[pieces.length - 1] = { length: last.length + piece.length, turn: last.turn + piece.turn };
      else pieces.push(piece);
    }
    const path = new CoursePath(pieces);
    const laidLength = path.length;
    // Its heights, f times its 3D road's, in metres.
    const bends: Bend[] = heights.profile.bends.map((b) => ({
      from: station(b.from),
      to: station(b.to),
      curvature: (b.curvature * f) / metres,
    }));
    const kinks: Kink[] = heights.profile.kinks.map((k) => ({
      at: k.at === 0 ? 0 : station(k.at),
      change: k.change * f,
    }));
    // Where each road's picture changes, and where they part and meet: the Sections' cuts.
    const pictureAt = (road: BigRunRoad, p: number) => {
      const records = (road === 1 ? road1! : road2!).plan;
      return [...records].reverse().find((r) => r.start <= p) ?? records[0]!;
    };
    const changes = (records: readonly BigRunPlanRecord[]) =>
      records
        .filter((r, i) => i > 0 && (r.kind !== records[i - 1]!.kind || r.variant !== records[i - 1]!.variant))
        .map((r) => r.start);
    const cutsAt = [
      ...changes(road1!.plan),
      ...changes(road2!.plan),
      ...plan.beside.partings.flatMap((g) => [g.from, g.to]),
      ...held.flatMap((h) => [h.from, h.to]),
      ...(town0 ? [town0] : []),
      ...(leavesAt < end ? [notTakenEnd] : []),
    ].filter((p) => p > 0 && p < end);
    // Whether road `road` is drawn at `p`: the held road always; the other unless they share their plan and lie more than
    // a metre apart in height, or it has left P.
    const drawn = (road: BigRunRoad, p: number) => {
      if (road === heldOn(p)) return true;
      if (road === 1 && p >= leavesAt) return p < notTakenEnd;
      const apart = Math.abs(otherHeights[0]!.height(p) - otherHeights[1]!.height(p)) * f * metres;
      return !(Math.abs(lateral1.at(p)) < 1e-6 && apart > DRAWN_APART);
    };
    // A road's palette, its layer's (road 1 the first road CPU's), by its stage and sky's set.
    const palettes = [stagePalettes(main, stage), stagePalettes(main, stage, LAST_SKY_SET)] as const;
    // Its objects: those of kind 0, a picture standing where it is put, up to its end; the others, which the program
    // moves or picks, are not placed (counted).
    const objects = bigRunObjects(main, stage).filter((o) => o.position < end);
    const plain = objects.filter((o) => o.kind === 0);
    // Each object's place: its road's centre, its lateral its picture's left edge, its height over its road; on a road
    // not drawn, at that road's height below the course's, and none where it lies above or past the road not taken.
    const placeOf = (o: BigRunObject) => {
      const p = o.position;
      const centre = o.road === 2 ? 0 : shown1.at(p);
      let lift = o.height * ACROSS;
      if (o.road === 1 && p >= leavesAt && p >= notTakenEnd) return null;
      if (!drawn(o.road, p)) {
        const own = otherHeights[o.road - 1]!.height(p) - heights.profile.height(p);
        if (own > 0) return null;
        lift += own * f * metres;
      }
      const board = boards.get(boardName(o.descriptor, (o.flags & MIRRORED) !== 0));
      if (!board) return null;
      const palette = paletteOf(stage, o);
      const hit = (o.flags & HIT) === HIT;
      return {
        s: station(p),
        image: board.name,
        palette,
        lateral: (centre + o.lateral) * ACROSS,
        groundOffset: lift,
        body: hit
          ? [{ across: (board.colored[0] + board.colored[1]) / 2, width: board.colored[1] - board.colored[0] }]
          : null,
      };
    };
    const placed = plain.flatMap((o) => {
      const at = placeOf(o);
      return at ? [at] : [];
    });
    const stripeOf = [stripes(programOf(1), 1), stripes(programOf(2), 2)] as const;
    // A road's picture at `p` across: its painted runs and each run's colors over a stripe's period, its material.
    const runsOf = (road: BigRunRoad, p: number) => {
      const r: BigRunPlanRecord = pictureAt(road, p);
      const t = inTown(p);
      const line = nearestLine(programOf(road), road, r.kind, r.variant, t);
      const palette: LayerPalette = palettes[0][road - 1]!;
      const runs = paintedRuns(lineRuns(rom, line));
      const one = runs.filter((x) => x.pen !== null).length === 1;
      return runs.map((run) => {
        const colors = stripeOf[road - 1]!.map((stripe) => {
          if (run.pen === null) return null;
          const color = palette[rowEntry(r.kind, r.variant, t, stripe)]![run.pen];
          if (color === undefined) throw contractUnmet(`${name}'s road ${road} takes a pen its palette lacks`);
          return color;
        });
        const river = r.kind === 2;
        const material: Material | null =
          run.pen === null
            ? null
            : river || one || run.paint === 'outside'
              ? groundMaterial(colors[0]!)
              : t
                ? 'ASPHALT'
                : 'DIRT';
        if (material === 'WATER' && !(river && r.variant === 0))
          throw contractUnmet(`${name}'s ground at ${p} reads as water where no river is`);
        return { run, colors, material };
      });
    };
    // Its limits: LIMIT_UNITS beyond the outermost road's centre on each side.
    const limitKnots = (side: number) =>
      knots.map((p) => {
        const c = [0, ...(p < leavesAt ? [lateral1.at(p)] : [])];
        return [station(p), (side < 0 ? Math.min(...c) - LIMIT_UNITS : Math.max(...c) + LIMIT_UNITS) * ACROSS] as [
          number,
          number,
        ];
      });
    const limits: ProgramLimits = {
      left: [[0, limitKnots(-1)[0]![1]], ...limitKnots(-1)],
      right: [[0, limitKnots(1)[0]![1]], ...limitKnots(1)],
      ground: 'SAND',
    };
    // Its skies: each plane's scene in force and the ramp's set, changing where a scene starts or the ramp's change
    // begins (over its fade at the own car's top speed).
    const scenes = ([0, 1] as const).map((plane) => bigRunScenes(main, plane, stage));
    const sceneAt = (plane: 0 | 1, p: number): BigRunScene | undefined =>
      [...scenes[plane]!].reverse().find((sc) => sc.start <= p);
    const skyRecord = skyChangeAt(main, stage);
    const [first, last] = SKY_ENTRIES;
    const rampChanges =
      skyRecord < end &&
      Array.from(
        { length: last - first + 1 },
        (_, e) => palettes[0][1][first + e]!.join() !== palettes[1][1][first + e]!.join(),
      ).some(Boolean);
    const changeAt = rampChanges ? skyRecord : Infinity;
    const skyChanges = [...new Set([0, ...scenes.flat().map((sc) => sc.start), ...(rampChanges ? [skyRecord] : [])])]
      .filter((p) => p >= 0 && p < end)
      .sort((a, b) => a - b);
    const fade = (SKY_FADE_TICKS * TICK_SECONDS * FADE_KMH) / 3.6;
    const skyName = (p: number) => {
      const [back0, front] = [sceneAt(0, p), sceneAt(1, p)];
      const set = p >= changeAt ? LAST_SKY_SET : 0;
      return {
        image: `big-run-sky-${stage}-${back0 ? scenes[0]!.indexOf(back0) : 'none'}-${front ? scenes[1]!.indexOf(front) : 'none'}-${set}`,
        back: back0,
        front,
        set,
      };
    };
    const skyKnots = skyChanges.map((p, i) => ({
      s: i === 0 ? 0 : station(p),
      p,
      ...skyName(p),
      transition: p === changeAt && i > 0 ? fade : 0,
    }));
    for (const k of skyKnots)
      if (!skies.has(k.image)) {
        skies.add(k.image);
        const palette = palettes[k.set === 0 ? 0 : 1][1];
        outputs.file(
          `images/${k.image}.json`,
          JSON.stringify(
            bakeSky(k.image, bigRunSky(main, tiles, programOf(2), palette, k.back, k.front), PIXEL_ASPECT),
          ),
        );
      }
    // Each sky's yaw: its back plane faces its middle column where its scene loads, turning 8 pixels a degree.
    const headingAt = (p: number) => ((path.pose(station(p)).heading - path.pose(back).heading) * 180) / Math.PI;
    const yawOf = (k: (typeof skyKnots)[number], s: number) => {
      const loaded = k.back ? headingAt(k.back.start) : 0;
      const origin = skyYawOrigin(SKY_MIDDLE + (PLANE_TURN[0] / 360) * loaded, PLANE_TURN[0]);
      return micrometre(sectionYawOrigin(origin, ((path.pose(s).heading - path.pose(back).heading) * 180) / Math.PI));
    };
    // A Section's strips: each road's picture drawn, road 1's beneath road 2's, each run striped by its colors.
    const zero = back;
    const period = STRIPE_PERIOD * metres;
    const bandStrips = (
      colors: readonly (number | null)[],
      material: Material | null,
      left: Lateral | null,
      right: Lateral | null,
      a: number,
      b: number,
      positionAt: (s: number) => CoursePosition,
    ): StripDocument[] => {
      if (colors[0] === null)
        return [stripElement(positionAt(a), positionAt(b), left, right, 'transparent', null) as StripDocument];
      // The stripe's runs of one color, in parts of STRIPE_PART positions, the most common color laid over the whole.
      const parts: { from: number; to: number; color: number }[] = [];
      for (let k = 0; k < colors.length; k += STRIPE_PART) {
        const color = colors[k]!;
        const last = parts.at(-1);
        if (last && last.color === color) last.to = k + STRIPE_PART;
        else parts.push({ from: k, to: k + STRIPE_PART, color });
      }
      const count = new Map<number, number>();
      for (const q of parts) count.set(q.color, (count.get(q.color) ?? 0) + q.to - q.from);
      const base = [...count].sort((x, y) => y[1] - x[1])[0]![0];
      return [
        stripElement(positionAt(a), positionAt(b), left, right, base, material),
        ...parts
          .filter((q) => q.color !== base)
          .flatMap((q) =>
            periodic({ from: q.from * metres, to: q.to * metres }, period, zero, a, b, (x, y) =>
              stripElement(positionAt(x), positionAt(y), left, right, q.color, null),
            ),
          ),
      ] as StripDocument[];
    };
    const laid = layRoad({
      id,
      name,
      pieces,
      // Cut where a picture changes, but within its grid, whose stretch its first Section holds, and from its goal on.
      cuts: cutsAt.filter((p) => p > Math.max(...grid.map((g) => g.position)) + GRID_CLEAR && p < goal).map(station),
      reach: LIMIT_UNITS * ACROSS * 2,
      road: { bends, kinks },
      grids: stand(station(grid[0]!.position)),
      checkpoints: (() => {
        const cp = stageCheckpoint(main, stage);
        return cp === null ? [] : [{ id: `${id}-CP1`, s: station(cp) }];
      })(),
      finish: { id: `${id}-GOAL`, s: station(goal) },
      section: (span, positionAt) => {
        const steps = [
          span.from,
          ...knots.map(station).filter((s) => s > span.from + 1e-6 && s < span.to - 1e-6),
          span.to,
        ];
        // Its lanes, those wide somewhere in it.
        const widthKnots = laneNames.map((l) =>
          simplified(steps.map((s) => [s, micrometre(laneAt(l, Math.max(0, positionOf(s))))] as [number, number])),
        );
        const present = laneNames.filter((_, k) => widthKnots[k]!.some(([, w]) => w > 0));
        const laneDocs: LaneDocument[] = present.map((l) => {
          const w = widthKnots[laneNames.indexOf(l)]!;
          return {
            kind: 'lane',
            id: l,
            width: w.every(([, x]) => x === w[0]![1]) ? w[0]![1] : w.map(([s, x]) => ({ at: positionAt(s), width: x })),
          };
        });
        const centre = simplified(
          steps.map(
            (s) => [s, micrometre(along.centreLane.at(Math.max(0, positionOf(s))) * ACROSS)] as [number, number],
          ),
        );
        // Road 1's centre as a Boundary, its pictures' runs lying from it.
        const road1Knots = simplified(
          [...new Set([...steps, ...notTaken.filter((_, k) => k % 2 === 0).map(station)])]
            .filter((s) => s >= span.from && s <= span.to)
            .sort((a, b) => a - b)
            .map((s) => [s, micrometre(shown1.at(Math.max(0, positionOf(s))) * ACROSS)] as [number, number]),
        );
        const fromCentre = (road: BigRunRoad, x: number): Lateral =>
          road === 2 ? micrometre(x * ACROSS) : { boundary: 'road-1-centre', offset: micrometre(x * ACROSS) };
        // Its pictures' stretches: cut where either road's picture changes or one is drawn or not.
        const within = [
          span.from,
          ...cutsAt.map(station).filter((s) => s > span.from + 1e-6 && s < span.to - 1e-6),
          span.to,
        ];
        const strips = within.slice(0, -1).flatMap((a, j) => {
          const b = within[j + 1]!;
          if (!(b - a > 1e-3)) return [];
          const at = (Math.max(positionOf(a), 0) + positionOf(b)) / 2;
          // Road 2's clear runs first, road 1's picture over them, then road 2's own: where road 2 is clear the
          // picture beneath it shows, or none.
          const layer = (road: BigRunRoad, clear: boolean) => {
            if (!drawn(road, at)) return [];
            return runsOf(road, at).flatMap(({ run, colors, material }, k, all) => {
              if ((run.pen === null) !== clear) return [];
              const outerRun = k === 0 || k === all.length - 1;
              // The road not taken's picture has no material: the car never reaches it.
              const away = road === 1 && at >= leavesAt;
              const ground = away ? null : (material ?? CLEAR_GROUND);
              const colored = bandStrips(
                colors,
                outerRun ? null : ground,
                k === 0 ? null : fromCentre(road, run.from),
                k === all.length - 1 ? null : fromCentre(road, run.to),
                a,
                b,
                positionAt,
              );
              // An outer run's material out to within a unit of the picture's end, inside the limits, whose ground reaches on.
              const reaching =
                outerRun && !away
                  ? [
                      stripElement(
                        positionAt(a),
                        positionAt(b),
                        fromCentre(road, k === 0 ? 1 - LIMIT_UNITS : run.from),
                        fromCentre(road, k === 0 ? run.to : LIMIT_UNITS - 1),
                        null,
                        ground,
                      ),
                    ]
                  : [];
              return [...reaching, ...colored];
            });
          };
          return [...layer(2, true), ...layer(1, false), ...layer(2, false)];
        });
        const inForce = [...skyKnots].reverse().find((k) => k.s <= span.from + 1e-6)!;
        const environment = (k: (typeof skyKnots)[number], s: number): EnvironmentDocument => ({
          at: positionAt(s),
          name,
          background: { image: k.image, horizonY: SKY_HORIZON, yawOrigin: yawOf(k, span.from) },
          transition: k.s < span.from - 1e-6 ? 0 : micrometre(k.transition),
        });
        // Its outermost bands, which its ground's material reaches out from: the outer road's outer runs on each side.
        const mid = (Math.max(positionOf(span.from), 0) + positionOf(span.to)) / 2;
        const roadsDrawn = ([1, 2] as const).filter((road) => drawn(road, mid) && !(road === 1 && mid >= leavesAt));
        const outer = (side: number) => {
          const road = roadsDrawn.reduce((r, q) =>
            side * ((q === 1 ? lateral1.at(mid) : 0) - (r === 1 ? lateral1.at(mid) : 0)) > 0 ? q : r,
          );
          const runs = runsOf(road, mid);
          const { run, colors } = side < 0 ? runs[0]! : runs.at(-1)!;
          const centre = road === 1 ? lateral1.at(mid) : 0;
          const [from, to] = side < 0 ? [1 - LIMIT_UNITS, run.to] : [run.from, LIMIT_UNITS - 1];
          const color = colors[0];
          return {
            band: {
              left: (centre + from) * ACROSS,
              right: (centre + to) * ACROSS,
              colors: [color ?? 0],
              material: color === null || color === undefined ? ('SAND' as Material) : groundMaterial(color),
            },
            left: fromCentre(road, from),
            right: fromCentre(road, to),
          };
        };
        return {
          lanes: laneDocs,
          centerLane: 'b',
          centerLateral: centre.every(([, v]) => v === centre[0]![1])
            ? centre[0]![1]
            : centre.map(([s, lateral]) => ({ at: positionAt(s), lateral })),
          linkLane: 'b',
          // Its lanes driven on its held road's surface's material wherever its pictures give them none (a clear run).
          strips: [
            // The desert beneath all, from limit to limit, the ground between the roads' pictures where they lie apart.
            stripElement(
              positionAt(span.from),
              positionAt(span.to),
              { boundary: 'outer-left', offset: 0 },
              { boundary: 'outer-right', offset: 0 },
              null,
              CLEAR_GROUND,
            ),
            stripElement(
              positionAt(span.from),
              positionAt(span.to),
              { lane: present[0]!, side: 'left', offset: 0 },
              { lane: present.at(-1)!, side: 'right', offset: 0 },
              null,
              runsOf(heldOn(mid), mid).find((r) => r.run.paint === 'surface')?.material ?? 'DIRT',
            ),
            ...strips,
          ],
          outermost: [outer(-1), outer(1)],
          limits,
          boundaries: [
            {
              id: 'road-1-centre',
              knots: road1Knots.map(([s, lateral]) => ({ at: positionAt(s), lateral })),
            },
          ],
          sprites: placed
            .filter((t) => t.s >= span.from && (t.s < span.to || (span.to >= laidLength - 1e-6 && t.s <= span.to)))
            .sort((a, b) => a.s - b.s || a.lateral - b.lateral)
            .map((t) =>
              spriteElement({
                image: t.image,
                palette: t.palette,
                at: positionAt(t.s),
                lateral: t.lateral,
                groundOffset: t.groundOffset,
                body: t.body,
              }),
            ),
          environments: [
            environment(inForce, span.from),
            ...skyKnots.filter((k) => k.s > span.from + 1e-6 && k.s < span.to - 1e-6).map((k) => environment(k, k.s)),
          ],
        };
      },
    });
    outputs.course(id, laid.document);
    outputs.crestTrials(id, crestTrials(laid.heights, laid.write));
    return {
      course: `courses/${id}.course.json`,
      name,
      records: [road1!.plan.length, road2!.plan.length],
      length: round1(path.length),
      goal: round1(station(goal)),
      sections: laid.document.sections.length,
      plan: {
        heading: round3((plan.p.fidelity.heading * 180) / Math.PI),
        position: round1(plan.p.fidelity.position),
        departure: [round3((plan.p.departure.heading * 180) / Math.PI), round1(plan.p.departure.position)],
        partings: plan.beside.partings.map((g) => [g.from, g.to, g.meets, round1(g.miss)]),
      },
      heights: { departure: round1(heights.departure) },
      held: held.map((h) => [h.road, h.from, h.to]),
      // Its objects: placed, their hits, and those not placed (other kinds, above the course, past the road not taken).
      objects: {
        placed: placed.length,
        hits: placed.filter((t) => t.body).length,
        notPlaced: objects.length - placed.length,
      },
      skies: skyKnots.map((k) => ({ at: round1(k.s), image: k.image, transition: round1(k.transition) })),
    };
  });
  return {
    outputs,
    report: {
      positionMetres: Number(metres.toPrecision(6)),
      carUnits: round1(carUnits),
      acrossMetres: Number(ACROSS.toPrecision(6)),
      factor: round3(f),
      skies: skies.size,
      courses,
    },
  };
}

export const BIG_RUN_CONVERSION: Conversion = (set) => {
  const { outputs, report } = bigRunCourses(set);
  return { outputs, report: { conversion: BIG_RUN_CONVERSION_VERSION, ...report } };
};
