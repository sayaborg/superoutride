/** At most sixteen competitors take part in a Session, the player included. */
const COMPETITORS = 16;

/** Product Session rules, shared by series, runtime admission and controls; rivals are the competitors but one. */
export const SESSION_RULE_LIMITS = Object.freeze({
  competitors: COMPETITORS,
  rivals: COMPETITORS - 1,
  laps: 99,
  timeMargin: 10,
  /** Traffic vehicles present at once. */
  traffic: 16,
  /** Vehicles in a Session at once: competitors and traffic. */
  vehicles: 32,
  /** Traffic density ceiling in vehicles per kilometre: one position every 25 m. */
  trafficDensity: 40,
});

/**
 * A Session's traffic: positions along the Route at `density` vehicles per kilometre, each a vehicle drawn from
 * `vehicles` (vehicle IDs) driving at the one traffic speed `speedKilometersPerHour`, as on a public road.
 */
export interface TrafficSettings {
  readonly density: number;
  readonly vehicles: readonly string[];
  readonly speedKilometersPerHour: number;
}

/**
 * Validate traffic settings' own domain, the speed within `maximumSpeedKilometersPerHour` (the product's vehicle speed
 * bound, which the vehicle layer owns); the vehicle IDs resolve where the vehicle catalog is known.
 */
export function compileTrafficSettings(
  settings: TrafficSettings,
  maximumSpeedKilometersPerHour: number,
): TrafficSettings {
  if (!(settings.density > 0 && settings.density <= SESSION_RULE_LIMITS.trafficDensity))
    throw new RangeError(`traffic density must lie in (0, ${SESSION_RULE_LIMITS.trafficDensity}] vehicles per km`);
  if (!(settings.speedKilometersPerHour > 0 && settings.speedKilometersPerHour <= maximumSpeedKilometersPerHour))
    throw new RangeError(`traffic speed must lie in (0, ${maximumSpeedKilometersPerHour}] km/h`);
  if (!Array.isArray(settings.vehicles) || settings.vehicles.length === 0)
    throw new RangeError('traffic needs at least one vehicle');
  if (new Set(settings.vehicles).size !== settings.vehicles.length)
    throw new RangeError('traffic vehicles must be unique');
  return Object.freeze({
    density: settings.density,
    vehicles: Object.freeze([...settings.vehicles]),
    speedKilometersPerHour: settings.speedKilometersPerHour,
  });
}
