/**
 * A SUPER HANG-ON course as a course document ([SUPER HANG-ON road data](../../../docs/super-hang-on-road-data.md)):
 * its road path P, its sections' and its goal's headings as one table, laid from the entry as the plan, the road on it
 * level but for the overpasses' bumps, its colors and stripes, its scenery, gates, the goal's crowd and the ending's
 * figures.
 */
import type { PictureUse } from './super-hang-on-boards.js';
import { WRITTEN_SLACK, VECTOR_RESOLUTION } from '../shared/shared-constants.js';
import { contractUnmet } from '../shared/conversion-errors.js';
import { computedValue } from '../../authoring/course-joints.js';
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
import { startGate, type OriginalPlace } from '../shared/grid-rule.js';
import { profileOf, sectionProfile } from '../shared/road-profile.js';
import { sectionYawOrigin, SKY_HORIZON } from '../shared/sky-baking.js';
import { CoursePath } from '../shared/course-path.js';
import { overpassesOf, partedProfile, roadCells } from '../shared/overpasses.js';
import type { drawScales, GateBringOut, GatePart, readGateBringOuts } from './super-hang-on-sprites.js';
import type { CrossSection } from './super-hang-on-cross-section.js';
import { evenly, headingPlan, planFidelity, type PlanElement } from '../shared/heading-plan.js';
import { riseProfile } from '../shared/rise-profile.js';
import { leastLaneRadius } from '../../../src/course/plan-clearance.js';
import type { ColorPair, SceneryItem, Section, StripeRate, stripeRates } from './super-hang-on-road.js';
import type { ScenerySpot } from './super-hang-on-scenery.js';
import { type EndingFigure, ROAD_MATERIAL, GROUND_MATERIAL } from './super-hang-on-constants.js';
import { colorStretches, stretchColor, type ColorStretch } from '../shared/color-stretches.js';
import { PIXEL_ASPECT } from '../sega-16/display.js';
import { chainLinks, courseDocument } from '../shared/course-writing.js';
import {
  type SectionDocument,
  type StripElementDocument,
  type CourseGateDocument,
  type LaneDocument,
} from '../../../src/course/course-document.js';

/** A picture's use, named with every other use's (`pictureNames`), its palette's name, and its colored columns' width. */
export interface PictureNames {
  readonly use: PictureUse;
  readonly palette: string;
  /** Its colored columns' (`coloredColumns`) width, metres. */
  readonly colored: number;
}

/** What a course is made from beside its sections. */
export interface SuperHangOnCourseInputs {
  readonly id: string;
  /** The course's name and its Sections' and gates' ids' stem. */
  readonly name: string;
  readonly slug: string;
  /**
   * Its sections in the order it runs them, and its heading table: their road paths' headings one after another, then
   * the goal's (radians counterclockwise).
   */
  readonly sections: readonly Section[];
  readonly headings: readonly number[];
  /** Its grade table, a grade at each course position, as its height tables give them, and the table's resolution. */
  readonly grades: readonly number[];
  readonly gradeResolution: number;
  /**
   * A road position, metres; a section's positions; where a CHECK gate comes out inside a section; where the next
   * section's background, ground and road come in.
   */
  readonly metres: number;
  readonly length: number;
  readonly middle: number;
  readonly transition: number;
  /** Metres from `transition` over which the next section's sky, road and ground replace the section's. */
  readonly change: number;
  /** The stripes' period, positions, and each color's stripes in it (`stripeRates`). */
  readonly stripe: number;
  readonly stripes: ReturnType<typeof stripeRates>;
  /** Positions from a gate's coming out to its passing the bike; from GO to the start gate's passing. */
  readonly gatePass: number;
  readonly startGate: number;
  /** How the program draws an object and a gate part across and up, road units (`drawScales`). */
  readonly scales: ReturnType<typeof drawScales>;
  readonly cross: CrossSection;
  readonly scenery: readonly ScenerySpot[];
  /** The goal's crowd and where it stands; the ending's figures and where they stand, goal positions. */
  readonly crowd: readonly SceneryItem[];
  readonly crowdAt: number;
  readonly ending: readonly EndingFigure[];
  readonly endingAt: number;
  readonly gates: readonly GatePart[];
  /** How each gate comes out, and its signal lit (`readGateBringOuts`). */
  readonly bringOuts: ReturnType<typeof readGateBringOuts>;
  /** A picture's names, shown by a use lifted `lift` road units (0 on the ground). */
  readonly picture: (list: number, mirrored: boolean, palette: number, lift?: number) => PictureNames;
  readonly spriteList: (sprite: number) => number;
  readonly hitWidth: (sprite: number) => number;
  /** Each section's sky image, by its place in the course (0 from). */
  readonly sky: (order: number) => string;
  /**
   * Where the skies face: the yaw origin, degrees, of a Section whose start faces the original's heading 0, the heading
   * every section starts and ends with; another Section's is it plus the road's turn there from that heading.
   */
  readonly yawOrigin: number;
  /** The camera's distance behind the player: GO lies this far into the entry. */
  readonly cameraDistance: number;
  /** A lane's width, metres: `LANE`. */
  readonly lane: number;
  /** The rivals the original places at GO: their positions ahead of the bike and x, metres right of P. */
  readonly rivals: readonly { readonly position: number; readonly x: number }[];
}

