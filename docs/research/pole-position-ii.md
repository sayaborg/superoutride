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
- S 0x1DCC: $8C66 is −x × 5/64, the player's x in the objects' lateral units; a positive lateral is left on the screen.
- S 0x239E: the car crashes into a board within ±0x14 of the high word and ±0x384 across ($8C60 0x8004); S 0x23E8 and
  0x22A6 test the rivals likewise (±0x3E8 across).

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

## Open

- The player car's depth while racing (0x10 is where S 0x0670 sets it).
- The object S 0x0894 sets at $8BE0 (type 0x0D, big sprites 0x66 and 0x67 in color 0x34, the emblem, its lateral
  0x1500) and what moves it; no puddle was found among the programs' objects.
- The background's layer and its turn.
