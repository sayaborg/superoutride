/**
 * TOP SPEED's conversion ([TOP SPEED road data](../../../docs/top-speed-road-data.md)): its seven courses, each its
 * road from its start through its five stages to its goal, laid on back for its grid, laid by `road-layout` with its
 * plan, heights, lanes, limits, bands and materials as its programs give them, a checkpoint at each stage's end, its
 * skies in their Sections and its things; its road laid on past its goal as far as the original draws a thing from it.
 */
import type { EnvironmentDocument, LaneDocument, Lateral } from '../../../src/course/course-document.js';
import { CAMERA_DEFINITION } from '../../../src/view/camera-definition.js';
import { cameraDistance } from '../../../src/view/camera.js';
import { contractUnmet } from '../shared/conversion-errors.js';
import { CoursePath } from '../shared/course-path.js';
import { crestTrials } from '../shared/crest-trials.js';
import { round1, round3, OriginalOutputs, type Conversion } from '../shared/conversion.js';
import { gridReach, type StartGrids } from '../shared/grid-rule.js';
import { laneWidths } from '../shared/lane-mask.js';
import { crossings } from '../shared/overpasses.js';
import { riseProfile, tableHeight } from '../shared/rise-profile.js';
import { layRoad } from '../shared/road-layout.js';
import { bendOf, profileOf } from '../shared/road-profile.js';
import { groundMaterial } from '../shared/ground-material.js';
import { partedStrips, type Material } from '../shared/road-surface.js';
import { colorStretches, joinedChanges } from '../shared/color-stretches.js';
import type { RomSet } from '../shared/rom-set.js';
import { micrometre, simplified, spriteElement, stripElement } from '../shared/section-writing.js';
import { bakeSky, sectionYawOrigin, SKY_HORIZON, skyYawOrigin } from '../shared/sky-baking.js';
import { RECORD_UNITS } from '../taito/course-records.js';
import { rgb555Of } from '../taito/palette.js';
import {
  colorSet,
  lookChanges,
  placedStretches,
  type RecordLook,
  skyChangeRecord,
  skyChanges,
  SKY_MIDDLE,
  SKY_TURN,
  topSpeedSky,
  wipeTicks,
} from './top-speed-backgrounds.js';
import { gradeResolution, STEP_METRES, STEP_POSITIONS, stepGrades } from './top-speed-heights.js';
import { coursePieces, RECORD_METRES } from './top-speed-plan.js';
import {
  alternate,
  courseRecords,
  lateralMetres,
  groundAlong,
  groundColor,
  LANES,
  limitCuts,
  limitStretches,
  roadsNotTaken,
  maskChanges,
  spanLimits,
} from './top-speed-road-across.js';
import {
  fadeTicks,
  hills,
  PENS,
  RASTER,
  stripeWords,
  topSpeedForkPicture,
  topSpeedRoadColors,
  topSpeedRoadPicture,
} from './top-speed-road-picture.js';
import { assembleTopSpeedMain, assembleTopSpeedSub, assembleTopSpeedTiles } from './top-speed-rom.js';
import { topSpeedBands, topSpeedBoards, waterColors } from './top-speed-boards.js';
import { branchRecords, stagePast, topSpeedPlacements, type TopSpeedHit } from './top-speed-objects.js';
import { assembleTopSpeedSprites, BIG_SPRITE } from './top-speed-sprites.js';
import {
  FIXED_WIDTH,
  pixelLaterals,
  SCREEN_WIDE,
  thingSight,
  topHeldHeight,
  topSpeedThing,
} from './top-speed-things.js';
import {
  COURSES,
  courseSections,
  LANE_METRES,
  POSITION_METRES,
  readStages,
  recordsPastGoal,
  STAGES,
  TOP_SPEED,
} from './top-speed-road.js';

export const TOP_SPEED_CONVERSION_VERSION = 18;

/** Where the car stands at GO, positions into its first section (S 0x13EE0, 0x7CF2), and its lane. */
const GO_POSITIONS = 0x260;
const GO_LANE = 'd';
/** A stage's records: five sections of 32. */
const STAGE_RECORDS = 5 * 32;
/** The standing things' size curve, the records a thing is spawned ahead of the camera (S 0x65C6), and P's lateral. */
const STANDING_CURVE = 1;
const FLAT_CURVE = 0;
const SPAWN_AHEAD = 5;
const P = 0x8000;
/** A pen's tunnel pen, 10 on (MAME's description). */
const TUNNEL_PENS = 10;
/** The road's material. */
const ROAD: Material = 'ASPHALT';
/** The sky's picture of a horizon picture, a cloud picture and a color set. */
const skyName = (a: number, b: number, set: number) => `top-speed-sky-${a}-${b}-${set}`;

/** A hit about its lateral `at`, metres right of P. */
interface PlacedHit {
  readonly hit: TopSpeedHit;
  readonly at: number;
}

/**
 * A thing's body ([Chosen lines](../../../docs/original-road-data.md#chosen-lines)), metres right of its lateral `at`:
 * each part of its hit (`hit`, laterals `metres` each) as wide as it is, at most its picture's colored columns
 * (`colored`, from its point), and, where a car meets it from its side of P alone, the part on that side alone; then
 * each part of the hits it holds beside its own (`posts`: a gate's right post's), within the picture's colored columns;
 * none where it has no hit.
 */
function bodyOf(
  hit: TopSpeedHit | null,
  at: number,
  metres: number,
  colored: readonly [number, number],
  posts: readonly PlacedHit[],
) {
  const sided = (h: TopSpeedHit, from: number, a: number, b: number) =>
    !h.ownSide ? [a, b] : from >= 0 ? [Math.max(a, -at), b] : [a, Math.min(b, -at)];
  const width = (h: TopSpeedHit) => Math.min(2 * h.half * metres, colored[1] - colored[0]);
  const part = ([a, b]: readonly number[]) => (b! - a! > 1e-6 ? [{ across: (a! + b!) / 2, width: b! - a! }] : []);
  const parts = [
    ...(hit
      ? hit.middles.flatMap((m) => part(sided(hit, at, m * metres - width(hit) / 2, m * metres + width(hit) / 2)))
      : []),
    ...posts.flatMap((p) =>
      p.hit.middles.flatMap((m) => {
        const middle = p.at - at + m * metres;
        const [a, b] = sided(p.hit, p.at, middle - p.hit.half * metres, middle + p.hit.half * metres);
        return part([Math.max(a!, colored[0]), Math.min(b!, colored[1])]);
      }),
    ),
  ];
  return parts.length ? parts : null;
}

