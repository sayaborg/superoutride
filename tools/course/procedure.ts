import { contentDigest } from '../../src/core/content-digest.js';

/**
 * A procedure's record: its name, its version and the values that decide its results. Any code change that changes a
 * procedure's results raises its version.
 */
export interface ProcedureRecord {
  readonly name: string;
  readonly version: number;
}

/** A procedure's one identity: the SHA-256 of its record's JSON. */
export function procedureSha256(record: ProcedureRecord): Promise<string> {
  return contentDigest(new TextEncoder().encode(JSON.stringify(record)));
}
