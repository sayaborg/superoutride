/**
 * OUTRUN's PCM voices and effects as its sound program plays them
 * ([OUTRUN road data](../../../docs/outrun-road-data.md#voices-and-effects)): the sample a sound command plays, read
 * from the sound program's tables, and its PCM, for [local originals](../../../docs/development.md#local-originals) of this
 * game's recordings.
 */
import { requireInput } from '../../authoring/authoring-error.js';
import { SOUND_ROM_SIZE } from './outrun-rom.js';

/** The sound program's tables: the commands' handlers from 0x81, and the PCM samples' from note 0xD0. */
const COMMANDS = 0xbc7;
const FIRST_COMMAND = 0x81;
const SAMPLES = 0xddd;
const FIRST_SAMPLE_NOTE = 0xd0;
const LAST_SAMPLE_NOTE = 0xe1;
/** The PCM chip's output rate, Hz: its clock (4 MHz) over 128. A sample advances `step / 256` samples an output. */
export const PCM_OUTPUT_RATE = 31250;

/**
 * The sound commands whose samples stand for this game's recordings, by the main program's places that send them:
 * 0x9D after a checkpoint's time bonus (0x8FFC), 0x9E at the goal (0x5B30), 0x9F at the race's start (0xB418), 0x92
 * where a hit takes speed (0x13EC), 0x8F and 0x90 when the car crashes, fast or slow (0x1B12, 0x19EE).
 */
export const OUTRUN_SOUNDS: ReadonlyMap<string, number> = new Map([
  ['effects/checkpoint', 0x9d],
  ['effects/goal', 0x9e],
  ['effects/countdown-go', 0x9f],
  ['impacts/vehicle', 0x92],
  ['impacts/movable', 0x92],
  ['impacts/object', 0x8f],
  ['impacts/wall', 0x90],
]);

/** A PCM sample: its bank, its first address and its last page (its end's high byte), and the step it plays at. */
export interface PcmSample {
  readonly bank: number;
  readonly start: number;
  readonly end: number;
  readonly step: number;
}

/**
 * The sample sound command `command` plays first: its handler (the word at 0xBC7 + 2 × (command − 0x81)) starts a
 * sequence, `ld a, track; ld hl, sequence`. The sequence's byte 8 counts its channels, whose headers' words follow; a
 * header's word at 7 is its data. The first channel's data sets its step (opcode 0x93), its volumes (0x82) and plays a
 * note from 0xD0: the sample at 0xDDD + 4 × (note − 0xD0), {start low, start high, end high, control}, its bank control
 * bits 4–6.
 */
export function commandSample(program: Uint8Array, command: number): PcmSample {
  const word = (a: number) => program[a]! | (program[a + 1]! << 8);
  const handler = word(COMMANDS + 2 * (command - FIRST_COMMAND));
  const at = [...program.subarray(handler, handler + 8)].findIndex(
    (b, i) => b === 0x3e && program[handler + i + 2] === 0x21,
  );
  requireInput(at >= 0, '/rom/epr-10187.88', `Sound command 0x${command.toString(16)} starts no sequence`);
  const sequence = word(handler + at + 3);
  const data = word(word(sequence + 9) + 7);
  const note = program[data + 5]!;
  requireInput(
    program[sequence + 8]! > 0 &&
      program[data] === 0x93 &&
      program[data + 2] === 0x82 &&
      note >= FIRST_SAMPLE_NOTE &&
      note <= LAST_SAMPLE_NOTE,
    '/rom/epr-10187.88',
    `Sound command 0x${command.toString(16)}'s first channel plays no PCM sample first`,
  );
  const entry = SAMPLES + 4 * (note - FIRST_SAMPLE_NOTE);
  return {
    bank: (program[entry + 3]! >> 4) & 7,
    start: word(entry),
    end: program[entry + 2]!,
    step: program[data + 1]!,
  };
}

/**
 * A sample as the chip plays it, 16-bit signed at `PCM_OUTPUT_RATE`: each output takes the byte the sample's position
 * (advancing `step / 256` an output) has reached, from its start through its last page's end, unsigned about 0x80; its
 * bank's ROM repeats through the bank.
 */
export function samplePcm(banks: readonly Uint8Array[], sample: PcmSample): Int16Array {
  const rom = banks[sample.bank];
  requireInput(rom, '/rom', `PCM bank ${sample.bank} has no ROM`);
  const length = ((sample.end + 1) << 8) - sample.start;
  requireInput(length > 0 && sample.step > 0, '/rom', 'A PCM sample ends before it starts, or has no step');
  return Int16Array.from(
    { length: Math.ceil((length * 256) / sample.step) },
    (_, i) => (rom[(sample.start + Math.floor((i * sample.step) / 256)) & (SOUND_ROM_SIZE - 1)]! - 0x80) << 8,
  );
}
