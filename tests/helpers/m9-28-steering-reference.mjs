// M9.29 changes browser defaults; preserve prior causal experiments at their original inputs.
export const M9_28_STEERING_REFERENCE = Object.freeze({
 maxRoadWheelSteer: 60 * Math.PI / 180,
 steeringOffsetMax: 12 * Math.PI / 180,
 steeringActuatorResponse: Object.freeze({applyRate:4,releaseRate:4}),
});
