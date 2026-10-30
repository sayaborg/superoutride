/**
 * OUTRUN's road data commands ([Development](../../../docs/development.md#road-data-commands)): each prints one JSON
 * result, or its diagnostics and exits 1.
 */
import path from 'node:path';
import { mkdir, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { atomicWrite } from '../../course/authoring-io.js';
import { requireInput } from '../../authoring/authoring-error.js';
import { CAMERA_DEFINITION } from '../../../src/view/camera-definition.js';
import { romRecords } from '../shared/rom-set.js';
import { boardNames, boardShapes, liftedUse, sceneryBoards, type BoardUse } from './outrun-boards.js';
import { OBJECT_ROUTINES, sceneryRoutine, startObjects } from './outrun-sprites.js';
import { hillsAlong } from '../out-run-hardware/hills.js';
import { cameraDistance } from '../../../src/view/camera.js';
import { CONVERSION_VERSION } from './outrun-course.js';
import { OUTRUN_NAMES, skyName, slug } from './outrun-names.js';
import { OUTRUN_ROUTES, outrunRoad, routeName, routeSpans } from './outrun-roads.js';
import { checkRoadRom, LANE, readStartWidth } from './outrun-cross-section.js';
import { instruction, word } from '../sega-16/program-words.js';
import { micrometre } from '../shared/section-writing.js';
import { roadObjects, type ObjectPlacement } from './outrun-scenery.js';
import { stageSky } from './outrun-backgrounds.js';
import { bakeSky, SKY_HORIZON } from '../shared/sky-baking.js';
import { commandSample, OUTRUN_SOUNDS, PCM_OUTPUT_RATE, samplePcm } from './outrun-sounds.js';
import {
  assemblePrograms,
  assembleSound,
  assembleSprites,
  assembleTiles,
  OUTRUN_DUMP_ROMS,
  OUTRUN_ROMS,
} from './outrun-rom.js';
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
  type Stretch,
  OUTRUN_HEIGHT_TABLES,
} from './outrun-road.js';
import {
  pathOffset,
  pathTurn,
  readHeightTable,
  type HeightTable,
  UNIT_METRES,
} from '../out-run-hardware/road-tables.js';

import {
  crossingReport,
  dumpDirectory,
  fidelityReport,
  gradeReport,
  ORIGINALS_DIRECTORY,
  readSource,
  zipOptions,
  type RoadDataOptions,
  round1,
  type RoadDataCommands,
  command,
  compareStandings,
  round3,
  type Standing,
} from '../road-data-commands.js';
import { conversionCommand, OriginalOutputs, type Conversion } from '../original-outputs.js';
import { roadObjectsAtSpeed } from './outrun-ticks.js';
import { phaseUnit } from '../out-run-hardware/clock.js';
import { belowMostAdvance } from '../out-run-hardware/ticks.js';
import { PIXEL_ASPECT } from '../sega-16/display.js';

/** Positions left out at each end of a curve where its rate is measured. */
const JOIN = 2;

/** The dump's format: raw tables, local to the machine that read the ROMs. */
const DUMP_FORMAT = Object.freeze({ format: 'superoutride.outrun-road-data', version: 1 } as const);

/** The programs from OUTRUN's zip ([`readSource`](../road-data-commands.ts)). */
async function readPrograms(options: RoadDataOptions) {
  const { zips, set } = await readSource(OUTRUN_ROMS, options);
  return { zips, set, programs: assemblePrograms(set) };
}

