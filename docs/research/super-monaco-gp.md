# SUPER MONACO GP research notes

Research behind [SUPER MONACO GP road data](../super-monaco-gp-road-data.md) that the specification does not hold: the X
board's map, the tick, the speed and the clock that set the scale, the routines that place, select and draw objects, the
barriers' limits, the backgrounds' routines, the hills for the hills stage, and what is open. Not a specification: the
tables, formats, conversion rules and decisions are that document's. Addresses are MAME `smgp` (World, Rev B, FD1094
317-0126a), M the main CPU, S the sub CPU (not encrypted). The main CPU's program was read by research decryption, not
in the repository; its tables are the ROMs' bytes.

## Board (X board)

- Main: ROM 0–0x7FFFF; RAM bank 1 0x080000 (mirror 0x3F8000, the program's $8000.w–), bank 2 0x0A0000 (mirror 0x3FC000,
  $C000.w–); tile RAM 0x0C0000 (16 pages of 4 KiB); text RAM 0x0D0000; multiplier 0x0E0000, divider 0x0E4000, timer
  0x0E8000; sprite RAM 0x100000, its draw latch 0x110000; palette 0x120000 (0x2000 entries); ADC 0x130000; I/O 0x140000,
  0x150000; the sub CPU's ROM seen at 0x200000, its RAM at 0x280000 and 0x2A0000, its chips from 0x2E0000, road RAM
  0x2EC000, road control 0x2EE000.
- Sub (address mask 0xFFFFF): ROM 0; RAM 0x80000 and 0xA0000 (shared); multiplier 0xE0000 (a6 = 0x2E0000 in its code),
  divider 0xE4000, road RAM 0xEC000. The multiplier's register 2 is (a × b) >> 16.
- The road layer draws solid lines only (bit 0x800): the sky and ground. Every road surface, barrier and object is a
  sprite.

## Tick, speed, clock

- The main loop waits at M 0xAFCC–0xAFE6 while $FE00 ≥ 0 (idle count to $FCDC, about 4000 loops, 25 % slack), then sets
  $FE00 from the frame parity $2A3FCA; the frame interrupt (M 0x7A8A) toggles $FE03 / $2A3FCA and decrements $FE00
  (M 0x7B0A). A tick is two frames: 2 / 59.6374 s (X board 50 MHz / 8, 400 × 262).
- Speed: $F226 = isqrt($F21A² + $F21E²) (M 0x16F72–0x16F92, isqrt M 0x171AA); $FC60 = $F226 >> 3 (M 0x16F98); the
  display shows $FC60 / 10 km/h (M 0xBA9C–0xBABC, digits to text RAM 0xD0D6C); $E044 = $FC60.
- Distance (M 0x16F9C–0x1700C): hs = ($FC60 × $FC96 × 4) >> 16 ($FC96 = cos pitch × 0x4000, $FC94 = sin pitch); the
  velocity (−hs sin h, −$FC60 sin p, hs cos h) × 0x4000 (sine table S 0x20000, 1024 entries) accumulates as 16.16 in
  $FCA8/$FCAC/$FCB0, whole parts in $FCB4/$FCB6/$FCB8 and the sub CPU's camera $2A3FE0. The camera moves $FC60 / 4 units
  a tick: 2.5 × the displayed km/h.
- The lap and race clocks add $FC24 = 0x0349 a tick (BCD ten-thousandths: 0.0349 s; set at M 0xDA08); lap time
  $FC18–$FC1B (M 0xF090 qualifying, M 0xF1B8 race), race total $FC47–. So a unit is 0.0349 × 4 / 36 m = 3.8778 mm and a
  step of 96 units 0.372267 m. The clock runs 4.07 % fast against the frames (by frames: 3.7263 mm, a step 0.357724 m).
  Another BCD counter ($FC03–$FC05, M 0xF4C8) adds the mode byte per tick and is not the lap clock.
