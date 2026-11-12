# BIG RUN road data

How BIG RUN's ROMs are read (its ROM set, hardware, tables and conversion). The rules every original is raised by and
the parts the originals share are [Original road data](original-road-data.md)'s; the programs' map and what is open are
its [research notes](research/big-run.md)'s.

BIG RUN's courses are raised from MAME's `bigrun` (Big Run (11th Rallye version, Europe?), JALECO, 1989), its parent
set (K, 2026-11-05). Its hardware and ROM list were read from MAME's drivers `src/mame/jaleco/cischeat.cpp`,
`jaleco_road.cpp`, `jaleco_zoomspr.cpp` and `ms1_tmap.cpp` at MAME commit `179cfab56339b66c056e42d128dfe4e132cf2616`.
Its six courses are raised with their objects.

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
  the left pixel of a byte its high nibble; a tile word holds its tile in bits 0–11 and its palette entry in 12–15, a
  tile past its ROM the one its address lines reach (the tile modulo the ROM's tiles); pen 15 is not drawn
  (`jaleco/ms1-tiles`). The board draws the road's far rows (their priority 4 to 7), then plane 0, plane
  1, the road's near rows and plane 2.
- **Its colors.** A palette word is RRRRGGGGBBBBRGBx, each channel's four high bits and then its low bit
  (`jaleco/palette`).
- **Its road layers.** Two, one a road CPU, each line of the screen one line of the road ROMs' pictures, scrolled and
  colored: so its road surface is drawn a line at a time and BIG RUN is inside the tool's boundary
  ([Rules](original-road-data.md#0-rules)). Above its road a road layer draws the sky's rows.

## Its skies

BIG RUN's sky is its two tile planes over its road layer's sky rows ([research notes](research/big-run.md#the-sky)), each
plane showing a scene of pictures that changes along the road: the JALECO board's skies (`jaleco/ms1-skies`), read where
BIG RUN's programs hold them (`big-run-backgrounds`).

- **The ramp.** Above the horizon each line of a road layer is one of the road ROM's lines 0 to 3, each four bands of 256
  pixels of one pen each (pens 4 × line to 4 × line + 3), scrolled to one band and colored by one entry of its road
  layer's palette: one color a row. The second road CPU takes each row up from the horizon from its table of them (R2
  0xEB8, a line, a scroll and an entry a row, 224 rows): one row, then a pen two rows each, entry 25 to 30. The colors
  are the sky's entries as the stage loads them ([its road across](#its-road-across)). The color below the horizon is
  its first row's.
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
  both face it; the seam lies half a turn of the back from it (`skySeam`).
- **Their rows.** A plane's row offset is its scene's +8 plus the road's rows above its last line, which the road CPU
  gives (`$f6022`, M 0x8E88), so that a picture's bottom row lies its scene's offset below the horizon less the screen's
  240 rows, whatever the road's rows: 32 to 138 rows below it. Along a scene the program moves a plane up and down by its
  record's table of steps (+1A); a sky lays its scene's own offset.

## Its course tables

Each stage's two roads are held by the road CPUs, road N by the Nth road CPU, which draws it (the board's tables,
`jaleco/road-tables`, where `big-run-road` says BIG RUN's lie): road 1 from the table the first road CPU reads at R1
0xA1E, road 2 from the second's at R2 0xA0E, 16 bytes a stage of four pointers; each CPU holds a copy of the other's to
place it ([research notes](research/big-run.md#its-roads)). The car is on road 2 where the main program's `$f047e` is 0,
on road 1 where it is 1.

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
  position a tick straight ahead (M 0x3248), at BIG RUN's tick of 1/30 s (K, 2026-11-08): its main loop waits for
  interrupt 4, which the board gives every second frame (MAME's description, taken as an assumption), and its waiting
  clock and last seconds' warning count 30 ticks a second, while its race clock counts a shown second in 24 to 28 ticks
  at Normal, the factory setting.

## Its plan

Each road's table is laid by [the plan from a table's arcs](original-road-data.md#plan-from-a-tables-arcs) (the board's,
`jaleco/road-plan`), its records taken record by record within 0.03° and 14 positions (K, 2026-11-09 and 2026-11-11):
road 2 as P, and road 1 [from its own table](original-road-data.md#plan-from-a-tables-arcs) beside it. Its headings
turning right, a record's heading is its negative in the shared rule's plane, and its +6 its negative there. Every
stage's records keep within 0.026° and 6.3 positions to its goal; laid on from the first record, its plan departs from
the table's points by up to 0.041° and 72.7 positions (SPECIAL STAGE 4), and road 1 misses P by up to 4.4 positions
where they meet again (SPECIAL STAGE 2's goal). In VICTORY RUN road 1 parts from P at 162,831 and never meets it again:
P turns 90° right from 186,655 and road 1 goes straight on. BIG RUN's tables hold no jump.

## Its heights

A road's 3D road becomes a profile along its positions (the board's, `jaleco/road-heights`): each record's grade is its
height's rise a position, the sine of its grade's angle, as the table's heights rise; a vertical arc's grade changes
evenly to the next record's, a straight's at once where it ends. Laid on from the first record, it departs from the
table's heights by up to 25.8 positions where a record starts. Its steepest grade among the records starting before a
goal is the tangent of 25° (STARTING RUN's and SPECIAL STAGE 2's), so its factor f, the least of its lens ratio (2.7 to
3.1) and 0.25 ÷ its steepest grade, is 0.25 ÷ 0.466, 0.537, as K decided (2026-11-09).

## Its road across

A row of a road layer draws one line of the road ROMs, picked by the plan record its road CPU is in and colored by an
entry of its layer's palette (`big-run-road-picture`, its lines the board's, `jaleco/road-lines`; [research
notes](research/big-run.md#its-road-across)).

- **A record's picture.** Its kind (+0x16) picks a picture of 184 lines, the farthest first, from its road CPU's table
  of line kinds (a word a kind's even byte offset, R1 0x193E, R2 0x1964); a row takes the line its depth gives, and the
  nearest row the picture's last, 187 on from the table's word. Kind 4 is one line all the way, by its variant
  (+0x18): 2 the line of pen 0, 6 the clear line, any other the town's line of pen 5 or the desert's of pen 7.
- **A line across.** At the nearest row a pixel is a unit: the line's centre lies at its pixel edge 512 and each pen's
  run across it reaches as many units from it. The run at the centre is the road's surface, as is every run of its pen;
  the runs between the outermost of them are lines on it; from them out to the runs that reach the line's ends, edges;
  those two runs the ground beside the road, or clear (pen 15), where the other layer or the planes show.
- **The town's paving** (lines 4 to 187): its nearest line's surface 318 units across, two lane lines 7 units wide whose
  middles lie 52.5 units either side of its centre, edges of 28 units and ground beyond. Its town is STARTING RUN's rows
  before 86,386 positions (R1 0x95E, R2 0x94E).
- **Its colors.** A row's entry is its kind's and variant's by its stripe, the stripe its position's of a period of 510
  positions (R1 0xD2C, R2 0xD00: eight stripes, 165, 45, 30 and 15 positions twice): a town's row its variant's four
  entries on (4 × variant + stripe); a desert's 31 on by its variant, and the next where its stripe's bit 2 is set; a
  river's (kind 2) its line's other half, in entry 40 where its variant is 0 and in 32 else.
- **Its palettes.** Each road layer's palette is the road layers' (M 0x176A), its entries 1 to 24 STARTING RUN's, which
  it loads for each layer and no later stage replaces (M 0xB8FA, 0xB91C), entry 31 its stage's (M 0xB93E, 0xB8DE) and
  the sky's entries 25 to 30 its stage's first set of 16 (M 0xB97E), which fade to its last as a position passes its
  stage's (M 0xBC66 to 0xBCD6): STARTING RUN's from dawn to day after 20,000 and SPECIAL STAGE 2's to dusk after 360,000.

## Its camera

Its eye lies 600 units behind the plane a unit is a pixel at (R1's depths at 0x1ADC and scales at 0x1B9A: a row at depth
z has scale s, z + 600 = 600 × 16,384 ÷ s), so its focal length is 600 pixels, 2.68 of its 224 rows. Its level road's
nearest row lies 96.95 rows below the horizon (its scale 16,384, a unit a pixel), so its eye is 96.95 units over the road:
1.28 m at the plan's scale up (K, 2026-11-09). This game's camera is its own (`CAMERA_DEFINITION`).

## Its conversion

Its six courses (`big-run-course`, each laid as the board's, `jaleco/board-course`) are its stages,
`big-run-starting-run`, `big-run-special-stage-1` to `-4` and `big-run-victory-run` (K, 2026-11-09):

- **Its road.** From its start, laid on back for its grid and the camera, to its goal and on to the first record of
  either road past it, at most 2,000 positions: road 2's plan as P ([its plan](#its-plan)), its heights road 2's 3D
  road times f, 0.537, and road 1's where the main program holds the car on road 1 (SPECIAL STAGE 2, 211,885 to
  229,233; [research notes](research/big-run.md#its-roads)), the crests' rule taking them on
  ([Crests](original-road-data.md#crests)).
- **Its lanes** are the town paving's ([its road across](#its-road-across)) over its two roads, each at its own centre
  ([two roads](original-road-data.md#two-roads)), road 1 at its lateral from P wherever it meets P again. Where it never
  does (VICTORY RUN's from 162,831), the course's lanes are road 2's alone.
- **Its pictures.** Each road's picture across, its nearest line's runs, is laid at its centre, cut where either road's
  picture changes: road 2's clear runs first, road 1's picture over them, then road 2's own, as MAME draws the second
  road layer over the first at one priority. Each run's colors are its stripes' over 510 positions, the most common laid
  over the whole and the others repeated, in its layer's palette as its stage loads it. Road 1 is not drawn where the
  two share their plan and lie more than 1 m apart in height (K, 2026-11-11); where road 2's side is clear and nothing
  lies beneath, its ground is transparent. VICTORY RUN's road 1 is drawn as the road not taken as far as it heads
  within 60° of P, with no material.
- **Its materials.** The town's road `ASPHALT`, the desert's `DIRT`; a river's (kind 2) and a one-line picture's, and
  the ground beside the road, by their colors (`groundMaterial`), water only in a river, a ground the rule makes
  `WATER` elsewhere stopping the conversion for K; under a clear run and between the roads `SAND`, and the lanes keep
  the held road's surface's where a picture gives them none.
- **Its limits** lie 512 units, a line's half, beyond the outermost road's centre on each side.
- **Its objects** of kind 0 stand where their records put them, each a board of its descriptor's sprite in its stage's
  sprites' palette ([its objects](#its-objects)): its lateral its picture's left edge from its road's centre in units
  across; its height its picture's top edge over that road, its board's base its drawn height below it ([its
  objects](#its-objects), Their places), in units up, a unit up a screen pixel's height over its width of a unit across
  (6/7), as its pictures are drawn. On a road not drawn they stand at that road's height below the course's, and where
  it lies above none does; past the road not taken's end none does. A hit (flags' bits 9 and 10, which the program puts
  in its list of things the car meets) has a body as wide as its picture's colored columns. Objects of the other kinds,
  which the program moves or picks, are not placed.
- **Its scale across** is its own car's straight picture's (K, 2026-11-09), as wide as a real car of its kind in 1989,
  the Peugeot 405 T16 Grand Raid's 1,760 mm ([Ultimatecarpage, its
  specifications](https://www.ultimatecarpage.com/spec/4960/Peugeot-405-T16-Grand-Raid.html), Dimensions): its frame
  0, 64 colored columns, drawn at the zoom its distance gives (M 0x12200, the table at 0x13B000: 102,000 ÷ (d + 600))
  over the road's pixels a unit there, 600 ÷ (d + 600), is 85.0 units at every distance, so a unit across is
  1.76 m ÷ 85.0, 20.7 mm. Up is the plan's own scale, its screen drawing a unit up as a unit across.
- **Its skies** are its planes' scenes in force with the sky's entries' first set, and their last from where its stage's
  sky changes, laid where a scene starts and over 1.6 s at 200 km/h where the sky changes; a sky's yaw is its back
  plane facing its middle column where its scene loads, turning 8 pixels a degree.

## Its objects

Its objects stand along its roads as each stage's table holds them (`big-run-objects`), drawn by the JALECO board's
zoomed sprites (`jaleco/zoom-sprites`), each picture a board of its sprite (`jaleco/zoom-boards`; [research
notes](research/big-run.md#its-objects)).

- **A record** (16 bytes, in the order of their positions, M 0x9874's table a stage): its position (+0), its picture's
  descriptor (+4, bytes into the descriptors' table at M 0xB07A), its kind (+6: 0 a picture standing where it is put,
  others moved or picked by the program), its lateral from its road's centre (+8), its height over the road (+A) and
  its flags (+C), whose bit 7 puts it on road 1 and else on road 2, and whose bits 0 to 5 are its palette entry.
- **A descriptor** (12 bytes): its scales across and down (the high bytes of +0 and +2, 128 its own size), its sprite's
  tiles across and down (+4) from its first tile (+6), and its attribute (+0xA).
- **A sprite's tiles** are 16 × 16 pixels at 4 bits, a tile's left 8 columns, 4 bytes a row, before its right 8 (MAME's
  description untangles them so), the left pixel of a byte its high nibble; pen 15 is not drawn and pen 0 is a shadow
  where the attribute's bit 12 asks for one. A zoom of 128 draws a tile at its size.
- **Their size.** An object's zoom at distance d (M 0xAB28, the table at 0x11DE00) is 153,000 ÷ (d + 600), times its
  descriptor's scale over 128 (M 0xB25A to 0xB27E: its x and y zooms alike), so a sprite's pixel at scale 128 spans
  1.992 units at every distance (255 ÷ 128 at 0, where the table's whole numbers round least), the road's pixels a unit
  there 600 ÷ (d + 600); its lateral (+8) and height (+A) are scaled as the road's units (M 0xB0F2 to 0xB1A4, the table
  at 0x122E00).
- **Their places.** BIG RUN's sprites are drawn down from their top edge (MAME's description: its zoomed sprites' y
  their top edge, CISCO HEAT's their bottom edge, x the left edge of both), and the main program puts a sprite's y at
  240 less the road's row at its distance and (+A plus `$f604a`) times the road's pixels a unit (M 0xB1A4 to 0xB200): so
  +A is the height of its picture's top edge over its road, its foot its drawn height below, 16 × its tiles down × 1.992
  units × its scale down ÷ 128. `$f6048` and `$f604a` sway the pictures each frame (M 0xAC48 to 0xB06A) and are not
  taken into their places. Each course's objects' bottoms lie at a median of −0.29 to 0.17 m from the road; those more
  than 1 m above it (44, 32, 8, 220, 1,057 and 110, course by course) are the upper parts of objects drawn in pieces, as
  the original draws them, a tree's crowns over its trunk, a building's upper floors, a cliff's ledge (SPECIAL STAGE 4's
  trees, 997 of its 1,057 more than 1 m up); those below it the cliffs hanging from a road's edge, the other road's
  objects at its own heights, and pictures whose foot the original draws below the road's row, as STARTING RUN's
  spectators (+A 78 units, drawn 159).
- **Their colors** are the sprites' palette as the stage loads it: its first 24 entries at boot (M 0x179C), then its
  stage's list from entry 25 (M 0xB884: an entry's words' offset, signed, into the table at M 0xB894 each).
