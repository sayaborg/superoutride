# ENDURO RACER research notes

Research behind [ENDURO RACER road data](../enduro-racer-road-data.md) that the specification does not hold: the board's
map, RAM and routines, the road and object projection laws, the hills and jumps for the hills stage, how the stripe
phase was confirmed, and what is open. Not a specification: the tables, formats, conversion rules and decisions are that
document's. Addresses are the YM2203 set's decrypted program as `endurobl` holds it (Rev A's tables lie 0x1A lower in
0x00000–0x0FFFF), M the main CPU, S the sub CPU (Rev A's). Facts about the encrypted sets were found by research
decryption, not in the repository.

## Sets

- K's `enduror.zip` is MAME's parent from an older MAME: four ROMs carry older names (`epr-7654.1c8`, `epr-7680.rom`,
  `epr-7681.rom`, `epr-7682.rom`) and its key file is an older one. The ROMs' contents match; the tool reads by CRC and
  reads no key.
- `endurobl` (bootleg set 1): the YM2203 program decrypted. Its 7.13j / 4.13h ROMs hold 0x00000–0x0FFFF's instructions
  in their first halves and data in their second; the 0x10000–0x2FFFF ROMs hold both. `endurob2` (bootleg set 2) has bad
  program dumps and is not used.
- The bootleg's data equal the decrypted YM2203 set's but for its credit text, the ROM test and the check words;
  0x10000–0x2FFFF is the same in every set.

## Board (Space Harrier hardware)

- Main: ROM 0–0x3FFFF, work RAM 0x40000–0x43FFF, tiles 0x100000, text 0x108000, palette 0x110000, shared RAM
  0x124000–0x127FFF (the sub CPU's 0x7C000–0x7FFFF; the sub CPU's a5 = 0x7E000 is the main CPU's 0x126000), sprites
  0x130000, I/O 0x140000, road RAM 0xC68000.
- Sub: ROM 0–0x3FFFF, road RAM 0x68000, shared RAM 0x7C000. Its interrupt 4 comes from the main CPU's PPI port A bit 6
  (low asserts), its reset from bit 5. The main CPU's interrupt 4 is the frame (60 Hz).
- Inputs: service bit 0 the coin, bit 6 start (low active); ADC 0 the throttle, ADC 3 the steering (0x80 centre).

## Position and speed

- The position P is the upper word of the long 0x126188 (16.16); 0x126184 = P << 8 | fraction. The speed 0x12618C is the
  displayed km/h, binary (at most 199; 0xC5 = 197 seen at full throttle in the harness). Each frame P += speed / 256
  (plus a wheelie boost from bits of 0x40071).
- Stage s (0–4) = P >> 11; a stage ends when (0x126184 + 0xC0) >> 16 reaches the table 0x53AC {8, 0x10, …}. The stage
  counter is 0x4040E (5 = the ending).

## Projection

- The sub CPU's camera heading is the normalised (e[P] + e[P + 1]); the road is integrated two entries a step over 32
  steps; screen x = 256 × X′ / (Y′ + 8.125).
- Objects: x px = 4.2456 × x / (d + 4.19), d positions from the bike (the specification's law; the distance table
  S 0x8C5B, d3 = 17160 / (i + 132) − 3, first fitted as 4.19 x / (d + 4.125)).
- So the original's world is not isotropic: the lateral units a position are about 31 at the camera, 45 at 8 positions
  and 48 at 16–32. The conversion takes K's rule (the bike's picture as tall as VFR750R's 1.65 m: a 3.5 m lane, a unit
  0.0183947 m); the alternatives were 60.30 units a position (0.019655 m) and about 46 (0.02577 m, the bike 2.32 m
  tall).
- The hardware draws rows 0 to h − 2 of a size: the game writes the address one row early and the bottom as top + h − 1
  (M 0x2522). The player's bike is 82 rows.

## Objects

- Collision only for objects with flag 0x08 spawned on the road (|x| ≤ 30); the rider's x (the upper word of the long at
  $32(a5)) is clamped to ±0x200 (M 0x65FE and 0x6612), the limit the ground's width reads. Anchor
  bit 4 is the bottom. Pen 10 is the shadow. Later sprites draw over earlier (shadows are listed before bikes).
- The START posts (templates 0xCA78 / 0xCA9E) carry flag 0x88 (the hit mark). CHECK banners stand at P 2048k + 4; the
  goal gate at P 10254.
- Jumps and ramps are sprites across the road (stage 1 about P 517).

