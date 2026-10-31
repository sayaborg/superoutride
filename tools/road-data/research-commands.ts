/**
 * The research commands ([Development](../../docs/development.md#research-tools)): aids for researching an original's
 * ROMs before the road data tool reads its tables. They write no content. A program image is written only under
 * `reference-media/<original>/`; what they print (entries, strings, listing lines, callers) is research output under the
 * [rules of the originals](../../docs/original-road-data.md#rules-of-the-originals), never in Git or a PR. None decrypts
 * a program; a MAME driver source is read for its ROM lists and set names alone. `dis68.py` alone stays Python, the
 * disassembler they read the listings of.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { inputError, requireInput } from '../authoring/authoring-error.js';
import { command, type RoadDataCommands, type RoadDataOptions } from './road-data-commands.js';
import { readZip } from './shared/zip.js';
import { interleave } from './sega-16/program-words.js';

/** A file's bytes, its failure naming the option that gave it. */
async function bytesOf(file: string, option: string): Promise<Uint8Array> {
  try {
    return new Uint8Array(await readFile(file));
  } catch (error) {
    throw inputError(`/${option}`, `${file} cannot be read (${(error as NodeJS.ErrnoException).code ?? error})`, error);
  }
}

/** An option's value, required. */
function required(options: RoadDataOptions, name: string): string {
  const value = options.get(name);
  requireInput(value !== undefined, `/${name}`, `${name} is required`);
  return value;
}

/** A hexadecimal option's value. */
function address(options: RoadDataOptions, name: string): number {
  const text = required(options, name);
  requireInput(/^(0x)?[0-9a-f]+$/i.test(text), `/${name}`, `${name} is an address in hexadecimal`);
  return parseInt(text.replace(/^0x/i, ''), 16);
}

const hex = (value: number, digits: number) => value.toString(16).padStart(digits, '0');

/** A listing of `dis68.py`'s lines: address, and the line. */
async function listing(file: string) {
  const text = new TextDecoder().decode(await bytesOf(file, '--listing'));
  return text
    .split('\n')
    .filter((line) => /^[0-9a-f]{6}:/i.test(line))
    .map((line) => ({ address: parseInt(line.slice(0, 6), 16), line }));
}

/** A branch of a listing line: bsr, jsr, bra or jmp to an absolute target. */
const BRANCH = /^([0-9a-f]{6}):\s+\S+\s+(bsr\.[bws]|jsr|bra\.[bws]|jmp)\s+\$([0-9a-f]+)(?:\.[lw])?\s*$/i;

