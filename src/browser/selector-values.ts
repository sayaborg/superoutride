const SELECTOR_VALUE_TOLERANCE = 1e-12;

/** Presentation equality only; never used for mechanics or coordinate decisions. */
export function sameSelectorValue(a: number, b: number): boolean {
  return Math.abs(a - b) < SELECTOR_VALUE_TOLERANCE;
}

export function cycleSelectorChoice<Value>(
  choices: readonly Value[],
  current: number,
  value: (choice: Value) => number,
): Value {
  const index = choices.findIndex((choice) => sameSelectorValue(value(choice), current));
  const next = choices[(index + 1) % choices.length];
  if (next === undefined) throw new RangeError('selector choices must not be empty');
  return next;
}
