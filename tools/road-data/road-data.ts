/**
 * The road data tool: `npm run road-data -- <command>` ([Development](../../docs/development.md#road-data-commands)).
 * Each command prints its results, one JSON line each, or its diagnostics; a result whose `ok` is false or an error
 * ends it with 1.
 */
import { readFileSync } from 'node:fs';
import { reportError } from '../course/authoring-io.js';
import { requireInput } from '../authoring/authoring-error.js';
import { parse, type RoadDataCommand, type RoadDataCommands } from './road-data-commands.js';
import { namingSources } from './shared/conversion-errors.js';
import { ORIGINALS } from './originals-register.js';
import { ORIGINALS_COMMANDS } from './originals-commands.js';
import { SCREEN_PIECES_COMMANDS } from './screen-pieces-commands.js';
import { AT_SPEED_COMMANDS } from './at-speed-commands.js';
import { HEIGHT_TICKS_COMMANDS } from './height-ticks-commands.js';

/** Every registered original's commands by name, the one raising them all, and the checks across them. */
const COMMANDS: RoadDataCommands = Object.freeze({
  ...Object.assign({}, ...ORIGINALS.map((original) => original.commands)),
  ...ORIGINALS_COMMANDS,
  ...SCREEN_PIECES_COMMANDS,
  ...AT_SPEED_COMMANDS,
  ...HEIGHT_TICKS_COMMANDS,
});

const [command, ...rest] = process.argv.slice(2);

/**
 * Whether `version` (`major.minor.patch`) meets every comparator of `range` (`>=24 <25`, as package.json's `engines`
 * writes it), each a full or partial version compared part by part.
 */
function meets(version: string, range: string): boolean {
  const parts = (v: string) => v.split('.').map(Number);
  const compare = (a: number[], b: number[]) => {
    for (let k = 0; k < b.length; k++) if (a[k] !== b[k]) return (a[k] ?? 0) - b[k]!;
    return 0;
  };
  return range.split(/\s+/).every((comparator) => {
    const [, op = '=', bound = ''] = /^(>=|<=|>|<|=)?v?([\d.]+)$/.exec(comparator) ?? [];
    const c = compare(parts(version), parts(bound));
    return { '>=': c >= 0, '<=': c <= 0, '>': c > 0, '<': c < 0, '=': c === 0 }[op as '='];
  });
}

let run: RoadDataCommand | undefined;
try {
  // The conversions' arithmetic is Node's: another version may differ in a last digit (`Math.pow`) and fail a check
  // as if the ROMs differed, so the tool runs on the version package.json names alone.
  const { node } = (
    JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as {
      engines: { node: string };
    }
  ).engines;
  requireInput(
    meets(process.versions.node, node),
    '/node',
    `The road data tool runs on Node ${node} (package.json's engines), not ${process.versions.node}`,
  );
  run = command !== undefined && Object.hasOwn(COMMANDS, command) ? COMMANDS[command] : undefined;
  requireInput(run, '/arguments', `Unknown road data command ${command ?? ''}`);
  for await (const result of run.run(parse(rest, run.options))) {
    console.log(JSON.stringify(result));
    if ((result as { ok?: unknown }).ok === false) process.exitCode = 1;
  }
} catch (error) {
  reportError(namingSources(error, run?.sources ?? []));
}
