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
  turns its pixels a frame × R ÷ 160 a radian, R the radius its roads turn through longest (`TURN_RADIUS`, 40,000
  positions, a fifth of both roads' curves' length): 32.72 pixels a degree for the back (11,781 a turn) and 67.63 for
  the front (24,347), each laid round from its seam ([Sky baking](original-road-data.md#sky-baking)).
- **Their rows.** A plane's row offset is its scene's +8 plus the road's rows above its last line, which the road CPU
  gives (its shared word 0x500, M 0xA1EE), so a picture's bottom row lies as BIG RUN's do. Along a scene the program
  moves a plane up and down by its record's table of steps (+1A, 8 bytes a step: its start, its rows and its rate, M
  0xA3F8); a sky lays its scene's own offset.
