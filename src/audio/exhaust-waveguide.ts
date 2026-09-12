import type { VehicleAudioProfile } from './vehicle-audio-profile.js';

// Shared acoustic approximations, not measured gas/valve properties.
const ACOUSTICS = Object.freeze({
  waveSpeed: 480, // effective m/s; fixed temperature approximation
  attenuationPerMeter: 0.04, // amplitude nepers/m, frequency-independent propagation loss
  returnCutoffHz: 4500, // lumped boundary filtering
  outletReflection: -0.68,
  sourceClosedReflection: 0.94,
  sourceOpenReflection: -0.3,
  sourceWindowCycles: 0.23, // empirical periodic boundary; NOT valve timing
  closedExcitation: 0.22, // keeps closed-throttle excitation; no fuel-cut simulation
});
const CONTROL_SECONDS = 0.025;
const OUTPUT = Object.freeze({ dcHz: 18, cutoffHz: 7300, ceiling: 0.65 });

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
  private readonly offsets: Float64Array;
  private readonly smoothing: number;
  private readonly decay: number;
  private readonly dcCoefficient: number;
  private readonly toneCoefficient: number;
  private readonly loss: number;
  private readonly acoustics: typeof ACOUSTICS;
  private phase = 0;
  private rpm = 1000;
  private load = 0;
  private dc = 0;
  private tone = 0;

  constructor(
    private readonly profile: VehicleAudioProfile,
    private readonly rate: number,
    private readonly coupled = true,
    tuning: Partial<
      Pick<typeof ACOUSTICS, 'attenuationPerMeter' | 'returnCutoffHz' | 'outletReflection' | 'closedExcitation'>
    > = {},
  ) {
    const {
      attenuationPerMeter = ACOUSTICS.attenuationPerMeter,
      returnCutoffHz = ACOUSTICS.returnCutoffHz,
      outletReflection = ACOUSTICS.outletReflection,
      closedExcitation = ACOUSTICS.closedExcitation,
    } = tuning;
    if (
      !Number.isFinite(attenuationPerMeter) ||
      attenuationPerMeter < 0 ||
      attenuationPerMeter > 1 ||
      !Number.isFinite(returnCutoffHz) ||
      returnCutoffHz < 100 ||
      returnCutoffHz > 10000 ||
      !Number.isFinite(outletReflection) ||
      outletReflection <= -1 ||
      outletReflection > 0 ||
      !Number.isFinite(closedExcitation) ||
      closedExcitation <= 0 ||
      closedExcitation > 1
    )
      throw new RangeError('invalid acoustic tuning');
    this.acoustics = Object.freeze({
      ...ACOUSTICS,
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
      new Delay((meters * rate) / ACOUSTICS.waveSpeed, Math.exp(-this.acoustics.attenuationPerMeter * meters));
    this.forward = exhaust.lengths.map(pipe);
    this.backward = coupled ? exhaust.lengths.map(pipe) : [];
    this.tails = Array.from({ length: groups }, () => pipe(exhaust.outlet));
    this.returns = Array.from({ length: groups }, () => pipe(exhaust.outlet));
    this.counts = new Float64Array(groups);
    this.sums = new Float64Array(groups);
    this.junctions = new Float64Array(groups);
    this.outlet = new Float64Array(groups);
    this.pulse = new Float64Array(n);
    this.rise = new Float64Array(n);
    this.wall = new Float64Array(n);
    // Phase zero denotes acoustic excitation; no invented combustion-to-valve delay.
    this.offsets = Float64Array.from(profile.firingPhases);
    for (const bank of this.banks) this.counts[bank]!++;
    this.smoothing = 1 - Math.exp(-1 / (CONTROL_SECONDS * rate));
    this.decay = Math.exp(-1 / (profile.pulse.decaySeconds * rate));
    this.dcCoefficient = 1 - Math.exp((-2 * Math.PI * OUTPUT.dcHz) / rate);
    this.toneCoefficient = 1 - Math.exp((-2 * Math.PI * OUTPUT.cutoffHz) / rate);
    this.loss = 1 - Math.exp((-2 * Math.PI * this.acoustics.returnCutoffHz) / rate);
  }

  /** One sample, without allocation. Reflection mode uses a fixed source termination without cylinder return coupling. */
  sample(targetRpm: number, targetLoad: number): number {
    this.rpm += this.smoothing * (targetRpm - this.rpm);
    this.load += this.smoothing * (targetLoad - this.load);
    const step = this.rpm / (60 * this.profile.cycleRevolutions * this.rate);
    const previous = this.phase;
    this.phase = (this.phase + step) % 1;
    // One excitation control: stronger pulses also rise faster. No load-dependent output EQ/drive.
    const excitation = this.acoustics.closedExcitation + (1 - this.acoustics.closedExcitation) * this.load;
    const attack = 1 - Math.exp(-excitation / (this.profile.pulse.riseSeconds * this.rate));
    this.sums.fill(0);
    for (let i = 0; i < this.forward.length; i++) {
      const offset = this.offsets[i]!;
      const crossed =
        this.phase >= previous ? offset > previous && offset <= this.phase : offset > previous || offset <= this.phase;
      if (crossed) this.pulse[i] = this.profile.pulse.strength * excitation;
      this.pulse[i]! *= this.decay;
      this.rise[i]! += attack * (this.pulse[i]! - this.rise[i]!);
      this.sums[this.banks[i]!]! += this.forward[i]!.read();
    }
    let exhaust = 0;
    for (let bank = 0; bank < this.tails.length; bank++) {
      const returning = this.returns[bank]!.read();
      // Equal-admittance scattering: p = 2 sum(incoming) / number of ports.
      const pressure = (2 * (this.sums[bank]! + returning)) / (this.counts[bank]! + 1);
      this.junctions[bank] = pressure;
      const out = this.tails[bank]!.read();
      this.outlet[bank]! += this.loss * (out - this.outlet[bank]!);
      this.returns[bank]!.write(this.acoustics.outletReflection * this.outlet[bank]!);
      this.tails[bank]!.write(
        this.coupled
          ? pressure - returning
          : this.sums[bank]! / this.counts[bank]! + ACOUSTICS.sourceClosedReflection * returning,
      );
      exhaust += out + this.outlet[bank]!;
    }
    for (let i = 0; i < this.forward.length; i++) {
      if (!this.coupled) {
        this.forward[i]!.write(this.rise[i]!);
        continue;
      }
      const age = (this.phase - this.offsets[i]! + 1) % 1;
      const opening = age < ACOUSTICS.sourceWindowCycles ? Math.sin((Math.PI * age) / ACOUSTICS.sourceWindowCycles) : 0;
      this.wall[i]! += this.loss * (this.backward[i]!.read() - this.wall[i]!);
      const reflection =
        ACOUSTICS.sourceClosedReflection +
        (ACOUSTICS.sourceOpenReflection - ACOUSTICS.sourceClosedReflection) * opening;
      const incoming = this.forward[i]!.read();
      this.forward[i]!.write(this.rise[i]! + reflection * this.wall[i]!);
      this.backward[i]!.write(this.junctions[this.banks[i]!]! - incoming);
    }
    const raw = exhaust / Math.sqrt(this.tails.length);
    this.dc += this.dcCoefficient * (raw - this.dc);
    this.tone += this.toneCoefficient * (raw - this.dc - this.tone);
    // Smooth, bounded saturation; no table clipping or unconstrained feedback gain.
    const x = this.tone;
    return (OUTPUT.ceiling * x) / (1 + Math.abs(x));
  }
}
