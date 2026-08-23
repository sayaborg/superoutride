const endianProbe = new Uint32Array([0x0a0b0c0d]);
export const LITTLE_ENDIAN = new Uint8Array(endianProbe.buffer)[0] === 0x0d;
export function rgba(r, g, b, a = 255) {
    const rr = clampByte(r);
    const gg = clampByte(g);
    const bb = clampByte(b);
    const aa = clampByte(a);
    return LITTLE_ENDIAN
        ? ((aa << 24) | (bb << 16) | (gg << 8) | rr) >>> 0
        : ((rr << 24) | (gg << 16) | (bb << 8) | aa) >>> 0;
}
export class SoftwareSurface {
    width;
    height;
    pixels;
    constructor(width, height, pixels) {
        this.width = width;
        this.height = height;
        if (!(width > 0 && height > 0))
            throw new RangeError('surface dimensions must be positive');
        if (pixels && pixels.length !== width * height)
            throw new RangeError('pixel buffer size mismatch');
        this.pixels = pixels ?? new Uint32Array(width * height);
    }
    clear(color) {
        this.pixels.fill(color >>> 0);
    }
    setPixel(x, y, color) {
        if (x < 0 || x >= this.width || y < 0 || y >= this.height)
            return;
        this.pixels[y * this.width + x] = color >>> 0;
    }
    getPixel(x, y) {
        if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
            throw new RangeError('pixel outside surface');
        }
        return this.pixels[y * this.width + x];
    }
    fillSpan(y, x0, x1, color) {
        if (y < 0 || y >= this.height)
            return;
        const left = Math.max(0, Math.ceil(Math.min(x0, x1)));
        const right = Math.min(this.width - 1, Math.floor(Math.max(x0, x1)));
        if (right < left)
            return;
        this.pixels.fill(color >>> 0, y * this.width + left, y * this.width + right + 1);
    }
}
function clampByte(value) {
    return Math.max(0, Math.min(255, Math.round(value)));
}
