import type { DrivingDefinition, DrivingDocument } from '../vehicle/driving-definition.js';

/**
 * DEV tuning of the game-wide driving definition, in its saved units. Only author-facing design
 * values are listed; numerical margins (fuel-cut and clutch-lock idle margins) stay file-only.
 */
export type DrivingTuningGroup = 'STEERING' | 'PEDALS' | 'TIRES' | 'POWERTRAIN';

interface NumericTuningItem {
  readonly id: string;
  readonly group: DrivingTuningGroup;
  /** Short label shared by DEV buttons and HUD. */
  readonly label: string;
  readonly description: string;
  readonly unit: string;
  /** Grid in integer ticks of 1/scale definition units: min, max and step are ticks. */
  readonly scale: number;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  /** Displayed as a percentage of the definition value. */
  readonly percent?: boolean;
  read(definition: DrivingDefinition): number;
  write(definition: DrivingDocument, value: number): DrivingDocument;
}

const item = (value: NumericTuningItem): NumericTuningItem => Object.freeze(value);
const tire = (key: keyof DrivingDefinition['tire']) => ({
  read: (d: DrivingDefinition) => d.tire[key],
  write: (d: DrivingDocument, value: number): DrivingDocument => ({ ...d, tire: { ...d.tire, [key]: value } }),
});
const pedal = (pedalKey: 'throttle' | 'brake', key: 'applySeconds' | 'releaseSeconds') => ({
  read: (d: DrivingDefinition) => d[pedalKey][key],
  write: (d: DrivingDocument, value: number): DrivingDocument => ({
    ...d,
    [pedalKey]: { ...d[pedalKey], [key]: value },
  }),
});
const field = <K extends keyof DrivingDefinition>(key: K) => ({
  read: (d: DrivingDefinition) => d[key] as number,
  write: (d: DrivingDocument, value: number): DrivingDocument => ({ ...d, [key]: value }),
});

/** One registry for DEV buttons, HUD lines and grid admission. */
const DRIVING_TUNING_ITEMS: readonly NumericTuningItem[] = Object.freeze([
  item({
    id: 'M',
    group: 'STEERING',
    label: 'M',
    description: 'mechanical road-wheel rack bound',
    unit: '°',
    scale: 1,
    min: 50,
    max: 80,
    step: 5,
    ...field('maxRoadWheelSteerDegrees'),
  }),
  item({
    id: 'D',
    group: 'STEERING',
    label: 'D',
    description: 'maximum driver road-wheel offset',
    unit: '°',
    scale: 1,
    min: 10,
    max: 30,
    step: 1,
    ...field('steeringOffsetDegrees'),
  }),
  item({
    id: 'ACT',
    group: 'STEERING',
    label: 'ACT',
    description: 'symmetric steering traversal time',
    unit: 's',
    scale: 1000,
    min: 200,
    max: 400,
    step: 25,
    ...field('steeringTraversalSeconds'),
  }),
  item({
    id: 'THR+',
    group: 'PEDALS',
    label: 'THR+',
    description: 'throttle apply time',
    unit: 's',
    scale: 1000,
    min: 50,
    max: 500,
    step: 25,
    ...pedal('throttle', 'applySeconds'),
  }),
  item({
    id: 'THR-',
    group: 'PEDALS',
    label: 'THR-',
    description: 'throttle release time',
    unit: 's',
    scale: 1000,
    min: 25,
    max: 500,
    step: 25,
    ...pedal('throttle', 'releaseSeconds'),
  }),
  item({
    id: 'BRK+',
    group: 'PEDALS',
    label: 'BRK+',
    description: 'brake apply time',
    unit: 's',
    scale: 1000,
    min: 50,
    max: 500,
    step: 25,
    ...pedal('brake', 'applySeconds'),
  }),
  item({
    id: 'BRK-',
    group: 'PEDALS',
    label: 'BRK-',
    description: 'brake release time',
    unit: 's',
    scale: 1000,
    min: 25,
    max: 500,
    step: 25,
    ...pedal('brake', 'releaseSeconds'),
  }),
  item({
    id: 'GX',
    group: 'TIRES',
    label: 'GX',
    description: 'longitudinal reference friction',
    unit: '',
    scale: 100,
    min: 200,
    max: 800,
    step: 5,
    ...tire('gripX'),
  }),
  item({
    id: 'PX',
    group: 'TIRES',
    label: 'PX',
    description: 'longitudinal pure-slip plateau start',
    unit: '%',
    scale: 100,
    min: 2,
    max: 40,
    step: 1,
    percent: true,
    ...tire('peakSlipX'),
  }),
  item({
    id: 'GY',
    group: 'TIRES',
    label: 'GY',
    description: 'lateral reference friction',
    unit: '',
    scale: 100,
    min: 100,
    max: 400,
    step: 5,
    ...tire('gripY'),
  }),
  item({
    id: 'PY',
    group: 'TIRES',
    label: 'PY',
    description: 'lateral pure-slip plateau start',
    unit: '%',
    scale: 100,
    min: 2,
    max: 20,
    step: 1,
    percent: true,
    ...tire('peakSlipY'),
  }),
  item({
    id: 'KN',
    group: 'TIRES',
    label: 'KN',
    description: 'normalized radial knee start',
    unit: '',
    scale: 100,
    min: 10,
    max: 95,
    step: 1,
    ...tire('knee'),
  }),
  item({
    id: 'FMEP0',
    group: 'POWERTRAIN',
    label: 'FMEP0',
    description: 'friction mean effective pressure at idle',
    unit: 'bar',
    scale: 10,
    min: 5,
    max: 30,
    step: 1,
    ...field('idleFrictionMeanEffectivePressureBar'),
  }),
  item({
    id: 'FMEP1',
    group: 'POWERTRAIN',
    label: 'FMEP1',
    description: 'friction mean effective pressure at redline',
    unit: 'bar',
    scale: 10,
    min: 10,
    max: 50,
    step: 1,
    ...field('redlineFrictionMeanEffectivePressureBar'),
  }),
  item({
    id: 'J',
    group: 'POWERTRAIN',
    label: 'J',
    description: 'engine inertia per litre (kg m²/L)',
    unit: '',
    scale: 1000,
    min: 10,
    max: 100,
    step: 5,
    ...field('engineInertiaKilogramSquareMetersPerLitre'),
  }),
  item({
    id: 'ETA',
    group: 'POWERTRAIN',
    label: 'ETA',
    description: 'driveline efficiency',
    unit: '',
    scale: 100,
    min: 70,
    max: 100,
    step: 1,
    ...field('drivelineEfficiency'),
  }),
  item({
    id: 'CLU',
    group: 'POWERTRAIN',
    label: 'CLU',
    description: 'clutch capacity factor (× maximum curve torque)',
    unit: '×',
    scale: 10,
    min: 11,
    max: 30,
    step: 1,
    ...field('clutchCapacityFactor'),
  }),
]);

