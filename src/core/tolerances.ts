/** Absolute source-profile endpoint normalization in metres; never wrapping or progress. */
export const SOURCE_ENDPOINT_TOLERANCE_METERS = 1e-9;
/** Raster/Guide sampling and join roundoff in metres; distinct from source normalization. */
export const GEOMETRY_SAMPLING_TOLERANCE_METERS = 1e-8;
/** Destination pixel-edge rounding shared by terrain and sprites, in pixels. */
export const PIXEL_EDGE_TOLERANCE = 1e-9;
