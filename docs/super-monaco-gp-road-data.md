# SUPER MONACO GP road data

How SUPER MONACO GP's ROMs are read (its ROM set, programs, tables, dump and conversion). The rules every original is
raised by and the parts the originals share are [Original road data](original-road-data.md)'s.

SUPER MONACO GP's circuit, the race's, is raised from MAME's `smgp` (Super Monaco GP, World,
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
hardware's road layer draws lines of colors from RAM.

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
  mirrors, its low 15 bits a group (0x05CA the empty one, its count 0).
- **Groups.** A word 4n, then n objects of 10 bytes {byte size class b1, byte kind (0x04 a flat board, 0x08 a
  standing one, 0x0C one that changes with the angle), word sprite flags (its low byte the palette, bit 10 mirrored,
  bit 11 flipped, bit 13 its middle its base point), word frame table (a 0x0C object's view table), signed word x (4 to
  a unit), signed word height}. The race shows 10826 objects (7248 of kind 0x0C, 2537 of 0x04, 1041 of 0x08).

The main CPU holds the barriers' band tables: the race's left at 0xC4AE and right at 0xC50E, the qualifying's at 0xC4E4
and 0xC556. A table is 6-byte entries {word end step (before it), signed word t1, signed word t2} (the left table's t1
negative), each from the entry before it to its end, up to the first whose end is at least N. |t1| 1 or 4 is a barrier,
2 an escape area, 0 open; no rule reads t2.

## SUPER MONACO GP's sprites

The X hardware's sprites are OUTRUN's pixels: words of eight 4-bit pixels, the most significant first, banks of 0x10000
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
  loads palettes 8–42 from 0x432E again and 50–58 from 0x457A + 14(p − 50), the same words, so the power-on palettes
  alone are read.
- **Road layer.** Color c of the fine set is the word at 0x63E2 + 2c: 0x31 the sky just above the horizon (RGB555
  3a9a), 0x00 above it (01da), 0x32 the ground (1144).

## SUPER MONACO GP's dump

