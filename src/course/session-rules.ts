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
