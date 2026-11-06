# FINAL LAP 2 research notes

Research behind [FINAL LAP 2 road data](../final-lap-2-road-data.md) that the specification does not hold: the
programs' map, routines and projection, how the scales were measured, and what is open. Not a specification: the
tables, formats, conversion rules and decisions are that document's. M is the master's program, S the slave's, D the
data (from 0x200000).

## Sets

- K's `finalap2.zip` matches MAME's `finalap2` by CRC-32 under older names, `lh5762.6n` aside; the MCU's
  `sys2mcpu.bin` is the C65's device ROM.
- No encryption; the protection at 0x300000–0x33FFFF is a sequence the programs read, no key.

## Frames and the lap

- M's level-1 interrupt (0x43AC) runs the frame's state routine through $7002 once a frame; the clock counts 0x3C
  ticks a second (M 0x78F6).
- M 0x6BAA to 0x6C92: the position $409014 gains $30 / 100 × (100 + a slope term) / 400 a tick, $30 / 400 on the
  level; $409018 gains the same, and S 0x1400 streams a step of the road's picture each 0x40 of it.
- M 0x782E: the shown speed is $30 / 164.18; a unit is 1.117 cm if it shows km/h.
- M 0x740C: laps = (position − 0x946) >> 18. M 0x58A6: grid slot k at 0x708 − 200k, x ±0x7D0 by turns.

## Projection

- S 0x1608: from a depth z = 0x6470 down by 0x4900 / (0x80 + slope / 2) while z > 0x1F4, each entry's line
  0x87C2C0 / z − 0x15A, its zoom min(z / 16, 0x3FF), its offset the curve twice summed; S 0x216A copies line n to
  the road's line memory's word 310 − n, which the C45 shows on screen row 295 − n (MAME's driver: row y from word
  y + 15), so lines 72 to 295 are the screen's rows. S 0x16F6 writes 25 more words past line 0, off the screen.
- The slope table (D 0x204000 + 0x440c) changes the depth's step, so the road's lines draw nearer or farther apart.
  The row of a line X units from the pinhole is 295 − (0x6470 − 0x87C2C0 / X) / step: a step other than the level's
  shifts it by an amount growing as (X − 0x15A) / X, as a level camera sees a road graded from the position (0x15A
  units ahead of the pinhole). USA's is 40 on its straights and falls to −30 in its corners.
- M 0x581C keeps the player's car 0x190 units ahead of the position ($110); M 0x740C counts the laps from it.
- S 0x2FFE: an object at line r is scaled by min(0x1AF26 / (r + 0x15A), 0xFF), placed by 0x158A6 / (r + 0x15A).

## Scale across

- A car (S 0x2B16) lays its 32-pixel tiles a quarter of its scale apart (S 0x2C90), so a car's pixel is 862.3 /
  (r + 346) screen pixels and a road pixel 542.0 / (r + 346): a car's pixel is 1.591 road pixels.
- The rear view, big sprites 0 and 1, is colored over 57 of its 64 columns (5 to 61): 90.7 road pixels.
- USA's road picture's first row: sand to 31, a grey shoulder 32–48, the left edge line 49–62, the asphalt 63–640,
  shaded across, the right edge line 641–654, the dark face where the kerb begins 655–703, sand on: 578 pixels between the lines' inner edges,
  592 between their middles. At 2.15 m the car makes the road 13.70 m between the inner edges.

## The underpass

- The slave's object passes (S 0x2FBA, its far list from 0x40C000, and 0x30BC, its near one from 0x40C100) take each
  object's routine from the words at S 0x31A2 by its class (the object's first word × 2, 4 bits): class 3 S 0x27D0, class
  5 S 0x299A. Each sets d3 its road line's screen row, d2 its x (its lateral by 0x158A6 / (line + 0x15A), 0x452 /
  0x2C0), d7 its zoom (0x1AF26 / (line + 0x15A), at most 0xFF), d5 a quarter of it, d4 an eighth and d6 d5 turned
  right by 6, the sprite words' size bits.
- S 0x299A writes its sprites at a2 (the sprite list), 4 to 0x10532A (the priority of its sprites and the objects'
  after it; S 0x2FBE sets 2 each frame before the objects) and 1, d3, d2, d5, d7 to the shared 0x409070 to 0x409078.
  S 0x1C3C copies those 12 bytes to 0x100060 each frame and clears the flag. The master reads none of them.
