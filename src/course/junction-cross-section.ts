import { classifyRoadCrossSection, compileRoadCrossSection, type RoadCrossSection } from './road-cross-section.js';
import { LATERAL_BOUNDARY_TOLERANCE_METERS } from '../core/tolerances.js';
type JunctionPhase = 'SINGLE' | 'WIDENING' | 'MEDIAN_GROWTH' | 'SEPARATED';
export type JunctionSide = 'LEFT' | 'RIGHT';

interface LateralInterval {
  readonly min: number;
  readonly max: number;
}

export interface JunctionCrossSectionAuthoring {
  /** Parent stage chainage where the original road starts widening. */
  readonly sWidenStart: number;
  /** Chainage where the widened single asphalt surface starts opening a median. */
  readonly sMedianStart: number;
  /** Chainage where the median reaches its authored full width. */
  readonly sSeparatedStart: number;
  /** Shared incoming road geometry; junctions currently require symmetric road widths. */
  readonly parent: RoadCrossSection;
  /** Width retained by each outgoing child road after the split. */
  readonly childRoadWidth: number;
  /** Full left-to-right width of the median after separation. */
  readonly finalMedianWidth: number;
}

interface JunctionCrossSection {
  readonly s: number;
  readonly phase: JunctionPhase;
  readonly outerHalfWidth: number;
  readonly medianHalfWidth: number;
  readonly asphaltBands: readonly LateralInterval[];
  readonly medianBand: LateralInterval | null;
  readonly shoulderBands: readonly [LateralInterval, LateralInterval];
  /** Child-guide lateral centers relative to the parent Guide. Null before a physical median exists. */
  readonly childCenterL: Readonly<Record<JunctionSide, number>> | null;
}

type JunctionLateralClass = 'ASPHALT_SINGLE' | 'ASPHALT_LEFT' | 'ASPHALT_RIGHT' | 'MEDIAN' | 'SHOULDER' | 'OUTSIDE';

interface JunctionScalarSection {
  readonly phase: JunctionPhase;
  readonly outerHalfWidth: number;
  readonly medianHalfWidth: number;
}

/**
 * Authored junction cross-section authority.
 *
 * A junction remains one chainage-driven lateral cross-section. No second perspective road,
 * camera-space Z or branch-specific depth exists here.
 *
 * Phase A widens one asphalt band from the parent road width to 2*childRoadWidth.
 * Phase B opens the median while moving both outer edges outward by the same amount, so each
 * outgoing child road keeps exactly childRoadWidth. Boundaries are deliberately linear in s:
 * the GroundMap source therefore needs only straight authored edges and the raster renderer
 * remains unchanged.
 */
export class JunctionCrossSectionProfile {
  readonly authoring: Readonly<JunctionCrossSectionAuthoring>;

  get maxSupportedAbsL(): number {
    return (
      this.authoring.childRoadWidth +
      this.authoring.finalMedianWidth * 0.5 +
      this.authoring.parent.shoulderWidth +
      LATERAL_BOUNDARY_TOLERANCE_METERS
    );
  }

  constructor(authoring: JunctionCrossSectionAuthoring) {
    const parent = compileRoadCrossSection(authoring.parent);
    validateAuthoring({ ...authoring, parent });
    this.authoring = Object.freeze({ ...authoring, parent });
  }

  sample(s: number): JunctionCrossSection {
    const scalar = sampleScalarSection(this.authoring, s);
    const { phase, outerHalfWidth, medianHalfWidth } = scalar;
    const a = this.authoring;
    const asphaltBands: LateralInterval[] =
      medianHalfWidth <= LATERAL_BOUNDARY_TOLERANCE_METERS
        ? [{ min: -outerHalfWidth, max: outerHalfWidth }]
        : [
            { min: -outerHalfWidth, max: -medianHalfWidth },
            { min: medianHalfWidth, max: outerHalfWidth },
          ];
    const medianBand =
      medianHalfWidth <= LATERAL_BOUNDARY_TOLERANCE_METERS ? null : { min: -medianHalfWidth, max: medianHalfWidth };
    const shoulderBands: [LateralInterval, LateralInterval] = [
      { min: -outerHalfWidth - a.parent.shoulderWidth, max: -outerHalfWidth },
      { min: outerHalfWidth, max: outerHalfWidth + a.parent.shoulderWidth },
    ];
    const childCenterL =
      medianHalfWidth <= LATERAL_BOUNDARY_TOLERANCE_METERS
        ? null
        : Object.freeze({
            LEFT: -(medianHalfWidth + a.childRoadWidth * 0.5),
            RIGHT: medianHalfWidth + a.childRoadWidth * 0.5,
          });

    return Object.freeze({
      s,
      phase,
      outerHalfWidth,
      medianHalfWidth,
      asphaltBands: Object.freeze(asphaltBands.map((band) => Object.freeze({ ...band }))),
      medianBand: medianBand === null ? null : Object.freeze({ ...medianBand }),
      shoulderBands: Object.freeze(shoulderBands.map((band) => Object.freeze({ ...band }))) as unknown as readonly [
        LateralInterval,
        LateralInterval,
      ],
      childCenterL,
    });
  }

