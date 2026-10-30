/**
 * How the road data tool fails on what it reads ([Development](../../../docs/development.md#road-data-commands)): the
 * ROMs not as this tool reads them, or a part of the conversion that cannot meet its contract for them. Each is a
 * structured diagnostic; the command that ran names the original and its sets on it. An internal invariant broken is
 * an `Error` instead.
 */
import { AuthoringError } from '../../authoring/authoring-error.js';
import type { RomSource } from './rom-set.js';

/** The ROMs are not as this tool reads them: a table, an instruction or a picture unlike its description. */
export const romDiffers = (message: string) =>
  new AuthoringError([{ kind: 'rom', code: 'rom_differs', path: '', message }]);

/** A part of the conversion cannot meet its contract for these ROMs. */
export const contractUnmet = (message: string) =>
  new AuthoringError([{ kind: 'conversion', code: 'contract_unmet', path: '', message }]);

/** `error` with the original and the sets of `sources` named on its ROM's and conversion's diagnostics. */
export function namingSources(error: unknown, sources: readonly RomSource[]): unknown {
  if (!(error instanceof AuthoringError) || sources.length === 0) return error;
  const named = error.diagnostics.map((d) =>
    d.kind === 'rom' || d.kind === 'conversion'
      ? { ...d, sources: sources.map(({ original, sets }) => ({ original, sets })) }
      : d,
  );
  return new AuthoringError(named, { cause: error.cause });
}
