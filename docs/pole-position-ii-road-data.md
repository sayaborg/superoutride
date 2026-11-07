# POLE POSITION II road data

How POLE POSITION II's ROMs are read (its ROM set, hardware, tables, dump and conversion). The rules every original is
raised by and the parts the originals share are [Original road data](original-road-data.md)'s.

POLE POSITION II's courses are raised from MAME's `polepos2` (Pole Position II (Japan), Namco, 1983), its parent set,
whose programs are not encrypted. Its hardware and ROM list were read from MAME's driver `src/mame/namco/polepos.cpp` and
the custom chips' devices (`namco51.cpp` to `namco54.cpp`) at MAME commit `df3bcbba30251a393d8bb33a356c6c2ee93c34e9`.

## POLE POSITION II's ROM set

K's `polepos2.zip` holds MAME's 44 ROMs of the set and the four custom chips' own ROMs (`51xx.bin` to `54xx.bin`,
MAME's devices' ROM lists), every one matching by name, size and CRC-32. Its clones are `polepos2a` (Atari), `polepos2b`
(a bootleg), and `polepos2bi`, `polepos2bs` and `grally` (bootlegs). The tool reads the two Z8002s' programs, six
color PROMs and the sprites' images (`pole-position-ii-rom`, which holds their names and CRC-32s):

| Program      | Addresses     | Even (high) bytes | Odd (low) bytes |
| ------------ | ------------- | ----------------- | --------------- |
| first Z8002  | 0x0000–0x3FFF | `pp4_2.8l`        | `pp4_1.8m`      |
| second Z8002 | 0x0000–0x3FFF | `pp4_6.4l`        | `pp4_5.4m`      |
| second Z8002 | 0x4000–0x5FFF | `pp4_8.3l`        | `pp4_7.3m`      |

