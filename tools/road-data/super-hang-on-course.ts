/**
 * A SUPER HANG-ON course as a course document ([Original road data](../../docs/original-road-data.md#super-hang-on)):
 * its sections' road path laid one after another from the entry and its goal after them, the road on it level but for
 * the crossings' bumps, its colors and stripes, its scenery, gates, the goal's crowd and the ending's figures.
 */
import { requireInput } from '../course/authoring-io.js';
import { computedValue } from '../authoring/course-joints.js';
import { MAXIMUM_VEHICLE_REACH } from '../../src/course/course-coordinate-domain.js';
import { domainCuts, repeated, writtenPlan, type WrittenElement } from './section-writing.js';
import { bendOf, profileOf, sectionProfile, separatedCrossings } from './road-profile.js';
import { PIXEL_ASPECT } from './pixel-grid.js';
import { CoursePath, type PathElement } from './course-path.js';
import { crossingsOf, overlappingCells } from './crossings.js';
import { PIXEL_UNITS } from './super-hang-on-boards.js';
import type { CrossSection } from './super-hang-on-cross-section.js';
import type { PathSegment } from './path-plan.js';
import type { ColorPair, SceneryItem, Section } from './super-hang-on-road.js';
import type { ScenerySpot } from './super-hang-on-scenery.js';
import type { GatePart } from './super-hang-on-sprites.js';

/**
 * A lane, metres, over the road's half to its lines' inner edges: K's 4.3 m, at which the original's upright rear frame
 * of the bike stands about as tall as VFR750R's upright rear picture. It is the one measure of SUPER HANG-ON's sizes
 * across and up.
 */
export const LANE = 4.3;
/** The plane runs on lane a's centre, half a lane left of P. */
const OFFSET = LANE / 2;
/** SAND reaches this far beyond the asphalt, metres. */
const SAND = 40;
/** Passages at least this far apart along the road may cross, metres; a passage runs on over gaps of up to `PASSAGE_GAP` positions. */
const PASSAGES_APART = 200;
const PASSAGE_GAP = 3;
/** The grids: their slots, the last at GO in lane a, cars this far apart, bikes this. */
const GRID_SLOTS = 16;
const CAR_SPACING = 12;
const BIKE_SPACING = 3;
/** The skies' horizon row, the generic skies'. */
const SKY_HORIZON = 320;
/** The gates' x is drawn at x × line / 191 and their lift at lift × line / 192: units are × 224/191 and 224/192. */
const GATE_X = 224 / 191;
const GATE_LIFT = 224 / 192;

const round = (value: number, step = 1e-6) => Number((Math.round(value / step) * step).toFixed(6));
/** Stations nearer than this are one: ten times the micrometre stations are written to. */
const EPSILON = 1e-5;

/** A figure of the ending, as its last frame stands: its frame, palette, x and height in road units. */
export interface EndingFigure {
  readonly list: number;
  readonly palette: number;
  readonly x: number;
  readonly height: number;
}

/** A picture's course image and palette names, and its width in metres. */
export interface PictureNames {
  readonly image: string;
  readonly palette: string;
  readonly width: number;
}

