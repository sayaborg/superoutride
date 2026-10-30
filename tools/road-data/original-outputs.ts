/**
 * What a conversion writes ([Raising the originals again](../../docs/original-road-data.md#raising-the-originals-again)):
 * the files it raises from the ROMs, each by its path in the originals' place, saved or compared together.
 */
import { readFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { atomicWrite } from '../course/authoring-io.js';
import type { RomSource } from './shared/rom-set.js';
import { command, readSource, zipOptions, type RoadDataCommand } from './road-data-commands.js';
import { originalFile, OriginalOutputs, type Conversion } from './shared/conversion.js';

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

/**
 * A conversion's command, taking `--check` and the zips of the original whose ROMs it reads (`source`): its outputs
 * written, or with `--check` compared, and its report with what changed; a check that differs fails naming every file.
 */
export const conversionCommand = (conversion: Conversion, source: RomSource): RoadDataCommand =>
  command(
    { ...zipOptions(source), '--check': 'flag' },
    async function* (given) {
      const check = given.has('--check');
      const { zips, set } = await readSource(source, given);
      const { outputs, report } = conversion(set);
      const settled = await settleOutputs(outputs, check);
      const diagnostics = check ? outputsDiagnostics(settled) : [];
      if (diagnostics.length) throw Object.assign(new Error('The conversion differs'), { diagnostics });
      yield { ok: true, zips, ...report, checked: check, outputs: settled };
    },
    [source],
  );
