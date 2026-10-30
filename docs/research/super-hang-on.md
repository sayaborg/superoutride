# SUPER HANG-ON research notes

Research behind [SUPER HANG-ON road data](../super-hang-on-road-data.md) that the specification does not hold: routines
and RAM, the hills' format as the sub CPU runs it, checkpoints and extensions, the ending, the other cabinets' sets,
signs, and what is open. Not a specification: the tables, formats, conversion rules and decisions are that document's. Addresses
are MAME `shangon` (Super Hang-On, sitdown/upright, unprotected; no encryption), M the main CPU, S the sub CPU.

## Sets

- The parent `shangon` is the reference; every ROM of K's zip matches MAME's list.
- `shangon3` and the mini ride-on sets `shangon1`, `shangon2` are FD1089B-encrypted; `shangon3d` is a decrypted bootleg
  of `shangon3`. The Hang-On-hardware conversions `shangonro`, `shangonho` are FD1094; `shangonrb`, `shangonrb2` are
  bootlegs. `shangonle` (Limited Edition Hang-On, 1991) has its own main program ROMs (epr-13944, epr-13943) and two new
  sprite ROMs (epr-13945, epr-13946); whether its courses differ is not known.
- Compared by research (decryption where needed, not in the repository): `shangonrb` has the same 24 sections and course
  table, its data 0x99C higher, identical but for sections 8 and 15's centre-line words swapped. The mini ride-on
  (`shangon1`/`2`): 15 section paths identical, 2 reordered, 7 new shapes; its course table is in the encrypted data.

## Programs

- The assembled main program is 0x40000 bytes; 0x30000–0x3FFFF mirrors 0x10000–0x1FFFF.
- Shared RAM: main 0x26xxxx is sub 0x06xxxx.
- RAM: the course $260012, the section's place $260010 (lookup M 0x68C6), the position $260030 (16.16), the speed
  $260078, the turbo bit 5 of $60051 (top speed 0x117 with it, 0xF1 without).
- The clock (M 0x59BA) reloads 60 ticks a second and drives the advance through M 0x59BA → 0x5D72 → 0x6114 → 0x6512; the
  advance (M 0x64D0–0x6512) multiplies the speed by the long at 0x8848 (0x97) and, on curves, by (R + x / 40) / R.
- Goal: past the last section the goal stretch's tables (0x1801A) load; M sets $2600EA = 0x1ED0 and $2600F3 = 0xFF, and
  the sub CPU switches to the goal path S 0x2C7F4. The race ends when $2600EA ≠ 0 and the position passes 0x23: M 0x6334
  sets $2600EC = $2600E2 = −1.

## Hills (for the hills stage)

- Height points are read at M 0x6572 into $26004C, and no longer once the position reaches 2000 ($260434).
- Height table t (1 from) is the long at S 0x1A48 + 4(t − 1): 21 tables of vertical heading vectors {x, y}, about 4096
  long, (0, 4096) level, angles 26°–159° (90° level), ending at (0, 0).
- S 0x1602–0x170C runs them: two vectors a step, 32 steps projected to the road lines' heights (S 0x61400 the result).
- So SUPER HANG-ON's hills are a vertical profile of heading vectors, not OUTRUN's screen shapes. Their vertical scale
  (units a vector step against a position) is not known; the conversion keeps the road level and dumps them.

## Scenery

- Stepping is in object 11's routine (M 0x6AF0 → 0x6BE4 → 0x6D04); its template (M 0x6AB4) holds $2E = 15; templates
  reload at every race start (M 0x8568 → 0x8372).
- The stepping state (point, count, sub-counter, pattern, offset) carries across section changes; the cursor waits for
  the new section's first point.
