/**
 * OUTRUN's road data commands ([Development](../../../docs/development.md#road-data-commands)): each prints one JSON
 * result, or its diagnostics and exits 1.
 */
import path from 'node:path';
import { mkdir, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { atomicWrite } from '../../course/authoring-io.js';
import { requireInput } from '../../authoring/authoring-error.js';
import { hillsAlong } from '../out-run-hardware/hills.js';
import { OUTRUN_CONVERSION } from './outrun-course.js';
import { commandSample, OUTRUN_SOUNDS, PCM_OUTPUT_RATE, samplePcm } from './outrun-sounds.js';
import { assemblePrograms, assembleSound, OUTRUN_ROMS } from './outrun-rom.js';
import { readClock, readTopKmh, type Stage } from './outrun-road.js';
import { pathOffset, pathTurn, type HeightTable } from '../out-run-hardware/road-tables.js';
import {
  dumpDirectory,
  ORIGINALS_DIRECTORY,
  readSource,
  zipOptions,
  type RoadDataOptions,
  type RoadDataCommands,
  command,
} from '../road-data-commands.js';
import { conversionCommand } from '../original-outputs.js';
import { round1 } from '../shared/conversion.js';
import { outrunDump } from './outrun-dump.js';

/** Positions left out at each end of a curve where its rate is measured. */
const JOIN = 2;

/** The programs from OUTRUN's zip ([`readSource`](../road-data-commands.ts)). */
async function readPrograms(options: RoadDataOptions) {
  const { zips, set } = await readSource(OUTRUN_ROMS, options);
  return { zips, set, programs: assemblePrograms(set) };
}

export const OUTRUN_COMMANDS: RoadDataCommands = Object.freeze({
  'outrun-read': command(
    { ...zipOptions(OUTRUN_ROMS), '--out': 'value' },
    async function* (options) {
      // The ROM zip checked and read; every table to the dump.
      const { zips, programs } = await readPrograms(options);
      const dump = outrunDump(programs);
      const { stageLength: length, stages } = dump;
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
        heightTables: Object.keys(dump.heightTables).length,
        sceneryTypes: Object.keys(dump.sceneryTypes).length,
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
