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

and the road's color PROM `fl1-3.5b`, MAME's default settings `finalap2.nv`, and the tile layers' character ROMs
`fls2chr0` to `fls2chr7` and their mask `fls2sha`, as K's zip names them (MAME's `fls2_chr-0.11n` to `fls2_chr-7.9s` and
`fls2_sha.7n`). The sound, the sprites and the MCU are not read by the conversion.

## FINAL LAP 2's hardware

Namco System 2: a master and a slave 68000, the data at 0x200000 of both, a 6809 for the sound and an MCU for the
inputs; neither program is encrypted. The screen shows 288 × 224 of 384 × 264 at 6.144 MHz: 60.606 frames a second
(`FRAMES_A_SECOND`, `namco-system-2/display`), its pixels 28 wide to 27 tall (`PIXEL_ASPECT`).

Its road is the C45 chip's (`namco-system-2/road`): a picture of 64 × 512 tiles of 16 × 16 pixels, 2 bits a pixel, in
its own memory, which the program writes, and for each screen line a row of it, a zoom and an offset; a line shows the
picture's 1024 pixels across `zoom` screen pixels, 44 tiles of them drawn. A tile word's tile is its bits 0 to 9, its
color its bits 10 to 15; a tile's row is four bytes, its left eight pixels' high bits, then their low bits, then its right
eight's (`roadTilePixels`). A pixel's palette entry is 0xF00 plus the color PROM's entry for its color × 4 plus its pen.

Its tile layers are the C123 chip's (`namco-system-2/tiles`): faces 0 to 3, each a map of 64 × 64 tiles from 0x400000 +
0x2000 × the face, a word a tile, rows of 64; a face's x and y scrolls at 0x420002 + 8 × the face and 4 on, its color
register at 0x420030 + 2 × the face. A tile is 8 × 8 pixels, a byte a pixel, its rows top down, 64 bytes; a tile word's
bits 11 to 13 choose the character ROM (0 to 7) and its bits 0 to 10, its bit 14 above them, the tile within it; its bit
15 is clear in the faces read. The mask is 8 bytes a tile at the tile word's bits 0 to 14, a bit a pixel, bit 7 the
leftmost: a pixel whose bit is 0 shows nothing (`layerTilePixels`). A face's pixel's palette entry is 0x1000 plus 0x100
× its color register plus its byte (`layerColors`). The palette, the C116 chip's, holds entry e's red at 0x440000 +
0x4000 × (e >> 11) + 2 × (e & 0x7FF), its green 0x1000 on and its blue 0x2000 on (`paletteAddress`).

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

