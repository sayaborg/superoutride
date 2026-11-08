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
import { partedStrips, type Material } from '../shared/road-surface.js';
import { colorStretches, joinedChanges } from '../shared/color-stretches.js';
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
  type SkyChange,
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
  beside,
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

export const CHASE_HQ_CONVERSION_VERSION = 6;

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
      // Its skies and colors: the stage's start's, then each change of set, mode, scene or road palette where its record
      // starts, over the ticks it takes (the scene's fade, the road palette's steps, the longer) at top speed without
      // the turbo; changes the next of which begins before it has ended joined into one (`joinedChanges`).
      const recordChanges = skyChanges(
        records.map((r) => ({ mode: backgroundMode(main, r), scene: r.scene, palette: r.palette })),
        STAGE_SETS[stage]!,
        (a, b) => {
          const [p, q] = [readRoadPalette(main, a), readRoadPalette(main, b)];
          return paletteTicks([...p.body, ...p.ground], [...q.body, ...q.ground]);
        },
      );
      const changes = joinedChanges(
        recordChanges,
        recordChanges.slice(1).map((c) => ({ at: c.record * RECORD_METRES + back, length: c.ticks * tickMetres })),
      );
      const stretches = colorStretches(changes.colors, changes.changes, 0, length);
      const skyKnots = changes.colors.map((c, i) => ({
        s: i === 0 ? 0 : changes.changes[i - 1]!.at,
        image: skyName(c.set, c.mode, c.scene),
        transition: i === 0 ? 0 : changes.changes[i - 1]!.length,
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
      // A color of the road's in a set (a change's road palette entry).
      const color = (c: RoadColor, set: SkyChange) => {
        if ('stage' in c) return picture.stageColors(stage)[c.stage]!;
        if ('fixed' in c) return c.fixed;
        const p = readRoadPalette(main, set.palette);
        return [...p.body, ...p.ground][c.road]!;
      };
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
      // Its stripes: the banks step along the road from the stage's start, eight a record, each Strip's colors its
      // bank's in its colors' stretch (`partedStrips`).
      const banked = (pick: (b: (typeof picture.banks)[number]) => RoadColor) => (set: SkyChange) =>
        picture.banks.map((b) => color(pick(b), set));
      const edgeBanks = banked((b) => b.edge[0]!);
      const bodyBanks = banked((b) => b.body);
      const groundBanks = banked((b) => b.ground);
      // A Section as its Strips are written: its start's station, its size as written and its stations' Positions.
      interface SectionFrame {
        readonly from: number;
        readonly to: number;
        readonly size: number;
        readonly positionAt: (s: number) => CoursePosition;
      }
      // A band's Strips over stations `[a, b]` of a Section, in Section metres as it writes them, so that a repeat's
      // last stripe ends within it as the Section resolves it.
      const parted = (
        a: number,
        b: number,
        left: Lateral | null,
        right: Lateral | null,
        pick: (set: SkyChange) => readonly number[],
        under: ((set: SkyChange) => readonly number[]) | null,
        material: Material | null,
        frame: SectionFrame,
      ) => {
        const local = (s: number) => Math.min(frame.size, micrometre(s - frame.from));
        const at = (x: number) => frame.positionAt(x >= frame.size - 1e-9 ? frame.to : frame.from + x);
        return partedStrips(
          stretches.map((t) => ({ ...t, from: t.from - frame.from, to: t.to - frame.from })),
          pick,
          under,
          RECORD_METRES,
          back - frame.from,
          local(a),
          local(b),
          material,
          (x, y, c, m) => stripElement(at(x), at(y), left, right, c, m),
        );
      };
      // A road's picture as the TC0150ROD draws it at its nearest row, metres from its centre: an edge band, its body
      // over six lanes with the lines its body line draws (those beyond six lanes lie under its edges), an edge band. A
      // road laid where it passes (`compositeOf`) draws its lines only within its body's sides, each clipped to them.
      const half = 3 * LANE_METRES;
      const lines = picture.lines.filter((l) => l.left >= -half && l.right <= half);
      const road: RoadPicture = [
        { at: -half - edge, right: 'edge' },
        { at: -half, right: 'surface' },
        ...lines.flatMap((l) => [
          { at: l.left, right: 'line' as const },
          { at: l.right, right: 'surface' as const },
        ]),
        { at: half, right: 'edge' },
        { at: half + edge, right: 'outside' },
      ];
      const lineAt = lines.flatMap((l) => [l.left, l.right]);
      const feature = (e: FeatureEdge) => road.findIndex((f) => f.at === e.at);
      /** A road as its picture is laid: its body's sides at `s` (metres right of P), its centre, and how each is written. */
      interface LaidRoad {
        readonly sides: (s: number) => readonly [number, number];
        readonly centre: (s: number) => number;
        readonly written: readonly [Lateral, Lateral];
        readonly line: (x: number) => Lateral;
      }
      // A laid road's picture's edges at `s`, its lines clipped to its body's sides, and which side each line's edge is
      // clipped to (-1, 1, or 0 where it lies within).
      const placed = (r: LaidRoad, s: number) => {
        const [l, rr] = r.sides(s);
        const c = r.centre(s);
        // A line's edge within a micrometre of a side lies on it, as the Section writes laterals.
        const clips = lineAt.map((x) => (c + x < l + 1e-6 ? -1 : c + x > rr - 1e-6 ? 1 : 0));
        return {
          edges: [
            l - edge,
            l,
            ...lineAt.map((x, k) => (clips[k]! < 0 ? l : clips[k]! > 0 ? rr : c + x)),
            rr,
            rr + edge,
          ],
          clips,
        };
      };
      // The Strips of laid roads' pictures over `[a, b]`, the roads straight between `knots`: each line, and with
      // `edges` each edge band, the pictures show in the TC0150ROD's order, between its two features' edges, cut where
      // the arrangement changes (`arrangements`, a line clipped where a body's side crosses it) and drawn in where it
      // narrows to nothing (`drawnIntervals`), striped by its banks, a line only where its color is not the body's.
      const pictureStrips = (
        a: number,
        b: number,
        roads: readonly LaidRoad[],
        knots: readonly number[],
        edges: boolean,
        frame: SectionFrame,
      ) => {
        const breaks = [...knots];
        for (let i = 0; i + 1 < knots.length; i++) {
          const [s0, s1] = [knots[i]!, knots[i + 1]!];
          for (const r of roads)
            for (const x of lineAt)
              for (const k of [0, 1]) {
                const d = (s: number) => r.centre(s) + x - r.sides(s)[k]!;
                const [d0, d1] = [d(s0), d(s1)];
                if (d0 * d1 < 0) breaks.push(s0 + ((s1 - s0) * d0) / (d0 - d1));
              }
        }
        const edgesAt = (s: number) => roads.map((r) => placed(r, s).edges);
        const regimes = arrangements(
          a,
          b,
          breaks,
          (s) => edgesAt(s).flat(),
          (s) => {
            const clips = roads.map((r) => placed(r, s).clips);
            const list = compositeOf(
              edgesAt(s),
              roads.map(() => road),
              levels,
            ).map((i) => ({ ...i, clips }));
            return { key: JSON.stringify(list), intervals: list };
          },
        );
        const writtenAt = (e: FeatureEdge, clips: readonly (readonly number[])[]) => {
          const r = roads[e.road]!;
          const k = feature(e);
          if (k === 0) return beside(r.written[0], -edge);
          if (k === road.length - 1) return beside(r.written[1], edge);
          if (k === 1) return r.written[0];
          if (k === road.length - 2) return r.written[1];
          const clip = clips[e.road]![k - 2]!;
          return clip < 0 ? r.written[0] : clip > 0 ? r.written[1] : r.line(lineAt[k - 2]!);
        };
        const across = (i: { left: FeatureEdge; right: FeatureEdge }) => (s: number) =>
          edgesAt(s)[i.right.road]![feature(i.right)]! - edgesAt(s)[i.left.road]![feature(i.left)]!;
        return [...drawnIntervals(regimes, across)].flatMap(({ interval, from, to }) => {
          if (interval.paint === 'edge' && !edges) return [];
          const [left, right] = [writtenAt(interval.left, interval.clips), writtenAt(interval.right, interval.clips)];
          if (interval.paint === 'edge') return parted(from, to, left, right, edgeBanks, null, null, frame);
          const k = [feature(interval.left), feature(interval.right)].find((j) => j >= 2 && j < road.length - 2)!;
          const pen = lines[Math.floor((k - 2) / 2)]!.pen;
          return parted(
            from,
            to,
            left,
            right,
            banked((b) => b.pens[pen]!),
            bodyBanks,
            null,
            frame,
          );
        });
      };
      // Sides as a Section writes them: their values at `knots` to the micrometre, straight between.
      const writtenSides = (knots: readonly number[], f: (s: number) => readonly [number, number]) => {
        const values = knots.map((s) => f(s).map(micrometre) as unknown as readonly [number, number]);
        return (s: number): readonly [number, number] => {
          let i = 0;
          while (i + 2 < knots.length && s > knots[i + 1]!) i++;
          const [a, b] = [knots[i]!, knots[i + 1] ?? knots[i]!];
          const t = b > a ? Math.min(1, Math.max(0, (s - a) / (b - a))) : 0;
          const [p, q] = [values[i]!, values[i + 1] ?? values[i]!];
          return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
        };
      };
      // The course's lanes' sides at `s` as a Section writes its lanes, each lane's width to the micrometre.
      // (at its Section's end `end`, the widths before the cut).
      const writtenLaneSides =
        (end: number) =>
        (s: number): readonly [number, number] => [
          -[0, 1, 2].reduce((sum, k) => sum + micrometre(laneWidthAt(k, s, s === end)), 0),
          [3, 4, 5].reduce((sum, k) => sum + micrometre(laneWidthAt(k, s, s === end)), 0),
        ];
      // The course's road laid over a Section straight between `knots`: its lanes' sides, or `across` (metres right of P)
      // where its picture is not its lanes'; its centre P.
      const courseRoad = (
        present: readonly string[],
        knots: readonly number[],
        end: number,
        across?: readonly [number, number],
      ): LaidRoad => ({
        sides: across ? () => across : writtenSides(knots, writtenLaneSides(end)),
        centre: () => 0,
        written: across ?? [
          { lane: present[0]!, side: 'left', offset: 0 },
          { lane: present.at(-1)!, side: 'right', offset: 0 },
        ],
        line: (x) => micrometre(x),
      });
      // The road not taken over a Section's stretch `[a, b]` of the fork's 197 m, drawn with the course's road as two
      // roads (`pictureStrips`) in the TC0150ROD's order (`levels`), the course's road 0 (its road A) and the road not
      // taken road 1 (its road B): its sides and its centre three Boundaries straight between its table's steps; its
      // body over its lanes, striped as the course's, and each edge band and line the pictures show; its material
      // within the limits, and the ground between the two roads where it is no wider than `OPEN` asphalt
      // (`narrowGround`, each road's facing half its edge band beyond its lanes).
      const roadNotTakenParts = (
        [a, b]: readonly [number, number],
        present: readonly string[],
        end: number,
        frame: SectionFrame,
      ) => {
        const { positionAt } = frame;
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
        // The knots on the heights' steps, where the Section writes its lanes, straight between.
        const onSteps = knots.filter(
          (s, i) =>
            i === 0 ||
            i === knots.length - 1 ||
            Math.abs((s - back) / STEP_METRES - Math.round((s - back) / STEP_METRES)) < 1e-6,
        );
        const sideOf = (s: number) => {
          const [l, r] = notTaken.edges(at(s));
          return [offsetAt(s) + l, offsetAt(s) + r] as const;
        };
        const boundaryOf = (id: string, f: (s: number) => number) => ({
          id,
          knots: simplified(knots.map((s) => [s, micrometre(f(s))] as [number, number])).map(([s, lateral]) => ({
            at: positionAt(s),
            lateral,
          })),
        });
        const boundaries = [
          boundaryOf('not-taken-left', (s) => sideOf(s)[0]),
          boundaryOf('not-taken-right', (s) => sideOf(s)[1]),
          boundaryOf('not-taken-centre', offsetAt),
        ];
        const left = { boundary: 'not-taken-left', offset: 0 },
          right = { boundary: 'not-taken-right', offset: 0 };
        const notTakenRoad: LaidRoad = {
          sides: writtenSides(knots, sideOf),
          centre: offsetAt,
          written: [left, right],
          line: (x) => ({ boundary: 'not-taken-centre', offset: micrometre(x) }),
        };
        // Its colors and stripes the course's (`chaseHqRoadLevels`: its banks are the course's row by row).
        const strips = [
          ...parted(a, b, left, right, bodyBanks, null, null, frame),
          ...pictureStrips(a, b, [courseRoad(present, onSteps, end), notTakenRoad], knots, true, frame),
        ];
        // Its material where its inner edge band lies within the limit on its side (a tunnel's wall may leave it all
        // out), and the ground between the roads where it is no wider than OPEN, both measured outward from the course:
        // that from the course's edge band to the road not taken's lanes, sides that never cross where the ground
        // narrows to nothing.
        const material = roadMaterial(other[Math.floor(at(a) / RECORD_METRES + 1e-9)]!);
        const [limitLeft, limitRight] = recordLimits(main, recordAt(at(a)));
        const onRight = notTaken.beside === 'right';
        const outward = (f: (s: number) => number) =>
          straightThrough(knots.map((s) => [s, (onRight ? 1 : -1) * f(s)] as const));
        const inner = outward((s) => (onRight ? sideOf(s)[0] - edge : sideOf(s)[1] + edge));
        const apart = outward((s) => (onRight ? sideOf(s)[0] - laneSides(s)[1] : sideOf(s)[1] - laneSides(s)[0]) / 2);
        const course = courseRoad(present, onSteps, end).written;
        const over = [
          ...inner
            .atMost(onRight ? limitRight : -limitLeft)
            .map((q) =>
              onRight
                ? stripElement(
                    positionAt(q.from),
                    positionAt(q.to),
                    beside(left, -edge),
                    { boundary: 'outer-right', offset: 0 },
                    null,
                    material,
                  )
                : stripElement(
                    positionAt(q.from),
                    positionAt(q.to),
                    { boundary: 'outer-left', offset: 0 },
                    beside(right, edge),
                    null,
                    material,
                  ),
            ),
          ...narrowGround(apart, [edge, edge], 1).map((q) =>
            onRight
              ? stripElement(positionAt(q.from), positionAt(q.to), beside(course[1], edge), left, null, material)
              : stripElement(positionAt(q.from), positionAt(q.to), right, beside(course[0], -edge), null, material),
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
          const frame = { from: span.from, to: span.to, size: positionAt(span.to).offset, positionAt };
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
          // The stretch of the fork's 197 m within the Section, where the road not taken is drawn.
          const twoRoads = [Math.max(span.from, forkAt), Math.min(span.to, forkEnd)] as const;
          const drawn = twoRoads[1] - twoRoads[0] > 1e-6;
          const across =
            span.from >= narrowing - 1e-6 && span.to <= forkAt + 1e-6 ? maskSides(recordAt(at(forkAt) - 1)) : undefined;
          const bands = spanBands(
            sub,
            records,
            { from: at(span.from), to: at(span.to) },
            picture.edgeMetres,
            [present[0]!, present.at(-1)!],
            across,
            drawn ? { from: at(twoRoads[0]), to: at(twoRoads[1]) } : undefined,
          );
          // Its road's bands, striped, an edge the picture of two roads colors its material alone.
          const bandStrips = bands.pieces.flatMap((q) => {
            const [from, to] = [q.from + back, q.to + back];
            if (q.pictured) return [stripElement(positionAt(from), positionAt(to), q.left, q.right, null, q.material)];
            return parted(from, to, q.left, q.right, q.band === 1 ? bodyBanks : edgeBanks, null, q.material, frame);
          });
          // Its lines, where the road not taken is not drawn: the course's road's picture alone, straight between the
          // lanes' steps.
          const lineStrips = [
            [span.from, drawn ? twoRoads[0] : span.to],
            [drawn ? twoRoads[1] : span.to, span.to],
          ]
            .filter(([sa, sb]) => sb! - sa! > 1e-6)
            .flatMap(([sa, sb]) =>
              pictureStrips(
                sa!,
                sb!,
                [courseRoad(present, steps(sa!, sb!), span.to, across)],
                steps(sa!, sb!),
                false,
                frame,
              ),
            );
          const notTakenParts = drawn
            ? roadNotTakenParts(twoRoads, present, span.to, frame)
            : { strips: [], over: [], boundaries: [] };
          const [left, right] = recordLimits(main, recordAt(at(span.from)));
          // The ground beyond the road's outermost bands, striped.
          const beyond = [-1, 1].flatMap((sideOf) =>
            parted(
              span.from,
              span.to,
              sideOf < 0 ? null : bands.outermost[1].right,
              sideOf < 0 ? bands.outermost[0].left : null,
              groundBanks,
              null,
              null,
              frame,
            ),
          );
          const turned = ((path.pose(span.from).heading - path.pose(back).heading) * 180) / Math.PI;
          const yaw = micrometre(sectionYawOrigin(yawOrigin, turned));
          const environment = (k: (typeof skyKnots)[number], s: number): EnvironmentDocument => ({
            at: positionAt(s),
            name: `STAGE ${stage + 1}`,
            background: { image: k.image, horizonY: SKY_HORIZON, yawOrigin: yaw },
            // A change begun in a Section before continues into this one, which begins with its new sky.
            transition: k.s < span.from - 1e-6 ? 0 : micrometre(k.transition),
          });
          const inForce = [...skyKnots].reverse().find((k) => k.s <= span.from + 1e-6)!;
          return {
            lanes: laneDocs,
            centerLane,
            centerLateral: centre.every(([, v]) => v === centre[0]![1])
              ? centre[0]![1]
              : centre.map(([s, lateral]) => ({ at: positionAt(s), lateral })),
            linkLane,
            strips: [...beyond, ...bandStrips, ...lineStrips, ...notTakenParts.strips],
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
        // How many of its records' changes joined the change before them, as one.
        joined: recordChanges.length - changes.colors.length,
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
