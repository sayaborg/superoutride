import type { VehicleEngineSound } from './vehicle-engine-sound.js';

/**
 * The light kernel's gas: burned gas everywhere, a perfect gas. Assumptions, none chosen by listening; the speed of
 * the tubes' waves makes a centimetre of tube a sample at 48 kHz, and stands for gas at about 330 C.
 */
const GAS = Object.freeze({
  /** The ratio of specific heats. */
  gamma: 4 / 3,
  /** J/(kg K). */
  gasConstant: 287,
  prandtl: 0.71,
  /** The outside's pressure, Pa. */
  pressure: 101325,
  /** The speed of the tubes' waves, m/s. */
  waveSpeed: 480,
  /** The charge a cylinder draws, and lets out unburned. */
  intakeKelvin: 293.15,
  /** The cylinder's gas as its exhaust valve opens; petrol engines typically 1000 to 1300 K. */
  burnedKelvin: 1100,
});
/** The temperature of the gas in the tubes, from the speed of their waves. */
const TUBE_KELVIN = GAS.waveSpeed ** 2 / (GAS.gamma * GAS.gasConstant);
/** The flow of a throat at the speed of sound, over its still gas's density times its speed of sound. */
const CHOKED = (2 / (GAS.gamma + 1)) ** ((GAS.gamma + 1) / (2 * (GAS.gamma - 1)));

/** The engine, as far as its exhaust hears it: assumptions too. */
const ENGINE = Object.freeze({
  /** A valve's flow coefficient; measured exhaust valves 0.6 to 0.7 at working lift. */
  discharge: 0.65,
  /** The share of a full charge a cylinder draws with the throttle shut. */
  closedCharge: 0.3,
});

/** The two values chosen by listening (K, 2026-11-20 and 11-23). */
const LISTENED = Object.freeze({
  /** How far a charge varies from one to the next, of a full charge. */
  chargeVariation: 0.03,
  /** How long an afterfire burns, s. */
  afterfireSeconds: 0.0015,
});

/**
 * A tube's wall (Kirchhoff): the boundary layer of a still gas takes kappa sqrt(f) nepers of a wave passing a tube,
 * kappa = WALL length / radius, with the gas's viscosity Sutherland's at the tubes' temperature.
 */
const WALL = (() => {
  const viscosity = (1.716e-5 * (TUBE_KELVIN / 273) ** 1.5 * (273 + 111)) / (TUBE_KELVIN + 111);
  const density = GAS.pressure / (GAS.gasConstant * TUBE_KELVIN);
  return (Math.sqrt((Math.PI * viscosity) / density) / GAS.waveSpeed) * (1 + (GAS.gamma - 1) / Math.sqrt(GAS.prandtl));
})();
/**
 * The root of the frequency is followed by a stair of first-order shelves, their corners `ratio` apart: the shelf at
 * corner f is kappa sqrt(f) sqrt(2) ln(ratio) / pi nepers deep, and the lowest also carries the shelves below it.
 * The kernel's rate is above twice the highest corner.
 */
const SHELVES = Object.freeze({ cornersHz: Object.freeze([20, 160, 1280, 10240]), ratio: 8 });
/** The slowest rate the light kernel runs at: above twice its highest shelf's corner. */
const SLOWEST_RATE = 2 * SHELVES.cornersHz[SHELVES.cornersHz.length - 1]!;
/** A shelf's corner at `rate`, as the tangent its filter is written in. */
const corner = (hz: number, rate: number): number => Math.tan((Math.PI * hz) / rate);
/** Each shelf's `[b0, b1]` for one pass of a tube: y = b0 x + s, then s = b1 x - a1 y, with `shelfPoles`' a1. */
function shelves(length: number, diameter: number, rate: number): number[] {
  const kappa = (WALL * length) / (diameter / 2);
  const { cornersHz, ratio } = SHELVES;
  return cornersHz.flatMap((hz, k) => {
    const depth =
      kappa *
      Math.sqrt(hz) *
      ((Math.SQRT2 * Math.log(ratio)) / Math.PI) *
      (k === 0 ? Math.sqrt(ratio) / (Math.sqrt(ratio) - 1) : 1);
    // The shelf falls from 1 to exp(-depth): its pole at the corner, its zero the depth above it.
    const pole = corner(hz, rate),
      zero = pole * Math.exp(depth);
    return [(pole * (1 + zero)) / (zero * (1 + pole)), (pole * (zero - 1)) / (zero * (1 + pole))];
  });
}
const shelfPoles = (rate: number): number[] =>
  SHELVES.cornersHz.map((hz) => (corner(hz, rate) - 1) / (corner(hz, rate) + 1));

