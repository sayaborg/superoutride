# POLE POSITION II research notes

Research behind [POLE POSITION II road data](../pole-position-ii-road-data.md) that the specification does not hold:
the programs' map, routines and the projection, how the scale across was measured, and what is open. Not a
specification: the tables, formats, conversion rules and decisions are that document's. F is the first Z8002's program
(`pp4_2.8l`, `pp4_1.8m`), S the second's (`pp4_6.4l` to `pp4_7.3m`).

## Sets

- K's `polepos2.zip` matches MAME's `polepos2` with the four custom chips' device ROMs (`51xx.bin` to `54xx.bin`);
  `research-set` matches its 48 entries given the devices `namco_51xx` to `namco_54xx`.
- The two Z8002s' programs reset to F 0x3280 (a ROM sum test) and S 0x3060. Their non-vectored interrupt (the program
  status area at 0x0100, entry 0x18: F 0x02EA) comes at each frame's vertical blank and runs the frame's work by a state
  table (F 0x0468): the road position moves once a frame.

## Road and position

- F 0x1CBC: the road position, a long at $8184, gains $8170 / 8 a frame; $8170 is the speed $818C times
  (1 − x · curve / 2^23), x the lateral position $8188 and the curve $8198 the table's value there, so a car on a
  curve's inside gains less. The road's vertical scroll is the position's high word.
- F 0x017C lays the road's 128 lines: each line's depth from a table at F 0x35E0–0x36DF (128 words), plus the position,
  gives its interval, whose curve the line's offset accumulates; the offsets go to the road RAM from 0x97E0 down.
- S 0x035E colors the road RAM ahead: 32 entries from the position + 0x0F00 (high word), 8 apart, each the palette
  0x5BE0 + 8c + ((position >> 5) & 7): eight bands an interval. Where the high word lies in 0x20–0x3F, just past the
  lap's wrap, the palette is 0x5C00 + 2c + ((position >> 3) & 1): two palettes by turns, a road RAM entry (8 units)
  each, the start line's checker (FUJI's, SUZUKA's and SEASIDE's palettes 0 and 1, TEST's 14 and 15).
- The road palettes' steps: 0 and 63 the ground beyond the road (green, TEST's brown), 1 to 4 the kerbs (red and white
  by turns along the road), 5 and 6 the shoulders, 7 and 56 the edge lines, 32 the centre line in palettes 4, 5, 8, 9,
  12 and 13; the asphalt's shade changes from palettes 2 to 5 to 6 to 9, and from 10 and 11 to 12 and 13. Palettes 0, 1,
  14 and 15 are red and white two steps by turns across, the two by turns: a checker.
- F 0x2B52 and S 0x2B04 add the player's sideways movement (from the steering, the curve $8198 and the speed $818C) to
  its x $8188: where the sum overflows they return without storing it, and where it is negative they store it and
  again with 1 added, so x stays within ±32,767, its word's ends; no instruction holds it. Besides them only the grid
  (S 0x0650 and S 0x06B6) and S 0x05A8 and S 0x0744, which set it to 0xFE00, write it, none holding it.
- F 0x22E4 to 0x231C slow the car off the road: while $81BC is not 0 they do nothing; where |x| is above 0x4C00
  (5.26 m) the high byte of 0x2000 − |x|, sign-extended (0x2306), goes to $81BC (−45 to −96), a slowing as a crash's
  0xFEA2 is, and where $8104 is 0 its negation shifted right by 3 (5 to 12) to $80FE: from about where the outer wheels
  leave the shoulder.
- The Goal setting's laps less 3 go to $8146 (the Z80 at 0x0A9C reads the settings, bit-reversed); the Speed setting
  and the unit (km/h or mph) select 0x1F38's factor.

## Objects and the projection

