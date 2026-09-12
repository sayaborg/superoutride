import type { VehicleAudioProfile } from './vehicle-audio-profile.js';

/** Fourier sum of finite-width pulses. No recording, PCM loop or per-firing node. */
export function combustionCoefficients(profile: VehicleAudioProfile) {
  const real = new Float32Array(97);
  const imag = new Float32Array(97);
  let bound = 0;
  for (let harmonic = 1; harmonic < real.length; harmonic += 1) {
    const envelope = Math.exp(-harmonic * profile.pulseWidth);
    let re = 0,
      im = 0;
    for (const phase of profile.firingPhases) {
      re += Math.cos(2 * Math.PI * harmonic * phase) * envelope;
      im += Math.sin(2 * Math.PI * harmonic * phase) * envelope;
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
