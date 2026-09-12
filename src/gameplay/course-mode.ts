import { nonEmptyId } from '../core/validation.js';
export type CourseRouteKind = 'LINEAR' | 'BRANCHING' | 'CIRCUIT';

type CourseRouteAuthorityKind = 'POINT_TO_POINT_GRAPH' | 'CIRCUIT_LOOP';

type CourseFinishKind = 'POINT_TO_POINT' | 'LAPS';

type CourseSharedRouteChoiceMode = 'INDEPENDENT' | 'FIRST_PHYSICAL_CROSSING_LOCKS';

/** Physical response after shared branch authority has made one sibling route illegal. */
export type BranchViolationPolicy = 'RECOVER_TO_LOCKED_BRANCH';

interface CourseModeAuthoring {
  readonly id: string;
  readonly routeKind: CourseRouteKind;
}

export interface CourseModeProfile {
  readonly id: string;
  readonly routeKind: CourseRouteKind;
  readonly routeAuthorityKind: CourseRouteAuthorityKind;
  readonly finishKind: CourseFinishKind;
  readonly sharedRouteChoiceMode: CourseSharedRouteChoiceMode;
  /**
   * What physically happens when a trailing vehicle attempts the now-forbidden sibling branch.
   * This is deliberately independent from branch selection authority.
   */
  readonly branchViolationPolicy: BranchViolationPolicy | null;
}

/**
 * Compile product-facing course mode semantics without coupling every course shape to RouteDag.
 *
 * LINEAR and BRANCHING currently fit the point-to-point graph runtime. CIRCUIT is intentionally a
 * distinct authority so the acyclic RouteDag invariant never needs to be weakened merely
 * to represent laps.
 */
export function compileCourseMode(authoring: CourseModeAuthoring): CourseModeProfile {
  nonEmptyId(authoring.id, 'course mode id');

  switch (authoring.routeKind) {
    case 'LINEAR':
      return Object.freeze({
        id: authoring.id,
        routeKind: authoring.routeKind,
        routeAuthorityKind: 'POINT_TO_POINT_GRAPH',
        finishKind: 'POINT_TO_POINT',
        sharedRouteChoiceMode: 'INDEPENDENT',
        branchViolationPolicy: null,
      });
    case 'BRANCHING':
      return Object.freeze({
        id: authoring.id,
        routeKind: authoring.routeKind,
        routeAuthorityKind: 'POINT_TO_POINT_GRAPH',
        finishKind: 'POINT_TO_POINT',
        sharedRouteChoiceMode: 'FIRST_PHYSICAL_CROSSING_LOCKS',
        branchViolationPolicy: 'RECOVER_TO_LOCKED_BRANCH',
      });
    case 'CIRCUIT':
      return Object.freeze({
        id: authoring.id,
        routeKind: authoring.routeKind,
        routeAuthorityKind: 'CIRCUIT_LOOP',
        finishKind: 'LAPS',
        sharedRouteChoiceMode: 'INDEPENDENT',
        branchViolationPolicy: null,
      });
    default: {
      const exhaustive: never = authoring.routeKind;
      throw new RangeError(`unsupported course route kind: ${String(exhaustive)}`);
    }
  }
}
