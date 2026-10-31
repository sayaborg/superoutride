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
step, the bike's place, and the `lea` of each main CPU table below but the start templates' (0xCA78), and the hills'
([ENDURO RACER's screen](#enduro-racers-screen)); the sub CPU's paths' list (0x592) and stripes (0xD4E) are read
unchecked.

- **Time and distance.** A tick is 1/60 s. The road position is the long at 0x126188, 16.16; each tick it gains the
  speed, the word at 0x12618C, × 256 (`asl.w #8, d0` at 0x608C, `add.l d0, $188(a6)` at 0x608E). The display shows the
  speed as it is in km/h, so a position is 65536 / (256 × 3.6 × 60) = 1.185185 m (`positionMetres`). The speed is held
  at 0x3F80 (`cmpi.w #$3F80, ($36, a5)` at 0x6C36) and shown as ⌊⌊v / 16⌋ × 16 × 0x326 / 65536⌋ (`move.w #$10, d1`,
  `divu.w d1, d0`, `lsl.w #4, d0`, `mulu.w #$326, d0` and `swap d0` at 0x6C8C): the top speed is 199 km/h (`topKmh`), at
  which the course's flights are counted. The bike stands 0.75 positions ahead of the road position (`move.l #$C0, d5`
  at 0x60EE on the 24.8 position).
- **Stages.** Five stages of 2048 positions run on without a stop: the road position runs from 0 to 10239. Stage s
  ends when the bike passes the word at 0x53AC + 2s × 256 (8, 0x10, 0x18, 0x20, 0x28: 2048(s + 1)); the race ends
  after the fifth (`addq.w #1, d0; cmpi.w #5, d0; bcc.w` at 0x5342). `readStages` reads the count from that
  instruction and a stage's positions from the first end, checking each end against them.
- **Road paths.** Stage s (0 from) runs the sub CPU's path that the long s of the eight at 0x592 names: 0x9800, 0x1800,
  0x3800, 0x5800, 0x7800. A path is 2048 heading vectors {signed word x, signed word y}, x right and y ahead, each
  about 4096 long; every path begins and ends with (0, 4096), and the five turn 0°, 360° left, 360° right, 360° left
  and 360° right in all. Twelve to twenty vectors a path are 0.02–1.98 times as long, at the joints of straights and
  arcs; only the headings are used.
- **Road colors.** Stage s's road takes palette 0x38–0x3F, the 8 [palette words](original-road-data.md#palette-words)
  at 0xD948 + 16s (stage 5's at 0xD948 + 0x60, the program moving its copy on 0x20 bytes in stage 5 at 0xD8B8):
  surface, edge's narrow bands and edge's middle band, each band A then B. The ground is background colors
  0x7D0–0x7D7, the 8 words at 0xD918 + 8s: 0x7D3 left of the road's fold and 0x7D1 right of it, 0x7D2 and 0x7D0 on the
  row where the stripes change. Only stage 5's sides differ.
- **Stripes.** The road's bands A and B change every 2 positions; the border's shape on the road's rows is the sub
  CPU's pattern at 0xD4E + (the position's long & 0x1F0), 32 steps of 128 rows' bits.
- **Fords.** {long start, long end (position << 8), word frame} at 0xD83C, ending at 0x7FFFFFFF: three, all
  frame 0, at 5236–5286, 5456–5526 and 5596–5656, where the road's surface and edges give way to the ground.
- **Stage 3's background** comes in at the hold's end of the hill whose table offset the hills' routine compares
  (`cmp.w $2(a2), d0` at M 0xDE1A, `cmpi.w #$18, $6(a5)` at 0xDE24): there it sets the flag `st.b $42C16` (0xDE2C) by
  which the background routine loads stage 3's background while the stage count is still 1 (at 0xD4DE,
  `cmpi.w #1, d1` and then `move.w #2, d1`). The tool reads the offset from that instruction: hill 4's hold's end,
  position 4068.

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

- **Scenery table.** 0xAEA0: a word, its items' bytes (0x1802), then 1529 items {word road position, signed byte x, byte
  type}, an item whose type's bit 7 is set followed by two bytes {placement, height of its bottom above the road in
  unscaled pixels}. x is x × 8 lateral units right of the road's centre (`asl.w #3, d0` at 0xCC4A, `itemRules`). The
  table runs in position order but for 16 steps back of up to 10 positions; its order is the order objects come out in.
  366, 317, 173, 400 and 252 items stand in the five stages and 21 past the goal.
