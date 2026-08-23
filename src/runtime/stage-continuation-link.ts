import { guideCoordinateToWorld, type GuideCoordinateSource } from '../core/guide-coordinate-frame.js';
import { wrapAngle } from '../core/math.js';

export interface StageContinuationLinkAuthoring {
  readonly id: string;
  readonly sourceFrame: GuideCoordinateSource;
  readonly targetFrame: GuideCoordinateSource;
  readonly sourceSeamS: number;
  readonly targetSeamS: number;
  readonly sourceLocalL: number;
  readonly targetLocalL: number;
  readonly overlapBehind: number;
  readonly overlapAhead: number;
  readonly positionTolerance?: number;
  readonly headingTolerance?: number;
}

export interface StageContinuationLink {
  readonly id: string;
  readonly sourceFrame: GuideCoordinateSource;
  readonly targetFrame: GuideCoordinateSource;
  readonly sourceSeamS: number;
  readonly targetSeamS: number;
  readonly sourceLocalL: number;
  readonly targetLocalL: number;
  readonly overlapBehind: number;
  readonly overlapAhead: number;
}

const DEFAULT_POSITION_TOLERANCE = 1e-7;
const DEFAULT_HEADING_TOLERANCE = 1e-7;

/**
 * Compile a coordinate-only stage continuation link.
 *
 * Source and target charts must describe the same world road locus across the complete authored
 * overlap interval. Their local lateral coordinates may differ: for example parent l=-7.5 can be
 * the same physical road center as child l=0. A later gameplay handoff can therefore swap charts
 * without changing vehicle world pose, camera world anchor, or renderer mathematics.
 */
export function compileStageContinuationLink(
  source: StageContinuationLinkAuthoring,
): StageContinuationLink {
  if (source.id.trim().length === 0) throw new RangeError('stage continuation link id must not be empty');
  if (!(source.overlapBehind > 0)) throw new RangeError('stage continuation overlapBehind must be > 0');
  if (!(source.overlapAhead > 0)) throw new RangeError('stage continuation overlapAhead must be > 0');

  const positionTolerance = source.positionTolerance ?? DEFAULT_POSITION_TOLERANCE;
  const headingTolerance = source.headingTolerance ?? DEFAULT_HEADING_TOLERANCE;
  if (!(positionTolerance >= 0) || !(headingTolerance >= 0)) {
    throw new RangeError('stage continuation tolerances must be >= 0');
  }

  const probes = [
    -source.overlapBehind,
    -source.overlapBehind * 0.5,
    0,
    source.overlapAhead * 0.5,
    source.overlapAhead,
  ];
  for (const delta of probes) {
    assertEquivalentSample(source, delta, positionTolerance, headingTolerance);
  }

  return Object.freeze({
    id: source.id,
    sourceFrame: source.sourceFrame,
    targetFrame: source.targetFrame,
    sourceSeamS: source.sourceSeamS,
    targetSeamS: source.targetSeamS,
    sourceLocalL: source.sourceLocalL,
    targetLocalL: source.targetLocalL,
    overlapBehind: source.overlapBehind,
    overlapAhead: source.overlapAhead,
  });
}

/** Map one source-stage chainage in the validated overlap to target-stage chainage. */
export function mapStageContinuationChainage(
  link: StageContinuationLink,
  sourceS: number,
): number {
  return link.targetSeamS + (sourceS - link.sourceSeamS);
}

/** Preserve signed lateral displacement from the linked road locus across the chart rebase. */
export function mapStageContinuationLateral(
  link: StageContinuationLink,
  sourceL: number,
): number {
  return link.targetLocalL + (sourceL - link.sourceLocalL);
}

function assertEquivalentSample(
  source: StageContinuationLinkAuthoring,
  delta: number,
  positionTolerance: number,
  headingTolerance: number,
): void {
  const a = guideCoordinateToWorld(
    source.sourceFrame,
    source.sourceSeamS + delta,
    source.sourceLocalL,
  );
  const b = guideCoordinateToWorld(
    source.targetFrame,
    source.targetSeamS + delta,
    source.targetLocalL,
  );
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  if (Math.hypot(dx, dz) > positionTolerance) {
    throw new RangeError(`stage continuation world-position mismatch at delta ${delta}`);
  }
  if (Math.abs(wrapAngle(a.heading - b.heading)) > headingTolerance) {
    throw new RangeError(`stage continuation heading mismatch at delta ${delta}`);
  }
}
