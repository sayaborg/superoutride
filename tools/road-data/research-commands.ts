/**
 * The research commands ([Development](../../docs/development.md#research-tools)): aids for researching an original's
 * ROMs before the road data tool reads its tables. They write no content. A program image is written only under
 * `reference-media/<original>/`; what they print (entries, strings, listing lines, callers) is research output under the
 * [rules of the originals](../../docs/original-road-data.md#rules-of-the-originals), never in Git or a PR. None decrypts
 * a program; a MAME driver source is read for its ROM lists and set names alone. `dis68.py` alone stays Python, the
 * 68000's disassembler; the Z80's and the Z8002's are `research-disassemble`'s, in the same one-line form.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { inputError, requireInput } from '../authoring/authoring-error.js';
import { command, type RoadDataCommands, type RoadDataOptions } from './road-data-commands.js';
import { readZip } from './shared/zip.js';
import { decodeZ80, type Instruction } from './cpu/z80-instructions.js';
import { decodeZ8000 } from './cpu/z8000-instructions.js';
import { interleave } from './cpu/program-words.js';

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

/** A listing's lines, `dis68.py`'s or `research-disassemble`'s: address, and the line. */
async function listing(file: string) {
  const text = new TextDecoder().decode(await bytesOf(file, '--listing'));
  return text
    .split('\n')
    .filter((line) => /^[0-9a-f]{6}:/i.test(line))
    .map((line) => ({ address: parseInt(line.slice(0, 6), 16), line }));
}

/** Each CPU's direct branches to an absolute target: those that call a routine, and the unconditional jumps. */
const BRANCHES = {
  '68000': { call: /^(bsr\.[bws]|jsr)$/, jump: /^(bra\.[bws]|jmp)$/ },
  z80: { call: /^(call|rst)$/, jump: /^(jp|jr)$/ },
  z8002: { call: /^(call|calr)$/, jump: /^(jp|jr)$/ },
} as const;
type Cpu = keyof typeof BRANCHES;

/** The `--cpu` option's CPU. */
function cpu(options: RoadDataOptions, names: readonly Cpu[]): Cpu {
  const name = required(options, '--cpu');
  requireInput((names as readonly string[]).includes(name), '/--cpu', `--cpu is one of ${names.join(', ')}`);
  return name as Cpu;
}

/**
 * A listing line's branch on `cpu`: its source, mnemonic and absolute target, a call or an unconditional jump (one
 * operand: a condition makes a jump conditional); null for any other line.
 */
function branchOf(cpu: Cpu, line: string) {
  const m = /^([0-9a-f]{6}):\s+\S+\s+(\S+)\s*(.*)$/i.exec(line);
  if (!m) return null;
  const [mnemonic, operands] = [m[2]!.toLowerCase(), m[3]!.trim().split(',')];
  const target = /^\$([0-9a-f]+)(?:\.[lw])?$/i.exec(operands.at(-1) ?? '');
  if (!target) return null;
  const call = BRANCHES[cpu].call.test(mnemonic);
  if (!call && !(BRANCHES[cpu].jump.test(mnemonic) && operands.length === 1)) return null;
  return { source: parseInt(m[1]!, 16), op: mnemonic, target: parseInt(target[1]!, 16), call };
}

/** An instruction's listing line, as `dis68.py` writes one: `aaaaaa: bytes mnemonic operands`. */
function listingLine(program: Uint8Array, address: number, i: Instruction) {
  const bytes = [...program.subarray(address, address + i.length)].map((b) => hex(b, 2)).join('');
  return `${hex(address, 6)}: ${bytes.padEnd(20)} ${i.mnemonic}${i.operands ? ` ${i.operands}` : ''}`;
}

