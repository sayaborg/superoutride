import type { DrivingInputApplyMethod } from '../vehicle/driving-input.js';

/**
 * One input publisher taking part in arbitration. Its identity is the object reference; the apply
 * method it carries becomes the final sample's apply method while it wins.
 */
export interface InputOwner {
  readonly applyMethod: DrivingInputApplyMethod;
}

export function createInputOwner(applyMethod: DrivingInputApplyMethod): InputOwner {
  return Object.freeze({ applyMethod });
}
