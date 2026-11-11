# BIG RUN research notes

Research behind BIG RUN's road data that the specification does not hold: the programs' map, routines and what is open.
Not a specification: the tables, formats, conversion rules and decisions are its chapter's and [Original road
data](../original-road-data.md)'s. M is the main 68000's program, R1 and R2 the first and the second road 68000's;
addresses are each program's. Read statically, and the road CPUs' frame routines run on `cpu-68000` where one CPU's
routine sufficed; MAME's driver (commit 179cfab5) for the hardware alone.

## Sets

- K's `bigrun.zip` matches MAME's `bigrun` by CRC-32, its ten PROMs aside (in MAME's list since 0.233, read and unused by
  its driver). The clone `bigrunu` (US?) has another main program pair and the same road CPUs' ROMs, so the same roads.
- No encryption on M, R1 or R2: their reset vectors and first instructions read plainly. The sound 68000's program is
  encrypted by a Mega System 1 gate array (D65006) and not read.
- M is a pair of 256 KiB ROMs from 0 and a pair of 128 KiB ROMs from 0x100000; R1 and R2 a pair of 128 KiB ROMs each, the
  upper half of each 0xFF; the planes' tiles two 128 KiB ROMs each; the road two 512 KiB ROMs.

## The sky

- The road layers draw the sky's rows: R2's frame routine writes, above the road's top row, a row of its table (0xEB8:
  0x56BA, R1's 0x5694 the same bytes) each, offset by the road's rows above its last line (0xEEC); the rows' priority
  is 0x400 or 0x500 by the profile record's flag (0xF12 to 0xF22). Running R2's frame (0x19F0 and 0x806) on a level road
  gave 93 road rows (its `$c1304`, which M reads as `$f6022`) and the sky's rows from line 146 up as the table has them.
- Each plane has a background object: plane 1's from M 0x8E20, plane 0's from M 0x9274. Each takes its stage's scenes,
  waits for the road position to reach a scene's start (0x8EB4, 0x92E2), loads its palette (0x8FC6 on, to 0x9D600 and
  0x9CE00) and writes its first 18 columns a frame each (0x8F62), then streams a column as its scroll crosses 16 pixels
  (0x9054 to 0x90AA, 0x917E, 0x91DE), the picture a ring.
- The turn: each frame each object adds, over its road's current arc record (0x7358: two tables a stage, the road the car
  is on choosing by `$f047e`, 10 bytes a record: its start, its length, the front's and the back's pixels), the record's
  pixels eased over its length by the table at 0x11DA00 (0x903A to 0x9070). Over every arc the pixels are 12 and 8 a
  degree of the arc's angle (its length over its radius); a record spanning arcs one after another holds their sum.
- Plane 1's vertical scroll is its scene's +8, its step table's (+1A: 8 bytes a record, a start, a step, a rate eased by
  0x11DA00) and the road's rows above its last line (0x90AC to 0x9100); plane 0's alike.
- Open: the scenes' change seen on the screen (its 18 frames of columns and its palette's), and the vertical steps
  along a scene, which a sky does not lay.

## Its roads

- Each road CPU draws the road whose tables it loads into `$c0008` (R1 0xA1E: 0x8D4; R2 0xA0E: 0x864) and reads the
  plan record's picture (+0x16, +0x18) from it (R1 0x0CAC); the other table (R1 0x85E: 0x874; R2 0x84E: 0x8C4, into
  `$c002c`) is a copy of the other road's, which it takes to place its own. So road 1 is 0x8D4 in R1 (0x8C4 in R2) and
  road 2 0x864 in R2 (0x874 in R1). The first road CPU inverts `$c00b0`, the main's `$f047e`, as it takes it (R1
  0x81E). The study had taken each CPU's own road for the copy, and so read road 1's records as road 2's.
- Seen running R2's frame on a level road with `$f047e` 0, the second road CPU's layer is centred on the car (its
  scroll 384 on every row, the road's line centred at 512): the car is on road 2 there. Where both tables turn on an
  arc whose flag's top bit is set (SPECIAL STAGE 1, 26,000), the far rows' scroll falls, their road lying right of the
  screen's middle: the flag turns the road right. MAME draws BIG RUN unflipped (`ROT0`).
- The main sets `$f047e` to 1 where the first road CPU's road is nearer the car (M 0x4B5E: each road CPU's centre at
  the car's row less 0x180, the second road CPU's kept on a tie) and from its lists of stretches (`$f0154` sets it to
  1, `$f0158` to 0, M 0x4B2E to 0x4BEE): each points into the main's copy of a road's profile records (M 0xA4C, 16
  bytes a stage: `$f0154` road 1's, `$f0158` road 2's, 10 bytes a record), a record's +8 bit 1 holding the car on that
  road from where it starts. In STARTING RUN (138,756 to 163,731 and from 189,612) and SPECIAL STAGE 1 the car is held
  on road 2, above road 1; in SPECIAL STAGE 2 (213,346 to 229,233) on road 1, below road 2; in VICTORY RUN from 200,867
  on road 2, which turns 90° from 186,655 while road 1 goes straight on.
- A profile record's height rises by the sine of its grade's angle a position (SPECIAL STAGE 1's straight at −20° from
  83,198: 1,025 down over 3,000). SPECIAL STAGE 1's last records fall from 0° at 364,936 to −30° at 370,172 and on to
  −150°, past its goal; VICTORY RUN's road 1 in the first road CPU's program holds no end after 275,264 (its copy in the
  second's does).
