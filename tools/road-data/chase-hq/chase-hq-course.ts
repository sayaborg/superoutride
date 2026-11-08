/**
 * CHASE H.Q.'s conversion ([CHASE H.Q. road data](../../../docs/chase-hq-road-data.md)): its ten courses, each its
 * stage's road on one branch of its fork from the stage's start, laid on back for its grid, to its goal's record's end,
 * laid by `road-layout` with its plan, heights, lanes, limits, bands and materials as its programs give them, its skies
 * in their Sections; no objects yet.
 */
import type {
  CoursePosition,
  EnvironmentDocument,
  LaneDocument,
  Lateral,
} from '../../../src/course/course-document.js';
import { CAMERA_DEFINITION } from '../../../src/view/camera-definition.js';
import { cameraDistance } from '../../../src/view/camera.js';
import { contractUnmet } from '../shared/conversion-errors.js';
import { CoursePath } from '../shared/course-path.js';
import { crestTrials } from '../shared/crest-trials.js';
import { round1, round3, OriginalOutputs, type Conversion } from '../shared/conversion.js';
import { laneWidths } from '../shared/lane-mask.js';
import { riseProfile, tableHeight } from '../shared/rise-profile.js';
import { layRoad } from '../shared/road-layout.js';
import { bendOf, profileOf } from '../shared/road-profile.js';
import { baseColor } from '../shared/road-surface.js';
import type { RomSet } from '../shared/rom-set.js';
import { micrometre, simplified, stripElement } from '../shared/section-writing.js';
import { bakeSky, sectionYawOrigin, SKY_HORIZON, skyYawOrigin } from '../shared/sky-baking.js';
import { gridReach, type StartGrids } from '../shared/grid-rule.js';
import { straightThrough } from '../shared/piecewise-linear.js';
import {
  arrangements,
  compositeOf,
  drawnIntervals,
  narrowGround,
  type FeatureEdge,
  type RoadPicture,
} from '../shared/two-roads.js';
import {
  backgroundMode,
  chaseHqSky,
  paletteTicks,
  SCENE_FADE_TICKS,
  skyChanges,
  SKY_MIDDLE,
  SKY_TURN,
} from './chase-hq-backgrounds.js';
import { CHASE_HQ_GOALS, TOP_SPEED } from './chase-hq-goals.js';
import { gradeResolution, STEP_METRES, stepGrades } from './chase-hq-heights.js';
import { coursePieces, crossings, RECORD_METRES } from './chase-hq-plan.js';
import {
  drawnMask,
  groundAlong,
  LANES,
  limitCuts,
  maskChanges,
  recordLimits,
  roadMaterial,
  roadNotTaken,
  spanBands,
} from './chase-hq-road-across.js';
import { chaseHqRoadLevels, chaseHqRoadPicture, type RoadColor } from './chase-hq-road-picture.js';
import { assembleChaseHqMain, assembleChaseHqSub, assembleChaseHqTiles, CHASE_HQ_ROAD_ROM } from './chase-hq-rom.js';
import {
  courseSections,
  LANE_METRES,
  POSITION_METRES,
  readRoadPalette,
  readRoads,
  STAGES,
  type ChaseHqRecord,
} from './chase-hq-road.js';

export const CHASE_HQ_CONVERSION_VERSION = 4;

/** A stage's far sky set where the original picks one at random: 0 in stages 1, 3 and 5, 2 in 2 and 4 (K, 2026-11-08). */
const STAGE_SETS = Object.freeze([0, 2, 0, 2, 0]);
/** The courses' sides, each the branch its fork's table names. */
const SIDES = Object.freeze(['left', 'right'] as const);
/** The sky's picture of a far set, a background mode and a scene. */
const skyName = (set: number, mode: number, scene: number) => `chase-hq-sky-${set}-${mode}-${scene}`;

/** The lanes set in a record's drawn mask, left to right. */
const setLanes = (sub: Uint8Array, r: ChaseHqRecord) => LANES.filter((_, k) => (drawnMask(sub, r) >> (6 - k)) & 1);

