/**
 * The check of [Time made into position](../../docs/original-road-data.md#time-made-into-position) against the originals'
 * own ticks ([Development](../../docs/development.md#road-data-commands)): each original's objects run tick by tick at
 * one low speed, as the conversion ran them before the rule, compared with where the conversion places them in the
 * limit of a speed falling to 0. It writes nothing.
 */
import { requireInput } from '../authoring/authoring-error.js';
import { OUTRUN_ROMS } from './outrun/outrun-rom.js';
import { outrunAtSpeed } from './outrun/outrun-commands.js';
import { TURBO_OUTRUN_ROMS } from './turbo-outrun/turbo-outrun-rom.js';
import { turboOutrunAtSpeed } from './turbo-outrun/turbo-outrun-commands.js';
import { SUPER_HANG_ON_ROMS } from './super-hang-on/super-hang-on-rom.js';
import { superHangOnAtSpeed } from './super-hang-on/super-hang-on-commands.js';
import { command, zipOptions, type RoadDataCommands } from './road-data-commands.js';

/** The speed the ticks run at unless told otherwise, km/h: low, so a tick advances the road a small part of a position. */
const LOW_KMH = 15;
export const AT_SPEED_COMMANDS: RoadDataCommands = Object.freeze({
  'positions-at-speed': command(
    { '--kmh': 'value', ...zipOptions(OUTRUN_ROMS, TURBO_OUTRUN_ROMS, SUPER_HANG_ON_ROMS) },
    async function* (options) {
      const kmh = Number(options.get('--kmh') ?? LOW_KMH);
      requireInput(Number.isInteger(kmh) && kmh > 0, '/arguments/--kmh', '--kmh is a whole speed above 0, km/h');
      const originals = [
        await outrunAtSpeed(options, kmh),
        await turboOutrunAtSpeed(options, kmh),
        await superHangOnAtSpeed(options, kmh),
      ];
      yield { ok: true, originals };
    },
    [OUTRUN_ROMS, TURBO_OUTRUN_ROMS, SUPER_HANG_ON_ROMS],
  ),
});
