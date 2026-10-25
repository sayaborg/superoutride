/**
 * OUTRUN's road data commands ([Development](../../docs/development.md#road-data-commands)): each prints one JSON
 * result, or its diagnostics and exits 1.
 */
import path from 'node:path';
import { mkdir, readdir, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { atomicWrite, requireInput } from '../course/authoring-io.js';
import { CAMERA_DEFINITION } from '../../src/view/camera-definition.js';
import { romRecords } from './rom-set.js';
import { boardShapes, sceneryBoards, type BoardUse } from './outrun-boards.js';
import { OBJECT_ROUTINES, sceneryRoutine, startObjects } from './outrun-sprites.js';
import { hillsAlong, tableRuns } from './hills.js';
import { fitLook, gameLook, leastLoad, LOOK, ORIGINAL_LEVEL_TOP, roadTopRow } from './road-profile.js';
import { cameraDistance, RENDER_FAR_DEPTH_METERS } from '../../src/view/camera.js';
import { CONVERSION_VERSION } from './outrun-course.js';
import { OUTRUN_NAMES, skyName, slug } from './outrun-names.js';
import {
  layRoad,
  OUTRUN_ROUTES,
  outrunRoad,
  roadProfile,
  routeName,
  routeSpans,
  stationOf as roadStation,
} from './outrun-roads.js';
import { stageSpan } from './outrun-pieces.js';
import { checkRoadRom, LANE, UNIT_METRES } from './outrun-cross-section.js';
import { instruction, word } from './program-words.js';
import { POSITION_METRES } from './hills.js';
import { roadObjects } from './outrun-scenery.js';
import { stageSky } from './outrun-backgrounds.js';
import { bakeSky, SKY_HORIZON } from './sky-baking.js';
import { commandSample, OUTRUN_SOUNDS, PCM_OUTPUT_RATE, samplePcm } from './outrun-sounds.js';
import { assemblePrograms, assembleSound, assembleSprites, assembleTiles, OUTRUN_DUMP_ROMS } from './outrun-rom.js';
import { startDepth } from './object-approach.js';
import { figureUse, goalFigurePlacements, goalFigures } from './outrun-goal-figures.js';
import {
  OUTRUN_STAGES,
  readForkStretch,
  readGoalStretches,
  readSceneryType,
  goalNumber,
  readStage,
  stageLength,
  type Stage,
  type Stretch,
} from './outrun-road.js';
import { pathOffset, pathTurn, readHeightTable, type HeightTable } from './road-tables.js';

import {
  crossingReport,
  dumpDirectory,
  fidelityReport,
  gradeReport,
  ORIGINALS_DIRECTORY,
  romDirectory,
  romSet,
  round1,
  saveCourse,
  type RoadDataCommands,
} from './road-data-commands.js';

/** Positions left out at each end of a curve where its rate is measured. */
const JOIN = 2;
/** The top speed, km/h: the holds of the hills are counted at it unless told otherwise. */
const TOP_KMH = 293;

/** The dump's format: raw tables, local to the machine that read the ROMs. */
const DUMP_FORMAT = Object.freeze({ format: 'superoutride.outrun-road-data', version: 1 } as const);

/** The programs from the ROM zip `zip`, else the one zip in the ROM directory, checked. */
async function readPrograms(zip: string | undefined) {
  if (!zip) {
    const zips = (await readdir(romDirectory('outrun')).catch(() => [])).filter((name) => name.endsWith('.zip'));
    requireInput(
      zips.length === 1,
      '/arguments/--zip',
      `--zip names the ROM zip, or ${romDirectory('outrun')} holds one`,
    );
    zip = path.join(romDirectory('outrun'), zips[0]!);
  }
  const set = await romSet('outrun', [zip]);
  return { zip, set, programs: assemblePrograms(set) };
}

export const OUTRUN_COMMANDS: RoadDataCommands = Object.freeze({
  'outrun-read': async (options) => {
    // The ROM zip checked and read; every table to the dump.
    const { zip, programs } = await readPrograms(options.get('--zip'));
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
      heightTables: Object.fromEntries(heightNumbers.map((n) => [n, readHeightTable(programs.sub, n)])),
      sceneryTypes: Object.fromEntries(sceneryTypes.map((t) => [t, readSceneryType(programs.main, t)])),
    };
    const out = options.get('--out') ?? dumpDirectory('outrun');
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
            measured: c.kind === 1 ? null : round1((inside[1] - inside[0]) / Math.abs(pathTurn(stage.path, ...inside))),
            turn: degrees(pathTurn(stage.path, c.position - offset, end - offset)),
          };
        }),
      };
    });
    console.log(
      JSON.stringify({
        ok: true,
        zip,
        out,
        stageLength: length,
        heightTables: heightNumbers.length,
        sceneryTypes: sceneryTypes.length,
        stages: summary,
      }),
    );
  },
  'outrun-hills': async (options) => {
    // The road's top row along each stage by the original's rule, from the dump, at a quarter position's spacing;
    // the holds counted at `--kmh` (default the top speed, 293).
    const out = options.get('--out') ?? dumpDirectory('outrun');
    const dump = JSON.parse(await readFile(path.join(out, 'outrun.json'), 'utf8')) as {
      stageLength: number;
      stages: Stage[];
      heightTables: Record<string, HeightTable>;
    };
    const kmh = Number(options.get('--kmh') ?? TOP_KMH);
    requireInput(kmh > 0, '/arguments/--kmh', '--kmh is a speed above 0');
    const only = options.get('--stage');
    const tables = new Map(Object.entries(dump.heightTables).map(([n, table]) => [Number(n), table]));
    const positions = Array.from({ length: dump.stageLength * 4 }, (_, i) => i / 4);
    const stages = [];
    for (const stage of dump.stages) {
      const name = `0x${stage.number.toString(16)}`;
      if (only && only !== name) continue;
      const tops = hillsAlong(stage.widthsHeights, tables, positions, () => kmh);
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
    console.log(JSON.stringify({ ok: true, kmh, stages }));
  },
  'outrun-course': async (options) => {
    // OUTRUN's roads from the ROMs, and each stage's sky as published, written to content, or with `--check` compared
    // with the ones there.
    const check = options.has('--check');
    const { zip, set, programs } = await readPrograms(options.get('--zip'));
    const tiles = assembleTiles(set);
    // The roads' lines and edges as this conversion draws them are the road ROM's.
    checkRoadRom(set);
    const length = stageLength(programs.main);
    requireInput(length === 1948, '/main', `The stages are ${length} positions long, not 1948`);
    const stages = new Map(OUTRUN_STAGES.flat().map((number) => [number, readStage(programs, number)]));
    const fork = readForkStretch(programs);
    const goals = readGoalStretches(programs);
    const names = new Set(
      [...stages.values(), fork, ...goals.stretches].flatMap((s) =>
        s.widthsHeights.filter((p) => p.kind === 0).map((p) => p.value),
      ),
    );
    const tables = new Map([...names].map((n) => [n, readHeightTable(programs.sub, n)]));
    const nameOf = (stage: Stage) => OUTRUN_NAMES.get(stage.number)!;
    const inputs = {
      rows: OUTRUN_STAGES,
      stages,
      fork,
      goals,
      goalOf: (row: number, column: number) => goalNumber(programs.main, row, column),
      idOf: (stage: Stage) => slug(nameOf(stage)),
    };
    // What lies on the ground, its materials beneath it, the extending boards' edges and each board's width.
    const { edges, split, widths } = boardShapes(programs.main, assembleSprites(set), outrunSceneryUses(programs).uses);
    const starts = startObjects(programs.main);
    const roads = OUTRUN_ROUTES.map((route) =>
      outrunRoad(routeSpans(route, inputs), {
        id: route.id,
        name: routeName(route, OUTRUN_ROUTES),
        tables,
        kmh: TOP_KMH,
        cameraDistance: cameraDistance(CAMERA_DEFINITION),
        stageName: nameOf,
        sky: (stage) => ({ image: skyName(stage.number), horizonY: SKY_HORIZON }),
        edges,
        split,
        widths,
        objects: (points, road) => {
          const { placements, checkpoints, dropped, ended, start } = roadObjects(programs.main, points, {
            ...road,
            kmh: TOP_KMH,
            startDepth,
            starts,
          });
          // The figures after each goal, standing before where the camera stops.
          const figures = goalFigurePlacements(programs.main, road.goals, { ...road, startDepth });
          return {
            placements: [...placements, ...figures].sort((a, b) => a.position - b.position || a.x - b.x),
            // The checkpoint banner's left half (drawing 6) passing the car: the original's time extension.
            checkpoints,
            report: { dropped, ended, start, figures: figures.length },
          };
        },
      }),
    );
    // SAND reaches the car's lateral limit: 0xC2B0 holds its x (0x260050) within the word it adds at 0xC2CA (0xE2F4)
    // of its road's centre, that far beyond the road's three lanes about it.
    const [high, low] = instruction(programs.main, 0xc2ca, [0xd079, null, null], "the car's lateral limit");
    const ground = Math.round((word(programs.main, high! * 0x10000 + low!) - (3 * LANE) / 2) * UNIT_METRES * 1e6) / 1e6;
    const courses = [];
    for (const [k, route] of OUTRUN_ROUTES.entries()) {
      const road = roads[k]!;
      const document = road.write(ground);
      const file = await saveCourse(route.id, document, check);
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
        ...gradeReport(road.profile, road.screenProfile, road.end, TOP_KMH, road.overlaps),
        crossings: road.crossings.map((c, k) => crossingReport({ ...c, ...road.partings[k]! }, road.profile.height)),
        rampRadius: road.rampRadius === null ? null : Math.round(road.rampRadius),
      });
    }
    // Each stage's sky, baked from its background.
    for (const number of OUTRUN_STAGES.flat()) {
      const name = skyName(number);
      const text = JSON.stringify(bakeSky(name, stageSky(programs.main, tiles, number)));
      const skyFile = `content/images/${name}.json`;
      if (check) {
        const committed = await readFile(skyFile, 'utf8').catch(() => null);
        requireInput(committed === text, `/${skyFile}`, `${skyFile} is not the sky baked from the ROMs`);
        continue;
      }
      await atomicWrite(skyFile, text);
    }
    console.log(
      JSON.stringify({
        ok: true,
        zip,
        conversion: CONVERSION_VERSION,
        checked: check,
        ground,
        courses,
        skies: OUTRUN_STAGES.flat().map(skyName),
      }),
    );
  },
  'outrun-look': async (options) => {
    // For every stage, as its stage piece alone (with its fork's six lanes, or its goal): `c_look` refitted on it, its
    // profile's extremes and crossings, and each table's road top on both screens and least load at the top speed.
    const { programs } = await readPrograms(options.get('--zip'));
    const length = stageLength(programs.main);
    const fork = readForkStretch(programs);
    const goals = readGoalStretches(programs);
    const reports = [];
    for (const [row, numbers] of OUTRUN_STAGES.entries())
      for (const [column, number] of numbers.entries()) {
        const stage = readStage(programs, number);
        const names = [
          ...new Set(
            [stage, fork, ...goals.stretches].flatMap((s) =>
              s.widthsHeights.filter((p) => p.kind === 0).map((p) => p.value),
            ),
          ),
        ];
        const tables = new Map(names.map((n) => [n, readHeightTable(programs.sub, n)]));
        const goal = row === OUTRUN_STAGES.length - 1 ? goalNumber(programs.main, row, column) : null;
        const span = stageSpan(stage, {
          first: row === 0,
          fork: goal === null ? fork : null,
          ...(goal === null ? {} : { goal: { stretch: goals.stretches[goal]!, path: goals.path, number: goal } }),
        });
        const laid = layRoad([{ span, id: 'stage', leaves: span.centreLane, starts: true }]);
        const { end, profile, crossings, partings } = roadProfile(laid, { tables, kmh: TOP_KMH });
        const stationOf = (p: number) => roadStation(laid[0]!, p);
        const course = { stage: number };
        const positions = Array.from({ length }, (_, p) => p);
        const points = stage.widthsHeights.filter((p) => p.position < length);
        const original = hillsAlong(points, tables, positions, () => TOP_KMH);
        const stations = Array.from({ length: Math.floor(end) + 1 }, (_, s) => s);
        const runs = tableRuns(points, tables, () => TOP_KMH);
        const ahead = Math.ceil(RENDER_FAR_DEPTH_METERS / POSITION_METRES);
        // Rows on the original's screen: this game's top as the original's row of the same look.
        const game = positions.map((p) => ORIGINAL_LEVEL_TOP - gameLook(roadTopRow(profile, stationOf(p), end)) * 224);
        reports.push({
          stage: `0x${course.stage.toString(16)}`,
          look: LOOK,
          refitted: fitLook(runs, (p) => original[p]!, positions, stationOf, end),
          rmsRows: round1(Math.sqrt(positions.reduce((sum, p) => sum + (game[p]! - original[p]!) ** 2, 0) / length)),
          heights: [
            round1(Math.min(...stations.map(profile.height))),
            round1(Math.max(...stations.map(profile.height))),
          ],
          steepest: Math.round(Math.max(...stations.map((s) => Math.abs(profile.grade(s)))) * 1000) / 1000,
          crossings: crossings.map((c, k) => crossingReport({ ...c, ...partings[k]! }, profile.height)),
          tables: runs.map((run) => {
            const from = Math.max(0, Math.floor(run.start - ahead)),
              to = Math.min(length, Math.ceil(run.end));
            const span = positions.slice(from, to);
            const extremes = (rows: readonly number[]) => [
              round1(Math.min(...span.map((p) => rows[p]!))),
              round1(Math.max(...span.map((p) => rows[p]!))),
            ];
            return {
              position: run.start,
              kind: run.table.kind,
              original: extremes(Array.from(original)),
              game: extremes(game),
              load: Math.round(leastLoad(profile, stationOf(run.start), stationOf(run.end), TOP_KMH) * 100) / 100,
            };
          }),
        });
      }
    console.log(JSON.stringify({ ok: true, kmh: TOP_KMH, stages: reports }));
  },
  'outrun-sounds': async (options) => {
    // The original's voices and effects as the local originals of this game's recordings, AAC-LC at 44.1 kHz.
    const { zip, set } = await readPrograms(options.get('--zip'));
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
    console.log(JSON.stringify({ ok: true, zip, originals: written }));
  },
  'outrun-boards': async (options) => {
    // The boards of every sprite OUTRUN's stages, fork and goal stretches and start show, written to content,
    // or with `--check` compared with the ones there.
    const check = options.has('--check');
    const { set, programs } = await readPrograms(options.get('--zip'));
    const words = assembleSprites(set);
    const { uses, skipped } = outrunSceneryUses(programs);
    const boards = sceneryBoards(programs.main, words, uses);
    for (const board of boards) {
      const file = `content/${board.image.path}`;
      if (check) {
        const committed = await readFile(file).catch(() => null);
        requireInput(
          committed && Buffer.compare(committed, board.image.bytes) === 0,
          `/${file}`,
          `${file} is not the ROMs' board`,
        );
      } else await atomicWrite(file, board.image.bytes);
    }
    console.log(
      JSON.stringify({
        ok: true,
        checked: check,
        boards: boards.map((b) => b.name),
        notConverted: Object.fromEntries([...skipped].map(([kind, n]) => [`kind ${kind}`, n])),
      }),
    );
  },
});

