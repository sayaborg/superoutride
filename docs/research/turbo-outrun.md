# TURBO OUTRUN research notes

Research behind [TURBO OUTRUN road data](../turbo-outrun-road-data.md) that the specification does not hold: the main
CPU's routines and RAM, the speed, the stage and leg ends, the goal and ending, the other cabinets' sets, and what is
open. Not a specification: the tables, formats, conversion rules and decisions are that document's. Addresses are MAME
`toutrun` (Turbo Out Run, Out Run upgrade, FD1094 317-0118), M the main CPU, S the sub CPU (not encrypted). The main
CPU's program was read by research decryption, not in the repository; its tables are the ROMs' bytes (the FD1094
decrypts instruction fetches alone), and the repository's tool reads only those. L(a) and W(a) are the long and the word
at a.

## Program

- The code avoids PC-relative addressing (the FD1094 blanks it). Reset: SP 0x68000, PC 0xFCB8. The interrupts: level
  2 → M 0xFF0, level 4 (frame) → M 0x103A, others M 0xF56C.
- The main loop (M 0xFDAA) waits at M 0xFE4E until $60800 < 0 and sets it to 1; the frame interrupt decrements it. A
  tick is two frames, 1/30 s.

## Speed

- $260068 is km/h: the speed code is OUTRUN's (torque table M 0xF528 = OUTRUN's 0x6C4E, torque curve
  M 0x2B962 = OUTRUN's 0x30C80; speed = revs × 0x1A90 / 4096 / torque × K, K = 0x500 + 8b with b the turbo or tune
  bonus, OUTRUN's K 0x480; clamped at 384). The display is a dial, 0–400 (M 0x14390), with no digits.
- Top speeds by the model, without drag: about 217 (low gear), 325 (high; W(0x1DDE2) = 0x144 = 324), 381 with the turbo.
- The advance (M 0xF3CA, from M 0xEBFA) adds L(0x1DDEA) = 0x12F × speed to the position $260006 (16.16), on
  curves × (R + s × x / 40) / R ($60B12 kind, $60B10 R, x = $260050, s = +1 left, −1 right). $260774 is a tyre-slip
  flag: with revs ≤ 255 and |steer| > 0x74 the advance is × 1.25 ($60BF8). The real turbo ($2607B2) raises K and the
  torque, not 0x12F. A position is 2.002689 m, OUTRUN's.
- The phase $26053C gains speed / 64 three times a tick, its remainder in $60B96: twice from the frame interrupt
  (M 0x1594) and once from M 0x15B18 (called at M 0x157AC); col = min(15, its change a tick) at M 0x157B0 into $260540,
  col << 11 into $260548.

## Stages, legs, route

- The route (M 0x1DD96) copies 0x1E018 (10 longs) to $260010 bytes; $260038 indexes it (leg × 8 + i); $260002 is the
  stage within the leg; $60D60 the overall stage (0–15).
