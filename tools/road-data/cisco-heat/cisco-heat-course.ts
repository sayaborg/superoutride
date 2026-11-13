/**
 * CISCO HEAT's conversion ([CISCO HEAT road data](../../../docs/cisco-heat-road-data.md#its-conversion)): its five
 * courses, each its stage from its start to the first record past its goal, laid as the board's (`jaleco/board-course`),
 * its heights read back from its screen, its pictures, colors, materials, skies and objects as its programs give them.
 */
import { requireInput } from '../../authoring/authoring-error.js';
import { round1, round3, OriginalOutputs, type Conversion } from '../shared/conversion.js';
import { contractUnmet } from '../shared/conversion-errors.js';
import { crestTrials } from '../shared/crest-trials.js';
import { groundMaterial } from '../shared/ground-material.js';
import type { Material } from '../shared/road-surface.js';
import type { Change } from '../shared/road-profile.js';
import type { RomSet } from '../shared/rom-set.js';
import { placedChanges, screenPieces } from '../shared/screen-pieces.js';
import { micrometre } from '../shared/section-writing.js';
import { bakeSky, sectionYawOrigin, skyYawOrigin } from '../shared/sky-baking.js';
import { lanesOverTwoRoads } from '../shared/two-roads.js';
import { layBoardCourse, type BoardCourseRoads, type BoardSkyKnot } from '../jaleco/board-course.js';
import { boardScenes, boardSky, SKY_MIDDLE, type BoardScene } from '../jaleco/ms1-skies.js';
import { type RightAngle } from '../jaleco/road-plan.js';
import { boardUses, zoomBoards } from '../jaleco/zoom-boards.js';
import { spritePen } from '../jaleco/zoom-sprites.js';
import { roadTables, type HeldStretch, type RoadNumber } from '../jaleco/road-tables.js';
import { ciscoHeatSkies, STAGES } from './cisco-heat-backgrounds.js';
import {
  carUnits,
  ciscoHeatDescriptor,
  ciscoHeatObjects,
  ciscoHeatPlace,
  ciscoHeatSpritePalette,
  sedanFrames,
  spritePixelUnits,
  type CiscoHeatObject,
} from './cisco-heat-objects.js';
import { LAST_SKY_SET, rowEntry, skyFade, stagePalettes, STRIPE_PERIOD } from './cisco-heat-road-colours.js';
import { ciscoHeatLanePicture, ciscoHeatPaints, nearestLine } from './cisco-heat-road-picture.js';
import {
  assembleCiscoHeatMain,
  assembleCiscoHeatRoadCpu,
  assembleCiscoHeatRoadLines,
  assembleCiscoHeatSprites,
  CISCO_HEAT_TILE_ROMS,
} from './cisco-heat-rom.js';
import {
  CISCO_HEAT_TABLES,
  ciscoHeatHeld,
  positionMetres,
  stageCheckpoint,
  stageGoal,
  TICK_SECONDS,
} from './cisco-heat-road.js';
import {
  ciscoHeatInputs,
  ciscoHeatStageRoads,
  readCiscoHeatScreen,
  stageEnd,
  type CiscoHeatStageRoad,
} from './cisco-heat-screen-frames.js';

/**
 * The descriptors whose hits span the road across its middle, which would leave the car no way past (the course format
 * refuses a road its bodies close): drawn, with no body (K's to confirm).
 */
const OPEN: ReadonlySet<number> = new Set([0x0ff0, 0x5484, 0x5490]);
/** The conversion's version: its outputs' format. */
export const CISCO_HEAT_CONVERSION_VERSION = 1;

/**
 * The jumps each stage's original shows as turns at right angles, laid as quarter turns: tried first at STAGE 1's wharf
 * (K, 2026-11-13), where its corner board stands past its first jump and its second jump, 8,000 positions on, is the
 * same corner's.
 */
const RIGHT_ANGLES: readonly (readonly RightAngle[])[] = [[{ at: 147_760, joins: [155_760] }]];
/** How far a record may depart from its table's next heading and position: BIG RUN's (K, 2026-11-09). */
const PLAN_LIMITS = Object.freeze({ heading: (0.03 * Math.PI) / 180, position: 14 });

/** Its own car, the sedan: the Ford LTD Crown Victoria of 1990's width, metres (Edmunds). */
const CAR_METRES = 1.969;

/** Its screen's pixel's width over its height: 256 × 224 shown at 4:3. */
const PIXEL_ASPECT = 7 / 6;

/** The ground where its pictures give none, beneath a clear run, between its roads and beyond its limits: the city's. */
const CITY: Material = 'ASPHALT';