/**
 * Every way OUTRUN's scenery shows a sprite: its stages' points to their length, every point of its fork and goal
 * stretches, the figures after each goal and the objects at the start; and how many entries of each drawing are no
 * object.
 */
function outrunSceneryUses(programs: Awaited<ReturnType<typeof readPrograms>>['programs']) {
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
      uses.push({
        sprite: e.sprite,
        mirrored: (e.flags & 1) !== 0,
        palette: e.palette,
        shadow: (e.flags & 2) !== 0,
        ...shown,
        shadows: routine.shadows === true,
        raised: e.y !== 0 || routine.fromMiddle !== undefined,
      });
    }
  readGoalStretches(programs).stretches.forEach((_, g) =>
    uses.push(
      ...goalFigures(programs.main, g).map((figure) => ({
        ...figureUse(programs.main, figure),
        // The goal's scene sets no figure's byte 7 (0x58B4 to 0x5B3A): not drawn with shadows allowed for certain.
        shadows: false,
        raised: figure.y !== 0,
      })),
    ),
  );
  for (const o of startObjects(programs.main))
    uses.push({
      sprite: o.sprite,
      mirrored: (o.flags & 1) !== 0,
      anchor: o.anchor & 15,
      routine: o.routine,
      palette: o.palette,
      shadow: (o.flags & 0x10) !== 0,
      shadows: o.shadows,
      raised: o.y !== 0,
    });
  return { uses, skipped };
}
