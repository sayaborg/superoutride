const ranks = new Map<number, Uint16Array>();

/**
 * Line thinning, the one way one picture of the frame gives way to another
 * ([Image assets](../../docs/image-assets.md#background-transitions)): each of `height` screen lines' rank, the lines in
 * the order of their numbers' bits reversed (over the fewest bits that number them), so that every share of lines lies
 * spread evenly, the widest gaps filled first. A late-1980s board does it with a table of which plane each line shows.
 */
export function lineThinningRanks(height: number): Uint16Array {
  let rank = ranks.get(height);
  if (!rank) {
    const bits = Math.max(1, Math.ceil(Math.log2(height)));
    rank = new Uint16Array(height);
    for (let n = 0, next = 0; n < 1 << bits; n++) {
      let line = 0;
      for (let b = 0; b < bits; b++) line |= ((n >> b) & 1) << (bits - 1 - b);
      if (line < height) rank[line] = next++;
    }
    ranks.set(height, rank);
  }
  return rank;
}

/** How many of `height` lines show the new picture at share `p`: those ranked below it. */
export const newLineCount = (height: number, p: number) => Math.round(height * p);

/** The fixed steps a change by line thinning takes, from the first new line to the last. */
export const THINNING_STEPS = 16;

/**
 * Line thinning at share `p` drawn into `pixels`, which hold the new picture: every line not yet the new picture's
 * shows `old`'s line instead. Both are `width` × `height` frames.
 */
export function thinLines(pixels: Uint16Array, old: Uint16Array, width: number, height: number, p: number): void {
  const ranks = lineThinningRanks(height),
    shown = newLineCount(height, p);
  for (let y = 0; y < height; y++)
    if (ranks[y]! >= shown) pixels.set(old.subarray(y * width, (y + 1) * width), y * width);
}