- Spawn M 0x6F16 into 8 slots (objects 12–19), routine M 0x7118: depth $26 += 0xC5EA[v] (v / 2) a tick; it passes at
  $26 >> 4 ≥ 0x1FF; row $2E = 0xD240[$26 >> 4] >> 4 (0–191, the road ROM's line); screen x = road x(row) + x × row / 224
  (± 4) + 0x160.
- Hit: rows 137–191 (scale 0x109–0x13F) and |screen x − 0x160| ≤ word 0x11BD2 + 2 × sprite add to the crash count
  $260084. An object spawned at position p passes the camera about 37.7 positions later, at any speed.
- Simulated at speed 0xF1 (research script): AFRICA 1012 placed and 166 dropped, ASIA 1609 / 356, AMERICA 2249 / 333,
  EUROPE 2898 / 357.
- Sprite size index = min(0xC8A6[row] + 2, 0x6F) through the zoom table 0xCBA6 {zoom, size offset}; index ≥ 110 draws
  the largest size 1:1. Shadows are pixels of the pictures (pen 10 black in 65 of 74 palettes).

## Checkpoints and extensions

- The gate is objects 27–32 (routine M 0x7394, variants 0–5), brought out at section positions 0 (sections after the
  first) and 0x400 (M 0x6D9C → 0x6E06) and at the race's start (section 0, M 0x6E48, all six with the lights 29).
- Variant 0 decrements $2600E2 as it passes the camera (M 0x746E); the extension routine M 0x569A runs when $2600E2 < 0.
  The race start sets $2600E2 = 1 (M 0x539E), so the start gate extends nothing.
- The time added comes from 0x8888, BCD seconds, [difficulty × 72 + course × 18 + stage − 1]; the stage counter is
  $60438.
- A CHECK gate passes +38.31 positions after it comes out (speed 0xF1).

## Colors between sections

- From position 1930 (M 0x6672) the colors move toward the next section over 64 ticks (about 35 positions). M 0x697E
  blends only the sky's word 0 and the ground; at the end (M 0x18B6) all 40 words (sky 32 and road 8) switch at once.
- In detail: where the section's position $260030 is 0x78A (`cmpi.w #$78A` at M 0x6678), unless the next section
  is the course's end (its byte at 0x8870), M 0x6900 lays pairs of words, the section's and the next's, at $261080 (M
  0x6912 to 0x6960): first the 40 of the color block's first long, then two of each of its next longs. Each tick M
  0x697E mixes 11 of them, the first pair and the 10 from $261120, by a factor that gains 0x80 a tick in $261028 until
  its high byte passes 0x1F (64 ticks; M 0x69BC to 0x69C4), into $26114C, which M 0x186C writes to the palette:
  0x120FA0 (the sky's word 0), 0x120060 to 0x12006E and 0x120F80 to 0x120F82. At the 64th tick $6040C is set (M
  0x69D4) and M 0x18B6 writes all 40 next words to 0x120FA0 at once. A tick is 1/60 s: the blend takes 1.07 s; the
  other 39 words change at its end, about 35 positions on at the top speed.
- The background there: M 0x66F2 to 0x6716 clears both bands of the four pages (0x100000 to 0x103000, `bsr $9D3C`
  each) at once, and from M 0x673C each tick draws one of its eight parts (M 0x9CF4, $6060C counting 0 to 8). The
  race's set-up draws the same eight at once (M 0x9E0E, from M 0x10E2 and 0x120C: M 0x9E6C to 0x9E7E). The old
  background is never shown beside the new.

## Ending

- Emulated (main CPU, research only): every course's ending stops near goal-stretch position 56.0, as the chapter's
  rule gives it (55.6976 and the crossing tick's advance).
- Final frames: ASIA girls 0x13E5A (palette 0x1C) x +19 h +3 and a photographer 0x13EB4 (0x21) x −75 h −2; AMERICA
  0x1395A (0x19) x −113 h +3, a trophy cart 0x1393C (0x19) x −71 h +2, a small item 0x13928 (0x1D) x −14 h +84; EUROPE
  people on the ground 0x13810 (0x1A) x −48 h +2. The ending moves the crowds near the bike.

## Scale, how it was found

- The display shows v × 0x117 / 0xF0 km/h (M 0x15DA): a position is 2.335835 m (Original road data).
- Across, K's rule: the original's upright rear bike frame stands as tall as VFR750R's upright rear picture at a 4.3 m
  lane (unit 0.0180566 m). The road ROM's line 190 gave the feature edges (centre stripe 249–255, lines 40–49 and
  460–469, edge bands 0–31 and 478–507 pixels).

