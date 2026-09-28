import type { CompiledEngineSound } from './engine-sound.js';

import { ACOUSTICS, OUTPUT, PIPE_COEFFICIENTS, resolveExhaustSettings } from './exhaust-acoustics.js';
import type { ExhaustSettings } from './exhaust-acoustics.js';
import { AUDIO_CONTROL_POLICY } from './audio-control-policy.js';

/** Exact coupling of an exponential decay into a one-pole rise, including equal time constants. */
function pulseCoupling(riseRate: number, decayRate: number, decay: number, retain: number, duration = 1): number {
  const difference = (riseRate - decayRate) * duration;
  return Math.abs(difference) < 1e-5
    ? riseRate * duration * decay * (1 - difference / 2 + (difference * difference) / 6)
    : (riseRate * (decay - retain)) / (riseRate - decayRate);
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
  private readonly emission: Float64Array;
  private readonly wall: Float64Array;
  // One pop pulse per collector, injected at its junction.
  private readonly popPulse: Float64Array;
  private readonly popRise: Float64Array;
  private readonly popEmission: Float64Array;
  private readonly outlet: Float64Array;
  private readonly bankNormalization: number;
  private readonly smoothing: number;
  private readonly dcCoefficient: number;
  private readonly toneCoefficient: number;
  private readonly loss: number;
  private readonly settings: ExhaustSettings;
  // Decay weights are fixed by pulseDecayMs; rise weights depend on excitation and are set each sample.
  private readonly decayRate: number;
  private readonly decayStep: number;
  private readonly decayIntegral: number;
  private phase = 0;
  private pulseSeed = 123456789;
  private rpm = 1000;
  private load = 0;
  private dc = 0;
  private tone = 0;
  // Per-sample pulse weights shared by every pulse state; set at the start of each sample.
  private riseRate = 0;
  private riseTime = 0;
  private retain = 0;
  private coupling = 0;
  private pulseAverage = 0;
  private riseAverage = 0;

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
    this.emission = new Float64Array(n);
    this.wall = new Float64Array(n);
    this.popPulse = new Float64Array(groups);
    this.popRise = new Float64Array(groups);
    this.popEmission = new Float64Array(groups);
    this.bankNormalization = Math.sqrt(groups);
    for (const bank of this.banks) this.counts[bank]!++;
    this.smoothing = 1 - Math.exp(-1 / (AUDIO_CONTROL_POLICY.observationSeconds * rate));
    this.dcCoefficient = 1 - Math.exp((-2 * Math.PI * OUTPUT.dcHz) / rate);
    this.toneCoefficient = 1 - Math.exp((-2 * Math.PI * this.settings.outputCutoffHz) / rate);
    this.loss = 1 - Math.exp((-2 * Math.PI * PIPE_COEFFICIENTS.returnCutoffHz) / rate);
    this.decayRate = 1 / ((this.settings.pulseDecayMs / 1000) * rate);
    this.decayStep = Math.exp(-this.decayRate);
    this.decayIntegral = -Math.expm1(-this.decayRate) / this.decayRate;
  }

  /** One seeded xorshift32 draw in [-1, 1); called only at firing events. */
  private draw(): number {
    this.pulseSeed ^= this.pulseSeed << 13;
    this.pulseSeed ^= this.pulseSeed >>> 17;
    this.pulseSeed ^= this.pulseSeed << 5;
    return this.pulseSeed / 2147483648;
  }

  /** Advance one pulse state by a sample: r' = riseRate * (pulse - r), emitting its sample average. */
  private advancePulse(pulse: Float64Array, rise: Float64Array, emission: Float64Array, i: number): void {
    const p = pulse[i]!;
    const r = rise[i]!;
    emission[i] = this.pulseAverage * p + this.riseAverage * r;
    rise[i] = this.retain * r + this.coupling * p;
    pulse[i] = p * this.decayStep;
  }

  /** Fire an advanced pulse state `elapsed` samples before the sample end; the rise state stays continuous. */
  private firePulse(
    pulse: Float64Array,
    rise: Float64Array,
    emission: Float64Array,
    i: number,
    strength: number,
    elapsed: number,
  ): void {
    const decay = Math.exp(-this.decayRate * elapsed);
    const after = pulseCoupling(this.riseRate, this.decayRate, decay, Math.exp(-this.riseRate * elapsed), elapsed);
    const jump = strength - pulse[i]! / decay;
    rise[i]! += after * jump;
    emission[i]! += jump * ((1 - decay) / this.decayRate - after * this.riseTime);
    pulse[i] = strength * decay;
  }

  /** One acoustic step at the supplied internal rate, without allocation. */
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
    const riseRate = 1 / riseTime;
    const retain = Math.exp(-riseRate);
    const coupling = pulseCoupling(riseRate, this.decayRate, this.decayStep, retain);
    // Integrate r' = riseRate * (pulse - r). Prepare weights once for all cylinders.
    this.riseRate = riseRate;
    this.riseTime = riseTime;
    this.retain = retain;
    this.coupling = coupling;
    this.pulseAverage = this.decayIntegral - coupling * riseTime;
    this.riseAverage = (1 - retain) * riseTime;
    this.sums.fill(0);
    for (let bank = 0; bank < this.popPulse.length; bank++)
      this.advancePulse(this.popPulse, this.popRise, this.popEmission, bank);
    for (let i = 0; i < this.pulse.length; i++) {
      const offset = this.sound.firingPhases[i]!;
      const crossed =
        this.phase >= previous ? offset > previous && offset <= this.phase : offset > previous || offset <= this.phase;
      this.advancePulse(this.pulse, this.rise, this.emission, i);
      if (crossed) {
        let strength = excitation;
        // Variation is combustion spread, so pumping pulses have none.
        // Random draws occur only at firing events, never as a continuous noise generator or a timing perturbation.
        if (!fuelCut && this.settings.pulseVariation > 0)
          strength = Math.max(0, excitation + this.settings.pulseVariation * this.draw());
        // Resolve the event inside this sample; preserve the continuous rise state at the reset.
        const elapsed = (this.phase >= offset ? this.phase - offset : this.phase - offset + 1) / step;
        this.firePulse(this.pulse, this.rise, this.emission, i, strength, elapsed);
        // During overrun a separate draw decides a pop; the combustion pulse above still sounds.
        if (overrun && (this.draw() + 1) / 2 < this.settings.popProbability)
          this.firePulse(
            this.popPulse,
            this.popRise,
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
      this.forward[i]!.write(this.emission[i]! + reflection * this.wall[i]!);
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
