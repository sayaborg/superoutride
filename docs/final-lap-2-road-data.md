# FINAL LAP 2 road data

How FINAL LAP 2's ROMs are read (its ROM set, hardware, tables, dump and conversion). The rules every original is raised
by and the parts the originals share are [Original road data](original-road-data.md)'s.

FINAL LAP 2's courses are raised from MAME's `finalap2` (Final Lap 2 (World, Rev B), Namco, 1990), its parent set, whose
programs are not encrypted. Its hardware and ROM list were read from MAME's drivers `src/mame/namco/namcos2.cpp` and
`namco_c45road.cpp` at MAME commit `df3bcbba30251a393d8bb33a356c6c2ee93c34e9`.

## FINAL LAP 2's ROM set

K's `finalap2.zip` holds MAME's set's ROMs under older names, each matching by size and CRC-32; MAME's sprite zoom table
`lh5762.6n` (marked a bad dump from another game) is not in it and is not read. Its clones are `finalap2j` and
`finalap2jb` (Japan). The tool reads (`final-lap-2-rom`, which holds their names and CRC-32s):

| What         | Even (high) bytes | Odd (low) bytes |
| ------------ | ----------------- | --------------- |
| master 68000 | `fls2_mp0b.11d`   | `fls2_mp1b.13d` |
| slave 68000  | `fls1_sp0b.11k`   | `fls1_sp1b.13k` |
| data         | `fls2dat0.13s`    | `fls2dat1.13p`  |

and the road's color PROM `fl1-3.5b` and MAME's default settings `finalap2.nv`. The sound, the sprites, the tiles and the
MCU are not read by the conversion.

## FINAL LAP 2's hardware

Namco System 2: a master and a slave 68000, the data at 0x200000 of both, a 6809 for the sound and an MCU for the
inputs; neither program is encrypted. The screen shows 288 × 224 of 384 × 264 at 6.144 MHz: 60.606 frames a second
(`FRAMES_A_SECOND`, `namco-system-2/display`), its pixels 28 wide to 27 tall (`PIXEL_ASPECT`).

Its road is the C45 chip's (`namco-system-2/road`): a picture of 64 × 512 tiles of 16 × 16 pixels, 2 bits a pixel, in
its own memory, which the program writes, and for each screen line a row of it, a zoom and an offset; a line shows the
picture's 1024 pixels across `zoom` screen pixels, 44 tiles of them drawn. A tile word's tile is its bits 0 to 9, its
color its bits 10 to 15; a tile's row is four bytes, its left eight pixels' high bits, then their low bits, then its right
eight's (`roadTilePixels`). A pixel's palette entry is 0xF00 plus the color PROM's entry for its color × 4 plus its pen.

## FINAL LAP 2's tables

Each table is found by the instructions that read it, checked word by word (`final-lap-2-road`):

- **Names.** The course select's strings, from the master's 0x2B88, `SELECT ` and the name, 14 bytes each (the text
  codes 0x2B80 to 0x2BA1 its 0x9F70 shows them by): 0 JAPAN, 1 MONACO, 2 ITALY and 3 USA.
- **Curve tables.** Course c's from the data address the slave's table at 0x31D4 holds (its 0x1632), a signed byte an
  interval of the position's 256 units (its 0x1690), 1024 a lap: the master's 0x740C counts a lap as 2^18 units. A
  positive value turns right: the slave's 0x16C6 adds the curve's twice summed value to a line's offset, the road drawn
  the more right ahead (MONACO's and ITALY's tables sum positive, their circuits run clockwise). The tool takes each
  negated, left positive, as the plan from a curve table reads it.
- **The line.** The master's 0x740C counts the laps from the position less 0x946: the line lies 0x946 units, 9.27
  intervals, into the table.
- **Laps.** The master's 0x55C2 ends the race on lap ($714A & 3) + 2, counted from 0; its 0x17F4 copies $7140 on from the
  settings, a byte a word: MAME's default settings' byte 5 is 1, so a race is 4 laps.
- **The lap's length.** The shown speed is $30 over 8 times 0x287/0x200, 0x1C9/0x140 and 0x1B/0x3E8 (the master's
  0x782E); the position gains $30 over 0x190 a tick on the level (its 0x6C3C and 0x6C84); the tick is a frame, the
  program's clock counting 0x3C a second (its 0x78F6). A speed shown as 1 km/h gains the position 0.4105 units a tick, so
  a unit is 1.117 cm, an interval 2.859 m and a lap 2,927 m (`intervalMetres`).
