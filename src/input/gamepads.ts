/** The window's connected standard-mapping gamepads, read once; empty without the Gamepad API. */
export function standardGamepads(target: Window): readonly Gamepad[] {
  const navigator = target.navigator;
  if (typeof navigator?.getGamepads !== 'function') return [];
  return navigator
    .getGamepads()
    .filter((gamepad): gamepad is Gamepad => gamepad !== null && gamepad.connected && gamepad.mapping === 'standard');
}
