import { compileRasterPath, type RasterPath, type RasterVertex } from '../core/course.js';

/**
 * Explicit upper-level circuit topology over one ordinary open RasterPath lap.
 *
 * The lap source is still an open Core path. Circuit authoring closes it only by
 * explicitly repeating the first authored vertex as the last authored vertex.
 * No Core sampler, renderer or RouteDag acquires modulo/wrap authority.
 */
export interface CircuitTopology {
  readonly id: string;
  readonly lapPath: RasterPath;
  readonly lapLength: number;
  /** Turn that becomes an ordinary interior Raster turn when two laps are unfolded. */
  readonly seamTurn: number;
}

export interface CircuitChainagePosition {
  /** Topological winding only. This is not validated race-lap authority. */
  readonly winding: number;
  /** Canonical local chainage in [0, lapLength). */
  readonly sLocal: number;
  /** Continuous chainage across the seam. */
  readonly sUnwrapped: number;
}

/**
 * Compile one explicit circuit loop without changing the open Core primitive.
 *
 * The first and last authored Raster vertices must be the same exact world point.
 * Their seam metadata must also agree, so unfolding cannot silently choose one of
 * two conflicting definitions. A two-lap Core compilation proves that the seam
 * itself obeys the ordinary Raster interior-vertex rules, including the frozen
 * 10-degree turn limit and miter validity.
 */
export function compileCircuitTopology(id: string, lapPath: RasterPath): CircuitTopology {
  assertNonEmpty(id, 'circuit topology id');

  const first = lapPath.vertices[0];
  const last = lapPath.vertices[lapPath.vertices.length - 1];
  if (!first || !last) throw new Error('circuit lap path requires vertices');
  if (first.x !== last.x || first.z !== last.z) {
    throw new Error('circuit lap path must explicitly repeat its first world vertex at the end');
  }
  if (!Object.is(first.sourceRadius, last.sourceRadius)) {
    throw new Error('circuit seam endpoint sourceRadius metadata must match exactly');
  }

  // Recompile two copies as an ordinary open path. The former endpoint seam is
  // now an interior vertex, so existing Core validation is the sole geometry authority.
  const proof = compileRasterPath(repeatLapVertices(lapPath, 2));
  const seamVertexIndex = lapPath.vertices.length - 1;
  const seamTurn = proof.vertexTurns[seamVertexIndex];
  if (seamTurn === undefined) throw new Error('circuit seam turn proof is missing');

  return Object.freeze({
    id,
    lapPath,
    lapLength: lapPath.length,
    seamTurn,
  });
}

/**
 * Materialize a finite circuit window as one completely ordinary open RasterPath.
 * Renderer/Core consumers therefore see only monotonically increasing chainage.
 */
export function unfoldCircuitRasterPath(
  topology: CircuitTopology,
  repeatCount: number,
): RasterPath {
  assertPositiveInteger(repeatCount, 'circuit repeatCount');
  return compileRasterPath(repeatLapVertices(topology.lapPath, repeatCount));
}

/** Map continuous circuit chainage to canonical local chainage plus topological winding. */
export function decomposeCircuitChainage(
  topology: CircuitTopology,
  sUnwrapped: number,
): CircuitChainagePosition {
  assertFinite(sUnwrapped, 'circuit unwrapped chainage');
  const lapLength = topology.lapLength;
  let winding = Math.floor(sUnwrapped / lapLength);
  let sLocal = sUnwrapped - winding * lapLength;

  // Protect the half-open canonical domain from floating-point boundary spill.
  if (sLocal >= lapLength) {
    winding += 1;
    sLocal = 0;
  } else if (sLocal < 0) {
    winding -= 1;
    sLocal += lapLength;
  }
  if (Object.is(sLocal, -0)) sLocal = 0;

  return Object.freeze({ winding, sLocal, sUnwrapped });
}

/** Explicit topology-owned modulo. General Raster/Guide/source readers never perform this step. */
export function wrapCircuitChainage(topology: CircuitTopology, sUnwrapped: number): number {
  return decomposeCircuitChainage(topology, sUnwrapped).sLocal;
}

/**
 * Lift one open-lap source chainage into the equivalent continuous circuit chainage
 * nearest a reference. The source value must belong to the real one-lap [0,L]
 * domain; the explicit endpoint L is the same topology seam as local 0.
 *
 * This is coordinate continuity only. It does not award a race lap or validate FINISH.
 */
export function liftCircuitLocalChainageNear(
  topology: CircuitTopology,
  sLocalSource: number,
  referenceUnwrappedS: number,
): number {
  assertFinite(referenceUnwrappedS, 'circuit reference chainage');
  const local = checkedLapSourceChainage(topology, sLocalSource);
  const lapLength = topology.lapLength;
  const referenceWinding = Math.floor(referenceUnwrappedS / lapLength);
  let candidate = referenceWinding * lapLength + local;
  const halfLap = lapLength * 0.5;

  if (candidate - referenceUnwrappedS > halfLap) candidate -= lapLength;
  else if (referenceUnwrappedS - candidate > halfLap) candidate += lapLength;
  return candidate;
}

function checkedLapSourceChainage(topology: CircuitTopology, s: number): number {
  assertFinite(s, 'circuit local source chainage');
  if (s < 0 || s > topology.lapLength) {
    throw new RangeError('circuit local source chainage must be within the authored [0,L] lap domain');
  }
  return s === topology.lapLength ? 0 : s;
}

function repeatLapVertices(lapPath: RasterPath, repeatCount: number): RasterVertex[] {
  assertPositiveInteger(repeatCount, 'circuit repeatCount');
  const vertices: RasterVertex[] = lapPath.vertices.map((vertex) => ({ ...vertex }));
  for (let repeat = 1; repeat < repeatCount; repeat += 1) {
    // The previous copy already ends at the duplicated seam vertex. Start the
    // next copy from source vertex 1 so no zero-length seam segment is created.
    for (let i = 1; i < lapPath.vertices.length; i += 1) {
      vertices.push({ ...lapPath.vertices[i]! });
    }
  }
  return vertices;
}

function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive integer`);
  }
}

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new RangeError(`${label} must be finite`);
}

function assertNonEmpty(value: string, label: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new RangeError(`${label} must be a non-empty string`);
  }
}
