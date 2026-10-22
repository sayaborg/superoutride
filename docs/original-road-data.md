# Original road data

OUTRUN's courses are raised from the road data in the original's program ROMs, and [Stage
SH](NEXT.md#stage-sh--super-hang-on-from-the-roms), [Stage TO](NEXT.md#stage-to--turbo-outrun-from-the-roms), [Stage
ER](NEXT.md#stage-er--enduro-racer-from-the-roms), [Stage MG](NEXT.md#stage-mg--super-monaco-gp-from-the-roms) and
[Stage RH](NEXT.md#stage-rh--racing-hero-from-the-roms) raise SUPER HANG-ON's, TURBO OUTRUN's, ENDURO RACER's, SUPER
MONACO GP's and RACING HERO's from their own the same way. This document owns how each original's ROMs are read: the
ROM set, its programs, the tables' format and addresses, the dump the road data tool writes, and how the tables become
course documents. OUTRUN's sections come first; [SUPER HANG-ON](#super-hang-on), [TURBO OUTRUN](#turbo-outrun),
[ENDURO RACER](#enduro-racer), [SUPER MONACO GP](#super-monaco-gp) and [RACING HERO](#racing-hero) have their own.
What the conversion does not yet cover is NEXT's ([Stage RD](NEXT.md#stage-rd--outrun-from-the-originals-road-data),
Stage SH, Stage TO, Stage ER, Stage MG, Stage RH).

The ROMs and any raw data taken from them are not committed and appear in no PR: K's zips lie in
`reference-media/outrun/rom/`, `reference-media/super-hang-on/rom/`, `reference-media/turbo-outrun/rom/`,
`reference-media/enduro-racer/rom/` and `reference-media/super-monaco-gp/rom/`, the tool's dumps beside them in
`rom-data/`. The formats are read by this project's own code from this description and the ROMs themselves.

The road data tool keeps each original's ROM set, addresses and formats in its own modules (`outrun-*`,
`super-hang-on-*`, `turbo-outrun-*`, `enduro-racer-*`, `super-monaco-gp-*`) and what they share in modules of their own:
a program's words and the halves it is interleaved from (`program-words`), the road tables in OUTRUN's format
(`road-tables`: palette words, curves, widths and heights, scenery points, road paths and height tables), the hills
(`hills`), the profile and the crossings' bumps (`road-profile`), where a road passes over itself (`crossings`: its
overlapping cells and their crossings), the plan laid off a road path with its corners rounded (`offset-plan`), two
roads drawn together from one road's picture across (`two-roads`), the sprite hardware's pixels (`sprite-pixels`), the
originals' pixels on this game's texel grid (`pixel-grid`, its pixels by [chosen lines](#chosen-lines) `chosenLines`), a
background baked into one sky ([`sky-baking`](#sky-baking)), and how objects approach the car (`object-approach`: the
tick's advance, an approach table's step and `startDepth`).

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
  word x in road units, word y × 128, word depth, long routine}, and the flag waver ([Banners and the flag
  waver](#banners-and-the-flag-waver)); the figures after each goal stand before the stopped camera ([The figures after
  the goals](#the-figures-after-the-goals)).

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
| 2       | 0x4144                | bottom left (right) | 4     | never                         | (by the middle)      |
| 12      | 0x428A                | bottom left (right) | 2     | never                         | no                   |
| 14      | 0x4380                | middle left (right) | 2     | never                         | yes                  |
| 5, 6    | 0x46D6, 0x4774        | bottom middle       | 2     | never                         | no                   |

A hit sets the crash (the word at 0x60C24). The drawings are dispatched by the jump table at 0x3DA2. Drawings 1, 3, 10
and 11 draw a strip beside the road, its edge nearest the road at x, and drawing 13 a patch on it
([Strips and patches](#strips-and-patches)), drawing 14 DESOLATION HILL's sand again. Drawing 2 draws a cloud
([Clouds](#clouds)) and drawing 12 VINEYARD's trees ([VINEYARD's trees](#vineyards-trees)); drawings 5 and 6 are the
checkpoint banner's halves ([Banners and the flag waver](#banners-and-the-flag-waver)).

## Chosen lines

A ROM's picture is put on the 40 texels/m grid by chosen lines (`chosenLines`), so that its one-pixel lines (outlines,
letters' strokes, poles) neither break nor change their width: every texel is a source pixel, its colors unmixed (the
LOD levels below the master mix them). Each axis is planned from the picture on its own, at its r texels a pixel:

- **Count.** N = max(1, round(n × r)) of its n lines, each a source line in order: shrinking (N < n), K = n − N lines
  are dropped; growing (N > n), each line is repeated q = ⌊N / n⌋ times and K = N − q·n of them once more.
- **Choice.** The K are one from each of K equal windows [⌊k·n/K⌋, ⌊(k+1)·n/K⌋), k = 0 … K − 1, chosen in order: the
  line of least score, a line's score being the number of pixels it differs in from the nearer of its two neighbours
  (an end line's one). Shrinking, the neighbours are the lines still kept (the left or upper the nearest not yet
  dropped), so two equal lines across a window's edge are not both dropped; growing, the source's. Of equal scores,
  the line nearest the window's middle, then the lowest. Transparency is a color.
- **Picture.** A texel is the source pixel of its chosen row and column.
- **Symmetry.** A picture each of whose columns equals its mirror's stays symmetric: N moves by one where K would be
  odd (to the nearer of n × r), the left ⌊n/2⌋ columns take K/2 windows chosen as above, and the right columns mirror
  them; an odd middle column is neither dropped nor repeated once more.
- **Mirroring.** A mirrored picture is the unmirrored picture's output mirrored, not chosen again.

Base points, bodies' widths and LOD levels are each original's own rules ([Boards](#boards),
[SUPER HANG-ON's courses](#super-hang-ons-courses)); a separate shadow picture is put on the grid the same way.

## Sky baking

Each original's background becomes one published sky the same way (`bakeSky`). The original's own module gives, from
its ROMs:

- **Layers.** The back layer, 1536 pixels wide, and the front, 2048 (it turns 4/3 as many pixels a turn), in RGB555 or
  transparent, each with its bottom row's place: how many rows below the horizon (0 the first row below it).
- **Overlap.** The back layer's pixel the front's pixel 0 lies over: the front's pixel f lies over the back's
  0.75f + overlap.
- **Ramp.** The sky's color in each row up from the horizon, the last also every row above, and the color below the
  horizon.

The sky is baked in four steps:

1. **Columns.** The front layer's 2048 columns lose 512, leaving 1536 (`keptColumns`). By dynamic programming, the
   columns removed are those whose removal makes the sum of the differences between kept neighbouring columns least: a
   column's difference from another is the sum over its rows of their pixels' difference, the mean of the channels'
   differences in linear light, 1 between transparency and any color. The columns removed before any column stay
   within 8 of a quarter of it, so the front keeps its place over the back; of equal sums, the first found.
2. **Layers.** In the original's pixels, the ramp, then the back layer over it, then the front over that, each layer by
   its bottom row; the front's kept column j over the back's pixel j + overlap (modulo 1536).
3. **Size.** Each of the sky's 1504 × 640 pixels is the linear-light mean of the area it covers: 1504/1536 of the
   back's pixels across, 15/14 of that down (the original's pixel aspect), the horizon between rows 319 and 320.
4. **Tiles.** The pixels are drawn as a tile picture as the skies command draws one (each 16 × 16 tile at most 15
   RGB555 colors by median cut, no dithering).

The skies face as the original's backgrounds by the back layer: its pixel x is the sky's x × 1536/1504, whatever the
front's columns removed.

## Boards

`npm run road-data -- boards` writes a board for each sprite OUTRUN's stages
(to their length), the fork and goal stretches and the objects standing at the start (of the first stage) show,
mirrored and shadowed as shown, and the figures after each goal: the course image
`outrun-<sprite>[-mirrored][-shadowed]` (a strip's `outrun-strip-<family>`, a figure's frame no sprite names
`outrun-frame-<address>`); with `--check` it rebuilds them and fails where one differs. Each is made from the largest
size's pixels on its texel grid at 40 texels/m (`sceneryBoards`):

- **Scale.** A road unit is `UNIT_METRES` = 3.6 × 3 / 424 = 0.0254717 m (a lane, 424/3 units, is 3.6 m). A pixel spans
  its routine's road units across and 15/14 of them down (`PIXEL_ASPECT`: the original's 320 × 224 pixels are shown at
  4:3). A pixel of 2 units is 2.0377 texels across and 2.1833 down; one of 1 unit half that.
- **Sampling.** By [chosen lines](#chosen-lines) (`chosenLines`), each axis at its pixel's texels: a pixel of 2 units
  is two texels across and down, one more where a window's chosen line repeats, so a line a texel wider stands where
  the picture is flat. A mirrored board is the
  unmirrored board's output mirrored. Every board keeps the size the scale rounds to.
- **Picture.** The board's indices are the largest size's own pixels (a strip's, cloud's or trees' its nearest size's,
  [Strips and patches](#strips-and-patches)), and each palette the sprite is shown in is a
  palette of the board (`p<palette>`, the lowest its default) in that palette's own colors. The pictures are the
  ROMs', committed and shown on Pages provisionally: the product draws its own (Stage RD2).
- **Base point.** At the bottom or middle its anchor gives; a board extending sideways at its bottom. Across, an object anchored by an edge that has no body (its
  routine never hits: the strips) stands by that edge (`standsByEdge`), and its base point is there; any other's is
  at the middle of the sprite's hit extents, so a solid object's body stands there.
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
  87 positions farther from 2026-10-18 (RD-4) to RD-10e. At the top speed 48 to 78 objects live at once; on all 15
  stages one object finds no slot, CLOUDY MOUNTAIN's of type 34 at 1063.
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
  and others), 3 the sea's or a lake's edge (COCONUT BEACH, ALPS, SEASIDE TOWN, LAKESIDE), 10 DESERT's sand and 11
  DEATH VALLEY's stones. Drawing 14 (0x4380) is the sand strip again, kept by the left road where the roads were apart
  and setting no surface effect: DESOLATION HILL's sand before its goal (types 206 and 207 of the goal stretch), 79
  at the top speed. Its board, `outrun-strip-<family>`, stands at that edge (Stage PG): the grass, sand and stones
  rise from the ground, so each is its nearest size, standing on its bottom edge and extending sideways away from the
  road (`extend`: right, or left mirrored). The sea's or a lake's edge lies on the ground: it is no board, but its
  nearest size, standing by that edge and its middle, is [baked](#baking) into the course's Strips, in water's colors,
  `WATER` inside the verges.
- **Depth.** From line 256 on (half its approach) the nearest size is drawn at the objects' scale; before it, the size
  its line chooses (one each 16 lines) at line 256's scale, as wide but fewer rows, so a far strip lies flatter
  than a near one and no narrower. A board is one picture at every depth, reduced as the camera draws it: a far strip
  stands as tall for its width as a near one, and narrows. An extending board repeats its nearest size at one size to
  the frame's edge, where the original shrinks the far sizes outward (the sand and stones); standing on its bottom
  edge at the original's middle anchor's place, it stands half its height higher (K, 2026-10-22).
- **Restored** (`restoredStrip`, none of OUTRUN's since Stage PG). The far sizes of the sea, sand and stones are the nearest shrunk, (k + 1)/16 across
  and their own rows' share of the nearest's down, with what lies beyond it: size k covers 16/(k + 1) times the
  nearest's width, which is only the inner 1/16 of the strip. The board is 16 times the nearest's width; its column
  `d` nearest pixels from the edge by the road takes, from the largest size k that covers it ((k + 1)d < 16 × width:
  15 within the nearest width, 7 from twice it, 3 from four times, 1 from eight times, 0 from sixteen), its column
  floor(d(k + 1)/16) and, for row y, its row floor(y × its height / the nearest's). The grass's far sizes are not
  shrunk across, so its nearest size repeats outward to the same width. The boards are 7564 × 68 texels (grass), 8086 ×
  68 (sea, sand) and 8086 × 33 (stones: their sizes are 0 to 15 rows tall, so the outer half, size 0's, is
  transparent), within a course image's 1,048,576 texels. None is made since Stage PG: the extending boards are 473 × 68
  texels (grass), 505 × 68 (sand) and 505 × 33 (stones), and the sea is baked.
- **Patches.** Drawing 13 draws its entry's sprite on the road, its middle at x, a pixel 1 road unit: DESERT's and
  DESOLATION HILL's drifts of sand, 248 by 31 px. Each lies on the road: it is no board, but one Strip of its
  footprint, in its picture's mean color and no material, as in the original ([Baking](#baking)).
- **Effect.** Drawings 1, 3 and 13 set the road's surface effect (the words at 0x60C20 and 0x60C22) where the car is
  on them, near the camera: for 12 frames a spray from the table at 0xAD06 is drawn at the car, by the effect's kind
  (sea 0, grass 4 or 8, sand 12). Nothing else reads it: they change no driving. Drawings 10 and 11 set nothing. The
  spray is not converted.

### Baking

What lies on the ground (the sea's and lakes' edges, the patches) is baked into the course's Strips by the road data
tool's shared baking (`ground-baking.ts`), as the camera sees each piece pass beside the player: the camera
definition's, 2 m high and 6 m behind (the original's eye, 1.965 m and 6.1 m, is not matched). A piece's picture is its
nearest size, its board's as it would stand. Its columns keep their laterals (40 texels a metre); its row r m below the
anchor lies 6r / (2 + r) m nearer than the piece (beyond it for negative r).

- **Strips** (`bakeStrip`). A strip's consecutive pieces on one side (each within 16 m of the next) are painted far to
  near, the nearer, which the original draws later, on top, on samples 0.5 m apart along s and a texel across; beyond a
  piece's outermost column its color reaches on. Every texel is light or dark, split at the largest gap in the colors'
  luminances; the class the outermost columns mostly hold (the water) is the ground the others lie on, one Strip from
  the pieces' edge outward. Each run of the other class (the sand and foam) at a sample is a band, the nearest first,
  up to 3 (the farther ones joined to the last); a run narrower than 0.2 m, a fine pattern such as the foam's dots, takes
  its neighbours' class. Each band is one Strip between two Boundaries, a missing band closing at the end of the one
  before it. The colors are each class's mean in linear light, from the original's palettes. A strip's material
  (`WATER`) runs from the waterline, where the water first appears, out to the verge (`outer-left` or `outer-right`),
  over each stretch where the waterline lies 1 m inside it; beyond the verge water is color alone, and the verges, the
  course limits, do not move.
- **Boundaries.** One set a side, `ground-<side>-<set>-edge`, `-a1` to `-b3` and `-water`, while the strips on that
  side follow one another (another set where one overlaps another); a set's Boundaries keep the same stations, within
  0.05 m of their samples (doubled until they fit 1024 knots), so that a band's edges stay ordered.
- **Patches** (`bakePatch`). A patch is one Strip, the rectangle its rows and columns cover on the ground, in its
  picture's mean color, its material beneath.

On OUTRUN's roads the sea and lakes (drawing 3) are baked on COCONUT BEACH, ALPS, SEASIDE TOWN and LAKESIDE in up to
2 sets a side (at most 18 Boundaries and 974 knots in a Section), and DESERT's 1149, its second Section's 169 and
DESOLATION HILL's 482 and 543 patches (drawing 13) are each a color Strip on the road, with no material: the original's
patches change no driving. `SAND` beneath them would stop the planned driver on DESOLATION HILL, whose patches lie on
grades of up to 40 %, and leave its roads' racing lines unmeasurable.

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

Each stands, wherever its goal is (a road's last or one the road runs on from), as the start's objects do
(`goalFigurePlacements`): where the camera stops (the car at the goal stretch's 401, the camera 6 m behind it), as
far on as the original draws it at its line (`startDepth`, 3130 / line m: 6.1 m at 510, 7.8 m at 400), across from
the left road's centre there (the goal's driver keeps to the road taken's centre on the straight) by its x road units,
up by its y × 15/14, a pixel 1 road unit, on its bottom middle, with no body. Its board is its frame's pixels in its
palette, `outrun-frame-<address>`, shadowed by the original's shadow at its anchor.

This game's driver after GOAL stops the car at the finish plus its runout (`speedCap² / (2a)`: TESTAROSSA's 321.5 m,
the longest S13 DRIFT TUNED's 438.6 m); the figures stand 785 to 790 m beyond the finish on the six roads, so the car
stops 465 m short of them (S13's 350 m).

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

`npm run road-data -- course` also writes each stage's sky, `outrun-<stage>-sky`, baked from its background
([sky baking](#sky-baking)) out of the tile ROMs as its program places it (`stageSky`), committed and shown on Pages
provisionally:

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

The conversion, version 13 (`CONVERSION_VERSION`), fits nothing to footage. A lane is K's 3.6 m over the original's lane
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
- **Guidance**, a default K decides on Pages, wherever a road is chosen: each fork's side not taken, and the right
  road of each goal the road runs on from (the road taken is the left). The goals of the six roads, after which the
  driver takes the car, have none. It is added as each road is assembled (`roadGuidance`), all passed through, so no
  fence closes the road not taken; each piece points to the road taken. A low camera reads road marks only about 30 m
  ahead, so boards show the way from afar and road marks and chevrons near. Its two places are where the roads begin
  to part (the vertex where the road width starts to widen: a fork's 63, a goal's 182) and where the median between
  them is 2 m wide (`w` 289.3: a fork's 72.7, a goal's 197.9 on A and B, 218.2 on C, D and E).
  - **Boards** `route-arrow-left` or `-right`, 500, 300 and 150 m before the roads begin to part, on the verge of the
    side not taken, 2 m beyond its edge band.
  - **Chevrons** `route-chevron-left` or `-right`, three, 15 m apart from where the median is 2 m wide, in its
    middle.
  - **The dead end**: three `route-chevron`s, one at the centre of each lane of the road not taken, one position
    before it ends.
  - **Road arrows**: the course format's `arrow` pointing to the road taken, 2.4 by 12 m in RGB555 31710 (most stages'
    lane line color; DESERT's and WILDERNESS's lines are their road's color), one in each lane of the side not taken
    at least 2.5 m wide, every 25 m from 150 m before the roads begin to part to 10 m before the dead end.
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
  shortest half from 100 m by 20 m that moves this game's top by at most 1 row, within the road and short of the next
  passage at another level. A passage whose middle lies less than 100 m from the road's start or end makes no bump and
  stays level, and the crossing's other passages move by their levels less its level, so they take all of the 6 m; their
  half is found as above, not cut by the held passage's distance to the road's end. Where the bumps grown by 40 m cannot
  keep a crossing apart, all its bumps are flat. Passages nearer than 6 m by no more than a micrometre are apart.
  OUTRUN's crossings are of two passages, and SUPER HANG-ON's passages that overlaps join make one crossing.
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

Each stage has its own sky, `outrun-<stage>-sky` (`skyName`), horizon row 320, baked from its background
([Backgrounds](#backgrounds)).

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

Its sky is baked ([Sky baking](#sky-baking), `sectionBands`) from two bands of the map, its columns in screen order:

- **Tiles.** The tile ROMs `epr-10652.54`, `epr-10651.55` and `epr-10650.56` are three bit planes, the lowest first, 8
  bytes a tile, a byte a row, bit 7 the leftmost pixel. A tile word's tile is its bits 0–11 and its palette its bits
  5–11; a pixel 0 is transparent, any other the palette's word (its 8 words those the background loads).
- **Bands.** The front layer is the map's rows 0–3, all 256 columns (2048 × 32 pixels), the back its rows 20–31,
  columns 64–255 (1536 × 96); the other rows are not shown. Both bands' bottom row is the road's first, the first
  below the horizon, so the front reaches 31 rows above it and the back 95.
- **Overlap.** At heading 0 the screen's middle shows the front's pixel 1880 and the back's 1370: the front's pixel f
  over the back's 0.75f − 40.
- **Ramp.** The section's 32 sky words, word 31 the two rows just above the horizon, word 30 the next two, up to word 0,
  which also fills every row above; word 31 below the horizon.

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
  next arc (the course format's lengths); the last arc straighter than that is a straight too, the arc before it then
  the last. Straights one after another are one.

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
`super-hang-on-europe` (EUROPE), conversion version 2, the pictures their objects show and their skies, or with
`--check` fails where one differs; it reports the metres a position and a unit (`metresAPosition`, `metresAUnit`) and
each course's Sections, length, objects and crossings:

- **Plane and stations.** Lane a's centre runs 2.15 m (half a lane) left of P on the plane, again straights and arcs:
  an arc turning left is shorter and one turning right longer by 2.15 m times its turn. A course position (section k's position p is
  2049k + p, the goal's after the last section's) is the station across from P there on the plane, as on OUTRUN's
  ([Plan](#plan)). GO, the bike at the first section's position 0, is station 6.
- **Lanes.** a and b, 4.3 m each (`LANE`), either side of P; the centre lane a. The lane is K's: at 4.3 m the
  original's upright rear frame of the bike stands about as tall as VFR750R's upright rear picture. It is the one
  measure of SUPER HANG-ON's sizes across and up.
- **Cross-section.** The road ROM draws one road at a size proportional to its line, a feature's edge u units from the
  centre at u × line / 224 pixels (as an object's x, the `divs.w #$E0` at 0x7262): each edge's u is 224 times its
  pixels' slope against the line over lines 60 to 189, the left's and right's mean. The centre line is ±4.42 units, the
  lines 238.14 to 249.79, the shoulder the surface's, the edge bands 259.21 to 293.80. A lane is the road's half to its
  lines' inner edges, 238.14 units, 4.3 m, so a unit is 0.0180566 m: the road, objects' x, pictures, bodies, gates,
  the crowd and the figures, and the grids' spacing across are all in it. SAND reaches 40 m beyond the edge bands.
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
  texel grid by [chosen lines](#chosen-lines), a pixel 224/191 units across and 224/191 × the pixel aspect down, its base point the
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
- **Skies.** Section k's (0 from) is `shangon-<course>-<k + 1>-sky`, its background baked ([SUPER HANG-ON's
  backgrounds](#super-hang-ons-backgrounds)): from its first Section's start, the next section's from 6 m before the
  bike reaches position 1930 (the camera's station as the original redraws the background); the goal's Section shows the
  last section's. At heading 0 the original's back layer's pixel 1370 of 1536 is at the screen's middle, here 1370 ×
  1504 / 1536 of the sky's 1504: a Section's yaw origin is 77.0° plus the road's turn from the course's start to its
  start.
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
- **Skies.** A stage's sky is baked ([Sky baking](#sky-baking), `stageBands`) from its background's two layers, page
  by page with the last page leftmost: the front its four pages (2048 pixels), the back its three (1536), each 32 rows
  of tiles. The tile ROMs `opr-12323.102`, `opr-12324.103` and `opr-12325.104` are three bit planes, the lowest first,
  8 bytes a tile, bit 7 the leftmost pixel; a tile word's tile is its bits 0–12, tile 64p to 64p + 63 in palette p; a
  pixel 0 is transparent, any other the stage's palette's word. Both layers' last row is the entry's offset − 1 rows
  below the horizon (the offset is 10: their last 10 rows lie under the road), and at heading 0 the screen's middle
  shows the front's pixel 1888 and the back's 1376, so the front's pixel f lies over the back's 0.75f − 40. The ramp
  is the stage's sky ramp, its word 0 the two rows just above the horizon, each next word two rows higher, word 63
  every row above, and word 0 below the horizon.

### TURBO OUTRUN's sub CPU

- **Road paths.** Stage n's is the long at 0x1224 + 4n: 1496 heading vectors in OUTRUN's format, beginning and ending
  straight ahead (0, 4096), each turning 0° or ±360°.
- **Height tables** are the longs at 0x2156 + 4 × number, OUTRUN's 225 tables at addresses 0xB4 earlier.
- **Stripes** are the 32 phases of 512 words at 0x109EE, as OUTRUN's.

Where the stage's description says a table is OUTRUN's, the read checks it against OUTRUN's ROM set: the 225 height
tables, the stripes, the approach table (the main CPU's 0x48010, OUTRUN's 0x28000) and the sub CPU's road drawing
(0x1280–0x2155, OUTRUN's from 0x1334), which differs only where it addresses the height tables.

### Placing TURBO OUTRUN's scenery

TURBO OUTRUN's objects are brought out and approach as OUTRUN's do ([Placing scenery](#placing-scenery): the tick's
advance, the approach table, the road position the car's), with its own values and control (`turboOutrunObjects`).
Each leg runs from GO at one speed, tick by tick:

- **The start.** The leg's first stage begins with its start objects in the objects, at their lines; one at line 0
  never moves and never shows.
- **Stage ends.** At T + 13, T the tick the gate's judging post (routine 0x28) reaches the car's line, the next stage
  begins at road position 0 with its points from the first. Its background comes in at T + 11. At a leg's last stage
  the car stops at T + 2 instead: its control stops, and the objects still coming stand where they would pass the car
  driven on.
- **Advance.** The road position gains `km/h × 0x12F / 65536` positions; the tick's advance is the phase's gain, at
  most 15.
- **The control.** A point is taken when the road position reaches it (one a tick), its count times its items to bring
  out. While its cursor (its position, one more each tick) is not past the road position and items remain, the type's
  pattern turns step + 1 times (its 32 bits where its turn is negative, else its upper 16); each 1 turned out brings out
  the type's next item, in order, into the first free of the 108 objects, or none where all are taken.
- **Approach.** An object appears at line 1, or at the line its item's flags' bit 1 sets, and approaches by the table
  at 0x48010 (OUTRUN's 0x28000's contents), the far strip (routine 0x24) at half the rate. It stands at the road
  position of the tick it first reaches the car's line, 0x180, and vanishes at 0x1FF, a strip (routines 0x0C to 0x24)
  at 0x1F8.

`npm run road-data -- turbo-outrun-read` prints where the stages end and how many objects stand, at the top speed (324
km/h) with the 108 objects and as designed (216 km/h, one step a position, no object wanting).

### TURBO OUTRUN's dump

`npm run road-data -- turbo-outrun-read` ([Development](development.md#road-data-commands)) checks and reads the ROM
zip and writes `superoutride.turbo-outrun-road-data` version 1, `turbo-outrun.json` in its dump directory: the ROMs'
names and CRCs; the constants; the legs; the name records; every stage (block, colors, sky ramp, ground, curves, widths
and heights, scenery, road path); the height tables its points name; the stripes; the scenery types, the kinds their
items and the start objects name, the routines, the size lists and the strips' size tables, the shadow and the
palettes; the start objects and figures; each background's layers and each stage's tile palettes with the patches; and
the comparison with OUTRUN's tables. It refuses a ROM set, order, name, path, gate or table that differs from the
stage's description.

### TURBO OUTRUN's course

`npm run road-data -- turbo-outrun-course` ([Development](development.md#road-data-commands)) writes the LINEAR course
`turbo-outrun` (TURBO OUTRUN), conversion version 1, and its skies, or with `--check` fails where one differs. Its
amounts are the original's at the top speed, 324 km/h, with its 108 objects
([Placing TURBO OUTRUN's scenery](#placing-turbo-outruns-scenery)); its objects stand as
[TURBO OUTRUN's objects](#turbo-outruns-objects) says.

- **Stages.** A 6 m straight, the camera's distance, before GO (NEW YORK's position 0), then the stages in running
  order, each from its position 0: a stage within a leg to its end (T + 12, 1426.083), where the next begins; a leg's
  last (INDIANAPOLIS, ATLANTA, DALLAS) past where its car stops (T + 2, 1411.103) to the end of its join below; LOS
  ANGELES to 260 positions past its finish (1403.613), so that every vehicle stops before the course's end. 23,476.2
  positions in all, 46.94 km on the plane.
- **Plan.** Each stage's road path as straights and arcs as a SUPER HANG-ON section's
  ([SUPER HANG-ON's plan](#super-hang-ons-plan)), a position 2.002689 m, carried on straight past 1495. Its curves only
  check it: some turns are not among them (INDIANAPOLIS's from 882, its curves LOS ANGELES's), and DENVER's and NEW
  ORLEANS's roads waver. The 16 paths become 493 elements, 11 to 86 a stage; the sharpest arc is 39.9 m (OKLAHOMA
  CITY's); a stage's plan lies at most 0.33 m from its path's line.
- **Width.** The width points each stage runs (those before its end), by OUTRUN's rule ([Main CPU](#main-cpu)), from
  450 at the entry: a stage played on starts at the width the stage before it left, still approaching that stage's
  target. A leg's last stage is joined to the next leg's start, which the original reaches through another screen: from
  1460, where its road is one of three lanes (width 0), the width widens to 450 at the width points' fastest rate (speed
  80, 4.2244 units a position), reaching it at 1566.523, the next leg's GO. Corners are rounded as OUTRUN's
  ([Plan](#plan)); a corner within half a rounding after a seam (NEW ORLEANS's and GRAND CANYON's at position 0) is
  rounded from the seam, its vertex moved in along the line before it and the line after it with it; a rounding that
  would end or begin within half a position of a joint of P reaches to that joint instead.
- **Cross-section.** The road ROM's nearest line (row 255, its centre between pixels 251 and 252), checked
  (`checkTurboOutrunRoadRom`), draws each road: the lane lines from 66 to 79 units (value 1); the edge band from 214
  to 250 in three parts, 214 to 223 (2), to 246 in the lines' color (1) and to 250 (2); neither a centre line nor outer
  lines. Road 0's centre lies w left of P, road 1's w right; they are drawn together as OUTRUN's two are
  ([Cross-section](#cross-section)). At w = 218, most of the course's width, they show six lanes, the lines at ±145.5
  and ±290.5 and road 0's edge band 8 wide between the middle two.
- **Lanes.** a, b, c | median | d, e, f; a and f are 141.5 units (3.604 m), and the roads' outer edges lie at
  ∓(w + 214). At w ≤ 72.5, c = d = 0 and b = e = w + 72.5; to 250, b = e = 145 (3.693 m) and c = d = w − 72.5,
  meeting at P; from 250, where the ground shows between the roads, to 286, c = d = 427.5 − w and the median
  4(w − 250); beyond, c = d = 141.5 and the median 2(w − 214). So w = 218 has no median: the original's six lanes
  there are one road (a median would shut a racing line in either road). The centre lane b's centre is road 0's
  (−w) where both its lines show (w ≥ 72.5), else −(w + 72.5) / 2.
- **Plane and stations.** Lane b's centre is the plane, P laid off by it as on OUTRUN's ([Plan](#plan)), one plan a
  Section; a course position, a stage's start plus its position, is the station across from P there. GO is station 6.
- **Colors and stripes.** Over each stage's stretch its ground's 15th and 16th words, then its surface over the
  asphalt, then its lane lines and edge bands as the roads' picture shows them, each in its pair's halves (road 1's are
  road 0's on every stage), by halves of OUTRUN's stripe period (6.320988 m) counted from GO along the plane. The next
  stage's colors begin at its start, a leg's first stage's at its GO.
- **Materials.** ASPHALT under both roads (each centre ± 250 units); between them SAND where the ground there is wider
  than 0.5 m; SAND 40 m beyond the outermost asphalt, but on a curve's inside narrowed to leave 10 m and the vehicles'
  reach to the curve's centre (curves narrowed one after another, or whose returns would meet, as one stretch at the
  least), returning at 1 m across for 6 along: 17 stretches, the narrowest 14.0 m (OKLAHOMA CITY's 39.9 m arc).
- **Sections.** One a stage, joined by lane b: a stage within a leg from where the stage before it ends; a leg's first
  from its leg's last stage's 1458, where its join's rounding begins (width 0), so CHICAGO, MIAMI and OKLAHOMA CITY
  hold the joins. Each is cut again where its coordinate domain (to SAND's edges and the vehicles' reach) passes over
  itself, where the road is one (w ≤ 250), at the middle of the longest straight of P between the passages, else of
  the longest such stretch, two positions clear of the gates; the cut ones are `<stage>-2` on. A plan's joints include
  each width at which the lanes' rule changes and where SAND opens or narrows. 29 Sections.
- **Gates.** The grid's 16 slots 12 m apart, the last at GO in lane b, the next in a, alternating; each stage's
  checkpoint but the last's, `<stage>-CP`, where its CHECK POINT gate's post passes the car (1408.107), and the finish
  `los-angeles-GOAL` where the GOAL gate's does (1403.613).
- **Skies.** Stage n's is `toutrun-<stage>-sky`, its background baked ([TURBO OUTRUN's
  programs](#turbo-outruns-programs)): NEW YORK's from the start; within a leg the next stage's from 6 m before the car
  reaches where its background comes in (T + 11, 1424.585); a leg's first stage's rising at its GO. At heading 0 the
  original's back layer's pixel 1376 of 1536 is at the screen's middle, here 1376 × 1504 / 1536 of the sky's 1504: a
  Section's yaw origin is 75.6° plus the plane's turn from the course's start to its start.
- **Profile.** Each stage's height points run at 324 km/h by OUTRUN's rule ([Profile](#profile)), the stage closed
  level at height 0 over its stretch; the nine crossings, each of two passages, kept apart; bends broken at the
  Sections' cuts.

### TURBO OUTRUN's objects

The course's objects (`turboOutrunPlacements`) stand where the scenery model stands them at 324 km/h with the 108
objects ([Placing TURBO OUTRUN's scenery](#placing-turbo-outruns-scenery)), at the course position of their stage's
road position, the start's and the girls' as below; the strips as [TURBO OUTRUN's strips](#turbo-outruns-strips)
says. The two items below the road (kind 0 at y −1024), never seen, are not placed.

- **Across**, road units from P at the road width w where it stands: an item marked by b7 (its flags' bit 1 clear),
  the gates' parts among them, its x × 16; any other x × 16 from road 0's centre (−w) where x < 0, from road 1's (+w)
  where x ≥ 0, but from road 0's where the road was wider than 280 (the word at 0x1DE04) as it came out.
- **Height.** Its y road units, half of them for a half-scale kind (its flags' bit 0), 15/14 of them up.
- **Picture.** Its kind's size list, but the walkers' (routines 0x34, 0x38) and routine 0x60's the first of their frame
  lists (0x8A0E, 0x92E4); a pixel of its largest size 2 road units, a half-scale kind's 1; mirrored by its flags' bit
  0; in its kind's palette, a blinking kind's (0x2C, 0x30, 0x40, 0x44) as its record has it. A board stands on the
  middle of its bottom, but one lying on the road (routine 0x08, the puddles of 0x4C and 0x50) on its middle as
  OUTRUN's patches do, and across at the middle of its kind's hit extents.
- **Body.** Where its kind's collision class is 0 to 3 (the original stops or spins the car) and it stands on the
  ground (y 0), but for the half-scale objects on the road: as wide as its hit extents (2 road units a pixel, half
  scale 1), at most its board's width. Classes 11 to 17, thrown or broken when hit (fences, snow, stones, shrubs,
  puddles: 2,372 at 324 km/h), and the rest pass through.
- **The start.** Each leg's start objects (330) stand where they pass the car or where they look as large as the
  original draws them at their line (`startDepth`), the nearer, as OUTRUN's do; 286 where they pass, 44 by their size.
  Its start figures (`START_FIGURES`, 43) stand the same way, x from road 0's centre, each at its own pixel's road
  units.
- **STAGE UP! and GOAL!** The girls (routine 0x64) and their signs (0x68), which the original draws over the screen,
  stand where an object drawn 1:1 stands as the leg's car stops: from line 254 to the car's line, 2.996 positions past
  the stop. A girl shows her READY pose (0x27F8E, of her frames at 0x8FCE) in her kind's palette, a pixel 2 units, her
  x × 32 units from P; her sign its kind's picture, its y × 2 units up, 0.1 m nearer.
- **Shadows.** A kind whose flags' bit 1 is set casts the shadow picture (the size list at 0x2667A) on the road, drawn
  at its scale and base point (`-shadowed`); a kind's pixel 10 that shades (bit 2) keeps its palette's color.
- **Boards** (`turboOutrunBoards`). `toutrun-<size list, five hex digits>`, with `-u<thousandths>` where a pixel is not
  2 road units, then `-mirrored` and `-shadowed` as shown: its largest size's pixels onto its texel grid by
  [chosen lines](#chosen-lines), in every palette it is shown in (`p<palette>`, the lowest its default); a body is at
  most its board's width. 172 boards, and the strips' 10, published provisionally.

### TURBO OUTRUN's strips

The strips beside the road and the far strip are brought out, approach and stand as the other objects do, with no body,
by the families OUTRUN's strips restore from ([Strips and patches](#strips-and-patches), `restoredStrip`): each far
size is the nearest drawn again smaller, with its own dithering, so the families are read by their shape (where a
crest, a tree or the edge of what lies beyond falls) rather than pixel by pixel. At 324 km/h 6,855 strip pieces stand
and 372 far strips.

- **Strip A** (routines 0x0C to 0x14, the grass bank and its flowers, 0x26FDA): VINEYARD's trees' family drawn the
  other way round, 9 sizes 224 wide and 3 to 63 rows, the nearest last; size k (1 to 7) is the nearest shrunk to k/8
  with more beyond, size 0 too small to read. Its board is 8 times the nearest's width (3652 × 138 texels), standing on
  its bottom by its edge nearest the road.
- **Strip B** (routines 0x18 to 0x20: the waves 0x2725A, the dunes 0x272FA, the flower beds 0x2743A): OUTRUN's
  strips' family, 16 sizes, the nearest last, size k the nearest shrunk to (k + 1)/16 with more beyond; boards 16
  times the nearest's width (8086 × 68 and 7303 × 65), standing on their middle by their edge nearest the road.
- **Across.** A strip's edge nearest the road stands at its item's x × 16 units from road 0's centre (x < 0, drawn
  mirrored on the left) or road 1's, whatever the road's width or b7; at its y.
- **The far strip** (routine 0x24, the fog 0x2603A) is OUTRUN's clouds' family: 9 sizes 248 wide and 1 to 31 rows, the
  nearest squashed down, so the nearest repeats outward to 16 times its width, a pixel 4 road units, in 4 boards
  (4043 × 135) side by side. It approaches at half the rate, so it stands where it passes the car at that rate, its
  edge 32 of its pixels (128 units) from P, reaching away from it, its base point (2 × 151 + 72) × 15/14 road units
  (10.2 m) above the road, its item's x unused.
- **Boards.** `toutrun-strip-<size list>` and `-mirrored`, by chosen lines as the other boards.

## ENDURO RACER

ENDURO RACER's course is raised from MAME's `enduror` (Enduro Racer, Rev A, YM2151, FD1089B 317-0013A), whose graphics
and sub CPU are read as they are. Its main CPU's program is encrypted for instructions and data alike, so its tables are
read from the decrypted program of MAME's `endurobl` (bootleg set 1, the YM2203 set `enduror1` decrypted), whose tables
are Rev A's; the program is never decrypted here. Its ROM set, programs and tables are described here as
[Stage ER](NEXT.md#stage-er--enduro-racer-from-the-roms) reads them.

### ENDURO RACER's ROM set

The main CPU's program comes from `endurobl`, whose ROMs hold the YM2203 set `enduror1`'s program decrypted. Its first
64 KiB is interleaved from two 64 KiB ROMs whose first halves hold the instructions and second halves the data (the
tables); the rest from pairs of 32 KiB ROMs that hold both. The tool assembles a data image and an instructions image:

| CPU  | Addresses       | Even bytes                               | Odd bytes                                |
| ---- | --------------- | ---------------------------------------- | ---------------------------------------- |
| main | 0x00000–0x0FFFF | `7.13j` `f1d6b4b7`, data its second half | `4.13h` `43bff873`, data its second half |
| main | 0x10000–0x1FFFF | `8.14j` `2153154a`                       | `5.14h` `0a97992c`                       |
| main | 0x20000–0x2FFFF | `9.15j` `db3bff1c`                       | `6.15h` `54b1885a`                       |
| sub  | 0x00000–0x0FFFF | `epr-7634a.ic54` `aec83731`              | `epr-7635a.ic67` `b2fce96f`              |

The sub CPU's program is Rev A's, from `enduror`. As Stage ER's description says (the sets were decrypted to find it;
the tool cannot check it): `endurobl`'s data are `enduror1`'s but for the bootleg's credit, the ROM test and the check
words; 0x10000–0x2FFFF is the same in every set; Rev A's 0x00000–0x0FFFF holds the same tables 0x1A bytes lower, so
the course is Rev A's. The YM2203 set's sub CPU program (`epr-7634.ic54`, `epr-7635.ic67`) differs from Rev A's only at
0x0073–0x110B.

The graphics are `enduror`'s: the road ROM `epr-7633.ic1` `6f146210` (256 lines of 512 pixels, two bit planes of 64
bytes a line, the second 0x4000 after the first), the tiles `epr-7644.ic31` `e7a4ff90`, `epr-7645.ic46` `4caa0095`
and `epr-7646.ic60` `7e432683` (three bit planes, the lowest first), and the sprites, 32 ROMs of 32 KiB in eight banks
of 0x8000 32-bit words, each bank four ROMs, one byte of each word, the least significant first
(`ENDURO_RACER_SPRITE_ROMS`): bank 0 `epr-7678.ic36`, `epr-7670.ic28`, `epr-7662.ic18`, `epr-7654.ic8`, and bank k
the ROMs one lower in each column, to bank 7 `epr-7671.ic29`, `epr-7663.ic21`, `epr-7655.ic11`, `epr-7647.ic1`.

The tool opens both zips (`enduror.zip` and `endurobl.zip` in `reference-media/enduro-racer/rom/`), checks every entry
against the CRC-32 its archive records, and finds each ROM it reads by its CRC-32 and size, whatever the zip names it
(K's names differ a little from MAME's); a set without one is refused. It reads no key (`317-0013a.key`), no Rev A
main CPU ROM (encrypted) and no sound ROM, and never decrypts.

### ENDURO RACER's programs

Both CPUs are 68000s. The main CPU's shared RAM 0x124000–0x127FFF is the sub CPU's 0x07C000–0x07FFFF. Before it reads
a table, the tool checks on the instructions' image the instructions that name it (`MAIN_INSTRUCTIONS`): the position's
step, the bike's place, and the `lea` of each table below.

- **Time and distance.** A tick is 1/60 s. The road position is the long at 0x126188, 16.16; each tick it gains the
  speed, the word at 0x12618C, × 256 (`asl.w #8, d0` at 0x608C, `add.l d0, $188(a6)` at 0x608E). The display shows
  the speed as it is in km/h, so a position is 65536 / (256 × 3.6 × 60) = 1.185185 m. The bike stands 0.75 positions
  ahead of the road position (`move.l #$C0, d5` at 0x60EE on the 24.8 position).
- **Stages.** Five stages of 2048 positions run on without a stop: the road position runs from 0 to 10239. Stage s
  ends when the bike passes the word at 0x53AC + 2s × 256 (8, 0x10, 0x18, 0x20, 0x28: 2048(s + 1)); the tool checks
  each.
- **Road paths.** Stage s (0 from) runs the sub CPU's path that the long s of the eight at 0x592 names: 0x9800, 0x1800,
  0x3800, 0x5800, 0x7800. A path is 2048 heading vectors {signed word x, signed word y}, x right and y ahead, each
  about 4096 long; every path begins and ends with (0, 4096), and the five turn 0°, 360° left, 360° right, 360° left
  and 360° right in all. Twelve to twenty vectors a path are 0.02–1.98 times as long, at the joints of straights and
  arcs; only the headings are used.
- **Road colors.** Stage s's road takes palette 0x38–0x3F, the 8 [palette words](#palette-words) at 0xD948 + 16s
  (stage 5's at 0xD948 + 0x60): surface, edge's narrow bands and edge's middle band, each band A then B. The ground is
  background colors 0x7D0–0x7D7, the 8 words at 0xD918 + 8s: 0x7D3 left of the road's fold and 0x7D1 right of it, 0x7D2
  and 0x7D0 on the row where the stripes change. Only stage 5's sides differ.
- **Stripes.** The road's bands A and B change every 2 positions; the border's shape on the road's rows is the sub
  CPU's pattern at 0xD4E + (the position's long & 0x1F0), 32 steps of 128 rows' bits.
- **Water crossings.** {long start, long end (position << 8), word frame} at 0xD83C, ending at 0x7FFFFFFF: three, all
  frame 0, at 5236–5286, 5456–5526 and 5596–5656, where the road's surface and edges give way to the ground.
- **Stage 3's background** comes in at position 4068, the word at 0xDEB8 of the hills' section table, which the tool
  checks.

### ENDURO RACER's sprites

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

### ENDURO RACER's scenery

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
  half is drawn as it is and the right half mirrored.
- **Start.** Five templates of 38 bytes at 0xCA78 come out at the start: {byte flags, byte placement, …, word 0x12
  position (8.8), word 0x14 x (units), …, long 0x1A size set, byte 0x1E palette, …, byte 0x25 height}: the gate's posts
  (flags 0x88), banners and START board at position 1.5.

### ENDURO RACER's backgrounds

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

### ENDURO RACER's dump

`npm run road-data -- enduro-racer-read` ([Development](development.md#road-data-commands)) reads both zips and writes
`superoutride.enduro-racer-road-data` version 1, `enduro-racer.json` in `reference-media/enduro-racer/rom-data/`: the
ROMs' names and CRCs; the bike's place and stage 3's background's position; the stages' ends; the road paths; each
stage's road and ground colors; the water crossings; the stripes' pattern; the scenery table, its types and the scaled
x; the jumps and their kinds; the start's templates; the size sets these name, each with its undrawn row's colored
pixels; their palettes; each stage's layers (records, columns' tables, tile words), back layer's offset and sky; and
the tile palettes.

### ENDURO RACER's course

`npm run road-data -- enduro-racer-course` ([Development](development.md#road-data-commands)) writes the LINEAR course
`enduro-racer` (ENDURO RACER), conversion version 3, the pictures its objects show and its skies, or with `--check`
fails where one differs; it reports the metres a position and a unit, the cross-section, each stage's elements, folds
and turn, the tightest arc, the checkpoints, the finish, the road past it, the yaw origin, the steepest grade, the
crossings and its objects ([ENDURO RACER's objects](#enduro-racers-objects)):

- **Scale.** A position is 1.185185 m. A lane is K's 3.5 m (`LANE`): SUPER HANG-ON's rule (the original's upright rear
  frame of the bike, its rows 0–81, 82 × 128/125 × 15/14 units, as tall as VFR750R's upright rear picture, 1.65 m)
  gives 3.49 m, rounded as SUPER HANG-ON's 4.34 m was. The original's world keeps no one scale across and along the
  road (its road is drawn at 256 × X / (Y + 8.125) pixels and its objects at 4.2456 × x / (d + 4.19), two different
  eyes), so its objects' far ratio (a road of 7.48 m) and its road's look (about 9.8 m) were the alternatives; K kept
  the 3.5 m lane (2026-10-21).
- **Cross-section.** The road ROM's line L is the road's left half, its right end the road's centre: 0 the surface, 1,
  2 and 1 the edge bands outward, 3 the ground; lines 0 and past 128 draw no road. The sub CPU draws depth number d3 on
  line 0.991 (d3 + 3) − 3, where an object's unit is (d3 + 3) / 128 pixels (as Stage ER's description reads the sub
  CPU), so an edge's units are 0.991 × 128 times its pixels' slope against the line, fitted over lines 20 to 128: the
  surface's half 190.27 units (a lane, 3.5 m, so a unit is 0.0183947 m), the edge bands to 234.81 units (4.319 m),
  their narrow, middle and narrow bands 22 %, 56 % and 22 % of them.
- **Plan.** Each stage's path becomes straights and arcs by SUPER HANG-ON's `sectionPlan` over its positions 0–2047; the
  step from 2047 to the next stage's 0 is straight, as every path ends and begins at (0, 4096). P is a straight of 6 m
  less the bike's 0.75 positions before position 0, then the five stages, then the goal's straight. 119 elements (17,
  24, 25, 21 and 32 a stage), 11 folds spread, each stage at most 0.28 m off its path's line; the tightest arc is
  43.5 m (stage 5).
- **Plane and stations.** Lane a's centre runs 1.75 m (half a lane) left of P on the plane. Course position q (stage s's
  position p is 2048s + p) is the station across from P there. GO, the bike at position 0.75, is station 6.
- **The goal's straight.** Past position 10240 P runs straight on for 450 positions, to 10690: past the finish (10254,
  station 12158.0) 516.7 m remain, more than any vehicle's takeover needs to stop (the longest, S13 DRIFT TUNED's,
  436.7 m on this course) and past the last scenery (10342).
- **Lanes.** a and b, 3.5 m each, either side of P; the centre lane a.
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
- **Materials.** The surface and edge bands are `DIRT`. The ground reaches 18 m beyond the edge bands (22.32 m from
  P), past the farthest scenery: `GRASS` on stage 1 and `SAND` on the others, for the water (stage 3's water, stage 5's
  sea) has no material of its own here and `SAND` grips least and drags most. The water crossings stay `DIRT`.
- **Sections.** One a stage, `stage-1` to `stage-5`, from the stage's position 0 (the first from the course's start),
  and `goal` from 10240, each cut again where its coordinate domain (to the ground's edges and the vehicles' reach)
  passes over itself (`stage-2-2` and on), 2 m clear of the start's gate, the checkpoints and the finish: where one cut
  parts every overlap whose earlier cell lies before the earliest later cell, there (a loop's entry from its exit,
  across the loop's far side), else as SUPER HANG-ON's are (`domainCuts`' `once`). 17 Sections; they join by lane a.
- **Gates.** The checkpoints `enduro-racer-CP1` to `-CP4` stand where each stage's CHECK banner does (2048k + 4), the
  finish `enduro-racer-GOAL` where the GOAL board does (10254), as the scenery table places them. The grid is SUPER
  HANG-ON's: 16 slots, 12 m apart for cars and 3 m for bikes, the last at GO in lane a, alternate lanes; the
  original's five abreast is not copied.
- **Skies.** Stage s's (0 from) is `enduror-<s + 1>-sky`, its environment `STAGE <s + 1>`, its background baked
  ([Sky baking](#sky-baking)): its back and front layers ([ENDURO RACER's backgrounds](#enduro-racers-backgrounds)),
  each column's tiles in its palettes, both layers' bottom row the first below the horizon but stage 5's back layer's,
  4 rows lower (where it rests after rising; its rise is not made); the front's pixel f over the back's 0.75f − 64 (the
  original's 0.75f − 63.625 where the road vanishes, to the whole pixel: 0.375 back pixels, 0.09°); the ramp's 48 rows
  by its bits and the top color above; below the horizon the ground's color (stage 5's the sea). Stage 5's sea glitter
  stands at its first step, the palette as loaded, and the ground's rows where the stripes change are not drawn. A
  Section starts with the sky in force there; stage 2's, 4's and 5's come in at their start and stage 3's at position
  4068, where its background does, each 6 m before the bike reaches it, by one `cut` (the original's column-by-column
  change is not made). At a stage's start heading, every stage's the same, the original's road vanishes at its back
  layer's pixel 1281.5 of 1536, here 1281.5 × 1504 / 1536 of the sky's 1504: a Section's yaw origin is 97.69° plus the
  road's turn from the course's start to its start.
- **Profile.** Level but for the crossings' bumps ([Profile](#profile)): passages at least 200 m apart whose roads, to
  the edge bands' outer edges, overlap. 30 crossings, 62 passages, two of them clumps of three (stations 801–837,
  1840–1856 and 3274–3309; 9955–9980, 10740–10773 and 11954–11978); the loops at stages 2 to 5's starts and stages 1
  and 2's parallel stretch (stations 1930–1986 and 2720–2774) among them. Heights run from −11.4 to +12.1 m, the
  steepest grade 7.5 %.

### ENDURO RACER's objects

The course's objects stand at their road positions' stations, as the original's objects stand at their world
positions; `enduro-racer-course` reports how many stand, how many have bodies, the pictures whose bodies the original's
hit narrows and the objects left out:

- **Scenery.** Each of the scenery table's 1529 items stands at its position, x × 8 lateral units right of P (a scaled
  item of types 0x48–0x4E at the scaled types' x), lifted its height × 128/125 × 15/14 units, showing its type's size
  set, mirrored where its type's flags' bit 0 is set, in its type's palette.
- **Start.** The five start templates stand at position 1.5: the gate's posts at ±208 units, its banners at +163 and
  −162 units and the START board at 0, the banners and board lifted 155 pixels, each in its template's size set and
  palette.
- **Jumps.** Each of the 69 jumps is one board at P: its kind's half drawn with its bottom middle at 2 × left units and
  the half mirrored at 2 × right units, each to the nearest pixel, the mirrored half over the other as the original
  brings it out after. Kinds 0 and 2 show one picture, `enduror-mound-0`, in their palettes 0x1B and 0x54; kinds 4 and
  6 `enduror-mound-4` and `enduror-mound-6`. A jump has no body and is passed through: the road's mound is the hills'
  (NEXT's).
- **Bodies.** An object with the hit mark (its type's flags' 0x08, a start template's own) has a body, off the road
  too, but on the road (below): the original's bike hits within 0x5A units of the object's x either side, so a body is 2 × 0x5A
  units (3.31 m) wide or the object's colored pixels wide (pixel 10, the shadow, aside), whichever is narrower. The
  wide tree (0x13), the farmhouse (0x40), the mud house (0x3B), the fallen tree (0x38) and the ruin (0x39) are narrowed
  to 3.31 m.
- **On the road.** The original marks an item within 30 of the road's centre (in 8 units) as on the road, but for types
  0x48–0x4E, and only those can hit its bike, which it keeps on the road. Those with the hit mark (rocks, rock pillars,
  dead trees and jeeps: 199, 183 of them standing) are passed through here: with bodies, every vehicle's driver stopped
  behind stage 1's rocks at position 530, as the drivers do not steer around objects (53, 53, 0, 24 and 53 a stage).
- **Other passages.** An object whose base point, or body, stands on another passage's road (within its edge bands'
  outer edges, at least 200 m away along P) is left out: the original never shows the two together. 150 are, 17 of
  them on their own road and 5 of them jumps.
- **Pictures.** `enduror-<size set, five hex digits>` (and `-mirrored`) and the jumps' three: the unscaled size's drawn
  rows (0 to height − 2) on the texel grid by [chosen lines](#chosen-lines), a pixel 128/125 lateral units across and
  15/14 times that down, chosen once with pixel 10 among the colors; the board takes the other pixels and its shadow
  pixel 10, so neither is a texel off the other. A board's base point is the middle of its words' width, a row below
  its last drawn row (the program puts a size's bottom edge there), in every palette it is shown in, the lowest its
  default; its pixels 0 and 15 are transparent. The pictures are published, provisionally.

## SUPER MONACO GP

SUPER MONACO GP's two circuits, the race's and the qualifying's, are raised from MAME's `smgp` (Super Monaco GP, World,
Rev B, FD1094 317-0126a). Its main CPU's program is encrypted for instruction fetches alone: its tables are read as the
ROMs' bytes, and the program is never decrypted. The courses' tables lie in the sub CPU's program, which is not
encrypted. Its ROM set, programs and tables are described here as
[Stage MG](NEXT.md#stage-mg--super-monaco-gp-from-the-roms) reads them.

### SUPER MONACO GP's ROM set

Each CPU's program is interleaved from a ROM of its even bytes and a ROM of its odd bytes, 128 KiB each:

| CPU  | Addresses       | Even bytes                 | Odd bytes                  |
| ---- | --------------- | -------------------------- | -------------------------- |
| main | 0x00000–0x3FFFF | `epr-12563b.58` `baf1f333` | `epr-12564b.63` `b5191af0` |
| sub  | 0x00000–0x3FFFF | `epr-12576a.20` `2c9599c1` | `epr-12577a.29` `abf9a50b` |

The main CPU's program is encrypted (FD1094) for instruction fetches alone: the tables it holds are read as its ROMs'
bytes. The sub CPU's program, which holds the courses, is not encrypted; the main CPU sees it at 0x200000.

The tiles are three 64 KiB ROMs, one bit plane each, the lowest first, 8 bytes a tile, 8192 tiles: `epr-12429.154`
`5851e614`, `epr-12430.153` `05e00134`, `epr-12431.152` `35572f4a`. The sprites are 16 ROMs of 128 KiB in four sets of
four, each ROM one byte of a 32-bit word, the least significant first; set g's words are banks 2g (its first half) and
2g + 1, banks of 0x10000 words as OUTRUN's (`SUPER_MONACO_GP_SPRITE_ROMS`): `mpr-12425.90` `14bf2a15`, `mpr-12426.94`
`28b60dc0`, `mpr-12427.98` `0a367928`, `mpr-12428.102` `efa80ad5` (banks 0–1); `mpr-12421.91` `25f46140`,
`mpr-12422.95` `cb51c8f6`, `mpr-12423.99` `0be9818e`, `mpr-12424.103` `0ce00dfc` (2–3); `mpr-12417.92` `a806eabf`,
`mpr-12418.96` `ed1a0f2b`, `mpr-12419.100` `ce4568cb`, `mpr-12420.104` `679442eb` (4–5); `epr-12609.93` `a867812f`,
`epr-12610.97` `53b99417`, `epr-12611.101` `bd5c6ab0`, `epr-12612.105` `ac86e890` (6–7). There is no road ROM: the X
board's road layer draws lines of colors from RAM.

The tool finds each ROM by its CRC-32 and size, whatever the zip names it, and refuses a set without one. It reads no
key (`317-0126a.key`) and no sound or link ROM, and never decrypts.

### SUPER MONACO GP's courses' tables

Both CPUs are 68000s. The sub CPU holds the courses:

- **Descriptors.** The eight longs at 0x42BE name course 0's (the qualifying's) at 0x30BC and course 1's (the race's)
  at 0x30AC. A descriptor is four longs, their low 20 bits sub CPU addresses: the heading table, the scenery list, the
  road path and the map.

  | Course       | Steps N | Headings | Road path | Scenery list | Map     |
  | ------------ | ------- | -------- | --------- | ------------ | ------- |
  | 0 qualifying | 6136    | 0x20B02  | 0x23AF4   | 0xB472       | 0x282DC |
  | 1 race       | 14156   | 0x2845C  | 0x2F2F6   | 0x45D6       | 0x398DA |

- **Headings (T1).** A word N, then N words, each a step's heading in 1024ths of a turn, atan2(dx, dy) with x right and
  y ahead: a growing heading turns right. Both courses turn +1024 in all, once round to the right.
- **Road path.** N steps of {signed byte dx, dy, dz}; both close, their sums (0, 0, 0). A step is 96 units long in
  three dimensions (the race's 1,358,993 against 96 × 14156 = 1,358,976). The two forms share their headings to step
  4932 and part at 4933–5000: the race turns left, the qualifying runs on and turns right, taking its own short way,
  and rejoins the race's road at its step 5876 (the race's 13896), each closing on its own path.
- **Scenery list.** A long, its bytes, then a word a step (the race's exactly N, the qualifying's N + 1): bit 15
  mirrors, its low 15 bits a group (0x05CA the empty one).
- **Groups.** A word 4n, then n objects of 10 bytes {byte size class b1, byte kind (0x04 a flat board, 0x08 a
  standing one, 0x0C one that changes with the angle), word sprite flags (its low byte the palette, bit 10 mirrored,
  bit 11 flipped, bit 13 its middle its base point), word frame table (a 0x0C object's view table), signed word x (4 to
  a unit), signed word height}. The qualifying shows 4596 objects (3019 of kind 0x0C, 1037 of 0x04, 540 of 0x08), the
  race 10826 (7248, 2537, 1041); 147 kinds of object (kind, frames, palette, b1) in 242 groups.

The main CPU holds the barriers' band tables: the race's left at 0xC4AE and right at 0xC50E, the qualifying's at 0xC4E4
and 0xC556. A table is 6-byte entries {word end step (before it), signed word t1, signed word t2} (the left table's t1
negative), each from the entry before it to its end, up to the first whose end is at least N. |t1| 1 or 4 is a barrier,
2 an escape area, 0 open.

### SUPER MONACO GP's sprites

The X board's sprites are OUTRUN's pixels: words of eight 4-bit pixels, the most significant first, banks of 0x10000
words, 0 and 15 transparent, a row ended by the word whose bits 4–7 are 15 (`sprite-pixels` as OUTRUN reads them).

- **Frame tables.** Five entries of 6 bytes, v0 the largest, {word bank << 9, word first word in the bank, signed word
  from the word after it to its size record}; a size record {word words across << 8, word height << 6, word words a
  row, word words a row × (height − 1)}. Only v0 is drawn; the tool checks its record. Some smaller sizes' records are
  not records (0x04FE's v3).
- **Width.** The pictures are as wide as their records give; within it no colored pixel lies past a row's end mark,
  so the hardware's rows and the records' agree.
- **View tables.** An object of kind 0x0C names a view table on the sub CPU, 32 words, view i's frame table: 0x040A
  (the barriers along the road), 0x044A (the barriers across it), 0x04CA (the concrete walls), 0x050A (the kerbs) and
  0x058A (the advertising boards). View i and 31 − i are the same frame.
- **Palettes.** Sprite palette p is the 14 [palette words](#palette-words) at 0x49BE + 28p, pixels 1–14, p from 0x00
  to 0xEE.
- **The rivals' cars.** Their frame table is at 0x10E0; they are not converted.

### SUPER MONACO GP's background

- **Pages.** The fine set's tile RAM is drawn from the records at 0x37FF8 and 0x39F9A, in turn: a record is {word kind,
  word runs}, then runs {word byte offset into the tile RAM, then groups {byte count c, byte high, c bytes low} up to a
  c of 0}, each group writing c tile words of its high byte over each low byte. The tile RAM is 16 pages of 64 × 32
  tile words.
- **Tiles.** A tile word's bits 0–12 are its tile, bits 6–12 its palette; pixel 0 is transparent.
- **Tile palettes.** Colors 1–7 of palettes 8–127 from 0x432E + 14(p − 8) at power on; at a race's start the fine set
  loads palettes 8–42 from 0x432E again and 50–58 from 0x457A + 14(p − 50).
- **Road layer.** Color c of the fine set is the word at 0x63E2 + 2c: 0x31 the sky just above the horizon (RGB555
  3a9a), 0x00 above it (01da), 0x32 the ground (1144).

### SUPER MONACO GP's dump

`npm run road-data -- super-monaco-gp-read` ([Development](development.md#road-data-commands)) reads the zip and writes
`superoutride.super-monaco-gp-road-data` version 1, `super-monaco-gp.json` in
`reference-media/super-monaco-gp/rom-data/`: the ROMs' names and CRCs; each course's descriptor, headings, road path,
scenery list and band tables; the groups the lists name; the view tables; the frame tables the objects and views name
(and the rivals' cars'), each with its colored pixels past its rows' end marks; the sprites' palettes; and the
background's records, tile pages, tile palettes and road layer's colors. The amounts in the program's code (the grid's
rule, the clock, the hits' lines, the ground's height) are not tables: the courses take them as constants from Stage
MG's description.

### SUPER MONACO GP's courses

`npm run road-data -- super-monaco-gp-course` ([Development](development.md#road-data-commands)) writes the two
CIRCUIT courses, `super-monaco-gp` (SUPER MONACO GP, the race's form) and `super-monaco-gp-qualifying` (SUPER MONACO GP
QUALIFYING, the qualifying's), conversion version 3, their skies and their [objects](#super-monaco-gps-objects)'
images, or with `--check` fails where one differs; it reports a step's metres and each course's elements, tightest arc,
lap, the error closed and the three lengths that close it, its Sections with their boards, the boards placed and those
left out, and the images' count and master texels. Both have `maxLaps` 30 and `bearing` 0.

- **Scale.** A step is 96 units along the road and a unit 0.0349 / 9 m (the original's clock adds 0.0349 s a tick, and
  its camera moves 2.5 units a tick for each displayed km/h): 0.372267 m, the race's lap 5.27 km and the
  qualifying's 2.28 km. Across, 1640 units, the space between the barriers, are a real Monaco street's 10 m: a unit is
  6.0976 mm, 15/14 of that up. The original's world keeps one scale across and along the road, so the road here is
  0.64 times as long against its width as the original looks. K kept this scale (2026-10-21): seen from above, a unit
  is 3.88 mm along the road, 6.10 mm across and 6.53 mm up. The alternatives were (R) the real lap, 3.328 km (a step
  0.235095 m), whose qualifying form does not close with two straights and whose grid must stand one slot further;
  (C) the rivals' cars as wide as TESTAROSSA (a unit 9.4095 mm), whose pictures pass the course's texel bound (46.8 M
  with their levels, and 0x0D86's 1.42 M one image's); and (A) both, one scale (a step 0.903314 m).
- **Lap.** A lap runs from the race's line, step 288, round to it again; the qualifying's own line, step 276, is 12
  steps (4.5 m) behind it.
- **Plan.** The headings from step 288 round to it again, N + 1 of them as SUPER HANG-ON's road path vectors (4096 sin
  θ, 4096 cos θ), become straights and arcs by `sectionPlan` once a lap: the race's 50 elements (38 arcs), the
  tightest arc 49.7 m; the qualifying's 17 (13), 53.4 m; each at most 0.25 m off its line. The elements are cut at the
  Sections' borders (2333, 4697, 7115, 9538 and 12110 are inside elements).
- **Closing.** On the plane as written (lane a's centre, 256 units, 1.561 m, left of P; arcs' lengths and radii to the
  micrometre) the lap does not quite close (the race's end lies (−2.088, +2.166) m from its start, the qualifying's
  (+1.487, −0.101) m). The last arc's length is solved so that the lap turns exactly once to the right, and two
  straights' lengths so that it closes: of the straights off the line's straight (a straight a Section's border cuts
  counts as two), the two whose headings differ by at least 30° (|sin| ≥ 0.5) with the least of their larger change.
  The race's are 7198–7620 (+2.11 m, to 159.214 m) and 11896–12110 (−1.75 m, to 77.912 m), its last arc 14155–218; the
  qualifying's 1788–2035 (−1.79 m, to 90.162 m) and 4541–4697 (−1.09 m, to 56.980 m), its last arc 5782–5903. These
  three lengths are written as solved; a changed element's steps spread evenly over its length.
- **Plane and stations.** A step of the lap is the station across from P there on the plane, each element's steps
  spread evenly over its written length.
- **Lanes.** a and b, 512 units (3.122 m) each, either side of P; their centres at ±256 units, the grid's. The road
  out to the barriers is one surface: the original has no lane lines.
- **Materials and limits** (each side, from the band tables alone, barrier kinds 1 and 4 one band): a barrier band is
  `ASPHALT` to 820 units (5.000 m), an escape area `ASPHALT` to 992 (the surface boards' edge) and `GRASS` to 1333
  (its hit line 1228 plus half a car), the open band `ASPHALT` to 2712 (the side paving's outer edge). The materials'
  outer edges are the course's limits. Between two bands the edges move linearly over the 4 steps about their border.
  No walls are made, and no object has a body: the original's band table alone acts on its car.
- **Colors** (strips of color alone):
  - **Ground.** The road layer's ground, color 0x32 (RGB555 1144), out to the domain's edges; the race's tunnel's,
    9032–10860, dark (0x0842).
  - **Surface.** ±992 units, each surface board across the road (0x0DA4 at x 0) coloring the road from the board before
    it in the linear-light mean of its picture's colored pixels in its palette (the plain, the tunnel's and the
    bridge's); stretches of one color are one.
  - **Side paving.** The surface boards beside the road (±1720) color 728–2712 units on their side alike, from the
    board before or, first of a run, 10 steps before.
  - **Centre line.** At each surface board, 2 steps long and 80 units wide, the mean of its top row's columns 120–129.
  - **Grid marks.** At each grid slot, on its side, the grid board's row 2 (80–896 units out) 0.5 steps long from the
    slot and its row 22 (64–808) 4 steps before it, each the mean of its line's pixels.
  - **Start line.** At steps 290, 300 and 310, 2 steps long before each, the start board's row 6 across the road as
    its runs of bright (pixels 8–10) and dark (11–13) pixels, each run its mean, over the grid marks.
  - The tire marks and rubber are in the surface's mean; the boards' oval edges and grain are not drawn.
- **Sections.** One a sector between the original's CHECKPOINTs (the race's 288–4697, 4697–9538 and 9538–288; the
  qualifying's 288–4697 and 4697–288), halved where its boards (MG-5's objects but the surface boards) would pass a
  Section's 2048 sprite elements: at the step of the board in its middle, in step order. The race's `sector-1a`/`1b`,
  `2a`/`2b`, `3a`/`3b` split at 2333, 7115 and 12110 (1429/1430, 1585/1586, 1661/1664 boards), the qualifying's
  `sector-1a`/`1b` at 2333 and its `sector-2` (1055). No Section's domain passes over itself. They join by lane a, the
  last to the first.
- **Gates.** The grid's 24 slots, from the front, slot s at step 588 − 12s (lap step 300 − 12s), lane a for even s and
  b for odd: the original's slots 12(23 − s), 12 steps apart, moved on past the line as TSUKUBA's are, 12 steps further
  than the original's line moves them so that the rearmost leaves the camera's 6 m behind it (the format asks it).
  `bikeGrid` is null. The checkpoints `<course>-CP1` (and the race's `-CP2`) end the sectors at 4697 (and 9538); the
  finish `<course>-FINISH` ends the lap.
- **Skies.** `smgp-sky` is baked ([Sky baking](#sky-baking)) from the fine set's background
  ([SUPER MONACO GP's background](#super-monaco-gps-background)): the back layer pages 4–6 side by side (1536 pixels),
  rows 112–239, and the front layer, the town's row, pages 0–3 (2048 pixels), rows 192–239, each pixel its tile's color
  in its palette (pixel 0 transparent), both layers' bottom row the first below the horizon (the original's vertical
  scroll 0x43 brings row 239 to the screen's row 172, its horizon between 171 and 172); the front's pixel f over the
  back's 0.75f + 88 (where the road vanishes both layers show their pixel 354 at heading 0, the front's 0.75f + 88.5:
  0.5 back pixels, 0.12°); the road layer's ramp, color 0x31 the 16 rows above the horizon, then 0x30 to 0x01 a row
  each and 0x00 above, below the horizon the ground's 0x32. `smgp-tunnel-sky` is the tunnel's dark, 0x0842,
  everywhere. The course starts with `smgp-sky` at each Section's start; in the race the tunnel's `smgp-tunnel-sky` as the camera reaches
  step 9054, where the original's background is wholly dark, and `smgp-sky` again at 10750, the middle of its
  brightening (10655–10847), each a `cut`. At heading 0 the road vanishes at the layers' pixel 354 of 1536 (its left
  edge), the sky's column 354 × 1504 / 1536: a Section starting θ0 to the right of heading 0 has yaw origin −θ0 −
  (346.625 − 160) / 240 rad, within ±360° by the sky's period, 1504 / 240 rad.
- **Profile.** Level: the courses do not cross themselves.

### SUPER MONACO GP's objects

Every object of the scenery list but the surface boards (0x0DA4, 0x0DFE, 0x0E1C, 0x0E3A, 0x1F4A and 0x1F92, which are
strips) is a board: the race's 9355, 7248 of them boards with views, the qualifying's 3914 and 3019. None has a body:
the original's band table alone acts on its car.

- **Place.** List word k's objects stand at the station of lap step k's P (each element's steps spread evenly), their
  lateral x / 4 units from P to the right (the word's bit 15 mirrors it), each its own palette (`p` and three decimal
  digits).
- **Height.** h = −50 is the ground. A board stands by the middle of its bottom, `groundOffset` (bottom − (−50))
  × 6.5331 mm, its bottom h, or h less half its picture's height for an object with flag bit 13 (negative too: the far
  buildings and cliffs stand from as much as 9.34 m below the road, as the original draws them).
- **Pictures.** A frame table's largest size, pixels 0 and 15 transparent, by [chosen lines](#chosen-lines): a pixel
  8 / 2^b1 units across (16 for b1 0xFF) and 15/14 of that down at 40 texels/m, so a 2-unit pixel is 0.49 texel
  across (the barriers' 61 rows 32 texels, 0.80 m), a 4-unit one 0.98. A flat or standing board (kinds 0x04, 0x08)
  shows its picture mirrored as its flag bit 10 and the word's bit 15 together mirror it, and flipped by bit 11, the
  unturned picture's lines turned. Its image is `smgp-<frame table>-<b1>[-mirrored][-flipped]` (hexadecimal), in
  every palette it is shown in, the lowest its default: 131 images.
- **Boards with views** (kind 0x0C: the barriers along and across the road, the concrete walls, the kerbs, the
  advertising boards) are [view sets](image-assets.md#view-sets), drawn as the original selects their views
  ([Boards with views](architecture.md#boards-with-views)): view i shows its view table's frame i, mirrored for i ≥ 16
  or, for an object with flag bit 10, always. A set is its view table at a size class, mirrored or not,
  `smgp-views-<view table>-<b1>[-mirrored]`; its distinct pictures stand by their bottom's middle, or the kerbs' (bit 13) by their middle, `groundOffset` (h − (−50)) × 6.5331 mm. The word's bit 15 mirrors only their lateral. Eight
  sets hold 142 pictures: 0x040A at b1 2 (22) and mirrored (11), 0x044A at b1 2 (22), 0x04CA at b1 1 and 2 (20 each),
  0x050A at b1 2 (24) and mirrored (12), 0x058A at b1 1 mirrored (11).
- **Curves' insides.** An object on an arc's inside farther from lane a's centre than the arc's radius less 2 m is
  left out (none is: the nearest, a far building at the race's and the qualifying's step 2166, stands 0.40 of its
  arc's radius inside lane a's centre).
- **Images.** 139 in all, 14.68 M master texels, 76.0 MB of saved JSON (about 5.4 MB compressed, in Git and as Pages
  serves it); the 16-unit class, the far buildings and cliffs, holds 45.3 MB of it, each of the original's pixels
  about 4 × 4 texels. The 2-unit class drops about half its lines, among them 20 one-pixel columns (the kerbs'
  stripes' edges, 0x0774–0x0828, and one each in 0x060C and 0x0AAA) and no row.

The near barriers stand as steps, one picture a board, where the original draws a continuous band: its pictures are
drawn for its eye about 0.57 m above the road at the car, this game's camera 6 m behind and 2 m above it (with the
camera lowered to 0.6 m at the car, the same pictures and selection make the original's continuous band). The pictures
and their selection are the original's as they are, and K kept them so (2026-10-21).

## RACING HERO

RACING HERO's ten countries are raised from MAME's `rachero` (Racing Hero, FD1094 317-0144). Its main CPU's program is
encrypted for instruction fetches alone: its tables (the courses', the sprites' and the background's, all in the main
CPU's program) are read as the ROMs' bytes, and the program is never decrypted. Its ROM set, programs and tables are
described here as [Stage RH](NEXT.md#stage-rh--racing-hero-from-the-roms) reads them, from RH-2.
