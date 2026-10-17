# Tire puffs

A puff is one cloud a tire throws from the road: smoke, spray or dust. This document owns the puff document, the puffs'
pictures and how a puff picks one.

## Puff document

`content/puffs/default.json` is the one `superoutride.puffs` version 1 document (manifest kind `puffs`, ID `default`):

```text
{format, version,
 kinds:    {<kind>: {pictures: [[<image>, ...], ...], releaseDegrees, responseSeconds, riseMps,
                     startDiameterMeters, growthMps, lifeSeconds}, ...},
 surfaces: {<material ID>: {kind, palette, metersPerPuff | null, joulesPerPuff | null}, ...}}
```

The kinds are content data like material IDs (`smoke`, `spray` and `dust` today); code names none of them. A kind's
`pictures` are its sizes from the smallest, each one or more shapes named by course image. Its six values say how its
puffs move, grow and end: `releaseDegrees` in [0, 90), positive `responseSeconds`, finite `riseMps`, positive
`startDiameterMeters`, `growthMps` at least 0 and positive `lifeSeconds`. Every surface material of the
[material catalog](vehicle-physics.md#material-vehicle-and-driving-documents) has exactly one surface record and no other
material has one: its `kind`, one of the document's kinds; its `palette`, a named palette of every picture of that kind;
and how many puffs it throws, `metersPerPuff` and `joulesPerPuff`, each positive or null for none. One function checks
a kind's six values and one a surface's two amounts; admission and DEV use them.

Every shape of a size is as wide as the others and saved with every level of its LOD, and the sizes increase in
diameter. Admission resolves the pictures among the saved course images; an unknown picture, kind or palette is an
`unresolved_reference`. The build delivers the document as authored with the pictures it names (manifest kind `image`,
by name), and the game loads the document and decodes its pictures once, at startup.

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
