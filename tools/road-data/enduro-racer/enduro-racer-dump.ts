/**
 * ENDURO RACER's road data dump ([ENDURO RACER road data](../../../docs/enduro-racer-road-data.md#enduro-racers-dump)): every
 * table its course uses, read from the ROM sets as the programs hold them, raw. It stays on the machine that read the
 * ROMs.
 */
import type { RomSet } from '../shared/rom-set.js';
import { assembleEnduroRacerPrograms, assembleEnduroRacerSprites, enduroRacerRoms } from './enduro-racer-rom.js';
import {
  readGroundColors,
  readRoadColors,
  readRoadPaths,
  readHills,
  readStage3Background,
  readStageEnds,
  readStripes,
  readFords,
  STAGES,
  bikeAhead,
  itemRules,
  readJumpKind,
  readJumps,
  readScaledX,
  readScenery,
  readSceneryType,
  readStartTemplates,
} from './enduro-racer-road.js';
import { readSizeSet, readSpritePalette, undrawnPixels } from './enduro-racer-sprites.js';
import { readBackOffset, readLayer, readSky, readTilePalettes } from './enduro-racer-backgrounds.js';

/** The dump's format: raw tables, local to the machine that read the ROMs. */
export const ENDURO_RACER_DUMP_FORMAT = Object.freeze({
  format: 'superoutride.enduro-racer-road-data',
  version: 2,
} as const);

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
    constants: { bikeAhead: bikeAhead(programs), stage3Background: readStage3Background(programs) },
    stageEnds: readStageEnds(main),
    paths: readRoadPaths(sub),
    roadColors: stages.map((s) => readRoadColors(main, s)),
    groundColors: stages.map((s) => readGroundColors(main, s)),
    fords: readFords(main),
    hills: readHills(main),
    stripes: readStripes(sub),
    scenery,
    sceneryTypes,
    scaledX: readScaledX(main, itemRules(programs.mainInstructions).scaled),
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
