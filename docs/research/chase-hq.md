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
- The TC0150ROD draws a line's body between its edges, the edges outward from them and the ground beyond, in a palette
  line by the line's bank, 0 to 7, which its stripes step (S 0x348C): a body pen of bank b in line 0xC1 + 4b, an edge's
  and the ground's in line 0xC0 + 4b, from 0xC0 as MAME's driver draws CHASE H.Q.'s road. At the nearest row (S 0xA60)
  the road tile is 0x1A3 (S 0x3498) and a lane 137 pixels (S 0x9D2's widths, 9 a row): each edge is 21 pixels beyond the
  lanes, 0.55 m, pens 2, 1 and 3 outward, 7 pixels each. The road palette entry's words set the body's pen 3, the first
  in banks 0, 2, 4 and 6 and the second in banks 1, 3, 5 and 7, and the ground, the third in banks 0 to 3 and the fourth
  in 4 to 7 (M 0xF20 to 0xF7E, their lists from 0x2A348); the stage's two words set every edge pen, the first in the
  even banks and the second in the odd (M 0xE46, lists from 0x2A37C): white and red in stage 1.
- A row's bank is the row's distance on from the camera's position, shifted left twice within word 3's bank bits (S
  0x348C to 0x34C2): the banks step every 0x400 positions from the stage's start, eight a record, the same across the
  line and for both roads. The body line of the nearest row's tile draws its lines in its pens 1 and 2 (the lane lines
  and, beyond three lanes, two under the edges); the palette words set those pens to the body's own colors in every bank
  but 3 and 7, where they keep the colors the main program loads at its start (M 0x6B8 to 0x6C4 for lines 0xC0 to
  0xDF, four pens a line; lines 0xE0 to 0xFF from M 0x6C6), so that the lines show as dashes. The palette's other
  writers found (M 0xE12, 0xE4C, 0xED0, 0x1480, 0x424A) set the road palette entry's and the stage's words or fade
  other lines.
- The road palette's entries (0x2E952) step 1 a channel toward their target every fourth frame (0xF80, from the
  interrupt's 0xED0); the sky's scene fades so too (13 steps).

## Heights

- S adds height a step of 0x100 positions (0.768 m), 32 steps a record (S 0x1A44 to 0x1B94): its window's records'
  grades (byte 1) clamped to −10 to +16 (S 0xC3C to 0xC74), a step adds 4 height units a unit of the record's grade (its
  16.16 sum, S 0x1C38, 0x1C3E) and the blend table's for the change to the next record's grade, clamped to ±30 (S 0x1C12
  to 0x1C2E; 0x6C00, 128 bytes a change). The table adds nothing over a record's steps 0 to 16 and a quarter of the
  change more each step from 17 to 31, so the grade holds over a record's first half and goes straight to the next
  record's over its second. A record shorter than its 32 steps, where the window begins, takes the same sum (S 0x1B96).
- A height unit is 2.165 road laterals, as the eye reads it back: S's height scale at its nearest row, the table
  0x1FE54's word 0x4000 a 65536th of a pixel a unit (S 0xA54, 0xD1C), over its lateral scale there, 0xB4 + 0x1D22 ×
  0x67/0x68 a 65536th (S 0x25EE to 0x2612), the scale's base 0x8000 as the study read it, not run; at a lane of 3.6 m
  over its slot's 0x4A0 laterals (M 0x8148) that is 6.58 mm, a grade unit 3.43 %, −34 % to +55 %. Rows nearer the
  horizon read 2.15 to 2.26.
- Laid as a rise table at a grade unit's resolution, its passages where it crosses itself fixed points, a course's
  height departs from the table's by 4.2 m (stage 3 left) to 35.2 m (stage 2 right) up to its goal, its grade within
  0.047 of the table's. The grades are whole quarters of a grade unit, so a run's line often departs by the resolution
  exactly: a resolution 10⁻¹² larger or smaller lays stage 2 right in 117 or 121 runs for its 119, departing 29.8 or
  30.5 m.

## The road not taken

- S draws the fork's other branch as road B: when a record that begins a second road (byte 2's bits 1–0 of 3) leaves its
  window of 9 records (S 0x4EA8), it marks road B shown and keeps the camera's position (S 0x4E4A to 0x4E96); then road
  B's P lies the table 0xF654's word for (d & 0xFF80) >> 6 laterals beside the course's (S 0x4DBA to 0x4DF0), d the
  camera's positions since, negated where the side table 0xF5E4's byte for the camera's section (0x1021BC, S 0x4DAC) is
  not 0 (S 0x4DE4 to 0x4DEE), until d reaches 0x10000 (S 0x4DCC), where road B is shown no more (S 0x4E02). The table
  rises from 0 to 3,072 laterals, nearly as 192 √(d / 128). The side table keeps the sign for the fork's left branch
  (section 3) and negates it for its right (section 4), and road B's P lies right of the course's where the lateral is
  positive (S 0x25B6 to 0x25EE, road B's lateral from 0x102626 added to the camera's): road B moves away from the
  course's road, to the right where the course takes the left branch, as the conversion reads it from the table.
