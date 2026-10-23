# SUPER MONACO GP road data

How SUPER MONACO GP's ROMs are read (its ROM set, programs, tables, dump and conversion). The rules every original is
raised by and the parts the originals share are [Original road data](original-road-data.md)'s.

SUPER MONACO GP's two circuits, the race's and the qualifying's, are raised from MAME's `smgp` (Super Monaco GP, World,
Rev B, FD1094 317-0126a). Its main CPU's program is encrypted for instruction fetches alone: its tables are read as the
ROMs' bytes, and the program is never decrypted. The courses' tables lie in the sub CPU's program, which is not
encrypted. Its ROM set, programs and tables are described here as
the road data tool reads them.

## SUPER MONACO GP's ROM set

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

The tool finds each ROM by the [rules of the originals](original-road-data.md#rules-of-the-originals). It reads no key
(`317-0126a.key`) and no sound or link ROM, and never decrypts.

## SUPER MONACO GP's courses' tables

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

## SUPER MONACO GP's sprites

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
- **Palettes.** Sprite palette p is the 14 [palette words](original-road-data.md#palette-words) at 0x49BE + 28p, pixels
  1–14, p from 0x00 to 0xEE.
- **The rivals' cars.** Their frame table is at 0x10E0; they are not converted.

## SUPER MONACO GP's background

- **Pages.** The fine set's tile RAM is drawn from the records at 0x37FF8 and 0x39F9A, in turn: a record is {word kind,
  word runs}, then runs {word byte offset into the tile RAM, then groups {byte count c, byte high, c bytes low} up to a
  c of 0}, each group writing c tile words of its high byte over each low byte. The tile RAM is 16 pages of 64 × 32
  tile words.
- **Tiles.** A tile word's bits 0–12 are its tile, bits 6–12 its palette; pixel 0 is transparent.
- **Tile palettes.** Colors 1–7 of palettes 8–127 from 0x432E + 14(p − 8) at power on; at a race's start the fine set
  loads palettes 8–42 from 0x432E again and 50–58 from 0x457A + 14(p − 50).
- **Road layer.** Color c of the fine set is the word at 0x63E2 + 2c: 0x31 the sky just above the horizon (RGB555
  3a9a), 0x00 above it (01da), 0x32 the ground (1144).

## SUPER MONACO GP's dump

`npm run road-data -- super-monaco-gp-read` ([Development](development.md#road-data-commands)) reads the zip and writes
`superoutride.super-monaco-gp-road-data` version 1, `super-monaco-gp.json` in
`reference-media/super-monaco-gp/rom-data/`: the ROMs' names and CRCs; each course's descriptor, headings, road path,
scenery list and band tables; the groups the lists name; the view tables; the frame tables the objects and views name
(and the rivals' cars'), each with its colored pixels past its rows' end marks; the sprites' palettes; and the
background's records, tile pages, tile palettes and road layer's colors. The amounts in the program's code (the grid's
rule, the clock, the hits' lines, the ground's height) are not tables: the courses take them as constants from Stage
MG's description.

## SUPER MONACO GP's courses

`npm run road-data -- super-monaco-gp-course` ([Development](development.md#road-data-commands)) writes the two
CIRCUIT courses, `super-monaco-gp` (SUPER MONACO GP, the race's form) and `super-monaco-gp-qualifying` (SUPER MONACO GP
QUALIFYING, the qualifying's), conversion version 7, their skies and their [objects](#super-monaco-gps-objects)'
images, or with `--check` fails where one differs; it reports a step's metres and each course's elements, tightest arc,
lap, the error closed and the three lengths that close it, its Sections with their boards, the boards placed and those
left out, and the images' count and master texels. Both have `maxLaps` 30 and `bearing` 0. The two forms share most of
the road, but each closes on its own path, so they are two circuits, not one BRANCH course (K, 2026-10-21).

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
  Sections' borders (2224, 4697, 7393, 9538 and 12110 are inside elements).
- **Closing.** On the plane as written (lane a's centre, 256 units, 1.561 m, left of P; arcs' lengths and radii to the
  micrometre) the lap does not quite close (the race's end lies (−2.088, +2.166) m from its start, the qualifying's
  (+1.487, −0.101) m). The last arc's length is solved so that the lap turns exactly once to the right, and two
  straights' lengths so that it closes: of the straights off the line's straight (a straight a Section's border cuts
  counts as two), the two whose headings differ by at least 30° (|sin| ≥ 0.5) with the least of their larger change. The
  race's are 7198–7393 (+2.11 m, to 74.710 m) and 11896–12110 (−1.75 m, to 77.912 m), its last arc 14155–218; the
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
  No walls are made, and no object has a body: the original's band table alone acts on its car (K, 2026-10-21).
- **Colors** (strips of color alone):
  - **Ground.** The road layer's ground, color 0x32 (RGB555 1144), out to the domain's edges; the horizon's ground
    gradient is not made (K, 2026-10-21). The race's tunnel, 9032–10860, is made as this game makes tunnels (K,
    2026-10-21), its ground dark (0x0842) and its sky below.
  - **Surface.** ±992 units, each surface board and each of the grid's boards across the road (0x0DA4 and 0x0DFE at x
    0; the grid's board is asphalt with the grid's lines, drawn only where the grid stands, below) coloring the road
    from the board before it in the linear-light mean of the surface board's colored pixels in its palette (the plain,
    the tunnel's and the bridge's); stretches of one color are one. The lap closes: from the last board to the line,
    the first board's color (the grid's boards' coloring and this closing K's, 2026-10-23). The conversion stops where
    the surface does not cover the lap. The other boards on the road (0x0E1C, 0x0E3A, 0x1F92, the start's 0x1F4A) color
    nothing: the surface boards about them color the road already.
  - **Side paving.** The surface boards beside the road (±1720) color 728–2712 units on their side alike, from the
    board before or, first of a run, 10 steps before.
  - **Centre line.** At each surface board, 2 steps long and 80 units wide, the mean of its top row's columns 120–129.
  - **Grid marks.** At each grid slot, on its side, the grid board's row 2 (80–896 units out) 0.5 steps long from the
    slot and its row 22 (64–808) 4 steps before it, each the mean of its line's pixels.
  - **Start line.** At steps 290, 300 and 310, 2 steps long before each, the start board's row 6 across the road as
    its runs of bright (pixels 8–10) and dark (11–13) pixels, each run its mean, over the grid marks.
  - The tire marks and rubber are in the surface's mean; the boards' oval edges and grain are not drawn.
- **Sections.** One a sector between the original's CHECKPOINTs (the race's 288–4697, 4697–9538 and 9538–288; the
  qualifying's 288–4697 and 4697–288), halved where its boards (MG-5's objects but the surface boards and the kerbs)
  would pass a Section's 2048 sprite elements: at the step of the board in its middle, in step order. The race's
  `sector-1a`/`1b`, `2a`/`2b`, `3a`/`3b` split at 2224, 7393 and 12110 (1348/1348, 1408/1409, 1661/1664 boards), the
  qualifying's `sector-1a`/`1b` at 2224 and its `sector-2` (1055). No Section's domain passes over itself. They join by
  lane a, the last to the first.
- **Gates.** The grid's 24 slots, from the front, slot s at step 588 − 12s (lap step 300 − 12s), lane a for even s and
  b for odd: the original's slots 12(23 − s), 12 steps apart, moved on past the line as TSUKUBA's are, 12 steps further
  than the original's line moves them so that the rearmost leaves the camera's 6 m behind it (the format asks it).
  `bikeGrid` is null. The checkpoints `<course>-CP1` (and the race's `-CP2`) end the sectors at 4697 (and 9538); the
  finish `<course>-FINISH` ends the lap.
- **Skies.** `smgp-sky` is baked ([Sky baking](original-road-data.md#sky-baking)) from the fine set's background
  ([SUPER MONACO GP's background](#super-monaco-gps-background)): the back layer pages 4–6 side by side (1536 pixels),
  rows 112–239, and the front layer, the town's row, pages 0–3 (2048 pixels), rows 192–239, each pixel its tile's color
  in its palette (pixel 0 transparent), both layers' bottom row the first below the horizon (the original's vertical
  scroll 0x43 brings row 239 to the screen's row 172, its horizon between 171 and 172); the front's pixel f over the
  back's 0.75f + 88 (where the road vanishes both layers show their pixel 354 at heading 0, the front's 0.75f + 88.5:
  0.5 back pixels, 0.12°); the road layer's ramp, color 0x31 the 16 rows above the horizon, then 0x30 to 0x01 a row
  each and 0x00 above, below the horizon the ground's 0x32. `smgp-tunnel-sky` is the tunnel's dark, 0x0842,
  everywhere. Each Section starts with the sky that holds at its start step (the race's `sector-3a`, from 9538, with
  `smgp-tunnel-sky`); in the race the tunnel's `smgp-tunnel-sky` comes as the camera reaches step 9054, where the
  original's background is wholly dark, and `smgp-sky` again at 10750, a step before the middle of its brightening
  (10655–10847), each a `cut` (K, 2026-10-21). At heading 0 the road vanishes at the layers' pixel 354 of 1536 (its left
  edge), the sky's column 354 × 1504 / 1536: a Section starting θ0 to the right of heading 0 has yaw origin −θ0 −
  (346.625 − 160) / 240 rad, within ±360° by the sky's period, 1504 / 240 rad.
- **Profile.** Level until their hills are made (K, 2026-10-21;
  [Stage EX](NEXT.md#stage-ex--the-originals-courses-exact-their-constants-few) makes them from the path's rises); the
  courses do not cross themselves.

## SUPER MONACO GP's objects

Every object of the scenery list but the surface boards (0x0DA4, 0x0DFE, 0x0E1C, 0x0E3A, 0x1F4A and 0x1F92, which are
strips) and the kerbs (curbs) is a board standing on its bottom edge: the race's 8838, the qualifying's 3751. Whatever
its kind (0x04, the original's flat board, among them: its buildings, trees, gate, signs, far bridge and cliffs), it
stands as a sprite's board (K, 2026-10-22). None has a body: the original's band table alone acts on its car (K,
2026-10-21).

- **Place.** List word k's objects stand at the station of lap step k's P (each element's steps spread evenly), their
  lateral x / 4 units from P to the right (the word's bit 15 mirrors it), each its own palette (`p` and three decimal
  digits).
- **Height.** h = −50 is the ground, where the barriers stand. A board's foot is h, or h less half its picture's
  height for an object with flag bit 13; it stands by the middle of its bottom edge, `groundOffset` (foot − (−50))
  × 6.5331 mm. The original hides everything below the ground (its road and pavements are pictures drawn far to near,
  and the barriers, 0.80 m, stand higher than its eye, 0.52 m), and places some boards with their foot below it. Those
  stand by three groups (K, 2026-10-22), the race's and the qualifying's counts each:
  - **At the original's height** (76, 20): every flat board (kind 0x04) but the roadside ones below, the supports and
    the tunnel mouths' rocks, placed so that their heads meet what they hold. The flag poles 051C (−2.051 m), the
    signs' pipes 143A flipped (−1.111 m), the start's and checkpoints' gate posts 141C and the bridge's piers 1B9C
    (−1.013 m), the crane 099C (−1.189 m), the tunnel entrance's rocks 0D86 b1 0 (−3.378 m) and 0D68 b1 0 (−0.725 m)
    and its exit's 0D86 b1 0xFF (−9.336 m once, by its middle, and −0.261 m four times) and 0D68 b1 0xFF (−3.443 m)
    keep their negative `groundOffset`, the part below the ground hidden by the nearer drawn ground
    ([Sprites and Painter](architecture.md#sprites-and-painter)).
  - **Folded at the ground's row** (127, 12): the flat boards at h −80, 30 units (0.196 m) below the ground, the
    roadside buildings, stone walls and rock faces (18FC, 191A, 1938, 1A04, 1A22, 1A40, 1A7C, 1A9A, 1B42, 1B60, 1B7E,
    1BD8), stand at height 0 with their anchor 30 units above their bottom edge (anchorY = H − 0.5 − 7.8397): their
    slanted foot lies on the nearer ground.
  - **Standing on the ground** (665, 414): the upright boards (kind 0x08), the far buildings (0684 to 071A, 2.287 m
    below; 0738, 0756, 1.633 m), stand on the ground.

  The SUPER MONACO GP ground is one colored Strip without Boundaries, so beyond the player no part below the ground
  shows, as in the original. Nearer than the player a board is drawn after it, over the ground, so a flag pole passed
  close by the left barrier may show its 2 m below the ground at the frame's lower left for a few frames.

- **Pictures.** A frame table's largest size, pixels 0 and 15 transparent, by [chosen
  lines](original-road-data.md#chosen-lines): a pixel 8 / 2^b1 units across (16 for b1 0xFF) and 15/14 of that down at
  40 texels/m, so a 2-unit pixel is 0.49 texel across (the barriers' 61 rows 32 texels, 0.80 m), a 4-unit one 0.98. A
  board shows its picture mirrored as its flag bit 10 and the word's bit 15 together mirror it, and flipped by bit 11,
  the unturned picture's lines turned. An object turning through a view table (kind 0x0C: the barriers along and across
  the road, the concrete walls, the advertising boards) shows its view 0's frame table (K, 2026-10-22), mirrored by its
  flag bit 10 alone (the word's bit 15 mirrors only its lateral): 0x0B22 for the barriers along the road, 0x09F6 across
  it, 0x0648 for the walls and 0x18DE for the boards. Its image is `smgp-<frame table>-<b1>[-mirrored][-flipped]`
  (hexadecimal), in every palette it is shown in, the lowest its default: 137 images.
- **Kerbs** (view table 0x050A, 517 on the race and 163 on the qualifying) are curbs (K, 2026-10-22): each run of kerbs
  at one lateral, 4 steps apart (up to 8) with their palettes alternating, one curb from 2 steps before the first to 2
  after the last, as wide as view 0's picture (144 pixels, 1.76 m) about each kerb's x, two stripes a kerb, in the first
  kerb's palette's mean colors of pixels 1–6 and 7–12 (blue and white, the next kerb's palette swapping them): 139 curbs
  on the race, 4 on the qualifying. An end within 1 mm of a whole stripe is drawn 1 mm short of it.
- **Curves' insides.** An object on an arc's inside farther from lane a's centre than the arc's radius less 2 m is
  left out (none is: the nearest, a far building at the race's and the qualifying's step 2166, stands 0.40 of its
  arc's radius inside lane a's centre).
- **Images.** 14.33 M master texels, 71.4 MB of saved JSON (about 4.4 MB compressed, in Git and as Pages serves it);
  the 16-unit class, the far buildings and cliffs, holds 45.3 MB of it, each of the original's pixels about 4 × 4
  texels. The 2-unit class drops about half its columns and no row.
