/**
 * TURBO OUTRUN's courses from its ROMs ([TURBO OUTRUN road data](../../docs/turbo-outrun-road-data.md#turbo-outruns-courses)):
 * each of its four legs, the stages between the original's car's stops, laid out as a LINEAR course
 * (`turbo-outrun-layout`), each Section written with its lanes, verges, strips (two roads as the road ROM draws them, in
 * each stage's colors), gates and skies.
 */
import { bySlope, slopeColor, type Mound, type Slope } from './jump-mound.js';
import { requireInput } from '../course/authoring-io.js';
import { computedValue } from '../authoring/course-joints.js';
import { CAMERA_DEFINITION } from '../../src/view/camera-definition.js';
import { COURSE_DOCUMENT_VERSION } from '../../src/course/course-document.js';
import { cameraDistance } from '../../src/view/camera.js';
import {
  laneCentre,
  micrometre,
  repeated,
  sectionStations,
  simplified,
  stripeHalves,
  WRITTEN_SLACK,
  writtenPlan,
} from './section-writing.js';
import { sectionProfile } from './road-profile.js';
import { positionMetres, stripePeriod } from './board-clock.js';
import { paletteName, UNIT_METRES } from './pixel-grid.js';
import { word } from './program-words.js';
import { ruleGrid, type GridKind, type OriginalPlace } from './grid-rule.js';
import { readHeightTable } from './road-tables.js';
import { composite, type FeatureEdge } from './two-roads.js';
import {
  CENTRE_INSIDE,
  checkTurboOutrunRoadRom,
  drivenLanes,
  ROAD_HALF,
  TURBO_OUTRUN_ROAD,
} from './turbo-outrun-cross-section.js';
import { layTurboOutrun, type Piece } from './turbo-outrun-layout.js';
import { narrowGround } from './two-roads.js';
import {
  assembleTurboOutrunPrograms,
  assembleTurboOutrunSprites,
  assembleTurboOutrunTiles,
} from './turbo-outrun-rom.js';
import { BACK_WIDTH, bakeSky, SKY_HORIZON, SKY_WIDTH } from './sky-baking.js';
import { stageBands } from './turbo-outrun-backgrounds.js';
import { pictureNames, turboOutrunBoards, type PictureUse } from './turbo-outrun-boards.js';
import { isDip, turboOutrunPlacements, type PlacedObject } from './turbo-outrun-objects.js';
import {
  readClock,
  readConstants,
  readLegOrder,
  readTurboOutrunStages,
  TURBO_OUTRUN_HEIGHT_TABLES,
  type TurboOutrunStage,
} from './turbo-outrun-road.js';
import { turboOutrunObjects } from './turbo-outrun-scenery.js';
import { TURBO_OUTRUN_NAMES } from './turbo-outrun-names.js';
import type { RomSet } from './rom-set.js';

/** The conversion's version, recorded in the specification beside the course it wrote. */
export const TURBO_OUTRUN_CONVERSION_VERSION = 32;

/**
 * The car's lateral limit, the word the program adds at 0x16274 (`add.w $1ddf6.l, d0`). The instruction is encrypted
 * (FD1094), so its address is written here, read from the program decrypted locally (K, 2026-10-25); the word itself is
 * a plain table entry, read from the ROMs.
 */
const LATERAL_LIMIT = 0x1ddf6;
/** Leg `leg`'s course (0 to 3): its id and its name, `TURBO OUTRUN SEC.1` to `SEC.4` (K, 2026-10-26). */
export const courseId = (leg: number) => `turbo-outrun-section-${leg + 1}`;
const courseName = (leg: number) => `TURBO OUTRUN SEC.${leg + 1}`;

/** A stage's Sections' ids' stem: its name in lower case, dots left out, words joined by hyphens. */
export const stageSlug = (n: number) => TURBO_OUTRUN_NAMES[n]!.toLowerCase().replace(/\./g, '').replace(/ +/g, '-');
/** A stage's sky, baked from its background. */
export const skyName = (n: number) => `toutrun-${stageSlug(n)}-sky`;

