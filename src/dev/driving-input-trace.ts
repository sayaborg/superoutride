import {
  assertExclusivePedalInput,
  drivingInputApplyMode,
  normalizedPedalRequest,
  type DrivingInput,
  type DrivingInputApplyMode,
  type PedalRequest,
} from '../input/driving-input.js';

export const DRIVING_INPUT_TRACE_FORMAT = 'SUPER_OUTRIDE_INPUT_TRACE_V1' as const;

export interface DrivingInputRun {
  readonly ticks: number;
  readonly input: Readonly<DrivingInput>;
}

export interface DrivingInputTrace {
  readonly format: typeof DRIVING_INPUT_TRACE_FORMAT;
  readonly dt: number;
  readonly runs: DrivingInputRun[];
}

export function createDrivingInputTrace(dt: number): DrivingInputTrace {
  if (!(dt > 0) || !Number.isFinite(dt)) throw new RangeError('trace dt must be finite and > 0');
  return { format: DRIVING_INPUT_TRACE_FORMAT, dt, runs: [] };
}

/** Append canonical driver commands using simple run-length encoding. */
export function appendDrivingInput(
  trace: DrivingInputTrace,
  input: DrivingInput,
  ticks = 1,
): void {
  validateInput(input);
  if (!Number.isInteger(ticks) || ticks < 1) throw new RangeError('trace ticks must be an integer >= 1');

  const normalized = cloneInput(input);
  const previous = trace.runs[trace.runs.length - 1];
  if (previous && sameInput(previous.input, normalized)) {
    trace.runs[trace.runs.length - 1] = {
      ticks: previous.ticks + ticks,
      input: previous.input,
    };
    return;
  }
  trace.runs.push({ ticks, input: normalized });
}

export function drivingInputTraceTickCount(trace: DrivingInputTrace): number {
  return trace.runs.reduce((sum, run) => sum + run.ticks, 0);
}

export function visitDrivingInputTrace(
  trace: DrivingInputTrace,
  visitor: (input: Readonly<DrivingInput>, tick: number) => void,
): void {
  validateTrace(trace);
  let tick = 0;
  for (const run of trace.runs) {
    for (let i = 0; i < run.ticks; i += 1) {
      visitor(run.input, tick);
      tick += 1;
    }
  }
}

export function serializeDrivingInputTrace(trace: DrivingInputTrace): string {
  validateTrace(trace);
  return JSON.stringify(trace);
}

export function parseDrivingInputTrace(json: string): DrivingInputTrace {
  const parsed = JSON.parse(json) as unknown;
  if (typeof parsed !== 'object' || parsed === null) throw new TypeError('trace JSON must be an object');
  const candidate = parsed as Partial<DrivingInputTrace>;
  if (candidate.format !== DRIVING_INPUT_TRACE_FORMAT) throw new RangeError('unsupported driving input trace format');
  if (!(typeof candidate.dt === 'number' && candidate.dt > 0 && Number.isFinite(candidate.dt))) {
    throw new RangeError('trace dt must be finite and > 0');
  }
  if (!Array.isArray(candidate.runs)) throw new TypeError('trace runs must be an array');

  const trace = createDrivingInputTrace(candidate.dt);
  for (const rawRun of candidate.runs) {
    if (typeof rawRun !== 'object' || rawRun === null) throw new TypeError('trace run must be an object');
    const run = rawRun as { ticks?: unknown; input?: unknown };
    if (!Number.isInteger(run.ticks) || (run.ticks as number) < 1) {
      throw new RangeError('trace run ticks must be an integer >= 1');
    }
    if (typeof run.input !== 'object' || run.input === null) throw new TypeError('trace run input must be an object');
    const input = run.input as {
      steering?: unknown;
      throttle?: unknown;
      brake?: unknown;
      steeringApplyMode?: unknown;
      pedalApplyMode?: unknown;
    };
    if (typeof input.steering !== 'number'
      || !isPedalRequest(input.throttle)
      || !isPedalRequest(input.brake)
      || !isApplyMode(input.steeringApplyMode)
      || !isApplyMode(input.pedalApplyMode)) {
      throw new TypeError('trace run input has invalid fields');
    }
    appendDrivingInput(trace, {
      steering: input.steering,
      throttle: input.throttle,
      brake: input.brake,
      steeringApplyMode: input.steeringApplyMode,
      pedalApplyMode: input.pedalApplyMode,
    }, run.ticks as number);
  }
  return trace;
}

function validateTrace(trace: DrivingInputTrace): void {
  if (trace.format !== DRIVING_INPUT_TRACE_FORMAT) throw new RangeError('unsupported driving input trace format');
  if (!(trace.dt > 0) || !Number.isFinite(trace.dt)) throw new RangeError('trace dt must be finite and > 0');
  for (const run of trace.runs) {
    if (!Number.isInteger(run.ticks) || run.ticks < 1) throw new RangeError('trace run ticks must be an integer >= 1');
    validateInput(run.input);
  }
}

function validateInput(input: Readonly<DrivingInput>): void {
  if (!Number.isFinite(input.steering) || input.steering < -1 || input.steering > 1) {
    throw new RangeError('trace steering must be finite and in [-1, +1]');
  }
  normalizedPedalRequest(input.throttle);
  normalizedPedalRequest(input.brake);
  drivingInputApplyMode(input.steeringApplyMode);
  drivingInputApplyMode(input.pedalApplyMode);
  assertExclusivePedalInput(input);
}

function cloneInput(input: Readonly<DrivingInput>): Readonly<DrivingInput> {
  return {
    steering: input.steering,
    throttle: input.throttle,
    brake: input.brake,
    steeringApplyMode: input.steeringApplyMode,
    pedalApplyMode: input.pedalApplyMode,
  };
}

function sameInput(a: Readonly<DrivingInput>, b: Readonly<DrivingInput>): boolean {
  return a.steering === b.steering
    && a.throttle === b.throttle
    && a.brake === b.brake
    && a.steeringApplyMode === b.steeringApplyMode
    && a.pedalApplyMode === b.pedalApplyMode;
}

function isPedalRequest(value: unknown): value is PedalRequest {
  return typeof value === 'boolean'
    || (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1);
}

function isApplyMode(value: unknown): value is DrivingInputApplyMode | undefined {
  return value === undefined || value === 'RATE_LIMITED' || value === 'DIRECT';
}
