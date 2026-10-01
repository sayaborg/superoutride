/** A raster of RGB555 pixels (bit 15 clear). */
export class SoftwareSurface {
  readonly pixels: Uint16Array;

  constructor(
    readonly width: number,
    readonly height: number,
    pixels?: Uint16Array,
  ) {
    if (!(width > 0 && height > 0)) throw new RangeError('surface dimensions must be positive');
    if (pixels && pixels.length !== width * height) throw new RangeError('pixel buffer size mismatch');
    this.pixels = pixels ?? new Uint16Array(width * height);
  }

  clear(color: number): void {
    this.pixels.fill(color);
  }

  setPixel(x: number, y: number, color: number): void {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return;
    this.pixels[y * this.width + x] = color;
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
    this.pixels.fill(color, y * this.width + left, y * this.width + right + 1);
  }
}
