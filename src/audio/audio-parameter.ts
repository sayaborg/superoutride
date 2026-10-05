// Detect once per parameter; weak ownership does not retain disposed graphs.
const holders = new WeakMap<AudioParam, (time: number) => void>();

/** Cancel scheduled values after `now` and hold the value `param` has then. */
export function hold(param: AudioParam, now: number): void {
  let held = holders.get(param);
  if (!held) {
    const nativeHold = param.cancelAndHoldAtTime;
    held =
      typeof nativeHold === 'function'
        ? nativeHold.bind(param)
        : (time) => {
            // Read before cancellation: value is the currently evaluated automation value,
            // not the previous target. This fallback is for current-time retargeting only.
            const current = param.value;
            param.cancelScheduledValues(time);
            param.setValueAtTime(current, time);
          };
    holders.set(param, held);
  }
  held(now);
}

/** Retarget at currentTime while bounding scheduled events and preserving the current value. */
export function follow(param: AudioParam, value: number, now: number, tau: number): void {
  hold(param, now);
  param.setTargetAtTime(value, now, tau);
}
