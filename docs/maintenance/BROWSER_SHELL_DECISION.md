# Browser/player shell extraction

Implementation Decision Gate, not new gameplay/handling authority.

1. Browser owns framebuffer, canonical input wiring, selectors, player reconstruction and HUD.
   The three roots own their distinct topology tick order, recovery targets and race resync.
2. Reuse InputManager, existing selector adapters, createArcadeVehicle and the shared HUD.
3. One current player and recovery object live in the shell; roots access them, never keep a second copy.
4. No route kind or DEV fixture dependency enters the shell. No mechanics branch is added.
5. Root callbacks perform policy-specific recovery before replacement and progress resync after it.
6. Preserve catalog protection on new players, tire/steering/ENG retention, input arbitration,
   physical gates, recovery non-scoring, world coordinates, camera and renderer invariants.
7. Exercise selector events across replacement and all three root connections. Move literal
   duplicated-wiring source assertions to the new owner, retaining route-specific tests.

This is implementation consolidation under retained M9.20/M9.21/M9.22 behavior, not a normative
control change. PR exact-head CI is evidence; no standalone archive record is required.