  /** Allocation-free lateral classification used by compiler and runtime SurfaceMap sampling. */
  classify(s: number, l: number): JunctionLateralClass {
    if (!Number.isFinite(s)) throw new RangeError('junction chainage must be finite');
    if (!Number.isFinite(l)) throw new RangeError('junction lateral coordinate must be finite');
    if (s < this.authoring.sWidenStart) {
      const value = classifyRoadCrossSection(this.authoring.parent, l, LATERAL_BOUNDARY_TOLERANCE_METERS);
      return value === 'ROAD' ? 'ASPHALT_SINGLE' : value;
    }
    const { outerHalfWidth, medianHalfWidth } = sampleScalarSection(this.authoring, s);
    const shoulderWidth = this.authoring.parent.shoulderWidth;

    if (
      medianHalfWidth > LATERAL_BOUNDARY_TOLERANCE_METERS &&
      Math.abs(l) <= medianHalfWidth + LATERAL_BOUNDARY_TOLERANCE_METERS
    )
      return 'MEDIAN';
    if (medianHalfWidth <= LATERAL_BOUNDARY_TOLERANCE_METERS) {
      if (Math.abs(l) <= outerHalfWidth + LATERAL_BOUNDARY_TOLERANCE_METERS) return 'ASPHALT_SINGLE';
    } else {
      if (
        l >= -outerHalfWidth - LATERAL_BOUNDARY_TOLERANCE_METERS &&
        l <= -medianHalfWidth + LATERAL_BOUNDARY_TOLERANCE_METERS
      )
        return 'ASPHALT_LEFT';
      if (
        l >= medianHalfWidth - LATERAL_BOUNDARY_TOLERANCE_METERS &&
        l <= outerHalfWidth + LATERAL_BOUNDARY_TOLERANCE_METERS
      )
        return 'ASPHALT_RIGHT';
    }
    if (
      (l >= -outerHalfWidth - shoulderWidth - LATERAL_BOUNDARY_TOLERANCE_METERS &&
        l <= -outerHalfWidth + LATERAL_BOUNDARY_TOLERANCE_METERS) ||
      (l >= outerHalfWidth - LATERAL_BOUNDARY_TOLERANCE_METERS &&
        l <= outerHalfWidth + shoulderWidth + LATERAL_BOUNDARY_TOLERANCE_METERS)
    )
      return 'SHOULDER';
    return 'OUTSIDE';
  }

  medianHalfWidthAt(s: number): number {
    return sampleScalarSection(this.authoring, s).medianHalfWidth;
  }

  childCenterLAt(s: number, side: JunctionSide): number | null {
    const medianHalfWidth = this.medianHalfWidthAt(s);
    if (medianHalfWidth <= LATERAL_BOUNDARY_TOLERANCE_METERS) return null;
    const magnitude = medianHalfWidth + this.authoring.childRoadWidth * 0.5;
    return side === 'LEFT' ? -magnitude : magnitude;
  }

  /**
   * Parent-Guide-relative center of a fully separated child road.
   * A stage handoff must not use an interpolating center before the split is geometrically done.
   */
  separatedChildCenterL(side: JunctionSide): number {
    const center = this.childCenterLAt(this.authoring.sSeparatedStart, side);
    if (center === null) throw new Error('separated junction has no child center');
    return center;
  }
}

function sampleScalarSection(a: JunctionCrossSectionAuthoring, s: number): JunctionScalarSection {
  if (!Number.isFinite(s)) throw new RangeError('junction chainage must be finite');
  if (s < a.sWidenStart) {
    return { phase: 'SINGLE', outerHalfWidth: a.parent.roadLeft, medianHalfWidth: 0 };
  }
  if (s < a.sMedianStart) {
    const t = unitInterval((s - a.sWidenStart) / (a.sMedianStart - a.sWidenStart));
    return {
      phase: 'WIDENING',
      outerHalfWidth: lerp(a.parent.roadLeft, a.childRoadWidth, t),
      medianHalfWidth: 0,
    };
  }
  if (s < a.sSeparatedStart) {
    const t = unitInterval((s - a.sMedianStart) / (a.sSeparatedStart - a.sMedianStart));
    const medianHalfWidth = lerp(0, a.finalMedianWidth * 0.5, t);
    return {
      phase: 'MEDIAN_GROWTH',
      outerHalfWidth: a.childRoadWidth + medianHalfWidth,
      medianHalfWidth,
    };
  }
  const medianHalfWidth = a.finalMedianWidth * 0.5;
  return {
    phase: 'SEPARATED',
    outerHalfWidth: a.childRoadWidth + medianHalfWidth,
    medianHalfWidth,
  };
}

function validateAuthoring(a: JunctionCrossSectionAuthoring): void {
  for (const [name, value] of Object.entries(a)) {
    if (name === 'parent') continue;
    if (!Number.isFinite(value)) throw new RangeError(`junction ${name} must be finite`);
  }
  if (!(a.sMedianStart > a.sWidenStart)) throw new RangeError('sMedianStart must be after sWidenStart');
  if (!(a.sSeparatedStart > a.sMedianStart)) throw new RangeError('sSeparatedStart must be after sMedianStart');
  if (a.parent.roadLeft !== a.parent.roadRight) throw new RangeError('junction parent must be symmetric');
  if (!(a.childRoadWidth > 0)) throw new RangeError('childRoadWidth must be > 0');
  if (2 * a.childRoadWidth + LATERAL_BOUNDARY_TOLERANCE_METERS < a.parent.roadLeft + a.parent.roadRight) {
    throw new RangeError('junction widening cannot end narrower than the parent road');
  }
  if (!(a.finalMedianWidth > 0)) throw new RangeError('finalMedianWidth must be > 0');
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function unitInterval(value: number): number {
  return Math.max(0, Math.min(1, value));
}
