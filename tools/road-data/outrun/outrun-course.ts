/** OUTRUN's conversion ([OUTRUN road data](../../../docs/outrun-road-data.md)). */
import { CAMERA_DEFINITION } from '../../../src/view/camera-definition.js';
import { boardNames, boardShapes, liftedUse, sceneryBoards, type BoardUse } from './outrun-boards.js';
import { OBJECT_ROUTINES, sceneryRoutine, startObjects } from './outrun-sprites.js';
import { cameraDistance } from '../../../src/view/camera.js';
import { OUTRUN_NAMES } from './outrun-constants.js';
import { OUTRUN_ROUTES, outrunRoad, routeName, routeSpans } from './outrun-layout.js';
import { checkRoadRom, LANE, readStartWidth } from './outrun-cross-section.js';
import { instruction, word } from '../sega-16/program-words.js';
import { micrometre } from '../shared/section-writing.js';
import { roadObjects, type ObjectPlacement } from './outrun-scenery.js';
import { stageSky } from './outrun-backgrounds.js';
import { bakeSky, SKY_HORIZON } from '../shared/sky-baking.js';
import { lineAhead } from '../out-run-hardware/object-approach.js';
import { figureUse, goalFigurePlacements, goalFigures, readGoalStop } from './outrun-goal-figures.js';
import {
  OUTRUN_STAGES,
  readForkStretch,
  readGoalStretches,
  readSceneryType,
  goalNumber,
  lineDistances,
  readClock,
  readStage,
  readStageChangeFrames,
  readTopKmh,
  stageLength,
  type Stage,
  OUTRUN_HEIGHT_TABLES,
} from './outrun-road.js';
import { readHeightTable } from '../out-run-hardware/road-tables.js';
import {
  overpassReport,
  fidelityReport,
  gradeReport,
  round1,
  OriginalOutputs,
  type Conversion,
} from '../shared/conversion.js';
import type { OutrunPrograms } from './outrun-rom.js';
import { assemblePrograms, assembleTiles, assembleSprites } from './outrun-rom.js';
import { PIXEL_ASPECT } from '../sega-16/display.js';
import { UNIT_METRES } from '../out-run-hardware/constants.js';

/** The conversion's version, recorded in the specification beside the courses it wrote. */
export const CONVERSION_VERSION = 65;

/** outrun's conversion: its courses, pictures and skies raised from the ROMs, and its report. */
export const OUTRUN_CONVERSION: Conversion = (set) => {
  // OUTRUN's roads from the ROMs, the boards of every sprite its stages, fork and goal stretches and start show, and
  // each stage's sky as published, written to content, or with `--check` compared with the ones there.
  const outputs = new OriginalOutputs();
  const programs = assemblePrograms(set);
  const tiles = assembleTiles(set);
  // The roads' lines and edges as this conversion draws them are the road ROM's.
  checkRoadRom(set);
  const stages = new Map(OUTRUN_STAGES.flat().map((number) => [number, readStage(programs, number)]));
  const fork = readForkStretch(programs);
  const goals = readGoalStretches(programs);
  const names = new Set(
    [...stages.values(), fork, ...goals.stretches].flatMap((s) =>
      s.widthsHeights.filter((p) => p.kind === 0).map((p) => p.value),
    ),
  );
  const tables = new Map([...names].map((n) => [n, readHeightTable(programs.sub, n, OUTRUN_HEIGHT_TABLES)]));
  const nameOf = (stage: Stage) => OUTRUN_NAMES.get(stage.number)!;
  const clock = readClock(programs);
  const kmh = readTopKmh(programs);
  const distances = lineDistances(programs, clock);
  const ahead = (line: number) => lineAhead(distances, line);
  const inputs = {
    rows: OUTRUN_STAGES,
    stages,
    fork,
    goals,
    goalOf: (row: number, column: number) => goalNumber(programs.main, row, column),
    idOf: (stage: Stage) => slug(nameOf(stage)),
    startWidth: readStartWidth(programs.main),
    clock,
  };
  // What lies on the ground, its materials beneath it, and each board's width and reach across.
  const { uses, skipped } = outrunSceneryUses(programs);
  const words = assembleSprites(set);
  const { colored, extents } = boardShapes(programs.main, words, uses);
  const boardImage = boardNames(uses);
  const starts = startObjects(programs.main);
  const goalStop = readGoalStop(programs.main);
  const roads = OUTRUN_ROUTES.map((route) =>
    outrunRoad(routeSpans(route, inputs), {
      id: route.id,
      name: routeName(route, OUTRUN_ROUTES),
      tables,
      distances,
      kmh,
      changeFrames: readStageChangeFrames(programs, clock),
      cameraDistance: cameraDistance(CAMERA_DEFINITION),
      stageName: nameOf,
      sky: (stage) => ({ image: skyName(stage.number), horizonY: SKY_HORIZON }),
      extents,
      colored,
      objects: (points, road) => {
        const { placements, checkpoints, dropped, ended, start } = roadObjects(programs.main, points, {
          ...road,
          ahead,
          starts,
          clock,
        });
        // The figures after each goal, standing before where the camera stops.
        const figures = goalFigurePlacements(programs.main, road.goals, { ...road, ahead });
        // No car passes where the original stops it after a goal: what stands beyond has no body, as the figures.
        const beyond = (o: ObjectPlacement) => road.goals.some(({ position }) => o.position > position + goalStop);
        const unreached = placements.filter((o) => o.hit !== null && beyond(o)).length;
        const reached = placements.map((o) => (o.hit !== null && beyond(o) ? { ...o, hit: null } : o));
        // Each board's image as it is drawn: `-unshaded` where it floats and the same board stands elsewhere.
        const named = (o: ObjectPlacement) => ({ ...o, image: boardImage(o.image, o.shades) });
        return {
          placements: [...reached, ...figures].map(named).sort((a, b) => a.position - b.position || a.x - b.x),
          // The checkpoint banner's left half (drawing 6) passing the car: the original's time extension.
          checkpoints,
          report: { dropped, ended, start, figures: figures.length, unreached },
        };
      },
    }),
  );
  // SAND reaches the car's lateral limit: 0xC2B0 holds its x (0x260050) within the word it adds at 0xC2CA (0xE2F4)
  // of its road's centre, that far beyond the road's three lanes about it.
  const [high, low] = instruction(programs.main, 0xc2ca, [0xd079, null, null], "the car's lateral limit");
  const ground = micrometre((word(programs.main, high! * 0x10000 + low!) - (3 * LANE) / 2) * UNIT_METRES);
  const courses = [];
  for (const [k, route] of OUTRUN_ROUTES.entries()) {
    const road = roads[k]!;
    const document = road.write(ground);
    const file = outputs.course(route.id, document);
    courses.push({
      course: file,
      sections: document.sections.length,
      metres: round1(road.end),
      objects: road.objects,
      placing: road.placing,
      // Each span's fidelity, the most over the spans and their widened turns.
      ...(() => {
        const spans = road.fidelity.map((f) => fidelityReport(f, f.span));
        return {
          heading: Math.max(...spans.map((f) => f.heading)),
          beyond: spans.reduce((n, f) => n + f.beyond, 0),
          positionDrift: Math.max(...spans.map((f) => f.positionDrift)),
          widened: spans.flatMap((f) => f.widened),
        };
      })(),
      ...gradeReport(road.profile, road.screenProfile, road.end, kmh, road.overlaps),
      overpasses: road.overpasses.map((c, k) => overpassReport({ ...c, ...road.partings[k]! }, road.profile.height)),
      rampRadius: road.rampRadius === null ? null : Math.round(road.rampRadius),
    });
  }
  // The boards, in the ROMs' pixels, a strip that does not loop to the scenery's reach across every road.
  const reach = Math.max(...roads.map((road) => road.reach));
  const boards = sceneryBoards(programs.main, words, uses, reach);
  for (const board of boards) outputs.file(board.image.path, board.image.bytes);
  // Each stage's sky, baked from its background.
  for (const number of OUTRUN_STAGES.flat()) {
    const name = skyName(number);
    const text = JSON.stringify(bakeSky(name, stageSky(programs.main, tiles, number), PIXEL_ASPECT));
    outputs.file(`images/${name}.json`, text);
  }
  return {
    outputs,
    report: {
      conversion: CONVERSION_VERSION,
      ground,
      reach,
      courses,
      boards: boards.map((b) => b.name),
      notConverted: Object.fromEntries([...skipped].map(([kind, n]) => [`kind ${kind}`, n])),
      skies: OUTRUN_STAGES.flat().map(skyName),
    },
  };
};

