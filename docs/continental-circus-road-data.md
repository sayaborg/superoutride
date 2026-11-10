# CONTINENTAL CIRCUS road data

How CONTINENTAL CIRCUS's ROMs are read (its ROM set, hardware, tables and conversion). The rules every original is
raised by and the parts the originals share are [Original road data](original-road-data.md)'s; the programs' map and
what is open are its [research notes](research/continental-circus.md)'s.

CONTINENTAL CIRCUS's courses are raised from MAME's `contcirc` (Continental Circus (World), Taito, 1987), its parent
set, whose programs are not encrypted. Its hardware and ROM list are MAME's description of the Taito Z system's
`contcirc`.

## CONTINENTAL CIRCUS's ROM set

K's `contcirc.zip` matches MAME's `contcirc` by CRC-32. The conversion reads the main 68000's program pair (its even and
odd bytes from 0), the sub 68000's pair, and the TC0100SCN's tile ROM (`continental-circus-rom`); its things' pictures
the four OBJ ROMs and the spritemap ROM (`continental-circus-sprites`).

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
line: 3,291.1 m (MEXICO) to 6,789.1 m (GERMANY), 18 to 39 pieces, cut at its checkpoints, 2 Sections (3 in BRAZIL,
AMERICA and JAPAN). A lap's position lies at its record's interval's place on the lap as laid ([Places and
patterns](original-road-data.md#places-and-patterns)). Its things stand there ([Its things placed](#its-things-placed)).

- **Its race.** One lap (`LAPS`): the lap's one thing of type 3 sets the goal flag (S 0x2B8A to 0x2BF8), on which the
  main program stops the time (M 0x1E7E). That thing stands where the car starts, 800 positions before the line; the
  course's finish is its line, as every circuit's is. Its checkpoints are its things of type 2 ([Its things
  placed](#its-things-placed)).
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
  the lap less its mean grade, so that it closes in height. One step is replaced (K, 2026-11-10): in the shapes of 512,
  896 and 1,792 samples that hold it (shapes 11 to 20), the step from sample 384, 704 or 1,408 to the next is twice its
  neighbours' in the ROM, 81.8 units a position (61.4 in the shapes of 512 samples, 40.9 in the lower two of each
  other length), and is laid as the mean of its two neighbours' steps, 40.9 (30.7, 20.5): one sample, 0.148 m long,
  halved all eight courses' heights by the grades' rule. A unit up is 15/14 of a lateral unit (`UP`), the road's half
  width over 0x40000: 22.90 µm. Then all eight times one factor, f = min(the lens ratio, 0.25 ÷ the steepest grade)
  ([Profile from the original's screen](original-road-data.md#profile-from-the-originals-screen)): its eye's focal
  length a position over a unit up, 202.0 rows, over its screen's 224 (`SCREEN_ROWS`, its 320 columns at 4:3), 0.902;
  SPAIN's grade at f = 1, 0.438, the steepest, a step of 40.9 units a position, so f = 0.570. Then each within its
  model's elevation ([A course's model](original-road-data.md#rules-of-the-originals)). Each departs from its tables by
  at most 0.002 in grade and 0.02 m in height.

| Course  | Runs | Its model's factor | Steepest | Highest; lowest |
| ------- | ---- | ------------------ | -------- | --------------- |
| BRAZIL  | 690  | 0.113              | 2.3 %    | +2.6; −0.4 m    |
| AMERICA | 401  | 1                  | 13.4 %   | +15.2; −0.2 m   |
| FRANCE  | 351  | 1                  | 15.7 %   | +15.6; 0 m      |
| MONACO  | 142  | 1                  | 21.4 %   | +18.5; −0.1 m   |
| GERMANY | 186  | 0.299              | 2.8 %    | +3.8; −0.2 m    |
| SPAIN   | 361  | 0.820              | 20.5 %   | +25.3; −0.7 m   |
| MEXICO  | 425  | 0.389              | 7.2 %    | +6.4; −3.6 m    |
| JAPAN   | 168  | 1                  | 6.0 %    | +27.1; −0.3 m   |

JAPAN's two passages where it crosses itself (2,466.1 m and 4,962.4 m) lie at 11.6 m and 12.6 m.

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
- **Its zones.** Each a place's colors over its stretch ([Its zones](#its-zones)).
- **Its pit lanes.** Each road B beside road A as two roads, not driven ([Its pit lanes](#its-pit-lanes)).
- **Its limits.** Its program's ([The ground beside the road](original-road-data.md#the-ground-beside-the-road)): the
  road task holds the car's x within ±0x3C000 (S 0x2856 to 0x287A, the bound on its pit lanes' side widened by the
  pit lane's word, 0 on open road, which is not laid, as a pit lane is not driven), x moving the road's k-th line from the screen's bottom by (0x86 − k) × x / 0x10000 pixels (S 0x26A8
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
  body in B 1 (S 0x26EE to 0x26FA); a zone moves a part to B 2 or B 3 ([Its zones](#its-zones)). The colors are set once at a race's start; the
  rain's darker ones are not drawn (default; K confirms at the stage's end), as its skies' are not.
- **The banks along the road.** A line's bank is the table of 512 words at M 0x4EC4 by its place over 4 (M 0x4E68 to
  0x4E74), fixed to the road, a period of 2048 positions (9.47 m): in each quarter 24 positions of a bank, 24 of the
  next and 464 of the third. So the kerb's three bands change color every 512 positions (2.37 m), each 24 positions
  (0.11 m) after the band inside it; the ground changes shade every 1024 (4.74 m); and the body's lines are dashes of
  1024 positions with gaps of 1024, the asphalt a shade lighter under the dashes.

### Its zones

A zone (command 5, S 0xC28A) gives a line's parts other words over its stretch (`continental-circus-zones`):

- **Its stretch.** Its argument's high word is its kind and its low word its length; it lies from its record's place, its
  running position + 0x7FFF as a thing's, its length on (S 0xC28E to 0xC2C4). One that starts within the last one, by
  its end, extends that one to its own end, its kind kept (S 0xC29E to 0xC2A8): MONACO's five zones of its tunnel are
  one, 0x8003's.
- **Its words.** The sub's task S 0x2E3C gives each line within a zone's stretch (from its end's line to its start's by
  the distance table at S 0x20000) the words its kind's handler sets: the handler is the word at S 0x3092 + twice the
  kind, from S 0x3092, the kind doubled as a word, so that its bit 15 drops (S 0x3088 to 0x308E; 0x8003 acts as 3 and
  0x8007 as 7, their side pieces [its bands](#its-bands)). Each handler, up to S 0x30EE, is `move.w` or `clr.w` of the line
  buffer's 0x1800, the left edge's word, 0x1802, the body's, or 0x1804, the right edge's (road A's words 0, 2 and 1, M
  0x4E5C, 0x4E80, 0x4E84); a part it does not set keeps open road's, 0x8000 at either edge and 0xA800 the body (S
  0x26EE to 0x26FA). A word's group is its bits 11 and 12, and an edge draws the ground beyond it only where its bit 15
  is set (MAME's description of the chip). So kind 0 changes nothing; 2 moves the body to B 3; 3 the body to B 3 and
  the right edge to B 2; 6 the body to B 3 and the left edge to B 2 (no course uses it); 7 the body to B 3 and both
  edges to B 2 (the left with its priority bit, not drawn here); and 1, 4 and 5 clear the right, the left and both
  edges' words, their kerbs in B 0 and no ground beyond them.
- **Its colors.** A place's colors ([Sky baking](original-road-data.md#sky-baking)), at once at its ends: from its
  start's station to its end's on the lap as laid ([Places and patterns](original-road-data.md#places-and-patterns)),
  each part whose word it changes in its word's group by its place, as open road's stripes are, the color most of its
  stretch takes over it and the rest over their parts: its bands, and beyond an edge the ground its pixel 0 gives
  (black in MONACO's and JAPAN's B 2). A part whose colors are open road's is not laid again. That kind 7's and
  0x8007's dark road is a shadow is not confirmed.
- **Where it draws no ground.** Beyond an edge whose word draws no ground (JAPAN's kind 5, both edges) lies BG0's
  fill's color, unstriped, as far as the course reaches (K, 2026-11-10). The road chip draws nothing there, so the tile
  layers behind it show (MAME's description of the board's order), and under its band BG0, drawn over BG1, is one tile
  of one pen: before BG0's band the sky's setup writes tile 0x257, all of its pen 1, in line 0xD1 over BG0's rows 13
  to 44 (M 0x76E4 to 0x770E; `continentalCircusFill`), so palette entry 0xD11, which the road's colors write: bank 4's
  B 1's first, that bank's asphalt, every course's, a grey of 18/31. On level road the fill lies from 4 rows below the
  road's first line to 219 below it, past the screen's last line, 105 below. Its material is the course's ground's:
  the zones' slots are read by the stream task's handler and the zone task alone (S 0xC28A, 0x2E3C, read statically),
  so the program treats its car there as on its open ground. BG0's band and BG1's pictures, which lie over a zone's
  far lines where a hill moves BG0's rows against the road's ([Its skies](#its-skies)), are not drawn there, nor the
  rain's darker grey. That the screen shows the fill there is read from the layers' order and rows; no picture of the
  original was compared (not confirmed).

| Course  | Its zones: kind, metres from the line (length)                         |
| ------- | ---------------------------------------------------------------------- |
| BRAZIL  | 7: 0 (0.18), 1,680.6 (0.21), 3,144.2 (0.24)                            |
| AMERICA | 7: 0 (0.37), 1,017.5 (0.40), 2,878.6 (0.36)                            |
| FRANCE  | 7: 0 (0.34), 1,436.9 (0.28)                                            |
| MONACO  | 2: 0 (0.23), 1,872.2 (0.22); 0x8003, its tunnel: 1,507.4 (335.4)       |
| GERMANY | 7: 0 (0.37), 2,792.1 (0.54)                                            |
| SPAIN   | 7: 0 (0.21), 1,978.5 (0.20)                                            |
| MEXICO  | 7: 0 (0.18), 1,449.9 (0.79)                                            |
| JAPAN   | 2: 0 (0.41), 2,066.0 (0.56); 0x8007: 2,443.6 (41.5); 5: 4,862.9 (67.9) |

Each lap's first, at 0, is its line; a line's 96 positions lie 0.18 to 0.79 m as laid, as its interval's place is laid.

### Its pit lanes

A pit lane (command 3, S 0xC25E) is road B, the TC0150ROD's second road, drawn beside road A as [two
roads](original-road-data.md#two-roads) where the original draws it and not driven, of no material, as this game has no
damage to mend there (K, 2026-11-06) (`continental-circus-pit-lanes`):

- **Its stretch.** Its record starts the task S 0x119CA, which starts its profile at the picture's pinhole + 0x7D02
  (S 0x119CE to 0x119D8), the pinhole at the record's running position, as in the limit of a slow car (default; K
  confirms at the stage's end: a faster car starts it up to its frame's step later), so at its record's place less
  0x2FD; it ends as the pinhole passes 0x14D03 past that (S 0x119E4), its nearest line (0x2FC, the distances at S
  0x3102) then at the profile's last position. So it lies over 0x15000 positions (86,016) from its start, from its
  start's station to its end's on the lap as laid. None crosses the line or holds a zone. Every line writes road B,
  which with no pit lane lies under road A's left half, its outer edge on road A's, and is not drawn.
- **Its place.** Each line's road B word (its line buffer's +4) is the long at S 0x11A98 by (the line's place − the
  start) over 32, of 2,688, over the line's distance, 0 outside them (S 0x119DC to 0x11A34): lateral units, 0 to
  550,000. The main program writes road B's word 2 as road A's with that word and w / 2 added and its half width w / 2,
  w road A's half width there (M 0x4E40 to 0x4E56, 0x4E9A to 0x4EA6): its centre lies its half width and its profile
  from road A's, under road A at its ends and 14.56 m from P at most, on the side whose word 2 is the greater, the left
  by MAME's description, as the curves' sign is, which the laps on their models bear out, and the side on which the
  road task widens its car's bound (S 0x285C; not seen on a picture of the original). Its centre is a Boundary through
  every fourth sample at its first position, read straight between as its heights are (`KNOT_SAMPLES`; default, K
  confirms at the stage's end: 673 knots, within the format's 1,024 a Boundary), departing from its samples read
  straight between by 0.8 mm at most; a lateral unit is the road's half width over 0x40000.
- **Its picture.** Its tile w + 0x200 (M 0x4EAA) at its own car's line, its pixels at its half width's share: its
  half width 2.80 m, its body pen 0 (a body draws its pen 0, MAME's description) with two lines of pen 2 from 0.648 to
  0.713 of its half width (1.81 to 2.00 m) either side of its centre; its edges' bands road A's, outward from its
  half width.
- **Its colors.** Its edges' words carry no attributes, B 0, and draw no ground beyond them; its body's 0x8800, B 1 (M
  0x4E60): each piece in its group's colors by its place as road A's, a place's colors over its stretch, at once at
  its ends, as [its zones](#its-zones) are.
- **Its order.** Road A's body word carries its priority bit (0xA800) and road B's words none, so that road A's body
  with its lines lies over road B, road B's edges over road A's edges, road A's at a tie (`tc0150rodLevels`, MAME's
  description; not seen on a picture of the original): each piece of road B's picture where it shows (`shownPieces`)
  is a Strip between its sides, on road A's edges or road B's Boundary, cut where the arrangement changes.

| Course  | Its pit lanes, metres from the line                    |
| ------- | ------------------------------------------------------ |
| BRAZIL  | 530.5 to 813.7, 1,950.0 to 2,161.5, 3,351.9 to 3,575.1 |
| AMERICA | 1,047.3 to 1,358.7, 3,773.0 to 4,104.2                 |
| FRANCE  | 576.5 to 917.8, 1,663.0 to 1,911.7                     |
| MONACO  | 1,908.2 to 2,100.0                                     |
| GERMANY | 2,044.1 to 2,524.5, 5,011.5 to 5,409.5                 |
| SPAIN   | 709.3 to 891.3, 2,508.6 to 2,699.0                     |
| MEXICO  | 1,210.8 to 1,319.9                                     |
| JAPAN   | 1,613.9 to 1,971.5                                     |

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

## Its things

A thing record (command 2, 4 or 7) names a description in the sub program. The stream task copies it into a slot of 32
bytes of the list at 0x82D6E, and its pieces into the sprite list from 0x822B8, 16 bytes a piece and 60 pieces at most
(S 0xC112 to 0xC19C); the slot task (S 0x2A1A) draws every slot each frame by its type and hits its own car as it
passes; S 0x2490 merges the lists into the sprites, nearest first ([research notes](research/continental-circus.md#things)).
Its pictures are read as follows (`continental-circus-sprites`, `continental-circus-things`, `continental-circus-boards`).

- **Its sprites.** The Z system's ([CHASE H.Q.'s hardware](chase-hq-road-data.md#chase-hqs-hardware)), on this board of
  chunks 16 × 8 pixels: a sprite is 8 × 16 chunks, 128 × 128 pixels at its full size, its chunks the 128 words of the
  spritemap ROM (b33-07.64) from 128 × its code, its tiles 64 bytes from the four OBJ ROMs, each a 16-bit word of every
  8 bytes, b33-06 the first (MAME's description). Its colors are the palette lines the main program loads at its start
  (entries 0 to 0xBFF from the table at M 0xAD70, M 0xEC8); the colors it writes after, its own car's wheels' among
  them (M 0x1052), are not taken, as colors that move are held at the start's.
- **A description** (S 0xC112 to 0xC184): a word, its type; four longs, its lateral and its height (lateral units, the
  road's half width 0x40000, up negative) and the upper and lower bounds of the car's x it hits; a word of flags, bit
  14 its sprites' flip across and, on a side face, bit 15 the road over it (S 0x6D6A); its columns and rows less one;
  its pieces' count, their product; and its pieces, two words each, its sprite (0 none, S 0x2508) and its palette line,
  the second word's high byte, row by row from its top left. A piece's pair goes to both of the sprite lists the frames
  alternate between (S 0xC174 to 0xC180); command 7's second pairs are not read in a race (S 0xC21A).
- **Its pieces at their full size.** A piece's zoom is its distance's line's (the bytes at S 0x20000, the words at S
  0x7316), 0x7F at its own car's line (`CAR_DISTANCE`) alone, where a lateral or a height over that distance is a
  pixel, 22.9 mm. A thing of type 1 or above is its grid scaled on both axes, its top left piece's middle at its
  lateral and height (half the zoom left and down, S 0x6C42 and 0x6B8C), its columns and rows the zoom and a pixel
  apart, a sprite's 128 pixels at its full size (S 0x6CBE, 0x6CCA); the half pixel by which the program's half of 0x7F
  falls short, and the chips' line offsets, are aside (not confirmed: MAME's offsets of 5 and −3 would draw each piece
  a row lower). A side face (type 0) is three columns 0x80 pixels apart on the screen whatever its distance, at their
  full width and their height scaled, from its lateral outward, on the left three columns less (S 0x6CE0 to 0x6DCC);
  a ceiling (type −1) is three columns so, at their full size on both axes, its top at its height (S 0x6DCE to
  0x6EAA). The sprite list's first entry is drawn over those after it, so a description's first piece over the rest
  and a station's first record's over those after it.
- **Its types.** Its hit is by the jump table at S 0x2B4A: 1 a thing; 2 a checkpoint, setting bit 0 of 0x84564, on
  which S 0x115C adds 0x12C to the word 0x8458A; 3 the goal ([Its race](#its-courses-laid)); 5 and 6 a tunnel's start
  and end, setting and clearing bit 3 of 0x845B0 with their sounds (S 0x2C1A, 0x2CB4); each of these then hit as 1; 0
  a side face, hit as 1; −1 a ceiling, not hit. No course places a type 4.
- **Its hit.** While a slot lies within 0x100 positions of the car (S 0x2B2A to 0x2B36), its own car hits it where its
  x lies above the lower bound and up to the upper (S 0x2D60 to 0x2D6A), once, both bounds then 0x1F4280 (S 0x2D84).
  The car's x moves the road right ([Its limits](#its-courses-laid)), so the car's lateral is its x's negative, 94
  pixels a 0x10000 at its line (`xPixels`): the range of the car's centre, as wide as the thing, not its car's width
  more (the goal's three barrels' 408 pixels, their cells' 384). A range wholly beyond the car's limits hits nothing.
- **Its pictures.** A description is one picture, its pieces drawn as one unit at one point, its base point its
  point. Of the descriptions a station puts out, the records of one running position read at once, a floating one
  and those it touches are one thing ([Things of several pieces](original-road-data.md#things-of-several-pieces);
  `stationThings`), its base point the middle of its outer edges; a side face and a ceiling are bands, not among them
  ([Its bands](#its-bands); `continentalCircusBoards`: `contcirc-<the description's address, five hex digits>`, and a joined thing
  `contcirc-joined-<the address of the description drawn first>`, `-2` and on from its second arrangement so named).

Its laps place 3,920 descriptions (3,853 of command 2, 59 of command 4 within the pit lanes and 8 of command 7) at
3,382 stations, 157 distinct: 142 of type 1, 7 side faces, 2 ceilings, 2 each of types 5 and 6 and one each of 2 and
3, of 6 pieces at most; 92 hit within the car's limits, 2,700 placements. The 31 ceilings' and 7 side faces'
placements are bands, and JAPAN's bridge's 4 descriptions with them ([Its bands](#its-bands)); one description (JAPAN's
tunnel's end, 0x312AA) draws nothing. 27 things join 70 placements, 19 of two descriptions and 8 of four, the start
gantry of 9 pieces the largest, each course's own banner over its line; so its laps draw 148 pictures, 130
descriptions alone and 18 joined, of 22 colors at
most, 7 of them past 15 (`joinedColors`). 72 of them lie 1 or 2 pixels (2 to 5 cm) clear of the ground, their sprites' lowest rows clear, and so
float by [the rule's](original-road-data.md#pictures-from-the-extract) pixel; 22 float higher.

### Its things placed

`continental-circus-course` places each lap's things but its bands, its side faces, ceilings and JAPAN's bridge, which
are [its bands](#its-bands), and the description that draws nothing (JAPAN's tunnel's end, 0x312AA):

- **Its place.** Each station's descriptions, the records of one running position (commands 2, 4 and 7), at its
  station on the lap as laid ([Places and patterns](original-road-data.md#places-and-patterns)), the station's
  things each one picture (`stationThings`, `continentalCircusBoards`): a description alone at its lateral and height,
  a joined thing at its first description's and the middle of its outer edges from that description's point as laid at
  its full size. A lateral unit is the road's half width over 0x40000, 22.90 µm, right positive, and a unit of height
  15/14 of it, up negative, as its heights' (`UP`); its picture stands on the ground where a piece reaches it, else
  floats at its lowest colored row's height.
- **Its pit lanes' things.** A record of command 4 lies within its lap's pit lanes ([Its pit lanes](#its-pit-lanes));
  the original puts its thing out only while the word 0x84590 is set (S 0xC27E), which the study reads as its car's
  damage (not confirmed). They are placed whatever that word (default; K confirms at the stage's end: this game has no
  damage, so the other reading places none). Each stands 19.6 m left of P, beyond the pit lane's edge, and hits nothing
  the car can reach, so it has no body.
- **Its bodies.** A thing whose description hits its own car has a body ([Chosen
  lines](original-road-data.md#chosen-lines)): of each such description a part, the range of the car's centre it hits
  ([Its hit](#its-things)), which does not hold the car's width, at most that description's picture's colored columns
  (K, 2026-11-06), its middle from the picture's point. Every type but a ceiling hits so: a thing (1), a checkpoint (2),
  the goal (3) and a tunnel's start and end (5, 6), each then as a thing. None lies across the road: the checkpoint's
  parts are its posts (4.47 to 6.24 m either side of P), the innermost of any, the goal's its three barrels on the right
  (from 7.12 m), MONACO's tunnel's ends their mouths' left sides (from 5.84 m). Joined things have two parts at most.
  A thing hit while its car's slow crash is under way (bit 2 of 0x83572) is drawn no more (S 0x2DA6 to 0x2DC2); every
  thing otherwise stands where it is hit, so each keeps its body as a fixed thing (default; K confirms at the stage's
  end).
- **Its checkpoints.** Each station holding a description of type 2 is a checkpoint gate at that station, its id the
  course's and `-CP1` and on in order, as [the rule](original-road-data.md#9-sections-gates-limits-of-admission) places an
  original's checkpoints (default; K confirms at the stage's end: the original sets its flag once the thing lies within
  0x100 positions, 1.2 m, of its car, S 0x2B2A to 0x2B36 and 0x2D54, at any lateral). Each stands on a zone's line across
  the road (7, or 2 in MONACO and JAPAN, [Its zones](#its-zones)) under its banner. Its time is the course's time
  budgets'; the 0x12C the program then adds to the word 0x8458A (S 0x11CC), which the study reads as 30.0 s in tenths,
  is not taken (not confirmed as time). The lap is cut at each ([A circuit laid
  out](original-road-data.md#a-circuit-laid-out)).

| Course  | Descriptions placed | Pictures placed (distinct) | With a body | Checkpoints, metres from the line |
| ------- | ------------------- | -------------------------- | ----------- | --------------------------------- |
| BRAZIL  | 520                 | 513 (40)                   | 373         | 1,680.6, 3,144.2                  |
| AMERICA | 528                 | 521 (41)                   | 379         | 1,017.5, 2,878.6                  |
| FRANCE  | 737                 | 733 (33)                   | 427         | 1,436.9                           |
| MONACO  | 415                 | 409 (48)                   | 387         | 1,872.2                           |
| GERMANY | 369                 | 365 (46)                   | 214         | 2,792.1                           |
| SPAIN   | 575                 | 569 (43)                   | 389         | 1,978.5                           |
| MEXICO  | 370                 | 365 (39)                   | 262         | 1,449.9                           |
| JAPAN   | 363                 | 359 (42)                   | 239         | 2,066.0                           |

So its laps place 3,877 descriptions, 59 of them its pit lanes', as 3,834 pictures, 70 descriptions joined into 27
things, of 148 pictures in all; 2,670 have a body, of 2,694 parts.

### Its bands

`continental-circus-course` lays the bands its original draws fixed on the screen as [the strips'
rule](original-road-data.md#strips) lays them (K, 2026-11-06), each its pieces drawn once at their full size as a
thing's are, its picture, and beyond its edges its band, the piece the original repeats, 128 pixels, a board extending
outward, all on one grid (`continentalCircusBands`, `bandBoards`), its base point and body a thing's ([Its
things](#its-things)), at its station on the lap as laid. A board stands where its lowest colored row meets the ground,
else lies at that row's height as the program holds it, below the ground where it reaches there, its part below standing
at its depth so that the nearer road hides it, as the original draws the road over a side face of flag bit 15 (S
0x6D6A). Its images are `contcirc-<address>`, `-band` and on both sides `-band-mirrored`.

- **Side faces** (type 0, S 0x6CE0: three columns 0x80 pixels apart on the screen, at their full width and their height
  scaled, from their lateral outward, on the left 0x180 further left) are looping strips as they are (K, 2026-11-06):
  its picture its three columns from its lateral outward, its band beyond its outer edge alone, its outer column
  unmirrored. A side face hits as a thing (S 0x2B4A), so its picture has its body, its hit within its colored columns
  ([Chosen lines](original-road-data.md#chosen-lines)), where its car can reach it (default; K confirms at the stage's
  end: the rule's bands have no body, and a board extending sideways may carry none).
- **A zone's side face.** For a zone of the kind its `cmpi.w` names, 0x8003 (S 0x2F28), the zone task (S 0x2E3C) draws
  a side face (S 0x6CE0) of its own sprite, palette line, lateral and height (S 0x2F3E to 0x2F78), with no flags and no
  hit, at the distance of its zone's end from the car, held at most a record's reach, and 0x3E8 positions nearer where
  that end lies within a nearer range (S 0x2EA2, 0x2EF6, 0x2F84 to 0x2F90). It is laid as a side face at its zone's end
  less 0x3E8 positions, where the original draws it over that nearer range (default; K confirms at the stage's end: the
  original draws it at its farthest ahead of the car while the end lies farther, which no board does),
  `contcirc-zone-8003`.
- **Ceilings** (type −1, S 0x6DCE: three columns 0x80 pixels apart on the screen at their full size on both axes, its
  top at its height, never hit) are bands across the road at the original's height (K, 2026-11-06): its picture its
  three columns from its lateral rightward, its bands both its outer column, the left one mirrored, with no body.
- **JAPAN's bridge** is no roof (K, 2026-11-06): the original draws its span, the zone 0x8007's side pieces (S 0x2FAA to
  0x307A), as the full screen's width of its sprite in two rows between the rows of its zone's ends, which is not
  laid. Its face, the descriptions of its tunnel's start's station (type 5) whose thing spans the road's centre, with
  that station's two side faces, is one band across the road (`contcirc-joined-31250`), its two edges and its span
  between them: its pieces drawn once, the side faces drawn over the face as the sprite list draws them, its bands the
  right side face's outer column and its mirror. It is a passage ([Things of several
  pieces](original-road-data.md#things-of-several-pieces)): laid again at equal steps from its station to its tunnel's
  end's (type 6), so fine that the eye at the player's height sees nothing through them (`passageSteps`), its opening the
  clear columns about its point on the ground (±5.86 m), the far edge the side faces the original draws there; its body
  on its first step alone, its side faces' hits (default; K confirms at the stage's end: the stretch its tunnel's start
  and end bound, where its dark road, the zone, lies 0x258 positions later). The things under it (0x3126E, 0x3128C,
  their lamps, 7.3 m either side of P) stand within its walls, beyond its opening, with their bodies.

| Course | Band                                      | Metres from the line |
| ------ | ----------------------------------------- | -------------------- |
| MONACO | ceiling 0x29C1E, its tunnel's mouth       | 1,507.0              |
| MONACO | side face 0x29C44, its tunnel's mouth     | 1,507.0              |
| MONACO | 30 ceilings 0x29C98, 11.2 m apart         | 1,518.6 to 1,842.9   |
| MONACO | zone 0x8003's side face                   | 1,840.6              |
| JAPAN  | its bridge, 12 steps 3.08 m apart         | 2,440.8 to 2,474.6   |
| JAPAN  | side faces 0x312C8, 0x312FA, its far edge | 2,477.7              |
| JAPAN  | side faces 0x3132C, 0x3135E               | 4,938.3              |

The ceilings float 4.68 m up, from 8.76 m left of P. The side faces stand 6.57 m from P, the bridge's far edge's a
pixel (0.04 m) lower, but JAPAN's on its crossing road (0x3132C, 0x3135E, flag bit 15), which reach from 0.2 m above the
road to 6.07 m below it and hit nothing its car can reach; the others hit from 6.57 m, within the car's limits (8.06 m). That the bands keep no width or period on the screen however
near, as the original's do, is the replacement [the rule](original-road-data.md#strips) names.

## Its conversion

`continental-circus-course` writes the eight courses to `content/originals/courses/` (`continental-circus-brazil` to
`continental-circus-japan`), their crest trials, and their skies (`continental-circus-<course>-sky`) to
`content/originals/images/`, with its things' pictures (`contcirc-<address>`, `contcirc-joined-<address>`) and its
bands' (`-band`, `-band-mirrored`, `contcirc-zone-8003`) (its conversion's version 7).
