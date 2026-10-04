/**
 * A fixed solid object on a Section: at station `s` and lateral `l`, a solid width across the road with no depth along
 * it, from `bottom` to `top` metres of height (infinite for a wall's free end). Vehicles meet it as they meet each other.
 */
export interface CourseFixedObject {
  readonly s: number;
  readonly l: number;
  readonly width: number;
  readonly bottom: number;
  readonly top: number;
}
