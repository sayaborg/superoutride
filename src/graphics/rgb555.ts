import { rgba, unpackRgba } from './software-surface.js';

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
