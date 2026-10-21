/**
 * ENDURO RACER's road data dump ([Original road data](../../docs/original-road-data.md#enduro-racers-dump)): every
 * table its course uses, read from the ROM sets as the programs hold them, raw. It stays on the machine that read the
 * ROMs.
 */
import type { ZipFile } from './zip.js';
import { instruction } from './program-words.js';
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

/** Every table the course uses, from the ROM sets' files by CRC-32. */
export function enduroRacerDump(files: ReadonlyMap<number, ZipFile>) {
  const programs = assembleEnduroRacerPrograms(files);
  const words = assembleEnduroRacerSprites(files);
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
