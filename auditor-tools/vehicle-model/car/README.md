# Car model tools (the 928 S4 of 1987)

The auditor's scripts that took K's generated GLB of the Porsche 928 S4 to the model on
`codex/928-s4-1987-glb-source` (2026-11-19 and 20). They are a record, not a library: paths assume a
work folder `/home/claude/work928` (`src/`, `tools/`, `out/`, `painted/`), and the 928's coordinates
(wheel zones, the box of the panel between the tail lamps, the lamp units) are written into them. Read
a script before using it on another car.

Needs: Python 3, numpy, scipy, Pillow; `trimesh` and `embreex` for the occlusion; Node 24 for the
repository's baker.

## Order

| Step | Script | What it does |
| --- | --- | --- |
| read and write | `glbio.py`, `view.py` | GLB container, one mesh, its texture |
| look | `rast.py`, `review_v2.py` | a small triangle rasteriser: shaded and textured views. Slow above about 1,600 px wide |
| size | `fit.py` | y and x by one factor each; z piecewise, the wheel zones scaled like y so wheels stay round, the rest stretched to the full length |
| fair | `smooth2.py` | thin-plate smoothing of the glass panes and the body panels, moving along the normal only, sharp edges held |
| flat paint | `paint2.py` | classes paint / dark / glass / keep on the surface, written as flat colours; saves the texel-to-face map (`uvraster.npz`) |
| tyres | `fix5.py` | circle fit to the tread, scale to the tyre's radius, centre at that height, track set; painted body vertices held so no arch moves |
| width | `fix8.py` | removes the plan taper so both wings reach the car's full width; tracks again |
| one panel | `fix9.py` | repaints and flattens a box on the surface |
| K paints | `../glb-painter.html` | K paints the brake lamps and anything else by hand, and returns the GLB |
| after K | `fix10.py` | one red for the body, small islands absorbed, texture padding |
| reflectance | `build12.py`, `ao.py` | roughness 0.10 on paint, glass and brake lamps, 0.90 on other dark parts; occlusion at the vertices (192 directions on the sphere, cosine-weighted); extras in the Testarossa's form |
| trial bake | `trial-recipe-928.json`, `setview.py` | the recipe the auditor baked with `npm run pictures -- <set> replace --model <glb>`; `setview.py` opens a saved set as pictures |

## What went wrong, so it is checked first next time

- Reported target values as measured ones. Measure the result: tyre diameter by a circle fit to the
  tread, body width from the painted vertices only (mirrors apart).
- A wheel step that chose "not body" by the original texture's colour moved the arch lips. Hold the
  painted body fixed and check that no body vertex moved.
- The generated model tapered in plan: its front wing was 43 mm a side narrower than the rear. A car's
  published width is the width at its wings; check both.
- The front track came from a specification site (1,551 mm); the owner's manual said 1,549 mm.
- A flat glossy panel facing the camera bakes as one bright patch. K saw it and kept it.
- The procedural pictures of the same car depend on the definition's dimensions. Changing a dimension
  before the model's pictures replace them leaves the saved pictures out of step with the recipe.
