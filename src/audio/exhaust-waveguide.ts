import type { CompiledEngineSound } from './engine-sound.js';

import { ACOUSTICS, PIPE_COEFFICIENTS, resolveExhaustSettings } from './exhaust-acoustics.js';
import type { ExhaustSettings } from './exhaust-acoustics.js';
import { resolveControlSettings, type ControlSettings } from './audio-control-policy.js';

/**
 * Exact response over `duration` of a unit decaying pulse p' = -decayRate * p feeding two equal rise stages
 * r1' = riseRate * (p - r1), r2' = riseRate * (r1 - r2) from rest. Writes [pulse, r1, r2] into `weights`;
 * a series replaces the closed form near equal rates.
 */
function pulseCascade(decayRate: number, riseRate: number, duration: number, weights: Float64Array): void {
  const decay = Math.exp(-decayRate * duration);
  const x = (riseRate - decayRate) * duration;
  let first: number;
  let second: number;
  if (Math.abs(x) < 1e-2) {
    first = 1 - x / 2 + (x * x) / 6 - (x * x * x) / 24 + (x * x * x * x) / 120;
    second = 1 / 2 - x / 3 + (x * x) / 8 - (x * x * x) / 30 + (x * x * x * x) / 144;
  } else {
    first = -Math.expm1(-x) / x;
    second = (first - Math.exp(-x)) / x;
  }
  const rise = riseRate * duration;
  weights[0] = decay;
  weights[1] = rise * decay * first;
  weights[2] = rise * rise * decay * second;
}

/** Fixed delay with amplitude loss exp(-attenuation * distance) on each traversal. */
class Delay {
  private readonly data: Float32Array;
  private position = 0;
  constructor(
    length: number,
    private readonly transmission: number,
  ) {
    this.data = new Float32Array(Math.max(1, Math.round(length)));
  }
  read(): number {
    return this.data[this.position]!;
  }
  write(value: number): void {
    this.data[this.position] = value * this.transmission;
    this.position = (this.position + 1) % this.data.length;
  }
}

/** Acoustic state only: RPM is supplied by physics; no torque or crank dynamics. */
export class ExhaustWaveguide {
  private readonly forward: Delay[];
  private readonly backward: Delay[];
  // One delay pair per exhaust pipe: downstream runs from -> to, upstream to -> from.
  private readonly downstream: Delay[];
  private readonly upstream: Delay[];
  private readonly pipeFrom: Int32Array;
  // Junction index, or -1 for an open end.
  private readonly pipeTo: Int32Array;
  private readonly arriving: Float64Array;
  private readonly returning: Float64Array;
  private readonly banks: readonly number[];
  private readonly counts: Float64Array;
  private readonly sums: Float64Array;
  private readonly junctions: Float64Array;
  private readonly pulse: Float64Array;
  private readonly rise: Float64Array;
  private readonly riseSecond: Float64Array;
  private readonly emission: Float64Array;
  private readonly wall: Float64Array;
  // One pop pulse per collector, injected at its junction.
  private readonly popPulse: Float64Array;
  private readonly popRise: Float64Array;
  private readonly popRiseSecond: Float64Array;
  private readonly popEmission: Float64Array;
  // Low-passed outgoing wave at each pipe's open end (unused for junction-to-junction pipes).
  private readonly outlet: Float64Array;
  private readonly openNormalization: number;
  private readonly smoothing: number;
  private readonly dcCoefficient: number;
  private readonly toneCoefficient: number;
  private readonly loss: number;
  private readonly settings: ExhaustSettings;
  private phase = 0;
  private pulseSeed = 123456789;
  private rpm = 1000;
  private load = 0;
  private dc = 0;
  private tone = 0;
  // Reused cascade weights, so firing events do not allocate.
  private readonly weights = new Float64Array(3);
  // Per-sample pulse weights shared by every pulse state; set at the start of each sample.
  private decayRate = 0;
  private decayStep = 0;
  private decayAverage = 0;
  private riseRate = 0;
  private stageStep = 0;
  private stageLink = 0;
  private firstCoupling = 0;
  private secondCoupling = 0;

