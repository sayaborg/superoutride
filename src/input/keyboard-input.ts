import type { DrivingInputPublisher } from './driving-input-publisher.js';
import { createInputOwner, type InputOwner } from './input-owner.js';
import type { PedalChannel } from './pedal-input-arbiter.js';

type DrivingKeyAction =
  { readonly kind: 'steering'; readonly direction: -1 | 1 } | { readonly kind: 'pedal'; readonly pedal: PedalChannel };

/** Driving aliases owned by the input adapter. */
const DRIVING_KEYS: ReadonlyMap<string, DrivingKeyAction> = new Map<string, DrivingKeyAction>([
  ['ArrowLeft', { kind: 'steering', direction: -1 }],
  ['ArrowRight', { kind: 'steering', direction: 1 }],
  ['ArrowUp', { kind: 'pedal', pedal: 'throttle' }],
  ['KeyX', { kind: 'pedal', pedal: 'throttle' }],
  ['ArrowDown', { kind: 'pedal', pedal: 'brake' }],
  ['KeyZ', { kind: 'pedal', pedal: 'brake' }],
]);

interface DrivingKey {
  readonly owner: InputOwner;
  readonly action: DrivingKeyAction;
}

/**
 * Keyboard adapter: each driving key is one RATE_LIMITED owner, set on keydown and released on keyup.
 * It holds no state of its own beyond its owners.
 */
export class KeyboardInput {
  private readonly keys = new Map<string, DrivingKey>();

  constructor(
    target: Window,
    private readonly publisher: DrivingInputPublisher,
  ) {
    for (const [code, action] of DRIVING_KEYS) this.keys.set(code, { owner: createInputOwner('RATE_LIMITED'), action });
    target.addEventListener('keydown', (event) => this.onKey(event, true), { passive: false });
    target.addEventListener('keyup', (event) => this.onKey(event, false), { passive: false });
  }

  private onKey(event: KeyboardEvent, down: boolean): void {
    if (down && event.repeat) return;
    const key = this.keys.get(event.code);
    if (key === undefined) return;
    const { owner, action } = key;
    let accepted: boolean;
    if (action.kind === 'steering') {
      accepted = down ? this.publisher.setSteering(owner, action.direction) : this.publisher.releaseSteering(owner);
    } else {
      accepted = down ? this.publisher.setPedal(owner, action.pedal, true) : this.publisher.releasePedal(owner);
    }
    if (accepted) event.preventDefault();
  }
}
