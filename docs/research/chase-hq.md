# CHASE H.Q. research notes

Research behind CHASE H.Q.'s road data that the specification does not hold: the programs' map, routines and what is
open. Not a specification: the tables, formats, conversion rules and decisions are its chapter's and [Original road
data](../original-road-data.md)'s. M is the main 68000's program, S the sub 68000's; addresses are each program's.
Read with the research commands and `cpu-68000`; MAME's driver (commit 9c0b6db1) for the hardware alone.

## Sets

- K's `chasehq.zip` matches MAME's `chasehq` (World) by CRC-32. No encryption. M is four 128 KiB ROMs in two pairs of
  even and odd bytes; S two 64 KiB ROMs; the road ROM b52-28 holds the road's lines.

## Frames and the clock

- M's race loop (0x484C to 0x4884) runs once a frame and sleeps a frame, so a tick is a frame, 1/60.056 s by the Z
  system's clock (MAME 9c0b6db1), no routine assumed to overrun one; the criminal's task (0x4A18) runs once a frame
  beside it, in the scheduler's order, which is not read.
- The time (0x1ABE) counts down a hundredth and a binary fraction's borrow a tick, the fraction losing 0x95555555 (read
  from 0x2A6A4 by 0x1AD0): 1.583 hundredths a tick, 63.16 ticks a second the time shows, so a shown 60 seconds take
  63.1; it runs out at 0 seconds shown (0x1ACA), 3,790 ticks after 60.99. The time is set at a stage's start and set
  again when the criminal is sighted (0x7A90, from 0x4B9C).
- Speed: the shown km/h is the speed × 0xA6 / 256 (0x876A); the advance a tick is the speed by the steering's table
  (0x8A76, 0x8AB8).

## Course tables

- M's stage start (0x7ACC) copies the stage's road, its index rotated to 0x1000 bytes a road (0x7AF0), from 0x20030
  (0x7AF2) into the shared RAM at 0x109000; the camera (0x7E70) streams the chase road's sections in (0x7FA4, 0x7FB4).
  A car passing from section 15 to 0 of an approach road goes on to its stage's chase road (0x8088).
- The cars' next section is two bytes a section, for a lateral under and over 0x8000, from 0xAF64 by the road
  (0x803C, 0x8062 to 0x8072). S keeps its own next sections for its drawing (0xF5A4, 0xF5B4, 0xF5C4).
- A record's bytes are read: the curve by the sky (0x6322) and S's road picture (0x1DA8); the grade by the speed
  (0x859C) and S's heights (0xAF8, 0x1BD8, clamped at 0xC3C); the event and second road (0x8F00, S 0x4EB8); the lane
  mask (0x814E, S 0x3C94); the kind (0x7C4C, S 0x4BCE, 0x4EF0, 0x3E58); the palettes (0xEE6, 0xF20); the background
  set (0x5FA0); the event's parameter (0x92F2, 0x9418).

## The road

- S draws the road on the TC0150ROD, four words a line, from 0x8AE, 0x5B0 and its road frame 0x6C2; run on
  `cpu-68000` with a curve forced each way, a positive curve bends the road ahead right, as the forks' branches do (the
  left branch begins bending left, the right one right).
- The lane mask's slots are 0x4A0 laterals each, its nibbles mapped to the road's two edge words by S's tables at
  0xD1A4 and 0xD3A4 (S 0x3EF6, 0x3EFC); a mask's change is smoothed over 0x1000 units ending at its record (S 0x3D14,
  0x3D88), not at forks, merges or a kind 7.
- The road palette's entries (0x2E952) step 1 a channel toward their target every fourth frame (0xF80, from the
  interrupt's 0xED0); the sky's scene fades so too (13 steps).

## The sky

- M 0x631A turns the tile layers' bands by the curve's size, from three tables of 128 words (0x6332), each a band's
  pixels a record: BG1's upper band, the farthest, turns a word / 8 pixels a record, 768 pixels a turn (its 96 columns,
  0x61DA to 0x621E). For a positive curve the rate is negated (0x6344) and, by the TC0100SCN's scroll, the picture moves
  left: the scene turns right with the road.
- The chip draws BG1 at the bottom, every pen its line's color, and BG0 over it, its pen 0 transparent: the program
  writes 0x28 to its control word 6 (0x15E, 0x6E6, 0xB94), its bit 3 set. Where no band lies, BG1's rows are tile 0 in
  color 0, the palette's entry 0, black (0x69C).
