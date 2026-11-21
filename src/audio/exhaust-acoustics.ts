// Physical assumptions of the derived values, not measured vehicle data. References and limits: docs/audio.md.
export const REFLECTION_REFERENCE = Object.freeze({
  temperatureK: 573.15, // assumed 300 C air surrogate, not exhaust composition
  pressurePa: 101325,
});
// The cylinder's blowdown: its gas when the exhaust valve opens and its valve's discharge coefficient.
export const BLOWDOWN_REFERENCE = Object.freeze({
  temperatureK: 1100, // cylinder gas at exhaust valve opening; petrol engines typically 1000-1300 K
  dischargeCoefficient: 0.65, // exhaust valve flow coefficient; measured exhaust valves 0.6-0.7 at working lift
});
const AIR = Object.freeze({ gamma: 1.4, gasConstant: 287, prandtl: 0.71 });

/**
 * The exhaust kernel's gas: physical assumptions, none chosen by listening. The tubes' gas is `REFLECTION_REFERENCE`'s
 * (it sets the waves' speed and is the unit of density), the burned charge's and the valve's `BLOWDOWN_REFERENCE`'s.
 */
export const GAS = Object.freeze({
  gamma: AIR.gamma,
  /** A wave's speed grows by this times its value, (gamma + 1) / 2. */
  steepening: (AIR.gamma + 1) / 2,
  /** A choked throat's flow, (2 / (gamma + 1))^((gamma + 1) / (2 (gamma - 1))) to four places. */
  choked: 0.5787,
  pipeKelvin: REFLECTION_REFERENCE.temperatureK,
  /** The charge a cylinder draws, and lets out unburned. */
  intakeKelvin: 293.15,
  burnedKelvin: BLOWDOWN_REFERENCE.temperatureK,
  discharge: BLOWDOWN_REFERENCE.dischargeCoefficient,
  /** The share of a full charge a cylinder draws with the throttle shut: what the closed intake keeps of its pressure. */
  closedCharge: 0.3,
});
const waveSpeed = Math.round(Math.sqrt(AIR.gamma * AIR.gasConstant * REFLECTION_REFERENCE.temperatureK));
// Sutherland air viscosity (Pa s), then ideal-gas density. No running gas simulation.
const viscosity =
  (1.716e-5 * (REFLECTION_REFERENCE.temperatureK / 273) ** 1.5 * (273 + 111)) /
  (REFLECTION_REFERENCE.temperatureK + 111);
const density = REFLECTION_REFERENCE.pressurePa / (AIR.gasConstant * REFLECTION_REFERENCE.temperatureK);
// Kirchhoff thin-boundary-layer wall loss: alpha(f) = WALL_LOSS * sqrt(f) / radius, in Np/m.
const WALL_LOSS =
  (Math.sqrt((Math.PI * viscosity) / density) / waveSpeed) * (1 + (AIR.gamma - 1) / Math.sqrt(AIR.prandtl));

/**
 * The cutoff of the one-pole low-pass on an open end's return, `c/(2*pi*radius)` for a tube of `diameter`: its magnitude
 * matches |R| ~ 1 - (ka)^2/2 at low frequency, NOT the end correction's phase.
 */
export function openEndCutoffHz(diameter: number): number {
  return waveSpeed / (Math.PI * diameter);
}

/** One traversal's Kirchhoff wall loss `alpha(f)*length` in nepers at `hz`, for a tube of `length` and `diameter`. */
export function wallLossNepers(length: number, diameter: number, hz: number): number {
  return (WALL_LOSS * Math.sqrt(hz) * length) / (diameter / 2);
}

/**
 * The wall loss's shelves: one first-order shelf at each corner, `ratio` apart, the same for every tube; a shelf's zero
 * is capped at `zeroCap` of the rate, the domain's edge for tubes beyond the data (no catalog tube reaches it).
 */
const WALL_LOSS_SHELVES = Object.freeze({ cornersHz: Object.freeze([20, 160, 1280, 10240]), ratio: 8, zeroCap: 0.49 });

/**
 * Each shelf's bilinear coefficients `[b0, b1, a1]` for one traversal of a tube of `length` and `diameter` at `rate`,
 * targeting `ln|H(f)| = -kappa*sqrt(f)`: shelf k at corner `f_k` is `kappa*(sqrt(2)*ln(r)/pi)*sqrt(f_k)` nepers deep, the
 * lowest also carrying the omitted shelves below it (times `sqrt(r)/(sqrt(r)-1)`).
 */
export function wallLossSections(length: number, diameter: number, rate: number): Float64Array {
  const { cornersHz, ratio, zeroCap } = WALL_LOSS_SHELVES;
  const kappa = wallLossNepers(length, diameter, 1);
  const out = new Float64Array(cornersHz.length * 3);
  const K = 2 * rate;
  cornersHz.forEach((fp, k) => {
    let depth = kappa * ((Math.SQRT2 * Math.log(ratio)) / Math.PI) * Math.sqrt(fp);
    if (k === 0) depth *= Math.sqrt(ratio) / (Math.sqrt(ratio) - 1);
    const fz = Math.min(fp * Math.exp(depth), zeroCap * rate);
    const wp = K * Math.tan((Math.PI * fp) / rate),
      wz = K * Math.tan((Math.PI * fz) / rate);
    const g = wp / wz,
      a0 = K + wp;
    out[3 * k] = (g * (K + wz)) / a0; // b0
    out[3 * k + 1] = (g * (wz - K)) / a0; // b1
    out[3 * k + 2] = (wp - K) / a0; // a1
  });
  return out;
}

