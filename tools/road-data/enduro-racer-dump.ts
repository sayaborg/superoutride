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
 * The lift lever (ADC channel 2, `$40494`) at rest, as the program reads it when the rider does nothing: 0x20, where its
 * pose code lifts nothing (0x742A, `clamp(lever − 0x20)`); MAME's default. The ROMs do not hold it.
 */
const LEVER_AT_REST = 0x20;

/**
 * The program's flight off a jump at its top speed, the lift lever at rest (K, 2026-10-25), in ticks from its take-off
 * to its landing. The take-off (0x727A) sets the bike's height to 0x2A (0x72D8) and its upward speed to the byte at
 * 0x72EC (lea at 0x72B4), indexed 4 × (clamp(lever / 16 − 2, 0, 8) − 3) + 0x15 (0x72AA, 0x72B0), times the speed, × 16,
 * plus 0x20000 (0x72D0, 16.16 units a tick); each tick the upward speed loses 0x2664 (0x721C) and the height gains it,
 * and the bike lands when the height falls below the road (0x7232), past the jump's own ground by then. The top speed
 * is the speed's cap, 0x3F80 (0x6C36), read as km/h (0x6C86: / 16 × 16 × 0x326 >> 16).
 */
export function jumpFlight(programs: EnduroRacerPrograms) {
  const code = programs.mainInstructions;
  const [top] = instruction(code, 0x72d8, [0x3b7c, null, 0x0024], "the jump's take-off height");
  const [gravityHigh, gravityLow] = instruction(code, 0x721c, [0x203c, null, null], 'the fall a tick');
  const [table] = instruction(code, 0x72b4, [0x41f9, 0, null], 'the take-off table');
  const [shift] = instruction(code, 0x72aa, [0x0440, null], "the take-off table's index");
  const [base] = instruction(code, 0x72b0, [0x0640, null], "the take-off table's index");
  const [launchHigh, launchLow] = instruction(code, 0x72d0, [0x06ad, null, null, 0x0020], 'the take-off lift');
  const [cap] = instruction(code, 0x6c36, [0x0c6d, null, 0x0036], 'the speed cap');
  const [factor] = instruction(code, 0x6c94, [0xc0fc, null], "the speed's km/h");
  const gravity = gravityHigh! * 0x10000 + gravityLow!;
  const speed = (((cap! >> 4) << 4) * factor!) >>> 16;
  const lever = Math.min(8, Math.max(0, (LEVER_AT_REST >> 4) - 2));
  const value = programs.main[table! + 4 * (lever - shift!) + base!]!;
  let [velocity, height, ticks] = [
    ((value * speed) & 0xffff) * 16 + launchHigh! * 0x10000 + launchLow!,
    top! * 65536,
    0,
  ];
  let peak = height;
  do {
    ticks++;
    velocity -= gravity;
    height += velocity;
    peak = Math.max(peak, height);
  } while (Math.floor(height / 65536) >= 0);
  return { speed, ticks, gravity: gravity / 65536, peak: Math.floor(peak / 65536) };
}

/**
 * The program's ground over a jump (0x71D8), its half, positions: the bike's distance past the jump's position in 1/256
 * positions (0x703A) plus 0x1C2 (`move.l #$1C2, d1` at 0x71E2) is where the ground rises from, as far before the
 * position as it falls to after it. The jump's picture stands for it.
 */
export function jumpGround(programs: EnduroRacerPrograms) {
  const [high, low] = instruction(programs.mainInstructions, 0x71e2, [0x223c, null, null], "the jump's half");
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