`npm run road-data -- super-monaco-gp-read` ([Development](development.md#road-data-commands)) reads the zip and writes
`superoutride.super-monaco-gp-road-data` version 3, `super-monaco-gp.json` in
`reference-media/super-monaco-gp/rom-data/`: the ROMs' names and CRCs; the race's descriptor, headings, road path,
scenery list and band tables; the groups its list names; the view tables; the frame tables the objects and views name
(and the rivals' cars'), each with its colored pixels past its rows' end marks; the sprites' palettes; and the
background's records, tile pages, tile palettes and road layer's colors. The amounts in the program's code (the grid's
rule, the clock, the hits' lines, the ground's height) are not tables: the courses take them as constants from the
[research notes](research/super-monaco-gp.md).

## SUPER MONACO GP's courses

`npm run road-data -- super-monaco-gp-course` ([Development](development.md#road-data-commands)) writes the CIRCUIT
course `super-monaco-gp` (SUPER MONACO GP, the race's form), conversion version 32, its skies and its
[objects](#super-monaco-gps-objects)' images, or with `--check` fails where one differs; it reports a step's metres and
the course's runs, elements, tightest arc, departure and lap, its Sections with their boards, the boards placed and
those left out, and the images' count and master texels. Its `maxLaps` are the laps the original runs its race, 3
(`RACE_LAPS`), and its `bearing` 0. The qualifying's short way (course 0) is not raised (K, 2026-10-31).

- **Scale.** A step is 96 units along the road and a unit 0.0349 / 9 m (the original's clock adds 0.0349 s a tick, and
  its camera moves 2.5 units a tick for each displayed km/h): 0.372267 m, the lap 5.27 km. Across, 1640 units, the space
  between the barriers, are K's 11 m (2026-10-26): a unit is 6.7073 mm, 15/14 of that up (7.1864 mm). The original's
  world keeps one scale across and along the road, so the road here is 0.58 times as long against its width as the
  original looks: seen from above, a unit is 3.88 mm along the road, 6.71 mm across and 7.19 mm up. The lap's length and
  the hills' heights are the scale along the road's.
- **Lap.** A lap runs from the race's line, step 288, round to it again.
- **Plan.** P is the road path's points from step 288 round to it again (x right and y ahead, the steps' dx and dy
  summed, a unit 3.878 mm), by the [plan from a point path](original-road-data.md#plan-from-a-point-path) at the
  path's resolution, one unit, no turn tighter than its lanes keep (a lane either side, 7.44 m; none is): 49 runs and
  150 elements, every one an arc, its tightest 40.4 m. Every point lies
  within a unit (3.9 mm) of P, and the lap closes as the points do, by the rule alone: laid from the line, P comes back
  to it within 5 × 10⁻¹⁰ m and 7 × 10⁻¹³ rad. The elements are written as P has them, unrounded, and cut at the
  Sections' borders.
- **Stations.** A step's station is where its point stands across from P, the stations between steps straight between
  them. A Section's start is the lengths of the Sections before it.
- **Lanes.** a and b, 512 units (3.434 m) each, either side of P; their centres at ±256 units, the grid's, lane a's
  centre (the centre lane's) each Section's `centerLateral`. The road out to the barriers is one surface: the original
  has no lane lines. Every lateral, the materials', the marks' and the objects', is measured from P.
- **Materials and limits** (each side, from the band tables alone, barrier kinds 1 and 4 one band): a barrier band is
  `ASPHALT` to 805 units (5.399 m), an escape area `ASPHALT` to 992 (the surface boards' edge) and `GRASS` to 1333, the
  open band `ASPHALT` to 2712 (the side paving's outer edge). A barrier's and an escape area's limit is one rule: where
  the original hits (the limits routine's 700 and 1228) plus half a car, 105: half the rival car's straight rear view's
  colored columns (the first view of its table at M 0x13B52, 105 of 112) at its size class's pixel, 2 units, as a
  body's width is a picture's colored columns at its pixel. The bands' places are the ROMs', their
  materials K's decision (2026-10-25), for the ROMs hold no material. The materials' outer edges are the course's
  limits. Between two bands the edges move over the 4 steps about their border (the conversion's), each edge over the
  lap one monotone cubic ([A lateral changed straight between
  points](original-road-data.md#a-lateral-changed-straight-between-points)): a smooth step from one band's to the
  next's, written at each of the 4 steps. No walls are made, and no object has a body: the original's band table alone
  acts on its car (K, 2026-10-21).
- **Colors** (strips of color alone):
  - **Ground.** The road layer's ground, color 0x32 (RGB555 1144), out to the domain's edges, laid by the courses'
    color stretches (`colorStretches`; its one set, the sky never changing); the horizon's ground gradient is not made
    (K, 2026-10-21). The race's tunnel, 9032–10860, is made as this game makes tunnels (K,
    2026-10-21), its ground dark (0x0842) and its sky below. Its dark ground is the roof's, a place's color, not a
    stage's, so its ends are not the sky's 9054 and 10655 ([Sky baking](original-road-data.md#sky-baking)).
  - **Surface.** ±992 units, each surface board and each of the grid's boards across the road (0x0DA4 and 0x0DFE at x
    0; the grid's board is asphalt with the grid's lines, drawn only where the grid stands, below) coloring the road
    from the board before it in the linear-light mean of the surface board's colored pixels in its palette (the plain,
    the tunnel's and the bridge's); stretches of one color are one. The lap closes: from the last board to the line,
    the first board's color (the grid's boards' coloring and this closing K's, 2026-10-23). The conversion stops where
    the surface does not cover the lap. The other boards on the road (0x0E1C, 0x0E3A, 0x1F92, the start's 0x1F4A) color
    nothing: the surface boards about them color the road already.
  - **Side paving.** The surface boards beside the road (±1720) color 728–2712 units on their side alike, from the
    board before or, first of a run, 10 steps before.
  - **Centre line.** At each surface board, 2 steps long and 80 units wide, the mean of its top row's columns 119–128,
    the line's ten pixels about the board's middle.
  - **Grid marks.** At each grid slot, on its side, the grid board's row 2 (80–896 units out) 0.5 steps long from the
    slot and its row 22 (64–808) 4 steps before it, each the mean of its line's pixels.
  - **Start line.** At steps 290, 300 and 310, 2 steps long before each, the start board's row 6 across the road as
    its runs of bright (pixels 8–10) and dark (11–13) pixels, each run its mean, over the grid marks.
  - The tire marks and rubber are in the surface's mean; the boards' oval edges and grain are not drawn.
- **Sections.** One a sector between the original's CHECKPOINTs (288–4697, 4697–9538 and 9538–288), by [the Sections'
  cuts](original-road-data.md#sections-cuts): its road comes near itself nowhere, and a sector whose boards (the objects
  but the surface boards and the kerbs) would pass a Section's sprite elements (`spriteElements`) is halved at the step
  of the board in its middle, in step order. None does: `sector-1`, `sector-2` and `sector-3` hold 2696, 2817 and 3325
  boards. No Section's domain passes over itself. They join by lane a, the last to the first.
- **Gates.** The grid's 24 slots, from the front, slot s at step 576 − 12s (lap step 288 − 12s), lane a for even s and
  b for odd: the original's slots 12(23 − s), 12 steps apart, moved on past the line as the original's line moves
  them, 300 steps. A run starts from the first 16, the rearmost of them 108 steps (40.2 m) past the line. The bike
  grid by [the grid's rule](original-road-data.md#the-grid), its player's slot the car grid's 16th, the barriers its
  limits. The checkpoints `<course>-CP1` (and the race's `-CP2`) end the sectors at 4697 (and 9538); the
  finish `<course>-FINISH` ends the lap.
- **Skies.** `smgp-sky` is baked ([Sky baking](original-road-data.md#sky-baking)) from the fine set's background
  ([SUPER MONACO GP's background](#super-monaco-gps-background)): the back layer pages 4–6 side by side (1536 pixels),
  rows 112–239, and the front layer, the town's row, pages 0–3 (2048 pixels), rows 192–239, each pixel its tile's color
  in its palette (pixel 0 transparent), both layers' bottom row the first below the horizon (the original's vertical
  scroll 0x43 brings row 239 to the screen's row 172, its horizon between 171 and 172); the front's pixel f over the
  back's 0.75f + 88.5 (where the road vanishes both layers show their pixel 354 at heading 0); the road layer's ramp, color 0x31 the 16 rows above the horizon, then 0x30 to 0x01 a row
  each and 0x00 above, below the horizon the ground's 0x32. `smgp-tunnel-sky` is the tunnel's dark, 0x0842,
  everywhere. Each Section starts with the sky that holds at its start step (the race's `sector-3a`, from 9538, with
  `smgp-tunnel-sky`); in the race the tunnel's `smgp-tunnel-sky` comes at step 9054, where the
  original's background becomes wholly dark, and `smgp-sky` again at 10655, where its brightening (10655–10847)
  starts, each at once by K's decision of 2026-10-27 ([Sky baking](original-road-data.md#sky-baking)). At heading 0 the road vanishes at the layers' pixel 354 of 1536 (its left
  edge), the sky's column 354 × 1504 / 1536: a Section starting θ0 to the right of heading 0, θ0 continued along the
  line, has yaw origin −θ0 − (346.625 − 160) / 240 rad ([Sky baking](original-road-data.md#sky-baking)).
- **Profile.** The road path's heights from the line round to it again, its rises summed at the plan's scale (a step is
  96 units long in three dimensions), by the [profile from a point
  path](original-road-data.md#profile-from-a-point-path) at the path's resolution, one unit, times f, its heights and
  its resolution alike, so its runs are the same: the [grades'
  rule](original-road-data.md#profile-from-the-originals-screen)'s factor for a 3D road. The sub CPU's transform
  projects across and up alike by q = 0x80000 / (Z + 64) (its dividend at S 0x3C72), its product with q shifted left by
  6 and swapped (S 0x3D84, 0x3DA2, 0x3E4E and 0x3E68): a focal length of 0x80000 × 2⁶ / 2¹⁶ = 512 rows (`focalLength`,
  the [research notes](research/super-monaco-gp.md#camera-eye-height)) on a screen of 224, a lens ratio of 2.29; f =
  min(2.29, 0.25 ÷ the lap's steepest grade, 0.224677, at 4362 m, down to the bridge) = 1.112708. It depends on the
  scale along the road alone. Its 30 runs, every point within 4 mm, its heights from −55.7 to +9.4 m, its steepest grade
  25 %, close as its path does. The course does not cross itself.

## SUPER MONACO GP's objects

SUPER MONACO GP's objects stand at the steps its scenery list gives them, and its layout stands them there, so the
conversion runs none tick by tick and the original has neither a `-scenery` nor a `-ticks` module; its road across is
its band tables', which its layout reads, so it has no `-cross-section` module ([An original's
modules](original-road-data.md#an-originals-modules)).

Every object of the scenery list but the surface boards (0x0DA4, 0x0DFE, 0x0E1C, 0x0E3A, 0x1F4A and 0x1F92, which are
strips) and the kerbs (stripes) is a board standing on its base: 8838. Whatever
its kind (0x04, the original's flat board, among them: its buildings, trees, gate, signs, far bridge and cliffs), it
stands as a sprite's board (K, 2026-10-22). None has a body: the original's band table alone acts on its car (K,
2026-10-21).

- **Place.** List word k's objects stand at the station of lap step k's P (its point's foot on P, the plan from its
  point path), their lateral x / 4 units from P to the right (the word's bit 15 mirrors it), each its own palette (`p`
  and three decimal digits).
- **Height.** h = −50 is the ground, where the barriers stand. A board's foot is h, or h less half its picture's
  height for an object with flag bit 13; it stands by the middle of its base, `groundOffset` (foot − (−50))
  × 7.1864 mm. The original hides everything below the ground (its road and pavements are pictures drawn far to near,
  and the barriers, 0.88 m, stand higher than its eye, 0.57 m), and places some boards with their foot below it. Those
  stand by three groups (K, 2026-10-22), their counts each:
  - **At the original's height** (76): every flat board (kind 0x04) but the roadside ones below, the supports and
    the tunnel mouths' rocks, placed so that their heads meet what they hold. The flag poles 051C (−2.257 m), the
    signs' pipes 143A flipped (−1.222 m), the start's and checkpoints' gate posts 141C and the bridge's piers 1B9C
    (−1.114 m), the crane 099C (−1.308 m), the tunnel entrance's rocks 0D86 b1 0 (−3.715 m) and 0D68 b1 0 (−0.798 m)
    and its exit's 0D86 b1 0xFF (−10.269 m once, by its middle, and −0.287 m four times) and 0D68 b1 0xFF (−3.787 m)
    keep their negative `groundOffset`, the part below the ground hidden by the nearer drawn ground
    ([Sprites and Painter](architecture.md#sprites-and-painter)).
  - **Folded at the ground's row** (127): the pictures K's table stands on the original's ground line
    (`groundLine`), the flat boards at h −80, 30 units (0.216 m) below the ground, the roadside buildings, stone walls
    and rock faces (18FC, 191A, 1938, 1A04, 1A22, 1A40, 1A7C, 1A9A, 1B42, 1B60, 1B7E, 1BD8), stand at height 0 with
    their anchor at the ground line, h −50, (−50 − foot) units above their bottom edge (anchorY = H − 0.5 − 8.6237):
    their slanted foot lies on the nearer ground.
  - **Standing on the ground** (665): the upright boards (kind 0x08), the far buildings (0684 to 071A, 2.515 m
    below; 0738, 0756, 1.797 m), stand on the ground.

  The SUPER MONACO GP ground is one colored Strip without Boundaries, so beyond the player no part below the ground
  shows, as in the original. Nearer than the player a board is drawn after it, over the ground, so a flag pole passed
  close by the left barrier may show its 2.3 m below the ground at the frame's lower left for a few frames.

- **Pictures.** A frame table's largest size, pixels 0 and 15 transparent, by [the sprites'
  rules](original-road-data.md#pictures-from-the-extract) (drawn with no shadow: pen 10 a color) and [chosen
  lines](original-road-data.md#chosen-lines): a pixel 8 / 2^b1 units across (16 for b1 0xFF) and 15/14 of that down at
  40 texels/m, so a 2-unit pixel is 0.54 texel across (the barriers' 61 rows 35 texels, 0.88 m), a 4-unit one 1.07. A
  board shows its picture mirrored as its flag bit 10 and the word's bit 15 together mirror it, and flipped by bit 11,
  the unturned picture's lines turned. An object turning through a view table (kind 0x0C: the barriers along and across
  the road, the concrete walls, the advertising boards) shows its view 0's frame table (K, 2026-10-22), mirrored by its
  flag bit 10 alone (the word's bit 15 mirrors only its lateral): 0x0B22 for the barriers along the road, 0x09F6 across
  it, 0x0648 for the walls and 0x18DE for the boards. Its image is `smgp-<frame table>-<b1>[-mirrored][-flipped]`
  (hexadecimal), in every palette it is shown in, the lowest its default: 136 images.
- **The tunnel's frame** (K, 2026-10-27, K's table's `frame`). This game's sky is one picture and cannot be darkened
  about the road as the original darkens its background, so inside the race's tunnel (9032–10860) a frame hides what
  lies outside: the pictures inside it, the walls' pillars (0x1494, 49 left and 50 right, mirrored) and the ceiling's
  lights (0x14B2, 45), each stand in a frame of the tunnel's dark (0x0842, pen 15), the road's opening left clear, as a
  board at P on the ground, the picture where the original places it in it, in its own colors: `smgp-1494-01-frame`,
  `smgp-1494-01-mirrored-frame` and `smgp-14b2-01-frame`, 144 boards. The opening reaches to the pillars' inner edges
  (±5.607 m) and up to the lights' tops (3.548 m); the dark out from it as far as the camera sees through the widest gap
  between two pieces, 20 steps (7.445 m): out by that gap × 160 / 240 (the screen's half width over the focal length) to
  ±10.571 m, and up by it × 120 / 240 (the rows above the horizon over it) to 7.271 m.
- **Kerbs** (view table 0x050A, 517) are stripes (K, 2026-10-22): each run of
  kerbs at one lateral, 4 steps apart (up to 8) with their palettes alternating, as wide as view 0's picture (144
  pixels, 1.93 m) about its first's x, in the first kerb's palette's mean colors of pixels 1–6 and 7–12 (blue and
  white, the next kerb's palette swapping them); its kerbs evenly from the first to the last, each two stripes 2 steps
  long, before it and after it, so kerbs further apart than 4 steps leave the road between them. Runs one after another
  at one lateral in one palette, all their kerbs one spacing apart, are one run. A run's kerbs within a Section are one
  Strip `repeat` of the first's two stripes (10); a kerb across a Section's ends is
  its own stripes, cut there.
- **Curves' insides.** An object on an arc's inside farther from P than the arc's radius less 2 m is left out (none
  is).
- **Images.** 17.77 M master texels, 88.6 MB of saved JSON (about 5.1 MB compressed, in Git and as Pages serves it);
  the 16-unit class, the far buildings and cliffs, holds 54.6 MB of it, each of the original's pixels about 4 × 4
  texels. The 2-unit class drops about half its columns and no row.

## SUPER MONACO GP's constants

SUPER MONACO GP's own constants and fixed rules, which its ROMs do not hold or hold only in its encrypted main program
(their values the [research notes](research/super-monaco-gp.md)' by research decryption), are these
(`super-monaco-gp-constants`); what the ROMs hold is read where it is used, and the constants the
originals share are [Original road data](original-road-data.md#shared-constants)'s.

| Constant                                                                | Value                                            | Why                                                                                                                                                      |
| ----------------------------------------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `STEP_UNITS`, `STEP_METRES`                                             | 96 units at 0.0349 s and 2.5 units a km/h a tick | a step's units, and its metres by the clock's and the camera's, encrypted                                                                                |
| `PATH_UNIT`, `PATH_RESOLUTION`                                          | a step's 96th; 1 unit                            | the road path's unit along the road, and its points' resolution: they are integers                                                                       |
| `UNIT`, `UNIT_DOWN`                                                     | 11 / 1640 m; 15/14 of it up                      | K's 11 m between the barriers (2026-10-26); the pixels' aspect                                                                                           |
| `LAP_LINE`                                                              | 288                                              | the lap's line, encrypted                                                                                                                                |
| `RACE_LAPS`                                                             | 3                                                | the original's race laps, by its records: its default records' three laps' time, 4'39"40 (M 0xC280) (K, 2026-10-30)                                      |
| `LANE`, `OFFSET`                                                        | 512 units; ±256                                  | the grid's lanes, encrypted                                                                                                                              |
| `GRID`                                                                  | 24 slots 12 steps apart from 576                 | the original's grid, encrypted                                                                                                                           |
| `BARRIER_HIT`, `ESCAPE_HIT`                                             | 700; 1228                                        | the limits routine's hits (M 0xC414), encrypted                                                                                                          |
| `RIVAL_SIZE_CLASS`                                                      | b1 2, a pixel 2 units                            | no size class byte: their size index's shift (M 0x12E42), encrypted                                                                                      |
| `BAND_RAMP`                                                             | 2 steps either side of a border                  | a band's edges move to the next band's over the 4 steps about their border, the conversion's                                                             |
| `TUNNEL_DARK`                                                           | 0x0842                                           | the tunnel's background, encrypted                                                                                                                       |
| `TUNNEL`                                                                | sky 9054 to 10655; ground 9032 to 10860          | the background's, encrypted; the ground K's (2026-10-21)                                                                                                 |
| `VANISHING_PIXEL`, `SKY_AT_HEADING`                                     | 354 of 1536; its sky column                      | the display's offset, encrypted                                                                                                                          |
| `KERB_GAP`                                                              | 8 steps                                          | the conversion's                                                                                                                                         |
| `INSIDE_MARGIN`                                                         | 2 m                                              | the conversion's                                                                                                                                         |
| `COURSE_NAME`                                                           | SUPER MONACO GP                                  | K's (2026-10-23): the text has SUPER MONACO GRAND PRIX, no course's name                                                                                 |
| `ROAD_MATERIAL`, `GRASS_MATERIAL`                                       | `ASPHALT`; `GRASS`                               | the road's and the escape areas' grass band's: the ROMs hold no material, so K's (2026-10-25)                                                            |
| `SURFACE_BOARD`, `SURFACE_HALF`, `SIDE_PAVING`, `ESCAPE_PAVING`, `OPEN` | 0x0DA4; 992; 1720 ± 992; 992; 2712               | the surface boards (248 pixels of size class 0, `pixelUnits(0)` units each) and the paving and open band they give                                       |
| `GRID_BOARD`, `START_BOARD`, `SURFACE_FRAMES`                           | 0x0DFE; 0x1F4A; the six surface frames           | the boards drawn as the road's surface and marks, not as boards                                                                                          |
| `CENTRE_LINE`, `GRID_MARKS`, `MARK_STEPS`, `START_LINE`                 | by the boards' rows                              | the marks drawn from the boards' pictures, the conversion's                                                                                              |
| `KERBS`, `KERB_STEPS`, `KERB_CLASSES`                                   | 0x050A; 4 steps; by size class                   | the kerbs drawn as stripes, the conversion's                                                                                                             |
| `GROUND`                                                                | h −50                                            | an object's height that stands on the ground: the barriers' height word in the objects' tables (S 0x3AB0, [research notes](research/super-monaco-gp.md)) |
