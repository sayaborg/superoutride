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
- S 0x299A writes its sprites at a2 (the sprite list), 4 to 0x10532A and 1, d3, d2, d5, d7 to the shared 0x409070 to
  0x409078. S 0x1C3C copies those 12 bytes to 0x100060 each frame and clears the flag; S 0x1CEE, while the flag was
  set, writes 0x40902A and 0x40903A from the row less a quarter of the size, and 2 to 0x420024: the display's
  registers. The master reads none of them.
- The master's class handlers are the longs at M 0xD0DE: class 3 M 0xD4C6, class 4 M 0xD2E6, class 5 M 0xD26E. M
  0xD26E writes 0x80 to 0x460814 within 0x258 of the object's place (clearing it beyond, for the object 0x100), and
  within 0x64 pushes the car aside (0x460812 = 0x80, its $16 ±1) where its x lies 0x15E0 or more from the object's.

## Open

- What kinds 118 and 119 are for: the master tests them as objects, but they lay no sprite (MONACO, ITALY and USA).
