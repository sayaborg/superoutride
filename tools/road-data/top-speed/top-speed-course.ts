/**
 * TOP SPEED's conversion ([TOP SPEED road data](../../../docs/top-speed-road-data.md)): its seven courses, each its
 * road from its start through its five stages to its goal, laid on back for its grid, laid by `road-layout` with its
 * plan, heights, lanes, limits, bands and materials as its programs give them, a checkpoint at each stage's end and its
 * skies in their Sections; no objects yet.
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
import { partedStrips, type Material } from '../shared/road-surface.js';
import { colorStretches } from '../shared/color-stretches.js';
import type { RomSet } from '../shared/rom-set.js';
import { micrometre, simplified, spriteElement, stripElement } from '../shared/section-writing.js';
import { bakeSky, sectionYawOrigin, SKY_HORIZON, skyYawOrigin } from '../shared/sky-baking.js';
import { rgb555Of } from '../taito/palette.js';
import { colorSet, skyChanges, SKY_MIDDLE, SKY_TURN, topSpeedSky } from './top-speed-backgrounds.js';
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
import { hills, PENS, RASTER, stripeWords, topSpeedRoadColors, topSpeedRoadPicture } from './top-speed-road-picture.js';
import { assembleTopSpeedMain, assembleTopSpeedSub, assembleTopSpeedTiles } from './top-speed-rom.js';
import { topSpeedBands, topSpeedBoards } from './top-speed-boards.js';
import { topSpeedPlacements, type TopSpeedHit } from './top-speed-objects.js';
import { assembleTopSpeedSprites } from './top-speed-sprites.js';
import { pixelLaterals, SCREEN_WIDE, topSpeedThing } from './top-speed-things.js';
import { COURSES, courseSections, LANE_METRES, POSITION_METRES, readStages, STAGES } from './top-speed-road.js';

export const TOP_SPEED_CONVERSION_VERSION = 7;

/** Where the car stands at GO, positions into its first section (S 0x13EE0, 0x7CF2), and its lane. */
const GO_POSITIONS = 0x260;
const GO_LANE = 'd';
/** A stage's records: five sections of 32. */
const STAGE_RECORDS = 5 * 32;
/** The standing things' size curve, the records a thing is spawned ahead of the camera (S 0x65C6), and P's lateral. */
const STANDING_CURVE = 1;
const SPAWN_AHEAD = 5;
const P = 0x8000;
/** A pen's tunnel pen, 10 on (MAME's description). */
const TUNNEL_PENS = 10;
/** The road's material. */
const ROAD: Material = 'ASPHALT';
/** The sky's picture of a horizon picture, a cloud picture and a color set. */
const skyName = (a: number, b: number, set: number) => `top-speed-sky-${a}-${b}-${set}`;

/**
 * A thing's body ([Chosen lines](../../../docs/original-road-data.md#chosen-lines)), metres right of its lateral `at`:
 * each part of its hit (`hit`, laterals `metres` each) as wide as it is, at most its picture's colored columns
 * (`colored`, from its point), and, where a car meets it from its side of P alone, the part on that side alone; none
 * where it has no hit.
 */
