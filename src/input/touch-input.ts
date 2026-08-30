import type { DrivingInput } from './driving-input.js';
import { PedalInputArbiter } from './pedal-input-arbiter.js';
import { SteeringInputArbiter, type SteeringDirection } from './steering-input-arbiter.js';

type MomentaryKey = 'throttle' | 'brake';

export class TouchInput {
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
    private readonly steering = new SteeringInputArbiter(),
  ) {
    this.steerLeftButton = steerLeftButton;
    this.steerRightButton = steerRightButton;
    this.bindSteeringButton(steerLeftButton, 'left', -1);
    this.bindSteeringButton(steerRightButton, 'right', 1);
    this.bindMomentary(throttleButton, 'throttle');
    this.bindMomentary(brakeButton, 'brake');

    // Pointer capture normally returns the terminal event to the pressed element. Browsers may
    // still end a touch at the window/page boundary without delivering that element event, so the
    // adapter owns one global terminal path as well. This remains the final lifecycle guard after
    // ordinary opposite-source correction has superseded a stale pointer.
    lifecycleTarget.addEventListener('pointerup', (event) => this.releasePointer(event.pointerId), true);
    lifecycleTarget.addEventListener('pointercancel', (event) => this.releasePointer(event.pointerId), true);
    lifecycleTarget.addEventListener('blur', () => this.reset());
    lifecycleTarget.addEventListener('pagehide', () => this.reset());
    visibilityDocument.addEventListener('visibilitychange', () => {
      if (visibilityDocument.visibilityState === 'hidden') this.reset();
    });
  }

  sample(): DrivingInput {
    const pedals = this.pedals.sample();
    this.syncSteeringButtons();
    return {
      steering: this.steering.sample(),
      ...pedals,
    };
  }

  private bindSteeringButton(
    element: HTMLElement,
    side: 'left' | 'right',
    direction: SteeringDirection,
  ): void {
    element.addEventListener('pointerdown', (event) => {
      this.steering.press(touchSteeringSource(side, event.pointerId), direction);
      try {
        element.setPointerCapture(event.pointerId);
      } catch {
        // The global terminal listeners remain authoritative when capture is unavailable or the
        // user agent rejects capture for this pointer.
      }
      this.syncSteeringButtons();
      event.preventDefault();
    });

    const release = (event: PointerEvent) => {
      this.steering.release(touchSteeringSource(side, event.pointerId));
      this.syncSteeringButtons();
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
    this.steering.release(touchSteeringSource('left', pointerId));
    this.steering.release(touchSteeringSource('right', pointerId));
    this.throttlePointers.delete(pointerId);
    this.brakePointers.delete(pointerId);
    this.pedals.setSource(touchPedalSource('throttle', pointerId), 'throttle', false);
    this.pedals.setSource(touchPedalSource('brake', pointerId), 'brake', false);
    this.syncSteeringButtons();
  }

  private reset(): void {
    this.steering.reset();
    this.throttlePointers.clear();
    this.brakePointers.clear();
    this.pedals.reset();
    this.steerLeftButton.classList.remove('active');
    this.steerRightButton.classList.remove('active');
  }

  private syncSteeringButtons(): void {
    const source = this.steering.activeSource();
    this.steerLeftButton.classList.remove('active');
    this.steerRightButton.classList.remove('active');
    if (source?.startsWith('touch:left:')) this.steerLeftButton.classList.add('active');
    if (source?.startsWith('touch:right:')) this.steerRightButton.classList.add('active');
  }
}

function touchSteeringSource(side: 'left' | 'right', pointerId: number): string {
  return `touch:${side}:${pointerId}`;
}

function touchPedalSource(key: MomentaryKey, pointerId: number): string {
  return `touch:${key}:${pointerId}`;
}