## Camera (eye height)

- Sub 0x1494 sets road ROM row i's line height to (0x61400[i] >> 4) + 8 (191 − i) (0x61400 the hills' projected heights,
  0 when level); sub 0x1524–0x15BA draws row i on scanline 223 − ⌊(191 − i) / 2⌋: row 191 on 223, row 0 on 128 (the
  level road's top), the vanishing line 127.5. A row draws a feature u units out at u × i / 224 px, as objects do (main
  0x7262). So the eye is **112 road units** above a level road at every row (0.47 of a lane): 2.02 m at 0.0180566 m a
  unit, **2.17 m** with rows 15/14 of a column (with a 3.5 m lane, 1.76 m).
- The bike's upright rear picture (0x11C86, 36 × 72 px) stands 1:1 on scanline 223 (template 0x7CC8): 84.4 units, 1.63 m
  with 15/14. The eye is 1.33 times the bike and rider's height, about 0.53 m above the helmet.
- Near the bike the objects' depth table (0xD240) follows a pinhole with the camera about 1.3 positions (3.1 m) behind
  the bike; farther out the table bends away from a pinhole, so the original has no single camera distance.

## Formulas behind the tool's written values

What the tool once wrote and now reads, and what it still writes, for the record; the chapter states each rule.

- **Read (EX-15):** an object's x on its row, x × row / 224, a gate part's x and lift, x × row / 191 and lift × row / 192,
  and so a picture's pixel, 224 / 191 units (`drawScales`); the top speed with the turbo, 0x117, through the display's
  factor, 324.34 km/h, and the depth step a tick, the words at 0xC5EA (`sceneryRules`, `displayKmh`); the goal's
  straight, its road path's straight entries from the first, 200 (`readGoal`).
- **Read (EX-16a, EX-16e):** the ending's stop, and its figures and crowd by their depths on its last tick, 0x200F and
  0x1FAF, as any object (`endingPlaces`); the backgrounds' scroll, F = (8 − h) & 0x7FF and the back's ⌊3F / 4⌋
  (`backgroundScroll`), with the hardware's display offset `LAYER_MIDDLE` 1888 (`out-run-hardware/backgrounds.ts`, K's
  reading, one for the Out Run hardware).
- **The same in the tool, nothing read:** the height points, at most one a tick and none from position 2000 (M 0x657E
  to 0x658E, M 0x6520): no section has one at 2000 or past, and the closest two lie 300 positions apart. The advance on a
  curve, 0x97 × (R + x / 40) / R (M 0x64D0 to 0x6506), is 0x97 on P (x = 0): a driving effect.
- **Written, K's:** the lane, 4.3 m (`LANE`), and the ending's figures, their frames, palettes, x and heights (`ENDING`),
  as the last frame of the original's ending shows them (`super-hang-on-constants.ts`).
- **Research only:** the ending's routine run tick by tick under an emulator takes the chapter's 61, 1 and 103 ticks;
  the heading the sub program writes (S 0x1364) is 256 tan within each eighth of a turn, up to 23 units from the
  angle, and the scroll follows it by an eighth a tick, neither of which the tool makes; off the screen's middle the
  back's 0.75f − 40 is ± x / 4.

## Signs

Many signs carry real brands' logos, for when the product's pictures are drawn again: BRIDGESTONE, CIBIE, elf, NGK, RK,
KEIHIN, RS TAICHI and more; there is no full list.

## Open

- Limited Edition Hang-On's and the mini ride-on's courses (7 new path shapes) are not raised.
