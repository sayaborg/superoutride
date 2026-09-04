export type PedalRequest = boolean | number;

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
}

export function clampSteering(value: number): number {
  return Math.max(-1, Math.min(1, value));
}

export function normalizedPedalRequest(request: PedalRequest): number {
  if (typeof request === 'boolean') return request ? 1 : 0;
  if (!Number.isFinite(request) || request < 0 || request > 1) {
    throw new RangeError('canonical pedal request must be boolean shorthand or finite in [0,1]');
  }
  return request;
}

/** Validate the canonical exclusive pedal contract without inventing event order downstream. */
export function assertExclusivePedalInput(input: PedalInput): void {
  const throttle = normalizedPedalRequest(input.throttle);
  const brake = normalizedPedalRequest(input.brake);
  if (throttle > 0 && brake > 0) {
    throw new RangeError('canonical throttle and brake requests must be mutually exclusive');
  }
}
