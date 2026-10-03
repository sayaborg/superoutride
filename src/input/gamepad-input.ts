import type { DrivingInputApplyMethod } from '../vehicle/driving-input.js';
import type { DrivingInputPublisher } from './driving-input-publisher.js';
import { createInputOwner, type InputOwner } from './input-owner.js';
import type { PedalChannel } from './pedal-input-arbiter.js';
import { standardGamepads } from './gamepads.js';

/** Stick and trigger magnitudes at or below this are rest; above it they rescale to (0,1]. */
const GAMEPAD_DEADZONE = 0.15;

/**
 * One standard-mapping control. A stick axis or trigger is analog (its rescaled position, DIRECT); a button
 * is digital (full scale while pressed, RATE_LIMITED). A steering control's positive value steers in `sign`'s
 * direction; a pedal control has no direction.
 */
type GamepadControl = {
  readonly input: 'axis' | 'trigger' | 'button';
  readonly index: number;
} & ({ readonly target: 'steering'; readonly sign: -1 | 1 } | { readonly target: PedalChannel });

/** Standard mapping: left stick X and D-pad steer, RT or A accelerates, LT or B brakes. */
const STANDARD_CONTROLS: readonly GamepadControl[] = [
  { input: 'axis', index: 0, target: 'steering', sign: 1 },
  { input: 'button', index: 14, target: 'steering', sign: -1 },
  { input: 'button', index: 15, target: 'steering', sign: 1 },
  { input: 'button', index: 0, target: 'throttle' },
  { input: 'trigger', index: 7, target: 'throttle' },
  { input: 'button', index: 1, target: 'brake' },
  { input: 'trigger', index: 6, target: 'brake' },
];

interface ControlState {
  readonly control: GamepadControl;
  readonly owner: InputOwner;
  /** Whether the control has been seen at rest since its connection or the last reset. */
  armed: boolean;
  /** The value last published and still held, or null. */
  published: number | null;
}

interface ConnectedGamepad {
  readonly id: string;
  readonly controls: readonly ControlState[];
}

/**
 * Gamepad adapter for standard-mapping gamepads: one owner per control of each connected gamepad. Analog
 * controls (stick X, RT, LT) are DIRECT and digital controls (D-pad, A, B) RATE_LIMITED. A control publishes
 * only on change, and after a connection or reset only once it has been seen at rest.
 */
export class GamepadInput {
  private readonly gamepads = new Map<number, ConnectedGamepad>();

  constructor(
    private readonly target: Window,
    private readonly publisher: DrivingInputPublisher,
  ) {
    target.addEventListener('gamepaddisconnected', (event) => this.disconnect(event.gamepad.index));
  }

  /** Read the gamepads once and publish their changes. Without the Gamepad API it does nothing. */
  poll(): void {
    const seen = new Set<number>();
    for (const gamepad of standardGamepads(this.target)) {
      let connected = this.gamepads.get(gamepad.index);
      if (connected !== undefined && connected.id !== gamepad.id) {
        this.disconnect(gamepad.index);
        connected = undefined;
      }
      if (connected === undefined) {
        connected = { id: gamepad.id, controls: STANDARD_CONTROLS.map(createControlState) };
        this.gamepads.set(gamepad.index, connected);
      }
      seen.add(gamepad.index);
      for (const control of connected.controls) this.update(control, gamepad);
    }
    for (const index of this.gamepads.keys()) if (!seen.has(index)) this.disconnect(index);
  }

  /** Every control publishes nothing until it has been seen at rest. */
  reset(): void {
    for (const gamepad of this.gamepads.values()) {
      for (const control of gamepad.controls) {
        control.armed = false;
        control.published = null;
      }
    }
  }

  private update(state: ControlState, gamepad: Gamepad): void {
    const { control } = state;
    const value = controlValue(control, gamepad);
    if (value === 0) {
      if (state.published !== null) this.release(state);
      state.published = null;
      state.armed = true;
      return;
    }
    if (!state.armed || value === state.published) return;
    const accepted =
      control.target === 'steering'
        ? this.publisher.setSteering(state.owner, control.sign * value)
        : this.publisher.setPedal(state.owner, control.target, control.input === 'button' ? true : value);
    if (accepted) state.published = value;
  }

  private release(state: ControlState): void {
    if (state.control.target === 'steering') this.publisher.releaseSteering(state.owner);
    else this.publisher.releasePedal(state.owner);
  }

  private disconnect(index: number): void {
    const gamepad = this.gamepads.get(index);
    if (gamepad === undefined) return;
    for (const control of gamepad.controls) if (control.published !== null) this.release(control);
    this.gamepads.delete(index);
  }
}

function createControlState(control: GamepadControl): ControlState {
  const applyMethod: DrivingInputApplyMethod = control.input === 'button' ? 'RATE_LIMITED' : 'DIRECT';
  return { control, owner: createInputOwner(applyMethod), armed: false, published: null };
}

/** The control's value: an analog position rescaled beyond the deadzone (signed for an axis), or 1 while pressed. */
function controlValue(control: GamepadControl, gamepad: Gamepad): number {
  if (control.input === 'button') return gamepad.buttons[control.index]?.pressed === true ? 1 : 0;
  const raw = control.input === 'axis' ? gamepad.axes[control.index] : gamepad.buttons[control.index]?.value;
  return rescaledPosition(raw ?? 0);
}

function rescaledPosition(value: number): number {
  const magnitude = Math.abs(value);
  if (!(magnitude > GAMEPAD_DEADZONE)) return 0;
  return Math.sign(value) * Math.min(1, (magnitude - GAMEPAD_DEADZONE) / (1 - GAMEPAD_DEADZONE));
}
