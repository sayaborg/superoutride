import type { VehicleEngineSound } from './vehicle-engine-sound.js';
import { ACOUSTICS, GAS, openEndCutoffHz, wallLossPoles, wallLossWeights } from './exhaust-acoustics.js';
import { EXHAUST_LISTENING, flowSize, xorshift } from './exhaust-waveguide.js';

/** The light kernel's one value chosen by listening (K, 2026-11-23): a pipe no wider than this is never a box. */
export const LIGHT_BOX_DIAMETER = 0.075;

/**
 * The light kernel's reading of an engine sound's exhaust (K, 2026-11-22): its tubes without their boxes and their
 * wool. A box is a pipe that is not an outlet, is wider than `LIGHT_BOX_DIAMETER` and is wider than every tube it
 * meets at both its ends; it is read as wide as the widest of those tubes, a straight way through of the same length.
 * Wool is not read.
 */
export function straightened(sound: VehicleEngineSound): VehicleEngineSound {
  const { primaries, pipes } = sound.exhaust;
  const met = (junction: number, but: number): number[] => [
    ...primaries.filter(({ to }) => to === junction).map(({ diameter }) => diameter),
    ...pipes
      .filter(({ from, to }, j) => j !== but && (from === junction || to === junction))
      .map(({ diameter }) => diameter),
  ];
  return {
    ...sound,
    exhaust: {
      ...sound.exhaust,
      pipes: pipes.map(({ from, to, length, diameter }, j) => {
        if (to === null) return { from, to, length, diameter };
        const others = [...met(from, j), ...met(to, j)];
        const box = diameter > LIGHT_BOX_DIAMETER && others.length > 0 && others.every((other) => other < diameter);
        return { from, to, length, diameter: box ? Math.max(...others) : diameter };
      }),
    },
  };
}

/**
 * The light exhaust kernel (K, 2026-11-22): the game's kernel (`ExhaustWaveguide`) with linear tubes. It has the same
 * cylinders, the same gas (`GAS`), the same valve law, the same wall loss and mouths, the same afterfire and the same
 * two listened values (`EXHAUST_LISTENING`), and hears the same thing, the mouths' pressure times their diameter. What
 * differs is the tubes and their junctions: a wave does not steepen, and a junction or a mouth is no jet.
 *
 *   A tube: two delay lines, its length rounded to the samples of `rate`; each wave written passes the wall loss.
 *   A junction: its tubes meet at one pressure, p = 2 sum(area * arriving) / sum(area); a tube's wave leaves as
 *     p - arriving. Gas burning there (an afterfire) enters as its swelling, a flow: p rises by it over the tubes' bores.
 *   A mouth: the wave returns turned over and low-passed at ka = 1; what is heard is what did not return.
 *   A cylinder: it holds its gas (pressure (gas / volume)^gamma), the piston moves its volume, and its valve is the
 *     game kernel's end law into a space with no width (sigma = 0), solved once a sample from the cylinder's pressure
 *     as the sample begins: with d = 2 arriving - P and m the flow from the tube into the cylinder,
 *       m + K m^2 / 2 = |d|,  K = 1 / a^2 - 1 into the cylinder, (1 + (1 / a - 1)^2) density / fill out of it,
 *     no faster than sound in the throat, and no more than brings the cylinder level with its tube's end.
 *
 * It reads a sound through {@link straightened}. Pressures are over rho c^2 and flows are Mach numbers, as the game
 * kernel's. Nothing allocates while rendering but an afterfire's list when it grows.
 */
