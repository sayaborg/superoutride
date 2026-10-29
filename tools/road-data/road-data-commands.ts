/**
 * What the road data tool's commands share ([Development](../../docs/development.md#road-data-commands)): their
 * options, where each original's ROM zips and dumps lie, the ROM zips and sets they read, and a course saved or
 * checked.
 */
import path from 'node:path';
import { readdir, readFile } from 'node:fs/promises';
import { requireInput } from '../authoring/authoring-error.js';
import { readZip } from './zip.js';
import { ORIGINALS_PLACE } from '../authoring/content-places.js';
import { RomSet } from './rom-set.js';
import { planFidelity, VECTOR_RESOLUTION } from './heading-plan.js';
import type { Parting, Passage } from './crossings.js';
import type { Profile } from './road-profile.js';

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
  run(options: RoadDataOptions): AsyncIterable<unknown>;
}
/** Commands by name. */
export type RoadDataCommands = Readonly<Record<string, RoadDataCommand>>;

/** A command taking `options`. */
export const command = (options: OptionKinds, run: RoadDataCommand['run']): RoadDataCommand =>
  Object.freeze({ options: Object.freeze({ ...options }), run });

/** Where K's ROM zips of an original lie, and the tool's dumps of them: never committed. */
export const romDirectory = (original: string) => `reference-media/${original}/rom`;
export const dumpDirectory = (original: string) => `reference-media/${original}/rom-data`;

/** Where a conversion's file lies in the repository: `path` under the originals' place (`courses/…`, `images/…`). */
export const originalFile = (path: string) => `content/${ORIGINALS_PLACE}/${path}`;

/** Where the originals' assets lie, each in its published path: a local build may use them in place of the published. */
export const ORIGINALS_DIRECTORY = 'reference-media/originals';

/** A value rounded to tenths, and to thousandths. */
/** A value rounded to tenths, and to thousandths. */
export const round1 = (value: number) => Math.round(value * 10) / 10;
export const round3 = (value: number) => Math.round(value * 1000) / 1000;

/**
 * A parted crossing's report: its passages, each one's rise and height at its middle (by `height`), and their least
 * height apart after and before (`raw`), metres.
 */
export const crossingReport = (
  crossing: { readonly passages: readonly Passage[] } & Parting,
  height: (s: number) => number,
) => ({
  passages: crossing.passages.map((p) => [round1(p.from), round1(p.to)]),
  rises: crossing.rises.map(round1),
  apart: round3(crossing.apart),
  raw: round3(crossing.raw),
  heights: crossing.passages.map((p) => round1(height((p.from + p.to) / 2))),
});
/**
 * A road's grades as the commands report them, sampled every metre to `end`: its heights' range and its end's, its
 * steepest grade by its screen's `pieces` alone and with all else (`profile`: crossings, jumps, dips), the pieces'
 * `overlaps`, and its flights at `kmh`, the stretches where the load on a crest falls below 0 (the car leaves the road):
 * their count and the longest, metres.
 */
export function gradeReport(
  profile: Profile,
  pieces: Profile,
  end: number,
  kmh: number,
  overlaps?: { readonly count: number; readonly metres: number },
) {
  const stations = Array.from({ length: Math.floor(end) + 1 }, (_, s) => s);
  const steepest = (p: Profile) => round3(Math.max(...stations.map((s) => Math.abs(p.grade(s)))));
  const v = kmh / 3.6;
  const flights: number[] = [];
  let last = -Infinity;
  for (const b of profile.bends)
    if (1 + (v * v * b.curvature) / 9.80665 < 0) {
      if (b.from - last <= 1e-6) flights[flights.length - 1]! += b.to - b.from;
      else flights.push(b.to - b.from);
      last = b.to;
    }
  return {
    heights: [round1(Math.min(...stations.map(profile.height))), round1(Math.max(...stations.map(profile.height)))],
    endHeight: round1(profile.height(end)),
    steepest: { pieces: steepest(pieces), course: steepest(profile) },
    ...(overlaps ? { overlaps: { count: overlaps.count, metres: round1(overlaps.metres) } } : {}),
    flights: { kmh, count: flights.length, longest: round1(Math.max(0, ...flights)) },
  };
}
/**
 * A plan's fidelity to its table (`planFidelity`), as the commands report it: its heading's most departure, in the
 * table's resolution, and the count of positions beyond it; its position's most drift, metres; and each widened turn's
 * table positions with its heading's and position's most there.
 */
export const fidelityReport = (fidelity: ReturnType<typeof planFidelity>, span?: string) => ({
  heading: round3(fidelity.heading / VECTOR_RESOLUTION),
  beyond: fidelity.beyond.length,
  positionDrift: round3(fidelity.drift),
  widened: fidelity.turns.map((t) => ({
    ...(span === undefined ? {} : { span }),
    at: [round1(t.from), round1(t.to)],
    heading: round3(t.heading / VECTOR_RESOLUTION),
    drift: round3(t.drift),
  })),
});

/** MAME's set `name` from its zips, each ROM found by its CRC-32 and size. */
export async function romSet(name: string, zips: readonly string[]) {
  return new RomSet(name, await Promise.all(zips.map(async (zip) => readZip(new Uint8Array(await readFile(zip))))));
}

/** The zip `zip`, else the one zip in `directory`. */
export async function oneZip(zip: string | undefined, directory: string, option: string) {
  if (zip) return zip;
  const zips = (await readdir(directory).catch(() => [])).filter((name) => name.endsWith('.zip'));
  requireInput(zips.length === 1, '/arguments/' + option, `${option} names the ROM zip, or ${directory} holds one`);
  return path.join(directory, zips[0]!);
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
