import type { CompiledEngineSound } from './engine-sound.js';

import { ACOUSTICS, OUTPUT, PIPE_COEFFICIENTS, resolveExhaustSettings } from './exhaust-acoustics.js';
import type { ExhaustSettings } from './exhaust-acoustics.js';
import { AUDIO_CONTROL_POLICY } from './audio-control-policy.js';

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

/** One-sample weights of a pulse cascade at the current decay and rise rates; set at the start of each sample. */
class PulseWeights {
  // Reused cascade weights, so firing events do not allocate.
  readonly cascade = new Float64Array(3);
  decayRate = 0;
  decayStep = 0;
  decayAverage = 0;
  riseRate = 0;
  stageStep = 0;
  stageLink = 0;
  firstCoupling = 0;
  secondCoupling = 0;

  prepare(decayRate: number, riseRate: number): void {
    this.decayRate = decayRate;
    this.decayAverage = -Math.expm1(-decayRate) / decayRate;
    this.riseRate = riseRate;
    this.stageStep = Math.exp(-riseRate);
    this.stageLink = riseRate * this.stageStep;
    pulseCascade(decayRate, riseRate, 1, this.cascade);
    this.decayStep = this.cascade[0]!;
    this.firstCoupling = this.cascade[1]!;
    this.secondCoupling = this.cascade[2]!;
  }
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
  private readonly tails: Delay[];
  private readonly returns: Delay[];
  private readonly banks: readonly number[];
  private readonly counts: Float64Array;
  private readonly sums: Float64Array;
  private readonly junctions: Float64Array;
  private readonly pulse: Float64Array;
  private readonly rise: Float64Array;
  private readonly riseSecond: Float64Array;
  private readonly emission: Float64Array;
  // The piston's displacement pulse per cylinder, fired at every firing with or without combustion.
  private readonly displacement: Float64Array;
  private readonly displacementRise: Float64Array;
  private readonly displacementRiseSecond: Float64Array;
  private readonly displacementEmission: Float64Array;
  private readonly wall: Float64Array;
  // One pop pulse per collector, injected at its junction.
  private readonly popPulse: Float64Array;
  private readonly popRise: Float64Array;
  private readonly popRiseSecond: Float64Array;
  private readonly popEmission: Float64Array;
  private readonly outlet: Float64Array;
  private readonly bankNormalization: number;
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
  // Combustion weights also drive the pop pulses; displacement has its own decay and rise.
  private readonly combustionWeights = new PulseWeights();
  private readonly displacementWeights = new PulseWeights();

  constructor(
    private readonly sound: CompiledEngineSound,
    private readonly rate: number,
    settings: Partial<ExhaustSettings> = {},
  ) {
    this.settings = resolveExhaustSettings(settings);
    const n = sound.firingPhases.length;
    const exhaust = sound.exhaust;
    this.banks = exhaust.banks;
    const groups = Math.max(...this.banks) + 1;
    const pipe = (meters: number) =>
      new Delay((meters * rate) / ACOUSTICS.waveSpeed, Math.exp(-PIPE_COEFFICIENTS.attenuationPerMeter * meters));
    this.forward = exhaust.lengths.map(pipe);
    this.backward = exhaust.lengths.map(pipe);
    this.tails = Array.from({ length: groups }, () => pipe(exhaust.outlet));
    this.returns = Array.from({ length: groups }, () => pipe(exhaust.outlet));
    this.counts = new Float64Array(groups);
    this.sums = new Float64Array(groups);
    this.junctions = new Float64Array(groups);
    this.outlet = new Float64Array(groups);
    this.pulse = new Float64Array(n);
    this.rise = new Float64Array(n);
    this.riseSecond = new Float64Array(n);
    this.emission = new Float64Array(n);
    this.displacement = new Float64Array(n);
    this.displacementRise = new Float64Array(n);
    this.displacementRiseSecond = new Float64Array(n);
    this.displacementEmission = new Float64Array(n);
    this.wall = new Float64Array(n);
    this.popPulse = new Float64Array(groups);
    this.popRise = new Float64Array(groups);
    this.popRiseSecond = new Float64Array(groups);
    this.popEmission = new Float64Array(groups);
    this.bankNormalization = Math.sqrt(groups);
    for (const bank of this.banks) this.counts[bank]!++;
    this.smoothing = 1 - Math.exp(-1 / (AUDIO_CONTROL_POLICY.observationSeconds * rate));
    this.dcCoefficient = 1 - Math.exp((-2 * Math.PI * OUTPUT.dcHz) / rate);
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
    weights: PulseWeights,
    pulse: Float64Array,
    rise: Float64Array,
    riseSecond: Float64Array,
    emission: Float64Array,
    i: number,
  ): void {
    const p = pulse[i]!;
    const r1 = rise[i]!;
    const r2 = riseSecond[i]!;
    const nextFirst = weights.stageStep * r1 + weights.firstCoupling * p;
    const nextSecond = weights.stageStep * r2 + weights.stageLink * r1 + weights.secondCoupling * p;
    emission[i] = weights.decayAverage * p - (nextFirst - r1 + nextSecond - r2) / weights.riseRate;
    rise[i] = nextFirst;
    riseSecond[i] = nextSecond;
    pulse[i] = p * weights.decayStep;
  }

