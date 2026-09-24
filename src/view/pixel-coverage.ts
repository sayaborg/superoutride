// Pixels: edge arithmetic budget (~18,000 ulps at 320 px), far below a destination pixel.
// Terrain and sprites use the same rounding allowance before integer pixel-center coverage.
export const PIXEL_EDGE_TOLERANCE = 1e-9;
