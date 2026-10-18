# Original road data

OUTRUN's courses are raised from the road data in the original's program ROMs. This document owns how those ROMs are
read: the ROM set, its programs, the tables' format and addresses, the dump the road data tool writes, and how a
stage's tables become a course document. What the conversion does not yet cover is
[NEXT](NEXT.md#stage-rd--outrun-from-the-originals-road-data)'s.

The ROMs and any raw data taken from them are not committed and appear in no PR: K's zip lies in
`reference-media/outrun/rom/`, the tool's dumps in `reference-media/outrun/rom-data/`. The formats are read by this
project's own code from this description and the ROMs themselves.

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

## Programs

Both CPUs are 68000s: words and longs are big-endian, and an address is an offset in the CPU's assembled program.

Every stage is 1948 positions long: not a table's value but a constant of the main CPU's program, the
`cmpi.w #$079C, ($260006).l` at 0x870A that compares the road position with it, read from there after its instruction
is checked.

Stage numbers (world edition), stage 1 to 5: 1: 0x3C; 2: 0x1E, 0x3B; 3: 0x20, 0x2F, 0x2A; 4: 0x2D, 0x35, 0x33, 0x21;
5: 0x32, 0x23, 0x38, 0x22, 0x26. Which number lies past which fork, and the stages' names, are given only once the
fork's handling or a video shows them.

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

An object's x is from the left road's centre, but a right-side one's (x ≥ 0) is from the right road's centre unless
the road width exceeds the word at 0xE308 (280) where it appears. Its anchor byte: bits 0–1 put its sprite's left edge
(1), right edge (2) or middle (0, 3) at the object, bits 2–3 its top (4), bottom (8) or middle (0, 12). A pixel of the
largest size spans 2 road units, or 1 where the routine halves the scale twice. The drawings read so far:

| Drawing | Routine               | Anchor (mirrored)   | Pixel | The car hits it               |
| ------- | --------------------- | ------------------- | ----- | ----------------------------- |
| 0       | 0x4048, raised 0x4042 | bottom middle       | 2     | by its extents, on the ground |
| 4       | 0x4658                | bottom middle       | 2     | by its extents                |
| 7       | 0x4828                | bottom right (left) | 2     | by its extents                |
| 8       | 0x3FE2                | bottom middle       | 1     | never                         |
| 9       | 0x492A                | bottom middle       | 2     | by its extents                |
| 1       | 0x4416                | middle left (right) | 2     | never                         |
| 3       | 0x4408                | middle left (right) | 2     | never                         |
| 10      | 0x443C                | middle left (right) | 2     | never                         |
| 11      | 0x4432                | middle left (right) | 2     | never                         |
| 13      | 0x3FE8                | middle              | 1     | never                         |

A hit sets the crash (the word at 0x60C24). The drawings are dispatched by the jump table at 0x3DA2. Drawings 1, 3, 10
and 11 draw a strip beside the road, its edge nearest the road at x, and drawing 13 a patch on it
([Strips and patches](#strips-and-patches)). Drawings 2, 5, 6, 12 and 14 move and are not converted yet.

## Outline boards

`npm run road-data -- boards` writes an [outline board](footage.md#outline-boards) for each sprite OUTRUN's stages show
and the objects standing at the start (of the first stage), mirrored and shadowed as shown: a sprite source
`content/sprite-sources/outrun-<sprite>[-mirrored][-shadowed].png` (a strip's `outrun-strip-<family>`) and its recipe, made into the course image of that
name; with `--check` it rebuilds them and fails where one differs. Its master is the largest size's outline, filled: the
colored pixels and every pixel no transparent path joins to the picture's edge.
Its width is its pixels × their road units × `s_lat` ([Course documents](#course-documents)); its base point at the
bottom or middle its anchor gives, across at the middle of the sprite's hit extents (so a solid object's body stands
there; a strip's at its middle); each palette the sprite is shown in is a palette of the board (`p<palette>`, the lowest its default),
one color, the palette's mean over the colored pixels. A shadowed board's shadow is the original's shadow at its scale
and anchor. The entries of drawings 2, 12 and 14 (moving objects) are not converted.

## Placing scenery

A stage's objects stand where the camera passes them at the top speed, 293 km/h (`stageObjects`):

- **Points.** A scenery point is taken when the road position reaches it and replaces the one before. Each tick after,
  its type's frequency word turns left twice; each turn that carries out a 1 brings out its next entry, from the last
  back, until its count is spent. A tick advances the road `km/h × 0x12F / 65536` positions, 1.35 at the top speed.
- **Approach.** An object brought out appears on the road's first line (the second of a tick's two a 1/64 line nearer)
  and comes nearer by the table at 0x28000: each tick the advance counter gains km/h / 64 units, its remainder carried
  (a unit 64 × 0x12F / 65536 positions), and the object's depth the table's step for its line and that advance. It
  passes the camera at line 512, 134 positions after it appeared at the top speed, and stands there.
- **The start.** An object standing at the start at line L is drawn L / 512 px a road unit: as large as this game's
  camera shows it at f × `s_lat` × 512 / L metres (2687 / L m). It stands there, or where the camera would pass it
  by its approach where that is nearer (lines below about 20). `k1`'s start gantry (line 160, 16.8 m) leaves the top of
  the screen about 5 positions after GO, as it does at that depth; by its approach it would stand 48 m away. The
  original's objects move faster than they look near the start: no one depth fits both.
- **Across.** An object's x is from the left road's centre; a right-side one's from the right road's, unless the road
  width where it appears exceeds 280. Its lateral is that point across from the roads' middle, at the road width where
  it stands, less lane b's centre there (−w, or −(w + 78.67) / 2 below 78.67). An object anchored by an edge stands half
  its width aside, and its board's base point is its hit extents' middle. Its height is y road units.
- **Solid.** An object whose routine tests its extents and which stands on the ground gets a body as wide as its
  extents, at most its board's width; the others pass through (K's rule: the original's hit routines are the mark).

### Strips and patches

A strip or patch is brought out, approaches and stands as an object does (`stageObjects`), with no body:

- **Strips.** Drawings 1, 3, 10 and 11 draw, whatever sprite their entry names, the sprite of 16 sizes the longs at
  0x4548, 0x4608, 0x4588 and 0x45C8 point at (`objectSize`), a size for each depth, the nearest last (232 or 248 by 31
  px). Its edge nearest the road stands at the entry's x, from the road's centre as an object's; it reaches outward,
  drawn mirrored on the left, a pixel 2 road units. Drawing 1 draws flowered grass (GATEWAY, ALPS, WHEAT FIELD, VINEYARD
  and others), 3 the sea's or a lake's edge (COCONUT BEACH, ALPS, SEASIDE TOWN, LAKESIDE), 10 DESERT's sand and 11
  DEATH VALLEY's stones. Its board is the nearest size's, `outrun-strip-<family>`.
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
beyond the road's edge band, as the original's; TRIAL's reference run passes it and takes 86.5 s.

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

`npm run road-data -- course` ([Development](development.md#road-data-commands)) reads the ROM set above and writes each
stage raised as a course to `content/courses/`; with `--check` it rebuilds them and fails where one differs from the
committed document. CI holds no ROM, so the documents are committed; edit the conversion, not a document.

| Course                                 | Stage  | Sections (from position)                        | Conversion |
| -------------------------------------- | ------ | ----------------------------------------------- | ---------- |
| `outrun-coconut-beach` (COCONUT BEACH) | 0x3C   | `coconut-beach-1` (0), `coconut-beach-2` (1243) | 5          |
| `outrun` (OUTRUN)                      | all 15 | [OUTRUN](#outrun)'s                             | 5          |

The conversion, version 6 (`CONVERSION_VERSION`), fits nothing to footage: the constants measured on `k1` use only
ratios within one row and time × displayed speed, and the [profile](#profile)'s `c_look` matches the original's hills
as its program draws them:

- **Length.** A position is 65536 / (3.6 × 30 × 303) = 2.0027 m ([hills](#hills)'s advance per tick). Position 0 is GO,
  the camera's station. The stage's 1948 positions end at its finish; a runout of 225 positions follows on the path's
  look-ahead, which carries on the stage's last segment, a straight.
- **Plan.** Each curve segment, moved back by the path's offset, is a Straight or an Arc over the same positions of the
  path. A straight's heading is the path's two positions inside its ends, where it varies by no more than 0.1°. An Arc
  turns, the side its kind says, from the heading at its start to the heading at its end, each a neighbouring
  straight's or, between two arcs, the path's at their join; its radius is its length over that turn. So the arcs turn
  as the path does between its straights, COCONUT BEACH 360° left; an Arc's radius differs from its curve's R by a few
  percent where a join spreads its turn.
- **Overpass.** COCONUT BEACH's plan passes over itself: its finish crosses its curve from 795, about 1740 m before,
  nearly square. The passages lie in different Sections ([Architecture](architecture.md#plan-authority)), cut at a joint
  between them where the road is one and joined by a Link on lane b; each later Section's sky keeps its direction by the
  heading its frame faces. The [profile](#profile) keeps the passages at least 6 m apart.
- **Road width.** From 0x1C2 (450) at position 0, each width point approaches its target from its position by
  |speed| × 16 / 303 units a position until it is reached or the next point begins; the runout keeps the last width.
- **Lanes.** Each road has three lanes of 472/3 units, its edges ±236 from its centre; the two roads are centred at
  ±road width. The lanes are a, b, c (the left road), a median, and d, e, f (the right road); b, always wider than 0,
  is the centre lane, so the plan's centreline is the left road's centre lane and the original's centre lies one road
  width to its right. At a road width w ≥ 236 every lane is 472/3 and the median 2(w − 236); at 78.67 ≤ w < 236 the
  roads overlap, their outer edges kept, and c and d narrow to w − 78.67, meeting at the original's centre; at
  w < 78.67 c and d are 0 and b and e w + 78.67. A lane or median 0 throughout a Section is left out.
- **Lateral scale.** A unit is `s_lat` = TESTAROSSA's width (its vehicle document's) / (0.5743 × 472/3) = 0.02187 m;
  0.5743 is the player picture's width over the lane spacing on its own row on `k1`. A lane is 3.44 m, against the
  3.45 m lanes (−0.3 %) and 3.30 m by the Beetle's 1.05 (+4.3 %).
- **Strips.** The surface, lane lines, edges and centre line are each two palette words repeated, half 0 and half 1
  (another pattern is refused); each half is 3.158 m of a 6.315 m period counted from GO across the Sections (`k1`'s
  stripes against time × displayed speed). The road is half 1's surface with half 0's over its halves. A line or edge
  is drawn over each half where its color differs from the surface's: on COCONUT BEACH the lane lines in half 1 and the
  edges in half 0. The lane lines are 8 units wide, centred between a and b, e and f, and while c and d are there b
  and c, d and e; the edge bands are 20 units wide outside each road's outer lanes and, where the median holds both
  (w ≥ 256), inside it (both measured on `k1`). A centre line that differs from the surface is refused: its place is
  not yet read.
- **Ground.** SAND 40 m beyond each edge band and in the median. Its colors are provisional until the ground's word is
  read: `k1`'s two sands with its capture's darkening undone by the road's ratio (156 over 148), 28471 in half 0 and
  29528 in half 1 (`k1` pairs the darker sand with the lighter road). The sky is `coast-sky`.
- **Start and finish.** The grid is 16 slots 12 m apart alternating lanes b and c, its last, the player's, in lane c
  (`k1`'s start) the camera's distance (6 m) ahead of GO. The finish is at the stage's length.

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
- **Closed.** The road is tilted by one constant grade, taken over its first 200 m and left over its last, so that it
  ends level at height 0 as it begins, where its ends join other roads.
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

## OUTRUN

`outrun` (OUTRUN) is the whole game as one BRANCH course: the 15 stages of the stage table (0xE49C, row r from 8r),
each a road raised as a [course document](#course-documents)'s is, from GO through what follows the stage's end, with
these differences:

- **Start.** COCONUT BEACH, the entry, starts at road width 450 with the grid; every other stage at 0xD4 (212), the
  width the roads close to at a fork.
- **Sky.** Each stage's Sections show its own sky, `outrun-<stage>-sky` (`skyName`), horizon row 320. As published it
  is a copy of the generic sky most like the stage's scenery (`OUTRUN_SKIES`), written by `road-data course`: sky-coast
  (COCONUT BEACH), sky-cliff (DEVIL'S CANYON), sky-country (GATEWAY, WILDERNESS), sky-overcast (CLOUDY MOUNTAIN),
  sky-mountain (ALPS), sky-desert (DESERT, DEATH VALLEY), sky-seafront (SEASIDE TOWN), sky-farm (WHEAT FIELD,
  VINEYARD), sky-town (OLD CAPITAL), sky-lake (LAKESIDE), sky-forest (AUTOBAHN) and sky-alpine-dark (DESOLATION HILL).
  A [local original](development.md#local-originals) of its name replaces it.
- **Fork.** A stage of rows 1 to 4 ends in the fork stretch (its tables at 0x1DFA4: a straight to its position 63, a
  left curve to 160, a straight to 265, a right curve to 362 and a straight to 384), run as the main CPU's program runs
  it (0x8780 to 0x89B6): the road width the stage ends at is kept; from 63 the roads part by 8 units a position; beyond
  0x168 (360) the route is the side of the roads' middle the car is on (its x positive to the left); beyond 0x300 (768)
  the roads switch, the car carried to the other road's place, and the roads close by 8 a position to 212; the next
  stage begins at 384. Left leads to the next row's stage one to the right in the table, right to the one below it
  (from COCONUT BEACH left to 0x3B, right to 0x1E).
- **Choice.** Where the width reaches 360, a straight of 2 positions holds it (the format's fork zone, which the
  original has not; the curve's pieces either side turn the whole curve's turn): the fork's lock stands 0.5 position
  into it, its closure 1. The roads then part to 768 and switch.
- **Switch.** The stage's last Section runs to the stretch's last straight (362), at least 484 m beyond its lock as
  the Route requires: beyond the switch a road appears beside each, on its far side, where the other stood
  (g, h, i | a, b, c | d, e, f | j, k, l), growing from 0 over a position, and each pair closes to 212 while the two
  pairs keep their median. A Section for each pair then carries it on to the next stage's start, its checkpoint at its
  end (the original's time extension): the left road on its lane b, as the right road of the next stage's pair (its
  centre lane e), the right road on its lane e, as the left (its centre lane b), each joined to the next stage on lane
  b. A stage entered from two forks merges there.
- **Goal.** A stage of row 5 ends in the goal stretch its column names (0xE4EC, its tables by the blocks at 0xE514),
  its road to 600 the runout past the finish at the stage's end, its road width from its own width point; the ending's
  parting of the roads beyond its 182 is not raised.
- **Profile.** Each stage's road, from GO to the next stage's start or the goal stretch's 600, has one
  [profile](#profile), closed level at height 0 at both ends, so the stages a merge joins meet at one height.
- **Sections.** Where a road's coordinate domain (the sand's outer edges and 4 m beyond) passes over itself before its
  fork's Section ends, its passages lie in different Sections: each cut at the last joint before the later passage,
  after the earlier and before the fork's choice, where the road is one (its width under 236). Crossings are looked
  for, and kept 6 m apart, to the same end; the roads beyond it are not checked against the stage's.
- **Names.** The stages are named as the original's map names them, matched to the table by their scenery (K
  accepted the match): row 1 0x3C COCONUT BEACH; row 2 0x1E DEVIL'S CANYON, 0x3B GATEWAY; row 3 0x20 CLOUDY MOUNTAIN, 0x2F
  ALPS, 0x2A DESERT; row 4 0x2D SEASIDE TOWN, 0x35 WHEAT FIELD, 0x33 OLD CAPITAL, 0x21 WILDERNESS; row 5 0x32
  LAKESIDE, 0x23 AUTOBAHN, 0x38 DESOLATION HILL, 0x22 DEATH VALLEY, 0x26 VINEYARD. Each stage's Sections are named
  after it: its first by its name, later ones `-2`, `-3`, its fork's roads `-left` and `-right`; its finish is
  `<stage>-GOAL` and each fork road's checkpoint `<stage>-<side>-CP`.

Its scenery is [placed](#placing-scenery) on each stage's road from its scenery points; the start's objects stand on
COCONUT BEACH. A goal stretch's scenery stands in the ending, whose roads are not raised, and is left out. An object's x is from the middle of the
roads, the fork's two roads' before its switch; one beyond a switch would be left out, and none is. 32,156 objects
stand on OUTRUN, 14,105 of them solid; 14,270 of the rest are strips and patches. A Section writes each run of equal objects without a body at equal spacing as one `repeat` of its first (to within 2 µm); a solid object stands at its own station.

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
