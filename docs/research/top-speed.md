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
  strip keeps its own fraction of it and moves at most 8 pixels a frame (0x8A6A to 0x8B86).
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
