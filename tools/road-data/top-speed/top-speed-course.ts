/**
 * TOP SPEED's conversion ([TOP SPEED road data](../../../docs/top-speed-road-data.md)): its seven courses, each its
 * road from its start through its five stages to its goal, laid on back for its grid, laid by `road-layout` with its
 * plan, heights, lanes, limits, bands and materials as its programs give them, a checkpoint at each stage's end and its
 * skies in their Sections; no objects yet.
 */
import type { EnvironmentDocument, LaneDocument } from '../../../src/course/course-document.js';
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
import type { Material } from '../shared/road-surface.js';
import type { RomSet } from '../shared/rom-set.js';
import { micrometre, simplified, stripElement } from '../shared/section-writing.js';
import { bakeSky, sectionYawOrigin, SKY_HORIZON, skyYawOrigin } from '../shared/sky-baking.js';
import { rgb555Of } from '../taito/palette.js';
import { colorSet, skyChanges, SKY_MIDDLE, SKY_TURN, topSpeedSky } from './top-speed-backgrounds.js';
import { gradeResolution, STEP_METRES, stepGrades } from './top-speed-heights.js';
import { coursePieces, RECORD_METRES } from './top-speed-plan.js';
import {
  courseRecords,
  groundAlong,
  groundColor,
  LANES,
  limitCuts,
  limitStretches,
  maskChanges,
  spanLimits,
} from './top-speed-road-across.js';
import { topSpeedRoadColors, topSpeedRoadPicture } from './top-speed-road-picture.js';
import { assembleTopSpeedMain, assembleTopSpeedSub, assembleTopSpeedTiles } from './top-speed-rom.js';
import { COURSES, courseSections, LANE_METRES, POSITION_METRES, readStages, STAGES } from './top-speed-road.js';

export const TOP_SPEED_CONVERSION_VERSION = 1;

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
  const ground = groundColor(main);
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
    // A record's colors, as RGB555: its surface's and ground's by its color set and field, its edge's white.
    const colorsOf = (s: number) => {
      const r = recordAt(at(s));
      return {
        body: rgb555Of(roadColors.surface(colorSet(main, r.stage, r.section), r.record.scene)),
        edge: rgb555Of(roadColors.edge),
        ground: rgb555Of(ground(r)),
      };
    };
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
        // Its bands: its left edge, its body over its lanes and its right edge, the picture's edge beyond them.
        const [first, last] = [present[0]!, present.at(-1)!];
        const edge = picture.edgeMetres;
        const laterals = [
          [
            { lane: first, side: 'left', offset: -edge },
            { lane: first, side: 'left', offset: 0 },
          ],
          [
            { lane: first, side: 'left', offset: 0 },
            { lane: last, side: 'right', offset: 0 },
          ],
          [
            { lane: last, side: 'right', offset: 0 },
            { lane: last, side: 'right', offset: edge },
          ],
        ] as const;
        // Its colors' cuts: where a record's colors differ from the one's before.
        const colorCuts = [
          span.from,
          ...steps(span.from, span.to)
            .slice(1, -1)
            .filter((s) => JSON.stringify(colorsOf(s)) !== JSON.stringify(colorsOf(s - STEP_METRES))),
          span.to,
        ];
        const strips = colorCuts.slice(0, -1).flatMap((a, j) => {
          const c = colorsOf(a);
          const [from, to] = [positionAt(a), positionAt(colorCuts[j + 1]!)];
          return [
            ...[c.edge, c.body, c.edge].map((color, k) =>
              stripElement(from, to, laterals[k]![0], laterals[k]![1], color, ROAD),
            ),
            stripElement(from, to, null, laterals[0][0], c.ground, null),
            stripElement(from, to, laterals[2][1], null, c.ground, null),
          ];
        });
        const outer = colorsOf(span.from);
        const band = (left: number, right: number) => ({ left, right, colors: [outer.edge], material: ROAD });
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
          strips,
          outermost: [
            { band: band(l - edge, l), left: laterals[0][0], right: laterals[0][1] },
            { band: band(r, r + edge), left: laterals[2][0], right: laterals[2][1] },
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
