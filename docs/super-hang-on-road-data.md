# SUPER HANG-ON road data

How SUPER HANG-ON's ROMs are read (its ROM set, programs, tables, dump and conversion). The rules every original is
raised by and the parts the originals share are [Original road data](original-road-data.md)'s.

SUPER HANG-ON's courses are raised from MAME's `shangon`, the export sitdown/upright set (unprotected): the cabinets'
courses differ, and K chose this one. Its ROM set, programs and tables are described here as
the road data tool reads them.

## SUPER HANG-ON's ROM set

Each CPU's program is two 128 KiB halves, each interleaved from a ROM of its even bytes and a ROM of its odd bytes, as
OUTRUN's are:

| CPU  | Addresses       | Even bytes      | Odd bytes       |
| ---- | --------------- | --------------- | --------------- |
| main | 0x00000–0x1FFFF | `epr-10886.133` | `epr-10884.118` |
| main | 0x20000–0x3FFFF | `epr-10887.132` | `epr-10885.117` |
| sub  | 0x00000–0x1FFFF | `epr-10792.76`  | `epr-10790.58`  |
| sub  | 0x20000–0x3FFFF | `epr-10793.75`  | `epr-10791.57`  |

The main CPU's 0x30000–0x3FFFF holds what its 0x10000–0x1FFFF holds; the tool checks that it does and reads the tables
at the latter. Each ROM is found by the [rules of the originals](original-road-data.md#rules-of-the-originals)
(`SUPER_HANG_ON_PROGRAM_ROMS`). K's set matches:

| ROM             | CRC-32     | ROM            | CRC-32     |
| --------------- | ---------- | -------------- | ---------- |
| `epr-10886.133` | `8be3cd36` | `epr-10792.76` | `16299d25` |
| `epr-10884.118` | `cb06150d` | `epr-10790.58` | `2246cbc1` |
| `epr-10887.132` | `8d248bb0` | `epr-10793.75` | `d9525427` |
| `epr-10885.117` | `70795f26` | `epr-10791.57` | `5faf4cbe` |

The sprites are eight 128 KiB ROMs in four pairs, each pair the high and the low bytes of 16-bit words, eight banks of
0x10000 words in all (`SUPER_HANG_ON_SPRITE_ROMS`): `mpr-10798.16` `7d58f807` over `mpr-10794.8` `7c958e63`,
`mpr-10799.14` `96d90d3d` over `mpr-10795.6` `d9d31f8c`, `mpr-10800.12` `feaff98e` over `mpr-10796.4` `fb48957c`,
`mpr-10801.10` `12781795` over `mpr-10797.2` `27f2870d`. The tiles are three 32 KiB ROMs, one bit plane each, the
lowest first: `epr-10652.54` `260286f9`, `epr-10651.55` `c609ee7b`, `epr-10650.56` `b236a403`
(`SUPER_HANG_ON_TILE_ROMS`). The road ROM is `epr-10642.47` `7836bcc3` (`SUPER_HANG_ON_ROAD_ROM`): 256 lines of 512
pixels, two bit planes of 64 bytes a line one after the other. Each is found as the programs are. The sound ROMs are
not read.

## SUPER HANG-ON's programs

Both CPUs are 68000s, as OUTRUN's are. Every amount below is read from its instruction after the instruction is
checked, but for three read where they lie: the road's advance, the long at 0x8848; the depth steps, the words at
0xC5EA, checked to be half the speed rounded down at every speed to the top with the turbo; the scenery counter's
start, the byte at 0x6AB4 + 0x2E.

- **Time and distance.** A tick is 1/60 s: the clock counts 60 ticks a second (`moveq #$3C, d1` at 0x544E). The road
  position is the long at 0x260030, 16.16, the position its upper word; each tick it advances by the long at 0x8848
  (0x97) times the speed, the word at 0x260078, over 65536. The display shows speed v as v × 0x117 / 0xF0 km/h
  (`mulu.w #$117` and `divu.w #$F0` at 0x15DA), so a position is 0x117 × 65536 / (0xF0 × 3.6 × 60 × 0x97) =
  2.335835 m. The top speed is 0xF1 without the turbo (`cmpi.w #$F1, ($260078).l` at 0x64BC).
- **Sections.** A section is 2049 positions: past position 0x800 (`cmpi.w #$800, ($260030).l` at 0x676E) the next
  section begins at 0. At position 1930 the next section's background and ground come in (`cmpi.w #$78A, d0` at
  0x6678); a CHECK gate comes out at section position 0, from the second section on, and at 1024 (`cmpi.w #$400, d0` at
  0x6DA4); past goal position 35 the race ends (`cmpi.w #$23, ($260030).l` at 0x6342).