export const DRIVING_TUNING_GROUPS: readonly DrivingTuningGroup[] = Object.freeze([
  'STEERING',
  'PEDALS',
  'TIRES',
  'POWERTRAIN',
]);

// Integer grid ticks: tolerance for decimal definition values converted to ticks (e.g. 0.325*1000).
const TICK_TOLERANCE = 1e-9;

function ticksOf(entry: NumericTuningItem, definition: DrivingDefinition): number {
  const ticks = entry.read(definition) * entry.scale;
  const index = (ticks - entry.min) / entry.step;
  if (
    !Number.isFinite(ticks) ||
    ticks < entry.min - TICK_TOLERANCE ||
    ticks > entry.max + TICK_TOLERANCE ||
    Math.abs(index - Math.round(index)) > TICK_TOLERANCE
  )
    throw new RangeError(`driving value ${entry.id} is outside its DEV grid`);
  return entry.min + Math.round(index) * entry.step;
}

/** The authored definition must lie on every DEV grid; the grids are not its authority. */
export function admitDrivingTuningGrid(definition: DrivingDefinition): void {
  for (const entry of DRIVING_TUNING_ITEMS) ticksOf(entry, definition);
}

/** One grid step, wrapping at the ends; the result is an unadmitted saved-form document. */
export function stepDrivingTuning(definition: DrivingDocument, id: string, direction: -1 | 1): DrivingDocument {
  const entry = tuningItem(id);
  const count = (entry.max - entry.min) / entry.step + 1;
  const index = (ticksOf(entry, definition) - entry.min) / entry.step;
  const next = (((index + direction) % count) + count) % count;
  return entry.write(definition, (entry.min + next * entry.step) / entry.scale);
}

/** Wheel slip protection (TCS, MSR and ABS) is the one switch. */
export function toggleDrivingWheelSlip(definition: DrivingDocument): DrivingDocument {
  return { ...definition, wheelSlip: !definition.wheelSlip };
}

export function formatDrivingTuningValue(id: string, definition: DrivingDefinition): string {
  const entry = tuningItem(id);
  const value = entry.read(definition);
  if (entry.percent) return `${Number((value * 100).toFixed(2))}%`;
  // Ticks fix the decimals; millisecond grids drop a trailing zero (0.30 s, 0.325 s).
  const text = value.toFixed(Math.round(Math.log10(entry.scale)));
  return `${entry.scale >= 1000 && text.endsWith('0') ? text.slice(0, -1) : text}${entry.unit}`;
}

/** HUD line per group, plus the derived automatic-steering budget M-D. */
export function formatDrivingTuningLine(group: DrivingTuningGroup, definition: DrivingDefinition): string {
  const items = DRIVING_TUNING_ITEMS.filter((entry) => entry.group === group)
    .map((entry) => `${entry.label} ${formatDrivingTuningValue(entry.id, definition)}`)
    .join(' ');
  if (group === 'STEERING')
    return `STEER ${items} A ${definition.maxRoadWheelSteerDegrees - definition.steeringOffsetDegrees}°`;
  if (group === 'PEDALS') return `PEDAL ${items}`;
  if (group === 'TIRES') return `TIRE ${items}`;
  return `ENGINE ${items} ASSIST ${definition.wheelSlip ? 'ON' : 'OFF'}`;
}

export function drivingTuningItems(group: DrivingTuningGroup): readonly NumericTuningItem[] {
  return DRIVING_TUNING_ITEMS.filter((entry) => entry.group === group);
}

function tuningItem(id: string): NumericTuningItem {
  const entry = DRIVING_TUNING_ITEMS.find((candidate) => candidate.id === id);
  if (!entry) throw new RangeError(`unknown DEV tuning item: ${id}`);
  return entry;
}
