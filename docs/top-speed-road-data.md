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
a pair of even and odd bytes (`top-speed-rom`).

## TOP SPEED's hardware

- **Its screen.** 320 × 240 pixels at 60.0532 frames a second, as MAME's description has it, measured on the hardware.
- **Its tile layers.** Two PC080SNs, each two layers of 64 × 64 tiles of 8 × 8 pixels at 4 bits a pixel (the tile
  ROMs' format the TC0100SCN's, `tilePen`), each tile two words, its attribute (its palette line, 9 bits, and its flips)
  and its code, each row of a layer moved across by its own scroll word. The second chip's layer 1 is drawn at the
  bottom, opaque, then its layer 0 and the first chip's layer 1, the road, each line colored by its raster word, then
  the first chip's layer 0, the text, then the sprites.
- **Its colors.** A palette word is xBGR555, as the Z system's (`rgb555Of`).

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
  stage plus 1, one more from a path's section 7 on (M 0x4898).
- **Their changes.** The pictures start at the city and the white clouds (3 and 2) and carry over from stage to stage;
  a record whose word at 2 masked by 0x1C00 is 0x1000 or 0x1800 changes them by the next record's byte 2 (M 0x88BE, the
  table at M 0x8A2A), the horizon band at once and the cloud band only in a tunnel. The courses read where (TA-10).
