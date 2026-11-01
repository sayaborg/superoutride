/**
 * ENDURO RACER's course laid out as a course document ([ENDURO RACER road data](../../../docs/enduro-racer-road-data.md#enduro-racers-course)):
 * its road path P from its five stages' paths laid as straights and arcs, the grades by its screen's pieces and its
 * jumps' mounds, the overpasses kept apart, its Sections cut where its road comes near itself, each written with its
 * lanes, strips, objects, gates and sky.
 */
import { VECTOR_RESOLUTION, WRITTEN_SLACK } from '../shared/shared-constants.js';
import { requireInput } from '../../authoring/authoring-error.js';
import { computedValue } from '../../authoring/course-joints.js';
import { paletteName } from '../shared/pixel-grid.js';
import { halveRgb555 } from '../../../src/image/rgb555.js';
import { bySlope, moundGrades, type Slope } from '../shared/jump-mound.js';
import { bendOf, profileOf, sectionProfile, type Change } from '../shared/road-profile.js';
import { placedChanges, screenPieces } from '../shared/screen-pieces.js';
import { overpassesOf, partedProfile, roadCells } from '../shared/overpasses.js';
import { sectionYawOrigin, SKY_HORIZON } from '../shared/sky-baking.js';
import { colorStretches, type ColorStretch } from '../shared/color-stretches.js';
import { evenly, headingPlan, planFidelity, type PlanElement } from '../shared/heading-plan.js';
import { leastLaneRadius } from '../../../src/course/plan-clearance.js';
import { CoursePath } from '../shared/course-path.js';
import {
  domainCuts,
  micrometre,
  repeated,
  sectionGates,
  sectionStations,
  stripeHalves,
  writtenPlan,
  spriteElement,
  stripElement,
} from '../shared/section-writing.js';
import { type Colors } from '../out-run-hardware/road-tables.js';
import { type Ford } from './enduro-racer-road.js';
import { startGate, type OriginalPlace } from '../shared/grid-rule.js';
import { type CrossSection } from './enduro-racer-cross-section.js';
import { type ObjectSpot } from './enduro-racer-scenery.js';
import { CYCLE, inStage3 } from './enduro-racer-screen.js';
import {
  COURSE_NAME,
  FORD_MATERIAL,
  groundMaterial,
  JUMP,
  RAMP_BANDS,
  stageName,
  rampLight,
  ROAD_MATERIAL,
  COURSE_ID,
} from './enduro-racer-constants.js';
import { chainLinks, courseDocument } from '../shared/course-writing.js';
import {
  type SectionDocument,
  type StripElementDocument,
  type CourseGateDocument,
  type LaneDocument,
  type CoursePosition,
} from '../../../src/course/course-document.js';
/** The road's colors a stretch shows: each feature's band A and band B, and the ground's left and right of P. */
interface RoadColors {
  readonly surface: readonly [number, number];
  readonly narrow: readonly [number, number];
  readonly middle: readonly [number, number];
}
/** A stretch's colors: its stage's (0 from), its ground's and its road's, and whether it lies over a ford. */
interface StretchColors {
  readonly stage: number;
  readonly ground: { readonly left: number; readonly right: number };
  readonly road: RoadColors;
  readonly wet: boolean;
}

/** One Section to write: its id, P's metres it spans, and its stage (0 from; the goal's the last stage's). */
interface SectionSpan {
  readonly id: string;
  readonly from: number;
  readonly to: number;
  readonly stage: number;
}

export const pair = (colors: Colors, k: number) => [colors.rgb555[k]!, colors.rgb555[k + 1]!] as const;

