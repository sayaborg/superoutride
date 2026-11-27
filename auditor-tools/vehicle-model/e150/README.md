# Car model tools (the Ford Econoline E-150 Regular Van of 1983)

The auditor's scripts that took K's generated GLB (`vintage_van_3d_model.glb`, 145,671,884 bytes, SHA-256
`9a3472ab…59157230f`) to the model on `codex/ford-econoline-e-150-1983-glb-source` (`ford-econoline-e-150-1983.glb`,
92,288,852 bytes, `bbaddb68…906ff088`), 2026-11-27, as K passed them on. They are a record, not a library: paths assume
a work folder with `in/e150-src.glb` (K's GLB), `tools/`, `work/`, `out/` and `simp/`, run from its root as
`python3 tools/<name>.py`, and the van's coordinates are written into them. Read a script before using it on another car.

`tools/view.py`, `rast.py`, `glbio.py`, `setview.py`, `ao.py` and `glbviews.py`, and `simp/`, are byte for byte
`../z31/`'s (the auditor compared them). Needs: Python 3, numpy, scipy, Pillow; `trimesh` and `embreex` for the
occlusion; Node and npm's `meshoptimizer` for `simp/`.

## Order

`prep` → `wheels0` → `fit` → `c1_cls` → `c2_paint` → `b3_wheels` → `b3b_flat` → `b4_win` → `b5_build civil`.
`b5_build.py`'s `police` branch is left from the 300ZX and was not run for the van.

| Script | What it does |
| --- | --- |
| `tools/prep.py` | welds the vertices, rasterises the texture's coordinates to faces (`uvraster.npz`), saves the texture |
| `tools/wheels0.py` | each tyre's circle from its tread's lower arc: contact centres z 0.3744 and −0.2547 (model units), radius about 0.0703 |
| `tools/fit.py` | sizes to Ford's 1983 Econoline catalogue: 5.2527 m bumper to bumper (the bumper guard ahead and the spare tyre behind outside it; 5.488 m end to end), the overhangs in the model's own share (0.617 and 1.130 m), one width scale (2.0295 m at the belt), the height scale from the roof (2.0574 m; the tyres' would put the roof 65 mm lower) |
| `tools/c1_cls.py` | texel positions and normals; first classes (the beige is the paint candidate) |
| `tools/c2_paint.py` | the paint key (200, 20, 26); glass (dark parts only above 1.0 m, and what lies on a pane inside its outline: the wipers and a rod); the rear ladder chrome all over (K); the roof's ribs body colour (K); the right side's plate and bit painted (K); the tyres' sidewalls matte black; the brake lamps the rear face's red lenses |
| `tools/b3_wheels.py` | tyres round (P225/75R15, radius 0.3593 m, width 0.225 m, treads 1.7628 and 1.7018 m) |
| `tools/b3b_flat.py` | new: levels the right side's two boxes into the surrounding surface (K) |
| `tools/b4_win.py` | the windscreen made one surface (51,758 vertices; the wipers' relief goes); the framed side and rear windows as supplied |
| `tools/b5_build.py` | writes the GLB: the mesh thinned from 4.72 to 2 million triangles (no vertex moved), Morton order |
| `tools/glbviews.py` | six shaded views of a GLB: `python3 tools/glbviews.py <glb> <jpg>` |

## Notes

- Left as the copy has them, with no effect on the result: `fit.py`'s width comment still reads "1,725 mm" (the 300ZX's;
  the van is 2.0295 m), and `b5_build.py`'s `extras.note`, written into the GLB, is from before the ladder and the roof's
  ribs were changed ("ladder … as supplied"; the ladder is chrome all over and the ribs body colour). The branch's
  commit message is the right account.
- `close.py` and `fit2_side.py`, for looking at pictures only, are not part of the order and not in the copy.
