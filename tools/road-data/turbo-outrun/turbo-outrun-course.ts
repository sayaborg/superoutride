/**
 * TURBO OUTRUN's courses from its ROMs ([TURBO OUTRUN road data](../../../docs/turbo-outrun-road-data.md#turbo-outruns-courses)):
 * each of its four legs, the stages between the original's car's stops, laid out as a LINEAR course
 * (`turbo-outrun-layout`), each Section written with its lanes, verges, strips (two roads as the road ROM draws them, in
 * each stage's colors), gates and skies.
 */
import { WRITTEN_SLACK } from '../shared/shared-constants.js';
import { bySlope, slopeColor, type Slope } from '../shared/jump-mound.js';
import { requireInput } from '../../authoring/authoring-error.js';
import { computedValue } from '../../authoring/course-joints.js';
import { CAMERA_DEFINITION } from '../../../src/view/camera-definition.js';
import { cameraDistance } from '../../../src/view/camera.js';
import {
  laneCentre,
  micrometre,
  repeated,
  sectionGates,
  sectionStations,
  stripeHalves,
  writtenPlan,
  spriteElement,
  stripElement,
  laneLateral,
  widthLine,
  lateralLine,
} from '../shared/section-writing.js';
import { sectionProfile } from '../shared/road-profile.js';
import { positionMetres, stripePeriod } from '../out-run-hardware/clock.js';
import { paletteName } from '../shared/pixel-grid.js';
import { word } from '../sega-16/program-words.js';
import { startGate } from '../shared/grid-rule.js';
import { readHeightTable } from '../out-run-hardware/road-tables.js';
import {
  arrangements,
  composite,
  drawnInterval,
  THERE,
  type FeatureEdge,
  narrowGround,
} from '../out-run-hardware/two-roads.js';
import {
  CENTRE_INSIDE,
  checkTurboOutrunRoadRom,
  drivenLanes,
  TURBO_OUTRUN_ROAD,
} from './turbo-outrun-cross-section.js';
import { layTurboOutrun, type Piece } from './turbo-outrun-layout.js';
import {
  assembleTurboOutrunPrograms,
  assembleTurboOutrunSprites,
  assembleTurboOutrunTiles,
} from './turbo-outrun-rom.js';
import { bakeSky, sectionYawOrigin, SKY_HORIZON, skyYawOrigin } from '../shared/sky-baking.js';
import { colorStretches, stretchColor, type ColorStretch } from '../shared/color-stretches.js';
import { stageBands } from './turbo-outrun-backgrounds.js';
import { BACKGROUND_SCROLL } from '../out-run-hardware/backgrounds.js';
import { pictureNames, turboOutrunBoards, type PictureUse } from './turbo-outrun-boards.js';
import { sceneryReach } from '../out-run-hardware/strips.js';
import {
  CHANGE_COLOR_FRAMES,
  CHANGE_SKY_ROWS,
  CHANGE_SKY_STEPS,
  DIP,
  RIVAL_X,
  LATERAL_LIMIT,
  ROAD_MATERIAL,
  GROUND_MATERIAL,
} from './turbo-outrun-constants.js';
import { isDip, turboOutrunPlacements, type PlacedObject } from './turbo-outrun-objects.js';
import { lineAhead } from '../out-run-hardware/object-approach.js';
import {
  lineDistances,
  readClock,
  readConstants,
  readLegOrder,
  readTurboOutrunStages,
  TURBO_OUTRUN_HEIGHT_TABLES,
  type TurboOutrunStage,
} from './turbo-outrun-road.js';
import { turboOutrunObjects } from './turbo-outrun-scenery.js';
import type { RomSet } from '../shared/rom-set.js';
import { BACK_WIDTH, PIXEL_ASPECT } from '../sega-16/display.js';
import {
  overpassReport,
  fidelityReport,
  gradeReport,
  round1,
  round3,
  OriginalOutputs,
  type Conversion,
} from '../shared/conversion.js';
import { UNIT_METRES, ROAD_HALF } from '../out-run-hardware/constants.js';
import { chainLinks, courseDocument } from '../shared/course-writing.js';
import {
  type StripElementDocument,
  type CourseGateDocument,
  type Lateral,
  type LaneDocument,
  type SectionDocument,
} from '../../../src/course/course-document.js';

/** The conversion's version, recorded in the specification beside the course it wrote. */
export const TURBO_OUTRUN_CONVERSION_VERSION = 52;

/** Leg `leg`'s course (0 to 3): its id and its name, `TURBO OUTRUN SEC.1` to `SEC.4` (K, 2026-10-26). */
export const courseId = (leg: number) => `turbo-outrun-section-${leg + 1}`;
const courseName = (leg: number) => `TURBO OUTRUN SEC.${leg + 1}`;

