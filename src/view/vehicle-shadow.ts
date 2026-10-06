import { IMAGE_OPAQUE_COVERAGE } from '../image/image-filter.js';
import type { CompiledVehicleDefinition } from '../vehicle/definition-document.js';
import type { VehicleWorldPoseRead } from '../vehicle/physics/vehicle-contract.js';

/** A vehicle whose shadow a frame draws: its vehicle definition's id and its route position. */
export interface ShadowedVehicle {
  readonly vehicleId: string;
  readonly course: VehicleWorldPoseRead['course'];
}

/**
 * A vehicle's shadow: its overall length and width as a rectangle in route coordinates, centred on its chainage and
 * lateral and aligned with the course whatever its yaw, pitch, roll or lean.
 */
export interface VehicleShadow {
  readonly sStart: number;
  readonly sEnd: number;
  readonly lLeft: number;
  readonly lRight: number;
}

/** The shadows of a frame's vehicles from their definitions' dimensions; the returned list is reused per call. */
export function createVehicleShadows(vehicles: readonly CompiledVehicleDefinition[]) {
  const dimensions = new Map(vehicles.map((vehicle) => [vehicle.compiledVehicle.id, vehicle.compiledVehicle]));
  const pool: { sStart: number; sEnd: number; lLeft: number; lRight: number }[] = [];
  const shadows: VehicleShadow[] = [];
  return (shadowed: readonly ShadowedVehicle[]): readonly VehicleShadow[] => {
    shadows.length = 0;
    for (let i = 0; i < shadowed.length; i++) {
      const { vehicleId, course } = shadowed[i]!;
      const vehicle = dimensions.get(vehicleId);
      if (!vehicle) throw new Error(`No dimensions for vehicle ${vehicleId}`);
      const shadow = (pool[i] ??= { sStart: 0, sEnd: 0, lLeft: 0, lRight: 0 });
      shadow.sStart = course.s - vehicle.overallLength / 2;
      shadow.sEnd = course.s + vehicle.overallLength / 2;
      shadow.lLeft = course.l - vehicle.overallWidth / 2;
      shadow.lRight = course.l + vehicle.overallWidth / 2;
      shadows.push(shadow);
    }
    return shadows;
  };
}

/** One ground row: its chainage footprint `[sNear, sNear + deltaS]` and its projected `[-1, +1]` metre ruler. */
interface ShadowRow {
  readonly sNear: number;
  readonly deltaS: number;
  readonly xGroundL: number;
  readonly xGroundR: number;
}

/**
 * The pixels of one ground row that shadows darken, written to `out` as ascending, disjoint `[start, end)` pixel
 * pairs within `[0, width)`. A shadow takes a row, and a pixel of it, where they cover at least half of the shorter
 * of the two: the row's footprint against the shadow's length, the pixel against the shadow's projected width.
 */
export function shadowRowSpans(
  row: ShadowRow,
  shadows: readonly VehicleShadow[],
  width: number,
  out: number[],
): number[] {
  out.length = 0;
  const sFar = row.sNear + row.deltaS;
  const half = (row.xGroundR - row.xGroundL) / 2;
  for (let i = 0; i < shadows.length; i++) {
    const shadow = shadows[i]!;
    const overlap = Math.min(sFar, shadow.sEnd) - Math.max(row.sNear, shadow.sStart);
    if (overlap < IMAGE_OPAQUE_COVERAGE * Math.min(row.deltaS, shadow.sEnd - shadow.sStart)) continue;
    const xLeft = row.xGroundL + (shadow.lLeft + 1) * half;
    const xRight = row.xGroundL + (shadow.lRight + 1) * half;
    // At least one pixel wide, a pixel is half covered when its centre is; narrower, the pixel holding its centre is.
    let start: number, end: number;
    if (xRight - xLeft >= 1) {
      start = Math.ceil(xLeft - 0.5);
      end = Math.floor(xRight - 0.5) + 1;
    } else {
      start = Math.floor((xLeft + xRight) / 2);
      end = start + 1;
    }
    start = Math.max(0, start);
    end = Math.min(width, end);
    if (start < end) out.push(start, end);
  }
  return mergeSpans(out);
}

/** Sort `[start, end)` pairs by start and join the ones that overlap or touch, in place. */
function mergeSpans(spans: number[]): number[] {
  for (let i = 2; i < spans.length; i += 2) {
    const start = spans[i]!,
      end = spans[i + 1]!;
    let j = i;
    for (; j > 0 && spans[j - 2]! > start; j -= 2) {
      spans[j] = spans[j - 2]!;
      spans[j + 1] = spans[j - 1]!;
    }
    spans[j] = start;
    spans[j + 1] = end;
  }
  let count = 0;
  for (let i = 0; i < spans.length; i += 2) {
    if (count > 0 && spans[i]! <= spans[count - 1]!) spans[count - 1] = Math.max(spans[count - 1]!, spans[i + 1]!);
    else {
      spans[count++] = spans[i]!;
      spans[count++] = spans[i + 1]!;
    }
  }
  spans.length = count;
  return spans;
}
