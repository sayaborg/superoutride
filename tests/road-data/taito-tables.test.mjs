import assert from 'node:assert/strict';
import test from 'node:test';
import { groundMaterial } from '../../tools/road-data/shared/ground-material.ts';
import { nextSections, sectionRecords } from '../../tools/road-data/taito/course-records.ts';
import { rgb555Of } from '../../tools/road-data/taito/palette.ts';

/** A palette word of the Z system's chip: red in bits 0–4, green in 5–9, blue in 10–14. */
const xbgr = (r, g, b) => r | (g << 5) | (b << 10);

test("a palette word's red and blue take this repository's places, so the ground's material is its color's", () => {
  assert.equal(rgb555Of(xbgr(31, 0, 0)), 31 << 10);
  assert.equal(rgb555Of(xbgr(0, 0, 31)), 31);
  assert.equal(rgb555Of(xbgr(0, 31, 0)), 31 << 5);
  assert.equal(groundMaterial(rgb555Of(xbgr(6, 8, 24))), 'WATER'); // blue strongest
  assert.equal(groundMaterial(rgb555Of(xbgr(28, 24, 16))), 'SAND'); // red strongest: sand, not water
  assert.equal(groundMaterial(rgb555Of(xbgr(6, 16, 6))), 'GRASS');
});

test("a section is 32 records of 8 bytes, and its next sections two bytes, the left's first", () => {
  const p = new Uint8Array(0x200);
  for (let i = 0; i < 0x100; i++) p[i] = i;
  p[0x100] = 3;
  p[0x101] = 4;
  const records = sectionRecords(p, 0);
  assert.equal(records.length, 32);
  assert.deepEqual(records[1], [8, 9, 10, 11, 12, 13, 14, 15]);
  assert.deepEqual(records[31], [248, 249, 250, 251, 252, 253, 254, 255]);
  assert.deepEqual(nextSections(p, 0x100), [3, 4]);
});
