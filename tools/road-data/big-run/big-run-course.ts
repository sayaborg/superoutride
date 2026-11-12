/**
 * BIG RUN's conversion ([BIG RUN road data](../../../docs/big-run-road-data.md#its-conversion)): its six courses, each
 * its stage from its start to the first record past its goal, laid as the board's (`jaleco/board-course`), its heights,
 * pictures, colors, materials, skies and objects as its programs give them.
 */
import { instruction } from '../cpu/program-words.js';
import { contractUnmet } from '../shared/conversion-errors.js';
import { round1, round3, OriginalOutputs, type Conversion } from '../shared/conversion.js';
import { crestTrials } from '../shared/crest-trials.js';
import { groundMaterial } from '../shared/ground-material.js';
import type { Material } from '../shared/road-surface.js';
import type { RomSet } from '../shared/rom-set.js';
import { lensFactor } from '../shared/screen-pieces.js';
import { micrometre } from '../shared/section-writing.js';
import { bakeSky, sectionYawOrigin, skyYawOrigin } from '../shared/sky-baking.js';
import { lanesOverTwoRoads } from '../shared/two-roads.js';
import { layBoardCourse, type BoardSkyKnot } from '../jaleco/board-course.js';
import { zoomBoards, boardUses } from '../jaleco/zoom-boards.js';
import { bigRunDescriptor, bigRunObjects, ownCarUnits, spritePalette, type BigRunObject } from './big-run-objects.js';
import { SPRITE_TILE, spritePen } from '../jaleco/zoom-sprites.js';
import { BIG_RUN_SKIES, STAGES } from './big-run-backgrounds.js';
import { boardScenes, boardSky, SKY_MIDDLE, type BoardScene } from '../jaleco/ms1-skies.js';
import { steepestRecordGrade, tableProfile } from '../jaleco/road-heights.js';
import {
  nearestLine,
  rowEntry,
  SKY_ENTRIES,
  skyChangeAt,
  stagePalettes,
  STRIPE_PERIOD,
  stripes,
  townEnd,
  type LayerPalette,
} from './big-run-road-picture.js';
import { lineRuns, paintedRuns, roadPictureOf } from '../jaleco/road-lines.js';
import {
  assembleBigRunMain,
  assembleBigRunRoadCpu,
  assembleBigRunSprites,
  BIG_RUN_ROAD_ROMS,
  BIG_RUN_TILE_ROMS,
  concatenated,
} from './big-run-rom.js';
import {
  BIG_RUN_TABLES,
  PLAN_LIMITS,
  bigRunHeld,
  positionMetres,
  stageCheckpoint,
  stageGoal,
  stageGrid,
  TICK_SECONDS,
} from './big-run-road.js';
import { roadTables, type RoadNumber, type RoadProfileRecord } from '../jaleco/road-tables.js';

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

/** A course's road past its goal, at most, positions: the camera's distance behind the car, as the finish needs. */
const RUN_OUT = 2000;
/** The material beneath a clear run, which shows no ground: the desert's. */
const CLEAR_GROUND: Material = 'SAND';
/** The ramp's sets: the first, and the last its change fades to. */
const LAST_SKY_SET = 15;
/** The sky's change: two of its entries a call, a call a tick, through its 16 sets (M 0xBC66 to 0xBCD6). */
const SKY_FADE_TICKS = 48;
/** The speed a sky's change is laid at, km/h: its fade's ticks laid over the road a car covers at it. */
const FADE_KMH = 200;

/**
 * A sprite's pixel at its descriptor's scale 128, units across: the objects' zoom at distance d (M 0xAB28: the table at
 * 0x11DE00, a word a position, its low byte the zoom, 128 a tile's own size) over the road's pixels a unit there,
 * 600 ÷ (d + 600) ([its camera](../../../docs/big-run-road-data.md#its-camera)), at the nearest distance, 0, where the
 * table's whole numbers round its 153,000 ÷ (d + 600) least.
 */
