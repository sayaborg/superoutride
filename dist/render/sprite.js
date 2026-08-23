export const SPRITE_TRANSPARENT = 0;
const EPSILON = 1e-9;
export function createSpriteAsset(name, width, height, pixels, anchorX = (width - 1) * 0.5, anchorY = height - 1, worldWidthMeters = width) {
    if (!(width > 0 && height > 0 && Number.isInteger(width) && Number.isInteger(height))) {
        throw new RangeError('sprite dimensions must be positive integers');
    }
    if (pixels.length !== width * height)
        throw new RangeError('sprite pixel buffer size mismatch');
    if (!Number.isFinite(anchorX) || !Number.isFinite(anchorY))
        throw new RangeError('sprite anchor must be finite');
    if (!(worldWidthMeters > 0) || !Number.isFinite(worldWidthMeters)) {
        throw new RangeError('sprite worldWidthMeters must be finite and > 0');
    }
    return { name, width, height, worldWidthMeters, anchorX, anchorY, pixels };
}
export function countOpaqueSpriteColors(asset) {
    const colors = new Set();
    for (const pixel of asset.pixels)
        if (pixel !== SPRITE_TRANSPARENT)
            colors.add(pixel >>> 0);
    return colors.size;
}
export function drawScaledSprite(target, asset, xAnchor, yAnchor, pixelsPerMeter) {
    const scale = pixelsPerMeter * (asset.worldWidthMeters / asset.width);
    if (!(scale > 0) || !Number.isFinite(scale)) {
        return { outputSamples: 0, writtenPixels: 0, clipped: true };
    }
    // Core §55 texel-center convention. projection scale is px/m;
    // convert it to px/source-texel from the asset's physical width.
    // There is intentionally no arbitrary per-sprite visual scale multiplier.
    // Rectangle boundaries are derived from the
    // continuous source anchor; framebuffer pixels are sampled at x+0.5/y+0.5.
    const leftBoundary = xAnchor - scale * (asset.anchorX + 0.5);
    const topBoundary = yAnchor - scale * (asset.anchorY + 0.5);
    const rightBoundary = leftBoundary + scale * asset.width;
    const bottomBoundary = topBoundary + scale * asset.height;
    const unclippedX0 = Math.ceil(leftBoundary - 0.5 - EPSILON);
    const unclippedX1 = Math.floor(rightBoundary - 0.5 - EPSILON);
    const unclippedY0 = Math.ceil(topBoundary - 0.5 - EPSILON);
    const unclippedY1 = Math.floor(bottomBoundary - 0.5 - EPSILON);
    const x0 = Math.max(0, unclippedX0);
    const x1 = Math.min(target.width - 1, unclippedX1);
    const y0 = Math.max(0, unclippedY0);
    const y1 = Math.min(target.height - 1, unclippedY1);
    if (x1 < x0 || y1 < y0) {
        return { outputSamples: 0, writtenPixels: 0, clipped: true };
    }
    const invScale = 1 / scale;
    let outputSamples = 0;
    let writtenPixels = 0;
    for (let y = y0; y <= y1; y += 1) {
        const sourceY = asset.anchorY + ((y + 0.5) - yAnchor) * invScale;
        const sy = Math.floor(sourceY + 0.5);
        if (sy < 0 || sy >= asset.height)
            continue;
        const targetRow = y * target.width;
        const sourceRow = sy * asset.width;
        for (let x = x0; x <= x1; x += 1) {
            const sourceX = asset.anchorX + ((x + 0.5) - xAnchor) * invScale;
            const sx = Math.floor(sourceX + 0.5);
            if (sx < 0 || sx >= asset.width)
                continue;
            outputSamples += 1;
            const color = asset.pixels[sourceRow + sx];
            if (color === SPRITE_TRANSPARENT)
                continue;
            target.pixels[targetRow + x] = color;
            writtenPixels += 1;
        }
    }
    return {
        outputSamples,
        writtenPixels,
        clipped: x0 !== unclippedX0 || x1 !== unclippedX1 || y0 !== unclippedY0 || y1 !== unclippedY1,
    };
}
