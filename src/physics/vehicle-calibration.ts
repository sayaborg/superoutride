export const VEHICLE_PHYSICS_CALIBRATION_STATUS = 'DEV_UNCALIBRATED' as const;

/**
 * This is intentionally not a versioned handling target.
 *
 * Current car/bike equations and parameter values exist to exercise world-space driving,
 * SurfaceMap interaction, camera and gameplay integration. They are not a tuned product
 * handling specification and may change substantially later.
 */
export type VehiclePhysicsCalibrationStatus = typeof VEHICLE_PHYSICS_CALIBRATION_STATUS;
