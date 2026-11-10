# TOP SPEED research notes

Research behind TOP SPEED's road data that the specification does not hold: the programs' map, routines and what is
open. Not a specification: the tables, formats, conversion rules and decisions are its chapter's and [Original road
data](../original-road-data.md)'s. M is the main 68000's program, S the sub 68000's; addresses are each program's.
Read statically; MAME's driver (commit 9c0b6db1) for the hardware alone.

## Sets

- K's `topspeed.zip` matches MAME's `topspeed` (World) by CRC-32. No encryption. M is a pair of 64 KiB ROMs from 0 and
  two pairs of 128 KiB data ROMs from 0x80000; S a pair of 64 KiB ROMs; the PC080SNs' tiles a pair of 128 KiB ROMs.

## The sky

- M copies the tile layers' scrolls from shared RAM each frame (0x10C8 to 0x113A) but never the second chip's layer 1's
  x scroll, which it clears once (0x1614): that layer, drawn at the bottom and opaque, holds the whole sky and moves
  across by its rows' scrolls alone, which M builds line by line (0x87D4) and copies in the frame's blank (0xFBA). The
  first chip's layer 0 is text (cleared at 0x17E0); the other two layers draw the road.
- Each band is loaded by a state machine run each frame (0x8DEE on): a band whose picture changed takes its descriptor
  (0x8E48 to 0x8ECC), resets its scroll, and copies 44 of its picture's columns from column 32 into the layer, at once
  at a stage's start and a column a frame where a record changes it. Then, as a strip's scroll crosses a tile, the
  column moving in is copied from the picture, wrapping at 128 (0x8B6A to 0x8CE0). Code wrapping at 80 and 208 columns
  (0x8CE6, 0x8CFC, 0x8D86) and a cycling of the horizon band's picture (0x8974 to 0x89BC) are never reached.
- The turn (0x6116 to 0x6178) is the curve's class and the position's change a frame alone, no steering in it; each
  strip keeps its own fraction of it and moves at most 8 pixels a frame (0x8A6A to 0x8B86). The record the turn reads
  is the camera's position's bits 17 to 13 (0x6136 to 0x6144), so that its changes over a record sum to 0x2000 whatever
  the frames, and the horizon band, keeping 21 bits of fraction, turns (128 − |c|) / 2 pixels a record. A positive
  class moves the band left, as the scenery moves as the road turns right.
- The pictures' indices start at 3 and 2 (0x744, 0x9E4) and are kept across stages (0x2F20, 0x31F4). A change record's
  cloud picture is taken only while a flag the sub program sets in tunnels is set (0x8938 to 0x8944; S 0x16FE4), the
  same flag that turns the sky's lines black (0x85F8 to 0x864A); which cloud band a course shows after its tunnels is
  so a matter of the run, read here as the records give it. Section 15, which every path ends with, holds a change
  record whose horizon picture shows.
- The sky's rows follow the road's first line with a lag of a few lines a frame (0x76B6 to 0x7732), and sink in the
  final section by up to 63 lines (0x7936 to 0x7982); where the road's offset is negative the sky's target is read as
  written (0x76B6), unconfirmed by a run.

## Course tables

- S keeps the courses and the walk: a car's record is its position over 0x2000 within its section, kept apart (S
  0x57F6); a section's end, where the index wraps, takes the next by the car's lateral (S 0x5868). M never reads S's
  next sections: it draws ahead by a fixed tree of sections 2s + 1 and 2s + 2 (M 0xAA49A), which differs from S's only
  at stage 4's section 4, whose two branches' sections the ROM holds twice alike, so the drawn road is the driven one.
- The goal sections hold their paths' merges, so they differ by path; S copies the next stage's sections in, one a
  tick, while the camera is in section 15 (S 0x57AE to 0x57E6).
- Before GO the game plays a short run: the car stands 147.4 m in, facing back, drives back 0x120 a tick to 0xB00, turns
  round 8 a tick with a pause, and stands at 0x260 (S 0x7C7E to 0x7D58, 0x7CF2, from S 0x13EE0), lane d by the first
  mask's bit 2 (S 0x5322 to 0x5342); a continue stands it at 0x260 at once (S 0x7B1C).
- The car's limits are its outer lanes' centres ± 0xDE0 (S 0x6354), off the road beyond ± 0x3E0 and half off from
  ± 0x2E0 (S 0x5DFE), a tunnel's walls ± 0x1E0 (S 0x75EE), as CHASE H.Q.'s; the half not taken at a fork slides out to
  0x2800 positions (M 0x5F62).

