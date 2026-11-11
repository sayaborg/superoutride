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
