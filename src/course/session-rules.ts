/** At most sixteen competitors take part in a Session, the player included. */
const COMPETITORS = 16;

/** Product Session rules, shared by series, runtime admission and controls; rivals are the competitors but one. */
export const SESSION_RULE_LIMITS = Object.freeze({
  competitors: COMPETITORS,
  rivals: COMPETITORS - 1,
  laps: 99,
  timeMargin: 10,
  /** Traffic vehicles present at once. */
  traffic: 8,
  /** Vehicles in a Session at once: competitors and traffic. */
  vehicles: 24,
  /** Traffic density ceiling in vehicles per kilometre: one position every 25 m. */
  trafficDensity: 40,
});

/**
 * A Session's traffic: positions along the Route at `density` vehicles per kilometre, each a vehicle drawn from
 * `vehicles` (vehicle IDs) driving at no more than `speed` of its own maximum speed.
 */
export interface TrafficSettings {
  readonly density: number;
  readonly vehicles: readonly string[];
  readonly speed: number;
}

/** Validate traffic settings' own domain; the vehicle IDs resolve where the vehicle catalog is known. */
export function compileTrafficSettings(settings: TrafficSettings): TrafficSettings {
  if (!(settings.density > 0 && settings.density <= SESSION_RULE_LIMITS.trafficDensity))
    throw new RangeError(`traffic density must lie in (0, ${SESSION_RULE_LIMITS.trafficDensity}] vehicles per km`);
  if (!(settings.speed > 0 && settings.speed <= 1)) throw new RangeError('traffic speed must lie in (0, 1]');
  if (!Array.isArray(settings.vehicles) || settings.vehicles.length === 0)
    throw new RangeError('traffic needs at least one vehicle');
  if (new Set(settings.vehicles).size !== settings.vehicles.length)
    throw new RangeError('traffic vehicles must be unique');
  return Object.freeze({
    density: settings.density,
    vehicles: Object.freeze([...settings.vehicles]),
    speed: settings.speed,
  });
}