/** A stage's Sections' ids' stem: its name's words in lower case, a dot parting them as a space does, joined by hyphens. */
export const stageSlug = (name: string) => name.toLowerCase().split(/[ .]+/).filter(Boolean).join('-');
/** A stage's sky, baked from its background. */
export const skyName = (name: string) => `toutrun-${stageSlug(name)}-sky`;

/** The lanes and the median between the roads, left to right. */
const ORDER = ['a', 'b', 'c', 'm', 'd', 'e', 'f'] as const;
const CENTRE_LANE = 'b';

/** A Strip's color: one, or a pair through a change of sky. */
type StripColor = number | { readonly from: number; readonly to: number };

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

/** Where a stage's sky comes in, by station. */
interface SkyChange {
  readonly s: number;
  /** The stage whose sky it is, by name. */
  readonly name: string;
  /** Metres from `s` over which it replaces the sky before it, with the stage's road and ground (0 the leg's first). */
  readonly length: number;
}

/** TURBO OUTRUN's courses from its ROM set, a leg each: their documents, their pictures and skies, and reports. */
export function turboOutrunCourses(set: RomSet) {
  checkTurboOutrunRoadRom(set);
  const programs = assembleTurboOutrunPrograms(set);
  const planes = assembleTurboOutrunTiles(set);
  const { stages } = readTurboOutrunStages(programs);
  const constants = readConstants(programs.main);
  const kmh = constants.topSpeed;
  const clock = readClock(programs);
  // A stage's change: its frames (whichever of the colors and the sky ends last) at the top speed, a tick's advance
  // `kmh` × `step` / 65536 positions.
  const changeFrames = Math.max(CHANGE_COLOR_FRAMES, clock.frames * (CHANGE_SKY_STEPS + 1) + 2 * CHANGE_SKY_ROWS);
  const changeMetres = (((changeFrames / clock.frames) * kmh * clock.step) / 65536) * positionMetres(clock);
  const distances = lineDistances(programs, clock);
  const ahead = (line: number) => lineAhead(distances, line);
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
  const yawBase = skyYawOrigin(BACKGROUND_SCROLL.middle, BACK_WIDTH);
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
      distances,
      cameraDistance: camera,
      slug: (n) => stageSlug(stages[n]!.name),
      dips: objects.filter((o) => inLeg(o.stage) && isDip(programs.main, o)),
      dip: DIP,
    });
    const { station, course } = layout;
    const startOf = (stage: number) => course.find((c) => c.stage.number === stage)!.start;
    // The skies: the first stage's from the course's start, each next one's from where the original begins to change
    // the stage as the car comes to it, over the change's length.
    const skies: SkyChange[] = [
      { s: 0, name: course[0]!.stage.name, length: 0 },
      ...course.slice(0, -1).map(({ start, run }, n) => ({
        s: station(start + run.stageChange),
        name: course[n + 1]!.stage.name,
        length: micrometre(changeMetres),
      })),
    ];
    // Each stage's colors from where its change begins, mixed from the stage before over it, the last to its end.
    const last = course.at(-1)!;
    const stretches = colorStretches(
      course.map(({ stage }) => stage),
      skies.slice(1).map(({ s, length }) => ({ at: s, length })),
      0,
      station(last.start + last.length),
    );
    const checkpoints = course
      .slice(0, -1)
      .map(({ stage, start, run }) => ({ id: `${stageSlug(stage.name)}-CP`, s: station(start + run.gate) }));
    const lastStage = course.at(-1)!;
    const finish = {
      id: `${stageSlug(lastStage.stage.name)}-GOAL`,
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
      ahead,
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
  const words = assembleTurboOutrunSprites(set);
  const nameOf = pictureNames(uses);
  // Every board but a strip's that does not loop, which reaches to the scenery's reach across every leg: how far the
  // pictures on the ground reach beyond the outermost lanes, a strip by its nearest picture.
  const shapes = turboOutrunBoards(programs.main, words, uses, undefined);
  const extents = new Map(shapes.map((b) => [b.name, b.extent]));
  const reach = sceneryReach(
    legs.flatMap(({ layout, placing }) =>
      placing.placed
        .filter((o) => o.height === 0)
        .map((o) => ({
          lateral: o.x,
          extent: extents.get(nameOf(o.use))!,
          edges: [layout.laneReach(o.g, 'left'), layout.laneReach(o.g, 'right')] as const,
        })),
    ),
  );
  const wide = uses.filter((u) => u.strip && !u.strip.loops);
  const boards = [...shapes.filter((b) => b.image), ...turboOutrunBoards(programs.main, words, wide, reach)];
  const pictures = boards.map(({ name, width, image }) => ({ name, width: width!, image: image! }));
  const colored = new Map(boards.map((b) => [b.name, b.colored]));

  const courses = legs.map(({ leg, layout, placing, stretches, skies, checkpoints, finish }) => {
    const { pieces } = layout;
    const sections = pieces.map((piece, i) =>
      sectionDocument(piece, {
        layout,
        colored,
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
    return {
      id: courseId(leg),
      document: courseDocument(courseName(leg), sections, chainLinks(pieces, CENTRE_LANE)),
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
      name: skyName(stage.name),
      document: bakeSky(skyName(stage.name), stageBands(programs.main, planes, n, stage.sky.ramp.rgb555), PIXEL_ASPECT),
    })),
    beyond,
    reach,
  };
}

/** One Section of a leg's course, its positions `[piece.from, piece.to]`. */
function sectionDocument(
  piece: Piece,
  context: {
    readonly layout: ReturnType<typeof layTurboOutrun>;
    readonly objects: readonly PlacedObject[];
    /** Each picture's colored columns' width (`coloredColumns`), metres, by name: a body's most. */
    readonly colored: ReadonlyMap<string, number>;
    /** How far SAND reaches beyond the outermost lanes, metres. */
    readonly beyond: number;
    /** Each object's picture's image name. */
    readonly nameOf: (use: PictureUse) => string;
    readonly first: boolean;
    readonly last: boolean;
    readonly stretches: readonly ColorStretch<TurboOutrunStage>[];
    readonly skies: readonly SkyChange[];
    readonly yawBase: number;
    readonly checkpoints: readonly { readonly id: string; readonly s: number }[];
    readonly finish: { readonly id: string; readonly s: number };
    readonly camera: number;
  },
): SectionDocument {
  const { width, offset, laneBreaks, line } = context.layout;
  const { from, to, origin } = piece;
  const metres = positionMetres(context.layout.clock);
  /** The station of course position `g` from the Section's start. */
  const local = (g: number) => (g - from) * metres;

  // The plan: P's elements over [from, to], as written; the Section's length theirs, as the next one's start is.
  const elements = writtenPlan(line, { from: from * metres, to: to * metres });
  const stations = sectionStations(elements);
  const { size, joint, at: atStation, apart } = stations;
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
  const laneDocuments = present.map((name): LaneDocument => {
    const width = widthLine(
      knots.map((g, i) => [stationOf(g), micrometre(widths[i]!.get(name)! * UNIT_METRES)]),
      atStation,
    );
    return name === 'm' ? { kind: 'median', width } : { kind: 'lane', id: name, width };
  });
  const centerLateral = lateralLine(
    knots.map((g) => [stationOf(g), micrometre(offset.at(g))]),
    atStation,
  );
  /** The lanes' and the median's lines at `g`, units right of lane b's centre. */
  const written = (g: number) => laneLines(lanes(g));
  const ref = (r: LaneRef, more = 0) => laneLateral(r.lane, r.side, r.units * UNIT_METRES + more);

  // The verges: the sand to its width beyond each outer lane, written as those lanes' lines.
  const { beyond } = context;
  const verges = [laneLateral('a', 'left', -beyond), laneLateral('f', 'right', beyond)] as const;

  // The strips: the ground, the sand between the verges, each road's asphalt, and the lines and edge bands the roads'
  // picture shows, each in its two colors by halves of the stripes' period counted from GO.
  const go = context.layout.station(context.layout.go);
  const strip = (
    a: number,
    b: number,
    left: Lateral | null,
    right: Lateral | null,
    color: StripColor | null,
    material: string | null,
  ) => stripElement(atStation(a), atStation(b), left, right, color, material);
  // A color over half `h` of every period within `[a, b]`, Section metres, the periods counted from GO.
  const halves = (h: 0 | 1, a: number, b: number, left: Lateral | null, right: Lateral | null, color: StripColor) =>
    stripeHalves(h, stripePeriod(context.layout.clock), go - origin, a, b, (from, to) =>
      strip(from, to, left, right, color, null),
    );
  // Half `h` of every period in a stretch's two colors, but where it is the colors beneath in every stage it shows.
  const colored = (
    a: number,
    b: number,
    left: Lateral | null,
    right: Lateral | null,
    t: ColorStretch<TurboOutrunStage>,
    two: (stage: TurboOutrunStage) => readonly number[],
    under: (stage: TurboOutrunStage) => readonly number[],
  ) =>
    ([0, 1] as const).flatMap((h) =>
      [t.colors, t.before ?? t.colors].every((stage) => two(stage)[h] === under(stage)[h])
        ? []
        : halves(
            h,
            a,
            b,
            left,
            right,
            stretchColor(t, (stage) => two(stage)[h]!),
          ),
    );
  const owned = context.stretches
    .map((t) => ({ ...t, from: Math.max(t.from - origin, 0), to: Math.min(t.to - origin, size) }))
    .filter((t) => apart(t.from, t.to));
  const strips: StripElementDocument[] = [];
  for (const t of owned)
    strips.push(
      strip(
        t.from,
        t.to,
        null,
        null,
        stretchColor(t, (stage) => stage.ground.words.rgb555[15]!),
        null,
      ),
      ...halves(
        0,
        t.from,
        t.to,
        null,
        null,
        stretchColor(t, (stage) => stage.ground.words.rgb555[14]!),
      ),
    );
  strips.push(strip(0, size, verges[0], verges[1], null, GROUND_MATERIAL));
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
  for (const [left, right] of roadSides) strips.push(strip(0, size, left, right, null, ROAD_MATERIAL));
  for (const q of narrowGround(width, ROAD_HALF, UNIT_METRES)) {
    const [a, b] = [Math.max(q.from, from), Math.min(q.to, to)];
    // Across both roads, whose outer edges never cross.
    if (b > a) strips.push(strip(stationOf(a), stationOf(b), roadSides[0]![0], roadSides[1]![1], null, ROAD_MATERIAL));
  }
  const asphalt = stretchesOf(ROAD_HALF);
  // On the dips' slopes the road's colors are brightened or darkened (`slopeColor`), its stripes cut where they end.
  const { slopes } = context.layout;
  const toned = (two: readonly number[], facing: Slope['facing'] | null) => two.map((c) => slopeColor(c, facing));
  for (const t of owned) {
    for (const q of asphalt) {
      const [sa, sb] = [Math.max(q.a, t.from), Math.min(q.b, t.to)];
      if (!apart(sa, sb)) continue;
      for (const { from: pa, to: pb, facing } of bySlope(sa, sb, slopes, origin)) {
        const surface = (stage: TurboOutrunStage) => toned(stage.colors.surface.rgb555, facing);
        const whole = (stage: TurboOutrunStage) => [surface(stage)[1]!, surface(stage)[1]!];
        for (const [left, right] of q.apart ? roadSides : [[outerLeft, outerRight] as const])
          strips.push(
            strip(
              pa,
              pb,
              left,
              right,
              stretchColor(t, (stage) => surface(stage)[1]!),
              null,
            ),
            ...colored(pa, pb, left, right, t, surface, whole),
          );
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
      const drawn = drawnInterval(across, regime.from, regime.to);
      if (!drawn) continue;
      const [a, b] = drawn;
      for (const t of owned) {
        const [sa, sb] = [Math.max(stationOf(a), t.from), Math.min(stationOf(b), t.to)];
        if (!apart(sa, sb)) continue;
        const two = (stage: TurboOutrunStage) =>
          interval.paint === 'line' ? stage.colors.laneLines.rgb555 : stage.colors.edges.rgb555;
        for (const { from: pa, to: pb, facing } of bySlope(sa, sb, slopes, origin))
          strips.push(
            ...colored(
              pa,
              pb,
              ref(lr),
              ref(rr),
              t,
              (stage) => toned(two(stage), facing),
              (stage) => toned(stage.colors.surface.rgb555, facing),
            ),
          );
      }
    }
  }

  // The gates: the grid at the start, each stage's checkpoint and the finish where their posts pass the car.
  const gates: CourseGateDocument[] = [];
  // The player's slot at GO at lane b's centre, the left road's, where the original's car stands, the car's lateral limit
  // about it; the cars' grid with the original's 959 beside it.
  if (context.first) {
    const player = { s: go - origin, lateral: laneCentre('b') };
    const laneWidth = lanes(context.layout.go).get('b')! * UNIT_METRES;
    const reach = context.beyond + CENTRE_INSIDE * UNIT_METRES;
    gates.push(
      startGate(atStation, {
        player,
        originals: { car: [{ ahead: 0, right: RIVAL_X * UNIT_METRES }], bike: [] },
        lanes: ['a', 'b'],
        laneWidth,
        limits: [reach, reach],
      }),
    );
  }
  gates.push(...sectionGates(stations, origin, context.checkpoints, context.finish));

  // The skies: the one shown at the Section's start, and each that comes in within it, facing as the original's
  // heading 0 does in the Section's frame.
  const turned = ((context.layout.pose(from).heading - context.layout.pose(0).heading) * 180) / Math.PI;
  const yawOrigin = micrometre(sectionYawOrigin(context.yawBase, turned));
  const environment = (change: SkyChange, s: number) => ({
    at: atStation(s),
    name: change.name,
    background: { image: skyName(change.name), horizonY: SKY_HORIZON, yawOrigin },
    // At the Section's start a change already running runs on.
    transition: s === 0 && change.s < origin ? 0 : change.length,
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
    boundaries: [],
    strips,
    walls: [],
    openLimits: [],
    sprites: repeated(
      [...context.objects]
        .sort((a, b) => a.g - b.g || a.x - b.x)
        .map((o) =>
          spriteElement({
            image: context.nameOf(o.use),
            palette: paletteName(o.use.palette),
            at: at(o.g),
            lateral: o.x,
            groundOffset: o.height,
            // As wide as its hit extents, at most its picture's colored columns.
            body: o.body === null ? null : Math.min(o.body, context.colored.get(context.nameOf(o.use))!),
          }),
        ),
    ),
    environments,
    gates,
  };
}

/**
 * The stretches of positions `[from, to]` over which the roads' picture at road width `w(g)` (road 0's centre at −w,
 * road 1's at +w) keeps one arrangement: the same lines and edge bands, each between the same features
 * (`arrangements`).
 */
function regimes(w: (g: number) => number, from: number, to: number) {
  const pictureAt = (g: number) => {
    const intervals = composite([-w(g), w(g)], TURBO_OUTRUN_ROAD);
    return { key: JSON.stringify(intervals), intervals };
  };
  return arrangements(from, to, pictureAt);
}

/** turbo-outrun's conversion: its courses, pictures and skies raised from the ROMs, and its report. */
export const TURBO_OUTRUN_CONVERSION: Conversion = (set) => {
  // TURBO OUTRUN's courses, a leg each, and skies from its ROM zip, written to content, or with `--check` compared.
  const outputs = new OriginalOutputs();
  const built = turboOutrunCourses(set);
  const files: string[] = [];
  for (const course of built.courses) files.push(outputs.course(course.id, course.document));
  for (const { image } of built.pictures) outputs.file(image.path, image.bytes);
  // Each stage's sky, baked from its background; course images are saved as their exact compact bytes.
  const { skies } = built;
  for (const { name, document } of skies) {
    const text = JSON.stringify(document);
    outputs.file(`images/${name}.json`, text);
  }
  const degrees = (radians: number) => round1((radians * 180) / Math.PI);
  return {
    outputs,
    report: {
      conversion: TURBO_OUTRUN_CONVERSION_VERSION,
      kmh: built.kmh,
      courses: built.courses.map(({ id, layout, placing, dip }, k) => {
        const { width } = layout;
        const arcs = layout.plan.elements.filter((s) => s.turn !== 0);
        const radius = (s: (typeof arcs)[number]) =>
          ((s.to - s.from) * positionMetres(layout.clock)) / Math.abs(s.turn);
        const tightest = arcs.reduce((a, b) => (radius(b) < radius(a) ? b : a));
        return {
          course: files[k],
          id,
          positions: round3(layout.total - layout.go),
          metres: round1(layout.station(layout.total)),
          sections: layout.pieces.map((p) => p.id),
          stages: layout.course.map(({ stage, run, start, length }) => ({
            name: stage.name,
            length: round3(length),
            gate: round3(run.gate),
            end: round3(run.end),
            endWidth: round1(width.at(start + run.end)),
            turn: degrees(
              layout.plan.elements
                .filter((e) => e.from >= start - 1e-9 && e.to <= start + length + 1e-9)
                .reduce((sum, e) => sum + e.turn, 0),
            ),
          })),
          runs: layout.plan.runs.length,
          elements: layout.line.elements.length,
          ...fidelityReport(layout.plan.fidelity),
          planElements: built.courses[k]!.document.sections.reduce((n, s) => n + s.plan.length, 0),
          tightest: { at: round1(tightest.from), radius: round1(radius(tightest)) },
          ...gradeReport(
            layout.profile,
            layout.screenProfile,
            layout.station(layout.total),
            built.kmh,
            layout.overlaps,
          ),
          overpasses: layout.overpasses.map((c) => overpassReport(c, layout.profile.height)),
          rampRadius: layout.rampRadius === null ? null : Math.round(layout.rampRadius),
          objects: placing,
          dip: Object.fromEntries(Object.entries(dip).map(([key, v]) => [key, round3(v)])),
        };
      }),
      ground: built.beyond,
      reach: built.reach,
      pictures: built.pictures.length,
      skies: skies.length,
    },
  };
};