/** What a course is made from beside its sections. */
export interface SuperHangOnCourseInputs {
  readonly id: string;
  /** The course's name and its Sections' and gates' ids' stem. */
  readonly name: string;
  readonly slug: string;
  /** Its sections in the order it runs them, and each one's path as straights and arcs. */
  readonly sections: readonly Section[];
  readonly plans: readonly (readonly PathSegment[])[];
  /**
   * A road position, metres; a section's positions; where a CHECK gate comes out inside a section; where the next
   * section's background and ground come in.
   */
  readonly metres: number;
  readonly length: number;
  readonly middle: number;
  readonly transition: number;
  /** The goal's positions. */
  readonly goal: number;
  /** The stripes' period, positions; the ground's change, its steps and their positions. */
  readonly stripe: number;
  readonly steps: number;
  readonly step: number;
  /** Positions from a gate's coming out to its passing the bike; from GO to the start gate's passing. */
  readonly gatePass: number;
  readonly startGate: number;
  readonly cross: CrossSection;
  readonly scenery: readonly ScenerySpot[];
  /** The goal's crowd and where it stands; the ending's figures and where they stand, goal positions. */
  readonly crowd: readonly SceneryItem[];
  readonly crowdAt: number;
  readonly ending: readonly EndingFigure[];
  readonly endingAt: number;
  readonly gates: readonly GatePart[];
  readonly banners: { readonly start: number; readonly check: number; readonly goal: number };
  readonly picture: (list: number, mirrored: boolean, palette: number, raised: boolean) => PictureNames;
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
}

/** An RGB555 color's channels, five bits each. */
const channels = (c: number) => [(c >> 10) & 31, (c >> 5) & 31, c & 31] as const;

/**
 * The ground's color at step `s` (0 from) of its change from `from` to `to`: each channel `c0 + ⌊(s + 1)(c1 − c0) / steps⌋`.
 */
function groundStep(from: number, to: number, s: number, steps: number) {
  const [a, b] = [channels(from), channels(to)];
  const [r, g, bl] = a.map((c, i) => c + Math.floor(((s + 1) * (b[i]! - c)) / steps));
  return (r! << 10) | (g! << 5) | bl!;
}

