/**
 * ENDURO RACER's road data dump ([ENDURO RACER road data](../../docs/enduro-racer-road-data.md#enduro-racers-dump)): every
 * table its course uses, read from the ROM sets as the programs hold them, raw. It stays on the machine that read the
 * ROMs.
 */
import type { RomSet } from './rom-set.js';
import { instruction, long, sword } from './program-words.js';
import {
  assembleEnduroRacerPrograms,
  assembleEnduroRacerSprites,
  enduroRacerRoms,
  type EnduroRacerPrograms,
} from './enduro-racer-rom.js';
import {
  readGroundColors,
  readRoadColors,
  readRoadPaths,
  readHills,
  readStage3Background,
  readStageEnds,
  readStripes,
  readWaterCrossings,
  STAGES,
} from './enduro-racer-road.js';
import {
  readJumpKind,
  readJumps,
  readScaledX,
  readScenery,
  readSceneryType,
  readStartTemplates,
} from './enduro-racer-scenery.js';
import { readSizeSet, readSpritePalette, undrawnPixels } from './enduro-racer-sprites.js';
import { readBackOffset, readLayer, readSky, readTilePalettes } from './enduro-racer-backgrounds.js';

/** The objects' template pointers, the first rival's object and the rivals. */
const GRID_TEMPLATES = 0x41f8;
const FIRST_RIVAL = 32;
const GRID_RIVALS = 6;

/** The dump's format: raw tables, local to the machine that read the ROMs. */
export const ENDURO_RACER_DUMP_FORMAT = Object.freeze({
  format: 'superoutride.enduro-racer-road-data',
  version: 1,
} as const);

/** The bike's place ahead of the road position, positions: `move.l #$C0, d5` at 0x60EE adds 0xC0 to the 24.8 position. */
export function bikeAhead(programs: EnduroRacerPrograms) {
  const [high, low] = instruction(programs.mainInstructions, 0x60ee, [0x2a3c, null, null], "the bike's place");
  return (high! * 0x10000 + low!) / 256;
}

/**
 * The rivals on the grid at GO. The start copies the 48 objects' templates (0x18A2), each's long pointer at 0x41F8;
 * the rivals are objects 32 to 42, every second (each followed by its companion), a template's long 0x10 their road
 * position as 24.8 and signed word 0x14 their x, road units from P. Those at the bike's place stand abreast with it at
 * GO; the others are held back.
 */
export function readGrid(programs: EnduroRacerPrograms) {
  const go = bikeAhead(programs);
  return Array.from({ length: GRID_RIVALS }, (_, k) => long(programs.main, GRID_TEMPLATES + 4 * (FIRST_RIVAL + 2 * k)))
    .map((template) => ({
      position: long(programs.main, template + 0x10) / 256,
      x: sword(programs.main, template + 0x14),
    }))
    .filter((rival) => rival.position === go);
}

/**
 * The bike's lateral limit, road units either side of P: 0x65FE holds its x (the 16.16 long at $32(a5)) within ±0x200,
 * `cmpi.l #$2000000` and, at 0x6612, its negative.
 */
export function lateralLimit(programs: EnduroRacerPrograms) {
  const [high] = instruction(programs.mainInstructions, 0x65fe, [0x0c80, null, 0], "the bike's lateral limit");
  instruction(programs.mainInstructions, 0x6612, [0x0c80, 0x10000 - high!, 0], "the bike's lateral limit");
  return high!;
}

/** Every table the course uses, from the ROM set. */
export function enduroRacerDump(set: RomSet) {
  const programs = assembleEnduroRacerPrograms(set);
  const words = assembleEnduroRacerSprites(set);
  const { main, sub } = programs;
  const stages = Array.from({ length: STAGES }, (_, s) => s);
  const scenery = readScenery(main);
  const types = [...new Set(scenery.map((item) => item.type))].sort((a, b) => a - b);
  const sceneryTypes = Object.fromEntries(types.map((t) => [t, readSceneryType(main, t)]));
  const jumps = readJumps(main);
  const kinds = [...new Set(jumps.jumps.map((j) => j.kind))].sort((a, b) => a - b);
  const jumpKinds = Object.fromEntries(kinds.map((k) => [k, readJumpKind(main, k)]));
  const start = readStartTemplates(main);
  const shown = [...Object.values(sceneryTypes), ...Object.values(jumpKinds), ...start];
  const sizeSets = [...new Set(shown.map((s) => s.sizes))].sort((a, b) => a - b);
  const palettes = [...new Set(shown.map((s) => s.palette))].sort((a, b) => a - b);
  return {
    ...ENDURO_RACER_DUMP_FORMAT,
    roms: enduroRacerRoms(),
    constants: { bikeAhead: bikeAhead(programs), stage3Background: readStage3Background(main) },
    stageEnds: readStageEnds(main),
    paths: readRoadPaths(sub),
    roadColors: stages.map((s) => readRoadColors(main, s)),
    groundColors: stages.map((s) => readGroundColors(main, s)),
    waterCrossings: readWaterCrossings(main),
    hills: readHills(main),
    stripes: readStripes(sub),
    scenery,
    sceneryTypes,
    scaledX: readScaledX(main),
    jumps,
    jumpKinds,
    start,
    sizeSets: Object.fromEntries(
      sizeSets.map((address) => [
        address,
        { sizes: readSizeSet(main, address), undrawnPixels: undrawnPixels(main, words, address) },
      ]),
    ),
    palettes: Object.fromEntries(palettes.map((p) => [p, readSpritePalette(main, p)])),
    backgrounds: stages.map((s) => ({
      front: readLayer(main, s, 'front'),
      back: readLayer(main, s, 'back'),
      backOffset: readBackOffset(main, s),
      sky: readSky(main, s),
    })),
    tilePalettes: Object.fromEntries(readTilePalettes(main)),
  };
}
