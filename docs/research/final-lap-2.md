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
  0x87C2C0 / z − 0x15A, its zoom min(z / 16, 0x3FF), its offset the curve twice summed; S 0x16F6 lays them on the
  screen's lines and S 0x217C copies them to the road's line memory.
- The slope table (D 0x204000 + 0x440c) changes the depth's step, so the road's lines draw nearer or farther apart: it
  is no grade. USA's is 40 on its straights and falls to −40 in its corners.
- S 0x2FFE: an object at line r is scaled by min(0x1AF26 / (r + 0x15A), 0xFF), placed by 0x158A6 / (r + 0x15A).

## Scale across

- A car (S 0x2B16) lays its 32-pixel tiles a quarter of its scale apart (S 0x2C90), so a car's pixel is 862.3 /
  (r + 346) screen pixels and a road pixel 542.0 / (r + 346): a car's pixel is 1.591 road pixels.
- The rear view, big sprites 0 and 1, is colored over 57 of its 64 columns (5 to 61): 90.7 road pixels.
- USA's road picture's first row: sand to 31, a grey shoulder 32–48, the left edge line 49–62, the asphalt 63–640,
  shaded across, the right edge line 641–654, the wall 655–703, sand on: 578 pixels between the lines' inner edges,
  592 between their middles. At 2.15 m the car makes the road 13.70 m between the inner edges.

## Open

- The courses' heights from their screen.
- The road picture's rows along the lap (the grid's marks, the kerbs) and the start line.
- The objects, and the backgrounds (the C123 tile layers).
