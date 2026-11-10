# CHASE H.Q. road data

How CHASE H.Q.'s ROMs are read (its ROM set, hardware, tables and conversion). The rules every original is raised by and
the parts the originals share are [Original road data](original-road-data.md)'s; the programs' map and what is open are
its [research notes](research/chase-hq.md)'s.

CHASE H.Q.'s courses are raised from MAME's `chasehq` (Chase H.Q. (World), Taito, 1988), its parent set, whose programs
are not encrypted. Its hardware and ROM list were read from MAME's drivers `src/mame/taito/taito_z.cpp`,
`taito_z_v.cpp`, `tc0100scn.cpp` and `tc0150rod.cpp` at MAME commit `9c0b6db110cd4e1f1560e96f331d072b5abed446`.

## CHASE H.Q.'s ROM set

K's `chasehq.zip` matches MAME's `chasehq` by CRC-32. The conversion reads the main 68000's four program ROMs (two pairs
of even and odd bytes), the sub 68000's two, the TC0100SCN's tile ROM b52-29.27 and the TC0150ROD's road ROM b52-28.4
(`chase-hq-rom`).

## CHASE H.Q.'s hardware

- **Its tick.** The main program's race loop (M 0x484C to 0x4884) runs once a frame, so a tick is a frame: the Z
  system's 26.686 MHz over 4, 424 × 262, 60.056 a second (`FRAMES_A_SECOND`, `taito/z-system-display`; K, 2026-11-08).
  Its clock counts 63.16 ticks a second (M 0x1ABE, its fraction from 0x2A6A4), so a shown 60 seconds take 63.1, the
  original's fact. That no program overruns a frame is assumed.
- **A position.** A unit of the speed shows 0xA6 / 256 km/h (M 0x876A) and gains a position a tick straight ahead (M
  0x8A76, 0x8AB8): a position is 3.0 mm (`POSITION_METRES`), a record of 0x2000 positions 24.57 m, a step of 0x100 0.768
  m, one value `goal-ticks` and the conversion take.
