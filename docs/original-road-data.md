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
  mirrors, bit 1 casts a shadow, bits 4–7 choose the drawing; x is in 16 road-width units, y in 128.
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

| Course                                 | Stage | Sections (from position)                        | Conversion |
| -------------------------------------- | ----- | ----------------------------------------------- | ---------- |
| `outrun-coconut-beach` (COCONUT BEACH) | 0x3C  | `coconut-beach-1` (0), `coconut-beach-2` (1243) | 2          |

The conversion, version 2 (`CONVERSION_VERSION`), fits nothing to footage: the constants measured on `k1` use only
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
(`npm run road-data -- look` reports it):

- **Tables.** The height points run their tables as the [hills](#hills) do (`tableRuns`), holds counted at the top
  speed, 293 km/h. A road position is the camera's station.
- **Grades.** Each entry slid past the camera changes the grade by `c_look` × entry / 576 over its span, ending where
  the camera passes it: kind 0's entries, and kind 3's while they slide in. A shape held on the nearest segment changes
  it by `c_look` × entry / 576 for each 2.125 × step positions it is held at full share, half over its rise and its
  return: kinds 1's and 2's first entry, kind 3's held entry. Kind 4 changes no grade and the horizon's base is kept
  (until footage shows kind 4, K's decision).
- **`c_look`.** 0.131 for entries slid past and 0.55 for held shapes (`LOOK`), fitted on COCONUT BEACH by least
  squares of the road's top as rows above each level road's top over the screen's height: the original's level top
  151 of 224 rows, this game's 122.4 of 240. This game's top is the least row of the road from 2.5 m to 200 m ahead of
  the product camera standing at rest: 6 m behind the player at 2 m above the road there, pitched with the road's grade
  there. The slid value is fitted from 200 m before each kind 0 table to its end, then the held value about the kind 1
  table, the grades left by the tables not returned for the fit. One value cannot serve both: as a crest sharpens, this
  game's top falls by about the square root of its curvature where the original's falls in proportion, so a held
  shape fitted with the slid value shows about 5 of the original's 18 rows.
- **Grades left.** Where a table's entries do not sum to 0, the grade it leaves is returned toward 0 over the stretch
  to the next table (the last over the stretch to the road's end), by the largest share that moves this game's top by
  at most 1 row; what is not returned is carried to the next stretch (K's decision).
- **Crossings.** Where a plan passes over itself (pairs of stations at least 200 m apart whose roads, measured to the
  edge bands, overlap), its passages are kept at least 6 m apart: where nearer, the higher is raised and the lower
  lowered by one smooth bump each, over the shortest stretch from 100 m by 20 m that moves this game's top by at most
  1 row, grown until every overlapping pair is apart (K's decision).
- **Knots.** Each stretch of constant curvature is a PVI at the intersection of the tangents at its ends, its curve
  2 µm shorter at each end so curves that meet stay apart; stretches break at the Sections' cuts, and a knot next to a
  cut lies on the cut's tangent, so joined Sections' heights and grades agree.

On COCONUT BEACH the road's top is 8.6 rows from the original's on average (in the original's rows). The tables'
highest and lowest tops, and the least load at 293 km/h over each table (below 0 the car leaves the road):

| Table at | Kind | Original's tops | This game's tops | Least load |
| -------- | ---- | --------------- | ---------------- | ---------- |
| 1        | 0    | 112.5 to 191.6  | 120 to 170.8     | −1.3 g     |
| 360      | 0    | 116.9 to 179.9  | 122.3 to 165.1   | −0.2 g     |
| 1044     | 0    | 101.4 to 187.1  | 111.7 to 170.4   | −1.3 g     |
| 1600     | 1    | 151 to 169.1    | 150.1 to 166.9   | −0.5 g     |
| 1824     | 0    | 110.2 to 191.4  | 122 to 170.7     | −1.3 g     |

Kind 0's crests ahead fall 15 to 21 rows short of the original's and their rises 5 to 12; no rule of one value per
kind brings them within 3 rows, so they are built by the least squares match (K's decision); the kind 1 table's look
is within 3 rows. The tables leave grades of −0.131, 0, +0.262, −0.37 and −0.131, little of which returns within a
row: the road falls from 20 m to −291 m, its steepest grade 34 % and −32 % at the road's end. The crossing's passages
are 30.7 m apart without a bump.

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
