# Original road data

OUTRUN's, SUPER HANG-ON's, TURBO OUTRUN's, ENDURO RACER's and SUPER MONACO GP's courses are raised from the road data in
their program ROMs by the [rules of the originals](#rules-of-the-originals). This document owns those rules and the
parts the originals share; each original's ROM set, programs, tables' format and addresses, dump and conversion into
course documents are its own document's: [OUTRUN](outrun-road-data.md), [SUPER HANG-ON](super-hang-on-road-data.md),
[TURBO OUTRUN](turbo-outrun-road-data.md), [ENDURO RACER](enduro-racer-road-data.md) and [SUPER MONACO
GP](super-monaco-gp-road-data.md). What the conversion does not yet cover is NEXT's ([Courses of the
originals](NEXT.md#courses-of-the-originals)).

The road data tool keeps each original's ROM set, addresses and formats in its own modules (`outrun-*`,
`super-hang-on-*`, `turbo-outrun-*`, `enduro-racer-*`, `super-monaco-gp-*`) and what they share in modules of their own:
a program's words and the halves it is interleaved from (`program-words`), the images the ROMs make (`rom-images`: a
program from its pairs of ROMs, the tile ROMs' bit planes and a tile's pixels, the sprite ROMs' words and the road
ROM's lines), the road tables in OUTRUN's format (`road-tables`: palette words and their colors, curves, widths and heights, scenery points, road paths and height tables, and the road
widths they give), the hills, with OUTRUN's road position and stripes' period (`hills`), the profile and a Section's profile knots
(`road-profile`), where a road passes over itself (`crossings`: its cells, those that overlap and what stands on another
passage, and their crossings, parted by the least change), a function
of the road position in quadratic pieces (`quadratic`: a road width or an offset), a heading table's plan
(`heading-plan`: its runs and the turns between them), a closed point path's plan (`point-plan`: its runs' minimax circles and the biarcs between them), a
closed height path's profile (`point-profile`), a rise table's profile (`rise-profile`), the grades' pieces K's
researcher solved and their reader (`screen-pieces`, [Profile from the original's
screen](#profile-from-the-originals-screen)) and a
plan laid in the world (`course-path`: `CoursePath`), how Sections are written (`section-writing`: knots simplified,
sprites repeated, a stripe's halves repeated at its period as written, pictures raised, the plan as written, each joint at its station to the micrometre, so that a station
written at a joint is the joint's, and a Section's domain, its cuts and whether the course format admits it as written,
and its stations as written in every original (`sectionStations`: to the micrometre, `micrometre`; within 2 µm,
`WRITTEN_SLACK`, of a joint the joint's, a gate or a sky's change within it of the Section's start at its start;
within 10 µm of its end the end)), two roads drawn together from one road's picture across (`two-roads`),
the sprite hardware's pixels (`sprite-pixels`), the originals' pixels on this game's texel grid (`pixel-grid`, a
pixel's texels at its width in metres, its pixels by [chosen lines](#chosen-lines) `chosenLines`, a picture turned as
shown, palettes' names, shadows' frames and a board's master), a background baked into one
sky ([`sky-baking`](#sky-baking)), and how objects approach the car (`object-approach`: the tick's advance, an approach
table's step and `startDepth`). Each original's ROM set, and which of its ROMs make which image, are its `<original>-rom` module's.

## Rules of the originals

Every original is raised from its ROMs by these rules (K, 2026-10-18 to 2026-10-23):

- **What stays out.** The ROMs and any raw data taken from them are not committed and appear in no PR: K's zips lie in
  `reference-media/<original>/rom/` (`outrun`, `super-hang-on`, `turbo-outrun`, `enduro-racer`, `super-monaco-gp`), the
  tool's dumps beside them in `rom-data/`.
- **The sets.** Each original is raised from its MAME parent set, which its chapter names (K, 2026-10-23): `outrun`,
  `shangon`, `toutrun`, `enduror` and `smgp`. Where the parent's program is encrypted for data too, its tables alone
  are read from a decrypted bootleg (below).
- **No decryption.** No decrypting code and no key enter the repository or are used. A set whose main CPU's program is
  encrypted for instruction fetches alone (FD1094) is read as the ROMs' bytes, its tables being plain; one encrypted for
  data too (FD1089) is read from MAME's decrypted bootleg set. What a chapter says of an encrypted program's code was
  found by decrypting it for the description; the tool cannot check it and takes it as described.
- **Reading a set.** Every ROM read is found in the set's zips by its CRC-32 and size, whatever a zip names it, each zip
  entry checked against the CRC-32 its archive records; a set missing one is refused, naming the set and the ROM. No
  key is read. A dump records the ROMs read by MAME's names and CRC-32s, from the set's table.
- **What is not linked or shown.** No link to a public place to download ROMs is written in the repository or a PR,
  and no picture setting the original's screen or its ROMs' pictures beside this game's one to one enters either (K may
  be given one privately).
- **Other projects' code.** No code of MAME or of other projects is copied or ported: the formats are read by this
  project's own code from this description and the ROMs themselves.
- **Conversions.** CI has no ROM, so a conversion's results are committed as course documents and images. A conversion
  is deterministic: its command raises them from the ROMs locally, and with `--check` fails where one differs from the
  committed. Each original's chapter records its ROMs' CRCs and its conversion's version; a PR changing a conversion
  raises its version, and a PR changing a shared part says which course of which original changes, and by how much.
  Before each PR every original's `--check` passes on the local ROMs.
- **What is made.** Physics stays as it is: lengths along the road come from the original's displayed speed and its
  clock. Everything that moves is placed standing still. Pictures are resampled at the best quality there is (the ROMs'
  pictures by [chosen lines](#chosen-lines), backgrounds by area averages in linear light, baked into skies by
  [Sky baking](#sky-baking)); the sprites' and backgrounds' pictures converted from the ROMs are committed and shown on
  Pages provisionally, drawn again for the product. The vehicles are this game's, baked from 3D models, so the
  originals' are not converted. Sounds are local originals alone ([Local originals](development.md#local-originals)).
- **Pictures.** How a picture meets the ground in the drawing is
  [Sprites and Painter](architecture.md#sprites-and-painter)'s. The conversions place them so:
  - A background's picture is one board. An anchor is at the bottom edge and at height 0 by default; a picture at
    height 0 anchored elsewhere folds there: above, it stands up from the ground; below, it lies on the nearer ground.
  - A standing thing stands on its base, what floats at its height ([Pictures from the extract](#pictures-from-the-extract)).
    What lies on the ground (sea, waves,
    drifts of sand, patches, puddles, pebbles) is a board of the original's picture at the original's anchor, with no
    body ([Lying boards](#lying-boards)).
  - A board whose foot is below the ground (a negative height) keeps it: the nearer drawn ground hides its part below
    the ground and transparent ground shows it, as a cliff's drop is drawn.
  - A strip the original draws on outward is a board extending sideways ([Extending boards](#extending-boards)); the
    road's surface itself is Strips.
  - A lying picture has no material: the road's Strips alone decide the material (K, 2026-10-25).
  - Only vehicles have pictures by angle.

## Palette words

A palette word `w` is RGB555, each channel four bits over a low bit shared from bits 12–14:
R = (w & 0xF) << 1 | (w >> 12 & 1), G = (w >> 4 & 0xF) << 1 | (w >> 13 & 1), B = (w >> 8 & 0xF) << 1 | (w >> 14 & 1).
Strips take it as their RGB555 as it is.

## Sprite pixels

The sprite ROMs' words, as OUTRUN's sprite hardware and those like it draw them (`sprite-pixels`):

- **Pixels.** Each word holds eight 4-bit pixels, the most significant first. 0 and 15 are transparent. Read from the
  left, a row ends with the word whose bits 4–7 are 15; drawn mirrored, its words are read the other way, the least
  significant pixel first, and the row ends with the word whose bits 24–27 are 15. So COCONUT BEACH's signs read
  "DIVING SCHOOL", "OUTRUN" and "Vulture St. / Dalton Bayside".

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

Base points, bodies' widths and LOD levels are each original's own rules ([Boards](outrun-road-data.md#boards), [SUPER
HANG-ON's courses](super-hang-on-road-data.md#super-hang-ons-courses)); a separate shadow picture is put on the grid the
same way.

## Pictures from the extract

The extract is a picture as its ROM holds it (its pixels, pen 10 among them, its palettes, sizes and mirroring, its
anchor and height) with each use's flags from the original: whether it is drawn with shadows allowed, a separate
shadow picture, whether it lies. It is made from the ROMs again by every conversion and never committed. One set of
rules (`sprite-rules`) makes it a course image, the originals differing only by their flags and K's table:

- **Shadow pen.** In a use drawn with shadows allowed pen 10 is shadow, taken from the picture into its shadow frame;
  in any other use, or where K's table says so, it is a color.
- **The ground's shadow.** Its seeds are the shadow pixels with only shadow or transparency below them in their
  column, and it is what is reached from them through shadow pixels' eight neighbours. K's `paintedShadow` makes the
  pixels of its indices from its row down shadow pixels too, taken from the picture where reached; those not reached
  stay (a rock's black cracks).
- **Fill A.** In a row of the ground's shadow, the picture's pixels between its leftmost and rightmost pixels are
  shadow too and stay in the picture.
- **Base.** A picture stands on its base point, on the bottom edge of its lowest row holding a pixel once its shadow is
  taken, or of K's `base` row, the ground painted below that lying on the nearer ground. Its course image keeps its
  rows to the lower of those, its shadow frame the whole grid, both anchored at the base point. On the ground the
  base is at the original's point, the picture drawn lower than the original by its shadow's rows (K, 2026-10-22);
  raised, at the original's height, its shadow drawn at the picture.
- **Shadow pictures.** A shadow picture its original draws apart is laid where and as large as it draws it, on the
  picture's shadow frame's grid by its anchor.
- **Lying.** A picture its original draws by a routine that puts it on the road lies about its original's anchor
  (`lies`, [Lying boards](#lying-boards)), in its colors, with no shadow.
- **K's table** (`sprite-table.json`) holds K's judgement of a look where the rules cannot tell (K, 2026-10-24):
  `penIsColour`, `paintedShadow`, `base` or `lies`, one a picture of the extract with its reason, in the extract's
  rows.

Every original's pictures are made so, OUTRUN's and TURBO OUTRUN's strips aside. Their flags:

- **OUTRUN.** Drawing 13 (0x3FE8) puts its patches on the road; the scenery's separate shadow is 0xFF56 by its
  entry's bit 1 (a start object's 0x10), the figures after a goal's 0x103B6 at 3/8 of their scale. The sprite list's
  builder (0x94EC) puts its object's byte 7 in its entry's shadow bit (`or.b d1, $6(a6)`
  at 0x9676). The scenery's spawn, by its drawing's entry in the jump table at 0x3DA2, sets it to 7, shadows allowed,
  for drawings 0, 1, 4 to 9, 11 and 12 (the trees, rocks, signs and people, the grass, the stones, VINEYARD's trees, the
  banners) and to 3 for drawings 2, 3, 10, 13 and 14 (the clouds, the sea, the sand, the patches); a start object's
  comes from its record's third byte (0x3B7C) and the flag waver's from its template (0x582E). The goal's scene sets no
  figure's (0x58B4 to 0x5B3A).
- **SUPER HANG-ON.** Its sprite entries (built at 0x2A80 to 0x2C4E) have no shadow bit, and pixel 10 is black in most
  of its sprites' palettes: every sprite's pixel 10 is the hardware's shadow.
- **TURBO OUTRUN.** A kind's flags' bit 2 sets its object's byte 7 to 7, shadows allowed, or 3 (0x5F58), which the
  sprite list's builder puts in its entry's shadow bit (0x11A5A); its bit 1 casts the shadow picture, the size list at
  0x2667A, at the object's anchor and scale (0x1170A). Its routines 0x08, 0x4C and 0x50 put their objects on the road
  (K, 2026-10-25). Each routine sets its object's anchor ([TURBO OUTRUN's
  objects](turbo-outrun-road-data.md#turbo-outruns-objects)). These are read from its program decrypted locally. 0x275A2,
  0x26D82 and 0x26DB4 are shown by kinds that shade and kinds that do not: the latter's are their `-unshaded` images,
  pen 10 a color.
- **SUPER MONACO GP.** Its sprite list's builder never enables shadows: an entry's third word is its depth table's
  word as it is (priority 2, the shadow bit clear), read from its main program decrypted locally (0x87FA, 0x89B8), as
  K's research found; pen 10 is a color.
- **ENDURO RACER.** Scenery is drawn with shadows allowed ([ENDURO RACER's
  objects](enduro-racer-road-data.md#enduro-racers-objects)).

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

## Extending boards

A board extending sideways (`stripCut`, `extending-boards.ts`, shared with [TURBO OUTRUN's
strips](turbo-outrun-road-data.md#turbo-outruns-strips)) is its strip's nearest size, its edge nearest the road on the
left (a mirrored one's columns mirrored), cut in three: its transparent end columns are left out; the part that repeats,
`[repeat, end)`, is at least a quarter of its opaque width, and its two ends join; the shape before it, `[start,
repeat)`, is the edge's, a board of its own (`-edge`) standing once with each placement, not extending. The shape of the
outer end, which nothing continues (a rise, a tapering border), is not used. The cut compares the 8 columns either side
of each candidate seam: first their outline (each column's top and bottom opaque rows) the closest, then the most equal
texels, then the longest repeating part, then the nearest the road. A board and its edge repeat together where the
original brings out its pieces at a steady rate.

## Lying boards

What lies on the ground is a board, its nearest size at the original's anchor (the middle of its picture, H/2 − 0.5,
for OUTRUN's and TURBO OUTRUN's), at height 0, with no body. A picture of [the sprites' rules](#pictures-from-the-extract)
is a lying image (`lies`), all of it on the ground about its anchor; any other folds there, its rows below the anchor
lying on the nearer ground as every picture's do ([Sprites and Painter](architecture.md#sprites-and-painter)). It has
no material: what lies under
it is the material around it, the road's Strips alone deciding it (K, 2026-10-25).

## The board's clock

OUTRUN and TURBO OUTRUN run on one board, and the parts they share (the hills, the objects' approach, the road widths,
the stripes) take each one's clock from its own program (`board-clock`, read by `readClock` in each original's
module):

- **Step.** The road position each km/h advances a tick, 16.16: 0x12F, the long at 0xE2EC in OUTRUN's program and at
  0x1DDEA in TURBO OUTRUN's.
- **Frames.** The main loop waits on a counter it sets to 1 (OUTRUN's `move.w #1, $60800` at 0x7DF4) and the frame
  interrupt counts down past 0: two frames a tick, 30 ticks a second at the video's 60. The phase word gains km/h / 64
  once a frame in the interrupt and once a tick in object 0, three times a tick.
- **Most advance.** An object's depth advances by at most 15 a tick (`cmpi.w #$F, d0` at 0xB9E8), its approach table's
  16 advances.
- **Lines.** The road's 512 lines (`move.w #$200, d3` at S 0x1F36; TURBO OUTRUN's at S 0x1E82).

TURBO OUTRUN's frames and most advance are encrypted instructions, read from its program decrypted locally (K,
2026-10-25): 2 (its wait set at 0xFE68) and 15 (at 0x157BC). From the clock a road position is 65536 / (3.6 × ticks ×
step) m (2.0027 m), a stripe's period 32 × step / (3 × 1024) positions (the fine position gaining km/h / 64 three times
a tick, 32 of it a period), and a width point's rate its speed × 16 / step units a position. A far layer (OUTRUN's
clouds, TURBO OUTRUN's far strip) stands `farUp` road units up: twice the level road's top above the eye, and the eye
(2 × 151 + 72), from the hills' level horizon on the clock's lines.

## Hills

The original builds its hills as shapes on its screen. Its road is 512 lines; level, each line's slope is the horizon's
base 0x240 × 16 (16.16 rows), so the road's top is row 223 − 512 × 9216 / 65536 = 151 (`k1`'s 151.4). The road's top
along a stage (`hillsAlong`) follows from its height points and tables alone; nothing is fitted:

- **The shape.** The lines form seven segments, near to far: s0 = 255(1 − f), s1 = (256 + 255f)/2, and the rest
  R = 512 − s0 − s1 halved in turn, R/2, R/4, R/8, R/16, R/16. Segment 0's slope is the base; each further segment's is
  its predecessor's plus an increment. Each line's row is 223 − the slopes summed from the nearest line ÷ 65536; the
  road's top is the least row.
- **Every line's row.** Line k (0 the nearest) lies in the segment s holding k + 0.5 (b_{s−1} < k + 0.5 ≤ b_s, b_s the
  segments' lengths summed to s's end, b_{−1} = 0); its slope is 16 × base plus segments 1's to s's increments, and its
  row 223 − lines 0's to k's slopes summed ÷ 65536. The screen is 224 rows (0 to 223); a line on row 224 or below is
  not seen. Lines 0 to 510 are read: line 511 lies, by the lines' distances, at the horizon, infinitely far.
- **A line's distance.** Line k lies ln(511 / (511 − k)) / 0.145 positions ahead of the car (ln(511 / (511 − k)) / 0.145
  × 2.0027 + 6 m from this game's camera). The 0.145 is a fit, the stripe tables' flips at lines ≈ 511 e^(−0.145 d), d
  in positions ([OUTRUN's research note](research/outrun.md#camera-eye-height)).
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

At a road position the screen's window is the base, the increments and f `hillsAlong` holds there: kind 0's f is the
segments' (`roadTop`'s), kind 3's only its window's increments, the segments' f 0.

Kinds 0 and 1 are checked on OUTRUN's `k1` ([Checks on `k1`](outrun-road-data.md#checks-on-k1)). Kinds 3 and 4
follow the same idea and are not yet checked against footage; under kind 4's raised base some of stage 0x3B's tables
put the road's top at or above the screen's top.

## Two roads

Two roads drawn together (`composite`, `two-roads`) show, at each point, the surface of either road (its shoulder
included) over road 0's (the left one's) lines and edges, over road 1's, over the ground. Each line and band shown is a
Strip between two features' edges held to lanes, or to a road laid where it passes, each of its edges a Boundary
(`compositeOf`, OUTRUN's road not taken), cut where the arrangement changes; the ground's color is everywhere, its half
0 over its halves. The material under them is one rule: each road's surface is its asphalt, and so is the ground
between two roads where it is no wider than 0.5 m (`OPEN`, `narrowGround`), the ground's beyond, so that the material
changes metres away from where the lanes' rule does. Each original's chapter gives the arrangement at each road width
([OUTRUN's](outrun-road-data.md#cross-section), [TURBO OUTRUN's](turbo-outrun-road-data.md#turbo-outruns-courses)).

## A lateral changed straight between points

Where an original changes a lateral straight between its points (a road width), the course lays it as one monotone
cubic through those points over the whole course (`monotoneCubic`, Fritsch–Carlson): between two points a cubic
Hermite, a point's slope the mean of its sides', level where they differ in sign or one side is level, and at the
course's ends, and an interval's two slopes scaled together where it would overshoot (α² + β² ≤ 9). The curve is one
over the whole course, unbroken at Sections and pieces, and every line made from the lateral (a road's centre, the
lanes) is taken from it. The format lays a lateral straight between knots, so a course writes the curve's value at each
of the original's positions (`writtenAt`). The road passes the original's points; between them, where a point's side is level, the
curve is the smooth step and departs from the original's straight line by at most 9.6 % of the change (1.9 m where
OUTRUN's roads part from 0 to 768). What is drawn follows the joined lateral: the roads, the lanes and the objects'
laterals. What the original's program decides by the lateral's value (whether the roads are apart as an object appears)
is decided by the original's, straight between its points. OUTRUN's and TURBO OUTRUN's road widths are joined so;
[NEXT](NEXT.md#stage-ex--the-originals-courses-exact-their-constants-few) lists the other originals' laterals, each
joined so by its original's PR.

## Sections' cuts

A course's Sections begin where its original changes stage or sector, and each is cut again where its road comes near
itself (`domainCuts`): where the road at one place lies within its lanes' least radius of the road at another
(`passagePairs`, sampled every metre or position), those two passages lie in different Sections. While a pair remains,
one cut parts every pair whose earlier passage lies before the earliest later one, where one can, else the earliest
later passage's pairs. The cut lies between the passages, where the road is one road (OUTRUN's and TURBO OUTRUN's,
where two roads are drawn, at road widths of at most 212 and 250) and before the finish (the format keeps it in the
course's last Section), at the middle of the longest straight of P there,
else of the longest such stretch, its middle more than 2 m from a gate; failing that, on from that stretch's middle by
half metres until it is. The format refuses a Section whose ground beyond the road stops being one-to-one
([Architecture](architecture.md#plan-authority)). A Section whose boards would pass the format's sprite element bound
(2048) is then cut into the fewest parts that hold them, k parts cut at the ⌊j·n/k⌋-th of its n boards in order
(`cutsByCount`); only SUPER MONACO GP's sectors hold so many.

## The ground beside the road

An original's ground (its material beside the road) reaches its vehicle's lateral limit: as far as its program lets the
player's vehicle go beside the road, measured from where the program measures it (K, 2026-10-24). OUTRUN's is 500
units from the car's road's centre (the word at 0xE2F4, which 0xC2B0 adds), 288 beyond the road's three lanes; SUPER
HANG-ON's 500 (the word at 0x8850, which 0x812C reads) and ENDURO RACER's 512 (0x65FE) from P; SUPER MONACO GP's its
band tables' limits. TURBO OUTRUN's is OUTRUN's 500 from the car's road's centre (the word at 0x1DDF6), read from
its encrypted program decrypted locally (K, 2026-10-25), the word itself from the ROMs. The
course limits lie on the ground's edge, the original's line, and a vehicle's body meets them, so its centre stops half
its width inside the original's limit (K, 2026-10-25). While its roads part (0x260310 = 4, from where the width passes
255 to where it passes 768), OUTRUN's program holds the car within 320 of its road's centre; the ground keeps 500 there
too, and 320 is not used (K, 2026-10-25). The ground reaches from a Section's outermost lanes,
zero-wide ones counted, so its edge moves with them and jumps only at a Link; a road's material lies within it, and a
road beyond it (OUTRUN's road not taken) is its colors alone. The course format ends the ground where the plan stops
being one-to-one ([Architecture](architecture.md#plan-authority)). The ROMs hold no material: each original's ground
and road materials are K's decision (2026-10-25), each its own, named with its reason in its chapter.

## The grid

Every original's course has a car grid (`grid`) and a bike grid (`bikeGrid`), the bike grid holding bikes alone, each
as many slots as a run's competitors (K, 2026-10-25; `ruleGrid`, which every original's conversion uses):

1. **The player's slot**, the last, at GO where the original's own vehicle stands there (its x as its program sets it):
   OUTRUN's and TURBO OUTRUN's lane b's centre, SUPER HANG-ON's and ENDURO RACER's P. SUPER MONACO GP's car grid is
   its 24 slots as the original places them, a run taking the first 16; its bike grid's player's slot is the car
   grid's 16th.
2. **The original's slots**: the rivals of the grid's kind the original places at GO, where it places them: TURBO
   OUTRUN's 959 beside the player's car, ENDURO RACER's four bikes abreast with the player's, SUPER HANG-ON's seven
   bikes. Where a body of the kind's largest in the vehicle catalog (a car 4.996 × 2.15 m, a bike 2.38 × 0.85 m) at
   any of them would overlap another's or the player's, or leave the course limits, the grid is the player's slot and
   the general form alone; no one slot is moved.
3. **The rest**, forward of the frontmost slot, in the kind's general form, on the original vehicle's lane and its
   left neighbour, or the two lanes it stands between (a and b in every original):
   - cars one a row, 12 m apart, counted on from the player's slot, the original's among them, the first at the left
     lane's centre, the second at the right's, alternating;
   - bikes four a row, two in each lane a quarter of its width either side of its centre, left to right, the rows 3 m
     apart.

## Plan from a heading table

A heading table, headings each at its position (a table's positions one apart, or as a course places them),
becomes straights and arcs over its positions (`headingPlan`, `heading-plan`) by one constant, the table's resolution
(K, 2026-10-23). A table of heading vectors about 4096 long, as the originals' road paths are, has a resolution of
1.5 / 4096 radians (`VECTOR_RESOLUTION`), a unit and a half of the 4096, where the runs stop growing fewer: SUPER
HANG-ON's AFRICA has 167 runs at one unit, 142 at 1.5 and 141 at 2, and ENDURO RACER 148, 132 and 128. The resolution
the components' rounding alone gives (half a unit either way of each, √2/2 of a unit at 4096) more than doubles every
original's runs (AFRICA 142 to 359, ENDURO RACER 132 to 554, TURBO OUTRUN 781 to 1470), for the tables vary beyond
their components' rounding (K, 2026-10-24).

- **Runs.** In the table's order, a run takes the next heading while some line holds every heading of it within the
  resolution, and ends at the first it cannot take. Its line is its minimax one, the line whose largest departure is
  least: of its headings' hull's edges' slopes, the one at which their spread is least, through the spread's middle;
  one line for three headings or more. A run of two has the line through both, a run of one (only a table's last can
  be one) the level line through it. A line that holds a run holds each part of it, so the run taken a heading at a
  time is the longest, and the runs are the fewest any such rule makes.
- **Arcs.** A run is an arc over its positions at its line's rate, from its line's heading at its first position to
  its line's at its last, however little it turns (an arc's radius has no ceiling but being finite); a run whose line
  is level is a straight, and a run of one heading has no length.
- **Turns.** Two runs are joined by a turn over the step between them, from the first's line at its last position to the
  next's at its first.
- **The lanes' least radius.** No element turns tighter than the least radius the course format lets the lanes on its
  inside keep there (`leastLaneRadius`: the distance from P to the farthest lane edge on that side, the vehicles'
  reach and the clip's tolerance, the most over the element's positions; a tighter curve leaves a lane without
  material, [Architecture](architecture.md#plan-authority)). A turn tighter than that takes one more step on each side
  from the runs beside it, a round, every such turn at once, the fewest that keep it; a turn that takes a run's whole
  arc, or overlaps the next turn, joins it, and turns between the runs beyond; a run whose own arc would be tighter
  is taken into the turns either side of it, as one. This is the one place where the plan departs from its table's
  headings by more than the resolution: a heading table that turns by several degrees in one position (TURBO
  OUTRUN's, at four places) asks for a curve its road cannot take.
- **Headings.** Each element turns from the heading the plan has reached to its end's on the lines: an arc's on its
  run's line, a turn's on the next run's; straights one after another are one.

The rule promises the heading: at every position of the table but a widened turn's, the plan's heading lies within the
resolution of the table's. It does not promise the position: the minimax lines' departures do not sum to nothing, so the
plan may drift from the line the table builds by up to the resolution times the distance (the originals' plans drift
0.12 m at most, SUPER HANG-ON's AMERICA's), within the table's own rounding. `planFidelity` measures both at each
position, and each widened turn's most; the road data commands report them.

## Plan from a point path

A closed path of points, a lap's (SUPER MONACO GP's road path, its steps summed), becomes straights and arcs round it
(`pointPlan`, `point-plan`) by one constant, the path's resolution; every element lies where its points do, so the plan
closes as the path does and lies within the resolution of every point.

- **Runs.** From the first point, a run takes the next point while its minimax circle, the circle whose largest
  distance from its points is least, holds every point of it within the resolution (two points' is the line through
  them). The fit is the Chebyshev one of the circle's implicit form, y + c + n·x + k(x² + y²)/2, by single exchange on a
  frame at the run's middle.
- **Arcs.** A run is an arc of its circle, however little it turns (a straight where its circle is a line), between the
  turns either side of it; a run whose arc would turn tighter than its lanes keep ([plan from a heading
  table](#plan-from-a-heading-table), `leastLaneRadius`) is taken into those turns, as one.
- **Turns.** Two runs are joined by a turn from the first's circle at the foot of a point to the next's at the foot of
  another, the biarc there whose two tangents are as long: two arcs, tangent where they meet. It is over the step
  between the runs, and takes one more step on each side while it still holds every point it spans within the
  resolution, taking at most half of either run; then one more on each side a round, every such turn at once, where
  an arc of it would turn tighter than its lanes keep. A turn that overlaps the next joins it.
- **Lap.** The plan runs from the foot of the first point round to it again, and each point's station is its foot's.
  A lap is written as its elements are, unrounded, so that it closes as they do (the course format checks a circuit
  closes to under a micrometre).

## Profile from a point path

A closed path's heights at its points' stations, a lap's (SUPER MONACO GP's road path, its rises summed), become a
profile round it (`pointProfile`, `point-profile`) by one constant, the path's resolution, as its plan is made from its
points ([plan from a point path](#plan-from-a-point-path)): every piece lies where its points do, so the profile closes
as the path does, in height and in grade, and lies within the resolution of every point.

- **Runs.** From the first point, a run takes the next point while its minimax parabola, the parabola of the station
  whose largest distance in height from its points is least, holds every point of it within the resolution (the
  Chebyshev fit of the heights by 1, s and s²).
- **Pieces.** A run is its parabola between the joins either side of it.
- **Joins.** Two runs are joined from the first's parabola at a point to the next's at another by two parabolas meeting
  halfway between them, the heights and grades meeting at both ends and between them: over the step between the runs,
  and one more step on each side while the join holds every point it spans within the resolution, taking at most half
  of either run.
- **Lap.** The profile runs from the first point round to it again, its height there 0 and its grade there the lap's.

## Profile from a rise table

A rise table, grades each at its position (a table's positions one apart, or as a course places them), becomes vertical
curves over its positions (`riseProfile`, `rise-profile`) as a heading table becomes arcs ([plan from a heading
table](#plan-from-a-heading-table)), by one constant, the table's resolution, a grade:

- **Runs.** A heading table's runs ([plan from a heading table](#plan-from-a-heading-table), `headingRuns`), of its
  grades: each the grades one line holds within the resolution, its line its minimax one.
- **Curves.** A run is a vertical curve over its positions at its line's rate, to its line's grade at its last
  position; a run whose line is level is a tangent, and a run of one grade has no length.
- **Joins.** Two runs are joined by a vertical curve over the step between them, to the next's line at its first
  position.
- **Grades.** Each curve changes the grade from the one the profile has reached; the road is level before the table.

The rule promises the grade: at every position the profile's grade lies within the resolution of the table's. It does
not promise the height, which the minimax lines' departures leave to drift by up to the resolution times the distance.

## Profile from the original's screen

An original's grades are the road its screen shows, read back through the camera that drew it at this game's focal
length, within ±25 % (K's limit): one rule for every original (K, 2026-10-26).

- **A 3D road in the ROMs** (SUPER HANG-ON's vertical vectors, SUPER MONACO GP's point path) is what its screen read
  back gives: its heights times one factor an original, f = min(its lens ratio, 0.25 ÷ its road's steepest grade), the
  lens ratio its focal length over this game's, in screen heights. The road's form is kept and the limit kept by f: a
  camera that tilts with the road, as these two originals' and this game's do, does not tell a long uniform grade on
  the screen, so its screen read again within the limit would change the large form (on SUPER MONACO GP the tunnel's
  climb became a descent).
- **A screen alone** (OUTRUN's and TURBO OUTRUN's height tables, ENDURO RACER's slope words) is read back piece by
  piece: each piece the road whose screen lies nearest the original's, both ways, its grades within the limit (the form
  bending to it), with the fewest PVIs that match within half a row of the nearest. OUTRUN and TURBO OUTRUN bend their
  512 lines on the screen, which no camera does, so they are read through this game's camera (a lens ratio of 1);
  ENDURO RACER draws through a level camera (its horizon does not move), and is read through it at this game's focal
  length.

The rule's constants:

| Constant           | Value                                                                                                      | Why                                                                                                                                               |
| ------------------ | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Grade limit        | ±0.25 (`GRADE_LIMIT`)                                                                                      | K's limit                                                                                                                                         |
| PVIs               | the fewest within half a row of the best look                                                              | where the looks cannot be told apart, the simplest form                                                                                           |
| Hill frames        | the frames where the original's road lies more than a row from its level road                              | the look is measured where there is a hill                                                                                                        |
| Cell               | the whole number of the original's positions nearest 10 m: 5 (10.01 m) OUTRUN's, 8 (9.48 m) ENDURO RACER's | the solve's fineness; one of OUTRUN's screen segments is ln 2 / 0.145 = 4.78 positions (9.57 m) on the road, and ENDURO RACER's cycle is 32 cells |
| Distance steps     | 1/5 row of the reading camera's level road                                                                 | the fineness at which this game's road bands are counted                                                                                          |
| Far                | 200 m (`RENDER_FAR_DEPTH_METERS`)                                                                          | how far this game draws the road                                                                                                                  |
| This game's camera | 6 m behind, 2 m above, focal length 240 (rows of 240) (`CAMERA_DEFINITION`)                                | the product camera                                                                                                                                |

- **Pieces.** OUTRUN's and TURBO OUTRUN's: one a height table the courses run (kinds 0 to 3), the table run alone on the
  level road (base 0x240) as `tableRuns` runs it, a held shape (kinds 1 and 3) at the original's top speed (OUTRUN's
  293 km/h, TURBO OUTRUN's 324). A table run at one speed is one piece wherever it runs; TURBO OUTRUN's tables are
  OUTRUN's 225, so a piece not held serves both, and a held one is one a speed.
  - _Cells_ of 5 positions from the piece's start.
  - _Stretch:_ from the camera's place when the table starts to the first cell border at or past the camera's place when
    it ends. The grades at the cell borders within are free within ±0.25, 0 at its ends; outside it the road is level.
    Past the table's end the original's screen is level, so no grade lies beyond the camera's place then; what the
    original shows ahead before the table ends is not read.
  - _Frames:_ from the fewest cells that reach 200 m (20 cells, 200.3 m) before the stretch to its end: before them no
    stretch lies within 200 m of the camera, and both screens are level. The original's screen is the table's window
    while it runs, the level road elsewhere.
  - _Kind 4_ moves only the base: against the level road of its base its screen stays level, so it has no piece (the
    measure's result, no exception). A piece solved at base 0x240 serves after kind 4 has moved the base, a choice of
    the rule: the original's rows' differences from the level road's do not depend on the base line by line, but which
    lines count (each row's first, the cut at 224) do, so a piece solved at another base would differ a little.

  ENDURO RACER's: the cycle, the normal path's 256 positions (P & 0xFF from 0 to 255), 32 cells of 8 positions, the
  grade 0 at the cycle's start; the road repeats by the cycle ahead and behind (three cycles alike, the middle one's 256
  frames counted). And each hill's cycles as one piece: from the last cycle start at or before the hill's start to the
  first at or after where it ends (the position after its phase 4), or to stage 3's start (4096) where that comes first
  (hill 4, 3840–4096); within, the original's words are the hill's while it runs and the normal path's elsewhere, level
  outside; its frames from 22 cells (176 positions, 208.6 m) before its stretch to its end. No hill's stretch shares a
  cycle with another's. Stage 3 (4096–6143) is level.

- **Cameras.** The road read is seen by the reading camera on rows:
  - _This game's_ (OUTRUN, TURBO OUTRUN), the product camera at rest (`CAMERA_DEFINITION`): the player where the original's car is, the camera 6 m behind
    it and 2 m above, pitched θ = −atan g with the grade g under it. The road D m ahead at height h lies on row
    120 − 240 sin θ − (240 / D)(h − y_c) cos θ of its 240, y_c = h₀ + (2 + 6 sin θ) / cos θ with h₀ the height under
    it; its level road on 120 + 480 / D; both × 224/240 on the original's rows.
  - _ENDURO RACER's_ at this game's focal length: level, 4.19 positions behind the bike. The road d positions ahead of
    the bike lies on ENDURO RACER's row (64 − 165 × 4/128) + (165c/128 − 224 Δh) / (d + 4.19), Δh its height above the
    road at the bike in positions, d + 4.19 its distance from the camera: 165c/128 (694.2) is ENDURO RACER's level road's
    and 224 this game's focal length (its 240 of 240 rows, on the original's 224). ENDURO RACER's own focal length and
    eye are not needed: its screen shows only their product, and a hill's height only with the focal length, so the
    reading does not depend on the lateral scale.
- **Measure.** Each frame, on the original's rows, each screen against its own level road, both ways:
  - _The original's rows,_ one an integer row: its lines are taken near to far, a line seen where it lies above every
    nearer one and its row is below 224; each integer row (its row's floor) takes the first seen line to reach it. At
    that line's distance D the difference is (min(y(D), E(D)) − y₀(D)) − (o − ℓ): y the read road's row, y₀ the reading
    camera's level road's, E(D) the least read row over the distance steps to the farthest at or below D (behind a
    nearer crest, the crest's row), o and ℓ the original line's row and its level road's.
  - _The read road's rows,_ one a distance step: steps D₀ < D₁ < … evenly in 1/D, 1/5 row of the reading camera's level
    road apart (Δ(1/D) 0.2/448 m⁻¹ for OUTRUN and TURBO OUTRUN, 0.2/(694.2 × 32/27) m⁻¹ for ENDURO RACER), from the
    original's nearest line's distance to 200 m. Step k (k ≥ 1) weighs w_k = max(0, E(D_{k−1}) − y(D_k)), the rows it
    shows above the top of the nearer road; its difference is (y(D_k) − y₀(D_k)) − e(D_k), e(D) what the original's
    road shows at D: its lines' rows, cut at 224 and made least from near to far, linear in D between lines and its
    farthest line's beyond, less its level road's rows likewise. The read road's rows are not cut.
  - _Cost:_ the squares of both ways' differences summed over the frames, the original's rows one each and the read
    road's by w; ENDURO RACER's cycle counts the middle cycle's frames.
  - _Look:_ the root mean square of both ways' differences over the hill frames, divided by the original's rows counted
    and the w summed: rows of the original's 224.
- **Solve.** The grades lie on the cell borders, linear within a cell (the heights quadratic). The stretch's grades
  within ±0.25 that make the cost least are found from level by a quasi-Newton method with bounds (L-BFGS-B's kind),
  the cost's derivative taken with the hidden original's rows moving with the crest's step (the cost is not smooth
  where they are hidden).
- **PVIs.** At first every cell of the stretch is a vertical curve. One move at a time, solved again from the last
  answer (a joined border's grade from the mean of the two before, a border gone dropped), until one vertical curve is
  left, which is level (0 PVIs):
  - _Moves:_ a vertical curve made straight (its two ends' grades one), or two neighbouring vertical curves made one (the
    middle border's grade on the line between the outer two's).
  - _The move taken_ is the one of least linearised cost (L v)² / (L P Lᵀ): v the free grades, L the move's linear
    condition (= 0), P = (JᵀJ + 10⁻⁹ tr(JᵀJ)/n I)⁻¹ with J the differences' Jacobian at the answer and n the free grades,
    the read road's weights w held at their values and the hidden original's rows moving as for the derivative. A move
    with L P Lᵀ at most 0 is not counted; where none is, the first vertical curve is made straight. Of equal values the
    vertical curve nearer the stretch's start comes first, and for one vertical curve straight before joined; a later
    move replaces an earlier only when strictly less.
  - _The piece_ is, of the answers along the way, the one with the fewest vertical curves within 0.5 row of the best
    look, the looks rounded to 0.001 row. A piece with no hill frame (a table whose screen keeps within a row of the
    level road, table 0) is level.
- **The pieces kept.** The pieces lie in the repository (`tools/road-data/screen-pieces.json`): solving them all takes
  over an hour, so the courses read them. K's researcher solved them (2026-10-26), OUTRUN's and TURBO OUTRUN's tables
  their courses run and ENDURO RACER's all. `screenPieces` (`screen-pieces`) admits them once: their shape, each
  piece's changes within its stretch and summing to 0, and its grades within `GRADE_LIMIT`. The solve is not convex,
  and the PVIs are taken greedily one at a time, so another implementation may solve a few weakly determined tables
  to other pieces; the canon is the pieces kept.

## Profile

A road's profile is its grades by the [grades' rule](#profile-from-the-originals-screen), its crossings, jumps and dips
on them:

- **Pieces placed.** OUTRUN's and TURBO OUTRUN's height points stand where the original's main CPU puts them on each
  span, in the road's order: a stage's before its end, a fork's before the fork's piece at its start, the goal
  straight's. Each stretch the original runs on without a stop runs its tables by one `tableRuns`, OUTRUN's a road and
  TURBO OUTRUN's a leg (the original stops the car at a leg's end and starts the next anew); a point reached while a
  table runs is dropped, across a span's or a stage's end too (in the original a table runs on into the fork), and a
  hold counts at the original's top speed (OUTRUN's 293 km/h, TURBO OUTRUN's 324). Each run lays its table's piece
  whole, a held one its speed's, its stretch from this game's camera's place when the table starts, the camera's
  distance (6 m) before the car's station, not cut at a span's or a stage's end (`tableGrades`). Kind 4's tables have
  no piece; a run whose piece the pieces lack stops the conversion.
- **ENDURO RACER's** run from position 0 cycle by cycle (256 positions): stage 3 (4096–6143) level; each hill's stretch,
  from the last cycle start at or before its start in the hills' table for its piece's cycles, its piece; every other
  cycle the cycle's piece. Each lies from the reading camera's place when the road position is its first, 4.19
  positions behind the bike (6 + (c − 4.19) × 32/27 m, c its first position); from 10240, the stages' end, the road is
  level (the goal's straight's original hills are not read). A hill's stretch that shares a cycle with another's stops
  the conversion.
- **The grade** is the pieces' summed, level outside them, the height carried along the road (`bendOf`, `profileOf`):
  the road's start and end may differ in height (K, 2026-10-23). Where two pieces overlap (one past a leg's end over the
  next leg's) their grades add, a choice, as the original never shows both; past the road's end a piece is cut.
- **Crossings.** A road's cells are its cross-sections, to the edge bands, between a position and the next. Where a
  plan passes over itself (pairs of its cells starting at least 200 m apart that overlap), a passage is a run of the
  cells taking part, running on over gaps of up to 3 positions, and passages linked by overlaps make one crossing;
  what stands on another passage overlaps a cell starting at least 200 m away. Two overlapping passages are kept at
  least 3 m apart (K, 2026-10-26) by the least change, on the heights the profile, the jumps and the dips make
  (`partedCrossings`), whatever made them:
  - _What moves._ Every height between the road's ends, whose heights stay. A passage moves as one, by its rise, so the
    roads keep their form where they cross; between two passages along the road, or a passage and an end, the road
    ramps from the one's rise to the other's, level at both ends.
  - _How a change is measured._ By its ramps' curvatures (the vertical acceleration each adds at a speed, over the speed
    squared): the largest first, then the largest of the ramps left, and so on.
  - _What it keeps._ The least ramp for its rise: no ramp level at both ends and no steeper than ±25 % (K's limit)
    rises more at a curvature k over L than two vertical curves of curvature k meeting halfway, rising k L² / 4, or,
    where they would be steeper (k L > 0.5), two such curves to 25 % and a tangent at it between them, rising
    0.25 (L − 0.25 / k); a ramp is those curves at the least k that rises its r. The jumps' and dips' form, which the
    ramps add to.
  - _The least._ Of two overlapping passages the higher over their pairs goes over (the later where level, their mean
    difference within a micrometre, as heights are written), and rises by what 3 m lacks at their nearest pair more
    than the lower. These and the ramps bound the rises' differences, so the least largest curvature is that of the
    cycle of ramps and orders needing most, where the ramps' most rises at it meet what its orders need (Dinkelbach's
    iteration over Bellman and Ford's negative cycles, each cycle's curvature by bisection); every least change holds
    that cycle's ramps at it. Those fixed, the next cycle's are, and so on: the rises are one answer, and a ramp no
    cycle needs stays level.
- **Jumps and dips** (K, 2026-10-26). What the originals throw or jolt a vehicle with is a symmetric triangle across the
  whole road of K's values, computed from neither the ROMs nor a vehicle's data: ENDURO RACER's jump a rise 1 m high,
  3 m either side of its top, at each of its original's 69 jumps; TURBO OUTRUN's a dip 0.1 m deep, 2 m either side of
  its bottom (4 m long), at each of its original's 96 rows of boards. It is added to the profile, the grade kinked at its
  foot, over its top and back at its end (`moundKinks`), and the crossings are parted on it as on every height. Where
  two overlap the one farther from the road is taken (a rise's higher, a dip's lower), kinked where their sides meet;
  none is left out. On its slopes the road's colors (its stripes, lines and edge bands, not the ground beside it) are
  changed in the conversion (`slopeColor`): a slope facing the camera (a rise's near side, a dip's far side) brightened
  halfway to white, one facing away (a rise's far side, a dip's near side) at the shadow's half brightness, a stripe cut
  where a slope ends within it. On a hill a slope's grade adds to the profile's, so the steepest grade may pass 25 %.

- **Knots.** Each stretch of constant curvature is a PVI at the intersection of the tangents at its ends, its station to
  1e-9 m (finer than a station's µm, so that both tangents' grades hold), its curve 2 µm shorter at each end so curves
  that meet stay apart; a mound's kink is a knot of no curve, the stretches broken there; stretches break at the
  Sections' cuts, and a knot next to a cut lies on the cut's tangent at its station as written, so joined Sections' heights and grades agree; a
  Section joined at both ends whose one stretch spans it has its knot where the tangents at its two cuts meet, so both
  grades hold.

COCONUT BEACH's profile against the original's is OUTRUN's ([COCONUT BEACH's
profile](outrun-road-data.md#coconut-beachs-profile)).

## Raising the originals again

Every original's courses can be raised again from K's ROM zips and this repository alone. The zips, MAME's parent sets
(their ROMs and CRC-32s are each original's ROM set section's):

| Original        | Zips                          | In                                     | ROM set                                                                            |
| --------------- | ----------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------- |
| OUTRUN          | `outrun.zip`                  | `reference-media/outrun/rom/`          | [ROM set](outrun-road-data.md#rom-set)                                             |
| SUPER HANG-ON   | `shangon.zip`                 | `reference-media/super-hang-on/rom/`   | [SUPER HANG-ON's ROM set](super-hang-on-road-data.md#super-hang-ons-rom-set)       |
| TURBO OUTRUN    | `toutrun.zip`                 | `reference-media/turbo-outrun/rom/`    | [TURBO OUTRUN's ROM set](turbo-outrun-road-data.md#turbo-outruns-rom-set)          |
| ENDURO RACER    | `enduror.zip`, `endurobl.zip` | `reference-media/enduro-racer/rom/`    | [ENDURO RACER's ROM set](enduro-racer-road-data.md#enduro-racers-rom-set)          |
| SUPER MONACO GP | `smgp.zip`                    | `reference-media/super-monaco-gp/rom/` | [SUPER MONACO GP's ROM set](super-monaco-gp-road-data.md#super-monaco-gps-rom-set) |

`npm run road-data -- originals` ([Development](development.md#road-data-commands)) runs, in this order,
`outrun-boards`, `outrun-course`, `super-hang-on-course`, `turbo-outrun-course`, `enduro-racer-course` and
`super-monaco-gp-course`, each finding its zips in its ROM directory: the courses, the boards and pictures their objects
show and the skies, written to `content/`. With `--check` it writes nothing and every command compares what it raises
with what is committed. Each command's result is one line of JSON; a command that fails (a zip missing, a set refused,
a document differing) is reported on its line and the rest still run, and the command then ends with a failure. The
last line names the courses whose documents changed, whose identities change with them: their measured products are
made again with `npm run measure -- generate` ([Measured products](development.md#measured-products)).

The grades' pieces are the repository's (`tools/road-data/screen-pieces.json`): the commands read them and do not solve
them ([Profile from the original's screen](#profile-from-the-originals-screen)).

The local originals of the recordings are not raised by it: `outrun-sounds` writes them, with ffmpeg
([Local originals](development.md#local-originals)). The dumps (`<original>-read`) are research's, not the courses'.
Neither the research tools nor K's research kit (its harnesses and decrypting code) is needed to raise the courses.

## Raising an original from its ROMs

The way OUTRUN, SUPER HANG-ON, TURBO OUTRUN, ENDURO RACER and SUPER MONACO GP were raised, as steps and checks for
the next original. Each original's tables and rules are in its own road data document; this is the procedure
they share. Research (reading the program, emulating it, deciding) is done on K's machine with the research tools
(`tools/research/`) and K's local research kit; the road data tool reads only the ROMs' tables and writes the courses.

### 0. Rules

The rules of the originals (what never enters the repository, decryption, other projects' code, the picture rule) are in
[Rules of the originals](#rules-of-the-originals); every step below keeps them.

### 1. The ROM set

- Take MAME's parent set of the original, the version K names. Check every ROM in the zip against MAME's current list
  for that set (`ROM_START` in its driver): name and CRC-32 (`rom_set_check.py`), and size (`zip_list.py`). Record the
  set, its MAME description and any ROM whose name or content differs (an older MAME's zip may name ROMs differently; a
  key file may differ).
- Note the clones: regions, revisions, cabinets, bootlegs. Some hold other content (another course order, other
  courses); some are decrypted bootlegs a tool may read.
- Find the encryption: none; FD1094 (instruction fetches only, so every table is plain in the ROM's bytes); FD1089
  (instructions and data: read the tables from a decrypted bootleg set, else they cannot be read by the tool).
- The road data tool reads the set by the ROM rule of the [rules of the originals](#rules-of-the-originals); record any
  ROM whose name differs from MAME's current list.

### 2. The board and the programs

- Identify the board (Hang-On / Space Harrier, OutRun, X board, Y board, …), its CPUs, which CPU holds which tables, and
  how the shared RAM maps between them.
- Assemble each CPU's program from its ROMs (even and odd bytes interleaved); note mirrors.

### 3. Finding the tables

- Start from what the program shows: strings (stage names, debug labels), the stage setup routine, the per-tick road
  advance, the routines that read a pointer and step through records.
- For each table record its address, entry format, terminator and who reads it (routine and RAM variable). Expect: stage
  or section descriptors; the plan (curves with radii, or heading tables, or path vectors); widths; heights or slopes;
  scenery points and object types; colors (road, ground, sky ramp); background layers and palettes; start, checkpoint
  and goal objects; the time and extension tables.
- Confirm by running the program (research emulation, on K's machine): dump RAM and compose frames from the tilemaps,
  sprites and road layer; check that a table's entries appear where the reading says, at the frames and positions
  recorded as evidence.

### 4. Length and time

- Find the tick (often two frames, from the main loop's wait on the frame interrupt) and the road position (usually a
  16.16 long).
- Along the road the scale follows the [rules of the originals](#rules-of-the-originals): find the program's amounts
  that give it (the advance per tick against the displayed speed, or the clock against the camera's units a tick) and
  check them where possible (K's video, the clock against frames).
- Across and up, the original's world often keeps no one scale, so the scale is K's, decided by driving (K,
  2026-10-26): a lane of 3.6 m in OUTRUN and TURBO OUTRUN, 4.3 m in SUPER HANG-ON and 3.8 m in ENDURO RACER, and SUPER
  MONACO GP's street, where the player's vehicle is an overlay drawn smaller than the world, 11 m between its
  barriers. Up is 15/14 of across where the original projects both alike (its 320 × 224 screen is shown at 4:3). For a
  new original, report the alternatives with their costs (texel bounds, grid lengths, closure, how objects and the eye
  compare) for K to choose.

### 5. Plan, profile, cross-section

- The plan becomes straights and arcs by the [plan from a heading table](#plan-from-a-heading-table), or from the
  table's own arcs where it holds them; each original's document records how far its plan lies off its path.
- Lanes lie on the material and keep their number across a Section's Links; SUPER HANG-ON, ENDURO RACER and SUPER
  MONACO GP lay two lanes, a and b, either side of the original's centre line, and an original's painted lanes are
  Strips over them.
- Heights by the [grades' rule](#profile-from-the-originals-screen): a 3D road in the ROMs times its factor, or its
  screen read back piece by piece ([Profile](#profile)); record the original's height or slope format.
- Cross-section: lanes, lines, edge bands from the road ROM's nearest line or the surface sprites; colors and the
  stripes' period and phase (check the phase in the original, the bike or car held still while the position is set).
- Materials and limits from the original's band or zone tables where it has them; where a car cannot go, the course
  limit alone decides.

### 6. Objects

- Pictures follow the picture rule of the [rules of the originals](#rules-of-the-originals) and the [picture
  contract](image-assets.md#picture-contract). Walls (`walls`) are not used.
- Place each object at its station and lateral as the original's routine places it, with its picture's bottom edge at
  the height the original draws it, its mirroring and palette; spawn and approach rules decide where it stands (simulate
  them tick by tick at the speed the original's layout assumes).
- Bodies follow the original's hit routines: an object it tests gets a body as wide as its extents, at most its
  picture's colored columns, the shadow's pixels aside (`coloredColumns`); the rest pass through.
- Pictures by chosen lines at their size class; check the course's texel and image bounds.

### 7. Skies

- Bake the background into one sky by [Sky baking](#sky-baking);
  background changes (stages, tunnels, weather) become sky changes at the original's positions, which the renderer
  reaches with the point its camera follows ([Architecture](architecture.md#ground-and-background)).

### 8. The original's camera

- Measure the eye on a level road: the horizon row y_h and the road's lateral scale s (pixels a unit) at a row y give
  the eye H = (y − y_h) / s in lateral units, the same at every row for a pinhole projection. Report it raw and with
  rows 15/14 of a column, in metres at the adopted scale, against the player's vehicle, and the camera's distance and
  field of view where the original's depth allows (its along-road depth is often not a perspective). Measure and record
  its focal length too, in screen heights, so its lens ratio, which the [grades' rule](#profile-from-the-originals-screen)
  scales by. Each research note's Camera (eye height) section keeps its original's figures.

### 9. Sections, gates, limits of admission

- Cut Sections where the original changes stage or sector, and again where its road comes near itself (within its lanes'
  least radius) or its boards pass the format's sprite element bound; check every bound in [Numeric and resource
  domains](content-and-gameplay.md#numeric-and-resource-domains).
- Gates: the grids by [The grid](#the-grid); checkpoints, the finish or goal, as the original places them.

### 10. Identity and checks

- A course's identity is [Content and gameplay](content-and-gameplay.md#compiled-identity-and-project-publication)'s;
  the checks before handing over are [AGENTS](../AGENTS.md)'s and the [rules of the originals](#rules-of-the-originals)'
  (every original's `--check`).
