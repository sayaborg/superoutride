# ENDURO RACER road data

How ENDURO RACER's ROMs are read (its ROM set, programs, tables, dump and conversion). The rules every original is
raised by and the parts the originals share are [Original road data](original-road-data.md)'s.

ENDURO RACER's course is raised from MAME's `enduror` (Enduro Racer, Rev A, YM2151, FD1089B 317-0013A), whose graphics
and sub CPU are read as they are. Its main CPU's program is encrypted for instructions and data alike, so its tables are
read from the decrypted program of MAME's `endurobl` (bootleg set 1, the YM2203 set `enduror1` decrypted), whose tables
are Rev A's; the program is never decrypted here. Its ROM set, programs and tables are described here as
the road data tool reads them.

## ENDURO RACER's ROM set

The main CPU's program comes from `endurobl`, whose ROMs hold the YM2203 set `enduror1`'s program decrypted. Its first
64 KiB is interleaved from two 64 KiB ROMs whose first halves hold the instructions and second halves the data (the
tables); the rest from pairs of 32 KiB ROMs that hold both. The tool assembles a data image and an instructions image:

| CPU  | Addresses       | Even bytes                               | Odd bytes                                |
| ---- | --------------- | ---------------------------------------- | ---------------------------------------- |
| main | 0x00000–0x0FFFF | `7.13j` `f1d6b4b7`, data its second half | `4.13h` `43bff873`, data its second half |
| main | 0x10000–0x1FFFF | `8.14j` `2153154a`                       | `5.14h` `0a97992c`                       |
| main | 0x20000–0x2FFFF | `9.15j` `db3bff1c`                       | `6.15h` `54b1885a`                       |
| sub  | 0x00000–0x0FFFF | `epr-7634a.ic54` `aec83731`              | `epr-7635a.ic67` `b2fce96f`              |

The sub CPU's program is Rev A's, from `enduror`. As the [research notes](research/enduro-racer.md) say (the sets were
decrypted to find it; the tool cannot check it): `endurobl`'s data are `enduror1`'s but for the bootleg's credit, the
ROM test and the check words; 0x10000–0x2FFFF is the same in every set; Rev A's 0x00000–0x0FFFF holds the same tables
0x1A bytes lower, so the course is Rev A's. The YM2203 set's sub CPU program (`epr-7634.ic54`, `epr-7635.ic67`) differs
from Rev A's only at 0x0073–0x110B.

The graphics are `enduror`'s: the road ROM `epr-7633.ic1` `6f146210` (256 lines of 512 pixels, two bit planes of 64
bytes a line, the second 0x4000 after the first), the tiles `epr-7644.ic31` `e7a4ff90`, `epr-7645.ic46` `4caa0095`
and `epr-7646.ic60` `7e432683` (three bit planes, the lowest first), and the sprites, 32 ROMs of 32 KiB in eight banks
of 0x8000 32-bit words, each bank four ROMs, one byte of each word, the least significant first
(`ENDURO_RACER_SPRITE_ROMS`): bank 0 `epr-7678.ic36`, `epr-7670.ic28`, `epr-7662.ic18`, `epr-7654.ic8`, and bank k
the ROMs one lower in each column, to bank 7 `epr-7671.ic29`, `epr-7663.ic21`, `epr-7655.ic11`, `epr-7647.ic1`.