/**
 * The 959 at GO, road units right of the car (0xC238 places it on the left road, 0xC28E, at the car's depth, 0xC27C
 * and 0x11D28, its x −0x80 at 0xC294 and 0xC29C): the instructions are encrypted, read from the program decrypted
 * locally ([TURBO OUTRUN road data](../../docs/turbo-outrun-road-data.md#turbo-outruns-programs)).
 */
const RIVAL_X = -0x80;
/**
 * The skies face as the original's backgrounds: at heading 0 its back layer's pixel 1376 of 1536 is at the screen's
 * middle, here 1376 × 1504 / 1536 of the sky's 1504.
 */
const BACK_MIDDLE = 1376;
/** The lanes and the median between the roads, left to right. */
const ORDER = ['a', 'b', 'c', 'm', 'd', 'e', 'f'] as const;
const CENTRE_LANE = 'b';
/** A width is there where it is wider than this, units. */
const THERE = 1e-9;
/** Where the roads' picture is sampled for changes, positions. */
const SAMPLE = 0.25;
/** A painted interval narrowing to nothing at a stretch's end is drawn to where it is this wide, metres. */
const THIN = 1e-5;

type Lateral = Record<string, unknown> | number;
const laneLateral = (lane: string, side: string, offset: number): Lateral => ({
  lane,
  side,
  offset: micrometre(offset),
});
const boundary = (id: string): Lateral => ({ boundary: id, offset: 0 });
const wrapDegrees = (degrees: number) => ((((degrees + 180) % 360) + 360) % 360) - 180;

/** The lanes driven at road width `w`, units, by name. */
const lanesAt = (w: number) => {
  const { a, b, c, m, d, e, f } = drivenLanes(w);
  return new Map<string, number>(Object.entries({ a, b, c, m, d, e, f }));
};
/** Each lane's and the median's left and right edge, units right of lane b's centre, for widths `widths`. */
function laneLines(widths: ReadonlyMap<string, number>) {
  const lines = new Map<string, { left: number; right: number }>();
  let x = -widths.get(CENTRE_LANE)! / 2 - widths.get('a')!;
  for (const name of ORDER) {
    const w = widths.get(name)!;
    lines.set(name, { left: x, right: x + w });
    x += w;
  }
  return lines;
}
/** A line held to a lane: `units` right of its side; each road's centre lies 214 inside its outer lane's outer edge. */
interface LaneRef {
  readonly lane: string;
  readonly side: 'left' | 'right';
  readonly units: number;
}
const ROAD_CENTRES: readonly LaneRef[] = [
  { lane: 'a', side: 'left', units: CENTRE_INSIDE },
  { lane: 'f', side: 'right', units: -CENTRE_INSIDE },
];

/** A stretch of road stations shown in one stage's colors. */
interface ColorStretch {
  readonly from: number;
  readonly to: number;
  readonly stage: TurboOutrunStage;
}
/** Where a stage's sky comes in, by station. */
interface SkyChange {
  readonly s: number;
  readonly stage: number;
}

/**
 * A dip ([Original road data](../../docs/original-road-data.md#profile), Jumps and dips): K's, 0.1 m deep and 2 m either
 * side of its bottom (K, 2026-10-26).
 */
const DIP: Mound = { half: 2, height: -0.1 };