export function chaseHqCourses(set: RomSet) {
  const main = assembleChaseHqMain(set),
    sub = assembleChaseHqSub(set),
    tiles = assembleChaseHqTiles(set);
  const roads = readRoads(main);
  const picture = chaseHqRoadPicture(main, sub, set.data(CHASE_HQ_ROAD_ROM));
  const levels = chaseHqRoadLevels(sub);
  const resolution = gradeResolution(main, sub);
  const tickMetres = TOP_SPEED * POSITION_METRES;
  const outputs = new OriginalOutputs();
  const skies = new Set<string>();
  const courses = Array.from({ length: STAGES }, (_, stage) =>
    SIDES.map((side) => {
      const id = `chase-hq-${stage + 1}-${side}`;
      const name = `STAGE ${stage + 1} ${side.toUpperCase()}`;
      const goal = CHASE_HQ_GOALS[stage]!;
      const sectioned = courseSections(roads, stage, side)
        .flatMap(([road, section]) => roads[road]![section]!.records.map((record) => ({ record, section })))
        .slice(0, Math.floor(goal / RECORD_METRES) + 1);
      const records = sectioned.map((r) => r.record);
      // The fork's other branch, the road not taken, its records beside the course's.
      const other = courseSections(roads, stage, side === 'left' ? 'right' : 'left')
        .flatMap(([road, section]) => roads[road]![section]!.records)
        .slice(0, records.length);
      const notTaken = roadNotTaken(
        main,
        sub,
        records,
        other,
        sectioned.map((r) => r.section),
      );
      const first = records[0]!;
      const recordAt = (s: number) =>
        records[Math.min(records.length - 1, Math.max(0, Math.floor(s / RECORD_METRES + 1e-9)))]!;
      // The own car alone at GO in its stage's start's rightmost lane, the general form on it and its left neighbour.
      const lanesAtStart = setLanes(sub, first);
      const own = lanesAtStart.at(-1)!;
      const ownLateral = (LANES.indexOf(own) - 3 + 0.5) * LANE_METRES;
      const [limitLeft, limitRight] = recordLimits(main, first);
      const stand = (s: number): StartGrids => ({
        origin: { s, lateral: { lane: own, side: 'center', offset: 0 } },
        originals: { car: { places: [{ ahead: 0, right: 0 }] } },
        limits: [ownLateral - limitLeft, limitRight - ownLateral],
        lanes: [LANES[LANES.indexOf(own) - 1]!, own],
        meet: -LANE_METRES / 2,
        laneWidth: LANE_METRES,
      });
      // Laid on back for its grids and the camera behind their rearmost slot, as TURBO OUTRUN's leg is.
      const back = Math.ceil(gridReach(stand(0)) + cameraDistance(CAMERA_DEFINITION));
      const at = (s: number) => s - back;
      // Its plan: the start's heading laid on back straight, then its records turned as the sky turns.
      const pieces = [{ length: back, turn: 0 }, ...coursePieces(main, records)];
      const length = back + records.length * RECORD_METRES;
      const crossed = crossings(pieces, back + goal);
      // Its heights: the sub program's grades a step, its passages and its start fixed points.
      const grades = stepGrades(
        main,
        sub,
        [...records, records.at(-1)!].map((r) => r.grade),
      );
      const station = (p: number) => back + p * STEP_METRES;
      const rise = riseProfile(
        grades,
        resolution,
        station,
        crossed.flat().map((s) => at(s) / STEP_METRES),
      );
      const profile = profileOf(rise.changes.map(bendOf), [], rise.kinks);
      // Its lanes, limits and ground.
      const masks = maskChanges(main, sub, records);
      const limitsCut = limitCuts(main, records);
      // A record's start on the heights' steps, so that the Sections' cuts are the profile's breaks to the bit.
      const recordStation = (s: number) =>
        station(Math.round(s / RECORD_METRES) * Math.round(RECORD_METRES / STEP_METRES));
      // The fork's record's start, and the start of the 12.3 m before it over which its lanes narrow while its picture
      // stays the original's one road, cut apart.
      const forkSteps = Math.round(notTaken.from / RECORD_METRES) * Math.round(RECORD_METRES / STEP_METRES);
      const forkAt = station(forkSteps);
      const narrowing = station(forkSteps - Math.round(masks.lanes.smoothing / STEP_METRES));
      const notTakenAt = (k: number) => station(forkSteps + (k * notTaken.step) / STEP_METRES);
      const forkEnd = notTakenAt(notTaken.steps);
      const cuts = [...new Set([...limitsCut.map(recordStation), narrowing])].sort((a, b) => a - b);
      const lanes = laneWidths(
        masks.lanes,
        0,
        masks.first,
        masks.changes.map((c) => ({ ...c, at: recordStation(c.at) })),
        cuts,
      );
      const groundRuns = groundAlong(records, (e) => readRoadPalette(main, e).ground);
      const ground = {
        left: groundRuns.left.map(([s, m], i) => [i === 0 ? 0 : s + back, m] as const),
        right: groundRuns.right.map(([s, m], i) => [i === 0 ? 0 : s + back, m] as const),
      };
      const reach = Math.max(...records.map((r) => Math.max(...recordLimits(main, r).map(Math.abs))));
      // Its skies: the stage's start's, then each change of set, mode or scene where its record starts.
      const changes = skyChanges(
        records.map((r) => ({ mode: backgroundMode(main, r), scene: r.scene, palette: r.palette })),
        STAGE_SETS[stage]!,
        (a, b) => {
          const [p, q] = [readRoadPalette(main, a), readRoadPalette(main, b)];
          return paletteTicks([...p.body, ...p.ground], [...q.body, ...q.ground]);
        },
      );
      const skyKnots = changes
        .filter(
          (c, i) =>
            i === 0 ||
            skyName(c.set, c.mode, c.scene) !==
              skyName(changes[i - 1]!.set, changes[i - 1]!.mode, changes[i - 1]!.scene),
        )
        .map((c, i, all) => ({
          s: i === 0 ? 0 : c.record * RECORD_METRES + back,
          image: skyName(c.set, c.mode, c.scene),
          transition: i > 0 && c.scene !== all[i - 1]!.scene ? SCENE_FADE_TICKS * tickMetres : 0,
          sky: c,
        }));
      for (const k of skyKnots)
        if (!skies.has(k.image)) {
          skies.add(k.image);
          outputs.file(
            `images/${k.image}.json`,
            JSON.stringify(bakeSky(k.image, chaseHqSky(main, tiles, k.sky.set, k.sky.mode, k.sky.scene), 1)),
          );
        }
      const path = new CoursePath(pieces);
      const yawOrigin = skyYawOrigin(SKY_MIDDLE, SKY_TURN);
      const color = (c: RoadColor, r: ChaseHqRecord) => {
        if ('stage' in c) return picture.stageColors(stage)[c.stage]!;
        const p = readRoadPalette(main, r.palette);
        return [...p.body, ...p.ground][c.road]!;
      };
      const colors = (r: ChaseHqRecord) => ({
        edge: picture.banks.map((b) => color(b.edge[0]!, r)),
        body: picture.banks.map((b) => color(b.body, r)),
      });
      const groundColor = (r: ChaseHqRecord) =>
        baseColor({ left: 0, right: 0, colors: picture.banks.map((b) => color(b.ground, r)), material: 'SAND' });
      // A Section's centre lane, which the Link before it continues: the first of c, d, b, e, a and f wide all the way
      // from its start to the next cut, within which every Section that starts there ends.
      // A lane's width at `s`, at a cut the one after it, or with `before` the one before it.
      const laneWidthAt = (k: number, s: number, before = false) => {
        const pieces = lanes[k]!.pieces;
        return ([...pieces].reverse().find((p) => p.from <= s + (before ? -1e-9 : 1e-9)) ?? pieces[0]!).width(s);
      };
      const centreFrom = (from: number) => {
        const to = cuts.find((c) => c > from + 1e-6) ?? length;
        const along = [
          from,
          ...Array.from({ length: Math.ceil((to - from) / STEP_METRES) }, (_, k) =>
            Math.min(to, from + (k + 1) * STEP_METRES),
          ),
        ];
        const lane = ['c', 'd', 'b', 'e', 'a', 'f'].find((l) =>
          along.every((s) => laneWidthAt(LANES.indexOf(l), s, s === to) > 0),
        );
        if (!lane) throw contractUnmet(`${name} has no lane wide all the way from ${from} m`);
        return lane;
      };
      // A record's drawn mask's sides, metres right of P.
      const maskSides = (r: ChaseHqRecord): readonly [number, number] => {
        const set = setLanes(sub, r).map((l) => LANES.indexOf(l));
        return [(set[0]! - 3) * LANE_METRES, (set.at(-1)! - 2) * LANE_METRES];
      };
      // The course's lanes' sides at station `s`, metres right of P.
      const laneSides = (s: number): readonly [number, number] => [
        -[0, 1, 2].reduce((sum, k) => sum + laneWidthAt(k, s), 0),
        [3, 4, 5].reduce((sum, k) => sum + laneWidthAt(k, s), 0),
      ];
      const edge = picture.edgeMetres;
      // A road's picture as two roads draw it (`compositeOf`): an edge band, its body over its lanes and an edge band,
      // each edge's `at` its place on a road of one lane either side of its P; where two roads are drawn, each edge lies
      // where its lanes pass.
      const road: RoadPicture = [
        { at: -LANE_METRES - edge, right: 'edge' },
        { at: -LANE_METRES, right: 'surface' },
        { at: LANE_METRES, right: 'edge' },
        { at: LANE_METRES + edge, right: 'outside' },
      ];
      const feature = (e: FeatureEdge) => road.findIndex((f) => f.at === e.at);
      // The road not taken over a Section's stretch `[a, b]` of the fork's 197 m, drawn with the course's road as two
      // roads (`compositeOf`) in the TC0150ROD's order (`levels`), the course's road 0 (its road A) and the road not
      // taken road 1 (its road B): its sides two Boundaries straight
      // between its table's steps; its body over its lanes, and each edge band the picture shows a Strip between its
      // two features' edges, cut where the picture's arrangement changes (`arrangements`) and drawn in where it narrows
      // to nothing (`drawnIntervals`); its material within the limits, and the ground between the two roads where it
      // is no wider than `OPEN` asphalt (`narrowGround`, each road's facing half its edge band beyond its lanes).
      const roadNotTakenParts = (
        [a, b]: readonly [number, number],
        present: readonly string[],
        positionAt: (s: number) => CoursePosition,
      ) => {
        const kOf = (s: number) => (s - forkAt) / (notTakenAt(1) - forkAt);
        const offsetAt = (s: number) => {
          const k = kOf(s),
            k0 = Math.floor(k + 1e-9);
          return notTaken.offset(k0) + (notTaken.offset(k0 + 1) - notTaken.offset(k0)) * (k - k0);
        };
        // Every edge is straight between the table's steps, on which the lanes' steps lie.
        const knots = [
          a,
          ...Array.from({ length: notTaken.steps + 1 }, (_, k) => notTakenAt(k)).filter(
            (s) => s > a + 1e-6 && s < b - 1e-6,
          ),
          b,
        ];
        const sideOf = (s: number) => {
          const [l, r] = notTaken.edges(at(s));
          return [offsetAt(s) + l, offsetAt(s) + r] as const;
        };
        const boundaries = [0, 1].map((k) => ({
          id: k === 0 ? 'not-taken-left' : 'not-taken-right',
          knots: simplified(knots.map((s) => [s, micrometre(sideOf(s)[k]!)] as [number, number])).map(
            ([s, lateral]) => ({ at: positionAt(s), lateral }),
          ),
        }));
        const left = { boundary: 'not-taken-left', offset: 0 },
          right = { boundary: 'not-taken-right', offset: 0 };
        // Each road's picture's edges at `s`, metres right of P, and as the Section writes them.
        const edgesAt = (s: number) => {
          const [l, r] = laneSides(s),
            [bl, br] = sideOf(s);
          return [
            [l - edge, l, r, r + edge],
            [bl - edge, bl, br, br + edge],
          ];
        };
        const [first, last] = [present[0]!, present.at(-1)!];
        const written: readonly (readonly Lateral[])[] = [
          [
            { lane: first, side: 'left', offset: -edge },
            { lane: first, side: 'left', offset: 0 },
            { lane: last, side: 'right', offset: 0 },
            { lane: last, side: 'right', offset: edge },
          ],
          [{ ...left, offset: -edge }, left, right, { ...right, offset: edge }],
        ];
        const regimes = arrangements(
          a,
          b,
          knots,
          (s) => edgesAt(s).flat(),
          (s) => {
            const intervals = compositeOf(edgesAt(s), [road, road], levels);
            return { key: JSON.stringify(intervals), intervals };
          },
        );
        const across = (i: { left: FeatureEdge; right: FeatureEdge }) => (s: number) =>
          edgesAt(s)[i.right.road]![feature(i.right)]! - edgesAt(s)[i.left.road]![feature(i.left)]!;
        const r = recordAt(at(a));
        const edgeColor = baseColor({ left: 0, right: 0, colors: colors(r).edge, material: 'ASPHALT' });
        const bodyColor = baseColor({ left: 0, right: 0, colors: colors(r).body, material: 'ASPHALT' });
        const strips = [
          stripElement(positionAt(a), positionAt(b), left, right, bodyColor, null),
          ...[...drawnIntervals(regimes, across)].map(({ interval, from, to }) =>
            stripElement(
              positionAt(from),
              positionAt(to),
              written[interval.left.road]![feature(interval.left)]!,
              written[interval.right.road]![feature(interval.right)]!,
              edgeColor,
              null,
            ),
          ),
        ];
        // Its material where its inner edge band lies within the limit on its side (a tunnel's wall may leave it all
        // out), and the ground between the roads where it is no wider than OPEN, both measured outward from the course:
        // that from the course's edge band to the road not taken's lanes, sides that never cross where the ground
        // narrows to nothing.
        const material = roadMaterial(other[Math.floor(at(a) / RECORD_METRES + 1e-9)]!);
        const [limitLeft, limitRight] = recordLimits(main, r);
        const onRight = notTaken.beside === 'right';
        const outward = (f: (s: number) => number) =>
          straightThrough(knots.map((s) => [s, (onRight ? 1 : -1) * f(s)] as const));
        const inner = outward((s) => (onRight ? sideOf(s)[0] - edge : sideOf(s)[1] + edge));
        const apart = outward((s) => (onRight ? sideOf(s)[0] - laneSides(s)[1] : sideOf(s)[1] - laneSides(s)[0]) / 2);
        const over = [
          ...inner
            .atMost(onRight ? limitRight : -limitLeft)
            .map((q) =>
              onRight
                ? stripElement(
                    positionAt(q.from),
                    positionAt(q.to),
                    written[1]![0]!,
                    { boundary: 'outer-right', offset: 0 },
                    null,
                    material,
                  )
                : stripElement(
                    positionAt(q.from),
                    positionAt(q.to),
                    { boundary: 'outer-left', offset: 0 },
                    written[1]![3]!,
                    null,
                    material,
                  ),
            ),
          ...narrowGround(apart, [edge, edge], 1).map((q) =>
            onRight
              ? stripElement(positionAt(q.from), positionAt(q.to), written[0]![3]!, written[1]![1]!, null, material)
              : stripElement(positionAt(q.from), positionAt(q.to), written[1]![2]!, written[0]![0]!, null, material),
          ),
        ];
        return { strips, over, boundaries };
      };
      const laid = layRoad({
        id,
        name,
        pieces,
        cuts,
        reach,
        road: { bends: rise.changes.map(bendOf), kinks: rise.kinks },
        grids: stand(back),
        checkpoints: [],
        finish: { id: `${id}-GOAL`, s: back + goal },
        section: (span, positionAt) => {
          const steps = (from: number, to: number) => {
            const out = [from];
            for (
              let s = Math.ceil((from - back) / STEP_METRES + 1e-3) * STEP_METRES + back;
              s < to - 1e-3;
              s += STEP_METRES
            )
              out.push(s);
            return [...out, to];
          };
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
          // P lies between lanes c and d: the centre lane c's centre half its width left of it, else d's half right.
          const centerLane = centreFrom(span.from);
          const centre = simplified(
            steps(span.from, span.to).map((s) => [
              s,
              micrometre(((centerLane === 'c' ? -1 : 1) * widthOf(LANES.indexOf(centerLane), s)) / 2),
            ]),
          );
          const linkLane = centreFrom(span.to);
          const shifted = (s: number) => positionAt(s + back);
          // The stretch of the fork's 197 m within the Section, where the road not taken is drawn.
          const twoRoads = [Math.max(span.from, forkAt), Math.min(span.to, forkEnd)] as const;
          const drawn = twoRoads[1] - twoRoads[0] > 1e-6;
          const bands = spanBands(
            sub,
            records,
            { from: at(span.from), to: at(span.to) },
            picture.edgeMetres,
            colors,
            shifted,
            [present[0]!, present.at(-1)!],
            span.from >= narrowing - 1e-6 && span.to <= forkAt + 1e-6 ? maskSides(recordAt(at(forkAt) - 1)) : undefined,
            drawn ? { from: at(twoRoads[0]), to: at(twoRoads[1]) } : undefined,
          );
          const notTakenParts = drawn
            ? roadNotTakenParts(twoRoads, present, positionAt)
            : { strips: [], over: [], boundaries: [] };
          const [left, right] = recordLimits(main, recordAt(at(span.from)));
          const beyondCuts = [
            span.from,
            ...steps(span.from, span.to)
              .slice(1, -1)
              .filter((s) => recordAt(at(s)).palette !== recordAt(at(s) - STEP_METRES).palette),
            span.to,
          ];
          const beyond = beyondCuts
            .slice(0, -1)
            .flatMap((a, j) =>
              [-1, 1].map((sideOf) =>
                stripElement(
                  positionAt(a),
                  positionAt(beyondCuts[j + 1]!),
                  sideOf < 0 ? null : bands.outermost[1].right,
                  sideOf < 0 ? bands.outermost[0].left : null,
                  groundColor(recordAt(at(a))),
                  null,
                ),
              ),
            );
          const turned = ((path.pose(span.from).heading - path.pose(back).heading) * 180) / Math.PI;
          const yaw = micrometre(sectionYawOrigin(yawOrigin, turned));
          const environment = (k: (typeof skyKnots)[number], s: number): EnvironmentDocument => ({
            at: positionAt(s),
            name: `STAGE ${stage + 1}`,
            background: { image: k.image, horizonY: SKY_HORIZON, yawOrigin: yaw },
            transition: s === span.from ? 0 : micrometre(k.transition),
          });
          const inForce = [...skyKnots].reverse().find((k) => k.s <= span.from + 1e-6)!;
          return {
            lanes: laneDocs,
            centerLane,
            centerLateral: centre.every(([, v]) => v === centre[0]![1])
              ? centre[0]![1]
              : centre.map(([s, lateral]) => ({ at: positionAt(s), lateral })),
            linkLane,
            strips: [...beyond, ...bands.strips, ...notTakenParts.strips],
            boundaries: notTakenParts.boundaries,
            over: notTakenParts.over,
            outermost: bands.outermost,
            limits: {
              left: [
                [span.from, left],
                [span.to, left],
              ],
              right: [
                [span.from, right],
                [span.to, right],
              ],
              ground,
            },
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
        goal,
        sections: laid.spans.length,
        // Where it crosses itself, metres along it, and how far its second passage lies above its first.
        crossings: crossed.map(([a, b]) => ({
          at: [round1(a), round1(b)],
          apart: round3(profile.height(b) - profile.height(a)),
        })),
        // Where the original changes its lanes at once and the course over 12.3 m (K, 2026-11-08), metres.
        lanesAtOnce: masks.atOnce.map((s) => round1(s + back)),
        heights: { departs: round3(departs), runs: rise.runs, gradeDeparture: round3(rise.departure) },
        skies: skyKnots.map((k) => ({ at: round1(k.s), image: k.image, transition: round1(k.transition) })),
        ground: ground.left.map(([s, m]) => [round1(s), m]),
      };
    }),
  ).flat();
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

export const CHASE_HQ_CONVERSION: Conversion = (set) => {
  const { outputs, report } = chaseHqCourses(set);
  return { outputs, report: { conversion: CHASE_HQ_CONVERSION_VERSION, ...report } };
};
