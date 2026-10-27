# OUTRUN research notes

Research behind [OUTRUN road data](../outrun-road-data.md) that the specification does not hold: the main CPU's routines
and RAM, the tick, how the scale was found and checked, the other sets, and what is still open. Not a specification: the
tables, formats, conversion rules and decisions are that document's. Addresses are MAME `outrun` (Out Run,
sitdown/upright, Rev B; no encryption), M the main CPU, S the sub CPU; RAM is named as the main CPU sees it. L(a) and
W(a) are the long and the word at a.

## Sets

- The parent set `outrun` (Rev B) is the reference; every ROM of K's zip matches MAME's list.
- Clones not read: `outrunra` (Rev A); `outrundx` (deluxe sitdown: its own main and sub programs, EPROM sprites);
  `outrundxa` (deluxe, earlier: 32 KiB program ROMs, a different program); `outrundxj` (Japan deluxe, main CPU FD1089A
  317-0019); `outrunb` (bootleg); four Enhanced Edition hacks.
- MAME notes the Japanese deluxe set's course order as different, and a published comparison says the deluxe sitdown
  model has all courses in a different order. `outrundx` and `outrundxa` are not encrypted, so their order can be read
  when K has their zips; `outrundx` and `outrundxj` share a sub CPU program.

## Tick and speed

- The main loop (M 0x7BD4) waits at M 0x7DDA until $60800 is negative and sets it to 1; the frame interrupt (level 4,
  M 0x7CBA) decrements it each frame. A tick is two frames, 1/30 s. A tick that overruns two frames is counted in $60BA4
  and not made up.
- The speed word $260068 is the displayed km/h. The road position is the long $260006, 16.16.
- Slot 0's advance (M 0xB9B2 → 0xBF68 → 0x6288 → … → 0x6470 → 0x6ABA) adds L(0xE2EC) = 0x12F × speed to the position. On
  a curve it scales the advance by (R ± x / 40) / R (M 0x6ACC–0x6AEE): + for a left curve (kind 3), − for a right one.
- A position is 65536 / (3.6 × 30 × 303) = 2.0027 m. Checked against K's video `k1`: the speed integrated from GO meets
  the hill events within ±3 positions up to about position 600 (under 1 % error).

## Phase and approach

- M 0xBD3E adds speed / 64 to the phase word $26053C (also written to $26053A), its remainder in $60B96, shared by every
  caller. Its callers are the frame interrupt (M 0x7D26, while the test flag $60050 is 0) and slot 0 (M 0xB9D8): three
  adds a tick. No other code writes the phase; the sub CPU only reads it.