`final-lap-2-course` raises its four courses, by the programs' course numbers: JAPAN, MONACO, ITALY and USA
(`final-lap-2-japan` to `final-lap-2-usa`), each laid by [a circuit laid out](original-road-data.md#a-circuit-laid-out)
from its line, which lies at its curve table position, 0x946 units into its table, on the lap as laid ([Places and
patterns](original-road-data.md#places-and-patterns)). Each runs four laps, its lanes half its road's width; each is
level until its heights are read back from its screen; its sky is [its own](#its-skies).

USA's plan is its curve table's by the [plan from a curve table](original-road-data.md#plan-from-a-curve-table): an
oval of two right corners, which closes as it is (K, 2026-11-04); its turn scale closes it in one round. It is 2,927.2 m
round, of 21 pieces, its tightest arc 129.7 m, in 2 Sections.

JAPAN, MONACO and ITALY are each [a lap on its model](original-road-data.md#a-lap-on-its-model), its road width its
road's between its edge lines and its lanes' least radius by its lane. FINAL LAP 2's JAPAN may differ from the Suzuka
Circuit and from POLE POSITION II's SUZUKA (K, 2026-11-04). The laps as solved (`model-laps.json`), the turn scale 1
being where the table's turns' magnitudes sum to its model's:

| Course | Turn scale (a value's curvature at 1) | Start    | Terms (distances' mean; changes' sum) | From its model, same point; nearest (mean, most) | Crossings; least apart  | Corners' lengths (median, least to most) | Straights' lengths (median, least to most) | Tightest arc | Pieces; Sections | Solved in |
| ------ | ------------------------------------- | -------- | ------------------------------------- | ------------------------------------------------ | ----------------------- | ---------------------------------------- | ------------------------------------------ | ------------ | ---------------- | --------- |
| JAPAN  | 1.022 (0.0003691 rad/m)               | −44.5 m  | 1.577; 1.948                          | 12.7 m, 63.9 m; 10.4 m, 57.0 m                   | 1 (its model's); 14.2 m | −10.9 % (−23.8 % to +70.7 %)             | −0.5 % (−9.1 % to +23.0 %)                 | 22.1 m       | 167; 3           | 1,429 s   |
| MONACO | 0.526 (0.0008090 rad/m)               | +117.9 m | 8.012; 6.159                          | 31.2 m, 117.9 m; 19.7 m, 98.6 m                  | 0; 14.3 m               | +24.9 % (−37.7 % to +64.8 %)             | −11.6 % (−67.4 % to +22.5 %)               | 26.1 m       | 102; 2           | 855 s     |
| ITALY  | 0.444 (0.0004779 rad/m)               | −10.5 m  | 3.358; 2.106                          | 20.0 m, 63.8 m; 16.5 m, 59.4 m                   | 0; 286.3 m              | +6.4 % (−23.5 % to +69.2 %)              | −3.0 % (−42.4 % to +20.2 %)                | 92.4 m       | 67; 2            | 282 s     |

Distances are of the lap's intervals' ends; a length's change is its run's against its table's at the mean interval.
The procedure's answer is the least sum of the two terms its grid and its stages reach, not the least of all laps.
JAPAN crosses itself at one height where its model does (at 2,500 m and 4,894 m, about 59° apart): the passage crossed
is not drawn from the other, the route drawing its own Sections in turn, and vehicles on the two passages do not touch,
for vehicles meet by their stations along the route ([Body contact](content-and-gameplay.md#body-contact)).

### Its models

Each model is K's drawing of the circuit as it was in 1990 at real size (K's course data v2.1.1), its geometry alone in
the repository ([A lap on its model](original-road-data.md#a-lap-on-its-model)):

- **JAPAN**, `suzuka_1990`: Suzuka, drawn by K from MLIT, National Land Image Information (colour aerial photographs),
  CCB-87-4 C12A 13 (1987), and scaled to 5,859.43 m. 出典：国土交通省「国土画像情報（カラー空中写真）」.
- **MONACO**, `monaco_1990`: Monaco, arcs fitted by K to Jules Roy's "F1 Circuits SVG", monaco-5
  (https://github.com/f1db/f1-circuits-svg, commit c1bcd6fcb1b6fdb662136daa6bc19f3a2f870f65; CC BY 4.0,
  https://creativecommons.org/licenses/by/4.0/), scaled to 3,328 m, its start moved: K's changes to the author's work.
- **ITALY**, `monza_1990`: Monza, built by K from the circuit's official radii and lap length, 5,800 m, and its
  layout's topology.

### Its skies

Each course has one sky, as this game's skies are (K, 2026-11-04), laid by [Sky
baking](original-road-data.md#sky-baking) from two of the race's faces, both behind the road
(`final-lap-2-backgrounds`): face 0 its back layer and face 1 its front. Their colors are face 0's color register 1 and
face 1's 2 (the master's 0x2E80 and 0x2E90 write them to 0x420030 and 0x420032): palette entries 0x1100 and 0x1200, both
of which the race's palette set (the master's 0x374A with set course + 4, its lists at 0x37D4) fills from the course's
256 colors at data 0x246000 (JAPAN), 0x247800 (MONACO), 0x247200 (ITALY) and 0x246600 (USA): three words each, red,
green and blue, each word's high byte the color's eight bits.

- **The back layer.** Face 0 as the master's 0x2E1E lays it: rows 60 to 63 and 0 to 13 the picture, 64 tiles a row
  from the course's first tile (its table at 0x2F3C); rows 14 to 27 one tile each, the codes that follow, a ground's
  gradient; rows 28 to 43 the last of them; rows 44 to 59 the blank tile 0x7F. The picture's 144 rows lie above the
  horizon and the ground's below it: the picture's last row is the last above the horizon, the gradient beginning on the
  next, where every course's front scenery also ends. Rows 60 to 63 and 0 to 27, 256 rows (`BACK_ROWS`), are laid three
  times a turn (`BACK_REPEATS`), 1536 columns, the picture's column 0 the sky's pixel 0 (the clouds repeat every 512
  pixels and nothing faces by them), its bottom row 111 rows below the horizon.
- **The front layer.** Face 1's band, its rows 8 to 15 (`FRONT_ROWS`): the slave's 0x2030 writes a column's 8 tile
  words, from data 0x212000 + 16 × its id, a word a row. The faces' y scrolls follow the road's horizon row (the slave's
  0x21A2 keeps its address in $40901C; the master's 0x65A6 sets face 1's y to 0xF0 less that row and face 0's one more,
  MONACO's face 1 sixteen more than the others'), so with the two faces' display offsets the same the band's top lies 97
  rows below the picture's top (MONACO's 81). The scenery then ends on the first row below the horizon on every course:
  JAPAN's, ITALY's and USA's on the band's row 47, MONACO's city on its row 63, its band raised 16 for it; this is why
  the offsets are taken to be the same. The front's bottom row lies 16 rows below the horizon (MONACO's 0). Its turn is
  192 of the original's columns (`FRONT_COLUMNS`), 1536 pixels, the back's, its pixel 0 over the back's: the least
  scaling, not the original's own turn of its columns (USA's would be 0.56). Its columns are the arrangement's.
- **The ramp.** Above the picture, its top row's color every row; below the back layer, its last row's.
- **Facing.** The sky's pixel 0 lies at the line's heading and its pixels run rightward as the road turns right; each
  course's sky yaw origin shows it at the camera's centre at the course's start, the line (`skyYawOrigin(0, 1536)`,
  397.25°, which `sectionYawOrigin` brings within ±360°). Where the camera faces the line's heading, JAPAN's airship
  lies 10 to 14 columns left of the centre and its sea about the centre, MONACO's viaduct from 9 columns left of the
  centre to 3 right, and ITALY's two balloons 12 to 17 columns left. This game's GO is 192 m before the line: JAPAN,
  ITALY and USA face the line's heading there, MONACO 23.4° left of it (its viaduct some 12 columns further right). A
  lap of 360° (MONACO, ITALY, USA) leaves the sky 0.96°, half a column, off at GO, the sky's turn being 359.04°: Sky
  baking's drift, not an error.

**The arrangement** (`final-lap-2-fronts.json`). Each course's pieces in turn from the sky's pixel 0, each [section,
first, last] its section's columns at indices first to last. A column's id is the word at block + offset + 2 × index:
the block the slave's 0xB016 long for the course (data 0x20E000, 0x20F000, 0x210000, 0x211000), the offset its
section's word among the block's first 16, in bytes from the block; an index may be negative, reading the words before
the list, as the slave's 0x2096 does. A piece is last − first + 1 columns; a course's pieces are 192. The conversion
refuses, naming the course and the piece, a file that does not name exactly the four courses, a piece that is not three
integers with first ≤ last, a section not among the course's 16, an index whose word lies outside the block's lists
(from the end of its 16 offsets to its last list's 0xFFFF) or is 0xFFFF, and a course whose pieces are not 192
columns. K edits the pieces in the file by hand; the rows below the horizon are K's to draw (K, 2026-11-02), not the
file's.

K's auditor laid it for K from the ROMs (2026-11-05): each column placed at the turn where the original's screen shows
it most along a lap after the first (the original's columns as its slave lays them; the turn our lap's on its model,
USA's on its own table; 1.870° a column at 0.98; each screen's columns weighted toward its centre), GO's screen kept
whole, each distinctive feature at most once near where the original shows it most, the pieces' joins where the band's
outline steps least; then by hand: JAPAN's white blimp moved 11° left of GO's screen; held in place JAPAN's bridge, its
two towns and the water below a hill, ITALY's hot-air balloon and USA's town. What is not kept: the sections' changes
(the original changes its front band by sections along the lap; this game keeps one sky a course); the original's own
jump at the line as a lap begins (its index set to 38 while the columns on screen stay: 6 columns at MONACO, 1 at the
others); and a few plain columns repeat where pieces meet (JAPAN's section 9 at −45 to −41, MONACO's section 0 at 47 and
48, ITALY's section 0 at 152 to 154).

## FINAL LAP 2's constants

`final-lap-2-constants` holds:

| Constant        | Value                                             | Why                                                                                                                                                              |
| --------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `COURSE_IDS`    | `final-lap-2-japan`, …                            | the courses by the programs' numbers                                                                                                                             |
| `USA`           | 3                                                 | USA, an oval raised from its own table (K, 2026-11-04)                                                                                                           |
| `MODELS`        | 0, 1, 2                                           | JAPAN's, MONACO's and ITALY's models (K, 2026-11-04)                                                                                                             |
| `CAR_WIDTH`     | 2.15 m                                            | a Formula One car's widest in 1990: its own car's width at its depth (K, 2026-11-04)                                                                             |
| `CAR_COLUMNS`   | 57                                                | its own car's colored columns seen from behind, big sprites 0 and 1 (research)                                                                                   |
| `BACK_ROWS`     | face 0's rows 60 to 63 and 0 to 13, then 14 to 27 | the back layer: its picture's 18 rows above the horizon and its ground's 14, one tile each, below it, as the master's 0x2E1E lays them (K, 2026-11-04)           |
| `BACK_REPEATS`  | 3                                                 | the back's 512-pixel picture three times a turn, 1536 pixels: the whole number nearest the original's own turn of it (3.48 on USA), least scaled (K, 2026-11-04) |
| `FRONT_ROWS`    | face 1's rows 8 to 15                             | the front band, the rows the slave's 0x2030 writes a column of                                                                                                   |
| `FRONT_COLUMNS` | 192                                               | the front's columns a turn, 1536 pixels, the back's: least scaled, not the original's own turn of its columns (USA's 334) (K, 2026-11-04)                        |

How its own car makes the lane is in its [research notes](research/final-lap-2.md#scale-across).

## FINAL LAP 2's dump

`final-lap-2-read` writes the names, curve tables, line, laps, GO and interval to
`reference-media/final-lap-2/rom-data/final-lap-2.json`, with the ROMs read.

## FINAL LAP 2's conversion

The conversion's version is 4 (`FINAL_LAP_2_CONVERSION_VERSION`).