- **GO.** The master's 0x58A6 places grid slot k 0x708 − 200k units into the table, the even slots at x 0x7D0: the
  player's slot 0 stands 574 units, 6.41 m, behind the line.
- **The road's picture.** The slave's 0x138A writes the road's tiles from its 0xB0B6, 0x70 pairs, each two tiles' rows
  by turns, from their last row up, each word's middle nibbles exchanged (`readRoadTiles`). Its 0x1400 streams the
  picture as the car goes, a step of four tile rows each 0x40 units: the step's group of 32 takes a block from the
  course's table (the slave's table at 0x31C4), the block and the step a row of the data's 0x220000, the row eight pairs
  of 0x222000's, each a 4 × 4 block of 0x230000's (`readRoadStep`).
- **The road's palette.** The master's palette loads, its list at 0x386C (by 0x37D4), each 256 entries from a data
  address, a word a channel, its high byte the channel, red, green and blue in turn (its 0x374A); entries 0xF00 on,
  the road's, from the data's 0x265A00 (`readRoadPalette`).

## FINAL LAP 2's road across

The road across is its picture's first row in its colors, a band each run of one color over the 704 columns the chip
draws (`final-lap-2-cross-section`); P lies midway between its edge lines, the row's first two runs of its lightest
color; the picture's ground, its first column's color, is `SAND`, the rest `ASPHALT`; its limits are the drawn columns'
edges, the nearer either side of P. Its two lanes, a and b, are half the road between its edge lines' middles.

Its scale across is its own car's (K, 2026-11-04): at its depth as wide as a Formula One car could be in 1990, 2.15 m
(`CAR_WIDTH`). The slave makes a road line's zoom its depth over 16 (its 0x1666 and 0x1672), the line 0x87C2C0 over
the depth less 0x15A, and scales an object by 0x1AF26 over the line + 0x15A (its 0x303E and 0x305E), a car's 32-pixel
tiles a quarter of that apart (its 0x3078 and 0x2C90): a car's pixel is 1.591 road pixels at every depth, and its own
car's `CAR_COLUMNS`, 57, are 90.7. A road pixel is 2.375 cm (`roadPixelMetres`); USA's road is 14.06 m between its
edge lines' middles, a lane 7.03 m, and up is 27/28 of across.

## FINAL LAP 2's courses

`final-lap-2-course` raises USA alone so far (`final-lap-2-usa`), laid by [a circuit laid
out](original-road-data.md#a-circuit-laid-out). Its plan is its curve table's by the [plan from a curve
table](original-road-data.md#plan-from-a-curve-table), from its line: an oval of two right corners, which closes as it is
(K, 2026-11-04); its turn scale closes it in one round. It is 2,927.2 m round, of 21 pieces, its tightest arc 129.7 m,
in 2 Sections, and runs four laps. It is level until its heights are read back from its screen; its sky is
`PLAIN_SKY` over its ground until its background is laid.

## FINAL LAP 2's constants

`final-lap-2-constants` holds:

| Constant      | Value                  | Why                                                                                  |
| ------------- | ---------------------- | ------------------------------------------------------------------------------------ |
| `COURSE_IDS`  | `final-lap-2-japan`, … | the courses by the programs' numbers                                                 |
| `USA`         | 3                      | USA, an oval raised from its own table (K, 2026-11-04)                               |
| `CAR_WIDTH`   | 2.15 m                 | a Formula One car's widest in 1990: its own car's width at its depth (K, 2026-11-04) |
| `CAR_COLUMNS` | 57                     | its own car's colored columns seen from behind, big sprites 0 and 1 (research)       |
| `PLAIN_SKY`   | RGB555 0x2A7F          | a plain blue sky until the background is laid                                        |

How its own car makes the lane is in its [research notes](research/final-lap-2.md#scale-across).

## FINAL LAP 2's dump

`final-lap-2-read` writes the names, curve tables, line, laps, GO and interval to
`reference-media/final-lap-2/rom-data/final-lap-2.json`, with the ROMs read.

## FINAL LAP 2's conversion

The conversion's version is 2 (`FINAL_LAP_2_CONVERSION_VERSION`).