/** A stretch of road stations with its ground and road colors. */
interface ColorStretch {
  readonly from: number;
  readonly to: number;
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
 * The course: its path laid from the entry (a straight of `cameraDistance` before GO, then each section's straights and
 * arcs, then the goal's straight); its Sections, one a section and one the goal's, each cut where its coordinate domain
 * passes over itself; their objects, gates, skies, strips and level profile with the crossings' bumps.
 */
export function superHangOnCourse(inputs: SuperHangOnCourseInputs) {
  const { metres, length, sections } = inputs;
  const count = sections.length;
  const unit = LANE / inputs.cross.linesIn;
  const entry = inputs.cameraDistance;
  // P: the entry, the sections and the goal, straights one after another one.
  const elements: PathElement[] = [];
  const push = (length: number, turn: number) => {
    const start = elements.length ? elements.at(-1)!.start + elements.at(-1)!.length : 0;
    const last = elements.at(-1);
    if (last && last.turn === 0 && turn === 0)
      elements[elements.length - 1] = { ...last, length: last.length + length };
    else elements.push({ start, length, turn });
  };
  push(entry, 0);
  inputs.plans.forEach((plan) => plan.forEach((e) => push((e.to - e.from) * metres, e.turn)));
  push(inputs.goal * metres, 0);
  const path = new CoursePath(elements, OFFSET);
  /** P's metres at course position `q`: section k's position p is `length × k + p`, the goal's after the last. */
  const along = (q: number) => entry + q * metres;
  const stationOf = (q: number) => path.station(along(q));
  const end = path.length;

  // The gates and the finish, by course position, and their metres along P, which the Sections' cuts keep clear of.
  const checks = Array.from({ length: count }, (_, k) => [
    ...(k > 0 ? [length * k + inputs.gatePass] : []),
    length * k + inputs.middle + inputs.gatePass,
  ]).flat();
  const finish = length * count + inputs.gatePass;
  const gateMetres = [inputs.startGate, ...checks, finish].map(along);

  // The Sections: one a section and the goal's, each cut again where its domain passes over itself.
  const reach = inputs.cross.edgesOut * unit + SAND + MAXIMUM_VEHICLE_REACH;
  const pieces: Piece[] = [];
  for (let order = 0; order <= count; order++) {
    const from = order === 0 ? 0 : along(length * order);
    const to = order === count ? end : along(length * (order + 1));
    const stem = `${inputs.slug}-${order === count ? 'goal' : order + 1}`;
    const cuts = domainCuts(path, from, to, reach, gateMetres);
    [from, ...cuts].forEach((a, i) =>
      pieces.push({ id: i === 0 ? stem : `${stem}-${i + 1}`, from: a, to: cuts[i] ?? to, order }),
    );
  }

  // The colors along the road: each section's until its ground changes, the ground's steps, then the next's.
  const stretches: ColorStretch[] = [];
  const ground = (k: number) => sections[k]!.colors.ground.rgb555;
  sections.forEach((section, k) => {
    const from = k === 0 ? 0 : stationOf(length * k);
    const to = k === count - 1 ? path.planeLength : stationOf(length * (k + 1));
    if (k === count - 1) {
      stretches.push({ from, to, ground: ground(k), road: section.colors });
      return;
    }
    const change = (j: number) => stationOf(length * k + inputs.transition + j * inputs.step);
    stretches.push({ from, to: change(0), ground: ground(k), road: section.colors });
    for (let j = 0; j < inputs.steps; j++)
      stretches.push({
        from: change(j),
        to: change(j + 1),
        ground: [0, 1].map((h) => groundStep(ground(k)[h]!, ground(k + 1)[h]!, j, inputs.steps)) as [number, number],
        road: section.colors,
      });
    stretches.push({ from: change(inputs.steps), to, ground: ground(k + 1), road: sections[k + 1]!.colors });
  });

  // The objects: the scenery, the gates' parts, the goal's crowd and the ending's figures.
  const placed: Placed[] = [];
  const across = (x: number) => OFFSET + x * unit;
  for (const spot of inputs.scenery) {
    const { item } = spot;
    const picture = inputs.picture(inputs.spriteList(item.sprite), item.mirrored, item.palette, false);
    placed.push({
      s: stationOf(length * spot.section + spot.position),
      lateral: across(item.x),
      picture,
      groundOffset: 0,
      body: Math.min(2 * inputs.hitWidth(item.sprite) * PIXEL_UNITS * unit, picture.width),
    });
  }
  const gate = (q: number, banner: number, parts: readonly number[]) => {
    for (const k of parts) {
      const part = inputs.gates[k]!;
      // The signal stands as at GO; the banner reads START, CHECK or GOAL.
      const palette = k === 2 ? part.palette + 3 : k === 5 ? banner : part.palette;
      const groundOffset = part.lift * GATE_LIFT * unit * PIXEL_ASPECT;
      placed.push({
        s: stationOf(q),
        lateral: across(part.x * GATE_X),
        picture: inputs.picture(part.sprite, part.mirrored, palette, groundOffset !== 0),
        groundOffset,
        body: null,
      });
    }
  };
  gate(inputs.startGate, inputs.banners.start, [0, 1, 2, 3, 4, 5]);
  for (const q of checks) gate(q, inputs.banners.check, [0, 1, 3, 4, 5]);
  gate(finish, inputs.banners.goal, [0, 1, 3, 4, 5]);
  for (const item of inputs.crowd)
    placed.push({
      s: stationOf(length * count + inputs.crowdAt),
      lateral: across(item.x),
      picture: inputs.picture(inputs.spriteList(item.sprite), item.mirrored, item.palette, false),
      groundOffset: 0,
      body: null,
    });
  for (const figure of inputs.ending)
    placed.push({
      s: stationOf(length * count + inputs.endingAt),
      lateral: across(figure.x),
      picture: inputs.picture(figure.list, false, figure.palette, figure.height !== 0),
      groundOffset: figure.height * unit * PIXEL_ASPECT,
      body: null,
    });
  requireInput(
    placed.every((o) => o.s < path.planeLength),
    `/${inputs.id}`,
    "An object stands past the course's end",
  );

  // The crossings: passages at least 200 m apart whose roads, to the edge bands' outer edges, overlap, kept apart on the
  // level road.
  const half = inputs.cross.edgesOut * unit;
  const pairs = overlappingCells(path, {
    from: 0,
    to: end,
    step: metres,
    sides: () => [half, half],
    apart: PASSAGES_APART,
  }).map(([a, b]) => [path.station(a), path.station(b)] as [number, number]);
  const crossings = crossingsOf(pairs, PASSAGE_GAP * metres);
  const separated = separatedCrossings([], crossings, path.planeLength);
  // Each Section's plan as written, and its start: the lengths written before it, so seams agree exactly.
  const plans = pieces.map((piece) => writtenPlan(path, piece));
  const origins = plans.reduce((o, plan) => [...o, o.at(-1)! + plan.reduce((sum, e) => sum + e.length, 0)], [0]);
  const profile = profileOf(separated.changes.map(bendOf), origins.slice(1, -1));

  // The Sections.
  const startHeading = path.pose(0).heading;
  const documents = pieces.map((piece, i) =>
    sectionDocument(piece, {
      inputs,
      path,
      unit,
      elements: plans[i]!,
      origin: origins[i]!,
      first: i === 0,
      last: i === pieces.length - 1,
      stretches,
      objects: placed.filter((o) => o.s >= origins[i]! && o.s < origins[i + 1]!),
      checkpoints: checks.map((q, k) => ({ id: `${inputs.slug}-CP${k + 1}`, s: stationOf(q) })),
      finish: { id: `${inputs.slug}-GOAL`, s: stationOf(finish) },
      grid: stationOf(0),
      profile,
      skyChanges: sections
        .slice(0, -1)
        .map((_, k) => stationOf(length * k + inputs.transition) - inputs.cameraDistance),
      startHeading,
    }),
  );
  const links = pieces.slice(1).map((piece, i) => ({
    id: `${pieces[i]!.id}-${piece.id}`,
    from: { section: pieces[i]!.id, lane: 'a' },
    to: piece.id,
  }));
  return {
    document: {
      format: 'superoutride.course',
      version: 52,
      name: inputs.name,
      entry: pieces[0]!.id,
      maxLaps: 1,
      bearing: 0,
      sections: documents,
      links,
    },
    path,
    pieces,
    profile,
    pairs,
    crossings: crossings.map((crossing, k) => {
      const moves = separated.separations.filter((m) => m.crossing === k);
      return {
        passages: crossing.passages,
        levels: moves[0]?.levels ?? null,
        flat: moves[0]?.flat ?? null,
        half: moves[0]?.half ?? null,
        moves: moves.length,
        heights: crossing.passages.map((p) => profile.height((p.from + p.to) / 2)),
      };
    }),
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
    readonly elements: readonly WrittenElement[];
    readonly origin: number;
    readonly first: boolean;
    readonly last: boolean;
    readonly stretches: readonly ColorStretch[];
    readonly objects: readonly Placed[];
    readonly checkpoints: readonly { readonly id: string; readonly s: number }[];
    readonly finish: { readonly id: string; readonly s: number };
    readonly grid: number;
    readonly profile: ReturnType<typeof profileOf>;
    readonly skyChanges: readonly number[];
    readonly startHeading: number;
  },
) {
  const { inputs, path, unit, elements, origin } = context;
  // The Section's length is its elements' as written, and every station lies within it.
  const size = elements.reduce((sum, e) => sum + e.length, 0);
  const joint = elements[0]!.id;
  const at = (s: number) => {
    const offset = round(s - origin);
    return { joint, offset: offset > size - 1e-5 ? size : Math.max(0, offset) };
  };

  // The lanes: a and b, a lane each either side of P; the centre lane a.
  const lanes = [
    { kind: 'lane', id: 'a', width: LANE },
    { kind: 'lane', id: 'b', width: LANE },
  ];
  const lateral = (fromP: number) => round(OFFSET + fromP);
  const xs = inputs.cross;
  const asphalt = xs.edgesOut * unit;

  // The strips: the ground, the sand beyond the asphalt, the road's surface, lines, edge bands and centre line, each in
  // its two colors by halves of its period counted from GO.
  const period = inputs.stripe * inputs.metres;
  const go = path.station(inputs.cameraDistance);
  const strips: unknown[] = [];
  type Edge = number | Lateral | null;
  const strip = (a: number, b: number, left: Edge, right: Edge, color: number | null, material: string | null) => ({
    kind: 'strip',
    start: at(a),
    end: at(b),
    left,
    right,
    color,
    material,
  });
  /** Half `h` of each period `p` from GO over stations `[a, b]` in `color`. */
  const halves = (h: 0 | 1, p: number, a: number, b: number, left: Edge, right: Edge, color: number) => {
    const w = p / 2;
    const out: unknown[] = [];
    // The first period whose half h ends after a.
    let k = Math.floor((a - go - h * w) / p);
    if (go + k * p + h * w + w <= a + EPSILON) k++;
    const startOf = (j: number) => go + j * p + h * w;
    if (startOf(k) < a - EPSILON) {
      if (Math.min(b, startOf(k) + w) - a > EPSILON)
        out.push(strip(a, Math.min(b, startOf(k) + w), left, right, color, null));
      k++;
    }
    let n = 0;
    while (startOf(k + n) + w <= b + EPSILON) n++;
    if (n > 0) {
      const element = strip(startOf(k), startOf(k) + w, left, right, color, null);
      out.push(n === 1 ? element : { kind: 'repeat', every: round(p), count: n, elements: [element] });
    }
    if (startOf(k + n) < b - EPSILON) out.push(strip(startOf(k + n), b, left, right, color, null));
    return out;
  };
  const two = (pair: ColorPair | readonly [number, number]) =>
    ('rgb555' in pair ? pair.rgb555 : pair) as readonly [number, number];
  const own = context.stretches
    .map((t) => ({ ...t, from: Math.max(t.from, origin), to: Math.min(t.to, origin + size) }))
    .filter((t) => t.to - t.from > EPSILON);
  // The ground everywhere, then the sand's material between the boundaries.
  for (const t of own) {
    const [c0, c1] = two(t.ground);
    strips.push(strip(t.from, t.to, null, null, c1, null));
    if (c0 !== c1) strips.push(...halves(0, period, t.from, t.to, null, null, c0));
  }
  strips.push(strip(origin, origin + size, boundary('outer-left'), boundary('outer-right'), null, 'SAND'));
  // The road: its surface to the edge bands' outer edges, then lines, edge bands and centre line over it.
  const features: {
    left: number;
    right: number;
    colors: (t: ColorStretch) => readonly [number, number];
    period: number;
  }[] = [
    ...[-1, 1].map((side) => ({
      left: lateral(side < 0 ? -xs.linesOut * unit : xs.linesIn * unit),
      right: lateral(side < 0 ? -xs.linesIn * unit : xs.linesOut * unit),
      colors: (t: ColorStretch) => two(t.road.lines),
      period,
    })),
    ...[-1, 1].map((side) => ({
      left: lateral(side < 0 ? -asphalt : xs.edgesIn * unit),
      right: lateral(side < 0 ? -xs.edgesIn * unit : asphalt),
      colors: (t: ColorStretch) => two(t.road.edges),
      period: period / 2,
    })),
    {
      left: lateral(-xs.centre * unit),
      right: lateral(xs.centre * unit),
      colors: (t: ColorStretch) => two(t.road.centreLine),
      period,
    },
  ];
  for (const t of own) {
    const [c0, c1] = two(t.road.surface);
    strips.push(strip(t.from, t.to, lateral(-asphalt), lateral(asphalt), c1, 'ASPHALT'));
    if (c0 !== c1) strips.push(...halves(0, period, t.from, t.to, lateral(-asphalt), lateral(asphalt), c0));
  }
  for (const f of features)
    for (const t of own) {
      const colors = f.colors(t);
      const under = two(t.road.surface);
      for (const h of [0, 1] as const)
        if (colors[h] !== under[h]) strips.push(...halves(h, f.period, t.from, t.to, f.left, f.right, colors[h]!));
    }

  // The gates.
  const gates: unknown[] = [];
  const inside = (s: number) => s > origin + 1e-6 && s <= origin + size + 1e-6;
  if (context.first)
    gates.push({
      kind: 'start',
      grid: Array.from({ length: GRID_SLOTS }, (_, i) => ({
        at: at(context.grid + (GRID_SLOTS - 1 - i) * CAR_SPACING),
        lane: (GRID_SLOTS - 1 - i) % 2 ? 'b' : 'a',
      })),
      bikeGrid: Array.from({ length: GRID_SLOTS }, (_, i) => ({
        at: at(context.grid + (GRID_SLOTS - 1 - i) * BIKE_SPACING),
        lane: (GRID_SLOTS - 1 - i) % 2 ? 'b' : 'a',
      })),
    });
  for (const c of context.checkpoints) if (inside(c.s)) gates.push({ kind: 'checkpoint', id: c.id, at: at(c.s) });
  if (inside(context.finish.s)) gates.push({ kind: 'finish', id: context.finish.id, at: at(context.finish.s) });

  // The skies: the section's from the piece's start, the next section's from where the original brings it in, 6 m
  // before the bike reaches it; each facing as the original's heading 0 does.
  const skyOrder = (s: number) => {
    let order = Math.min(piece.order, context.skyChanges.length);
    if (order < context.skyChanges.length && s >= context.skyChanges[order]!) order++;
    return order;
  };
  // The original's heading 0 in the piece's frame: the road's turn from the course's start, as a direction.
  const turned = (((path.pose(piece.from).heading - context.startHeading) * 180) / Math.PI) % 360;
  const yawOrigin = inputs.yawOrigin + (turned > 180 ? turned - 360 : turned <= -180 ? turned + 360 : turned);
  const environment = (s: number) => ({
    at: at(s),
    name: inputs.name,
    background: { image: inputs.sky(skyOrder(s)), horizonY: SKY_HORIZON, yawOrigin: round(yawOrigin) },
    arrival: 'cut',
  });
  const environments = [environment(origin)];
  const change = context.skyChanges[piece.order];
  if (change !== undefined && change > origin + 1e-6 && change < origin + size - 1e-6)
    environments.push(environment(change));

  return {
    id: piece.id,
    plan: elements,
    profile: sectionProfile(context.profile, origin, origin + size, !context.first, !context.last).map(
      ({ s, y, curveLength }) => ({ at: { joint, offset: computedValue(s - origin) }, y, curveLength }),
    ),
    lanes,
    centerLane: 'a',
    boundaries: [
      {
        id: 'outer-left',
        knots: [origin, origin + size].map((s) => ({ at: at(s), lateral: lateral(-asphalt - SAND) })),
      },
      {
        id: 'outer-right',
        knots: [origin, origin + size].map((s) => ({ at: at(s), lateral: lateral(asphalt + SAND) })),
      },
    ],
    strips,
    walls: [],
    openLimits: [],
    sprites: repeated(
      [...context.objects]
        .sort((a, b) => a.s - b.s || a.lateral - b.lateral)
        .map((o) => ({
          kind: 'sprite',
          image: o.picture.image,
          palette: o.picture.palette,
          at: at(o.s),
          lateral: round(o.lateral),
          groundOffset: round(o.groundOffset),
          unselectedLink: null,
          body: o.body === null ? null : { width: round(o.body), movable: null },
        })),
    ),
    environments,
    gates,
  };
}

type Lateral = { readonly boundary: string; readonly offset: number };
const boundary = (id: string): Lateral => ({ boundary: id, offset: 0 });
