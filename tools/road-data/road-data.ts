/**
 * The road data tool: `npm run road-data -- <command>` ([Development](../../docs/development.md#road-data-commands)).
 * Each command prints one JSON result, or its diagnostics and exits 1.
 */
import path from 'node:path';
import { mkdir, readdir, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { atomicWrite, reportError, requireInput } from '../course/authoring-io.js';
import { formatSavedJson } from '../../src/content/saved-json.js';
import { CAMERA_DEFINITION } from '../../src/view/camera-definition.js';
import { readZip } from './zip.js';
import { sceneryBoards, type SpriteUse } from './outrun-boards.js';
import { assembleSprites, readStartObjects, sceneryRoutine } from './outrun-sprites.js';
import { hillsAlong, tableRuns } from './hills.js';
import { fitLook, gameLook, leastLoad, LOOK, ORIGINAL_LEVEL_TOP, roadTopRow } from './road-profile.js';
import { cameraDistance, RENDER_FAR_DEPTH_METERS } from '../../src/view/camera.js';
import { CONVERSION_VERSION } from './outrun-course.js';
import { OUTRUN_NAMES, OUTRUN_SHORT_NAMES, OUTRUN_SKIES, SKY_HORIZON, skyName, slug } from './outrun-names.js';
import { layRoad, OUTRUN_ROUTES, outrunRoad, roadProfile, routeName, routeSpans } from './outrun-roads.js';
import { stageSpan } from './outrun-pieces.js';
import { checkRoadRom } from './outrun-cross-section.js';
import { POSITION_METRES } from './offset-plan.js';
import { roadObjects } from './outrun-scenery.js';
import { normalizeCoursePositions } from '../authoring/course-joints.js';
import type { Json } from '../authoring/json-pointer.js';
import { readCourseDocument } from '../../src/course/course-document.js';
import { assembleTiles, stageBackground } from './outrun-backgrounds.js';
import { playerOriginal } from './outrun-player.js';
import { assembleSound, commandSample, OUTRUN_SOUNDS, PCM_OUTPUT_RATE, samplePcm } from './outrun-sounds.js';
import { drawScreenPicture } from '../graphics/screen-pictures.js';
import { TILE_PICTURE_TILE_SIZE } from '../../src/image/tile-picture.js';
import { rgba } from '../../src/image/rgb555.js';
import { assemblePrograms, OUTRUN_PROGRAM_ROMS } from './outrun-rom.js';
import { turboOutrunDump } from './turbo-outrun-dump.js';
import { assembleTurboOutrunPrograms } from './turbo-outrun-rom.js';
import { turboOutrunObjects } from './turbo-outrun-scenery.js';
import { startDepth } from './object-approach.js';
import { superHangOnDump } from './super-hang-on-dump.js';
import {
  courseId,
  GENERIC_SKY,
  skyName as superHangOnSky,
  superHangOnCourses,
  SUPER_HANG_ON_CONVERSION_VERSION,
} from './super-hang-on-courses.js';
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

/** Positions left out at each end of a curve where its rate is measured. */
const JOIN = 2;
const round1 = (value: number) => Math.round(value * 10) / 10;
const round3 = (value: number) => Math.round(value * 1000) / 1000;
/** The top speed, km/h: the holds of the hills are counted at it unless told otherwise. */
const TOP_KMH = 293;

/** Where K's ROM zip and the tool's dumps lie: never committed. */
const ROM_DIRECTORY = 'reference-media/outrun/rom';
const DUMP_DIRECTORY = 'reference-media/outrun/rom-data';
/** Where K's TURBO OUTRUN ROM zip and the tool's dumps of it lie: never committed. */
const TURBO_OUTRUN_ROM_DIRECTORY = 'reference-media/turbo-outrun/rom';
const TURBO_OUTRUN_DUMP_DIRECTORY = 'reference-media/turbo-outrun/rom-data';
/** Where K's SUPER HANG-ON ROM zip and the tool's dumps of it lie: never committed. */
const SUPER_HANG_ON_ROM_DIRECTORY = 'reference-media/super-hang-on/rom';
const SUPER_HANG_ON_DUMP_DIRECTORY = 'reference-media/super-hang-on/rom-data';
/** Where the originals' assets lie, each in its published path: a local build may use them in place of the published. */
const ORIGINALS_DIRECTORY = 'reference-media/originals';
/** The player's picture set, which the Ferrari's local original replaces. */
const PLAYER_SET = 'content/sprites/testarossa.json';
/** The dump's format: raw tables, local to the machine that read the ROMs. */
const DUMP_FORMAT = Object.freeze({ format: 'superoutride.outrun-road-data', version: 1 } as const);

const [command, ...rest] = process.argv.slice(2);

/** The programs from the ROM zip `zip`, else the one zip in the ROM directory, checked. */
async function readPrograms(zip: string | undefined) {
  if (!zip) {
    const zips = (await readdir(ROM_DIRECTORY).catch(() => [])).filter((name) => name.endsWith('.zip'));
    requireInput(zips.length === 1, '/arguments/--zip', `--zip names the ROM zip, or ${ROM_DIRECTORY} holds one`);
    zip = path.join(ROM_DIRECTORY, zips[0]!);
  }
  return { zip, programs: assemblePrograms(readZip(new Uint8Array(await readFile(zip)))) };
}

/** The zip `zip`, else the one zip in `directory`. */
async function oneZip(zip: string | undefined, directory: string, option: string) {
  if (zip) return zip;
  const zips = (await readdir(directory).catch(() => [])).filter((name) => name.endsWith('.zip'));
  requireInput(zips.length === 1, '/arguments/' + option, `${option} names the ROM zip, or ${directory} holds one`);
  return path.join(directory, zips[0]!);
}

/**
 * A course document normalized and read, written to content, or with `check` compared with the one there.
 */
async function saveCourse(id: string, document: unknown, check: boolean) {
  const file = `content/courses/${id}.course.json`;
  const normalized = normalizeCoursePositions(document as Json).document;
  const read = readCourseDocument(normalized, file);
  if (!read.ok) throw Object.assign(new Error(`${file} does not read`), { diagnostics: read.diagnostics });
  const text = formatSavedJson(normalized);
  if (check) {
    const committed = await readFile(file, 'utf8').catch(() => null);
    requireInput(committed === text, `/${file}`, `${file} is not the conversion of the ROMs`);
  } else await atomicWrite(file, text);
  return file;
}

/** Flags take no value; every other option is `--name value`. */
const FLAGS = new Set(['--check']);
function parse(args: readonly string[]) {
  const options = new Map<string, string>();
  for (let i = 0; i < args.length; i += 2) {
    if (FLAGS.has(args[i]!)) {
      options.set(args[i--]!, 'yes');
      continue;
    }
    requireInput(args[i]?.startsWith('--') && args[i + 1] !== undefined, '/arguments', 'Options are --name value');
    options.set(args[i]!, args[i + 1]!);
  }
  return options;
}

try {
  const options = parse(rest);
  switch (command) {
    case 'super-hang-on-read': {
      // SUPER HANG-ON's ROM zip checked and read; every table its courses use to the dump.
      const zip = await oneZip(options.get('--zip'), SUPER_HANG_ON_ROM_DIRECTORY, '--zip');
      const dump = superHangOnDump(readZip(new Uint8Array(await readFile(zip))));
      const out = options.get('--out') ?? SUPER_HANG_ON_DUMP_DIRECTORY;
      await atomicWrite(path.join(out, 'super-hang-on.json'), JSON.stringify(dump) + '\n');
      console.log(
        JSON.stringify({
          ok: true,
          zip,
          out,
          positions: dump.positions,
          courses: dump.courses,
          sceneryTypes: Object.keys(dump.sceneryTypes).length,
          sprites: Object.keys(dump.sprites).length,
          palettes: Object.keys(dump.palettes).length,
        }),
      );
      break;
    }
    case 'super-hang-on-course': {
      // SUPER HANG-ON's courses, pictures and skies from the ROMs, written to content, or with `--check` compared.
      const check = options.has('--check');
      const zip = await oneZip(options.get('--zip'), SUPER_HANG_ON_ROM_DIRECTORY, '--zip');
      const built = superHangOnCourses(readZip(new Uint8Array(await readFile(zip))));
      const courses = [];
      for (const { course, road, dropped, plans } of built.built) {
        const file = await saveCourse(courseId(course.name), road.document, check);
        courses.push({
          course: file,
          sections: road.document.sections.length,
          metres: round1(road.path.planeLength),
          objects: road.objects,
          notBroughtOut: dropped,
          elements: plans.reduce((n, p) => n + p.segments.length, 0),
          crossings: road.crossings.map((c) => ({
            passages: c.passages.map((p) => [round1(p.from), round1(p.to)]),
            levels: c.levels,
            flat: c.flat,
            half: c.half,
            moves: c.moves,
            heights: c.heights.map(round1),
          })),
        });
      }
      for (const { image } of built.pictures) {
        const file = `content/${image.path}`;
        if (check) {
          const committed = await readFile(file).catch(() => null);
          requireInput(
            committed && Buffer.compare(committed, image.bytes) === 0,
            `/${file}`,
            `${file} is not the ROMs'`,
          );
        } else await atomicWrite(file, image.bytes);
      }
      // Each section's sky as published: the generic coast sky under its own name.
      const generic = JSON.parse(await readFile(`content/images/${GENERIC_SKY}.json`, 'utf8')) as Record<
        string,
        unknown
      >;
      const skies = built.built.flatMap(({ course }) =>
        course.sections.map((_, order) => superHangOnSky(course.name, order)),
      );
      for (const name of skies) {
        const text = JSON.stringify({ ...generic, name });
        const skyFile = `content/images/${name}.json`;
        if (check) {
          const committed = await readFile(skyFile, 'utf8').catch(() => null);
          requireInput(committed === text, `/${skyFile}`, `${skyFile} is not ${GENERIC_SKY} under its name`);
        } else await atomicWrite(skyFile, text);
      }
      console.log(
        JSON.stringify({
          ok: true,
          zip,
          conversion: SUPER_HANG_ON_CONVERSION_VERSION,
          checked: check,
          metresAPosition: built.metres,
          metresAUnit: built.unit,
          courses,
          pictures: built.pictures.length,
          skies: skies.length,
        }),
      );
      break;
    }
    case 'read': {
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
        roms: Object.fromEntries(
          Object.values(OUTRUN_PROGRAM_ROMS)
            .flat()
            .flatMap(({ even, odd }) => [even, odd])
            .map(({ name, crc }) => [name, crc.toString(16).padStart(8, '0')]),
        ),
        stages,
        fork,
        goals,
        heightTables: Object.fromEntries(heightNumbers.map((n) => [n, readHeightTable(programs.sub, n)])),
        sceneryTypes: Object.fromEntries(sceneryTypes.map((t) => [t, readSceneryType(programs.main, t)])),
      };
      const out = options.get('--out') ?? DUMP_DIRECTORY;
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
      break;
    }
    case 'hills': {
      // The road's top row along each stage by the original's rule, from the dump, at a quarter position's spacing;
      // the holds counted at `--kmh` (default the top speed, 293).
      const out = options.get('--out') ?? DUMP_DIRECTORY;
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
      break;
    }
    case 'course': {
      // OUTRUN's roads from the ROMs, and each stage's sky as published, written to content, or with `--check` compared
      // with the ones there.
      const check = options.has('--check');
      const { zip, programs } = await readPrograms(options.get('--zip'));
      const files = readZip(new Uint8Array(await readFile(zip)));
      const tiles = assembleTiles(files);
      // The roads' lines and edges as this conversion draws them are the road ROM's.
      checkRoadRom(files);
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
        shortOf: (stage: Stage) => OUTRUN_SHORT_NAMES.get(stage.number)!,
      };
      const courses = [];
      for (const route of OUTRUN_ROUTES) {
        const road = outrunRoad(routeSpans(route, inputs), {
          id: route.id,
          name: routeName(route, inputs),
          tables,
          kmh: TOP_KMH,
          cameraDistance: cameraDistance(CAMERA_DEFINITION),
          stageName: nameOf,
          sky: (stage) => ({ image: skyName(stage.number), horizonY: SKY_HORIZON }),
          objects: (points, road) => {
            const { placements, unconverted, dropped, ended, start } = roadObjects(programs.main, points, {
              ...road,
              kmh: TOP_KMH,
              startDepth,
            });
            // The checkpoint banner's left half (drawing 6) passing the car: the original's time extension.
            return {
              placements,
              checkpoints: unconverted.filter((u) => u.drawing === 6).map((u) => u.position),
              report: { dropped, ended, start },
            };
          },
        });
        const file = await saveCourse(route.id, road.document, check);
        const stations = Array.from({ length: Math.floor(road.end) + 1 }, (_, s) => s);
        courses.push({
          course: file,
          sections: road.document.sections.length,
          metres: round1(road.end),
          objects: road.objects,
          placing: road.placing,
          planDrift: Math.round(road.drift * 1e4) / 1e4,
          heights: [
            round1(Math.min(...stations.map(road.profile.height))),
            round1(Math.max(...stations.map(road.profile.height))),
          ],
          steepest: Math.round(Math.max(...stations.map((s) => Math.abs(road.profile.grade(s)))) * 1000) / 1000,
          crossings: road.crossings.map((pairs) => ({
            at: [round1(pairs[0]![0]), round1(pairs[0]![1])],
            apart: round1(
              Math.min(...pairs.map(([a, b]) => Math.abs(road.profile.height(a) - road.profile.height(b)))),
            ),
          })),
        });
      }
      // Each stage's sky as published: its generic sky under its own name.
      for (const [number, generic] of OUTRUN_SKIES) {
        const name = skyName(number);
        const sky = JSON.parse(await readFile(`content/images/${generic}.json`, 'utf8')) as Record<string, unknown>;
        const text = JSON.stringify({ ...sky, name });
        const skyFile = `content/images/${name}.json`;
        if (check) {
          const committed = await readFile(skyFile, 'utf8').catch(() => null);
          requireInput(committed === text, `/${skyFile}`, `${skyFile} is not ${generic} under its name`);
          continue;
        }
        await atomicWrite(skyFile, text);
        // Its local original: the stage's background from the tile ROMs, at the published sky's size and horizon.
        const columns = sky.columns as number,
          rows = (sky.tiles as unknown[]).length / columns;
        const [width, height] = [columns * TILE_PICTURE_TILE_SIZE, rows * TILE_PICTURE_TILE_SIZE];
        const background = stageBackground(programs.main, tiles, number, width, height, SKY_HORIZON);
        const channel = (c: number) => Math.round((c * 255) / 31);
        const pixels = Uint32Array.from(background, (c) =>
          rgba(channel((c >> 10) & 31), channel((c >> 5) & 31), channel(c & 31)),
        );
        const original = drawScreenPicture(name, { width, height, pixels }, { columns, rows, fit: 'fill' });
        await atomicWrite(path.join(ORIGINALS_DIRECTORY, 'images', `${name}.json`), JSON.stringify(original));
      }
      console.log(
        JSON.stringify({
          ok: true,
          zip,
          conversion: CONVERSION_VERSION,
          checked: check,
          courses,
          skies: [...OUTRUN_SKIES.keys()].map(skyName),
        }),
      );
      break;
    }
    case 'look': {
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
          const goal =
            row === OUTRUN_STAGES.length - 1 ? goals.stretches[goalNumber(programs.main, row, column)]! : null;
          const span = stageSpan(stage, {
            first: row === 0,
            fork: goal ? null : fork,
            ...(goal ? { goal: { stretch: goal, path: goals.path } } : {}),
          });
          const laid = layRoad([{ span, id: 'stage', leaves: span.centreLane, starts: true }]);
          const { end, profile, crossings } = roadProfile(laid, { tables, kmh: TOP_KMH });
          const stationOf = (p: number) => laid[0]!.plan.station(p);
          const course = { stage: number };
          const positions = Array.from({ length }, (_, p) => p);
          const points = stage.widthsHeights.filter((p) => p.position < length);
          const original = hillsAlong(points, tables, positions, () => TOP_KMH);
          const stations = Array.from({ length: Math.floor(end) + 1 }, (_, s) => s);
          const runs = tableRuns(points, tables, () => TOP_KMH);
          const ahead = Math.ceil(RENDER_FAR_DEPTH_METERS / POSITION_METRES);
          // Rows on the original's screen: this game's top as the original's row of the same look.
          const game = positions.map(
            (p) => ORIGINAL_LEVEL_TOP - gameLook(roadTopRow(profile, stationOf(p), end)) * 224,
          );
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
            crossings: crossings.map((pairs) => ({
              at: [round1(pairs[0]![0]), round1(pairs[0]![1])],
              apart: round1(Math.min(...pairs.map(([a, b]) => Math.abs(profile.height(a) - profile.height(b))))),
            })),
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
      break;
    }
    case 'player': {
      // The player's car, the Ferrari, drawn into TESTAROSSA's picture set as its local original.
      const { zip, programs } = await readPrograms(options.get('--zip'));
      const words = assembleSprites(readZip(new Uint8Array(await readFile(zip))));
      const published = JSON.parse(await readFile(PLAYER_SET, 'utf8')) as Parameters<typeof playerOriginal>[2];
      const file = path.join(ORIGINALS_DIRECTORY, path.relative('content', PLAYER_SET));
      await atomicWrite(file, formatSavedJson(playerOriginal(programs.main, words, published)));
      console.log(JSON.stringify({ ok: true, zip, original: file }));
      break;
    }
    case 'sounds': {
      // The original's voices and effects as the local originals of this game's recordings, AAC-LC at 44.1 kHz.
      const { zip } = await readPrograms(options.get('--zip'));
      const { program, banks } = assembleSound(readZip(new Uint8Array(await readFile(zip))));
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
      break;
    }
    case 'boards': {
      // The boards of every sprite OUTRUN's stages, fork and goal stretches and start show, written to content,
      // or with `--check` compared with the ones there.
      const check = options.has('--check');
      const { zip, programs } = await readPrograms(options.get('--zip'));
      const files = readZip(new Uint8Array(await readFile(zip)));
      const words = assembleSprites(files);
      const length = stageLength(programs.main);
      const uses: SpriteUse[] = [];
      const skipped = new Map<number, number>();
      // The stages' points to their length, and every point of the fork and goal stretches.
      const points = [
        ...OUTRUN_STAGES.flat().flatMap((n) => readStage(programs, n).scenery.filter((p) => p.position < length)),
        ...readForkStretch(programs).scenery,
        ...readGoalStretches(programs).stretches.flatMap((s) => s.scenery),
      ];
      const types = [...new Set(points.map((p) => p.type))].sort((a, b) => a - b);
      for (const type of types)
        for (const e of readSceneryType(programs.main, type).entries) {
          const shown = sceneryRoutine(e.flags, e.y);
          if (!shown) {
            skipped.set(e.flags >> 4, (skipped.get(e.flags >> 4) ?? 0) + 1);
            continue;
          }
          uses.push({
            sprite: e.sprite,
            mirrored: (e.flags & 1) !== 0,
            palette: e.palette,
            shadow: (e.flags & 2) !== 0,
            ...shown,
          });
        }
      for (const o of readStartObjects(programs.main))
        uses.push({
          sprite: o.sprite,
          mirrored: (o.flags & 1) !== 0,
          anchor: o.anchor & 15,
          routine: o.routine,
          palette: o.palette,
          shadow: (o.flags & 0x10) !== 0,
        });
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
        // The original's picture of the same name, local: Git ignores the originals' directory.
        if (!check) await atomicWrite(path.join(ORIGINALS_DIRECTORY, board.original.path), board.original.bytes);
      }
      console.log(
        JSON.stringify({
          ok: true,
          checked: check,
          originals: check ? null : ORIGINALS_DIRECTORY,
          boards: boards.map((b) => b.name),
          notConverted: Object.fromEntries([...skipped].map(([kind, n]) => [`kind ${kind}`, n])),
        }),
      );
      break;
    }
    case 'turbo-outrun-read': {
      // TURBO OUTRUN's ROM zip checked and read, never decrypted; every table its course uses to the dump, and the
      // tables described as OUTRUN's checked against OUTRUN's ROM zip.
      const zip = await oneZip(options.get('--zip'), TURBO_OUTRUN_ROM_DIRECTORY, '--zip');
      const outrunZip = await oneZip(options.get('--outrun-zip'), ROM_DIRECTORY, '--outrun-zip');
      const files = readZip(new Uint8Array(await readFile(zip)));
      const dump = turboOutrunDump(files, readZip(new Uint8Array(await readFile(outrunZip))));
      // Where the objects stand: at the top speed with the original's 108 objects, and as designed (one step a
      // position, below 216.3 km/h, with no object wanting).
      const { main } = assembleTurboOutrunPrograms(files);
      const model = (kmh: number, slots: number) => {
        const { objects, runs } = turboOutrunObjects(main, dump.stages, { kmh, slots });
        return { objects, runs };
      };
      const top = model(dump.constants.topSpeed, dump.constants.objectSlots.count);
      const designed = model(216, 4096);
      const out = options.get('--out') ?? TURBO_OUTRUN_DUMP_DIRECTORY;
      await atomicWrite(path.join(out, 'turbo-outrun.json'), JSON.stringify(dump) + '\n');
      const degrees = (radians: number) => Math.round(((radians * 180) / Math.PI) * 100) / 100;
      console.log(
        JSON.stringify({
          ok: true,
          zip,
          outrunZip,
          out,
          constants: dump.constants,
          stages: dump.stages.map((stage, n) => {
            const { path: p } = stage;
            // Where the last turn ends: the heading holds from there to the path's end.
            let lastTurn = p.x.length - 1;
            while (lastTurn > 0 && p.x[lastTurn - 1] === p.x[lastTurn] && p.y[lastTurn - 1] === p.y[lastTurn])
              lastTurn--;
            return {
              number: n,
              name: dump.names[n]!.name,
              curves: stage.curves.length,
              widths: stage.widthsHeights.filter((q) => q.kind !== 0).length,
              heights: stage.widthsHeights.filter((q) => q.kind === 0).length,
              scenery: stage.scenery.length,
              lastTurn,
              // Counterclockwise positive, as `pathTurn` counts.
              turn: degrees(pathTurn(p, 0, p.x.length - 1)),
              background: dump.stageBackgrounds[n]!.background,
            };
          }),
          heightTables: Object.keys(dump.heightTables).length,
          sceneryTypes: Object.keys(dump.sceneryTypes).length,
          kinds: Object.keys(dump.kinds).length,
          sizeLists: Object.keys(dump.sizeLists).length,
          palettes: Object.keys(dump.palettes).length,
          startObjects: dump.startObjects.map((s) => s.shown.length),
          sameAsOutrun: dump.sameAsOutrun,
          objects: {
            kmh: dump.constants.topSpeed,
            stages: top.runs.map((run) => ({
              stage: run.stage,
              gate: round3(run.gate),
              backgroundChange: round3(run.backgroundChange),
              end: round3(run.end),
              stops: run.stops,
              standing: top.objects.filter((o) => o.stage === run.stage).length,
              brought: run.brought,
              dropped: run.dropped,
              ended: run.ended,
              intoNext: top.objects.filter((o) => o.from.stage === run.stage && o.stage !== run.stage).length,
            })),
            standing: top.objects.length,
            pointItems: top.runs.reduce((n, r) => n + r.brought, 0),
            dropped: top.runs.reduce((n, r) => n + r.dropped, 0),
            designed: designed.runs.reduce((n, r) => n + r.brought, 0),
            designedDropped: designed.runs.reduce((n, r) => n + r.dropped, 0),
          },
        }),
      );
      break;
    }
    default:
      requireInput(false, '/arguments', `Unknown road data command ${command ?? ''}`);
  }
} catch (error) {
  reportError(error);
}
