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

## Its road across

Each line of a road layer is a line of the road ROMs, BIG RUN's format (`jaleco/road-lines`). A plan record's picture
(+0x16, its kind) is picked as its road CPU picks it (`cisco-heat-road-picture`, R1 and R2 0x198C to 0x19A6): its
nearest line the word its line-kind table gives the kind (R1 0x2848, R2 0x284C), 294 more below kind 0x14, a picture of
291 lines; from 0x14 on, one line. Its stages take kinds 0 to 14 (lines 294 to 2,040) and 20 to 24 (lines 2,041 to
2,043). The run at a line's centre is a lane line (pen 8, as at ±142 units), its surface pen 6 about it.

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
