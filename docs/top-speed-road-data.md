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
- **Its skies and colors** change together ([Sky baking](original-road-data.md#sky-baking), `lookChanges`): from
  each record whose sky (its pictures or its color set) or road's and ground's colors in force differ from those before,
  over the longer of the bands' wipe where its pictures change, a column a tick over 0x2C columns (M 0x8E5C, 0x8EE0 to
  0x907C), and the colors' fade, two ticks a step of their largest channel's change (M 0x4830, 0x45F8, 0x4604), at top
  speed without the nitro, 494 positions a tick, 1.48 m (`TOP_SPEED`: its gear table's 0x1F3 flat out in high gear,
  S 0x5D1A, 1/128 less on level road, S 0x5D98, the speed settling a unit below it, S 0x5EB2); the sky's color lines
  are copied at once ([Its skies](#its-skies)). On a sky change's record and the one after it the colors hold those
  in force (M 0x4752 to 0x482E). Changes that overlap are one (`joinedChanges`). Each Section takes the sky in force at
  its start and each change within it, the road's bands and the ground taking each change's colors in pairs over it
  (`colorStretches`, `placedStretches`). The courses change 22 to 26 times, over 5.9 to 65.2 m, the longest the
  bands' wipe; ten of the changes begin 12.3 m before a tunnel's walls, where its dark sky comes at once.
- **Its forks.** While the camera's record or one of the five after it in its section is a fork's (its join 3,
  M 0x5B0A to 0x5B62), and on until the road not taken is gone (M 0x5A08 to 0x5A54, 0x5FF0), the main program draws
  each half by a fork picture (M 0x3FAC, 0x4198; `topSpeedForkPicture`): the half as it is, but at its P, in place of
  the line there, a band of the outer band's pen 0.316 m wide outward from P, the left half's picture clear beyond P
  and the right half's, the layer beneath it (M 0x3EEE, 0x4122), the ground's pen there. While the camera is in the
  last four records of the fork's section it moves each half outward by pixels on every line (M 0x5A80 to 0x5B08,
  added to the halves' slides at M 0x3B64 to 0x3B78), the left by 1 to 5 and the right by 2 to 4, so that a gap of 3,
  7, 8 and 9 pixels opens at P, the ground's pen in it. A course lays them as its road's Strips where the camera is
  when the original draws them, as its hills' stripes are laid: over a fork's section's last six records (147.4 m)
  each half's band at P, striped as the outer band, and no line at P; over its last four the ground's color between
  the two bands, striped as the ground, 0.073, 0.170, 0.195 and 0.219 m wide, a pixel taken at the nearest line as the
  slide's is; and over the road not taken's 30.7 m the course's own half's band at P. The gap is color alone, the
  road's material under it: the sub program slows a car by its lateral from its outermost lanes' centres alone
  (S 0x5DFE) and reads neither the gap's pixels nor the flag of the fork's approach. The halves' lanes and edges are
  not moved by the gap's 1 to 5 pixels (24 to 122 mm).
- **Its roads not taken.** At each of its 7 to 9 forks, from its branch's start, the other branch's half of the road
  is drawn beside its own over 30.7 m and no further, as the main program draws it ([Two
  roads](original-road-data.md#two-roads), `roadsNotTaken`): its lanes on its side by its first record's mask, out from
  its own P, its body, lines and edge as the course's, at its P the fork picture's band ([Its
  forks](#top-speeds-courses)), striped as the course's, drawn over it, of no material, as the original slows a car by
  its lateral alone. Its P lies where the other branch's line lies from the course's, the two
  leaving the fork's end on one heading, each turned by its own records (M 0x5B64, 0x5C34), plus the program's slide
  outward, the camera's advance since the branch's start over 32 pixels on every line (M 0x5F46 to 0x5F8A) up to 0x2800
  positions (M 0x5F62), a pixel taken at the nearest line, 24.3 mm, 7.8 m in all (default; K confirms at the stage's
  end: the original slides it the same pixels on every line, more laterals the farther the line): 18.0 to 20.4 m out
  at its end. The course's own lanes on the side not taken narrow a lane over 28.4 m from the branch's start, as every
  change of its lanes does, where the original's half there is the road not taken: a replacement that cannot be
  avoided, as the format's Link joins roads of the same lanes alone (K, 2026-11-08). The things of the branch not
  taken stand beside it ([Beside a road not taken](#its-things)).
- **Its tunnels.** Where a tunnel's walls hold the car ([Its road across](#its-road-across)), the road and the sky are
  dark (default; K confirms at the stage's end: the dark taken over the walls), at once at their ends as a place's
  colors are ([Sky baking](original-road-data.md#sky-baking)): the original darkens the road's lines between its tunnel
  mouths' sprites' lines on the screen (M 0x3A0C, the sub program listing them, S 0x1689E), ORing 0xFFE0 into their
  raster words, which MAME's description reads as each pen's tunnel pen, 10 on, with no other shades (a dark surface, a
  black ground, an orange inner band, grey lines and outer band, the dashes kept); and turns the sky's lines to the
  black color set 0 by the sub program's flags (M 0x85F8 to 0x864A).
- **Its bands.** As the road picture draws them ([Its road picture](#its-road-picture)): its body over its lanes, each
  edge's inner band from 0.073 m within the lanes to 0.219 m beyond them and its outer band on to 0.535 m, the ground
  beyond, and its lines 0.146 m wide about its lanes' sides within; at P the right half's line, its right half where
  three lanes lie right of P and both where one or two do, none where a side has none, its edge's inner band then at P,
  and none at a fork ([Its forks](#top-speeds-courses)).
  Its road is `ASPHALT`.
- **Its stripes.** Each line of the road takes a raster word by its place, the position's bits 11 and 10 adding a word
  each to a base, four parts of 0x400 positions (3.07 m) each 0x1000 (12.29 m), counted from the run's start (M 0x38D6
  to 0x39A6); on and before a hill, where the camera's record or one of the next four up to a fork has a grade (M 0x6DDE
  to 0x6E76), a hill's words and the palette lines without lines (`hills`). A word's bits are read as MAME's
  description has them (default; K confirms at the stage's end): 0x10 the surface's other shade, 0x02 the ground's, 0x08
  the lines and the inner band drawn as the surface and 0x04 the outer band. So on the flat the surface and the ground
  are light and dark over 6.14 m each and the lines and both edge bands dashed, 3.07 m on and off; on a hill no lines or
  inner band show and the outer band is dashed. A shade is each component 3 more (M 0x46CC); the lines and the edge
  bands are their palette line's pens as the program loads them at its start, white. The colors change with the sky
  ([Its skies and colors](#top-speeds-courses)).

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
  table at M 0x8A2A), the horizon band always and the cloud band only in a tunnel, which the sub program's flags tell
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
    The START gate, the CHECK POINT gates at the next stages' starts and the GOAL gate are roadside things. A
    roadside thing of type 0x1F is flat on the ground: its code's bit 15 is set (S 0x685E), which draws it beneath the
    others (S 0x15202);
  - a tunnel's mouths by its parameter below 0x50, the code and the code 0x40 on, 0xB0 beyond its mask's outermost
    lanes' centres, at the record's middle (S 0x6A60 to 0x6AA8); and its lamps by its parameter from 0x50, 0x600 left
    of the leftmost lane's centre and 0x160 right of the rightmost's (S 0x6AAA to 0x6AE2);
  - a gantry by its event 6 at the lanes' middle, its code by the camera's section, odd or even (S 0x6B78).
  - water by its event 1 or 2, right or left, its code 0x61 and the camera's color set, 0x1190 beyond the rightmost
    lane's centre or 0xCF0 beyond the leftmost's (S 0x6A18 to 0x6A5E), bumping a car alone. Its descriptor is two
    pieces of a fixed width on the screen, flat on the ground outward from its head's point, its shore and its water;
    the point is its lateral, and left of P, where its picture is the next descriptor, whose anchor is a piece's
    width, a piece beyond it, the anchor taken by the thing's zoom (S 0x16786). It is laid as the ground's Strips from
    that point outward over its records, its shore a piece wide at the flat things' full size (3.0 m) and its water
    beyond, each its piece's most frequent color: a replacement that cannot be avoided, as its strips keep their
    width on the screen. A roadside byte of type 0x1F places water's descriptor too, where its record's event is a
    gantry's within a stretch of water (four records each, twice in A and B and once in C and D), 0xDC0 beyond the
    leftmost lane's centre; it is laid as water.
  - its ground patches, the other roadside things of type 0x1F: sand grains, grass and dunes, flat things as water is,
    of one piece of a fixed width on the screen outward from their head's point, the dunes of two, placed one to four
    a record 0x920 beyond the outermost lane's centre (5.3 m beyond the lanes; the left grass and dunes, whose
    anchor is a piece's width, a piece farther). Each is laid in water's form (K, 2026-11-10), as the ground's Strips
    over each record that places it, from its point outward. Where it differs from water: its width is its pieces',
    each a piece wide at the flat things' full size (3.0 m, the dunes 6.0 m), the ground beyond; it is one color, its
    piece's most frequent (its picture's colored pixels 17 to 33 % of a piece, in its lower rows); and it has a
    material, by its color as the ground's ([The ground beside the
    road](original-road-data.md#the-ground-beside-the-road)), the grass `GRASS` and the sand and the dunes `SAND`,
    within the limits. The sub program treats a car over one as over water: within its box it sets the car's flag a
    tunnel's wall sets and no more (S 0x7772 to 0x7790, 0x7AEE), with no crash and no change of speed; the flag is
    read where the words of the board's outputs are made (S 0x146AC), what they drive not confirmed. That each
    record's patches are one stretch of one color is a replacement that cannot be avoided, as water's. The courses
    lay 7 to 22 such stretches, 393 to 1,622 m a course, of 52 to 217 patches.
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
  piece places no picture: a gate's right half, which holds its right post's hit alone ([Its hit](#its-things)). The
  GOAL gate it stands 12.3 m past the run's end on the next stage's records is not placed (default; K confirms at
  the stage's end).

- **Its cloud banks** (K, 2026-11-10). A record's byte 7, on every record but a tunnel's, puts out a thing at P at its
  pattern's offsets, its code 0xBF and the byte's low 5 bits and the camera's color set, with the bit that draws it
  under every other thing (S 0x6BB0 to 0x6BDE): the courses' byte 0x80 a bank every 0x1000 positions (12.3 m), each in
  its color set's colors (descriptors 132 to 141; the courses' 134, 138, 140 and 141), over the 23 records (565.1 m)
  from the second stage's tenth record on every course and 6 to 46 records more in the fourth and fifth stages of all
  but D: 80, 126, 58, 46, 74, 92 and 138 banks on A to G. A bank is tied to the road and is no part of the sky: four
  pieces of a fixed width side by side, 512 pixels across the screen about the road's place at its distance (S 0x166BA
  to 0x166CA, 0x16A30), from 0x8000 positions (98.3 m) ahead. A course lays each as a band across the road at its
  station, at P, with no body ([Strips](original-road-data.md#strips)): its picture its four pieces at the thing's
  full size, a pixel a pixel as the standing things' are, 16.9 m by 4.2 m, and beyond each edge its outer piece, its
  ragged edges' clear texels kept (`topSpeedBands`, `topspeed-<index>-across`), in the descriptor of the camera's
  color set as it is put out. It is held 7.38 m over the road (`topHeldHeight`), where the original holds its bottom
  as its size curve (S 0x1AC4A) first draws it at its full size, 0xD40 positions (10.2 m) ahead: its head's byte 6
  bit 5 counts its rows from the screen's top, its bottom's word 0x18 − h, h its curve's height there, 62 (S 0x16698,
  0x1670A); a standing thing's there, on the road's line at that distance, is 0x85 − n + 1 + d + d / 2, d its curve's
  height there × n / 128 and n the road's lines, 0x58 (S 0x166DE to 0x166FE, M 0x2D02); the 112 rows between them are
  each 128 / 64 of a standing thing's pixel at its zoom there, 224 pixels of 32.9 mm. Two replacements cannot be
  avoided. The original's bank changes its rows and its size with its distance by its own curve, where a board keeps
  one height and one size: read through the eye's 266 pixels, its bottom lies 8.1 m over the eye at 98.3 m and 2.4 m
  at 6.1 m, and it is 1.1 m high at 98.3 m and 6.2 m at 24.6 m, so that the sky fills with cloud from just over the
  horizon upward as each bank nears. And the original draws it behind the road's layers, over the sky alone (its
  pieces' byte 7 bit 7, as MAME's description reads it; not confirmed), and under every other thing, where a board is
  drawn at its depth.

- **Beside a road not taken.** From the camera's record 27 of a section the record five ahead of it is the next
  section's, at a fork each of its two next sections' (S 0x65DC, 0x675C to 0x6784): the original puts out both
  branches' first five records' things, and frees every thing whose section is not the camera's as the road not
  taken's slide ends, the main program then setting its word at 0x4010E4 (M 0x5FCA; S 0x65EC to 0x6612). A course
  places the things of the branch it does not take that lie on its road not taken as it is drawn, within 0x2800
  positions (30.7 m) of the branch's start ([Its roads not taken](#top-speeds-courses); K, 2026-11-10), the camera
  five records behind in the fork's section: each at its lateral from that road's P as it slides away, its picture
  with no body, and water and a ground patch as the ground's Strips, of color alone, from its point outward of that P
  over its records there. The car,
  held within its limits, reaches none of them: the nearest's box lies 1.17 m beyond the limits, and the conversion
  reports any whose box or water would lie within them (`notTaken.reached`) and gives it no body. The courses place 9
  to 16 such things at their 7 to 9 forks, 79 in all, water at three forks (two of C's, one of D's) and a ground
  patch at two (one of B's, one of D's). The things the
  original shows farther along that branch until the slide ends are not placed, as the road not taken is not drawn
  there.

- **Its hit.** A car meets a thing within its box, the long at S 0xBC32 by its descriptor with 0x100 added to each
  word, its low word the half width and its high word the depth ahead of it (S 0x7738 to 0x7746): a roadside thing
  only from its side of P (S 0x772C), a gantry at its two posts 0xC00 either side from both (S 0x77F0 to 0x7830), a
  tunnel's lamps never; a thing whose byte at S 0xC032 is set only bumps a car and has no body. A body is its hit's
  parts as wide as they are, at most the picture's colored columns, on its side of P alone where only that side meets
  it, as CHASE H.Q.'s ([Its objects](chase-hq-road-data.md#chase-hqs-objects)). A gate's right post is hit as the
  original hits it: the roadside thing of no piece its record stands right of P at the gate's station, the START gate's
  10.17 m right of P and a CHECK POINT gate's 5.01 m (8.61 m at the fifth stage's, of four lanes), a box 1.95 m either
  side of it met from the right of P. Its hit is a second part of the gate's body, as CONTINENTAL CIRCUS's things of
  two parts hold theirs ([Its bodies](continental-circus-road-data.md#its-things)), within the gate's picture's colored
  columns ([Chosen lines](original-road-data.md#chosen-lines)), which end before the box does: 1.92 m of the START
  gate's, from 8.22 m right of P, and 0.96 m of a CHECK POINT gate's, from 3.07 m. Each course's five gates so hold
  two parts but the fifth stage's, whose box lies wholly beyond its picture (from 6.66 m, the picture's last colored
  column 4.03 m right of P) and adds none: the original draws that gate's right post in its fourth lane, 2.6 m short
  of its box.

## TOP SPEED's conversion

`top-speed-course` writes the seven courses to `content/originals/courses/` (`top-speed-a` to `top-speed-g`), their
crest trials, their 32 skies (`top-speed-sky-<horizon>-<clouds>-<set>`, set 0 a tunnel's) and their things'
pictures and bands (`topspeed-<index>`, `topspeed-<index>-across`) to `content/originals/images/` (`top-speed-course`; its conversion's version 16).
