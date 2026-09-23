export type PedalRequest = boolean | number;
export type DrivingInputApplyMethod = 'RATE_LIMITED' | 'DIRECT';

export interface PedalInput {
  readonly throttle: PedalRequest;
  readonly brake: PedalRequest;
}

export interface DrivingInput {
  /** Device-independent normalized driver request; response state belongs to vehicle mechanics. */
  steering: number;
  /**
   * Canonical pedals are mutually exclusive. Digital devices may publish boolean shorthand while
   * analog devices publish a normalized request in [0,1]. Both forms have one identical meaning
   * after normalizedPedalRequest().
   */
  throttle: PedalRequest;
  brake: PedalRequest;
  /**
   * RATE_LIMITED is the ordinary keyboard/AI behavior. DIRECT is used only while an analog touch
   * pointer is actively held so displacement itself is the actuator amount; after pointer release
   * the publisher returns to RATE_LIMITED neutral and the existing releaseRate owns decay.
   */
  readonly steeringApplyMethod?: DrivingInputApplyMethod;
  readonly pedalApplyMethod?: DrivingInputApplyMethod;
}

export function clampSteering(value: number): number {
  if (!Number.isFinite(value)) throw new RangeError('steering input value must be finite');
  return Math.max(-1, Math.min(1, value));
}

export function normalizedPedalRequest(request: PedalRequest): number {
  if (typeof request === 'boolean') return request ? 1 : 0;
  if (!Number.isFinite(request) || request < 0 || request > 1) {
    throw new RangeError('canonical pedal request must be boolean shorthand or finite in [0,1]');
  }
  return request;
}

export function drivingInputApplyMethod(method: DrivingInputApplyMethod | undefined): DrivingInputApplyMethod {
  if (method === undefined || method === 'RATE_LIMITED') return 'RATE_LIMITED';
  if (method === 'DIRECT') return method;
  throw new RangeError(`unsupported driving input apply method: ${String(method)}`);
}

/** Validate the canonical exclusive pedal contract without inventing event order downstream. */
export function assertExclusivePedalInput(input: PedalInput): void {
  const throttle = normalizedPedalRequest(input.throttle);
  const brake = normalizedPedalRequest(input.brake);
  if (throttle > 0 && brake > 0) {
    throw new RangeError('canonical throttle and brake requests must be mutually exclusive');
  }
}