- Steps: M 0xE62E–0xE6C4 keeps the vectors to P[k] ($FCC2) and P[k + 1] ($FCC8) and advances when the second is no
  longer longer than the first; $E014 is the step (wrapping at N = $FC9A), $E010 the camera's lateral offset from P[k]
  (M 0xE776–0xE796, negative left). The rivals integrate the same path bytes (M 0x11E2C–0x11F26, 0x180 sub-units a
  step).

## Path against headings

- The path's sums are (0, 0, 0) exactly; T1 sums +1024. The path's direction minus T1 averages +0.32 (qualifying) and
  +0.42 (race) 1024ths of a turn, −1.9 to +3.0. 96 units along T1 do not close: (521, 69) and (−346, 957) units (2.0 and
  3.9 m).

## Grid, laps, limits

- 24 grid slots (M 0xDD36): slot s at path point 12(23 − s), x −256 (even s) or +256 (odd), the pole at step 276. The
  race's counter $FC44 = N + 12 + 12s (M 0xDCDE–0xDCEA), less the steps passed each tick (M 0xE6EC); on underflow + N
  and the lap $FC26 + 1 (M 0xE6F2–0xE708): the timing line is step 288 for every slot. Qualifying sets $FC44 = N
  (M 0xD9BC): its line is step 276, its limit $8004 seconds (BCD 45 on this set).
- Laps: $FC26 starts at 1 + $8009 (a DIP byte); the lap message shows while $FC26 < 3 (M 0xE70C). The race's length (3
  laps by its records) was not traced to its end condition.
- Position checks (table M 0xD8B6, {place, race steps}): 19th by 4700, 15th by 9600, 11th 14444 … failing ends the game.
- Limits (M 0xC414, each frame from M 0xE0E0 into $FC8E) from the band tables; collisions M 0x168B0, off-road friction
  M 0x16544. Harness: a full left lock bounced at −703 to −708 with speed lost. Scenery objects have no collision.
- The start lights board (SEGA ENTERPRISES) is a screen-space sprite (1:1, y 92, palettes 0x3F / 0x40), not a world
  object.

## Objects

- Spawner: S 0x3936 at the start (from 50 steps before 0), S 0x3A42 each step (objects first, then the next heading and
  path step); the active list header S 0x29FE90, the free list S 0x29F840; the per-frame transform S 0x3C5A (kinds 0/4
  S 0x3ED0, 8 S 0x3FB4, 0x0C inline S 0x3CF0); output 16-byte records in sub RAM 1.
- Views (S 0x3DBA, the front path): i = ((T1[k − 1] + C − (x >> 2)) >> 4) & 31, C the object manager's $2C
  (0x2A050C) = −the camera heading (1024ths), x the object's screen x at focal length 512; for i ≥ 16 bit 10 is set
  (mirrored); objects already carrying bit 10 are always mirrored. The rear-view mirror path (S 0x3E02–0x3ECC) is not
  made. Checked in the harness at camera steps 1603, 2252 and 3621: 202 of 204 front objects exact, 2 one off at a
  boundary.
- The main CPU's builder (M 0x87FA, depth buckets at $BFE0) writes 7-word records to bank 1's buffers
  $8800 / $9600 / $A400 / $B200 (table M 0x80B8), which the frame interrupt copies to sprite RAM (M 0x7B4C). It centres
  a picture by half its scaled width (M 0x888C–0x88BA) and anchors it by its bottom or, with bit 13, its middle
  (M 0x88E4–0x88F4).
- The upright kind's transform (S 0x3FB4) is the flat kinds' (S 0x3ED0) but for `subi.w #$a` on the projected scale
  (S 0x4028), after the position is projected and before the size class shifts it: an upright picture (kind 8) is
  drawn smaller than a flat one at the same depth, by 10 / q (q = 0x80000 / (Z + 64)), more the farther it stands. Not
  made.