The tool opens both zips (`enduror.zip` and `endurobl.zip` in `reference-media/enduro-racer/rom/`) as one set and finds
each ROM it reads by the [rules of the originals](original-road-data.md#rules-of-the-originals) (K's names differ a
little from MAME's). It reads no key (`317-0013a.key`), no Rev A main CPU ROM (encrypted) and no sound ROM, and never
decrypts.

## ENDURO RACER's programs

Both CPUs are 68000s. The main CPU's shared RAM 0x124000–0x127FFF is the sub CPU's 0x07C000–0x07FFFF. Before it reads
a table, the tool checks on the instructions' image the instructions that name it (`MAIN_INSTRUCTIONS`): the position's
step, the bike's place, and the `lea` of each main CPU table below but the start templates' (0xCA78) and stage 3's
background's word (0xDEB8); the sub CPU's paths' list (0x592) and stripes (0xD4E) are read unchecked.

- **Time and distance.** A tick is 1/60 s. The road position is the long at 0x126188, 16.16; each tick it gains the
  speed, the word at 0x12618C, × 256 (`asl.w #8, d0` at 0x608C, `add.l d0, $188(a6)` at 0x608E). The display shows
  the speed as it is in km/h, so a position is 65536 / (256 × 3.6 × 60) = 1.185185 m. The bike stands 0.75 positions
  ahead of the road position (`move.l #$C0, d5` at 0x60EE on the 24.8 position).
- **Stages.** Five stages of 2048 positions run on without a stop: the road position runs from 0 to 10239. Stage s
  ends when the bike passes the word at 0x53AC + 2s × 256 (8, 0x10, 0x18, 0x20, 0x28: 2048(s + 1)); the read
  (`enduro-racer-read`) checks each, and the course's conversion takes the stages as 2048 positions each.
- **Road paths.** Stage s (0 from) runs the sub CPU's path that the long s of the eight at 0x592 names: 0x9800, 0x1800,
  0x3800, 0x5800, 0x7800. A path is 2048 heading vectors {signed word x, signed word y}, x right and y ahead, each
  about 4096 long; every path begins and ends with (0, 4096), and the five turn 0°, 360° left, 360° right, 360° left
  and 360° right in all. Twelve to twenty vectors a path are 0.02–1.98 times as long, at the joints of straights and
  arcs; only the headings are used.
- **Road colors.** Stage s's road takes palette 0x38–0x3F, the 8 [palette words](original-road-data.md#palette-words) at
  0xD948 + 16s (stage 5's at 0xD948 + 0x60): surface, edge's narrow bands and edge's middle band, each band A then B.
  The ground is background colors 0x7D0–0x7D7, the 8 words at 0xD918 + 8s: 0x7D3 left of the road's fold and 0x7D1 right
  of it, 0x7D2 and 0x7D0 on the row where the stripes change. Only stage 5's sides differ.
- **Stripes.** The road's bands A and B change every 2 positions; the border's shape on the road's rows is the sub
  CPU's pattern at 0xD4E + (the position's long & 0x1F0), 32 steps of 128 rows' bits.
- **Water crossings.** {long start, long end (position << 8), word frame} at 0xD83C, ending at 0x7FFFFFFF: three, all
  frame 0, at 5236–5286, 5456–5526 and 5596–5656, where the road's surface and edges give way to the ground.
- **Stage 3's background** comes in at position 4068, the word at 0xDEB8 of the hills' section table, which the tool
  checks.

## ENDURO RACER's sprites

Space Harrier's sprite hardware draws them (`SPACE_HARRIER_SPRITES` in `sprite-pixels`):

- **Size sets.** A type's long names a set of five sizes, unscaled first, each about half the one before, of 10 bytes
  {word height, word words a row, word (height − 1) × words a row, word 0x80 | bank, word first word in the bank}; the
  tool checks the third and fourth words.
- **Pixels.** Each word holds eight 4-bit pixels, the most significant first; a row is up to its words a row long and
  ends with the word whose last pixel (bits 0–3) is 15. 0 and 15 are transparent; drawn mirrored, a row is read from
  its end. Pixel 10 is a shadow: scenery is drawn with shadows allowed, and pixel 10 darkens what lies behind it.
- **Drawn rows.** The program puts a size's bottom edge height − 1 rows below its top, so the hardware draws its rows
  0 to height − 2; the last row never shows (`drawnSize`). Three sets have colored pixels there: 0x103CA (4), 0x1064A
  (3) and 0x1189C (95).
- **Placement.** A scenery object stands by its placement's bits 2–3: 4 its bottom edge at the object's y, 8 its top,
  0 its middle, the other way round from OUTRUN's.
- **Palettes.** Palette p is the 16 palette words at 0x9F08 + 32p.

## ENDURO RACER's scenery

- **Scenery table.** 0xAEA0: a word, its items' bytes (0x1802), then 1529 items {word road position, signed byte x,
  byte type}, an item whose type's bit 7 is set followed by two bytes {placement, height of its bottom above the road
  in unscaled pixels}. x is x × 8 lateral units right of the road's centre. The table runs in position order but for
  16 steps back of up to 10 positions; its order is the order objects come out in. 366, 317, 173, 400 and 252 items
  stand in the five stages and 21 past the goal.