/**
 * Whether `rate` carries a shelf of pole `a1`: a shelf whose corner lies at or above half the rate has its pole off the
 * unit circle and is left out of the wall loss.
 */
const carried = (a1: number) => Math.abs(a1) < 1;

/** The wall loss's poles `a1_k` at `rate`: one per shelf, shared by every tube; 0 for a shelf the rate leaves out. */
export function wallLossPoles(rate: number): Float64Array {
  const K = 2 * rate;
  return Float64Array.from(WALL_LOSS_SHELVES.cornersHz, (fp) => {
    const wp = K * Math.tan((Math.PI * fp) / rate);
    const a1 = (wp - K) / (K + wp);
    return carried(a1) ? a1 : 0;
  });
}

/**
 * A tube's wall-loss weights `[C, R_0, R_1, R_2, R_3]` at `rate`: its carried shelves in series, `prod (b0_k + b1_k w)/(1
 * + a1_k w)` with `w = z^-1`, as partial fractions `C + sum R_k/(1 + a1_k w)` over `wallLossPoles`. `C = prod
 * b1_k/a1_k`; `R_k` is the residue at `w = -1/a1_k`, and 0 for a shelf the rate leaves out.
 */
export function wallLossWeights(length: number, diameter: number, rate: number): Float64Array {
  const s = wallLossSections(length, diameter, rate);
  const shelves = WALL_LOSS_SHELVES.cornersHz.length;
  const b0 = (k: number) => s[3 * k]!,
    b1 = (k: number) => s[3 * k + 1]!,
    a = (k: number) => s[3 * k + 2]!;
  const out = new Float64Array(shelves + 1);
  let direct = 1;
  for (let k = 0; k < shelves; k++) if (carried(a(k))) direct *= b1(k) / a(k);
  out[0] = direct;
  for (let k = 0; k < shelves; k++) {
    if (!carried(a(k))) continue;
    const w = -1 / a(k);
    let residue = b0(k) + b1(k) * w;
    for (let j = 0; j < shelves; j++) if (j !== k && carried(a(j))) residue *= (b0(j) + b1(j) * w) / (1 + a(j) * w);
    out[k + 1] = residue;
  }
  return out;
}

/**
 * Glass wool lining a pipe (K, 2026-11-22): a yielding wall, the wool's flow resistance before the gas within its
 * thickness, which is a spring. `resistivity` is an estimate, not a measurement: light building glass wool measures
 * 3,000 to 6,000 Pa s/m^2 (Tarnow 2002); a silencer's packing is denser, and hot exhaust is more viscous, so a value of
 * a plausible order is taken. The wool's pressure is the outside's.
 */
export const WOOL = Object.freeze({ resistivity: 3e4, pressure: REFLECTION_REFERENCE.pressurePa });

/**
 * One traversal's loss of a pipe of `length` and `diameter` lined with `wool` (m), as a first-order shelf's bilinear
 * coefficients `[b0, b1, a1]` of `y[n] = b0 x[n] + b1 x[n-1] - a1 y[n-1]` at `rate`, or null where the rate does not
 * carry the shelf's pole. The wall's resistance `R = resistivity * wool` stands before the spring of the gas in the
 * wool, `gamma * pressure / wool`: they balance at `f0 = gamma * pressure / (2 pi R wool)`, below which the wall barely
 * yields, and the loss is `A f^2 / (f0^2 + f^2)` nepers, `A = (2 length / (diameter - 2 wool)) (rho c / R)` with
 * `rho c = gamma * pressure / c`. The pole is placed so the shelf's loss far below matches `A f^2 / f0^2`, the zero so
 * its loss far above is `A`, capped as the wall loss's at 0.49 of the rate.
 */
export function woolShelf(
  length: number,
  diameter: number,
  wool: number,
  rate: number,
): readonly [number, number, number] | null {
  const R = WOOL.resistivity * wool,
    stiffness = GAS.gamma * WOOL.pressure;
  const f0 = stiffness / (2 * Math.PI * R * wool);
  const A = ((2 * length) / (diameter - 2 * wool)) * (stiffness / waveSpeed / R);
  const fp = f0 * Math.sqrt((1 - Math.exp(-2 * A)) / (2 * A));
  const { zeroCap } = WALL_LOSS_SHELVES;
  if (fp >= zeroCap * rate) return null;
  const fz = Math.min(fp * Math.exp(A), zeroCap * rate);
  const K = 2 * rate,
    wp = K * Math.tan((Math.PI * fp) / rate),
    wz = K * Math.tan((Math.PI * fz) / rate);
  const g = wp / wz,
    a0 = K + wp;
  return [(g * (K + wz)) / a0, (g * (wz - K)) / a0, (wp - K) / a0];
}

// Derived from REFLECTION_REFERENCE: c = sqrt(gamma R T), rounded to 1 m/s.
export const ACOUSTICS = Object.freeze({ waveSpeed });
