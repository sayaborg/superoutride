import assert from 'node:assert/strict';
import test from 'node:test';
import { partedStrips } from '../../tools/road-data/shared/road-surface.ts';

/** A band of eight parts a period of 8 m: its parts' colors two of a set, the set's number added. */
const pick = (set) => [1, 2, 1, 2, 1, 2, 1, 7].map((c) => c + 10 * set);
// A change of colors from 10 m over 10 m.
const stretches = [
  { from: 0, to: 10, colors: 0, before: null },
  { from: 10, to: 20, colors: 1, before: 0 },
  { from: 20, to: 40, colors: 1, before: null },
];
const strip = (from, to, color, material) => ({ from, to, color, material });
/** The Strips over `[a, b]` cut at `cuts`, repeats expanded. */
const strips = (cuts, under = null) =>
  [0, ...cuts, 40]
    .slice(0, -1)
    .flatMap((a, k) =>
      partedStrips(stretches, pick, under, 8, 0, a, [...cuts, 40][k], 'ASPHALT', strip).flatMap((x) =>
        x.kind === 'repeat'
          ? Array.from({ length: x.count }, (_, n) =>
              x.elements.map((e) => ({ ...e, from: e.from + n * x.every, to: e.to + n * x.every })),
            ).flat()
          : [x],
      ),
    );
/** The color at `s`: the last Strip's over it, as a later Strip covers an earlier. */
const colorAt = (list, s) => list.filter((x) => x.from <= s && s < x.to).at(-1)?.color;

test("a parted band's color at a place is its part's in its stretch, however the band is cut", () => {
  const [whole, cut] = [strips([]), strips(Array.from({ length: 39 }, (_, k) => k + 0.5))];
  assert.ok(cut.length > whole.length);
  for (let s = 0.25; s < 40; s += 0.5) assert.deepEqual(colorAt(cut, s), colorAt(whole, s), `at ${s} m`);
  // Part 1 (1 to 2 m) of the period in its set's color; part 7 (7 to 8 m) its own; within the change a pair.
  assert.equal(colorAt(whole, 1.5), 2);
  assert.equal(colorAt(whole, 7.5), 7);
  assert.deepEqual(colorAt(whole, 13.5), { from: 2, to: 12 });
  assert.equal(colorAt(whole, 31.5), 17);
});

test('a parted band draws no part whose colors are those beneath it', () => {
  // Beneath, the band's own colors but part 7's: only part 7 is drawn.
  const under = (set) => [1, 2, 1, 2, 1, 2, 1, 2].map((c) => c + 10 * set);
  const drawn = strips([], under);
  assert.ok(drawn.every((x) => x.from % 8 >= 7 - 1e-9 || x.to - x.from < 1e-9));
  assert.equal(colorAt(drawn, 7.5), 7);
  assert.equal(colorAt(drawn, 1.5), undefined);
});

test('a parted band whose base color is not the one beneath it covers no hidden part', () => {
  // A line white in two parts of four, the band beneath it in its two shades in the others: dashes, not a whole line.
  const line = (set) => [9, 1, 9, 2].map((c) => c + 10 * set);
  const beneath = (set) => [1, 1, 2, 2].map((c) => c + 10 * set);
  const drawn = partedStrips(stretches.slice(0, 1), line, beneath, 8, 0, 0, 10, null, strip).flatMap((x) =>
    x.kind === 'repeat'
      ? Array.from({ length: x.count }, (_, n) =>
          x.elements.map((e) => ({ ...e, from: e.from + n * x.every, to: e.to + n * x.every })),
        ).flat()
      : [x],
  );
  for (const [s, color] of [
    [1, 9],
    [3, undefined],
    [5, 9],
    [7, undefined],
    [9, 9],
  ])
    assert.equal(colorAt(drawn, s), color, `at ${s} m`);
});