- Heights: h = −50 stands on the ground (the barriers'). 868 of the race's objects and 446 of the qualifying's have
  their bottom below it: the supports set by their tops (the banners' poles 0x051C at middle 50, the boards' flipped
  pipes 0x143A at −220, the gates' and the overhead's pillars 0x141C and 0x1B9C at middle 455, the crane 0x099C at
  middle 760), the tunnel's portal rocks 0x0D86 and 0x0D68, the buildings, walls and rock by the road at −80, and the
  far upright buildings at −400 and −300. Nothing below the ground shows in the original: the road, the paving and the
  barriers are sprites drawn in front, and the barriers (0.88 m) stand higher than the eye (0.57 m), hiding all the
  ground behind them. Seen in the harness at camera steps 580, 1141, 1181, 4624, 4970, 7215, 8997, 10825 and 12563.
- Sprite palettes: M 0x41EC at power-on; the interrupt's queue (M 0x7BB0, entries at $FA00 {source, destination,
  count − 1, mode 0 / 4 / 8}).
- The rivals' cars: view table M 0x13B52 (64 words), straight rear frame M 0x10E0 (112 × 45 px); their size index
  q / 4 + 8 (M 0x12D5C–0x12E48) enlarges far cars.

## Backgrounds

- Records are written once a race (M 0x838A), chosen by $FC01 through M 0x853C. The scroll interrupt (M 0x7CD0–0x7DCE):
  $FD52 += ((−$FC7C) − $FD52) >> 3 each frame; front position $FD52 >> 5, back 3/4 of it; page selects M 0x80C8 (front)
  and M 0x80D0 (back), the mirror's M 0x80D6 and 0x80DE; vertical scroll (0x43 + $FC78) & 0x1FF; four buffered slots
  ($FD54), shown 4 frames later.
- $FC7A (M 0xE84A) is the camera heading (the 24-step look-ahead, M 0xE7D2–0xE846); $FC7C = 64 × ($FC7A + $FC98)
  (M 0xE94A).
- The vanishing point is sprite x 0x160 (M 0x88B6); the horizon's base y 0x1AC − 0x100 = 172 (M 0x88E6).
- The road layer's line table is built by S 0x3622: entries 0–71 color 0, 72–119 colors 0x01–0x30, 120–135 0x31, then
  the ground 0x32–0x3E in runs (S 0x391C).
- Tunnel (race 8482–10926; M 0x8486 each frame from M 0xDE24, by the position word $18 of object $F140): rows of the
  near layer switch to the alternate tilemap (offsets M 0x8556), dark from 9054 to 10655 (alternate vertical scroll
  0x100, flag $FD56), restored from M 0x8678; the dark color 0x0111 is written by M 0x7D94. The overhead (12641–12771)
  changes no background. It was seen in the harness at camera steps 12563, 12613 and 12748, with the gas eased to 0x40
  from 11380 to 11700 (at full gas the autosteered car hits the barrier at 11582 and the game ends).
- Weather: $FC01 picks set A (fine) or B (overcast); B follows a top-3 finish (M 0xDF5A in the results routine
  M 0xDE40). M 0x15F2C sets other constants by it.

## Hills (for the hills stage)

- The race's path rises and falls: z from −12899 to +2178 units, climb = fall = 16387, the steepest 8-step grade 22.0 %
  (step 12006). The qualifying's −774 to +768, 3.78 % (step 4535). Sum dz = 0.
- $FC78 = −(the look-ahead pitch, 1024ths of a turn, 10-bit signed) (M 0xE86A–0xE8A2). The tilemaps' vertical scroll and
  the road layer move up together by $FC78 lines: S 0x3114 copies line-table entry 28 + $FC78 + i to line 64 + i; the
  byte reaches sub RAM 0x2A3FFB from M 0xE490.
- The conversion is level: the courses do not cross themselves.

## Scale, how it was decided