  constructor(
    private readonly sound: CompiledEngineSound,
    private readonly rate: number,
    settings: Partial<ExhaustSettings> = {},
    control: Partial<ControlSettings> = {},
  ) {
    this.settings = resolveExhaustSettings(settings);
    const n = sound.firingPhases.length;
    const exhaust = sound.exhaust;
    this.banks = exhaust.banks;
    const { pipes } = exhaust;
    let groups = Math.max(...this.banks) + 1;
    for (const { from, to } of pipes) groups = Math.max(groups, from + 1, (to ?? 0) + 1);
    const pipe = (meters: number) =>
      new Delay((meters * rate) / ACOUSTICS.waveSpeed, Math.exp(-PIPE_COEFFICIENTS.attenuationPerMeter * meters));
    this.forward = exhaust.lengths.map(pipe);
    this.backward = exhaust.lengths.map(pipe);
    this.downstream = pipes.map(({ length }) => pipe(length));
    this.upstream = pipes.map(({ length }) => pipe(length));
    this.pipeFrom = Int32Array.from(pipes, ({ from }) => from);
    this.pipeTo = Int32Array.from(pipes, ({ to }) => to ?? -1);
    this.arriving = new Float64Array(pipes.length);
    this.returning = new Float64Array(pipes.length);
    // Every port of a junction: its cylinders' primaries and each pipe end attached to it.
    this.counts = new Float64Array(groups);
    for (const { from, to } of pipes) {
      this.counts[from]!++;
      if (to !== null) this.counts[to]!++;
    }
    this.sums = new Float64Array(groups);
    this.junctions = new Float64Array(groups);
    this.outlet = new Float64Array(pipes.length);
    this.pulse = new Float64Array(n);
    this.rise = new Float64Array(n);
    this.riseSecond = new Float64Array(n);
    this.emission = new Float64Array(n);
    this.wall = new Float64Array(n);
    this.popPulse = new Float64Array(groups);
    this.popRise = new Float64Array(groups);
    this.popRiseSecond = new Float64Array(groups);
    this.popEmission = new Float64Array(groups);
    this.openNormalization = Math.sqrt(pipes.filter(({ to }) => to === null).length);
    for (const bank of this.banks) this.counts[bank]!++;
    this.smoothing = 1 - Math.exp(-1 / (resolveControlSettings(control).observationSeconds * rate));
    this.dcCoefficient = 1 - Math.exp((-2 * Math.PI * this.settings.dcHz) / rate);
    this.toneCoefficient = 1 - Math.exp((-2 * Math.PI * this.settings.outputCutoffHz) / rate);
    this.loss = 1 - Math.exp((-2 * Math.PI * PIPE_COEFFICIENTS.returnCutoffHz) / rate);
  }

  /** One seeded xorshift32 draw in [-1, 1); called only at firing events. */
  private draw(): number {
    this.pulseSeed ^= this.pulseSeed << 13;
    this.pulseSeed ^= this.pulseSeed >>> 17;
    this.pulseSeed ^= this.pulseSeed << 5;
    return this.pulseSeed / 2147483648;
  }

  /**
   * Advance one pulse state by a sample, emitting the sample average of r2. Integrating each stage equation gives
   * the exact average: mean(r2) = mean(p) - (delta r1 + delta r2) / riseRate.
   */
  private advancePulse(
    pulse: Float64Array,
    rise: Float64Array,
    riseSecond: Float64Array,
    emission: Float64Array,
    i: number,
  ): void {
    const p = pulse[i]!;
    const r1 = rise[i]!;
    const r2 = riseSecond[i]!;
    const nextFirst = this.stageStep * r1 + this.firstCoupling * p;
    const nextSecond = this.stageStep * r2 + this.stageLink * r1 + this.secondCoupling * p;
    emission[i] = this.decayAverage * p - (nextFirst - r1 + nextSecond - r2) / this.riseRate;
    rise[i] = nextFirst;
    riseSecond[i] = nextSecond;
    pulse[i] = p * this.decayStep;
  }