export class ExhaustLight {
  private readonly sound: VehicleEngineSound;
  // Lines: every primary's forward and backward, then every pipe's down and up.
  private readonly buffer: Float32Array;
  private readonly start: Int32Array;
  private readonly size: Int32Array;
  private readonly at: Int32Array;
  private readonly poles: Float64Array;
  private readonly weights: Float64Array;
  private readonly states: Float64Array;
  private readonly arriving: Float64Array;
  private readonly leaving: Float64Array;
  // Junctions' ports, junction by junction: junction j's are portStart[j] .. portStart[j + 1] - 1.
  private readonly portStart: Int32Array;
  private readonly portLine: Int32Array;
  private readonly portShare: Float64Array;
  private readonly pressure: Float64Array;
  /** What a flow of one volume a sample into each junction adds to its pressure. */
  private readonly swellingScale: Float64Array;
  private readonly swelling: Float64Array;
  // Mouths: each pipe's low-passed outgoing wave and its low-pass coefficient.
  private readonly outlet: Float64Array;
  private readonly follow: Float64Array;
  // Cylinders, as the game kernel's.
  private readonly gas: Float64Array;
  private readonly density: Float64Array;
  private readonly throatMost: Float64Array;
  private readonly perSample: Float64Array;
  private readonly unburned: Float64Array;
  private readonly hasOpened: Uint8Array;
  private burnJunction = new Int32Array(8);
  private burnVolume = new Float64Array(8);
  private burnElapsed = new Float64Array(8);
  private burns = 0;
  private readonly smoothing: number;
  private readonly clearance: number;
  private readonly centre: number;
  private readonly turn: number;
  private readonly cycleSamples: number;
  private readonly afterfireSpan: number;
  private afterfiring = false;
  private phase = 0;
  private rpm = 1000;
  private opening = 0;
  private chargeSeed = 123456789;

  constructor(sound: VehicleEngineSound, rate: number, observationSeconds: number) {
    this.sound = sound = straightened(sound);
    const { primaries, pipes, valve } = sound.exhaust;
    const cylinders = primaries.length;
    const tubes = [...primaries, ...primaries, ...pipes, ...pipes];
    const lines = tubes.length;
    this.size = Int32Array.from(tubes, ({ length }) => Math.max(1, Math.round((length * rate) / ACOUSTICS.waveSpeed)));
    this.start = new Int32Array(lines);
    let cells = 0;
    for (let l = 0; l < lines; l++) {
      this.start[l] = cells;
      cells += this.size[l]!;
    }
    this.buffer = new Float32Array(cells);
    this.at = new Int32Array(lines);
    this.poles = wallLossPoles(rate);
    this.weights = new Float64Array(5 * lines);
    tubes.forEach(({ length, diameter }, l) => this.weights.set(wallLossWeights(length, diameter, rate), 5 * l));
    this.states = new Float64Array(4 * lines);
    this.arriving = new Float64Array(lines);
    this.leaving = new Float64Array(lines);
    let junctions = 0;
    for (const { to } of primaries) junctions = Math.max(junctions, to + 1);
    for (const { from, to } of pipes) junctions = Math.max(junctions, from + 1, (to ?? 0) + 1);
    const bores = new Float64Array(junctions);
    const ports: { junction: number; line: number; bore: number }[] = [];
    primaries.forEach(({ to, diameter }, i) => ports.push({ junction: to, line: i, bore: diameter * diameter }));
    pipes.forEach(({ from, to, diameter }, j) => {
      // A pipe's wave arrives at its `from` on its up line and at its `to` on its down line.
      ports.push({ junction: from, line: 2 * cylinders + pipes.length + j, bore: diameter * diameter });
      if (to !== null) ports.push({ junction: to, line: 2 * cylinders + j, bore: diameter * diameter });
    });
    for (const { junction, bore } of ports) bores[junction]! += bore;
    ports.sort((a, b) => a.junction - b.junction);
    this.portStart = new Int32Array(junctions + 1);
    for (const { junction } of ports) this.portStart[junction + 1]!++;
    for (let j = 0; j < junctions; j++) this.portStart[j + 1]! += this.portStart[j]!;
    this.portLine = Int32Array.from(ports, ({ line }) => line);
    this.portShare = Float64Array.from(ports, ({ junction, bore }) => bore / bores[junction]!);
    this.pressure = new Float64Array(junctions);
    this.swelling = new Float64Array(junctions);
    this.swellingScale = Float64Array.from(bores, (sum) => (4 * rate) / (Math.PI * ACOUSTICS.waveSpeed * sum));
    this.outlet = new Float64Array(pipes.length);
    this.follow = Float64Array.from(
      pipes,
      ({ diameter }) => 1 - Math.exp((-2 * Math.PI * openEndCutoffHz(diameter)) / rate),
    );
    this.gas = new Float64Array(cylinders);
    this.density = new Float64Array(cylinders);
    this.throatMost = Float64Array.from(primaries, ({ diameter }) => GAS.discharge * (valve.diameter / diameter) ** 2);
    this.perSample = Float64Array.from(
      primaries,
      ({ diameter }) => (Math.PI * ACOUSTICS.waveSpeed * diameter * diameter) / (4 * rate),
    );
    this.unburned = new Float64Array(cylinders);
    this.hasOpened = new Uint8Array(cylinders);
    this.smoothing = 1 - Math.exp(-1 / (observationSeconds * rate));
    this.clearance = sound.sweptVolume / (sound.compressionRatio - 1);
    this.centre = sound.cycleRevolutions === 2 ? 1.5 * Math.PI : Math.PI;
    this.turn = sound.cycleRevolutions * 2 * Math.PI;
    this.cycleSamples = 60 * sound.cycleRevolutions * rate;
    this.afterfireSpan = EXHAUST_LISTENING.afterfireSeconds * rate;
  }

