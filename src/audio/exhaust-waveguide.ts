import type { VehicleAudioProfile } from './vehicle-audio-profile.js';

import { ACOUSTICS, resolveExhaustTuning, OUTPUT } from './exhaust-acoustics.js';
import type { ExhaustTuning } from './exhaust-acoustics.js';
import { AUDIO_TIMING } from './audio-presentation.js';

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
  private readonly outlet: Float64Array;
  private readonly bankNormalization: number;
  private readonly smoothing: number;
  private readonly decay: number;
  private readonly decayRate: number;
  private readonly decayIntegral: number;
  private readonly dcCoefficient: number;
  private readonly toneCoefficient: number;
  private readonly loss: number;
  private readonly tuning: ExhaustTuning;
  private phase = 0;
  private pulseSeed = 123456789;
  private rpm = 1000;
  private load = 0;
  private dc = 0;
  private tone = 0;

  constructor(
    private readonly profile: VehicleAudioProfile,
    private readonly rate: number,
    tuning: Partial<ExhaustTuning> = {},
  ) {
    this.tuning = resolveExhaustTuning(tuning);
    const { pulseDecayMs } = this.tuning;
    const n = profile.firingPhases.length;
    const exhaust = profile.exhaust;
    this.banks = exhaust.banks;
    const groups = Math.max(...this.banks) + 1;
    const pipe = (meters: number) =>
      new Delay((meters * rate) / ACOUSTICS.waveSpeed, Math.exp(-this.tuning.attenuationPerMeter * meters));
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
    this.bankNormalization = Math.sqrt(groups);
    for (const bank of this.banks) this.counts[bank]!++;
    this.smoothing = 1 - Math.exp(-1 / (AUDIO_TIMING.controlSeconds * rate));
    this.decayRate = 1 / ((pulseDecayMs / 1000) * rate);
    this.decay = Math.exp(-this.decayRate);
    this.decayIntegral = -Math.expm1(-this.decayRate) / this.decayRate;
    this.dcCoefficient = 1 - Math.exp((-2 * Math.PI * OUTPUT.dcHz) / rate);
    this.toneCoefficient = 1 - Math.exp((-2 * Math.PI * this.tuning.outputCutoffHz) / rate);
    this.loss = 1 - Math.exp((-2 * Math.PI * this.tuning.returnCutoffHz) / rate);
  }

  /** One acoustic step at the supplied internal rate, without allocation. */
  sample(targetRpm: number, targetLoad: number): number {
    this.rpm += this.smoothing * (targetRpm - this.rpm);
    this.load += this.smoothing * (targetLoad - this.load);
    const step = this.rpm / (60 * this.profile.cycleRevolutions * this.rate);
    const previous = this.phase;
    this.phase = (this.phase + step) % 1;
    // One excitation control: stronger pulses also rise faster. No load-dependent output EQ/drive.
    const excitation = this.tuning.closedExcitation + (1 - this.tuning.closedExcitation) * this.load;
    const riseTime = ((this.tuning.pulseRiseMs / 1000) * this.rate) / excitation;
    const riseRate = 1 / riseTime;
    const retain = Math.exp(-riseRate);
    const coupling = pulseCoupling(riseRate, this.decayRate, this.decay, retain);
    // Integrate r' = riseRate * (pulse - r). Prepare weights once for all cylinders.
    const pulseAverage = this.decayIntegral - coupling * riseTime;
    const riseAverage = (1 - retain) * riseTime;
    this.sums.fill(0);
    for (let i = 0; i < this.pulse.length; i++) {
      const offset = this.profile.firingPhases[i]!;
      const crossed =
        this.phase >= previous ? offset > previous && offset <= this.phase : offset > previous || offset <= this.phase;
      const pulse = this.pulse[i]!;
      const rise = this.rise[i]!;
      this.emission[i] = pulseAverage * pulse + riseAverage * rise;
      this.rise[i] = retain * rise + coupling * pulse;
      this.pulse[i] = pulse * this.decay;
      if (crossed) {
        let strength = excitation;
        if (this.tuning.pulseVariation > 0) {
          // One random draw per firing, never a continuous noise generator or a timing perturbation.
          this.pulseSeed ^= this.pulseSeed << 13;
          this.pulseSeed ^= this.pulseSeed >>> 17;
          this.pulseSeed ^= this.pulseSeed << 5;
          strength = Math.max(0, excitation + this.tuning.pulseVariation * (this.pulseSeed / 2147483648));
        }
        // Resolve the event inside this sample; preserve the continuous rise state at the reset.
        const elapsed = (this.phase >= offset ? this.phase - offset : this.phase - offset + 1) / step;
        const decay = Math.exp(-this.decayRate * elapsed);
        const after = pulseCoupling(riseRate, this.decayRate, decay, Math.exp(-riseRate * elapsed), elapsed);
        const jump = strength - (pulse * this.decay) / decay;
        this.rise[i]! += after * jump;
        this.emission[i]! += jump * ((1 - decay) / this.decayRate - after * riseTime);
        this.pulse[i] = strength * decay;
      }
      this.sums[this.banks[i]!]! += this.forward[i]!.read();
    }
    let exhaust = 0;
    for (let bank = 0; bank < this.tails.length; bank++) {
      const returning = this.returns[bank]!.read();
      const out = this.tails[bank]!.read();
      this.outlet[bank]! += this.loss * (out - this.outlet[bank]!);
      this.returns[bank]!.write(this.tuning.outletReflection * this.outlet[bank]!);
      // Equal-admittance scattering: p = 2 sum(incoming) / number of ports.
      const pressure = (2 * (this.sums[bank]! + returning)) / (this.counts[bank]! + 1);
      this.junctions[bank] = pressure;
      this.tails[bank]!.write(pressure - returning);
      exhaust += out + this.outlet[bank]!;
    }
    for (let i = 0; i < this.backward.length; i++) {
      const age = (this.phase - this.profile.firingPhases[i]! + 1) % 1;
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