/** TURBO OUTRUN's courses from its ROM set, a leg each: their documents, their pictures and skies, and reports. */
export function turboOutrunCourses(set: RomSet) {
  checkTurboOutrunRoadRom(set);
  const programs = assembleTurboOutrunPrograms(set);
  const planes = assembleTurboOutrunTiles(set);
  const { stages } = readTurboOutrunStages(programs);
  const constants = readConstants(programs.main);
  const kmh = constants.topSpeed;
  const clock = readClock(programs);
  const { objects, runs } = turboOutrunObjects(programs.main, stages, {
    kmh,
    slots: constants.objectSlots.count,
    clock,
  });
  for (const stage of stages)
    for (const colors of Object.values(stage.colors))
      requireInput(
        colors.words[2] === colors.words[0] && colors.words[3] === colors.words[1],
        `/stages/${stage.number}`,
        `Stage ${stage.number}'s road 1 is not in road 0's colors`,
      );
  const tables = new Map(
    [...new Set(stages.flatMap((s) => s.widthsHeights.filter((p) => p.kind === 0).map((p) => p.value)))].map((n) => [
      n,
      readHeightTable(programs.sub, n, TURBO_OUTRUN_HEIGHT_TABLES),
    ]),
  );
  const camera = cameraDistance(CAMERA_DEFINITION);
  const yawBase =
    ((SKY_WIDTH - ((BACK_MIDDLE * SKY_WIDTH) / BACK_WIDTH - CAMERA_DEFINITION.centerX)) /
      CAMERA_DEFINITION.focalLength) *
    (180 / Math.PI);
  // SAND reaches the car's lateral limit: as OUTRUN's 0xC2B0, the program's 0x16266 holds the car's x (0x260050) within
  // the word it adds at 0x16274 of its road's centre, that far beyond the road's outer lane edge.
  const beyond = micrometre((word(programs.main, LATERAL_LIMIT) - CENTRE_INSIDE) * UNIT_METRES);

  // Each leg a course: its stages from its first's GO, as the original starts a leg (the car, the 959 and the leg's
  // start objects as at the game's start), to its last's gate, its finish.
  const legs = readLegOrder(programs.main).map((numbers, leg) => {
    const inLeg = (stage: number) => numbers.includes(stage);
    const layout = layTurboOutrun({
      stages: numbers.map((n) => stages[n]!),
      runs: runs.filter((r) => inLeg(r.stage)),
      startWidth: constants.startWidths[numbers[0]!]!,
      tables,
      kmh,
      clock,
      cameraDistance: camera,
      slug: stageSlug,
      dips: objects.filter((o) => inLeg(o.stage) && isDip(programs.main, o)),
      dip: DIP,
    });
    const { station, course } = layout;
    const startOf = (stage: number) => course.find((c) => c.stage.number === stage)!.start;
    // Each stage's colors from its start (the course's start for the first) to its end, where the next stage's come in
    // at once.
    const stretches: ColorStretch[] = course.map(({ stage, start, length }, n) => ({
      from: n === 0 ? 0 : station(start),
      to: station(start + length),
      stage,
    }));
    // The skies: the first stage's from the course's start, each next one's where the original changes its background as
    // the car comes to it.
    const skies: SkyChange[] = [
      { s: 0, stage: course[0]!.stage.number },
      ...course
        .slice(0, -1)
        .map(({ start, run }, n) => ({ s: station(start + run.backgroundChange), stage: course[n + 1]!.stage.number })),
    ];
    const checkpoints = course
      .slice(0, -1)
      .map(({ stage, start, run }) => ({ id: `${stageSlug(stage.number)}-CP`, s: station(start + run.gate) }));
    const lastStage = course.at(-1)!;
    const finish = {
      id: `${stageSlug(lastStage.stage.number)}-GOAL`,
      s: station(lastStage.start + lastStage.run.gate),
    };
    // The objects, and the pictures they show.
    const placing = turboOutrunPlacements(programs.main, {
      objects: objects.filter((o) => inLeg(o.stage) && !isDip(programs.main, o)),
      runs,
      leg,
      start: startOf,
      width: layout.width,
      originalWidth: layout.original,
      go: layout.go,
      clock,
    });
    requireInput(
      placing.placed.every((o) => o.g < layout.total),
      `/${courseId(leg)}`,
      "An object stands past the course's end",
    );
    return { leg, layout, placing, stretches, skies, checkpoints, finish };
  });

  const uses = legs.flatMap(({ placing }) => placing.placed.map((o) => o.use));
  const boards = turboOutrunBoards(programs.main, assembleTurboOutrunSprites(set), uses);
  const nameOf = pictureNames(uses);
  const pictures = boards.map(({ name, width, image }) => ({ name, width, image }));
  const edges = new Map(boards.flatMap((b) => (b.edge ? [[b.name, b.edge] as const] : [])));
  const widths = new Map(boards.map((b) => [b.name, b.width]));

  const courses = legs.map(({ leg, layout, placing, stretches, skies, checkpoints, finish }) => {
    const { pieces } = layout;
    const sections = pieces.map((piece, i) =>
      sectionDocument(piece, {
        layout,
        widths,
        edges,
        beyond,
        nameOf,
        objects: placing.placed.filter((o) => o.g >= piece.from && (o.g < piece.to || i === pieces.length - 1)),
        first: i === 0,
        last: i === pieces.length - 1,
        stretches,
        skies,
        yawBase,
        checkpoints,
        finish,
        camera,
      }),
    );
    const links = pieces.slice(1).map((piece, i) => ({
      id: `${pieces[i]!.id}-${piece.id}`,
      from: { section: pieces[i]!.id, lane: CENTRE_LANE },
      to: piece.id,
    }));
    return {
      id: courseId(leg),
      document: {
        format: 'superoutride.course',
        version: COURSE_DOCUMENT_VERSION,
        name: courseName(leg),
        entry: pieces[0]!.id,
        maxLaps: 1,
        bearing: 0,
        sections,
        links,
      },
      layout,
      placing: placing.report,
      dip: { ...DIP, ...layout.mounds },
    };
  });
  return {
    courses,
    runs,
    kmh,
    pictures,
    // Each stage's sky, baked from its background.
    skies: stages.map((stage, n) => ({
      name: skyName(n),
      document: bakeSky(skyName(n), stageBands(programs.main, planes, n, stage.sky.ramp.rgb555)),
    })),
    beyond,
  };
}

