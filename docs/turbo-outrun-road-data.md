# TURBO OUTRUN road data

How TURBO OUTRUN's ROMs are read (its ROM set, programs, tables, dump and conversion). The rules every original is
raised by and the parts the originals share are [Original road data](original-road-data.md)'s.

TURBO OUTRUN's course is raised from MAME's `toutrun` (Turbo Out Run, the Out Run upgrade, FD1094 317-0118); the other
cabinets' sets are only compared. It runs on OUTRUN's board and its program is OUTRUN's remade: where its formats are
OUTRUN's, [OUTRUN's](outrun-road-data.md) sections describe them, and its own ROM set, programs and tables are described
here as the road data tool reads them. Its main CPU's program is encrypted for instruction fetches alone: the tables are
read as the ROMs' bytes, and the tool decrypts nothing. What only the encrypted code holds was read from the program
decrypted locally (K, 2026-10-25) and is written into the tool with its reason.

## TURBO OUTRUN's ROM set

Each CPU's program is 128 KiB parts, each interleaved from a ROM of its even bytes and a ROM of its odd bytes, as
OUTRUN's are; the main CPU has three parts:

| CPU  | Addresses       | Even bytes      | Odd bytes       |
| ---- | --------------- | --------------- | --------------- |
| main | 0x00000–0x1FFFF | `epr-12513.133` | `epr-12512.118` |
| main | 0x20000–0x3FFFF | `epr-12515.132` | `epr-12514.117` |
| main | 0x40000–0x5FFFF | `epr-12293.131` | `epr-12292.116` |
| sub  | 0x00000–0x1FFFF | `opr-12295.76`  | `opr-12294.58`  |
| sub  | 0x20000–0x3FFFF | `opr-12297.75`  | `opr-12296.57`  |

Every ROM the conversion reads is found by the [rules of the originals](original-road-data.md#rules-of-the-originals)
(`turbo-outrun-rom.ts`). K's set matches: `epr-12513.133` `ae8835a5`, `epr-12512.118` `f90372ad`, `epr-12515.132`
`1f047df4`, `epr-12514.117` `5539e9c3`, `epr-12293.131` `f4321eea`, `epr-12292.116` `51d98af0`, `opr-12295.76`
`d43a3a84`, `opr-12294.58` `27cdcfd3`, `opr-12297.75` `1d9b5677`, `opr-12296.57` `0a513671`; the road ROM `epr-12298.11`
and its copy `epr-12299.47`, both `fc9bc41b`, one file serving both (as OUTRUN's, 256 lines of 512 pixels, the second
bit plane at 0x4000); the tiles, one bit plane of 64 KiB each, the lowest first, `opr-12323.102` `4de43a6f`,
`opr-12324.103` `24607a55`, `opr-12325.104` `1405137a`; the sprites, two sets of four, each ROM one byte of a 32-bit
word, the least significant first, `mpr-12336.9` `dda465c7`, `mpr-12337.10` `828233d1`, `mpr-12338.11` `46b4b5f4`,
`mpr-12339.12` `0d7e3bab`, then `mpr-12364.13` `a4b83e65`, `mpr-12365.14` `4a80b2a9`, `mpr-12366.15` `385cb3ab`,
`mpr-12367.16` `4930254a`. The sound ROMs and the key (`317-0118.key`) are not read. The read's OUTRUN zip
(`--outrun-zip`) is a set of its own, OUTRUN's, found by OUTRUN's tables and never mixed with TURBO OUTRUN's ([TURBO
OUTRUN's sub CPU](#turbo-outruns-sub-cpu)).

## TURBO OUTRUN's programs

The main CPU's program is encrypted (FD1094) for instruction fetches alone, so its tables read as its ROMs' bytes.
Where the [research notes](research/turbo-outrun.md) give what the encrypted code does, the tool takes it as given and
says so. Both CPUs are 68000s; the main CPU's 0x26xxxx is the sub CPU's 0x06xxxx, as on OUTRUN's board.

- **Constants.** The road advances `speed × 0x12F / 65536` positions a tick (the long at 0x1DDEA), as OUTRUN's; the top
  speed without turbo or tune-up is 324 km/h (the word at 0x1DDE2); a right-side object stands by the left road past
  road width 280 (the word at 0x1DE04); scenery is brought out into the 108 objects from object 2 (the words at
  0x228D4).
- **Legs.** The 16 stages run in four legs of four: each leg's first four bytes of its eight at 0x1E018 number its
  stages, 0 to 15 in turn. A stage begins at road width 450 from its leg's start, 220 after a continue (the words at
  0x1DE14 + 2n).
