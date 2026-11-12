/**
 * The register of the originals ([Original road data](../../docs/original-road-data.md#original-road-data)): every
 * original the road data tool raises, in the order `originals` raises them, each its ROM source, its conversion and its
 * commands. It is the one list of them: `originals` and the tool's entry read it.
 */
import type { RomSource } from './shared/rom-set.js';
import type { RoadDataCommands } from './road-data-commands.js';
import type { Conversion } from './shared/conversion.js';
import { OUTRUN_ROMS } from './outrun/outrun-rom.js';
import { SUPER_HANG_ON_ROMS } from './super-hang-on/super-hang-on-rom.js';
import { TURBO_OUTRUN_ROMS } from './turbo-outrun/turbo-outrun-rom.js';
import { ENDURO_RACER_ROMS } from './enduro-racer/enduro-racer-rom.js';
import { OUTRUN_CONVERSION } from './outrun/outrun-course.js';
import { OUTRUN_COMMANDS } from './outrun/outrun-commands.js';
import { SUPER_HANG_ON_CONVERSION } from './super-hang-on/super-hang-on-course.js';
import { SUPER_HANG_ON_COMMANDS } from './super-hang-on/super-hang-on-commands.js';
import { TURBO_OUTRUN_CONVERSION } from './turbo-outrun/turbo-outrun-course.js';
import { TURBO_OUTRUN_COMMANDS } from './turbo-outrun/turbo-outrun-commands.js';
import { ENDURO_RACER_CONVERSION } from './enduro-racer/enduro-racer-course.js';
import { ENDURO_RACER_COMMANDS } from './enduro-racer/enduro-racer-commands.js';
import { POLE_POSITION_II_ROMS } from './pole-position-ii/pole-position-ii-rom.js';
import { POLE_POSITION_II_CONVERSION } from './pole-position-ii/pole-position-ii-course.js';
import { POLE_POSITION_II_COMMANDS } from './pole-position-ii/pole-position-ii-commands.js';
import { FINAL_LAP_2_ROMS } from './final-lap-2/final-lap-2-rom.js';
import { FINAL_LAP_2_CONVERSION } from './final-lap-2/final-lap-2-course.js';
import { FINAL_LAP_2_COMMANDS } from './final-lap-2/final-lap-2-commands.js';
import { CHASE_HQ_ROMS } from './chase-hq/chase-hq-rom.js';
import { CHASE_HQ_CONVERSION } from './chase-hq/chase-hq-course.js';
import { CHASE_HQ_COMMANDS } from './chase-hq/chase-hq-commands.js';
import { TOP_SPEED_ROMS } from './top-speed/top-speed-rom.js';
import { TOP_SPEED_CONVERSION } from './top-speed/top-speed-course.js';
import { TOP_SPEED_COMMANDS } from './top-speed/top-speed-commands.js';
import { CONTINENTAL_CIRCUS_ROMS } from './continental-circus/continental-circus-rom.js';
import { CONTINENTAL_CIRCUS_CONVERSION } from './continental-circus/continental-circus-course.js';
import { CONTINENTAL_CIRCUS_COMMANDS } from './continental-circus/continental-circus-commands.js';
import { BIG_RUN_ROMS } from './big-run/big-run-rom.js';
import { BIG_RUN_CONVERSION } from './big-run/big-run-course.js';
import { BIG_RUN_COMMANDS } from './big-run/big-run-commands.js';
import { CISCO_HEAT_ROMS } from './cisco-heat/cisco-heat-rom.js';
import { CISCO_HEAT_CONVERSION } from './cisco-heat/cisco-heat-course.js';
import { CISCO_HEAT_COMMANDS } from './cisco-heat/cisco-heat-commands.js';

/** An original as the tool raises it: its ROM source (its name, `source.original`), its conversion and its commands. */
export interface RegisteredOriginal {
  readonly source: RomSource;
  readonly conversion: Conversion;
  readonly commands: RoadDataCommands;
}

export const ORIGINALS: readonly RegisteredOriginal[] = Object.freeze([
  { source: OUTRUN_ROMS, conversion: OUTRUN_CONVERSION, commands: OUTRUN_COMMANDS },
  { source: SUPER_HANG_ON_ROMS, conversion: SUPER_HANG_ON_CONVERSION, commands: SUPER_HANG_ON_COMMANDS },
  { source: TURBO_OUTRUN_ROMS, conversion: TURBO_OUTRUN_CONVERSION, commands: TURBO_OUTRUN_COMMANDS },
  { source: ENDURO_RACER_ROMS, conversion: ENDURO_RACER_CONVERSION, commands: ENDURO_RACER_COMMANDS },
  { source: POLE_POSITION_II_ROMS, conversion: POLE_POSITION_II_CONVERSION, commands: POLE_POSITION_II_COMMANDS },
  { source: FINAL_LAP_2_ROMS, conversion: FINAL_LAP_2_CONVERSION, commands: FINAL_LAP_2_COMMANDS },
  { source: CHASE_HQ_ROMS, conversion: CHASE_HQ_CONVERSION, commands: CHASE_HQ_COMMANDS },
  { source: TOP_SPEED_ROMS, conversion: TOP_SPEED_CONVERSION, commands: TOP_SPEED_COMMANDS },
  {
    source: CONTINENTAL_CIRCUS_ROMS,
    conversion: CONTINENTAL_CIRCUS_CONVERSION,
    commands: CONTINENTAL_CIRCUS_COMMANDS,
  },
  { source: BIG_RUN_ROMS, conversion: BIG_RUN_CONVERSION, commands: BIG_RUN_COMMANDS },
  { source: CISCO_HEAT_ROMS, conversion: CISCO_HEAT_CONVERSION, commands: CISCO_HEAT_COMMANDS },
]);

/** An original's conversion command's name: `<original>-course`. */
export const conversionName = (original: RegisteredOriginal) => `${original.source.original}-course`;