/** The speed a sky's fade is laid at, km/h: its ticks laid over the road a car covers at it. */
const FADE_KMH = 200;

const idOf = (stage: number) => `cisco-heat-stage-${stage + 1}`;
const nameOf = (stage: number) => `STAGE ${stage + 1}`;

/** A road's grade and height along a stage, metres from its start, by its read parts' changes. */
class ReadRoad {
  constructor(readonly changes: readonly Change[]) {}
  /** Its grade at `x` metres. */
  grade(x: number) {
    let g = 0;
    for (const c of this.changes) g += c.change * Math.min(1, Math.max(0, (x - c.from) / (c.to - c.from)));
    return g;
  }
  /** Its height at `x` metres, from 0 at its start. */
  height(x: number) {
    let h = 0;
    for (const c of this.changes) {
      const span = c.to - c.from;
      if (x <= c.from) continue;
      // The grade's ramp over the change, integrated to `x`: its half where within it, then its whole.
      h += x >= c.to ? c.change * (x - c.from - span / 2) : (c.change * (x - c.from) ** 2) / (2 * span);
    }
    return h;
  }
}

/**
 * Each stage's two roads read back from its screen: its parts' pieces (`screen-pieces`, CISCO HEAT's `STAGE n road r
 * part k`), each solved from these ROMs' screen alone, their changes laid from each part's start.
 */
function readRoads(parts: readonly CiscoHeatStageRoad[], metres: number, inputs: (r: CiscoHeatStageRoad) => string) {
  const pieces = screenPieces('cisco-heat');
  const file = '/tools/road-data/shared/screen-pieces.json';
  const roads = new Map<string, Change[]>();
  for (const part of parts) {
    const piece = pieces.piece(part.piece);
    requireInput(piece, file, `CISCO HEAT's ${part.piece} has no piece`);
    requireInput(
      piece.inputs === inputs(part),
      file,
      `CISCO HEAT's ${part.piece} was solved from other inputs than these ROMs': solve it again (screen-pieces)`,
    );
    const key = `${part.stage} ${part.road}`;
    roads.set(key, [...(roads.get(key) ?? []), ...placedChanges(piece, part.from * metres, part.to * metres)]);
  }
  return (stage: number, road: RoadNumber) => new ReadRoad(roads.get(`${stage} ${road}`) ?? []);
}

/**
 * The course's heights, metres: the read grades of the road it takes (`taken.course`: the held road where the original
 * holds the car on one, P elsewhere; K, 2026-11-11), each road's changes within the stretches the course takes it over,
 * a kink where it changes road by the two grades' difference there; how far apart the original's two roads lie.
 */
function courseHeights(
  taken: BoardCourseRoads,
  held: readonly HeldStretch[],
  end: number,
  metres: number,
  roads: readonly [ReadRoad, ReadRoad],
) {
  const switches = [...new Set([...held.flatMap((h) => [h.from, h.to]), taken.switchAt])]
    .filter((p) => p > 0 && p < end)
    .sort((a, b) => a - b)
    .filter((p) => taken.course(p - 1) !== taken.course(p));
  const stretches = [0, ...switches].map((from, k) => ({ from, to: switches[k] ?? end, road: taken.course(from) }));
  const bends = stretches.flatMap(({ from, to, road }) =>
    roads[road - 1]!.changes.flatMap((c) => {
      const [a, b] = [Math.max(c.from, from * metres), Math.min(c.to, to * metres)];
      return b > a ? [{ from: a / metres, to: b / metres, curvature: c.change / (c.to - c.from) }] : [];
    }),
  );
  const kinks = switches.flatMap((p) => {
    const x = p * metres;
    const change = roads[taken.course(p) - 1]!.grade(x) - roads[taken.course(p - 1) - 1]!.grade(x);
    return change === 0 ? [] : [{ at: p, change }];
  });
  return { bends, kinks, apart: (p: number) => Math.abs(roads[0].height(p * metres) - roads[1].height(p * metres)) };
}

/** Heights' 10, 50 and 90 % points, metres, and how many lie above 1 m. */
function bottoms(heights: readonly number[]) {
  const sorted = [...heights].sort((a, b) => a - b);
  const at = (f: number) => round1(sorted[Math.min(sorted.length - 1, Math.floor(f * sorted.length))] ?? 0);
  return { percent10: at(0.1), percent50: at(0.5), percent90: at(0.9), above1m: sorted.filter((h) => h > 1).length };
}

