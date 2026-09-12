import type { VehicleAudioProfile } from './vehicle-audio-profile.js';

/** A lossy travelling wave. Storage and all coefficients are prepared outside render(). */
class Delay {
  private readonly data: Float32Array;
  private position = 0;
  constructor(length: number) {
    this.data = new Float32Array(Math.max(1, Math.round(length)));
  }
  read(): number {
    return this.data[this.position]!;
  }
  write(value: number): void {
    this.data[this.position] = value;
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
  private readonly attack: number;
  private readonly loss: number;
  private phase = 0;
  private rpm = 1000;
  private load = 0;
  private dc = 0;
  private tone = 0;

  constructor(
    private readonly profile: VehicleAudioProfile,
    private readonly rate: number,
    private readonly coupled = true,
  ) {
    const n = profile.firingPhases.length;
    const exhaust = profile.exhaust;
    this.banks = exhaust?.banks ?? Array(n).fill(0);
    const groups = Math.max(...this.banks) + 1;
    // Effective hot-gas wave speed is an acoustic authoring approximation, in m/s.
    const distance = (meters: number) => (meters * rate) / 480;
    this.forward = Array.from({ length: n }, (_, i) => new Delay(distance(exhaust?.lengths[i] ?? 0.55)));
    this.backward = Array.from({ length: n }, (_, i) => new Delay(distance(exhaust?.lengths[i] ?? 0.55)));
    this.tails = Array.from({ length: groups }, () => new Delay(distance(exhaust?.outlet ?? 1)));
    this.returns = Array.from({ length: groups }, () => new Delay(distance(exhaust?.outlet ?? 1)));
    this.counts = new Float64Array(groups);
    this.sums = new Float64Array(groups);
    this.junctions = new Float64Array(groups);
    this.outlet = new Float64Array(groups);
    this.pulse = new Float64Array(n);
    this.rise = new Float64Array(n);
    this.wall = new Float64Array(n);
    // Exhaust blowdown occurs after combustion, with the same authored firing intervals.
    this.offsets = Float64Array.from(profile.firingPhases, (phase) => (phase + 0.2) % 1);
    for (const bank of this.banks) this.counts[bank]!++;
    this.smoothing = 1 - Math.exp(-1 / (0.025 * rate));
    this.attack = 1 - Math.exp(-1 / (0.00018 * rate));
    this.loss = 1 - Math.exp((-2 * Math.PI * 4500) / rate);
  }

  /** One sample, without allocation. Reflection mode removes valve/junction return coupling. */
  sample(targetRpm: number, targetLoad: number): number {
    this.rpm += this.smoothing * (targetRpm - this.rpm);
    this.load += this.smoothing * (targetLoad - this.load);
    const step = this.rpm / (60 * this.profile.cycleRevolutions * this.rate);
    const previous = this.phase;
    this.phase = (this.phase + step) % 1;
    const decay = Math.exp(-1 / (this.rate * (0.002 + 0.004 * this.load)));
    this.sums.fill(0);
    let combustion = 0;
    for (let i = 0; i < this.forward.length; i++) {
      const offset = this.offsets[i]!;
      const crossed =
        this.phase >= previous ? offset > previous && offset <= this.phase : offset > previous || offset <= this.phase;
      if (crossed) this.pulse[i] = 0.22 + 0.78 * this.load;
      this.pulse[i]! *= decay;
      this.rise[i]! += this.attack * (this.pulse[i]! - this.rise[i]!);
      combustion += this.rise[i]!;
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
      this.returns[bank]!.write(-0.68 * this.outlet[bank]!);
      this.tails[bank]!.write(
        this.coupled ? 0.96 * (pressure - returning) : this.sums[bank]! / this.counts[bank]! + 0.3 * returning,
      );
      exhaust += out + this.outlet[bank]!;
    }
    for (let i = 0; i < this.forward.length; i++) {
      const age = (this.phase - this.offsets[i]! + 1) % 1;
      const valve = age < 0.23 ? Math.sin((Math.PI * age) / 0.23) : 0;
      this.wall[i]! += this.loss * (this.backward[i]!.read() - this.wall[i]!);
      const reflection = 0.94 - 1.24 * valve;
      const incoming = this.forward[i]!.read();
      this.forward[i]!.write(this.rise[i]! + (this.coupled ? reflection * this.wall[i]! : 0));
      this.backward[i]!.write(0.96 * (this.junctions[this.banks[i]!]! - incoming));
    }
    const raw = exhaust / Math.sqrt(this.tails.length) + combustion * 0.025;
    this.dc += (1 - Math.exp((-2 * Math.PI * 18) / this.rate)) * (raw - this.dc);
    const cutoff = 1800 + 5500 * this.load;
    this.tone += (1 - Math.exp((-2 * Math.PI * cutoff) / this.rate)) * (raw - this.dc - this.tone);
    // Smooth, bounded saturation; no table clipping or unconstrained feedback gain.
    const x = this.tone * (0.9 + 0.5 * this.load);
    return (0.65 * x) / (1 + Math.abs(x));
  }
}
