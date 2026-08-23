export type AuthoredSurfaceType = 'ASPHALT' | 'SHOULDER' | 'GRASS' | 'DIRT' | 'SAND';
export type GroundMapMaterial = 'GRASS' | 'ROCK';
export type AuthoredGroundBase =
  | { readonly kind: 'color'; readonly color: number }
  | { readonly kind: 'transparent' };

export interface AuthoredSurfaceBand {
  readonly lMin: number;
  readonly lMax: number;
  readonly type: AuthoredSurfaceType;
}

export interface SurfaceRegionAuthoring {
  readonly sStart: number;
  readonly name: string;
  readonly groundMapLeft: GroundMapMaterial;
  readonly groundMapRight: GroundMapMaterial;
  readonly groundBaseLeft: AuthoredGroundBase;
  readonly groundBaseRight: AuthoredGroundBase;
  readonly surfaceBands: readonly AuthoredSurfaceBand[];
}