/** What the light kernel reads of an engine sound's exhaust: one diameter, and tubes that have only a length. */
export interface LightExhaust {
  /** Every tube's diameter: the primaries'. */
  readonly diameter: number;
  /**
   * The tubes. A tube begins at a valve (`from` null) or a junction and ends at a junction or a mouth (`to` null);
   * cylinder i's is tube i.
   */
  readonly tubes: readonly { readonly from: number | null; readonly to: number | null; readonly length: number }[];
  readonly junctions: number;
}

/**
 * The light kernel's reading of a sound: only lengths. Every tube is as wide as a primary, so a wave passes whole from
 * one tube into the next, and two tubes meeting alone are one tube of their lengths together. Boxes, wool and every
 * pipe's own diameter are not read.
 */
export function lightExhaust(sound: VehicleEngineSound): LightExhaust {
  const tubes: { from: number | null; to: number | null; length: number }[] = [
    ...sound.exhaust.primaries.map(({ to, length }) => ({ from: null, to, length })),
    ...sound.exhaust.pipes.map(({ from, to, length }) => ({ from, to, length })),
  ];
  for (;;) {
    const at = tubes.findIndex(
      ({ to }) =>
        to !== null &&
        tubes.filter((tube) => tube.from === to || tube.to === to).length === 2 &&
        tubes.some((tube) => tube.from === to),
    );
    if (at < 0) break;
    const next = tubes.findIndex(({ from }) => from === tubes[at]!.to);
    tubes[at] = { from: tubes[at]!.from, to: tubes[next]!.to, length: tubes[at]!.length + tubes[next]!.length };
    tubes.splice(next, 1);
  }
  // The junctions left, numbered from 0 in their old order.
  const kept = [...new Set(tubes.flatMap(({ from, to }) => [from, to]).filter((end) => end !== null))].sort(
    (a, b) => a - b,
  );
  const number = (end: number | null): number | null => (end === null ? null : kept.indexOf(end));
  return {
    diameter: sound.exhaust.primaries[0]!.diameter,
    tubes: tubes.map(({ from, to, length }) => ({ from: number(from), to: number(to), length })),
    junctions: kept.length,
  };
}

/**
 * The light exhaust kernel (K, 2026-11-23): one gas, in tubes of one width that have only a length, between valves,
 * junctions and mouths. A sound fades in three places: along a tube's wall, in a valve's jet, and out of a mouth.
 *
 * Pressures are over the tubes' rho c^2 and flows are Mach numbers. A tube carries two waves; its pressure is their
 * sum and its flow their difference.
 *
 *   A tube delays its two waves by its length, and its wall takes of them what a still gas's boundary layer does:
 *     a loss that grows as the root of the frequency (`WALL`).
 *   A junction is one pressure where its n tubes meet, and keeps no gas: p = (2 / n) sum(arriving), and each tube's
 *     wave leaves as p - arriving.
 *   A mouth is a sphere of the bore's area breathing into the open: the wave returns turned over through a low-pass at
 *     ka = 1, and far away is heard the sphere's pressure, which is what did not return, times its diameter.
 *   A valve is a throat, a of the bore, between its tube and a cylinder: a still space that holds its gas at
 *     (gas / volume)^gamma while its piston moves its volume. The gas speeds up into the throat without thinning, and
 *     its jet's head is lost beyond it. With d the tube's stopped pressure above the cylinder's and m the flow from
 *     the tube into the cylinder,
 *       m + K m^2 / 2 = |d|,  K = 1 / a^2 - 1 into the cylinder, (1 + (1 / a - 1)^2) density / fill out of it,
 *     and no faster than sound in the throat. Shut, the valve is its tube's closed end.
 *   An afterfire is a charge that left its cylinder unburned: its heat swells the gas at its valve as the valve shuts.
 *
 * A cylinder's charge is the engine's swept volume of the outside's air, as far as the throttle opens (`ENGINE`), at the
 * burned gas's temperature when its valve opens; the valve opens over the middle of the exhaust stroke. Two values
 * were chosen by listening (`LISTENED`): how far a charge varies, and how long an afterfire burns.
 *
 * A sample is a step of time: a length is its whole number of samples, and a valve's flow is solved once a step, with
 * the cylinder's pressure moving as it flows (g below). Nothing allocates while rendering. The kernel refuses a rate
 * not above twice its highest shelf's corner (`SHELVES`).
 */