- **Types.** Type t's record is at 0xC6A4 + 6(t − 0x10): {long size set, byte palette, byte flags: 0x80 used, 0x08
  hit, 0x01 mirrored, 0x02 flipped}. The scenery uses 57 types.
- **Scaled x.** A scaled item of type 0x48–0x4E (`subi.w #$48, d2` and `cmpi.w #7, d2` at 0xCC6E) takes its x from the
  words at 0xCC88: −167, 21, 189, 163, −162, 208, −208 units.
- **Jumps.** 0xC8AE: a word, the count of halves the program stops at (216, two a jump), then jumps {word position,
  signed byte left, signed byte right (× 2 units, each half's bottom middle), byte kind, byte spare} up to the first
  whose position is 0xFFFF: 69. Kind k's record is at 0xCA60 + 3k: {long size set, byte palette, byte margin}. The left
  half is drawn as it is and the right half mirrored; the margin (120 for every kind) widens the halves' window where
  the bike jumps (0x701E), and the course's mound is the whole road's, so it is not used, nor are the halves' places.
  A kind's size set and palette give its ramp its color ([Jumps and dips](original-road-data.md#profile)).
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

## ENDURO RACER's screen

How the original draws its road's hills, which the [grades' rule](original-road-data.md#profile-from-the-originals-screen)
reads back. The main CPU sends the sub CPU 16 slope words, word 0 the farthest; the sub CPU lays the road's lines by
them. K's researcher checked these words and rows against the original's screen in a research harness: the normal path
at 16 positions and hill 1 at every position from 1530 to 1959.

- **Tables.** The slope table T, 320 words at 0xDAE4 (`lea` at M 0xDA60); the hills' table, 8-byte entries {word start,
  signed word target1, word hold's end, signed word target2} at 0xDE9C (`lea` at M 0xDA4C and 0xD6C2), seven to the
  start 0x7FFF at 0xDED4: hills 1 to 7 start at 1536, 2560, 3328, 3878, 6144, 7424 and 8960 (`readHills`); stage 3's
  words, 16 of 0x200 at 0xDD84 (`lea` at M 0xDACC). The next hill's start is compared at M 0xDA54
  (`cmp.w (a2)+, d0`), which branches at 0xDA56 to the hills' routine at 0xDDA4; stage 3 is tested at M 0xDAC2
  (`cmpi.w #2, $4040E`).
- **The normal path** (M 0xDA48). At position P: buf[i] = T[(P & 0xFF) + 4i] + T[… + 1] + T[… + 2] + T[… + 3] (i 0
  the nearest to 15 the farthest, summed in 16 bits); d3 = the 16-bit sum buf[0] + buf[1] + buf[2] + buf[3], shifted
  arithmetically right 6 bits; word 15 − i = 0x200 − buf[i] − i × d3 (16 bits), a word from −0x40 to 0x40 made ±0x40
  (0 made +0x40). The road repeats every 256 positions.
- **Hills** (M 0xDDA4–0xDE9A), the table's entries in turn. At an entry's start all 16 words become 0x200; then once
  each new whole position, by phase:
  - 0: words 6, 5, …, 0 gain −1, −2, −4, …, −64; phase 1 when word 0 falls below target1.
  - 1: unchanged until the position reaches the hold's end; then phase 2.
  - 2: words 6 to 0 gain +1 to +64; phase 3 when word 0 rises above target2.
  - 3: words 6 to 0 gain −2 to −128; phase 4 when word 0 is 0x200 or below.
  - 4: done; from the next position the normal path, awaiting the next entry.

  The words shown are these with a value above −0x40 and below 0 made −0x40, 0 left 0.

- **Stage 3.** From 4096 to 6143 (while the stage count at 0x4040E is 2) every word is stage 3's (level). Hill 4's
  phases run on to 4121, but the screen is level from 4096; hill 5 starts anew at 6144 (checked by the instructions; the
  screen was checked on the normal path and hill 1).
- **The sub CPU's layout** (S 0x6E6). The road lies from row 64 to row 229 in 16 segments, the farthest (word 0)
  first. Row 64 is the race's horizon (`cmpi.w #$40, $44(a5)` at M 0x7C88): in a race the main CPU lowers its horizon
  `$44(a5)` by 4 to it and sends it to the sub CPU (`$192`); row 229 is read at S 0x768 (`move.l #$E5, d1`). Σ is the 16 words' 16-bit sum; d2 = Σ shifted arithmetically right 6 bits (1 where 0); d1 = (165 × 128) ÷ d2,
  rounded toward 0 to a signed 16-bit value. Segment j spans s16((word j × d1) shifted arithmetically right 6 bits) ÷ 128
  rows, the product taken in full, the shifted value taken as a signed 16-bit value and divided as a real. y₀ = 64 and
  y_{j+1} = y_j + segment j's rows; a negative segment is drawn upward. The road ROM's line r (1 the farthest to 129
  the nearest) lies in segment j = min(15, ⌊(r − 1)/8⌋) on row y_j + (r − 1 − 8j)/8 × (y_{j+1} − y_j), lines taken by
  eighths, linear between. Where word 0 is 0 the last screen stays drawn. The screen is 224 rows.
- **A line's distance.** The depth tables (M 0x8B34 to 0x8B64) give a distance ahead of the road position, d in 1/256
  positions, its depth number: within 32 positions (the near table's reach, `cmpi.w #$400` on d >> 3) the byte at
  M 0x8C5B + d >> 3, a 32nd of a position each, 127 at 0 falling to 14; beyond, to 128 positions, the byte at
  M 0x8BFA + (d >> 8) − 32, a position each, 14 falling to 1, the far table ending where the near begins. An object
  stands on its depth number's line, the road ROM's line r being depth number r − 1 (no table maps one to the other), so
  line r lies at the middle of the distances whose depth number is r − 1: lines 128 to 2, depths 127 to 1 (line 1,
  depth 0, lies beyond the tables, at the horizon), linear between whole lines. The bike stands 0.75 positions ahead of
  the road position.
- **The level road.** All 16 words 0x200: line r on row 64 + 165 (r − 1)/128. The reading camera ([Profile from the
  original's screen](original-road-data.md#profile-from-the-originals-screen)) is the pinhole through its whole lines at
  their distances, its horizon row 64: line r's rows below it most nearly R / (T + e), T its distance ahead of the road
  position, by least squares in rows: the eye e = 3.982 positions behind the road position (4.732 behind the bike) and
  R = 654.50 rows × positions, within 3.73 rows of every line (0.47 rms).

## ENDURO RACER's dump

`npm run road-data -- enduro-racer-read` ([Development](development.md#road-data-commands)) reads both zips and writes
`superoutride.enduro-racer-road-data` version 2, `enduro-racer.json` in `reference-media/enduro-racer/rom-data/`: the
ROMs' names and CRCs; the bike's place and stage 3's background's position; the stages' ends; the road paths; each
stage's road and ground colors; the fords; the stripes' pattern; the scenery table, its types and the scaled
x; the jumps and their kinds; the start's templates; the size sets these name, each with its undrawn row's colored
pixels; their palettes; each stage's layers (records, columns' tables, tile words), back layer's offset and sky; and
the tile palettes.

## ENDURO RACER's course

`npm run road-data -- enduro-racer-course` ([Development](development.md#road-data-commands)) writes the LINEAR course
`enduro-racer` (ENDURO RACER), conversion version 44, the pictures its objects show and its skies, or with `--check`
fails where one differs; it reports the metres a position and a unit, the cross-section, its runs, elements, plan's
distance from its table's line (`positionDrift`) and turn, the tightest arc, the checkpoints, the finish, the road past it,
the yaw origin, the steepest grade, the overpasses and its objects ([ENDURO RACER's objects](#enduro-racers-objects)):

- **Scale.** A position is 1.185185 m. A lane is K's 3.8 m (`LANE`, K, 2026-10-26), decided by driving. The original's world keeps
  no one scale across and along the road (its road is drawn at 256 × X / (Y + 8.125) pixels and its objects by the
  depth tables, two different eyes), so no rule of its own gives the lane.
- **Cross-section.** The road ROM's line L is the road's left half, its right end the road's centre: 0 the surface, 1, 2
  and 1 the edge bands outward, 3 the ground; lines 0 and past 128 draw no road. The sub CPU draws depth number d on
  line d + 1 ([ENDURO RACER's screen](#enduro-racers-screen)), where an object's unit is (d + 3) / 128 pixels (its zoom
  d + 5, capped at 0x7F, read at M 0x8B92 to 0x8B9C, `objectZoom`, and the hardware's scale, a unit (zoom − 2) / 128
  pixels, `ZOOM_UNIT`; as the research notes read the sub CPU), so an edge's units are 128 times its pixels' slope
  against the line, fitted over every line showing all four edges (K, 2026-10-31: 120 lines, 8 to 11 and 13 to 128; 1 to
  7 and 12 lack one, the others draw no road): the surface's half 191.99 units (a lane, 3.8 m, so a unit is 0.0197929
  m), the edge bands to 236.92 units (4.689 m), their narrow, middle and narrow bands 22 %, 56 % and 22 % of them.
- **Plan.** The course's heading table is the stages' road paths' headings in running order, stage s's position p at
  2048s + p, then the road past the goal (below), every path ending and beginning at (0, 4096), straight ahead. It
  becomes P by the [plan from a heading table](original-road-data.md#plan-from-a-heading-table), no turn tighter than
  its lanes keep (a lane either side, 8.15 m; none is): 132 runs and 256 elements, its headings within the resolution at
  every position; laid from its start, it lies at most 0.05 m from its table's line, each position a step along its
  ends' mean heading. The tightest arc is 21.9 m, a turn in stage 3. P is a straight of 6 m less the bike's 0.75
  positions before position 0, then the plan.
- **Stations.** Course position q is its station along P. GO, the bike at position 0.75, is station 6.
- **The road past the goal.** Past position 10240 the program runs on the path its list's sixth long names
  (`readPastGoal`; its road object, still running in the goal's mode, steps the list as the position enters 10240),
  stage 1's from its start, straight for its first 108 positions. P follows it to the position after the last scenery
  the original puts there (10342), on which that stands: to 10343, past the finish (10254, station 12158.0) 105.5 m.
- **Lanes.** a and b, 3.8 m each, either side of P; the centre lane a, its centre half a lane left of P
  (`centerLateral` −1.9).
- **Strips.** Each stage's colors from where its sky comes in (the third stage's at 4068, the others' at their
  start): its ground everywhere (stage 5's sea left of P and its white sand
  right), its surface to the edge bands' outer edges, and its edge bands' narrow and middle bands over it, each in band
  B and band A by turns every 2 positions: band B over positions [0, 2) + 4k and band A over [2, 4) + 4k, the borders
  at even positions. This was confirmed on the original: in a research harness the bike stood still while the road
  position (0x126188 and 0x126184) was stepped from 0 to 3.9375 by 1/16, the road layer's nearest row showing band B at
  0–1.875 and band A at 1.9375–3.875, the nearest border coming down to that row as the position neared 2 and reaching
  it at 1.875 (the nearest row lies about 0.1 position ahead of the road position, within the pattern's steps of 1/16).
  A running frame cannot tell, for the shared RAM's position is read at another time than the road is drawn. The tool
  reads it from the sub CPU's code (`readStripeBands`), which agrees: it starts its stripe words as 0x00FF0000
  (`move.l` at S 0x47E), swaps them while the position's 24.8 long has bit 0x200 set (`andi.w #$200` and `swap d6` at
  S 0xC36 to 0xC46), a band 0x200 / 256 = 2 positions, and toggles them at each of its pattern's 27 borders to the
  road's nearest line, which so shows the high word, band B, while that bit is 0. The borders stand at the stations of even positions: the
  bands are a stripe's halves, its period 4 positions from the entry, written as every original's
  (`section-writing`, [Original road data](original-road-data.md)). Over the fords
  (5236–5286, 5456–5526 and 5596–5656) the surface and edge bands take the ground's color, but where a ramp
  stands ([Jumps and dips](original-road-data.md#profile)). The ground's rows where the stripes change are not drawn.
- **Materials.** The surface and edge bands are `DIRT`, over the fords `WATER` but where a ramp stands
  ([Jumps and dips](original-road-data.md#profile)). The ground reaches the
  bike's [lateral limit](original-road-data.md#the-ground-beside-the-road), 512 units (10.225 m) from P, 6.425 m beyond
  the lanes: `GRASS`
  on stage 1, `WATER` on stage 3 (its water) and left of P on stage 5 and the goal (the sea), `SAND` on stages 2 and 4
  and right of P on stage 5 (its white sand); the water's material lies only within the course limit. Every one is K's
  decision, for the ROMs hold no material: the water's and the sand's (2026-10-22), and the road's `DIRT` and stage 1's
  `GRASS`, which ER-3 chose with no record of who decided (2026-10-25).
- **Sections.** One a stage, `stage-1` to `stage-5`, from the stage's position 0 (the first from the course's start),
  and `goal` from 10240, each cut again where its road comes near itself ([the Sections'
  cuts](original-road-data.md#sections-cuts); `stage-2-2` and on: a loop's entry parted from its exit by one cut across
  the loop's far side). 17 Sections; they join by lane a.
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
  front's pixel f over the back's 0.75f − 63.625 (where the road vanishes; `backgroundScroll`, below); the ramp's 48
  rows by its bits and the top color above; below the horizon the ground's color (stage 5's the sea). Stage 5's sea
  glitter stands at its first step, the palette as loaded, and the ground's rows where the stripes change are not drawn.
  A Section starts with the sky in force there; stage 2's, 4's and 5's come in at their start and stage 3's at position
  4068, where its background does, each by a change at once (`transition` 0), as the original changes it at once ([Sky
  baking](original-road-data.md#sky-baking)): M 0xDE12 and 0xDE2C set $42C16, and as it counts down from M 0xD41A, 0xFE
  clears both layers' rows (M 0xD4B0), 0xFD draws the front layer's 64 columns (M 0xD582) and 0xFC the back layer (M
  0xD5CA), one a tick; at a stage's start M 0xCFAA → 0xD570 to 0xD57C draws both at once. At a stage's start heading,
  every stage's the same, both layers' scrolls start at 0x64 (M 0xD4B0 and 0xD4C0), and the hardware shows a layer's
  pixel 1893.5 − its scroll at the screen's middle (`LAYER_MIDDLE`, [`layerMiddles`](original-road-data.md#sky-baking)),
  so the original's road vanishes at its back layer's pixel 1281.5 of 1536, here 1281.5 × 1504 / 1536 of the sky's 1504:
  a Section's yaw origin is 97.69° plus the road's turn from the course's start to its start.
- **Profile.** The screen's pieces ([Profile](original-road-data.md#profile)), cycle by cycle from position 0: stage 3
  level, the seven hills' stretches (1536–2048, 2560–3072, 3328–3840, 3840–4096, 6144–6400, 7424–7936 and 8960–9472)
  their pieces, every other cycle the normal path's; level from 10240, the road past the goal. The road runs from −3.5 to
  +553.8 m and ends at +546.3 m, its pieces' steepest grade 25 %. Each of the 69 jumps is K's ramp across the road, its
  lip at the jump's position, its slopes painted in its kind's color in bands ([Jumps and
  dips](original-road-data.md#profile)); none overlaps another. Five meet the water: those at positions 5236, 5456 and
  5596 begin their fords, which so begin 3.8 positions later (5239.8, 5459.8, 5599.8), and those at 5506 and 5646
  stand within theirs on road 13.5 m long (5498.4–5509.8 and 5638.4–5649.8). The overpasses: passages at
  least 200 m apart whose roads, to the edge bands' outer edges, overlap, parted with the mounds. 30 overpasses, 62
  passages, two of them clumps of three (stations 801–837, 1840–1856 and 3274–3309; 9955–9980, 10740–10773 and
  11954–11978); the loops at stages 2 to 5's starts and stages 1 and 2's parallel stretch (stations 1930–1986 and
  2720–2774) among them. The passages rise from −3.8 to +3.6 m, the ramps' least radius 1774 m; the steepest grade, a
  jump's slope on a piece's, is 57.8 %.

## ENDURO RACER's objects

ENDURO RACER's objects stand at the road positions its scenery table gives them, as the original's stand in its world,
so the conversion runs none tick by tick and the original has no `-ticks` module ([An original's
modules](original-road-data.md#an-originals-modules)): there is no speed to check them at.

The course's objects stand at their road positions' stations, as the original's objects stand at their world
positions; `enduro-racer-course` reports how many stand, how many have bodies, the pictures whose bodies the original's
hit narrows and the objects left out:

- **Scenery.** Each of the scenery table's 1529 items stands at its position, x × 8 lateral units right of P (a scaled
  item of types 0x48–0x4E at the scaled types' x), lifted its height × 128/125 × 15/14 units, showing its type's size
  set, mirrored where its type's flags' bit 0 is set, in its type's palette.
- **Start.** The five start templates stand at position 1.5: the gate's posts at ±208 units, its banners at +163 and
  −162 units and the START board at 0, the banners and board lifted 155 pixels, each in its template's size set and
  palette.
- **Bodies.** An object with the hit mark (its type's flags' 0x08, a start template's own) has a body, off the road too,
  but on the road (below): the original's bike hits within 0x5A units of the object's x either side (`addi.w #$5A, d2`
  and `cmpi.w #$B4, d2` at 0x8408, `hitWidth`), so a body is 2 × 0x5A units (3.595 m) wide or the object's colored
  pixels wide (pixel 10, the shadow, aside; `coloredColumns`), whichever is narrower. The wide tree (0x13), the
  farmhouse (0x40), the mud house (0x3B), the fallen tree (0x38) and the ruin (0x39) are narrowed to 3.595 m.
- **On the road.** The original marks an item as on the road where its x × 8 + 0xF0 is below 0x1E1 unsigned
  (`addi.w #$F0, d0` and `cmpi.w #$1E1, d0` at 0xCC9A): within 30 of the road's centre (in 8 units), but for types
  0x48–0x4E, and only those can hit its bike, which it keeps on the road. Those with the hit mark (rocks, rock pillars,
  dead trees and jeeps: 199, 181 of them standing, 53, 51, 0, 24 and 53 a stage) have bodies as off the road (K,
  2026-10-26): the racing lines keep clear of them ([Racing lines](content-and-gameplay.md#racing-lines), Bounds) and a
  driver passes only where its offset clears them. Their gaps are 1.742 m at the least, at stage 1's second Section's
  rocks (565 to 570 m).
- **Other passages.** An object whose base point, or body across the road, stands on another passage's road (to its
  edge bands' outer edges, [Overpasses](original-road-data.md#profile)) is left out (K, 2026-10-21): the original never
  shows the two together. 156 are.
- **Pictures.** `enduror-<size set, five hex digits>` (and `-mirrored`): the unscaled size's drawn
  rows (0 to height − 2) on the texel grid by [chosen lines](original-road-data.md#chosen-lines), a pixel 128/125
  lateral units across and 15/14 times that down, chosen once with pixel 10 among the colors, by [the sprites'
  rules](original-road-data.md#pictures-from-the-extract), every use that stands drawn with shadows allowed: the board takes the
  picture and its shadow frame pixel 10 and the ground's shadow, so neither is a texel off the other. A board's base
  point is the middle of its words' width on its base's bottom edge (the program puts a size's bottom edge a row below
  its last drawn row, 0.8 texel lower), in every palette it is shown in, the lowest its default; its pixels 0 and 15
  are transparent. K's table paints 0x11144's shadow in pixel 14 and stands 0x1099C, 0x10AD2, 0x10F78, 0x11176,
  0x115B8 and 0x11676 on the row above the ground painted at their foot. The pictures are published, provisionally.

## ENDURO RACER's constants

ENDURO RACER's own constants and fixed rules, which its ROMs do not hold, are these (`enduro-racer-constants`); what
the ROMs hold is read where it is used, and the constants the originals share are [Original road
data](original-road-data.md#shared-constants)'s.

| Constant                         | Value                      | Why                                                                                                                                                                                                                    |
| -------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LANE`                           | 3.8 m                      | K's scale, decided by driving ([Scale](#enduro-racers-course))                                                                                                                                                         |
| `GROUND_MATERIALS`               | by stage                   | K's: the ROMs hold no material ([Materials](#enduro-racers-course))                                                                                                                                                    |
| `ROAD_MATERIAL`, `FORD_MATERIAL` | `DIRT`, `WATER`            | the same                                                                                                                                                                                                               |
| `CHECK_TYPE`, `GOAL_TYPE`        | 0x48, 0x50                 | the CHECK banner's and GOAL board's scenery types                                                                                                                                                                      |
| `LAYER_MIDDLE`                   | 1893.5                     | the hardware's display offset, which no program holds: the road vanishing at the back layer's 1281.5, a value the repository holds from its first ENDURO RACER commit (638afcc8, 2026-10-28), who read it not recorded |
| `JUMP`                           | a 9 m face, level to 1/3   | K's ramp (2026-10-27)                                                                                                                                                                                                  |
| `RAMP_BANDS`, `rampLight`        | 9; a quarter to white      | K's ramp's bands and light band (2026-10-27)                                                                                                                                                                           |
| `ZOOM_UNIT`                      | (zoom − 2) / 128 pixels    | the sprite hardware's scale, which no program holds; at the program's cap 0x7F a pixel spans 128/125 units                                                                                                             |
| `COURSE_NAME`, `stageName`       | ENDURO RACER; STAGE 1 to 5 | K's: the main program's text names ENDURO alone, and STAGE apart from its numbers                                                                                                                                      |
