import type { ControlSettings } from './audio-control-policy.js';
import type { RivalSettings } from './audio-scene.js';
import type { AudioSettings } from './audio-document.js';
import type { ExhaustSettings } from './exhaust-acoustics.js';
import type { MixSettings } from './sound-graph.js';
import type { RollingSettings } from './tire-rolling-acoustics.js';
import type { UnifiedSettings } from './tire-unified-acoustics.js';

/**
 * The implementer's default sound settings: the one authority for each resolver's omitted values, and the
 * settings of assemblies without the delivered audio document (the audition tools). The game reads the document.
 * Values are not measured and not chosen by the owner's listening.
 */
export const DEFAULT_AUDIO_SETTINGS: AudioSettings = Object.freeze({
  exhaust: Object.freeze<ExhaustSettings>({
    closedExcitation: 0.22, // No derivation; chosen by listening. Weak combustion at closed throttle.
    // No derivation; chosen by listening. Full-excitation rise in absolute time: the wavefront is set by the
    // pressure ratio when the valve opens, not by RPM. The kernel splits it into two equal stages so the pulse
    // onset is C1 (a slope discontinuity at firing is heard as a click) with the same mean delay.
    pulseRiseMs: 0.2,
    // No derivation; chosen by listening. Decay in crank angle, because blowdown lasts a crank angle; the only
    // derivation is the conversion D / (6 * rpm) seconds. Base strength is fixed at 1.
    pulseDecayDegrees: 90,
    pulseVariation: 0.2, // No derivation; chosen by listening. Absolute fraction of full excitation.
    // No derivation; chosen by listening. Firing strength during fuel cut: blowdown without combustion.
    pumpingExcitation: 0.06,
    outputCutoffHz: 7300, // No derivation; chosen by listening. Post-clip listening filter.
    // No derivation; chosen by listening. A downshift's rev-matching opening peak and its decay time; the
    // physical shift is instantaneous.
    blipOpening: 0.7,
    blipDecaySeconds: 0.08,
    // No derivation; chosen by listening. Per-firing overrun pop probability and the pop pulse strength at
    // the collector junction; the pop rate is proportional to RPM.
    popProbability: 0.12,
    popStrength: 0.5,
    // No derivation; chosen by listening. The cylinder-end boundary window as a cycle fraction, NOT the valve's
    // open duration (a 240-degree window removed the pipe resonance, so 11-7f restored this value).
    cylinderWindowCycles: 0.23,
    // No derivation; chosen by listening. Nearly rigid closed termination; magnitude < 1 absorbs energy.
    cylinderClosedReflection: 0.94,
    // No derivation; chosen by listening. Pressure-release-like open endpoint, not valve-flow physics.
    cylinderOpenReflection: -0.3,
    dcHz: 18, // No derivation; chosen by listening. Output DC-removal corner.
    clipCeiling: 0.65, // No derivation; chosen by listening. Soft-clip asymptotic bound and small-signal gain.
  }),
  unified: Object.freeze<UnifiedSettings>({
    feedbackMaximumPerSecond: 8500,
    powerReferenceWatts: 12000,
    noiseForcePerSecond: 1200,
    lowFrequencyHz: 300,
    highFrequencyHz: 1000,
    outputGainPerSecond: 900,
    saturationPerSecond: 6000,
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
  }),
  control: Object.freeze<ControlSettings>({
    observationSeconds: 0.025,
    gainSeconds: 0.025,
    mixSeconds: 0.015,
    panSeconds: 0.06,
    fadeSeconds: 0.01,
    componentSeconds: 0.005,
    transitionSeconds: 0.09,
  }),
  rival: Object.freeze<RivalSettings>({
    audibleMeters: 100,
    referenceMeters: 3,
    panMinimumMeters: 3,
    reassignmentSeconds: 0.09,
  }),
});
