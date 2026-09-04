import {
  assertEngineTorqueMultiplier,
  setEngineTorqueMultiplier,
  type AutomaticPowertrainState,
} from '../physics/automatic-powertrain.js';

/** Browser-only diagnostic choices. Physics owns the one numeric multiplier, not these IDs. */
export const BROWSER_ENGINE_POWER_MULTIPLIERS = Object.freeze([1, 1.5, 2, 3, 4] as const);
export const BROWSER_ENGINE_POWER_CYCLE_CODE = 'KeyK';

export function formatEnginePowerValue(multiplier: number): string {
  assertEngineTorqueMultiplier(multiplier);
  return multiplier.toFixed(1);
}

export function formatEnginePowerSelector(multiplier: number): string {
  return `ENG [K] x${formatEnginePowerValue(multiplier)}`;
}

export function nextEnginePowerMultiplier(current: number): number {
  assertEngineTorqueMultiplier(current);
  return BROWSER_ENGINE_POWER_MULTIPLIERS.find((value) => value > current + 1e-12)
    ?? BROWSER_ENGINE_POWER_MULTIPLIERS[0];
}

export interface BrowserEnginePowerControls {
  handleKey(code: string): boolean;
}

/**
 * Appends one engine button after the tire buttons in the shared calibration row.
 * The tire adapter owns only its own three buttons; neither adapter replaces the other's state.
 * Both keyboard and touch read the current vehicle on every action, including after replacement.
 */
export function mountBrowserEnginePowerControls(
  container: HTMLElement,
  getVehicle: () => { readonly powertrain: AutomaticPowertrainState },
  documentRef: Document = document,
): BrowserEnginePowerControls {
  const button = documentRef.createElement('button');
  button.type = 'button';
  button.className = 'selector-button engine-power-button';

  function refresh(): void {
    const value = formatEnginePowerValue(getVehicle().powertrain.engineTorqueMultiplier);
    button.textContent = `ENG x${value}`;
    button.setAttribute('aria-label', `Cycle engine torque multiplier from current ${value} times`);
  }

  function cycle(): void {
    const powertrain = getVehicle().powertrain;
    setEngineTorqueMultiplier(powertrain, nextEnginePowerMultiplier(powertrain.engineTorqueMultiplier));
    refresh();
  }

  button.addEventListener('click', cycle);
  container.appendChild(button);
  refresh();
  return Object.freeze({
    handleKey(code: string): boolean {
      if (code !== BROWSER_ENGINE_POWER_CYCLE_CODE) return false;
      cycle();
      return true;
    },
  });
}