- S 0x0A1E draws the 32 objects at $8900 (8 bytes each) by type (0x0A66's table). An object's depth d gives its road
  line 111 − 116d / (d + 147) (S 0x0A86), and a car's picture is two 32 × 32 sprites side by side, each drawn
  ((line + 6) × 3 >> 3) pixels wide (S 0x0B1C, 0x0E0A, 0x0E7C), its view's pictures 2k + 1 and 2k (k 0 straight on).
- The player's car is object type 1 at $8C60 (S 0x0670), its depth 0x10: road line 100. The rivals are type 2 at
  $8B00 (0x20 apart); at GO they stand 0x80 of the high word's units apart, two a row (S 0x063E).
- The scenery's 24 objects a course come from S 0x5A7E + 0x30c, read downwards into $8D00 (S 0x0854): a word each, its
  high byte the interval, its low byte's bits 2–3 the side (S 0x088A), its low nibble the kind. S 0x221A keeps each one's
  place and lateral from the player's ($8184, $8C66); S 0x1D84 puts up to three within 0x0F00 ahead into the draw list
  as type 5, its kind beside it.
- Type 5 (S 0x0CDE) takes its row by 0x0A86, its screen x by 0x0AD4 (the lateral times row + 4, over 1024), its size by
  0x0B6C ((row + 4) / 2 − 1), then lays its sprites by 0x117E (their places) and 0x1282 (their codes and colors): eight
  sprites, a board's tiles and its poles; a size above 0x0F takes the big sprites (0x5BC0's odd entry, bit 15 set), else
  the small ones at twice the size across.
- S 0x1DCC: $8C66 is −x × 5/64, the player's x in the objects' lateral units, −x shifted right by 4 and that again by
  2, added; a positive lateral is left on the screen. A unit of x is so 0.27 mm, and its ends 8.86 m either side of P.
- S 0x239E: the car crashes into a board within ±0x14 of the high word and ±0x384 across ($8C60 0x8004); S 0x23E8 tests
  the special objects (a puddle adding to $81BC by the speed and setting $80EE's bit 2; the arch, S 0x247A), and S 0x22A6
  the rivals (±0x2BC across).
- S 0x0A1E draws $8900's 32 entries by kind (its table at 0x0A66): 1 the player's car, 2 a rival, 3 and 4 a car's crash
  (0x0C9A, 0x0CB6), 5 a board, 6 the START gantry, 7 a puddle, 8, 11 and 13 the title's (below), 9 the airship or the
  plane with its banner, 10 the flagman, 12 the DUNLOP arch; no checkpoint's gate. Each kind's size by 0x0AD4 jumping by
  0x0AFC's table.
- The commands: 1 (S 0x05FA) the race's start (S 0x07E2: the gantry at $8BE0, the special objects); 3 (S 0x0720) the
  qualifying's (S 0x07C2: the gantry, no puddle); 5 (S 0x0772 → 0x077A) the title fixed on the screen, kind 11 (S
  0x197C, 0x1A10); 16 (S 0x088E, F 0x08DC, the demo) clears the gantry and the special objects and lowers the title's
  banner (kind 8) and its II emblem (kind 13: S 0x0894 sets it at $8BE0, big sprites 0x66 and 0x67 in color 0x34, its
  lateral 0x1500; S 0x09B4–0x0A1C moves it) from the sky (S 0x094C–0x0A1C), the title's objects; 24 and 25 (S 0x0594 → 0x07A4, 0x05F0 →
  0x0794) the airship or plane at $8BE0; 26 (S 0x057A) the flagman at $8C00; 27 (S 0x056E) its waving (S 0x090A, a
  picture each 8 frames to 0x29); 28 (S 0x0566) clears it.
