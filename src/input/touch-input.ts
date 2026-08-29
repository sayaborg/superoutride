import type { DrivingInput } from './driving-input.js';

export function digitalTouchSteering(left: boolean, right: boolean): -1 | 0 | 1 {
  return left === right ? 0 : left ? -1 : 1;
}

type MomentaryKey = 'throttle' | 'brake';

export class TouchInput {
  private leftPointers = new Set<number>();
  private rightPointers = new Set<number>();
  private throttlePointers = new Set<number>();
  private brakePointers = new Set<number>();

  constructor(
    steerLeftButton: HTMLElement,
    steerRightButton: HTMLElement,
    throttleButton: HTMLElement,
    brakeButton: HTMLElement,
  ) {
    this.bindSteeringButton(steerLeftButton, this.leftPointers);
    this.bindSteeringButton(steerRightButton, this.rightPointers);
    this.bindMomentary(throttleButton, 'throttle');
    this.bindMomentary(brakeButton, 'brake');
  }

  get steeringActive(): boolean {
    return this.leftPointers.size > 0 || this.rightPointers.size > 0;
  }

  sample(): DrivingInput {
    return {
      steering: digitalTouchSteering(this.leftPointers.size > 0, this.rightPointers.size > 0),
      throttle: this.throttlePointers.size > 0,
      brake: this.brakePointers.size > 0,
    };
  }

  private bindSteeringButton(element: HTMLElement, pointers: Set<number>): void {
    element.addEventListener('pointerdown', (event) => {
      pointers.add(event.pointerId);
      element.setPointerCapture(event.pointerId);
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
      pointers.delete(event.pointerId);
      if (pointers.size === 0) element.classList.remove('active');
    });
  }

  private bindMomentary(element: HTMLElement, key: MomentaryKey): void {
    const pointers = key === 'throttle' ? this.throttlePointers : this.brakePointers;

    element.addEventListener('pointerdown', (event) => {
      pointers.add(event.pointerId);
      element.setPointerCapture(event.pointerId);
      event.preventDefault();
    });

    const release = (event: PointerEvent) => {
      pointers.delete(event.pointerId);
      event.preventDefault();
    };

    element.addEventListener('pointerup', release);
    element.addEventListener('pointercancel', release);
    element.addEventListener('lostpointercapture', (event) => {
      pointers.delete(event.pointerId);
    });
  }
}