/** A stretch's colors: its ground's pair and its road's. */
interface StretchColors {
  readonly ground: readonly [number, number];
  readonly road: Section['colors'];
}

/** One Section to write: its ids, P's metres it spans, and its sky's order and the sections it shows. */
interface Piece {
  readonly id: string;
  readonly from: number;
  readonly to: number;
  /** Its section's place in the course (0 from); the goal's is the sections' count. */
  readonly order: number;
}

/** A sprite to place: its station, lateral and picture, its height and body. */
interface Placed {
  readonly s: number;
  readonly lateral: number;
  readonly picture: PictureNames;
  readonly groundOffset: number;
  readonly body: number | null;
}

/**
 * The course: P laid from the entry (a straight of `cameraDistance` before GO, then its heading table's plan); its
 * Sections, one a section and one the goal's, each cut where its road comes near itself; their objects,
 * gates, skies, strips and level profile with the overpasses' bumps.
 */
export function superHangOnCourse(inputs: SuperHangOnCourseInputs) {
  const { metres, length, sections } = inputs;
  const count = sections.length;
  const unit = inputs.lane / inputs.cross.linesIn;
  const entry = inputs.cameraDistance;
  // The road's lanes, a lane either side of P, keep the least radius the format lets them keep (`leastLaneRadius`).
  const reach = leastLaneRadius(inputs.lane);
  /** P's metres at course position `q`: section k's position p is `length × k + p`, the goal's after the last. */
  const along = (q: number) => entry + q * metres;

  // The gates and the finish, by course position, and their metres along P, which the Sections' cuts keep clear of.
  const checks = Array.from({ length: count }, (_, k) => [
    ...(k > 0 ? [length * k + inputs.gatePass] : []),
    length * k + inputs.middle + inputs.gatePass,
  ]).flat();
  const finish = length * count + inputs.gatePass;
  const gateMetres = [inputs.startGate, ...checks, finish].map(along);

  /**
   * P laid from plan elements `planned` (the entry, then the plan, straights one after another one), and its Sections:
   * one a section and the goal's, each cut again where its road comes near itself.
   */
  const lay = (planned: readonly PlanElement[]) => {
    const path = new CoursePath([
      { length: entry, turn: 0 },
      ...planned.map((e) => ({ length: (e.to - e.from) * metres, turn: e.turn })),
    ]);
    const pieces: Piece[] = [];
    for (let order = 0; order <= count; order++) {
      const from = order === 0 ? 0 : along(length * order);
      const to = order === count ? path.length : along(length * (order + 1));
      const stem = `${inputs.slug}-${order === count ? 'goal' : order + 1}`;
      const cuts = domainCuts(path, from, to, reach, gateMetres, { finish: along(finish) });
      [from, ...cuts].forEach((a, i) =>
        pieces.push({ id: i === 0 ? stem : `${stem}-${i + 1}`, from: a, to: cuts[i] ?? to, order }),
      );
    }
    return { path, pieces };
  };
  const plan = headingPlan(evenly(inputs.headings), VECTOR_RESOLUTION, metres, () => reach);
  const { path, pieces } = lay(plan.elements);
  const stationOf = along;
  const end = path.length;

  // The colors along the road: each section's from where its sky comes in, mixed from the section before over the change.
  const skyChanges = sections.slice(0, -1).map((_, k) => stationOf(length * k + inputs.transition));
  const stretches = colorStretches(
    sections.map((section) => ({ ground: section.colors.ground.rgb555, road: section.colors })),
    skyChanges.map((at) => ({ at, length: inputs.change })),
    0,
    end,
  );

  // The objects: the scenery, the gates' parts, the goal's crowd and the ending's figures.
  const placed: Placed[] = [];
  const across = (x: number) => x * unit;
  for (const spot of inputs.scenery) {
    const { item } = spot;
    const picture = inputs.picture(inputs.spriteList(item.sprite), item.mirrored, item.palette);
    placed.push({
      s: stationOf(length * spot.section + spot.position),
      lateral: across(item.x),
      picture,
      groundOffset: 0,
      body: Math.min(2 * inputs.hitWidth(item.sprite) * inputs.scales.pixelUnits * unit, picture.colored),
    });
  }
  const { bringOuts } = inputs;
  const gate = (q: number, { parts, banner, palette: shown }: GateBringOut) => {
    for (const k of parts) {
      const part = inputs.gates[k]!;
      const palette = k === banner ? shown : k === bringOuts.signal ? part.palette + bringOuts.lit : part.palette;
      const lift = part.lift * inputs.scales.gateLift;
      const groundOffset = lift * unit * PIXEL_ASPECT;
      placed.push({
        s: stationOf(q),
        lateral: across(part.x * inputs.scales.pixelUnits),
        picture: inputs.picture(part.sprite, part.mirrored, palette, lift),
        groundOffset,
        body: null,
      });
    }
  };
  gate(inputs.startGate, bringOuts.start);
  for (const q of checks) gate(q, bringOuts.check);
  gate(finish, bringOuts.goal);
  for (const item of inputs.crowd)
    placed.push({
      s: stationOf(length * count + inputs.crowdAt),
      lateral: across(item.x),
      picture: inputs.picture(inputs.spriteList(item.sprite), item.mirrored, item.palette),
      groundOffset: 0,
      body: null,
    });
  for (const figure of inputs.ending)
    placed.push({
      s: stationOf(length * count + inputs.endingAt),
      lateral: across(figure.x),
      picture: inputs.picture(figure.list, false, figure.palette, figure.height),
      groundOffset: figure.height * unit * PIXEL_ASPECT,
      body: null,
    });
  if (placed.some((o) => o.s >= end)) throw contractUnmet("An object stands past the course's end");

  // The overpasses: passages at least `PASSAGES_APART` apart whose roads, to the edge bands' outer edges, overlap, kept
  // apart on the level road.
  const half = inputs.cross.edgesOut * unit;
  const { pairs } = roadCells(path, { from: 0, to: end, step: metres, sides: () => [half, half] });
  const overpasses = overpassesOf(pairs, metres);
  // The hills, by the profile from their rise table, and the overpasses parted on them.
  const hills = riseProfile(evenly(inputs.grades), inputs.gradeResolution, along);
  // Each Section's plan as written, and its start: the lengths written before it, so seams agree exactly.
  const plans = pieces.map((piece) => writtenPlan(path, piece));
  const origins = plans.reduce((o, plan) => [...o, o.at(-1)! + plan.reduce((sum, e) => sum + e.length, 0)], [0]);
  const { parted, profile } = partedProfile(hills.changes, overpasses, end, origins.slice(1, -1));

  // The Sections, SAND reaching `ground` beyond the lanes.
  const startHeading = path.pose(0).heading;
  const write = (ground: number, image: (use: PictureUse) => string) =>
    courseDocument(
      inputs.name,
      pieces.map((piece, i) =>
        sectionDocument(piece, {
          inputs,
          path,
          unit,
          elements: plans[i]!,
          origin: origins[i]!,
          first: i === 0,
          last: i === pieces.length - 1,
          stretches,
          ground,
          image,
          objects: placed.filter((o) => o.s >= origins[i]! && o.s < origins[i + 1]!),
          checkpoints: checks.map((q, k) => ({ id: `${inputs.slug}-CP${k + 1}`, s: stationOf(q) })),
          finish: { id: `${inputs.slug}-GOAL`, s: stationOf(finish) },
          grid: stationOf(0),
          rivals: inputs.rivals.map((rival) => ({ ahead: stationOf(rival.position) - stationOf(0), right: rival.x })),
          profile,
          skyChanges,
          startHeading,
        }),
      ),
      chainLinks(pieces, 'a'),
    );
  return {
    /**
     * The course's document, SAND reaching `ground` beyond the lanes, to the bike's lateral limit, each picture by its
     * image name.
     */
    write,
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
    pieces,
    profile,
    hills: { runs: hills.runs, departure: hills.departure },
    pairs,
    overpasses: overpasses.map((overpass, k) => ({ passages: overpass.passages, ...parted.partings[k]! })),
    rampRadius: parted.radius,
    objects: placed.length,
  };
}