- Where its two roads overlap, the TC0150ROD shows each pixel's part of the higher level, as MAME's driver describes
  its levels, by its own account not surely: road A's edges lowest, then its body, road B's edges and road B's body, at
  a tie road A's; a line's priority bit (bit 13 of its words 0 to 2) raises road A's part or lowers road B's. S sets no
  priority bit: it writes each line's words 0 to 2 for both roads (S 0x4216, 0x4482, 0x46EE) from its edges' pixels with
  at most their background bit, or on the dirt road's rows their palette's and background's (S 0x3FEA to 0x4174), and
  its body's offset with one palette's bits for both roads and its background bit (S 0x43F6 to 0x445C, 0x48CE to
  0x4934; the dirt road's rows S 0x3BAC to 0x3BDE). A road's lines are pens of its body line, its edge line holding
  none, so that road A's lines lie under road B's edges. Each row's word 3, its bank and tile, is written alike to both
  roads' tables (S 0x349E to 0x34C6), which their lines take (S 0x41A4, 0x41EE): road B's colors and stripes are road
  A's row by row, but for its tunnels' darkness (word 3's top bit), which comes from its own records (S 0x33EE), road
  A's from its own (S 0x33C8).

## The plan

- A course's plan turns as its far band turns: a record its curve's size's word of the band's turn table (0x6332) over 8
  pixels, 768 a turn, a positive curve right (The road, The sky). Up to their goals the ten courses cross themselves 19
  times, their passages 200 m or more apart along them: 14 bridges, their passages' heights 12.0 to 253.6 m apart
  (stages 2 left, 3 right, 4 left and right, 5 left and right), and 5 at one height within 1.69 m, stage 4 left's at 802
  and 2,784 m and stage 5's at 191 and 1,404 m and at 380 and 1,230 m on both its courses. The two crossings of stage 5
  beyond 9,990 m that the static goals reached are not on its courses.

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
- The car's lanes' centres are its record's mask's, as it stands (M 0x8134, 0x8142), so its limits change at once at a
  record's start, 0xDE0 beyond the outermost lanes' centres, 9.0 m beyond the lanes' edges (M 0x8B50), and in a tunnel
  0x1E0, 0.34 m within them (M 0x9B5A). The sub program draws a merge's record of kind 4 with its mask's left nibble
  alone and one of kind 5 with its right (S 0x4BCE to 0x4BE0), and takes a mask's change at once where its record or the
  one before begins or ends a second road or its kind is 7: each course's lanes jump twice, at its fork and at its
  merge.
- Each course's ground is one material each side, changing where its road palette's ground changes: of its two colors,
  never differing in material and never `WATER`, `GRASS` where green is the strongest, the grey green (12, 14, 12) among
  them, and `SAND` elsewhere.

## Camera

- As the study read S, not run: the eye stands 914 laterals above the road, 0.772 of a lane, 2.78 m at a lane of 3.6 m;
  its rows' depths (0x1FF24) hold (r + 2.5)(z + 1092) ≈ 110,000 within 1 % over rows 30 to 97, a focal length of 119
  rows, half the screen's height; its lateral scale at row r is (0xB4 + 0x1D22 r / 0x68) / 65,536 pixels a lateral (S
  0x25EE), the horizon on line 155.5.

## The goals

- `goal-ticks` runs M's speed routines (0x84E8 to 0x8AB8), its advance (0x29C6), camera (0x7E70), the criminal's
  advance (0x4EEC) and routines (0x4E62, 0x4BF6 or 0x4C36 and 0x4CC6 on odd frames, 0x4A44) and the time (0x1ABE).
  The criminal starts 0x3FE80 units ahead (0x500C), keeps 0.8125 of the player's pace (0.84375 in stages 2 to 5) until
  the player passes 0x12A800 (0x50C8, medium), then its speed by its lead (0x4C44, 0x50D8); it is sighted within
  0x3000 units (0x4B8E).

## Open

- Which of the race's and the criminal's tasks the scheduler runs first in a frame: the other order moves the goals 0
  to 5 m.
- One height unit's 6.58 mm is the eye's read-back, not the program's: the lateral scale's base at rest is not run.
