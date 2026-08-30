import type { DrivingInput } from './driving-input.js';
import { PedalInputArbiter } from './pedal-input-arbiter.js';

export function digitalTouchSteering(left: boolean, right: boolean): -1 | 0 | 1 {
  return left === right ? 0 : left ? -1 : 1;
}

type MomentaryKey = 'throttle' | 'brake';

export class TouchInput {
  private leftPointers = new Set<number>();
  private rightPointers = new Set<number>();
  private throttlePointers = new Set<number>();
  private brakePointers = new Set<number>();
  private readonly steerLeftButton: HTMLElement;
  private readonly steerRightButton: HTMLElement;

  constructor(
    steerLeftButton: HTMLElement,
    steerRightButton: HTMLElement,
    throttleButton: HTMLElement,
    brakeButton: HTMLElement,
    lifecycleTarget: Window = window,
    visibilityDocument: Document = document,
    private readonly pedals = new PedalInputArbiter(),
  ) {
    this.steerLeftButton = steerLeftButton;
    this.steerRightButton = steerRightButton;
    this.bindSteeringButton(steerLeftButton, this.leftPointers);
    this.bindSteeringButton(steerRightButton, this.rightPointers);
    this.bindMomentary(throttleButton, 'throttle');
    this.bindMomentary(brakeButton, 'brake');

    // Pointer capture normally returns the terminal event to the pressed element. Browsers may
    // still end a touch at the window/page boundary without delivering that element event, so the
    // adapter owns one global terminal path as well. Otherwise a stale pointer id permanently wins
    // the device merge as a held LEFT or RIGHT request.
    lifecycleTarget.addEventListener('pointerup', (event) => this.releasePointer(event.pointerId), true);
    lifecycleTarget.addEventListener('pointercancel', (event) => this.releasePointer(event.pointerId), true);
    lifecycleTarget.addEventListener('blur', () => this.reset());
    lifecycleTarget.addEventListener('pagehide', () => this.reset());
    visibilityDocument.addEventListener('visibilitychange', () => {
      if (visibilityDocument.visibilityState === 'hidden') this.reset();
    });
  }

  get steeringActive(): boolean {
    return this.leftPointers.size > 0 || this.rightPointers.size > 0;
  }

  sample(): DrivingInput {
    const pedals = this.pedals.sample();
    return {
      steering: digitalTouchSteering(this.leftPointers.size > 0, this.rightPointers.size > 0),
      ...pedals,
    };
  }

  private bindSteeringButton(element: HTMLElement, pointers: Set<number>): void {
    element.addEventListener('pointerdown', (event) => {
      pointers.add(event.pointerId);
      try {
        element.setPointerCapture(event.pointerId);
      } catch {
        // The global terminal listeners remain authoritative when capture is unavailable or the
        // user agent rejects capture for this pointer.
      }
      element.classList.add('active');
      event.preventDefault();
    });

    const release = (event: PointerEvent) => {
      pointers.delete(event.pointerId);
      if (pointers.size === 0) element.classList.remove('active');
      event.preventDefault();
    };

    element.addEventListener('pointerup', release);
    element.addEventListener('pointercancel', release);
    element.addEventListener('lostpointercapture', (event) => {
      this.releasePointer(event.pointerId);
    });
  }

  private bindMomentary(element: HTMLElement, key: MomentaryKey): void {
    const pointers = key === 'throttle' ? this.throttlePointers : this.brakePointers;

    element.addEventListener('pointerdown', (event) => {
      pointers.add(event.pointerId);
      this.pedals.setSource(touchPedalSource(key, event.pointerId), key, true);
      try {
        element.setPointerCapture(event.pointerId);
      } catch {
        // See the steering-button path above; window/page lifecycle remains the fallback.
      }
      event.preventDefault();
    });

    const release = (event: PointerEvent) => {
      pointers.delete(event.pointerId);
      this.pedals.setSource(touchPedalSource(key, event.pointerId), key, false);
      event.preventDefault();
    };

    element.addEventListener('pointerup', release);
    element.addEventListener('pointercancel', release);
    element.addEventListener('lostpointercapture', (event) => {
      this.releasePointer(event.pointerId);
    });
  }

  private releasePointer(pointerId: number): void {
    this.leftPointers.delete(pointerId);
    this.rightPointers.delete(pointerId);
    this.throttlePointers.delete(pointerId);
    this.brakePointers.delete(pointerId);
    this.pedals.setSource(touchPedalSource('throttle', pointerId), 'throttle', false);
    this.pedals.setSource(touchPedalSource('brake', pointerId), 'brake', false);
    if (this.leftPointers.size === 0) this.steerLeftButton.classList.remove('active');
    if (this.rightPointers.size === 0) this.steerRightButton.classList.remove('active');
  }

  private reset(): void {
    this.leftPointers.clear();
    this.rightPointers.clear();
    this.throttlePointers.clear();
    this.brakePointers.clear();
    this.pedals.reset();
    this.steerLeftButton.classList.remove('active');
    this.steerRightButton.classList.remove('active');
  }
}

function touchPedalSource(key: MomentaryKey, pointerId: number): string {
  return `touch:${key}:${pointerId}`;
}