- Stage end: M 0x107BC starts it when $60CE8 < 0 (set by the CHECK gate's left post, routine M 0x6002/0x6018, as it
  passes depth 0x180) or, as a fallback, past 1480 (M 0x107C6). States 1–11 follow one a tick ($260310, table M 0x106EE;
  they wait at M 0x106D2 while $26681A bit 3 is set, the palette fade of the attract states, M 0x14EB0, which play
  leaves clear). State 11 (M 0x1083E) sets $60B62 = −1 (the
  checkpoint's time, M 0x10952) and runs M 0x1086A: clears the whole position (the overshoot is lost), $26000A,
  $260002++, $260038++, $60D60++, loads the next block (M 0x10ACA; pointers M 0x10D84/0x10D94/0x10DA4). The sub CPU
  reloads its path when $260002 changes (S 0x11D0). The road width carries over within a leg.
- Simulated trigger positions: 1403.5 (60 km/h), 1404.0 (100), 1406.3 (200), 1409.9 (290), 1411.0 (320). The
  specification times the switch from T, the tick the gate's judging post reaches the car's line: the background at
  T + 11, the next stage at T + 13.
- Leg ends (stages 4, 8, 12, 1-based): M 0x108AC compares $608BC with $60B70 into $60B76 (1–4), $60D60++, mode 0xF; mode
  0x10 (M 0x174FC) stops the car dead about 1481–1484 (emulated stop 1407 with the gate). No goal stretch. The next leg
  (M 0x1034C) clears $260000–$2677FF, $608B2++, $260038 = leg × 8, and reloads (M 0x1055E). Each leg starts with the
  width W(0x1DE14 + 2 × $60D60) = 450; a continue (M 0x1037A) restarts the stage with 220.
- Start: state dispatcher M 0x14D40 (table M 0x14D6C). State A (M 0x150A6) runs M 0x102CC (new game), M 0x1034C (next
  leg) or M 0x1037A (continue), then M 0x1055E (route, block, pointers), sets the time to byte 0x1DE38[leg × 8] (BCD 60
  s for every leg), the leg's music (byte 0x1DE34[leg]: 0x90, 0x92, 0x96, 0x95) and the stage's name (M 0x112C2, records
  0x11578–0x1169A by $60D60). Emulated: GO 140 ticks after state B starts in a new game.
- The stage's name: M 0x112C2 jumps by $60D60 to a call of M 0x16810 with the stage's record, and for WASHINGTON
  (0x1158A) and ST LOUIS (0x115DC) then calls M 0x16800 with the record after it (0x1159C, 0x115EE). A name record is
  {word text RAM offset, byte palette, byte count − 1, the characters}: M 0x16810 writes each letter as two tiles, tile
  0xA0 + 2 (c − 'A') with the palette above and the next tile one row below (+0x80 bytes, 64 tiles a row), and a space
  as tile 0 in both rows. A tile record is {long address, word count − 1, word base, count bytes}: M 0x16800 writes the
  base with each byte as its low byte. Each dot record is {0x00110564 or 0x00110554, 0, 0x8100, 0x2E, a pad byte}: one
  tile 0x812E, the font's dot (tile 0x100 + its code), in the name's lower row, 0x98 and 0x88 bytes past the name's
  offset 0x04CC: columns 12 and 4 counting from the record's first character, the space between D and C in
  `WASHINGTON D C` and the space after ST in `  ST  LOUIS   `. The original shows WASHINGTON D.C (no dot after C) and
  ST. LOUIS; no other record carries a dot.
- Time extension (M 0x1093C, the tick after $60B62 ≠ 0): BCD adds byte 0x1DE38[((~DSW & 0xC0) >> 3) × 5 + $260038] to
  $60861 (at most 99), sound 0xA8, the EXTEND tiles for 0x4B ticks. Normal difficulty adds +30/+38/+36, +34/+36/+36,
  +30/+34/+36, +32/+32/+30 by leg. Continue times 0x1DED8; traffic level $60BD3 from 0x1DF78 (3–7).
- Final goal (stage 16): mode 0x13 (M 0x15320) sets $26005E bit 0, and the sub CPU runs the goal path S 0x3DA74: 624
  entries, straight 0–181, left 90° over 182–311, straight 312–623. M 0x1763A stops the car; the ending scene
  (M 0x17780) shows a sepia picture (tiles from 0x39310, M 0x1D82A), CONGRATULATIONS and the band.

## Scenery

- Controller M 0x5D9E; spawn M 0x5E6A takes the first free of 108 slots (2–109), else the entry is lost; the approach
  M 0x6580. Designed spacing holds up to 216.3 km/h (65536 / 0x12F); faster, the cursor lags one a tick.
- A static simulation drops 28.9 % of the designed objects at 200 km/h, probably too many (the phase per frame against
  the position per tick, and main-loop overruns, were not measured).

## Backgrounds

- Base palettes at a race or leg start (M 0x1E106): palette p = 8 words at 0x22A56 + 16 × byte[0x229DE + p − 8]. Stage
  patches (M 0x1D386, by $260038 and one ahead): byte 0x1DA52 + index → branch 0x1D3B0 + 4 × entry, each copying an
  8-word source into n + 1 palettes (M 0x1D6BC); patches add up within a leg.
- The heading $60D0E (16.16 at $E of $60D00) eases 1/8 of the gap a tick toward the road's direction $26000A (from the
  sub CPU, 0x800 a turn).
- Both layers' vertical position: 0x100 − $260510 − 10; $260510 = 0xE0 − the farthest road height / 16.
- Within a leg the background cuts (page flip) shortly before the road switch (T + 11 against T + 13); the sky ramp
  blends over about 1 s from about 2.3 s after (M 0x15A10 / 0x1758). Leg ends have no transition.
- The colors between stages are OUTRUN's code (its research notes' Colors between stages) with these places. The stage
  end's state 4 (M 0x10832; T + 5, its states running one a tick from T + 2) sets $60BDC bit 0; the background
  routine (M 0x1CDCA) takes it (M 0x1CF00) and in its state 2 sets $60C5B = 1 (M 0x1CF68). The road's 8 words and the ground's 16 move by a 128th of their
  difference a step in a work table at 0x67000, but from the frame interrupt (M 0x108E → 0x1800), one step a frame:
  2 frames to fill, 128 to move, 2.2 s. The sky's 64 words: one color's steps worked out a tick from the main loop
  (M 0x157FA → 0x15A10, 64 ticks, 2.1 s), then a row copied every second frame by the interrupt (M 0x108A → 0x1758,
  31 rows, 1.0 s). A frame is 1/60 s.

## Hills (for the hills stage)

- Height tables are S 0x2156 (225 tables, handler S 0x1B14), OUTRUN's format (kinds 0–4); the stages use 31 of kinds 0,
  1 and 3. A height point is dropped while $260066 ≠ 0 (M 0x15634, the width and height stream).
- The sub program has OUTRUN's sway (S 0x1A8E to 0x1AEA, S 0x1FAC) and the main program (decrypted, read locally)
  holds no access to $260740 or $2607A8: it never runs here either.
