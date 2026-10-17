# Tire puffs

A puff is one cloud a tire throws from the road: smoke, spray or dust. This document owns the puffs' pictures and how
a puff picks one.

## Pictures

Every puff picture is an opaque course image of at most 16 colors with two-level transparency
([Image assets](image-assets.md#completed-sprite-images)), standing at its base point on the middle of its bottom row
(the default anchor) and casting no shadow. A picture shows a puff of the diameter its master's width represents,
`W/40` metres. Each kind of puff has a run of pictures whose diameters differ by √2; a size may have several shapes.

The pictures are drawn by `npm run puff-pictures` ([Image assets](image-assets.md#drawn-pictures)): nine sizes from
0.25 m to 4 m, `k` 0 to 8, with two shapes each. Smoke and dust share the cloud shapes `puff-cloud-<k>-a` and `-b`,
colored by the named palettes `smoke`, `dirt`, `sand`, `verge` and `grass`; spray has the mist `puff-mist-<k>` and the
drops `puff-drops-<k>`, colored by `spray`.

Opaque pictures follow the original hardware. In MAME's Out Run driver the sprite shadow pen (0xA with the shadow
flag, `(pix & 0x400f) == 0x400a` in `src/mame/sega/segaorun.cpp`) darkens or brightens what lies beneath according to
the top bit of that pixel's own palette entry (`newval & 0x8000` in `src/mame/sega/segaic16.cpp`), so a sprite cannot
brighten everything beneath it evenly: the board had no translucent smoke.