/** A path under `reference-media/<original>/`, where a program or its listing alone is written. */
function researchOutput(options: RoadDataOptions) {
  const out = path.resolve(required(options, '--out'));
  // Within reference-media/<original>/: a relative path from reference-media down two steps or more (another drive's
  // is absolute).
  const within = path.relative(path.resolve('reference-media'), out);
  requireInput(
    !path.isAbsolute(within) && !within.startsWith('..') && within.split(path.sep).length >= 2,
    '/--out',
    `${out} lies outside reference-media/<original>/: an original's program is written there alone`,
  );
  return out;
}

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
   * A zip against set `--set`'s ROM list in MAME's driver sources (`--driver`, files joined by commas; their ROM_START
   * blocks and GAME lines alone), the ROMs of the devices it names (`--devices`, their ROM_START blocks: a custom
   * chip's own ROM) with it, and a clone's parent's zip beside it: the ROMs missing (no entry has the CRC), extra (an
   * entry of the set's own zip no listed ROM has), renamed (the CRC under another name) and NO_DUMP. A ROM is any line
   * of a block naming a file and its CRC, whatever its macro. It matches when the first three are none.
   */
  'research-set': command(
    { '--driver': 'value', '--set': 'value', '--devices': 'value', '--zip': 'value', '--parent-zip': 'value' },
    async function* (options) {
      const name = required(options, '--set');
      const sources = await Promise.all(
        required(options, '--driver')
          .split(',')
          .map(async (file) => new TextDecoder('latin1').decode(await bytesOf(file, '--driver'))),
      );
      const source = sources.join('\n');
      const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const blockOf = (set: string) => {
        const block = new RegExp(`ROM_START\\(\\s*${escape(set)}\\s*\\)([\\s\\S]*?)ROM_END`).exec(source)?.[1];
        requireInput(block !== undefined, '/--driver', `The driver has no ROM_START block for ${set}`);
        return block;
      };
      const devices = options.get('--devices')?.split(',') ?? [];
      const blocks = [{ of: name, block: blockOf(name) }, ...devices.map((d) => ({ of: d, block: blockOf(d) }))];
      const roms = blocks.flatMap(({ of, block }) =>
        [...block.matchAll(/[A-Z][A-Z0-9_]*\(\s*"([^"]+)"\s*,[^)]*?CRC\(([0-9a-fA-F]{8})\)/g)].map((m) => ({
          name: m[1]!,
          crc: m[2]!.toLowerCase(),
          ...(of === name ? {} : { device: of }),
        })),
      );
      const noDump = blocks.flatMap(({ block }) =>
        [...block.matchAll(/[A-Z][A-Z0-9_]*\(\s*"([^"\n]+)"[^\n]*NO_DUMP/g)].map((m) => m[1]!),
      );
      const escaped = escape(name);
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
   * A program image from a zip's ROMs (`--pairs piece,…`), as stored, its pieces laid one after another: a piece
   * `even:odd` is a 16-bit program's half from the ROMs of its even and odd bytes (a 68000's or a Z8002's), a piece
   * `name` one ROM as it is (an 8-bit program's, a Z80's). An encrypted program stays encrypted. It is written to
   * `--out`, which lies under `reference-media/<original>/`.
   */
  'research-image': command({ '--zip': 'value', '--pairs': 'value', '--out': 'value' }, async function* (options) {
    const file = required(options, '--zip');
    const out = researchOutput(options);
    const files = new Map(
      [...(await readZip(await bytesOf(file, '--zip'), file)).values()].map((f) => [f.name, f.data]),
    );
    const halves = required(options, '--pairs')
      .split(',')
      .map((piece) => {
        const names = piece.split(':');
        const roms = names.map((name) => files.get(name));
        requireInput(
          names.length <= 2 && roms.every((r) => r),
          '/--pairs',
          `${piece} names no ROM or even and odd ROMs of the zip`,
        );
        if (roms.length === 1) return roms[0]!;
        const [e, o] = roms as [Uint8Array, Uint8Array];
        requireInput(e.length === o.length, '/--pairs', `${names[0]} and ${names[1]} differ in size`);
        return interleave(e, o);
      });
    const image = new Uint8Array(halves.reduce((n, h) => n + h.length, 0));
    halves.reduce((at, h) => (image.set(h, at), at + h.length), 0);
    await mkdir(path.dirname(out), { recursive: true });
    await writeFile(out, image);
    yield { image: path.relative(process.cwd(), out), bytes: image.length };
  }),

  /**
   * A Z80 or Z8002 listing (`--cpu z80|z8002`) of a program image's addresses `[--from, --to)`, its byte 0 at address
   * 0, one instruction a line as `dis68.py` writes the 68000's, written to `--out` under
   * `reference-media/<original>/`. A Z8002's addresses are even.
   */
  'research-disassemble': command(
    { '--cpu': 'value', '--image': 'value', '--from': 'value', '--to': 'value', '--out': 'value' },
    async function* (options) {
      const which = cpu(options, ['z80', 'z8002']);
      const program = await bytesOf(required(options, '--image'), '--image');
      const [low, high] = [address(options, '--from'), Math.min(address(options, '--to'), program.length)];
      requireInput(which !== 'z8002' || low % 2 === 0, '/--from', "A Z8002's instructions start at even addresses");
      const out = researchOutput(options);
      const decode = which === 'z80' ? decodeZ80 : decodeZ8000;
      const lines: string[] = [];
      for (let a = low; a < high;) {
        const i = decode(program, a);
        lines.push(listingLine(program, a, i));
        a += i.length;
      }
      await mkdir(path.dirname(out), { recursive: true });
      await writeFile(out, `${lines.join('\n')}\n`);
      yield { listing: path.relative(process.cwd(), out), lines: lines.length };
    },
  ),

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

  /** The lines of a listing whose address lies in `[--from, --to)`. */
  'research-listing': command({ '--listing': 'value', '--from': 'value', '--to': 'value' }, async function* (options) {
    const [low, high] = [address(options, '--from'), address(options, '--to')];
    for (const { address: a, line } of await listing(required(options, '--listing')))
      if (a >= low && a < high) yield { line };
  }),

  /**
   * The routine holding `--address` in a listing of `--cpu`'s program (68000, z80, z8002) and the direct branches
   * reaching it (a call, or an unconditional jump, to an absolute target), then theirs, to `--depth` levels (3). A
   * routine starts at every call's target; jump tables and computed branches are not followed.
   */
  'research-callers': command(
    { '--listing': 'value', '--cpu': 'value', '--address': 'value', '--depth': 'value' },
    async function* (options) {
      const which = cpu(options, ['68000', 'z80', 'z8002']);
      const depth = Number(options.get('--depth') ?? 3);
      requireInput(Number.isInteger(depth) && depth >= 0, '/--depth', '--depth is a whole number');
      const targets = new Map<number, { source: number; op: string }[]>();
      const starts = new Set<number>();
      for (const { line } of await listing(required(options, '--listing'))) {
        const branch = branchOf(which, line);
        if (!branch) continue;
        const { source, op, target } = branch;
        targets.set(target, [...(targets.get(target) ?? []), { source, op }]);
        if (branch.call) starts.add(target);
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