/** A jump's slope, its kind's color. */
interface RampSlope extends Slope {
  readonly color: number;
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
  /** The stripes' bands: the positions a band holds and the band at position 0. */
  readonly stripes: { readonly period: number; readonly first: 0 | 1 };
  /** The reading camera's eye, positions behind the bike, from which the screen's pieces were read. */
  readonly reading: number;
  /** What the screen's pieces must have been solved from: its tables and metres a position (`enduroRacerInputs`). */
  readonly screen: string;
  /** The start's gate, positions: where the start's templates stand. */
  readonly startGate: number;
  /**
   * The original's hit, lateral units: a bike within half of it of an object's x either side, whatever the object's
   * width (`hitWidth`). A body is as wide as that or the object's colored pixels, whichever is narrower.
   */
  readonly hitWidth: number;
  /** The jumps' positions and colors. */
  readonly jumps: readonly { readonly position: number; readonly color: number }[];
  /** The hills' starts, the hills' table's (`readHills`). */
  readonly hills: readonly number[];
  /** The rivals on the grid at GO: their positions and x, metres from P. */
  readonly rivals: readonly { readonly position: number; readonly x: number }[];
  /** The bike's lateral limit, metres either side of P: the ground and the course limits reach it. */
  readonly limit: number;
  /** The checkpoints' and the finish's positions, the fords and where the skies change. */
  readonly checks: readonly number[];
  readonly finish: number;
  readonly water: readonly Ford[];
  readonly skyChanges: readonly number[];
  /** Each stage's colors, and its road positions. */
  readonly stages: readonly {
    readonly road: RoadColors;
    readonly ground: { readonly left: number; readonly right: number };
  }[];
  readonly stagePositions: number;
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

/** What the course's parts are laid from: its inputs, and P's metres at a course position. */
interface Laying {
  readonly inputs: CourseInputs;
  /** P's metres at course position `q`: stage s's position p is s × `stagePositions` + p. */
  readonly along: (q: number) => number;
}

/** P's metres from one to another. */
type Span = readonly [number, number];

/**
 * The course: P laid from the entry (a straight to position 0, then its heading table's plan); its Sections, one a
 * stage and the goal's, each cut where its road comes near itself; their strips, skies, gates and level
 * profile with the overpasses' bumps.
 */
export function layCourse(inputs: CourseInputs) {
  const { metres } = inputs;
  const along = (q: number) => inputs.entry + q * metres;
  const laying: Laying = { inputs, along };
  const last = inputs.stages.length * inputs.stagePositions;
  // The road's lanes, a lane either side of P, keep the least radius the format lets them keep (`leastLaneRadius`).
  const reach = leastLaneRadius(inputs.lane);
  const plan = headingPlan(evenly(inputs.headings), VECTOR_RESOLUTION, metres, () => reach);
  const { path, spans } = laySections(laying, plan.elements, reach);
  const end = path.length;
  const { mounds, slopes, wetSpans } = jumpsAndFords(laying);
  const stretches = colorsAlong(laying, wetSpans, end);
  const { cells, placed, dropped, onRoad } = placeObjects(laying, path, end);
  // The overpasses: passages at least `PASSAGES_APART` apart whose roads, to the edge bands' outer edges, overlap, kept apart on the
  // screen's grades.
  const overpasses = overpassesOf(cells.pairs, metres);
  const grades = screenGrades(laying, end);
  // Each Section's plan as written, and its start: the lengths written before it, so seams agree exactly.
  const written = spans.map((span) => writtenPlan(path, span));
  const origins = written.reduce((o, plan) => [...o, o.at(-1)! + plan.reduce((sum, e) => sum + e.length, 0)], [0]);
  const { parted, profile } = partedProfile(
    [...grades, ...mounds.changes],
    overpasses,
    end,
    origins.slice(1, -1),
    mounds.kinks,
  );
  const documents = sectionDocuments(laying, { path, spans, written, origins, stretches, placed, slopes, profile });
  requireInput(along(last) < end, `/${COURSE_ID}`, 'The goal lies past the course');
  return {
    document: courseDocument(COURSE_NAME, documents, chainLinks(spans, 'a')),
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
    spans,
    profile,
    screenProfile: profileOf(grades.map(bendOf)),
    mounds: {
      runs: mounds.runs,
      joined: mounds.joined,
      longest: mounds.longest,
    },
    // The fords, positions, as the original's and with the ramps taken out.
    water: {
      original: inputs.water.map((w) => [w.from, w.to]),
      laid: wetSpans.map((w) => w.map((s) => (s - inputs.entry) / metres)),
    },
    slopes,
    stationOf: along,
    placed,
    ground: inputs.limit - inputs.lane,
    dropped,
    onRoad,
    overpasses: overpasses.map((overpass, k) => ({ passages: overpass.passages, ...parted.partings[k]! })),
    rampRadius: parted.radius,
  };
}

/**
 * P laid from plan elements `planned` (a straight to position 0, then the plan, straights one after another one), and
 * its Sections: one a stage and the goal's, each cut again where its road comes within `reach` of itself.
 */
function laySections({ inputs, along }: Laying, planned: readonly PlanElement[], reach: number) {
  const { metres, stagePositions } = inputs;
  const count = inputs.stages.length;
  const gateMetres = [inputs.startGate, ...inputs.checks, inputs.finish].map(along);
  const path = new CoursePath([
    { length: inputs.entry, turn: 0 },
    ...planned.map((e) => ({ length: (e.to - e.from) * metres, turn: e.turn })),
  ]);
  const spans: SectionSpan[] = [];
  for (let stage = 0; stage <= count; stage++) {
    const from = stage === 0 ? 0 : along(stagePositions * stage);
    const to = stage === count ? path.length : along(stagePositions * (stage + 1));
    const stem = stage === count ? 'goal' : `stage-${stage + 1}`;
    const cuts = domainCuts(path, from, to, reach, gateMetres, { finish: along(inputs.finish) });
    [from, ...cuts].forEach((a, i) =>
      spans.push({
        id: i === 0 ? stem : `${stem}-${i + 1}`,
        from: a,
        to: cuts[i] ?? to,
        stage: Math.min(stage, count - 1),
      }),
    );
  }
  return { path, spans };
}

/**
 * The jumps' mounds and their slopes, each in its kind's color; and the fords, stations, but where a jump's ramp
 * stands, its slopes from its face's root to its back's end: no ramp lies over the water (K, 2026-10-27).
 */
function jumpsAndFords({ inputs, along }: Laying) {
  const mounds = moundGrades(inputs.jumps.map((jump) => ({ top: along(jump.position), ...JUMP })));
  const slopes = mounds.slopes.map((slope) => ({ ...slope, color: inputs.jumps[slope.mound]!.color }));
  const ramps = mounds.slopes.map(({ from, to }): Span => [from, to]);
  const outside = (spans: readonly Span[], [a, b]: Span) =>
    spans.flatMap(([c, d]): Span[] =>
      b <= c || a >= d ? [[c, d]] : [...(a > c ? [[c, a] as Span] : []), ...(b < d ? [[b, d] as Span] : [])],
    );
  const wetSpans = inputs.water.flatMap((w) => ramps.reduce(outside, [[along(w.from), along(w.to)]]));
  return { mounds, slopes, wetSpans };
}

/**
 * The colors along the road to `end`: each stage's from where its sky comes in, so they change at once with it, the
 * road's in the ground's colors over the fords `wetSpans`.
 */
function colorsAlong({ inputs, along }: Laying, wetSpans: readonly Span[], end: number) {
  const stretches: ColorStretch<StretchColors>[] = [];
  const stages = inputs.stages.map(({ road, ground }, stage) => ({ stage, ground, road, wet: false }));
  for (const { from, to, colors } of colorStretches(
    stages,
    inputs.skyChanges.map((q) => ({ at: along(q), length: 0 })),
    0,
    end,
  )) {
    const left = colors.ground.left;
    const water = { surface: [left, left], narrow: [left, left], middle: [left, left] } as const;
    let at = from;
    for (const [a, b] of wetSpans.filter(([a, b]) => a < to && b > from)) {
      stretches.push({ from: at, to: a, colors, before: null });
      stretches.push({ from: a, to: b, colors: { ...colors, road: water, wet: true }, before: null });
      at = b;
    }
    stretches.push({ from: at, to, colors, before: null });
  }
  return stretches;
}

/**
 * The road's cells along `path` to `end`, and the objects: each at its position's station, its x right of P, but none
 * whose base point or body stands on another passage's road (to its edge bands' outer edges), which the original never
 * shows together.
 */
function placeObjects({ inputs, along }: Laying, path: CoursePath, end: number) {
  const { unit } = inputs;
  const edges = inputs.cross.edges * unit;
  const cells = roadCells(path, { from: 0, to: end, step: inputs.metres, sides: () => [edges, edges] });
  const placed: Placed[] = [];
  const dropped: { position: number; x: number; what: string }[] = [];
  const onRoad: { position: number; x: number; what: string }[] = [];
  for (const spot of inputs.spots) {
    const u = along(spot.position),
      fromP = spot.x * unit;
    const body = spot.hit ? Math.min(inputs.hitWidth * unit, inputs.colored(spot.image)) : null;
    if (cells.onOtherPassage(u, fromP, (body ?? 0) / 2)) {
      dropped.push({ position: spot.position, x: spot.x, what: spot.what });
      continue;
    }
    if (spot.hit && spot.onRoad) onRoad.push({ position: spot.position, x: spot.x, what: spot.what });
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
  return { cells, placed, dropped, onRoad };
}

/**
 * The grades by the screen's pieces to `end`: from position 0 cycle by cycle to the stages' end, stage 3 level (its own
 * words, the level road's, `readEnduroRacerScreen`), each hill's stretch, from the last cycle start at or before its
 * start, its piece and every other cycle the normal path's, each from the reading camera's place when the road position
 * is its first; level beyond.
 */
function screenGrades({ inputs, along }: Laying, end: number) {
  const { stagePositions } = inputs;
  const last = inputs.stages.length * stagePositions;
  const screen = screenPieces('enduro-racer');
  // Each piece holds for what it was solved from alone: these ROMs' screen and metres a position.
  const pieceOf = (name: string) => {
    const piece = screen.piece(name);
    requireInput(piece, '/tools/road-data/shared/screen-pieces.json', `ENDURO RACER's ${name} has no piece`);
    requireInput(
      piece.inputs === inputs.screen,
      '/tools/road-data/shared/screen-pieces.json',
      `ENDURO RACER's ${name} was solved from other inputs than these ROMs': solve it again (screen-pieces)`,
    );
    return piece;
  };
  const cycle = pieceOf('cycle');
  const hills = inputs.hills.map((_, k) => pieceOf(`hill ${k + 1}`));
  requireInput(
    screen.piece(`hill ${inputs.hills.length + 1}`) === undefined,
    `/${COURSE_ID}`,
    "The pieces' hills are not the ROMs'",
  );
  const hillAt = new Map(inputs.hills.map((start, k) => [Math.floor(start / CYCLE) * CYCLE, k]));
  const grades: Change[] = [];
  for (let c = 0; c < last;) {
    const k = hillAt.get(c);
    const piece = k === undefined ? cycle : hills[k]!;
    const cycles = piece.cycles ?? 1;
    const level = inStage3(c, stagePositions);
    requireInput(
      [...hillAt.keys()].every((h) => h === c || h < c || h >= c + cycles * CYCLE),
      `/${COURSE_ID}`,
      `A hill's stretch from ${c} shares a cycle with another's`,
    );
    if (!level) grades.push(...placedChanges(piece, along(c + inputs.go - inputs.reading), end));
    c += cycles * CYCLE;
  }
  return grades;
}

/**
 * Each Section's document: its span's plan as written from its origin, its objects, and the course's colors, gates,
 * slopes, skies and profile.
 */
function sectionDocuments(
  { inputs, along }: Laying,
  laid: {
    readonly path: CoursePath;
    readonly spans: readonly SectionSpan[];
    readonly written: readonly SectionDocument['plan'][];
    readonly origins: readonly number[];
    readonly stretches: readonly ColorStretch<StretchColors>[];
    readonly placed: readonly Placed[];
    readonly slopes: readonly RampSlope[];
    readonly profile: ReturnType<typeof profileOf>;
  },
): SectionDocument[] {
  const { path, spans, origins } = laid;
  // The stripes' bands: the first band from position 0, each a band's period, a stripe's two of them from the entry.
  const stripe = { period: 2 * inputs.stripes.period * inputs.metres, zero: inputs.entry, first: inputs.stripes.first };
  const startHeading = path.pose(0).heading;
  return spans.map((span, i) =>
    sectionDocument(span, {
      inputs,
      path,
      stripe,
      elements: laid.written[i]!,
      origin: origins[i]!,
      first: i === 0,
      last: i === spans.length - 1,
      stretches: laid.stretches,
      limit: inputs.limit,
      objects: laid.placed.filter((o) => o.s >= origins[i]! && o.s < origins[i + 1]!),
      checkpoints: inputs.checks.map((q, k) => ({ id: `${COURSE_ID}-CP${k + 1}`, s: along(q) })),
      finish: { id: `${COURSE_ID}-GOAL`, s: along(inputs.finish) },
      grid: along(inputs.go),
      rivals: inputs.rivals.map((rival) => ({
        ahead: along(rival.position) - along(inputs.go),
        right: rival.x,
      })),
      lane: inputs.lane,
      slopes: laid.slopes,
      profile: laid.profile,
      skyChanges: inputs.skyChanges.map((q) => along(q)),
      startHeading,
    }),
  );
}

/** What one Section's document is written from. */
interface SectionContext {
  readonly inputs: CourseInputs;
  readonly path: CoursePath;
  readonly stripe: { readonly period: number; readonly zero: number; readonly first: 0 | 1 };
  readonly elements: SectionDocument['plan'];
  readonly origin: number;
  readonly first: boolean;
  readonly last: boolean;
  readonly stretches: readonly ColorStretch<StretchColors>[];
  /** The bike's lateral limit, metres either side of P. */
  readonly limit: number;
  readonly objects: readonly Placed[];
  readonly checkpoints: readonly { readonly id: string; readonly s: number }[];
  readonly finish: { readonly id: string; readonly s: number };
  readonly grid: number;
  readonly rivals: readonly OriginalPlace[];
  readonly lane: number;
  /** The jumps' slopes, stations, in their kinds' colors. */
  readonly slopes: readonly RampSlope[];
  readonly profile: ReturnType<typeof profileOf>;
  readonly skyChanges: readonly number[];
  readonly startHeading: number;
}

/** A Section's stations as written (`sectionStations`). */
type Stations = ReturnType<typeof sectionStations>;
/** A course station's position in a Section. */
type At = (s: number) => CoursePosition;

/** One Section's document. */
function sectionDocument(span: SectionSpan, context: SectionContext): SectionDocument {
  const { inputs, elements, origin } = context;
  // The Section's length is its elements' as written, and every station lies within it.
  const stations = sectionStations(elements);
  const { size, joint } = stations;
  const at = (s: number) => stations.at(s - origin);
  const lanes = sectionLanes(inputs.lane);
  const strips = sectionStrips(context, at, stations);
  const gates = sectionGateDocuments(context, at, stations);
  const environments = sectionSkies(span, context, at, size);
  return {
    id: span.id,
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
    sprites: sectionSprites(context.objects, at),
    environments,
    gates,
  };
}

/** A Section's lanes: a and b, `lane` wide each, either side of P; the centre lane a. */
const sectionLanes = (lane: number): LaneDocument[] => [
  { kind: 'lane', id: 'a', width: lane },
  { kind: 'lane', id: 'b', width: lane },
];

/** A Section's strips over its stretches of the colors along the road: its ground's, then its road's. */
function sectionStrips(
  context: Pick<SectionContext, 'inputs' | 'origin' | 'stripe' | 'stretches' | 'slopes'>,
  at: At,
  stations: Stations,
): StripElementDocument[] {
  const { inputs, origin } = context;
  const { unit, cross } = inputs;
  const pen = stripPen(at, context.stripe);
  const own = context.stretches
    .map((t) => ({ ...t, from: Math.max(t.from, origin), to: Math.min(t.to, origin + stations.size) }))
    .filter((t) => stations.apart(t.from - origin, t.to - origin));
  const widths = {
    surface: cross.surface * unit,
    inner: cross.inner * unit,
    middle: cross.middle * unit,
    edges: cross.edges * unit,
  };
  return [
    ...groundStrips(own, pen),
    ...roadSurfaceStrips(own, pen, widths.edges, context.slopes),
    ...roadBandStrips(own, pen, widths, context.slopes),
  ];
}

type Edge = number | Lateral | null;

/**
 * A Section's strip writer at the positions `at` gives: `strip`, a strip over course stations `[a, b]`; `banded`, band
 * `band`'s stretches of one in `color` in the stripes' bands `stripe`.
 */
function stripPen(at: At, stripe: SectionContext['stripe']) {
  const strip = (a: number, b: number, left: Edge, right: Edge, color: number | null, material: string | null) =>
    stripElement(at(a), at(b), left, right, color, material);
  const banded = (band: 0 | 1, a: number, b: number, left: Edge, right: Edge, color: number) =>
    stripeHalves(((stripe.first + band) % 2) as 0 | 1, stripe.period, stripe.zero, a, b, (from, to) =>
      strip(from, to, left, right, color, null),
    );
  return { strip, banded };
}
type StripPen = ReturnType<typeof stripPen>;

/**
 * The ground over stretches `own`: its right color everywhere and its left one left of P, its material out to the
 * boundaries.
 */
function groundStrips(own: readonly ColorStretch<StretchColors>[], { strip }: StripPen): StripElementDocument[] {
  const strips: StripElementDocument[] = [];
  for (const t of own) {
    const { ground } = t.colors;
    strips.push(strip(t.from, t.to, null, null, ground.right, null));
    if (ground.left !== ground.right) strips.push(strip(t.from, t.to, null, lateral(0), ground.left, null));
    const material = { left: groundMaterial(ground.left), right: groundMaterial(ground.right) };
    strips.push(strip(t.from, t.to, boundary('outer-left'), boundary('outer-right'), null, material.right));
    if (material.left !== material.right)
      strips.push(strip(t.from, t.to, boundary('outer-left'), lateral(0), null, material.left));
  }
  return strips;
}

/**
 * The road's surface over stretches `own`, `edges` either side of P: in band B, band A over it; but on a jump's slope
 * the road's whole width is the ramp's (`RAMP_BANDS`): its kind's color, every other band from the middle one, on P,
 * light (`rampLight`), at half brightness where it faces away; the road's stripes cut where it ends.
 */
function roadSurfaceStrips(
  own: readonly ColorStretch<StretchColors>[],
  { strip, banded }: StripPen,
  edges: number,
  slopes: readonly RampSlope[],
): StripElementDocument[] {
  const strips: StripElementDocument[] = [];
  const material = (t: ColorStretch<StretchColors>) => (t.colors.wet ? FORD_MATERIAL : ROAD_MATERIAL);
  const bandWidth = (2 * edges) / RAMP_BANDS;
  for (const t of own)
    for (const { from, to, slope } of bySlope(t.from, t.to, slopes)) {
      if (!slope) {
        const [a, b] = t.colors.road.surface;
        strips.push(strip(from, to, lateral(-edges), lateral(edges), b, material(t)));
        if (a !== b) strips.push(...banded(0, from, to, lateral(-edges), lateral(edges), a));
        continue;
      }
      const shade = (c: number) => (slope.facing === 'away' ? halveRgb555(c) : c);
      strips.push(strip(from, to, lateral(-edges), lateral(edges), shade(slope.color), material(t)));
      for (let k = 1; k < RAMP_BANDS; k += 2)
        strips.push(
          strip(
            from,
            to,
            lateral(-edges + k * bandWidth),
            lateral(-edges + (k + 1) * bandWidth),
            shade(rampLight(slope.color)),
            null,
          ),
        );
    }
  return strips;
}

/**
 * The road's edge bands over stretches `own`, off the jumps' slopes: their narrow and middle bands over the surface,
 * each band where its color is not the surface's.
 */
function roadBandStrips(
  own: readonly ColorStretch<StretchColors>[],
  { banded }: StripPen,
  widths: { readonly surface: number; readonly inner: number; readonly middle: number; readonly edges: number },
  slopes: readonly RampSlope[],
): StripElementDocument[] {
  const { surface, inner, middle, edges } = widths;
  const strips: StripElementDocument[] = [];
  const features = [
    ...[
      [-edges, -middle],
      [-inner, -surface],
      [surface, inner],
      [middle, edges],
    ].map(([l, r]) => ({ left: l!, right: r!, colors: (t: ColorStretch<StretchColors>) => t.colors.road.narrow })),
    ...[
      [-middle, -inner],
      [inner, middle],
    ].map(([l, r]) => ({ left: l!, right: r!, colors: (t: ColorStretch<StretchColors>) => t.colors.road.middle })),
  ];
  for (const f of features)
    for (const t of own)
      for (const { from, to, slope } of bySlope(t.from, t.to, slopes)) {
        const colors = f.colors(t),
          under = t.colors.road.surface;
        if (!slope)
          for (const band of [0, 1] as const)
            if (colors[band] !== under[band])
              strips.push(...banded(band, from, to, lateral(f.left), lateral(f.right), colors[band]));
      }
  return strips;
}

/**
 * A Section's gates: in the first, the start's, the player's slot at GO on P, where the original's bike stands, the
 * bike's lateral limit either side, and the bikes' grid with the original's rivals abreast; then its checkpoints and
 * finish.
 */
function sectionGateDocuments(
  context: Pick<SectionContext, 'origin' | 'first' | 'grid' | 'rivals' | 'lane' | 'limit' | 'checkpoints' | 'finish'>,
  at: At,
  stations: Stations,
): CourseGateDocument[] {
  const gates: CourseGateDocument[] = [];
  if (context.first) {
    const player = { s: context.grid, lateral: 0 };
    gates.push(
      startGate(at, {
        player,
        originals: { car: [], bike: context.rivals },
        lanes: ['a', 'b'],
        laneWidth: context.lane,
        limits: [context.limit, context.limit],
      }),
    );
  }
  gates.push(...sectionGates(stations, context.origin, context.checkpoints, context.finish));
  return gates;
}

/**
 * A Section's skies over its `size` metres: the one in force at the span's start, then each change inside it, 6 m before
 * the bike reaches its position; each facing as the original's stage start heading does.
 */
function sectionSkies(
  span: SectionSpan,
  context: Pick<SectionContext, 'inputs' | 'path' | 'origin' | 'skyChanges' | 'startHeading'>,
  at: At,
  size: number,
) {
  const { origin } = context;
  const skyAt = (s: number) => context.skyChanges.filter((c) => c <= s + WRITTEN_SLACK).length;
  const turned = ((context.path.pose(span.from).heading - context.startHeading) * 180) / Math.PI;
  const yawOrigin = sectionYawOrigin(context.inputs.yawOrigin, turned);
  const environment = (s: number) => ({
    at: at(s),
    name: stageName(skyAt(s)),
    background: { image: skyName(skyAt(s)), horizonY: SKY_HORIZON, yawOrigin: micrometre(yawOrigin) },
    transition: 0,
  });
  return [
    environment(origin),
    ...context.skyChanges
      .filter((c) => c > origin + WRITTEN_SLACK && c < origin + size - WRITTEN_SLACK)
      .map(environment),
  ];
}

/** A Section's objects `objects` as sprites, in station order and then lateral order. */
const sectionSprites = (objects: readonly Placed[], at: At) =>
  repeated(
    [...objects]
      .sort((a, b) => a.s - b.s || a.lateral - b.lateral)
      .map((o) =>
        spriteElement({
          image: o.image,
          palette: paletteName(o.palette),
          at: at(o.s),
          lateral: o.lateral,
          groundOffset: o.groundOffset,
          body: o.body,
        }),
      ),
  );

/** A lateral from P, metres, as written. */
const lateral = (fromP: number) => micrometre(fromP);

type Lateral = { readonly boundary: string; readonly offset: number };
const boundary = (id: string): Lateral => ({ boundary: id, offset: 0 });

/** Stage s's sky (0 from), baked from its background, and its environment's name. */
export const skyName = (stage: number) => `enduror-${stage + 1}-sky`;
