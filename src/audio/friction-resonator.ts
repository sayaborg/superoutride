import { RandomStream } from './spectral-noise.js';
import { UNIFIED_DOMAIN } from './tire-unified-acoustics.js';

interface Mode {
  readonly frequencyHz: number;
  readonly dampingPerSecond: number;
  readonly participation: number;
}
interface Parameters {
  readonly modes: readonly Mode[];
  readonly feedbackMaximumPerSecond: number;
  readonly saturationPerSecond: number;
  readonly noiseBandwidthHz: number;
}

/**
 * One normalized friction port feeding passive modes, with rank-one nonlinear feedback.
 * x=omega*q, x'=omega*v, v'=-omega*x-d*v+b*F, u=sum(b*v), sum(b²)=1.
 * F=a*u-beta*u³+sigma*noise. Energy=.5*sum(x²+v²) is a model diagnostic, not joules.
 * Output is displacement at the SAME port: sum(b*x/omega), not a second oscillator/palette.
 */
export class FrictionResonator {
  private readonly x: Float64Array;
  private readonly v: Float64Array;
  private readonly omega: Float64Array;
  private readonly b: Float64Array;
  private readonly xx: Float64Array;
  private readonly xv: Float64Array;
  private readonly vv: Float64Array;
  private readonly random: RandomStream;
  private readonly noisePole: number;
  private readonly noiseInjection: number;
  private noise = 0;
  private readonly dt: number;
  private readonly parameters: Parameters;

  constructor(rate: number, parameters: Parameters, seed: number) {
    if (!Number.isInteger(rate) || rate < UNIFIED_DOMAIN.minRate || rate > UNIFIED_DOMAIN.maxRate)
      throw new RangeError('unsupported unified rate');
    if (
      !Number.isFinite(parameters.feedbackMaximumPerSecond) ||
      parameters.feedbackMaximumPerSecond <= 0 ||
      parameters.feedbackMaximumPerSecond / rate >= 1 ||
      !Number.isFinite(parameters.saturationPerSecond) ||
      parameters.saturationPerSecond <= 0 ||
      !Number.isFinite(parameters.noiseBandwidthHz) ||
      parameters.noiseBandwidthHz <= 0 ||
      parameters.noiseBandwidthHz >= rate / 2 ||
      parameters.modes.length === 0
    )
      throw new RangeError('invalid friction resonator parameters');
    this.parameters = Object.freeze({
      ...parameters,
      modes: Object.freeze(parameters.modes.map((m) => Object.freeze({ ...m }))),
    });
    this.dt = 1 / rate;
    const count = parameters.modes.length;
    this.x = new Float64Array(count);
    this.v = new Float64Array(count);
    this.omega = new Float64Array(count);
    this.b = new Float64Array(count);
    this.xx = new Float64Array(count);
    this.xv = new Float64Array(count);
    this.vv = new Float64Array(count);
    let norm = 0;
    for (let i = 0; i < count; i++) {
      const mode = parameters.modes[i]!;
      const omega = 2 * Math.PI * mode.frequencyHz,
        halfDamping = mode.dampingPerSecond / 2;
      if (
        !Number.isFinite(omega + halfDamping + mode.participation) ||
        omega <= 0 ||
        mode.frequencyHz >= rate / 4 ||
        halfDamping <= 0 ||
        halfDamping >= omega
      )
        throw new RangeError('friction modes must be finite, passive and underdamped');
      this.omega[i] = omega;
      this.b[i] = mode.participation;
      norm += mode.participation ** 2;
      // Exact passive half-step. Fixed modal data avoids parametric energy from retuned stiffness.
      const wd = Math.sqrt(omega * omega - halfDamping * halfDamping);
      const decay = Math.exp((-halfDamping * this.dt) / 2);
      const sine = Math.sin((wd * this.dt) / 2) / wd,
        cosine = Math.cos((wd * this.dt) / 2);
      this.xx[i] = decay * (cosine + halfDamping * sine);
      this.xv[i] = decay * omega * sine;
      this.vv[i] = decay * (cosine - halfDamping * sine);
    }
    if (!(norm > 0)) throw new RangeError('friction port must couple at least one mode');
    // Normalize once: port scale is owned by forcing/feedback, not duplicated in modal participation.
    for (let i = 0; i < count; i++) this.b[i] = this.b[i]! / Math.sqrt(norm);
    this.random = new RandomStream(seed);
    this.noisePole = Math.exp((-2 * Math.PI * parameters.noiseBandwidthHz) / rate);
    // Stationary variance-one AR(1) with variance-1/3 uniform innovations; no output normalization.
    this.noiseInjection = Math.sqrt(3 * (1 - this.noisePole ** 2));
  }

  get energy(): number {
    let sum = 0;
    for (let i = 0; i < this.x.length; i++) sum += this.x[i]! ** 2 + this.v[i]! ** 2;
    return sum / 2;
  }

  private passive(): void {
    for (let i = 0; i < this.x.length; i++) {
      const x = this.x[i]!,
        v = this.v[i]!;
      this.x[i] = this.xx[i]! * x + this.xv[i]! * v;
      this.v[i] = -this.xv[i]! * x + this.vv[i]! * v;
    }
  }

  private feedback(growth: number, saturation: number): void {
    let u = 0;
    for (let i = 0; i < this.v.length; i++) u += this.b[i]! * this.v[i]!;
    // Exact u'=a*u-beta*u³ half-step, including the analytic a=0 limit.
    const delta = u * (growth / Math.sqrt(1 + saturation * u * u) - 1);
    for (let i = 0; i < this.v.length; i++) this.v[i] = this.v[i]! + this.b[i]! * delta;
  }

  sample(feedbackPerSecond: number, noiseForcePerSecond: number): number {
    if (
      !Number.isFinite(feedbackPerSecond + noiseForcePerSecond) ||
      feedbackPerSecond < 0 ||
      feedbackPerSecond > this.parameters.feedbackMaximumPerSecond ||
      noiseForcePerSecond < 0
    )
      throw new RangeError('invalid friction excitation');
    const exponent = feedbackPerSecond * this.dt;
    const growth = Math.exp(exponent / 2);
    const saturation =
      this.parameters.saturationPerSecond * this.dt * (exponent === 0 ? 1 : Math.expm1(exponent) / exponent);
    this.passive();
    this.feedback(growth, saturation);
    this.noise = this.noisePole * this.noise + this.noiseInjection * this.random.sample();
    // Colored FORCE is integrated with dt. Applying sqrt(dt) here would count its correlation twice.
    const impulse = noiseForcePerSecond * this.noise * this.dt;
    for (let i = 0; i < this.v.length; i++) this.v[i] = this.v[i]! + this.b[i]! * impulse;
    this.feedback(growth, saturation);
    this.passive();
    let displacement = 0;
    for (let i = 0; i < this.x.length; i++) displacement += (this.b[i]! * this.x[i]!) / this.omega[i]!;
    return displacement;
  }
}
