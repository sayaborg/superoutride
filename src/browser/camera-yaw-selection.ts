import type { CameraYawMode } from '../camera/camera.js';

/** Browser labels for the camera's observation policy. */
export const BROWSER_CAMERA_YAW_MODES: readonly Readonly<{ value: CameraYawMode; label: string; ariaLabel: string }>[] =
  Object.freeze([
    Object.freeze({ value: 'BODY_FIXED', label: 'BODY', ariaLabel: 'Lock camera yaw to vehicle body' }),
    Object.freeze({
      value: 'MOVEMENT_FOLLOW',
      label: 'MOVE',
      ariaLabel: 'Follow vehicle movement direction with camera yaw',
    }),
  ]);
