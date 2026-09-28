// The only record of audio control time constants, never mechanical or pipe properties.
export const AUDIO_CONTROL_POLICY = Object.freeze({
  // Kernels follow acoustic observations (engine RPM/opening, tire inputs) per sample.
  observationSeconds: 0.025,
  // Voice output gain following (rival distance gain, tire output recovery).
  gainSeconds: 0.025,
  // Bus and master gains.
  mixSeconds: 0.015,
  // Rival pan.
  panSeconds: 0.06,
  // Fade-out before replacement and on silence.
  fadeSeconds: 0.01,
  // R/Q output switching inside the tire kernel.
  componentSeconds: 0.005,
  // Time given to a fade before a discontinuity (kernel replacement, context suspension).
  transitionSeconds: 0.09,
});
