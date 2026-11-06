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
`fls2chr0` to `fls2chr7` and their mask `fls2sha`, and the sprites' `fl2obj0` to `fl2obj7`, as K's zip names them
(MAME's `fls2_chr-0.11n` to `fls2_chr-7.9s`, `fls2_sha.7n` and `fls_obj-0.4c` to `fls_obj-7.6a`). The sound and the MCU
are not read by the conversion.

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
- **GO.** The master's 0x58A6 places grid slot k (the cabinet's number, $52 & 7) 0x708 − 200k units into the table,
  its car's x 0x7D0, or 0xF830 where k is odd (`readGrid`): the player's slot 0 stands 574 units, 6.41 m, behind the
  line, and each next 2.23 m behind by turns either side. Its 0x58EC sets the starter 0x1C2 units ahead of the car at
  1.4 times its x, who steps away from it from GO and is gone after 3 s (class 9, its 0x5DB0). The road's grid marks lie
  every 256 units by turns either side, the first on the left at the line, not where the cars stand.
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

JAPAN's, MONACO's and ITALY's roads narrow along their laps: their pictures' left edge lines move in, a pixel (now and
then two or three) each step of four tile rows, while their right ones stay (column 644). Each edge lies where its
picture's rows put it, at their curve table positions on the lap as laid, joined as [a lateral changed straight between
points](original-road-data.md#a-lateral-changed-straight-between-points); its two lanes are the halves of the road
between its edge lines' middles wherever it is (K, 2026-11-04). A row's left edge line is where it draws the line as the
first row does (its lightest run and the two runs either side), its leftmost place (`leftEdges`); every row draws its
right one where the first does. The edge is written at each step of its picture (0x40 units), where its rows' points
lie, the knots that lie straight between others within a micrometre dropped. Under its surface its bands, one a material
(its widest band's colors), left of P go with the left edge line, the outermost's outer side staying at the picture's
edge, the others stay; the left limit keeps its distance from the left edge line. The narrowest roads, 7.98 m (lanes of
3.99 m, the road's middle 3.04 m right of P): JAPAN's from 571 m to 935 m and from 5,327 m to 5,500 m round its lap,
MONACO's from 304 m to 680 m, from 1,192 m to 1,312 m and from 2,135 m to 2,306 m; ITALY's narrowest is 9.50 m (lanes of
4.75 m, its middle 2.28 m right of P), from 2,861 m to 5,170 m. USA's road keeps 14.06 m.

Beyond its picture, either side out from its edges (8.36 m from P), the ground is one color, color alone with no
material: each course's back layer's last row's, the color its sky's ramp takes below the back layer (`groundColor`, K,
2026-11-05), JAPAN's 4675, MONACO's 14765, ITALY's 3618 and USA's 20868 (RGB555). Its Strips are open outward, so the
color reaches as far as the ground is drawn; the plan's clearance clips material, not color. Where the ground is drawn
it hides the sky's gradient below the horizon (the back layer's ground), as K accepts; beyond the farthest ground drawn
the sky still shows.

Its scale across is its own car's (K, 2026-11-04): at its depth as wide as a Formula One car could be in 1990, 2.15 m
(`CAR_WIDTH`). The slave makes a road line's zoom its depth over 16 (its 0x1666 and 0x1672), the line 0x87C2C0 over
the depth less 0x15A, and scales an object by 0x1AF26 over the line + 0x15A (its 0x303E and 0x305E), a car's 32-pixel
tiles a quarter of that apart (its 0x3078 and 0x2C90): a car's pixel is 1.591 road pixels at every depth, and its own
car's `CAR_COLUMNS`, 57, are 90.7. A road pixel is 2.375 cm (`roadPixelMetres`); USA's road is 14.06 m between its
edge lines' middles, a lane 7.03 m, and up is 27/28 of across.

### Its road surface

Its road's surface is its picture's rows along its lap as Strips (`final-lap-2-surface`), color alone, over its bands
(K, 2026-11-05): its edge lines, lane dashes, kerbs' red and white with their slant, the grid's marks, the start line,
USA's letters and the patches of shade, as its road chip draws them (`pictureRows`, a row each unit, a tile row's 16
pixel rows at its 16 units).

- **Runs.** Each row's runs of one color, those left of P (cut there) counted from its left edge line and drawn by
  lane a's left line, the picture's first column staying where it is drawn, the rest where they lie; a run lasts while
  the rows draw it so, from the unit it begins to the unit it ends, cut at the line.
- **Where the width changes.** A step whose left edge line stands where neither neighbour's does lies where the road
  narrows or widens: its rows' part left of P is the nearest level step's a whole number of blocks away (32 steps, the
  slave's 0x1400's group, 2048 units, which its patterns repeat by), moved with the edge; its own rows there are not
  drawn.
- **Laid.** A run recurring at one spacing three times or more is laid over the stretch from its first time's curve
  table position to its last's end, its times at their phase counted from the line in the lap's mean units, its length
  and spacing kept ([Places and patterns](original-road-data.md#places-and-patterns)); any other run from its curve
  table position to the next. Runs of one side, spacing and count whose first times lie within a spacing of each other
  are one repeat. The part left of P is drawn first.
- **What it takes.** Every Section keeps within the format's limits with its patches, so no course leaves them out:
  JAPAN's three take 1,475, 236 and 601 Strips of 2,048 (21,694, 4,648 and 8,016 pieces of 131,072), MONACO's two 317
  and 1,408 (9,824 and 63,365), ITALY's two 671 and 268 (20,288 and 5,982), USA's two 296 and 390 (7,747 and 7,993).
- **Letters.** USA's road reads "namco" from 2,858.5 m to 2,865.7 m round its lap, 68 m before its line: 19 of its
  second Section's Strips. JAPAN's, MONACO's and ITALY's roads draw no letters.

## FINAL LAP 2's courses

`final-lap-2-course` raises its four courses, by the programs' course numbers: JAPAN, MONACO, ITALY and USA
(`final-lap-2-japan` to `final-lap-2-usa`), each laid by [a circuit laid out](original-road-data.md#a-circuit-laid-out)
from its line, which lies at its curve table position, 0x946 units into its table, on the lap as laid ([Places and
patterns](original-road-data.md#places-and-patterns)). Each runs four laps, its lanes half its road's width; its car
grid the rule of [GO](#final-lap-2s-tables) laid on to a run's competitors by [the grid](original-road-data.md#the-grid),
6.41 m to 43.9 m before the line, each slot behind the one before by the table's metres spread by 1.1185, 2.498 m, so
that a car's length parts those on one side, and its bike grid the general form from 1.19 m before the line; each is
its heights [read back from its screen](#its-heights); its sky is [its own](#its-skies).

USA's plan is its curve table's by the [plan from a curve table](original-road-data.md#plan-from-a-curve-table): an
oval of two right corners, which closes as it is (K, 2026-11-04); its turn scale closes it in one round. It is 2,927.2 m
round, of 21 pieces, its tightest arc 129.7 m, in 2 Sections.

JAPAN, MONACO and ITALY are each [a lap on its model](original-road-data.md#a-lap-on-its-model), its road width its
road's between its edge lines at its line (14.06 m) and its lanes' least radius by its lane there. FINAL LAP 2's JAPAN
may differ from the Suzuka Circuit and from POLE POSITION II's SUZUKA (K, 2026-11-04). The laps as solved
(`model-laps.json`), the turn scale 1 being where the table's turns' magnitudes sum to its model's:

| Course | Turn scale (a value's curvature at 1) | Start    | Terms (distances' mean; changes' sum) | From its model, same point; nearest (mean, most) | Crossings; least apart  | Corners' lengths (median, least to most) | Straights' lengths (median, least to most) | Tightest arc | Pieces; Sections | Solved in |
| ------ | ------------------------------------- | -------- | ------------------------------------- | ------------------------------------------------ | ----------------------- | ---------------------------------------- | ------------------------------------------ | ------------ | ---------------- | --------- |
| JAPAN  | 1.022 (0.0003691 rad/m)               | −44.5 m  | 1.577; 1.948                          | 12.7 m, 63.9 m; 10.4 m, 57.0 m                   | 1 (its model's); 14.2 m | −10.9 % (−23.8 % to +70.7 %)             | −0.5 % (−9.1 % to +23.0 %)                 | 22.1 m       | 167; 3           | 1,429 s   |
| MONACO | 0.526 (0.0008090 rad/m)               | +117.9 m | 8.012; 6.159                          | 31.2 m, 117.9 m; 19.7 m, 98.6 m                  | 0; 14.3 m               | +24.9 % (−37.7 % to +64.8 %)             | −11.6 % (−67.4 % to +22.5 %)               | 26.1 m       | 102; 2           | 855 s     |
| ITALY  | 0.444 (0.0004779 rad/m)               | −10.5 m  | 3.358; 2.106                          | 20.0 m, 63.8 m; 16.5 m, 59.4 m                   | 0; 286.3 m              | +6.4 % (−23.5 % to +69.2 %)              | −3.0 % (−42.4 % to +20.2 %)                | 92.4 m       | 67; 2            | 282 s     |

Distances are of the lap's intervals' ends; a length's change is its run's against its table's at the mean interval.
The procedure's answer is the least sum of the two terms its grid and its stages reach, not the least of all laps.
JAPAN crosses itself where its model does (at 2,500 m and 4,894 m, about 59° apart): the passage crossed
is not drawn from the other, the route drawing its own Sections in turn, and vehicles on the two passages do not touch,
for vehicles meet by their stations along the route ([Body contact](content-and-gameplay.md#body-contact)).

### Its models

Each model is K's drawing of the circuit as it was in 1990 at real size (K's course data v2.1.1), its geometry and its
circuit's elevation in the repository ([A lap on its model](original-road-data.md#a-lap-on-its-model)):

- **JAPAN**, `suzuka_1990`: Suzuka, drawn by K from MLIT, National Land Image Information (colour aerial photographs),
  CCB-87-4 C12A 13 (1987), and scaled to 5,859.43 m. 出典：国土交通省「国土画像情報（カラー空中写真）」.
- **MONACO**, `monaco_1990`: Monaco, arcs fitted by K to Jules Roy's "F1 Circuits SVG", monaco-5
  (https://github.com/f1db/f1-circuits-svg, commit c1bcd6fcb1b6fdb662136daa6bc19f3a2f870f65; CC BY 4.0,
  https://creativecommons.org/licenses/by/4.0/), scaled to 3,328 m, its start moved: K's changes to the author's work.
- **ITALY**, `monza_1990`: Monza, built by K from the circuit's official radii and lap length, 5,800 m, and its
  layout's topology.

Each circuit's elevation, its highest point less its lowest, is Formula1.com's for the circuit as raced in 2016,
taken for the 1990 circuit on the same ground: JAPAN's 40.4 m, MONACO's 42 m and ITALY's 12.8 m ("Highs and lows -
which F1 track has the most elevation changes?", 21 October 2016,
https://www.formula1.com/en/latest/article/highs-and-lows-which-f1-track-has-the-most-elevation-changes-.7I9JEcBw3R2AqXbnJ6hyvc).

### Its heights

Each course's heights are its screen read back by the [grades' rule](original-road-data.md#profile-from-the-originals-screen),
a lap a piece (`final-lap-2-screen-frames`):

- **Its screen.** The slave's 0x1608 lays its road's lines from a depth of 0x6470 while the depth is above 0x1F4, each
  0x87C2C0 over its depth less 0x15A units ahead of the position, and lowers the depth each line by 0x4900 over 0x80
  plus half the slope (a signed byte, rounded down) of the course's slope table at that line's interval (`readSlopeTables`:
  the slave's table at 0x31E4, its 0x162C, an interval a byte as a curve table's). Its 0x21A8 copies line n to the road's
  line memory's word 310 − n, which the C45 shows on screen row 295 − n (`ROAD_LINE_OFFSET`, its 15): lines 72 to 295 are
  the screen's 224 rows. On a level road the depth falls evenly, so the lines are a pinhole's, 0x15A units behind the
  position; a slope makes them fall faster or slower, a line X units from the pinhole moving by an amount growing as
  (X − 0x15A) / X: as a level camera sees a road graded from the position.
- **Level.** A course's level road is the screen its lap's mean slope would lay (K, 2026-11-05): JAPAN's 11.20, MONACO's
  9.18, ITALY's 4.92 and USA's 5.00; the original's rows are whole rows and its level road's are computed at each line's
  distance (Row steps).
- **Its camera.** It is read through a level camera at this game's focal length, its eye where its level road puts it
  (about 3.2 m) above the road at the position, at its pinhole, 3.86 m behind the position.
- **Its piece.** A lap, closed, read round its second of three alike, a frame each interval of the position; its cells
  the whole number of units nearest 10 m that divides the lap, 1,024 (11.43 m).
  The pieces are kept with the others (`screen-pieces.json`, by the course's name).
- **Laid.** The piece's grades lie at their curve table positions on the lap as laid ([Places and
  patterns](original-road-data.md#places-and-patterns)), times one factor a lap, its length by the clock over its
  length as laid, less their mean over the lap, so that the lap closes in height (K, 2026-11-06); from the line round
  the lap. A run laid longer than its table's at the mean interval rises or falls the more, one laid shorter the less,
  and the grade does not step where two runs meet.
- **Within its model.** Where a course with a model would rise and fall farther than its circuit's elevation ([its
  models](#its-models)), all its grades are taken times one factor so that its highest and lowest lie exactly that far
  apart (K, 2026-11-06).

The laps as solved (looks in rows of the original's 224, both ways; the level road's for comparison; the vertical
curves the piece's; the factors a lap's and its model's; heights from the line's, as laid; the solve's time on one
thread):

| Course | Look (level road's) | Vertical curves | Factors (a lap; its model) | Steepest | Highest; lowest | Solved in |
| ------ | ------------------- | --------------- | -------------------------- | -------- | --------------- | --------- |
| JAPAN  | 2.246 (7.314)       | 14              | 0.500; 1                   | 5.7 %    | +17.2; −10.3 m  | 886 s     |
| MONACO | 1.039 (11.339)      | 3               | 0.880; 0.450               | 4.8 %    | +28.2; −13.8 m  | 1,031 s   |
| ITALY  | 1.189 (10.125)      | 3               | 0.505; 0.183               | 1.0 %    | +0.6; −12.2 m   | 783 s     |
| USA    | 1.306 (15.139)      | 2               | 1; —                       | 10.6 %   | +65.2; −68.7 m  | 804 s     |

JAPAN's two passages where it crosses itself lie at 7.4 m and 8.1 m.

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

## FINAL LAP 2's objects

Each course's objects are its scenery as the master places it and the slave draws it (`final-lap-2-scenery`), its
kinds' pictures as boards (`final-lap-2-boards`, `finalap2-<kind>`):

- **Places.** The master's 0xD778 reads course c's list from its table at 0x11900: four words an entry, its place, its
  lateral, its class and its kind, a place with its bit 15 set ending the list. A place's bits 2 to 13 are its step, 0x40
  units (its 0xD7F2), from its table's start: an object stands at its step's curve table position ([Places and
  patterns](original-road-data.md#places-and-patterns)). Class 3 is scenery, which the slave's 0x27D0 draws; JAPAN's one
  entry of class 5 (step 1,664, lateral 2,500, kind 0) is the underpass the slave's 0x299A draws (below, K,
  2026-11-06).
- **Laterals.** A lateral is 1.4803 mm beside P (`lateralMetres`): the slave's 0x3038 and 0x304E place an object's
  lateral over 16 times 0x158A6 / (line + 0x15A) over 256 times 0x452 / 0x2C0 screen pixels beside the road's centre,
  where a road pixel is 0x87C2C0 / 16 / 1024 / (line + 0x15A) of them, so 0.0623 road pixels at every line. A car's x is
  an object's lateral (the master's 0xD7FC sets an object's x from its lateral, and its 0x5CD0 takes every object's x
  less the car's): the grid's cars stand ±0x7D0 laterals, 2.96 m, beside P.
- **Pictures.** A kind's picture is its near layout as the slave's 0x27D0 lays it: its entry in the table at 0x423C,
  its color the entry's first word's low four bits, its near layout at the entry's sixth byte; a layout's words its base
  point's x and y (pixels from its left and up from its bottom), its columns and rows, a word, then its sprites' words a
  row each from its top, 0 none, a word's bits 0 to 11 the sprite and its bit 12 mirroring it. A sprite is 32 × 32
  pixels of 8 bits (`namco-system-2/sprites`): its bit for pixel (x, y) and plane k, the first plane the most
  significant, is sprite × 8192 + 256y + 32⌊x/4⌋ + (x mod 4) + 4k of the sprites' memory, each sprite ROM a byte of its
  32-bit words, the first four its first half and the last four its second; pen 0xFF shows nothing. A pen's palette
  entry is the color × 256 + the pen, filled by the list at 0x386C that every palette set loads, as the road's are.
- **Colors.** Each picture keeps its 15 most used RGB555 colors and every other pixel takes the nearest kept one in
  linear light, with no mixing and no dithering, as a sky's tiles do (`keptColors`, K, 2026-11-05). Of the 91 kinds
  placed, 48 draw 15 colors or fewer; the other 43 draw 16 to 47, and at most 16.6 % of a picture's pixels (kind 67's)
  take another color.
- **Size.** The slave scales an object as it scales a car (its 0x303E and 0x305E): a sprite's pixel is its own car's,
  `CAR_WIDTH` / `CAR_COLUMNS`, 3.77 cm, across and 27/28 of it up. Each picture is put on the texel grid by chosen lines
  and the sprites' rules, with no shadow, its base point the layout's, standing on the ground ([Pictures from the
  extract](original-road-data.md#pictures-from-the-extract)).
- **Bodies.** The master's 0xD4C6 tests the player's car against a class 3 object of a kind below 0x78 as it passes
  (its 0xD4DE): half as wide as its near layout's columns × 256 laterals (its table at 0x12938), beside the car's own
  0x280. Such an object's body is as wide as that, at most its picture's colored
  columns. Kinds 120 on have none: 120 (a sign over the road's side) and 127 (a tree) beside the road, and 121 to 126
  across it, at lateral 0 or (ITALY's 123 and 124) 2,500 laterals right, which the program never hits (K, 2026-11-05).
- **What shows nothing.** Kinds 118 and 119 lay no sprite, yet the master tests them: with no colored columns they have
  no body, and they are not placed. MONACO has 11, ITALY 9 and USA 14 of them, 4.9 m to 14.1 m beside P.

- **The underpass** (K, 2026-11-06). The slave's object pass (0x2FBA on) calls each object's routine by its class from
  the words at 0x31A2, class 5 0x299A, with d2 its x and d3 its road line's row on the screen (larger higher), d5 its
  sprites' size (a quarter of its zoom, 32 where a sprite is 1:1), d6 that size turned into its words' size bits and d7
  its zoom. 0x299A lays 6 rows of 16 sprites (`underpassLayout`), each an entry {its top, its word (four times a
  layout's, bit 14 mirroring it), its left, its attributes}: its left d2 − 8s and its beam's row d3 + 4s − s/4, so its
  base point is its middle across and s/4 above its bottom edge, as a class 3 layout's. From its top: two rows of 12 in
  the middle, the sign (0xE20 on and 0xE50 on, color 0xA); beside the lower, 0xB2C twice at either end; the beam (0xE80,
  0xE84, 0xE88 twelve times, 0x4E84, 0x4E80); three rows of the walls, two sprites at either end (0xE8C on from the
  left, 0x4E8C on from the right); all but the sign in color 0xC. It is one picture by the pictures' rules, its pens in
  both colors' palettes, 15 colors at most (it draws 8): `finalap2-299a`, named by its routine, as its kind 0 is
  `finalap2-000`'s too, 19.3 m wide. It stands at its step's curve table position, its lateral 3.70 m right of P (2,500
  laterals): on JAPAN at 2,424.9 m, 75 m before the crossing's first passage at 2,500 m. The master's 0xD26E (the
  class 5 handler in its table at 0xD0DE) pushes the car aside where it passes within 0x64 of its place beyond 0x15E0
  laterals either side of its lateral (`underpassOpening`): its walls are two body parts, from that, 8.29 m, out to its
  colored columns, 1.37 m each. Within 0x258 of its place the master writes 0x80 to 0x460814, as the walls' hit writes
  0x460812 (the sound's), and clears it beyond; 0x299A writes 4 to 0x10532A, the attributes' low word every object
  after it takes, and its row, x, size and zoom to the shared 0x409070 to 0x409078, which the slave's own 0x1C3C reads
  each frame into 0x100060 and its 0x1CEE turns into the display's registers 0x40902A, 0x40903A and 0x420024 (the
  master does not read them).

JAPAN places 61 objects and its underpass, MONACO 237, ITALY 117 and USA 63; 447 of them have bodies.

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

The conversion's version is `FINAL_LAP_2_CONVERSION_VERSION`'s.
