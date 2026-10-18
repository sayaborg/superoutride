/**
 * The road data tool: `npm run road-data -- <command>` ([Development](../../docs/development.md#road-data-commands)).
 * Each command prints one JSON result, or its diagnostics and exits 1.
 */
import path from 'node:path';
import { readdir, readFile } from 'node:fs/promises';
import { atomicWrite, reportError, requireInput } from '../course/authoring-io.js';
import { normalizeCoursePositions } from '../authoring/course-joints.js';
import type { Json } from '../authoring/json-pointer.js';
import { readCourseDocument } from '../../src/course/course-document.js';
import { formatSavedJson } from '../../src/content/saved-json.js';
import { CAMERA_DEFINITION } from '../../src/view/camera-definition.js';
import { cameraDistance } from '../../src/view/camera.js';
import { readZip } from './zip.js';
import { hillsAlong } from './outrun-hills.js';
import { CONVERSION_VERSION, OUTRUN_COURSES, stageCourse } from './outrun-course.js';
import { assemblePrograms, OUTRUN_PROGRAM_ROMS } from './outrun-rom.js';
import {
  OUTRUN_STAGES,
  pathOffset,
  pathTurn,
  readForkStretch,
  readGoalStretches,
  readHeightTable,
  readSceneryType,
  readStage,
  stageLength,
  type HeightTable,
  type Stage,
  type Stretch,
} from './outrun-road.js';

/** Positions left out at each end of a curve where its rate is measured. */
const JOIN = 2;
const round1 = (value: number) => Math.round(value * 10) / 10;
/** The top speed, km/h: the holds of the hills are counted at it unless told otherwise. */
const TOP_KMH = 293;

/** Where K's ROM zip and the tool's dumps lie: never committed. */
const ROM_DIRECTORY = 'reference-media/outrun/rom';
const DUMP_DIRECTORY = 'reference-media/outrun/rom-data';
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
      // Each stage's course document from the ROMs, written to content, or with `--check` compared with the one there.
      const check = options.has('--check');
      const { zip, programs } = await readPrograms(options.get('--zip'));
      const length = stageLength(programs.main);
      const vehicle = JSON.parse(await readFile('content/vehicles/TESTAROSSA.json', 'utf8')) as {
        overallWidth: number;
      };
      const courses = [];
      for (const course of OUTRUN_COURSES) {
        const stage = readStage(programs, course.stage);
        const document = stageCourse(stage, {
          ...course,
          length,
          offset: pathOffset(stage.curves, stage.path, length),
          carWidth: vehicle.overallWidth,
          cameraDistance: cameraDistance(CAMERA_DEFINITION),
        });
        const file = `content/courses/${course.id}.course.json`;
        const normalized = normalizeCoursePositions(document as unknown as Json).document;
        const read = readCourseDocument(normalized, file);
        if (!read.ok) throw Object.assign(new Error(`${file} does not read`), { diagnostics: read.diagnostics });
        const text = formatSavedJson(normalized);
        if (check) {
          const committed = await readFile(file, 'utf8').catch(() => null);
          requireInput(committed === text, `/${file}`, `${file} is not the conversion of the ROMs`);
        } else await atomicWrite(file, text);
        courses.push({
          course: file,
          stage: `0x${course.stage.toString(16)}`,
          metres: round1(document.sections.flatMap((section) => section.plan).reduce((sum, e) => sum + e.length, 0)),
        });
      }
      console.log(JSON.stringify({ ok: true, zip, conversion: CONVERSION_VERSION, checked: check, courses }));
      break;
    }
    default:
      requireInput(false, '/arguments', `Unknown road data command ${command ?? ''}`);
  }
} catch (error) {
  reportError(error);
}