- **Names.** The name records at 0x11578, {word screen address, word 0x000D, 14 characters}, spell the stages in turn,
  other records laying dots over them. The names are `TURBO_OUTRUN_NAMES`, WASHINGTON D.C. with the last dot the 14
  characters leave out.
- **Stage blocks.** Stage n's block is the long at 0x1E042 + 4n, nine longs as OUTRUN's: the sky word, the centre
  line's, lane lines', edges' and surface's four palette words each, the ground word, then the curves, widths and
  heights, and scenery, each in OUTRUN's format ([Main CPU](outrun-road-data.md#main-cpu)). The sky word numbers its
  ramp, the long at 0x232E0 + 4 × it (64 words); the ground word its 16 words, the long at 0x230A0 + 4 × it, the 15th
  and 16th its halves. Every stage has its gate at scenery point 1358: one CHECK POINT gate (type 3), the last stage's
  GOAL (type 68).
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
  research notes' values, as each stands in the countdown's last tick and the signal at GO (`START_FIGURES`).
- **Backgrounds.** Stage n's background number is the byte at 0x2ABF8 + 8 × its leg + its place in the leg (the same at
  0x1DA52). Its entry at 0x2AC18 + 12 × number is {u8 front rows, u8 back rows, long front data, long back data, word
  offset}, its layers in OUTRUN's format ([Backgrounds](outrun-road-data.md#backgrounds)) but for rows not written,
  which hold tile word 0x0020. A leg's start loads tile palettes 8 to 127, each the 8 words at 0x22A56 + 16 × its byte
  at 0x229DE; each stage then applies its patch (`PALETTE_PATCHES`, from the research notes), so a stage shows its
  leg's patches to it.
- **Skies.** A stage's sky is baked ([Sky baking](original-road-data.md#sky-baking), `stageBands`) from its background's
  two layers, page by page with the last page leftmost: the front its four pages (2048 pixels), the back its three
  (1536), each 32 rows of tiles. The tile ROMs `opr-12323.102`, `opr-12324.103` and `opr-12325.104` are three bit
  planes, the lowest first, 8 bytes a tile, bit 7 the leftmost pixel; a tile word's tile is its bits 0–12, tile 64p to
  64p + 63 in palette p; a pixel 0 is transparent, any other the stage's palette's word. Both layers' last row is the
  entry's offset − 1 rows below the horizon (the offset is 10: their last 10 rows lie under the road), and at heading 0
  the screen's middle shows the front's pixel 1888 and the back's 1376, so the front's pixel f lies over the back's
  0.75f − 40. The ramp is the stage's sky ramp, its word 0 the two rows just above the horizon, each next word two rows
  higher, word 63 every row above, and word 0 below the horizon.

## TURBO OUTRUN's sub CPU

- **Road paths.** Stage n's is the long at 0x1224 + 4n: 1496 heading vectors in OUTRUN's format, beginning and ending
  straight ahead (0, 4096), each turning 0° or ±360°.
- **Height tables** are the longs at 0x2156 + 4 × number, OUTRUN's 225 tables at addresses 0xB4 earlier.
- **Stripes** are the 32 phases of 512 words at 0x109EE, as OUTRUN's.