## Heights

- S keeps a car's height as its record's base, which takes the record before it's grade × 0x100 as the record changes
  (S 0x582C to 0x5836), and the record's grade × 8 × the position's step within it (S 0x5942 to 0x595E), so a height
  rises straight through a record; neither program clamps a grade or blends one into the next.

## The road across

- M draws the road as two halves, each a tile layer holding one side's picture from P outward (the left mirrored), the
  pictures held as lists of tile rows (0xA91E4 to 0xA95A4), each side's picture moved out from P by its mask's missing
  lanes (0x7F80 to 0x803C). Its drawn edges move toward the camera's record's mask by the advance over 32 a frame
  (0x7F4C, 0x8044), twice that while 0x401102 is set, which 0x626A sets each frame only in a goal section; the flag the
  fork's approach sets (0x5A28, 0x5FFE) is cleared again before the edges move (0x7D50 runs after 0x626A).
- The fork pictures (the lists the choices at 0x3FAC and 0x4198 name by each side's lanes) are the steady ones with a
  band of pen 3 at P; the left half's layer is the first chip's (0x3EEE) and the right half's the second chip's
  (0x4122), which is drawn beneath it, so the right half's ground pen beyond P shows wherever the left half is clear:
  in the gap and between the course's half and the road not taken. Of the fork's state S reads the word at 0x40105C
  alone, in its sprite builder (S 0x16604), for the curve table a thing is drawn by.
- S holds a car by its record's lanes' centres at once at each record's start (0x58BA to 0x5964), so that the limits
  change at once where the drawn edges move. A tunnel's walls follow the covered bit, which S sets by the record's
  parameter and the position's half of the record (0x58F2 to 0x5934); its event 4, a structure across the road, sets
  the same bits for the echo but not the walls (0x6334 to 0x634A).
- The surface's and the ground's colors are the camera's record's, each 5-bit channel a step toward it each time its
  entry is written (0x474C, 0x4830); the vblank writes the ground's entries on even frames and the surface's on odd
  ones (0x45F8, 0x4604), so a step takes two frames. A record that changes the sky holds the road's colors until the
  camera passes the next record (0x4816). The sky's color lines are copied whole in one vblank (0x86F4, 0x872A).
- The top speed without the nitro is the gear table's 0x1F3 flat out in high gear (S 0x5D1A, the table from S 0x9B26),
  1/128 less on level road (S 0x5D98), the speed settling a unit below its target (S 0x5EB2 to 0x5EF6): 494, 320 km/h.
  The nitro adds to the target for 210 frames (S 0x5CC4 to 0x5D12).
- M writes one raster word a road line (0x38D6), from the bits 10 and 11 of the camera's position plus the line's
  depth, so that the stripes are fixed to the road; the program fills one half of the raster RAM a frame and flips the
  halves in vblank (0x38B8, 0x112A). What each bit of the word does is the hardware's, which the program does not show;
  MAME's description reads it, and the words (no lines or inner band on a hill, all four bits set in the dark part of
  the flat road's dashes) fit that reading. A pen 8 the program writes with the surface's other shade (0x46CC) is not
  explained by it.

## Things

- S builds the sprite list each frame (0x164EA) into shared RAM, a thing's head before its parts, the things sorted
  nearest first (0x15202); M copies it to the sprites in vblank (0x113C, 0x1AB6). Which of two overlapping sprites the
  hardware shows is not shown by the programs; the nearest-first order reads as the first entry over the later, as
  CHASE H.Q.'s Z system was found to draw.
- A descriptor's load record replaces big sprites in the sprite map as its thing is spawned (S 0x6CA4 queues its pairs,
  M 0x91F4 decodes one a frame), so that a descriptor's picture is the map at the start overlaid with its own record.
  A piece without a record (the gate posts' lamp, big sprite 0x29) shows what was loaded last.
- A thing whose head's byte 6 bit 7 is set draws the next descriptor where it stands left of P, its left variant
  (S 0x16634 to 0x1664A).
- A flat thing's left variant whose pieces start a piece from its head holds an anchor of a piece's width, which the
  builder takes by the thing's zoom (S 0x16786): its pieces begin a piece beyond its lateral at every distance. Water's
  two laterals differ by a lane, near that piece.
- A thing that only bumps a car sets bit 5 of the car's byte 5 (S 0x7AF2), as a tunnel's wall does (S 0x7604, 0x7620).
  The bit is tested at S 0x146AC and 0x14702, where the words written to the board's outputs are made, and no other
  test of it was found; what they drive is not read.
