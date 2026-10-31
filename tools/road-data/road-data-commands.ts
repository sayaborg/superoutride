/**
 * What the road data tool's commands share ([Development](../../docs/development.md#road-data-commands)): their
 * options, where each original's ROM zips and dumps lie, the ROM zips and sets they read, and a course saved or
 * checked.
 */
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { inputError, requireInput } from '../authoring/authoring-error.js';
import { RomSet, type RomSource } from './shared/rom-set.js';
import { readZip } from './shared/zip.js';

/** A command's options as given, by name: a flag's value is `yes`. */
export type RoadDataOptions = ReadonlyMap<string, string>;
/** The options a command takes, by name: a flag, or an option taking a value. */
export type OptionKinds = Readonly<Record<string, 'flag' | 'value'>>;
/**
 * A command: the options it takes and what it does, its results one JSON line each; a result whose `ok` is false fails
 * the command, as does an error, whose diagnostics end it.
 */
export interface RoadDataCommand {
  readonly options: OptionKinds;
  /** The originals whose ROMs it reads, named on its ROM's and conversion's diagnostics. */
  readonly sources: readonly RomSource[];
  run(options: RoadDataOptions): AsyncIterable<unknown>;
}
/** Commands by name. */
export type RoadDataCommands = Readonly<Record<string, RoadDataCommand>>;

/** A command taking `options` and reading the ROMs of `sources`. */
export const command = (
  options: OptionKinds,
  run: RoadDataCommand['run'],
  sources: readonly RomSource[] = [],
): RoadDataCommand =>
  Object.freeze({ options: Object.freeze({ ...options }), run, sources: Object.freeze([...sources]) });

/** Where K's ROM zips of an original lie, and the tool's dumps of them: never committed. */
export const romDirectory = (source: RomSource) => `reference-media/${source.original}/rom`;
export const dumpDirectory = (source: RomSource) => `reference-media/${source.original}/rom-data`;

/** Where the originals' assets lie, each in its published path: a local build may use them in place of the published. */
export const ORIGINALS_DIRECTORY = 'reference-media/originals';

/** The option naming a set's zip. */
const zipOption = (set: string) => `--${set}-zip`;

/** The options naming the sources' zips, `--<set>-zip` each. */
export const zipOptions = (...sources: readonly RomSource[]): OptionKinds =>
  Object.fromEntries(sources.flatMap((source) => source.sets.map((set) => [zipOption(set), 'value' as const])));

/**
 * A source's ROM set read from its zips ([Rules of the originals](../../docs/original-road-data.md#rules-of-the-originals)):
 * each set's `<set>.zip` in the original's ROM directory, or the file its option names. A zip missing or unreadable is
 * refused naming the original, the set and the file, with the error that showed it.
 */
export async function readSource(source: RomSource, options: RoadDataOptions) {
  const zips = source.sets.map((set) => options.get(zipOption(set)) ?? path.join(romDirectory(source), `${set}.zip`));
  const files = [];
  for (const [k, zip] of zips.entries()) {
    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await readFile(zip));
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code ?? String(error);
      throw inputError(
        `/${zip.replace(/^\/+/, '')}`,
        `${source.original}'s zip of MAME ${source.sets[k]} cannot be read at ${zip} (${code})`,
        error,
      );
    }
    files.push(await readZip(bytes, zip));
  }
  return { zips, set: new RomSet(source.sets.join(' and '), files) };
}

/**
 * A command's arguments read by the options it takes: `--name value`, or a flag alone. An option it does not take, one
 * given twice, a value missing and an argument that is no option are refused, naming them.
 */
export function parse(args: readonly string[], kinds: OptionKinds) {
  const options = new Map<string, string>();
  for (let i = 0; i < args.length; i++) {
    const name = args[i]!,
      kind = Object.hasOwn(kinds, name) ? kinds[name] : undefined;
    requireInput(
      kind !== undefined,
      `/arguments/${i}`,
      `${name} is not an option of this command, which takes ${Object.keys(kinds).join(', ') || 'none'}`,
    );
    requireInput(!options.has(name), `/arguments/${i}`, `${name} is given twice`);
    if (kind === 'flag') options.set(name, 'yes');
    else {
      const value = args[++i];
      requireInput(value !== undefined && !value.startsWith('--'), `/arguments/${i}`, `${name} takes a value`);
      options.set(name, value);
    }
  }
  return options;
}