/** One Section of a leg's course, its positions `[piece.from, piece.to]`. */
function sectionDocument(
  piece: Piece,
  context: {
    readonly layout: ReturnType<typeof layTurboOutrun>;
    readonly objects: readonly PlacedObject[];
    /** Each picture's width, metres, by name. */
    readonly widths: ReadonlyMap<string, number>;
    /** Each extending board's edge, by its name: standing once where the board does. */
    readonly edges: ReadonlyMap<string, string>;
    /** How far SAND reaches beyond the outermost lanes, metres. */
    readonly beyond: number;
    /** Each object's picture's image name. */
    readonly nameOf: (use: PictureUse) => string;
    readonly first: boolean;
    readonly last: boolean;
    readonly stretches: readonly ColorStretch[];
    readonly skies: readonly SkyChange[];
    readonly yawBase: number;
    readonly checkpoints: readonly { readonly id: string; readonly s: number }[];
    readonly finish: { readonly id: string; readonly s: number };
    readonly camera: number;
  },
) {
  const { width, offset, laneBreaks, line } = context.layout;
  const { from, to, origin } = piece;
  const metres = positionMetres(context.layout.clock);
  /** The station of course position `g` from the Section's start. */
  const local = (g: number) => (g - from) * metres;

  // The plan: P's elements over [from, to], as written; the Section's length theirs, as the next one's start is.
  const elements = writtenPlan(line, { from: from * metres, to: to * metres });
  const { size, joint, at: atStation } = sectionStations(elements);
  const at = (g: number) => atStation(local(g));
  const stationOf = (g: number) => micrometre(local(g));

  // The lanes and lane b's centre at each knot, where a width, lane b's centre or a lane changes slope, straight
  // between; a lane or the median 0 throughout left out.
  const lanes = (g: number) => lanesAt(width.at(g));
  const knots = [...new Set([from, to, ...width.breaks, ...offset.breaks, ...laneBreaks])]
    .filter((g) => g >= from && g <= to)
    .sort((a, b) => a - b);
  const widths = knots.map(lanes);
  const present = ORDER.filter((name) => widths.some((w) => w.get(name)! > THERE));
  const lineOf = (values: [number, number][], name: 'width' | 'lateral') => {
    const simple = simplified(values);
    return simple.every(([, v]) => v === simple[0]![1])
      ? simple[0]![1]
      : simple.map(([s, v]) => ({ at: atStation(s), [name]: v }));
  };
  const laneDocuments = present.map((name) => {
    const lane = lineOf(
      knots.map((g, i) => [stationOf(g), micrometre(widths[i]!.get(name)! * UNIT_METRES)]),
      'width',
    );
    return name === 'm' ? { kind: 'median', width: lane } : { kind: 'lane', id: name, width: lane };
  });
  const centerLateral = lineOf(
    knots.map((g) => [stationOf(g), micrometre(offset.at(g))]),
    'lateral',
  );
  /** The lanes' and the median's lines at `g`, units right of lane b's centre. */
  const written = (g: number) => laneLines(lanes(g));
  const ref = (r: LaneRef, more = 0) => laneLateral(r.lane, r.side, r.units * UNIT_METRES + more);

  // The verges: the sand to its width beyond each outer lane.
  const { beyond } = context;
  const verge = (side: 0 | 1) =>
    [from, to].map((g) => ({
      at: at(g),
      lateral: side === 0 ? laneLateral('a', 'left', -beyond) : laneLateral('f', 'right', beyond),
    }));

  // The strips: the ground, the sand between the verges, each road's asphalt, and the lines and edge bands the roads'
  // picture shows, each in its two colors by halves of the stripes' period counted from GO.
  const go = context.layout.station(context.layout.go);
  const strip = (
    a: number,
    b: number,
    left: Lateral | null,
    right: Lateral | null,
    color: number | null,
    material: string | null,
  ) => ({ kind: 'strip', start: atStation(a), end: atStation(b), left, right, color, material });
  // A color over half `h` of every period within `[a, b]`, Section metres, the periods counted from GO.
  const halves = (h: 0 | 1, a: number, b: number, left: Lateral | null, right: Lateral | null, color: number) =>
    stripeHalves(h, stripePeriod(context.layout.clock), go - origin, a, b, (from, to) =>
      strip(from, to, left, right, color, null),
    );
  const colored = (
    a: number,
    b: number,
    left: Lateral | null,
    right: Lateral | null,
    two: readonly number[],
    under: readonly number[],
  ) => ([0, 1] as const).flatMap((h) => (two[h] === under[h] ? [] : halves(h, a, b, left, right, two[h]!)));
  const owned = context.stretches
    .map((t) => ({ ...t, from: Math.max(t.from - origin, 0), to: Math.min(t.to - origin, size) }))
    .filter((t) => t.to - t.from > 1e-6);
  const strips: unknown[] = [];
  for (const t of owned) {
    const ground = t.stage.ground.words.rgb555;
    strips.push(
      strip(t.from, t.to, null, null, ground[15]!, null),
      ...halves(0, t.from, t.to, null, null, ground[14]!),
    );
  }
  strips.push(strip(0, size, boundary('outer-left'), boundary('outer-right'), null, 'SAND'));
  // The asphalt: its material under each road and between them where the ground there is narrow (`narrowGround`); its
  // color over both roads where they touch (w ≤ 250), each road's where the ground shows between them.
  const stretchesOf = (above: number) =>
    width
      .map((w) => w, [above])
      .pieces.filter((q) => q.to > from && q.from < to)
      .map((q) => ({
        a: stationOf(Math.max(q.from, from)),
        b: stationOf(Math.min(q.to, to)),
        apart: width.at((q.from + q.to) / 2) > above,
      }))
      .reduce<{ a: number; b: number; apart: boolean }[]>((out, q) => {
        const before = out.at(-1);
        if (before && before.apart === q.apart && before.b === q.a) before.b = q.b;
        else out.push({ ...q });
        return out;
      }, []);
  const roadSides = ROAD_CENTRES.map(
    (centre) => [ref(centre, -ROAD_HALF * UNIT_METRES), ref(centre, ROAD_HALF * UNIT_METRES)] as const,
  );
  const [outerLeft, outerRight] = [roadSides[0]![0], roadSides[1]![1]];
  for (const [left, right] of roadSides) strips.push(strip(0, size, left, right, null, 'ASPHALT'));
  for (const q of narrowGround(width, ROAD_HALF, UNIT_METRES)) {
    const [a, b] = [Math.max(q.from, from), Math.min(q.to, to)];
    // Across both roads, whose outer edges never cross.
    if (b > a) strips.push(strip(stationOf(a), stationOf(b), roadSides[0]![0], roadSides[1]![1], null, 'ASPHALT'));
  }
  const asphalt = stretchesOf(ROAD_HALF);
  // On the dips' slopes the road's colors are brightened or darkened (`slopeColor`), its stripes cut where they end.
  const { slopes } = context.layout;
  const toned = (two: readonly number[], facing: Slope['facing'] | null) => two.map((c) => slopeColor(c, facing));
  for (const t of owned) {
    for (const q of asphalt) {
      const [sa, sb] = [Math.max(q.a, t.from), Math.min(q.b, t.to)];
      if (sb - sa <= 1e-6) continue;
      for (const { from: pa, to: pb, facing } of bySlope(sa, sb, slopes, origin)) {
        const surface = toned(t.stage.colors.surface.rgb555, facing);
        for (const [left, right] of q.apart ? roadSides : [[outerLeft, outerRight] as const]) {
          strips.push(strip(pa, pb, left, right, surface[1]!, null));
          if (surface[0] !== surface[1]) strips.push(...halves(0, pa, pb, left, right, surface[0]!));
        }
      }
    }
  }
  for (const regime of regimes(width.at.bind(width), from, to)) {
    for (const interval of regime.intervals) {
      const sideRef = (edge: FeatureEdge): LaneRef => {
        const centre = ROAD_CENTRES[edge.road]!;
        return { ...centre, units: centre.units + edge.at };
      };
      const [lr, rr] = [sideRef(interval.left), sideRef(interval.right)];
      // Its width as the Section's lanes give it; an end where it narrows to nothing drawn in to where it is `THIN`.
      const across = (g: number) => {
        const lines = written(g);
        return (lines.get(rr.lane)![rr.side] + rr.units - lines.get(lr.lane)![lr.side] - lr.units) * UNIT_METRES;
      };
      const inward = (g: number, toward: number) => {
        if (across(g) >= THIN) return g;
        let [lo, hi] = [g, toward];
        if (across(hi) < THIN) return null;
        for (let i = 0; i < 50; i++) {
          const mid = (lo + hi) / 2;
          if (across(mid) >= THIN) hi = mid;
          else lo = mid;
        }
        return hi;
      };
      const mid = (regime.from + regime.to) / 2;
      const [a, b] = [inward(regime.from, mid), inward(regime.to, mid)];
      if (a === null || b === null || b - a < 1e-3) continue;
      for (const t of owned) {
        const [sa, sb] = [Math.max(stationOf(a), t.from), Math.min(stationOf(b), t.to)];
        if (sb - sa <= 1e-6) continue;
        const { laneLines: lines, edges, surface } = t.stage.colors;
        const two = interval.paint === 'line' ? lines.rgb555 : edges.rgb555;
        for (const { from: pa, to: pb, facing } of bySlope(sa, sb, slopes, origin))
          strips.push(...colored(pa, pb, ref(lr), ref(rr), toned(two, facing), toned(surface.rgb555, facing)));
      }
    }
  }

  // The gates: the grid at the start, each stage's checkpoint and the finish where their posts pass the car.
  const gates: unknown[] = [];
  // The player's slot at GO at lane b's centre, the left road's, where the original's car stands, the car's lateral limit
  // about it; the cars' grid with the original's 959 beside it.
  if (context.first) {
    const player = { s: go - origin, lateral: laneCentre('b') };
    const laneWidth = lanes(context.layout.go).get('b')! * UNIT_METRES;
    const reach = context.beyond + CENTRE_INSIDE * UNIT_METRES;
    const grid = (kind: GridKind, originals: readonly OriginalPlace[]) =>
      ruleGrid({ kind, player, originals, lanes: ['a', 'b'], laneWidth, limits: [reach, reach] }).map((slot) => ({
        at: atStation(slot.s),
        lateral: slot.lateral,
      }));
    gates.push({
      kind: 'start',
      grid: grid('car', [{ ahead: 0, right: RIVAL_X * UNIT_METRES }]),
      bikeGrid: grid('bike', []),
    });
  }
  const inside = (s: number) => s > origin + WRITTEN_SLACK && s <= origin + size + WRITTEN_SLACK;
  for (const c of context.checkpoints)
    if (inside(c.s)) gates.push({ kind: 'checkpoint', id: c.id, at: atStation(c.s - origin) });
  if (inside(context.finish.s))
    gates.push({ kind: 'finish', id: context.finish.id, at: atStation(context.finish.s - origin) });

  // The skies: the one shown at the Section's start, and each that comes in within it, facing as the original's
  // heading 0 does in the Section's frame.
  const turned = ((context.layout.pose(from).heading - context.layout.pose(0).heading) * 180) / Math.PI;
  const yawOrigin = micrometre(wrapDegrees(context.yawBase + turned));
  const environment = (change: SkyChange, s: number) => ({
    at: atStation(s),
    name: TURBO_OUTRUN_NAMES[change.stage]!,
    background: { image: skyName(change.stage), horizonY: SKY_HORIZON, yawOrigin },
    arrival: 'cut',
  });
  const shown = context.skies.filter((c) => c.s <= origin + WRITTEN_SLACK).at(-1)!;
  const environments = [
    environment(shown, 0),
    ...context.skies
      .filter((c) => c.s > origin + WRITTEN_SLACK && c.s < origin + size - WRITTEN_SLACK)
      .map((c) => environment(c, c.s - origin)),
  ];

  return {
    id: piece.id,
    plan: elements,
    profile: sectionProfile(context.layout.profile, origin, origin + size, !context.first, !context.last).map(
      ({ s, y, curveLength }) => ({ at: { joint, offset: computedValue(s - origin) }, y, curveLength }),
    ),
    lanes: laneDocuments,
    centerLane: CENTRE_LANE,
    centerLateral,
    boundaries: [
      { id: 'outer-left', knots: verge(0) },
      { id: 'outer-right', knots: verge(1) },
    ],
    strips,
    walls: [],
    openLimits: [],
    sprites: repeated(
      [...context.objects]
        .sort((a, b) => a.g - b.g || a.x - b.x)
        .map((o) => {
          const board = {
            kind: 'sprite',
            image: context.nameOf(o.use),
            palette: paletteName(o.use.palette),
            at: at(o.g),
            lateral: micrometre(o.x),
            groundOffset: micrometre(o.height),
            unselectedLink: null,
            // As wide as its hit extents, at most its picture.
            body:
              o.body === null
                ? null
                : { width: micrometre(Math.min(o.body, context.widths.get(context.nameOf(o.use))!)), movable: null },
          };
          // An extending board's edge stands once where it does, repeated with it.
          const edge = context.edges.get(board.image);
          return edge ? [board, { ...board, image: edge }] : board;
        }),
    ),
    environments,
    gates,
  };
}

