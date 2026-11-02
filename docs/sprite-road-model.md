# The sprite-road model (SUPER OUTRIDE 2, provisional)

SUPER OUTRIDE raises only originals whose road layer draws the road surface line by line (K, 2026-11-03). Originals
whose road surface is drawn with sprites belong to a separate future model, provisionally SUPER OUTRIDE 2. This
document keeps what is known for it: the boundary, the frozen SUPER MONACO GP, the candidates, what the model needs and
how to start it in its own repository. [NEXT](NEXT.md#originals-with-a-sprite-road-surface) points here.

## The boundary

- An original is raised here when its road layer draws its road surface line by line. Sprites drawn over a raster road
  (lines, tunnels, bridges, boards beside it) do not move it out.
- An original whose road surface is sprites belongs to the sprite-road model. The check is made from the original's
  program before it is raised ([Raising an original from its ROMs](original-road-data.md#raising-an-original-from-its-roms),
  step 0).

## SUPER MONACO GP, frozen

- Removed by GR-4b. Its last state is main's commit `8beb28f7` (SM-1b3), the last before its removal. The tag
  `frozen/super-monaco-gp` could not be pushed from the session that removed it (its git proxy takes no tags); K tags
  that commit. The commit holds:
  - its conversion, version 36 (`tools/road-data/super-monaco-gp/`), and the shared parts it alone used
    (`shared/point-plan`, `shared/point-profile`, `uniformSky` in `shared/sky-baking`, K's table's `frame` judgement
    and its two entries);
  - its grid at the original's place before the line (SM-1b3), its start gate in the lap's last Section;
  - its canon: its course (a CIRCUIT of 5.27 km), 136 pictures and 2 skies, its crest trials and its racing lines;
  - its chapter (`docs/super-monaco-gp-road-data.md`) and research note (`docs/research/super-monaco-gp.md`), and the
    passages of Original road data on plans and profiles from a point path.
- What was learned:
  - The road surface is six flat boards (0x0DA4, 0x0DFE, 0x0E1C, 0x0E3A, 0x1F4A, 0x1F92), kind 0x04, 248 × 24 pixels,
    drawn upright at height −120 at their steps; the kerbs are pictures of view table 0x050A (144 × 21). The X
    hardware's road layer draws only lines of color from RAM, the ground and the sky's ramp: there is no road ROM.
  - A board's rows cover the road from the board before it to itself, the top row farthest: each board is drawn
    upright with its middle 70 units below the ground, and the nearer boards over the farther (read from the drawing,
    #1675).
  - Laid as Strips, one per run of a pen class (pens 1–7 and 8–14; no pixel falls outside them), the boards give about
    100,000 Strips a lap: the race's sector-2 alone 55,174, where a Section admits 2,048 elements; joined where their
    colors agree, no fewer. One board as one element gives about 2,000 a lap (1,102 surface boards, 123 of 0x1F92, 517
    kerbs, 246 others).
  - Its course is a 3D point path, its plan and profile made from a point path: a closed lap, cut at its lowest point
    for the [crests rule](original-road-data.md#crests) (`crestBoundLap`, which stays).
- Its ROM zip (`smgp.zip`) stays with K and is never committed.

## Candidates (researched 2026-11-03)

| Original                       | Year      | Maker | Board             | Road surface                                                                                          |
| ------------------------------ | --------- | ----- | ----------------- | ----------------------------------------------------------------------------------------------------- |
| SUPER MONACO GP                | 1989      | SEGA  | X Board           | sprite boards (from its ROMs)                                                                         |
| POWER DRIFT                    | 1988      | SEGA  | Y Board           | sprites: track and world, scaled and rotated                                                          |
| RACING HERO                    | 1990      | SEGA  | X Board           | to check                                                                                              |
| GP RIDER                       | 1990      | SEGA  | X Board           | to check (play close to SUPER MONACO GP)                                                              |
| RAD MOBILE                     | 1990      | SEGA  | System 32         | layered sprites, hills and long banks                                                                 |
| RAD RALLY                      | 1991      | SEGA  | System 32         | as RAD MOBILE (its two-player version)                                                                |
| F1 EXHAUST NOTE / F1 SUPER LAP | 1991/1993 | SEGA  | System 32         | to check                                                                                              |
| OUTRUNNERS                     | 1992      | SEGA  | System Multi 32   | to check                                                                                              |
| WGP / WGP2                     | 1989/1990 | TAITO | Taito's WGP board | to check: row-zoomed tilemaps and rotatable sprites; if the road is the tilemaps, it is nearer raster |

## What the model needs

- A road drawn as pictures at depths (the boards), not as lines of color.
- Banks and a rotating screen (RAD MOBILE's banks; the Y Board's and WGP's rotation).
- Roads above and below the camera (POWER DRIFT's stacked tracks): a projection that draws more than the road ahead.
- Each original's course data read from its ROMs (SUPER MONACO GP's is a 3D point path).
- Vehicles, physics, sound and the HUD can come from SUPER OUTRIDE.

## Starting it in its own repository

1. Have ready: K's ROM zips, the frozen commit and its tag, and this document.
2. Create the new repository and push this repository's main into it with its history (clone, add the new remote,
   push main and the tags). Starting from the then-current main keeps the newest engine.
3. Restore SUPER MONACO GP from the frozen commit: `git checkout 8beb28f7 --` its conversion
   (`tools/road-data/super-monaco-gp/`), the point-path parts (`tools/road-data/shared/point-plan.ts`,
   `tools/road-data/shared/point-profile.ts`, `uniformSky`), its register entry, its chapter and research note, its
   canon (`content/originals/` and `content/racing-lines/super-monaco-gp.json`) and K's table's entries. Port it to the
   shared parts as they then stand. Put `smgp.zip` in `reference-media/super-monaco-gp/rom/` and run
   `npm run road-data -- originals --check` against its canon (version 36).
4. Decide whether the raster originals' conversions and canon are removed or kept as references.
5. Set up its own AGENTS.md, NEXT.md, CI and Pages, keeping this repository's rules: no ROM data in git, no code copied
   from other projects, no links to ROM sources.
6. Build the renderer first (boards as pictures, banks, rotation), then raise SUPER MONACO GP again on it, then the
   next candidates.
7. Copy the shared parts at first. If the two games keep sharing much (physics, vehicles, audio), extract them later
   into a package both use.

## Sources

- Wikipedia: Super Monaco GP, Power Drift, Racing Hero, Rad Mobile, F1 Exhaust Note.
- Sega Retro: X Board, Power Drift, GP Rider, Rad Rally, System 32, OutRunners.
- Hardcore Gaming 101: Rad Mobile.
- Wikipedia (Japanese): WGP - Real Racing Feeling.
