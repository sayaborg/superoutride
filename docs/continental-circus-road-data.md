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

### Its laps on their models

Each course is a lap on its model ([A lap on its model](original-road-data.md#a-lap-on-its-model)), K's course
sources' layout of the circuit the original drew (`MODELS`): BRAZIL Jacarepaguá as it was from 1978 to 1995, AMERICA
Watkins Glen from 1975 to 1985, FRANCE Dijon-Prenois's extended Grand Prix circuit, MONACO as it was from 1976 to 1985,
GERMANY Hockenheim from 1970 to 1981, SPAIN Jarama from 1967 to 1979, MEXICO Long Beach from 1976 to 1981 and JAPAN
Suzuka from 1962 to 1983. Its curve table is read from its line, each record an interval of its own length, its values
negated, as the original's positive value bends the road right where a plan's turns left; its road 11.21 m wide, its
lanes' least radius its two lanes'. The laps were solved by the procedure (`model-laps.json`,
`continentalCircusModelLaps`): turn scales 0.84 to 1.11, MEXICO's 0.44; their points 3.5 (SPAIN) to 15.4 m (GERMANY)
from their models' on average, 9.7 to 41.5 m at most, MEXICO's 34.4 m and 105.3 m, one of its corners 21.5 times its
table's length; none crossing itself but JAPAN, once, where its model does; their roads 28.0 m (MONACO) to 177.3 m
(FRANCE) apart at least.

### Its heights

Its heights are the main program's 3D road (`continental-circus-heights`), whole hills along a lap: a hill record's shape,
0 to 21, from the table of longs at M 0x784A, its length the long before it and its samples longs, one every 32 positions
(M 0x77E8 to 0x7848, 0x7910 to 0x7988). A hill starts 0x40B positions before its record's place or where the hill
before it ends, the later, so hills queue (1 of MONACO's 8 to 24 of BRAZIL's 42 held back, none of JAPAN's 10); within
it the height is its sample there over its base, the height reached less its first sample, and after it that base less
its first sample again, each shape running from a to −a (`lapHills`, `lapHeight`). Up is the height's negative (M 0x5BC4
to 0x5BE2), a unit of it as many rows at a distance as a lateral unit is columns. Every lap closes, its last hill ending
before its line: they reach 0.99 to 2.38 million units above the line, SPAIN 40,000 below it, the steepest step 81.8
units a position (40.9 in MONACO and JAPAN).

### Its courses laid

`continental-circus-course` raises the eight (`continental-circus-brazil` to `continental-circus-japan`), each named by
its course's name (BRAZIL to JAPAN; the course format admits 21 characters a name, so CONTINENTAL CIRCUS BRAZIL is the
course texts'), each its lap on its model laid by [a circuit laid out](original-road-data.md#a-circuit-laid-out) from its
line: 3,291.1 m (MEXICO) to 6,789.1 m (GERMANY), 18 to 39 pieces, 2 Sections (3 in MONACO and JAPAN). A lap's position
lies at its record's interval's place on the lap as laid ([Places and
patterns](original-road-data.md#places-and-patterns)). Its things (TA-16), its pit lanes (TA-15g) and its zones' lines
and dark road (TA-15h) are not laid yet.

- **Its race.** One lap (`LAPS`): the lap's one thing of type 3 sets the goal flag (S 0x2B8A to 0x2BF8), on which the
  main program stops the time (M 0x1E7E). That thing stands where the car starts, 800 positions before the line; the
  course's finish is its line, as every circuit's is.
- **Its start.** The race stands its own car at running position 0: the stream task sets the pinhole to 0x7BD4 (S
  0xC098), the car 0x42B ahead of it, and lays a record 0x7FFF past its running position (S 0xC0F0). The line's record
  lies at running position 800 in every course (`continentalCircusLap`'s start), so the car stands on its road's centre
  800 positions before the line on the lap as laid, 1.48 m (MEXICO) to 3.38 m (JAPAN), alone; by [the
  grid](original-road-data.md#the-grid) no nearer the line than 2.50 m (BRAZIL, MONACO, SPAIN and MEXICO moved back so),
  the general form behind it on lanes a and b, its bike grid the general form.
- **Its heights.** Each queue of hills one after another is a rise table ([Profile from a rise
  table](original-road-data.md#profile-from-a-rise-table)), the road level between queues (`lapRises`): the height read
  straight between its samples, a sample's at its first position, so that each sample's grade is its rise to the next
  over its 32 positions, at its middle, level at the queue's ends; each grade at its station on the lap as laid, over
  its positions at the lap's mean position (its length over its positions), so that its grades are the clock's times one
  factor a lap; its resolution 1.5 units over a sample (`RISE_RESOLUTION`), as SUPER HANG-ON's 3D road's is 1.5 of its
  vectors' 4096 (default; K confirms at the stage's end), each queue level again at its end by a change of grade there;
  the lap less its mean grade, so that it closes in height. A unit up is 15/14 of a lateral unit (`UP`), the road's half
  width over 0x40000: 22.90 µm. Then all eight times one factor, f = min(the lens ratio, 0.25 ÷ the steepest grade)
  ([Profile from the original's screen](original-road-data.md#profile-from-the-originals-screen)): its eye's focal
  length a position over a unit up, 202.0 rows, over its screen's 224 (`SCREEN_ROWS`, its 320 columns at 4:3), 0.902;
  SPAIN's grade at f = 1, 0.876, the steepest, so f = 0.285. The steepest is one sample's step, twice its neighbours',
  the 384th, 704th or 1,408th of the shapes of 512, 896 and 1,792 samples that hold it, every other step at most 40.9
  units a position (the ROM's, kept); without it f would be 0.57. Then each within its model's elevation ([A course's
  model](original-road-data.md#rules-of-the-originals)). Each departs from its tables by at most 0.001 in grade and
  0.01 m in height.

| Course  | Runs | Its model's factor | Steepest | Highest; lowest |
| ------- | ---- | ------------------ | -------- | --------------- |
| BRAZIL  | 704  | 0.226              | 4.7 %    | +2.6; −0.4 m    |
| AMERICA | 409  | 1                  | 13.4 %   | +7.6; −0.1 m    |
| FRANCE  | 357  | 1                  | 15.7 %   | +7.8; 0 m       |
| MONACO  | 146  | 1                  | 11.4 %   | +9.3; −0.1 m    |
| GERMANY | 188  | 0.597              | 5.6 %    | +3.8; −0.2 m    |
| SPAIN   | 367  | 1                  | 25.0 %   | +15.5; −0.4 m   |
| MEXICO  | 433  | 0.777              | 14.3 %   | +6.4; −3.6 m    |
| JAPAN   | 176  | 1                  | 6.0 %    | +13.6; −0.2 m   |

JAPAN's two passages where it crosses itself (2,466.1 m and 4,962.4 m) lie at 5.8 m and 6.3 m.

- **Its road across.** Its picture's at its own car's line ([Its road across](#its-road-across)): two lanes, a and b,
  each 5.604 m, either side of P, its road's centre; its body, its two lines and each edge's three bands, each a band
  of `ASPHALT` (K, 2026-11-09); beyond its edges' bands, 6.427 m from P, its ground, the color its edges' pixel 0 gives,
  as far as the course reaches, its material `groundMaterial`'s of that color to its limits: `GRASS` in BRAZIL, GERMANY
  and JAPAN, `SAND` in AMERICA, FRANCE, SPAIN and MEXICO, and in MONACO, whose bluish grey the rule makes `WATER`,
  `SAND`, no water lying beside its roads (default; K confirms at the stage's end). Its edges take group 0's colors,
  its body and lines group 1's.
- **Its stripes.** Each band and the ground take their bank's color by their place ([Its road's
  colors](#its-roads-colors)): the color most of the banks' period, 2048 positions, takes is the band's, the rest the
  road's surface's Strips, a period's parts repeated over the lap at the lap's mean position (4.38 m in SPAIN to 11.69 m
  in GERMANY a period). A place's bank is that of its running position 0x7FFF on, the line's 0x831F, the race's first
  lap's (default; K confirms at the stage's end: the original's lap is no whole number of periods, so each later lap
  shifts its stripes).
- **Its limits.** Its program's ([The ground beside the road](original-road-data.md#the-ground-beside-the-road)): the
  road task holds the car's x within ±0x3C000 (S 0x2856 to 0x287A, the right bound widened by the pit lane's word, 0
  on open road), x moving the road's k-th line from the screen's bottom by (0x86 − k) × x / 0x10000 pixels (S 0x26A8
  to 0x26EC, 0x2770 to 0x279C), its own car's line the first past the 40 near lines (`carLimit`): 0x10000 of x is 94
  pixels there, its own car's width, and its limits lie 352.5 pixels, 8.06 m, either side of P (that its car's line is
  the first far line is read from the lines' counts, not confirmed).
- **Its sky.** Its own ([Its skies](#its-skies)), at its pixels' aspect, 15/14.

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

### Its road's colors

Its road's colors are the TC0150ROD's palette entries from 0xC00 (`continental-circus-road-colors`; MAME's description of
the chip for this board's road, its palette bank 3 by the byte the main program writes at 0x90001): a road pixel p of a
line's bank and a part's group B is entry 0xC00 + 0x40 × bank + 0x10 × B + 1 + ((p − 1) & 3), pixel 0 its fourth, the
ground beside an edge.

- **The banks' colors.** The palette task (M 0x6E4A) writes 12 banks, from 0xC01 by 0x40 (M 0x6EE8 to 0x6F46, its runs
  0x10 entries apart, M 0x74F6 to 0x7528): B 0, the edges and the ground, the course's own words (its 16 at M 0xC5A0 +
  16 × the course + 12) by the bank's offsets at M 0xD090; B 1, the body, and B 3 fixed words at M 0xD0F0, every
  course's; B 2 the course's words 0x10 bytes past B 0's, its dimmer kerbs. Open road draws its edges in B 0 and its
  body in B 1 (S 0x26EE to 0x26FA); a zone moves a part to B 2 or B 3. The colors are set once at a race's start; the
  rain's darker ones are not drawn (default; K confirms at the stage's end), as its skies' are not.
- **The banks along the road.** A line's bank is the table of 512 words at M 0x4EC4 by its place over 4 (M 0x4E68 to
  0x4E74), fixed to the road, a period of 2048 positions (9.47 m): in each quarter 24 positions of a bank, 24 of the
  next and 464 of the third. So the kerb's three bands change color every 512 positions (2.37 m), each 24 positions
  (0.11 m) after the band inside it; the ground changes shade every 1024 (4.74 m); and the body's lines are dashes of
  1024 positions with gaps of 1024, the asphalt a shade lighter under the dashes.

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
- **Their facing.** The clouds' bottom strip's column 0 lies at the camera's centre at the start's heading, the line's
  (`SKY_MIDDLE`; default, K confirms at the stage's end: where the road vanishes on the original's screen at the start
  is not read, nor BG0's scroll at a race's start), and each other layer's seam behind it, at the facing
  layer's pixel 128 (`SKY_SEAM`).

## Its conversion

`continental-circus-course` writes the eight courses to `content/originals/courses/` (`continental-circus-brazil` to
`continental-circus-japan`), their crest trials, and their skies (`continental-circus-<course>-sky`) to
`content/originals/images/` (its conversion's version 1).
