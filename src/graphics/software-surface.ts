const endianProbe = new Uint32Array([0x0a0b0c0d]);
const LITTLE_ENDIAN = new Uint8Array(endianProbe.buffer)[0] === 0x0d;

export function rgba(r: number, g: number, b: number, a = 255): number {
  const rr = clampByte(r);
  const gg = clampByte(g);
  const bb = clampByte(b);
  const aa = clampByte(a);
  return LITTLE_ENDIAN
    ? ((aa << 24) | (bb << 16) | (gg << 8) | rr) >>> 0
    : ((rr << 24) | (gg << 16) | (bb << 8) | aa) >>> 0;
}

export class SoftwareSurface {
  readonly pixels: Uint32Array;

  constructor(
    readonly width: number,
    readonly height: number,
    pixels?: Uint32Array,
  ) {
    if (!(width > 0 && height > 0)) throw new RangeError('surface dimensions must be positive');
    if (pixels && pixels.length !== width * height) throw new RangeError('pixel buffer size mismatch');
    this.pixels = pixels ?? new Uint32Array(width * height);
  }

  clear(color: number): void {
    this.pixels.fill(color >>> 0);
  }

  setPixel(x: number, y: number, color: number): void {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return;
    this.pixels[y * this.width + x] = color >>> 0;
  }

  getPixel(x: number, y: number): number {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
      throw new RangeError('pixel outside surface');
    }
    return this.pixels[y * this.width + x]!;
  }

  fillSpan(y: number, x0: number, x1: number, color: number): void {
    if (y < 0 || y >= this.height) return;
    const left = Math.max(0, Math.ceil(Math.min(x0, x1)));
    const right = Math.min(this.width - 1, Math.floor(Math.max(x0, x1)));
    if (right < left) return;
    this.pixels.fill(color >>> 0, y * this.width + left, y * this.width + right + 1);
  }
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

export function unpackRgba(color: number): { r: number; g: number; b: number; a: number } {
  if (LITTLE_ENDIAN) {
    return {
      r: color & 0xff,
      g: (color >>> 8) & 0xff,
      b: (color >>> 16) & 0xff,
      a: (color >>> 24) & 0xff,
    };
  }
  return {
    r: (color >>> 24) & 0xff,
    g: (color >>> 16) & 0xff,
    b: (color >>> 8) & 0xff,
    a: color & 0xff,
  };
}