/**
 * The stretches of positions `[from, to]` over which the roads' picture at road width `w(g)` (road 0's centre at −w,
 * road 1's at +w) keeps one arrangement: the same lines and edge bands, each between the same features. Found on a grid
 * of `SAMPLE` positions, each change then narrowed down by halving.
 */
function regimes(w: (g: number) => number, from: number, to: number) {
  const pictureAt = (g: number) => {
    const intervals = composite([-w(g), w(g)], TURBO_OUTRUN_ROAD);
    return { key: JSON.stringify(intervals), intervals };
  };
  const out: { from: number; to: number; intervals: ReturnType<typeof pictureAt>['intervals'] }[] = [];
  const n = Math.max(1, Math.ceil((to - from) / SAMPLE));
  const mids = Array.from({ length: n }, (_, k) => from + ((to - from) * (k + 0.5)) / n);
  let start = from,
    current = pictureAt(mids[0]!);
  for (let k = 1; k < n; k++) {
    const next = pictureAt(mids[k]!);
    if (next.key === current.key) continue;
    let [lo, hi] = [mids[k - 1]!, mids[k]!];
    for (let j = 0; j < 40; j++) {
      const mid = (lo + hi) / 2;
      if (pictureAt(mid).key === current.key) lo = mid;
      else hi = mid;
    }
    out.push({ from: start, to: hi, intervals: current.intervals });
    [start, current] = [hi, next];
  }
  out.push({ from: start, to, intervals: current.intervals });
  return out;
}
