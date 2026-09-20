/** Internal numerical workspace for one planar sample; public observations keep named fields. */
export const enum PlanarSampleSlot {
  x,
  z,
  s,
  heading,
  segmentIndex,
}
export function createPlanarSampleBuffer(): Float64Array {
  const buffer = new Float64Array(5);
  buffer[PlanarSampleSlot.segmentIndex] = -1;
  return buffer;
}
export function readPlanarSample<T extends { x: number; z: number; s: number; heading: number; segmentIndex: number }>(
  buffer: Float64Array,
  out: T,
): T {
  out.x = buffer[PlanarSampleSlot.x]!;
  out.z = buffer[PlanarSampleSlot.z]!;
  out.s = buffer[PlanarSampleSlot.s]!;
  out.heading = buffer[PlanarSampleSlot.heading]!;
  out.segmentIndex = buffer[PlanarSampleSlot.segmentIndex]!;
  return out;
}

/** One stable named output layout shared by point readers and their consumers. */
export function createPlanarCoordinateSample() {
  return { x: 0, z: 0, s: 0, heading: 0, segmentIndex: -1, l: 0 };
}
