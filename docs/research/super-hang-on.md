# SUPER HANG-ON research notes

Research behind [SUPER HANG-ON road data](../super-hang-on-road-data.md) that the specification does not hold: routines
and RAM, the hills' format as the sub CPU runs it, checkpoints and extensions, the ending, the other cabinets' sets, and
what is open. Not a specification: the tables, formats, conversion rules and decisions are that document's. Addresses
are MAME `shangon` (Super Hang-On, sitdown/upright, unprotected; no encryption), M the main CPU, S the sub CPU.

## Sets

- The parent `shangon` is the reference; every ROM of K's zip matches MAME's list.
- `shangon3` and the mini ride-on sets `shangon1`, `shangon2` are FD1089B-encrypted; `shangon3d` is a decrypted bootleg
  of `shangon3`. The Hang-On-board conversions `shangonro`, `shangonho` are FD1094; `shangonrb`, `shangonrb2` are
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

## Ending

- Emulated (main CPU, research only): every course's ending stops near goal-stretch position 56.0.
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

The courses' values the tool writes, each with the instructions that hold it (for EX-15, which reads them; the tool is
the mainline's). Where the program's value is the tool's, reading it changes no course.

- **An object's x on its row:** x × row / 224 (`divs.w #$E0` at M 0x7262, x the object's $28, row its $2E). The tool's
  224: `UNITS_A_LINE` (`super-hang-on-cross-section.ts`) and the numerator of `PIXEL_UNITS` (`super-hang-on-boards.ts`).
  No change.
- **A gate's x and lift:** x × row / 191 + 0x160 (`divs.w #$BF` at M 0x74F2) and lift × row / 192 (`divu.w #$C0` at M
  0x7448). The tool's `GATE_X` 224/191 and `GATE_LIFT` 224/192 (`super-hang-on-course.ts`). No change.
- **A picture's pixel:** drawn 1:1 on the nearest row, 191 (scanline 223, the bike's), where a unit is 191 / 224 pixel
  by M 0x7262: `PIXEL_UNITS` = 224/191 (`super-hang-on-boards.ts`), its 191 the rows' last (rows 0–191, the road ROM's
  lines). No change.
- **The top speed:** 0x117 with the turbo (`cmpi.w #$117` and `move.w #$117` at M 0x64A2 and 0x64AC; 0xF1 without, M
  0x64BC), shown as v × 0x117 / 0xF0 km/h (M 0x15DA): 0x117² / 0xF0 = 324.3375 km/h. The tool's `TOP_KMH` 324
  (`super-hang-on-commands.ts`) is only the speed the flights are counted at; no course changes.
- **The goal's straight:** the road path the sub CPU loads at S 0x11B2 (S 0x2C7F4) holds exactly 200 straight entries
  (0, 4096), the next not straight: the tool's `GOAL_PATH_POSITIONS` 200 (`super-hang-on-road.ts`) is that count. No
  change. `GOAL_POSITIONS` 260 (`super-hang-on-courses.ts`) is 60 more, chosen, not the program's: reading 200 makes
  every course's goal 60 positions (140.2 m) shorter.
- **The height points' reading:** at most one a tick, once the position reaches it (M 0x657E to 0x658E), and none from
  position 2000 (`cmpi.w #$7D0, ($260030).l` at M 0x6520 sets $260434, which M 0x6562 tests). The tool reads every point
  (`super-hang-on-road.ts`); no section has one at 2000 or past, and the closest two lie 300 positions apart (a tick is
  at most 0.643), so no change.
- **The advance on a curve:** 0x97 × (R + x / 40) / R a speed unit (M 0x64D0 to 0x6506, `divs.w #$28` at M 0x64F4, x the
  bike's lateral $260022, R the curve's $2600B0) while a curve runs ($2600AC > 1). The road path P is the line x = 0,
  where it is 0x97: the tool's position (2.335835 m) holds there. A driving effect, not a course value.
