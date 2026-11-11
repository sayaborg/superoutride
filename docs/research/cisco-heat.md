# CISCO HEAT research notes

Research behind CISCO HEAT's road data that the specification does not hold: the programs' map, routines and what is
open. Not a specification: the decisions are [Stage CS](../NEXT.md#stage-cs--cisco-heat-from-the-roms)'s and the rules
[Original road data](../original-road-data.md)'s. M is the main 68000's program, R1 and R2 the first and the second road
68000's; addresses are each program's. Read statically. Its board and its road CPUs' code are BIG RUN's ([BIG
RUN](big-run.md)).

## Its camera

- **What M passes.** Each frame M copies 0x22 bytes from 0xF0202 to both road CPUs' shared RAM at 2 (M 0x2FA4; M sees
  R2's at 0x90000 and R1's at 0x98000, each road CPU its own at 0x40000), and each road CPU copies them to its RAM at
  0xC00A0 (R1 0x486). Among them: the car's position (0xF0210, the player's position plus 0xF0322, which M only clears),
  the yaw added to the road's heading (0xF0220) and the pitch taken from the road's angle (0xF0222).
- **No horizon from M.** The road CPUs start the frame's horizon shift from 0xF0216 (R1 0x1462), which M only clears;
  they add the difference between the two roads' heights at the car where the road drawn is not the one held (R1 0x144C,
  0x1892), and it moves only where the road drawn starts on the screen (R1 0x1900, the rows below filled at 0x18DA). So
  M moves no horizon of its own.
- **The pitch.** The road CPUs pitch the camera by the held road's angle at the car's position, its vertical record's
  angle plus its rate times the distance into it (R1 0x1FA0, its sine and cosine from 0x30BA), less 0xF0222. M adds to
  0xF0222 four times a record's word +0 (bits 0 to 13, bit 14 its sign) where the car passes the end of a record of its
  first road's list (player +0x58, 20 B, unless +8 bit 7), and takes it back to 0 by a sixteenth of its value then each
  frame (M 0x5E70, 0x63D2). 0xF0220 is the same for the yaw, from the list at +0x50 (12 B records, M 0x5E20).
- **Open.** Where the pinhole lies, its height and how far behind the car (the projection's table at R1 0x3232), is read
  with the courses (CS-3).

## Its skies

- **The planes' ROMs.** Plane 0's tiles are `ch9071.a14`'s and plane 1's `ch9071.t74`'s, 2,048 tiles each, read by
  drawing the scenes with each ROM; the scenes' tile words reach 4,095, tile 2,048 the most used in several, and drawn
  modulo 2,048 the pictures are whole (San Francisco's bay, its skyline and Alcatraz in STAGE 1), tile 0 of each ROM
  blank.
- **The scenes' objects.** Plane 1's from M 0xA1A2 (its table by the stage, `$f011a`, at 0xA1A6), plane 0's from 0xA5EA
  (0xA600); each waits for the road position (`$f0410`) to reach a scene's start, loads its palette (to 0xBAC00 and
  0xB9C00) and writes its first 18 columns, then streams a column as its scroll crosses 16 pixels (0xA3C0 to 0xA3F6,
  0xA524, 0xA58A). Plane 0's record's +26 is a tile word it writes into its plane beside its picture (0xA6D6).
- **The slide.** Its routine (M 0xA454) runs while the game plays (`$f0024` 4); the curve is the main's list's record
  (`$f0330`: +0 its side by bit 15, +2 its radius, none on a straight; the lists at player +0x50 and +0x54, M 0x5E4C,
  0x5E60), the same records as the plan's. The front adds `$f034c` only past STAGE 1, the back always: the change of
  `$f021e` ÷ 64 (M 0xA502), the angle the objects are also turned by (M 0x63B6), not the road's heading.
- **Their rows.** A plane's vertical scroll is its scene's +8, its steps' (M 0xA3F8 to 0xA44E) and the road CPU's word
  at shared 0x500 (`$f0228`, M 0xA1EE: the first road CPU's, the second's in STAGE 4).
- **Open.** The steps along a scene, which a sky does not lay; the speed's other tops, by the player's +2C and +C8
  (0x676DB5, 0x5BFFFF and 0x9C9249, M 0x317A to 0x321C), lower than the one taken.

## Its roads

- **Its tables read as BIG RUN's.** Laid by the shared plan within BIG RUN's limits (0.03°, 14 positions a record), road
  2 lays in STAGES 1 to 4 (its heading within 0.014°, its position within 13.6 positions). Road 1 in STAGE 4 departs by
  6,025 positions where it leaves road 2 again, and in STAGE 5 both roads' headings jump beside an arc (road 1 at
  78,497, road 2 at 351,908), where the shared rule lays a jump only between straights.
- **Its 3D road.** Read as BIG RUN's (its grade's sine a position, a vertical arc's grade changing evenly to the next
  record's), its heights depart from its records' by thousands of positions: each vertical arc's angle changes evenly
  along it (a record of radius 10,000 from −36° to level over 6,283 positions, 10,000 × 0.628), where BIG RUN's model
  changes its grade's sine evenly, near alike only at small grades; its heights need its arcs as they are, which keep
  within 1.5 positions of its records' heights record by record (`arcRoad`).
- **Held stretches.** As the study found, and past each goal, both roads, stretches its last records hold (not
  courses').
- **Open.** The speedometer's factor (1.75 km/h a unit) and each stage's goal are not found in the program yet.

## Its road across

- **Its nearest lines.** R1 0x198C to 0x19A6 (R2 the same, its table 4 bytes on): kinds 0 and 2 line 294, then 291 a
  kind step to kind 14's 2,040; kinds 20, 22 and 24 lines 2,041 (pen 0), 2,042 (pen 6) and 2,043 (clear); the record's
  +0x18 its entry and +0x1A its stripes' table (from R1 0x1018E by `$c0084`, 0x19AC to 0x19DE).
- **Its pictures.** Line 294: ground pen 0 beyond 408 units, sidewalk 1 to 312, kerbs 2 to 5 and 9 to 13 to 252, then
  pen 6 with lane lines of pen 8 at 0 and ±142 (12 units wide); 585 its left side clear to −312, 876 its right, 1,167
  both; 1,749 a patterned road (pens 7 to 13); 2,040 a striped deck (pens 8 and 14). BIG RUN's paints take the run at
  the centre as the surface, here a lane line: how CISCO HEAT's lines are painted is open (CS-3).
