export const TOUCH_INTERFACE_MAX_SHORT_SIDE_PX = 720;

export function isTouchInterface(
  maxTouchPoints: number,
  coarsePointer: boolean,
  viewportWidth: number,
  viewportHeight: number,
): boolean {
  return maxTouchPoints > 0
    || coarsePointer
    || Math.min(viewportWidth, viewportHeight) <= TOUCH_INTERFACE_MAX_SHORT_SIDE_PX;
}

export function browserUsesTouchInterface(): boolean {
  return isTouchInterface(
    navigator.maxTouchPoints,
    matchMedia('(pointer: coarse)').matches,
    window.innerWidth,
    window.innerHeight,
  );
}
