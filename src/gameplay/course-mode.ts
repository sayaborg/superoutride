export type CourseRouteKind = 'LINEAR' | 'BRANCHING' | 'CIRCUIT';

export type CourseRouteAuthorityKind = 'POINT_TO_POINT_GRAPH' | 'CIRCUIT_LOOP';

export type CourseFinishKind = 'POINT_TO_POINT' | 'LAPS';

export type CourseSharedRouteChoiceMode = 'INDEPENDENT' | 'FIRST_PHYSICAL_CROSSING_LOCKS';

/** Physical response after shared branch authority has made one sibling route illegal. */
export type BranchViolationPolicy = 'RECOVER_TO_LOCKED_BRANCH';

export interface CourseModeAuthoring {
  readonly id: string;
  readonly routeKind: CourseRouteKind;
  readonly rivalCount: number;
}

export interface CourseModeProfile {
  readonly id: string;
  readonly routeKind: CourseRouteKind;
  readonly routeAuthorityKind: CourseRouteAuthorityKind;
  readonly finishKind: CourseFinishKind;
  readonly rivalCount: number;
  readonly sharedRouteChoiceMode: CourseSharedRouteChoiceMode;
  /**
   * What physically happens when a trailing vehicle attempts the now-forbidden sibling branch.
   * This is deliberately independent from branch selection authority.
   */
  readonly branchViolationPolicy: BranchViolationPolicy | null;
}

export const MAX_RIVAL_COUNT = 16;

/**
 * Compile product-facing course mode semantics without coupling every course shape to RouteDag.
 *
 * LINEAR and BRANCHING currently fit the point-to-point graph runtime. CIRCUIT is intentionally a
 * distinct future authority so the acyclic RouteDag invariant never needs to be weakened merely
 * to represent laps.
 */
export function compileCourseMode(authoring: CourseModeAuthoring): CourseModeProfile {
  assertNonEmpty(authoring.id, 'course mode id');
  if (!Number.isInteger(authoring.rivalCount)
    || authoring.rivalCount < 0
    || authoring.rivalCount > MAX_RIVAL_COUNT) {
    throw new RangeError(`course mode rivalCount must be an integer within 0..${MAX_RIVAL_COUNT}`);
  }

  switch (authoring.routeKind) {
    case 'LINEAR':
      return Object.freeze({
        id: authoring.id,
        routeKind: authoring.routeKind,
        routeAuthorityKind: 'POINT_TO_POINT_GRAPH',
        finishKind: 'POINT_TO_POINT',
        rivalCount: authoring.rivalCount,
        sharedRouteChoiceMode: 'INDEPENDENT',
        branchViolationPolicy: null,
      });
    case 'BRANCHING':
      return Object.freeze({
        id: authoring.id,
        routeKind: authoring.routeKind,
        routeAuthorityKind: 'POINT_TO_POINT_GRAPH',
        finishKind: 'POINT_TO_POINT',
        rivalCount: authoring.rivalCount,
        sharedRouteChoiceMode: 'FIRST_PHYSICAL_CROSSING_LOCKS',
        branchViolationPolicy: 'RECOVER_TO_LOCKED_BRANCH',
      });
    case 'CIRCUIT':
      return Object.freeze({
        id: authoring.id,
        routeKind: authoring.routeKind,
        routeAuthorityKind: 'CIRCUIT_LOOP',
        finishKind: 'LAPS',
        rivalCount: authoring.rivalCount,
        sharedRouteChoiceMode: 'INDEPENDENT',
        branchViolationPolicy: null,
      });
    default: {
      const exhaustive: never = authoring.routeKind;
      throw new RangeError(`unsupported course route kind: ${String(exhaustive)}`);
    }
  }
}

function assertNonEmpty(value: string, label: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new RangeError(`${label} must be a non-empty string`);
  }
}