- Collision class 2 (M 0x742A) throws the car, not the road: from speed 0x14 it slows the car (× 127/128, 63/64 or
  31/32), sets a shake count ($60CC4, written out to $140003 by M 0x1E688 to 0x1E70A) and gives the car's height above the road ($60BE6) an
  upward speed $60CC0 of speed / 64 + 1. Each tick (M 0x12536 to 0x125FA) the height gains $60CC0, which falls by 1; on
  landing at −4 or faster the car bounces again ($60CC0 = 2, speed × 63/64). The height lifts the player's car picture
  (M 0x1B89C); the road is drawn level, with no dip.

## Paths

- Path turns not in the curve tables: INDIANAPOLIS 882–1377 (−90° R ≈ 47, +181° R ≈ 83 then ≈ 41, −91° R ≈ 48; its curve
  table is LOS ANGELES's, ending at 850); NEW ORLEANS 1150–1379 and DENVER 133–259, 467–593, 699–874, 1159–1379 weave
  ±9°, period about 120 m, about 3 m across. 162 kinks at joins (the largest 9.4°, SAN ANTONIO 1282).
- Centreline self-crossings, all within one stage: PITTSBURGH 648 × 1319; CHICAGO 214 × 693, 884 × 1388; MIAMI
  151 × 902, 324 × 784; DALLAS 424 × 1180; OKLAHOMA CITY 812 × 1393; GRAND CANYON 37 × 340, 452 × 1144. The path's
  tightest local radius, over 8 positions, is 34.5 m at OKLAHOMA CITY about 690 (the plan's sharpest arc, 39.9 m).

## Cabinet sets

- `toutrun`, `toutrunj`, `toutrun3`, `toutrun1`: the same tables at the same addresses; only the FD1094 code and the
  service menu's cabinet strings (0x2250B–0x2254D) differ.
- `toutrun2` (317-0106, the earliest cockpit): tables moved (stages 0x1DEC2, blocks −0x1E2, types 0x39934, draws
  0x27E56, start 0x7A86, names 0x114B4), the time group from DSW bits 4–5, shorter extensions (Normal = `toutrun`'s
  Hardest), WASHINGTON D.C.'s width to 72 at 300 (`toutrun` 144), scenery changes in stages 2 and 7, 24 types with
  falling snow. `toutrun` is the reference.

## Camera (eye height)

- The sub CPU's road code is OUTRUN's byte for byte (the level base `move.l #$240,$732(a5)` at sub 0x1A86; the row
  generator at 0x1E4C, the line list at 0x1264, the copy at 0x14AA: each OUTRUN's address less 0xB4). The horizon is
  scanline 151.0; scanline 223 is drawn from road ROM row 255 at one pixel a unit (epr-12298: the outer edge at 0.97864
  r + 0.31 px). The eye is **71.9 road units** above a level road: 1.83 m at 0.0254717 m a unit, **1.96 m** with rows
  15/14 of a column.
- The F40's body (0x23D6C, 88 × 39, 40 rows drawn) stands 1:1 on scanlines 184–223 (sprite RAM in the harness): 2.0 m
  wide and 1.09 m tall at the road's scale (the real car 1.97 m and 1.124 m). The eye is 1.80 times its height.
- Along the road as OUTRUN's: no single camera distance; near the car about 13.9 m behind, a field of about 33°.

## Formulas behind the tool's written values

What the tool once wrote and now reads, and what it still writes, for the record; the chapter states each rule and its
constants' table their reasons.

- **Read:** the top speed, the advance, the start widths, the object slots and the right-of-left width
  (`readConstants`); the paths' 1496 positions and the gate at scenery point 1358, checked against each stage's tables.
- **Read (EX-19):** the leg's last stage runs to its road path's end, 1496, 93.6 past its gate (`turbo-outrun-layout.ts`;
  the original's car stops dead at T + 2, about 1407, with no goal stretch); the skies face by the scroll, F = −h and
  the back's ⌊3 (F & 0x7FF) / 4⌋, both 0 at heading 0, at the board's middles (`BACKGROUND_SCROLL`, `boardMiddles`,
  with the board's display offset `LAYER_MIDDLE` 1888, K's reading), so −40 and 1376 follow from them.
- **Written, the encrypted program's:** `RIVAL_X`, `END_STEPS` and `STOP`, the routines' anchors and a tick's frames,
  read from the program decrypted locally (`turbo-outrun-constants.ts`, `turbo-outrun-scenery.ts`).
- **Written, K's or the conversion's:** `DIP` where collision class 2 throws the car (the program changes no road:
  Hills, above), `LOOPING_STRIPS`, the strips' sizes by OUTRUN's families, and `FAR_UNITS` and `FAR_EDGE` by the far
  strip's half rate.
- **Research only:** the heading (S 0x1642) is 256 tan within each eighth of a turn and the scroll follows it by an
  eighth a tick, neither of which the tool makes; off the screen's middle the back's 0.75f − 40 is ± x / 4.

## Open

- $608BC's meaning and the 1–4 outcome (which car the girl rides); the STAGE UP! and GOAL! pop-ups ($54 = 1); type 243's
  entry at h −1024; type 162's purpose.
- The sub CPU's road projection was not emulated: research renders of race scenes have no road.
