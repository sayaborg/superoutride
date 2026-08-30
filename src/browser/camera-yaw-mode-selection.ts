export const BROWSER_CAMERA_YAW_TOGGLE_CODE = 'KeyP';

export function browserRequestsCameraYawToggle(code: string): boolean {
  return code === BROWSER_CAMERA_YAW_TOGGLE_CODE;
}
