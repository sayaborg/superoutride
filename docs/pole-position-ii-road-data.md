# POLE POSITION II road data

How POLE POSITION II's ROMs are read (its ROM set, hardware, tables, dump and conversion). The rules every original is
raised by and the parts the originals share are [Original road data](original-road-data.md)'s.

POLE POSITION II's courses are raised from MAME's `polepos2` (Pole Position II (Japan), Namco, 1983), its parent set,
whose programs are not encrypted. Its hardware and ROM list were read from MAME's driver `src/mame/namco/polepos.cpp` and
the custom chips' devices (`namco51.cpp` to `namco54.cpp`) at MAME commit `df3bcbba30251a393d8bb33a356c6c2ee93c34e9`.

## POLE POSITION II's ROM set

K's `polepos2.zip` holds MAME's 44 ROMs of the set and the four custom chips' own ROMs (`51xx.bin` to `54xx.bin`,
MAME's devices' ROM lists), every one matching by name, size and CRC-32. Its clones are `polepos2a` (Atari), `polepos2b`
(a bootleg), and `polepos2bi`, `polepos2bs` and `grally` (bootlegs). The tool reads the two Z8002s' programs and five
color PROMs (`pole-position-ii-rom`, which holds their names and CRC-32s):

| Program      | Addresses     | Even (high) bytes | Odd (low) bytes |
| ------------ | ------------- | ----------------- | --------------- |
| first Z8002  | 0x0000–0x3FFF | `pp4_2.8l`        | `pp4_1.8m`      |
| second Z8002 | 0x0000–0x3FFF | `pp4_6.4l`        | `pp4_5.4m`      |
| second Z8002 | 0x4000–0x5FFF | `pp4_8.3l`        | `pp4_7.3m`      |

The color PROMs are the palette's red, green and blue (`pp4-7.8l`, `pp4-8.9l`, `pp4-9.10l`), the background's colors
(`pp4-11.4d`) and the road's palettes (`pp4-12.3c`). The Z80's program, the sprites, the road ROMs and the sound are not
read by the conversion.

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
off-road bound 0x4C00). Its sky is the background's color where it draws nothing (the first color group's pen 0) over
its verge's color below the horizon, until the background is laid.

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

## POLE POSITION II's constants

`pole-position-ii-constants` holds:

| Constant                | Value   | Why                                                                                         |
| ----------------------- | ------- | ------------------------------------------------------------------------------------------- |
| `LANE`                  | 5.5 m   | K's lane (2026-11-04): its own car, 2.15 m wide at its depth, makes it 5.46 m; K rounded it |
| `LANE_STEPS`            | 24      | the road ROM's lateral steps a lane between the edge lines                                  |
| `CENTRE_STEP`           | 32      | the road's centre, between steps 31 and 32                                                  |
| `SPEED_ENTRY`           | 0       | the factory settings' shown speed (Average, km/h), 0x1F38's first factor                    |
| `LAPS`                  | 4       | the factory settings' Goal (MAME's default): a race of four laps                            |
| `TEST`, `TEST_STRAIGHT` | 1, 66   | TEST's two long straights made 66 intervals each so that it closes (K, 2026-11-04)          |
| `MODELS`                | 0, 2, 3 | FUJI's, SUZUKA's and SEASIDE's models (K, 2026-11-04)                                       |
| `ROAD_WIDTH`            | 11 m    | the road width a lap on its model keeps off itself by: its two lanes                        |

How its own car makes the lane is in its [research notes](research/pole-position-ii.md#scale-across).

## POLE POSITION II's dump

`pole-position-ii-read` writes the names, curve tables, road palettes and the lap's factor and interval to
`reference-media/pole-position-ii/rom-data/pole-position-ii.json`, with the ROMs read.

## POLE POSITION II's conversion

The conversion's version is 2 (`POLE_POSITION_II_CONVERSION_VERSION`).
