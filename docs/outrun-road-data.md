# OUTRUN road data

How OUTRUN's ROMs are read (the ROM set, its programs, the tables' format and addresses, the dump the road data tool
writes, and how the tables become course documents). The rules every original is raised by and the parts the originals
share are [Original road data](original-road-data.md)'s.

## ROM set

MAME's `outrun` (Rev. B). Each CPU's program is two 128 KiB halves, each half interleaved from a ROM of its even bytes
and a ROM of its odd bytes, 64 KiB each:

| CPU  | Addresses       | Even bytes       | Odd bytes        |
| ---- | --------------- | ---------------- | ---------------- |
| main | 0x00000–0x1FFFF | `epr-10380b.133` | `epr-10382b.118` |
| main | 0x20000–0x3FFFF | `epr-10381b.132` | `epr-10383b.117` |
| sub  | 0x00000–0x1FFFF | `epr-10327a.76`  | `epr-10329a.58`  |
| sub  | 0x20000–0x3FFFF | `epr-10328a.75`  | `epr-10330a.57`  |

Each ROM is found by the [rules of the originals](original-road-data.md#rules-of-the-originals) (`OUTRUN_PROGRAM_ROMS`).
K's set matches:

| ROM              | CRC-32     | ROM             | CRC-32     |
| ---------------- | ---------- | --------------- | ---------- |
| `epr-10380b.133` | `1f6cadad` | `epr-10327a.76` | `e28a5baf` |
| `epr-10382b.118` | `c4c3fa1a` | `epr-10329a.58` | `da131c81` |
| `epr-10381b.132` | `be8c412b` | `epr-10328a.75` | `d5ec5e5d` |
| `epr-10383b.117` | `10a2014a` | `epr-10330a.57` | `ba9ec82a` |

The sprites are eight 128 KiB ROMs in two sets of four, each ROM one byte of a 32-bit word, the least significant
first (`.12` and `.16` give the most significant byte): `mpr-10371.9` `7cc86208`, `mpr-10373.10` `b0d26ac9`, `mpr-10375.11` `59b60bd7`, `mpr-10377.12` `17a1b04a`, then
`mpr-10372.13` `b557078c`, `mpr-10374.14` `8051e517`, `mpr-10376.15` `f3b8f318`, `mpr-10378.16` `a1062984`
(`OUTRUN_SPRITE_ROMS`), found as the programs are.

The tiles are six 32 KiB ROMs, three bit planes of two ROMs each ([Backgrounds](#backgrounds)): `opr-10268.99`
`95344b04`, `opr-10232.102` `776ba1eb`, `opr-10267.100` `a85bb823`, `opr-10231.103` `8908bcbf`, `opr-10266.101`
`9f6f1a74`, `opr-10230.104` `686f5e50` (`OUTRUN_TILE_ROMS`), found as the programs are.

The sound program is `epr-10187.88` `a10abaa9`, and the PCM samples six 32 KiB ROMs, banks 0–5
([Voices and effects](#voices-and-effects)): `opr-10193.66` `bcd10dde`, `opr-10192.67` `770f1270`, `opr-10191.68`
`20a284ab`, `opr-10190.69` `7cab70e2`, `opr-10189.70` `01366b54`, `opr-10188.71` `bad30ad9` (`OUTRUN_SOUND_ROMS`),
found as the programs are.

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
  positions, of which a fork piece uses 63 to 431.5; the goal stretches' at 0x3ACA0, 624 positions shared by all five;
  past them the vectors are no longer 4096 long.
- **Paths against curves.** Over each curve the path turns by 1/R a position, left where kind 3 says, right where 2
  says (the measured radius within 2.3 % of R in every stage). Every stage's path turns 0° or ±360° over its 1948
  positions and lines up with its curves (`pathOffset`), but for stage 0x38's, which runs 48 positions ahead of them
  (0x2A's by 1). At a join the path turns over a position or two by more than its curves' rates (up to 5° on 0x2A,
  most of whose join vectors also differ in length), a turn the original draws. The plan follows the path alone, the
  road the original draws; the read (`outrun-read`) prints the path's offset against the curves and their radii, and
  nothing else uses the curves. Widths, heights and scenery keep their positions: the original draws them at the
  same road positions as the path. The original's curves push the car outward, so on stage 0x38 the curves the player
  sees and the curves that push the car lie 48 positions apart.
- **Height tables.** The long at 0x220A + number × 4 is a height table: {u8 kind, u8 step}, then by kind:
  - 0: u8 descent factor, u8 ascent factor;
  - 1 and 2: word wait;
  - 3: a word;
  - 4: word horizon, and no entries.

  The entries, signed words, follow from the table's fifth byte and end at −1. A table of another kind is refused.

## Sprites

A sprite is drawn from the sprite ROMs' words ([ROM set](#rom-set)), set 1's after set 0's, in banks of 0x10000 words:

- **Sizes.** The long at 0x11ED2 + sprite × 4 addresses its five sizes, the largest first, each {word width, word height,
  word words a row, word bank (its low byte), word first word in the bank}.
- **Palettes.** Palette p is the 16 palette words ([Palette words](original-road-data.md#palette-words)) at 0x14ED8 + p
  × 32, slot 0 transparent.
- **Hit extents.** The signed words at 0x1212A + sprite × 4: how far left and right of its object, in road units, the
  car hits it.
- **Shadow.** A shadowed object casts the size list at 0xFF56 (192 × 7 pixels at its largest), drawn at the object's
  scale and anchor.
- **Objects.** A scenery entry's drawing chooses its routine, which sets its anchor, its scale and whether the car hits
  it; a routine also draws the sprite's size its scale selects. The objects standing at the game's start are the
  16-byte records counted by the word at 0x2B6E, {u8 flags, u8 anchor, u8 priority, u8 palette, word sprite × 4, signed
  word x in road units, word y × 128, word depth, long routine}, and the flag waver ([Banners and the flag
  waver](#banners-and-the-flag-waver)); the figures after each goal stand before the stopped camera ([The figures after
  the goals](#the-figures-after-the-goals)).

An object's x is from the left road's centre, but a right-side one's (x ≥ 0) is from the right road's centre, unless
the roads were apart as it appeared (the original's road width, straight between its points, over the word at 0xE308,
280: the spawn sets its flag) and its routine keeps it by the left road then. Its anchor byte: bits 0–1 put its
sprite's left edge (1), right edge (2) or middle (0, 3) at the object, bits 2–3 its top (4), bottom (8) or middle (0,
12). A pixel of the largest size spans 2 road units, or 1 where the routine halves the scale twice. The drawings read so far:

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
| 2       | 0x4144                | bottom left (right) | 4     | never                         | (by the middle)      |
| 12      | 0x428A                | bottom left (right) | 2     | never                         | no                   |
| 14      | 0x4380                | middle left (right) | 2     | never                         | yes                  |
| 5, 6    | 0x46D6, 0x4774        | bottom middle       | 2     | never                         | no                   |

A hit sets the crash (the word at 0x60C24). The spawn dispatches the drawings by its jump table at 0x3DA2 (at 0x3D98).
Drawings 1, 3, 10 and 11 draw a strip beside the road, its edge nearest the road at x, and drawing 13 a patch on it
([Strips and patches](#strips-and-patches)), drawing 14 DESOLATION HILL's sand again. Drawing 2 draws a cloud
([Clouds](#clouds)) and drawing 12 VINEYARD's trees ([VINEYARD's trees](#vineyards-trees)); drawings 5 and 6 are the
checkpoint banner's halves ([Banners and the flag waver](#banners-and-the-flag-waver)).

## Boards

`npm run road-data -- outrun-boards` writes a board for each sprite OUTRUN's stages
(to their length), the fork and goal stretches and the objects standing at the start (of the first stage) show,
mirrored and shadowed as shown, and the figures after each goal: the course image
`outrun-<sprite>[-mirrored][-shadowed]` (a strip's `outrun-strip-<family>` and its edge's `outrun-strip-<family>-edge`,
a figure's frame no sprite names `outrun-frame-<address>`); with `--check` it rebuilds them and fails where one differs. Each is made from the largest
size's pixels on its texel grid at 40 texels/m (`sceneryBoards`):

- **Scale.** A road unit is `UNIT_METRES` = 3.6 × 3 / 424 = 0.0254717 m (a lane, 424/3 units, is 3.6 m). A pixel spans
  its routine's road units across and 15/14 of them down (`PIXEL_ASPECT`: the original's 320 × 224 pixels are shown at
  4:3). A pixel of 2 units is 2.0377 texels across and 2.1833 down; one of 1 unit half that.
- **Sampling.** By [chosen lines](original-road-data.md#chosen-lines) (`chosenLines`), each axis at its pixel's texels:
  a pixel of 2 units is two texels across and down, one more where a window's chosen line repeats, so a line a texel
  wider stands where the picture is flat. A mirrored board is the unmirrored board's output mirrored. Every board keeps
  the size the scale rounds to.
- **Picture.** The board's indices are the largest size's own pixels (a strip's, cloud's or trees' its nearest size's,
  [Strips and patches](#strips-and-patches)), and each palette the sprite is shown in is a
  palette of the board (`p<palette>`, the lowest its default) in that palette's own colors. The pictures are the
  ROMs', committed and shown on Pages provisionally: the product draws its own.
- **Base point.** On its bottom edge, but what lies on the ground ([Lying boards](original-road-data.md#lying-boards))
  at the bottom or middle its anchor gives, and a picture with a shadow at its foot at its foot ([Foot
  shadows](original-road-data.md#foot-shadows)). Across, an object anchored by an edge that has no body (its routine
  never hits: the strips) stands by that edge (`standsByEdge`), and its base point is there; any other's is at the
  middle of the sprite's hit extents, so a solid object's body stands there.
- **Shadow.** A shadowed board's shadow is the original's shadow by chosen lines at the board's scale (a figure's at
  3/8 of it) and at its anchor.

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
  the first free of the scenery's 79 slots (3 to 81); with none free it is not brought out, its count spent.
- **Approach.** Every object, one brought out this tick too, then comes nearer once: its depth gains the table at
  0x28000's step for its line and the tick's advance (advance × line × 0x400, half for drawing 2, the clouds). An object
  reaching line 512 vanishes, passing the car, and stands at that tick's road position: 34 ticks (46.06 positions)
  after it appeared at the top speed, a cloud 66 (89.4). This approach, counted once a tick, put every object about
  87 positions farther from 2026-10-18 (RD-4) to RD-10e. At the top speed 48 to 78 objects live at once; on the two
  roads through CLOUDY MOUNTAIN one object finds no slot, its type 34 at 1063.
- **The start.** The 69 objects standing at the game's start take slots 3 to 71 at their lines from GO and approach as
  any other. An object at line L is drawn L / 512 px a road unit: as large as this game's camera shows it at
  f × `UNIT_METRES` × 512 / L metres (3130 / L m) from the camera, which stands at the road's entry at GO. It stands
  there, or where it passes the car by its approach where that is nearer: 26 of them by their approach (the edges'
  objects at lines 110 and below, those at 16 and below 55 to 101 m from the entry), 43 by their size (the edges' from
  line 106, the START gate, the people and the flag waver). `k1`'s start gate (line 160, 19.6 m) leaves the top of the screen about 5
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

A strip or patch is brought out, approaches and stands as an object does (`roadObjects`), with no body:

- **Strips.** Drawings 1, 3, 10 and 11 draw, whatever sprite their entry names, the sprite of 16 sizes the longs at
  0x4548, 0x4608, 0x4588 and 0x45C8 point at (`objectSize`), a size for each depth, the nearest last (232 or 248 by 31
  px). Its edge nearest the road stands at the entry's x, from the road's centre as an object's; it reaches outward,
  drawn mirrored on the left, a pixel 2 road units. Drawing 1 draws flowered grass (GATEWAY, ALPS, WHEAT FIELD, VINEYARD
  and others), 3 the sea's or a lake's edge (COCONUT BEACH, ALPS, SEASIDE TOWN, LAKESIDE), 10 DESERT's sand and 11 DEATH
  VALLEY's stones. Drawing 14 (0x4380) is the sand strip again, kept by the left road where the roads were apart and
  setting no surface effect: DESOLATION HILL's sand before its goal (types 206 and 207 of the goal stretch), 79 at the
  top speed. Its board, `outrun-strip-<family>`, is its nearest size at that edge, extending sideways away from the road
  (`extend`: right, or left mirrored), its edge's shape a board of its own ([Extending
  boards](original-road-data.md#extending-boards)). The grass and stones rise from the ground, standing on their bottom
  edge; the sea's or a lake's edge and the sand lie on it ([Lying boards](original-road-data.md#lying-boards)).
- **Depth.** From line 256 on (half its approach) the nearest size is drawn at the objects' scale; before it, the size
  its line chooses (one each 16 lines) at line 256's scale, as wide but fewer rows, so a far strip lies flatter
  than a near one and no narrower. A board is one picture at every depth, reduced as the camera draws it: a far strip
  stands as tall for its width as a near one, and narrows. An extending board repeats its nearest size at one size to
  the frame's edge, where the original shrinks the far sizes outward (the sand and stones); standing on its bottom
  edge at the original's middle anchor's place, the grass and stones stand half their height higher (K, 2026-10-22).
- **Far sizes.** The far sizes of the sea, sand and stones are the nearest shrunk, (k + 1)/16 across and their own
  rows' share of the nearest's down, with what lies beyond it: size k covers 16/(k + 1) times the nearest's width. The
  grass's far sizes are not shrunk across, so its nearest size repeats outward. No board is restored from them.
- **Patches.** Drawing 13 draws its entry's sprite on the road, its middle at x, a pixel 1 road unit: DESERT's and
  DESOLATION HILL's drifts of sand, 248 by 31 px. Each lies on the road ([Lying
  boards](original-road-data.md#lying-boards)), with no material (K, 2026-10-25).
- **Effect.** Drawings 1, 3 and 13 set the road's surface effect (the words at 0x60C20 and 0x60C22) where the car is
  on them, near the camera: for 12 frames a spray from the table at 0xAD06 is drawn at the car, by the effect's kind
  (sea 0, grass 4 or 8, sand 12). Nothing else reads it: they change no driving. Drawings 10 and 11 set nothing. The
  spray is not converted.

### OUTRUN's extending boards

OUTRUN's cuts, in texel columns of the nearest size:

| Strip                         | Width | Edge `[start, repeat)` | Repeats `[repeat, end)` |
| ----------------------------- | ----: | ---------------------: | ----------------------: |
| 4246 CLOUDY MOUNTAIN's clouds |  1011 |                   9–53 |                  53–787 |
| 435c VINEYARD's trees         |   456 |                  5–222 |                 222–342 |
| 4548 grass                    |   473 |                  5–149 |                 149–401 |
| 4588 sand                     |   505 |                  5–330 |                 330–468 |
| 45c8 stones                   |   505 |                  8–112 |                 112–432 |
| 4608 sea and lakes            |   505 |                  5–169 |                 169–308 |

### OUTRUN's lying boards

On OUTRUN's roads the sea and lakes (drawing 3, `outrun-strip-4608`, on COCONUT BEACH, ALPS, SEASIDE TOWN and LAKESIDE),
the sand strips (drawings 10 and 14, `outrun-strip-4588`) and the patches of sand (drawing 13, `outrun-001`) lie with no
material: under them is the road's `ASPHALT` or the ground's `SAND` (K, 2026-10-25). ALPS's grass strip at the original's lowest
height (−32768, 894 m below the road), never seen, is not placed.

### Clouds

Drawing 2 (0x4144), on CLOUDY MOUNTAIN alone (its points' types 10, 117 and 119; 7 and 120 have cloud entries no
point uses), is a cloud: 272 at the top speed. The original approaches it at half the rate (0x28000's step shifted
right once) and draws it at screen row horizon × (1 − z/512) (the horizon row at 0x260510, the flat road's top, 151),
its palette the byte at 0x426A by its depth (205 at every depth, whatever its entry's), its x not its entry's: the spawn
(0x3EFC) anchors it by its bottom left edge 32 pixels left of the screen's middle, or mirrored by its bottom right edge
32 pixels right (a pair overlaps 64), and the road's bends scroll it across. Its sizes are the 9 the longs at 0x4246
point at (0x11BD0 to 0x11C20, 248 wide, 31 to 1 rows, the nearest first): nearer than line 256 the size and zoom the
table at 0x30900 gives, from it the nearest at the line's scale. A far size is the nearest squashed down, the same
across, drawn 1:1, so far off a cloud covers 16 times the nearest's width.

Something approaching at half the rate looks as something standing still twice as far and twice as large does, so a
cloud stands still:

- **Scale.** A pixel spans 4 road units (4.0755 texels across, 4.3666 down).
- **Place.** It stands where it passes the car at half the rate (`roadObjects`), its edge 32 of its pixels (128 road
  units) from the roads' middle as the original's is from the screen's, reaching away from it: right from its left
  edge, left mirrored.
- **Height.** Its base point is (2 × 151 + 72) × 15/14 road units (10.2 m) above the road: twice its row above the
  eye, which stays 151 road units at every depth, and the original's eye, 72 (row 223 to 151).
- **Picture.** Its nearest size, 1011 × 135 texels, a board extending sideways away from the roads' middle (right, or
  left mirrored) to the frame's edge, standing on its bottom edge: `outrun-strip-4246` and `-mirrored`, named by the
  family's address as the strips are. No body.

### Banners and the flag waver

The fork stretch's point at 398 (type 60, count 4) brings out the checkpoint: two posts (drawing 4, sprite 16, palette
221, x ±20) and the banner's halves, drawing 5 at x 8 and drawing 6 at x −8, each sprite 10 (CHECK, 224 × 45 pixels) in
palette 42 at y 222. Their routines (0x46D6, 0x4774) draw a raised object as 0x4042 does, its x from the left road's
centre or a right-side one's from the right's, and test no hit; passing the car, 0x4774 sets the word at 0x60B62 to
−1 (0x4812), the checkpoint's time, where 0x46D6 only vanishes (0x481A). The type's entries come out from the last, so
drawing 6 appears on the point's first tick and passes the car first: there the checkpoint's gate stands
([OUTRUN's roads](#outruns-roads)). Each half stands as a raised object does, with no body.

The start's flag waver is drawn by the program at 0x5EA8 from state 9 to 12 (the word at 0x6080C), each state's
lists the two longs at 0x12382 + 8 × (state − 9) point at, of 8-byte blocks {u8 palette, u8 bit 7 x negative and
bits 0–3 the frame's high bits, word the frame's low bits, u8 x, s8 y, u8 depth, u8 bit 7 the list's last, bit 6
mirrored, bits 0–5 ticks}. It stands as the countdown's (state 10) first block shows it, holding up its flag: sprite
98 (its frame, 0x10BAE, is sprite 98's size list), 40 × 96 pixels, palette 12, mirrored, 70 road units left of the
left road's centre. It starts at line 400 (0x5E98) whatever its block's depth and approaches as the start's objects
do, drawn at a quarter of its line's scale, a pixel 1 road unit; its object (0x582E) stands on its bottom middle and
casts no shadow. It stands as the start's objects do: where it looks as large, 3130 / 400 = 7.8 m from the camera,
nearer than where it passes the car.

### VINEYARD's trees

Drawing 12 (0x428A), VINEYARD's trees (type 199's entries, x ±21 by its grass at ±19; 197 and 198 hold the same but no
point uses them), approaches as an object does and stands on the ground by its bottom left edge, or mirrored its right
(0x3E34), its x from the left road's centre or a right-side one's from the right's. It draws, whatever sprite its entry
names, the 9 sizes the longs at 0x435C point at (0x10410 to 0x10460, 224 wide, 63 to 3 rows, the nearest first):
nearer than line 256 the size and zoom the table at 0x30A00 gives, from it the nearest at half the line's scale (a
pixel 2 road units), in its entry's palette, 228. It tests no hit, so it has no body.

A far size k (to 7) is the nearest shrunk to (8 − k)/8 across and down with more trees beyond, covering 8/(8 − k)
times the nearest's width; size 8, 3 rows, is too small to read. Its board, `outrun-strip-435c`, is its nearest size,
456 × 138 texels, standing on its bottom edge and extending sideways away from the road as the strips do. 1343 trees
stand at the top speed.

### The figures after the goals

After its goal the original stops the camera at the goal stretch's 0x191 = 401 (0xA15E to 0xA1EA: from 0x163 it
lets off the accelerator and brakes, from 0x18E it enters the scene, at 0x191 it stops the car) and plays the goal's
scene before it, the goal's number g the byte at 0xE4EC for the stage: 0 LAKESIDE, 1 AUTOBAHN, 2 DESOLATION HILL, 3
DEATH VALLEY, 4 VINEYARD. The set-up at 0x5890 makes its objects: the car, its door and its inside (0x124B0, 0x124D8,
0x12500), and by the program at 0x5B42 the man (object 4, its lists at 0x12528), the woman (6, 0x12550), the third's
first half (8, 0x12578), the effect's first half (10, 0x125A0) and at goal 4 a ninth figure (9, 0x12618), each with
two longs at its table + 8g (its lists now and next) of 8-byte blocks {u8 palette, u8 bit 7 x negative, bits 4–6 the
order drawn and bits 0–3 the frame's high bits, word the frame's low bits, u8 x, s8 y up, u8 depth (its line twice
it, drawn at a quarter of the line's scale), u8 bit 7 the list's last, bit 6 mirrored, bits 0–5 ticks}. Objects 5, 7
and, but at goal 4, 9 are shadows (0x5C48): the size list at 0x103B6 (80 × 15 at its largest) under the object
before them, at 3/8 of its scale.

Each object runs from its first tick to its last, {word, word} at 0x123A2 + 20 × object + 4g, by the scene's clock (the
word at 0x60BCC), showing its block and counting down the block's ticks, then the next block, or after a list's last
the next list's first. At its last tick object 8 becomes 11 (0x125C8) and 10 becomes 12 (0x125F0), each running its
own lists from its own first tick. The scene lasts the word at 0x124A6 + 2g ticks (580, 580, 580, 400 and 600).

What stands is what the scene's last tick shows (`goalFigures`), the car, its door and its inside not among it, nor the
dust and smoke gone before it (the first halves, goal 2's object 12, goal 3's 11 and 12):

| Goal              | Figure           | Frame   | Size    | Palette | x   | y   | Line | Shadow |
| ----------------- | ---------------- | ------- | ------- | ------- | --- | --- | ---- | ------ |
| E LAKESIDE        | man              | 0x1186A | 40 × 57 | 11      | −2  | 0   | 510  | yes    |
|                   | woman            | 0x1166C | 16 × 54 | 8       | 18  | 0   | 510  | yes    |
|                   | trophy (11)      | 0x11752 | 24 × 55 | 9       | −32 | 0   | 508  | yes    |
| D AUTOBAHN        | man              | 0x113D8 | 24 × 56 | 10      | −8  | 0   | 510  | yes    |
|                   | woman            | 0x1145A | 32 × 54 | 8       | 68  | 0   | 510  | yes    |
|                   | trophy (11)      | 0x1170C | 24 × 55 | 9       | 26  | 0   | 508  | yes    |
| C DESOLATION HILL | man              | 0x11EAA | 32 × 57 | 11      | −6  | 0   | 500  | yes    |
|                   | woman            | 0x119FA | 32 × 55 | 8       | 44  | 0   | 494  | yes    |
|                   | dancers (11)     | 0x11DBA | 96 × 57 | 187     | −6  | 0   | 510  | no     |
| B DEATH VALLEY    | man              | 0x11A4A | 48 × 58 | 10      | 6   | 0   | 480  | yes    |
|                   | woman            | 0x11A0E | 32 × 55 | 8       | 22  | 0   | 400  | yes    |
| A VINEYARD        | man, lying       | 0x11AE0 | 72 × 15 | 10      | 30  | 2   | 500  | yes    |
|                   | woman            | 0x11A0E | 32 × 55 | 8       | 58  | 0   | 490  | yes    |
|                   | ninth figure (9) | 0x11DB0 | 24 × 56 | 234     | −84 | 0   | 498  | no     |
|                   | three (11)       | 0x11A86 | 72 × 70 | 232     | 0   | 0   | 510  | no     |
|                   | three (12)       | 0x11AA4 | 72 × 70 | 233     | −16 | 0   | 490  | no     |

None is mirrored. A figure casts its shadow where its shadow's object runs at the last tick: goal 2's third's (9)
never runs (its ticks 800 to 800), and at goal 4 object 9 is a figure, so the third there casts none.

Each stands, at its road's goal, as the start's objects do
(`goalFigurePlacements`): where the camera stops (the car at the goal stretch's 401, the camera 6 m behind it), as
far on as the original draws it at its line (`startDepth`, 3130 / line m: 6.1 m at 510, 7.8 m at 400), across from
the left road's centre there (the goal's driver keeps to the road taken's centre on the straight) by its x road units,
up by its y × 15/14, a pixel 1 road unit, on its bottom middle, with no body. Its board is its frame's pixels in its
palette, `outrun-frame-<address>`, shadowed by the original's shadow at its anchor.

This game's driver after GOAL stops the car at the finish plus its runout (`speedCap² / (2a)`: TESTAROSSA's 321.5 m,
the longest S13 DRIFT TUNED's 438.6 m); the figures stand 785 to 790 m beyond the finish on every road, so the car
stops 465 m short of them (S13's 350 m).

On COCONUT BEACH 1487 objects stand, 1086 of them solid, 289 of the rest the sea's edge. A beach hut before the finish has hit extents ending 0.6 m
beyond the road's edge band, as the original's.

## Backgrounds

`npm run road-data -- outrun-course` also writes each stage's sky, `outrun-<stage>-sky`, baked from its background ([sky
baking](original-road-data.md#sky-baking)) out of the tile ROMs as its program places it (`stageSky`), committed and
shown on Pages provisionally:

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
  width too, so the front's pixel f stands over the back's 3/4 f: the overlap is 0. Both stand with their bottom
  `offset` rows (10 on every stage) below the road's top, so their bottom row's place is offset − 1.
- **Sky.** The stage block's first word numbers its ramp, the long at 0x17590 + 4 × it: 64 palette words, color k (1
  to 62) on rows 2(k − 1) to 2k − 1 up from the road's top, 63 above them, 0 below the road's top. Eight stages'
  ramps hold one color 64 times (COCONUT BEACH, DEVIL'S CANYON, ALPS, SEASIDE TOWN, WHEAT FIELD, WILDERNESS, DEATH
  VALLEY, VINEYARD), so their skies are flat.

Each course's backgrounds keep their image, horizon row (320, the sky picture's) and yaw origin, so no course changes.

## Voices and effects

`npm run road-data -- outrun-sounds` writes the original's PCM voices and effects as the
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

`npm run road-data -- outrun-read` ([Development](development.md#road-data-commands)) checks and reads the ROM zip and
writes `superoutride.outrun-road-data` version 1, `outrun.json` in the dump directory: the ROMs' names and CRCs; every
stage (number, block, colors as words and RGB555, curves, widths and heights, scenery, road path); the fork stretch and
the goal stretches with their paths; the height tables and scenery types their points name. It refuses a stage whose
path does not turn 0° or ±360° over its length, and prints each stage's counts, points past its end, its path's offset
against its curves, and each curve's radius against the one its aligned path measures, positions over its heading change
two positions in from either end (a join spreads its turn over a position or two). `npm run road-data -- outrun-hills`
writes each stage's road top by the [hills](original-road-data.md#hills) at every quarter position, `hills-<stage>.json`
beside the dump, the holds counted at `--kmh` (293 unless told), and prints each height point's highest and lowest top.

## Course documents

`npm run road-data -- outrun-course` ([Development](development.md#road-data-commands)) reads the ROM set above and writes
[OUTRUN's roads](#outruns-roads) to `content/courses/`; with `--check` it rebuilds them and fails where one differs from
the committed document. CI holds no ROM, so the documents are committed; edit the conversion, not the documents.
`npm run road-data -- outrun-look` takes each stage piece alone.

The conversion, version 35 (`CONVERSION_VERSION`), fits nothing to footage. A lane is K's 3.6 m over the original's lane
spacing, and the [profile](original-road-data.md#profile)'s `c_look` matches the original's hills as its program draws
them:

- **Length.** A position is 65536 / (3.6 × 30 × 303) = 2.0027 m ([hills](original-road-data.md#hills)'s advance per
  tick). Position 0 is GO, the car's station (the original's road position is the car's); the road's entry is the
  camera's distance, 6 m, before it, where the camera stands at GO.
- **Across.** A road unit is `UNIT_METRES` = 3.6 × 3 / 424 = 0.0254717 m: the road ROM's lines lie 424/3 units apart.
  The original's pixels are 14 wide to 15 tall (320 × 224 shown at 4:3), so an amount the ROMs give down (a sprite's
  height, an object's height y) is 15/14 of its units across.
- **Road width.** From 0x1C2 (450) at the game's GO, else 0xD4 (212), each width point approaches its target from its
  position by |speed| × 16 / 303 units a position until it is reached or the next point begins, straight between
  its corners; the road joins those corners over the whole road as one monotone cubic
  ([Original road data](original-road-data.md#a-lateral-changed-straight-between-points)), written at every position of
  each piece, and the lanes and the roads' centres are taken from it.
- **Plan.** Each span's plan is its road path P: S's path table's headings at the span's positions (a goal piece's
  after its stage's, turning on from the heading the stage reaches; a fork's R side the table's mirror; a fractional end
  at the last position's heading), raised by the [plan from a heading
  table](original-road-data.md#plan-from-a-heading-table), no turn tighter than its lanes keep (from P to its outermost
  lane's edge on the curve's inside, `leastLaneRadius`); none is. A position is 2.0027 m along P, so a Section's
  stations are along P, and its `centerLateral` is its centre lane's centre from P.
- **Colors.** The surface, lane lines, edges and centre line are each two palette words repeated, half 0 and half 1;
  the conversion takes the first two of each, checking neither the repeat nor that the centre line is the surface's.
  The ground's two colors are the stage's (`groundStripes`, [Main CPU](#main-cpu)). Each half is half a period of
  32 × 303 / 3072 positions, 2048 / 324 = 6.320988 m (the road's fine position gains km/h / 64 three times a tick, 32
  of it a period), counted from GO along P.

### Cross-section

One road's lines and edges, units from its centre, each side alike, are the road ROM's nearest line (`opr-10185.11`, CRC
`22794426`, the same bytes as its copy `opr-10186.47`, so either file serves; 256 lines of 512 pixels, two bit planes of
64 bytes a line; row 255 is 1 pixel a unit, its centre between pixels 251 and 252), which `road-data outrun-course`
checks (`checkRoadRom`): the inner lines 66.67 to 74.67 (pixel value 1), the outer lines 206 to 218 (1), the shoulder to
228 the surface (0), the edge band 228 to 250 (2). The centre line, 8 wide at 0, is the surface's color on all 15 stages
and is not drawn. Lines and edge bands are drawn at their exact units (the original's 7/11 unit and pixel rounding are
not).

Two roads drawn together ([Two roads](original-road-data.md#two-roads)) show between them, at road width w (centres
±w), at w = 0 three lanes, at 72 four (the middle line 5.33 wide, the next 7.33), at 162 five (an edge band 0.67 wide of
road 0 at 87.33), at 212 six equal ones (the outer lines one line 12 wide), between 228 and 250 an edge band 2(w − 228)
wide, beyond 250 the ground 2(w − 250) wide. A road's centre lies 212 units inside its outer lane's outer edge, or its
inner lane's inner edge. ASPHALT lies under each road from its centre ∓ 250 within the ground, SAND beneath all to the
[ground's width](original-road-data.md#the-ground-beside-the-road).

The lanes driven (`drivenLanes`) are a, b, c | median | d, e, f; a and f are always one lane, 424/3 units (3.6 m). At
w ≥ 212 every lane is one lane and the median 2(w − 212); for 72 < w < 212, c = d = 424/3 × (w − 72) / 140 and
b = e = w + 70.67 − c; at w ≤ 72, c = d = 0 and b = e = w + 70.67. So at w = 72, where four lanes show for kilometres
(SEASIDE TOWN, OLD CAPITAL, WHEAT FIELD, LAKESIDE), they are a, b, e and f (laid over the two roads, c and d would be
3.4 cm wide there, between the middle line's sides), and at 212 they are the two roads' own. The visible lines come
from the two roads' picture, not the lanes. A lane or median 0 throughout a Section is
left out. Each width, and the centre lane's centre, is written at every position the joined width is, as its rule
gives it, knots in line dropped.

### Pieces

The roads are made of pieces, each one shape whatever comes before or after it (`outrun-pieces.ts`):

- **Stage pieces.** A stage of rows 1 to 4 runs from GO to its fork stretch's 63, where the roads part, at the width
  it ends at, w₀ (the original parts its roads from 63 at that width). A stage of row 5 runs to 1948 and its goal piece
  follows in the same span. COCONUT BEACH starts at 450 with its grid and start objects, after the road's entry: 6 m of
  straight before GO at its start's width, lanes and colors, level.
- **Fork pieces** (`forkSpan`), the fork stretch's 63 to 431.5, where its roads have closed, L (left taken) and R its
  mirror, as the original's (K, 2026-10-24). As the main CPU's program runs the stretch (0x8780 to 0x89B6): from 63 the
  roads part by 8 a position; past 0x168 (360) the route is chosen and the next stage's background comes in; past 0x300
  (768) the road not taken is no longer drawn and the width holds; from 362, the second curve's end, the car is carried
  2w across and the roads close by 8 a position to 212, the next stage beginning at about 432. Here the width parts from
  w₀ to 768, holds, and closes from 362 to 212 at 431.5 (joined as the road's width is). The roads lie w either side of
  P to 362, and w either side of the V's middle, 1536 on the side taken, from there, left and right alike: the road
  taken from where the stage left it, the road coming in appearing at 362 2w beyond it. The road not taken leaves on its
  own curvature, the original's mirror of P: each edge of its picture where it passes in the world, its centre w out
  from the mirror of P across P's tangent at 63, taken on the road taken's cross-section at each position, drawn until
  the original stops (768) or until any edge no longer passes once across (its foot along P stops moving on): its outer
  edge first, 25 or 26 positions on (50 to 52 m, its centre 46 to 64 m out). The piece is two Sections, cut at 362. L's
  lanes to 362 are a, b, c (taken, centre lane b) | d, e, f: at 63 the stage's (`drivenLanes(w₀)`), a, b, c widening to
  one lane each and d, e, f narrowing to nothing one after another from the outside; from 362 g, h, i (the road coming
  in) | m0 | a, b, c, g, h, i widening one after another from the inside from nothing beyond the median 2(w − 212), with
  a, b, c the next stage's six lanes at 431.5; each lane by 8 a position, each change joined as a width is. R mirrors
  all: a, b, c | d, e, f (taken, centre lane e), and from 362 d, e, f | m0 | j, k, l (coming in). The ground reaches
  from each Section's outermost lanes, so it opens outward at 362's Link and closes with d, e, f on the side not taken,
  its edge the course limit that closes the road not taken; the road not taken's ASPHALT lies within it, cut where its
  edges cross the ground's edge, and beyond it the road is its colors alone. The fork piece's road and ground are the
  stage before's; its sky changes to the next stage's by `wipe` where the original's width passes 360 (from w₀ = 0 at
  108, from 212 at 81.5). Entering a fork piece L leaves the stage by lane b, R by e; leaving, L by b and R by e, the
  road taken's middle lane, so the side taken enters the next stage's d, e, f (L), its centre lane e, or a, b, c (R),
  its centre lane b.
- **SHORT starts** (`routeSpans`, K, 2026-10-24). A SHORT road starts on the road from beyond the map into the third
  row's top stage, DESERT (L), or its bottom one, CLOUDY MOUNTAIN (R): a fork piece from w₀ = 0 as the other side
  takes it (L's as R's, R's as L's). Its GO is where the fork stretch's first curve ends, 160, where its curve table
  returns to straight; 208 m of straight follow before its second curve. Its entry is the camera's distance before GO
  on its own road. The road not taken has ended before GO. It is level (the fork stretch's height table 0 is), in the
  entered stage's colors and sky, and cut at 362 as a fork piece. Its grid and start objects are COCONUT BEACH's on its
  road, not mirrored: the grids on its centre lane and the lane left of it, the objects across from its road as from
  COCONUT BEACH's left road at 450. The entered stage has its checkpoint as from a fork.
- **Goal pieces** (`stageSpan` with a goal), the goal stretch (S's path at 0x3ACA0) from 0 to 600, after its stage in
  one span. Each stage of row 5 ends in the goal its place in the stage table numbers (the byte at 0xE4EC + its place,
  0x8A04's `move.b (a0, d0.w)`): VINEYARD A (4), DEATH VALLEY B (3), DESOLATION HILL C (2), AUTOBAHN D (1), LAKESIDE E
  (0). The stage's last width w₀ holds to 182; from there the roads part by 8 a position to 768 (`s_r`), the left
  road taken w left of P with its lanes a, b, c widening to one lane each and d, e, f narrowing to nothing from the
  outside as at a fork's L, the right road, not taken, leaving on its own curvature as at a fork (drawn 34 or 35
  positions on, 68 to 70 m); where the goal's width point acts (read the tick after its second height point; A, B, D
  and E, whose second height point is at 182), the width then closes at 256 × 16 / 303 units a position to 0, the road
  taken coming back to P with its three lanes; at C (its point at 162, read while the width is still DESOLATION HILL's
  0, so no change) it stays 768 to 600. The goal's height points run their tables; its scenery stands.

### OUTRUN's roads

Each road (`outrunRoad`) is a LINEAR course of pieces: the first row's stage, or a SHORT road's start and the third
row's stage it enters, each fork's side taken (left to the next row's stage at the same place counted from the left,
right to the one after it), and the last stage with its goal.
Each span is laid in the world after the one before, the next's centre lane's centre on the
Link's lane's centre:

- **Sections.** A fork piece is two Sections, cut at 362, where the original carries the car 2w (the centre lane changes
  at its ends). A last stage entered from the left is two, cut at its `GOAL_CENTRE` (1946), its centre lane e before and
  b after, since the goal's road taken is the left one; they join by lane b. A span is otherwise one Section but where
  its road comes near itself (`passagePairs`: within its lanes' least radius): then its passages lie in different
  Sections, cut at the last joint before the later passage, after the earlier, where the road is one (w ≤ 212), joined
  by its centre lane.
- **Profile.** Each piece's height points run their tables at 293 km/h as the [profile](original-road-data.md#profile)
  says, the stage's cut at its end, and each piece is closed level at height 0 at its ends; the whole road's crossings
  ([Crossings](original-road-data.md#profile), its cells across its asphalt) are kept 6 m apart.
- **Objects.** The scenery points of the whole road are [placed](#placing-scenery) along it by road position, each
  stretch's points within its stretch: a stage's destination signs (its point at 1878, count 2) stand at about 1924, 24
  positions before the stage's end, and the fork's banner about 11 positions into the next stage. Each stands at the
  world point the original's x gives from its middle there (the V's middle from a fork's 362), measured on the plan
  it stands beside. A solid object's body is at most its board's width in whole texels.
- **Guidance** is not the road's (K, 2026-10-24): the road is the original's, and each fork's `parting` gate tells the
  HUD the side taken.
- **Gates.** The grids on COCONUT BEACH (a SHORT road's on its start, as there) by [the grid's
  rule](original-road-data.md#the-grid), on lanes a and b, with no rival of the original's: the player's at GO at lane
  b's centre, where the original's car stands (a game's start clears its x, 0x8564, and sets the width to 450, 0xB4E4;
  the width's first change then carries the car from 0 to the left road's centre, 0xC286); a
  checkpoint `<STAGE>-CP` in each stage after a fork where the fork's banner's left half (the entry of drawing 6 of type
  60, its point at 398, the first brought out) passes the car, 10.8 positions into the stage, just after the roads have
  closed to six lanes (the original grants its time there, 0x4812); the finish `<STAGE>-GOAL` at each stage of row 5's
  1948; and a `parting` at the start of each fork piece, where the roads part, with the side its road takes, which the
  HUD shows.
- **Skies.** Each stage's Sections show its sky, facing at the stage's GO as the original's scroll starts there (0): its
  yaw origin there, and the same direction in the world in every Section that shows it. It comes in by `wipe` in a
  fork piece, where the car reaches the original's width 360.

The roads are K's (2026-10-24): six LONG, C's two LRRL and RLLR, and six SHORT. Together every one of the 20 fork
pieces is run by a road, each stage of the third row by four roads and each of the fourth by three; LONG C runs
neither SHORT C's stages, and only A and E, whose last stages no other road reaches, run all of a SHORT road's. A
road's name (`routeName`, K, 2026-10-24) is OUTRUN, SHORT for a SHORT road, and its goal's letter; C's two of each
length, the only two roads as long to one goal, add the side they begin by, LEFT or RIGHT: a LONG road's first fork's,
a SHORT road's start's. Names write no marks; the longest, OUTRUN SHORT C RIGHT, is 20 characters. A course's id is
its name in lower case, joined by hyphens.

| Course                 | Name                 | Start, forks | Stages                                                                     |
| ---------------------- | -------------------- | ------------ | -------------------------------------------------------------------------- |
| `outrun-a`             | OUTRUN A             | LLLL         | COCONUT BEACH, GATEWAY, DESERT, WILDERNESS, VINEYARD (A)                   |
| `outrun-b`             | OUTRUN B             | LRLL         | COCONUT BEACH, GATEWAY, ALPS, OLD CAPITAL, DEATH VALLEY (B)                |
| `outrun-c-left`        | OUTRUN C LEFT        | LRRL         | COCONUT BEACH, GATEWAY, ALPS, WHEAT FIELD, DESOLATION HILL (C)             |
| `outrun-c-right`       | OUTRUN C RIGHT       | RLLR         | COCONUT BEACH, DEVIL'S CANYON, ALPS, OLD CAPITAL, DESOLATION HILL (C)      |
| `outrun-d`             | OUTRUN D             | RLRR         | COCONUT BEACH, DEVIL'S CANYON, ALPS, WHEAT FIELD, AUTOBAHN (D)             |
| `outrun-e`             | OUTRUN E             | RRRR         | COCONUT BEACH, DEVIL'S CANYON, CLOUDY MOUNTAIN, SEASIDE TOWN, LAKESIDE (E) |
| `outrun-short-a`       | OUTRUN SHORT A       | L, LL        | DESERT, WILDERNESS, VINEYARD (A)                                           |
| `outrun-short-b`       | OUTRUN SHORT B       | L, LR        | DESERT, WILDERNESS, DEATH VALLEY (B)                                       |
| `outrun-short-c-left`  | OUTRUN SHORT C LEFT  | L, RR        | DESERT, OLD CAPITAL, DESOLATION HILL (C)                                   |
| `outrun-short-c-right` | OUTRUN SHORT C RIGHT | R, LL        | CLOUDY MOUNTAIN, WHEAT FIELD, DESOLATION HILL (C)                          |
| `outrun-short-d`       | OUTRUN SHORT D       | R, RL        | CLOUDY MOUNTAIN, SEASIDE TOWN, AUTOBAHN (D)                                |
| `outrun-short-e`       | OUTRUN SHORT E       | R, RR        | CLOUDY MOUNTAIN, SEASIDE TOWN, LAKESIDE (E)                                |

The LONG roads are each 24.17 km along P (each runs as many positions), with 17 to 19 Sections and 9,477 to 12,188
objects; the SHORT ones 15.18 km, with 11 to 13 Sections and 5,894 to 7,190 objects. Their plans are 158 to 313
elements, at most 82 in a Section (DESERT's), hold their tables' headings within the
resolution at every position, and lie within 0.11 m of the line their paths build. SAND reaches the car's [lateral
limit](original-road-data.md#the-ground-beside-the-road), 500 units from its road's centre, 288 units (7.336 m) beyond
the outermost lanes on every road. The road is `ASPHALT` and the ground `SAND`, K's decision (2026-10-25), for
the ROMs hold no material. Their
heights reach −185 m and 266 m (the hills' rule, unchanged); 3 to 11 crossings each are kept 6 m apart. In each goal
stretch the GOAL gate (type 210: pillars of sprite 25, the banner 134 and 135) stands at about 321 to 327, before where
the original's car stops (401) and drives under it; the stands (types 209, 208 and 204) and DESOLATION HILL's ending
crowd (type 206) stand from about 325 to 435, and the second gate types 208, 206 and 204 hold (the banner at y 352,
pillars at ±320) at about 413 to 419, beyond 401.

## OUTRUN's stages

The stages are named as the original's map names them, matched to the stage table (0xE49C, row r from 8r) by their
scenery (K accepted the match): row 1 0x3C COCONUT BEACH; row 2 0x1E DEVIL'S CANYON, 0x3B GATEWAY; row 3 0x20 CLOUDY
MOUNTAIN, 0x2F ALPS, 0x2A DESERT; row 4 0x2D SEASIDE TOWN, 0x35 WHEAT FIELD, 0x33 OLD CAPITAL, 0x21 WILDERNESS; row 5
0x32 LAKESIDE, 0x23 AUTOBAHN, 0x38 DESOLATION HILL, 0x22 DEATH VALLEY, 0x26 VINEYARD (`OUTRUN_NAMES`). On the map,
from the left fork's side: COCONUT BEACH; GATEWAY, DEVIL'S CANYON; DESERT, ALPS, CLOUDY MOUNTAIN; WILDERNESS, OLD
CAPITAL, WHEAT FIELD, SEASIDE TOWN; VINEYARD (A), DEATH VALLEY (B), DESOLATION HILL (C), AUTOBAHN (D), LAKESIDE (E).

Each stage has its own sky, `outrun-<stage>-sky` (`skyName`), horizon row 320, baked from its background
([Backgrounds](#backgrounds)).

## COCONUT BEACH's profile

By the [profile](original-road-data.md#profile), on COCONUT BEACH the road's top is 12 rows from the original's on
average (in the original's rows). The tables' highest and lowest tops, and the least load at 293 km/h over each table
(below 0 the car leaves the road):

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

## Checks on `k1`

`k1` checks COCONUT BEACH against the ROM's events, using only time × the displayed speed and ratios within a row. Its
position is the displayed speed's integral from GO, re-timed monotonically through the events matched below. The
analysis and its side-by-sides, `k1`'s frame beside this game's drawing every 50 positions, lie in `reference-media/`
and are not committed.

- **Curves.** The background stands still on a straight. The still stretches matched to the ROM's straights in turn
  give 16 joins of a curve and a straight. The integral's lag behind the ROM grows from 0 to about −55 positions over
  the stage. Through the others, a join is predicted within 0.6 to 17 positions (median 9; the last, 30), not 2: the
  original advances its position by `(R + car_x/40) / R` on a curve, which the integral does not follow.
- **Hills.** `k1`'s road top, climbed from the bottom, against the [hills](original-road-data.md#hills)' extremes over
  each table's span, as `outrun-hills` gives them (no fit; `k1`'s position is the displayed speed's integral, which lags
  the original's later in the stage):

  | Table at | Kind | Rule's top   | `k1`'s   |
  | -------- | ---- | ------------ | -------- |
  | 1        | 0    | 112.5, 191.6 | 107, 199 |
  | 360      | 0    | 116.9, 179.9 | 120, 181 |
  | 1044     | 0    | 101.4, 187.1 | 100, 187 |
  | 1600     | 1    | 169.1        | 163      |

  Four of the seven extremes are within 3 rows. `k1` ends before table 1824. The rule's tops were measured again by
  the tool as it stands (2026-10-25) and are unchanged. `k1`'s were read once from its footage, which is not at hand
  to read again; an earlier reading of the kind 1 table's hold, the rows its top took while held (166 to 173), measured
  another thing than this extreme.

- **Width.** The road's edges lie off the screen on the car's row: the road there is 10.3 m, about 410 px. The lane
  lines either side of the car stand `k1`'s median 136.0 px apart there, this game's lane 137.6 px at its 40 px/m.
- **Start.** The start line's place is checked with the scenery, which places the start gantry.