## Hills and jumps (for the hills stage)

- The main CPU sends 16 slope words to the sub CPU at 0x126198 from the table 0xDAE4 (indexed by P & 0xFF, four words
  summed), gated by the hills' table at 0xDE9C (8-byte entries; the hills' routine from 0xDDA4); stage 3's words at
  0xDD84 are 16 of 0x200, not a routine. The specification's [ENDURO RACER's
  screen](../enduro-racer-road-data.md#enduro-racers-screen) owns the rule.
- The jump mounds' table 0xC8AE (the specification's format: a count word, 0xD8 = 216 halves, then 6-byte entries
  {position, left, right, kind, spare} to the first position 0xFFFF: 69).
- The main CPU's blocks 0x28000, 0x2A000, 0x2C000, 0x2E000 (profiles A and B, flags 0x00 / 0x80, sparse ids, pairs) are
  not read in stage 1 or 2 play; their purpose is unknown.
- Today the road is level but for the crossings' bumps; the grades, jumps and the 5 jump mounds on another passage's
  road wait for the hills stage, as the specification records.

## Stripe phase (how it was confirmed)

- In the research harness the bike was held still and the road position (M 0x126188, 0x126184) set from 0 to 3.9375 in
  1/16 steps; at each step the road layer's nearest line's band and the band borders were read.
- The nearest line is band B for P 0–1.875 and band A for 1.9375–3.875; the first border reaches it at 1.875. So band B
  covers [0, 2) + 4k and A [2, 4) + 4k, borders at even positions, the nearest line about 0.1 position ahead of P.
- Frames while moving disagree by about 1.6 positions only because the shared position runs ahead of the drawn road;
  they cannot judge the phase.

## Camera (eye height)

- The sub (0x6E6–0x804) lays the road from screen line 64 (main 0x126192) in 16 segments whose heights come from the 16
  slope words at main 0x126198. Level (all 0x200), the road ROM line at screen line y is 1 + 128 (y − 64) / 165, and
  epr-7633's surface half-width is 1.5 L + 7.25 px. With the surface's half at 190.27 units the lateral scale is
  (y − 56.5) / 163.5 px a unit: a pinhole, the eye **163.5 units** above a level road at every line: 3.01 m at 0.0183947
  m a unit, **3.22 m** with rows 15/14 of a column. The eye is 1.95 times the bike's upright picture (84.0 units).
- The bike's base is screen line 202; the road there is about 4.7 positions (5.6 m) from the eye, and by the objects'
  law the bike, drawn 1:1 there, is about 4.3 positions (5.1 m) away. With the adopted scales the original is near
  isotropic (a position 1.124 m across, 1.185 m along): a focal length of 270 px, a horizontal field of 61°, the view
  pitched about 12° down.

## Formulas behind the tool's written values

The values the ENDURO RACER tool writes, each with the instructions or tables that hold it (for EX-17, which reads
them; the tool is the mainline's), the tool's file and name, and what reading it changes. M addresses are the
instructions' image (`endurobl`'s first halves).

- **The displayed speed and the top speed:** the speed word $12618C = ⌊⌊$36 / 16⌋ × 16 × 0x326 / 65536⌋ (M 0x6C86 to
  0x6C9A), $36 held at 0x3F80 (M 0x6C36, 0x6C40): 199. The tool's `TOP_KMH` 199 (`enduro-racer-commands.ts`). No change.
- **A position's metres:** each tick the 16.16 position gains the speed word × 256 (M 0x608C, 0x608E), the speed word
  the display's km/h: `POSITION_METRES` = 65536 / (3.6 × 60 × 256) = 1.185185 m (`enduro-racer-course.ts`; `TICKS` 60,
  the frame interrupt). No change.
- **The stripes:** bands B and A by turns every 2 positions from position 0 (the sub CPU's colors swapped on the
  position's bit 1). `STRIPE` 2 and `FIRST_BAND` 1 (`enduro-racer-course.ts`). No change.
- **A scenery item's x:** its byte × 8 (`asl.w #3` at M 0xCC4A); types 0x48–0x4E take the word at 0xCC88 + 2(type −
  0x48) (M 0xCC6E to 0xCC7E). `X_UNITS` 8 and `SCALED_X_TYPES` (`enduro-racer-objects.ts`, `enduro-racer-scenery.ts`). No
  change. `ON_ROAD` 30 (|x| ≤ 30 marks an item on the road) is the earlier research's; its instruction is not found
  again here.