- M 0xB9DC–0xBA02, after the third add: col = min(15, phase − last tick's phase) to $260540, col << 11 to $260548. At
  293 km/h col is 13 or 14 (mean 13.73).
- Every scenery routine (M 0x40A0, 0x4144, 0x428A, 0x4386, 0x4486, 0x46D6, 0x4774, 0x4884, 0x4982) adds L(0x28000 + (col
  << 11) + 4 × int z) to its depth z (16.16 at +0x24): the table is col × int z × 0x400. Drawing 2, the clouds
  (M 0x4144), adds half.
- An object with int z < 4 is not drawn; at int z ≥ 0x200 it is removed (M 0x4648; drawings 4 and 5 at M 0x481A).
- The hit routines (M 0x4054, 0x3FF4, 0x4450, 0x4662, 0x4832, 0x4936) test before moving, at depth ≥ 0x1B0. At 293 km/h
  every object crosses 0x1B0–0x200 in one tick, so it is tested on the tick it is removed.
- Counting the phase once a tick puts objects about 87 positions too far: the goal gate stands past the car's stop, 79
  slots cannot hold the original's scenery, and `k1`'s start gate timing disagrees. Three adds a tick fit all three.

## Slots and the tick's order

- The main loop runs W(0xF000) = 125 slots from slot 0 each tick; their templates are L(0xF002 + 4n), copied by
  M 0x7E1C.
- Slot 0 (M 0xB15E) runs, in order: its state; M 0xB85A, which runs the stretch state (M 0x868E), reads the width,
  height and curve points at the position before the advance, advances, adds the third phase and sets col.
- Slot 1 (M 0x74E2) is steering. Slot 2 is the scenery control (M 0x3B48 at the game's start, then M 0x3BEE). Slots 3–81
  (W(0xF202) = 3, count W(0xF204) = 79) are scenery; traffic follows.
- So within a tick: the stretch boundary, the advance, col, the control's spawns, then every object moves once (one
  spawned this tick too).

## Scenery control (M 0x3BEE)

- A point is taken when its position ≤ int(position), at most one a tick, replacing the one running (M 0x3C04–0x3C42):
  cursor = its position, remaining = its count, pattern = its type's frequency word, entry 0.
- While remaining > 0 and cursor ≤ int(position), the pattern turns left twice: the first carry spawns an entry at z
  0x10400, the second at 0x10000, entries taken from the last back; then cursor += 1 (M 0x3CAC). Above 216.3 km/h (one
  position a tick) the cursor lags and turns every tick.
- A spawn (M 0x3CB2) takes the first free of slots 3–81; with none free the entry is lost (its count is spent).
- Only $60C28 bit 0 resets the control; M 0xB676 sets it in slot 0's post-race state 17.
- The start's 69 objects (M 0x3B48): records from 0x2B70, their count less one the word at 0x2B6E (68), into slots 3–71,
  depth = the record's word × 0x10000.

## Stretches

- M 0x868E runs before the advance. Where the integer position passes 1948 (`cmpi.w #$79C` at M 0x870A), it clears the
  whole long $260006 (M 0x87A0; the goal's at M 0x8A0C) and loads the next stretch's tables (M 0x87AC–0x87BE,
  M 0x8A32–0x8A48). At a fork's end (M 0x89A2–0x89B6) it does the same the tick after the width reaches 212.
- The scenery control keeps its state across, so the rest of the point it was running is dropped (rows 1–4 spend theirs
  before 1948; row 5 stages do not).
- The road control word $260306: 5 at a fork stretch's start (two roads, road 1 drawn with its curvature negated), 7 or
  8 once w > 0x300 (the taken road alone), 3 at 362 (two roads, not negated); so the right road is drawn as a mirror.
  M 0x8A04 also sets 5 at the goal stretch.

## Checkpoints and the goal

- Drawing 6 (the checkpoint banner's left half, M 0x4774) sets $60B62 = −1 (M 0x4812) as it is removed; the time
  extension is given at the next tick's start (M 0x8FAC / 0x8FC2), before the advance.
- The car brakes from goal position 355 and stops at 401 (M 0xA15E–0xA1EA).
- The horizon row is RAM $260510; the main CPU only reads it, setting the tiles' vertical scroll from 0x100 less it
  (M 0xD7DC). On a level road the road's top is line 151.

## Hills (for the hills stage)

- Height points start height tables (S 0x220A); the original draws its hills as shapes on its screen (line slopes), not
  as a 3D profile. Original road data's Hills and Profile own today's rule.
- Kinds 1 and 2 rise, their share run to 254 over step (S 0x1D6C), hold, and return as they rise, their state alike
  (S 0x1D04 to 0x1D46); the share count gains 12 × the phase word's gain each tick (S 0x1C48), and the hold's wait falls
  each tick by int(12 × that gain / step) (S 0x1D2E), so a slower car holds longer. Each adds an entry × the share >> 4
  (S 0x1F9C to 0x1FAA), entry 0 while it rises and entry 1 from then on: kind 1 to every segment's increment
  (S 0x1FEA), kind 2 to segment 0's slope alone (S 0x1FB4 to 0x1FBE). COCONUT BEACH's table 32 (position 1600, kind 1)
  was the check against `k1`.
- Kind 3 slides its first six of thirteen entries in as kind 0 does (S 0x1FE0), dividing its progress by 4 (S 0x1DCE),
  the segments moving with the share passed (S 0x1E0A, S 0x1F22); holds every segment's increment at its entry 6; and
  returns it at its entry 12, its pointer moved on six (S 0x1E46).
- Every segment's slope is held at 0x10000, one row a line, before the next increment is added (S 0x2044), but by kind
  4's lines (S 0x219E).
- The sway: the window's lines can take a sway by $740's mode (S 0x2060): 3 lowers each line by $73E, falling to
  nothing over the 512 lines (S 0x20F6 to 0x2138), 4 every line by $73E (S 0x213C to 0x2168), 1 and 2 only mark
  each segment's middle line in the list at $1400 (S 0x2098 to 0x20F2); $73E is half the sine at 0x108EE (negated in
  mode 2) as $74A gains $7A8 a tick to 0x80 (S 0x1B4E to 0x1B9E). Nothing sets it: the sub program only clears $740
  (S 0x1B42, 0x1B66), and neither program holds another access to $740 or $7A8 (the main's $260740 and $2607A8 and
  their mirrors, by any addressing or as data). The sway never runs, so it is neither the road's shape nor a driving
  effect, and it does not explain table 32's 9 rows from `k1`'s top. Nor does the speed: the rule's top is 172.1 at
  every speed from 100 to 293 km/h (`outrun-hills --kmh`).
- Kinds 0 to 3 were checked by running the sub program's procedure tick by tick against these windows (research, not in
  the repository): within 0.56 rows of a line's row; kind 4 is not yet.
- The conversion's grades are the screen's shapes read back through this game's camera (the specification's [profile
  from the original's screen](../original-road-data.md#profile-from-the-originals-screen)).

## How it was checked

- The tables were read from the programs as Original road data describes; the routines above were read in the main
  program (not encrypted) and simulated tick by tick (research scripts, not in the repository).
- K's video `k1` (COCONUT BEACH) calibrated the length and the hills and checked the start gate's timing.

## Camera (eye height)

- Level road, as the sub CPU lays it (`move.l #$240,$732(a5)` at sub 0x1B3A; the row generator at sub 0x1F00, the line
  list at 0x1318, the copy to road RAM at 0x155E): 512 lines, line n at 0.140625 × (512 − n) rows above scanline 223.
  The road chip draws scanline 223 from road ROM row 255 at one pixel a road unit, and a row's road is proportional to
  its index (opr-10185: the outer edge at 0.98013 r + 0.04 px). The level road is a pinhole: the horizon at scanline
  151.1, the eye **71.8 road units** above the road (rows counted as pixels), the same over scanlines 157–223. That is
  1.83 m at 0.0254717 m a unit, **1.96 m** with rows 15/14 of a column (the 320 × 224 screen shown at 4:3), the figure
  to compare, as pictures' heights take 15/14.
- The car: the Testarossa's picture (88 × 40, 77 px wide where opaque) stands 1:1 on scanline 223 (footage, level road):
  1.96 m wide and 1.09 m tall at the road's scale (the real car 1.976 m and 1.13 m). The eye is 1.80 times the body's
  height, 0.87 m above the roof line.
- Along the road the original is not a perspective: by the stripe tables (TURBO OUTRUN's, identical) line k lies
  ln(521.3 / (521.3 − k)) / 0.1412 positions ahead (Original road data's [Hills](../original-road-data.md#hills), A
  line's distance), so the camera has no single distance behind the car. Near the car the road foreshortens
  as a pinhole about 6.9 positions (13.9 m) behind the car's rear, looking 8° down, a horizontal field of about 33°.
  This game's camera: 6 m behind and 2 m above the player, 67°.

## Formulas behind the tool's written values

The values the OUTRUN tool writes, each with the instructions that hold it (for EX-21, which reads them; the tool is the
mainline's), the tool's file and name, and what reading it changes.

- **Read or checked already:** the advance L(0xE2EC) = 0x12F (`readClock`), the stage length 1948 by its instruction
  (`cmpi.w #$79C` at M 0x870A, `STAGE_LENGTH_OPCODE`), the road's picture by the road ROM's nearest line
  (`checkRoadRom`). No change.
- **The start's width:** `START_WIDTH` 0x1C2 (`outrun-cross-section.ts`): `move.w #$1C2, $260314` at M 0x8402 and
  0xB4E4. No change.
- **The scenery's slots:** `SLOTS` 79 (`outrun-scenery.ts`, `outrun-ticks.ts`): the word at 0xF204, 0x4F (read at
  M 0x3CC2). No change; it can be read.
- **The roads apart:** `RIGHT_FROM_LEFT_WIDTH` 280 (`outrun-scenery.ts`, `outrun-ticks.ts`): the word at 0xE308, 0x118
  (`cmp.w $E308.l, d0` at M 0x3D7A), as TURBO OUTRUN's tool reads its own at 0x1DE04. No change; it can be read.
- **The objects' depths:** `APPEARS` 0x10400 and 0x10000 (M 0x3C76, 0x3CA2), `PASSES` 0x200 (M 0x4648) and
  `HALF_RATE_DRAWING` 2 (the clouds, M 0x4144) (`outrun-scenery.ts`, `outrun-ticks.ts`). No change.
- **The top speed:** `TOP_KMH` 293 (`outrun-commands.ts`), the speed the hills' holds are counted at, so it moves the
  canon. The program gives it: the throttle is (its input held to 0x30–0x90, less 0x30) × 256 / 0x61, at most 253
  (M 0x757C to 0x75AC), averaged over four ticks into $260788 (M 0x6524 to 0x65CC); the revs (the long $260782) rise
  by the table at 0x30C80 by the revs × the gear's ratio² >> 12, doubled from the race's start ($60BA2 = 1, M 0x61F2;
  M 0x679C to 0x67E2) while the throttle << 16 is above them and fall by 0x440 × the ratio >> 4 while it is below
  (M 0x67E4, M 0x63B2 to 0x63C4); the high gear's ratio steps to the table's 0x66C (0x6C4E + 2 × 31, M 0x69E2 to
  0x6A0E); the speed is ⌊⌊revs⌋ × 0x1A90 / 256⌋ × 4096 / the ratio × 0x480 / 65536, held to L(0xE2E4) = 294
  (M 0x6904 to 0x6946), stepping at most 2 a tick (M 0x6400 to 0x646A); the speedometer shows the word as it is
  (M 0xBA24, 0x7126). Run tick by tick at full throttle in the high gear (research only), the revs settle about 252
  and the speed at exactly 293: the cap 294 is not reached. No change.
- **The backgrounds:** the program is TURBO OUTRUN's: the long $60F0E brought an eighth of the way to the heading
  $26000A a tick (M 0xDAE8 to 0xDB24), the front's scroll F = −h in play, the back's ⌊3 (F & 0x7FF) / 4⌋, no offset
  added (M 0xDB26 to 0xDB82), the pages chosen from 0x17E4C and 0x17E5C (TURBO OUTRUN's 0x2ABC0 and 0x2ABD0 hold the
  same words) and copied into the tile RAM in the same order (M 0xDCF2, TURBO OUTRUN's M 0x1D2B0). Both tools lay the
  pages alike, the last leftmost (here `layerWord`'s page = pages − 1 − ⌊x / 512⌋, there `PAGE_ORDER` [3, 2, 1, 0] and
  [2, 1, 0]), and both are the hardware's: measured on the ROMs, every seam of OUTRUN's 15 stages and TURBO OUTRUN's 16
  is smoother so than reversed (the auditor, 2026-10-28). What differs is how each sky is set: OUTRUN's by its
  picture's x 160 at the middle at GO, `overlap` 0 (`outrun-backgrounds.ts`); TURBO OUTRUN's by K's reading, the
  front's 1888 and the back's 1376 at the middle at scroll 0, −40. SUPER HANG-ON's reading, 1880 and 1370, is the
  same once its scroll's +8 (the back's +6) is taken back: one display offset, where a larger scroll moves a layer's
  picture right. OUTRUN's scroll is the same F = −h, so its sky takes that one offset (EX-21).
- **The goal:** the camera stops at the goal stretch's 401 (M 0xA15E to 0xA1EA, braking from 355); its figures stand
  before it and its last objects at about 413 to 419; the road there is drawn from the path's next 64 entries (two a
  step, 32 steps, S 0x15B0 to 0x1698), to about 465. Each of the sub CPU's paths is preceded by a word, its length in
  bytes, which the programs do not read: the goal stretch's (S 0x3ACA0, its word at 0x3AC9E) 2496, 624 entries, the
  tool's `GOAL_PATH_POSITIONS` 624 (`outrun-road.ts`); the fork stretch's (S 0x3A33E) 2368, 592 entries, where the tool
  reads `FORK_PATH_POSITIONS` 600 (8 more, straight, up to the goal stretch's word); the stages' 2276 to 2316 entries,
  where the tool reads 2308 (`STAGE_PATH_POSITIONS`) for each, enough for the stage's 1948 and its 64 ahead. Reading
  the words changes the fork's to 592 (a fork piece uses 63 to 431.5) and no course.
- **The conversion's choices:** `GOAL_CENTRE` 1946 (`outrun-pieces.ts`, where a last stage entered from the left turns
  its centre lane back) and the unit, K's 3.6 m lane over the road ROM's 424/3 units (`UNIT_METRES`, `pixel-grid.ts`).

## Open

- The deluxe sets' course order and any table differences (needs K's `outrundx` / `outrundxa` zips).
- CLOUDY MOUNTAIN's one object without a slot (type 34 at 1063) is the only spawn the slots drop at the top speed.
