# RACING HERO research notes

Research on RACING HERO, kept for [the sprite-road model](../sprite-road-model.md): the X board's map, the tick, the
speed and the clock that set the scale, the routines that read the sections and place and draw objects, the
backgrounds' routines, the camera, the hills for the hills stage, and what is open. Its conversion (RH-1 to RH-5) was
removed by RH-6 (`eb900987`); its chapter, with the tables, formats, conversion rules and decisions, is in the commit
before (`bb4dbfd9`). Addresses are MAME `rachero` (FD1094 317-0144),
M the main CPU, S the sub CPU (not encrypted). The main CPU's program was read by research decryption, not in the
repository; its tables are the ROMs' bytes (the FD1094 encrypts opcode fetches only).

## Set and board

- K's `rachero.zip` is MAME's parent: all 30 ROMs match the current MAME by name, size and CRC. Developed by Aicom,
  published by Sega (the title shows (c) SEGA 1989).
- X board, as SUPER MONACO GP's: main ROM 0–0x7FFFF, RAM banks 0x080000 / 0x0A0000, tiles 0x0C0000, text 0x0D0000,
  sprite RAM 0x100000, palette 0x120000, the sub CPU's RAM seen at 0x280000 / 0x2A0000. The sub's multiplier at 0xE0000
  (no divide instruction in the sub's program). No road ROM: the road layer draws solid lines only (the sky); the road
  surface, its marks, the rails and every object are sprites; the ground below the horizon is a tile layer.
- Inputs (harness): coin 0x40 and start 0x08 of the first port (low active); ADC 0 the handle, 1 the throttle, 2 the
  brake.

## Tick, speed, clock

- The main loop runs every 2 frames (a tick). Each tick the bike's position (a long, positions in its upper part) gains
  the speed; the whole positions gained, u, advance the road's step counter and the reading position (M 0xF46C).
- The speed display: $8DA0 = 16u averaged with the previous value (M 0xE462–0xE476), $8DA0 & 0x7FE indexing the glyph
  table M 0xBB78 (513 longs: 0x0F and three glyph codes; 0xBA blank, 0x7B–0x84 the digits), M 0xAFF6. Every entry is
  within 1 km/h of $8DA0 × 317 / 1024 (1024 → 317, the table's end): 495 of the 513 are its rounding and 18 one more,
  all of them $8DA0 × 317.075 / 1024 rounded. The scale keeps 317 / 1024 (0.024 % off), so km/h = 4.9531u.
- TIME (BCD, $8A48) falls 1.0 every 60 frames. So a position is 4.9531 / 3.6 / 30 = 0.045862 m and a road step (8
  positions) 0.36690 m.

## Sections and the run

- Descriptors at M 0x1793C, 22 bytes each, 32 of them: word id, longs ROAD, PIT, OBJ, traffic, road-surface list.
  M 0xFF6E reads the descriptor of $88F8 at a country's start; M 0xF6B0 moves to the next at a section's end ($8E80, or
  $8E84 by the sub's $2A3F44). The ROAD table's first two longs are the next descriptors; the end piece's are not used:
  the run's next country comes from COURSE SELECT (menus M 0x5D58, next-country table M 0x5C50, pick M 0x5C6C), loaded
  by number.
- A country is two HUD stages: section A (START → CHECK) and B (CHECK → GOAL), then the shared end piece (1120 positions
  of lanes code 3 and 4000 of code 7): the GOAL gantry, the bike stopped at about 830 positions, the bonus, the crowd,
  COURSE SELECT. The HUD counts stages through the run (1–8, four countries). Sections 29 → 30 are the attract course.
- The debug text at M 0xF51C ("ROAD.IDX = …", printed by M 0xF4C0) shows the reader's state ($98A8: ROAD.PNT, PIT.PNT,
  the five indices, CURVE, PIT, ROAD.CNT, OBJ.CNT; $8E68 the five list bases). Debug flags $80B2 (bits: no timer, hit
  skip, messages, simulation), start stage $80B8.
- A country's start reads the road 4096 positions ahead (8 × 512, M 0x100B6) and keeps reading 4096 ahead; objects'
  placement adds +0x1000 back, so an entry at position p stands p positions into its section, and the bike starts at
  A's 0.

## Road

- ROAD entries (6 bytes, M 0xF850, a step M 0xF5D4): length, byte 2 (an event: bit 6 → background M 0x4FCA, else a sound
  code + 0x21; 0 in every table), byte 3 (bits 0–2 the lanes code; bit 6 on every first section's last entry, only
  copied to the sub's record), signed radius. CURVE = ((0x28BE0 / r) + 8) >> 4 (M 0xF76C). The sub (S 0xC00–0xC12):
  slope −= CURVE, xoff += slope a step, xoff / 512 lateral units; a negative radius bends left.
- The sub's step records: 16 bytes a step from $9F710 (the camera's step first): x, the half width w (the lanes code's
  word: 624 code 4, 224 code 3, 0 code 7: the end piece from 1120, where the zero run in the records starts nearer as
  the bike approaches it), the screen row, …, a long that starts at 0x400 at the camera (the eye above the road at that
  step, changed by the PIT slopes), …. $52 (M 0xF81E) is a traffic lane spacing, not the road.
- PIT entries (4 bytes: length, target) make linear ramps (M 0xFAD0, a step M 0xFA9A), carried across sections.
- The player's lateral limit is $A3F1A, from S 0x21F2 by the lanes code (624 code 4, 368 code 3); at the rails the bike
  is pushed back and slowed (bounced at about ±640 in the harness), never thrown.

## Objects

- OBJ (scenery, reader M 0xFC44) and the road-surface list (M 0xFB68) share the 12-byte entry; the traffic list (6-byte
  entries into the vehicle slots at $8E9C, speed table M 0x178BE, class M 0x178DE) is not used by the conversion.
- Pool $C70E (256 × 16 bytes, ring head $2A3F4C): +0 active, +1 flags (the entry's byte 8 & 0x30: bit 5 mirrors), +2
  type, +6 lateral × 4, +8 height, +A distance. Placement M 0x1271C: X = sign(lat) (w + 4 |lat|), w the sub's half width
  at the object's step. Projection (divider dividend 0xFFFE3200 set at M 0x11E62): screen x = 348 − x0 − 115.5
  X / (d + 64), y = y0 − 115.5 h / (d + 64), d the distance plus the tick's speed. Checked: 116/138, 87/114 and 89/115
  pooled objects matched to their emitted records (the rest beyond 3584 positions or off screen).
- Types: M 0x50000 (1024 longs), definitions from 0x51000 (0x51000 itself the blank). Routine word → size class κ (jump
  table M 0x123AA; LOD selector d1 = κ (d + 64), M 0x128FC): LOD0 below d1 0x200 at zoom 2 d1, then halving to LOD5;
  zoom 0x200 is 1:1. Strip boards (routines 0x20, 0x30) are drawn at a fixed horizontal zoom 0x200 (M 0x12AD4).
- A type's parts are emitted last first (harness sprite lists: 5E0, 5E4, 170, 57C), and a later sprite record draws over
  an earlier one, so a definition's first part is on top. Types 16C, 5C4, 57C, 170 and the three banners look different
  stacked the other way.
- Sprite palettes: M 0x3A808 + 32p at power-on; 0x80–0xFF set A (0x3B808, 0x3C008) or set B (0x3E72E, 0x3EF2E), chosen
  by the palette-animation command (0x8000 + id) in palette set (background index + 1): id 2 → set A (program
  M 0x3F12E), id 1 → set B (M 0x3D6EE; ITALY and U.S.A.); programs through [M 0x3A004] = 0x3D50C, routine M 0x968C. At
  run time only palette 0x2B color 12 changes (the start lights: 0x0670 in the ROM, unlit; 0x6FF0 lit, as the harness's
  palette RAM holds it while racing). Only type 1EC uses palette 0x2B.

## Backgrounds

- Set once at a country's start (M 0x93CE / 0x943C / 0x9474 → M 0x4FCA): index = word M 0x518C + 2 × country; setup
  M 0x4FF6 (pages: $88E2 = 0x4231, $88E4 = 0x8675; $86DE = 0x10D); commands M 0x40000 + 4 × index (handlers
  M 0x511A + type; 4 and 8 the scrolling layers); palette sets (index + 1) (M 0x5062) and (country + 0x21)
  (M 0x4FE4 → M 0x9606).
- Scroll (M 0x5384, each tick): pos (16.16) += clamp(D, ±0x100) × factor × 8, D = $2A3F1E (M 0xE43E), the tick's change
  of low16(−8 H), H = $8D8C (M 0xE42A), 4096 a turn of the game's heading θ ($8D92 −= F(x) a tick, M 0xE8E8, F from the
  atan table M 0x86A8). θ turns about length / (16 r) rad a position, so a layer moves 4 × factor px a θ-turn (0.94 of
  it measured on the attract's curves). The start pan moves H by −3068; at the race start
  pos = 96 + 1534 × factor / 0x200.
- Vertical: $86DE = 0x10D + $2A3F20 (both planes; IRQ M 0x14E8 / 0x1514), $2A3F20 = −p (S 0x16B2, 3 ticks late), p the
  hill pitch. The horizon lies between screen lines 114 + p and 115 + p.
- The sky: the road layer's solid lines (S 0x16A8–0x1708), color c = palette 0x1780 + c, with three sources (blue
  M 0x3F4FA, grey M 0x3F5FA, orange M 0x3F67A). Checked: the ROM-only model renders the tilemaps pixel-identically to
  harness frames, and the tile palettes and sky colors rebuilt from the ROM equal the harness's palette RAM in all ten
  countries and the attract.

## Camera (eye height)

- The level road's rows in the sub's step records fit row − 365.6 = 11735 / (d + 64.5) in sprite units (the horizon at
  365.6 is screen line 114.5; rms 0.37 over 449 level steps); with the lateral constant 115.5 the eye is about **102
  lateral units** above the road (101–103 by the fit's depth offset), the camera 64 positions (2.9 m) behind the bike.
  That is 0.66 m at 0.0065 m a lateral unit, **0.71 m** with rows 15/14 of a column ((H) 0.98 m, (A) 1.25 m).
- The bike is a 1:1 overlay (80–90 rows, palette 0x71) on the bottom scanline, not a projected object: drawn where the
  road is about 42 positions ahead of it, it is about 73 lateral units tall, half a person standing there (the people
  144–152). The eye is about 1.4 times the bike's picture.

## Scale, how it was decided

- Along the road: the speed display and the clock (above): 0.045862 m a position.
- Across: lanes of about 3.5 m from the road pictures (6.5 mm a lateral unit); heights 15/14 of it (6.964 mm). The
  original never mixes the two axes (a position is 7.06 lateral units at this scale). The bike-picture rule of SUPER
  HANG-ON and ENDURO RACER would give lanes over 10 m (the overlay is small). Alternatives: (H) 9.0 mm (the plan turns
  as the background's θ does) and (A) 11.466 mm (a quarter of a position: people 1.8 m, the eye 1.25 m, 38°).

## Hills (for the hills stage)

- PIT heights are lateral units (the same projection constant; the fits are noisy, 103–168 against 115.5): −171 to +114.
  The end pieces 21 and 24 hold (4800, 0), (4800, 683): a rise from 4800 positions that would reach 683 at 9600, beyond
  the 5120-position piece, which ends 45 up. The sub's step long (0x400 at the camera) carries the hills into the rows.

## Open

- Byte 3 bit 6 of a first section's last ROAD entry (only copied to the sub).
- The marks' length along the road (the slab picture's top 5 rows: about 20 positions near the camera, more far off).
- COURSE SELECT's harness test (ADC 0) did not change the default pick; the menu tables are read from the ROM.
- The race's limits and the series (four countries, time and bonus).
