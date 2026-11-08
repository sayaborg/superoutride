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
`goal-ticks`), the same on both of a stage's courses. Each is laid by `road-layout` ([A road laid
out](original-road-data.md#a-road-laid-out)), its road laid on back 186 m straight before the stage's start for its
grids and the camera behind them (`cameraDistance`), as TURBO OUTRUN's leg is: 18 to 32 Sections a course, 9,965 to
10,235 m.

### Its plan

A course turns as its far sky band turns ([A
turn](NEXT.md#stage-ta--top-speed-continental-circus-and-chase-hq-from-the-roms)): each record its curve's size's word
of the band's turn table (M 0x6332) over 8 pixels, of 768 a turn (`coursePieces`, `skyTurnPlan`). A positive curve turns
right: run on `cpu-68000` with a curve forced each way, the sub program's road frame (S 0x6C2) bends the road ahead
right for a positive curve, and at each fork the left branch begins bending left and the right one right. Each line's
shift across in the road's picture is a replacement that cannot be avoided: the curves look otherwise.

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
beyond the lanes, is no boundary of materials. Until the tunnels' mouths come (TA-8), a car entering a tunnel from
beyond the road is outside its new limits and pushed back onto the road: K sees it in DEV.

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
course shows its ground, the other road ending across its width at once. It is drawn with the course's road as [two
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

The road's stripes and lines come with TA-7c2, its tunnels' darkness and its dirt road's color with TA-7c3; its objects
with TA-8.

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

## CHASE H.Q.'s conversion

`chase-hq-course` writes the ten courses to `content/originals/courses/` (`chase-hq-1-left` to `chase-hq-5-right`),
their crest trials and their 38 skies (`chase-hq-sky-<set>-<mode>-<scene>`) to `content/originals/images/`
(`chase-hq-course`; its conversion's version 2).