/** outrun's conversion: its courses, pictures and skies raised from the ROMs, and its report. */
export const OUTRUN_CONVERSION: Conversion = async (options) => {
  // OUTRUN's roads from the ROMs, the boards of every sprite its stages, fork and goal stretches and start show, and
  // each stage's sky as published, written to content, or with `--check` compared with the ones there.
  const outputs = new OriginalOutputs();
  const { zips, set, programs } = await readPrograms(options);
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
      crossings: road.crossings.map((c, k) => crossingReport({ ...c, ...road.partings[k]! }, road.profile.height)),
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
      zips,
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

// An OUTRUN object's kind: its board, palette and height.
const outrunStanding = (o: ObjectPlacement): Standing => ({
  position: o.position,
  x: o.x,
  key: `${o.image} ${o.palette} y ${o.y}`,
});

/** OUTRUN's roads' objects in the limit and by the ticks at `kmh`, compared road by road. */
export async function outrunAtSpeed(options: RoadDataOptions, kmh: number) {
  const { set } = await readSource(OUTRUN_ROMS, options);
  const programs = assemblePrograms(set);
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
  const distances = lineDistances(programs, clock);
  requireInput(
    kmh < belowMostAdvance(clock),
    '/arguments/--kmh',
    `--kmh is below ${belowMostAdvance(clock).toFixed(1)} km/h, where a tick's advance stays within the program's most`,
  );
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
  const { colored, extents } = boardShapes(programs.main, assembleSprites(set), outrunSceneryUses(programs).uses);
  const starts = startObjects(programs.main);
  // A tick at `kmh` advances the road this many positions, and the limit's units of advance come this far apart.
  const tolerance = (kmh * clock.step) / 65536 + phaseUnit(clock);
  const roads = [];
  for (const route of OUTRUN_ROUTES) {
    // Written by the road's objects callback (so not narrowed to none where it is read).
    let compared = null as ReturnType<typeof compareStandings> | null;
    outrunRoad(routeSpans(route, inputs), {
      id: route.id,
      name: route.id,
      tables,
      distances,
      kmh: readTopKmh(programs),
      changeFrames: readStageChangeFrames(programs, clock),
      cameraDistance: cameraDistance(CAMERA_DEFINITION),
      stageName: nameOf,
      sky: (stage) => ({ image: skyName(stage.number), horizonY: SKY_HORIZON }),
      extents,
      colored,
      objects: (points, road) => {
        const options = { ...road, ahead: (line: number) => lineAhead(distances, line), starts, clock };
        const limit = roadObjects(programs.main, points, options);
        const ticks = roadObjectsAtSpeed(programs.main, points, { ...options, kmh });
        compared = compareStandings(
          limit.placements.map(outrunStanding),
          ticks.placements.map(outrunStanding),
          tolerance,
        );
        return { placements: limit.placements, checkpoints: limit.checkpoints, report: null };
      },
    });
    requireInput(compared, `/roads/${route.id}`, `OUTRUN's road ${route.id} placed no objects`);
    roads.push({ road: route.id, ...compared });
  }
  return { original: 'outrun', kmh, tolerance: round3(tolerance), roads };
}

export const OUTRUN_COMMANDS: RoadDataCommands = Object.freeze({
  'outrun-read': command(
    { ...zipOptions(OUTRUN_ROMS), '--out': 'value' },
    async function* (options) {
      // The ROM zip checked and read; every table to the dump.
      const { zips, programs } = await readPrograms(options);
      const length = stageLength(programs.main);
      const stages = OUTRUN_STAGES.flat().map((number) => readStage(programs, number));
      const fork = readForkStretch(programs);
      const goals = readGoalStretches(programs);
      const stretches: Stretch[] = [...stages, fork, ...goals.stretches];
      // Every stage's path returns to its first heading or turns once around; points at or past its length, which the
      // road position never reaches within the stage, are reported.
      for (const stage of stages) {
        const name = `0x${stage.number.toString(16)}`;
        const turns = pathTurn(stage.path, 0, length) / (2 * Math.PI);
        requireInput(
          Math.abs(turns - Math.round(turns)) < 1 / 360 && Math.abs(Math.round(turns)) <= 1,
          `/stages/${name}`,
          `Stage ${name}'s path turns ${(turns * 360).toFixed(2)}°, not 0° or ±360°`,
        );
      }
      const heightNumbers = [
        ...new Set(stretches.flatMap((s) => s.widthsHeights.filter((p) => p.kind === 0).map((p) => p.value))),
      ].sort((a, b) => a - b);
      const sceneryTypes = [...new Set(stretches.flatMap((s) => s.scenery.map((p) => p.type)))].sort((a, b) => a - b);
      const dump = {
        ...DUMP_FORMAT,
        stageLength: length,
        roms: romRecords(OUTRUN_DUMP_ROMS),
        stages,
        fork,
        goals,
        heightTables: Object.fromEntries(
          heightNumbers.map((n) => [n, readHeightTable(programs.sub, n, OUTRUN_HEIGHT_TABLES)]),
        ),
        sceneryTypes: Object.fromEntries(sceneryTypes.map((t) => [t, readSceneryType(programs.main, t)])),
      };
      const out = options.get('--out') ?? dumpDirectory(OUTRUN_ROMS);
      await atomicWrite(path.join(out, 'outrun.json'), JSON.stringify(dump) + '\n');
      // Each stage's counts, and its path's heading over the stage and over each curve segment.
      const degrees = (radians: number) => Math.round(((radians * 180) / Math.PI) * 100) / 100;
      const summary = stages.map((stage) => {
        const starts = stage.curves.map((c) => c.position);
        // The path aligned with the curves: a stage's path may run ahead of them.
        const offset = pathOffset(stage.curves, stage.path, length);
        return {
          number: `0x${stage.number.toString(16)}`,
          curves: stage.curves.length,
          widths: stage.widthsHeights.filter((p) => p.kind !== 0).length,
          heights: stage.widthsHeights.filter((p) => p.kind === 0).length,
          scenery: stage.scenery.length,
          beyond: [...stage.curves, ...stage.widthsHeights, ...stage.scenery].filter((p) => p.position >= length),
          pathOffset: offset,
          turn: degrees(pathTurn(stage.path, 0, length)),
          segments: stage.curves.map((c, i) => {
            const end = Math.min(starts[i + 1] ?? length, length);
            // A curve's rate inside it: a join spreads its turn over a position or two either side.
            const inside = [c.position + JOIN - offset, end - JOIN - offset] as const;
            return {
              from: c.position,
              to: end,
              kind: c.kind,
              radius: c.radius,
              measured:
                c.kind === 1 ? null : round1((inside[1] - inside[0]) / Math.abs(pathTurn(stage.path, ...inside))),
              turn: degrees(pathTurn(stage.path, c.position - offset, end - offset)),
            };
          }),
        };
      });
      yield {
        ok: true,
        zips,
        out,
        stageLength: length,
        heightTables: heightNumbers.length,
        sceneryTypes: sceneryTypes.length,
        stages: summary,
      };
    },
    [OUTRUN_ROMS],
  ),
  'outrun-hills': command(
    { ...zipOptions(OUTRUN_ROMS), '--out': 'value', '--kmh': 'value', '--stage': 'value' },
    async function* (options) {
      // The road's top row along each stage by the original's rule, from the dump, at a quarter position's spacing;
      // the holds counted at `--kmh` (default the top speed, `readTopKmh`).
      const out = options.get('--out') ?? dumpDirectory(OUTRUN_ROMS);
      const dump = JSON.parse(await readFile(path.join(out, 'outrun.json'), 'utf8')) as {
        stageLength: number;
        stages: Stage[];
        heightTables: Record<string, HeightTable>;
      };
      const { programs } = await readPrograms(options);
      const kmh = Number(options.get('--kmh') ?? readTopKmh(programs));
      requireInput(kmh > 0, '/arguments/--kmh', '--kmh is a speed above 0');
      const only = options.get('--stage');
      const clock = readClock(programs);
      const tables = new Map(Object.entries(dump.heightTables).map(([n, table]) => [Number(n), table]));
      const positions = Array.from({ length: dump.stageLength * 4 }, (_, i) => i / 4);
      const stages = [];
      for (const stage of dump.stages) {
        const name = `0x${stage.number.toString(16)}`;
        if (only && only !== name) continue;
        const tops = hillsAlong(stage.widthsHeights, tables, positions, () => kmh, clock);
        await atomicWrite(
          path.join(out, `hills-${name}.json`),
          JSON.stringify({ kmh, step: 0.25, tops: Array.from(tops, (t) => round1(t)) }) + '\n',
        );
        // Each height point's table and the extremes of the top until the next point.
        const points = stage.widthsHeights.filter((p) => p.kind === 0);
        stages.push({
          stage: name,
          points: points.map((p, k) => {
            const from = p.position * 4,
              to = Math.min(tops.length, (points[k + 1]?.position ?? dump.stageLength) * 4);
            let least = from,
              most = from;
            for (let i = from; i < to; i++) {
              if (tops[i]! < tops[least]!) least = i;
              if (tops[i]! > tops[most]!) most = i;
            }
            return {
              position: p.position,
              table: p.value,
              kind: tables.get(p.value)?.kind,
              highest: { row: round1(tops[least]!), at: least / 4 },
              lowest: { row: round1(tops[most]!), at: most / 4 },
            };
          }),
        });
      }
      yield { ok: true, kmh, stages };
    },
    [OUTRUN_ROMS],
  ),
  'outrun-course': conversionCommand(OUTRUN_CONVERSION, OUTRUN_ROMS),
  'outrun-sounds': command(
    zipOptions(OUTRUN_ROMS),
    async function* (options) {
      // The original's voices and effects as the local originals of this game's recordings, AAC-LC at 44.1 kHz.
      const { zips, set } = await readPrograms(options);
      const { program, banks } = assembleSound(set);
      const written: string[] = [];
      for (const [recording, command] of OUTRUN_SOUNDS) {
        const sample = commandSample(program, command);
        const pcm = samplePcm(banks, sample);
        const file = path.join(ORIGINALS_DIRECTORY, `${recording}.m4a`);
        await mkdir(path.dirname(file), { recursive: true });
        // ffmpeg resamples the chip's output and encodes it, bit-exact so the same ROMs give the same file.
        const result = spawnSync(
          'ffmpeg',
          [
            ...['-v', 'error', '-y', '-f', 's16le', '-ar', String(PCM_OUTPUT_RATE)],
            ...['-ac', '1', '-i', 'pipe:0', '-ar', '44100', '-c:a', 'aac', '-b:a', '96k'],
            ...['-fflags', '+bitexact', '-flags:a', '+bitexact', '-map_metadata', '-1', file],
          ],
          { input: new Uint8Array(pcm.buffer) },
        );
        requireInput(result.error === undefined, '/ffmpeg', 'The sounds command needs ffmpeg on the path');
        requireInput(result.status === 0, '/ffmpeg', `ffmpeg did not encode ${recording}: ${String(result.stderr)}`);
        written.push(file);
      }
      yield { ok: true, zips, originals: written };
    },
    [OUTRUN_ROMS],
  ),
});

/**
 * Every way OUTRUN's scenery shows a sprite: its stages' points to their length, every point of its fork and goal
 * stretches, the figures after each goal and the objects at the start; and how many entries of each drawing are no
 * object.
 */
export function outrunSceneryUses(programs: Awaited<ReturnType<typeof readPrograms>>['programs']) {
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