  /** Fire an advanced pulse state `elapsed` samples before the sample end; both rise stages stay continuous. */
  private firePulse(
    weights: PulseWeights,
    pulse: Float64Array,
    rise: Float64Array,
    riseSecond: Float64Array,
    emission: Float64Array,
    i: number,
    strength: number,
    elapsed: number,
  ): void {
    const { decayRate, riseRate, cascade } = weights;
    pulseCascade(decayRate, riseRate, elapsed, cascade);
    const decay = cascade[0]!;
    const jump = strength - pulse[i]! / decay;
    rise[i]! += jump * cascade[1]!;
    riseSecond[i]! += jump * cascade[2]!;
    emission[i]! += jump * (-Math.expm1(-decayRate * elapsed) / decayRate - (cascade[1]! + cascade[2]!) / riseRate);
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
    // One excitation control: stronger pulses also rise faster. No load-dependent output EQ/drive.
    const excitation = this.settings.closedExcitation + (1 - this.settings.closedExcitation) * this.load;
    // Two stages of riseTime / 2 each keep the one-stage mean delay riseTime while the onset slope starts at zero.
    // Rise time is pulseRiseMs divided by the pulse's excitation; displacement uses pumpingExcitation.
    const riseSamples = (this.settings.pulseRiseMs / 1000) * this.rate;
    this.combustionWeights.prepare(
      1 / (this.settings.pulseDecayDegrees * samplesPerDegree),
      (2 * excitation) / riseSamples,
    );
    this.displacementWeights.prepare(
      1 / (this.settings.displacementDecayDegrees * samplesPerDegree),
      (2 * this.settings.pumpingExcitation) / riseSamples,
    );
    this.sums.fill(0);
    for (let bank = 0; bank < this.popPulse.length; bank++)
      this.advancePulse(
        this.combustionWeights,
        this.popPulse,
        this.popRise,
        this.popRiseSecond,
        this.popEmission,
        bank,
      );
    for (let i = 0; i < this.pulse.length; i++) {
      const offset = this.sound.firingPhases[i]!;
      const crossed =
        this.phase >= previous ? offset > previous && offset <= this.phase : offset > previous || offset <= this.phase;
      this.advancePulse(this.combustionWeights, this.pulse, this.rise, this.riseSecond, this.emission, i);
      this.advancePulse(
        this.displacementWeights,
        this.displacement,
        this.displacementRise,
        this.displacementRiseSecond,
        this.displacementEmission,
        i,
      );
      if (crossed) {
        // Resolve the event inside this sample; preserve the continuous rise states at the reset.
        const elapsed = (this.phase >= offset ? this.phase - offset : this.phase - offset + 1) / step;
        // The piston's push sounds at every firing, without variation.
        this.firePulse(
          this.displacementWeights,
          this.displacement,
          this.displacementRise,
          this.displacementRiseSecond,
          this.displacementEmission,
          i,
          this.settings.pumpingExcitation,
          elapsed,
        );
        // Fuel cut is a boolean observation, never smoothed: it skips only the combustion pulse.
        if (!fuelCut) {
          let strength = excitation;
          // Random draws occur only at firing events, never as a continuous noise generator or a timing perturbation.
          if (this.settings.pulseVariation > 0)
            strength = Math.max(0, excitation + this.settings.pulseVariation * this.draw());
          this.firePulse(
            this.combustionWeights,
            this.pulse,
            this.rise,
            this.riseSecond,
            this.emission,
            i,
            strength,
            elapsed,
          );
        }
        // During overrun a separate draw decides a pop; the combustion pulse above still sounds.
        if (overrun && (this.draw() + 1) / 2 < this.settings.popProbability)
          this.firePulse(
            this.combustionWeights,
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
    let exhaust = 0;
    for (let bank = 0; bank < this.tails.length; bank++) {
      const returning = this.returns[bank]!.read();
      const out = this.tails[bank]!.read();
      this.outlet[bank]! += this.loss * (out - this.outlet[bank]!);
      this.returns[bank]!.write(PIPE_COEFFICIENTS.outletReflection * this.outlet[bank]!);
      // Equal-admittance scattering: p = 2 sum(incoming) / number of ports.
      const pressure = (2 * (this.sums[bank]! + returning)) / (this.counts[bank]! + 1);
      this.junctions[bank] = pressure;
      this.tails[bank]!.write(pressure - returning);
      exhaust += out + this.outlet[bank]!;
    }
    for (let i = 0; i < this.backward.length; i++) {
      // Cycle fraction since this cylinder's exhaust opened, as crank degrees across the open duration.
      const age = (this.phase - this.sound.firingPhases[i]! + 1) % 1;
      const position = age / ACOUSTICS.cylinderWindowCycles;
      const aperture = position < 1 ? position * (1 - position) : 0;
      // Unit-height quartic aperture: zero value and slope at both ends, without a trig call.
      const opening = 16 * aperture * aperture;
      this.wall[i]! += this.loss * (this.backward[i]!.read() - this.wall[i]!);
      const reflection =
        ACOUSTICS.cylinderClosedReflection +
        (ACOUSTICS.cylinderOpenReflection - ACOUSTICS.cylinderClosedReflection) * opening;
      const incoming = this.forward[i]!.read();
      this.forward[i]!.write(this.emission[i]! + this.displacementEmission[i]! + reflection * this.wall[i]!);
      this.backward[i]!.write(this.junctions[this.banks[i]!]! - incoming);
    }
    const raw = exhaust / this.bankNormalization;
    this.dc += this.dcCoefficient * (raw - this.dc);
    // Smooth, bounded saturation; no table clipping or unconstrained feedback gain.
    const x = raw - this.dc;
    const clipped = (OUTPUT.ceiling * x) / (1 + Math.abs(x));
    // The final one-pole also attenuates high frequencies generated by saturation.
    this.tone += this.toneCoefficient * (clipped - this.tone);
    return this.tone;
  }
}
