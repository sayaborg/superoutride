import { DRIVING_DEFINITION } from '../vehicle/driving-definition.js';
import {
  readTireCharacteristics,
  type VehicleTireFrictionCalibrationState,
  type TireCharacteristics,
} from '../vehicle/physics/tire-friction-calibration.js';
import { BROWSER_CALIBRATION_KEYS } from './key-bindings.js';

// Hundredth-value ticks: decimal conversion budget, ~8,800 ulps at the largest tick (800).
const SELECTOR_TICK_TOLERANCE = 1e-9;
// Dimensionless grid index: division/rounding budget of one billionth of a step.
// Shared by grid admission and adjacent-choice selection, independent of tick step size.
const SELECTOR_INDEX_TOLERANCE = 1e-9;

export type BrowserTireCalibrationAxis = 'GX' | 'PX' | 'GY' | 'PY' | 'KNEE';
interface BrowserTireAxis {
  readonly id: BrowserTireCalibrationAxis;
  readonly field: keyof TireCharacteristics;
  readonly code: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly percent: boolean;
}

/** Integer hundredths avoid cumulative floating-point stepping. One registry for all UI. */
export const BROWSER_TIRE_AXES: readonly BrowserTireAxis[] = Object.freeze(
  [
    { id: 'GX', field: 'gripX', code: BROWSER_CALIBRATION_KEYS.GX, min: 200, max: 800, step: 5, percent: false },
    { id: 'PX', field: 'peakSlipX', code: BROWSER_CALIBRATION_KEYS.PX, min: 2, max: 40, step: 1, percent: true },
    { id: 'GY', field: 'gripY', code: BROWSER_CALIBRATION_KEYS.GY, min: 100, max: 400, step: 5, percent: false },
    { id: 'PY', field: 'peakSlipY', code: BROWSER_CALIBRATION_KEYS.PY, min: 2, max: 20, step: 1, percent: true },
    { id: 'KNEE', field: 'knee', code: BROWSER_CALIBRATION_KEYS.KNEE, min: 10, max: 95, step: 1, percent: false },
  ].map((axis) => Object.freeze(axis)) as BrowserTireAxis[],
);

function browserTireAxis(id: BrowserTireCalibrationAxis): BrowserTireAxis {
  const axis = BROWSER_TIRE_AXES.find((axis) => axis.id === id);
  if (!axis) throw new RangeError(`unknown tire axis: ${id}`);
  return axis;
}

function browserTireCalibrationForAxis(
  id: BrowserTireCalibrationAxis,
  value: number,
  current: VehicleTireFrictionCalibrationState,
): TireCharacteristics {
  const axis = browserTireAxis(id);
  const index = browserTireGridIndex(axis, value);
  return { ...readTireCharacteristics(current.front), [axis.field]: (axis.min + Math.round(index) * axis.step) / 100 };
}

function browserTireGridIndex(axis: BrowserTireAxis, value: number): number {
  const ticks = value * 100;
  const index = (ticks - axis.min) / axis.step;
  if (
    !Number.isFinite(value) ||
    ticks < axis.min - SELECTOR_TICK_TOLERANCE ||
    ticks > axis.max + SELECTOR_TICK_TOLERANCE ||
    Math.abs(index - Math.round(index)) > SELECTOR_INDEX_TOLERANCE
  ) {
    throw new RangeError(`${axis.id} is outside its browser selector grid`);
  }
  return index;
}

/** Both directions wrap; off-grid values move to the adjacent admissible value, not an arbitrary ID. */
export function stepBrowserTireCalibration(
  id: BrowserTireCalibrationAxis,
  direction: -1 | 1,
  current: VehicleTireFrictionCalibrationState,
): TireCharacteristics {
  if (direction !== -1 && direction !== 1) throw new RangeError('tire step direction must be -1 or 1');
  const axis = browserTireAxis(id);
  const index = (100 * readTireCharacteristics(current.front)[axis.field] - axis.min) / axis.step;
  const count = (axis.max - axis.min) / axis.step + 1;
  const next =
    direction > 0 ? Math.floor(index + SELECTOR_INDEX_TOLERANCE) + 1 : Math.ceil(index - SELECTOR_INDEX_TOLERANCE) - 1;
  const wrapped = ((next % count) + count) % count;
  return browserTireCalibrationForAxis(id, (axis.min + wrapped * axis.step) / 100, current);
}

export function formatTireAxisValue(
  id: BrowserTireCalibrationAxis,
  current: VehicleTireFrictionCalibrationState,
): string {
  const axis = browserTireAxis(id),
    value = readTireCharacteristics(current.front)[axis.field];
  return axis.percent ? `${Number((value * 100).toFixed(2))}%` : value.toFixed(2);
}

export function formatTireCalibrationSelector(current: VehicleTireFrictionCalibrationState): string {
  return BROWSER_TIRE_AXES.map(
    (axis) => `${axis.id === 'KNEE' ? 'KN' : axis.id}${formatTireAxisValue(axis.id, current)}`,
  ).join(' ');
}

// Admit the authored starting values to the DEV grid without making the grid their authority.
for (const axis of BROWSER_TIRE_AXES) {
  browserTireGridIndex(axis, DRIVING_DEFINITION.tire[axis.field]);
}