- **Types.** Type t's record is at 0xC6A4 + 6(t − 0x10): {long size set, byte palette, byte flags: 0x80 used, 0x08
  hit, 0x01 mirrored, 0x02 flipped}. The scenery uses 57 types.
- **Scaled x.** A scaled item of type 0x48–0x4E takes its x from the words at 0xCC88: −167, 21, 189, 163, −162, 208,
  −208 units.
- **Jumps.** 0xC8AE: a word, the count of halves the program stops at (216, two a jump), then jumps {word position,
  signed byte left, signed byte right (× 2 units, each half's bottom middle), byte kind, byte spare} up to the first
  whose position is 0xFFFF: 69. Kind k's record is at 0xCA60 + 3k: {long size set, byte palette, byte margin}. The left
  half is drawn as it is and the right half mirrored; the margin (120 for every kind) widens the halves' window where
  the bike jumps (0x701E), and the course's mound is the whole road's, so it is not used.
- **Mound.** The bike's ground over a jump (0x71D8): `$2a`, the bike's distance past the jump's position in 1/256
  positions (0x703A), plus 0x1C2 (0x71E2) gives the rise from 1.758 positions before the position, and the fall as far
  after.
- **Start.** Five templates of 38 bytes at 0xCA78 come out at the start: {byte flags, byte placement, …, word 0x12
  position (8.8), word 0x14 x (units), …, long 0x1A size set, byte 0x1E palette, …, byte 0x25 height}: the gate's posts
  (flags 0x88), banners and START board at position 1.5.

## ENDURO RACER's backgrounds

- **Layers.** Stage s's front layer is the long at 0xD668 + 4s, its back layer the long at 0xD67C + 4s, each naming
  {long columns' table, word rows}; the table holds 32 (front) or 24 (back) {long A, long B} columns, A a column's tile
  words: 8 tiles across, row after row from the top. The layer's picture is its columns in the order of their address,
  so the front is 2048 pixels around and the back 1536; the tool checks that the columns follow one another.
- **Tiles.** Hang-On's: three bit planes, 8 bytes a tile, a byte a row, bit 7 the leftmost pixel. A tile word's tile
  is its bits 0–11, its palette its bits 5–11, its bit 12 its priority; a pixel 0 is transparent.
- **Tile palettes** stay as they are from the start: palettes 0–5 the 8 words each from 0xAAC8, palettes 8–127 the 8
  words at 0xABA0 + 16 × the byte at 0xAB28 + palette − 8.
- **Vertical offsets.** Both layers' bottom row is just below the horizon; the back layer's is moved by the word at
  0xD0F2 + 2s (0, 0, 0, 0, −4).
- **Sky.** The 48 bits at 0xD8DC + 6s mark, from the horizon up, where each of colors 0x7C1–0x7CE begins: pixels 1–14
  of sprite palette 0x3C + s. Above them is the word at 0xD900 + 4s.

## ENDURO RACER's dump

`npm run road-data -- enduro-racer-read` ([Development](development.md#road-data-commands)) reads both zips and writes
`superoutride.enduro-racer-road-data` version 1, `enduro-racer.json` in `reference-media/enduro-racer/rom-data/`: the
ROMs' names and CRCs; the bike's place and stage 3's background's position; the stages' ends; the road paths; each
stage's road and ground colors; the water crossings; the stripes' pattern; the scenery table, its types and the scaled
x; the jumps and their kinds; the start's templates; the size sets these name, each with its undrawn row's colored
pixels; their palettes; each stage's layers (records, columns' tables, tile words), back layer's offset and sky; and
the tile palettes.

## ENDURO RACER's course

`npm run road-data -- enduro-racer-course` ([Development](development.md#road-data-commands)) writes the LINEAR course
`enduro-racer` (ENDURO RACER), conversion version 20, the pictures its objects show and its skies, or with `--check`
fails where one differs; it reports the metres a position and a unit, the cross-section, its runs, elements, plan's
distance from its table's line (`fromPath`) and turn, the tightest arc, the checkpoints, the finish, the road past it,
the yaw origin, the steepest grade, the crossings and its objects ([ENDURO RACER's objects](#enduro-racers-objects)):

- **Scale.** A position is 1.185185 m. A lane is K's 3.5 m (`LANE`): SUPER HANG-ON's rule (the original's upright rear
  frame of the bike, its rows 0–81, 82 × 128/125 × 15/14 units, as tall as VFR750R's upright rear picture, 1.65 m)
  gives 3.49 m, rounded as SUPER HANG-ON's 4.34 m was. The original's world keeps no one scale across and along the
  road (its road is drawn at 256 × X / (Y + 8.125) pixels and its objects at 4.2456 × x / (d + 4.19), two different
  eyes), so its objects' far ratio (a road of 7.48 m) and its road's look (about 9.8 m) were the alternatives; K kept
  the 3.5 m lane (2026-10-21).
- **Cross-section.** The road ROM's line L is the road's left half, its right end the road's centre: 0 the surface, 1,
  2 and 1 the edge bands outward, 3 the ground; lines 0 and past 128 draw no road. The sub CPU draws depth number d3 on
  line 0.991 (d3 + 3) − 3, where an object's unit is (d3 + 3) / 128 pixels (as the research notes read the sub
  CPU), so an edge's units are 0.991 × 128 times its pixels' slope against the line, fitted over lines 20 to 128: the
  surface's half 190.27 units (a lane, 3.5 m, so a unit is 0.0183947 m), the edge bands to 234.81 units (4.319 m),
  their narrow, middle and narrow bands 22 %, 56 % and 22 % of them.
- **Plan.** The course's heading table is the stages' road paths' headings in running order, stage s's position p at
  2048s + p, then the goal's 450 positions straight ahead, at (0, 4096), with which every path ends and begins. It
  becomes P by the [plan from a heading table](original-road-data.md#plan-from-a-heading-table), no turn tighter than
  its lanes keep (a lane either side, 7.51 m; none is): 132 runs and 256 elements, its headings within the resolution at
  every position; laid from its start, it lies at most 0.05 m from its table's line, each position a step along its
  ends' mean heading. The tightest arc is 21.9 m, a turn in stage 3. P is a straight of 6 m less the bike's 0.75
  positions before position 0, then the plan.
- **Stations.** Course position q is its station along P. GO, the bike at position 0.75, is station 6.
- **The goal's straight.** Past position 10240 P runs straight on for 450 positions, to 10689: past the finish (10254,
  station 12158.0) 515.6 m remain, past the last scenery (10342), a length chosen when every vehicle had to stop before
  the course's end, which the run no longer requires (EX-17 reads the original's).
- **Lanes.** a and b, 3.5 m each, either side of P; the centre lane a, its centre half a lane left of P
  (`centerLateral` −1.75).
- **Strips.** Each stage's colors from its start: its ground everywhere (stage 5's sea left of P and its white sand
  right), its surface to the edge bands' outer edges, and its edge bands' narrow and middle bands over it, each in band
  B and band A by turns every 2 positions: band B over positions [0, 2) + 4k and band A over [2, 4) + 4k, the borders
  at even positions. This was confirmed on the original: in a research harness the bike stood still while the road
  position (0x126188 and 0x126184) was stepped from 0 to 3.9375 by 1/16, the road layer's nearest row showing band B at
  0–1.875 and band A at 1.9375–3.875, the nearest border coming down to that row as the position neared 2 and reaching
  it at 1.875 (the nearest row lies about 0.1 position ahead of the road position, within the pattern's steps of 1/16).
  A running frame cannot tell, for the shared RAM's position is read at another time than the road is drawn. The tool
  cannot check it and takes it as found; the sub CPU's code agrees: it starts its colors as 0x00FF0000, swaps them on
  the position's bit 1 and toggles them at each of its pattern's 27 borders to the road's nearest line, which so shows
  the high word, band B, while the position's bit 1 is 0. The borders stand at the stations of even positions, so each
  of P's elements lays them evenly and writes them as repeats. Over the water
  crossings (5236–5286, 5456–5526 and 5596–5656) the surface and edge bands take the ground's color. The ground's
  rows where the stripes change are not drawn.
- **Materials.** The surface and edge bands are `DIRT`, over the water crossings `WATER`. The ground reaches the
  bike's [lateral limit](original-road-data.md#the-ground-beside-the-road), 512 units (9.418 m) from P, 5.918 m beyond
  the lanes: `GRASS`
  on stage 1, `WATER` on stage 3 (its water) and left of P on stage 5 and the goal (the sea), `SAND` on stages 2 and 4
  and right of P on stage 5 (its white sand); the water's material lies only within the course limit. Every one is K's
  decision, for the ROMs hold no material: the water's and the sand's (2026-10-22), and the road's `DIRT` and stage 1's
  `GRASS`, which ER-3 chose with no record of who decided (2026-10-25).
- **Sections.** One a stage, `stage-1` to `stage-5`, from the stage's position 0 (the first from the course's start),
  and `goal` from 10240, each cut again where its road comes near itself (`passagePairs`: within its lanes' least
  radius; `stage-2-2` and on), 2 m clear of the start's gate, the checkpoints and the finish: where one cut parts every
  pair whose earlier passage lies before the earliest later one, there (a loop's entry from its exit, across the loop's
  far side), else as SUPER HANG-ON's are (`domainCuts`' `once`). 17 Sections; they join by lane a.
- **Gates.** The checkpoints `enduro-racer-CP1` to `-CP4` stand where each stage's CHECK banner does (2048k + 4), the
  finish `enduro-racer-GOAL` where the GOAL board does (10254), as the scenery table places them. The grids are by
  [the grid's rule](original-road-data.md#the-grid), on lanes a and b: the player's at GO on P, where the original's
  bike stands (its x brought back to 0 at 4 units a tick, 0x6210); the bike grid's next the original's four rivals
  abreast with it at ±80 and ±160 units (`readGrid`: the start copies the objects' templates, 0x18A2, from the pointers
  at 0x41F8, the rivals objects 32 to 42, every second, their position 0x10 the bike's place and x 0x14; the other
  two, further on, are held back).
- **Skies.** Stage s's (0 from) is `enduror-<s + 1>-sky`, its environment `STAGE <s + 1>`, its background baked ([Sky
  baking](original-road-data.md#sky-baking)): its back and front layers ([ENDURO RACER's
  backgrounds](#enduro-racers-backgrounds)), each column's tiles in its palettes, both layers' bottom row the first
  below the horizon but stage 5's back layer's, 4 rows lower (where it rests after rising; its rise is not made); the
  front's pixel f over the back's 0.75f − 64 (the original's 0.75f − 63.625 where the road vanishes, to the whole pixel:
  0.375 back pixels, 0.09°); the ramp's 48 rows by its bits and the top color above; below the horizon the ground's
  color (stage 5's the sea). Stage 5's sea glitter stands at its first step, the palette as loaded, and the ground's
  rows where the stripes change are not drawn. A Section starts with the sky in force there; stage 2's, 4's and 5's come
  in at their start and stage 3's at position 4068, where its background does, each by
  one `cut` (the original's column-by-column change is not made). At a stage's start heading, every stage's the same,
  the original's road vanishes at its back layer's pixel 1281.5 of 1536, here 1281.5 × 1504 / 1536 of the sky's 1504: a
  Section's yaw origin is 97.69° plus the road's turn from the course's start to its start.
- **Profile.** Level but for the jumps' mounds and the crossings' ramps ([Profile](original-road-data.md#profile)).
  Each of the 69 jumps is a mound across the road at the jump's position ([Jumps and
  humps](original-road-data.md#profile)). 32 have rocks beyond them, objects on the road with the hit mark within the
  original's flight, their far ends 11.852 m (10 positions) to 49.778 m (42, past jump 51) on. The program throws the
  bike (0x727A) at its top speed, the speed's cap 0x3F80 (0x6C36) read as 199 km/h, the lift lever at rest (0x20,
  MAME's): its height 0x2A (0x72D8), its upward speed the byte its pose picks at 0x72EC (28) times the speed, × 16, plus
  0x20000 (16.16 units a tick); each tick of 1/60 s the upward speed loses 0x2664 (0x721C), and the bike comes down
  on the road on the 55th tick, 0.917 s, 42.75 positions (50.671 m) on, its peak 77 units up, 1.554 m at a scenery
  item's height unit, its gravity 10.9 m/s². At the design speed of 105 km/h it comes down on the 48th tick, 23.333 m
  on: the mounds are 1.639 m (4.02°, their tops reached at 103.0 km/h) to 9.464 m (10.77°, 92.8 km/h) high, 20 of
  them joining in 9 runs, the longest 165.9 m. The candidates' courses: `enduro-racer-jump-80`, 17.037 m on the 46th
  tick, mounds 1.548 to 3.266 m and none at the 30 jumps whose rocks lie farther than any slope throws at 80 km/h;
  `-jump-130`, 29.491 m on the 49th tick, mounds 1.683 to 5.098 m. Its picture's color, its halves' pixels' average in its kind's palette but
  the shadow's, covers the road from its left half's left edge to its right half's right edge over the program's
  ground under it, 1.758 positions (2.083 m) either side of its position. The crossings: passages at
  least 200 m apart whose roads, to the edge bands' outer edges, overlap, parted with the mounds. 30 crossings, 62
  passages, two of them clumps of three (stations 801–837, 1840–1856 and 3274–3309; 9955–9980, 10740–10773 and
  11954–11978); the loops at stages 2 to 5's starts and stages 1 and 2's parallel stretch (stations 1930–1986 and
  2720–2774) among them. The crossings' heights run from −6.7 to +8.6 m, the ramps' least radius 71 m; the steepest
  grade is 34.2 %.

## ENDURO RACER's objects

The course's objects stand at their road positions' stations, as the original's objects stand at their world
positions; `enduro-racer-course` reports how many stand, how many have bodies, the pictures whose bodies the original's
hit narrows and the objects left out:

- **Scenery.** Each of the scenery table's 1529 items stands at its position, x × 8 lateral units right of P (a scaled
  item of types 0x48–0x4E at the scaled types' x), lifted its height × 128/125 × 15/14 units, showing its type's size
  set, mirrored where its type's flags' bit 0 is set, in its type's palette.
- **Start.** The five start templates stand at position 1.5: the gate's posts at ±208 units, its banners at +163 and
  −162 units and the START board at 0, the banners and board lifted 155 pixels, each in its template's size set and
  palette.
- **Bodies.** An object with the hit mark (its type's flags' 0x08, a start template's own) has a body, off the road
  too, but on the road (below): the original's bike hits within 0x5A units of the object's x either side, so a body is 2 × 0x5A
  units (3.31 m) wide or the object's colored pixels wide (pixel 10, the shadow, aside), whichever is narrower. The
  wide tree (0x13), the farmhouse (0x40), the mud house (0x3B), the fallen tree (0x38) and the ruin (0x39) are narrowed
  to 3.31 m.
- **On the road.** The original marks an item within 30 of the road's centre (in 8 units) as on the road, but for types
  0x48–0x4E, and only those can hit its bike, which it keeps on the road. Those with the hit mark (rocks, rock pillars,
  dead trees and jeeps: 199, 183 of them standing) are passed through here: with bodies, every vehicle's driver stopped
  behind stage 1's rocks at position 530, as the drivers do not steer around objects (53, 53, 0, 24 and 53 a stage).
- **Other passages.** An object whose base point, or body across the road, stands on another passage's road (to its
  edge bands' outer edges, [Crossings](original-road-data.md#profile)) is left out (K, 2026-10-21): the original never
  shows the two together. 138 are, 17 of them on their own road.
- **Pictures.** `enduror-<size set, five hex digits>` (and `-mirrored`): the unscaled size's drawn
  rows (0 to height − 2) on the texel grid by [chosen lines](original-road-data.md#chosen-lines), a pixel 128/125
  lateral units across and 15/14 times that down, chosen once with pixel 10 among the colors; the board takes the other
  pixels and its shadow pixel 10, so neither is a texel off the other. A board's base point is the middle of its words'
  width on its bottom edge (the program puts a size's bottom edge a row below its last drawn row, 0.8 texel lower) or at
  its foot ([Foot shadows](original-road-data.md#foot-shadows)), in every palette it is shown in, the lowest its
  default; its pixels 0 and 15 are transparent. The pictures are published, provisionally.
