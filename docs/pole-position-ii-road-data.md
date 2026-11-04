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
  interval; the course's first is its road's palette here.
- **The lap's length.** The shown speed is the speed's long times a factor over 2^24 (the first program's 0x1F40 and
  0x1F62, the factors at 0x1F38: 320, 400, 200 and 250), and the road position gains the speed's long over 8 a frame
  (0x1CC0). The factory settings (MAME's defaults: the Speed setting Average, km/h) take the first, 320, so a speed shown
  as 1 km/h gains 2^21 / 320 positions a frame and an interval is 11.733 m (`intervalMetres`): a lap of 256 intervals is
  3,003.7 m.
- **The player at GO.** The second program's 0x0656 places the player 0x12 of the road position's high word's units
  (256 an interval, 0.82 m) behind its place.

## POLE POSITION II's road across

The road across is its first road palette's colors, one a lateral step, a band each run of one color
(`pole-position-ii-cross-section`): steps 1 to 4 and 59 to 62 the verges, 5 and 6 and 57 and 58 the kerbs, 7 and 56 the
edge lines, 8 to 55 the road, its centre between steps 31 and 32. A step is 5.5 / 24 m (the lane, below): the road
between its edge lines is 11.46 m, its picture's edges 7.10 m either side of its centre, which are its limits. From
the kerbs' outer edges in the road is `ASPHALT`, beyond `GRASS`. Two lanes, a and b, lie either side of the centre.

## POLE POSITION II's courses

`pole-position-ii-course` raises TEST alone so far (`pole-position-ii-test`). Its plan is its curve table's by the
[plan from a curve table](original-road-data.md#plan-from-a-curve-table): an oval of four left corners. Its two long
straights, 62 and 70 intervals, are made 66 each (K, 2026-11-04), the intervals taken from or added at their beginnings,
so that the line stays 17 intervals before T1; its turn scale closes it in one round. It is level, 3,003.7 m round, of
73 pieces, its tightest arc 104.6 m. It is cut at its line and at the middle of its back straight (2 Sections). Its
start gate stands in the Section returning to its line by [the grid](original-road-data.md#the-grid), the player's slot
in lane b, where its own car stands (its x, 0x2600, half the off-road bound 0x4C00); it runs four laps. Its sky is the
background's color where it draws nothing (the first color group's pen 0) over its verge's color below the horizon,
until the background is laid.

## POLE POSITION II's constants

`pole-position-ii-constants` holds:

| Constant                | Value | Why                                                                                         |
| ----------------------- | ----- | ------------------------------------------------------------------------------------------- |
| `LANE`                  | 5.5 m | K's lane (2026-11-04): its own car, 2.15 m wide at its depth, makes it 5.46 m; K rounded it |
| `LANE_STEPS`            | 24    | the road ROM's lateral steps a lane between the edge lines                                  |
| `CENTRE_STEP`           | 32    | the road's centre, between steps 31 and 32                                                  |
| `SPEED_ENTRY`           | 0     | the factory settings' shown speed (Average, km/h), 0x1F38's first factor                    |
| `LAPS`                  | 4     | the factory settings' Goal (MAME's default): a race of four laps                            |
| `TEST`, `TEST_STRAIGHT` | 1, 66 | TEST's two long straights made 66 intervals each so that it closes (K, 2026-11-04)          |

How its own car makes the lane is in its [research notes](research/pole-position-ii.md#scale-across).

## POLE POSITION II's dump

`pole-position-ii-read` writes the names, curve tables, road palettes and the lap's factor and interval to
`reference-media/pole-position-ii/rom-data/pole-position-ii.json`, with the ROMs read.

## POLE POSITION II's conversion

The conversion's version is 1 (`POLE_POSITION_II_CONVERSION_VERSION`).
