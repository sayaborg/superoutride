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
import { micrometre, simplified, stripElement } from '../shared/section-writing.js';
import { bakeSky, sectionYawOrigin, SKY_HORIZON, skyYawOrigin } from '../shared/sky-baking.js';
import { rgb555Of } from '../taito/palette.js';
import { colorSet, skyChanges, SKY_MIDDLE, SKY_TURN, topSpeedSky } from './top-speed-backgrounds.js';
import { gradeResolution, STEP_METRES, stepGrades } from './top-speed-heights.js';
import { coursePieces, RECORD_METRES } from './top-speed-plan.js';
import {
  alternate,
  courseRecords,
  groundAlong,
  groundColor,
  LANES,
  limitCuts,
  limitStretches,
  maskChanges,
  spanLimits,
} from './top-speed-road-across.js';
import { hills, PENS, RASTER, stripeWords, topSpeedRoadColors, topSpeedRoadPicture } from './top-speed-road-picture.js';
import { assembleTopSpeedMain, assembleTopSpeedSub, assembleTopSpeedTiles } from './top-speed-rom.js';
import { COURSES, courseSections, LANE_METRES, POSITION_METRES, readStages, STAGES } from './top-speed-road.js';

export const TOP_SPEED_CONVERSION_VERSION = 2;

/** Where the car stands at GO, positions into its first section (S 0x13EE0, 0x7CF2), and its lane. */
const GO_POSITIONS = 0x260;
const GO_LANE = 'd';
/** A stage's records: five sections of 32. */
const STAGE_RECORDS = 5 * 32;
/** The road's material. */
const ROAD: Material = 'ASPHALT';
/** The sky's picture of a horizon picture, a cloud picture and a color set. */
const skyName = (a: number, b: number, set: number) => `top-speed-sky-${a}-${b}-${set}`;

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
    // Its skies: its start's, then each change of picture or color set where its record starts, at once.
    const skyKnots = skyChanges(main, records).map((c, i) => ({
      s: i === 0 ? 0 : c.record * RECORD_METRES + back,
      image: skyName(c.a, c.b, c.set),
      sky: c,
    }));
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
    const sets = records.map((r, i) => ({
      set: colorSet(main, r.stage, r.section),
      scene: r.record.scene,
      hill: onHills[i]!,
    }));
    const setChanges = sets.flatMap((c, i) =>
      i > 0 && JSON.stringify(c) !== JSON.stringify(sets[i - 1]) ? [{ at: back + i * RECORD_METRES, set: c }] : [],
    );
    const colorRuns = colorStretches(
      [sets[0]!, ...setChanges.map((c) => c.set)],
      setChanges.map((c) => ({ at: c.at, length: 0 })),
      0,
      length,
    );
    // A part's four colors in a set, as RGB555, by its place's raster words (`stripeWords`): the surface and the ground
    // in their other shade, the lines and the inner band, or the outer band, drawn as the surface.
    type Part = 'body' | 'ground' | 'line' | 'inner' | 'outer';
    const partColors =
      (part: Part) =>
      (c: (typeof sets)[number]): readonly number[] =>
        (c.hill ? words.hill : words.flat).map((w) => {
          const surface = roadColors.surface(c.set, c.scene);
          const body = w & RASTER.surface ? shade(surface) : surface;
          const color =
            part === 'body'
              ? body
              : part === 'ground'
                ? w & RASTER.ground
                  ? shade(ground(c.set, c.scene))
                  : ground(c.set, c.scene)
                : part === 'outer'
                  ? w & RASTER.outer
                    ? body
                    : roadColors.pen(c.hill, PENS.outer)
                  : w & RASTER.lines
                    ? body
                    : roadColors.pen(c.hill, part === 'line' ? PENS.line : PENS.inner);
          // Line 0x100's pen 1, which draws no lines, takes the surface's.
          return rgb555Of(part === 'line' && c.hill ? body : color);
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
        const outerBand = (from: number, to: number) => ({
          left: from,
          right: to,
          colors: partColors('outer')(sets[Math.max(0, Math.floor(at(span.from) / RECORD_METRES + 1e-9))]!),
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
          strips: [...bands, ...lines, ...centreLines],
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
