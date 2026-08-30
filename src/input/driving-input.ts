export interface PedalInput {
  readonly throttle: boolean;
  readonly brake: boolean;
}

export interface DrivingInput {
  /** Device-independent normalized driver request; response state belongs to vehicle mechanics. */
  steering: number;
  /** Canonical pedals are mutually exclusive; device event order is resolved before publication. */
  throttle: boolean;
  brake: boolean;
}

export function clampSteering(value: number): number {
  return Math.max(-1, Math.min(1, value));
}

/** Validate the canonical one-hot pedal contract without inventing event order downstream. */
export function assertExclusivePedalInput(input: PedalInput): void {
  if (input.throttle && input.brake) {
    throw new RangeError('canonical throttle and brake requests must be mutually exclusive');
  }
}
