import type { ControlSettings } from './audio-control-policy.js';
import type { RivalSettings } from './audio-scene.js';
import type { AudioSettings } from './audio-document.js';
import type { ExhaustSettings } from './exhaust-acoustics.js';
import type { MixSettings } from './sound-graph.js';
import type { RollingSettings } from './tire-rolling-acoustics.js';
import type { UnifiedSettings } from './tire-unified-acoustics.js';
import type { ImpactSettings } from './impact-acoustics.js';

/**
 * The implementer's default sound settings: the one authority for each resolver's omitted values, and the
 * settings of an assembly built without the delivered audio document. The game reads the document.
 * The ENGINE values are the owner's, chosen by listening; the others are neither measured nor chosen by listening.
 */
export const DEFAULT_AUDIO_SETTINGS: AudioSettings = Object.freeze({
  exhaust: Object.freeze<ExhaustSettings>({
    closedExcitation: 0.3, // No derivation; chosen by listening. Weak combustion at closed throttle.
    // No derivation; chosen by listening. Full-excitation rise in absolute time: the wavefront is set by the
    // pressure ratio when the valve opens, not by RPM. The kernel splits it into two equal stages so the pulse
    // onset is C1 (a slope discontinuity at firing is heard as a click) with the same mean delay.
    pulseRiseMs: 0.3,
    pulseVariation: 0.3, // No derivation; chosen by listening. Absolute fraction of full excitation.
    // No derivation; chosen by listening. Firing strength during fuel cut: blowdown without combustion.
    pumpingExcitation: 0.2,
    // No derivation; chosen by listening. A downshift's rev-matching opening peak and its decay time; the
    // physical shift is instantaneous.
    blipOpening: 1,
    blipDecaySeconds: 0.25,
    clipCeiling: 1, // No derivation; chosen by listening. Soft-clip asymptotic bound and small-signal gain.
  }),
  unified: Object.freeze<UnifiedSettings>({
    feedbackMaximumPerSecond: 8500,
    noiseForcePerSecond: 7450,
    lowFrequencyHz: 300,
    highFrequencyHz: 1000,
    outputGainPerSecond: 42.5,
    slipHalfMps: 3,
    slipRolloffMps: 45,
    noiseBandwidthHz: 600,
    outputCutoffHz: 8000,
    resonanceDampingPerSecond: 2 * Math.PI * 500,
    lowParticipation: 0.45,
    dcHz: 18,
  }),
  rolling: Object.freeze<RollingSettings>({
    toneSeconds: 0.02,
    lowOrder: 4,
    highOrder: 12,
    minimumHz: 35,
    bandwidthRatio: 0.8,
    loadHalfNewtons: 2000,
    speedHalfMps: 15,
    speedExponent: 1.5,
    attackSeconds: 0.015,
    releaseSeconds: 0.01,
    textureMinimumDepth: 0.22,
    textureMaximumHz: 160,
    gain: 0.04,
    outputHz: 900,
    dcHz: 18,
  }),
  mix: Object.freeze<MixSettings>({
    thresholdDb: -6,
    kneeDb: 6,
    ratio: 12,
    attackSeconds: 0.003,
    releaseSeconds: 0.12,
    // Chosen with the owner's ENGINE values: low enough that the strongest full-throttle peaks lose about 3 dB to
    // the soft clip (docs/calibration.md).
    engineDriveLufs: -24,
  }),
  control: Object.freeze<ControlSettings>({
    observationSeconds: 0.025,
    gainSeconds: 0.025,
    mixSeconds: 0.015,
    panSeconds: 0.06,
    fadeSeconds: 0.01,
    componentSeconds: 0.005,
    transitionSeconds: 0.09,
    musicFadeSeconds: 2,
  }),
  // The reference work of each counterpart's impact: about a 10 m/s closing of two cars, a hard wall or object hit (wall
  // starts measured on departures from a road ranged from about 300 J to 1.6 MJ) and a cone at race speed (about 7 kJ).
  impact: Object.freeze<ImpactSettings>({
    vehicleJoules: 50000,
    wallJoules: 100000,
    objectJoules: 100000,
    movableJoules: 7000,
  }),
  rival: Object.freeze<RivalSettings>({
    audibleMeters: 100,
    referenceMeters: 3,
    panMinimumMeters: 3,
    reassignmentSeconds: 0.09,
  }),
});
