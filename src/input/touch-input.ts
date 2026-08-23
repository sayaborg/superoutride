import { clampSteering, type DrivingInput } from './driving-input.js';

export function steeringFromPointerX(clientX: number, left: number, width: number): number {
  if (width <= 0) return 0;
  const normalized = (clientX - left) / width;
  return clampSteering(normalized * 2 - 1);
}

type MomentaryKey = 'throttle' | 'brake';

export class TouchInput {
  private steering = 0;
  private steeringPointer: number | null = null;
  private throttlePointers = new Set<number>();
  private brakePointers = new Set<number>();

  constructor(
    private readonly steeringPad: HTMLElement,
    throttleButton: HTMLElement,
    brakeButton: HTMLElement,
  ) {
    this.bindSteering(steeringPad);
    this.bindMomentary(throttleButton, 'throttle');
    this.bindMomentary(brakeButton, 'brake');
  }

  get steeringActive(): boolean {
    return this.steeringPointer !== null;
  }

  sample(): DrivingInput {
    return {
      steering: this.steering,
      throttle: this.throttlePointers.size > 0,
      brake: this.brakePointers.size > 0,
    };
  }

  private bindSteering(element: HTMLElement): void {
    element.addEventListener('pointerdown', (event) => {
      if (this.steeringPointer !== null) return;
      this.steeringPointer = event.pointerId;
      element.setPointerCapture(event.pointerId);
      this.updateSteeringFromPointer(event);
      event.preventDefault();
    });

    element.addEventListener('pointermove', (event) => {
      if (event.pointerId !== this.steeringPointer) return;
      this.updateSteeringFromPointer(event);
      event.preventDefault();
    });

    const release = (event: PointerEvent) => {
      if (event.pointerId !== this.steeringPointer) return;
      this.steeringPointer = null;
      this.steering = 0;
      event.preventDefault();
    };

    element.addEventListener('pointerup', release);
    element.addEventListener('pointercancel', release);
    element.addEventListener('lostpointercapture', (event) => {
      if (event.pointerId === this.steeringPointer) {
        this.steeringPointer = null;
        this.steering = 0;
      }
    });
  }

  private updateSteeringFromPointer(event: PointerEvent): void {
    const rect = this.steeringPad.getBoundingClientRect();
    this.steering = steeringFromPointerX(event.clientX, rect.left, rect.width);
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
