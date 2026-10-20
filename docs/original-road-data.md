# Original road data

OUTRUN's courses are raised from the road data in the original's program ROMs, and
[Stage SH](NEXT.md#stage-sh--super-hang-on-from-the-roms) and [Stage TO](NEXT.md#stage-to--turbo-outrun-from-the-roms)
raise SUPER HANG-ON's and TURBO OUTRUN's from their own the same way. This document owns how each original's ROMs are
read: the ROM set, its programs, the tables' format and addresses, the dump the road data tool writes, and how the
tables become course documents. OUTRUN's sections come first; [SUPER HANG-ON](#super-hang-on) and
[TURBO OUTRUN](#turbo-outrun) have their own. What the conversion does not yet cover is NEXT's
([Stage RD](NEXT.md#stage-rd--outrun-from-the-originals-road-data), Stage SH, Stage TO).

The ROMs and any raw data taken from them are not committed and appear in no PR: K's zips lie in
`reference-media/outrun/rom/`, `reference-media/super-hang-on/rom/` and `reference-media/turbo-outrun/rom/`, the
tool's dumps beside them in `rom-data/`. The formats are read by this project's own code from this description and the
ROMs themselves.

The road data tool keeps each original's ROM set, addresses and formats in its own modules (`outrun-*`,
`super-hang-on-*`, `turbo-outrun-*`) and what they share in modules of their own: a program's words and the halves it is
interleaved from (`program-words`), the road tables in OUTRUN's format (`road-tables`: palette words, curves, widths and
heights, scenery points, road paths and height tables), the hills (`hills`), the profile and the crossings' bumps
(`road-profile`), the plan laid off a road path with its corners rounded (`offset-plan`), the sprite hardware's pixels
(`sprite-pixels`) and the originals' pixels on this game's texel grid (`pixel-grid`).

## ROM set

MAME's `outrun` (Rev. B). Each CPU's program is two 128 KiB halves, each half interleaved from a ROM of its even bytes
and a ROM of its odd bytes, 64 KiB each:

| CPU  | Addresses       | Even bytes       | Odd bytes        |
| ---- | --------------- | ---------------- | ---------------- |
| main | 0x00000–0x1FFFF | `epr-10380b.133` | `epr-10382b.118` |
| main | 0x20000–0x3FFFF | `epr-10381b.132` | `epr-10383b.117` |
| sub  | 0x00000–0x1FFFF | `epr-10327a.76`  | `epr-10329a.58`  |
| sub  | 0x20000–0x3FFFF | `epr-10328a.75`  | `epr-10330a.57`  |

Each ROM is checked by its size and its CRC-32 (`OUTRUN_PROGRAM_ROMS`), and each zip entry against the CRC-32 its
archive records; another ROM set is refused. K's set matches:

| ROM              | CRC-32     | ROM             | CRC-32     |
| ---------------- | ---------- | --------------- | ---------- |
| `epr-10380b.133` | `1f6cadad` | `epr-10327a.76` | `e28a5baf` |
| `epr-10382b.118` | `c4c3fa1a` | `epr-10329a.58` | `da131c81` |
| `epr-10381b.132` | `be8c412b` | `epr-10328a.75` | `d5ec5e5d` |
| `epr-10383b.117` | `10a2014a` | `epr-10330a.57` | `ba9ec82a` |

The sprites are eight 128 KiB ROMs in two sets of four, each ROM one byte of a 32-bit word, the least significant
first (`.12` and `.16` give the most significant byte): `mpr-10371.9` `7cc86208`, `mpr-10373.10` `b0d26ac9`, `mpr-10375.11` `59b60bd7`, `mpr-10377.12` `17a1b04a`, then
`mpr-10372.13` `b557078c`, `mpr-10374.14` `8051e517`, `mpr-10376.15` `f3b8f318`, `mpr-10378.16` `a1062984`
(`OUTRUN_SPRITE_ROMS`), checked as the programs are.

The tiles are six 32 KiB ROMs, three bit planes of two ROMs each ([Backgrounds](#backgrounds)): `opr-10268.99`
`95344b04`, `opr-10232.102` `776ba1eb`, `opr-10267.100` `a85bb823`, `opr-10231.103` `8908bcbf`, `opr-10266.101`
`9f6f1a74`, `opr-10230.104` `686f5e50` (`OUTRUN_TILE_ROMS`), checked as the programs are.

The sound program is `epr-10187.88` `a10abaa9`, and the PCM samples six 32 KiB ROMs, banks 0–5
([Voices and effects](#voices-and-effects)): `opr-10193.66` `bcd10dde`, `opr-10192.67` `770f1270`, `opr-10191.68`
`20a284ab`, `opr-10190.69` `7cab70e2`, `opr-10189.70` `01366b54`, `opr-10188.71` `bad30ad9` (`OUTRUN_SOUND_ROMS`),
checked as the programs are.

## Programs

Both CPUs are 68000s: words and longs are big-endian, and an address is an offset in the CPU's assembled program.

Every stage is 1948 positions long: not a table's value but a constant of the main CPU's program, the
`cmpi.w #$079C, ($260006).l` at 0x870A that compares the road position with it, read from there after its instruction
is checked.

Stage numbers (world edition), stage 1 to 5: 1: 0x3C; 2: 0x1E, 0x3B; 3: 0x20, 0x2F, 0x2A; 4: 0x2D, 0x35, 0x33, 0x21;
5: 0x32, 0x23, 0x38, 0x22, 0x26, each row listed from its right fork's side: counted from the left, the left road at a
fork leads to the next row's stage at the same place and the right road to the one after it
([OUTRUN's stages](#outruns-stages)).

### Main CPU

- **Stage blocks.** The long at 0xE528 + number × 4 is a stage's block: nine longs, the addresses of its sky's color,
  centre line's, lane lines', edges', surface's and ground's colors, then of its curves, widths and heights, and
  scenery. The centre line, lane lines, edges and surface are four palette words each; the sky and ground one word each
  (0 and 1 in stage 0x3C: whether they number a color table is checked with the colors' conversion).
- **Curves.** {signed word position, word R, word kind}, ending at position −1. Kind 1 is straight, 2 right, 3 left; R
  is a radius in positions. Each entry begins a segment that runs to the next, the last to the stage's end. A stage's
  points lie before its end, but for one height point of stage 0x2A at 2000, which the road position never reaches.
- **Widths and heights.** {word position, word kind, word value, signed word speed}, ending at position 0x7FFF. Kind 0
  is a height point, its value a height table's number; any other kind is a width point, its value the target road
  width, which the road width approaches by `speed × 16 / 303` units a position from 0x1C2 (450).
- **Scenery.** {word position, u8 count, u8 type}, ending at position 0x7FFF.
- **Scenery types.** The long at 0x1A43C + type × 4 is a type: {word frequency, word last entry's offset}, then 8-byte
  entries up to that offset, {u8 flags, s8 x, signed word y, u8 unknown, u8 sprite, u8 unknown, u8 palette}. Flags bit 0
  mirrors, bit 1 casts a shadow, bits 4–7 choose the drawing ([Sprites](#sprites)); x is in 16 road units, y in road
  units above the road.
- **Fork stretch.** Three longs at 0x1DFA4: its curves', widths and heights', and scenery's addresses.
- **Grounds.** The long at 0x17350 + 4 × a stage's ground word (its block's sixth long points at it) addresses 16
  palette words: the 15th and 16th are the ground's two colors, half 0 and half 1; the 14 before shade the far horizon
  and are not used.
- **Goal numbers.** The byte at 0xE4EC + a stage's place in the stage table (row r from 8r) numbers the goal stretch it
  ends in.
- **Goal stretches.** Five longs at 0xE514, each a block of three longs: a goal stretch's curves', widths and heights',
  and scenery's addresses. Each goal has three curve segments, the last from 312.

### Sub CPU

- **Road paths.** The long at 0x1224 + number × 4 is a stage's path: 0x904 positions of {signed word x, signed word y},
  a heading vector of length 4096 at each position, the stage's 1948 and 360 looking ahead into the fork. Vectors at
  segment joins differ in length, so only their directions are used. The fork stretch's path is at 0x3A33E, 600
  positions (its 384 and its look-ahead); the goal stretches' at 0x3ACA0, 624 positions shared by all five; past them
  the vectors are no longer 4096 long.
- **Paths against curves.** Over each curve the path turns by 1/R a position, left where kind 3 says, right where 2
  says (the measured radius within 2.3 % of R in every stage). Every stage's path turns 0° or ±360° over its 1948
  positions and lines up with its curves (`pathOffset`), but for stage 0x38's, which runs 48 positions ahead of them
  (0x2A's by 1). At a join the path turns over a position or two by more than its curves' rates (up to 5° on 0x2A,
  most of whose join vectors also differ in length), a turn the original draws. The plan follows the path, the road
  the original draws; the curves, moved back by the path's offset, give where it may change its rate and check its
  headings and radii. Widths, heights and scenery keep their positions: the original draws them at the
  same road positions as the path. The original's curves push the car outward, so on stage 0x38 the curves the player
  sees and the curves that push the car lie 48 positions apart.
- **Height tables.** The long at 0x220A + number × 4 is a height table: {u8 kind, u8 step}, then by kind:
  - 0: u8 descent factor, u8 ascent factor;
  - 1 and 2: word wait;
  - 3: a word;
  - 4: word horizon, and no entries.

  The entries, signed words, follow from the table's fifth byte and end at −1. A table of another kind is refused.

### Palette words

A palette word `w` is RGB555, each channel four bits over a low bit shared from bits 12–14:
R = (w & 0xF) << 1 | (w >> 12 & 1), G = (w >> 4 & 0xF) << 1 | (w >> 13 & 1), B = (w >> 8 & 0xF) << 1 | (w >> 14 & 1).
Strips take it as their RGB555 as it is.

## Sprites

A sprite is drawn from the sprite ROMs' words ([ROM set](#rom-set)), set 1's after set 0's, in banks of 0x10000 words:

- **Sizes.** The long at 0x11ED2 + sprite × 4 addresses its five sizes, the largest first, each {word width, word height,
  word words a row, word bank (its low byte), word first word in the bank}.
- **Pixels.** Each word holds eight 4-bit pixels, the most significant first. 0 and 15 are transparent. Read from the
  left, a row ends with the word whose bits 4–7 are 15; drawn mirrored, its words are read the other way, the least
  significant pixel first, and the row ends with the word whose bits 24–27 are 15. So COCONUT BEACH's signs read
  "DIVING SCHOOL", "OUTRUN" and "Vulture St. / Dalton Bayside".
- **Palettes.** Palette p is the 16 palette words ([Palette words](#palette-words)) at 0x14ED8 + p × 32, slot 0
  transparent.
- **Hit extents.** The signed words at 0x1212A + sprite × 4: how far left and right of its object, in road units, the
  car hits it.
- **Shadow.** A shadowed object casts the size list at 0xFF56 (192 × 7 pixels at its largest), drawn at the object's
  scale and anchor.
- **Objects.** A scenery entry's drawing chooses its routine, which sets its anchor, its scale and whether the car hits
  it; a routine also draws the sprite's size its scale selects. The objects standing at the game's start are the
  16-byte records counted by the word at 0x2B6E, {u8 flags, u8 anchor, u8 priority, u8 palette, word sprite × 4, signed
  word x in road units, word y × 128, word depth, long routine}.

An object's x is from the left road's centre, but a right-side one's (x ≥ 0) is from the right road's centre, unless
the roads were apart as it appeared (the road width over the word at 0xE308, 280: the spawn sets its flag) and its
routine keeps it by the left road then. Its anchor byte: bits 0–1 put its sprite's left edge (1), right edge (2) or
middle (0, 3) at the object, bits 2–3 its top (4), bottom (8) or middle (0, 12). A pixel of the largest size spans 2
road units, or 1 where the routine halves the scale twice. The drawings read so far:

| Drawing | Routine               | Anchor (mirrored)   | Pixel | The car hits it               | Kept left when apart |
| ------- | --------------------- | ------------------- | ----- | ----------------------------- | -------------------- |
| 0       | 0x4048, raised 0x4042 | bottom middle       | 2     | by its extents, on the ground | yes                  |
| 4       | 0x4658                | bottom middle       | 2     | by its extents                | no                   |
| 7       | 0x4828                | bottom right (left) | 2     | by its extents                | yes                  |
| 8       | 0x3FE2                | bottom middle       | 1     | never                         | yes                  |
| 9       | 0x492A                | bottom middle       | 2     | by its extents                | yes                  |
| 1       | 0x4416                | middle left (right) | 2     | never                         | no                   |
| 3       | 0x4408                | middle left (right) | 2     | never                         | no                   |
| 10      | 0x443C                | middle left (right) | 2     | never                         | no                   |
| 11      | 0x4432                | middle left (right) | 2     | never                         | no                   |
| 13      | 0x3FE8                | middle              | 1     | never                         | yes                  |

A hit sets the crash (the word at 0x60C24). The drawings are dispatched by the jump table at 0x3DA2. Drawings 1, 3, 10
and 11 draw a strip beside the road, its edge nearest the road at x, and drawing 13 a patch on it
([Strips and patches](#strips-and-patches)). Drawings 2, 5, 6, 12 and 14 move and are not converted yet.

## Outline boards

`npm run road-data -- boards` writes an [outline board](footage.md#outline-boards) for each sprite OUTRUN's stages
(to their length), the fork and goal stretches and the objects standing at the start (of the first stage) show,
mirrored and shadowed as shown: the course image `outrun-<sprite>[-mirrored][-shadowed]` (a strip's
`outrun-strip-<family>`); with `--check` it rebuilds them and fails where one differs. Each is made from the largest
size's pixels straight onto its texel grid at 40 texels/m (`sceneryBoards`), sampled once across and once down:

- **Scale.** A road unit is `UNIT_METRES` = 3.6 × 3 / 424 = 0.0254717 m (a lane, 424/3 units, is 3.6 m). A pixel spans
  its routine's road units across and 15/14 of them down (`PIXEL_ASPECT`: the original's 320 × 224 pixels are shown at
  4:3). A pixel of 2 units is 2.0377 texels across and 2.1833 down; one of 1 unit half that.
- **Sampling.** Each texel takes the palette index whose pixels cover most of its area, transparency counted as an
  index; of two as large, that of the pixel nearest the texel's centre (`areaMajority`). At these ratios it is the
  nearest pixel's.
- **Picture.** The board's indices are the largest size's outline, filled: the colored pixels and every pixel no
  transparent path joins to the picture's edge. Each palette the sprite is shown in is a palette of the board
  (`p<palette>`, the lowest its default), one color, the palette's mean over the colored pixels. Its
  [local original](development.md#local-originals) has the same grid and the sprite's own indices in each palette's
  own colors.
- **Base point.** At the bottom or middle its anchor gives. Across, an object anchored by an edge that has no body (its
  routine never hits: the strips) stands by that edge (`standsByEdge`), and its base point is there; any other's is
  at the middle of the sprite's hit extents, so a solid object's body stands there.
- **Shadow.** A shadowed board's shadow is the original's shadow on the same grid and at its anchor.

The entries of drawings 2, 5, 6, 12 and 14 (moving objects) are not converted. The sprite sources and recipes under
`content/sprite-sources/` that earlier boards were imported from are no longer written or read.

## Placing scenery

A road's objects stand where the car passes them at the top speed, 293 km/h, constant from GO (`roadObjects`), as
the main CPU runs them tick by tick. The road position is the car's (0 at GO); each tick, in the order the program
runs its slots:

- **Stretches.** Before the road position advances, where it is past a stretch's end the next stretch begins: the
  program resets its road position at a stage's 1948 (0x870A) and where a fork stretch's roads have closed (0x89A2),
  dropping the fraction, and reads the next stretch's tables. The scenery control keeps its state, so the point it was
  running brings out nothing more: the last points of a stage of row 5 (VINEYARD's 167 left, DEATH VALLEY's 40,
  DESOLATION HILL's 163, AUTOBAHN's and LAKESIDE's 187) show nothing in the goal stretch. Here the road position runs
  on: the next stretch begins where its piece does (the fraction the original drops, up to 2.35 positions, is not
  made).
- **Advance.** The road position gains `km/h × 0x12F / 65536` positions, 1.354660 at the top speed. The phase word
  (0x26053C) gains km/h / 64 three times a tick, its remainder shared (twice in the frame interrupt, 0x7D26, and once
  in object 0, 0xB9D8; a tick is two frames), and the tick's advance is that gain, at most 15 (0xB9DC): 13 and 14 at
  293 km/h. The stripes count the same word.
- **Points.** A scenery point is taken when the road position reaches it (one a tick, by its stretch's position) and
  replaces the one before. While its count lasts and its cursor (its position, one more each tick) is not past the road
  position, its type's frequency word turns left twice; each turn that carries out a 1 brings out its next entry, from
  the last back: the first turn's at line 0x104 (0x3C76 spawns it at 0x10400), the second's at 0x100. An object takes
  the first free of the scenery's 79 slots (3 to 81); with none free it is not brought out, its count spent. Moving
  objects (drawings 2, 5, 6, 12 and 14) take slots too.
- **Approach.** Every object, one brought out this tick too, then comes nearer once: its depth gains the table at
  0x28000's step for its line and the tick's advance (advance × line × 0x400, half for drawing 2, the clouds). An object
  reaching line 512 vanishes, passing the car, and stands at that tick's road position: 34 ticks (46.06 positions)
  after it appeared at the top speed, a cloud 66 (89.4). This approach, counted once a tick, put every object about
  87 positions farther from 2026-10-18 (RD-4) to RD-10e. At the top speed 48 to 78 objects live at once; on all 15
  stages one object finds no slot, CLOUDY MOUNTAIN's of type 34 at 1063.
- **The start.** The 68 objects standing at the game's start take slots 3 to 70 at their lines from GO and approach as
  any other. An object at line L is drawn L / 512 px a road unit: as large as this game's camera shows it at
  f × `UNIT_METRES` × 512 / L metres (3130 / L m) from the camera, which stands at the road's entry at GO. It stands
  there, or where it passes the car by its approach where that is nearer: 26 of them by their approach (the edges'
  objects at lines 110 and below, those at 16 and below 55 to 101 m from the entry), 42 by their size (the edges' from
  line 106, the START gate and the people). `k1`'s start gate (line 160, 19.6 m) leaves the top of the screen about 5
  positions after GO; by its approach it passes the car 9.5 positions after GO, its top leaving the screen 5 to 7
  positions after GO, so its approach and its size agree as the original draws them.
- **Across.** An object's x is from the road its drawing gives ([Sprites](#sprites); the spawn at 0x3D74 sets the
  flag of roads apart, and a routine keeping objects left adds 2w to a right-side x only without it). Its point is
  that x across from the roads' middle at the road width where it stands, measured on the plan beside it ([OUTRUN's roads](#outruns-roads)). An object standing by its edge stands at its x; any other
  anchored by an edge stands half its width aside, its board's base point its hit extents' middle. Its height is
  y road units, 15/14 of them.
- **Solid.** An object whose routine tests its extents and which stands on the ground gets a body as wide as its
  extents, at most its board's width; the others pass through (K's rule: the original's hit routines are the mark).

### Strips and patches

A strip or patch is brought out, approaches and stands as an object does (`stageObjects`), with no body:

- **Strips.** Drawings 1, 3, 10 and 11 draw, whatever sprite their entry names, the sprite of 16 sizes the longs at
  0x4548, 0x4608, 0x4588 and 0x45C8 point at (`objectSize`), a size for each depth, the nearest last (232 or 248 by 31
  px). Its edge nearest the road stands at the entry's x, from the road's centre as an object's; it reaches outward,
  drawn mirrored on the left, a pixel 2 road units. Drawing 1 draws flowered grass (GATEWAY, ALPS, WHEAT FIELD, VINEYARD
  and others), 3 the sea's or a lake's edge (COCONUT BEACH, ALPS, SEASIDE TOWN, LAKESIDE), 10 DESERT's sand and 11
  DEATH VALLEY's stones. Its board is the nearest size's, `outrun-strip-<family>`, its base point at that edge.
- **Depth.** From line 256 on (half its approach) the nearest size is drawn at the objects' scale; before it, the size
  its line chooses (one each 16 lines) at line 256's scale, as wide but fewer rows, so a far strip lies flatter
  than a near one and no narrower. A board is one picture at every depth, the nearest size's, reduced as the camera
  draws it: a far strip stands as tall for its width as a near one, and narrows.
- **Patches.** Drawing 13 draws its entry's sprite on the road, its middle at x, a pixel 1 road unit: DESERT's and
  DESOLATION HILL's drifts of sand, 248 by 31 px.
- **Effect.** Drawings 1, 3 and 13 set the road's surface effect (the words at 0x60C20 and 0x60C22) where the car is
  on them, near the camera: for 12 frames a spray from the table at 0xAD06 is drawn at the car, by the effect's kind
  (sea 0, grass 4 or 8, sand 12). Nothing else reads it: they change no driving. Drawings 10 and 11 set nothing. The
  spray is not converted.

On COCONUT BEACH 1487 objects stand, 1086 of them solid, 289 of the rest the sea's edge. A beach hut before the finish has hit extents ending 0.6 m
beyond the road's edge band, as the original's.

## Hills

The original builds its hills as shapes on its screen. Its road is 512 lines; level, each line's slope is the horizon's
base 0x240 × 16 (16.16 rows), so the road's top is row 223 − 512 × 9216 / 65536 = 151 (`k1`'s 151.4). The road's top
along a stage (`hillsAlong`) follows from its height points and tables alone; nothing is fitted:

- **The shape.** The lines form seven segments, near to far: s0 = 255(1 − f), s1 = (256 + 255f)/2, and the rest
  R = 512 − s0 − s1 halved in turn, R/2, R/4, R/8, R/16, R/16. Segment 0's slope is the base; each further segment's is
  its predecessor's plus an increment. Each line's row is 223 − the slopes summed from the nearest line ÷ 65536; the
  road's top is the least row.
- **Points.** A height point starts its table when the road position reaches it; one reached while a table runs is
  dropped.
- **Kind 0** slides its entries through the segments: at entry `i`, a share `f` of it passed, segment 1's increment is
  16·e[i]·(1 − f) and segment k's (k ≥ 2) 16·e[i + k − 1]. An entry spans 2.125 × step × m positions, m the ascent
  factor where e > 0, the descent factor where e < 0, 1 where e = 0. The table ends when e[i + 6] is its end mark.
- **Kinds 1 and 2** rise over 2.125 × step positions, hold, and return over 2.125 × step: their two entries are segments
  1's and 2's increments (×16) at the rise's share. The hold counts the wait down by the whole part of
  `120 × positions advanced ÷ step` each tick, so it lasts longer the slower the car (`holdLength`).
- **Kind 3** slides its entries in as kind 0 does (each over 2.125 × step), holds the full window by its word as kinds 1
  and 2 hold, and returns it at a falling share over 2.125 × step.
- **Kind 4** moves the horizon's base to its word over 2.125 × step positions, and it stays.

Kinds 0 and 1 are checked on `k1` (COCONUT BEACH, no fit; `k1`'s position is the displayed speed's integral, which lags
the original's later in the stage):

| Table (kind) | Rule's road top      | `k1`'s     |
| ------------ | -------------------- | ---------- |
| 211 (0)      | row 112.5 at 40.5    | 107 to 113 |
| 134 (0)      | row 122.2 at 462     | 121        |
| 213 (0)      | rows 101.4 and 109.4 | 100, 107   |
| 32 (1)       | hold at row 169.1    | 166 to 173 |

Kinds 3 and 4 follow the same idea and are not yet checked against footage; under kind 4's raised base some of
stage 0x3B's tables put the road's top at or above the screen's top.

## Backgrounds

`npm run road-data -- course` also writes each stage's background, converted from the tile ROMs, as the
[local original](development.md#local-originals) of its sky (`stageBackground`), at the published sky's size (94 × 40
tiles) and horizon row (320):

- **Tiles.** The tile ROMs are three bit planes, each two ROMs (`opr-10268.99` and `opr-10232.102` the lowest bit,
  `opr-10267.100` and `opr-10231.103` the next, `opr-10266.101` and `opr-10230.104` the highest), 8 bytes a tile, a byte
  a row, its bit 7 the leftmost pixel: 8192 tiles of 8 colors, 0 transparent.
- **Palettes.** Palette RAM's tile palettes, 8 words each: palettes 0–7 from 0x16ED8, 8–127 each the 8 words at
  0x17050 + 16 × its byte at 0x16FD8, then the stage's patch: the byte at 0xDDB4 + the stage's place in the stage table
  chooses a branch at 0xDDDC + 4 × it, whose `lea source, a0` and `lea palette, a1; moveq n, d0; bsr` steps copy one
  source's 8 words into n + 1 palettes.
- **Layers.** The byte at 0x17E84 + the stage's place numbers its entry at 0x17EAC, 12 bytes: {u8 front rows, u8 back
  rows, long front data, long back data, word offset}. The front layer is four pages of 64 × 32 tiles (2048 px), the
  back three (1536 px); each page's rows are written from its bottom row up, each row's 64 tile words a word each, or
  0 then {word tile word, word count − 1} for a run. A tile word holds its tile in bits 0–12 and its palette in bits
  6–12. The page selects at 0x17E4C and 0x17E5C show each page's predecessor to its right, so a layer reads its last
  page first.
- **Placement.** The front layer scrolls by the road's heading, a turn its width; the back 3/4 as fast, a turn its
  width too. Both stand with their bottom `offset` rows (10 on every stage) below the road's top.
- **Sky.** The stage block's first word numbers its ramp, the long at 0x17590 + 4 × it: 64 palette words, a row each
  up from the road's top, the last above.

The picture draws the sky, then the back layer, then the front, each layer across the picture's width once (a turn)
by nearest pixel, and is drawn as a tile picture as the skies command draws one. The two layers turn together in it:
this game's sky is one plane, so the back layer's slower turn is not shown.

## The player's car

`npm run road-data -- player` draws the original's Ferrari into TESTAROSSA's picture set
(`content/sprites/testarossa.json`) as its [local original](development.md#local-originals) (`playerOriginal`):

- **Frames.** The table at 0x9ECC holds the player's frames, 8 bytes each: {long size, word frame, word x offset}.
  Three steering levels (under 0x12, under 0x1E, beyond) each have three slopes; the level slope's (the middle) is
  taken. As stored, a frame shows the car turned left, with x offset +1, −3 and −8; turned right, it is drawn mirrored.
- **Palettes.** The car's palette is 2 + its wheels' phase (2 or 3), and 2 more while braking (4 or 5). The one color
  palette 4 changes, slot 11, is the brake lamp.
- **The set.** Every picture, size, anchor, shadow, palette name and grid cell stays the published set's. A picture
  shows its yaw's level: straight from behind, mid one or two steps turned, hard beyond. Its frame is scaled by
  nearest pixel so that its width at that size is the straight picture's, its bottom on the picture's bottom and its
  middle at the anchor less its x offset. Slots 1–14 are the car's colors in every named palette; the lamp is slot 15,
  off and on from palettes 2 and 4.

## Voices and effects

`npm run road-data -- sounds` writes the original's PCM voices and effects as the
[local originals](development.md#local-originals) of this game's recordings (AAC-LC, 44.1 kHz, mono, by ffmpeg,
bit-exact):

- **Commands.** The main program sends sound commands through 0x56D4. A command from 0x81 starts the sequence its
  handler names, the word at 0xBC7 + 2 × (command − 0x81) (`ld a, track; ld hl, sequence`). A sequence's byte 8 counts
  its channels, whose headers' words follow; a header's word at 7 is its data. A PCM channel's data sets its step
  (opcode 0x93), its left and right volumes (0x82) and plays notes; a note from 0xD0 plays the sample at
  0xDDD + 4 × (note − 0xD0): {start low, start high, end high, control}, its bank control bits 4–6
  (`commandSample`).
- **Samples.** The PCM ROMs are banks 0–5 (`opr-10193.66` to `opr-10188.71`), each 32 KiB filling its bank twice. A
  sample's bytes, unsigned about 0x80, run from its start through its end page. The chip outputs 31,250 Hz (a 4 MHz
  clock over 128), each output taking the byte its position has reached, the position advancing `step / 256` an
  output (`samplePcm`).
- **Which.** The main program's places name them: 0x9D after a checkpoint's time bonus (0x8FFC, after the extend
  jingle 0x86), 0x9E at the goal (0x5B30), 0x9F at the race's start (0xB418), 0x92 where a hit takes the car's speed
  (0x13EC), 0x8F and 0x90 when the car crashes fast or slow (0x1B12, 0x19EE). The voices play at step 0x48
  (8,789 Hz): "Checkpoint!" 0.64 s, "Congratulations!" 1.11 s, "Get ready!" 0.50 s.

| Recording              | Command | Sample (bank, start, end page) | Step |
| ---------------------- | ------- | ------------------------------ | ---- |
| `effects/checkpoint`   | 0x9D    | 0, 0x6700, 0x7C                | 0x48 |
| `effects/goal`         | 0x9E    | 3, 0x0000, 0x25                | 0x48 |
| `effects/countdown-go` | 0x9F    | 0, 0x5600, 0x66                | 0x48 |
| `impacts/vehicle`      | 0x92    | 2, 0x3C00, 0x5B                | 0x80 |
| `impacts/movable`      | 0x92    | 2, 0x3C00, 0x5B                | 0x80 |
| `impacts/object`       | 0x8F    | 2, 0x0900, 0x1F                | 0x40 |
| `impacts/wall`         | 0x90    | 2, 0x2000, 0x3B                | 0xA0 |

Each recording is its command's first sample played once at its step; a crash's sequence goes on to play it again
softer, which is left out. The other effects (the jingles, menus and lamps) are the FM chip's, not PCM, and stay this
game's.

## Dump

`npm run road-data -- read` ([Development](development.md#road-data-commands)) checks and reads the ROM zip and writes
`superoutride.outrun-road-data` version 1, `outrun.json` in the dump directory: the ROMs' names and CRCs; every stage
(number, block, colors as words and RGB555, curves, widths and heights, scenery, road path); the fork stretch and the
goal stretches with their paths; the height tables and scenery types their points name. It refuses a stage whose path
does not turn 0° or ±360° over its length, and prints each stage's counts, points past its end, its path's offset
against its curves, and each curve's radius against the one its aligned path measures, positions over its heading
change two positions in from either end (a join spreads its turn over a position or two). `npm run road-data -- hills`
writes each stage's road top by the [hills](#hills) at every quarter position, `hills-<stage>.json` beside the dump,
the holds counted at `--kmh` (293 unless told), and prints each height point's highest and lowest top.

## Course documents

`npm run road-data -- course` ([Development](development.md#road-data-commands)) reads the ROM set above and writes
[OUTRUN's roads](#outruns-roads) to `content/courses/`; with `--check` it rebuilds them and fails where one differs from
the committed document. CI holds no ROM, so the documents are committed; edit the conversion, not the documents.
`npm run road-data -- look` takes each stage piece alone.

The conversion, version 11 (`CONVERSION_VERSION`), fits nothing to footage. A lane is K's 3.6 m over the original's lane
spacing; every other amount is the ROMs', and the [profile](#profile)'s `c_look` matches the original's hills as its
program draws them:

- **Length.** A position is 65536 / (3.6 × 30 × 303) = 2.0027 m ([hills](#hills)'s advance per tick). Position 0 is GO,
  the car's station (the original's road position is the car's); the road's entry is the camera's distance, 6 m, before
  it, where the camera stands at GO.
- **Across.** A road unit is `UNIT_METRES` = 3.6 × 3 / 424 = 0.0254717 m: the road ROM's lines lie 424/3 units apart.
  The original's pixels are 14 wide to 15 tall (320 × 224 shown at 4:3), so an amount the ROMs give down (a sprite's
  height, an object's height y) is 15/14 of its units across.
- **Road width.** From 0x1C2 (450) at the game's GO, else 0xD4 (212), each width point approaches its target from its
  position by |speed| × 16 / 303 units a position until it is reached or the next point begins.
- **Corners.** Where the road width's slope changes, it is rounded by a parabola over 4 positions centred on the corner
  (it misses the corner by half the change of slope times a position: 0.10 m at a fork's 8 units a position); corners
  nearer than 4 positions are rounded as one about where their outer lines meet. Where the format's coordinate domain
  (the sand to 40 m beyond the asphalt and 4 m more) needs a wider radius, a corner is rounded over more (K's choice,
  2026-10-20): 8 positions where the roads part (a fork's 63, a goal's 182, P's curve beginning there too; 0.20 m),
  8 where a fork's roads begin to close (362, the road coming in on the inside), 12 where a goal's roads stop parting
  and close (15.6°, the road not taken still beside; 0.82 m), 6 where a goal's road taken is back on P. Each piece's
  roundings lie within it: one nearer its start than half its rounding is moved in to there, the line after it with
  it (at most 2 positions, 8 cm). The lanes' rule bends the centre lane where the width passes 72 and 212; those
  corners are rounded alike. The lanes and the plan both come from the rounded width.
- **Colors.** The surface, lane lines, edges and centre line are each two palette words repeated, half 0 and half 1
  (another pattern is refused; a centre line other than the surface is refused). The ground's two colors are the
  stage's (`groundStripes`, [Main CPU](#main-cpu)). Each half is half a period of 32 × 303 / 3072 positions,
  2048 / 324 = 6.320988 m (the road's fine position gains km/h / 64 three times a tick, 32 of it a period), counted
  from GO along the plan's stations.

### Cross-section

One road's lines and edges, units from its centre, each side alike, are the road ROM's nearest line (`opr-10185.11`,
CRC `22794426`, 256 lines of 512 pixels, two bit planes of 64 bytes a line; row 255 is 1 pixel a unit, its centre at
pixel 252), which `road-data course` checks (`checkRoadRom`): the inner lines 66.67 to 74.67 (pixel value 1), the
outer lines 206 to 218 (1), the shoulder to 228 the surface (0), the edge band 228 to 250 (2). The centre line, 8 wide
at 0, is the surface's color on all 15 stages and is not drawn. Lines and edge bands are drawn at their exact units
(the original's 7/11 unit and pixel rounding are not).

Two roads drawn together (`composite`) show, at each point, the surface of either road (its shoulder included) over road
0's (the left one's) lines and edges, over road 1's, over the ground: between two roads at road width w (centres ±w) the
middle is at w = 0 three lanes, at 72 four (the middle line 5.33 wide, the next 7.33), at 162 five (an edge band 0.67
wide of road 0 at 87.33), at 212 six equal ones (the outer lines one line 12 wide), between 228 and 250 an edge band
2(w − 228) wide, beyond 250 the ground 2(w − 250) wide. Each line and band shown is a Strip between two features' edges
held to lanes (a road's centre lies 212 units inside its outer lane's outer edge, or its inner lane's inner edge), cut
where the arrangement changes. ASPHALT lies under each road from its centre ∓ 250, SAND beneath all from 40 m beyond the
outermost asphalt; the ground's color is everywhere, its half 0 over its halves.

The lanes driven (`drivenLanes`) are a, b, c | median | d, e, f; a and f are always one lane, 424/3 units (3.6 m). At
w ≥ 212 every lane is one lane and the median 2(w − 212); for 72 < w < 212, c = d = 424/3 × (w − 72) / 140 and
b = e = w + 70.67 − c; at w ≤ 72, c = d = 0 and b = e = w + 70.67. So at w = 72, where four lanes show for kilometres
(SEASIDE TOWN, OLD CAPITAL, WHEAT FIELD, LAKESIDE), they are a, b, e and f (laid over the two roads, c and d would be
3.4 cm wide there, between the middle line's sides), and at 212 they are the two roads' own. The visible lines come
from the two roads' picture, not the lanes. A lane or median 0 throughout a Section is
left out. Each width is written straight by station between knots: where the width, the offset or the lanes' rule
changes slope, and halfway between until it lies within 1 cm of its rule (where the offset changes on a curve, the
station does not run evenly with the position).

### Plan

The plan is where the original draws the centre lane: its road path P laid off sideways by the centre lane's centre.
P turns as S's path table does, at one rate between breaks: the stretch's ends, and two positions either side of each
join of its curves (moved back by `pathOffset`), so that a join's own turn stays at the join; a straight holds the
middle of the path's headings inside it. Over any 50 m, fitted, P lies within 0.26 m of the path the table draws. The
centre lane is at a stage b's (−(w + 70.67 + c) / 2 from the roads' middle, −w at w ≥ 212), or e's (its mirror) where
the stage is entered from a fork's left side. A position's station is the arc length along the plan to the point
across from P there (`OffsetPlan`); everything placed by position (widths, objects, gates, height tables, sky changes)
takes it. As straights and arcs: a straight where P is straight and the offset changes evenly, an arc where P is an
arc and the offset holds, else arcs of at most 2 positions (4 on a straight) turning as the curve does, each joint
within 1 cm of the curve (the largest of the roads 4.5 mm). A corner of the curve (P's curvature changing while the offset changes)
is turned by an arc either side, each turning half of it, no sharper than 120 m and within 3 mm of it. An arc that
would be straighter than 40 km is a straight, its turn carried on; one shorter than a millimetre (two breaks all but
together) is carried on into the next, its length and its turn.

### Pieces

The roads are made of pieces, each one shape whatever comes before or after it (`outrun-pieces.ts`):

- **Stage pieces.** A stage of rows 1 to 4 runs from GO to its fork stretch's 59: its widths, then from the width it
  ends at to 212 at 8 units a position, the corner's vertex at the stretch's 57, so that it ends in six clean lanes,
  level (K's design: the original parts its roads from 63 at the width it ends at). A stage of row 5 runs to 1948 and
  its goal piece follows in the same span. COCONUT BEACH starts at 450 with its grid and start objects, after the road's entry: 6 m of straight before
  GO at its start's width, lanes and colors, level.
- **Fork pieces** (`forkSpan`), the fork stretch's 59 to 433.5, L (left taken) and R its mirror. As the main CPU's
  program runs the stretch (0x8780 to 0x89B6): from 63 the roads part by 8 a position; past 0x168 (360) the route is
  chosen and the next stage's background comes in; past 0x300 (768) the road not taken is no longer drawn and the width
  holds; from 362, the second curve's end, the car is carried 2w across and the roads close by 8 a position to 212,
  the next stage beginning at about 432. Here the width parts from 212 to 768 (63 to 132.5), holds, and closes from
  362 to 212 at 431.5. L's lanes are g, h, i (the road coming in) | m0 | a, b, c (taken, centre lane b) | m1 | d, e, f
  (not taken). Before 362 the road taken is w left of P; from 362 it keeps P's heading and moves 768 − w toward the
  road coming in, which appears 2w beyond it, growing over a position: a straight, even V about P's 1536 left, meeting
  in six lanes at 431.5. The road not taken lies 2w right of the road taken (its own curvature, the original's mirror,
  has no place in one Section's plan) and ends at 132.5, its lanes narrowing to nothing over its last two positions;
  sand beyond. The verge (the sand's outer edge) comes back from it after it ends, and goes out to the road coming in
  before it comes, one metre across for 6 along. R mirrors all: a, b, c (not taken) | m0 | d, e, f (taken, centre lane
  e) | m1 | j, k, l (coming in). The fork piece's road and ground are the stage before's; its sky changes to the next
  stage's by `wipe` where the width passes 360 (81.5). Entering a fork piece L leaves the stage by lane b, R by e;
  leaving, L by b and R by e, the road taken's middle lane, so the side taken enters the next stage's d, e, f (L),
  its centre lane e, or a, b, c (R), its centre lane b.
- **Goal pieces** (`stageSpan` with a goal), the goal stretch (S's path at 0x3ACA0) from 0 to 600, after its stage in
  one span. Each stage of row 5 ends in the goal its place in the stage table numbers (the byte at 0xE4EC + its place,
  0x8A04's `move.b (a0, d0.w)`): VINEYARD A (4), DEATH VALLEY B (3), DESOLATION HILL C (2), AUTOBAHN D (1), LAKESIDE E
  (0). The stage's last width holds to 182; from there the roads part by 8 a position to 768 (`s_r`), where the right
  road, not taken, ends; where the goal's width point acts (read the tick after its second height point; A, B, D and E,
  whose second height point is at 182), the width then closes at 256 × 16 / 303 units a position to 0, the road taken
  coming back to P; at C (its point at 162, read while the width is still DESOLATION HILL's 0, so no change) it stays
  768 to 600. Once the road not taken has ended, the road taken keeps its three lanes. The goal's height points run
  their tables; its scenery stands.
- **Join pieces** (`joinSpan`, K's design, 2026-10-20), on the road through all 15 between a goal piece and the next
  stage: a straight of 34 positions at width 212, level, L and R as a fork's sides. The goal's road taken runs on; the
  verge ramps out to the road coming in, whose three lanes then grow over the last position, so that the next stage
  begins in six lanes. L has the road taken as d, e, f (centre lane e), the road coming in a, b, c on its left, so that
  the next stage is entered in its right half; R mirrors it (a, b, c taken, centre lane b). It is the next stage's
  road and ground, its sky rising (`rise`) at the join's start.

### OUTRUN's roads

Each road (`outrunRoad`) is a LINEAR course of pieces: the first row's stage, each fork's side taken (left to the next
row's stage at the same place counted from the left, right to the one after it), and the last stage with its goal;
or, ALL 15 STAGES, all 15 stages in the map's order, row by row and within a row from the left, each of rows 1 to 4 left by
its fork and each of row 5 but the last by its goal and a join, the forks' and then the joins' sides alternating from
L (LRLRLRLRLR, then LRLR). Each span is laid in the world after the one before, the next's centreline on the Link's lane's centre:

- **Sections.** A fork piece is one Section (the centre lane changes at its ends). A last stage entered from the left
  is two, cut at its `GOAL_CENTRE` (1946), its centre lane e before and b after, since the goal's road taken is the
  left one; they join by lane b. A span is otherwise one Section but where its coordinate domain passes over itself: then its passages lie in different Sections, cut at the last joint
  before the later passage, after the earlier, where the road is one (w ≤ 212), joined by its centre lane.
- **Profile.** Each piece's height points run their tables at 293 km/h as the [profile](#profile) says, the stage's cut
  at its end, and each piece is closed level at height 0 at its ends; the whole road's crossings (passages at least
  200 m apart whose asphalt overlaps) are kept 6 m apart.
- **Objects.** The scenery points of the whole road are [placed](#placing-scenery) along it by road position, each
  stretch's points within its stretch: a stage's destination signs (its point at 1878, count 2) stand at about 1924, 24
  positions before the stage's end, and the fork's banner about 11 positions into the next stage. Each stands at the
  world point the original's x gives from its middle there (the V's middle from a fork's 362), measured on the plan
  it stands beside. A solid object's body is at most its board's width in whole texels. Where the road runs on from a
  goal, the objects its goal stretch brings out (its stands among them, on the road taken) are passed through (K,
  2026-10-20, for now).
- **Gates.** The grid on COCONUT BEACH; a checkpoint `<STAGE>-CP` in each stage after a fork where the fork's banner's
  left half (the entry of drawing 6 of type 60, its point at 398, the first brought out) passes the car, 10.8 positions
  into the stage, just after the roads have closed to six lanes (the original grants its time there, 0x4812; a stage
  after a join has none); at each stage of row 5's 1948 a checkpoint `<STAGE>-GOAL` where the
  road runs on, else the finish.
- **Skies.** Each stage's Sections show its sky, facing at the stage's GO as the original's scroll starts there (0): its
  yaw origin there, and the same direction in the world in every Section that shows it. It comes in by `wipe` in a
  fork piece, 6 m before where the car reaches the width 360 (the camera, 6 m behind the car, then reaches the original's
  change), and by `rise` in a join piece where it begins.

A road's name (`routeName`, K, 2026-10-20) is its stages' short names in the order it runs them, each fork's side
between them as the original's map reads it: ▲ where it takes the left fork (up the map), ▼ the right (down). The road
through all 15 is ALL 15 STAGES: its sides alternate only for the look, and follow no way across the map. The goals'
letters and L and R are not written; the courses' ids stay.

| Course           | Name               | Forks | Stages                                                                               |
| ---------------- | ------------------ | ----- | ------------------------------------------------------------------------------------ |
| `outrun-a`       | CB▲GAT▲DES▲WIL▲VIN | LLLL  | COCONUT BEACH, GATEWAY, DESERT, WILDERNESS, VINEYARD (A)                             |
| `outrun-b`       | CB▲GAT▼ALP▲OC▲DV   | LRLL  | COCONUT BEACH, GATEWAY, ALPS, OLD CAPITAL, DEATH VALLEY (B)                          |
| `outrun-c-left`  | CB▲GAT▲DES▼OC▼DH   | LLRR  | COCONUT BEACH, GATEWAY, DESERT, OLD CAPITAL, DESOLATION HILL (C)                     |
| `outrun-c-right` | CB▼DC▼CM▲WF▲DH     | RRLL  | COCONUT BEACH, DEVIL'S CANYON, CLOUDY MOUNTAIN, WHEAT FIELD, DESOLATION HILL (C)     |
| `outrun-d`       | CB▼DC▲ALP▼WF▼AUT   | RLRR  | COCONUT BEACH, DEVIL'S CANYON, ALPS, WHEAT FIELD, AUTOBAHN (D)                       |
| `outrun-e`       | CB▼DC▼CM▼ST▼LAK    | RRRR  | COCONUT BEACH, DEVIL'S CANYON, CLOUDY MOUNTAIN, SEASIDE TOWN, LAKESIDE (E)           |
| `outrun-all`     | ALL 15 STAGES      | LRLR… | All 15 in [the map's order](#outruns-stages), goals A to D checkpoints, E the finish |

The six roads are 24.1 to 24.2 km, 13 to 15 Sections and 9,198 to 11,782 objects each; ALL 15 STAGES is 73.6 km, 48
Sections and 31,940 objects. Their heights reach −185 m and 268 m (the hills' rule, unchanged); 5 to 11 crossings each
are kept 6 m apart, ALL 15 STAGES' 31. In each goal stretch the GOAL gate (type 210: pillars of sprite 25, the banner
134 and 135) stands at about 321 to 327, before where the original's car stops (401) and drives under it; the stands
(types 209, 208 and 204) and DESOLATION HILL's ending crowd (type 206) stand from about 325 to 435, and the second gate
types 208, 206 and 204 hold (the banner at y 352, pillars at ±320) at about 413 to 419, beyond 401.

## Profile

A stage's profile turns its height tables' look on the original's screen into grades this game's camera shows alike
(`npm run road-data -- look` reports it for every stage):

- **Tables.** The height points run their tables as the [hills](#hills) do (`tableRuns`), holds counted at the top
  speed, 293 km/h, at the same road positions as before RD-10e: `c_look` was fitted with the camera at the road
  position, and is kept until the hills are made again. A table still running at the stage's end ends there, and
  the road beyond the stage is level but for the grades returned: in the original it runs on into the fork, where on
  COCONUT BEACH its crest throws the car into the air at 200 km/h just before the fork's curve.
- **Grades.** Each entry slid past the camera changes the grade by `c_look` × entry / 576 over its span, ending where
  the camera passes it: kind 0's entries, and kind 3's while they slide in. A shape held on the nearest segment changes
  it by `c_look` × entry / 576 for each 2.125 × step positions it is held at full share, half over its rise and its
  return: kinds 1's and 2's first entry, kind 3's held entry; it stops where the grade reaches ±0.393 (`STEEPEST`), the
  steepest a slid table reaches from level (0x3C's, 0x3B's, 0x2F's and 0x32's). Kind 4 changes no grade and the
  horizon's base is kept (until footage shows kind 4, K's decision).
- **`c_look`.** 0.131 for entries slid past and 0.55 for held shapes (`LOOK`), fitted on COCONUT BEACH by least
  squares of the road's top as rows above each level road's top over the screen's height: the original's level top
  151 of 224 rows, this game's 122.4 of 240. This game's top is the least row of the road from 2.5 m to 200 m ahead of
  the product camera standing at rest: 6 m behind the player at 2 m above the road there, pitched with the road's grade
  there. The slid value is fitted from 200 m before each kind 0 table to its end, then the held value about the kind 1
  table, the grades left by the tables not returned for the fit. One value cannot serve both: as a crest sharpens, this
  game's top falls by about the square root of its curvature where the original's falls in proportion, so a held
  shape fitted with the slid value shows about 5 of the original's 18 rows.
- **Grades left.** The grade a table leaves (where its entries do not sum to 0, and a held shape's) is returned to 0
  over the stretch to the next table's start, the last's over the stretch to the road's end; where that stretch is
  empty, it is carried to the next.
- **Closed.** A grade still left at the road's end (a table running to it) is returned to 0 over its last 200 m; then
  the road is tilted by one constant grade, taken over its first 200 m and left over its last, so that it ends level
  at height 0 as it begins, where its ends join other roads.
- **Crossings.** Where a plan passes over itself (pairs of stations at least 200 m apart whose cross-sections, to the
  edge bands, overlap between them and the next position), its passages are kept at least 6 m apart, crossing by
  crossing in running order, then again while a bump placed later has brought one nearer (K's decision). Where a
  crossing's passages are nearer, they take levels, of two passages the lower first (the earlier where level), of more
  in running order, each the lowest no passage it overlaps holds; each moves by its level less their mean times a
  spacing, grown from what 6 m lacks by 0.2 m until every overlapping pair is apart, so of two the higher is raised and
  the lower lowered. A passage's bump is smooth at its middle, but of a crossing of more than two passages, which hold
  their levels, flat over a passage that a smooth bump would hold at less than 10/11 of its rise; it rises over the
  shortest half from 100 m by 20 m that moves this game's top by at most 1 row, short of the next passage at another
  level. Where the bumps grown by 40 m cannot keep a crossing apart, all its bumps are flat. Passages nearer than 6 m by
  no more than a micrometre are apart. OUTRUN's crossings are of two passages, and SUPER HANG-ON's passages that
  overlaps join make one crossing.
- **Knots.** Each stretch of constant curvature is a PVI at the intersection of the tangents at its ends, its station to
  1e-9 m (finer than a station's µm, so that both tangents' grades hold), its curve 2 µm shorter at each end so curves
  that meet stay apart; stretches break at the Sections' cuts, and a knot next to a
  cut lies on the cut's tangent, so joined Sections' heights and grades agree.

On COCONUT BEACH the road's top is 12 rows from the original's on average (in the original's rows). The tables'
highest and lowest tops, and the least load at 293 km/h over each table (below 0 the car leaves the road):

| Table at | Kind | Original's tops | This game's tops | Least load |
| -------- | ---- | --------------- | ---------------- | ---------- |
| 1        | 0    | 112.5 to 191.6  | 120.5 to 170.8   | −1.3 g     |
| 360      | 0    | 116.9 to 179.9  | 121.8 to 165.1   | −0.2 g     |
| 1044     | 0    | 101.4 to 187.1  | 111.6 to 170.2   | −1.3 g     |
| 1600     | 1    | 151 to 169.1    | 112.9 to 166.8   | −0.5 g     |
| 1824     | 0    | 110.2 to 191.4  | 112.9 to 170.7   | −1.3 g     |

Kind 0's crests ahead fall 15 to 21 rows short of the original's and their rises 5 to 12; no rule of one value per
kind brings them within 3 rows, so they are built by the least squares match (K's decision); the kind 1 table's look
is within 3 rows while it is held. The tables leave grades of −0.131, 0, +0.262, −0.37 and −0.131; the kind 1 table's,
returned over the 96 positions to the next table, raises the top 38 rows above the original's as the camera nears it.
The last table ends at the stage's end. The road lies from −72.4 m to 76 m, its steepest grade 38.5 %; the crossing's
passages are 57.3 m apart without a bump.

## OUTRUN's stages

The stages are named as the original's map names them, matched to the stage table (0xE49C, row r from 8r) by their
scenery (K accepted the match): row 1 0x3C COCONUT BEACH; row 2 0x1E DEVIL'S CANYON, 0x3B GATEWAY; row 3 0x20 CLOUDY
MOUNTAIN, 0x2F ALPS, 0x2A DESERT; row 4 0x2D SEASIDE TOWN, 0x35 WHEAT FIELD, 0x33 OLD CAPITAL, 0x21 WILDERNESS; row 5
0x32 LAKESIDE, 0x23 AUTOBAHN, 0x38 DESOLATION HILL, 0x22 DEATH VALLEY, 0x26 VINEYARD (`OUTRUN_NAMES`). On the map,
from the left fork's side: COCONUT BEACH; GATEWAY, DEVIL'S CANYON; DESERT, ALPS, CLOUDY MOUNTAIN; WILDERNESS, OLD
CAPITAL, WHEAT FIELD, SEASIDE TOWN; VINEYARD (A), DEATH VALLEY (B), DESOLATION HILL (C), AUTOBAHN (D), LAKESIDE (E).
A stage's short name (`OUTRUN_SHORT_NAMES`), which the roads' names write, is a name of two words' initials, or one
word's first three letters. Numbered in the map's order (from the left column to the right, within a column from the
left fork's side down), which is also the order ALL 15 STAGES runs them:

| Number | Stage           | Short name |
| ------ | --------------- | ---------- |
| 1      | COCONUT BEACH   | CB         |
| 2      | GATEWAY         | GAT        |
| 3      | DEVIL'S CANYON  | DC         |
| 4      | DESERT          | DES        |
| 5      | ALPS            | ALP        |
| 6      | CLOUDY MOUNTAIN | CM         |
| 7      | WILDERNESS      | WIL        |
| 8      | OLD CAPITAL     | OC         |
| 9      | WHEAT FIELD     | WF         |
| 10     | SEASIDE TOWN    | ST         |
| 11     | VINEYARD        | VIN        |
| 12     | DEATH VALLEY    | DV         |
| 13     | DESOLATION HILL | DH         |
| 14     | AUTOBAHN        | AUT        |
| 15     | LAKESIDE        | LAK        |

Each stage has its own sky, `outrun-<stage>-sky` (`skyName`), horizon row 320. As published it is a copy of the generic
sky most like the stage's scenery (`OUTRUN_SKIES`), written by `road-data course`: sky-coast (COCONUT BEACH), sky-cliff
(DEVIL'S CANYON), sky-country (GATEWAY, WILDERNESS), sky-overcast (CLOUDY MOUNTAIN), sky-mountain (ALPS), sky-desert
(DESERT, DEATH VALLEY), sky-seafront (SEASIDE TOWN), sky-farm (WHEAT FIELD, VINEYARD), sky-town (OLD CAPITAL), sky-lake
(LAKESIDE), sky-forest (AUTOBAHN) and sky-alpine-dark (DESOLATION HILL). A
[local original](development.md#local-originals) of its name replaces it.

## Checks on `k1`

`k1` checks COCONUT BEACH against the ROM's events, using only time × the displayed speed and ratios within a row. Its
position is the displayed speed's integral from GO, re-timed monotonically through the events matched below. The
analysis and its side-by-sides, `k1`'s frame beside this game's drawing every 50 positions, lie in `reference-media/`
and are not committed.

- **Curves.** The background stands still on a straight. The still stretches matched to the ROM's straights in turn
  give 16 joins of a curve and a straight. The integral's lag behind the ROM grows from 0 to about −55 positions over
  the stage. Through the others, a join is predicted within 0.6 to 17 positions (median 9; the last, 30), not 2: the
  original advances its position by `(R + car_x/40) / R` on a curve, which the integral does not follow.
- **Hills.** `k1`'s road top, climbed from the bottom, against the [hills](#hills)' extremes:

  | Table at | Kind | Rule's top   | `k1`'s   |
  | -------- | ---- | ------------ | -------- |
  | 1        | 0    | 112.5, 191.6 | 107, 199 |
  | 360      | 0    | 116.9, 179.9 | 120, 181 |
  | 1044     | 0    | 101.4, 187.1 | 100, 187 |
  | 1600     | 1    | 169.1        | 163      |

  Four of the seven extremes are within 3 rows. `k1` ends before table 1824.

- **Width.** The road's edges lie off the screen on the car's row: the road there is 10.3 m, about 410 px. The lane
  lines either side of the car stand `k1`'s median 136.0 px apart there, this game's lane 137.6 px at its 40 px/m.
- **Start.** The start line's place is checked with the scenery, which places the start gantry.

## SUPER HANG-ON

SUPER HANG-ON's courses are raised from MAME's `shangon`, the export sitdown/upright set (unprotected): the cabinets'
courses differ, and K chose this one. Its ROM set, programs and tables are described here as
[Stage SH](NEXT.md#stage-sh--super-hang-on-from-the-roms) reads them.

### SUPER HANG-ON's ROM set

Each CPU's program is two 128 KiB halves, each interleaved from a ROM of its even bytes and a ROM of its odd bytes, as
OUTRUN's are:

| CPU  | Addresses       | Even bytes      | Odd bytes       |
| ---- | --------------- | --------------- | --------------- |
| main | 0x00000–0x1FFFF | `epr-10886.133` | `epr-10884.118` |
| main | 0x20000–0x3FFFF | `epr-10887.132` | `epr-10885.117` |
| sub  | 0x00000–0x1FFFF | `epr-10792.76`  | `epr-10790.58`  |
| sub  | 0x20000–0x3FFFF | `epr-10793.75`  | `epr-10791.57`  |

The main CPU's 0x30000–0x3FFFF holds what its 0x10000–0x1FFFF holds; the tool checks that it does and reads the tables
at the latter. Each ROM is checked by its size and its CRC-32 (`SUPER_HANG_ON_PROGRAM_ROMS`), and each zip entry
against the CRC-32 its archive records; another ROM set is refused. K's set matches:

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
pixels, two bit planes of 64 bytes a line one after the other. Each is checked as the programs are. The sound ROMs are
not read.

### SUPER HANG-ON's programs

Both CPUs are 68000s, as OUTRUN's are. Every amount below is read from its instruction after the instruction is
checked.

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
  [palette words](#palette-words), half 0 then half 1. The road hardware draws a pixel of value p in the pair at
  `0x7F6 ^ 2p`: the surface (pixel 0) is +10, the lines (1) +C, the edge bands (2) +8, and the centre line (a 3 among
  the middle eight columns) +4, the other way round from OUTRUN's names; the other 3s are the ground.
- **Curves.** {signed word position, word radius in positions, word kind: 1 straight, 2 right, 3 left}, ending at
  position −1. They follow the road path only roughly ([SUPER HANG-ON's plan](#super-hang-ons-plan)).
- **Heights.** {word position, word height table (1 from), word 0, word 0}, ending at position 0x7FFF. Height table t is
  the long at 0x1A48 + 4(t − 1) on the sub CPU: vertical heading vectors {signed word x, signed word y}, (0, 4096)
  level, ending at (0, 0). They are dumped for the hills to come; the road is level.
- **Scenery points.** {word position, u8 count, u8 type}, ending at a negative position
  ([Placing SUPER HANG-ON's scenery](#placing-super-hang-ons-scenery)).
- **Road paths.** Section n's is the long at 0x19E8 + 4n on the sub CPU: a heading vector {signed word x, signed word y},
  about 4096 long, for each of its 2049 positions. Every section's starts and ends with (0, 4096).
- **The goal.** The last section runs into the goal: the longs at 0x1801A are its curves' and heights' addresses, then
  course c's scenery's at 0x18022 + 4c; its road path is the one the sub CPU's `move.l #path, ($604F0).l` at 0x11B2
  loads, 200 positions straight ahead.
- **Stripes.** 32 tables at 0xEA6A, one a phase, of a word for each of the road's 192 lines, which the program copies to
  the road's line colors. The phase is the low five bits of the word at 0x260090, which gains v / 34 a tick (`moveq
#$22, d2` at 0x6594). Bits 0, 1, 3 and 8 (surface, lines, centre line, ground) choose half 1 and switch together; bit
  2 (the edge bands) switches twice as often.
- **The ground's change.** From position 1930 the ground's pair steps to the next section's in 32 steps, one each two
  ticks (`addi.w #$80` on its step's word at 0x69BC, to the 32nd, `cmpi.b #$1F` at 0x69C4): at step s (0 from) each
  channel is c₀ + ⌊(s + 1)(c₁ − c₀) / 32⌋.

### SUPER HANG-ON's sprites

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
  +0x16 u8 palette … +0x1A long size list … +0x26 word depth, +0x28 signed word x, +0x2C signed word lift}, the left
  and right legs, the signal, the left and right corners and the banner. Its parts are drawn at x × line / 191 and lift
  × line / 192 pixels on a road line. The START banner's palette is its template's (0x2E); the CHECK and GOAL banners'
  are set as the gate comes out (`move.b #$2F, ($16, a0, d0.w)` at 0x6E40, `#$30` at 0x6DFC).
- **Grids.** The rivals' places at GO on course c: seven {word depth, signed word x} at 0x86C0 + 28c.

### SUPER HANG-ON's backgrounds

Course c's section k (0 from) shows background number the byte at 0x9EB4 + 9c + k. Background b's palettes: the long
at 0x1E06 + 4b addresses {word count − 1, then byte pairs {palette, source}}, palette taking the 8 words at
0x21F2 + 16 × source. Its tile map, 256 columns (four pages of 64) of 32 rows, is drawn in eight steps, the longs at
0x9ED8 + 4(base + 8k + s), base course c's byte at 0x9EA0; a step is {word parts − 1, then parts {word column, word row,
long content}}, a content {word width − 1, word height − 1, then its tile words row by row}, columns wrapping at 256.

### SUPER HANG-ON's dump

`npm run road-data -- super-hang-on-read` ([Development](development.md#road-data-commands)) checks and reads the ROM
zip and writes `superoutride.super-hang-on-road-data` version 1, `super-hang-on.json` in its dump directory: the ROMs'
names and CRCs; the sections' positions; the courses; every section (number, block, sky, colors as words and RGB555,
curves, heights, scenery, road path); the goal; the height tables and scenery types the points name; the stripes; the
sprites the scenery shows (size list, sizes, hit width); the gates' parts with their sizes and the banners' palettes;
the palettes these use; the grids; and each section's background (number, palettes, tile map). It refuses a section
that runs in more than one course and a sprite past the table.

### SUPER HANG-ON's plan

The road is the road path P itself: one road, no width points. Each section's path becomes straights and arcs over its
2049 positions (`sectionPlan`); its curves only check it, for they follow the path roughly (radii 0.79 to 1.56 times the
path's, their joints up to 13 positions off):

- **Folds.** A position turning more than 1° off the median of the seven about it (fewer at the path's ends) is a fold:
  its excess is spread evenly over those seven, the sum kept. The headings are rebuilt, and their line laid, each
  position a step along its ends' mean heading.
- **Elements.** From the section's start, each element is the longest that stays within 0.25 m of the line at every
  position it spans, grown a position at a time until eight longer ones in a row miss: a straight where it turns less
  than 0.01°, else an arc turning evenly from heading to heading.
- **Ends.** The first and last elements are straights at the section's end headings, which are every section's, (0,
  4096); each arc turns from the heading the elements before it reach to its end heading, the last arc to the
  section's end heading, so no turn dropped is lost. An arc straighter than 40 km is a straight, its turn carried by the
  next arc (the course format's lengths), and straights one after another are one.

The 24 sections become 1074 elements, 24 to 73 a section; the sharpest arc is 53.3 m (EUROPE's 0x0E, 1001 to 1008);
160 folds are spread. Laid from its start, a section's plan lies at most 2.1 m from its path's line (median 0.6 m).

A course's P is a 6 m straight before GO, the camera's distance behind the bike, then its sections' elements in running
order, then the goal's straight of 260 positions: the original's 200, made longer so that every vehicle stops before its
end (517.8 m past the finish).

### Placing SUPER HANG-ON's scenery

A course's scenery stands where the main CPU's program brings it out and it passes the bike, the program run tick by
tick at the top speed (0xF1) from the course's start, its objects in their order (`courseScenery`):

- **Object 7.** Past the section's last position, the next section begins at 0 with its points.
- **Object 8.** The road advances 0x97 × 0xF1 / 65536 positions.
- **Object 11.** A scenery point is taken when the position reaches it: a cursor at it, its count, its type's pattern
  and first item. While its count lasts and the cursor is at most the position, a step: the cursor moves on a position,
  the pattern turns left once and a counter from 15 counts down, a count spent each time it passes 0; a 1 turned out
  brings out the next item (after the last, the first) into the first free of the eight scenery objects, none if all
  are taken.
- **Objects 12 to 19.** Each object's depth gains the step its speed gives (the word at 0xC5EA + 2 × speed), and at
  0x1FF0 (`cmpi.w #$1FF, d0` at 0x71A0 on the depth's top 12 bits) it passes the bike and stands at the road's position.

Objects still coming when the last section ends stand in the goal's positions; none does. AFRICA brings out 1012
objects (166 found no free object), ASIA 1609 (356), AMERICA 2249 (333) and EUROPE 2898 (357).

### SUPER HANG-ON's courses

`npm run road-data -- super-hang-on-course` ([Development](development.md#road-data-commands)) writes the four LINEAR
courses, `super-hang-on-africa` (AFRICA), `super-hang-on-asia` (ASIA), `super-hang-on-america` (AMERICA) and
`super-hang-on-europe` (EUROPE), conversion version 1, the pictures their objects show and their skies, or with
`--check` fails where one differs:

- **Plane and stations.** Lane a's centre runs 1.8 m left of P on the plane, again straights and arcs: an arc turning
  left is shorter and one turning right longer by 1.8 m times its turn. A course position (section k's position p is
  2049k + p, the goal's after the last section's) is the station across from P there on the plane, as on OUTRUN's
  ([Plan](#plan)). GO, the bike at the first section's position 0, is station 6.
- **Lanes.** a and b, 3.6 m each, either side of P; the centre lane a.
- **Cross-section.** The road ROM draws one road at a size proportional to its line, a feature's edge u units from the
  centre at u × line / 224 pixels (as an object's x, the `divs.w #$E0` at 0x7262): each edge's u is 224 times its
  pixels' slope against the line over lines 60 to 189, the left's and right's mean. The centre line is ±4.42 units, the
  lines 238.14 to 249.79, the shoulder the surface's, the edge bands 259.21 to 293.80. A lane is the road's half to its
  lines' inner edges, 3.6 m as OUTRUN's lane is, so a unit is 0.015117 m. SAND reaches 40 m beyond the edge bands.
- **Colors and stripes.** Over each section's stretch its ground, then its surface over the asphalt (to the edge bands'
  outer edges), then its lines, edge bands and centre line over that, each pair's half 0 over the first half of each
  period and half 1 over the second: 32 × 34 × 0x97 / 65536 positions (5.8556 m), the edge bands' half of it, counted
  from GO along the plane. From position 1930 the ground takes its 32 steps toward the next section's, two ticks each
  at the top speed; the next section's road colors begin at its start.
- **Sections.** One a section, from its position 0 to the next's (the first from the course's start), and one the
  goal's, each cut again where its coordinate domain (to SAND's edges and the vehicles' reach) passes over itself, at
  the middle of the longest straight between the passages, 2 m clear of the gates. They join by lane a.
- **Objects.** Each scenery item stands at its station, its x units right of P, showing its sprite's picture as the
  original shows it (mirrored or not, in its palette), with a body its hit width wide (pixels at the bike's line,
  224/191 units each, either side) or its picture's width where narrower. A picture is its sprite's largest size on its
  texel grid by area majority, a pixel 224/191 units across and 224/191 × the pixel aspect down, its base point the
  middle of its bottom, in every palette it is shown in; the pictures are published, provisionally.
- **Gates.** START, all six parts, its signal lit as at GO, stands where it passes the bike, 1.70 positions past GO;
  each CHECK, five parts, where it passes the bike, 38.31 positions after it comes out (⌈0x1FF0 / the depth step⌉
  ticks at the top speed); GOAL, five parts, at goal position 38.31. A part stands x × 224/191 units right of P, its
  picture lifted lift × 224/192 units. The checkpoints `<course>-CP<n>` are at the CHECK gates and the finish
  `<course>-GOAL` at GOAL.
- **Grids.** The start gate's 16 slots, 12 m apart for cars and 3 m for bikes, the last at GO in lane a, alternate
  lanes.
- **The goal's crowd and the ending.** The goal's scenery points' items stand at goal position 55.7, and the ending's
  figures, as its last frame shows them (K's reading of the original's run: their frames, palettes, x and height
  above the road), at 56.0, where the original's bike stops.
- **Skies.** Section k's (0 from) is `shangon-<course>-<k + 1>-sky`, a copy of `coast-sky` until the backgrounds are
  baked: from its first Section's start, the next section's from 6 m before the bike reaches position 1930 (the
  camera's station as the original redraws the background); the goal's Section shows the last section's. At heading 0
  the original's back layer's pixel 1370 of 1536 is at the screen's middle, here 1370 × 1504 / 1536 of the sky's 1504:
  a Section's yaw origin is 77.0° plus the road's turn from the course's start to its start.
- **Profile.** Level but for the crossings' bumps ([Profile](#profile)), its bends broken at the Sections' cuts.

## TURBO OUTRUN

TURBO OUTRUN's course is raised from MAME's `toutrun` (Turbo Out Run, the Out Run upgrade, FD1094 317-0118); the other
cabinets' sets are only compared. It runs on OUTRUN's board and its program is OUTRUN's remade: where its formats are
OUTRUN's, OUTRUN's sections above describe them, and its own ROM set, programs and tables are described here as
[Stage TO](NEXT.md#stage-to--turbo-outrun-from-the-roms) reads them. Its main CPU's program is encrypted for
instruction fetches alone: the tables are read as the ROMs' bytes, and the program is never decrypted.

### TURBO OUTRUN's ROM set

Each CPU's program is 128 KiB parts, each interleaved from a ROM of its even bytes and a ROM of its odd bytes, as
OUTRUN's are; the main CPU has three parts:

| CPU  | Addresses       | Even bytes      | Odd bytes       |
| ---- | --------------- | --------------- | --------------- |
| main | 0x00000–0x1FFFF | `epr-12513.133` | `epr-12512.118` |
| main | 0x20000–0x3FFFF | `epr-12515.132` | `epr-12514.117` |
| main | 0x40000–0x5FFFF | `epr-12293.131` | `epr-12292.116` |
| sub  | 0x00000–0x1FFFF | `opr-12295.76`  | `opr-12294.58`  |
| sub  | 0x20000–0x3FFFF | `opr-12297.75`  | `opr-12296.57`  |

Every ROM the conversion reads is checked by its size and its CRC-32 (`turbo-outrun-rom.ts`), and each zip entry
against the CRC-32 its archive records; another ROM set is refused. K's set matches: `epr-12513.133` `ae8835a5`,
`epr-12512.118` `f90372ad`, `epr-12515.132` `1f047df4`, `epr-12514.117` `5539e9c3`, `epr-12293.131` `f4321eea`,
`epr-12292.116` `51d98af0`, `opr-12295.76` `d43a3a84`, `opr-12294.58` `27cdcfd3`, `opr-12297.75` `1d9b5677`,
`opr-12296.57` `0a513671`; the road ROM `epr-12298.11` and its copy `epr-12299.47`, both `fc9bc41b` (as OUTRUN's, 256
lines of 512 pixels, the second bit plane at 0x4000); the tiles, one bit plane of 64 KiB each, the lowest first,
`opr-12323.102` `4de43a6f`, `opr-12324.103` `24607a55`, `opr-12325.104` `1405137a`; the sprites, two sets of four, each
ROM one byte of a 32-bit word, the least significant first, `mpr-12336.9` `dda465c7`, `mpr-12337.10` `828233d1`,
`mpr-12338.11` `46b4b5f4`, `mpr-12339.12` `0d7e3bab`, then `mpr-12364.13` `a4b83e65`, `mpr-12365.14` `4a80b2a9`,
`mpr-12366.15` `385cb3ab`, `mpr-12367.16` `4930254a`. The sound ROMs and the key (`317-0118.key`) are not read.

### TURBO OUTRUN's programs

The main CPU's program is encrypted (FD1094) for instruction fetches alone, so its tables read as its ROMs' bytes.
Where the stage's description gives what the encrypted code does, the tool takes it as given and says so. Both CPUs are
68000s; the main CPU's 0x26xxxx is the sub CPU's 0x06xxxx, as on OUTRUN's board.

- **Constants.** The road advances `speed × 0x12F / 65536` positions a tick (the long at 0x1DDEA), as OUTRUN's; the top
  speed without turbo or tune-up is 324 km/h (the word at 0x1DDE2); a right-side object stands by the left road past
  road width 280 (the word at 0x1DE04); scenery is brought out into the 108 objects from object 2 (the words at
  0x228D4).
- **Legs.** The 16 stages run in four legs of four: each leg's first four bytes of its eight at 0x1E018 number its
  stages, 0 to 15 in turn. A stage begins at road width 450 from its leg's start, 220 when played on (the words at
  0x1DE14 + 2n).
- **Names.** The name records at 0x11578, {word screen address, word 0x000D, 14 characters}, spell the stages in turn,
  other records laying dots over them. The names are `TURBO_OUTRUN_NAMES`, WASHINGTON D.C. with the last dot the 14
  characters leave out.
- **Stage blocks.** Stage n's block is the long at 0x1E042 + 4n, nine longs as OUTRUN's: the sky word, the centre
  line's, lane lines', edges' and surface's four palette words each, the ground word, then the curves, widths and
  heights, and scenery, each in OUTRUN's format ([Main CPU](#main-cpu)). The sky word numbers its ramp, the long at
  0x232E0 + 4 × it (64 words); the ground word its 16 words, the long at 0x230A0 + 4 × it, the 15th and 16th its halves.
  Every stage has its gate at scenery point 1358: one CHECK POINT gate (type 3), the last stage's GOAL (type 68).
- **Scenery types.** Type t is the long at 0x39B16 + 4t: {signed word turn (negative turns the pattern's 32 bits, else
  its upper 16), long pattern, u8 items, u8 step}, then 8-byte items {u8 flags (bit 0 mirrors, bit 1 sets its depth to
  the word (b6, b7)), s8 x (× 16 road units), signed word y, word kind, u8 b6, u8 b7}.
- **Kinds.** Kind k's record is the 16 bytes at 0x28038 + 16k: {long size list, s8 hit left, s8 hit right, u8 flags (bit
  0 half scale, bit 1 casts the shadow picture, bit 2 its pixel 10 shades), u8 routine, word palette, word collision
  class (0xFFFF none), two words}. The routine byte indexes the longs at 0x9304. A size list holds sizes of 10 bytes
  {word width, word height, word words a row, u8, u8 bank, word first word}: five, the largest first, but nine for
  routines 0x0C–0x14 and 0x24 and sixteen for 0x18–0x20, the farthest first. Those strips choose a size by depth from
  128 entries {u8 place in the size list, u8 scale}: at 0x2B6E2 for 0x0C–0x14, at 0x2B5E2 for 0x24. The shadow picture
  is the size list at 0x2667A.
- **Palettes.** Sprite palette p is the 14 palette words at 0x2470 + 28p, pixels 1 to 14.
- **The start.** Leg l's start objects: the long and word at 0x7B46 + 8l, items 0 to c of the list it names, each
  setting its depth; item c / 2 − 1 is written over and never shown. The start figures (the code at 0x5446) are the
  stage's description's values, as each stands in the countdown's last tick and the signal at GO (`START_FIGURES`).
- **Backgrounds.** Stage n's background number is the byte at 0x2ABF8 + 8 × its leg + its place in the leg (the same at
  0x1DA52). Its entry at 0x2AC18 + 12 × number is {u8 front rows, u8 back rows, long front data, long back data, word
  offset}, its layers in OUTRUN's format ([Backgrounds](#backgrounds)) but for rows not written, which hold tile word
  0x0020. A leg's start loads tile palettes 8 to 127, each the 8 words at 0x22A56 + 16 × its byte at 0x229DE; each stage
  then applies its patch (`PALETTE_PATCHES`, from the stage's description), so a stage shows its leg's patches to it.

### TURBO OUTRUN's sub CPU

- **Road paths.** Stage n's is the long at 0x1224 + 4n: 1496 heading vectors in OUTRUN's format, beginning and ending
  straight ahead (0, 4096), each turning 0° or ±360°.
- **Height tables** are the longs at 0x2156 + 4 × number, OUTRUN's 225 tables at addresses 0xB4 earlier.
- **Stripes** are the 32 phases of 512 words at 0x109EE, as OUTRUN's.

Where the stage's description says a table is OUTRUN's, the read checks it against OUTRUN's ROM set: the 225 height
tables, the stripes, the approach table (the main CPU's 0x48010, OUTRUN's 0x28000) and the sub CPU's road drawing
(0x1280–0x2155, OUTRUN's from 0x1334), which differs only where it addresses the height tables.

### TURBO OUTRUN's dump

`npm run road-data -- turbo-outrun-read` ([Development](development.md#road-data-commands)) checks and reads the ROM
zip and writes `superoutride.turbo-outrun-road-data` version 1, `turbo-outrun.json` in its dump directory: the ROMs'
names and CRCs; the constants; the legs; the name records; every stage (block, colors, sky ramp, ground, curves, widths
and heights, scenery, road path); the height tables its points name; the stripes; the scenery types, the kinds their
items and the start objects name, the routines, the size lists and the strips' size tables, the shadow and the
palettes; the start objects and figures; each background's layers and each stage's tile palettes with the patches; and
the comparison with OUTRUN's tables. It refuses a ROM set, order, name, path, gate or table that differs from the
stage's description.
