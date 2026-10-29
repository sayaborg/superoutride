/**
 * What a conversion writes ([Raising the originals again](../../docs/original-road-data.md#raising-the-originals-again)):
 * the files it raises from the ROMs, each by its path in the originals' place, saved or compared together.
 */
import { readFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { atomicWrite } from '../course/authoring-io.js';
import { formatSavedJson } from '../../src/content/saved-json.js';
import { normalizeCoursePositions } from '../authoring/course-joints.js';
import type { Json } from '../authoring/json-pointer.js';
import { readCourseDocument } from '../../src/course/course-document.js';
import { originalFile, type RoadDataOptions } from './road-data-commands.js';

/**
 * The drafts ([Original road data](../../docs/original-road-data.md#rules-of-the-originals), Ownership): the fields the
 * conversion writes first and people own after. None holds a position.
 */
const DRAFTS = ['maxLaps', 'bearing'] as const;

/** A conversion's files by their paths in the originals' place (`courses/<id>.course.json`, `images/<name>.json`). */
export class OriginalOutputs {
  readonly #files = new Map<string, Uint8Array>();

  /** The paths of the files, in the order they were added. */
  get paths(): readonly string[] {
    return [...this.#files.keys()];
  }

  /** The bytes of the file at `place`, which must be one of the outputs. */
  bytes(place: string): Uint8Array {
    const bytes = this.#files.get(place);
    if (!bytes) throw new Error(`${place} is not an output`);
    return bytes;
  }

  /** A file the conversion writes; a path written twice is an internal fault. */
  file(place: string, bytes: Uint8Array | string) {
    if (this.#files.has(place)) throw new Error(`${place} is written twice`);
    this.#files.set(place, typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes);
  }

  /**
   * A course document, normalized and read: where the course is committed, its drafts are kept as people left them,
   * so the conversion writes and compares its canon and extract alone. Its path in the originals' place.
   */
  async course(id: string, document: unknown): Promise<string> {
    const place = `courses/${id}.course.json`,
      file = originalFile(place);
    const committed = await readFile(file, 'utf8').catch(() => null);
    const kept = committed === null ? {} : (JSON.parse(committed) as Record<string, unknown>);
    const drafted = { ...(document as Record<string, unknown>) };
    for (const field of DRAFTS) if (field in kept) drafted[field] = kept[field];
    const normalized = normalizeCoursePositions(drafted as Json).document;
    const read = readCourseDocument(normalized, file);
    if (!read.ok) throw Object.assign(new Error(`${file} does not read`), { diagnostics: read.diagnostics });
    this.file(place, formatSavedJson(normalized));
    return place;
  }
}

/** The outputs that differ from the committed files, and those not committed; each a path in the originals' place. */
export interface OutputsSettled {
  readonly files: number;
  readonly changed: readonly string[];
  readonly missing: readonly string[];
}

const same = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((byte, k) => byte === b[k]);

/**
 * Write the outputs whose bytes differ from the committed files, or with `check` compare every one and write nothing.
 * Every difference and missing file is named, not only the first.
 */
export async function settleOutputs(outputs: OriginalOutputs, check: boolean): Promise<OutputsSettled> {
  const changed: string[] = [],
    missing: string[] = [];
  for (const place of outputs.paths) {
    const file = originalFile(place),
      bytes = outputs.bytes(place);
    const committed = await readFile(file).catch(() => null);
    if (committed && same(committed, bytes)) continue;
    (committed ? changed : missing).push(place);
    if (!check) await atomicWrite(file, bytes);
  }
  return Object.freeze({ files: outputs.paths.length, changed, missing });
}

/** A check that found differences, as diagnostics naming each file. */
export function outputsDiagnostics(settled: OutputsSettled, extra: readonly string[] = []) {
  const diagnostic = (place: string, message: string) => ({
    kind: 'tool',
    code: 'invalid_input',
    path: `/${originalFile(place)}`,
    message: `${originalFile(place)} ${message}`,
  });
  return [
    ...settled.changed.map((place) => diagnostic(place, "is not the ROMs'")),
    ...settled.missing.map((place) => diagnostic(place, 'is missing')),
    ...extra.map((place) => diagnostic(place, 'is written by no conversion')),
  ];
}

/** Every file in the originals' place, by its path there. */
export async function placedOriginals(): Promise<string[]> {
  const root = originalFile('');
  return (await readdir(root, { recursive: true, withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(root, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'))
    .sort();
}

/** Remove a file of the originals' place that no conversion writes. */
export const removeOriginal = (place: string) => rm(originalFile(place));

/** An original's conversion: the files it raises from its ROM zips (named by `options`), and its report. */
export type Conversion = (
  options: RoadDataOptions,
) => Promise<{ readonly outputs: OriginalOutputs; readonly report: Readonly<Record<string, unknown>> }>;

/**
 * A conversion's command: its outputs written, or with `--check` compared, and its report printed with what changed;
 * a check that differs fails naming every file.
 */
export const conversionCommand =
  (conversion: Conversion) =>
  async (options: RoadDataOptions): Promise<void> => {
    const check = options.has('--check');
    const { outputs, report } = await conversion(options);
    const settled = await settleOutputs(outputs, check);
    const diagnostics = check ? outputsDiagnostics(settled) : [];
    if (diagnostics.length) throw Object.assign(new Error('The conversion differs'), { diagnostics });
    console.log(JSON.stringify({ ok: true, ...report, checked: check, outputs: settled }));
  };
