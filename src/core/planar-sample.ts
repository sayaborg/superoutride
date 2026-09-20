/** One stable named output layout shared by point readers and their consumers. */
export function createPlanarCoordinateSample() {
  return { x: 0, z: 0, s: 0, heading: 0, segmentIndex: -1, l: 0 };
}
