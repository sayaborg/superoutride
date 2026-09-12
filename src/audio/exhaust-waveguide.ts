import type { VehicleAudioProfile } from './vehicle-audio-profile.js';

import { ACOUSTICS, CONTROL_SECONDS, DEFAULT_REFLECTION_TUNING, OUTPUT } from './exhaust-acoustics.js';

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
  private readonly wall: Float64Array;
  private readonly outlet: Float64Array;
  private readonly bankNormalization: number;
  private readonly smoothing: number;
  private readonly decay: number;
  private readonly dcCoefficient: number;
  private readonly toneCoefficient: number;
  private readonly loss: number;
  private readonly tuning: typeof DEFAULT_REFLECTION_TUNING;
  private phase = 0;
  private rpm = 1000;
  private load = 0;
  private dc = 0;
  private tone = 0;

  constructor(
    private readonly profile: VehicleAudioProfile,
    private readonly rate: number,
    // Temporary comparison switch. Adopt one branch and delete the other; see docs/audio.md.
    private readonly coupled = true,
    tuning: Partial<typeof DEFAULT_REFLECTION_TUNING> = {},
  ) {
    const {
      attenuationPerMeter = DEFAULT_REFLECTION_TUNING.attenuationPerMeter,
      returnCutoffHz = DEFAULT_REFLECTION_TUNING.returnCutoffHz,
      outletReflection = DEFAULT_REFLECTION_TUNING.outletReflection,
      closedExcitation = DEFAULT_REFLECTION_TUNING.closedExcitation,
    } = tuning;
    if (
      !Number.isFinite(attenuationPerMeter) ||
      attenuationPerMeter < 0 ||
      attenuationPerMeter > 1 ||
      !Number.isFinite(returnCutoffHz) ||
      returnCutoffHz < 100 ||
      returnCutoffHz > 10000 ||
      !Number.isFinite(outletReflection) ||
      outletReflection < -1 ||
      outletReflection > 0 ||
      !Number.isFinite(closedExcitation) ||
      closedExcitation <= 0 ||
      closedExcitation > 1
    )
      throw new RangeError('invalid acoustic tuning');
    this.tuning = Object.freeze({
      attenuationPerMeter,
      returnCutoffHz,
      outletReflection,
      closedExcitation,
    });
    const n = profile.firingPhases.length;
    const exhaust = profile.exhaust;
    this.banks = exhaust.banks;
    const groups = Math.max(...this.banks) + 1;
    const pipe = (meters: number) =>
      new Delay((meters * rate) / ACOUSTICS.waveSpeed, Math.exp(-this.tuning.attenuationPerMeter * meters));
    this.forward = exhaust.lengths.map(pipe);
    this.backward = coupled ? exhaust.lengths.map(pipe) : [];
    this.tails = Array.from({ length: groups }, () => pipe(exhaust.outlet));
    this.returns = Array.from({ length: groups }, () => pipe(exhaust.outlet));
    this.counts = new Float64Array(groups);
    this.sums = new Float64Array(groups);
    this.junctions = new Float64Array(coupled ? groups : 0);
    this.outlet = new Float64Array(groups);
    this.pulse = new Float64Array(n);
    this.rise = new Float64Array(n);
    this.wall = new Float64Array(coupled ? n : 0);
    this.bankNormalization = Math.sqrt(groups);
    for (const bank of this.banks) this.counts[bank]!++;
    this.smoothing = 1 - Math.exp(-1 / (CONTROL_SECONDS * rate));
    this.decay = Math.exp(-1 / (profile.pulse.decaySeconds * rate));
    this.dcCoefficient = 1 - Math.exp((-2 * Math.PI * OUTPUT.dcHz) / rate);
    this.toneCoefficient = 1 - Math.exp((-2 * Math.PI * OUTPUT.cutoffHz) / rate);
    this.loss = 1 - Math.exp((-2 * Math.PI * this.tuning.returnCutoffHz) / rate);
  }

  /** One sample, without allocation. Reflection mode uses a fixed source termination without cylinder return coupling. */
  sample(targetRpm: number, targetLoad: number): number {
    this.rpm += this.smoothing * (targetRpm - this.rpm);
    this.load += this.smoothing * (targetLoad - this.load);
    const step = this.rpm / (60 * this.profile.cycleRevolutions * this.rate);
    const previous = this.phase;
    this.phase = (this.phase + step) % 1;
    // One excitation control: stronger pulses also rise faster. No load-dependent output EQ/drive.
    const excitation = this.tuning.closedExcitation + (1 - this.tuning.closedExcitation) * this.load;
    const attack = 1 - Math.exp(-excitation / (this.profile.pulse.riseSeconds * this.rate));
    this.sums.fill(0);
    for (let i = 0; i < this.forward.length; i++) {
      const offset = this.profile.firingPhases[i]!;
      const crossed =
        this.phase >= previous ? offset > previous && offset <= this.phase : offset > previous || offset <= this.phase;
      if (crossed) this.pulse[i] = this.profile.pulse.strength * excitation;
      this.pulse[i]! *= this.decay;
      this.rise[i]! += attack * (this.pulse[i]! - this.rise[i]!);
      this.sums[this.banks[i]!]! += this.forward[i]!.read();
      if (!this.coupled) this.forward[i]!.write(this.rise[i]!);
    }
    let exhaust = 0;
    for (let bank = 0; bank < this.tails.length; bank++) {
      const returning = this.returns[bank]!.read();
      const out = this.tails[bank]!.read();
      this.outlet[bank]! += this.loss * (out - this.outlet[bank]!);
      this.returns[bank]!.write(this.tuning.outletReflection * this.outlet[bank]!);
      if (this.coupled) {
        // Equal-admittance scattering: p = 2 sum(incoming) / number of ports.
        const pressure = (2 * (this.sums[bank]! + returning)) / (this.counts[bank]! + 1);
        this.junctions[bank] = pressure;
        this.tails[bank]!.write(pressure - returning);
      } else {
        this.tails[bank]!.write(this.sums[bank]! / this.counts[bank]! + ACOUSTICS.sourceClosedReflection * returning);
      }
      exhaust += out + this.outlet[bank]!;
    }
    for (let i = 0; i < this.backward.length; i++) {
      const age = (this.phase - this.profile.firingPhases[i]! + 1) % 1;
      const opening = age < ACOUSTICS.sourceWindowCycles ? Math.sin((Math.PI * age) / ACOUSTICS.sourceWindowCycles) : 0;
      this.wall[i]! += this.loss * (this.backward[i]!.read() - this.wall[i]!);
      const reflection =
        ACOUSTICS.sourceClosedReflection +
        (ACOUSTICS.sourceOpenReflection - ACOUSTICS.sourceClosedReflection) * opening;
      const incoming = this.forward[i]!.read();
      this.forward[i]!.write(this.rise[i]! + reflection * this.wall[i]!);
      this.backward[i]!.write(this.junctions[this.banks[i]!]! - incoming);
    }
    const raw = exhaust / this.bankNormalization;
    this.dc += this.dcCoefficient * (raw - this.dc);
    this.tone += this.toneCoefficient * (raw - this.dc - this.tone);
    // Smooth, bounded saturation; no table clipping or unconstrained feedback gain.
    const x = this.tone;
    return (OUTPUT.ceiling * x) / (1 + Math.abs(x));
  }
}
