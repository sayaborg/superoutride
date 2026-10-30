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
import { SUPER_MONACO_GP_ROMS } from './super-monaco-gp/super-monaco-gp-rom.js';
import { OUTRUN_CONVERSION } from './outrun/outrun-course.js';
import { OUTRUN_COMMANDS } from './outrun/outrun-commands.js';
import { SUPER_HANG_ON_CONVERSION } from './super-hang-on/super-hang-on-courses.js';
import { SUPER_HANG_ON_COMMANDS } from './super-hang-on/super-hang-on-commands.js';
import { TURBO_OUTRUN_CONVERSION } from './turbo-outrun/turbo-outrun-course.js';
import { TURBO_OUTRUN_COMMANDS } from './turbo-outrun/turbo-outrun-commands.js';
import { ENDURO_RACER_CONVERSION } from './enduro-racer/enduro-racer-course.js';
import { ENDURO_RACER_COMMANDS } from './enduro-racer/enduro-racer-commands.js';
import { SUPER_MONACO_GP_CONVERSION } from './super-monaco-gp/super-monaco-gp-course.js';
import { SUPER_MONACO_GP_COMMANDS } from './super-monaco-gp/super-monaco-gp-commands.js';

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
  { source: SUPER_MONACO_GP_ROMS, conversion: SUPER_MONACO_GP_CONVERSION, commands: SUPER_MONACO_GP_COMMANDS },
]);

/** An original's conversion command's name: `<original>-course`. */
export const conversionName = (original: RegisteredOriginal) => `${original.source.original}-course`;
