# BIG RUN road data

How BIG RUN's ROMs are read (its ROM set, hardware, tables and conversion). The rules every original is raised by and
the parts the originals share are [Original road data](original-road-data.md)'s; the programs' map and what is open are
its [research notes](research/big-run.md)'s.

BIG RUN's courses are raised from MAME's `bigrun` (Big Run (11th Rallye version, Europe?), JALECO, 1989), its parent
set (K, 2026-11-05). Its hardware and ROM list were read from MAME's drivers `src/mame/jaleco/cischeat.cpp`,
`jaleco_road.cpp`, `jaleco_zoomspr.cpp` and `ms1_tmap.cpp` at MAME commit `179cfab56339b66c056e42d128dfe4e132cf2616`.
Its skies and its course tables are read so far; its courses come with Stage BR's next PRs
([NEXT](NEXT.md#stage-br--big-run-from-the-roms)).

## Its ROM set

K's `bigrun.zip` matches MAME's `bigrun` by CRC-32 but for the ten PROMs MAME's list has held since its 0.233, which its
driver reads and draws nothing by, and which no road needs. The main 68000's program is two pairs of ROMs, its even and
odd bytes from 0 and from 0x100000; each road 68000's is a pair from 0; each tile plane's two ROMs follow one another;
the two road layers read the same two road ROMs, 2,048 lines of 1,024 pixels (`big-run-rom`). The sound 68000's program,
which MAME decrypts, is not read, as no road needs it ([No decryption](original-road-data.md#rules-of-the-originals));
the main's and the road CPUs' programs are plain.

## BIG RUN's hardware

- **Its screen.** 256 × 224 pixels shown of 256 × 256 (MAME's description), at 4:3 its pixel 7/6 as wide as high.
- **Its tile planes.** Three Mega System 1 tile generators: plane 0 (the back) and plane 1 (the front) draw the sky's
  pictures, plane 2 the text. A plane is of 16 × 16 tiles, each four tiles of 8 × 8 of its tile ROM at 4 bits a pixel,
  the left pixel of a byte its high nibble; a tile word holds its tile in bits 0–11 and its palette entry in 12–15; pen
  15 is not drawn (`jaleco/ms1-tiles`). The board draws the road's far rows (their priority 4 to 7), then plane 0, plane
  1, the road's near rows and plane 2.
- **Its colors.** A palette word is RRRRGGGGBBBBRGBx, each channel's four high bits and then its low bit
  (`jaleco/palette`).
- **Its road layers.** Two, one a road CPU, each line of the screen one line of the road ROMs' pictures, scrolled and
  colored: so its road surface is drawn a line at a time and BIG RUN is inside the tool's boundary
  ([Rules](original-road-data.md#0-rules)). Above its road a road layer draws the sky's rows.

## Its skies

BIG RUN's sky is its two tile planes over its road layer's sky rows ([research notes](research/big-run.md#the-sky)), each
plane showing a scene of pictures that changes along the road (`big-run-backgrounds`).

- **The ramp.** Above the horizon each line of a road layer is one of the road ROM's lines 0 to 3, each four bands of 256
  pixels of one pen each (pens 4 × line to 4 × line + 3), scrolled to one band and colored by one entry of the road
  layers' palette (M 0x176A): one color a row. The second road CPU takes each row up from the horizon from its table of
  them (R2 0xEB8, a line, a scroll and an entry a row, 224 rows): one row, then a pen two rows each, entry 25 to 30. The
  color below the horizon is its first row's.
- **The scenes.** Each plane's scenes, stage by stage, are its table's records (plane 0's from M 0x9274, 40 bytes a
  record; plane 1's from M 0x8E20, 38 bytes): a record's start along the road, its picture's tile columns (a ring from
  +4 to +16, +A bytes a column, +C + 1 tile words each), the plane's tile row they go to (+E), its row offset (+8) and its
  palette (+20, +24 entries, loaded to the plane's first entry). A plane shows no scene before its first record's start:
  STARTING RUN's plane 0 is cleared to a blank tile at its start (M 0x92B8), its pictures coming at 56,000 and 116,000.
- **Their pictures.** Plane 0's pictures are 64 columns (1,024 pixels), plane 1's 96 (1,536). The program writes a scene's
  first 18 columns as it loads it and the column moving in each time its plane turns 16 pixels (M 0x8F62, 0x917E,
  0x91DE), so a picture is its columns in turn, round.
- **Their turns.** Each plane turns by the arcs of the road the car is on (M 0x7358, a record a road's arc: its +6 the
  front's pixels and its +8 the back's), 12 pixels a degree for the front and 8 for the back (K, 2026-11-09): a turn is
  4,320 and 2,880 pixels, 2.8125 pictures each, so each plane is laid round from its seam
  ([Sky baking](original-road-data.md#sky-baking)). Plane 0 faces the sky. Each plane is loaded with its scroll 8 (M
  0x8EDE, 0x930C), its pixel 136 at the screen's middle column (`SKY_MIDDLE`), and the front's overlap is the one at which
  both face it; the seam lies half a turn of the back from it (`SKY_SEAM`).
- **Their rows.** A plane's row offset is its scene's +8 plus the road's rows above its last line, which the road CPU
  gives (`$f6022`, M 0x8E88), so that a picture's bottom row lies its scene's offset below the horizon less the screen's
  240 rows, whatever the road's rows: 32 to 138 rows below it. Along a scene the program moves a plane up and down by its
  record's table of steps (+1A); a sky lays its scene's own offset.

## Its course tables

Each stage's two roads are held by the road CPUs, road N by the Nth road CPU, which draws it (`big-run-road`): road 1
from the table the first road CPU reads at R1 0xA1E, road 2 from the second's at R2 0xA0E, 16 bytes a stage of four
pointers; each CPU holds a copy of the other's to place it ([research notes](research/big-run.md#its-roads)). The car
is on road 2 where the main program's `$f047e` is 0, on road 1 where it is 1.

- **A plan record** (26 bytes, a table of starts beside it): its flag (+0), whose top bit turns its arc right on the
  screen; its radius (+2, 0 a straight); its position where it starts, +0xA along heading 0 and +6 a quarter turn to
  the right; its heading (+0xE, 16,384 a turn, turning right); its road's picture (+0x16, +0x18).
- **A profile record** (24 bytes, its own table of starts): its flag (+0), whose top bit makes its grade rise along
  it; its vertical radius (+2, 0 a straight); its height where it starts (+6); its grade's angle (+0xE, 16,384 a turn,
  up positive).
- **The ends.** A table of starts ends at 0xFFFFFFFF or at a start no later than the one before; a course reads its
  records up to its end.
- **A stage's goal, checkpoint and grid.** The main program holds each stage's goal (M 0x10A2: 215,000 positions in
  STARTING RUN and VICTORY RUN, 370,000 in the SPECIAL STAGES), its checkpoint (M 0x10B8: 185,000, 182,500 in SPECIAL
  STAGE 4; none in STARTING RUN and VICTORY RUN, at 999,999) and its grid (M 0xF54: eight slots of a lateral, a road and
  a position).
- **A road position** is 13.23 mm: a speed unit shows 0xB6DB / 65,536 km/h (M 0x15DEA) and gains the road half a
  position a tick straight ahead (M 0x3248), at BIG RUN's tick of 1/30 s.

## Its plan

Each road's table is laid by [the plan from a table's arcs](original-road-data.md#plan-from-a-tables-arcs)
(`big-run-plan`), its records taken record by record within 0.03° and 14 positions (K, 2026-11-09 and 2026-11-11): road
2 as P, and road 1 [from its own table](original-road-data.md#plan-from-a-tables-arcs) beside it. Its headings turning
right, a record's heading is its negative in the shared rule's plane, and its +6 its negative there. Every stage's
records keep within 0.026° and 6.3 positions to its goal; laid on from the first record, its plan departs from the
table's points by up to 0.041° and 72.7 positions (SPECIAL STAGE 4), and road 1 misses P by up to 4.4 positions where
they meet again (SPECIAL STAGE 2's goal). In VICTORY RUN road 1 parts from P at 162,831 and never meets it again: P
turns 90° right from 186,655 and road 1 goes straight on. BIG RUN's tables hold no jump.

## Its heights

A road's 3D road becomes a profile along its positions (`big-run-heights`): each record's grade is its height's rise a
position, the sine of its grade's angle, as the table's heights rise; a vertical arc's grade changes evenly to the next
record's, a straight's at once where it ends. Laid on from the first record, it departs from the table's heights by up
to 25.8 positions where a record starts. Its steepest grade among the records starting before a goal is the tangent of
25° (STARTING RUN's and SPECIAL STAGE 2's), so its factor f is 0.25 ÷ 0.466, 0.537, as K decided (2026-11-09).