- S 0x1CEE, while the flag was set: clears 0x100070, sets 0x10010A to 10, writes 2 to 0x420024 (face 2's priority; M
  0x2E98 sets 1 at a race's start, M 0x2EA0 face 2's color register 0 at 0x420034). Face 2's y (0x1D0E to 0x1D36): the
  row less size/4 (`lsr.w #2`); where negative, at least 0xFED1, plus 1; plus 0x13E; to 0x40902A and 0x40903A. Its x
  (0x1D3C to 0x1DBC): −x + 0x1C plus 8 × (size − 1) past size 4, else 8 × size (where near, 0x10010C set or the row not
  negative: 8 × (size − 1) to size 7, 8 × (size − 2) to 11, else 8 × (size − 3), and from size 8 one less); from 0x90
  (size 19) laid so that the stopped window's ends lie off the screen (0xFFD3, 0x14D, 0x2D); to 0x409028 and
  0x409038. Then far (0x10010C clear, the row negative) S 0x1DE4,
  else S 0x1F40.
- The scroll sets: 0x409020 to 0x40902E and 0x409030 to 0x40903E each hold faces 0 to 3's x and y. S 0x194C's vertical
  blank (0x1A6C) copies 0x409030 on to the C123's scroll registers (0x420002 + 4k), its raster interrupt (S 0x18F6)
  0x409020 on, at the line S 0x1230 writes to the C116's register 5 (0x5F): above row 64 0x409030's, below 0x409020's.
- S 0x1DE4 (far): 0x40903A = 0xD0. The band (to 0x1E6A), from 0x100100 (S 0x1C76: 0x405080, row 33): its height 6 ×
  size (`and #$3F`, ×3, ×2), not past 0xB0; where it passes a tile's rows (`and #$18`), a row of 64 × 0x0448 (from
  0x1E32) back from a0, then a row of 0x440 + (height & 7) (0x1E4A), a0 back down a row. The window (to 0x1F36), from
  0x100106 (S 0x1C80: 0x404FFC): pairs min(size, 0x13), one fewer once past size 4 (0x100112), each new pair of 0x0C00
  (0x1E76) from its top row down its height's rows (`subq #8`, `bpl`), 0x405000 set; its height 3 × size + 3 ×
  ⌊size/4⌋, `and #$F8`, not past 0xB0, each new 8 a row above of its pairs (one fewer past size 4) from column 0.
- S 0x1F40 (near): 0x10010C = 1, 0x40902A = 0xD0; where the size has fallen, fills the window's right columns back with
  0x0448.
- S 0x1C56 (the flag clear): 0x40902A and 0x40903A = 0xD0; after 0x10010A's 10 frames, S 0x1C76 resets the state and
  0x100070 counts up: from 10, its row (count − 10) of face 2 cleared to 0x007F, until 0x4A (rows 0 to 63).
- JAPAN's tiles (face 2's register 0): 0x0448 all pen 13 (0x01E0); 0x440 + k its bottom k rows pen 13; 0x0C00 and 0x007F
  clear.
- The master's class handlers are the longs at M 0xD0DE: class 3 M 0xD4C6, class 4 M 0xD2E6, class 5 M 0xD26E. M
  0xD26E takes the car's position and the object's each over 4 (`lsr.l #2`): within 0x258 of each other (0x960 units)
  it writes 0x80 to 0x460814 (clearing it beyond, for the object 0x100), and within 0x64 (0x190 units) pushes the car
  aside (0x460812 = 0x80, its $16 ±1) where its x lies 0x15E0 or more from the object's.

## The car's limits

- M 0x6382 sets a0 to its own car's record ($4000(a6), 0x104000) and calls M 0x61B6 (0x638C) and M 0x6B18 (0x63BC);
  a0 stays between them.
- M 0x61B6, 0x6208 to 0x6296: the car's position $4(a0) over 0x40 (a step), plus 2; its group of 32 a byte of the
  course's table at M 0xD970 (the slave's road pictures' at S 0x31C4), the group and the step a word of 0x220000's, a
  row of 16 words at 0x222000 (each a 4 × 4 tile block, 0 none). From the row's left end, its left bound −5,280
  (0xEB60) plus 0x400 for each 0 word; from its right end, its right bound 10,304 (0x2840) less 0x400 for each; all 0,
  −5,280 and 0x1400. To $20(a0) and $22(a0). It reads the position of the frame before.
- M 0x6B18, 0x6C08 to 0x6C38: the car's x ($104(a6), from P, its middle) plus its lateral speed ($34(a6)) and push
  ($3C(a0)), held each frame from $20 − 0x800 to $22 + 0x600 (signed compares).
- Rivals' records take bounds from M 0x61B6 too, but M 0x6038 and M 0xC74A only steer them for the bounds' middle;
  none is held.
- Every row of the four courses has exactly 5 empty words at its right end: the right limit is 6,720 laterals (9.95 m)
  everywhere.

## Open

- What kinds 118 and 119 are for: the master tests them as objects, but they lay no sprite (MONACO, ITALY and USA).