export class ExhaustLight {
  private readonly sound: VehicleEngineSound;
  private readonly exhaust: LightExhaust;
  // Each tube's two waves, down and then up: tube t's are lines t and tubes + t. A line's cells are a ring.
  private readonly cells: Float64Array;
  private readonly first: Int32Array;
  private readonly end: Int32Array;
  private readonly cell: Int32Array;
  private readonly arriving: Float64Array;
  private readonly leaving: Float64Array;
  // The wall's loss: its shelves' poles, the same for every line, and each line's shelves and their states.
  private readonly poles: Float64Array;
  private readonly shelves: Float64Array;
  private readonly states: Float64Array;
  // Junctions' lines, junction by junction: junction j's are portStart[j] .. portStart[j + 1] - 1.
  private readonly portStart: Int32Array;
  private readonly portLine: Int32Array;
  private readonly pressure: Float64Array;
  // Mouths: each tube's returned wave, and the low-pass's coefficient.
  private readonly returned: Float64Array;
  private readonly follow: number;
  // Cylinders: the gas each holds (its volume at the outside's pressure) and that gas's density there over the tubes'.
  private readonly gas: Float64Array;
  private readonly density: Float64Array;
  private readonly clearance: number;
  /** The crank's angle at the middle of a valve's opening, and its turn over a cycle. */
  private readonly centre: number;
  private readonly turn: number;
  /** A valve's throat at full lift, of the bore. */
  private readonly throatMost: number;
  /** The volume a flow of Mach 1 carries along a tube in a sample. */
  private readonly perSample: number;
  // Afterfires: the swelling a cylinder's unburned charge will make, the swelling burning at its valve, and how long.
  private readonly unburned: Float64Array;
  private readonly burning: Float64Array;
  private readonly burnt: Float64Array;
  private readonly burnSamples: number;
  private afterfiring = false;
  private readonly smoothing: number;
  private readonly cycleSamples: number;
  private phase = 0;
  private rpm = 1000;
  private opening = 0;
  private chargeSeed = 123456789;

