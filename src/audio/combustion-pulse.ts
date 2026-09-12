import type { VehicleAudioProfile } from './vehicle-audio-profile.js';

/** Band-limited periodic sum of causal bi-exponential pulses; width is a cycle fraction. */
export function combustionCoefficients(profile: VehicleAudioProfile, width = profile.pulseWidth) {
  const real = new Float32Array(193);
  const imag = new Float32Array(193);
  let bound = 0;
  for (let harmonic = 1; harmonic < real.length; harmonic += 1) {
    // Transform of exp(-t/decay) - exp(-t/rise), apart from a normalized constant.
    const decay = 2 * Math.PI * harmonic * width;
    const rise = decay * 0.12;
    const denominator = (1 + decay * decay) * (1 + rise * rise);
    const a = (1 - decay * rise) / denominator;
    const b = -(decay + rise) / denominator;
    let re = 0,
      im = 0;
    for (const phase of profile.firingPhases) {
      const angle = 2 * Math.PI * harmonic * phase;
      re += a * Math.cos(angle) + b * Math.sin(angle);
      im += a * Math.sin(angle) - b * Math.cos(angle);
    }
    real[harmonic] = re;
    imag[harmonic] = im;
    bound += Math.hypot(re, im);
  }
  for (let harmonic = 1; harmonic < real.length; harmonic += 1) {
    real[harmonic] = real[harmonic]! / bound;
    imag[harmonic] = imag[harmonic]! / bound;
  }
  return { real, imag };
}
