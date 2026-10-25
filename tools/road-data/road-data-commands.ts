/**
 * What the road data tool's commands share ([Development](../../docs/development.md#road-data-commands)): their
 * options, where each original's ROM zips and dumps lie, the ROM zips and sets they read, and a course saved or
 * checked.
 */
import path from 'node:path';
import { readdir, readFile } from 'node:fs/promises';
import { atomicWrite, requireInput } from '../course/authoring-io.js';
import { formatSavedJson } from '../../src/content/saved-json.js';
import { readZip } from './zip.js';
import { RomSet } from './rom-set.js';
import { normalizeCoursePositions } from '../authoring/course-joints.js';
import type { Json } from '../authoring/json-pointer.js';
import { readCourseDocument } from '../../src/course/course-document.js';
import { planFidelity, VECTOR_RESOLUTION } from './heading-plan.js';
import type { Parting, Passage } from './crossings.js';

/** A command's options, `--name value` or a flag. */
export type RoadDataOptions = ReadonlyMap<string, string>;
/** Commands by name: each prints one JSON result or throws. */
export type RoadDataCommands = Readonly<Record<string, (options: RoadDataOptions) => Promise<void>>>;

/** Where K's ROM zips of an original lie, and the tool's dumps of them: never committed. */
export const romDirectory = (original: string) => `reference-media/${original}/rom`;
export const dumpDirectory = (original: string) => `reference-media/${original}/rom-data`;

/** Where the originals' assets lie, each in its published path: a local build may use them in place of the published. */
export const ORIGINALS_DIRECTORY = 'reference-media/originals';

/** A value rounded to tenths, and to thousandths. */
/** A value rounded to tenths, and to thousandths. */
export const round1 = (value: number) => Math.round(value * 10) / 10;
export const round3 = (value: number) => Math.round(value * 1000) / 1000;

/**
 * A parted crossing's report: its passages, each one's rise and height at its middle (by `height`), and their least
 * height apart, metres.
 */
export const crossingReport = (
  crossing: { readonly passages: readonly Passage[] } & Parting,
  height: (s: number) => number,
) => ({
  passages: crossing.passages.map((p) => [round1(p.from), round1(p.to)]),
  rises: crossing.rises.map(round1),
  apart: round3(crossing.apart),
  heights: crossing.passages.map((p) => round1(height((p.from + p.to) / 2))),
});
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
 * A course document normalized and read, written to content, or with `check` compared with the one there.
 */
export async function saveCourse(id: string, document: unknown, check: boolean) {
  const file = `content/courses/${id}.course.json`;
  const normalized = normalizeCoursePositions(document as Json).document;
  const read = readCourseDocument(normalized, file);
  if (!read.ok) throw Object.assign(new Error(`${file} does not read`), { diagnostics: read.diagnostics });
  const text = formatSavedJson(normalized);
  if (check) {
    const committed = await readFile(file, 'utf8').catch(() => null);
    requireInput(committed === text, `/${file}`, `${file} is not the conversion of the ROMs`);
  } else await atomicWrite(file, text);
  return file;
}

/** Flags take no value; every other option is `--name value`. */
const FLAGS = new Set(['--check']);
export function parse(args: readonly string[]) {
  const options = new Map<string, string>();
  for (let i = 0; i < args.length; i += 2) {
    if (FLAGS.has(args[i]!)) {
      options.set(args[i--]!, 'yes');
      continue;
    }
    requireInput(args[i]?.startsWith('--') && args[i + 1] !== undefined, '/arguments', 'Options are --name value');
    options.set(args[i]!, args[i + 1]!);
  }
  return options;
}