export function topSpeedCourses(set: RomSet) {
  const main = assembleTopSpeedMain(set),
    sub = assembleTopSpeedSub(set),
    tiles = assembleTopSpeedTiles(set);
  const stages = readStages(sub);
  const picture = topSpeedRoadPicture(main, tiles);
  const roadColors = topSpeedRoadColors(main);
  const words = stripeWords(main);
  const shade = alternate(main);
  const ground = groundColor(main);
  // The picture's widths: a line's half, the inner band within the lanes and beyond them, the edge beyond them.
  const lanesAcross = 3 * LANE_METRES;
  const lineHalf = (picture.lines[1]!.right - picture.lines[1]!.left) / 2;
  const [innerIn, innerOut] = [lanesAcross - picture.inner.left, picture.inner.right - lanesAcross];
  const edge = picture.edgeMetres;
  // The fork's pictures: the band at each half's P, and the gap's pixels at the nearest line.
  const fork = topSpeedForkPicture(main, tiles);
  const resolution = gradeResolution(sub);
  const outputs = new OriginalOutputs();
  // Its things: each course's placements, their pictures drawn once for all its courses, a pixel the standing things'
  // size curve's at its full size.
  const place = topSpeedPlacements(sub);
  const sprites = assembleTopSpeedSprites(set);
  const metresAcross = lateralMetres(sub);
  const pixel = pixelLaterals(sub, STANDING_CURVE) * metresAcross;
  // The records past the goal, the block after the fifth stage's: as far as a thing is drawn from the goal, where
  // the run ends, its things put out by the stage after the fifth and its section 0.
  const past = recordsPastGoal(sub).slice(0, thingSight(sub) / RECORD_UNITS);
  const pastThings = past.map((record) => ({ record, stage: stagePast(sub, STAGES - 1), section: 0 }));
  // Each course's placements, the camera's record five behind the one it spawns (its section and color set).
  const spawned = Array.from({ length: COURSES }, (_, course) => {
    const recs = [...courseRecords(courseSections(stages, course)), ...pastThings];
    return recs.flatMap((r, i) => {
      const camera = recs[Math.max(0, i - SPAWN_AHEAD)]!;
      return place(r.record, r.stage, r.section, camera.section, colorSet(main, camera.stage, camera.section)).map(
        (p) => ({ record: i, ...p }),
      );
    });
  });
  // A thing's picture: the next descriptor's where it stands left of P and has one (S 0x16634 to 0x1664A).
  const picturedOf = <T extends { readonly index: number; readonly lateral: number }>(p: T) => {
    const shown = topSpeedThing(sub, p.index).leftVariant && p.lateral < P ? p.index + 1 : p.index;
    return { ...p, shown, described: topSpeedThing(sub, shown) };
  };
  const placed = spawned.map((things) => {
    const pictured = things.flatMap((p) => (p.water ? [] : [picturedOf(p)]));
    // A flat thing (its size curve not the standing things') is not placed; one of no piece neither.
    const standing = pictured.filter((p) => p.described.curve === STANDING_CURVE && p.described.pieces.length);
    // A descriptor of no piece that hits is a gate's right post: its hit a part of the body of the thing its record
    // stands at its station on the other side of P, the gate, whose picture reaches it.
    const posts = pictured.filter((p) => !p.described.pieces.length && p.hit);
    const gateOf = (post: (typeof posts)[number]) => {
      const gate = standing.find(
        (t) => t.record === post.record && t.ahead === post.ahead && t.lateral < P !== post.lateral < P,
      );
      if (!gate) throw contractUnmet(`TOP SPEED's hit of no picture at record ${post.record} has no thing across P`);
      return gate;
    };
    const gates = posts.map((post) => ({ gate: gateOf(post), post }));
    return standing.map(({ described: _, ...t }) => ({
      ...t,
      posts: gates.flatMap(({ gate, post }) =>
        gate.record === t.record && gate.ahead === t.ahead && gate.lateral === t.lateral
          ? [{ hit: post.hit!, at: (post.lateral - P) * metresAcross }]
          : [],
      ),
    }));
  });
  // Each course's roads not taken, each over its fork's 30.7 m from its branch's start, and the things the original
  // puts out on them: the branch's first records' (`branchRecords`), the camera then five records behind in the
  // fork's section; those that lie on the road as it is drawn, `at` positions from the branch's start.
  const branches = Array.from({ length: COURSES }, (_, course) =>
    roadsNotTaken(main, stages, courseSections(stages, course), picture.pixelMetres, STEP_POSITIONS),
  );
  const besideBranches = branches.map((roads, course) => {
    const recs = courseRecords(courseSections(stages, course));
    return roads.map((n) =>
      stages[n.stage]!.sections[n.section]!.records.slice(0, branchRecords(sub)).flatMap((record, i) => {
        const camera = recs[n.from - SPAWN_AHEAD + i]!;
        return place(record, n.stage, n.section, camera.section, colorSet(main, camera.stage, camera.section))
          .map((p) => ({ ...picturedOf(p), record: i, at: i * RECORD_UNITS + p.ahead }))
          .filter((p) => p.at <= n.steps * STEP_POSITIONS);
      }),
    );
  });
  const standingBeside = besideBranches.map((roads) =>
    roads.map((things) =>
      things.filter((p) => !p.water && p.described.curve === STANDING_CURVE && p.described.pieces.length),
    ),
  );
  // Water's colors, its shore's and its water's, by its descriptor.
  const waters = new Map(
    [...new Set([...spawned.flat(), ...besideBranches.flat(2)].flatMap((p) => (p.water ? [p.index] : [])))].map((i) => [
      i,
      waterColors(main, sub, sprites, i),
    ]),
  );
  // Its ground patches, the flat things its roadside bytes place but water: their colors, each piece's most frequent,
  // by the descriptor shown.
  const isPatch = (p: ReturnType<typeof picturedOf<(typeof spawned)[number][number]>>) => !!p.flat && !p.water;
  const patches = new Map(
    [
      ...new Set([...spawned.flat().map(picturedOf), ...besideBranches.flat(2)].filter(isPatch).map((p) => p.shown)),
    ].map((i) => {
      const thing = topSpeedThing(sub, i);
      if (thing.curve !== FLAT_CURVE || !thing.pieces.length || thing.pieces.some((x) => x.type !== FIXED_WIDTH))
        throw contractUnmet(`TOP SPEED's flat thing ${i} is not pieces of a fixed width on the flat things' curve`);
      return [i, waterColors(main, sub, sprites, i)] as const;
    }),
  );
  // A patch's material by its color (`groundMaterial`), no patch reading as water.
  const patchMaterial = (color: number): Material => {
    const material = groundMaterial(color);
    if (material === 'WATER') throw contractUnmet(`TOP SPEED's ground patch's color ${color} reads as water`);
    return material;
  };
  // A flat thing as it is laid: its side of the road, its pieces' colors outward from its inner edge, and whether
  // its last piece's reaches on outward (water's) or the ground lies beyond it (a patch's).
  const flatOf = (p: ReturnType<typeof picturedOf<(typeof spawned)[number][number]>>) =>
    p.water
      ? { side: p.water === 'right' ? 1 : -1, colors: waters.get(p.index)!, open: true }
      : isPatch(p)
        ? { side: p.lateral < P ? -1 : 1, colors: patches.get(p.shown)!, open: false }
        : null;
  interface FlatRun extends NonNullable<ReturnType<typeof flatOf>> {
    from: number;
    to: number;
    /** Its inner edge, metres right of its road's P. */
    lateral: number;
  }
  // Water's shore's width, and a patch's piece's: a piece's 128 pixels at the flat things' full size.
  const flatPixel = pixelLaterals(sub, FLAT_CURVE) * metresAcross;
  const shoreWidth = BIG_SPRITE * flatPixel;
  // A flat run's piece `k`'s edges, metres right of its road's P, inner and outer.
  const pieceEdges = (w: FlatRun, k: number) =>
    [w.lateral + w.side * k * shoreWidth, w.lateral + w.side * (k + 1) * shoreWidth] as const;
  // A flat run's Strips of color from `start` to `end`, a piece each outward from its inner edge, a lateral by
  // `beside`; an open one's last reaching on outward.
  const flatStrips = (
    w: FlatRun,
    start: Parameters<typeof stripElement>[0],
    end: Parameters<typeof stripElement>[0],
    beside: (x: number) => Lateral,
  ) =>
    w.colors.map((color, k) => {
      const [inner, outer] = pieceEdges(w, k);
      const beyond = w.open && k === w.colors.length - 1 ? null : beside(outer);
      return w.side > 0
        ? stripElement(start, end, beside(inner), beyond, color, null)
        : stripElement(start, end, beyond, beside(inner), color, null);
    });
  // A flat thing's inner edge, metres outward from its lateral on side `side`: its pieces lie from its head's point,
  // which its anchor moves (S 0x166BA to 0x16792), a left variant's a piece outward, each then at its pixels.
  const flatInner = (shown: number, side: number) => {
    const xs = topSpeedThing(sub, shown).pieces.map((piece) => piece.x);
    return (side > 0 ? Math.min(...xs) : -(Math.max(...xs) + BIG_SPRITE)) * flatPixel;
  };
  const shownOf = (pick: (types: readonly number[]) => boolean) => [
    ...new Set(
      [...placed.flat(), ...standingBeside.flat(2)]
        .map((t) => t.shown)
        .filter((i) => pick(topSpeedThing(sub, i).pieces.map((p) => p.type))),
    ),
  ];
  const boards = new Map(
    topSpeedBoards(
      main,
      sub,
      sprites,
      shownOf((types) => types.some((t) => t !== SCREEN_WIDE)),
      pixel,
    ).map((b) => [b.index, b]),
  );
  const bands = new Map(
    topSpeedBands(
      main,
      sub,
      sprites,
      shownOf((types) => types.includes(SCREEN_WIDE)),
      pixel,
    ).map((b) => [b.index, b]),
  );
  for (const b of bands.values()) for (const image of b.images) outputs.file(image.path, image.bytes);
  // Its cloud banks: each descriptor's four pieces of a fixed width a band across the road, its picture's ragged edges
  // kept, held over the road where the original holds its bottom as it first draws it at its full size.
  const bankBands = new Map(
    topSpeedBands(
      main,
      sub,
      sprites,
      [...new Set(spawned.flat().flatMap((p) => (p.bank ? [p.index] : [])))],
      pixel,
      (p) => p.type === FIXED_WIDTH,
      true,
    ).map((b) => [
      b.index,
      { ...b, held: topHeldHeight(main, sub, topSpeedThing(sub, b.index).curve, STANDING_CURVE) * pixel },
    ]),
  );
  for (const b of bankBands.values()) for (const image of b.images) outputs.file(image.path, image.bytes);
  for (const b of boards.values()) outputs.file(b.image.path, b.image.bytes);
  const skies = new Set<string>();
  const courses = Array.from({ length: COURSES }, (_, course) => {
    const letter = 'ABCDEFG'[course]!;
    const id = `top-speed-${letter.toLowerCase()}`;
    const name = `TOP SPEED ${letter}`;
    const run = courseRecords(courseSections(stages, course));
    if (run.length !== STAGES * STAGE_RECORDS) throw contractUnmet(`${name} is not five stages of 160 records`);
    // Past its goal the camera's record stays its run's last, whose section and colors' field the road there is shown
    // in: the records past the goal with them.
    const held = run.at(-1)!;
    const records = [...run, ...past.map((record) => ({ ...held, record: { ...record, scene: held.record.scene } }))];
    const recordAt = (s: number) =>
      records[Math.min(records.length - 1, Math.max(0, Math.floor(s / RECORD_METRES + 1e-9)))]!;
    const stretches = limitStretches(sub, records);
    // Its roads not taken, each over its fork's 30.7 m from its branch's start.
    const notTaken = branches[course]!;
    // Its forks' pictures (`topSpeedForkPicture`), by the camera's record, metres from its start: over each fork's
    // record and those before it in its section that look ahead to it, each half's band at its P in place of the line
    // there, the halves `left` and `right` metres from P over the gap's records, the ground's color between them; and
    // on from each fork over its road not taken's length, the course's own half's band.
    const forkRecords = records.flatMap((r, i) => (r.record.join === 3 ? [i] : []));
    if (forkRecords.length !== notTaken.length || forkRecords.some((i, k) => i + 1 !== notTaken[k]!.from))
      throw contractUnmet(`${name}'s forks' records are not its roads not taken's`);
    const forkParts = forkRecords.flatMap((i, k) => {
      const first = records.findIndex((r, j) => j >= i - fork.records + 1 && r.section === records[i]!.section);
      const n = notTaken[k]!;
      const parts: {
        from: number;
        to: number;
        left: number;
        right: number;
        halves: Record<'left' | 'right', boolean>;
      }[] = [];
      for (let j = first; j <= i; j++) {
        const gap = fork.gaps.find((g) => g.record === fork.gaps.at(-1)!.record - (i - j));
        const [left, right] = [(gap?.left ?? 0) * picture.pixelMetres, (gap?.right ?? 0) * picture.pixelMetres];
        const last = parts.at(-1);
        if (last && last.left === left && last.right === right) last.to = (j + 1) * RECORD_METRES;
        else
          parts.push({
            from: j * RECORD_METRES,
            to: (j + 1) * RECORD_METRES,
            left,
            right,
            halves: { left: true, right: true },
          });
      }
      return [
        ...parts,
        {
          from: n.from * RECORD_METRES,
          to: n.from * RECORD_METRES + n.steps * n.step,
          left: 0,
          right: 0,
          halves: { left: n.beside === 'right', right: n.beside === 'left' },
        },
      ];
    });
    const goal = run.length * RECORD_METRES;
    const go = GO_POSITIONS * POSITION_METRES;
    // The own car alone at GO in lane d, the general form on it and lane c beside it.
    const ownLateral = (LANES.indexOf(GO_LANE) - 3 + 0.5) * LANE_METRES;
    const stand = (s: number): StartGrids => ({
      origin: { s, lateral: { lane: GO_LANE, side: 'center', offset: 0 } },
      originals: { car: { places: [{ ahead: 0, right: 0 }] } },
      limits: [ownLateral - stretches[0]!.left, stretches[0]!.right - ownLateral],
      lanes: [LANES[LANES.indexOf(GO_LANE) - 1]!, GO_LANE],
      meet: -LANE_METRES / 2,
      laneWidth: LANE_METRES,
    });
    // Laid on back for its grids and the camera behind their rearmost slot, as CHASE H.Q.'s are.
    const back = Math.ceil(gridReach(stand(go)) + cameraDistance(CAMERA_DEFINITION));
    // Its things at their stations, in station order.
    // Its water and its ground patches, flat on the ground from their inner edges outward (their strips of a fixed
    // width on the screen, a replacement): each piece a piece wide, water's last reaching on outward; each record's,
    // joined where the next goes on alike.
    const flatRuns: FlatRun[] = [];
    for (const p of spawned[course]!.map(picturedOf)) {
      const flat = flatOf(p);
      if (!flat) continue;
      const [from, lateral] = [
        back + p.record * RECORD_METRES,
        (p.lateral - P) * metresAcross + flat.side * flatInner(p.shown, flat.side),
      ];
      const alike = (w: FlatRun) =>
        w.side === flat.side && w.open === flat.open && w.colors.join() === flat.colors.join();
      const last = flatRuns.find((w) => alike(w) && Math.abs(w.to - from) < 1e-6 && w.lateral === lateral);
      if (last) last.to = from + RECORD_METRES;
      else if (!flatRuns.some((w) => alike(w) && from >= w.from - 1e-6 && from < w.to - 1e-6))
        flatRuns.push({ ...flat, from, to: from + RECORD_METRES, lateral });
    }
    // A thing's sprites: its picture, with its body `body`; and its band across the road, floating, with none.
    const spritesOf = (shown: number, body: (colored: readonly [number, number]) => ReturnType<typeof bodyOf>) => {
      const [board, band] = [boards.get(shown), bands.get(shown)];
      const picture = board
        ? [{ image: board.name, palette: board.palette, lateral: 0, groundOffset: 0, body: body(board.colored) }]
        : [];
      const across = band
        ? band.names.map((image, k) => ({
            image,
            palette: band.palette,
            lateral: 0,
            groundOffset: band.groundOffset + (k ? band.rise : 0),
            body: null,
          }))
        : [];
      return [...picture, ...across];
    };
    const ownThings = placed[course]!.map((t) => {
      const lateral = (t.lateral - P) * metresAcross;
      return {
        s: back + t.record * RECORD_METRES + t.ahead * POSITION_METRES,
        lateral,
        sprites: spritesOf(t.shown, (colored) => bodyOf(t.hit, lateral, metresAcross, colored, t.posts)),
      };
    });
    // Its cloud banks, each a band across the road at P, with no body.
    const bankThings = spawned[course]!.flatMap((p) => {
      const band = p.bank && bankBands.get(p.index);
      return band
        ? [
            {
              s: back + p.record * RECORD_METRES + p.ahead * POSITION_METRES,
              lateral: (p.lateral - P) * metresAcross,
              sprites: band.names.map((image, k) => ({
                image,
                palette: band.palette,
                lateral: 0,
                groundOffset: band.held + band.groundOffset + (k ? band.rise : 0),
                body: null,
              })),
            },
          ]
        : [];
    });
    const at = (s: number) => s - back;
    // Its plan: the start's heading laid on back straight, then its records turned as its horizon band turns.
    const pieces = [
      { length: back, turn: 0 },
      ...coursePieces(
        main,
        records.map((r) => r.record),
      ),
    ];
    const length = back + records.length * RECORD_METRES;
    const crossed = crossings(pieces, length, STEP_METRES);
    // Its heights: the sub program's grades a step, its passages fixed points.
    const grades = stepGrades(
      sub,
      [...records, records.at(-1)!].map((r) => r.record.grade),
    );
    const station = (p: number) => back + p * STEP_METRES;
    const rise = riseProfile(
      grades,
      resolution,
      station,
      crossed.flat().map((s) => at(s) / STEP_METRES),
    );
    const profile = profileOf(rise.changes.map(bendOf), [], rise.kinks);
    // Its lanes, limits and ground; a change's station on the heights' steps, so that the Sections' cuts are the
    // profile's breaks to the bit.
    const onStep = (s: number) => station(Math.round(s / STEP_METRES));
    const masks = maskChanges(main, sub, records);
    const cuts = [...new Set(limitCuts(stretches).map(onStep))].sort((a, b) => a - b);
    const lanes = laneWidths(
      masks.lanes,
      0,
      masks.first,
      masks.changes.map((c) => ({ ...c, at: onStep(c.at) })),
      cuts,
    );
    const groundRuns = groundAlong(main, records);
    const groundSides = {
      left: groundRuns.left.map(([s, m], i) => [i === 0 ? 0 : s + back, m] as const),
      right: groundRuns.right.map(([s, m], i) => [i === 0 ? 0 : s + back, m] as const),
    };
    // Its limits' stretches at the course's stations, the first from its start.
    const along = stretches.map((x, i) => ({ ...x, from: i === 0 ? 0 : x.from + back, to: x.to + back }));
    const reach = Math.max(...stretches.map((s) => Math.max(Math.abs(s.left), Math.abs(s.right))));
    // The things beside its roads not taken, each at its lateral from its road's P as it slides away, with no body:
    // the car, held within its limits, reaches none. One whose hit, or whose water, lies within the limits is
    // reported (`reached`), not given a body; `clear` how far the nearest of them lies beyond the limits.
    const offsetOf = (n: (typeof notTaken)[number], d: number) => {
      const k = d / n.step,
        k0 = Math.floor(k + 1e-9);
      return n.offset(k0) + (n.offset(k0 + 1) - n.offset(k0)) * (k - k0);
    };
    const limitsAt = (s: number) => along.find((x) => s < x.to - 1e-9) ?? along.at(-1)!;
    // Whether a range across lies within the limits at `s`, and how far the nearest of them lies beyond the limits.
    let clear = Infinity;
    const within = (s: number, a: number, b: number) => {
      const inside = Math.min(b, limitsAt(s).right) - Math.max(a, limitsAt(s).left);
      clear = Math.min(clear, -inside);
      return inside > 1e-6;
    };
    const reached: { at: number; lateral: number; image: string }[] = [];
    const besideThings = notTaken.flatMap((n, j) =>
      standingBeside[course]![j]!.map((t) => {
        const d = t.at * POSITION_METRES;
        const s = back + n.from * RECORD_METRES + d;
        const lateral = offsetOf(n, d) + (t.lateral - P) * metresAcross;
        const sprites = spritesOf(t.shown, () => null);
        const half = t.hit ? t.hit.half * metresAcross : 0;
        if (
          t.hit &&
          t.hit.middles.some((m) => within(s, lateral + m * metresAcross - half, lateral + m * metresAcross + half))
        )
          reached.push({ at: round1(s), lateral: round3(lateral), image: sprites[0]?.image ?? '' });
        return { s, lateral, sprites };
      }),
    );
    // Their water and ground patches, from their inner edges outward of their road's P, over their records on the
    // road as drawn.
    const besideFlats = notTaken.map((n, j) => {
      const [from, end] = [back + n.from * RECORD_METRES, back + n.from * RECORD_METRES + n.steps * n.step];
      const runs = new Map<string, FlatRun>();
      for (const p of besideBranches[course]![j]!) {
        const flat = flatOf(p);
        const key = `${p.record} ${flat?.side} ${flat?.open} ${flat?.colors.join()}`;
        if (flat && !runs.has(key) && from + p.record * RECORD_METRES < end - 1e-6)
          runs.set(key, {
            ...flat,
            from: from + p.record * RECORD_METRES,
            to: Math.min(end, from + (p.record + 1) * RECORD_METRES),
            lateral: (p.lateral - P) * metresAcross + flat.side * flatInner(p.shown, flat.side),
          });
      }
      for (const w of runs.values())
        for (const s of [w.from, w.to]) {
          const edge = offsetOf(n, s - from) + w.lateral;
          const reach = w.open ? Infinity : w.colors.length * shoreWidth;
          if (w.side > 0 ? within(s, edge, edge + reach) : within(s, edge - reach, edge))
            reached.push({ at: round1(s), lateral: round3(edge), image: w.open ? 'water' : 'patch' });
        }
      return [...runs.values()];
    });
    const things = [...ownThings, ...bankThings, ...besideThings].sort((a, b) => a.s - b.s || a.lateral - b.lateral);
    // Its tunnels, where their walls hold the car (`limitStretches`): its road and its sky dark there, at once at
    // their ends (an estimate, not confirmed: the dark is taken over the walls).
    // Under an overpass the road is dark too, from its near deck, whose line begins the dark road, to its far
    // deck, whose line ends it (S 0x1689E, M 0x3A0C); the sky is not (an estimate, not confirmed).
    const lines = placed[course]!.flatMap((t) => {
      const line = topSpeedThing(sub, t.index).line;
      return line && t.lateral === P ? [{ s: back + t.record * RECORD_METRES + t.ahead * POSITION_METRES, line }] : [];
    }).sort((a, b) => a.s - b.s);
    const under = lines.flatMap((l, k) =>
      l.line === 1 && lines[k + 1]?.line === 2 ? [{ from: l.s, to: lines[k + 1]!.s }] : [],
    );
    const tunnels = along.filter((x) => x.walled);
    const inTunnel = (s: number) => tunnels.some((t) => s >= t.from - 1e-9 && s < t.to - 1e-9);
    const tunnelEnds = [...tunnels, ...under].flatMap((t) => [t.from, t.to]);
    // Its changes (Sky baking): its start's sky and colors, then each record whose sky (its pictures or its color set)
    // or the road's and ground's colors in force (its color set's and field's) differ from the record's before, from its
    // start over the longer of the bands' wipe and the colors' fade at top speed without the nitro, the colors held at a
    // sky change's record and the one after it (M 0x4752 to 0x482E); changes that overlap joined (`joinedChanges`).
    const recordSkies = skyChanges(main, records);
    const skyChange = skyChangeRecord(main);
    const tickMetres = TOP_SPEED * POSITION_METRES;
    const own = (i: number) => {
      const r = records[i]!;
      return { set: colorSet(main, r.stage, r.section), scene: r.record.scene };
    };
    const looks = records.map((r, i): RecordLook => {
      const { a, b, set } = [...recordSkies].reverse().find((c) => c.record <= i)!;
      const { set: colorsSet, scene } = own(i);
      return {
        a,
        b,
        sky: set,
        colors: [roadColors.surface(colorsSet, scene), ground(colorsSet, scene)],
        holds: skyChange(r.record.scene),
      };
    });
    const changes = lookChanges(looks, wipeTicks(main), fadeTicks(main));
    const recordStates = changes.map((c) => ({
      a: looks[c.record]!.a,
      b: looks[c.record]!.b,
      sky: looks[c.record]!.sky,
      ...own(c.colors),
    }));
    type State = (typeof recordStates)[number];
    const recordChanges = changes
      .slice(1)
      .map((c) => ({ at: back + c.record * RECORD_METRES, length: c.ticks * tickMetres }));
    const joined = joinedChanges(recordStates, recordChanges);
    const changeRuns = colorStretches(joined.colors, joined.changes, 0, length);
    // Its tunnels' and its overpasses' dark road and its tunnels' dark sky (color set 0) are a place's colors, at once
    // at their ends; so is a hill's (`hills`).
    const darkAt = (s: number) => inTunnel(s) || under.some((u) => s >= u.from - 1e-9 && s < u.to - 1e-9);
    const skyImage = (c: State, s: number) => skyName(c.a, c.b, inTunnel(s) ? 0 : c.sky);
    const skyKnots = [
      ...changeRuns
        .filter((t, i) => i === 0 || t.before !== null || changeRuns[i - 1]!.colors !== t.colors)
        .map((t, i) => ({ s: t.from, state: t.colors, transition: i === 0 || t.before === null ? 0 : t.to - t.from })),
      ...tunnelEnds.map((s) => ({
        s,
        state: changeRuns.find((t) => t.from <= s + 1e-9 && s < t.to - 1e-9)!.colors,
        transition: 0,
      })),
    ]
      .sort((x, y) => x.s - y.s)
      .map((k) => ({ ...k, image: skyImage(k.state, k.s) }))
      .filter((k, i, all) => i === 0 || k.transition > 0 || k.image !== all[i - 1]!.image);
    for (const k of skyKnots)
      if (!skies.has(k.image)) {
        skies.add(k.image);
        const sky = k.state;
        outputs.file(
          `images/${k.image}.json`,
          JSON.stringify(bakeSky(k.image, topSpeedSky(main, tiles, sky.a, sky.b, inTunnel(k.s) ? 0 : sky.sky), 1)),
        );
      }
    const path = new CoursePath(pieces);
    const yawOrigin = skyYawOrigin(SKY_MIDDLE, SKY_TURN);
    // Its colors' stretches, each place's: its change's colors, then where it is drawn as on a hill or dark.
    const onHills = hills(
      main,
      records.map((r) => r.record),
    );
    const placeAt = (s: number) => {
      const i = Math.min(records.length - 1, Math.max(0, Math.floor(at(s) / RECORD_METRES + 1e-9)));
      return { hill: onHills[i]!, dark: darkAt(s) };
    };
    const placeCuts = [
      ...records.flatMap((_, i) => (i > 0 && onHills[i] !== onHills[i - 1] ? [back + i * RECORD_METRES] : [])),
      ...tunnelEnds,
    ].filter((s) => s > 1e-9 && s < length - 1e-9);
    const colorRuns = placedStretches(changeRuns, placeCuts, placeAt);
    const setAt = (s: number) =>
      colorRuns.find((t) => t.from <= s + 1e-9 && s < t.to - 1e-9)?.colors ?? colorRuns.at(-1)!.colors;
    // A part's four colors in a set, as RGB555, by its place's raster words (`stripeWords`): the surface and the ground
    // in their other shade, the lines and the inner band, or the outer band, drawn as the surface.
    type Part = 'body' | 'ground' | 'line' | 'inner' | 'outer';
    const partColors =
      (part: Part) =>
      (c: ReturnType<typeof setAt>): readonly number[] =>
        (c.hill ? words.hill : words.flat).map((w) => {
          // In a tunnel each pen's tunnel pen (10 on), with no other shades (MAME's description).
          const pen = (p: number) => roadColors.pen(c.hill, c.dark ? p + TUNNEL_PENS : p);
          const surface = c.dark ? pen(PENS.surface) : roadColors.surface(c.set, c.scene);
          const groundColor = c.dark ? pen(PENS.ground) : ground(c.set, c.scene);
          const body = w & RASTER.surface && !c.dark ? shade(surface) : surface;
          const color =
            part === 'body'
              ? body
              : part === 'ground'
                ? w & RASTER.ground && !c.dark
                  ? shade(groundColor)
                  : groundColor
                : part === 'outer'
                  ? w & RASTER.outer
                    ? body
                    : pen(PENS.outer)
                  : w & RASTER.lines
                    ? body
                    : pen(part === 'line' ? PENS.line : PENS.inner);
          // Line 0x100's pen 1, which draws no lines, takes the surface's.
          return rgb555Of(part === 'line' && c.hill && !c.dark ? body : color);
        });
    // A lane's width at `s`, at a cut the one after it, or with `before` the one before it.
    const laneWidthAt = (k: number, s: number, before = false) => {
      const pieces = lanes[k]!.pieces;
      return ([...pieces].reverse().find((p) => p.from <= s + (before ? -1e-9 : 1e-9)) ?? pieces[0]!).width(s);
    };
    const steps = (from: number, to: number) => {
      const out = [from];
      for (let s = Math.ceil((from - back) / STEP_METRES + 1e-3) * STEP_METRES + back; s < to - 1e-3; s += STEP_METRES)
        out.push(s);
      return [...out, to];
    };
    // A Section's centre lane, which the Link before it continues: the first of d, c, e, b, f and a wide all the way
    // from its start to the next cut, within which every Section that starts there ends.
    const centreFrom = (from: number) => {
      const to = cuts.find((c) => c > from + 1e-6) ?? length;
      const lane = ['d', 'c', 'e', 'b', 'f', 'a'].find((l) =>
        steps(from, to).every((s) => laneWidthAt(LANES.indexOf(l), s, s === to) > 0),
      );
      if (!lane) throw contractUnmet(`${name} has no lane wide all the way from ${from} m`);
      return lane;
    };
    const laid = layRoad({
      id,
      name,
      pieces,
      cuts,
      reach,
      road: { bends: rise.changes.map(bendOf), kinks: rise.kinks },
      grids: stand(back + go),
      checkpoints: Array.from({ length: STAGES - 1 }, (_, k) => ({
        id: `${id}-CP${k + 1}`,
        s: back + (k + 1) * STAGE_RECORDS * RECORD_METRES,
      })),
      finish: { id: `${id}-GOAL`, s: back + goal },
      section: (span, positionAt) => {
        const widthOf = (k: number, s: number) => laneWidthAt(k, s, s === span.to);
        const widths = LANES.map((_, k) =>
          simplified(steps(span.from, span.to).map((s) => [s, micrometre(widthOf(k, s))])),
        );
        const present = LANES.filter((_, k) => widths[k]!.some(([, w]) => w !== 0));
        const laneDocs: LaneDocument[] = present.map((lane) => {
          const knots = widths[LANES.indexOf(lane)]!;
          return {
            kind: 'lane',
            id: lane,
            width: knots.every(([, w]) => w === knots[0]![1])
              ? knots[0]![1]
              : knots.map(([s, w]) => ({ at: positionAt(s), width: w })),
          };
        });
        // P lies between lanes c and d: the centre lane d's centre half its width right of it, else c's half left.
        const centerLane = centreFrom(span.from);
        const centre = simplified(
          steps(span.from, span.to).map((s) => [
            s,
            micrometre(((LANES.indexOf(centerLane) < 3 ? -1 : 1) * widthOf(LANES.indexOf(centerLane), s)) / 2),
          ]),
        );
        // Its bands, as the picture draws them (`topSpeedRoadPicture`): its body over its lanes, each edge's inner band
        // from within the lanes and its outer band beyond it, the ground beyond them, its lines about its lanes' sides
        // within; each striped by its place's four parts (`partedStrips`), a line where it is not its body's color.
        const [first, last] = [present[0]!, present.at(-1)!];
        const lane = (name: string, side: 'left' | 'right', offset: number): Lateral => ({ lane: name, side, offset });
        const parted = (
          left: Lateral | null,
          right: Lateral | null,
          part: Part,
          material: Material | null,
          a = span.from,
          b = span.to,
        ) =>
          partedStrips(
            colorRuns.map((t) => ({ ...t, from: t.from - span.from, to: t.to - span.from })),
            partColors(part),
            part === 'line' || (part === 'inner' && material === null) ? partColors('body') : null,
            words.positions * POSITION_METRES,
            back - span.from,
            a - span.from,
            b - span.from,
            material,
            (x, y, c, m) =>
              stripElement(
                positionAt(span.from + x),
                positionAt(y >= span.to - span.from - 1e-9 ? span.to : span.from + y),
                left,
                right,
                c,
                m,
              ),
          );
        const bands = [
          ...parted(null, lane(first, 'left', -edge), 'ground', null),
          ...parted(lane(last, 'right', edge), null, 'ground', null),
          ...parted(lane(first, 'left', -edge), lane(first, 'left', -innerOut), 'outer', ROAD),
          ...parted(lane(first, 'left', -innerOut), lane(first, 'left', 0), 'inner', ROAD),
          ...parted(lane(first, 'left', 0), lane(last, 'right', 0), 'body', ROAD),
          ...parted(lane(last, 'right', 0), lane(last, 'right', innerOut), 'inner', ROAD),
          ...parted(lane(last, 'right', innerOut), lane(last, 'right', edge), 'outer', ROAD),
          ...parted(lane(first, 'left', 0), lane(first, 'left', innerIn), 'inner', null),
          ...parted(lane(last, 'right', -innerIn), lane(last, 'right', 0), 'inner', null),
        ];
        // Its lines: about each side between its lanes but P's; at P the right half's line, its right half where three
        // lanes lie right of P and both halves where one or two do, none where a side has none (its edge there), by
        // each record's mask, at once where it changes.
        const lines = present
          .slice(0, -1)
          .flatMap((x) =>
            LANES.indexOf(x) === 2 ? [] : parted(lane(x, 'right', -lineHalf), lane(x, 'right', lineHalf), 'line', null),
          );
        const hasCentre = present.includes('c') && present.includes('d');
        const rightOf = (s: number) => {
          const mask = recordAt(at(s)).record.mask;
          const [left, right] = [(mask >> 4) & 7, (mask >> 1) & 7].map((n) => n.toString(2).replace(/0/g, '').length);
          // None where a fork's pictures are drawn, each half's band at P in its place.
          return left === 0 || forkParts.some((f) => at(s) >= f.from - 1e-6 && at(s) < f.to - 1e-6) ? 0 : right;
        };
        const centreCuts = [
          span.from,
          ...steps(span.from, span.to)
            .slice(1, -1)
            .filter((s) => rightOf(s) !== rightOf(s - STEP_METRES)),
          span.to,
        ];
        const centreLines = hasCentre
          ? centreCuts.slice(0, -1).flatMap((a, j) => {
              const n = rightOf(a);
              return n === 0
                ? []
                : parted(
                    lane('d', 'left', n === 3 ? 0 : -lineHalf),
                    lane('d', 'left', lineHalf),
                    'line',
                    null,
                    a,
                    centreCuts[j + 1]!,
                  );
            })
          : [];
        // Its forks' pictures within it: each half's band at P, the outer band's pen, striped as it, and the ground's
        // color in the gap between the halves; of no material (the sub program treats a car there as on the road).
        const fromP = (x: number): Lateral =>
          present.includes('d') ? lane('d', 'left', x) : lane(present.at(-1)!, 'right', x);
        const forkStrips = forkParts.flatMap((f) => {
          const [a, b] = [Math.max(span.from, back + f.from), Math.min(span.to, back + f.to)];
          if (!(b - a > 1e-6)) return [];
          return [
            ...(f.left + f.right > 0 ? parted(fromP(-f.left), fromP(f.right), 'ground', null, a, b) : []),
            ...(f.halves.left ? parted(fromP(-f.left - fork.band), fromP(-f.left), 'outer', null, a, b) : []),
            ...(f.halves.right ? parted(fromP(f.right), fromP(f.right + fork.band), 'outer', null, a, b) : []),
          ];
        });
        // Its roads not taken within it: each the other branch's half beside its own, its P and its outer side two
        // Boundaries straight between its steps, its body over its lanes, its lines and its edge's bands as the
        // course's, striped as the course's and drawn over it, of no material (the original slows a car by its
        // lateral alone).
        const notTakenParts = notTaken.flatMap((n, j) => {
          const from = back + n.from * RECORD_METRES;
          const [a, b] = [Math.max(span.from, from), Math.min(span.to, from + n.steps * n.step)];
          if (!(b - a > 1e-6)) return [];
          const sign = n.beside === 'right' ? 1 : -1;
          const offsetAt = (s: number) => offsetOf(n, s - from);
          const knots = [
            a,
            ...Array.from({ length: n.steps + 1 }, (_, k) => from + k * n.step).filter(
              (s) => s > a + 1e-6 && s < b - 1e-6,
            ),
            b,
          ];
          const [centreId, outerId] = [`not-taken-${j}-centre`, `not-taken-${j}-outer`];
          const boundaryOf = (id: string, f: (s: number) => number) => ({
            id,
            knots: simplified(knots.map((s) => [s, micrometre(f(s))] as [number, number])).map(([s, lateral]) => ({
              at: positionAt(s),
              lateral,
            })),
          });
          const across = n.lanes * LANE_METRES;
          // A lateral `x` metres out from its P, or from its outer side.
          const fromCentre = (x: number): Lateral => ({ boundary: centreId, offset: micrometre(sign * x) });
          const fromOuter = (x: number): Lateral => ({ boundary: outerId, offset: micrometre(sign * x) });
          const band = (inner: Lateral, outer: Lateral, part: Part) =>
            sign > 0 ? parted(inner, outer, part, null, a, b) : parted(outer, inner, part, null, a, b);
          // Its water and ground patches, from their inner edges right of its P.
          const water = besideFlats[j]!.flatMap((w) => {
            const [wa, wb] = [Math.max(a, w.from), Math.min(b, w.to)];
            if (!(wb - wa > 1e-6)) return [];
            return flatStrips(w, positionAt(wa), positionAt(wb), (x) => ({
              boundary: centreId,
              offset: micrometre(x),
            }));
          });
          return [
            {
              boundaries: [boundaryOf(centreId, offsetAt), boundaryOf(outerId, (s) => offsetAt(s) + sign * across)],
              strips: [
                ...water,
                ...band(fromCentre(0), fromOuter(0), 'body'),
                ...band(fromCentre(0), fromCentre(fork.band), 'outer'),
                ...Array.from({ length: Math.max(0, n.lanes - 1) }, (_, k) =>
                  band(
                    fromCentre((k + 1) * LANE_METRES - lineHalf),
                    fromCentre((k + 1) * LANE_METRES + lineHalf),
                    'line',
                  ),
                ).flat(),
                ...band(fromOuter(-innerIn), fromOuter(innerOut), 'inner'),
                ...band(fromOuter(innerOut), fromOuter(edge), 'outer'),
              ],
            },
          ];
        });
        const outerBand = (from: number, to: number) => ({
          left: from,
          right: to,
          colors: partColors('outer')(setAt(span.from)),
          material: ROAD,
        });
        const set = LANES.map((_, k) => k).filter((k) => widthOf(k, span.from) > 0);
        const [l, r] = [(set[0]! - 3) * LANE_METRES, (set.at(-1)! - 3 + 1) * LANE_METRES];
        const turned = ((path.pose(span.from).heading - path.pose(back).heading) * 180) / Math.PI;
        const yaw = micrometre(sectionYawOrigin(yawOrigin, turned));
        const environment = (k: (typeof skyKnots)[number], s: number): EnvironmentDocument => ({
          at: positionAt(s),
          name: `STAGE ${recordAt(at(s)).stage + 1}`,
          background: { image: k.image, horizonY: SKY_HORIZON, yawOrigin: yaw },
          transition: k.s < span.from - 1e-6 ? 0 : micrometre(k.transition),
        });
        const inForce = [...skyKnots].reverse().find((k) => k.s <= span.from + 1e-6)!;
        return {
          lanes: laneDocs,
          centerLane,
          centerLateral: centre.every(([, v]) => v === centre[0]![1])
            ? centre[0]![1]
            : centre.map(([s, lateral]) => ({ at: positionAt(s), lateral })),
          linkLane: centreFrom(span.to),
          strips: [
            ...bands,
            ...flatRuns.flatMap((w) => {
              const [a, b] = [Math.max(span.from, w.from), Math.min(span.to, w.to)];
              return b - a > 1e-6 ? flatStrips(w, positionAt(a), positionAt(b), micrometre) : [];
            }),
            ...lines,
            ...centreLines,
            ...forkStrips,
            ...notTakenParts.flatMap((n) => n.strips),
          ],
          sprites: things
            .filter((t) => t.s >= span.from && (t.s < span.to || (span.to >= length - 1e-6 && t.s <= span.to)))
            .flatMap((t) =>
              t.sprites.map((sprite) => spriteElement({ ...sprite, at: positionAt(t.s), lateral: t.lateral })),
            ),
          boundaries: notTakenParts.flatMap((n) => n.boundaries),
          // Its ground patches' materials, each piece's by its color, over the ground's and within the limits.
          over: flatRuns.flatMap((w) => {
            const [a, b] = [Math.max(span.from, w.from), Math.min(span.to, w.to)];
            if (w.open || !(b - a > 1e-6)) return [];
            const limits = limitsAt(span.from);
            return w.colors.flatMap((color, k) => {
              const [inner, outer] = pieceEdges(w, k);
              const [l, r] =
                w.side > 0 ? [inner, Math.min(outer, limits.right)] : [Math.max(outer, limits.left), inner];
              return r - l > 1e-6
                ? [stripElement(positionAt(a), positionAt(b), micrometre(l), micrometre(r), null, patchMaterial(color))]
                : [];
            });
          }),
          outermost: [
            {
              band: outerBand(l - edge, l - innerOut),
              left: lane(first, 'left', -edge),
              right: lane(first, 'left', -innerOut),
            },
            {
              band: outerBand(r + innerOut, r + edge),
              left: lane(last, 'right', innerOut),
              right: lane(last, 'right', edge),
            },
          ],
          limits: spanLimits(along, span.from, span.to, groundSides),
          environments: [
            environment(inForce, span.from),
            ...skyKnots.filter((k) => k.s > span.from + 1e-6 && k.s < span.to - 1e-6).map((k) => environment(k, k.s)),
          ],
        };
      },
    });
    outputs.course(id, laid.document);
    outputs.crestTrials(id, crestTrials(laid.heights, laid.write));
    let departs = 0;
    for (let p = 0; p * STEP_METRES <= goal; p++)
      departs = Math.max(departs, Math.abs(profile.height(station(p)) - tableHeight(grades, station, p)));
    return {
      course: `courses/${id}.course.json`,
      name,
      records: records.length,
      laidBack: back,
      length: round3(length),
      goal: round3(goal - go),
      // Its road past its goal, metres, and the things on it.
      past: {
        metres: round3(length - back - goal),
        things: ownThings
          .filter((t) => t.s >= back + goal)
          .map((t) => ({
            at: round3(t.s - back - goal),
            lateral: round3(t.lateral),
            sprites: t.sprites.map((s) => ({ image: s.image, body: s.body })),
          })),
      },
      sections: laid.spans.length,
      // Its cloud banks, and how far over the road each is held, metres.
      banks: {
        count: bankThings.length,
        held: [...new Set(bankThings.map((t) => round3(t.sprites[0]!.groundOffset)))],
      },
      // Its gates, each its two posts' hits one body.
      gates: placed[course]!.filter((t) => t.posts.length).length,
      // The things beside its roads not taken, their water's runs, those the car could reach within its limits, and
      // how far the nearest's hit or water lies beyond them, metres.
      notTaken: {
        roads: notTaken.length,
        things: besideThings.length,
        water: besideFlats.flat().filter((w) => w.open).length,
        patches: besideFlats.flat().filter((w) => !w.open).length,
        banks: besideBranches[course]!.flat().filter((p) => p.bank).length,
        reached,
        clear: round3(clear),
      },
      // Its water's and its ground patches' runs beside its own road, and their metres along it.
      water: {
        runs: flatRuns.filter((w) => w.open).length,
        metres: round1(flatRuns.filter((w) => w.open).reduce((sum, w) => sum + w.to - w.from, 0)),
      },
      patches: {
        runs: flatRuns.filter((w) => !w.open).length,
        metres: round1(flatRuns.filter((w) => !w.open).reduce((sum, w) => sum + w.to - w.from, 0)),
      },
      // Where it crosses itself, metres along it, and how far its second passage lies above its first.
      crossings: crossed.map(([a, b]) => ({
        at: [round1(a), round1(b)],
        apart: round3(profile.height(b) - profile.height(a)),
      })),
      heights: { departs: round3(departs), runs: rise.runs, gradeDeparture: round3(rise.departure) },
      skies: skyKnots.map((k) => ({ at: round1(k.s), image: k.image, transition: round1(k.transition) })),
      ground: groundSides.left.map(([s, m]) => [round1(s), m]),
    };
  });
  return {
    outputs,
    report: {
      positionMetres: Number(POSITION_METRES.toPrecision(6)),
      edgeMetres: round3(picture.edgeMetres),
      skies: skies.size,
      courses,
    },
  };
}

export const TOP_SPEED_CONVERSION: Conversion = (set) => {
  const { outputs, report } = topSpeedCourses(set);
  return { outputs, report: { conversion: TOP_SPEED_CONVERSION_VERSION, ...report } };
};