/** One Section's document. */
function sectionDocument(
  piece: Piece,
  context: {
    readonly inputs: SuperHangOnCourseInputs;
    readonly path: CoursePath;
    readonly unit: number;
    readonly elements: SectionDocument['plan'];
    readonly origin: number;
    readonly first: boolean;
    readonly last: boolean;
    readonly stretches: readonly ColorStretch<StretchColors>[];
    readonly ground: number;
    readonly image: (use: PictureUse) => string;
    readonly objects: readonly Placed[];
    readonly checkpoints: readonly { readonly id: string; readonly s: number }[];
    readonly finish: { readonly id: string; readonly s: number };
    readonly grid: number;
    readonly rivals: readonly OriginalPlace[];
    readonly profile: ReturnType<typeof profileOf>;
    readonly skyChanges: readonly number[];
    readonly startHeading: number;
  },
): SectionDocument {
  const { inputs, path, unit, elements, origin } = context;
  // The Section's length is its elements' as written, and every station lies within it.
  const stations = sectionStations(elements);
  const { size, joint } = stations;
  const at = (s: number) => stations.at(s - origin);

  // The lanes: a and b, a lane each either side of P; the centre lane a, its centre half a lane left of P.
  const lanes: LaneDocument[] = [
    { kind: 'lane', id: 'a', width: inputs.lane },
    { kind: 'lane', id: 'b', width: inputs.lane },
  ];
  const lateral = (fromP: number) => micrometre(fromP);
  const xs = inputs.cross;
  const asphalt = xs.edgesOut * unit;

  // The strips: the ground, the sand to the ground's width beyond the lanes, the road's surface, lines, edge bands and
  // centre line, each in its two colors by halves of its period counted from GO, at phase 0 (the original's phase at GO
  // is whatever its runs since power-on left: the conversion's choice).
  const period = inputs.stripe * inputs.metres;
  const go = inputs.cameraDistance;
  const strips: StripElementDocument[] = [];
  type Edge = number | Lateral | null;
  type StripColor = ReturnType<typeof stretchColor>;
  const strip = (a: number, b: number, left: Edge, right: Edge, color: StripColor | null, material: string | null) =>
    stripElement(at(a), at(b), left, right, color, material);
  /** Color `h`'s half of each of `stripe`'s periods from GO over stations `[a, b]` in `color`. */
  const halves = (h: 0 | 1, stripe: StripeRate, a: number, b: number, left: Edge, right: Edge, color: StripColor) =>
    stripeHalves((h ^ stripe.first) as 0 | 1, period * stripe.share, go, a, b, (from, to) =>
      strip(from, to, left, right, color, null),
    );
  const two = (pair: ColorPair | readonly [number, number]) =>
    ('rgb555' in pair ? pair.rgb555 : pair) as readonly [number, number];
  const own = context.stretches
    .map((t) => ({ ...t, from: Math.max(t.from, origin), to: Math.min(t.to, origin + size) }))
    .filter((t) => stations.apart(t.from - origin, t.to - origin));
  /** A stretch's sections' colors: its own and, within a change, the one it mixes from. */
  const shown = (t: ColorStretch<StretchColors>) => [t.colors, t.before ?? t.colors];
  /** Over a stretch, colors `pick` over the half `h` of each period where they differ from the half beneath, `under`. */
  const differ = (
    t: ColorStretch<StretchColors>,
    pick: (c: StretchColors) => readonly [number, number],
    under: (c: StretchColors) => readonly [number, number],
    h: 0 | 1,
  ) => shown(t).some((c) => pick(c)[h] !== under(c)[h]);
  // The ground everywhere, then the sand's material between the boundaries.
  const ground = (c: StretchColors) => two(c.ground);
  const whole = (pick: (c: StretchColors) => readonly [number, number]) => (c: StretchColors) =>
    [pick(c)[1], pick(c)[1]] as const;
  for (const t of own) {
    strips.push(
      strip(
        t.from,
        t.to,
        null,
        null,
        stretchColor(t, (c) => ground(c)[1]),
        null,
      ),
    );
    if (differ(t, ground, whole(ground), 0))
      strips.push(
        ...halves(
          0,
          inputs.stripes.ground,
          t.from,
          t.to,
          null,
          null,
          stretchColor(t, (c) => ground(c)[0]),
        ),
      );
  }
  strips.push(strip(origin, origin + size, boundary('outer-left'), boundary('outer-right'), null, GROUND_MATERIAL));
  // The road: its surface to the edge bands' outer edges, then lines, edge bands and centre line over it.
  const features: {
    left: number;
    right: number;
    colors: (c: StretchColors) => readonly [number, number];
    stripe: StripeRate;
  }[] = [
    ...[-1, 1].map((side) => ({
      left: lateral(side < 0 ? -xs.linesOut * unit : xs.linesIn * unit),
      right: lateral(side < 0 ? -xs.linesIn * unit : xs.linesOut * unit),
      colors: (c: StretchColors) => two(c.road.lines),
      stripe: inputs.stripes.lines,
    })),
    ...[-1, 1].map((side) => ({
      left: lateral(side < 0 ? -asphalt : xs.edgesIn * unit),
      right: lateral(side < 0 ? -xs.edgesIn * unit : asphalt),
      colors: (c: StretchColors) => two(c.road.edges),
      stripe: inputs.stripes.edges,
    })),
    {
      left: lateral(-xs.centre * unit),
      right: lateral(xs.centre * unit),
      colors: (c: StretchColors) => two(c.road.centreLine),
      stripe: inputs.stripes.centreLine,
    },
  ];
  const surface = (c: StretchColors) => two(c.road.surface);
  for (const t of own) {
    const [left, right] = [lateral(-asphalt), lateral(asphalt)];
    strips.push(
      strip(
        t.from,
        t.to,
        left,
        right,
        stretchColor(t, (c) => surface(c)[1]),
        ROAD_MATERIAL,
      ),
    );
    if (differ(t, surface, whole(surface), 0))
      strips.push(
        ...halves(
          0,
          inputs.stripes.surface,
          t.from,
          t.to,
          left,
          right,
          stretchColor(t, (c) => surface(c)[0]),
        ),
      );
  }
  for (const f of features)
    for (const t of own)
      for (const h of [0, 1] as const)
        if (differ(t, f.colors, surface, h))
          strips.push(
            ...halves(
              h,
              f.stripe,
              t.from,
              t.to,
              f.left,
              f.right,
              stretchColor(t, (c) => f.colors(c)[h]),
            ),
          );

  // The gates.
  const gates: CourseGateDocument[] = [];
  // The player's slot at GO on P, where the original's bike stands, the bike's lateral limit (its lane and the ground
  // beyond) either side; the bikes' grid with the original's seven rivals.
  if (context.first) {
    const player = { s: context.grid, lateral: 0 };
    const limit = inputs.lane + context.ground;
    gates.push(
      startGate(at, {
        player,
        originals: { car: [], bike: context.rivals },
        lanes: ['a', 'b'],
        laneWidth: inputs.lane,
        limits: [limit, limit],
      }),
    );
  }
  gates.push(...sectionGates(stations, origin, context.checkpoints, context.finish));

  // The skies: the section's from the piece's start, the next section's from where the original brings it in, 6 m
  // before the bike reaches it; each facing as the original's heading 0 does.
  const skyOrder = (s: number) => {
    let order = Math.min(piece.order, context.skyChanges.length);
    if (order < context.skyChanges.length && s >= context.skyChanges[order]!) order++;
    return order;
  };
  // The original's heading 0 in the piece's frame: the road's turn from the course's start, as a direction.
  const turned = ((path.pose(piece.from).heading - context.startHeading) * 180) / Math.PI;
  const yawOrigin = sectionYawOrigin(inputs.yawOrigin, turned);
  // At the Section's start a change already running runs on.
  const environment = (s: number) => ({
    at: at(s),
    name: inputs.name,
    background: { image: inputs.sky(skyOrder(s)), horizonY: SKY_HORIZON, yawOrigin: micrometre(yawOrigin) },
    transition: s === origin ? 0 : inputs.change,
  });
  const environments = [environment(origin)];
  const change = context.skyChanges[piece.order];
  if (change !== undefined && change > origin + WRITTEN_SLACK && change < origin + size - WRITTEN_SLACK)
    environments.push(environment(change));

  return {
    id: piece.id,
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
        knots: [origin, origin + size].map((s) => ({ at: at(s), lateral: lateral(-inputs.lane - context.ground) })),
      },
      {
        id: 'outer-right',
        knots: [origin, origin + size].map((s) => ({ at: at(s), lateral: lateral(inputs.lane + context.ground) })),
      },
    ],
    strips,
    walls: [],
    openLimits: [],
    sprites: repeated(
      [...context.objects]
        .sort((a, b) => a.s - b.s || a.lateral - b.lateral)
        .map((o) =>
          spriteElement({
            image: context.image(o.picture.use),
            palette: o.picture.palette,
            at: at(o.s),
            lateral: o.lateral,
            groundOffset: o.groundOffset,
            body: o.body,
          }),
        ),
    ),
    environments,
    gates,
  };
}

type Lateral = { readonly boundary: string; readonly offset: number };
const boundary = (id: string): Lateral => ({ boundary: id, offset: 0 });
