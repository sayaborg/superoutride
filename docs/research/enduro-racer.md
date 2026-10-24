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
  summed), gated by the hills' section table at 0xDE9C (the specification's name; 6-byte entries; handlers
  0xDDF6–0xDE62); stage 3 has a special handler 0xDD84.
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

## Open

- The grade tables' units, the jumps (heights, airtime) and the mounds on other passages.
- The 0x28000–0x2E000 blocks.
