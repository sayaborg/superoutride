/**
 * The road data tool: `npm run road-data -- <command>` ([Development](../../docs/development.md#road-data-commands)).
 * Each command prints one JSON result, or its diagnostics and exits 1.
 */
import { reportError, requireInput } from '../course/authoring-io.js';
import { parse } from './road-data-commands.js';
import { OUTRUN_COMMANDS } from './outrun-commands.js';
import { SUPER_HANG_ON_COMMANDS } from './super-hang-on-commands.js';
import { TURBO_OUTRUN_COMMANDS } from './turbo-outrun-commands.js';
import { ENDURO_RACER_COMMANDS } from './enduro-racer-commands.js';
import { SUPER_MONACO_GP_COMMANDS } from './super-monaco-gp-commands.js';
import { ORIGINALS_COMMANDS } from './originals-commands.js';
import { SCREEN_PIECES_COMMANDS } from './screen-pieces-commands.js';

/** Every original's commands by name, and the one raising them all. */
const COMMANDS = Object.freeze({
  ...OUTRUN_COMMANDS,
  ...SUPER_HANG_ON_COMMANDS,
  ...TURBO_OUTRUN_COMMANDS,
  ...ENDURO_RACER_COMMANDS,
  ...SUPER_MONACO_GP_COMMANDS,
  ...ORIGINALS_COMMANDS,
  ...SCREEN_PIECES_COMMANDS,
});

const [command, ...rest] = process.argv.slice(2);

try {
  const options = parse(rest);
  const run = command !== undefined && Object.hasOwn(COMMANDS, command) ? COMMANDS[command] : undefined;
  requireInput(run, '/arguments', `Unknown road data command ${command ?? ''}`);
  await run(options);
} catch (error) {
  reportError(error);
}
