/** The window's connected standard-mapping gamepads, read once; empty without the Gamepad API. */
function standardGamepads(target: Window): readonly Gamepad[] {
  const navigator = target.navigator;
  if (typeof navigator?.getGamepads !== 'function') return [];
  return navigator
    .getGamepads()
    .filter((gamepad): gamepad is Gamepad => gamepad !== null && gamepad.connected && gamepad.mapping === 'standard');
}

/**
 * The page's one reader of gamepads: `read()` reads the connected standard-mapping gamepads once for a fixed step, and
 * menu commands and driving input both use that reading (`gamepads`) until the next. Empty before the first read and
 * without the Gamepad API.
 */
export class GamepadReading {
  private current: readonly Gamepad[] = [];

  constructor(private readonly target: Window) {}

  /** Read the gamepads for this fixed step. */
  read(): void {
    this.current = standardGamepads(this.target);
  }

  /** The gamepads of the latest read. */
  get gamepads(): readonly Gamepad[] {
    return this.current;
  }
}