- **The ending's stop:** the objects run in their slots' order each tick (M 0x1264 to 0x1296): 33 the advance (M 0x62A4),
  34 the bike (M 0x7D04), 37 the ending (M 0xB608; its template M 0xB5CE, copied at the race's start by M 0x8372, holds
  0 in its $2B, which nothing else writes). The first tick that starts at goal position 36 or more (its whole part above
  0x23, M 0x6342), slot 33 ends the race and advances at the speed v it has; slot 34 sets the speed to 0 (M 0x804A) and
  wakes the ending (M 0x803C). The ending lowers $2600EA, 0x1ED0, and its depth $26 with it by 0x40 a tick (M 0xB736),
  61 ticks, to 0xF90; the next tick its $2B falls below 0 at once (M 0xB7A6), so it sets the speed to 0x53 (M 0xB7AC) and
  stands the crowd (slots 12–15, M 0xB7C0 to 0xB7F8) at its depth less 0x60, 0xF30; from the next tick its depth gains
  the speed's depth step, 41 (0xC5EA, M 0xB8DE to 0xB8F0), until the 103rd reaches 0x1FF0 (M 0xB82A) and sets the speed
  to 0 (M 0xB838). So the camera stops 103 advances of 0x97 × 0x53 / 65536 past the race's end: at p + a + 19.6976, a =
  0x97 × v / 65536 the crossing tick's advance and p its start (36 ≤ p < 36 + a), from 55.6976 + a to 55.6976 + 2a:
  56.34 to 56.98 at 0x117, 56.25 to 56.81 at 0xF1. The speed at the line counts for that tick alone. The bike's picture
  ends at depth 0x200F, 31 units (0.14 positions at the step of 0x53) nearer than the camera's passing depth 0x1FF0;
  the crowd stands 0x60 (0.45 positions) beyond the bike. The ending's routine run tick by tick under an emulator
  (research only) takes the same 61, 1 and 103 ticks. The tool's `ENDING_AT` 56.0 and `CROWD_AT` 55.7
  (`super-hang-on-courses.ts`) are K's reading of one run: the program stops 0.25 to 1 position beyond 56.0 at racing
  speeds, and stands the crowd beyond the bike, not 0.3 before it.
- **The backgrounds' scroll:** the sub program writes the road's heading H to $260040 (S 0x1364 to 0x13CC): the angle
  of the road path's four entries from the position's whole part, summed, 0x800 a turn, 0 straight on (0, 4096); within
  each eighth of a turn 256 × the smaller part over the larger (256 tan, not the angle: up to 23 units from it, at
  27.6° from an axis). The background object (M 0x9DC8, slot 39) brings its long $60608 an eighth of the way to H each
  tick (M 0x9DF2 to 0x9E08), and from its whole part h sets the front layer's scroll F = (8 − h) & 0x7FF and the back's
  ⌊3F / 4⌋ (M 0x9DD2 to 0x9DEC), written to the layers at M 0x17CC to 0x1820. The front's pages make 2048 pixels a turn
  (4 pages, M 0x9E90), the back's 1536 (3 pages, the fourth the first again, M 0x9E98). The front's pixel at the
  screen's middle at heading 0, f₀, is the display's offset, not the program's (K's reading 1880). Where a larger scroll
  moves a layer's picture right, the program gives `BACK_MIDDLE` as f₀ − 510 and `OVERLAP` as (f₀ + 8) / 4 − 512 (both
  in `super-hang-on-backgrounds.ts`, beside f₀, `FRONT_MIDDLE`, `OVERLAP` computed from the two), the back band
  starting at the map's pixel 512: with
  1880 exactly K's 1370 and −40 (the other way, 1366 and −44). Off the middle, the screen's column x from it shows the
  back's 0.75f − 40 + x / 4 under the front's f, ±40 pixels at the edges (x = ±160). No change at the middle; the lag of
  an eighth a tick, the four entries and the tangent are the program's, not the tool's.

## Open

- Limited Edition Hang-On's and the mini ride-on's courses (7 new path shapes) are not raised.
