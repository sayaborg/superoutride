/**
 * A solid object on a Section: at station `s` and lateral `l`, a solid width across the road with no depth along it,
 * from `bottom` to `top` metres of height (infinite for a wall's free end). `sprite` is its placement's index among the
 * Section's expanded sprites (null for a wall end). A movable object has a mass (kg) and the elevation a hit throws it
 * at; a fixed one (`movable` null) never moves. Vehicles meet it as they meet each other.
 */
export interface CourseObject {
  readonly s: number;
  readonly l: number;
  readonly width: number;
  readonly bottom: number;
  readonly top: number;
  readonly sprite: number | null;
  readonly movable: { readonly mass: number; readonly launchRadians: number } | null;
}
