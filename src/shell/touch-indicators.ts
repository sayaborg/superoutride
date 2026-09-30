import type { TouchObservation } from '../input/touch-input.js';

export interface TouchIndicators {
  /** Draw each role's indicator from the touch observation; an inactive role hides its indicator. */
  update(observation: TouchObservation): void;
}

/** The touch origin/vector indicators, drawn by the shell from the input manager's touch observation. */
export function createTouchIndicators(documentRef: Document): TouchIndicators {
  const steering = createIndicator(documentRef, 'steering');
  const pedal = createIndicator(documentRef, 'pedal');
  // Observations are immutable and replaced on change, so an unchanged reference needs no redraw.
  let drawn: TouchObservation | null = null;
  return {
    update(observation) {
      if (observation === drawn) return;
      drawn = observation;
      const s = observation.steering;
      if (s === null) hideIndicator(steering);
      else
        showIndicator(
          steering,
          s.originX,
          s.originY,
          s.vectorLength,
          s.request < 0 ? 180 : 0,
          `STEER ${Math.round(s.request * 100)}%`,
        );
      const p = observation.pedal;
      if (p === null) hideIndicator(pedal);
      else
        showIndicator(
          pedal,
          p.originX,
          p.originY,
          p.vectorLength,
          p.pedal === 'brake' && p.request > 0 ? 90 : -90,
          p.request > 0 ? `${p.pedal === 'throttle' ? 'ACCEL' : 'BRAKE'} ${Math.round(p.request * 100)}%` : 'PEDAL 0%',
        );
    },
  };
}

function createIndicator(documentRef: Document, role: 'steering' | 'pedal'): HTMLElement {
  const root = documentRef.createElement('div');
  root.className = `touch-analog-indicator touch-analog-${role}`;
  root.setAttribute('aria-hidden', 'true');
  const icon = documentRef.createElement('span');
  icon.className = 'touch-analog-origin-icon';
  const vector = documentRef.createElement('span');
  vector.className = 'touch-analog-vector';
  root.append(icon, vector);
  documentRef.body.appendChild(root);
  return root;
}

function showIndicator(
  indicator: HTMLElement,
  x: number,
  y: number,
  distance: number,
  angleDegrees: number,
  label: string,
): void {
  indicator.style.setProperty('--touch-origin-x', `${x}px`);
  indicator.style.setProperty('--touch-origin-y', `${y}px`);
  indicator.style.setProperty('--touch-vector-length', `${Math.max(0, distance)}px`);
  indicator.style.setProperty('--touch-vector-angle', `${angleDegrees}deg`);
  indicator.dataset.value = label;
  indicator.classList.add('active');
}

function hideIndicator(indicator: HTMLElement): void {
  indicator.classList.remove('active');
}