  constructor(sound: VehicleEngineSound, rate: number, observationSeconds: number) {
    if (!(rate > SLOWEST_RATE))
      throw new RangeError(`The light kernel runs above ${SLOWEST_RATE} Hz, twice its wall's highest corner`);
    this.sound = sound;
    const { tubes, diameter, junctions } = (this.exhaust = lightExhaust(sound));
    const lines = 2 * tubes.length;
    this.first = new Int32Array(lines);
    this.end = new Int32Array(lines);
    let cells = 0;
    for (let l = 0; l < lines; l++) {
      this.first[l] = cells;
      cells += Math.max(1, Math.round((tubes[l % tubes.length]!.length * rate) / GAS.waveSpeed));
      this.end[l] = cells;
    }
    this.cells = new Float64Array(cells);
    this.cell = this.first.slice();
    this.arriving = new Float64Array(lines);
    this.leaving = new Float64Array(lines);
    this.poles = Float64Array.from(shelfPoles(rate));
    this.shelves = Float64Array.from(tubes.concat(tubes).flatMap(({ length }) => shelves(length, diameter, rate)));
    this.states = new Float64Array(4 * lines);
    // A tube's wave arrives at its `to` on its down line and at its `from` on its up line.
    const ports = tubes
      .flatMap(({ from, to }, t) => [
        { junction: to, line: t },
        { junction: from, line: tubes.length + t },
      ])
      .filter((port): port is { junction: number; line: number } => port.junction !== null)
      .sort((a, b) => a.junction - b.junction);
    this.portStart = new Int32Array(junctions + 1);
    for (const { junction } of ports) this.portStart[junction + 1]!++;
    for (let j = 0; j < junctions; j++) this.portStart[j + 1]! += this.portStart[j]!;
    this.portLine = Int32Array.from(ports, ({ line }) => line);
    this.pressure = new Float64Array(junctions);
    this.returned = new Float64Array(tubes.length);
    // ka = 1: the angular frequency c / radius.
    this.follow = 1 - Math.exp((-2 * GAS.waveSpeed) / (diameter * rate));
    this.clearance = sound.sweptVolume / (sound.compressionRatio - 1);
    this.centre = sound.cycleRevolutions === 2 ? 1.5 * Math.PI : Math.PI;
    this.turn = sound.cycleRevolutions * 2 * Math.PI;
    this.throatMost = ENGINE.discharge * (sound.exhaust.valve.diameter / diameter) ** 2;
    this.perSample = (Math.PI * GAS.waveSpeed * diameter * diameter) / (4 * rate);
    // As it begins, every cylinder holds the outside's air.
    this.gas = Float64Array.from(sound.firingPhases, (opens) => this.volume((1 - opens) % 1));
    this.density = Float64Array.from(sound.firingPhases, () => TUBE_KELVIN / GAS.intakeKelvin);
    this.unburned = new Float64Array(sound.firingPhases.length);
    this.burning = new Float64Array(sound.firingPhases.length);
    this.burnt = new Float64Array(sound.firingPhases.length);
    this.burnSamples = LISTENED.afterfireSeconds * rate;
    this.smoothing = 1 - Math.exp(-1 / (observationSeconds * rate));
    this.cycleSamples = 60 * sound.cycleRevolutions * rate;
  }

  /** A cylinder's volume `since` its valve opened, in cycles. */
  private volume(since: number): number {
    return (
      this.clearance +
      (this.sound.sweptVolume * (1 - Math.cos(this.centre + (since - this.sound.exhaust.valve.open / 2) * this.turn))) /
        2
    );
  }

  /** The next charge leaves its cylinder unburned and burns in the pipe. When is the game's to say. */
  afterfire(): void {
    this.afterfiring = true;
  }

