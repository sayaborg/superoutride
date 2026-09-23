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

/** Pack the framebuffer's RGBA value into opaque RGB555 storage. */
export function rgbaToRgb555(color: number): number {
  const { r, g, b } = unpackRgba(color);
  const r5 = Math.round((r * 31) / 255);
  const g5 = Math.round((g * 31) / 255);
  const b5 = Math.round((b * 31) / 255);
  return ((r5 << 10) | (g5 << 5) | b5) & 0x7fff;
}

/** Expand RGB555 through the deterministic nearest 8-bit channel representation. */
export function rgb555ToRgba(value: number): number {
  const r5 = (value >>> 10) & 0x1f;
  const g5 = (value >>> 5) & 0x1f;
  const b5 = value & 0x1f;
  return rgba(Math.round((r5 * 255) / 31), Math.round((g5 * 255) / 31), Math.round((b5 * 255) / 31));
}
