# TOP SPEED road data

How TOP SPEED's ROMs are read (its ROM set, hardware, tables and conversion). The rules every original is raised by and
the parts the originals share are [Original road data](original-road-data.md)'s; the programs' map and what is open are
its [research notes](research/top-speed.md)'s.

TOP SPEED's courses are raised from MAME's `topspeed` (Top Speed (World), Taito, 1987; FULL THROTTLE in Japan), its
parent set, whose programs are not encrypted. Its hardware and ROM list were read from MAME's drivers
`src/mame/taito/topspeed.cpp` and `pc080sn.cpp` at MAME commit `9c0b6db110cd4e1f1560e96f331d072b5abed446`.

## TOP SPEED's ROM set

K's `topspeed.zip` matches MAME's `topspeed` by CRC-32. The conversion reads the main 68000's program pair (its even
and odd bytes from 0) and its two pairs of data ROMs (from 0x80000), the sub 68000's pair, and the PC080SNs' tile ROMs,
a pair of even and odd bytes (`top-speed-rom`); and the sixteen OBJ ROMs of its sprites' tiles (`top-speed-sprites`).

## TOP SPEED's hardware

- **Its screen.** 320 × 240 pixels at 60.0532 frames a second, as MAME's description has it, measured on the hardware.
- **Its tile layers.** Two PC080SNs, each two layers of 64 × 64 tiles of 8 × 8 pixels at 4 bits a pixel (the tile
  ROMs' format the TC0100SCN's, `tilePen`), each tile two words, its attribute (its palette line, 9 bits, and its flips)
  and its code, each row of a layer moved across by its own scroll word. The second chip's layer 1 is drawn at the
  bottom, opaque, then its layer 0 and the first chip's layer 1, the road, each line colored by its raster word, then
  the first chip's layer 0, the text, then the sprites.
- **Its colors.** A palette word is xBGR555, as the Z system's (`rgb555Of`).
- **Its tick and a position.** The sub program's race step runs once a frame (S 0x151DE, its frame interrupt), so a tick
  is a frame, 1/60.0532 s, as MAME's description has it (`FRAMES_A_SECOND`, `top-speed-road`); that no program overruns
  a frame is assumed. A unit of the speed shows 0xA6 / 256 km/h (S 0x5F66) and gains a position a tick straight ahead
  (S 0x638E): a position is 2.9994 mm (`POSITION_METRES`), a record of 0x2000 positions 24.57 m, a section 786.3 m.
- **Across.** A lane is 3.6 m (K, 2026-11-05) over the mask's slot of 0x4A0 laterals (S 0x5988), P at 0x8000 between
  lanes c and d.

## Its course tables

The sub program holds the courses (`top-speed-road`), in the form CHASE H.Q.'s are held (`taito/course-records`): 32
records of 8 bytes a section, each section its next for the left and for the right.

- **The stages.** A stage's start copies its sections 0 to 14 from S 0xDB9A, 0x1000 bytes a stage and 0x100 a section
  (S 0x528C, 0x528E). A car crossing a section's end takes its next from S 0x9BBC, 32 bytes a stage (S 0x584C): the
  right where its lateral is P or more (S 0x5868 to 0x5886), at a fork. A stage's paths, numbered from 0 left before
  right, are 1, 2, 3, 7 and 5, each four sections before its goal section.
- **The goal sections.** Section 15 is no section of the tables: as the camera enters a path's last section (7 to 14),
  the sub program copies that path's goal section into it from S 0x9CF4, 0x100 bytes an index, its index from S 0x9C7C
  by the stage and the last section (S 0x5692 to 0x56AC, 0x5790 to 0x57A6), 20 of them used; the placeholder at
  S 0xAFF4 no path drives. Its end ends the stage, and the run goes on into the next stage's section 0; the fifth's end
  ends the run (S 0x5B02, 0x5B32). A course is five stages of five sections, 800 records, 19,656.6 m.
