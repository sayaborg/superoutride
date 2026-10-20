# Original road data

OUTRUN's courses are raised from the road data in the original's program ROMs, and
[Stage SH](NEXT.md#stage-sh--super-hang-on-from-the-roms) raises SUPER HANG-ON's from its own the same way. This
document owns how each original's ROMs are read: the ROM set, its programs, the tables' format and addresses, the dump
the road data tool writes, and how the tables become course documents. OUTRUN's sections come first, and
[SUPER HANG-ON](#super-hang-on) has its own. What the conversion does not yet cover is NEXT's
([Stage RD](NEXT.md#stage-rd--outrun-from-the-originals-road-data), Stage SH).

The ROMs and any raw data taken from them are not committed and appear in no PR: K's zips lie in
`reference-media/outrun/rom/` and `reference-media/super-hang-on/rom/`, the tool's dumps beside them in `rom-data/`.
The formats are read by this project's own code from this description and the ROMs themselves.

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
  (0x2A's by 1). The plan follows the path, the road the original draws; the curves, moved back by the path's offset,
  only check its headings and radii. Widths, heights and scenery keep their positions: the original draws them at the
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

A stage's objects stand where the camera passes them at the top speed, 293 km/h (`stageObjects`):

- **Points.** A scenery point is taken when the road position reaches it and replaces the one before. Each tick after,
  its type's frequency word turns left twice; each turn that carries out a 1 brings out its next entry, from the last
  back, until its count is spent. A tick advances the road `km/h × 0x12F / 65536` positions, 1.35 at the top speed.
- **Approach.** An object brought out appears on the road's first line (the first of a tick's two a 1/64 line nearer:
  0x3C76 spawns it at 0x10400, the second turn at 0x10000) and comes nearer by the table at 0x28000: each tick the
  advance counter gains km/h / 64 units, its remainder carried (a unit 64 × 0x12F / 65536 positions), and the object's
  depth the table's step for its line and that advance. It passes the camera at line 512, 134 positions after it
  appeared at the top speed (132.6 from the nearer line), and stands there.
- **The start.** An object standing at the start at line L is drawn L / 512 px a road unit: as large as this game's
  camera shows it at f × `UNIT_METRES` × 512 / L metres (3130 / L m). It stands there, or where the camera would pass it
  by its approach where that is nearer (lines below about 20). `k1`'s start gantry (line 160, 16.8 m) leaves the top of
  the screen about 5 positions after GO, as it does at that depth; by its approach it would stand 48 m away. The
  original's objects move faster than they look near the start: no one depth fits both.
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

On COCONUT BEACH 1507 objects stand, 1101 of them solid, 294 of the rest the sea's edge. Six bushes brought out while the roads were apart end on the
right road where the roads close, as in the original. A beach hut before the finish has hit extents ending 0.6 m
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

The conversion, version 9 (`CONVERSION_VERSION`), fits nothing to footage. A lane is K's 3.6 m over the original's lane
spacing; every other amount is the ROMs', and the [profile](#profile)'s `c_look` matches the original's hills as its
program draws them:

- **Length.** A position is 65536 / (3.6 × 30 × 303) = 2.0027 m ([hills](#hills)'s advance per tick). Position 0 is GO,
  the camera's station.
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
  from the road's start along the plan's stations.

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
left out.

### Plan

The plan is where the original draws the centre lane: its road path P (S's path table, its curves moved back by
`pathOffset`) laid off sideways by the centre lane's centre: at a stage b's (−(w + 70.67 + c) / 2 from the roads' middle, −w at
w ≥ 212), or e's (its mirror) where the stage is entered from a fork's left side. A position's station is the arc length along the plan to the point across from P there
(`OffsetPlan`); everything placed by position (widths, objects, gates, height tables, sky changes) takes it. As
straights and arcs: a straight where P is straight and the offset changes evenly, an arc where P is an arc and the
offset holds, else arcs of at most 2 positions (4 on a straight) turning as the curve does, each joint within 1 cm of
the curve (the largest of the roads 5.1 mm). A corner of the curve (P's curvature changing while the offset changes)
is turned by an arc either side, each turning half of it, no sharper than 120 m and within 3 mm of it. An arc that
would be straighter than 40 km is a straight, its turn carried on; one shorter than a millimetre (two breaks all but
together) is carried on into the next, its length and its turn.

### Pieces

The roads are made of pieces, each one shape whatever comes before or after it (`outrun-pieces.ts`):

- **Stage pieces.** A stage of rows 1 to 4 runs from GO to its fork stretch's 59: its widths, then from the width it
  ends at to 212 at 8 units a position, the corner's vertex at the stretch's 57, so that it ends in six clean lanes,
  level (K's design: the original parts its roads from 63 at the width it ends at). A stage of row 5 runs to 1948 and
  its goal piece follows in the same span. COCONUT BEACH starts at 450 with its grid and start objects.
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
or, GRAND TOUR, all 15 stages in the map's order, row by row and within a row from the left, each of rows 1 to 4 left by
its fork and each of row 5 but the last by its goal and a join, the forks' and then the joins' sides alternating from
L (LRLRLRLRLR, then LRLR). Each span is laid in the world after the one before, the next's centreline on the Link's lane's centre:

- **Sections.** A fork piece is one Section (the centre lane changes at its ends). A last stage entered from the left
  is two, cut at its `GOAL_CENTRE` (1946), its centre lane e before and b after, since the goal's road taken is the
  left one; they join by lane b. A span is otherwise one Section but where its coordinate domain passes over itself: then its passages lie in different Sections, cut at the last joint
  before the later passage, after the earlier, where the road is one (w ≤ 212), joined by its centre lane.
- **Profile.** Each piece's height points run their tables at 293 km/h as the [profile](#profile) says, the stage's cut
  at its end, and each piece is closed level at height 0 at its ends; the whole road's crossings (passages at least
  200 m apart whose asphalt overlaps) are kept 6 m apart.
- **Objects.** The scenery points of the whole road are [placed](#placing-scenery) along it by road position, so the
  objects a stage's last points bring out stand in its fork piece and the fork's in the next stage. Each stands at the
  world point the original's x gives from its middle there (the V's middle from a fork's 362), measured on the plan
  it stands beside. A solid object's body is at most its board's width in whole texels. Where the road runs on from a
  goal, the objects its goal stretch brings out (its stands among them, on the road taken) are passed through (K,
  2026-10-20, for now).
- **Gates.** The grid on COCONUT BEACH; a checkpoint `<STAGE>-CP` in each stage after a fork where the fork's banner's
  left half (the entry of drawing 6 of type 60, its point at 398, the first brought out) passes the camera, about 100
  into the stage (a stage after a join has none); at each stage of row 5's 1948 a checkpoint `<STAGE>-GOAL` where the
  road runs on, else the finish.
- **Skies.** Each stage's Sections show its sky, facing at the stage's GO as the original's scroll starts there (0): its
  yaw origin there, and the same direction in the world in every Section that shows it. It comes in by `wipe` in a
  fork piece and by `rise` in a join piece.

| Course           | Name            | Forks | Stages                                                                               |
| ---------------- | --------------- | ----- | ------------------------------------------------------------------------------------ |
| `outrun-a`       | GOLDEN FRONTIER | LLLL  | COCONUT BEACH, GATEWAY, DESERT, WILDERNESS, VINEYARD (A)                             |
| `outrun-b`       | HEAT HAZE       | LRLL  | COCONUT BEACH, GATEWAY, ALPS, OLD CAPITAL, DEATH VALLEY (B)                          |
| `outrun-c-left`  | DESERT MIRAGE   | LLRR  | COCONUT BEACH, GATEWAY, DESERT, OLD CAPITAL, DESOLATION HILL (C)                     |
| `outrun-c-right` | STORM RIDGE     | RRLL  | COCONUT BEACH, DEVIL'S CANYON, CLOUDY MOUNTAIN, WHEAT FIELD, DESOLATION HILL (C)     |
| `outrun-d`       | OVERDRIVE       | RLRR  | COCONUT BEACH, DEVIL'S CANYON, ALPS, WHEAT FIELD, AUTOBAHN (D)                       |
| `outrun-e`       | BLUE HORIZON    | RRRR  | COCONUT BEACH, DEVIL'S CANYON, CLOUDY MOUNTAIN, SEASIDE TOWN, LAKESIDE (E)           |
| `outrun-all`     | GRAND TOUR      | LRLR… | All 15 in [the map's order](#outruns-stages), goals A to D checkpoints, E the finish |

The six roads are 24.1 to 24.2 km, 13 to 15 Sections and 9,449 to 11,946 objects each; GRAND TOUR is 73.6 km, 48
Sections and 32,897 objects. Their heights reach −185 m and 268 m (the hills' rule, unchanged); 5 to 10 crossings each
are kept 6 m apart, GRAND TOUR's 30. Past each goal's line, DESOLATION HILL's ending crowd (type 206) and the goal
stands (type 209) stand on the road taken, beyond where the original's car stops (401).

## Profile

A stage's profile turns its height tables' look on the original's screen into grades this game's camera shows alike
(`npm run road-data -- look` reports it for every stage):

- **Tables.** The height points run their tables as the [hills](#hills) do (`tableRuns`), holds counted at the top
  speed, 293 km/h. A road position is the camera's station. A table still running at the stage's end ends there, and
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
  edge bands, overlap between them and the next position), its passages are kept at least 6 m apart: where nearer, the higher is raised and the lower
  lowered by one smooth bump each, over the shortest stretch from 100 m by 20 m that moves this game's top by at most
  1 row, grown until every overlapping pair is apart (K's decision).
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
