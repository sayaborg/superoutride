/**
 * A line vehicles cannot cross, over Section stations `[start, end]`: a solid wall along its Boundary, or a course limit
 * along the outer edge of the covered material. `keep` is the side a limit keeps vehicles on (+1 right of the line, −1
 * left); a wall keeps each vehicle on the side its centre is on (0).
 */
export interface CourseBarrierLine {
  readonly start: number;
  readonly end: number;
  readonly keep: -1 | 0 | 1;
  /** The line's lateral at Section station `s` in `[start, end]`. */
  lateralAt(s: number): number;
  /** Its lateral change per metre of station at `s`: a slanted line moves across a vehicle travelling along the road. */
  slopeAt(s: number): number;
}