/**
 * Every way OUTRUN's scenery shows a sprite: its stages' points to their length, every point of its fork and goal
 * stretches, the figures after each goal and the objects at the start; and how many entries of each drawing are no
 * object.
 */
export function outrunSceneryUses(programs: OutrunPrograms) {
  const length = stageLength(programs.main);
  const uses: BoardUse[] = [];
  const skipped = new Map<number, number>();
  const points = [
    ...OUTRUN_STAGES.flat().flatMap((n) => readStage(programs, n).scenery.filter((p) => p.position < length)),
    ...readForkStretch(programs).scenery,
    ...readGoalStretches(programs).stretches.flatMap((s) => s.scenery),
  ];
  const types = [...new Set(points.map((p) => p.type))].sort((a, b) => a - b);
  for (const type of types)
    for (const e of readSceneryType(programs.main, type).entries) {
      const shown = sceneryRoutine(programs.main, e.flags, e.y);
      if (!shown) {
        skipped.set(e.flags >> 4, (skipped.get(e.flags >> 4) ?? 0) + 1);
        continue;
      }
      const routine = OBJECT_ROUTINES.get(shown.routine)!;
      uses.push(
        liftedUse(
          {
            sprite: e.sprite,
            mirrored: (e.flags & 1) !== 0,
            palette: e.palette,
            shadow: (e.flags & 2) !== 0,
            ...shown,
            shadows: routine.shadows === true,
          },
          e.y,
        ),
      );
    }
  readGoalStretches(programs).stretches.forEach((_, g) =>
    uses.push(
      ...goalFigures(programs.main, g).map((figure) => ({
        ...figureUse(programs.main, figure),
        // The goal's scene sets no figure's byte 7 (0x58B4 to 0x5B3A): not drawn with shadows allowed for certain.
        shadows: false,
      })),
    ),
  );
  for (const o of startObjects(programs.main))
    uses.push(
      liftedUse(
        {
          sprite: o.sprite,
          mirrored: (o.flags & 1) !== 0,
          anchor: o.anchor & 15,
          routine: o.routine,
          palette: o.palette,
          shadow: (o.flags & 0x10) !== 0,
          shadows: o.shadows,
        },
        o.y,
      ),
    );
  return { uses, skipped };
}

/** A stage's name as it lies in its images' and Sections' names. */
export const slug = (name: string) => name.toLowerCase().replace(/'/g, '').replace(/ /g, '-');

/** Stage `number`'s sky image. */
export const skyName = (number: number) => `outrun-${slug(OUTRUN_NAMES.get(number)!)}-sky`;