The color PROMs are the palette's red, green and blue (`pp4-7.8l`, `pp4-8.9l`, `pp4-9.10l`), the background's colors
(`pp4-11.4d`), the road's palettes (`pp4-12.3c`) and the sprites' colors (`pp4-6.6m`). The sprites' images are the small
sprites' `pp4_25.1n` and `pp4_26.1m`, and the big sprites' `pp1_17.5n`, `pp1_19.4n`, `pp1_21.3n` and `pp4_23.2n` (each
image's planes 3 and 2) then `pp1_18.5m`, `pp1_20.4m`, `pp1_22.3m` and `pp4_24.2m` (its planes 1 and 0). The Z80's
program, the text's tiles, the road ROMs and the sound are not read by the conversion; the background's tiles are
`pp4_29.1e`.

## POLE POSITION II's hardware

A Z80 runs the inputs and the sound; two Z8002s share the work RAM (0x8000–0x8FFF), the road RAM (0x9000–0x97FF), the
text (0x9800) and the background (0xA000); neither program is encrypted. Their only guard is a multiplier the first
Z8002 reads at 0x4000–0x5FFF. The screen shows 256 × 224 of 384 × 264 at 6.144 MHz: 60.606 frames a second
(`FRAMES_A_SECOND`, `pole-position-hardware/display`), its pixels 7 wide to 6 tall (`PIXEL_ASPECT`).

The road layer draws the road surface a line at a time on the screen's lower 128 lines: each line's horizontal offset
from the road RAM (the first program's 0x017C writes them from 0x97E0 down, from its curve table), and its palette from
the road RAM at the line's vertical position. The road ROMs count a lateral step at each pixel, 64 steps across the road
picture, and the line's road palette colors each step (`roadPalette`, `pole-position-hardware/colors`): a palette PROM's
four bits weigh 0x0E, 0x1F, 0x43 and 0x8F in a channel's 8 bits, and a road step takes the palette's color 0x40 plus its
PROM entry.

Its sprites are 16 or 32 pixels square, 4 bits a pixel (`spritePixels`, `pole-position-hardware/sprites`): a row is a byte
to each four pixels, a pixel's plane 3 at its bit in the byte's high nibble and plane 2 in its low nibble, the first
pixel the most significant bit, in the images' first half, and planes 1 and 0 likewise in their second half. A sprite
color is 16 entries of the sprites' color PROM, one a pen; an entry 15 is transparent, any other the palette's color
0x10 plus it (`spritePens`). A sprite drawn `s` wide (its size register) spans s + 1 screen pixels for a big sprite's 32,
its rows likewise.

## POLE POSITION II's tables

Each table is found by the instructions that read it, checked word by word (`pole-position-ii-road`):

- **Names.** The course select writes course c's name from the second program's 0x456C + 10c (its 0x44C2): a bracketed
  name in the text's codes, letters from 0x0A. The courses are 0 FUJI, 1 TEST, 2 SUZUKA and 3 SEASIDE.
- **Curve tables.** The first program's 0x1CF6 reads course c's curve from 0x36E0 + 256c by the road position's high
  byte: 256 signed values, an interval each of the 32-bit road position's 2^24 units. The second program holds the
  same tables.
- **Road palettes.** The second program's 0x0398 colors the road RAM ahead from 0x5BE0 + 8c, eight palettes in turn an
  interval, a band each of the road position's high word's 32 units (256 an interval).
- **The start line.** Where the high word lies in 0x20 to 0x3F of an interval, just past the lap's wrap (the second
  program's 0x0382 and 0x0386), the road takes its palettes from 0x5C00 + 2c by turns, a row each 8 units (its 0x03A0
  and 0x03A6), in place of its palettes in turn: the start line's checker (`readStartLine`).
- **The lap's length.** The shown speed is the speed's long times a factor over 2^24 (the first program's 0x1F40 and
  0x1F62, the factors at 0x1F38: 320, 400, 200 and 250), and the road position gains the speed's long over 8 a frame
  (0x1CC0). The factory settings (MAME's defaults: the Speed setting Average, km/h) take the first, 320, so a speed shown
  as 1 km/h gains 2^21 / 320 positions a frame and an interval is 11.733 m (`intervalMetres`): a lap of 256 intervals is
  3,003.7 m.
- **The grid at GO.** The second program's 0x061C lays the rivals ahead of the player from the line (position 0) back
  in rows of two (its 0x0640), a row's first at lateral −0x300 (its 0x06AE) and its second at +0x240 (its 0x067C), each
  row 0x80 units, half an interval, behind the one before (its 0x0648); the player stands in the next place, its x
  0x2600 in a row's first (its 0x0650) and 0xE200 in its second (its 0x06B6), on the rivals' sides (`readGrid`). How
  many rivals stand ahead is its qualifying place ($81FA); the cars behind it are not on the road at the start. Its
  0x0656 places the player 0x12 of the road position's high word's units (256 an interval) behind its place, a share of
  the interval before the line as laid.

## POLE POSITION II's road across

The road across is its road palettes' colors, one a lateral step (`pole-position-ii-cross-section`): steps 1 to 4 and
59 to 62 the kerbs, red and white by turns along the road, 5 and 6 and 57 and 58 the shoulders, 7 and 56 the edge lines,
8 to 55 the road, its centre between steps 31 and 32, and step 32 the centre line where a palette dashes it. A step is
5.5 / 24 m (the lane, below): the road between its edge lines is 11.46 m, its picture's edges 7.10 m either side of its
centre, where its colors end. From the shoulders' outer edges in the road is `ASPHALT`, beyond `GRASS`. Two lanes, a and
b, lie either side of the centre.

Its limits are its program's (`readCarLimit`): the player's x ($8188, from P, positive right), as the first program's
0x2B52 and the second's 0x2B04 add its sideways movement to it (from its steering, the curve and its speed), is not
stored where the sum overflows and never otherwise held, so it stays within ±32,767, its word's ends (`CAR_X_END`); the
second's 0x1DCC makes it the objects' lateral as its 5/64 (its two shifts right, by 4 and by 2, added), so a unit of it
is 0.27 mm and the limits lie 8.86 m either side of P, 1.76 m beyond the picture's edges. Where an arc's inside is too
tight for them, the format clips them at the plan's clearance (SEASIDE's c5, 12.07 m, its right one to 8.06 m). The
ground (`GRASS`) reaches them: the kerbs, the outermost bands, keep their colors to the picture's edges, and `GRASS`
lies from their inner sides, 6.19 m from P, to the limits, beyond the picture material alone; there the ground is the
picture's edge's color, step 0's in the course's first palette, the sky's below the horizon. The first program slows
the car off the road (0x22EE, [its research notes](research/pole-position-ii.md#road-and-position)); here the grass's
material does.

A band is the steps in turn of one material and the same colors in each of the course's eight palettes. By [Places and
patterns](original-road-data.md#places-and-patterns), an interval of its stripes is the lap's mean interval, laid from
the start line: a band's base color, the one most of its palettes give (of as many the earliest), with its material
over each Section; then each other color its palettes give, a stripe of an eighth of the interval repeated at the
band's own cycle, the fewest palettes that repeat (`stripeParts`), colour alone. The start line's checker is the
start line's four rows, each a band of one color of its palette, over the stripes, each row at its curve table
position, as the ROMs place it (K, 2026-11-04).

## POLE POSITION II's courses

Its courses are laid by [a circuit laid out](original-road-data.md#a-circuit-laid-out), so it has no `-layout` module of its own.

`pole-position-ii-course` raises its four courses, by the programs' course numbers: FUJI, TEST, SUZUKA and SEASIDE
(`pole-position-ii-fuji` to `pole-position-ii-seaside`). Each is level and runs four laps; each is cut at its line, at
the middle of its longest straight the line does not lie on, and again where its road comes near itself ([Sections'
cuts](original-road-data.md#sections-cuts)). Its start gate stands in the Section returning to its line by [the
grid](original-road-data.md#the-grid): the car grid the rule of the grid at GO laid on to a run's competitors, eight
rows, each car at its place's curve table position and lateral as an object's, a row's first 2.66 m right of P and its
second 1.99 m left, the whole 2.498 m back from the line; SEASIDE's rows, 3.68 m apart, spread by 1.359 to a car's
length, so the sixteenth stands 67.1 m (FUJI), 43.6 m (TEST), 62.9 m (SUZUKA) and 37.5 m (SEASIDE) before the line;
the bike grid the general form from 1.19 m before it. Its sky is [its background](#pole-position-iis-sky). Its boards are [its objects](#pole-position-iis-objects).

TEST's plan is its curve table's by the [plan from a curve table](original-road-data.md#plan-from-a-curve-table): an
oval of four left corners. Its two long straights, 62 and 70 intervals, are made 66 each (K, 2026-11-04), the intervals
taken from or added at their beginnings, so that the line stays 17 intervals before T1; its turn scale closes it in one
round. It is 3,003.7 m round, of 73 pieces, its tightest arc 104.6 m, in 2 Sections. What its table places lies on the
lap as laid where its interval lies there: the table's intervals 79 to 202 four intervals on (the straight from 79
gaining four at its beginning), and those its straight from 203 lost (203 to 206) at that straight's start as laid.

FUJI, SUZUKA and SEASIDE are each [a lap on its model](original-road-data.md#a-lap-on-its-model), its road width two
lanes, 11 m, and its lanes' least radius 9.51 m. POLE POSITION II never says its SUZUKA is the Suzuka Circuit: it may
differ from the circuit and from FINAL LAP 2's JAPAN (K, 2026-11-04). The laps as solved (`model-laps.json`), the turn
scale 1 being where the table's turns' magnitudes sum to its model's:

| Course  | Turn scale (a value's curvature at 1) | Start   | Terms (distances' mean; changes' sum) | From its model, same point; nearest (mean, most) | Crossings; least apart  | Corners' lengths (median, least to most) | Straights' lengths (median, least to most) | Tightest arc | Pieces; Sections | Solved in |
| ------- | ------------------------------------- | ------- | ------------------------------------- | ------------------------------------------------ | ----------------------- | ---------------------------------------- | ------------------------------------------ | ------------ | ---------------- | --------- |
| FUJI    | 0.868 (0.0002182 rad/m)               | +3.6 m  | 33.582; 2.988                         | 45.9 m, 165.5 m; 35.2 m, 145.4 m                 | 0; 86.6 m               | +8.6 % (−27.0 % to +33.0 %)              | −19.6 % (−47.8 % to +116.5 %)              | 57.3 m       | 93; 2            | 20 s      |
| SUZUKA  | 0.816 (0.0003817 rad/m)               | +73.9 m | 3.099; 4.521                          | 14.5 m, 50.2 m; 11.9 m, 47.1 m                   | 1 (its model's); 11.1 m | +10.6 % (−42.5 % to +101.1 %)            | −2.0 % (−27.1 % to +63.1 %)                | 23.4 m       | 145; 3           | 132 s     |
| SEASIDE | 0.816 (0.0006138 rad/m)               | −57.4 m | 5.641; 3.269                          | 21.7 m, 81.4 m; 15.5 m, 65.0 m                   | 0; 11.1 m               | −10.9 % (−40.4 % to +75.1 %)             | −2.7 % (−32.2 % to +29.9 %)                | 14.5 m       | 154; 3           | 120 s     |

Distances are of the lap's intervals' ends; a length's change is its run's against its table's at the mean interval.
The procedure's answer is the least sum of the two terms its grid and its stages reach, not the least of all laps.
SUZUKA crosses itself at one height where its model does (at 2,324 m and 4,857 m from its line, about 69° apart): the
passage crossed is not drawn from the other, the route drawing its own Sections in turn, and vehicles on the two
passages do not touch, for vehicles meet by their stations along the route ([Body
contact](content-and-gameplay.md#body-contact)).

### Its models

Each model is a layout of K's course sources: the circuit over the years POLE POSITION II took it, at real size from
its start line (K's estimate), with its circuit's elevation, which POLE POSITION II, level, does not use ([A lap on its
model](original-road-data.md#a-lap-on-its-model)). Its file names every source; those copied or changed are:

- **FUJI**, `fuji_1975_1983`: Fuji Speedway from 1975 to 1983, before its permanent chicanes; 4,254.78 m. Its start
  line is K's earlier estimate on the home straight. Its centreline was read from the Geospatial Information Authority
  of Japan's 1983 aerial photograph. 出典：国土地理院ウェブサイト（https://maps.gsi.go.jp/development/ichiran.html）。地理院タイル（「1979年～1983年」、空中写真 CCB-83-1 C1 9）を加工して作成。
- **SUZUKA**, `suzuka_1983_1984`: Suzuka from the chicane of March 1983 to the Spoon's move of March 1984; 6,065.29 m.
  Its start line lies 380 m before turns 1 and 2, by later published distances from the grid to the first corner. Its
  centreline was read from the Geospatial Information Authority of Japan's tiles. 出典：国土地理院ウェブサイト（https://maps.gsi.go.jp/development/ichiran.html）。地理院タイルを加工して作成。 A photograph published by Car
  Watch (https://car.watch.impress.co.jp/img/car/docs/1254/928/html/072_o.jpg.html) was compared for the early chicane.
- **SEASIDE**, `long_beach_1982`: the 1982 United States Grand Prix West at Long Beach; 3,473.40 m. Its start line is on
  Shoreline Drive (from 1978), at the break nearest K's earlier estimate. Its centreline was measured on the University
  of California, Santa Barbara's aerial photographs: TG-7600 2-8 (1976-03-22); AMI-LA-81 10933; AMI-LA-82 11388.
  Courtesy of UCSB Library Geospatial Collection. And from Marcel Overdijk and F1DB contributors, circuit artwork by Jules Roy (https://github.com/f1db/f1db/tree/main/src/assets/circuits;
  CC BY 4.0, https://creativecommons.org/licenses/by/4.0/), sampled, scaled and approximated by K with tangent lines and
  circular arcs. Its other references: the USDA and USGS National
  Map's orthoimagery, the Grand Prix Association of Long Beach's media guide and Motor Sport's report (May 1982).

A course's inexact geometry carries no copyright (K, 2026-11-04).

## POLE POSITION II's objects

Each course has 24 boards beside its road (`pole-position-ii-scenery`, `pole-position-ii-boards`):

- **Places.** The second program's 0x0854 reads course c's from 0x5A7E + 0x30c downwards, a word each: its high byte
  the interval, the whole word the road position's high word (256 an interval), its bits 2 and 3 its side, its low four
  bits its kind. A board stands at its curve table position on the lap as laid ([Places and
  patterns](original-road-data.md#places-and-patterns)): its interval's start and the word's share of it, TEST's
  interval where [its lap](#pole-position-iis-courses) lays it.
- **Across.** Its side's lateral is a signed high byte of 0x088A's four (−11, −11, +11, +12), in the objects' lateral
  units, positive leftwards: the program draws a board's middle `lateral × (row + 4) / 1024` pixels from the road's at
  road line `row` (its 0x0AD4), and the road ROM grows `ROAD_STEP_PIXELS` a step a line from about line −4, so a unit is
  5.5 / 24 / (1024 × `ROAD_STEP_PIXELS`) m, 3.46 mm: the boards stand 9.75 m right, and 9.75 m and 10.64 m left, of the
  road's centre. The player's x, as the same units' 64/5 (0x1DCC), stands at 2.63 m for its 0x2600.
- **Pictures.** Its picture is its kind's (0x1282): below kind 0x0C, a board of three big sprites by two, the first
  0x5BC0's entry for its kind with its low bit cleared, + 1 (the big sprites'), the rest after it, on two small sprites'
  poles, 0x56 and 0x57, under its outer tiles a quarter of a tile in (kinds 8 to 0x0B's mirrored, 0xD7 and 0xD6); from
  0x0C, a board of four in a row on four mirrored poles; its color 0x5BD0's entry for its kind. A pole is drawn at the
  big sprites' scale. Its size is (row + 4) / 2 screen pixels a big sprite's 32 (0x0B72), so a source pixel is 5.5 / 24
  / (64 × `ROAD_STEP_PIXELS`) m, 5.54 cm, up `PIXEL_ASPECT` times that: a board of three is 5.33 m wide and 3.80 m high
  with its poles, of four 7.10 m and 2.28 m. The six boards are `polepos2-<their first tile's big sprite>` (34, 3a, 40,
  46, 4c and 78), each in the colors its kinds show it in, by [the sprites'
  rules](original-road-data.md#pictures-from-the-extract) with no shadow.
- **Bodies.** The car crashes into a board within 0x14 of the high word's units and 0x384 lateral units either way
  (0x239E), so a board's body is 6.23 m wide, at most its picture's colored columns: 5.26 m and, for the board of four,
  6.23 m. Its body's inner edge lies 7.12 m or 7.52 m from P, within the limits, and a car's body meets it there (the
  original's car's middle meets it 3.12 m from the board's middle, 6.63 m or 7.52 m from P).

How near each course's boards come to each other, their bases' least distance: FUJI 26.0 m, TEST 51.7 m, SUZUKA 57.2 m
and SEASIDE 38.7 m.

### Its other objects

Besides its boards, the race's start places the START gantry, three special objects and the flagman, which the second
program's 0x0A1E draws by kind (its table at 0x0A66) (`readObjects`; their sprites `pole-position-ii-sprites`):

- **The gantry**, kind 6. The race's start (0x07E2) sets $8BE0 to kind 6 at the high word 0x20, the start line's
  checker's start, lateral 0, its state 0. It stands unlit (K, 2026-11-05): its lamps all dark, its banner START, as in
  state 0; its countdown, GO, namco and GOAL (states 1 to 6, the first program's 0x1ADA to 0x1B2C and 0x1EEC) are not
  made.
- **The special objects.** 0x0800 to 0x0852 read three from 0x5C08 + 9c, three bytes each: its kind, its interval and its
  lateral's high byte (the lateral that byte's word over 16, 0x083C), into $8C00, $8C20 and $8C40. The arch, kind 12,
  is always placed (0x0822); a puddle, kind 7, at the race's start alone (r9 1, 0x07FC), not at the qualifying's
  (0x07C2). So the race has FUJI's puddles at intervals 0xE0 (lateral 0x320), 0xA5 (0) and 0x8D (0x320); TEST's puddle at
  0xE0 (0), arch at 0x78 (0) and puddle at 0x60 (0x320); SUZUKA's puddle at 0xE0 (0x320), arch at 0x50 (0) and puddle
  at 0x60 (0); SEASIDE's puddles at 0xE0 (0), 0xA0 (0x320) and 0x70 (0x320): lateral 0x320 is 2.77 m left. A puddle is
  drawn 0x64 units nearer than its place (0x0D34), so it lies at its place less 0x64 (interval i − 1 and 0x9C/256).
- **The flagman**, kind 10. Its command 26 (0x057A) sets $8C00, the first special's slot (every course's 0xE0 puddle's),
  to kind 10 at the high word 0x0C, lateral 0x5C0 (5.10 m left), its picture 0; the first program sends it as the last
  lap passes 0xC0 (0x1EEC). It stands still at its picture 0.
- **All stand.** Objects the original shows by turns in one slot, the gantry and the airship, the flagman and the 0xE0
  puddle, both stand here, every object still for the whole race (K, 2026-11-05).
- **Pictures.** Each is its routine's sprites, laid as a board's are: at the size where a big sprite is 1:1 (a small
  one half), each drawn over those before it in the routine's order as the sprite circuit draws them, a code's bit 7
  mirroring it, a sprite's top edge its place above the road line (its row 0x182 less the line, 0x117E). A pen whose
  color's PROM entry is 15 shows nothing in that color, for the boards too (pen 0 in every color); there is no shadow.
  The gantry's 22 sprites are 0x136E's places and 0x147A's codes from 0x14E4: big, its lamps 0x2E and 0x2F hanging
  below its banner, its truss 0x28, its checker 0x29, START 0x2A to 0x2D and their reflections 0xA9 and 0xA8; small, its
  legs' lattice 0x50 to 0x55 and 0xD0 to 0xD5. Its colors are 0x14FA's word for its state & 7 (0x14AC): its lamps the
  high byte, the rest the low, in state 0 0x13 and 0x10. The arch's 22 are 0x1A9E's places and 0x1BB4's codes from
  0x1C08 (big 0x70 to 0x77, 0xF1 and 0xF0; small 0x58 to 0x5F and 0xD8 to 0xDB), all in color 0x2A (0x1BE6). A puddle is
  four big sprites 0x30 to 0x33 in a row in color 0x27, its middle on its road line and its column (0x150A, 0x1582). The
  flagman is 0x18D4's picture 0 (a big sprite 0x50, small 0x71 and 0x72, its shift), and 0x70, in color 0x2C (0x180E,
  0x1888).
- **Scales.** Each kind's pixel is a board's by the slopes of their sizes at road line `row` (0x0AD4 jumping by
  0x0AFC's table on the kind): the gantry's is a board's (0x0B6C), 5.54 cm; the arch's (0x0C0C, (row + 4) × 9/16 − 1)
  9/8 of it, 6.23 cm; a puddle's (0x0B1C, a car's, (row + 6) × 3/8 − 1) 3/4, 4.15 cm; the flagman's (0x0BEE, 8 (row + 4)
  / 13) 16/13, 6.82 cm. A puddle's grows from line −6, not −4, and from line 0x70 by (row + 0x40) / 4 − 1, so it is drawn
  0.91 to 1.08 times this; the flagman's has no − 1 and stops growing at line 0x70, drawn 1.01 to 1.07 times it to line 0x6F, less beyond.
- **Parts and bodies.** The car crashes into the gantry and the arch within 0x14 of the high word's units along and
  0x600 lateral units or more from their middle (0x236C and 0x247A, as a board, 0x23C2): 5.32 m, 96 of the gantry's
  pixels and 85⅓ of the arch's. Each is one picture of its routine's sprites as they are composed ([Things of several
  pieces](original-road-data.md#things-of-several-pieces), K, 2026-11-06), baked whole as the original reuses none of
  its standing pieces: the gantry's left leg and its reflection, a piece of its own, stand in the gantry alone, as the
  arch's sides in the arch. Its colored columns and rows stand on the ground, its base point the middle of its outer
  edges; the gantry's lamps in their color and the rest in theirs, one palette of both. Its body is two parts, its
  sides, a side the pixels, the gantry's lamps aside, whose column's middle lies that far or farther from the middle:
  each as wide as its colored columns, at most its width on the grid as a picture of its own, its middle its colored
  columns' middle (±6.20 m on the gantry). The sides stay as they are drawn, not widened to the limits as the original's
  crash beyond 0x600 would have them, as a vehicle may pass outside them (K, 2026-11-08): their outer edges lie 7.09 m
  from P on the gantry and 7.97 m on the arch, so 1.77 m and 0.89 m of grass lie beyond them within the limits, and a
  vehicle narrower goes round them: beside the gantry every two-wheeler and the cars up to 1.69 m wide (911 TURBO's
  1.775 m is 3 mm too wide), beside the arch the two-wheelers alone, LOTUS 79 SPECIAL (2.15 m) beside neither. A puddle
  lies about its middle row at its column, with no body ([Lying boards](original-road-data.md#lying-boards)); the
  flagman stands at its column, 3 pixels left of its colored middle, with none, as nothing tests it.
- **Names.** `polepos2-136e` (in `p019+p016`: its unlit lamps' color 0x13, its frame's 0x10), `polepos2-1a9e`,
  `polepos2-150a` and `polepos2-180e`. The gantry draws 11 colors, the arch 3.
- **Not stood.** The title's objects: kind 8, the swinging POLE POSITION banner, and kind 13, the II emblem, which
  command 16 (0x088E, the first program's demo, 0x08DC) lowers from the sky once it has cleared the gantry and the
  special objects (0x094C to 0x0A1C); and kind 11, the title fixed on the screen, its colors turning (0x197C and 0x1A10,
  command 5, 0x0772). Nor what moves: the gantry's lamps and banner, the flagman's waving (commands 27 and 28, 0x090A),
  and a puddle's spray and slowing (0x23E8 adding to $81BC by the speed and setting $80EE's bit 2).

### Its craft

Before the race the airship or the plane flies its banner over the road (`readCraft`, `craftSprites`):

- **In the original.** Its commands 24 and 25 (0x0594 → 0x07A4, 0x05F0 → 0x0794) set $8BE0 to kind 9 at x 0x100, in
  state 0 before qualifying (the first program's 0x0BAC) and 1 before the race (0x0E2C, 0x0E5A); at the start the
  gantry takes the same slot, so the original never shows both (here both stand). Its 0x0932 moves it 2 pixels left a
  frame and keeps it 4 of the high word's units ahead of the car, fixed on the screen: it is not projected (0x0D84
  calls neither 0x0A86 nor 0x0AD4).
- **Picture.** 0x16FC's places and 0x176E's codes, 8 big sprites, in state 1: the craft at x, 0x60 (the namco airship)
  where the course number's bit 0 is 0 (FUJI, SUZUKA), else 0x61 (the plane), its color by x's bit 2 at the first x
  (0x100), the airship's 0x31 and the plane's 0x30; the banner, 0x62 to 0x65 at x + 0x20k (k 1 to 4) in color 0x25
  (the Grand Prix's); then 0x62 to 0x64 0x12 rows above, from x + 0x90 0x20 apart, in color 0x2D, whose other pens read
  "START". Each code word's high byte holds the sprite's size register, its low 6 bits, and a sprite drawn s tall
  spans s + 1 rows (the hardware above; `codeRows`): the craft's and the Grand Prix's 0xA0 33 rows, the three's 0xA2
  35, each sprite's 32 rows stretched to them from its top, row i drawn from its row ⌊i × 32 / rows⌋, as the
  hardware's stretch is not read. So START's white band, its sprites' rows 16 to 31, meets the Grand Prix's, their
  rows 0 to 15: both span rows 0 to 16 from the Grand Prix's top, as the original draws one straight banner. No other
  object's sprite carries its size in its code word. Sprites are composed as the other objects' are, each over those
  before, a pen its color's PROM makes transparent showing nothing (color 0x25 pens 10 to 12; 0x2D all but 10 to 12; 0x30 pens 2 and 3; 0x31 pen 10, besides
  pen 0; the three over the band of 0x65 cover 224 of its pixels). The 8 sprites are one picture ([Things of several
  pieces](original-road-data.md#things-of-several-pieces)), each in its own color, one palette of the three, its
  colored columns and rows, with no body: `polepos2-16fc-60` (the airship, `p049+p037+p045`, 8 colors, 2,368 × 231
  texels) and `polepos2-16fc-61` (the plane, 9 colors, 2,346 × 164), within `imageMasterTexels` (1,048,576).
- **The original's camera.** Its 0x0A86 puts what lies `d` of the high word's units ahead on road line 0x6F − 0x74 d /
  (d + 0x93): its camera is 0x93 (147) units behind the car's place, 6.74 m by the clock's interval, and its eye 13.26
  road steps above the road, 3.04 m (`ROAD_STEP_PIXELS` and `PIXEL_ASPECT`, [its research
  notes](research/pole-position-ii.md#camera-eye-height)). A board is drawn no farther than 0xF00 units (0x1D84); at
  0xF00 + 147 units from its camera, 182.7 m, the craft's screen size is what that camera sees: its 1:1 distance.
- **Scale and place** (K, 2026-11-05). About the original's camera, the craft keeps `CRAFT_SCALE`, a third, of its size,
  its distance and its height above the eye, so that from GO it looks as the original's screen shows it: a source pixel
  is a board's × (0xF00 + 147) × `CRAFT_SCALE` / (d₆₀ + 147), d₆₀ = 7497 / 65 the depth 0x0A86 puts on road line 60,
  where a board's big sprite is drawn 32 pixels: 0.281 m across, 11.22 texels, and `PIXEL_ASPECT` of it up; the craft
  is 9.0 m and its arrangement 67 m. Its picture stands at one station, the 1:1 distance × `CRAFT_SCALE` from the
  original's camera, 54.2 m along the road ahead of the car's place at GO, in metres and not at a curve table position,
  as the original keeps it fixed on its screen rather than on its road. Its colored middle lies over P and its lowest
  colored pixel the original's eye + (`CRAFT_HEIGHT` − the eye) × `CRAFT_SCALE` above the road, 12.0 m.

FUJI's and SUZUKA's airship and TEST's and SEASIDE's plane stand 52.8 m to 53.7 m into their laps, 55.3 m to 56.2 m
ahead of the grid's first slot, where a run alone starts: 61.4 m to 62.2 m from this game's camera behind it at GO,
10.0 m above it and 2.7 m left of its facing.

## POLE POSITION II's sky

Each course's sky is its background's panorama (`pole-position-ii-backgrounds`), laid by [Sky
baking](original-road-data.md#sky-baking) as its one layer:

- **Its panorama.** The background's tile map is 64 columns of 16 rows of 8-pixel tiles, scrolled by the high word
  of $8180 (written to 0xC000), which gains the curve times the speed each frame (the first program's 0x1CF6); the second
  program streams a course's 256 columns into it as it scrolls, so its panorama is 2048 pixels. Its 0x023A writes
  column k's run of tiles from the bottom up, their count and first from 0x5400 by course c's entry 0x5000 + 256c + k,
  the tiles from 0x5502, and the rest of the column from 0x587C; its 0x02EE lays 0x589C's shapes, the clouds, over them,
  each from a column's top, a tile word's high byte once, then a tile each byte with its bit 7 set, a byte without it
  moving on as many rows, on into the next column, 0 ending it (`readPanorama`).
- **Its pixels.** A tile word's tile is its low byte with its bit 14 the ninth bit, its color its bits 8 to 13; a tile is
  2 bits a pixel, a row two bytes (the left four pixels' and the right's), a pixel's high bit in a byte's high nibble and
  its low bit in the low; its four pens are the background PROM's four entries of its color, each the palette's color.
  The screen shows the map's rows 2 to 15, its last row `BACKGROUND_BOTTOM` rows below the horizon.
- **Laid.** Its panorama is the back layer, once a turn: the original scrolls about twice that a turn, its curves' sum
  twice over, but one picture turns by the camera's angle alone ([Rules of the
  originals](original-road-data.md#rules-of-the-originals), One hardware). Its ramp is its top row's one color (the sky
  tile's), and below the horizon the ground's, the road picture's edge. It faces as at GO, its scroll 0 (the second
  program's 0x05AE): the screen's middle column, 128, at this game's camera's centre.

## POLE POSITION II's constants

`pole-position-ii-constants` holds:

| Constant                | Value          | Why                                                                                                                                  |
| ----------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `LANE`                  | 5.5 m          | K's lane (2026-11-04): its own car, 2.15 m wide at its depth, makes it 5.46 m; K rounded it                                          |
| `LANE_STEPS`            | 24             | the road ROM's lateral steps a lane between the edge lines                                                                           |
| `CENTRE_STEP`           | 32             | the road's centre, between steps 31 and 32                                                                                           |
| `SPEED_ENTRY`           | 0              | the factory settings' shown speed (Average, km/h), 0x1F38's first factor                                                             |
| `LAPS`                  | 4              | the factory settings' Goal (MAME's default): a race of four laps                                                                     |
| `TEST`, `TEST_STRAIGHT` | 1, 66          | TEST's two long straights made 66 intervals each so that it closes (K, 2026-11-04)                                                   |
| `MODELS`                | 0, 2, 3        | FUJI's, SUZUKA's and SEASIDE's models (K, 2026-11-04)                                                                                |
| `ROAD_WIDTH`            | 11 m           | the road width a lap on its model keeps off itself by: its two lanes                                                                 |
| `ROAD_STEP_PIXELS`      | 332 / 107 / 48 | the road ROM's steps 8 to 55 span 74 pixels at road line 20 and 406 at 127: a step's pixels a line                                   |
| `BACKGROUND_BOTTOM`     | 3              | the background's last row, the screen's 127, three rows below the first below the horizon (the road vanishing at row 124.15)         |
| `CRAFT_HEIGHT`          | 30 m           | the airship's and plane's lowest pixel's height at their 1:1 distance (K, 2026-11-05, provisional; K decides it in DEV)              |
| `CRAFT_SCALE`           | 1/3            | the share of their size, distance and height above the original's eye they keep about its camera (K, 2026-11-05)                     |
| `CAR_X_END`             | 32,767         | the player's x's word's end, where it stops either side of P: no instruction holds it ([its limits](#pole-position-iis-road-across)) |

How its own car makes the lane is in its [research notes](research/pole-position-ii.md#scale-across).

## POLE POSITION II's dump

`pole-position-ii-read` writes the names, curve tables, road palettes and the lap's factor and interval to
`reference-media/pole-position-ii/rom-data/pole-position-ii.json`, with the ROMs read.

## POLE POSITION II's conversion

The conversion's version is `POLE_POSITION_II_CONVERSION_VERSION`'s.
