# CISCO HEAT road data

How CISCO HEAT's ROMs are read (its ROM set, hardware, tables and conversion). The rules every original is raised by and
the parts the originals share are [Original road data](original-road-data.md)'s; the programs' map and what is open are
its [research notes](research/cisco-heat.md)'s.

CISCO HEAT's courses are raised from MAME's `cischeat` (JALECO, 1990) ([Stage
CS](NEXT.md#stage-cs--cisco-heat-from-the-roms)). Its board is BIG RUN's ([BIG RUN's
hardware](big-run-road-data.md#big-runs-hardware)), and its road CPUs' code is BIG RUN's at other addresses.

## Its ROM set

The main 68000's program is two pairs of 256 KiB ROMs, its even and odd bytes from 0 and from 0x100000; each road
68000's is a pair from 0; each tile plane is one ROM of 2,048 tiles, plane 0's `ch9071.a14` and plane 1's `ch9071.t74`
(`cisco-heat-rom`), its scenes' tiles 2,048 to 4,095 those its address lines reach. The sound 68000's program is not
read, as no road needs it ([No decryption](original-road-data.md#rules-of-the-originals)); the main's and the road CPUs'
programs are plain.

## Its course tables

Each stage's two roads are held by the road CPUs as BIG RUN's are, road N by the Nth road CPU, which draws it (the
board's tables, `jaleco/road-tables`, where `cisco-heat-road` says CISCO HEAT's lie): road 1 from the table the first
road CPU reads at R1 0x1652, road 2 from the second's at R2 0x1642, 16 bytes a stage of four pointers. A plan record is
28 bytes and a profile record 24, a turn of a heading or a grade 65,536 units, and a plan's position is one road
position along and across. The main program holds the car on a road where its lists of the roads' records say (M
0x220E: four lists a stage, road 1's the third, read as the player's +0x58, road 2's the fourth, +0x5C; 20 bytes a
record, its end at +4 and its flags at +8), a record whose flags' bit 1 is set holding the car on its road from the end
of the record before to its own end; each list's first record ends at 0, before the road.

Its main program holds each stage's goal (M 0x224E: 350,000 positions in STAGE 1, 600,000 in the others), which ends the
stage where the car's position plus 90 reaches it (M 0x17B44), and its checkpoint (M 0x225C: 356,136, 312,237, 251,000
and 336,000 in STAGES 2 to 5; STAGE 1's, at 800,000, past its goal, none). A road position is 16.2 mm (1.75 / 108 m,
`positionMetres`): its speedometer shows a unit of the car's speed as 1.75 km/h (M 0x15CBA: the speed held within 0 and
160 units, four times its whole units the index of its digits at M 0x3B00, 280 km/h at its top), and the unit gains the
road a position a tick of 1/30 s ([Stage CS](NEXT.md#stage-cs--cisco-heat-from-the-roms)).

## Its plan

Each road's table is laid by [the plan from a table's arcs](original-road-data.md#plan-from-a-tables-arcs) within BIG
RUN's limits (0.03° and 14 positions a record), road 2 P and road 1 beside it from its own table, as BIG RUN's are ([its
plan](big-run-road-data.md#its-plan)): the most a record departs is 0.01° and 13.6 positions. Its headings jump by 4° to
20° between straights in STAGES 1, 3, 4 and 5, and in STAGE 5 by 20° on both roads at 351,908, after an arc of 65,000
positions, each laid as a turn. Five times its first road meets P again by a jump back onto it, its record there P's: in
STAGE 4 at 143,120, 215,368 and 299,616 (by 20° and 6,025, 3,821 and 5,469 positions), in STAGE 5 at 78,497 (8°, 4,209)
and 236,980 (1,743 positions), each after it heads 8° to 20° away from P or runs beside it; each parting keeps its own
arcs and ends at a Section's cut. In STAGE 5 road 1 leaves P at 340,872 and never meets it again.

## Its 3D road

A road's profile records (+0 its flag, the top bit rising; +2 its radius; +6 its height; +0xE its angle) are arcs as
they are (`arcRoad`, `jaleco/road-heights`): a straight at its record's angle, a vertical arc's angle changing evenly
along it by its length over its radius, each record from its own angle, so that where one starts at another angle than
the one before ends at, the road kinks there (by up to 44°). Its angles pass 90° (STAGES 1, 2 and 5). Laid so from each
stage's first record, its heights keep within 1.5 positions of the table's at each record but at one record of STAGE 2
(606,891, 58 positions), and within 5 to 30 positions of them laid on (170 in STAGE 2). BIG RUN's profile, its grade's
sine changing evenly along an arc, departs from these by thousands of positions; its heights are what its screen shows
([Stage CS](NEXT.md#stage-cs--cisco-heat-from-the-roms)), read from this road.

## Its heights

Its heights are [read back from its screen](original-road-data.md#profile-from-the-originals-screen) (a screen alone)
through [its camera](#its-camera), each stage's road a piece from its start to its end (`cisco-heat-screen-frames`): its
screen is its road CPU's rows as its program draws them (R1 0x19F0 to 0x2174), frame by frame every 64 positions of the
car. A row k + 1 up from the nearest (91 rows, their depths from R1 0x3234) takes the road's point at its depth ahead of
the car, in the road's vertical plane its run level and its height (R1 0x1FA0, by its records' arcs as `arcRoad` lays
them), less its point under the car (`$c0044`, `$c0040`, R1 0x1758); its height by the pitch's cosine less its run by
its sine (R1 0x2120: `$c0052` and `$c0050`, the pitch the road's angle under the car, R1 0x15EA), times the row's scale
over 16,384 (its table 0xB8 bytes on, R1 0x216A), is how many whole rows above that row it shows. Its level road is each
row where the road keeps its grade; its nearest row is its screen's last. The scales fall by 165.5 a row, a pinhole's of
99.0 rows, not its depths' of 92.70, so it draws a rise ahead about 7 % taller near the car than a pinhole would.

## Its road across

Each line of a road layer is a line of the road ROMs, BIG RUN's format (`jaleco/road-lines`). A plan record's picture
(+0x16, its kind) is picked as its road CPU picks it (`cisco-heat-road-picture`, R1 and R2 0x198C to 0x19A6): its
nearest line the word its line-kind table gives the kind (R1 0x2848, R2 0x284C), 294 more below kind 0x14, a picture of
291 lines; from 0x14 on, one line. Its stages take kinds 0 to 14 (lines 294 to 2,040) and 20 to 24 (lines 2,041 to
2,043). A line's runs are painted as BIG RUN's but for its surface (`ciscoHeatPaints`, `widestSurface`): the run at its
centre is a lane line, so its surface is the pen its runs cover most of it with between its two end runs, pen 6 in its
pictures of kinds 0 to 8 and 12 and pen 8 in kind 14's, striped with pen 14; BIG RUN's rule, the run at the centre, is
kept for BIG RUN, 346 of whose 2,048 lines another pen covers more. Its lanes are taken by [the lanes over two
roads](original-road-data.md#two-roads) from its most common picture, kind 2's nearest line (`ciscoHeatLanePicture`):
lane lines at 0 and ±142 units, edge lines at ±258 and its kerbs and verges out to ±408, so four lanes of 116, 142, 142
and 116 units, the ground beyond 408; kinds 0 to 8 draw the same lanes, kind 12's and 14's lines are patterned, and
kinds 20 to 24 are one line each, blank, all surface or clear.

## Its colours

A row's colours are an entry of its road layer's palette (`cisco-heat-road-colours`): road 1's layer's the first road
CPU's, road 2's the second's, alike but for their sky's fade.

- **A row's entry.** The word of its road CPU's stripes' table (R1 0x1018E, R2 0x10192; R1 and R2 0x19AC to 0x19DE) at
  its plan record's stripes' word (+0x1A) plus its position's phase, the position modulo 510 (R1 0x161E, R2 0x160E), to
  an even byte, plus its record's variant's low byte (+0x18): its bits 0 to 5 (`rowEntry`). Its records' stripes' words
  are 0, 20,000, 40,000 and 60,000, each a table of a stripe's 255 words; road 1's rows take entries 1 to 28, road 2's 1
  to 15 and 29 to 42, and the patterned road (kind 12) 43 to 55 and 63.
- **Its palettes.** Each layer's 64 entries of 16 pens (0xBB800, 0xBC800) are the main program's palette (M 0x2730: from
  M 0x1A27C to both) with its stage's colors at its start (M 0xEDCE, `stagePalettes`): the first address of its list (M
  0xDC7E, a long a stage), 14 entries of 14 pens, made into entries 1 to 14 as they are, 15 to 28 with pens 9 to 13
  their pen 6, and 29 to 42 with pens 2 to 5 and 7 their pen 6, pens 14 and 15 the palette's; STAGE 3 lays them as
  entries 43 to 56 and makes entries 1 to 42 from M 0x13EF94's. So both layers are alike but for the sky's entries.
- **Its sky's entries** 57 to 62 are its first set of 16 pens each (M 0xED9C, from M 0xDB2A's table, a long a stage);
  from its stage's position (M 0xEFF6, a long a stage: 310,000 in STAGE 1, 560,000 in the others) its fade (M 0xEF62)
  lays the eight sets after it over them 16 bytes a tick, 96 ticks, over layer 0, and in STAGE 5 over both (`skyFade`).

## Its camera

Each road CPU draws its road's 92 rows up from the nearest at depths from its table (R1 0x3232, R2 0x3236; the `lea` at
R1 0x2A66), each added to the car's position: the depth of the row k above the nearest is a pinhole's, behind × k ÷
(rows − k), every one within its rounding (`depthPinhole`): its nearest row 92.70 rows below the horizon, the eye 374.5
positions behind it. Its screen is read by a camera at this game's focal length where that pinhole lies, tilting with
the road (`cisco-heat-camera`, [Cameras](original-road-data.md#profile-from-the-originals-screen)): 6.07 m behind the
car and 2.51 m above the road, at 16.2 mm a position.

## Its skies

CISCO HEAT's sky is the board's: its two tile planes over its road layer's sky rows, each plane showing a scene of
pictures that changes along the road, read where its programs hold them (`cisco-heat-backgrounds`) as BIG RUN's are
([its skies](big-run-road-data.md#its-skies), `jaleco/ms1-skies`).

- **The ramp.** The second road CPU takes each row up from the horizon from its table of them (R2 0x1B80, the first's
  0x1B7C the same), as BIG RUN's: a pen two rows each, entry 57 to 62, then entry 62's pen 13 every row above.
- **The scenes.** Plane 0's from M 0xA600 (40 bytes a record, its size at 0xA62E), plane 1's from 0xA1A6 (38 bytes,
  0xA230), the planes' tile words at 0xA0000 and 0xA8000; a record whose columns are 0xFFFFFFFF clears its plane with
  tile 0 (M 0xA2E6), so it shows no picture. Their pictures are 32 to 96 columns (512 to 1,536 pixels); each plane is
  loaded with its scroll 8 (M 0xA246, 0xA644), so they face the sky as BIG RUN's do.
- **Their turn.** The program does not turn a plane with the road's heading: it slides each plane only through a curve
  and back on a straight (M 0xA454). Through a curve it moves a slide toward a limit of the car's speed by a rate of it
  (its table at M 0xA9B2, 8 bytes an index, the rate and then the limit, 16.16 pixels a frame; the index twice the
  speed's whole units, at most 220), its sign the curve's side (`$f0330`); on a straight it moves it back to 0 at the
  same rate. Each frame it scrolls the front plane by the slide's whole pixels and the back by half of them (M 0xA39C,
  0xA7B4). Its skies are baked as turning at one rate (K, 2026-11-12), the one at which its planes slide through its
  curves at its top speed: at its highest, 160 units a frame (the `move.l` at M 0x31B8, of four by gear and car) the
  index is 220's, the limit 15.86 pixels, reached in 7 frames, the front 15 one way and 16 the other and the back 7 and
  8, each taken at their mean, while the car turns 160 ÷ R radians a frame through a curve of R positions. So a plane
  turns its pixels a frame × R ÷ 160 a radian, R 7,000 positions (`TURN_RADIUS`, K, 2026-11-12), its roads' sharpest
  common curves', a twelfth of both roads' curves' length: 5.73 pixels a degree for the back (2,062 a turn) and 11.84
  for the front (4,261), each laid round from its seam ([Sky baking](original-road-data.md#sky-baking)). As this game
  turns its sky with the car's heading, the radius sets only how narrow its pictures are laid, not how fast its sky
  moves on the screen: at 7,000 the back plane's about 1.4 times narrower than the original draws them, as BIG RUN's
  1.9; at its longest curves', 40,000, they would be 7.8 times.
- **Their rows.** A plane's row offset is its scene's +8 plus the road's rows above its last line, which the road CPU
  gives (its shared word 0x500, M 0xA1EE), so a picture's bottom row lies as BIG RUN's do. Along a scene the program
  moves a plane up and down by its record's table of steps (+1A, 8 bytes a step: its start, its rows and its rate, M
  0xA3F8); a sky lays its scene's own offset.

## Its objects

Each stage's objects are its main program's records beside its roads (`cisco-heat-objects`), drawn as BIG RUN's by the
board's zoomed sprites ([its objects](big-run-road-data.md#its-objects), `jaleco/zoom-sprites`) from four pairs of
sprite ROMs (`ch9072.r15` to `.r20`, `.r25` and `.r26`, 4 MiB):

- **Their records.** A stage's list (M 0xDAF2: a pointer a stage; M 0xDDFE walks it, drawing those up to 20,000
  positions ahead) holds 16 bytes a record in the order of their positions: position (+0), descriptor (+4, its offset
  into the table at 0x40000), kind (+6's low byte, 0 a picture standing where it is put), lateral (+8), height (+A) and
  flags (+C): road 1 where bit 7 is set, its picture mirrored by bit 8, its height below its road by bit 10, its palette
  entry bits 0 to 6 and its scale bits 12 to 14.
- **Their pictures.** A descriptor (10 bytes) gives its sprite's size (+4: tiles across less 1 in bits 0 to 3, down in
  bits 4 to 7) and first tile (+6). A sprite is drawn at its distance's zoom (the table at M 0x122272, a word a
  position, its low byte, 128 a tile's own size) times its scale, which its flags pick of 1/2, 5/8, 3/4, 1, 5/4, 3/2,
  7/4 and 15/8 (M 0xE296, the table at 0xE358); the road's pixels a unit at that distance are the table at M 0x109C68's
  word over 32,768, so a sprite's pixel at its own size is 1.992 units at the nearest distance.
- **Their colors.** Each stage loads its sprites' palette from entry 48 on (M 0xED4A to 0xED8E: its list, the table at M
  0xD738's pointer a stage, a count less 1 and an entry's 16 words' offset into the table at M 0x1AB3C for each), 72 to
  79 entries, and its objects of kind 0 take no entry outside them; the entries below, the cars' and the screen's, are
  not read.
- **Their places.** Its sprite's x is its road's centre plus its lateral at the road's scale there, its left edge; its y
  is the road's row less its height at that scale (M 0xE5E6 to 0xE7B2: 0xE8 less their sum), from which the board draws
  CISCO HEAT's sprites up, as BIG RUN's down: its height is its picture's bottom edge over its road. Read so, the
  pictures of kind 0 stand on their roads, 83 to 96 % of them in each stage at 0, where read as BIG RUN's, from their
  top edges, they would sink 2 to 6 m. Its flags' bit 8 mirrors its picture and bit 9 draws its pen 0 as a shadow (M
  0xE2D4, 0xE882).
- **Their hits.** The program meets the car with an object at height 0 on the car's road between its descriptor's
  columns +0 and +2 at its drawn size, mirrored with its picture, unless its descriptor's +8 is 0 or its +0 is its +2
  (M 0xE8AE to 0xE964): 83 to 96 % of each stage's objects of kind 0. How it meets them is not read.