  /** Renders `count` samples from `offset`: `rpm` and `opening` are each sample's targets; `burns` false cuts the fuel. */
  render(
    out: Float64Array,
    offset: number,
    count: number,
    rpm: ArrayLike<number>,
    opening: ArrayLike<number>,
    burns: boolean,
  ): void {
    const { sound, cells, first, end, cell, arriving, leaving, poles, shelves, states } = this;
    const { pressure, portStart, portLine, returned, follow } = this;
    const { gas, density, throatMost, perSample, unburned, burning, burnt, burnSamples } = this;
    const { tubes, diameter } = this.exhaust;
    const { valve } = sound.exhaust;
    const cylinders = sound.firingPhases.length;
    const up = tubes.length;
    const p0 = poles[0]!,
      p1 = poles[1]!,
      p2 = poles[2]!,
      p3 = poles[3]!;
    for (let k = 0; k < count; k++) {
      this.rpm += this.smoothing * (rpm[k]! - this.rpm);
      this.opening += this.smoothing * (opening[k]! - this.opening);
      const previous = this.phase;
      const phase = (previous + this.rpm / this.cycleSamples) % 1;
      this.phase = phase;
      // A line's cell holds the wave that left its length ago.
      for (let l = 0; l < 2 * up; l++) arriving[l] = cells[cell[l]!]!;

      // Junctions.
      for (let j = 0; j < pressure.length; j++) {
        let sum = 0;
        for (let port = portStart[j]!; port < portStart[j + 1]!; port++) sum += arriving[portLine[port]!]!;
        pressure[j] = (2 * sum) / (portStart[j + 1]! - portStart[j]!);
      }

      // Valves.
      for (let i = 0; i < cylinders; i++) {
        const opens = sound.firingPhases[i]!;
        let since = phase - opens + 1;
        if (since >= 1) since -= 1;
        const back = arriving[up + i]!;
        // The flow from the tube's end into the valve.
        let flow = 0;
        if (since < valve.open) {
          const volume = this.volume(since);
          if (phase >= previous ? opens > previous && opens <= phase : opens > previous || opens <= phase) {
            // The valve opens on a new charge.
            this.chargeSeed ^= this.chargeSeed << 13;
            this.chargeSeed ^= this.chargeSeed >>> 17;
            this.chargeSeed ^= this.chargeSeed << 5;
            const charge =
              ENGINE.closedCharge +
              (1 - ENGINE.closedCharge) * this.opening +
              LISTENED.chargeVariation * (this.chargeSeed / 2147483648);
            const inPipe = burns && this.afterfiring;
            this.afterfiring = false;
            // The heat it did not get in the cylinder, as the swelling it makes at the outside's pressure.
            if (inPipe)
              unburned[i] =
                (charge *
                  sound.sweptVolume *
                  (GAS.burnedKelvin - GAS.intakeKelvin) *
                  (volume / this.clearance) ** (GAS.gamma - 1)) /
                (GAS.gamma * GAS.intakeKelvin);
            const kelvin = burns && !inPipe ? GAS.burnedKelvin : GAS.intakeKelvin;
            const opened = (charge * (kelvin / GAS.intakeKelvin) * sound.sweptVolume) / volume;
            gas[i] = volume * opened ** (1 / GAS.gamma);
            density[i] = (TUBE_KELVIN / kelvin) * opened ** ((GAS.gamma - 1) / GAS.gamma);
          }
          const position = since / valve.open;
          const lift = 4 * position * (1 - position);
          const throat = Math.min(1, throatMost * lift * lift);
          if (throat > 0) {
            const fill = gas[i]! / volume;
            const full = fill * Math.cbrt(fill);
            const d = 2 * back - (full - 1) / GAS.gamma;
            const size = Math.abs(d);
            const K = d > 0 ? 1 / (throat * throat) - 1 : ((1 + (1 / throat - 1) ** 2) * density[i]!) / fill;
            const g = 1 + (perSample * full) / (fill * volume);
            const most = d > 0 ? CHOKED * throat : CHOKED * throat * Math.sqrt((fill * full) / density[i]!);
            const m = Math.min((2 * size) / (g + Math.sqrt(g * g + 2 * K * size)), most);
            flow = d > 0 ? m : -m;
            gas[i]! += perSample * flow;
          }
        } else if (unburned[i]! > 0) {
          burning[i] = unburned[i]!;
          burnt[i] = 0;
          unburned[i] = 0;
        }
        if (burning[i]! > 0) {
          flow -=
            (burning[i]! * (1 - Math.cos((2 * Math.PI * (burnt[i]! + 0.5)) / burnSamples))) / (burnSamples * perSample);
          if (++burnt[i]! >= burnSamples) burning[i] = 0;
        }
        leaving[i] = back - flow;
      }

      // Junctions' tubes, and mouths.
      let heard = 0;
      for (let t = 0; t < up; t++) {
        const { from, to } = tubes[t]!;
        if (from !== null) leaving[t] = pressure[from]! - arriving[up + t]!;
        if (to !== null) {
          leaving[up + t] = pressure[to]! - arriving[t]!;
          continue;
        }
        returned[t]! += follow * (arriving[t]! - returned[t]!);
        leaving[up + t] = -returned[t]!;
        heard += arriving[t]! - returned[t]!;
      }

      // Each wave leaving takes its line's cell, less what the wall takes: the four shelves, one after another.
      for (let l = 0; l < 2 * up; l++) {
        const w0 = leaving[l]!,
          q = 4 * l,
          s = 8 * l;
        const w1 = shelves[s]! * w0 + states[q]!;
        states[q] = shelves[s + 1]! * w0 - p0 * w1;
        const w2 = shelves[s + 2]! * w1 + states[q + 1]!;
        states[q + 1] = shelves[s + 3]! * w1 - p1 * w2;
        const w3 = shelves[s + 4]! * w2 + states[q + 2]!;
        states[q + 2] = shelves[s + 5]! * w2 - p2 * w3;
        const w4 = shelves[s + 6]! * w3 + states[q + 3]!;
        states[q + 3] = shelves[s + 7]! * w3 - p3 * w4;
        cells[cell[l]!] = w4;
        if (++cell[l]! === end[l]!) cell[l] = first[l]!;
      }
      out[offset + k] = diameter * heard;
    }
  }
}
