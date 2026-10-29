/**
 * The road data tool: `npm run road-data -- <command>` ([Development](../../docs/development.md#road-data-commands)).
 * Each command prints its results, one JSON line each, or its diagnostics; a result whose `ok` is false or an error
 * ends it with 1.
 */
import { reportError } from '../course/authoring-io.js';
import { requireInput } from '../authoring/authoring-error.js';
import { parse, type RoadDataCommands } from './road-data-commands.js';
import { OUTRUN_COMMANDS } from './outrun-commands.js';
import { SUPER_HANG_ON_COMMANDS } from './super-hang-on-commands.js';
import { TURBO_OUTRUN_COMMANDS } from './turbo-outrun-commands.js';
import { ENDURO_RACER_COMMANDS } from './enduro-racer-commands.js';
import { SUPER_MONACO_GP_COMMANDS } from './super-monaco-gp-commands.js';
import { ORIGINALS_COMMANDS } from './originals-commands.js';
import { SCREEN_PIECES_COMMANDS } from './screen-pieces-commands.js';
import { AT_SPEED_COMMANDS } from './at-speed-commands.js';
import { HEIGHT_TICKS_COMMANDS } from './height-ticks-commands.js';

/** Every original's commands by name, and the one raising them all. */
const COMMANDS: RoadDataCommands = Object.freeze({
  ...OUTRUN_COMMANDS,
  ...SUPER_HANG_ON_COMMANDS,
  ...TURBO_OUTRUN_COMMANDS,
  ...ENDURO_RACER_COMMANDS,
  ...SUPER_MONACO_GP_COMMANDS,
  ...ORIGINALS_COMMANDS,
  ...SCREEN_PIECES_COMMANDS,
  ...AT_SPEED_COMMANDS,
  ...HEIGHT_TICKS_COMMANDS,
});

const [command, ...rest] = process.argv.slice(2);

try {
  const run = command !== undefined && Object.hasOwn(COMMANDS, command) ? COMMANDS[command] : undefined;
  requireInput(run, '/arguments', `Unknown road data command ${command ?? ''}`);
  for await (const result of run.run(parse(rest, run.options))) {
    console.log(JSON.stringify(result));
    if ((result as { ok?: unknown }).ok === false) process.exitCode = 1;
  }
} catch (error) {
  reportError(error);
}
