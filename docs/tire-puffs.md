# Tire puffs

A puff is one cloud a tire throws from the road: smoke, spray or dust. This document owns the puff document, how many
puffs a tire throws and where, how they move, grow and end, their pictures and the limit on them.

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

## Throwing

Every fixed step (`SIM_DT`), each throwing vehicle's front and rear contact patches throw from their tire observations
([Vehicle physics](vehicle-physics.md#observations)) and their surface's record:

```text
rolling: |wheelSpeed| * SIM_DT / metersPerPuff puffs
sliding: slidingPower * SIM_DT / joulesPerPuff puffs
```

Each patch carries its rolling and its sliding fraction from step to step and throws one puff each time a fraction
reaches 1. A patch whose surface is null (no force transmitted) throws nothing that step and keeps its fractions; a null
amount throws nothing of that way. Rolling is one puff per distance the tread travels; sliding one per amount of the
friction work beyond the tire law's peak, so a tire the torque protections hold at the peak throws no sliding puffs.

The vehicles that throw are the player, the rivals and the traffic whose route position lies within the drawing depth
of that step's camera (`RENDER_NEAR_DEPTH_METERS` to `RENDER_FAR_DEPTH_METERS` ahead of it); the others throw nothing and
carry nothing.

**Where.** A patch lies at its axle (`frontAxle` ahead of the body's centre, `rearAxle` behind it) and half its track
to one side, turned by the body's yaw; each patch alternates sides puff by puff, starting on the right. A two-wheeler's
tracks are 0, so the same rule throws from the middle. A puff leaves where the tread has turned `releaseDegrees` (φ)
past the patch: `-sign(wheelSpeed) * r * sin φ` along the wheel's heading and `r * (1 - cos φ)` above the road's height
there, `r` that wheel's rolling radius. The wheel's heading is the body's yaw, with `frontSteerAngle` added at the
front. The point's route position comes from its projection onto the Route (`locateLocal`); a point off the
coordinate domain or the resident Route throws nothing.

**How fast.** In the wheel's frame (forward, right, up) a puff leaves at

```text
(longitudinalVelocity - wheelSpeed * cos φ,  lateralVelocity,  |wheelSpeed| * sin φ)
```

turned by the wheel's heading into the world and then along and across the Route's heading at its route position. At
φ = 0 a puff leaves with the patch's slip velocity (smoke); above 0 a faster wheel throws it higher (water, dirt).

## Motion

A puff then moves on the Route as a knocked object does, by its route position (`s`, `l`), its height and its speeds
along, across and up. Still air holds it with the time constant τ = `responseSeconds`, and its vertical speed settles
to `riseMps` (up positive). Each fixed step solves this exactly, so it is stable however small τ is:

```text
k = exp(-SIM_DT / τ)
s += speedS * τ * (1 - k)           speedS *= k
l += speedL * τ * (1 - k)           speedL *= k
y += riseMps * SIM_DT + (speedY - riseMps) * τ * (1 - k)
speedY = riseMps + (speedY - riseMps) * k
```

Its diameter is `startDiameterMeters + growthMps * age`. A puff ends when its age reaches `lifeSeconds`, when its base
point falls below the road under it, or when it leaves the resident Route. At most `PUFF_LIMIT` (256, an author's value
for performance to be judged on devices) are alive; a new puff beyond it replaces the oldest. Nothing draws randomness.

## Drawing

A puff is drawn each frame as a board standing at its base point, with no shadow, ordered by depth among the
other pictures ([Architecture](architecture.md#sprites-and-painter)): the size of its kind whose diameter is nearest its
own by ratio (the smallest or largest beyond them), the shapes of that size taken in turn by the puff's birth order, in
its surface's palette, each picture resolved in a palette once. A front tire's puffs are therefore hidden by the player's
body until it has passed them, and a rear tire's are drawn over it.

## Owners

The observer owns the puffs as it owns its vehicle pictures (`createTirePuffs` in `src/view/tire-puffs.ts`); the race
knows nothing of them. A run advances them in each fixed step after the race's advance, from `race.observe()`'s player,
rivals and traffic, with the step's camera, and draws their pictures through the scene's `pictures`, beside the other
vehicles' `vehicles`; each run assembly, a DEV rebuild's included, starts with none. The attract demo runs through the
same step. The driving scenarios advance them every fixed step and draw them in the frames they render, checking the
limit.

## DEV

With `dev=1`, DEV's PUFFS group ([Browser](browser.md#dev-controls)) replaces the records new puffs are thrown with:
a kind's six values and a surface's kind, palette and amounts, under the same checks as admission. A puff keeps its
kind's values as they were when it was thrown. Its export saves the records as this document in the saved layout, to
adopt as content.

## Pictures

Every puff picture is an opaque course image of at most 16 colors with two-level transparency
([Image assets](image-assets.md#completed-sprite-images)), standing at its base point on the middle of its bottom edge
(the default anchor) and casting no shadow. A picture shows a puff of the diameter its master's width represents,
`W/40` metres. Each kind of puff has a run of pictures whose diameters differ by √2; a size may have several shapes.

The pictures are drawn by `npm run puff-pictures` ([Image assets](image-assets.md#drawn-pictures)): nine sizes from
0.25 m to 4 m, `k` 0 to 8, with two shapes each. Smoke and dust share the cloud shapes `puff-cloud-<k>-a` and `-b`,
colored by the named palettes `smoke`, `dirt`, `sand`, `verge` and `grass`; spray has the mist `puff-mist-<k>` and the
drops `puff-drops-<k>`, colored by `spray`.

Opaque pictures follow the original hardware. In MAME's Out Run driver the sprite shadow pen (0xA with the shadow
flag, `(pix & 0x400f) == 0x400a` in `src/mame/sega/segaorun.cpp`) darkens or brightens what lies beneath according to
the top bit of that pixel's own palette entry (`newval & 0x8000` in `src/mame/sega/segaic16.cpp`), so a sprite cannot
brighten everything beneath it evenly: the hardware had no translucent smoke.
