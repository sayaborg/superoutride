export type JunctionPhase = 'SINGLE' | 'WIDENING' | 'MEDIAN_GROWTH' | 'SEPARATED';
export type JunctionSide = 'LEFT' | 'RIGHT';

export interface LateralInterval {
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
  /** Width of the incoming single road. */
  readonly parentRoadWidth: number;
  /** Width retained by each outgoing child road after the split. */
  readonly childRoadWidth: number;
  /** Full left-to-right width of the median after separation. */
  readonly finalMedianWidth: number;
  /** Outer shoulder width on each side. */
  readonly shoulderWidth: number;
}

export interface JunctionCrossSection {
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

export type JunctionLateralClass =
  | 'ASPHALT_SINGLE'
  | 'ASPHALT_LEFT'
  | 'ASPHALT_RIGHT'
  | 'MEDIAN'
  | 'SHOULDER'
  | 'OUTSIDE';

interface JunctionScalarSection {
  readonly phase: JunctionPhase;
  readonly outerHalfWidth: number;
  readonly medianHalfWidth: number;
}

const EPSILON = 1e-9;

/**
 * M6.12 junction authority.
 *
 * A junction remains one chainage-driven lateral cross-section. No second perspective road,
 * camera-space Z or branch-specific depth exists here.
 *
 * Phase A widens one asphalt band from parentRoadWidth to 2*childRoadWidth.
 * Phase B opens the median while moving both outer edges outward by the same amount, so each
 * outgoing child road keeps exactly childRoadWidth. Boundaries are deliberately linear in s:
 * the GroundMap source therefore needs only straight authored edges and the raster renderer
 * remains unchanged.
 */
export class JunctionCrossSectionProfile {
  readonly authoring: Readonly<JunctionCrossSectionAuthoring>;

  constructor(authoring: JunctionCrossSectionAuthoring) {
    validateAuthoring(authoring);
    this.authoring = Object.freeze({ ...authoring });
  }

  sample(s: number): JunctionCrossSection {
    const scalar = sampleScalarSection(this.authoring, s);
    const { phase, outerHalfWidth, medianHalfWidth } = scalar;
    const a = this.authoring;
    const asphaltBands: LateralInterval[] = medianHalfWidth <= EPSILON
      ? [{ min: -outerHalfWidth, max: outerHalfWidth }]
      : [
          { min: -outerHalfWidth, max: -medianHalfWidth },
          { min: medianHalfWidth, max: outerHalfWidth },
        ];
    const medianBand = medianHalfWidth <= EPSILON
      ? null
      : { min: -medianHalfWidth, max: medianHalfWidth };
    const shoulderBands: [LateralInterval, LateralInterval] = [
      { min: -outerHalfWidth - a.shoulderWidth, max: -outerHalfWidth },
      { min: outerHalfWidth, max: outerHalfWidth + a.shoulderWidth },
    ];
    const childCenterL = medianHalfWidth <= EPSILON
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
      shoulderBands: Object.freeze(shoulderBands.map((band) => Object.freeze({ ...band }))) as unknown as readonly [LateralInterval, LateralInterval],
      childCenterL,
    });
  }

  /** Allocation-free lateral classification used by compiler and runtime SurfaceMap sampling. */
  classify(s: number, l: number): JunctionLateralClass {
    if (!Number.isFinite(l)) throw new RangeError('junction lateral coordinate must be finite');
    const { outerHalfWidth, medianHalfWidth } = sampleScalarSection(this.authoring, s);
    const shoulderWidth = this.authoring.shoulderWidth;

    if (medianHalfWidth > EPSILON && Math.abs(l) <= medianHalfWidth + EPSILON) return 'MEDIAN';
    if (medianHalfWidth <= EPSILON) {
      if (Math.abs(l) <= outerHalfWidth + EPSILON) return 'ASPHALT_SINGLE';
    } else {
      if (l >= -outerHalfWidth - EPSILON && l <= -medianHalfWidth + EPSILON) return 'ASPHALT_LEFT';
      if (l >= medianHalfWidth - EPSILON && l <= outerHalfWidth + EPSILON) return 'ASPHALT_RIGHT';
    }
    if (
      (l >= -outerHalfWidth - shoulderWidth - EPSILON && l <= -outerHalfWidth + EPSILON)
      || (l >= outerHalfWidth - EPSILON && l <= outerHalfWidth + shoulderWidth + EPSILON)
    ) return 'SHOULDER';
    return 'OUTSIDE';
  }

  medianHalfWidthAt(s: number): number {
    return sampleScalarSection(this.authoring, s).medianHalfWidth;
  }

  childCenterLAt(s: number, side: JunctionSide): number | null {
    const medianHalfWidth = this.medianHalfWidthAt(s);
    if (medianHalfWidth <= EPSILON) return null;
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
    return { phase: 'SINGLE', outerHalfWidth: a.parentRoadWidth * 0.5, medianHalfWidth: 0 };
  }
  if (s < a.sMedianStart) {
    const t = unitInterval((s - a.sWidenStart) / (a.sMedianStart - a.sWidenStart));
    return {
      phase: 'WIDENING',
      outerHalfWidth: lerp(a.parentRoadWidth * 0.5, a.childRoadWidth, t),
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
    if (!Number.isFinite(value)) throw new RangeError(`junction ${name} must be finite`);
  }
  if (!(a.sMedianStart > a.sWidenStart)) throw new RangeError('sMedianStart must be after sWidenStart');
  if (!(a.sSeparatedStart > a.sMedianStart)) throw new RangeError('sSeparatedStart must be after sMedianStart');
  if (!(a.parentRoadWidth > 0)) throw new RangeError('parentRoadWidth must be > 0');
  if (!(a.childRoadWidth > 0)) throw new RangeError('childRoadWidth must be > 0');
  if (2 * a.childRoadWidth + EPSILON < a.parentRoadWidth) {
    throw new RangeError('junction widening cannot end narrower than the parent road');
  }
  if (!(a.finalMedianWidth > 0)) throw new RangeError('finalMedianWidth must be > 0');
  if (!(a.shoulderWidth >= 0)) throw new RangeError('shoulderWidth must be >= 0');
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function unitInterval(value: number): number {
  return Math.max(0, Math.min(1, value));
}
