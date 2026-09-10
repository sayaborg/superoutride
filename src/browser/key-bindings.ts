/** Product shortcuts belong to browser composition, never to vehicle identities or mechanics. */
export const BROWSER_VEHICLE_KEYS: Readonly<Record<string, string>> = Object.freeze({
  TESTAROSSA: 'KeyQ',
  '911_TURBO_3_3': 'KeyW',
  CORVETTE_C4: 'KeyE',
  GOLF_GTI_16V: 'KeyR',
  DELTA_HF_INTEGRALE: 'KeyA',
  VFR750R: 'KeyS',
  R80_GS_PARIS_DAKAR: 'KeyD',
  FXRT_SPORT_GLIDE: 'KeyF',
  PX200E_ARCOBALENO: 'KeyV',
});

export const BROWSER_COURSE_KEYS = Object.freeze({
  linear: Object.freeze({ digitCode: 'Digit1', numpadCode: 'Numpad1' }),
  branching: Object.freeze({ digitCode: 'Digit2', numpadCode: 'Numpad2' }),
  circuit: Object.freeze({ digitCode: 'Digit3', numpadCode: 'Numpad3' }),
  fisco: Object.freeze({ digitCode: 'Digit4', numpadCode: 'Numpad4' }),
});

export const BROWSER_CALIBRATION_KEYS = Object.freeze({
  D: 'KeyY',
  M: 'KeyU',
  ACT: 'KeyT',
  GX: 'KeyH',
  PX: 'KeyJ',
  GY: 'KeyG',
  PY: 'KeyL',
  KNEE: 'KeyN',
});

export const BROWSER_CAMERA_YAW_TOGGLE_CODE = 'KeyP';

export function browserRequestsCameraYawToggle(code: string): boolean {
  return code === BROWSER_CAMERA_YAW_TOGGLE_CODE;
}

export const BROWSER_RECOVERY_CODE = 'Backspace';
