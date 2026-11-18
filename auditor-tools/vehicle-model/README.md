# Auditor's tools for a vehicle model (not for main)

Scratch tools the auditor used on 2026-11-18 to prepare K's Honda NSR500 1984 model (a one-mesh GLB from Tripo, bike
and rider together) for the picture baker. They are kept on this branch only so a later session can pick them up.
They are not part of the game, are not tested, and must not be merged into main.

Paths inside the scripts point at `/home/claude/work` (`scripts/`, `out/`, `in2/`). Copy the scripts to
`/home/claude/work/scripts` or edit the paths. Several steps have the NSR500's own coordinates written in (wheel
positions, the knee, the tail, the exhaust outlets); read a script before using it on another model.

Order of work, as done for the NSR500:

1. `glbinfo.py`, `n2_view.py`: read the GLB and render it from six sides.
2. `measure2.py`, `n2_meas.py`: fit both wheels, measure tire width and rim edge.
3. `rescale.py`: scale to the wheelbase, origin on the ground at mid wheelbase (m, front +Z, up +Y, left +X).
4. `retire.py` with a targets file such as `n2_tires.json`: reshape the tires to real size, then set them on the
   ground.
5. `posmap.py`: position, normal and coverage of every texel (needed by everything below).
6. `n2_labels.py`, `regions_map.py`: build the fill regions and embed them; K paints with `glb-painter.html`
   (`test_painter.py` checks the painter in a headless Chrome).
7. `p1_inspect.py`, `p1_labels.py`, `p1_fix.py`, `p1_stripe.py`, `p1_exhaust.py`, `p1_embed.py`: flatten the paint
   to solid colors, mirror left to right, redraw painted lines, special spots, exhaust outlets, write the GLB.
8. `texview.py`, `ortho4.py`, `labview.py`: dense previews and four orthographic views.
9. `cand2.py`, `fit.py`, `setview.py`, `b3_render.py`, `b3_alloc.py`, `b3_lights.py`, `b3_liv.py`: sample sprites
   under the game's picture conditions (camera, 64 yaws, palette steps, light), palette and light comparisons,
   liveries. `setview.py` also decodes a saved sprite set from the repository into PNG.