  /** Fire an advanced pulse state `elapsed` samples before the sample end; both rise stages stay continuous. */
  private firePulse(
    pulse: Float64Array,
    rise: Float64Array,
    riseSecond: Float64Array,
    emission: Float64Array,
    i: number,
    strength: number,
    elapsed: number,
  ): void {
    const weights = this.weights;
    pulseCascade(this.decayRate, this.riseRate, elapsed, weights);
    const decay = weights[0]!;
    const jump = strength - pulse[i]! / decay;
    rise[i]! += jump * weights[1]!;
    riseSecond[i]! += jump * weights[2]!;
    emission[i]! +=
      jump * (-Math.expm1(-this.decayRate * elapsed) / this.decayRate - (weights[1]! + weights[2]!) / this.riseRate);
    pulse[i] = strength * decay;
  }

  /** One acoustic step at the supplied internal rate, without allocation. */
  sample(targetRpm: number, targetLoad: number, fuelCut: boolean, overrun: boolean): number {
    this.rpm += this.smoothing * (targetRpm - this.rpm);
    this.load += this.smoothing * (targetLoad - this.load);
    const step = this.rpm / (60 * this.sound.cycleRevolutions * this.rate);
    const previous = this.phase;
    this.phase = (this.phase + step) % 1;
    // Crank degrees to samples at the smoothed RPM: D degrees last D / (6 * rpm) seconds.
    const samplesPerDegree = this.rate / (6 * this.rpm);
    const decayRate = 1 / (this.settings.pulseDecayDegrees * samplesPerDegree);
    this.decayRate = decayRate;
    this.decayAverage = -Math.expm1(-decayRate) / decayRate;
    // One excitation control: stronger pulses also rise faster. No load-dependent output EQ/drive.
    // Fuel cut is a boolean observation, never smoothed: firings pump without combustion.
    const excitation = fuelCut
      ? this.settings.pumpingExcitation
      : this.settings.closedExcitation + (1 - this.settings.closedExcitation) * this.load;
    const riseTime = ((this.settings.pulseRiseMs / 1000) * this.rate) / excitation;
    // Two stages of riseTime / 2 each keep the one-stage mean delay riseTime while the onset slope starts at zero.
    const riseRate = 2 / riseTime;
    this.riseRate = riseRate;
    this.stageStep = Math.exp(-riseRate);
    this.stageLink = riseRate * this.stageStep;
    // Prepare the one-sample cascade weights once for all pulse states.
    pulseCascade(decayRate, riseRate, 1, this.weights);
    this.decayStep = this.weights[0]!;
    this.firstCoupling = this.weights[1]!;
    this.secondCoupling = this.weights[2]!;
    this.sums.fill(0);
    for (let bank = 0; bank < this.popPulse.length; bank++)
      this.advancePulse(this.popPulse, this.popRise, this.popRiseSecond, this.popEmission, bank);
    for (let i = 0; i < this.pulse.length; i++) {
      const offset = this.sound.firingPhases[i]!;
      const crossed =
        this.phase >= previous ? offset > previous && offset <= this.phase : offset > previous || offset <= this.phase;
      this.advancePulse(this.pulse, this.rise, this.riseSecond, this.emission, i);
      if (crossed) {
        let strength = excitation;
        // Variation is combustion spread, so pumping pulses have none.
        // Random draws occur only at firing events, never as a continuous noise generator or a timing perturbation.
        if (!fuelCut && this.settings.pulseVariation > 0)
          strength = Math.max(0, excitation + this.settings.pulseVariation * this.draw());
        // Resolve the event inside this sample; preserve the continuous rise states at the reset.
        const elapsed = (this.phase >= offset ? this.phase - offset : this.phase - offset + 1) / step;
        this.firePulse(this.pulse, this.rise, this.riseSecond, this.emission, i, strength, elapsed);
        // During overrun a separate draw decides a pop; the combustion pulse above still sounds.
        if (overrun && (this.draw() + 1) / 2 < this.settings.popProbability)
          this.firePulse(
            this.popPulse,
            this.popRise,
            this.popRiseSecond,
            this.popEmission,
            this.banks[i]!,
            this.settings.popStrength,
            elapsed,
          );
      }
      this.sums[this.banks[i]!]! += this.forward[i]!.read();
    }
    // Pops enter each collector junction as an additional incoming pressure.
    for (let bank = 0; bank < this.popEmission.length; bank++) this.sums[bank]! += this.popEmission[bank]!;
    // Read every pipe end before any write: a delay's read and write share one position per sample.
    const arriving = this.arriving;
    const returning = this.returning;
    for (let j = 0; j < this.downstream.length; j++) {
      arriving[j] = this.downstream[j]!.read();
      returning[j] = this.upstream[j]!.read();
    }
    // Incoming waves at each junction; a pipe's `from` end receives its upstream wave, its `to` end its downstream.
    for (let j = 0; j < arriving.length; j++) {
      this.sums[this.pipeFrom[j]!]! += returning[j]!;
      const to = this.pipeTo[j]!;
      if (to >= 0) this.sums[to]! += arriving[j]!;
    }
    // Equal-admittance scattering at every junction: p = 2 sum(incoming) / number of ports.
    for (let k = 0; k < this.junctions.length; k++) this.junctions[k] = (2 * this.sums[k]!) / this.counts[k]!;
    let exhaust = 0;
    for (let j = 0; j < arriving.length; j++) {
      const to = this.pipeTo[j]!;
      this.downstream[j]!.write(this.junctions[this.pipeFrom[j]!]! - returning[j]!);
      if (to >= 0) {
        this.upstream[j]!.write(this.junctions[to]! - arriving[j]!);
        continue;
      }
      // Open end: low-passed negative reflection; the pickup hears the outgoing and low-passed waves.
      const out = arriving[j]!;
      this.outlet[j]! += this.loss * (out - this.outlet[j]!);
      this.upstream[j]!.write(PIPE_COEFFICIENTS.outletReflection * this.outlet[j]!);
      exhaust += out + this.outlet[j]!;
    }
    for (let i = 0; i < this.backward.length; i++) {
      const age = (this.phase - this.sound.firingPhases[i]! + 1) % 1;
      const position = age / this.settings.cylinderWindowCycles;
      const aperture = position < 1 ? position * (1 - position) : 0;
      // Unit-height quartic aperture: zero value and slope at both ends, without a trig call.
      const opening = 16 * aperture * aperture;
      this.wall[i]! += this.loss * (this.backward[i]!.read() - this.wall[i]!);
      const reflection =
        this.settings.cylinderClosedReflection +
        (this.settings.cylinderOpenReflection - this.settings.cylinderClosedReflection) * opening;
      const incoming = this.forward[i]!.read();
      this.forward[i]!.write(this.emission[i]! + reflection * this.wall[i]!);
      this.backward[i]!.write(this.junctions[this.banks[i]!]! - incoming);
    }
    const raw = exhaust / this.openNormalization;
    this.dc += this.dcCoefficient * (raw - this.dc);
    // Smooth, bounded saturation; no table clipping or unconstrained feedback gain.
    const x = raw - this.dc;
    const clipped = (this.settings.clipCeiling * x) / (1 + Math.abs(x));
    // The final one-pole also attenuates high frequencies generated by saturation.
    this.tone += this.toneCoefficient * (clipped - this.tone);
    return this.tone;
  }
}