- Along the road: the clock and the camera's units a tick (above): 0.372267 m a step.
- Across: 1640 units between the barriers are K's 11 m (2026-10-26; at first a Monaco street's 10 m): 6.7073 mm a unit,
  15/14 of it up (7.1864 mm), the scale the specification adopts. Reference values (Monaco 1989, weak sources): lap 3.328 km, width 8–11 m, tunnel about 500
  m, elevation range 42 m, pole 1:22.308, fastest lap 1:25.501.

## Camera (eye height)

- The view is the driver's: the player's car is a 1:1 overlay at the bottom (front tyres and wheel, palettes 0x78–0x7B),
  not a placed object. The sub's transform (S 0x3C5A–0x3E00) projects camera-relative points with q = 0x80000 / (Z + 64)
  both across and up (512 px; Z = forward + the word at $2A3FFC, −150), and the main adds 172 (M 0x88E6): a pinhole with
  the horizon between rows 171 and 172, the eye 86 path units ahead of the camera's path point.
- The eye stands **80 path units** above the path (the spawner's cursor starts at z = 0x50 − Σdz, S 0x39A2; an object's
  z is the cursor's less its height word, S 0x3AB0): 0.54 m at 6.7073 mm, **0.57 m** at 7.1864 mm up; with the cars at F1
  size ((C), 9.4095 mm across, 10.08 mm up) 0.81 m, a real F1 driver's eye. The rivals' wheels stand on the path line,
  their tops (88 units) about 8 units above the eye. The field of view is 52° at the default scale, 35° isotropic.

## Formulas behind the tool's written values

What the tool once wrote and now reads, and what it still writes, for the record; the chapter states each rule and its
constants' table their reasons.

- **Read (EX-23b):** the focal length, 0x80000 / (Z + 64) shifted left by 6 and swapped, 512 rows (`focalLength`).
- **One rule (EX-23a, EX-23c):** a band ends where the limits routine hits plus half a car, the barrier's 700 + 105 =
  805 and the escape's 1228 + 105 (`BARRIER`, `ESCAPE`); the bands' edges are joined by the one monotone cubic.
- **Half a car:** `HALF_CAR` 105 is half the rival car's straight rear view, 105 opaque pixels of its 112 at 2 units a
  pixel (its frame list M 0x10E0, the view table M 0x13B52): the ROMs hold the picture, no number for a car's width.
  The limits routine compares the player's car's centre ($E010) with 700 and 1228 alone (M 0xC414).
- **Written, the encrypted program's, K's or the conversion's:** the chapter's constants' table
  (`super-monaco-gp-constants.ts`, EX-24b), its values each written once (EX-24c): the step's metres by the clock's
  0x0349 a tick (M 0xDA08), the lap's line and the grid (M 0xDD36, 0xDCDE to 0xDCEA), the tunnel's dark sky (M 0x8486),
  the vanishing pixel 354 (M 0x88B6) and so the layers' overlap 354 / 4; the scale, the tunnel's ground and frame, the
  materials, the kerbs and the marks. The ground's −50 is the barriers' height word in the objects' tables, which the
  tool reads (S 0x3AB0).
- **The names:** the main program's text has SUPER MONACO GRAND PRIX (beside SEGA 1989 at 0x19127, beside COURSE
  RECORD at 0x19198), GRAND PRIX (0x15820, beside the laps' settings) and QUALIFYING RESULTS (0xFA22), and no SUPER
  MONACO GP or MONACO QUALIFYING: the courses' names are K's (2026-10-23).
- **Research only:** the clock runs 4.07 % fast against the frames (0.357724 m a step by the frames, 2 / 59.6374 s a
  tick), and the tool takes the clock's; each frame the backgrounds' $FD52 gains an eighth of its way to −$FC7C, 64 ×
  the camera's heading and $FC98 (M 0x7CD0 to 0x7DCE, M 0xE94A), which the tool does not make.

## Open

- The race's end condition (3 laps by its records).
- The rear-view mirror's views, the overcast set, the series.
- The hills.
