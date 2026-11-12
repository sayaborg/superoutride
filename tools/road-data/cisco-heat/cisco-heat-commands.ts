/**
 * CISCO HEAT's road data commands ([Development](../../../docs/development.md#road-data-commands)): each prints one JSON
 * result, or its diagnostics and exits 1.
 */
import type { RoadDataCommands } from '../road-data-commands.js';
import { conversionCommand } from '../original-outputs.js';
import { CISCO_HEAT_CONVERSION } from './cisco-heat-course.js';
import { CISCO_HEAT_ROMS } from './cisco-heat-rom.js';

export const CISCO_HEAT_COMMANDS: RoadDataCommands = Object.freeze({
  'cisco-heat-course': conversionCommand(CISCO_HEAT_CONVERSION, CISCO_HEAT_ROMS),
});