function bodyOf(hit: TopSpeedHit | null, at: number, metres: number, colored: readonly [number, number]) {
  if (!hit) return null;
  const width = Math.min(2 * hit.half * metres, colored[1] - colored[0]);
  const parts = hit.middles.flatMap((m) => {
    let [a, b] = [m * metres - width / 2, m * metres + width / 2];
    if (hit.ownSide) [a, b] = at >= 0 ? [Math.max(a, -at), b] : [a, Math.min(b, -at)];
    return b - a > 1e-6 ? [{ across: (a + b) / 2, width: b - a }] : [];
  });
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
  const resolution = gradeResolution(sub);
  const outputs = new OriginalOutputs();
  // Its things: each course's placements, their pictures drawn once for all its courses, a pixel the standing things'
  // size curve's at its full size.
  const place = topSpeedPlacements(sub);
  const sprites = assembleTopSpeedSprites(set);
  const metresAcross = lateralMetres(sub);
  const pixel = pixelLaterals(sub, STANDING_CURVE) * metresAcross;
  const placed = Array.from({ length: COURSES }, (_, course) => {
    const recs = courseRecords(courseSections(stages, course));
    return recs.flatMap((r, i) =>
      place(r.record, r.stage, r.section, recs[Math.max(0, i - SPAWN_AHEAD)]!.section).flatMap((p) => {
        const thing = topSpeedThing(sub, p.index);
        // Its picture: the next descriptor's where it stands left of P and has one (S 0x16634 to 0x1664A).
        const shown = thing.leftVariant && p.lateral < P ? p.index + 1 : p.index;
        const pictured = topSpeedThing(sub, shown);
        // A flat thing (its size curve not the standing things') is not placed; an empty one neither.
        if (pictured.curve !== STANDING_CURVE || !pictured.pieces.length) return [];
        return [{ record: i, ...p, shown }];
      }),
    );
  });
  const shownOf = (pick: (types: readonly number[]) => boolean) => [
    ...new Set(
      placed
        .flat()
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
  for (const b of boards.values()) outputs.file(b.image.path, b.image.bytes);
  const skies = new Set<string>();
  const courses = Array.from({ length: COURSES }, (_, course) => {
    const letter = 'ABCDEFG'[course]!;
    const id = `top-speed-${letter.toLowerCase()}`;
    const name = `TOP SPEED ${letter}`;
    const records = courseRecords(courseSections(stages, course));
    if (records.length !== STAGES * STAGE_RECORDS) throw contractUnmet(`${name} is not five stages of 160 records`);
    const recordAt = (s: number) =>
      records[Math.min(records.length - 1, Math.max(0, Math.floor(s / RECORD_METRES + 1e-9)))]!;
    const stretches = limitStretches(sub, records);
    // Its roads not taken, each over its fork's 30.7 m from its branch's start.
    const notTaken = roadsNotTaken(main, stages, courseSections(stages, course), picture.pixelMetres, STEP_POSITIONS);
    const goal = records.length * RECORD_METRES;
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
    const things = placed[course]!.map((t) => {
      const [board, band] = [boards.get(t.shown), bands.get(t.shown)];
      const lateral = (t.lateral - P) * metresAcross;
      // Its picture, with its body; and its band across the road, floating, with none.
      const picture = board
        ? [
            {
              image: board.name,
              palette: board.palette,
              lateral: 0,
              groundOffset: 0,
              body: bodyOf(t.hit, lateral, metresAcross, board.colored),
            },
          ]
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
      return {
        s: back + t.record * RECORD_METRES + t.ahead * POSITION_METRES,
        lateral,
        sprites: [...picture, ...across],
      };
    }).sort((a, b) => a.s - b.s || a.lateral - b.lateral);
    const at = (s: number) => s - back;
    // Its plan: the start's heading laid on back straight, then its records turned as its horizon band turns.
    const pieces = [
      { length: back, turn: 0 },
      ...coursePieces(
        main,
        records.map((r) => r.record),
      ),
    ];
    const length = back + goal;
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
    // Its tunnels, where their walls hold the car (`limitStretches`): its road and its sky dark there, at once at
    // their ends (default; K confirms at the stage's end).
    // Under an overpass the road is dark too, from its near deck, whose line begins the dark road, to its far
    // deck, whose line ends it (S 0x1689E, M 0x3A0C); the sky is not (default; K confirms at the stage's end).
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
    // The stations where a record's colors or a tunnel may change, in order.
    const changeStations = (starts: readonly number[]) =>
      [...new Set([...starts, ...tunnelEnds])].filter((s) => s > 1e-9 && s < length - 1e-9).sort((a, b) => a - b);
    // Its skies: its start's, then each change of picture or color set where its record starts, black (color set 0)
    // in its tunnels, each at once.
    const recordSkies = skyChanges(main, records);
    const skyAt = (s: number) => {
      const c = [...recordSkies].reverse().find((k) => k.record * RECORD_METRES + back <= s + 1e-9) ?? recordSkies[0]!;
      return { a: c.a, b: c.b, set: inTunnel(s) ? 0 : c.set };
    };
    const skyKnots = [0, ...changeStations(recordSkies.slice(1).map((c) => c.record * RECORD_METRES + back))]
      .map((s) => ({ s, sky: skyAt(s), image: skyName(skyAt(s).a, skyAt(s).b, skyAt(s).set) }))
      .filter((k, i, all) => i === 0 || k.image !== all[i - 1]!.image);
    for (const k of skyKnots)
      if (!skies.has(k.image)) {
        skies.add(k.image);
        outputs.file(
          `images/${k.image}.json`,
          JSON.stringify(bakeSky(k.image, topSpeedSky(main, tiles, k.sky.a, k.sky.b, k.sky.set), 1)),
        );
      }
    const path = new CoursePath(pieces);
    const yawOrigin = skyYawOrigin(SKY_MIDDLE, SKY_TURN);
    // Its colors, each record's set: its color set, its field and whether it is drawn as on a hill (`hills`), at once
    // where they change (default; K confirms: the original fades a step a frame), each in stretches (`colorStretches`).
    const onHills = hills(
      main,
      records.map((r) => r.record),
    );
    const setAt = (s: number) => {
      const i = Math.min(records.length - 1, Math.max(0, Math.floor(at(s) / RECORD_METRES + 1e-9)));
      const r = records[i]!;
      const dark = inTunnel(s) || under.some((u) => s >= u.from - 1e-9 && s < u.to - 1e-9);
      return { set: colorSet(main, r.stage, r.section), scene: r.record.scene, hill: onHills[i]!, tunnel: dark };
    };
    const setKnots = [0, ...changeStations(records.map((_, i) => back + i * RECORD_METRES))]
      .map((s) => ({ s, set: setAt(s) }))
      .filter((k, i, all) => i === 0 || JSON.stringify(k.set) !== JSON.stringify(all[i - 1]!.set));
    const colorRuns = colorStretches(
      setKnots.map((k) => k.set),
      setKnots.slice(1).map((k) => ({ at: k.s, length: 0 })),
      0,
      length,
    );
    // A part's four colors in a set, as RGB555, by its place's raster words (`stripeWords`): the surface and the ground
    // in their other shade, the lines and the inner band, or the outer band, drawn as the surface.
    type Part = 'body' | 'ground' | 'line' | 'inner' | 'outer';
    const partColors =
      (part: Part) =>
      (c: ReturnType<typeof setAt>): readonly number[] =>
        (c.hill ? words.hill : words.flat).map((w) => {
          // In a tunnel each pen's tunnel pen (10 on), with no other shades (MAME's description).
          const pen = (p: number) => roadColors.pen(c.hill, c.tunnel ? p + TUNNEL_PENS : p);
          const surface = c.tunnel ? pen(PENS.surface) : roadColors.surface(c.set, c.scene);
          const groundColor = c.tunnel ? pen(PENS.ground) : ground(c.set, c.scene);
          const body = w & RASTER.surface && !c.tunnel ? shade(surface) : surface;
          const color =
            part === 'body'
              ? body
              : part === 'ground'
                ? w & RASTER.ground && !c.tunnel
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
          return rgb555Of(part === 'line' && c.hill && !c.tunnel ? body : color);
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
      finish: { id: `${id}-GOAL`, s: length },
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
          return left === 0 ? 0 : right;
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
        // Its roads not taken within it: each the other branch's half beside its own, its P and its outer side two
        // Boundaries straight between its steps, its body over its lanes, its lines and its edge's bands as the
        // course's, striped as the course's and drawn over it, of no material (the original slows a car by its
        // lateral alone).
        const notTakenParts = notTaken.flatMap((n, j) => {
          const from = back + n.from * RECORD_METRES;
          const [a, b] = [Math.max(span.from, from), Math.min(span.to, from + n.steps * n.step)];
          if (!(b - a > 1e-6)) return [];
          const sign = n.beside === 'right' ? 1 : -1;
          const offsetAt = (s: number) => {
            const k = (s - from) / n.step,
              k0 = Math.floor(k + 1e-9);
            return n.offset(k0) + (n.offset(k0 + 1) - n.offset(k0)) * (k - k0);
          };
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
          return [
            {
              boundaries: [boundaryOf(centreId, offsetAt), boundaryOf(outerId, (s) => offsetAt(s) + sign * across)],
              strips: [
                ...band(fromCentre(0), fromOuter(0), 'body'),
                ...band(fromCentre(0), fromCentre(lineHalf), 'line'),
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
          transition: 0,
        });
        const inForce = [...skyKnots].reverse().find((k) => k.s <= span.from + 1e-6)!;
        return {
          lanes: laneDocs,
          centerLane,
          centerLateral: centre.every(([, v]) => v === centre[0]![1])
            ? centre[0]![1]
            : centre.map(([s, lateral]) => ({ at: positionAt(s), lateral })),
          linkLane: centreFrom(span.to),
          strips: [...bands, ...lines, ...centreLines, ...notTakenParts.flatMap((n) => n.strips)],
          sprites: things
            .filter((t) => t.s >= span.from && (t.s < span.to || (span.to >= length - 1e-6 && t.s <= span.to)))
            .flatMap((t) =>
              t.sprites.map((sprite) => spriteElement({ ...sprite, at: positionAt(t.s), lateral: t.lateral })),
            ),
          boundaries: notTakenParts.flatMap((n) => n.boundaries),
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
      sections: laid.spans.length,
      // Where it crosses itself, metres along it, and how far its second passage lies above its first.
      crossings: crossed.map(([a, b]) => ({
        at: [round1(a), round1(b)],
        apart: round3(profile.height(b) - profile.height(a)),
      })),
      heights: { departs: round3(departs), runs: rise.runs, gradeDeparture: round3(rise.departure) },
      skies: skyKnots.map((k) => ({ at: round1(k.s), image: k.image })),
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
