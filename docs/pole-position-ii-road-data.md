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
- **The player at GO.** The second program's 0x0656 places the player 0x12 of the road position's high word's units
  (256 an interval) behind its place, a share of the interval before the line as laid.

## POLE POSITION II's road across

The road across is its road palettes' colors, one a lateral step (`pole-position-ii-cross-section`): steps 1 to 4 and
59 to 62 the kerbs, red and white by turns along the road, 5 and 6 and 57 and 58 the shoulders, 7 and 56 the edge lines,
8 to 55 the road, its centre between steps 31 and 32, and step 32 the centre line where a palette dashes it. A step is
5.5 / 24 m (the lane, below): the road between its edge lines is 11.46 m, its picture's edges 7.10 m either side of its
centre, which are its limits. From the shoulders' outer edges in the road is `ASPHALT`, beyond `GRASS`. Two lanes, a and
b, lie either side of the centre. Beyond the road picture the ground is its edge's color, step 0's in the course's first
palette, the sky's below the horizon.

A band is the steps in turn of one material and the same colors in each of the course's eight palettes. By [Places and
patterns](original-road-data.md#places-and-patterns), an interval of its stripes is the lap's mean interval, laid from
the start line: a band's base color, the one most of its palettes give (of as many the earliest), with its material
over each Section; then each other color its palettes give, a stripe of an eighth of the interval repeated at the
band's own cycle, the fewest palettes that repeat (`stripeParts`), colour alone. The start line's checker is the
start line's four rows, each a band of one color of its palette, over the stripes.

## POLE POSITION II's courses

`pole-position-ii-course` raises its four courses, by the programs' course numbers: FUJI, TEST, SUZUKA and SEASIDE
(`pole-position-ii-fuji` to `pole-position-ii-seaside`). Each is level and runs four laps; each is cut at its line, at
the middle of its longest straight the line does not lie on, and again where its road comes near itself ([Sections'
cuts](original-road-data.md#sections-cuts)). Its start gate stands in the Section returning to its line by [the
grid](original-road-data.md#the-grid), the player's slot in lane b, where its own car stands (its x, 0x2600, half the
off-road bound 0x4C00). Its sky is [its background](#pole-position-iis-sky). Its boards are [its objects](#pole-position-iis-objects).

TEST's plan is its curve table's by the [plan from a curve table](original-road-data.md#plan-from-a-curve-table): an
oval of four left corners. Its two long straights, 62 and 70 intervals, are made 66 each (K, 2026-11-04), the intervals
taken from or added at their beginnings, so that the line stays 17 intervals before T1; its turn scale closes it in one
round. It is 3,003.7 m round, of 73 pieces, its tightest arc 104.6 m, in 2 Sections.

FUJI, SUZUKA and SEASIDE are each [a lap on its model](original-road-data.md#a-lap-on-its-model), its road width two
lanes, 11 m, and its lanes' least radius 9.51 m. POLE POSITION II never says its SUZUKA is the Suzuka Circuit: it may
differ from the circuit and from FINAL LAP 2's JAPAN (K, 2026-11-04). The laps as solved (`model-laps.json`), the turn
scale 1 being where the table's turns' magnitudes sum to its model's:

| Course  | Turn scale (a value's curvature at 1) | Start    | Means (distance; change) | From its model, same point; nearest (mean, most) | Crossings; least apart  | Corners' lengths (median, least to most) | Straights' lengths (median, least to most) | Tightest arc | Pieces; Sections | Solved in |
| ------- | ------------------------------------- | -------- | ------------------------ | ------------------------------------------------ | ----------------------- | ---------------------------------------- | ------------------------------------------ | ------------ | ---------------- | --------- |
| FUJI    | 0.814 (0.0002324 rad/m)               | +8.6 m   | 27.364; 3.881            | 39.4 m, 191.1 m; 31.1 m, 182.9 m                 | 0; 92.0 m               | +3.8 % (−94.6 % to +34.9 %)              | −5.6 % (−83.3 % to +639.1 %)               | 66.1 m       | 93; 2            | 36 s      |
| SUZUKA  | 1.106 (0.0003757 rad/m)               | +206.2 m | 2.078; 0.530             | 11.5 m, 52.7 m; 9.5 m, 51.7 m                    | 1 (its model's); 11.3 m | −8.5 % (−66.0 % to +95.3 %)              | −11.0 % (−30.0 % to +515.1 %)              | 21.5 m       | 145; 3           | 361 s     |
| SEASIDE | 1.218 (0.0005906 rad/m)               | −92.9 m  | 0.814; 0.925             | 6.8 m, 40.3 m; 4.7 m, 31.6 m                     | 0; 11.1 m               | −33.1 % (−69.6 % to +103.4 %)            | −6.7 % (−77.1 % to +896.6 %)               | 12.4 m       | 154; 3           | 146 s     |

Distances are of the lap's intervals' ends; a length's change is its run's against its table's at the mean interval.
The procedure's answer is the least sum of the two means its grid and its stages reach, not the least of all laps.
SUZUKA crosses itself at one height where its model does (at 2,375 m and 4,868 m, about 65° apart): the passage
crossed is not drawn from the other, the route drawing its own Sections in turn, and vehicles on the two passages do
not touch, for vehicles meet by their stations along the route ([Body
contact](content-and-gameplay.md#body-contact)).

### Its models

Each model is K's drawing of the circuit as it was in 1983 at real size (K's course data v2.1.1), its geometry alone in
the repository ([A lap on its model](original-road-data.md#a-lap-on-its-model)):

- **FUJI**, `fuji_1983`: Fuji Speedway, drawn by K from MLIT, National Land Image Information (colour aerial
  photographs), CCB-83-1 C1 9 (1983), and scaled to 4,359 m. 出典：国土交通省「国土画像情報（カラー空中写真）」.
- **SUZUKA**, `suzuka_1983`: Suzuka, the coordinates K drew from the same series, CCB-87-4 C12A 13 (1987), with turns 1
  and 2, Degner, and 200R to the old Spoon replaced by K's candidates for the 1983 line; 6,005.95 m.
- **SEASIDE**, `long_beach_1982`: the 1982 United States Grand Prix West at Long Beach, K's drawing after Guido de
  Carli's map, scaled to 3,428 m. A course's inexact geometry carries no copyright (K, 2026-11-04).

## POLE POSITION II's objects

Each course has 24 boards beside its road (`pole-position-ii-scenery`, `pole-position-ii-boards`):

- **Places.** The second program's 0x0854 reads course c's from 0x5A7E + 0x30c downwards, a word each: its high byte
  the interval, the whole word the road position's high word (256 an interval), its bits 2 and 3 its side, its low four
  bits its kind. A board stands at its curve table position on the lap as laid ([Places and
  patterns](original-road-data.md#places-and-patterns)): its interval's start and the word's share of it.
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
  6.23 m.

How near each course's boards come to each other, their bases' least distance: FUJI 2.8 m (two boards in the run its lap
shrinks most), TEST 70.3 m, SUZUKA 49.2 m and SEASIDE 30.9 m.

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

| Constant                | Value          | Why                                                                                                                          |
| ----------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `LANE`                  | 5.5 m          | K's lane (2026-11-04): its own car, 2.15 m wide at its depth, makes it 5.46 m; K rounded it                                  |
| `LANE_STEPS`            | 24             | the road ROM's lateral steps a lane between the edge lines                                                                   |
| `CENTRE_STEP`           | 32             | the road's centre, between steps 31 and 32                                                                                   |
| `SPEED_ENTRY`           | 0              | the factory settings' shown speed (Average, km/h), 0x1F38's first factor                                                     |
| `LAPS`                  | 4              | the factory settings' Goal (MAME's default): a race of four laps                                                             |
| `TEST`, `TEST_STRAIGHT` | 1, 66          | TEST's two long straights made 66 intervals each so that it closes (K, 2026-11-04)                                           |
| `MODELS`                | 0, 2, 3        | FUJI's, SUZUKA's and SEASIDE's models (K, 2026-11-04)                                                                        |
| `ROAD_WIDTH`            | 11 m           | the road width a lap on its model keeps off itself by: its two lanes                                                         |
| `ROAD_STEP_PIXELS`      | 332 / 107 / 48 | the road ROM's steps 8 to 55 span 74 pixels at road line 20 and 406 at 127: a step's pixels a line                           |
| `BACKGROUND_BOTTOM`     | 3              | the background's last row, the screen's 127, three rows below the first below the horizon (the road vanishing at row 124.15) |

How its own car makes the lane is in its [research notes](research/pole-position-ii.md#scale-across).

## POLE POSITION II's dump

`pole-position-ii-read` writes the names, curve tables, road palettes and the lap's factor and interval to
`reference-media/pole-position-ii/rom-data/pole-position-ii.json`, with the ROMs read.

## POLE POSITION II's conversion

The conversion's version is 5 (`POLE_POSITION_II_CONVERSION_VERSION`).
