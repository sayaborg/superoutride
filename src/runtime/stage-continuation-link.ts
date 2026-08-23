import { guideCoordinateToWorld, type GuideCoordinateSource } from '../core/guide-coordinate-frame.js';
import { wrapAngle } from '../core/math.js';

export interface StageContinuationLinkAuthoring {
  readonly id: string;
  readonly sourceFrame: GuideCoordinateSource;
  readonly targetFrame: GuideCoordinateSource;
  readonly sourceSeamS: number;
  readonly targetSeamS: number;
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
  readonly overlapBehind: number;
  readonly overlapAhead: number;
}

const DEFAULT_POSITION_TOLERANCE = 1e-7;
const DEFAULT_HEADING_TOLERANCE = 1e-7;

/**
 * Compile a coordinate-only stage continuation link.
 *
 * The source and target charts must describe the same world road geometry across the complete
 * authored overlap interval. A later gameplay handoff may therefore swap coordinate frames at the
 * seam without changing vehicle world pose, camera world anchor, or renderer mathematics.
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

function assertEquivalentSample(
  source: StageContinuationLinkAuthoring,
  delta: number,
  positionTolerance: number,
  headingTolerance: number,
): void {
  const a = guideCoordinateToWorld(source.sourceFrame, source.sourceSeamS + delta, 0);
  const b = guideCoordinateToWorld(source.targetFrame, source.targetSeamS + delta, 0);
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  if (Math.hypot(dx, dz) > positionTolerance) {
    throw new RangeError(`stage continuation world-position mismatch at delta ${delta}`);
  }
  if (Math.abs(wrapAngle(a.heading - b.heading)) > headingTolerance) {
    throw new RangeError(`stage continuation heading mismatch at delta ${delta}`);
  }
}
