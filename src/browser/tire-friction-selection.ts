import { BROWSER_CALIBRATION_KEYS } from './key-bindings.js';
import {
  compileTireCharacteristics,
  createArcadeTireFrictionCalibration,
  readTireCharacteristics,
  type ArcadeTireFrictionCalibrationState,
  type TireCharacteristics,
} from '../physics/tire-friction-calibration.js';

const SELECTOR_GRID_TOLERANCE = 1e-9;

export type BrowserTireCalibrationAxis = 'GX' | 'PX' | 'GY' | 'PY' | 'KNEE';
export interface BrowserTireAxis {
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

export const DEFAULT_BROWSER_TIRE_CHARACTERISTICS: Readonly<TireCharacteristics> = Object.freeze({
  gripX: 5.0,
  peakSlipX: 0.2,
  gripY: 2.5,
  peakSlipY: 0.1,
  knee: 0.74,
});
export const DEFAULT_BROWSER_TIRE_FRICTION_CALIBRATION = createArcadeTireFrictionCalibration(
  compileTireCharacteristics(DEFAULT_BROWSER_TIRE_CHARACTERISTICS),
);

export function browserTireAxis(id: BrowserTireCalibrationAxis): BrowserTireAxis {
  const axis = BROWSER_TIRE_AXES.find((axis) => axis.id === id);
  if (!axis) throw new RangeError(`unknown tire axis: ${id}`);
  return axis;
}

export function browserTireCalibrationForAxis(
  id: BrowserTireCalibrationAxis,
  value: number,
  current: ArcadeTireFrictionCalibrationState,
): TireCharacteristics {
  const axis = browserTireAxis(id),
    ticks = value * 100;
  const index = (ticks - axis.min) / axis.step;
  if (
    !Number.isFinite(value) ||
    ticks < axis.min - SELECTOR_GRID_TOLERANCE ||
    ticks > axis.max + SELECTOR_GRID_TOLERANCE ||
    Math.abs(index - Math.round(index)) > SELECTOR_GRID_TOLERANCE
  ) {
    throw new RangeError(`${id} is outside its browser selector grid`);
  }
  return { ...readTireCharacteristics(current.front), [axis.field]: (axis.min + Math.round(index) * axis.step) / 100 };
}

/** Both directions wrap; off-grid values move to the adjacent admissible value, not an arbitrary ID. */
export function stepBrowserTireCalibration(
  id: BrowserTireCalibrationAxis,
  direction: -1 | 1,
  current: ArcadeTireFrictionCalibrationState,
): TireCharacteristics {
  if (direction !== -1 && direction !== 1) throw new RangeError('tire step direction must be -1 or 1');
  const axis = browserTireAxis(id);
  const index = (100 * readTireCharacteristics(current.front)[axis.field] - axis.min) / axis.step;
  const count = (axis.max - axis.min) / axis.step + 1;
  const next =
    direction > 0 ? Math.floor(index + SELECTOR_GRID_TOLERANCE) + 1 : Math.ceil(index - SELECTOR_GRID_TOLERANCE) - 1;
  const wrapped = ((next % count) + count) % count;
  return browserTireCalibrationForAxis(id, (axis.min + wrapped * axis.step) / 100, current);
}

export function formatTireAxisValue(
  id: BrowserTireCalibrationAxis,
  current: ArcadeTireFrictionCalibrationState,
): string {
  const axis = browserTireAxis(id),
    value = readTireCharacteristics(current.front)[axis.field];
  return axis.percent ? `${Number((value * 100).toFixed(2))}%` : value.toFixed(2);
}

export function formatTireCalibrationSelector(current: ArcadeTireFrictionCalibrationState): string {
  return BROWSER_TIRE_AXES.map(
    (axis) => `${axis.id === 'KNEE' ? 'KN' : axis.id}${formatTireAxisValue(axis.id, current)}`,
  ).join(' ');
}