- **Across and up.** A lane is 3.6 m (K, 2026-11-05) over the mask's slot of 0x4A0 laterals (M 0x8148); up is across, a
  height unit 2.165 laterals, 6.58 mm, as the eye reads it back ([research notes](research/chase-hq.md#heights)).

## CHASE H.Q.'s courses

Ten courses, two to a stage, each its stage's approach road from its section 0 through its fork's branch, the left or
the right as the cars' next sections name them, on to its chase road (`courseSections`), to the end of the record its
goal lies in: 9,767 m in stage 1, 9,990 m in 2 and 5, 10,013 m in 3 and 10,025 m in 4, the run's (K, 2026-11-07;
`goal-ticks`), the same on both of a stage's courses. A stage's goal is where the original's time runs out: how far
beyond its stage's start the criminal is, as the original counts it, when both of the player's times are spent, the
first and the one that replaces it when the criminal is sighted, the player driving flat out without turbo on the road
the stage's arrow names, the left where the arrow falls at random (K, 2026-11-07; [research
notes](research/chase-hq.md#the-goals)). Where its two roads meet, where their tables become one again and the end of
its approach road are no goals: all come before the criminal is caught, the player within its close band (0x300 units)
4,241 m beyond the stage's start in stage 1, 4,495 m in 2, 4,472 m in 3, 4,531 m in 4 and 4,511 m in 5. Each is laid by
`road-layout` ([A road laid out](original-road-data.md#a-road-laid-out)), its road laid on back 186 m straight before
the stage's start for its grids and the camera behind them (`cameraDistance`), as TURBO OUTRUN's leg is: 18 to 32
Sections a course, 9,965 to 10,235 m.

### Its plan

A course turns as its far sky band turns ([Plan from a curve table](original-road-data.md#plan-from-a-curve-table)):
each record its curve's size's word of the band's turn table (M 0x6332) over 8 pixels, of 768 a turn (`coursePieces`,
`skyTurnPlan`). A positive curve turns right: run on `cpu-68000` with a curve forced each way, the sub program's road
frame (S 0x6C2) bends the road ahead right for a positive curve, and at each fork the left branch begins bending left
and the right one right. Each line's shift across in the road's picture is a replacement that cannot be avoided: the
curves look otherwise.

### Its heights

The sub program adds height a step, its record's grade clamped to −10 to +16 and blended to the next record's over the
record's second half (`stepGrades`, [research notes](research/chase-hq.md#heights)); the grades are a [rise
table](original-road-data.md#profile-from-a-rise-table)'s at a grade unit's resolution, 3.43 %, from −34 % to +55 %.
Where a course crosses itself (`crossings`: its line's steps 200 m or more apart that meet) its passages are fixed
points, at which the table's height is kept (`tableHeight`); the kept height, its grades joined straight, departs from
the program's sum of a grade a step by at most half a step times the grade's range, 0.34 m. Up to their goals the
courses cross themselves 19 times: 14 as bridges, their passages 12.0 m or more apart in height, and 5 at one height
within 1.69 m (stage 4 left at 802 and 2,790 m from the stage's start, and stage 5's at 191 and 1,404 m and at 380 and
1,230 m on both its courses); stage 5 right's road laid on back crosses its road once more, at 2,423 m, the road laid on
back no fixed point. A course's height departs from the table's by 4.2 m (stage 3 left) to 35.2 m (stage 2 right), its
grade within 0.047 of the table's; where a run's line meets the resolution exactly, a resolution 10⁻¹² away lays stage 2
right departing 29.8 or 30.5 m.

At a crossing at one height the other passage is not drawn, as a course's passages are not drawn to each other:
approaching stage 5 left's 1,230 m (its passage at 380 m crossing) and 1,404 m (its passage at 191 m crossing), and
stage 4 left's 2,790 m (its passage at 802 m crossing, over a crest), only the road ahead shows, without flicker, and
the car runs through, nothing of the other passage meeting it; seen in the driving harness, FREE PLAY, a car of the
catalog's driven to its racing line. Its passages are 0.37 m apart in height at 191 and 1,404 m, 1.69 m at 380 and 1,230
m and 1.55 m in stage 4 left; stage 5 right's road laid on back crosses its road 23.7 m below it. On stage 4 and 5's
tight bends the driver's line reaches the limits beside the road, on the ground: K sees them in DEV.

### Its road across

Its lanes are lanes a to f by its records' masks (`maskLanes`, [Lanes by a
mask](original-road-data.md#lanes-by-a-mask)), bits 6 to 1, P between c and d, as the sub program draws them: a merge's
record of kind 4 keeps the mask's left nibble and one of kind 5 its right (S 0x4BCE); a change of mask is taken over the
12.3 m (0x1000 positions) ending at its record. The original makes it at once where its record or the one before begins
or ends a second road or its kind is 7 (S 0x3E58): each course's fork, 1,567 m beyond its stage's start, and its merge,
2,574 to 3,139 m beyond it, stage 5 right's a kind 7 too. There the course takes it over the 12.3 m too, as the format's
Link joins roads of the same lanes alone (K, 2026-11-08): a replacement K's decision makes, seen at each fork and merge
as the road widening or narrowing over 12.3 m where the original's changes at once. The limits change at once at the
record's start there too, so a car in a lane the fork does not take is beyond its new limits there and pushed back onto
the road (K sees it in DEV). Its bands are its left edge, its body over its lanes and its right edge, each edge 0.55 m
beyond the lanes, the road picture's 21 pixels at its nearest row (`chase-hq-road-picture`); each band its base color by
bank: the edges the stage's first color, the body the road palette entry's first word. The ground beyond them is the
entry's third word.

Its limits are its main program's: the car held within its record's mask's outermost lanes' centres 0xDE0 laterals out,
9.0 m beyond the lanes (M 0x8B50), and in a tunnel 0x1E0 out, 0.34 m within them (M 0x9B5A), changing at once at a
record's start, each change a Section's cut, so that the limits change at a tunnel's ends at once, as the original's do
(K, 2026-11-08). Where the original starts to slow the car, 0x3E0 beyond the outermost lanes' centres (M 0x85F4), 1.22 m
beyond the lanes, is no boundary of materials. The tunnels' mouths are laid, their posts their bodies ([its
objects](#chase-hqs-objects)); a car entering a tunnel from beyond them is outside its new limits and pushed back onto
the road: K sees it in DEV.

Its road is `ASPHALT`, its dirt road (a record's kind 6) `DIRT`, each its surface and its edges. Its ground is one
material each side by its road palette's ground colors (`groundMaterial`; K, 2026-11-05): `GRASS` where green is the
strongest channel, `SAND` elsewhere, no ground reading as `WATER`; the grey green (12, 14, 12) is `GRASS` by the rule (K
sees it in DEV). Metres from each course's start, its road laid on back 186 m before the stage's:

| Course              | Ground                                                                              |
| ------------------- | ----------------------------------------------------------------------------------- |
| STAGE 1 LEFT, RIGHT | GRASS, SAND from 1,537 m, GRASS from 3,184 m, SAND from 8,835 m, GRASS from 9,621 m |
| STAGE 2 LEFT        | SAND, GRASS from 2,127 m, SAND from 4,117 m                                         |
| STAGE 2 RIGHT       | SAND, GRASS from 1,906 m, SAND from 4,117 m                                         |
| STAGE 3 LEFT, RIGHT | SAND, GRASS from 2,790 m                                                            |
| STAGE 4 LEFT        | SAND, GRASS from 1,759 m, SAND from 2,668 m                                         |
| STAGE 4 RIGHT       | SAND, GRASS from 1,759 m, SAND from 2,790 m                                         |
| STAGE 5 LEFT        | SAND                                                                                |
| STAGE 5 RIGHT       | SAND, GRASS from 2,373 m, SAND from 2,766 m                                         |

Its road not taken is the fork's other branch as the sub program draws it (`roadNotTaken`, S 0x4DBA to 0x4E02): from the
start of the record after the one that begins the fork, its own lanes by its own records' masks about its own P, which
moves away from the course's by its table's laterals (0xF654, a word each 0x80 positions), right of the course's P where
the side table (0xF5E4) by the camera's section keeps its sign (the left branch) and left where it negates it (the
right), to 3,072 laterals (9.34 m) by 0x10000 positions (197 m), where it is drawn no more: beyond its last metre the
course shows its ground, the other road ending across its width at once. Where the two roads meet again it is not drawn,
as the original draws no distance there (K, 2026-11-05). It is drawn with the course's road as [two
roads](original-road-data.md#two-roads) (`compositeOf`), the course's road 0 (the TC0150ROD's road A) and the road not
taken road 1 (its road B), each road's edge bands and body where its lanes pass, in the TC0150ROD's order
(`chaseHqRoadLevels`): the course's edge bands lowest, then its body with its lines, the road not taken's edge bands and
its body, so that the road not taken shows over the course's road, its inner edge band over the course's lanes where the
fork opens. The order is the one MAME's driver describes where a line sets no priority bit, which it does not hold sure:
the sub program sets none, and this conversion takes that order as the original's. The road not taken's colors and
stripes are the course's row by row, the sub program writing each row's bank to both roads alike. Its sides two
Boundaries of its own (`not-taken-left`, `not-taken-right`) straight between its table's steps; each edge band the
picture shows a Strip between its two features' edges, cut where the arrangement changes (`arrangements`) and drawn in
where it narrows to nothing (`drawnIntervals`), over the course's edge bands' material; within the limits its material,
its record's road's, and the ground between the two roads asphalt where it is no wider than 0.5 m (`narrowGround`), from
the course's edge band to the road not taken's lanes; beyond them its colors alone. Over the 12.3 m before the fork's
record, where the course's lanes narrow (K, 2026-11-08), the road keeps the one picture the original draws until its
mask changes, its body across its whole mask in metres and its material the road's to the limits, so that the road not
taken begins where that picture's other side was and no ground shows between them. Where a fork lies in a tunnel (stage
2 right), the road not taken lies wholly beyond its walls, its colors alone.

Its road is striped by bank (`partedStrips`): a row's bank is its place on the road, eight a record from the stage's
start, 3.07 m each (`bankPositions`, S 0x348C), written to the whole line and to both roads alike, so that its colors
change across every lane at once. The edge bands change each bank between the stage's two colors and the body between
the road palette entry's first and second words (6.14 m a period), the ground between its third and fourth words each
half record (24.57 m a period): each band one Strip across in its base color, its other parts' stripes over it,
repeated. The body line's lines, at the centre and 3.57 to 3.76 m and 7.20 to 7.38 m either side of it as the nearest
row's body line draws them (those beyond three lanes lie under the edge bands), take the body's colors in every bank but
3 and 7, where no word sets them and they keep the colors the palette starts with (M 0x6B8, 0x6F0): each a dash 3.07 m
long in every 12.3 m. A line is drawn only within its road's body, clipped where the body's side crosses it, a road's
picture laid where it passes (`pictureStrips`, `compositeOf`); at the fork the road not taken's lines lie about its own
centre, a third Boundary (`not-taken-centre`), and both roads' show in the TC0150ROD's order. That no program sets those
line colors after the palette's start is read from the palette's writers, not run: an estimate, not confirmed, which a
run of the main program through a stage, watching those colors' words, would confirm. In a tunnel the road is dark, a
place's color: a row's word 3 takes its top bit there, its bank eight on (banks 8 to 15, colors the palette keeps from
its start, M 0x6C6), over the road, its lines and the ground, from the first tunnel record's start (a record's event 3)
to the last's end, at once at both ends, whatever change of colors is under way; the road not taken is dark by its own
records. The sub program darkens the rows between two places the main program gives it (S 0x33C8 to 0x3484, from
0x108024); that those are its tunnel records' ends is an estimate, not confirmed, which a run of both programs through a
tunnel would confirm. Under a gate the course's road is dark too, from its first middle to its second, 11.1 m: the main
program gives the sub program the two middles' places (M 0x45A30 to 0x45A96, 0x4064C), and it darkens road A's rows
between them (S 0x33B0) with no record's test, at once at both ends ([its objects](#chase-hqs-objects)). The dirt road
(a record's kind 6, stage 1 right and stage 3 left) is drawn as the sub program draws it, its rows' edges set far beyond
the screen (S 0x415C) so that its own tile's body line fills the whole view: one color across the road and the ground,
its tile's base pen (the one most of it draws) in its bank's line (S 0x3BAC, 0x3BB4: bank 13, its body's line 3). Its
tile's texture, four pens a few pixels each, and its bank's cycling through 13 to 15 as the car goes (S 0x3C50) are not
drawn: unavoidable replacements, the dirt road one color still. A Section writes at most 181 Strips (stage 1 left),
2,668 with its repeats expanded. Its things are [its objects](#chase-hqs-objects).

### Its skies

Each course's skies are its tile layers' three bands ([research notes](research/chase-hq.md#the-sky)), baked by [Sky
baking](original-road-data.md#sky-baking) at a turn of the far band's 768 pixels, the nearer bands at 2.4 and 3.2 times
its turn, cut once behind the start's heading (K, 2026-11-08), the far band's column 175 where the road vanishes at the
start. The original's 164 rows each way from the horizon are the sky's: the far band reaches 183 rows above it, and at
this game's camera on level road 120 of the sky's rows show, the original's 61. A Section takes the sky its record's far
set, background mode and scene give: mode 4 set 1, any other the stage's own set where the original picks one at random,
0 in stages 1, 3 and 5 and 2 in 2 and 4 (K, 2026-11-06, 2026-11-08): 38 skies. Its sky, its road's colors and its
ground's change together, at the start of each record whose far set, background mode, scene or road palette entry
differs from the one before (`skyChanges`), over the longer of the ticks the scene's fade takes (20) and those the road
palette's steps take (4 a step of its largest channel's change), at top speed without the turbo (1.48 m a tick), else at
once: 4 to 12 changes a course after its start, 25 of the 78 longer than the scene's 29.6 m, the longest 118.5 m (stage
4, at 2,668 m). Each is an environment knot, 14 of them of the same picture as the sky before, where the road's and the
ground's colors alone change ([Image assets](image-assets.md#background-transitions)). Where a change begins before the
one before it has ended, the two are one change, from where the original begins the first to where it has made the
second ([Sky baking](original-road-data.md#sky-baking), `joinedChanges`): stage 1 right's at 3,110 m (94.8 m) and at
3,184 m (47.4 m, its colors alone) are one of 121.1 m, its colors mixed from the set before the first to the set after
the second, the set between not shown. The road's bands and the ground beyond them take each change's colors in pairs
over it (`colorStretches`, `stretchColor`), each place's colors its stretch's whatever the Section's or the bands' cuts.
The original's bands' scrolls go back to 0 where a record sets a background again; the sky here keeps facing as the road
turns. The nearer bands are drawn, as the sky's rows, 1.96 times as tall as the original's rows, but 0.82 and 0.61 times
as wide (1504 over 768 times 2.4 and 3.2): they show 2.4 and 3.2 times taller for their width than the original's, a
replacement K sees in DEV. A course reads 5 to 9 skies, 3.8 to 8.7 MB; stage 2 right, the most, loads with its skies in
0.35 to 0.44 s by the game's loader in Node, where OUTRUN's road A takes 2.9 to 3.3 s.

### Its start

The own car stands alone at GO at its stage's start in its rightmost lane, e, and d in stage 5, the general form behind
it on that lane and its left neighbour ([The grid](original-road-data.md#the-grid)); the finish is the goal.

## CHASE H.Q.'s objects

Each course's things stand where its main program places them (`chase-hq-objects`), each kind one picture of its pieces
(`chase-hq-boards`, `chasehq-<its kind, three hex digits>`):

- **Places.** Road r's table at 0x68C7C + 0x2000 r holds four entries of four bytes a record (M 0x9170 to 0x91B2), each
  a kind (0 none), its pattern of laterals (byte 2, from 0xB2B4, 16 bytes a pattern, words to 0xFFFF) and its pattern of
  places (byte 3, from 0xB0B4, 8 bytes a pattern, bytes to 0xFF). A thing stands at each place, its signed byte × 0x100
  positions from the record's start, and at each lateral, the pattern's word beside the rightmost lane's centre where it
  is 0 or more, else beside the leftmost's (M 0x8142: lane a's centre 0x6FD0 + 0x4A0, a lane 0x4A0 on, so P, between
  lanes c and d, 0x8000). A record's event places its own things before its table's (the handlers from 0x92AA): event 6
  a sign over the road, kind 0x440 + 8 × (its parameter & 3), one more for each lane beyond three, centred on its outer
  lanes. A tunnel's record (event 3) and a gate's (event 4) place theirs instead of their table's (M 0x9158, 0x9166),
  laid as below. Event 2's record (M 0x92D0) places kind 0x681 at its start, at P, 0x600 height units (10.1 m) up,
  before its table's things: a bank of grey cloud, one sprite four times across, 512 pixels, hit by nothing (what it is
  meant to be is not confirmed, nor whether its colors change along a course). Its composer (M 0x44F8A) draws it from
  0xC000 positions (147 m) ahead, as though it stood a = 0x400 + 0.75 d² / 65,536 positions away at a distance d (M
  0x44FC2 to 0x44FD2): at its full width whatever its distance and at twice a's zoom down, 0x7F at most (M 0x45072 to
  0x45080), its bottom the projection's own row for a less its height there and 32 rows (M 0x44FE6, 0x4500E, 0x450B6),
  with neither the sub program's rows of the road nor its bend, the car's lateral alone moving it across. So a bank
  comes out 9 rows tall, its bottom 42 rows above the projection's farthest row, rises as the car nears, 128 rows tall
  at the screen's top, and is dropped about 20 m ahead (M 0x450DA); one a record, six at once cover the screen from its
  top down to 42 to 46 rows above that row at every moment, streaming up it as the car advances. Event 2's records are
  28 to 32 in a row about where a stage's approach road meets its chase road, on both of its courses, and 30 more at
  stage 5's end: from the stage's start 3,907 to 4,595 m in stage 1, 3,440 to 4,226 m in stage 2, 4,029 to 4,717 m in
  stage 3, 3,513 to 4,300 m in stage 4, and 3,538 to 4,324 m and from 9,459 m on in stage 5. Each bank is laid as a band
  across the road ([Strips](original-road-data.md#strips); K, 2026-11-10) at its record's start, at P, with no body: its
  picture once and its outermost sprite's columns beyond each edge, keeping its ragged edges (`chasehq-681`, `-band`,
  `-band-mirrored`), floating 10.27 m up, its height and its picture's 5 clear rows; 28 to 54 a course, 348 in all. A
  board is drawn at its station's own distance, not at a, a replacement that cannot be avoided: far banks lie low over
  the horizon and small where the original's cover the upper screen. By the original's own projection a bank's bottom at
  its own distance lies 6, 9, 17, 32 and 57 rows above the farthest row at 0xC000, 0x8000, 0x4000, 0x2000 and 0x1000
  positions, where the composer draws it 42, 52, 89 and 135 rows above it and then past the screen's top; near the car
  both pass overhead. The original's banks keep the screen's middle however the road turns and take no hill, where the
  bands follow the road; the 32 rows it lifts them whatever their distance are not laid, and a band is as tall as its
  distance draws it, not twice. A course stands 2,684 to 3,120 things of 45 to 84 kinds, 177 kinds in all; those placed
  before the road laid on back or past its end are left out.
- **Pictures.** A kind's picture is its pieces at their full size ([research notes](research/chase-hq.md#things)), laid
  in the order its sprite list is drawn, from the last entry, so its first piece is over those after it. Each piece is
  in its palette line's colors as the program fades them in (M 0x1484: entry e's word at 0x2C6D2 + 2e), pen 0
  transparent, and its colors are a thing of several pieces' ([Things of several
  pieces](original-road-data.md#things-of-several-pieces)). The original draws each placed thing as one unit, every
  piece at its point, so a kind is one picture already; none draws more than 15 colors. The dunes' pieces (kinds 0x640
  to 0x664), drawn at a zoom fixed across, are laid at the thing's full size. That the original's dunes change their
  shape as they are drawn smaller is a replacement that cannot be avoided. A course reads 11.0 to 31.7 MB of its things'
  pictures beside its skies: stage 3 right, the most, loads with them in 2.4 to 3.0 s by the game's loader in Node,
  OUTRUN's road A in 2.9 to 3.3 s.
- **Size.** A thing's composer (M 0x45830) takes its row of the projection by its distance (from 0x54100, eight bytes
  each 16 positions; M 0x45868), its zoom (byte 0; M 0x4599C) and its factor across (its word at 4, a lateral's screen
  pixels × 65,536; M 0x45916). At zoom 0x7F a sprite's pixel is a screen pixel: at the nearest row with that zoom, 10.737
  laterals, 3.26 cm (`chaseHqPixelLaterals`), the Z system's pixel square (its 320 × 240 at 4:3). A picture stands at
  the thing's point where a piece reaches the ground there; 44 kinds' lowest colored rows lie 1 to 32 pixels above it,
  and those float at that height, as the original draws them. The original draws no shadow, and none is drawn.
- **Bodies.** The main program tests the player's car against the things on its road (M 0x9C56 on). A thing's flags, set
  as it is placed (its slot's byte 8), say how it is hit, and the hit table at 0xB9B8 holds a long a kind from 0x300 to
  0x5FF: its low word a half width in laterals, its high word the positions it reaches toward the car (0x100, 0.77 m,
  for every kind placed but the dustbins' 0x200), 0 for a kind not hit. A table's thing (flags 3) hits only a car on its
  side of P, where the two laterals' top bits agree (M 0x9CAE to 0x9CB8); a sign over the road (flags 0x81) is hit on
  two posts, each the half width either side of its middle, the long's high word the posts' laterals from the sign's (M
  0x9D6C). A body is each part as wide as the hit, at most its picture's colored columns, on the thing's side of P alone
  where a car is hit only there: the yellow bollards placed at P (kinds 0x38B and 0x3AB) are hit only by a car right of
  P, and their bodies lie right of it. A fixed body has no depth in this game, so it stands at the thing's point, where
  the original's reaches 0.77 m toward the car. 20,784 things have bodies, 806 of them beside their laterals. Dustbins
  and their like (hit kinds 0x5C0 to 0x5FF) are knocked away where they are hit (M 0x9D32), not stopping the car, and
  they stand without a body until every original's things that fly or break are made movable together ([Courses of the
  originals](NEXT.md#courses-of-the-originals); K, 2026-11-09).
- **Tunnels and gates.** A tunnel's record (M 0x92F0) lays its walls where its parameter's top bit is set: kind 0x4C0 +
  its bit 0 left where its bit 2 is set, 0x4E0 + its bit 0 right where its bit 1 is, each 0x600 laterals (4.67 m) beyond
  its outer lane's centre (M 0x9280, 0x926A), at 0, 0xB00 and 0x1600 positions into the record, hit by nothing (the
  course's limits are the tunnel's walls). Else it lays its mouth, 0x1000 positions into the record, centred on its
  outer lanes: kind 0x480, or 0x540 where its parameter's bit 5 is set, plus its parameter's other bits and one for each
  lane beyond three, hit on two posts. The 0x540 mouths' composer (M 0x46438) reads pieces of 14 bytes, their y offsets
  moved by an unscaled word besides their rows'. A mouth is larger than a picture may be (`imageMasterTexels`), so its
  pieces stay pieces: each its sprite's picture as drawn
  (`chasehq-sprite-<sprite>`, a palette a line), in the order the original draws them, its middle where it lies across
  the mouth, and the parts of the mouth's posts within its colored columns its body; a mouth is not repeated. A gate's
  record (M 0x9374) lays two middles at P, 0x3DF 0xE80 positions (11.1 m) beyond 0x3DE, each with six posts (its kind
  less 0x40) one position before it, 0x3000 laterals (9.3 m) apart from 0x800, the two 4.67 m beside P hit from their
  own side, the others by nothing. A middle, the concrete across the road, is a band across the road
  ([Strips](original-road-data.md#strips)): its picture once and the columns of its outermost piece beyond each edge
  (`chasehq-<kind>-band`, `-band-mirrored`), floating where the original draws it, the bands as much higher as their
  last row lies above the picture's. A tunnel is a passage ([Things of several
  pieces](original-road-data.md#things-of-several-pieces)): its entry mouth (its kind's bit 3 clear, as the mouths'
  composers test it, M 0x45206, 0x4678E) is laid again at equal steps as far as its exit mouth, so fine that the eye
  sees nothing through them (`passageSteps`), its opening the clear columns about its point in its row on the ground;
  each step is its pieces with no body, the tunnel's walls its course limits: 19 to 595 steps a course, 0.8 to 12.7 m
  apart. A Section holds at most `spritePlacements` sprites expanded, so in a long passage a Section is cut at a
  record's start where the sprites since the cut before would pass it: stage 2
  left and stage 5 left gain a Section each.

## CHASE H.Q.'s conversion

`chase-hq-course` writes the ten courses to `content/originals/courses/` (`chase-hq-1-left` to `chase-hq-5-right`),
their crest trials, their 38 skies (`chase-hq-sky-<set>-<mode>-<scene>`) and their 189 things' pictures
(`chasehq-<kind>`) to `content/originals/images/` (`chase-hq-course`; its conversion's version 12).

What was decided by default as its courses were raised is K's decision, accepted together (K, 2026-11-10): its dirt
road one color and the road not taken's roads in the TC0150ROD's order where no line sets a priority bit ([Its road
across](#its-road-across)); its things with no shadow, a body on its side of P where only that side is hit and with no
depth, its tunnels' mouths' pieces kept pieces, and a long passage's Section cut at a record's start ([its
objects](#chase-hqs-objects)). Two readings are closed as estimates, not confirmed, each with the run that would
confirm it where it is stated ([Its road across](#its-road-across)): its tunnels dark over their records, and its
lines' colors in banks 3 and 7 set by no program after the palette's start.