- **The hit:** an object within 0x5A units of the bike's x either side (M 0x8400 to 0x8410: x − the bike's x + 0x5A,
  unsigned, below 0xB4). `HIT_WIDTH` 2 × 0x5A (`enduro-racer-course.ts`). No change.
- **The start's gate:** the start's templates' position word, 0x180 (8.8, 0xCA78 + 38k + 0x12): 1.5. `START_GATE` 1.5
  (`enduro-racer-course.ts`) writes what `readStartTemplates` already reads. No change.
- **The goal:** a stage ends when (the long $126184 + 0xC0) >> 16 reaches the word at 0x53AC + 2s (M 0x5312 to 0x5334),
  the bike (0.75 ahead) at 2048(s + 1); after the fifth the game's mode is 3 (M 0x539E), whose routine (M 0x8138 to
  0x8232, from M 0x602A) stops reading the throttle: the road position gains the word $32, 0x5000 at first, each tick
  (M 0x818C to 0x8192) while its high byte falls by 1 (M 0x8196): 81 ticks, 256 × (80 + 79 + … + 0) = 12.656 positions,
  then stands. The bike rides on at 0x64 (M 0x814C, 0x85FA: 100 km/h) and is taken off 0x5000, 80 positions, ahead of
  the road position (M 0x81E0 to 0x81F6), about 92.7 positions past the last stage's end, near 10332. The tool's
  `GOAL_POSITIONS` 450 (`enduro-racer-course.ts`) is chosen: the original's camera stops about 12.7 positions past
  10239.25, its bike leaves about 10332 and its last scenery stands at 10342, so a straight of about 100 holds all it
  shows (the road drawn beyond is the screen's depth).
- **The backgrounds' scroll:** the sub program writes the camera's heading H to $1261BC (S 0x0A90 to 0x0AEC: the
  camera's direction and the next two road path entries summed, 0x800 a turn, 256 × the smaller part over the larger in
  each eighth). Each tick the main program takes the heading's change (one of 100 or more as a wrap, ± 0x800) and moves
  the front layer's scroll by a quarter of the change and of what is left from before, the back's the same by three
  quarters of it (M 0xCF1C to 0xCFF8; the front wrapping at 0x800, the back at 0x600); both start at 0x64 (M 0xD4B0 to
  0xD4C0). So at a stage's start heading both layers stand at 100, the back's scroll 0.75 × the front's + 25. The
  tool's `BACK_AT_HEADING` 1281.5 (`enduro-racer-course.ts`) and `OVERLAP` −64 (0.75f − 63.625,
  `enduro-racer-backgrounds.ts`) agree with them: where the road vanishes the back's pixel b₀ at the start heading
  (the display's offset, which the program does not hold) gives the back's 0.75f + b₀ / 4 under the front's f, to a
  multiple of 384 (the front's 2048 against the back's 1536), in either direction of the scroll: 1281.5 / 4 − 384 =
  −63.625. Off that column by x pixels, ± x / 4 more. No change; the lag of a quarter a tick and the tangent are the
  program's, not the tool's.
- **The objects' law and the lines:** `OBJECT_SCALE` 4.2456 and `READING_CAMERA` 4.19 (`enduro-racer-screen.ts`) are
  fitted to the distance table at S 0x8C5B (d3 = 17160 / (i + 132) − 3), and `UNITS_A_LINE` 0.991 × 128
  (`enduro-racer-cross-section.ts`) to the sub CPU's lines (depth number d3 on line 0.991 (d3 + 3) − 3), over the road
  ROM's lines 20 to 128 (`FITTED`): fits to the program's tables, which reading the tables themselves would replace
  (changing the lines' distances and the edges' units by the fits' residuals).
- **A pixel's units:** `PIXEL_UNITS` 128 / 125 (`enduro-racer-boards.ts`): the hardware draws an unscaled picture at
  depth number 0x7F, where a unit is 125 / 128 pixel. The program's. No change.
- **K's decisions:** `LANE` 3.8 m (2026-10-26), `RAMP_BANDS` 9 (2026-10-27) and the materials (`GROUND_MATERIALS`,
  `ROAD_MATERIAL`, `CROSSING_MATERIAL`, `enduro-racer-course.ts`): the ROMs hold no lane in metres, no ramp's bands and
  no material.

## Open

- The grade tables' units, the jumps (heights, airtime) and the mounds on other passages.
- The 0x28000–0x2E000 blocks.