- **Courses.** Course c of four: its name the seven characters at 0x586E + 9c, its sections the first of the words at
  0x8B4C + 18c, as many as its byte at 0x8870 + c, its stages its byte at 0x8874 + c less one. Each of the 24 sections
  runs in one course:

  | Course  | Sections, in running order                           | Stages |
  | ------- | ---------------------------------------------------- | ------ |
  | AFRICA  | 0x0A, 0x01, 0x02                                     | 6      |
  | ASIA    | 0x13, 0x14, 0x15, 0x16, 0x17                         | 10     |
  | AMERICA | 0x11, 0x00, 0x09, 0x12, 0x10, 0x0B, 0x06             | 14     |
  | EUROPE  | 0x03, 0x0D, 0x0C, 0x0E, 0x0F, 0x08, 0x07, 0x05, 0x04 | 18     |

- **A section's block.** Section n's block is the long at 0x8AEC + 4n: nine longs, the addresses of its sky (32 palette
  words), its road's four color pairs (+4 to +10, which follow the sky's words in the ROM: the program copies all 40 to
  the palette at once), its ground's pair (+14), its curves (+18), heights (+1C) and scenery (+20). A pair is two
  [palette words](original-road-data.md#palette-words), half 0 then half 1. The road hardware draws a pixel of value p
  in the pair at `0x7F6 ^ 2p`: the surface (pixel 0) is +10, the lines (1) +C, the edge bands (2) +8, and the centre
  line (a 3 among the middle eight columns) +4, the other way round from OUTRUN's names; the other 3s are the ground.
- **Curves.** {signed word position, word radius in positions, word kind: 1 straight, 2 right, 3 left}, ending at
  position −1. They follow the road path only roughly ([SUPER HANG-ON's plan](#super-hang-ons-plan)).
- **Heights.** {word position, word height table (1 from), word 0, word 0}, ending at position 0x7FFF. Height table t is
  the long at 0x1A48 + 4(t − 1) on the sub CPU: vertical heading vectors {signed word x, signed word y}, (0, 4096)
  level, ending at (0, 0): the hills ([SUPER HANG-ON's profile](#super-hang-ons-profile)).
- **Scenery points.** {word position, u8 count, u8 type}, ending at a negative position
  ([Placing SUPER HANG-ON's scenery](#placing-super-hang-ons-scenery)).
- **Road paths.** Section n's is the long at 0x19E8 + 4n on the sub CPU: a heading vector {signed word x, signed word y},
  about 4096 long, for each of its 2049 positions. Every section's starts and ends with (0, 4096).
- **The goal.** The last section runs into the goal: the longs at 0x1801A are its curves' and heights' addresses, then
  course c's scenery's at 0x18022 + 4c; its road path is the one the sub CPU's `move.l #path, ($604F0).l` at 0x11B2
  loads, straight ahead (0, 4096) from its first entry to the first that is not: 200 positions.
- **Stripes.** 32 tables at 0xEA6A, one a phase, of a word for each of the road's 192 lines, which the program copies to
  the road's line colors. The phase is the low five bits of the word at 0x260090, which gains v / 34 a tick (`moveq
#$22, d2` at 0x6594). Bits 0, 1, 3 and 8 (surface, lines, centre line, ground) choose half 1 and switch together; bit
  2 (the edge bands) switches twice as often.
- **A section's change.** At position 1930 (M 0x66E6) the original clears its background and begins to draw the next
  section's, one of eight parts a tick; each next tick M 0x697E mixes the sky's word 0 and the ground's pair by a factor
  gaining `addi.w #$80, $261028` (M 0x69BC) until its high byte passes `cmpi.b #$1F` (M 0x69C4) after 64 ticks, and the
  frame interrupt (the level 4 vector, M 0x12C4) then writes all 40 next words (M 0x18B6 from M 0x134C). The mixing runs
  in the section's task (M 0x6664, the task table at 0x51A8), once a main loop's pass, which waits for the frame
  interrupt (M 0x149C): a tick a frame, 1/60 s. So a change takes 1 + 64 ticks, 36.09 positions at the top speed 0xF1,
  84.31 m (`stageChangeTicks`).

## SUPER HANG-ON's sprites

A sprite is drawn from the sprite ROMs' words, in banks of 0x10000 words:

- **Sizes.** Sprite i's size list is the long at 0x11A6A + 4i (90 sprites, before the hit widths): five sizes, the
  largest first, each half the one before, of 10 bytes {word height, word words a row, word (height − 1) × words a row,
  word bank (its low four bits), word first word in the bank}.
- **Pixels.** Each word holds four 4-bit pixels, the most significant first; every row is its words a row long and its
  last pixel is 15, its end, so a size is 4 × words a row − 1 pixels wide. 0 and 15 are transparent. Drawn mirrored, a
  row is read from its end.
- **Palettes.** Palette p is the 16 palette words at 0xD7F0 + 32p, slot 0 transparent.
- **Hit widths.** Sprite i's is the word at 0x11BD2 + 2i: pixels either side of the object at the bike's line where the
  bike hits it.
- **Scenery types.** Type t is the long at 0x13F04 + 4t: {word pattern}, then 6-byte items {u8 flags (bit 0 mirrors),
  u8 0, signed word x (units from the road's centre, right positive), u8 sprite, u8 palette}, ending at a flags byte
  whose bit 7 is set.
- **Gates.** A gate is six parts, objects 27 to 32, from templates of 0x30 bytes at 0x7274: {u8 flags (bit 0 mirrors) …
  +0x16 u8 palette … +0x1A long size list … +0x26 word depth, +0x28 signed word x, +0x2C signed word lift}, the left and
  right legs, the signal, the left and right corners and the banner. Its parts are drawn at x × line / 191 + 0x160
  (`divs.w #$BF` at 0x74F2) and lift × line / 192 (`divu.w #$C0` at 0x7448) pixels on a road line, an object's x at x ×
  line / 224 (`divs.w #$E0` at 0x7262): a part's x is a pixel on the bike's line, 191, where an object's largest size is
  drawn 1:1, a pixel 224/191 units (`drawScales`). The START banner's palette is its template's (0x2E); the CHECK and
  GOAL banners' are set as the gate comes out (`move.b #$2F, ($16, a0, d0.w)` at 0x6E40, `#$30` at 0x6DFC).
- **Grids.** The rivals' places at GO on course c: seven {word depth, signed word x} at 0x86C0 + 28c.

## SUPER HANG-ON's backgrounds

Course c's section k (0 from) shows background number the byte at 0x9EB4 + 9c + k. Background b's palettes: the long
at 0x1E06 + 4b addresses {word count − 1, then byte pairs {palette, source}}, palette taking the 8 words at
0x21F2 + 16 × source. Its tile map, 256 columns (four pages of 64) of 32 rows, is drawn in eight steps, the longs at
0x9ED8 + 4(base + 8k + s), base course c's byte at 0x9EA0; a step is {word parts − 1, then parts {word column, word row,
long content}}, a content {word width − 1, word height − 1, then its tile words row by row}, columns wrapping at 256.

Its sky is baked ([Sky baking](original-road-data.md#sky-baking), `sectionBands`) from two bands of the map, its columns
in screen order:

- **Tiles.** The tile ROMs `epr-10652.54`, `epr-10651.55` and `epr-10650.56` are three bit planes, the lowest first, 8
  bytes a tile, a byte a row, bit 7 the leftmost pixel. A tile word's tile is its bits 0–11 and its palette its bits
  5–11; a pixel 0 is transparent, any other the palette's word (its 8 words those the background loads).
- **Bands.** The front layer is the map's rows 0–3, all 256 columns (2048 × 32 pixels), the back its rows 20–31,
  columns 64–255 (1536 × 96); the other rows are not shown. Both bands' bottom row is the road's first, the first
  below the horizon, so the front reaches 31 rows above it and the back 95.
- **Scroll.** At the road's heading h (the sub program's, 0x800 a turn, 0 straight on) the front layer scrolls
  F = (8 − h) & 0x7FF (`addi.w #-8, d0`, `neg.w d0` and `andi.w #$7FF, d0` at 0x9DD6) and the back ⌊3F / 4⌋
  (`move.w d0, d1`, `add.w d1, d1`, `add.w d0, d1` and `asr.w #2, d1` at 0x9DE0), the hardware showing each layer's
  pixel 1888 − its scroll at the screen's middle ([Sky baking](original-road-data.md#sky-baking)). At heading 0 the
  middle shows the front's pixel 1880 and the back band's 1370 (the map's 1882, the band from its pixel 512); the
  front's pixel f lies over the back's 0.75f − 40 (1888 / 4 − 512), `backgroundScroll`.
- **Ramp.** The section's 32 sky words, word 31 the two rows just above the horizon, word 30 the next two, up to word 0,
  which also fills every row above; word 31 below the horizon.

## SUPER HANG-ON's dump

`npm run road-data -- super-hang-on-read` ([Development](development.md#road-data-commands)) checks and reads the ROM
zip and writes `superoutride.super-hang-on-road-data` version 1, `super-hang-on.json` in its dump directory: the ROMs'
names and CRCs; the sections' positions; the courses; every section (number, block, sky, colors as words and RGB555,
curves, heights, scenery, road path); the goal; the height tables and scenery types the points name; the stripes; the
sprites the scenery shows (size list, sizes, hit width); the gates' parts with their sizes and the banners' palettes;
the palettes these use; the grids; and each section's background (number, palettes, tile map). It refuses a section
that runs in more than one course and a sprite past the table.

## SUPER HANG-ON's plan

The road is the road path P itself: one road, no width points. A course's heading table is its sections' road paths'
headings (each its vector's direction) in running order, section k's position p at 2049k + p, then the goal's, straight
ahead, the original's 200 positions (375.3 m past the finish). It becomes P by the [plan from a heading
table](original-road-data.md#plan-from-a-heading-table), no turn tighter than its lanes keep (a lane either side, 8.31
m); none is. The curves are only recorded in the dump: they follow the path roughly (radii 0.79 to 1.56 times the
path's, their joints up to 13 positions off), so nothing is checked against them.

AFRICA, ASIA, AMERICA and EUROPE become 142, 151, 317 and 466 runs and 273, 292, 614 and 904 elements; the sharpest arc
is 23.8 m, a turn in AMERICA's seventh section. Every course's plan holds its table's headings within the resolution at
every position; laid from its start, it lies at most 0.07, 0.09, 0.12 and 0.10 m from its table's line, each position a
step along its ends' mean heading.

A course's P is a 6 m straight before GO, the camera's distance behind the bike, then its table's plan.

## SUPER HANG-ON's profile

A course's rise table is its height tables' grades along it, section k's position p at 2049k + p, then the goal's,
level; it becomes the profile by the [profile from a rise table](original-road-data.md#profile-from-a-rise-table), the
6 m before GO level.

- **Tables along the road.** A height point starts its table where the road reaches it (the main CPU passes the
  table's number to the sub CPU when its position passes the point's, 0x657E), its vectors one a position (the sub CPU
  advances it by the road's advance, the long at 0x260074), the table running on into the next section. The sub CPU
  takes a table only when it has none: one runs until its projection, 33 steps of two vectors ahead (`moveq #$20, d6`
  at 0x16BA), meets its end, 64 positions before it, and a point the road reaches meanwhile is passed by. Five are, each
  reached while a longer table runs: AFRICA's third section's at 1000 (table 2), ASIA's second's at 1400 (14) and
  third's at 900 (12), AMERICA's fourth's at 900 (17) and EUROPE's sixth's at 1000 (7).
- **Grades.** A vector (x up, y along) is a direction of the road: a position along it rises by its sine, x / √(x² +
  y²), as the stripes and objects stand at positions. The sub CPU sums a table's vectors two a step ahead of the camera,
  turns each sum (X up, Y along) by the camera's pitch at 2^14 (`moveq #$E, d1` at 0x1682) and raises the step's lines
  by it over its depth, shifted down 4 bits into a line's height (0x14AC) and 4 again to a scanline (0x154C): a pinhole
  of focal length 2^(14 − 4 − 4) = 64 scanlines (`hillsFocalLength`), 6 positions behind, on a screen of 224, so a lens
  ratio of 64/224. By the [grades' rule](original-road-data.md#profile-from-the-originals-screen) the grade is f ×
  sine, one factor for the four courses, f = min(64/224, 0.25 ÷ the steepest sine the courses' tables reach), 0.932069
  (table 2's (−3818, 1484)): f = 0.268221, 0.939 of the lens ratio. It depends on the positions and 4096 alone, not
  on the lateral scale. K's researcher measured both ways on this game's screen: the sine fits best at 0.277 to 0.287
  times (1.13 to 1.27 rows), f within 0.04 to 0.08 rows of it.
- **Resolution.** The vectors' heading resolution times f, 1.5 / 4096 × f ([plan from a heading
  table](original-road-data.md#plan-from-a-heading-table)); the profile's grade lies within it of the table's at every
  position.

AFRICA, ASIA, AMERICA and EUROPE become 256, 631, 801 and 980 runs, their heights with the overpasses' ramps from −48.2
to +126.6 m, −89.3 to +195.3 m, −20.5 to +419.1 m and −94.0 to +506.9 m, the steepest grade 25 % (ASIA's 26.2 %, a
overpass's ramp on a hill). At the top speed with the turbo (0x117, `cmpi.w #$117` at 0x64A2, shown as 0x117 × 0x117 /
0xF0 = 324.34 km/h) the bike leaves the road on 16, 37, 49 and 63 crests, the longest 228.9 m of road.

## Placing SUPER HANG-ON's scenery

A course's scenery stands where the main CPU's program brings it out and it passes the bike, the program run tick by
tick from the course's start in the limit of a speed falling to 0 ([Time made into
position](original-road-data.md#time-made-into-position)), its objects in their order (`courseScenery`):

- **Object 7.** Past the section's last position, the next section begins at 0 with its points.
- **Object 8.** The road advances 0x97 × speed / 65536 positions, at the top speed (0xF1) 0.555: below a position a
  tick, so the cursor steps every position at any speed.
- **Object 11.** A scenery point is taken when the position reaches it: a cursor at it, its count, its type's pattern
  and first item. While its count lasts and the cursor is at most the position, a step: the cursor moves on a position,
  the pattern turns left once and a counter from 15 counts down, a count spent each time it passes 0; a 1 turned out
  brings out the next item (after the last, the first) into the first free of the eight scenery objects, none if all
  are taken.
- **Objects 12 to 19.** Each object's depth gains the step its speed gives (the word at 0xC5EA + 2 × speed, half the
  speed rounded down), and at 0x1FF0 (`cmpi.w #$1FF, d0` at 0x71A0 on the depth's top 12 bits) it passes the bike and
  stands at the road's position: in the limit through the even speeds ([Time made into
  position](original-road-data.md#time-made-into-position)), half a depth unit for each 0x97 / 65536 positions,
  0x1FF0 × 0x97 / 32768 positions (37.68) after it comes out.

Objects still coming when the last section ends stand in the goal's positions; none does. AFRICA brings out 1018
objects (160 found no free object), ASIA 1619 (346), AMERICA 2253 (329) and EUROPE 2908 (347).

## SUPER HANG-ON's courses

`npm run road-data -- super-hang-on-course` ([Development](development.md#road-data-commands)) writes the four LINEAR
courses, `super-hang-on-africa` (AFRICA), `super-hang-on-asia` (ASIA), `super-hang-on-america` (AMERICA) and
`super-hang-on-europe` (EUROPE), at its conversion version (`SUPER_HANG_ON_CONVERSION_VERSION`), the pictures their
objects show and their skies, or with `--check` fails where one differs; it reports the metres a position and a unit
(`metresAPosition`, `metresAUnit`) and each course's Sections, length, objects, runs, elements, its plan's distance from
its table's line (`fromPath`) and overpasses:

- **Stations.** A course position (section k's position p is 2049k + p, the goal's after the last section's) is its
  station along P. GO, the bike at the first section's position 0, is station 6.
- **Lanes.** a and b, 4.3 m each (`LANE`), either side of P; the centre lane a, its centre half a lane left of P
  (`centerLateral` −2.15). The lane is K's: at 4.3 m the
  original's upright rear frame of the bike stands about as tall as VFR750R's upright rear picture. It is the one
  measure of SUPER HANG-ON's sizes across and up. The camera stays the same for every vehicle (changing it per series
  would mean baking the vehicles' pictures again); the original's camera, higher and nearer, still shows the road and
  objects at the bike 1/0.847 times as large as this game does.
- **Cross-section.** The road ROM draws one road at a size proportional to its line, a feature's edge u units from the
  centre at u × line / 224 pixels (as an object's x, the `divs.w #$E0` at 0x7262): each edge's u is 224 times its
  pixels' slope against the line over every line on which each edge is drawn on both sides (17, 18 and 20 to 189), the
  left's and right's mean, the centre the middle of column 252, the centre line's. The centre line is ±4.58 units, the
  lines 238.13 to 249.79, the shoulder the surface's, the edge bands 259.20 to 293.80. A lane is the road's half to its
  lines' inner edges, 238.13 units, 4.3 m, so a unit is 0.0180571 m: the road, objects' x, pictures, bodies, gates, the
  crowd and the figures, and the grids' spacing across are all in it. SAND reaches the bike's [lateral
  limit](original-road-data.md#the-ground-beside-the-road), 500 units (9.029 m) from P, 4.729 m beyond the lanes. The
  road is `ASPHALT` and the ground `SAND`, K's decision (2026-10-25), for the ROMs hold no material.
- **Colors and stripes.** Over each section's stretch its ground, then its surface over the asphalt (to the edge bands'
  outer edges), then its lines, edge bands and centre line over that, each pair's half 0 over the first half of each
  period and half 1 over the second: 32 × 34 × 0x97 / 65536 positions (5.8556 m), the edge bands' half of it, counted
  from GO along P. Each section's colors run from where its sky comes in (position 1930 of the section before; the
  first's from the course's start) to where the next's does, over the change's 84.31 m each color a pair from the
  section before's where they differ ([A section's change](#super-hang-ons-programs)).
- **Sections.** One a section, from its position 0 to the next's (the first from the course's start), and one the
  goal's, each cut again where its road comes near itself ([the Sections' cuts](original-road-data.md#sections-cuts)). They join by lane a.
- **Objects.** Each scenery item stands at its station, its x units right of P, showing its sprite's picture as the
  original shows it (mirrored or not, in its palette), with a body its hit width wide (pixels at the bike's line,
  224/191 units each, either side) or its colored pixels' width (pixel 10, the shadow, aside; `coloredColumns`) where
  narrower. A picture is its sprite's largest size on its
  texel grid by [chosen lines](original-road-data.md#chosen-lines), a pixel 224/191 units across and 224/191 × the pixel
  aspect down, by [the sprites' rules](original-road-data.md#pictures-from-the-extract) (every sprite drawn with
  shadows allowed, but where it floats: the gate's 075, 2.53 m up), its base point the middle of its base, in every palette it is shown in. K's table keeps pen 10 a
  color in the crowds 000, 002, 004, 008 and 009 (their shadows painted in pen 10 at their feet), in the goal's
  pictures 0x13734, 0x13810, 0x1393C, 0x13E5A and 0x13EB4 (their shadows painted at their feet in pens 10, 7, 1, 1
  and 1) and in 0x1395A; the pictures are published, provisionally.
- **Gates.** START, all six parts, its signal lit as at GO, stands where it passes the bike, 1.70 positions past GO;
  each CHECK, five parts, where it passes the bike, 37.68 positions after it comes out (as the objects above); GOAL,
  five parts, at goal position 37.68. A part stands x × 224/191 units right of P, its
  picture lifted lift × 224/192 units. The checkpoints `<course>-CP<n>` are at the CHECK gates and the finish
  `<course>-GOAL` at GOAL.
- **Grids.** By [the grid's rule](original-road-data.md#the-grid), on lanes a and b: the player's at GO on P, where
  the original's bike stands (a game's start clears its x, 0x85B0); the bike grid's next the original's seven rivals
  (`readGrid`), each where the scenery the original draws on its line stands (K, 2026-10-25; `rivalAhead`): its depth
  reads its line in 0xCE40 (0x7990), the scenery's depth on that line is the middle between the last of 0xD240's depths
  drawn above it and the first below, and stands as far ahead as a gate part at that depth. AFRICA and ASIA keep them;
  on AMERICA and EUROPE bodies would overlap (the rival straight ahead, x −6, 2.07 m and 1.72 m ahead of the player's,
  within a bike's length, and on AMERICA two pairs 0.18 m apart across, 1.73 m along), so their bike grids are the
  general form alone.
- **The goal's crowd and the ending.** The ending's figures, as its last frame shows them (their frames, palettes, x
  and height above the road: K's reading of the original's run), and the goal's scenery points' items stand where their
  depths on the ending's last tick put them, as far beyond the bike as any object at that depth (`ahead`; K,
  2026-10-28; `endingPlaces`). Time made position as the scenery's: the race ends on the first tick from goal position
  36 (above 0x23), its advance going to 0, and the speed is cleared (`clr.l ($260078).l` at 0x804A). The ending's
  depth, 0x1ED0 from the goal (`move.w #$1ED0, ($2600EA).l` at 0x67B6), falls 0x40 a tick (`subi.w #$40` at 0xB736)
  until below 0xFA0 (`cmpi.w #$FA0` at 0xB634), to 0xF90; then the speed is 0x53 (`move.w #$53, ($260078).l` at
  0xB7AC), the crowd's depth is the ending's less 0x60 (`subi.w #$60, d2` at 0xB7CC), and each tick the depth gains
  the speed's step, 41, until it reaches 0x1FF0 (`cmpi.w #$1FF0, ($26, a5)` at 0xB82A): 103 ticks, each 0x97 × 0x53 /
  65536 positions, the bike at goal position 55.6976. There the ending's depth is 0x200F and the crowd's 0x1FAF: the
  figures stand at 55.5547, 0.1429 behind the bike, and the crowd at 55.9971, 0.2995 beyond it.
- **Skies.** Section k's (0 from) is `shangon-<course>-<k + 1>-sky`, its background baked ([SUPER HANG-ON's
  backgrounds](#super-hang-ons-backgrounds)): from its first Section's start, the next section's from position 1930,
  where the original redraws the background, over the change's 84.31 m ([Sky baking](original-road-data.md#sky-baking)):
  there (M 0x6678) M 0x66F2 to 0x6716 clears both bands of its four pages at once and M 0x673C → 0x9CF4 draws its eight
  parts, one a tick, as its set-up draws all eight at once (M 0x9E0E, from M 0x10E2 and 0x120C); the goal's Section
  shows the last section's. At heading 0 the original's back band's pixel 1370 of 1536 is at the screen's middle, here
  1370 × 1504 / 1536 of the sky's 1504: a Section's yaw origin is 77.0° plus the road's turn from the course's start to
  its start.
- **Profile.** The [hills](#super-hang-ons-profile) with the overpasses' ramps
  ([Profile](original-road-data.md#profile)), its bends broken at the Sections' cuts.

## SUPER HANG-ON's constants

SUPER HANG-ON's own constants and fixed rules, which its ROMs do not hold, are these (`super-hang-on-constants`); what
the ROMs hold is read where it is used, and the constants the originals share are [Original road
data](original-road-data.md#shared-constants)'s.

| Constant      | Value                                                       | Why                                                      |
| ------------- | ----------------------------------------------------------- | -------------------------------------------------------- |
| `LANE`        | 4.3 m                                                       | K's scale ([Lanes](#super-hang-ons-courses))             |
| `ROAD_CENTRE` | the road ROM's column 252.5                                 | the middle of column 252, where the centre line's 3s lie |
| `GATE_PARTS`  | START all six parts, CHECK and GOAL all but the signal      | as the original brings its gates out                     |
|               | the signal's palette its template's + 3                     | START's signal lit as at GO                              |
| `ENDING`      | the ending's figures by course: frames, palettes, x, height | K's reading of the original's last frame of its ending   |