- Three bands lie above the horizon, both layers scrolled by the horizon's word (0x6384, 0x638A), each 96 columns: the
  far band, BG1's rows 0 to 17, one of three sets (from 0xD0A2 + 0x2D00, 0xD80 a set, 36 bytes a column), in palette
  line 0x10 + its set; BG1's lower rows 18 to 23, by the background's mode (from 0xD0A2 + 0x480, 0x900 a mode, 12 bytes
  a column), turned by the first table; and BG0's rows 18 to 23 over them, by the mode (from 0xD0A2), turned by the
  second. In mode 4 BG1's rows 18 to 21 take the lower band's words 0 to 3 in the far band's line and turn with it
  (0x60E0, 0x62B2, its row scroll 0xB0 rows), its rows 22 and 23 the words 4 and 5 (0x6162), and the nearer two turn by
  each other's table (0x62E4). The tables' words are 512/g, 384/g and 160/g rounded: the nearer bands turn 3.2 and 2.4
  times as fast as the far one, within 0.5 % at every curve a course takes, so their turns are no whole number of their
  768-pixel pictures.
- On level road (the horizon's word 0, its scroll 0x1E0, and MAME 9c0b6db1's TC0100SCN, row 0 at the screen's dy −
  scrolly with dy 8) the screen's line Y shows the layers' row Y + 24: the far band's rows 40 to 143 on lines 16 to 119,
  its bottom row 40 rows above the road's first line (159), the nearer bands' rows 144 to 182 on lines 120 to 158 down
  to the road. The baked sky keeps the original's 164 rows each way from the horizon: the far band reaches 183 rows
  above it, so its top 20 rows and nothing above lie in the sky; at this game's camera on level road, 120 of the sky's
  rows show, the original's 61 above the horizon (its screen shows 143).
- At a stage's start the setup (0x5F76) takes the background's mode from the first record's byte 6 through 0x2BCF4
  (0x5FA6), the far set 1 in mode 4 (0x5FBA) and bit 1 of the free-running 0x108006 elsewhere (0x5FC0), a set 0 or 2 at
  random; clears the bands' scrolls, so each shows its column 0 at one screen x, the far band's column 175 where the
  road vanishes; and fills them. A record with byte 6 set runs the setup again: in the ten courses stages 2 and 5 start
  in mode 4 (set 1), stages 1, 3 and 4 in modes 3, 3 and 0 (at random), and each course sets mode 1 or 2 once along it
  (at random), its bands' scrolls back to 0. The tribute keeps the original's set where the original sets it and takes
  the stage's set where it picks at random, 0 in stages 1, 3 and 5 and 2 in stages 2 and 4 (K, 2026-11-06, 2026-11-08),
  and its sky keeps facing across a change. The scene (a record's byte 5's high nibble) gives the bands' colors
  (0x2EEE6, 16 lines a set's, set 2's from line 0x18 0x50 lines further), faded in 13 lines, 3 every 4th frame (0xED0,
  0xE72): 17 to 20 ticks. The courses take 38 skies, their set, mode and scene.

## The car beside the road

- M holds its edges at the outermost lanes' centres. It pushes the player's lateral back 3 a tick past the outer lane
  centre ± 0xDE0 (0x8B4C to 0x8B82); it slows the car from 0x3E0 past it (0x85F4); in a tunnel (a record's event 3)
  its wall is the outer lane centre ± 0x1E0, off which the car bounces (0x9B4C).

## The goals

- `goal-ticks` runs M's speed routines (0x84E8 to 0x8AB8), its advance (0x29C6), camera (0x7E70), the criminal's
  advance (0x4EEC) and routines (0x4E62, 0x4BF6 or 0x4C36 and 0x4CC6 on odd frames, 0x4A44) and the time (0x1ABE).
  The criminal starts 0x3FE80 units ahead (0x500C), keeps 0.8125 of the player's pace (0.84375 in stages 2 to 5) until
  the player passes 0x12A800 (0x50C8, medium), then its speed by its lead (0x4C44, 0x50D8); it is sighted within
  0x3000 units (0x4B8E).

## Open

- Which of the race's and the criminal's tasks the scheduler runs first in a frame: the other order moves the goals 0
  to 5 m.
- One height unit's 6.58 mm is the eye's read-back, not the program's.
