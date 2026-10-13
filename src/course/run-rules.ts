/** At most sixteen competitors take part in a run, the player included. */
const COMPETITORS = 16;

/** Product run rules, shared by series, runtime admission and controls; rivals are the competitors but one. */
export const RUN_RULE_LIMITS = Object.freeze({
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
 * A run's traffic: positions along the Route at `density` vehicles per kilometre, each a vehicle drawn from
 * `vehicles` (vehicle IDs) driving at the one traffic speed `speedKilometersPerHour`, as on a public road.
 */
export interface TrafficSettings {
  readonly density: number;
  readonly vehicles: readonly string[];
  readonly speedKilometersPerHour: number;
}