/** CISCO HEAT's courses from its ROM set. */
export function ciscoHeatCourses(set: RomSet) {
  const main = assembleCiscoHeatMain(set);
  const cpus = [assembleCiscoHeatRoadCpu(set, 0), assembleCiscoHeatRoadCpu(set, 1)] as const;
  const programOf = (road: RoadNumber) => cpus[road - 1]!;
  const rom = assembleCiscoHeatRoadLines(set);
  const tiles = [set.data(CISCO_HEAT_TILE_ROMS[0]!), set.data(CISCO_HEAT_TILE_ROMS[1]!)] as const;
  const metres = positionMetres(main);
  const sprites = assembleCiscoHeatSprites(set);
  // Its scale across: its own car's straight picture as wide as the sedan (K, 2026-11-09).
  const CAR_UNITS = carUnits(main, sedanFrames(main), (tile, x, y) => spritePen(sprites, tile, x, y));
  const ACROSS = CAR_METRES / CAR_UNITS;
  const outputs = new OriginalOutputs();
  const board = ciscoHeatSkies(main);
  // Its most common picture's lanes, which its two roads keep wherever they go.
  const lanes = lanesOverTwoRoads(ciscoHeatLanePicture(programOf(2), rom));
  // Its heights read back from its screen, each stage's road in its parts.
  const screen = readCiscoHeatScreen(cpus[0]);
  const parts = ciscoHeatStageRoads(main, cpus, metres);
  const readRoad = readRoads(parts, metres, (r) => ciscoHeatInputs(screen, r.arcs, r.from, r.to, metres));
  const skies = new Set<string>();
  // Its objects of kind 0 to each stage's end, each a board of its descriptor's sprite at its record's scale and
  // mirroring, in its stage's sprites' palette; a sprite's pixel at its own size `pixel` units across, and a unit up a
  // screen pixel's height over its width of a unit across, as its pictures are drawn.
  const pixel = spritePixelUnits(main);
  const UP = ACROSS / PIXEL_ASPECT;
  const boardOf = (o: CiscoHeatObject) => {
    const d = ciscoHeatDescriptor(main, o.descriptor);
    return {
      name: `ciscoheat-${o.descriptor.toString(16).padStart(4, '0')}-${o.scale * 8}${o.mirrored ? '-mirrored' : ''}`,
      tile: d.tile,
      across: d.across,
      down: d.down,
      xScale: o.scale,
      yScale: o.scale,
      mirrored: o.mirrored,
    };
  };
  const uses = boardUses();
  const objects = Array.from({ length: STAGES }, (_, stage) => {
    const end = stageEnd(main, cpus, stage);
    const colors = ciscoHeatSpritePalette(main, stage);
    const all = ciscoHeatObjects(main, stage).filter((o) => o.position < end);
    const plain = all.filter((o) => o.kind === 0);
    for (const o of plain) {
      const entry = colors[o.color];
      if (!entry)
        throw contractUnmet(`${nameOf(stage)}'s objects take sprite colors ${o.color} its stage loads none of`);
      uses.add(boardOf(o), stage, o.color, entry);
    }
    return { all, plain };
  });
  const boards = new Map(zoomBoards(sprites, uses.uses(), pixel * ACROSS, 1 / PIXEL_ASPECT).map((b) => [b.name, b]));
  for (const b of boards.values()) outputs.file(b.image.path, b.image.bytes);
  const courses = Array.from({ length: STAGES }, (_, stage) => {
    const [id, name] = [idOf(stage), nameOf(stage)];
    const goal = stageGoal(main, stage);
    const end = stageEnd(main, cpus, stage);
    const roads = [
      roadTables(programOf(1), CISCO_HEAT_TABLES, 1, stage, end),
      roadTables(programOf(2), CISCO_HEAT_TABLES, 2, stage, end),
    ] as const;
    const read = [readRoad(stage, 1), readRoad(stage, 2)] as const;
    const palettes = [stagePalettes(main, stage), stagePalettes(main, stage, LAST_SKY_SET)] as const;
    // Its skies: each plane's scene in force with the ramp's first set, and its last from where its fade begins, laid
    // over its ticks at FADE_KMH.
    const scenes = ([0, 1] as const).map((plane) => boardScenes(main, board, plane, stage));
    const sceneAt = (plane: 0 | 1, p: number): BoardScene | undefined =>
      [...scenes[plane]!].reverse().find((sc) => sc.start <= p);
    const fade = skyFade(main, stage);
    const changeAt = fade.at < end ? fade.at : Infinity;
    const skyChanges = [...new Set([0, ...scenes.flat().map((sc) => sc.start), ...(fade.at < end ? [fade.at] : [])])]
      .filter((p) => p >= 0 && p < end)
      .sort((a, b) => a - b);
    const fadeMetres = (fade.ticks * TICK_SECONDS * FADE_KMH) / 3.6;
    const skyName = (p: number) => {
      const [back, front] = [sceneAt(0, p), sceneAt(1, p)];
      const set = p >= changeAt ? LAST_SKY_SET : 0;
      return {
        image: `cisco-heat-sky-${stage}-${back ? scenes[0]!.indexOf(back) : 'none'}-${front ? scenes[1]!.indexOf(front) : 'none'}-${set}`,
        back,
        front,
        set,
      };
    };
    // Its own car on road 2 at its start, at the centre of the lane right of the road's middle.
    const grid = [{ lateral: lanes.lanes(0).e / 2, road: 2 as RoadNumber, position: 0 }];
    const held = ciscoHeatHeld(main, stage).filter((h) => h.from < end);
    const {
      laid,
      plan,
      path,
      station,
      placed,
      skyKnots,
      roads: taken,
      leavesAt,
      heights,
    } = layBoardCourse({
      id,
      name,
      tables: CISCO_HEAT_TABLES,
      planLimits: PLAN_LIMITS,
      rightAngles: RIGHT_ANGLES[stage] ?? [],
      roads,
      goal,
      end,
      checkpoint: stageCheckpoint(main, stage),
      metres,
      across: ACROSS,
      held,
      grid,
      lanes,
      heights: (on) => courseHeights(on, held, end, metres, read),
      cuts: [],
      cutAtPictures: false,
      stripePeriod: STRIPE_PERIOD,
      clearGround: CITY,
      laneGround: CITY,
      // A road's picture at `p` across: its painted runs, each run's colors over a stripe's period, its material.
      runsOf: (road, r, p) => {
        const palette = palettes[0][road - 1]!;
        const runs = ciscoHeatPaints(rom, nearestLine(programOf(road), r.kind));
        const one = runs.filter((x) => x.pen !== null).length === 1;
        const colored = runs.map((run) => {
          const colors = Array.from({ length: STRIPE_PERIOD }, (_, phase) => {
            if (run.pen === null) return null;
            const color = palette[rowEntry(programOf(road), road, r, phase)]![run.pen];
            if (color === undefined)
              throw contractUnmet(`${name}'s road ${road} takes a pen its palette lacks at ${p}`);
            return color;
          });
          const material: Material | null =
            run.pen === null ? null : one || run.paint === 'outside' ? groundMaterial(colors[0]!) : 'ASPHALT';
          return { run, colors, material };
        });
        // Neighbouring runs of one paint are one, its colors and material its widest run's, so that the strips at a
        // station keep within the course format's.
        const merged: { run: (typeof colored)[number]['run']; widest: (typeof colored)[number] }[] = [];
        for (const c of colored) {
          const last = merged.at(-1);
          if (last && last.run.paint === c.run.paint && (last.run.pen === null) === (c.run.pen === null)) {
            const wider = c.run.to - c.run.from > last.widest.run.to - last.widest.run.from;
            merged[merged.length - 1] = { run: { ...last.run, to: c.run.to }, widest: wider ? c : last.widest };
          } else merged.push({ run: c.run, widest: c });
        }
        return merged.map(({ run, widest }) => ({ run, colors: widest.colors, material: widest.material }));
      },
      skies: ({ station, path, back }) => {
        const knots = skyChanges.map((p, i) => ({
          s: i === 0 ? 0 : station(p),
          p,
          ...skyName(p),
          transition: p === changeAt && i > 0 ? fadeMetres : 0,
        }));
        for (const k of knots)
          if (!skies.has(k.image)) {
            skies.add(k.image);
            const palette = palettes[k.set === 0 ? 0 : 1][1];
            outputs.file(
              `images/${k.image}.json`,
              JSON.stringify(
                bakeSky(k.image, boardSky(main, board, tiles, programOf(2), palette, k.back, k.front), PIXEL_ASPECT),
              ),
            );
          }
        // Each sky's yaw: its back plane faces its middle column where its scene loads, turning at its one rate.
        const headingAt = (p: number) => ((path.pose(station(p)).heading - path.pose(back).heading) * 180) / Math.PI;
        const yawOf = (k: BoardSkyKnot, s: number) => {
          const knot = k as (typeof knots)[number];
          const loaded = knot.back ? headingAt(knot.back.start) : 0;
          const origin = skyYawOrigin(SKY_MIDDLE + (board.turn[0] / 360) * loaded, board.turn[0]);
          return micrometre(
            sectionYawOrigin(origin, ((path.pose(s).heading - path.pose(back).heading) * 180) / Math.PI),
          );
        };
        return { knots, yawOf };
      },
      // Each object's place: its road's centre, its lateral its picture's left edge, its height its picture's bottom
      // edge over its road, at the course's height as its road is, and none past the road not taken; a hit where its program meets the car with it, within its picture.
      sprites: ({ station, shown1, leavesAt, notTakenEnd, roads: on }) =>
        objects[stage]!.plain.flatMap((o) => {
          const p = o.position;
          const road: RoadNumber = on.original(2, p) === o.road ? 2 : 1;
          if (road === 1 && p >= leavesAt && p >= notTakenEnd) return [];
          const place = ciscoHeatPlace(main, o, pixel);
          const lift = place.bottom * UP;
          const board = boards.get(boardOf(o).name);
          if (!board) return [];
          // A hit within its picture's columns, as the course format holds a solid part; none for a descriptor whose
          // hit would close the road (`OPEN`).
          const meets = !OPEN.has(o.descriptor) &&
            place.meets && {
              from: Math.max(place.meets.from, 0),
              to: Math.min(place.meets.to, place.width),
            };
          return [
            {
              s: station(p),
              image: board.name,
              palette: uses.paletteOf(board.name, stage, o.color),
              lateral: ((road === 2 ? 0 : shown1.at(p)) + o.lateral) * ACROSS,
              groundOffset: lift,
              body:
                meets && meets.to > meets.from
                  ? [{ across: ((meets.from + meets.to) / 2) * ACROSS, width: (meets.to - meets.from) * ACROSS }]
                  : null,
            },
          ];
        }),
    });
    outputs.course(id, laid.document);
    outputs.crestTrials(id, crestTrials(laid.heights, laid.write));
    // Where its two roads part, how far apart in height their screens read them, metres.
    const apartOver = (from: number, to: number) => {
      let most = 0;
      for (let p = from; p <= to; p += 64) most = Math.max(most, heights.apart(p) * 1);
      return round1(most);
    };
    return {
      course: `courses/${id}.course.json`,
      name,
      records: [roads[0].plan.length, roads[1].plan.length],
      length: round1(path.length),
      goal: round1(station(goal)),
      sections: laid.document.sections.length,
      plan: {
        heading: round3((plan.p.fidelity.heading * 180) / Math.PI),
        position: round1(plan.p.fidelity.position),
        departure: [round3((plan.p.departure.heading * 180) / Math.PI), round1(plan.p.departure.position)],
        partings: plan.beside.partings.map((g) => [
          g.from,
          g.to,
          g.meets,
          g.jumps,
          round1(g.miss),
          apartOver(g.from, g.to),
        ]),
        jumpsBack: plan.road1.jumpsBack.map((b) => [b.at, round3((b.heading * 180) / Math.PI), round1(b.position)]),
      },
      heights: { parts: parts.filter((r) => r.stage === stage).length, apart: apartOver(0, end) },
      held: held.map((h) => [h.road, h.from, h.to]),
      // Where the course follows road 1 from, and where the other road is the road not taken from.
      follows: taken.switchAt < Infinity ? [1, taken.switchAt] : [2, 0],
      notTaken: leavesAt < Infinity ? leavesAt : null,
      // Its objects: placed, their hits, those not placed (other kinds, above the course, past the road not taken), and
      // where their pictures' bottom edges lie over their roads, metres: at 10, 50 and 90 %, and how many above 1 m.
      objects: {
        placed: placed.length,
        hits: placed.filter((t) => t.body).length,
        notPlaced: objects[stage]!.all.length - placed.length,
        bottoms: bottoms(objects[stage]!.plain.map((o) => o.height * UP)),
      },
      skies: skyKnots.map((k) => ({ at: round1(k.s), image: k.image, transition: round1(k.transition) })),
    };
  });
  return {
    outputs,
    report: {
      positionMetres: Number(metres.toPrecision(6)),
      carUnits: round1(CAR_UNITS),
      acrossMetres: Number(ACROSS.toPrecision(6)),
      skies: skies.size,
      courses,
    },
  };
}

export const CISCO_HEAT_CONVERSION: Conversion = (set) => {
  const { outputs, report } = ciscoHeatCourses(set);
  return { outputs, report: { conversion: CISCO_HEAT_CONVERSION_VERSION, ...report } };
};
