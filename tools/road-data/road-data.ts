/**
 * The road data tool: `npm run road-data -- <command>` ([Development](../../docs/development.md#road-data-commands)).
 * Each command prints one JSON result, or its diagnostics and exits 1.
 */
import path from 'node:path';
import { readdir, readFile } from 'node:fs/promises';
import { atomicWrite, reportError, requireInput } from '../course/authoring-io.js';
import { readZip } from './zip.js';
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
  type Stretch,
} from './outrun-road.js';

/** Positions left out at each end of a curve where its rate is measured. */
const JOIN = 2;
const round1 = (value: number) => Math.round(value * 10) / 10;

/** Where K's ROM zip and the tool's dumps lie: never committed. */
const ROM_DIRECTORY = 'reference-media/outrun/rom';
const DUMP_DIRECTORY = 'reference-media/outrun/rom-data';
/** The dump's format: raw tables, local to the machine that read the ROMs. */
const DUMP_FORMAT = Object.freeze({ format: 'superoutride.outrun-road-data', version: 1 } as const);

const [command, ...rest] = process.argv.slice(2);

function parse(args: readonly string[]) {
  const options = new Map<string, string>();
  for (let i = 0; i < args.length; i += 2) {
    requireInput(args[i]?.startsWith('--') && args[i + 1] !== undefined, '/arguments', 'Options are --name value');
    options.set(args[i]!, args[i + 1]!);
  }
  return options;
}

try {
  const options = parse(rest);
  switch (command) {
    case 'read': {
      // The ROM zip (`--zip`, else the one zip in the ROM directory), checked and read; every table to the dump.
      let zip = options.get('--zip');
      if (!zip) {
        const zips = (await readdir(ROM_DIRECTORY).catch(() => [])).filter((name) => name.endsWith('.zip'));
        requireInput(zips.length === 1, '/arguments/--zip', `--zip names the ROM zip, or ${ROM_DIRECTORY} holds one`);
        zip = path.join(ROM_DIRECTORY, zips[0]!);
      }
      const programs = assemblePrograms(readZip(new Uint8Array(await readFile(zip))));
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
    default:
      requireInput(false, '/arguments', `Unknown road data command ${command ?? ''}`);
  }
} catch (error) {
  reportError(error);
}