- **A record.** Byte 0 is the curve's class, signed; byte 1 the grade, signed, the height rising 8 × it every 0x100
  positions (S 0x5942); byte 2 its event (bits 7 to 5, S 0x69DE), its palettes' and sky's field (bits 4 to 2, read by
  the main program alone) and its join (bits 1 and 0: 3 a fork, at a section's record 31; 1 and 2 a road merging in a
  goal section); byte 3 its lane mask (bits 6 to 1 lanes a to f); bytes 4 and 5 the things beside the road, left and
  right (S 0x6812); byte 7 a thing in the middle, or a tunnel's walls' parameter (S 0x58F2). Byte 6 is read by neither
  program.
- **The courses.** Road N takes in each stage the path N modulo the stage's count of paths (K, 2026-11-05); the courses
  are roads 0 to 6, TOP SPEED A to G (`courseSections`).
- **The start.** The game stands the car 0xC000 positions (147.4 m) into section 0 facing back, drives it back toward
  the camera, turns it round and stands it at 0x260 (1.82 m), lane d (S 0x5344, 0x7C7E to 0x7D58, 0x7CF2), before the
  count to GO (S 0x7BE0).

## TOP SPEED's courses

Seven courses, TOP SPEED A to G (`top-speed-a` to `top-speed-g`), each its road from its start through its five
stages' paths to its goal, the fifth stage's end (`courseSections`): 800 records, 19,654.8 m from GO. Each is laid by
`road-layout` ([A road laid out](original-road-data.md#a-road-laid-out)), its road laid on back 186 m straight before
its start for its grid and the camera behind it (`cameraDistance`), as CHASE H.Q.'s are: 67 to 82 Sections a course,
19,842.6 m. A checkpoint stands at each of the first four stages' ends, where the original adds time (S 0x5B1C to
0x5B8E); the finish is the goal, where its run ends (S 0x5B32).

- **Its start.** The own car stands alone at GO 1.82 m into its first section in lane d ([The
  start](#its-course-tables)), the general form behind it on that lane and lane c ([The
  grid](original-road-data.md#the-grid)).
- **Its heights.** Where a course crosses itself (`crossings`: its line's steps 200 m or more apart that meet) its
  passages are fixed points of its rise table ([Its heights](#its-heights)). Up to their goals the courses cross
  themselves 23 to 53 times, the road laid on back once more each, 17 to 28 of them at one height within 0.96 m, the
  others 1.14 m or more apart. A course's height departs from the table's by 1.6 m (11.0 m in G), its grade within
  0.039 of the table's.
- **Its skies.** Each Section takes the sky in force at its start and each change within it at its record's start,
  at once (default, K confirms at the stage's end): the original wipes its horizon band in a column a frame over 44
  frames (M 0x894C) and copies a color set whole ([Its skies](#its-skies)).
- **Its roads not taken.** At each of its 7 to 9 forks, from its branch's start, the other branch's half of the road
  is drawn beside its own over 30.7 m and no further, as the main program draws it ([Two
  roads](original-road-data.md#two-roads), `roadsNotTaken`): its lanes on its side by its first record's mask, out from
  its own P, its body, lines and edge as the course's and striped as the course's, drawn over it, of no material, as the
  original slows a car by its lateral alone. Its P lies where the other branch's line lies from the course's, the two
  leaving the fork's end on one heading, each turned by its own records (M 0x5B64, 0x5C34), plus the program's slide
  outward, the camera's advance since the branch's start over 32 pixels on every line (M 0x5F46 to 0x5F8A) up to 0x2800
  positions (M 0x5F62), a pixel taken at the nearest line, 24.3 mm, 7.8 m in all (default; K confirms at the stage's
  end: the original slides it the same pixels on every line, more laterals the farther the line): 18.0 to 20.4 m out
  at its end. The fork pictures the program shows from six records before a fork and the gap of 3 to 9 pixels it opens
  at P over the fork section's last four records (M 0x5A08 to 0x5B08) are not drawn (default; K confirms at the stage's
  end). The course's own lanes on the side not taken narrow a lane over 28.4 m from the branch's start, as every
  change of its lanes does, where the original's half there is the road not taken: a replacement that cannot be
  avoided, as the format's Link joins roads of the same lanes alone (K, 2026-11-08).
- **Its tunnels.** Where a tunnel's walls hold the car ([Its road across](#its-road-across)), the road and the sky are
  dark, at once at the walls' ends (default; K confirms at the stage's end): the original darkens the road's lines
  between its tunnel mouths' sprites' lines on the screen (M 0x3A0C, the sub program listing them, S 0x1689E), ORing
  0xFFE0 into their raster words, which MAME's description reads as each pen's tunnel pen, 10 on, with no other shades
  (a dark surface, a black ground, an orange inner band, grey lines and outer band, the dashes kept); and turns the
  sky's lines to the black color set 0 by the sub program's flags (M 0x85F8 to 0x864A).
- **Its bands.** As the road picture draws them ([Its road picture](#its-road-picture)): its body over its lanes, each
  edge's inner band from 0.073 m within the lanes to 0.219 m beyond them and its outer band on to 0.535 m, the ground
  beyond, and its lines 0.146 m wide about its lanes' sides within; at P the right half's line, its right half where
  three lanes lie right of P and both where one or two do, none where a side has none, its edge's inner band then at P.
  Its road is `ASPHALT`.
- **Its stripes.** Each line of the road takes a raster word by its place, the position's bits 11 and 10 adding a word
  each to a base, four parts of 0x400 positions (3.07 m) each 0x1000 (12.29 m), counted from the run's start (M 0x38D6
  to 0x39A6); on and before a hill, where the camera's record or one of the next four up to a fork has a grade (M 0x6DDE
  to 0x6E76), a hill's words and the palette lines without lines (`hills`). A word's bits are read as MAME's
  description has them (default; K confirms at the stage's end): 0x10 the surface's other shade, 0x02 the ground's, 0x08
  the lines and the inner band drawn as the surface and 0x04 the outer band. So on the flat the surface and the ground
  are light and dark over 6.14 m each and the lines and both edge bands dashed, 3.07 m on and off; on a hill no lines or
  inner band show and the outer band is dashed. A shade is each component 3 more (M 0x46CC); the lines and the edge
  bands are their palette line's pens as the program loads them at its start, white. The colors change at once at a
  record's start (default; K confirms at the stage's end: the original fades them a step a frame, M 0x4830).

## Its plan

A course turns as its horizon band turns ([A
turn](NEXT.md#stage-ta--top-speed-continental-circus-and-chase-hq-from-the-roms)): each record (128 − |c|) / 2 pixels
of the band's 1,024 a turn, c its curve's class, none for a class of 0 (`coursePieces`, `skyTurnPlan`). The main
program's turn a frame is the class's complement to 0x8000 times the camera's advance over 2 (M 0x6156 to 0x6168), the
band keeping 21 bits of its fraction (M 0x8A9E), and a record is 0x2000 of the advance ([research
notes](research/top-speed.md#the-sky)). A positive class turns right: it moves the band left, as the scenery moves as
the road turns right. The courses' classes run from 4 to 60, to 80 in E and 90 in G, their radii from 64.6 m to
117.8 m, 166.9 m and 210.8 m. Each line's shift across in the road's picture is a replacement that cannot be avoided:
the curves look otherwise.

## Its road across

Its lanes are lanes a to f by its records' masks (`maskLanes`, [Lanes by a
mask](original-road-data.md#lanes-by-a-mask)), bits 6 to 1, P between c and d, a lane's slot 0x4A0 laterals (S 0x5988)
of 3.6 m. The main program draws each side's edge moving toward its record's mask a lane at a time, 0x128 of its units a
lane by the camera's advance over 32 a frame (M 0x7FC0, 0x8044 to 0x805E), from the record's start: a lane over 28.4 m,
and over 14.2 m in a goal section (M 0x6276 to 0x629E, 0x8060 to 0x8068), a newer mask taking over an edge still
moving from where it stands (`maskChanges`). A side may hold no lane, its edge then at P.

Its limits are its sub program's (`limitStretches`): the car held within its record's mask's outermost lanes' centres
0xDE0 laterals out (S 0x6354), 9.0 m beyond the lanes, and where a tunnel's walls are 0x1E0 out (S 0x75EE), 0.34 m
within them, changing at once, each change a Section's cut. A tunnel's record (its event 3) walls all of itself where
its parameter is 0 or 0x50 or more, its first half where it is 0x48 to 0x4F and its second half otherwise (S 0x58F2
to 0x5934), so that a tunnel runs from the middle of its first record to the middle of its last.

Its ground is one material each side by its ground color and the color's alternate shade, each component 3 more
(M 0x470C), by the shared rule ([The ground beside the road](original-road-data.md#the-ground-beside-the-road)): the
color the table at M 0xBA6C0's, 8 bytes a color set from set 1 and a word by the record's field's low two bits
(M 0x47D6 to 0x47F2), `GRASS` where green is the strongest channel and `SAND` elsewhere (`groundAlong`), no ground
reading as `WATER`. The color set is the sky's (`colorSet`, [Its skies](#its-skies)).

## Its road picture

The main program draws its road as two halves, each a tile layer holding one side's picture from P outward, the left's
mirrored ([research notes](research/top-speed.md#the-road-across)): the road at its nearest line, the screen's last
(its 80th from the road's first at the screen's row 160), is the right half's picture in steady driving (M 0x4190), of
three lanes, a lane there 0x128 of the edge offsets' units times the line's number over 0xA0 pixels (M 0x7FC0, 0x7F30),
148 pixels, P where its lane lines lie a lane and two from it (`topSpeedRoadPicture`). Its lines (pen 1) are 0.146 m
wide about each lane's side within the lanes, the line at P its right half; its edge is its inner band (pen 2) from
0.073 m within the lanes to 0.219 m beyond and its outer band (pen 3) on to 0.535 m beyond them, where the ground (pen 5) begins; its surface is pen 4.

## Its heights

A course's heights are a [rise table](original-road-data.md#profile-from-a-rise-table)'s (`top-speed-heights`): the sub
program gives a car its record's base, each record before it adding its grade × 0x100 height units, and the record's
grade × 8 at each step of 0x100 positions into it (S 0x5942 to 0x595E), with no limit on the grade and no blending
between records. So each step's grade is its record's, 8 height units a step a unit of grade, a height unit 2.884 mm
(the main program's pitch at M 0x75C8 read back through its eye, whose focal length is 266 pixels), a step 0.768 m:
the rise table's resolution is 3.0 % a unit of grade.

## Its skies

TOP SPEED's sky is the second PC080SN's bottom layer ([research notes](research/top-speed.md#the-sky)), its x scroll
never set, so that it turns by its rows' scrolls alone: two bands of pictures over a flat color (`top-speed-backgrounds`).

- **The bands.** Each band is a picture of 128 columns of tiles, 1,024 pixels, column by column, its tile codes words, a
  band's palette line its descriptor's (the table at M 0x90AE, read through M 0x8E62: 16 bytes an entry, the picture,
  its place, its attribute and its rows). The horizon band (band A, pictures 0 to 3) is 4 rows high, the city's (3) 8;
  the cloud band (band B, pictures 0 to 3) is 13 rows over it, one strip where its picture's index is odd, else three of
  6, 4 and 3 rows. Above them the layer holds a tile all of pen 1 in the cloud band's line: the sky's flat color.
- **Their turns.** The horizon band turns by 128 less the curve's class as the car goes (M 0x6116 to 0x6178), a turn of
  its 1,024 pixels, and faces the sky. A cloud strip turns at its share of the horizon band's (M 0x8A6A to 0x8B66): a
  whole cloud band 1/2, three strips 3/4, 1/2 and 1/4 from the top. Every band is laid with its picture's pixel 432 at
  the screen's middle as it is loaded (M 0x8DEE: its columns from its column 32, the layer shown from its 16th pixel by
  MAME's description), at a stage's start and wherever its picture changes, so a strip's seam lies behind the facing.
- **Their rows.** In steady driving the horizon band's last row lies one row below the road's first line (M 0x76B6 to
  0x777A), the cloud band's strips over it.
- **Their colors.** A color set (1 to 10; set 0 is black, in tunnels) gives each band's four lines (M 0x86F4, 0x872A):
  the cloud band's from 0xBA140 and the horizon band's from 0xB9BC0, 128 bytes a set. One pen of the cloud band's line
  colors the horizon band's background (M 0x85FC to 0x8638), so that the two meet in one color. The set is twice the
  stage plus 1, one more from the camera's section 7 on, a path's last and its goal (M 0x4898, `colorSet`).
- **Their changes.** The pictures start at the city and the white clouds (3 and 2) and carry over from stage to stage;
  a record whose word at 2 masked by 0x1C00 is 0x1000 or 0x1800 changes them by the next record's byte 2 (M 0x88BE, the
  table at M 0x8A2A), the horizon band at once and the cloud band only in a tunnel, which the sub program's flags tell
  the main program as the run goes; a course takes the cloud band's change where its change record is a tunnel's (its
  event 3), as the records give it (`skyChanges`; default, K confirms at the stage's end). Every change record but the
  goal sections' lies in a tunnel; the goal sections' change the horizon band alone. Along the seven courses the sky
  changes 15 to 17 times, of 27 skies.

## Its things

A thing is drawn by its sub program's sprite builder (S 0x164EA), the main program copying the list to the sprites
([research notes](research/top-speed.md#things)); its pictures are read as follows (`top-speed-sprites`,
`top-speed-things`, `top-speed-boards`).

- **Its sprites.** A big sprite is 8 × 16 tiles of 16 × 8 pixels at 4 bits a pixel, pen 0 not drawn, 128 × 128 pixels
  at its full size, laid by the sprite map: RAM the main program fills at its start from a run-length code (M 0x13AC)
  and overlays as a thing's load record names (a descriptor's long at 0xA, S 0x6CA4; M 0x91F4, M 0x1370). Its tiles
  are the sixteen OBJ ROMs, each a byte of every 8 in its half of them, a tile 64 bytes, its four bit planes 16 bits
  apart in a row, as MAME's description lays them. A thing's palette lines are the 256 the main program copies at its
  start and those its list sets after (M 0x568, M 0x59A).
- **Its descriptor.** A thing's code names its descriptor through two tables, a byte by the code's low 12 bits and a
  long by it (S 0x165A6, 0x1662A): a head of 14 bytes, its pieces' count, its sprite and palette, its anchor, its flips,
  its size curve and its load record, and its parts of 12 bytes after it. Each piece is a big sprite at its full size:
  the head's cell its anchor's pixels left of the thing's point and its bottom on the ground, each part's cell whole
  big sprites from the head's, up and right, by its offsets (S 0x168D0 to 0x168EC, the table at S 0x1B44A). A part
  whose zoom is fixed on an axis (its type, bits 4 to 2 of its byte 6, other than 0) is a band, laid apart.
- **Its pixel.** A sprite's pixel at its full size is its size curve's row's that draws it so, its zoom 0x7F, a
  lateral × its factor / 65536 a screen pixel (S 0x1664E to 0x16672): 10.84 laterals, 32.9 mm, for the standing
  things' curve; 23.6 mm for the flat things'.
- **Its picture.** Each descriptor's pieces of their own zoom, the head over its parts as the list is drawn from its
  first entry, one picture by [Things of several pieces](original-road-data.md#things-of-several-pieces), its base
  point the thing's point on the ground (`topSpeedBoards`, `topspeed-<index>`); 92 descriptors draw one.

- **Where it stands.** As the sub program spawns a record's things five records ahead of the camera (S 0x65BA), each
  at its pattern's offsets along the record, 0x100 positions each (the table at S 0x9CB4, a row of 8 a pattern, 0xFF
  its end; `topSpeedPlacements`):
  - its roadside things by its bytes 5 and 4, right and left: a code 0x100 plus 0x200 the stage, 0x20 the section and
    the byte's low 5 bits, its pattern its top 3 (S 0x6812 to 0x6886); right at the mask's rightmost lane's centre
    0x940 out and left at its leftmost's, each pushed out by its descriptor's word at S 0xC132 (S 0x68A6 to 0x68CE).
    The START gate, the CHECK POINT gates at the next stages' starts and the GOAL gate are roadside things;
  - a tunnel's mouths by its parameter below 0x50, the code and the code 0x40 on, 0xB0 beyond its mask's outermost
    lanes' centres, at the record's middle (S 0x6A60 to 0x6AA8); and its lamps by its parameter from 0x50, 0x600 left
    of the leftmost lane's centre and 0x160 right of the rightmost's (S 0x6AAA to 0x6AE2);
  - a gantry by its event 6 at the lanes' middle, its code by the camera's section, odd or even (S 0x6B78).
  - an overpass by its event 4: its near face at the record's middle and its far face 0xE80 positions (11.1 m)
    beyond, each a deck at P, the codes 0x58 and 0x98 and twice the stage, and six posts a position nearer from
    0x800 every 0x3000 laterals (S 0x6AE4 to 0x6B6A), the two nearest P met each from its side and the others by none
    (the table at S 0x6B6C). A deck is its pieces across the view, a band floating at their height; its piece's
    second copy (its byte 6 bit 6) its byte 0xB's palette, its bottom half its height less a pixel lower (S 0x1696A
    to 0x1699C), the deck's darker face. Under it the road is dark, from the near deck, whose head's tunnel line
    (byte 6 bits 1 and 0, S 0x1689E) begins the road's dark lines (M 0x3A0C), to the far deck, whose line ends them; the
    sky stays (default; K confirms at the stage's end).

  A thing left of P whose head's byte 6 bit 7 is set shows the next descriptor (S 0x16634). A thing's pieces of a
  fixed width (type 1: its wall continued outward, a negative offset its pixels and any other its step of 0, 0x80,
  0x100 or 0x180 pixels, S 0x16A30 to 0x16A44) are drawn once in its picture at their full size, as a tunnel's mouth is
  ([Strips](original-road-data.md#strips)); its pieces across the view (type 5, at screen columns 0, 112 and 240: a
  tunnel's ceiling above its right mouth) are a band across the road at its lateral, floating at their height, its
  last piece's columns extended outward each way (`topSpeedBands`, `topspeed-<index>-across`). A descriptor with no
  piece of its own zoom places no picture: the gates' right halves, which hold only their right posts' hits, and the
  flat things, laid as bands (default; K confirms at the stage's end). The things the original spawns on the branch
  not taken, and the GOAL gate it stands 12.3 m past the run's end on the next stage's records, are not placed
  (default; K confirms at the stage's end).

- **Its hit.** A car meets a thing within its box, the long at S 0xBC32 by its descriptor with 0x100 added to each
  word, its low word the half width and its high word the depth ahead of it (S 0x7738 to 0x7746): a roadside thing
  only from its side of P (S 0x772C), a gantry at its two posts 0xC00 either side from both (S 0x77F0 to 0x7830), a
  tunnel's lamps never; a thing whose byte at S 0xC032 is set only bumps a car and has no body. A body is its hit's
  parts as wide as they are, at most the picture's colored columns, on its side of P alone where only that side meets
  it, as CHASE H.Q.'s ([Its objects](chase-hq-road-data.md#chase-hqs-objects)).

## TOP SPEED's conversion

`top-speed-course` writes the seven courses to `content/originals/courses/` (`top-speed-a` to `top-speed-g`), their
crest trials, their 32 skies (`top-speed-sky-<horizon>-<clouds>-<set>`, set 0 a tunnel's) and their things'
pictures and bands (`topspeed-<index>`, `topspeed-<index>-across`) to `content/originals/images/` (`top-speed-course`; its conversion's version 7).
