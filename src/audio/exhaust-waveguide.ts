import type { VehicleEngineSound } from './vehicle-engine-sound.js';

import { ACOUSTICS, OUTLET_REFLECTION, openEndCutoffHz, wallLossPole } from './exhaust-acoustics.js';
import type { ExhaustSettings } from './exhaust-acoustics.js';
import type { ControlSettings } from './audio-control-policy.js';
import { DEFAULT_AUDIO_SETTINGS } from './audio-defaults.js';

/**
 * Below this |x| = |riseRate − decayRate| · duration, the pulse cascade uses its series. The closed form's second weight
 * `(first − e^−x)/x` subtracts two values near 1, losing about eps/|x| relative accuracy; the series truncated after x⁴
 * errs by at most |x|⁵/720 (first) and |x|⁵/840 (second). At 1e-2 both are below 3e-13 relative, far below the
 * worklet's 32-bit output resolution (about 6e-8), so either form is exact for the output on both sides of the switch.
 */
const PULSE_CASCADE_SERIES_LIMIT = 1e-2;

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
  if (Math.abs(x) < PULSE_CASCADE_SERIES_LIMIT) {
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

/**
 * One way through a tube: a fixed delay of its length, rounded to whole samples, and its wall loss, a one-pole
 * low-pass of unity DC gain (`wallLossPole`) on each traversal.
 */
class Delay {
  private readonly data: Float32Array;
  private readonly follow: number;
  private position = 0;
  private lossState = 0;
  constructor(meters: number, diameter: number, rate: number) {
    this.data = new Float32Array(Math.max(1, Math.round((meters * rate) / ACOUSTICS.waveSpeed)));
    this.follow = 1 - wallLossPole(meters, diameter, rate);
  }
  read(): number {
    return this.data[this.position]!;
  }
  write(value: number): void {
    this.lossState += this.follow * (value - this.lossState);
    this.data[this.position] = this.lossState;
    this.position = (this.position + 1) % this.data.length;
  }
}

/** The one-pole coefficient of an open end's return low-pass for a tube of `diameter`. */
const openEndFollow = (diameter: number, rate: number) =>
  1 - Math.exp((-2 * Math.PI * openEndCutoffHz(diameter)) / rate);

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
  // Each cylinder's junction (its primary's `to`).
  private readonly banks: Int32Array;
  // Each port's share of its junction's cross-section: primaries, then each pipe's `from` and `to` ends.
  private readonly primaryShare: Float64Array;
  private readonly fromShare: Float64Array;
  private readonly toShare: Float64Array;
  // Area-weighted incoming pressure at each junction.
  private readonly sums: Float64Array;
  private readonly junctions: Float64Array;
  private readonly pulse: Float64Array;
  private readonly rise: Float64Array;
  private readonly riseSecond: Float64Array;
  private readonly emission: Float64Array;
  // Each cylinder's greatest valve area over its primary's cross-section.
  private readonly valveRatio: Float64Array;
  // One pop pulse per collector, injected at its junction.
  private readonly popPulse: Float64Array;
  private readonly popRise: Float64Array;
  private readonly popRiseSecond: Float64Array;
  private readonly popEmission: Float64Array;
  // A pop's weight at its junction: one port's share, as an equal-admittance port.
  private readonly popShare: Float64Array;
  // Low-passed outgoing wave at each pipe's open end (unused for junction-to-junction pipes), and its coefficient.
  private readonly outlet: Float64Array;
  private readonly outletFollow: Float64Array;
  private readonly openNormalization: number;
  private readonly smoothing: number;
  private readonly dcCoefficient: number;
  private readonly toneCoefficient: number;
  private readonly settings: ExhaustSettings;
  private phase = 0;
  private pulseSeed = 123456789;
  private rpm = 1000;
  private load = 0;
  private dc = 0;
  private tone = 0;
  // Reused cascade weights, so firing events do not allocate.
  private readonly weights = new Float64Array(3);
  // Cylinders of equal blowdown share a decay group: its rate per sample, its sample-average decay and its weights.
  private readonly cylinderGroup: Int32Array;
  private readonly decayRates: Float64Array;
  private readonly decayAverages: Float64Array;
  // Per-sample pulse weights of each decay group; set at the start of each sample.
  private readonly decaySteps: Float64Array;
  private readonly firstCouplings: Float64Array;
  private readonly secondCouplings: Float64Array;
  // A pop's decay group: that of the cylinder that fired it.
  private readonly popGroup: Int32Array;
  // Per-sample rise weights shared by every pulse state.
  private riseRate = 0;
  private stageStep = 0;
  private stageLink = 0;

  constructor(
    private readonly sound: VehicleEngineSound,
    private readonly rate: number,
    settings: ExhaustSettings = DEFAULT_AUDIO_SETTINGS.exhaust,
    control: ControlSettings = DEFAULT_AUDIO_SETTINGS.control,
  ) {
    this.settings = settings;
    const n = sound.firingPhases.length;
    const { primaries, pipes } = sound.exhaust;
    this.banks = Int32Array.from(primaries, ({ to }) => to);
    let groups = 0;
    for (const { to } of primaries) groups = Math.max(groups, to + 1);
    for (const { from, to } of pipes) groups = Math.max(groups, from + 1, (to ?? 0) + 1);
    const tube = ({ length, diameter }: { length: number; diameter: number }) => new Delay(length, diameter, rate);
    this.forward = primaries.map(tube);
    this.backward = primaries.map(tube);
    this.downstream = pipes.map(tube);
    this.upstream = pipes.map(tube);
    this.pipeFrom = Int32Array.from(pipes, ({ from }) => from);
    this.pipeTo = Int32Array.from(pipes, ({ to }) => to ?? -1);
    this.arriving = new Float64Array(pipes.length);
    this.returning = new Float64Array(pipes.length);
    // Every port of a junction, its cylinders' primaries and each pipe end attached to it, weighted by its area.
    const area = ({ diameter }: { diameter: number }) => diameter * diameter;
    const junctionArea = new Float64Array(groups);
    for (const primary of primaries) junctionArea[primary.to]! += area(primary);
    for (const pipe of pipes) {
      junctionArea[pipe.from]! += area(pipe);
      if (pipe.to !== null) junctionArea[pipe.to]! += area(pipe);
    }
    this.primaryShare = Float64Array.from(primaries, (primary) => area(primary) / junctionArea[primary.to]!);
    this.fromShare = Float64Array.from(pipes, (pipe) => area(pipe) / junctionArea[pipe.from]!);
    this.toShare = Float64Array.from(pipes, (pipe) => (pipe.to === null ? 0 : area(pipe) / junctionArea[pipe.to]!));
    this.sums = new Float64Array(groups);
    this.junctions = new Float64Array(groups);
    this.outlet = new Float64Array(pipes.length);
    this.outletFollow = Float64Array.from(pipes, ({ diameter }) => openEndFollow(diameter, rate));
    const { valve } = sound.exhaust;
    this.valveRatio = Float64Array.from(primaries, ({ diameter }) => (valve.diameter / diameter) ** 2);
    this.pulse = new Float64Array(n);
    this.rise = new Float64Array(n);
    this.riseSecond = new Float64Array(n);
    this.emission = new Float64Array(n);
    this.popPulse = new Float64Array(groups);
    this.popRise = new Float64Array(groups);
    this.popRiseSecond = new Float64Array(groups);
    this.popEmission = new Float64Array(groups);
    const ports = new Float64Array(groups);
    for (const { to } of primaries) ports[to]!++;
    for (const { from, to } of pipes) {
      ports[from]!++;
      if (to !== null) ports[to]!++;
    }
    this.popShare = Float64Array.from(ports, (count) => 1 / count);
    this.popGroup = new Int32Array(groups);
    // Blowdown lasts an absolute time, whatever the RPM: each decay rate is constant.
    const rates = sound.pulseDecaySeconds.map((seconds) => 1 / (seconds * rate));
    const distinct = [...new Set(rates)];
    this.cylinderGroup = Int32Array.from(rates, (decay) => distinct.indexOf(decay));
    this.decayRates = Float64Array.from(distinct);
    this.decayAverages = Float64Array.from(distinct, (decay) => -Math.expm1(-decay) / decay);
    this.decaySteps = new Float64Array(distinct.length);
    this.firstCouplings = new Float64Array(distinct.length);
    this.secondCouplings = new Float64Array(distinct.length);
    this.openNormalization = Math.sqrt(pipes.filter(({ to }) => to === null).length);
    this.smoothing = 1 - Math.exp(-1 / (control.observationSeconds * rate));
    this.dcCoefficient = 1 - Math.exp((-2 * Math.PI * sound.dcHz) / rate);
    this.toneCoefficient = 1 - Math.exp((-2 * Math.PI * sound.outputCutoffHz) / rate);
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
    group: number,
  ): void {
    const p = pulse[i]!;
    const r1 = rise[i]!;
    const r2 = riseSecond[i]!;
    const nextFirst = this.stageStep * r1 + this.firstCouplings[group]! * p;
    const nextSecond = this.stageStep * r2 + this.stageLink * r1 + this.secondCouplings[group]! * p;
    emission[i] = this.decayAverages[group]! * p - (nextFirst - r1 + nextSecond - r2) / this.riseRate;
    rise[i] = nextFirst;
    riseSecond[i] = nextSecond;
    pulse[i] = p * this.decaySteps[group]!;
  }

  /** Fire an advanced pulse state `elapsed` samples before the sample end; both rise stages stay continuous. */
  private firePulse(
    pulse: Float64Array,
    rise: Float64Array,
    riseSecond: Float64Array,
    emission: Float64Array,
    i: number,
    group: number,
    strength: number,
    elapsed: number,
  ): void {
    const weights = this.weights;
    const decayRate = this.decayRates[group]!;
    pulseCascade(decayRate, this.riseRate, elapsed, weights);
    const decay = weights[0]!;
    const jump = strength - pulse[i]! / decay;
    rise[i]! += jump * weights[1]!;
    riseSecond[i]! += jump * weights[2]!;
    emission[i]! +=
      jump * (-Math.expm1(-decayRate * elapsed) / decayRate - (weights[1]! + weights[2]!) / this.riseRate);
    pulse[i] = strength * decay;
  }

  /**
   * One acoustic step at the supplied internal rate, without allocation: the exhaust's pressure at the pickup, DC
   * removed and kept below the widest outlet's first transverse mode.
   */
  sample(targetRpm: number, targetLoad: number, fuelCut: boolean, overrun: boolean): number {
    this.rpm += this.smoothing * (targetRpm - this.rpm);
    this.load += this.smoothing * (targetLoad - this.load);
    const step = this.rpm / (60 * this.sound.cycleRevolutions * this.rate);
    const previous = this.phase;
    this.phase = (this.phase + step) % 1;
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
    // Prepare the one-sample cascade weights once for each decay group.
    for (let group = 0; group < this.decayRates.length; group++) {
      pulseCascade(this.decayRates[group]!, riseRate, 1, this.weights);
      this.decaySteps[group] = this.weights[0]!;
      this.firstCouplings[group] = this.weights[1]!;
      this.secondCouplings[group] = this.weights[2]!;
    }
    this.sums.fill(0);
    for (let bank = 0; bank < this.popPulse.length; bank++)
      this.advancePulse(this.popPulse, this.popRise, this.popRiseSecond, this.popEmission, bank, this.popGroup[bank]!);
    for (let i = 0; i < this.pulse.length; i++) {
      const offset = this.sound.firingPhases[i]!;
      const crossed =
        this.phase >= previous ? offset > previous && offset <= this.phase : offset > previous || offset <= this.phase;
      const group = this.cylinderGroup[i]!;
      this.advancePulse(this.pulse, this.rise, this.riseSecond, this.emission, i, group);
      if (crossed) {
        let strength = excitation;
        // Variation is combustion spread, so pumping pulses have none.
        // Random draws occur only at firing events, never as a continuous noise generator or a timing perturbation.
        if (!fuelCut && this.settings.pulseVariation > 0)
          strength = Math.max(0, excitation + this.settings.pulseVariation * this.draw());
        // Resolve the event inside this sample; preserve the continuous rise states at the reset.
        const elapsed = (this.phase >= offset ? this.phase - offset : this.phase - offset + 1) / step;
        this.firePulse(this.pulse, this.rise, this.riseSecond, this.emission, i, group, strength, elapsed);
        // During overrun a separate draw decides a pop; the combustion pulse above still sounds.
        if (overrun && (this.draw() + 1) / 2 < this.settings.popProbability) {
          const bank = this.banks[i]!;
          this.popGroup[bank] = group;
          this.firePulse(
            this.popPulse,
            this.popRise,
            this.popRiseSecond,
            this.popEmission,
            bank,
            group,
            this.settings.popStrength,
            elapsed,
          );
        }
      }
      this.sums[this.banks[i]!]! += this.primaryShare[i]! * this.forward[i]!.read();
    }
    // Pops enter each collector junction as an additional incoming pressure on one port's share.
    for (let bank = 0; bank < this.popEmission.length; bank++)
      this.sums[bank]! += this.popShare[bank]! * this.popEmission[bank]!;
    // Read every pipe end before any write: a delay's read and write share one position per sample.
    const arriving = this.arriving;
    const returning = this.returning;
    for (let j = 0; j < this.downstream.length; j++) {
      arriving[j] = this.downstream[j]!.read();
      returning[j] = this.upstream[j]!.read();
    }
    // Incoming waves at each junction; a pipe's `from` end receives its upstream wave, its `to` end its downstream.
    for (let j = 0; j < arriving.length; j++) {
      this.sums[this.pipeFrom[j]!]! += this.fromShare[j]! * returning[j]!;
      const to = this.pipeTo[j]!;
      if (to >= 0) this.sums[to]! += this.toShare[j]! * arriving[j]!;
    }
    // Area-weighted scattering at every junction: p = 2 sum(area * incoming) / sum(area).
    for (let k = 0; k < this.junctions.length; k++) this.junctions[k] = 2 * this.sums[k]!;
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
      this.outlet[j]! += this.outletFollow[j]! * (out - this.outlet[j]!);
      this.upstream[j]!.write(OUTLET_REFLECTION * this.outlet[j]!);
      exhaust += out + this.outlet[j]!;
    }
    const open = this.sound.exhaust.valve.open;
    for (let i = 0; i < this.backward.length; i++) {
      // The valve opens at the firing phase and is open for `open` of the cycle.
      const position = ((this.phase - this.sound.firingPhases[i]! + 1) % 1) / open;
      const lift = position < 1 ? position * (1 - position) : 0;
      // Unit-height quartic aperture: zero value and slope at both ends, without a trig call.
      const area = this.valveRatio[i]! * 16 * lift * lift;
      // The valve end reflects by the open valve's area against the primary's: closed, +1; open, the wave passes on.
      const reflection = (1 - area) / (1 + area);
      const incoming = this.forward[i]!.read();
      this.forward[i]!.write(this.emission[i]! + reflection * this.backward[i]!.read());
      this.backward[i]!.write(this.junctions[this.banks[i]!]! - incoming);
    }
    const raw = exhaust / this.openNormalization;
    this.dc += this.dcCoefficient * (raw - this.dc);
    // The pipes' one-dimensional model holds below the widest outlet's first transverse mode: keep that band.
    this.tone += this.toneCoefficient * (raw - this.dc - this.tone);
    return this.tone;
  }
}
