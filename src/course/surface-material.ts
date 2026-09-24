export type SurfaceType = 'ASPHALT' | 'SHOULDER' | 'GRASS' | 'DIRT' | 'SAND' | 'VOID';

/**
 * Surface authority is relative to the tire definition.
 * Each tire friction axis is scaled by material.gripFactor.
 */
export interface SurfaceMaterial {
  readonly type: SurfaceType;
  readonly supported: boolean;
  readonly gripFactor: number;
  readonly rollingResistance: number;
}

export const SURFACE_MATERIALS: Readonly<Record<SurfaceType, SurfaceMaterial>> = Object.freeze({
  ASPHALT: Object.freeze({ type: 'ASPHALT', supported: true, gripFactor: 1.0, rollingResistance: 0.014 }),
  SHOULDER: Object.freeze({ type: 'SHOULDER', supported: true, gripFactor: 0.78, rollingResistance: 0.025 }),
  GRASS: Object.freeze({ type: 'GRASS', supported: true, gripFactor: 0.43, rollingResistance: 0.065 }),
  DIRT: Object.freeze({ type: 'DIRT', supported: true, gripFactor: 0.52, rollingResistance: 0.045 }),
  SAND: Object.freeze({ type: 'SAND', supported: true, gripFactor: 0.33, rollingResistance: 0.11 }),
  VOID: Object.freeze({ type: 'VOID', supported: false, gripFactor: 0, rollingResistance: 0 }),
});