/** The research commands, by name. */
export const RESEARCH_COMMANDS: RoadDataCommands = Object.freeze({
  /** A zip's size and SHA-256, then each entry: name, size and CRC-32, each checked against its data on reading. */
  'research-zip': command({ '--zip': 'value' }, async function* (options) {
    const file = required(options, '--zip');
    const bytes = await bytesOf(file, '--zip');
    const files = await readZip(bytes, file);
    yield {
      zip: path.basename(file),
      bytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      entries: [...files.values()]
        .sort((a, b) => (a.name < b.name ? -1 : 1))
        .map((f) => ({ name: f.name, size: f.data.length, crc: hex(f.crc, 8) })),
    };
  }),

  /**
   * A zip against set `--set`'s ROM list in a MAME driver source (`--driver`, its ROM_START block and GAME line alone),
   * a clone's parent's zip beside it: the ROMs missing (no entry has the CRC), extra (an entry of the set's own zip no
   * listed ROM has), renamed (the CRC under another name) and NO_DUMP. It matches when the first three are none.
   */
  'research-set': command(
    { '--driver': 'value', '--set': 'value', '--zip': 'value', '--parent-zip': 'value' },
    async function* (options) {
      const name = required(options, '--set');
      const source = new TextDecoder('latin1').decode(await bytesOf(required(options, '--driver'), '--driver'));
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const block = new RegExp(`ROM_START\\(\\s*${escaped}\\s*\\)([\\s\\S]*?)ROM_END`).exec(source)?.[1];
      requireInput(block !== undefined, '/--driver', `The driver has no ROM_START block for ${name}`);
      const roms = [...block.matchAll(/ROM_[A-Z0-9_]*\(\s*"([^"]+)"\s*,[^)]*?CRC\(([0-9a-fA-F]{8})\)/g)].map((m) => ({
        name: m[1]!,
        crc: m[2]!.toLowerCase(),
      }));
      const noDump = [...block.matchAll(/ROM_[A-Z0-9_]*\(\s*"([^"\n]+)"[^\n]*NO_DUMP/g)].map((m) => m[1]!);
      const game = new RegExp(
        `GAMEL?\\s*\\(\\s*\\d+\\s*,\\s*${escaped}\\s*,\\s*(\\w+)\\s*,[^\\n]*?"([^"]*)"\\s*,\\s*"([^"]*)"`,
      ).exec(source);
      const read = async (option: string) => {
        const file = options.get(option);
        if (file === undefined) return [];
        return [...(await readZip(await bytesOf(file, option), file)).values()];
      };
      const own = await read('--zip');
      const all = [...own, ...(await read('--parent-zip'))];
      const crcs = new Set(all.map((f) => hex(f.crc, 8)));
      const listed = new Set(roms.map((r) => r.crc));
      const names = new Set(all.map((f) => f.name));
      const missing = roms.filter((r) => !crcs.has(r.crc));
      const extra = own.filter((f) => !listed.has(hex(f.crc, 8))).map((f) => ({ name: f.name, crc: hex(f.crc, 8) }));
      const renamed = roms.filter((r) => !names.has(r.name) && crcs.has(r.crc));
      yield {
        ok: !missing.length && !extra.length && !renamed.length,
        set: name,
        ...(game ? { title: game[3], maker: game[2], parent: game[1] === '0' ? null : game[1] } : {}),
        listed: roms.length,
        entries: all.length,
        missing,
        extra,
        renamed,
        noDump,
      };
    },
  ),

  /**
   * A 68000 program image from a zip's even-byte and odd-byte ROMs (`--pairs even:odd,…`, the halves in that order), as
   * stored: an encrypted program stays encrypted. It is written to `--out`, which lies under `reference-media/<original>/`.
   */
  'research-image': command({ '--zip': 'value', '--pairs': 'value', '--out': 'value' }, async function* (options) {
    const file = required(options, '--zip');
    const out = path.resolve(required(options, '--out'));
    // Within reference-media/<original>/: a relative path from reference-media down two steps or more (another drive's
    // is absolute).
    const within = path.relative(path.resolve('reference-media'), out);
    requireInput(
      !path.isAbsolute(within) && !within.startsWith('..') && within.split(path.sep).length >= 2,
      '/--out',
      `${out} lies outside reference-media/<original>/: an original's program is written there alone`,
    );
    const files = new Map(
      [...(await readZip(await bytesOf(file, '--zip'), file)).values()].map((f) => [f.name, f.data]),
    );
    const halves = required(options, '--pairs')
      .split(',')
      .map((pair) => {
        const [even, odd] = pair.split(':');
        const [e, o] = [files.get(even ?? ''), files.get(odd ?? '')];
        requireInput(e && o, '/--pairs', `${pair} names no even and odd ROM of the zip`);
        requireInput(e.length === o.length, '/--pairs', `${even} and ${odd} differ in size`);
        return interleave(e, o);
      });
    const image = new Uint8Array(halves.reduce((n, h) => n + h.length, 0));
    halves.reduce((at, h) => (image.set(h, at), at + h.length), 0);
    await mkdir(path.dirname(out), { recursive: true });
    await writeFile(out, image);
    yield { image: path.relative(process.cwd(), out), bytes: image.length };
  }),

  /** The printable ASCII runs of a program image, at least `--min` long (5), or those matching `--match`. */
  'research-strings': command({ '--image': 'value', '--min': 'value', '--match': 'value' }, async function* (options) {
    const image = await bytesOf(required(options, '--image'), '--image');
    const least = Number(options.get('--min') ?? 5);
    requireInput(Number.isInteger(least) && least > 0, '/--min', '--min is a positive whole number');
    const wanted = options.has('--match') ? new RegExp(options.get('--match')!, 'i') : null;
    let start = -1;
    for (let a = 0; a <= image.length; a++) {
      const printable = a < image.length && image[a]! >= 0x20 && image[a]! <= 0x7e;
      if (printable && start < 0) start = a;
      if (printable || start < 0) continue;
      if (a - start >= least) {
        const text = String.fromCharCode(...image.subarray(start, a));
        if (!wanted || wanted.test(text)) yield { address: hex(start, 6), text };
      }
      start = -1;
    }
  }),

  /** The lines of a `dis68.py` listing whose address lies in `[--from, --to)`. */
  'research-listing': command({ '--listing': 'value', '--from': 'value', '--to': 'value' }, async function* (options) {
    const [low, high] = [address(options, '--from'), address(options, '--to')];
    for (const { address: a, line } of await listing(required(options, '--listing')))
      if (a >= low && a < high) yield { line };
  }),

  /**
   * The routine holding `--address` in a `dis68.py` listing and the direct branches (bsr, jsr, bra, jmp to an absolute
   * target) reaching it, then theirs, to `--depth` levels (3). A routine starts at every target of a bsr or jsr; jump
   * tables and computed branches are not followed.
   */
  'research-callers': command(
    { '--listing': 'value', '--address': 'value', '--depth': 'value' },
    async function* (options) {
      const depth = Number(options.get('--depth') ?? 3);
      requireInput(Number.isInteger(depth) && depth >= 0, '/--depth', '--depth is a whole number');
      const targets = new Map<number, { source: number; op: string }[]>();
      const starts = new Set<number>();
      for (const { line } of await listing(required(options, '--listing'))) {
        const m = BRANCH.exec(line);
        if (!m) continue;
        const [source, op, target] = [parseInt(m[1]!, 16), m[2]!.toLowerCase(), parseInt(m[3]!, 16)];
        targets.set(target, [...(targets.get(target) ?? []), { source, op }]);
        if (op.startsWith('bsr') || op === 'jsr') starts.add(target);
      }
      const sorted = [...starts].sort((a, b) => a - b);
      const routineOf = (a: number) => sorted.filter((s) => s <= a).at(-1);
      const seen = new Set<number>();
      const found: { level: number; at: string; routine: string; callers: string[] }[] = [];
      const walk = (a: number, level: number) => {
        const start = routineOf(a);
        if (start === undefined || seen.has(start) || level > depth) return;
        seen.add(start);
        const calls = (targets.get(start) ?? []).sort((x, y) => x.source - y.source).slice(0, 8);
        found.push({
          level,
          at: hex(a, 6),
          routine: hex(start, 6),
          callers: calls.map((c) => `${hex(c.source, 6)} (${c.op})`),
        });
        for (const c of calls) walk(c.source, level + 1);
      };
      walk(address(options, '--address'), 0);
      yield* found;
    },
  ),
});