- Kind 9, the airship or plane (S 0x16FC, 0x176E): 8 big sprites at x ($8884, 0x100 from S 0x07B2), the craft 0x60
  (the course's bit 0 clear) or 0x61, its color by x & 4 (0x31 or 0x26, 0x30 or 0x2F), the banner 0x62–0x65 at x +
  0x20k in color 0x24 + its state, and 0x62–0x64 0x12 rows above from x + 0x80 + 0x10 (0x20 in state 0) in color 0x2D,
  their code words 0xA262 (size register 0x22, drawn 35 rows; the others' 0xA0, 33). S 0x0932 moves it 2 pixels
  left a frame and keeps it at the car's high word − 4; S 0x0D84 draws it without 0x0A86 or 0x0AD4, so it is fixed on
  the screen.
- The gantry's state ($8BEC, 0x14FA's word by it): 0 all lamps dark and START, 1 to 3 the countdown, 4 GO (F 0x1ADA to
  0x1B2C), 5 namco at 0xC0 of the first lap, 6 GOAL at 0xC0 of the last (F 0x1EEC, which also sends the flagman).

## Explosion

- A listing that decodes the second program from 0x004C misreads S 0x004E, the random word: it reads $8898, adds it
  four times over with 1 and the frames' count $8820 (which S 0x00B0 adds to each frame), and stores it again: 5r + 1 +
  $8820, so the original's debris differs with the frame of its contact.
- The contacts that start the player's car's explosion (S 0x2300, S 0x23C2, F 0x1296) clear $8C7C and leave $8C7E,
  which only S 0x2518 (the script's picture) and S 0x253E (its command 0, 0xF) write: an explosion after the first
  hides its frame 0 by the last one's 0xF, a remainder, not the script's.
- Command 6 sets $81FE, which the first program alone reads: its states 0x0716 and 0x084A (its mode 1's, the table at
  0x0478 by 0x0468's) test it and move on to their next state ($8014 + 1), clearing it again where they start (0x0700,
  0x0834).
- At frame 100 ($8C7C = 0x64) both programs (S 0x277E, F 0x2786) put 0x0008 into the ring at $AA00, a sound's
  command by its place among the others.
- While the car is of kind 4, S 0x24CC takes 0x50 from $821C each frame (to 0) and clears $8220, $8190, $821E and $8480:
  it stops the car, which this game's own stop does.
- A rival's explosion is kind 3 (S 0x22EE, F 0x1258, F 0x128A, $1E 0x7FF): S 0x24B8 takes 0x14 from its $1E each frame
  and makes it kind 2, gone, once negative; S 0x0FA6 draws picture ~($1E >> 8) & 7 while below 5, codes 0x1E + 2f and
  the next in color 0x28 (the fireball's pictures 3 to 7), at S 0x0B54's size, a board's where $81AE is 0, else 0x2757A
  / (depth + 0x37E) to 0x3F; it has no debris.
- The first program's F 0x1D3E, called only from its mode 3's state 9 (0x113C, the table at 0x0490 by 0x0468's), writes
  the high word of $8290 to the player's car's depth $8C68: $8290 starts at 0x12 (0x0B22) and gains $828C over 8 each
  frame, $828C growing by 0x9C40 to 0xFA (or falling by the off-road slowing $81BC): the car drawing away from the
  camera, read as a scene after the race (K, 2026-11-08: not the explosion's).

## Scale across

- The car's picture straight on (sprites 0 and 1) is colored over 52 of its 64 columns (the first's 6–31, the second's
  0–25, to the rear tyres' outer edges).
- At road line 100 the car is 63.4 pixels wide (52 × 39 / 32) and the road ROM's steps 8–55 (between the edge lines)
  322 pixels, 7–56 334: the car is 0.197 of the road between its edge lines. A Formula One car of 1983 was at most
  2.15 m wide, so the road is 10.92 m between its edge lines and a lane 5.46 m; K rounded it to 5.5 m (2026-11-04).
- The ratio is 0.196–0.203 from line 20 to 127: the car's picture and the road both grow from about line −4.

## Camera (eye height)

- The road ROM's steps 8–55 are 74 pixels at line 20 and 406 at line 127: 0.0646 pixels a step a line, zero at road
  line −3.85 (screen row 124.2, the horizon). With rows 6/7 of a column, the eye is **13.26 steps** above a level road,
  3.04 m at the 5.5 m lane, against the car's 2.15 m.
- The depth table (F 0x35E0) is near a pinhole: z + 147 = 16,996 / (i − 11.0) within 8 units for its lines 16–126 (z
  in the road position's high word's units); its focal length is not yet measured.

## Background

- F 0x1CF6 to 0x1D38: $8180, a long, gains −curve × min(speed, 255) × 64 a frame, its high word the background's
  scroll (0xC000): 2 pixels a curve value an interval, so a lap scrolls twice its table's sum (TEST 4032 pixels).
- S 0x022E lays 60 columns about the scroll ((scroll − 0x40) / 8), S 0x0208 eight each side as it moves; S 0x023A a
  column's run and its sky (0x587C, every row tile word 0x10FF), S 0x02EE and 0x029E the shapes of 0x589C (the clouds)
  within 0x30 and 6 columns of it.
- At GO the scroll is 0 (S 0x05AE).

## Open

- The player car's depth while racing (0x10 is where S 0x0670 sets it).
- Why the background scrolls about twice its panorama a turn, and whether its clouds move apart from it.
