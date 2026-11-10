# CONTINENTAL CIRCUS research notes

Research behind CONTINENTAL CIRCUS's road data that the specification does not hold: the programs' map, routines and
what is open. Not a specification: the tables, formats, conversion rules and decisions are its chapter's and [Original
road data](../original-road-data.md)'s. M is the main 68000's program, S the sub 68000's; addresses are each program's.
Read statically; MAME's description for the hardware alone.

## Sets

- K's `contcirc.zip` matches MAME's `contcirc` (World) by CRC-32. No encryption. M is a pair of 128 KiB ROMs from 0, S
  a pair of 128 KiB ROMs; the TC0100SCN's tiles one 512 KiB ROM.

## The sky

- Both programs address the shared RAM from 0x84000 (M 0x912, S 0x8E6). M writes the TC0100SCN's tilemaps at 0x200000
  (BG0) and 0x208000 (BG1), its line scrolls at 0x20C000 and 0x20C400, its control words at 0x220000, the palette chip
  at 0x100000 (an index, then a color) and the road chip at 0x300000.
- The sky's setup (M 0x7590) runs with the course (0x845A4, 0 to 7 in the order of the names at M 0x46FA) at a race's
  start (M 0x177E) and in attract with −1, where it takes course 0's pictures and draws the upper one again above row 0. It fills BG0's rows 13 to 44 with a tile all of pen 1 in line 0xD1 before drawing BG0's band: under the band BG0
  shows a ground color the road's colors write, seen only over a crest. What the setup's second call (M 0x213A) is for
  is open.
- BG1's x word stays 0 in a race (M 0x4C70); the sub program's scroll task (S 0x25D2) keeps 176 line scrolls for BG1 in
  two buffers it clears at its start (S 0x2630) and BG0's scroll as one long (S 0x28FC), which M copies each frame (M
  0x4D9C, 0x4DAC to 0x4DD0). A frame's rate is 4 × the curve × the frame's step in positions, 16.16 pixels; the step is
  the speed word shifted right 5 (S 0x670C, 0x7B24), so a band turns as far whatever the speed. The task takes a curve
  0x42B positions before its record (S 0x2714 to 0x273C). In attract alone the rate drifts by a constant (S 0x2898).
- Which way a positive curve turns the sky, and whether BG0's scroll is cleared at a race's start (so where the road
  vanishes in the pictures at the start), are open.
- The bands' rows follow the road's height 0x3AB positions ahead less the camera's (M 0x52E6 to 0x531C, S 0x5D00 to
  0x5D48): BG0 rises and falls four times as far as BG1. On level road at the start's height BG0's y word is −29 and
  BG1's d 1; with the chip's offsets as CHASE H.Q.'s notes read them and the road from the TC0150ROD's line 116 (M
  0x4D88; the road's loop from M 0x4E02 not traced), its first line lies on screen line 119, BG1's row 142. In every
  course the lower picture's ground begins near that row.
- The palette task (M 0x6E4A) writes a course's three sky lines once at its start, a line a frame. Each line's pointer
  leads to its colors, its rain colors and, for lines 0 and 1, a lightning flash's. The sub program's weather task (S
  0xD892) never rains in BRAZIL; elsewhere rain begins at a random time once the car goes fast enough (S 0xD970), lasts
  0x708 frames and a random more (S 0xDA70), and fades the lines in 128 frames each way (M 0x6F82, 0x71CA), lightning
  flashing for 5 frames at random while it rains (M 0x7156). What the word the task compares with a course's byte (S
  0xD91A) counts, and whether it rains more than once a race, are open.
- Summed over a lap from the curve records, the clouds' bottom strip turns 262 to 543 pixels in the courses that turn
  once and 44 in JAPAN's figure of eight: no one figure a turn.

## Course streams

- S starts the stream task (S 0xC03C) at a race's start with the course; the attract demo's stream is the long before
  the courses' table (S 0x28770). The task first reads every record whose running position is below 0x7BD4 at once and
  then restarts its sum there (S 0xC06E to 0xC0A8), so the first lap is longer than the loop by 57 (MEXICO) to 17,897
  (MONACO) positions, a straight before the first curve in six courses and a curve in MONACO and MEXICO. The loop skips
  the record it names, the thing every course places at running position 100 in its first lap, and in MONACO and
  MEXICO a curve at 0 of the value its lap ends in.
- Positions are against the road picture's pinhole, the car 0x42B ahead of it: curves, things and zones lie at their
  record's place + 0x7FFF, so a curve takes over where the car reaches its record; a hill starts 0x40B before its
  record's place (M 0x780C) and a pit lane, at a slow car, 0x2FD before (S 0x119CE).
- The road task lays the far lines' centres as cubes of the lines counted from the car's by the curve's value (S 0x2762
  to 0x27A2); its join between two records' curves (S 0x27A4 to 0x280A, S 0x169C6) is not traced.
- Each lap's commands: 17 (FRANCE) to 38 (MONACO) curves, 8 to 42 hills, 1 to 3 pit lanes, 2 to 7 zones, 369 to 737
  things, one finish mark and one finish thing. The car stands 800 positions, 3.70 m, before the line at the start; the
  goal thing lies 800 positions before the line, so the race of one lap ends where the car started.

## Things

- The stream task keeps a slot a thing (0x82D6E on, 32 bytes, its count 0x82D66, the next piece's place 0x82D6A) and
  its pieces in two sprite lists 0x6E0 bytes apart, from 0x822B8 and 0x82998 (S 0xC112 to 0xC19C); the slot task (S
  0x2A1A) drops a slot once it lies within 0x2FD of the pinhole and moves the lists down (S 0x2A3A to 0x2AFA). The slot's +0xC is its
  first piece's place, +0x10 its columns and rows less one, +0x1C its type.
- A piece's 16 bytes are the sprite chip's four words (its y and zoom down, its code, its flags and x, its line and
  zoom across) and, at +0xA, its distance, by which S 0x2490 merges the car's list, two others and the things' into
  the shared buffer nearest first, a piece of code 0 passed. That the hardware draws the first entry over the later is
  read from that order, as CHASE H.Q.'s and TOP SPEED's notes read theirs; no picture of the original was compared.
- The frames alternate between two line buffers' tables and two sprite lists (bit 0 of 0x845A3, 0x845A2's low bits
  picking one of four line buffers, S 0x6A1C), and the road task moves the car's x by ±0x2094 with the frame (S 0x26B0
  to 0x26CC): its two eyes' pictures, as its 3D cabinet shows them, read so and not confirmed. A thing's pieces are
  alike in both lists but the finish's (command 7, S 0xC21A), whose second pairs are read only outside a race.
- The left post of the start gantry hits the car's centre from 96 pixels left of its lateral to 42 right of it, the
  right post the mirror: its pole stands left of its cell's middle. What the gantry's beam, which hits nothing, and the
  hit ranges of things across the road mean beyond their pictures is not traced.
- A thing within 0x87BCC's distance is drawn over the road and one beyond it under the road (bit 15 of the chip's word
  2, S 0x6BC2 to 0x6BC8); what the word 0x87BCC holds is not traced.