  /** The next charge leaves its cylinder unburned and burns in the pipe. When is the game's to say. */
  afterfire(): void {
    this.afterfiring = true;
  }

  private burn(): void {
    const { swelling, burnJunction, burnVolume, burnElapsed, afterfireSpan: span } = this;
    swelling.fill(0);
    for (let b = this.burns - 1; b >= 0; b--) {
      swelling[burnJunction[b]!]! +=
        (burnVolume[b]! * (1 - Math.cos((2 * Math.PI * (burnElapsed[b]! + 0.5)) / span))) / span;
      if (++burnElapsed[b]! >= span) {
        burnJunction.copyWithin(b, b + 1, this.burns);
        burnVolume.copyWithin(b, b + 1, this.burns);
        burnElapsed.copyWithin(b, b + 1, this.burns);
        this.burns--;
      }
    }
  }
  private beginBurn(junction: number, volume: number): void {
    if (this.burns === this.burnJunction.length) {
      const grow = <T extends Int32Array | Float64Array>(old: T, made: T): T => (made.set(old), made);
      this.burnJunction = grow(this.burnJunction, new Int32Array(2 * this.burns));
      this.burnVolume = grow(this.burnVolume, new Float64Array(2 * this.burns));
      this.burnElapsed = grow(this.burnElapsed, new Float64Array(2 * this.burns));
    }
    this.burnJunction[this.burns] = junction;
    this.burnVolume[this.burns] = volume;
    this.burnElapsed[this.burns] = 0;
    this.burns++;
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
    const {
      sound,
      buffer,
      start,
      size,
      at,
      arriving,
      leaving,
      pressure,
      portStart,
      portLine,
      portShare,
      weights,
      states,
    } = this;
    const { gas, density, unburned, outlet, follow, clearance, centre, turn } = this;
    const { primaries, pipes, valve } = sound.exhaust;
    const { gamma, choked } = GAS;
    const cylinders = primaries.length;
    const lines = size.length;
    const junctions = pressure.length;
    const a0 = this.poles[0]!,
      a1 = this.poles[1]!,
      a2 = this.poles[2]!,
      a3 = this.poles[3]!;
    for (let k = 0; k < count; k++) {
      this.rpm += this.smoothing * (rpm[k]! - this.rpm);
      this.opening += this.smoothing * (opening[k]! - this.opening);
      const previous = this.phase;
      const phase = (previous + this.rpm / this.cycleSamples) % 1;
      this.phase = phase;
      const charge = GAS.closedCharge + (1 - GAS.closedCharge) * this.opening;
      for (let l = 0; l < lines; l++) arriving[l] = buffer[start[l]! + at[l]!]!;

      // 1. Junctions.
      for (let j = 0; j < junctions; j++) {
        let sum = 0;
        for (let port = portStart[j]!; port < portStart[j + 1]!; port++)
          sum += portShare[port]! * arriving[portLine[port]!]!;
        pressure[j] = 2 * sum;
      }
      if (this.burns > 0) {
        this.burn();
        for (let j = 0; j < junctions; j++) pressure[j]! += this.swellingScale[j]! * this.swelling[j]!;
      }

      // 2. Pipes and their mouths.
      let heard = 0;
      for (let j = 0; j < pipes.length; j++) {
        const pipe = pipes[j]!;
        const down = 2 * cylinders + j,
          up = down + pipes.length;
        leaving[down] = pressure[pipe.from]! - arriving[up]!;
        if (pipe.to !== null) {
          leaving[up] = pressure[pipe.to]! - arriving[down]!;
          continue;
        }
        const outgoing = arriving[down]!;
        outlet[j]! += follow[j]! * (outgoing - outlet[j]!);
        leaving[up] = -outlet[j]!;
        heard += pipe.diameter * (outgoing - outlet[j]!);
      }

      // 3. Cylinders.
      for (let i = 0; i < cylinders; i++) {
        const opens = sound.firingPhases[i]!;
        const crossed = phase >= previous ? opens > previous && opens <= phase : opens > previous || opens <= phase;
        let since = phase - opens + 1;
        if (since >= 1) since -= 1;
        const back = arriving[cylinders + i]!;
        leaving[cylinders + i] = pressure[primaries[i]!.to]! - arriving[i]!;
        const volume =
          crossed || since < valve.open
            ? clearance + (sound.sweptVolume * (1 - Math.cos(centre + (since - valve.open / 2) * turn))) / 2
            : 0;
        if (crossed) {
          this.hasOpened[i] = 1;
          this.chargeSeed = xorshift(this.chargeSeed);
          const varied = Math.max(1e-3, charge + EXHAUST_LISTENING.chargeVariation * (this.chargeSeed / 2147483648));
          const inPipe = burns && this.afterfiring;
          this.afterfiring = false;
          if (inPipe)
            unburned[i] =
              (varied *
                sound.sweptVolume *
                (GAS.burnedKelvin - GAS.intakeKelvin) *
                (volume / clearance) ** (gamma - 1)) /
              (gamma * GAS.intakeKelvin);
          const kelvin = burns && !inPipe ? GAS.burnedKelvin : GAS.intakeKelvin;
          const opened = (varied * (kelvin / GAS.intakeKelvin) * sound.sweptVolume) / volume;
          gas[i] = volume * opened ** (1 / gamma);
          density[i] = (GAS.pipeKelvin / kelvin) * opened ** ((gamma - 1) / gamma);
        }
        let flow = 0;
        if (since < valve.open && this.hasOpened[i]) {
          const position = since / valve.open;
          const lift = position * (1 - position);
          const throat = Math.min(1, this.throatMost[i]! * 16 * lift * lift);
          if (throat > 0) {
            const fill = gas[i]! / volume;
            const full = fill ** gamma;
            const d = 2 * back - (full - 1) / gamma;
            const sized = d >= 0 ? d : -d;
            const into = d >= 0;
            const K = into ? 1 / (throat * throat) - 1 : ((1 + (1 / throat - 1) ** 2) * density[i]!) / fill;
            const most = into ? choked * throat : choked * throat * Math.sqrt((fill * full) / density[i]!);
            // What brings the cylinder level with its tube's end, by its fill's slope.
            const level = (volume * (fill / full) * sized) / this.perSample[i]!;
            const m = Math.min(flowSize(K, sized), most, level);
            flow = into ? m : -m;
            gas[i] = Math.max(gas[i]! + this.perSample[i]! * flow, 1e-9 * volume);
          }
        } else if (unburned[i]! > 0) {
          this.beginBurn(primaries[i]!.to, unburned[i]!);
          unburned[i] = 0;
        }
        leaving[i] = back - flow;
      }

      // 4. Send every wave through its tube's wall loss.
      for (let l = 0; l < lines; l++) {
        const x = leaving[l]!;
        const w = 5 * l,
          q = 4 * l;
        const u0 = (states[q] = x - a0 * states[q]!);
        const u1 = (states[q + 1] = x - a1 * states[q + 1]!);
        const u2 = (states[q + 2] = x - a2 * states[q + 2]!);
        const u3 = (states[q + 3] = x - a3 * states[q + 3]!);
        buffer[start[l]! + at[l]!] =
          weights[w]! * x + weights[w + 1]! * u0 + weights[w + 2]! * u1 + weights[w + 3]! * u2 + weights[w + 4]! * u3;
        if (++at[l]! === size[l]!) at[l] = 0;
      }
      out[offset + k] = heard;
    }
  }
}
