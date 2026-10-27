/**
 * Every original raised again from its ROM zips at once
 * ([Raising the originals again](../../docs/original-road-data.md#raising-the-originals-again)): each original's
 * commands that write content, in one order, each reading its zips from its ROM directory.
 */
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { OUTRUN_COMMANDS } from './outrun-commands.js';
import { SUPER_HANG_ON_COMMANDS } from './super-hang-on-commands.js';
import { TURBO_OUTRUN_COMMANDS } from './turbo-outrun-commands.js';
import { ENDURO_RACER_COMMANDS } from './enduro-racer-commands.js';
import { SUPER_MONACO_GP_COMMANDS } from './super-monaco-gp-commands.js';
import type { RoadDataCommands, RoadDataOptions } from './road-data-commands.js';

/** The commands that write an original's content, in the order they run. */
const ORDER: readonly (readonly [RoadDataCommands, string])[] = Object.freeze([
  [OUTRUN_COMMANDS, 'outrun-course'],
  [SUPER_HANG_ON_COMMANDS, 'super-hang-on-course'],
  [TURBO_OUTRUN_COMMANDS, 'turbo-outrun-course'],
  [ENDURO_RACER_COMMANDS, 'enduro-racer-course'],
  [SUPER_MONACO_GP_COMMANDS, 'super-monaco-gp-course'],
]);

const COURSES = 'content/courses';

/** Each course document's SHA-256, by course ID. */
async function courseDigests(): Promise<Map<string, string>> {
  const names = (await readdir(COURSES)).filter((name) => name.endsWith('.course.json')).sort();
  const digests = new Map<string, string>();
  for (const name of names)
    digests.set(
      name.slice(0, -'.course.json'.length),
      createHash('sha256')
        .update(await readFile(path.join(COURSES, name)))
        .digest('hex'),
    );
  return digests;
}

/** What `run` prints, each line its JSON, instead of printing it. */
async function printed(run: () => Promise<void>): Promise<unknown[]> {
  const lines: string[] = [];
  const log = console.log;
  console.log = (...values: unknown[]) => void lines.push(values.join(' '));
  try {
    await run();
  } finally {
    console.log = log;
  }
  return lines.map((line) => JSON.parse(line) as unknown);
}

/** An error's diagnostics, else its message as one. */
function diagnosticsOf(error: unknown): readonly unknown[] {
  const { diagnostics, diagnostic } = (error ?? {}) as { diagnostics?: readonly unknown[]; diagnostic?: unknown };
  return (
    diagnostics ?? (diagnostic ? [diagnostic] : [{ kind: 'tool', code: 'failed', path: '', message: String(error) }])
  );
}

export const ORIGINALS_COMMANDS: RoadDataCommands = Object.freeze({
  originals: async (options: RoadDataOptions) => {
    // Every original's content from its zips: each command's result one line, then what changed. A command that fails
    // is reported and the rest still run; the command then ends with a failure.
    const check = options.has('--check');
    const before = await courseDigests();
    const failed: string[] = [];
    for (const [commands, command] of ORDER) {
      const run = commands[command]!;
      try {
        const results = await printed(() => run(new Map(check ? [['--check', 'yes']] : [])));
        console.log(JSON.stringify({ ok: true, command, results }));
      } catch (error) {
        failed.push(command);
        console.log(JSON.stringify({ ok: false, command, diagnostics: diagnosticsOf(error) }));
      }
    }
    const after = await courseDigests();
    const changed = [...new Set([...before.keys(), ...after.keys()])]
      .filter((id) => before.get(id) !== after.get(id))
      .sort();
    console.log(
      JSON.stringify({
        ok: failed.length === 0,
        checked: check,
        failed,
        changedCourses: changed,
        measure: changed.length ? 'npm run measure -- generate' : null,
      }),
    );
    if (failed.length) process.exitCode = 1;
  },
});
