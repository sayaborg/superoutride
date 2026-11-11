/**
 * BIG RUN's road data commands ([Development](../../../docs/development.md#road-data-commands)): each prints one JSON
 * result, or its diagnostics and exits 1.
 */
import type { RoadDataCommands } from '../road-data-commands.js';
import { conversionCommand } from '../original-outputs.js';
import { BIG_RUN_CONVERSION } from './big-run-course.js';
import { BIG_RUN_ROMS } from './big-run-rom.js';

export const BIG_RUN_COMMANDS: RoadDataCommands = Object.freeze({
  'big-run-course': conversionCommand(BIG_RUN_CONVERSION, BIG_RUN_ROMS),
});