Where the research notes say a table is OUTRUN's, the read checks it against OUTRUN's ROM set: the 225 height
tables, the stripes, the approach table (the main CPU's 0x48010, OUTRUN's 0x28000) and the sub CPU's road drawing
(0x1280–0x2155, OUTRUN's from 0x1334), which differs only where it addresses the height tables.

## Placing TURBO OUTRUN's scenery

TURBO OUTRUN's objects are brought out and approach as OUTRUN's do ([Placing
scenery](outrun-road-data.md#placing-scenery): the tick's advance, the approach table, the road position the car's),
with its own values and control (`turboOutrunObjects`). Each leg runs from GO at one speed, tick by tick:

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

## TURBO OUTRUN's dump

`npm run road-data -- turbo-outrun-read` ([Development](development.md#road-data-commands)) checks and reads the ROM
zip and writes `superoutride.turbo-outrun-road-data` version 1, `turbo-outrun.json` in its dump directory: the ROMs'
names and CRCs; the constants; the legs; the name records; every stage (block, colors, sky ramp, ground, curves, widths
and heights, scenery, road path); the height tables its points name; the stripes; the scenery types, the kinds their
items and the start objects name, the routines, the size lists and the strips' size tables, the shadow and the
palettes; the start objects and figures; each background's layers and each stage's tile palettes with the patches; and
the comparison with OUTRUN's tables. It refuses a ROM set, order, name, path, gate or table that differs from the
values the tool holds.

## TURBO OUTRUN's course

`npm run road-data -- turbo-outrun-course` ([Development](development.md#road-data-commands)) writes the LINEAR course
`turbo-outrun` (TURBO OUTRUN), conversion version 25, and its skies, or with `--check` fails where one differs. Its
amounts are the original's at the top speed, 324 km/h, with its 108 objects
([Placing TURBO OUTRUN's scenery](#placing-turbo-outruns-scenery)); its objects stand as
[TURBO OUTRUN's objects](#turbo-outruns-objects) says.

- **Stages.** A 6 m straight, the camera's distance, before GO (NEW YORK's position 0), then the stages in running
  order, each from its position 0: a stage within a leg to its end (T + 12, 1426.083), where the next begins; a leg's
  last (INDIANAPOLIS, ATLANTA, DALLAS) past where its car stops (T + 2, 1411.103) to the end of its join below; LOS
  ANGELES to 260 positions past its finish (1403.613), chosen when every vehicle had to stop before the course's end,
  which the run no longer requires (EX-19 reads the original's). 23,476.2
  positions in all, 47.02 km along P.
- **Plan.** The road path P is the course's heading table: each stage's road path's headings at its positions on the
  course (a stage's start plus its own position, a position 2.002689 m), carried on straight ahead past 1495, with which
  every path ends, as it does before any stage's end (by 1411 at the latest), then the course's end. It becomes P by the
  [plan from a heading table](original-road-data.md#plan-from-a-heading-table), no turn tighter than its lanes keep
  (from P to lane a's left edge or lane f's right, `leastLaneRadius`). Four turns are widened to keep them, each over
  three positions (turning 6.7° to 11.2° there): PITTSBURGH's at 4099 and 4147, SAN ANTONIO's at 15826 and OKLAHOMA
  CITY's at 18565 (course positions). Its curves only check it: some turns are not among them (INDIANAPOLIS's from 882,
  its curves LOS ANGELES's), and DENVER's and NEW ORLEANS's roads waver. 781 runs and 1533 elements (DENVER's Section
  687, the most); the sharpest arc is 14.9 m, in SAN ANTONIO. Its headings lie within the resolution of its table's at
  every position but the four widened turns' (at most 224 resolutions, 4.7°, in SAN ANTONIO's); laid from its start, P
  lies at most 0.11 m from its table's line.
- **Width.** The width points each stage runs (those before its end), by OUTRUN's rule ([Main
  CPU](outrun-road-data.md#main-cpu)), from 450 at the entry: a stage played on starts at the width the stage before it
  left, still approaching that stage's target. A leg's last stage is joined to the next leg's start, which the original
  reaches through another screen: from 1460, where its road is one of three lanes (width 0), the width widens to 450 at
  the width points' fastest rate (speed 80, 4.2244 units a position), reaching it at 1566.523, the next leg's GO.
  The width passes the points' corners, joined between them as one monotone cubic over the course ([Original road
  data](original-road-data.md#a-lateral-changed-straight-between-points)), written at each stage's every position; the
  lanes and the roads' centres are taken from it.
- **Cross-section.** The road ROM's nearest line (row 255, its centre between pixels 251 and 252), checked
  (`checkTurboOutrunRoadRom`), draws each road: the lane lines from 66 to 79 units (value 1); the edge band from 214 to
  250 in three parts, 214 to 223 (2), to 246 in the lines' color (1) and to 250 (2); neither a centre line nor outer
  lines. Road 0's centre lies w left of P, road 1's w right; they are drawn together as OUTRUN's two are
  ([Cross-section](outrun-road-data.md#cross-section)). At w = 218, most of the course's width, they show six lanes, the
  lines at ±145.5 and ±290.5 and road 0's edge band 8 wide between the middle two.
- **Lanes.** a, b, c | median | d, e, f; a and f are 141.5 units (3.604 m), and the roads' outer edges lie at
  ∓(w + 214). At w ≤ 72.5, c = d = 0 and b = e = w + 72.5; to 250, b = e = 145 (3.693 m) and c = d = w − 72.5,
  meeting at P; from 250, where the ground shows between the roads, to 286, c = d = 427.5 − w and the median
  4(w − 250); beyond, c = d = 141.5 and the median 2(w − 214). So w = 218 has no median: the original's six lanes
  there are one road (a median would shut a racing line in either road). The centre lane b's centre is road 0's
  (−w) where both its lines show (w ≥ 72.5), else −(w + 72.5) / 2: the Section's `centerLateral`, taken from the joined
  width at every position the lanes' widths are written at.
- **Stations.** A course position, a stage's start plus its position, is its station along P. GO is station 6.
- **Colors and stripes.** Over each stage's stretch its ground's 15th and 16th words, then its surface over the
  asphalt, then its lane lines and edge bands as the roads' picture shows them, each in its pair's halves (road 1's are
  road 0's on every stage), by halves of OUTRUN's stripe period (6.320988 m) counted from GO along P. The next
  stage's colors begin at its start, a leg's first stage's at its GO.
- **Materials.** ASPHALT under both roads (each centre ± 250 units), and between them where the ground there is
  narrow ([Two roads](original-road-data.md#two-roads)); SAND beyond the outermost lanes to the car's
  [lateral limit](original-road-data.md#the-ground-beside-the-road), 500 units from its road's centre, 286 units
  (7.285 m) beyond the outermost lanes, which the course format ends where the plan stops being one-to-one
  ([Architecture](architecture.md#plan-authority)). The limit is OUTRUN's rule: 0x16266, called each tick from 0x157A4,
  holds the car's x (0x260050) within the word it adds at 0x16274, 0x1DDF6 (500), of its road's centre, with no
  narrower limit while the roads part. The instruction is encrypted, so the tool writes its address (`LATERAL_LIMIT`)
  and reads the word, a plain table entry, from the ROMs. Both are K's decision (2026-10-25), for the ROMs hold no
  material.
- **Sections.** One a stage, joined by lane b: a stage within a leg from where the stage before it ends; a leg's first
  from its leg's last stage's 1458, where its road is one of three lanes (width 0), so CHICAGO, MIAMI and OKLAHOMA CITY
  hold the joins. Each is cut again where its road comes near itself ([the Sections' cuts](original-road-data.md#sections-cuts)),
  where the road is one (w ≤ 250); the cut ones are `<stage>-2` on. 24 Sections.
- **Gates.** The grids by [the grid's rule](original-road-data.md#the-grid), on lanes a and b: the player's at GO at
  lane b's centre, the left road's, where the car stands at GO (a game's start clears its x with the RAM, 0x10E84, sets
  the width to its stage's start width, 450 at 0x1063C, and the width's first change then carries the car from 0 to
  the left road's centre, 0x1623C, as OUTRUN's); the car grid's next the 959 beside it, 128 units (3.26 m) to its left
  at its depth (0xC238 brings it onto the left road, 0xC28E, at the car's depth 0x180, 0xC27C and 0x11D28, its x
  −0x80 at 0xC294 and 0xC29C; the encrypted instructions' value is written into the tool, `RIVAL_X`); each stage's
  checkpoint but the last's, `<stage>-CP`, where its CHECK POINT gate's post passes the car (1408.107), and the finish
  `los-angeles-GOAL` where the GOAL gate's does (1403.613).
- **Skies.** Stage n's is `toutrun-<stage>-sky`, its background baked ([TURBO OUTRUN's
  programs](#turbo-outruns-programs)): NEW YORK's from the start; within a leg the next stage's from where its
  background comes in (T + 11, 1424.585); a leg's first stage's rising at its GO. At heading 0 the
  original's back layer's pixel 1376 of 1536 is at the screen's middle, here 1376 × 1504 / 1536 of the sky's 1504: a
  Section's yaw origin is 75.6° plus P's turn from the course's start to its start.
- **Profile.** Each leg's height points, its stages' in turn, run their tables at 324 km/h along the leg, each table's
  piece laid as the [profile](original-road-data.md#profile) says; the dips; the nine crossings, each of two passages,
  kept apart with the dips; bends broken at the Sections' cuts. The road runs from −30.8 to +396.4 m and ends at
  +390.2 m, its pieces' steepest grade 25 % (30 % with the dips); no two pieces overlap.
- **Dips.** Collision class 2 throws the car (its handler at 0x742A, in the decrypted program alone): its boards
  (0x27034), 124 in 96 rows of one to three at a road position, are K's dip across the road at each row's position
  ([Jumps and dips](original-road-data.md#profile)), not objects; rows within 4 m join (29 runs of 59 rows). The boards
  are not painted (K).

## TURBO OUTRUN's objects

The course's objects (`turboOutrunPlacements`) stand where the scenery model stands them at 324 km/h with the 108
objects ([Placing TURBO OUTRUN's scenery](#placing-turbo-outruns-scenery)), at the course position of their stage's
road position, the start's and the girls' as below; the strips as [TURBO OUTRUN's strips](#turbo-outruns-strips)
says. The two items below the road (kind 0 at y −1024), never seen, are not placed.

- **Across**, road units from P at the road width w where it stands: an item marked by b7 (its flags' bit 1 clear),
  the gates' parts among them, its x × 16; any other x × 16 from road 0's centre (−w) where x < 0, from road 1's (+w)
  where x ≥ 0, but from road 0's where the original's road width (straight between its points) was wider than 280
  (the word at 0x1DE04) as it came out.
- **Height.** Its y road units, half of them for a half-scale kind (its flags' bit 0), 15/14 of them up.
- **Picture.** Its kind's size list, but the walkers' (routines 0x34, 0x38) and routine 0x60's the first of their frame
  lists (0x8A0E, 0x92E4); a pixel of its largest size 2 road units, a half-scale kind's 1; mirrored by its flags' bit 0;
  in its kind's palette, a blinking kind's (0x2C, 0x30, 0x40, 0x44) as its record has it. A board stands on the middle
  of its bottom or at its foot ([Foot shadows](original-road-data.md#foot-shadows)), and across at the middle of its
  kind's hit extents.
- **Lying on the ground.** What routine 0x08 and the puddles of 0x4C and 0x50 draw on the road lies on it, but the grass
  and stones 0x27570, which rise from it: the puddles (0x274DA, 892), the patches (0x27872, 1,133) and the pebbles
  (0x27840, 474) are boards on their middle as OUTRUN's patches are, at height 0, with no body ([Lying
  boards](original-road-data.md#lying-boards)), with no material: under them is the road's `ASPHALT` (K, 2026-10-25).
- **Body.** Where its kind's collision class is 0, 1 or 3 (the original stops or spins the car) and it stands on the
  ground (y 0), but for what lies and the half-scale objects on the road: as wide as its hit extents (2 road units a pixel, half
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
- **Shadows.** In the original, a kind whose flags' bit 1 is set casts the shadow picture (the size list at 0x2667A)
  on the road, at its scale and base point; the board keeps it as its shadow frame (`-shadowed`), drawn at the picture's
  place and size ([Shadows](architecture.md#shadows)); a kind's pixel 10 that shades (bit 2)
  keeps its palette's color.
- **Boards** (`turboOutrunBoards`). `toutrun-<size list, five hex digits>`, with `-u<thousandths>` where a pixel is not
  2 road units, then `-mirrored` and `-shadowed` as shown: its largest size's pixels onto its texel grid by [chosen
  lines](original-road-data.md#chosen-lines), in every palette it is shown in (`p<palette>`, the lowest its default); a
  body is at most its board's width. Published provisionally, with the strips' boards.

## TURBO OUTRUN's strips

The strips beside the road and the far strip are brought out, approach and stand as the other objects do, with no body,
by the families OUTRUN's strips are ([Strips and patches](outrun-road-data.md#strips-and-patches)): each far size is the
nearest drawn again smaller, with its own dithering, so the families are read by their shape (where a crest, a tree or
the edge of what lies beyond falls) rather than pixel by pixel. At 324 km/h 6,855 strip pieces stand and 372 far strips.
Since Stage PG each strip's board is its nearest size by its edge nearest the road, extending sideways away from the
road (`extend`: right, or left mirrored) where the original shrinks its far sizes outward, cut as [Extending
boards](original-road-data.md#extending-boards) says. The grass bank, the flower beds and the far strip stand on their
bottom edge; the waves (735 pieces) and the dunes (1,924) lie on the ground ([Lying
boards](original-road-data.md#lying-boards)) by their middle, with no material: under them is the ground's `SAND` (K,
2026-10-25; the dunes on PITTSBURGH and DENVER snow-colored).

TURBO OUTRUN's cuts, in texel columns of the nearest size:

| Strip                 | Width | Edge `[start, repeat)` | Repeats `[repeat, end)` |
| --------------------- | ----: | ---------------------: | ----------------------: |
| 2603a fog (far strip) |  1011 |                  9–216 |                 216–628 |
| 26fda grass bank      |   456 |                  5–112 |                 112–248 |
| 2725a waves           |   505 |                  5–200 |                 200–348 |
| 272fa dunes           |   505 |                  5–155 |                 155–285 |
| 2743a flower beds     |   456 |                  5–183 |                 183–386 |

- **Strip A** (routines 0x0C to 0x14, the grass bank and its flowers, 0x26FDA): VINEYARD's trees' family drawn the
  other way round, 9 sizes 224 wide and 3 to 63 rows, the nearest last; size k (1 to 7) is the nearest shrunk to k/8
  with more beyond, size 0 too small to read. Its board is its nearest size (456 × 138 texels).
- **Strip B** (routines 0x18 to 0x20: the waves 0x2725A, the dunes 0x272FA, the flower beds 0x2743A): OUTRUN's
  strips' family, 16 sizes, the nearest last, size k the nearest shrunk to (k + 1)/16 with more beyond. Their boards
  are their nearest size (505 × 68, and the flower beds' 456 × 65).
- **Across.** A strip's edge nearest the road stands at its item's x × 16 units from road 0's centre (x < 0, drawn
  mirrored on the left) or road 1's, whatever the road's width or b7; at its y.
- **The far strip** (routine 0x24, the fog 0x2603A) is OUTRUN's clouds' family: 9 sizes 248 wide and 1 to 31 rows, the
  nearest squashed down, so the nearest repeats outward, a pixel 4 road units: one board of its nearest size, 1011 ×
  135 texels. It approaches at half the rate, so it stands where it passes the car at that rate, its edge
  32 of its pixels (128 units) from P, reaching away from it, its base point (2 × 151 + 72) × 15/14 road units (10.2 m)
  above the road, its item's x unused.
- **Boards.** `toutrun-strip-<size list>` and `-mirrored`, its edge's `toutrun-strip-<size list>-edge`, by chosen
  lines as the other boards.
