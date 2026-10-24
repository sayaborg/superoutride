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
a program's words and the halves it is interleaved from (`program-words`), the road tables in OUTRUN's format
(`road-tables`: palette words, curves, widths and heights, scenery points, road paths and height tables, and the road
widths they give), the hills (`hills`), the profile, the crossings' bumps and a Section's profile knots
(`road-profile`), where a road passes over itself (`crossings`: its overlapping cells and their crossings), the plan
laid off a road path with its corners rounded (`offset-plan`, with OUTRUN's road position and stripes' period), a road
path as straights and arcs (`path-plan`: `sectionPlan`), a heading table's plan (`heading-plan`: its runs and the turns
between them), a closed point path's plan (`point-plan`: its runs' minimax circles and the biarcs between them) and a
plan laid in the world (`course-path`: `CoursePath`), how Sections are written (`section-writing`: knots simplified,
sprites repeated, pictures raised, the plan as written, each joint at its station to the micrometre, so that a station
written at a joint is the joint's, and a Section's domain, its cuts and whether the course format admits it as written,
a station within 2 µm of a joint the joint's), two roads drawn together from one road's picture across (`two-roads`),
the sprite hardware's pixels (`sprite-pixels`), the originals' pixels on this game's texel grid (`pixel-grid`, its
pixels by [chosen lines](#chosen-lines) `chosenLines`, palettes' names and shadows' frames), a background baked into one
sky ([`sky-baking`](#sky-baking)), and how objects approach the car (`object-approach`: the tick's advance, an approach
table's step and `startDepth`). Each original's ROM set and how its programs and pictures are assembled from it are its
`<original>-rom` module's.

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
  - A standing thing stands on its bottom edge, what floats at its height. A picture drawn with a shadow at its foot
    stands at its foot, the shadow below it lying ([Foot shadows](#foot-shadows)). What lies on the ground (sea, waves,
    drifts of sand, patches, puddles, pebbles) is a board of the original's picture at the original's anchor, with no
    body ([Lying boards](#lying-boards)).
  - A board whose foot is below the ground (a negative height) keeps it: the nearer drawn ground hides its part below
    the ground and transparent ground shows it, as a cliff's drop is drawn.
  - A strip the original draws on outward is a board extending sideways ([Extending boards](#extending-boards)); the
    road's surface itself is Strips.
  - Materials lie beneath as colorless Strips, water `WATER` and only inside the course limits.
  - Only vehicles have pictures by angle. A report begins with one line saying where K can see the change, and names a
    replacement that cannot be avoided on the next.

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

## Foot shadows

The sprite hardware of OUTRUN, SUPER HANG-ON, TURBO OUTRUN and ENDURO RACER draws pixel 10 of a sprite drawn with
shadows allowed as a shadow: it darkens what lies behind it, its palette color unused. Many pictures (trees, rocks,
signs, people, lamps, fences) carry rows of it below their foot, their shadow on the ground. Such a picture standing on
the ground stands at its foot (`footAnchorY`, K, 2026-10-22): its anchor is the bottom edge of its lowest row holding a
pixel other than pixel 10, and the shadow's rows below lie on the nearer ground as every picture's rows below its
anchor do; the foot stands at the original's point, so the picture is drawn lower than the original by its shadow's
rows. Pixel 10 keeps its color in the board. A picture whose other pixels reach its last row, and one shown only raised
off the ground (a nonzero `groundOffset`), stands on its bottom edge. A picture at its foot that is shown raised too is
shown so by its `-raised` image on its bottom edge (`raisedSplit`).

- **OUTRUN.** The sprite list's builder (0x94EC) puts its object's byte 7 in its entry's shadow bit (`or.b d1, $6(a6)`
  at 0x9676). The scenery's spawn (0x3DA2) sets it to 7, shadows allowed, for drawings 0, 1, 4 to 9, 11 and 12 (the
  trees, rocks, signs and people, the grass, the stones, VINEYARD's trees, the banners) and to 3 for drawings 2, 3, 10,
  13 and 14 (the clouds, the sea, the sand, the patches); a start object's comes from its record's third byte (0x3B7C)
  and the flag waver's from its template (0x582E). The goal's scene sets no figure's (0x58B4 to 0x5B3A): the figures
  stand on their bottom edge.
- **SUPER HANG-ON.** Its sprite entries (built at 0x2A80 to 0x2C4E) have no shadow bit, and pixel 10 is black in most
  of its sprites' palettes: every sprite's pixel 10 is the hardware's shadow.
- **TURBO OUTRUN.** A kind's flags' bit 2 marks its pixel 10 as shading. A picture stands at its foot where a kind
  showing it on the ground shades: 0x275A2 is shown by kinds that do (375 times) and kinds that do not (76), whose pixel
  10 is then a color drawn on the nearer ground.
- **ENDURO RACER.** Pixel 10 is the board's shadow picture ([ENDURO RACER's
  objects](enduro-racer-road-data.md#enduro-racers-objects)); a board with transparent rows below its other pixels
  stands at its foot, its shadow picture anchored as it is. The jumps stand on their bottom edge.

The anchors raised, texels above the bottom edge (a mirrored and a shadowed board as the plain one):

| Original      | Pictures                                                                                                                                                                                                                              |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OUTRUN        | 9: 041; 7: 015, 032, 034, 088, 089; 5: 029, 090, 110, 129; 2: 030, 036, 037, 038, 052, 091, 093, 097, 130, 132, 147; 1: 028, 144                                                                                                      |
| SUPER HANG-ON | 6: 089; 5: 048, 071, 072; 4: 056, 067, 068, 069, 087; 3: 000, 037, 047, 055, 063, 070, 074, 080; 2: 002, 004, 058, 062, 076, 079; 1: 009, 039, 040, 043, 044, 045, 046, 051, 053, 065, 073, 078, 081, 082, 083, 084, 085, frame 13734 |
| TURBO OUTRUN  | 9: 26E18; 5: 277DC; 2: 26A62, 26A94, 26BF2, 26C56, 26D50, 26E4A, 26EE0, 275A2, 27778; 1: 26E4A at 1 unit a pixel                                                                                                                      |
| ENDURO RACER  | 3: 10AD2; 2: 10550; 1: 103CA, 10582, 109D8, 111F8, 1141E                                                                                                                                                                              |

Shown raised too, by their `-raised` image: OUTRUN's 052 (and mirrored), 129 and 132; TURBO OUTRUN's 26A62 (and
mirrored) and 26E4A at 1 unit a pixel. SUPER HANG-ON's and ENDURO RACER's pictures at their foot are shown only on the
ground.

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
for OUTRUN's and TURBO OUTRUN's), at height 0, with no body: its rows below the anchor lie on the nearer ground as
every picture's do ([Sprites and Painter](architecture.md#sprites-and-painter)). Its material lies beneath it as a
colorless Strip (`lyingMaterials`, `ground-materials.ts`), as the camera sees the piece pass beside the player: the
camera definition's, 2 m high and 6 m behind. A row r m below the anchor lies 6r / (2 + r) m nearer than the piece
(beyond it for negative r).

- **Strips.** A strip's material runs from its waterline, a Boundary `water-<side>` through each piece's road-side
  edge at its foot (where its bottom opaque row meets the ground), out to the outer Boundary of its side
  (`outer-left` or `outer-right`), along from the first piece's foot to the last's of each run (pieces within 16 m of
  the next), over each stretch where the waterline lies 1 m inside the outer Boundary: none beyond the course limits,
  which do not move. A side's runs share its Boundary while they follow one another, a knot at each piece and at each
  run's ends; past 1024 knots they are thinned to within 0.25 m, each run's ends kept (the conversion stops beyond
  that).
- **Patches.** A patch's material is the rectangle of its foot: across its picture's opaque columns, along from where
  its bottom to where its top opaque row meets the ground.

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

## Two roads

Two roads drawn together (`composite`) show, at each point, the surface of either road (its shoulder included) over road
0's (the left one's) lines and edges, over road 1's, over the ground: between two roads at road width w (centres ±w) the
middle is at w = 0 three lanes, at 72 four (the middle line 5.33 wide, the next 7.33), at 162 five (an edge band 0.67
wide of road 0 at 87.33), at 212 six equal ones (the outer lines one line 12 wide), between 228 and 250 an edge band
2(w − 228) wide, beyond 250 the ground 2(w − 250) wide. Each line and band shown is a Strip between two features' edges
held to lanes (a road's centre lies 212 units inside its outer lane's outer edge, or its inner lane's inner edge), or
to a road laid where it passes, each of its edges a Boundary (`compositeOf`, OUTRUN's road not taken), cut where the
arrangement changes. ASPHALT lies under each road from its centre ∓ 250 within the ground, SAND beneath all to the
[ground's width](#the-ground-beside-the-road); the ground's color is everywhere, its half 0 over its halves.

## A lateral changed straight between points

Where an original changes a lateral straight between its points (a road width), the course lays it as one monotone
cubic through those points over the whole course (`monotoneCubic`, Fritsch–Carlson): between two points a cubic
Hermite, a point's slope the mean of its sides', level where they differ in sign or one side is level, and at the
course's ends, and an interval's two slopes scaled together where it would overshoot (α² + β² ≤ 9). The curve is one
over the whole course, unbroken at Sections and pieces, and every line made from the lateral (a road's centre, the
lanes) is taken from it. The format lays a lateral straight between knots, so a course writes the curve's value at each
of the original's positions. The road passes the original's points; between them, where a point's side is level, the
curve is the smooth step and departs from the original's straight line by at most 9.6 % of the change (1.9 m where
OUTRUN's roads part from 0 to 768). What is drawn follows the joined lateral: the roads, the lanes and the objects'
laterals. What the original's program decides by the lateral's value (whether the roads are apart as an object appears)
is decided by the original's, straight between its points. OUTRUN's road widths are joined so (`joinedWidth`); EX-7i
lists the other originals' laterals, each joined so by its original's PR.

## The ground beside the road

An original's ground (its material beside the road) reaches as far beyond the outermost lane's edge on each side as the
farthest of its objects shown on the ground (at height 0) reaches on any of its courses, to its picture's outer edge,
its base point and half its width (`groundWidth`); an extending board counts by its one repeat and its edge, not as far
as it repeats. One width an original, the most over its courses. The ground reaches from a Section's outermost lanes,
zero-wide ones counted, so its edge moves with them and jumps only at a Link; a road's material lies within it, and a
road beyond it (OUTRUN's road not taken) is its colors alone. The course format ends the ground where the plan stops
being one-to-one ([Architecture](architecture.md#plan-authority)).

## Plan

The offset plan (`OffsetPlan`), on which no original's course is now laid, is where the original draws the centre lane:
its road path P laid off sideways by the centre lane's centre. P turns as S's path table does, at one rate between
breaks: the stretch's ends, and two positions either side of each join of its curves (moved back by `pathOffset`), so
that a join's own turn stays at the join; a straight holds the middle of the path's headings inside it. Over any 50 m,
fitted, P lies within 0.26 m of the path the table draws. The centre lane is at a stage b's (−(w + 70.67 + c) / 2 from
the roads' middle, −w at w ≥ 212), or e's (its mirror) where the stage is entered from a fork's left side. A position's
station is the arc length along the plan to the point across from P there (`OffsetPlan`); everything placed by position
(widths, objects, gates, height tables, sky changes) takes it. As straights and arcs: a straight where P is straight and
the offset changes evenly, an arc where P is an arc and the offset holds, else arcs of at most 2 positions (4 on a
straight) turning as the curve does, each joint within 1 cm of the curve (the largest of the roads 4.5 mm). A corner of
the curve (P's curvature changing while the offset changes) is turned by an arc either side, each turning half of it, no
sharper than 120 m and within 3 mm of it. An arc that would be straighter than 40 km is a straight, its turn carried on;
one shorter than a millimetre (two breaks all but together) is carried on into the next, its length and its turn.

## Plan from a heading table

A heading table, headings each at its position (a table's positions one apart, or as a course places them),
becomes straights and arcs over its positions (`headingPlan`, `heading-plan`) by one constant, the table's resolution
(K, 2026-10-23). A table of heading vectors about 4096 long, as the originals' road paths are, has a resolution of
1.5 / 4096 radians (`VECTOR_RESOLUTION`), a unit and a half of the 4096, where the runs stop growing fewer: SUPER
HANG-ON's AFRICA has 167 runs at one unit, 142 at 1.5 and 141 at 2, and ENDURO RACER 148, 132 and 128.

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

## Plan from a path

A road path becomes straights and arcs over its positions (`sectionPlan`, `path-plan`), on which no original's course
is now laid:

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

## Profile

A stage's profile turns its height tables' look on the original's screen into grades this game's camera shows alike
(`npm run road-data -- outrun-look` reports it for every stage):

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
  that meet stay apart; stretches break at the Sections' cuts, and a knot next to a cut lies on the cut's tangent, so
  joined Sections' heights and grades agree; a Section joined at both ends whose one stretch spans it has its knot where
  the tangents at its two cuts meet, so both grades hold.

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
- Across and up, the original's world often keeps no one scale. K's rules decide it: a lane from the rider's or car's
  picture against a real vehicle's (SUPER HANG-ON, ENDURO RACER), or the road's width from its pictures (SUPER MONACO
  GP's street, where the player's vehicle is an overlay drawn smaller than the world). Up is 15/14
  of across where the original projects both alike (its 320 × 224 screen is shown at 4:3). Report the alternatives with
  their costs (texel bounds, grid lengths, closure, how objects and the eye compare) for K to choose.

### 5. Plan, profile, cross-section

- The plan becomes straights and arcs by the [plan from a heading table](#plan-from-a-heading-table), or from the
  table's own arcs where it holds them; each original's document records how far its plan lies off its path.
- Lanes lie on the material and keep their number across a Section's Links; SUPER HANG-ON, ENDURO RACER and SUPER
  MONACO GP lay two lanes, a and b, either side of the original's centre line, and an original's painted lanes are
  Strips over them.
- Heights: level until the hills stage, but for the crossings' bumps ([Profile](#profile)); record the original's height
  or slope format.
- Cross-section: lanes, lines, edge bands from the road ROM's nearest line or the surface sprites; colors and the
  stripes' period and phase (check the phase in the original, the bike or car held still while the position is set).
- Materials and limits from the original's band or zone tables where it has them; where a car cannot go, the course
  limit alone decides, and water takes its material only inside it ([rules of the originals](#rules-of-the-originals)).

### 6. Objects

- Pictures follow the picture rule of the [rules of the originals](#rules-of-the-originals) and the [picture
  contract](image-assets.md#picture-contract). Walls (`walls`) are not used.
- Place each object at its station and lateral as the original's routine places it, with its picture's bottom edge at
  the height the original draws it, its mirroring and palette; spawn and approach rules decide where it stands (simulate
  them tick by tick at the speed the original's layout assumes).
- Bodies follow the original's hit routines: an object it tests gets a body as wide as its extents; the rest pass
  through.
- Pictures by chosen lines at their size class; check the course's texel and image bounds.

### 7. Skies

- Bake the background into one sky by [Sky baking](#sky-baking);
  background changes (stages, tunnels, weather) become sky changes where the original's camera reaches them.

### 8. The original's camera

- Measure the eye on a level road: the horizon row y_h and the road's lateral scale s (pixels a unit) at a row y give
  the eye H = (y − y_h) / s in lateral units, the same at every row for a pinhole projection. Report it raw and with
  rows 15/14 of a column, in metres at the adopted scale, against the player's vehicle, and the camera's distance and
  field of view where the original's depth allows (its along-road depth is often not a perspective). Each research
  note's Camera (eye height) section keeps its original's figures.

### 9. Sections, gates, limits of admission

- Cut Sections where the original changes stage or sector, and again where a Section's domain passes over itself or its
  boards pass the format's sprite element bound; check every bound in [Numeric and resource
  domains](content-and-gameplay.md#numeric-and-resource-domains).
- Gates: the grid or start, checkpoints, the finish or goal, as the original places them. The grid's last slot, the
  player's, at GO in the lane where the original's own vehicle stands at GO (its x as its program sets it there), the
  others alternating that lane and the next back from it.

### 10. Identity and checks

- A course's identity is [Content and gameplay](content-and-gameplay.md#compiled-identity-and-project-publication)'s;
  the checks before handing over are [AGENTS](../AGENTS.md)'s and the [rules of the originals](#rules-of-the-originals)'
  (every original's `--check`).
