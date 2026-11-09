/**
 * CONTINENTAL CIRCUS's road data commands ([Development](../../../docs/development.md#road-data-commands)): each prints
 * one JSON result, or its diagnostics and exits 1.
 */
import type { RoadDataCommands } from '../road-data-commands.js';
import { conversionCommand } from '../original-outputs.js';
import { CONTINENTAL_CIRCUS_CONVERSION } from './continental-circus-course.js';
import { CONTINENTAL_CIRCUS_ROMS } from './continental-circus-rom.js';

export const CONTINENTAL_CIRCUS_COMMANDS: RoadDataCommands = Object.freeze({
  'continental-circus-course': conversionCommand(CONTINENTAL_CIRCUS_CONVERSION, CONTINENTAL_CIRCUS_ROMS),
});
