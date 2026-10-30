import { rgb555ToRgba, rgba } from '../../src/image/rgb555.js';
import { SPRITE_SOURCE_TEXELS_PER_METER } from '../../src/image/sprite.js';
import type { SourceImage } from './sprite-source-compiler.js';

/**
 * The prompt a generation input goes out with, unless K edits it: it keeps every part already there, thin ones
 * included, changes no pose, draws no background, ground or shadow, and keeps the whole picture in frame on a
 * transparent background.
 */
export const GENERATION_PROMPT =
  'Redraw this exact 1980s arcade sprite as a finely detailed high-resolution painted game asset. Preserve the ' +
  'silhouette, shape, proportions, pose, colors, light direction and every existing part, thin ones such as flags, ' +
  'poles and wires included. Add detail inside the existing shape, not new objects. Do not draw a background, ground ' +
  'plane or cast shadow. Redraw lettering too. Keep the whole object inside the frame, on a transparent background. ' +
  'Smooth high-resolution detail, not pixel art.';

/** The longer side a generation input is enlarged to about, in pixels. */
export const GENERATION_INPUT_SIZE = 1024;

/** A frame of palette slots (0 transparent) with its base point in texel-centre coordinates. */
export interface GenerationFrame {
  readonly width: number;
  readonly height: number;
  readonly anchorX: number;
  readonly anchorY: number;
  readonly indices: readonly number[];
}

/** The prompt file: the template, and K's note for the picture when there is one. */
export function generationPrompt(template: string, note: string): string {
  return `${template.trim()}\n${note.trim() ? `\n${note.trim()}\n` : ''}`;
}

/**
 * A picture's generation input and guide: its frame in `colors` enlarged by nearest neighbour by the whole factor
 * that brings its longer side nearest `GENERATION_INPUT_SIZE` (at least 1), transparent where it has no texel; the
 * guide is the input with the ground row through the base point, the base point and the collision lines (`widths`,
 * m, about the base point) drawn over it.
 */
export function generationInput(
  frame: GenerationFrame,
  colors: readonly number[],
  widths: readonly number[],
): { readonly enlargement: number; readonly input: SourceImage; readonly guide: SourceImage } {
  const enlargement = Math.max(1, Math.round(GENERATION_INPUT_SIZE / Math.max(frame.width, frame.height)));
  const width = frame.width * enlargement,
    height = frame.height * enlargement;
  const pixels = new Uint32Array(width * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const slot = frame.indices[Math.floor(y / enlargement) * frame.width + Math.floor(x / enlargement)]!;
      if (slot) pixels[y * width + x] = rgb555ToRgba(colors[slot]!);
    }
  const guide = pixels.slice();
  const line = Math.max(1, Math.round(enlargement / 4));
  const ground = rgba(255, 211, 61, 255),
    collision = rgba(255, 64, 64, 255);
  const across = (row: number, color: number) => {
    for (let y = Math.max(0, row - (line >> 1)); y < Math.min(height, row - (line >> 1) + line); y++)
      guide.fill(color, y * width, (y + 1) * width);
  };
  const down = (column: number, from: number, to: number, color: number) => {
    for (let y = Math.max(0, from); y < Math.min(height, to); y++)
      for (let x = Math.max(0, column - (line >> 1)); x < Math.min(width, column - (line >> 1) + line); x++)
        guide[y * width + x] = color;
  };
  const anchorX = Math.round((frame.anchorX + 0.5) * enlargement),
    anchorY = Math.round((frame.anchorY + 0.5) * enlargement);
  across(anchorY, ground);
  down(anchorX, anchorY - 8 * line, anchorY + 8 * line, ground);
  for (const w of widths)
    for (const side of [-1, 1])
      down(Math.round(anchorX + (side * w * SPRITE_SOURCE_TEXELS_PER_METER * enlargement) / 2), 0, height, collision);
  return { enlargement, input: { width, height, pixels }, guide: { width, height, pixels: guide } };
}
