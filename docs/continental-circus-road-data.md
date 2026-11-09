# CONTINENTAL CIRCUS road data

How CONTINENTAL CIRCUS's ROMs are read (its ROM set, hardware, tables and conversion). The rules every original is
raised by and the parts the originals share are [Original road data](original-road-data.md)'s; the programs' map and
what is open are its [research notes](research/continental-circus.md)'s.

CONTINENTAL CIRCUS's courses are raised from MAME's `contcirc` (Continental Circus (World), Taito, 1987), its parent
set, whose programs are not encrypted. Its hardware and ROM list are MAME's description of the Taito Z system's
`contcirc`.

## CONTINENTAL CIRCUS's ROM set

K's `contcirc.zip` matches MAME's `contcirc` by CRC-32. The conversion reads the main 68000's program pair (its even and
odd bytes from 0), the sub 68000's pair, and the TC0100SCN's tile ROM (`continental-circus-rom`).

## CONTINENTAL CIRCUS's hardware

- **Its tile layers.** The Z system's TC0100SCN ([CHASE H.Q.'s hardware](chase-hq-road-data.md#chase-hqs-hardware)),
  its control word 6 0x28 (M 0x902), so that BG1 is drawn at the bottom, opaque, and BG0 over it, its pen 0
  transparent; each layer 64 × 64 tiles, 512 pixels across, a tile two words, its attribute (its palette line) and its
  code.
- **Its colors.** A palette word is xRGB555, red in bits 10 to 14 as this repository's RGB555 (`xrgb555Of`), where
  CHASE H.Q.'s board holds xBGR555: each board wires its palette chip, the TC0110PCR, its own way.

## Its courses

Eight courses, BRAZIL to JAPAN in the program's order (its names at M 0x46FA), each one lap of a circuit
(`continental-circus-road`).

- **Its streams.** A course is a stream of records in the sub program, the long at S 0x28774 by the course (S 0xC062):
  each record 8 bytes, a word added to a running position, a command and a long argument, acted on as the road passes
  its place through the jump table at S 0xC0C8: a curve, a hill, a thing, a pit lane, a zone of the road's lines, the
  finish, and the loop, which goes on after the record its argument names (S 0xC0D8), so that every lap after the
  first reads the same records.
- **Its lap** (`continentalCircusLap`) is the loop's records from its line, its first record, a zone painting a line
  across the road where the start gantry stands (kind 7, or 2 in MONACO and JAPAN), to the loop, whose running position
  is the lap's length: 1,076,536 positions (FRANCE) to 1,870,427 (BRAZIL).
- **Its curve table** (`curveTable`) is one interval a curve record, of its value and its own length, to the next curve
  record, as a curve holds until the next comes (S 0x2714 to 0x2746), read from the line: the lap's last curve, in
  which the line lies, cut there, its rest the first interval and its start the last. 18 (FRANCE) to 39 (MONACO)
  intervals, values from −200 to +233, a positive value bending the road right (MAME's description of the road chip's
  word 2 with M 0x4E48; not seen on a picture of the original).
- **Its clock.** The speedometer shows the frame's step itself as km/h (M 0x37F0, the sub program setting it to the
  speed word over 32 as it advances the road by it, S 0x670C to 0x6716), its tasks running once a frame (S 0x73E,
  0x538; that none overruns a frame is assumed): a position is 4.6253 mm (`POSITION_METRES`), a lap 4,979 to 8,651 m,
  0.81 to 2.16 times the circuit's length its names list (M 0x46DA); a lap on its model takes its own.

## Its road across

Its road A as the TC0150ROD draws it at its own car's line (`continental-circus-road-picture`), CHASE H.Q.'s road chip
([Its road across](chase-hq-road-data.md#its-road-across)):

- **Its line.** The main program gives each line of the road its distance and its half width in pixels, the half width
  also its road ROM tile (the tables at M 0x53A6 and M 0xD1F0, read at M 0x4E06 to 0x4E96), their product 0x40000
  lateral units: at its own car's line, 0x42B positions ahead of the picture's pinhole (S 0x2C08), line 95, the half
  width is 245 pixels.
- **Its scale across** is its own car's (K, 2026-11-05): drawn there at zoom 0x7F, the road's own scale at that line (the
  things' zoom by S 0x7316), the car seen from behind at the start is 94 colored columns wide (the sub program's race
  record for a car not turning, S 0x4A78, sprite 0x2E; research), as wide as a Formula One car could be in 1987, 2.15 m
  (`CAR_WIDTH`, `CAR_COLUMNS`): a pixel there is 22.9 mm, the road 11.21 m between its edges (the measurement taken
  where the line crosses the car's rear wheels' axle; not confirmed against the original's screen).
- **Its picture.** Tile 245's body line holds two lines of its pen 3, 0.18 m wide about ±1.90 m, three painted lanes;
  each edge's line holds bands of pens 3, 2 and 1 outward from the half width, 0.09, 0.11 and 0.62 m, 0.82 m in all,
  the ground beyond. Its three painted lanes are two lanes, each half the road, 5.60 m, its lines Strips (K,
  2026-11-05).

## Its skies

CONTINENTAL CIRCUS's sky is three bands on its two tile layers ([research notes](research/continental-circus.md#the-sky)),
each course its own, set once at the race's start and not changed along it (`continental-circus-backgrounds`):

- **The bands.** Each band is a picture of 32 columns of tiles, 256 pixels, its tile codes row by row, a code with bit
  15 set repeated (M 0x3E7C), drawn twice across its tilemap so that it repeats every 256 pixels; a course's three
  pictures from its 16 bytes at M 0xDE92 (M 0x7590 to 0x77D0). BG1's upper picture, the clouds, is 12 rows in palette
  line 0; BG1's lower picture, the landscape, 10 rows below it in line 1; BG0's band, towns and trees, 5 rows in line 2,
  over the lower picture's rows 8 to 47. A picture's run may pass its row's end: its copy at column 0 shows its codes in
  turn, row by row, as read here, and its copy at column 32 shows up to 19 tiles of the row below at its start, which
  are not drawn (default; K confirms at the stage's end).
- **Their turns.** The original keeps no heading: a band turns its rate × the curve × the distance over 16,384 pixels
  (S 0x280E to 0x2916). The upper picture's rows turn faster the higher they lie, 1/64 of the rate a row from its bottom
  row up, in strips whose bounds a course's table gives (S 0x2652): one row each in SPAIN, else 3 to 6 strips, from 1
  to 2.5 times the bottom strip's turn. The lower picture turns 1.375 times as fast as the clouds' bottom strip and BG0's
  band 1.625 times. Each strip is a layer; the clouds' bottom strip, the farthest, faces the sky, a turn its picture's
  256 pixels, each other layer a turn of 256 over its rate (default; K confirms: no turn the program holds, its laps
  turning the sky 262 to 543 pixels).
- **Their rows.** On level road the road's first line lies at BG1's row 142 and BG0's row 140 (M 0x52E6, 0x5316, the
  road from the TC0150ROD's line 116, which is not confirmed): the clouds' bottom row 47 rows above it, the lower
  picture reaching 33 rows below it and BG0's band 3. Where no band lies, the cleared tile's color in line 0.
- **Their colors.** A course's three lines from its 16 bytes at M 0xC5A0 (M 0x6E4A to 0x6ED6), its dry colors; the
  rain's and the lightning's, which the original fades in at random times, are not drawn (default; K confirms).