function spritePixelUnits(main: Uint8Array) {
  const [high, low] = instruction(main, 0xab28, [0x43f9, null, null], "the objects' zoom (lea)");
  const d = 0;
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
  const programOf = (road: RoadNumber) => cpus[road - 1]!;
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
    const reach = (road: RoadNumber) => roadTables(programOf(road), BIG_RUN_TABLES, road, stage, goal + RUN_OUT);
    const after = [1, 2]
      .flatMap((r) => {
        const t = reach(r as RoadNumber);
        return [...t.plan, ...t.profile].map((p) => p.start);
      })
      .filter((s) => s > goal);
    const end = Math.min(goal + RUN_OUT, ...after);
    return {
      stage,
      goal,
      end,
      roads: [
        roadTables(programOf(1), BIG_RUN_TABLES, 1, stage, end),
        roadTables(programOf(2), BIG_RUN_TABLES, 2, stage, end),
      ],
    };
  });
  // Its heights' factor: its lens ratio, or the grades' limit over its steepest grade where that is less (K, 2026-11-09).
  const steepest = Math.max(
    ...stages.flatMap((s) => s.roads.map((t) => steepestRecordGrade(BIG_RUN_TABLES, t.profile, s.goal))),
  );
  const f = lensFactor(focalRows(cpus[0]), SCREEN_ROWS, steepest);
  const skies = new Set<string>();
  const sprites = assembleBigRunSprites(set);
  const carUnits = ownCarUnits(main, (tile, x, y) => spritePen(sprites, tile, x, y));
  const ACROSS = CAR_METRES / carUnits;
  // A unit up, metres: a screen pixel's height over its width of a unit across, as the pictures are drawn.
  const UP = ACROSS * SCREEN_PIXEL_HEIGHT;
  // A descriptor's sprite's drawn height, units up: its rows of tiles at its scale down (128 its own size).
  const drawnUnits = (descriptor: number) => {
    const d = bigRunDescriptor(main, descriptor);
    return (d.down * SPRITE_TILE * spritePixelUnits(main) * d.yScale) / 128;
  };
  // A sprite's pixel at scale 128, metres: its zoom at a distance over the road's pixels a unit there (M 0x11DE00).
  const unitMetres = spritePixelUnits(main) * ACROSS;
  // Its objects' boards: one a descriptor and mirroring over every stage, a palette each set of its colors a stage's
  // sprites' palette gives the entry its objects take.
  const boardOf = (o: BigRunObject) => {
    const d = bigRunDescriptor(main, o.descriptor);
    const mirrored = (o.flags & MIRRORED) !== 0;
    return {
      name: `bigrun-${o.descriptor.toString(16).padStart(4, '0')}${mirrored ? '-mirrored' : ''}`,
      tile: d.tile,
      across: d.across,
      down: d.down,
      xScale: d.xScale / 128,
      yScale: d.yScale / 128,
      mirrored,
    };
  };
  const uses = boardUses();
  for (const { stage, end } of stages) {
    const colors = spritePalette(main, stage);
    for (const o of bigRunObjects(main, stage)) {
      if (o.kind !== 0 || o.position >= end) continue;
      const entry = colors[o.color];
      if (!entry)
        throw contractUnmet(`${NAMES[stage]}'s objects take sprite colors ${o.color} its stage loads none of`);
      uses.add(boardOf(o), stage, o.color, entry);
    }
  }
  const boards = new Map(zoomBoards(sprites, uses.uses(), unitMetres, SCREEN_PIXEL_HEIGHT).map((b) => [b.name, b]));
  for (const b of boards.values()) outputs.file(b.image.path, b.image.bytes);
  const courses = stages.map(({ stage, goal, end, roads: [road1, road2] }) => {
    const name = NAMES[stage]!;
    const id = idOf(name);
    const town0 = stage === 0 ? townEnd(programOf(2), 2) : 0;
    const inTown = (p: number) => p < town0;
    // The road the original holds the car on, where it does; its heights the course's there (K, 2026-11-11).
    const held = bigRunHeld(main, stage);
    const onRoad1 = held.filter((h) => h.road === 1);
    const profileRecords: RoadProfileRecord[] = [
      ...road2!.profile.filter((r) => !onRoad1.some((h) => r.start >= h.from && r.start < h.to)),
      ...road1!.profile.filter((r) => onRoad1.some((h) => r.start >= h.from && r.start < h.to)),
    ].sort((a, b) => a.start - b.start);
    for (const h of onRoad1)
      if (!road1!.profile.some((r) => r.start === h.from) || !road2!.profile.some((r) => r.start === h.to))
        throw contractUnmet(`${name}'s stretch held on road 1 does not start and end at the roads' records`);
    const heights = tableProfile(BIG_RUN_TABLES, profileRecords, end);
    const otherHeights = [
      tableProfile(BIG_RUN_TABLES, road1!.profile, end).profile,
      tableProfile(BIG_RUN_TABLES, road2!.profile, end).profile,
    ];
    // A road's palette, its layer's (road 1 the first road CPU's), by its stage and sky's set.
    const palettes = [stagePalettes(main, stage), stagePalettes(main, stage, LAST_SKY_SET)] as const;
    // Its objects: those of kind 0, a picture standing where it is put, up to its end; the others, which the program
    // moves or picks, are not placed (counted).
    const objects = bigRunObjects(main, stage).filter((o) => o.position < end);
    const plain = objects.filter((o) => o.kind === 0);
    const stripeOf = [stripes(programOf(1), 1), stripes(programOf(2), 2)] as const;
    // Its skies: each plane's scene in force and the ramp's set, changing where a scene starts or the ramp's change
    // begins (over its fade at the own car's top speed).
    const scenes = ([0, 1] as const).map((plane) => boardScenes(main, BIG_RUN_SKIES, plane, stage));
    const sceneAt = (plane: 0 | 1, p: number): BoardScene | undefined =>
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
    const { laid, plan, path, station, placed, skyKnots } = layBoardCourse({
      id,
      name,
      tables: BIG_RUN_TABLES,
      planLimits: PLAN_LIMITS,
      roads: [road1!, road2!],
      goal,
      end,
      checkpoint: stageCheckpoint(main, stage),
      metres,
      across: ACROSS,
      held,
      grid: stageGrid(main, stage),
      lanes,
      // Its heights, f times its 3D road's, in metres.
      heights: () => ({
        bends: heights.profile.bends.map((b) => ({ from: b.from, to: b.to, curvature: (b.curvature * f) / metres })),
        kinks: heights.profile.kinks.map((k) => ({ at: k.at, change: k.change * f })),
        apart: (p) => Math.abs(otherHeights[0]!.height(p) - otherHeights[1]!.height(p)) * f * metres,
      }),
      cuts: town0 ? [town0] : [],
      cutAtPictures: true,
      stripePeriod: STRIPE_PERIOD,
      clearGround: CLEAR_GROUND,
      laneGround: 'DIRT',
      // A road's picture at `p` across: its painted runs and each run's colors over a stripe's period, its material.
      runsOf: (road, r, p) => {
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
      },
      skies: ({ station, path, back }) => {
        const knots = skyChanges.map((p, i) => ({
          s: i === 0 ? 0 : station(p),
          p,
          ...skyName(p),
          transition: p === changeAt && i > 0 ? fade : 0,
        }));
        for (const k of knots)
          if (!skies.has(k.image)) {
            skies.add(k.image);
            const palette = palettes[k.set === 0 ? 0 : 1][1];
            outputs.file(
              `images/${k.image}.json`,
              JSON.stringify(
                bakeSky(
                  k.image,
                  boardSky(main, BIG_RUN_SKIES, tiles, programOf(2), palette, k.back, k.front),
                  PIXEL_ASPECT,
                ),
              ),
            );
          }
        // Each sky's yaw: its back plane faces its middle column where its scene loads, turning 8 pixels a degree.
        const headingAt = (p: number) => ((path.pose(station(p)).heading - path.pose(back).heading) * 180) / Math.PI;
        const yawOf = (k: BoardSkyKnot, s: number) => {
          const knot = k as (typeof knots)[number];
          const loaded = knot.back ? headingAt(knot.back.start) : 0;
          const origin = skyYawOrigin(SKY_MIDDLE + (BIG_RUN_SKIES.turn[0] / 360) * loaded, BIG_RUN_SKIES.turn[0]);
          return micrometre(
            sectionYawOrigin(origin, ((path.pose(s).heading - path.pose(back).heading) * 180) / Math.PI),
          );
        };
        return { knots, yawOf };
      },
      // Each object's place: its road's centre, its lateral its picture's left edge, its height its picture's top edge
      // over its road, its sprite drawn down from it (its foot its drawn height below), a unit up a screen pixel's
      // height over its width of a unit across, as its picture is drawn; on a road not drawn, at that road's height
      // below the course's, and none where it lies above or past the road not taken.
      sprites: ({ station, drawn, shown1, leavesAt, notTakenEnd }) => {
        const placeOf = (o: BigRunObject) => {
          const p = o.position;
          const centre = o.road === 2 ? 0 : shown1.at(p);
          let lift = (o.height - drawnUnits(o.descriptor)) * UP;
          if (o.road === 1 && p >= leavesAt && p >= notTakenEnd) return null;
          if (!drawn(o.road, p)) {
            const own = otherHeights[o.road - 1]!.height(p) - heights.profile.height(p);
            if (own > 0) return null;
            lift += own * f * metres;
          }
          const board = boards.get(boardOf(o).name);
          if (!board) return null;
          const palette = uses.paletteOf(board.name, stage, o.color);
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
        return plain.flatMap((o) => {
          const at = placeOf(o);
          return at ? [at] : [];
        });
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
