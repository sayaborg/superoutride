# Car model tools (the Nissan 300ZX 2+2 of 1984 and its police car)

The auditor's scripts that took K's generated GLB (`e5a1d3a5-b922-4ee7-a498-eb560a93162b.glb`, SHA-256 `f7056dd6…58198f5`)
to the two models on `codex/nissan-300zx-2plus2-1984-glb-source` (`nissan-300zx-2plus2-1984.glb`, `add6a67c…1392369`)
and `codex/nissan-300zx-2plus2-police-1984-glb-source` (`nissan-300zx-2plus2-police-1984.glb`, `2770aea7…9fef4fa7`),
2026-11-27. K passed on the auditor's copy; this folder keeps it as given. They are a record, not a library: paths
assume a work folder with `tools/`, `work/`, `in/` (`in/z31-src.glb`) and `out/`, and the 300ZX's coordinates are
written into them. Read a script before using it on another car.

Everything needed is in this folder. `tools/view.py`, `rast.py`, `glbio.py` and `setview.py` are copies of
`../car/`'s (byte for byte; `../glbio.py` is a different script and is not used); `tools/ao.py` differs from `../car/ao.py`.
`simp/simp.mjs` thins the mesh with npm's `meshoptimizer` (1.3.0 in the auditor's work folder; `npm install` in `simp/`).

Needs: Python 3, numpy, scipy, Pillow; `trimesh` and `embreex` for the occlusion; Node for `simp/`.

## Order

`prep` → `wheels0` → `fit` → `c1_cls` → `c2_paint` → `b3_wheels` → `b3c_scoop` →
`b4_win` → `b5_build civil` → `b5_build police`. After running `c2_paint` again, run `b3c_scoop` again (it paints the
scoop's mark).

| Script | What it does |
| --- | --- |
| `tools/prep.py` | welds the vertices, rasterises the texture's coordinates to faces (`uvraster.npz`), saves the texture |
| `tools/wheels0.py` | about each contact patch's centre (front z = 0.2895, rear −0.2607, model units), ±0.085: the dark vertices in the middle 40% of the tread's width, on the lower arc (y < 0.055), outer edge only, fitted with a circle. All four wheels radius 0.0717 to 0.0721 (standard deviation about 0.1 mm). `wheels0.npy` is {FL, FR, RL, RR: (cz, cy, r, \|x\| inner, \|x\| outer)} |
| `tools/fit.py` | sizes to Nissan's 1984 service manual, GI-13 (2+2). One width scale for the whole car |
| `tools/c1_cls.py` | texel positions and normals; first classes (paint candidates, dark, amber) |
| `tools/c2_paint.py` | the paint key, glass (the dark parts that reach the roof), brake lamps; K's requests: the strip joining the lamps is a red lens that does not light (a key of its own), the black squares on the roof and the badge on the hatch's right painted over |
| `tools/b3_wheels.py` | tyres made round at the treads and set on the road, tracks set; painted body vertices held |
| `tools/b3c_scoop.py` | new: takes off the bonnet's scoop (the left half takes the right half's height, mirrored) |
| `tools/glbviews.py` | six shaded views of a GLB: `python3 tools/glbviews.py <glb> <jpg>` |
| `tools/b4_win.py` | the panes made flat where one smooth sheet fits them |
| `tools/b5_build.py` | writes the GLB; thins the mesh to 2 million triangles once (`simp/simp.mjs`). `civil`: two keys (body, red lens). `police`: the doors and roof white, a star on each front door, a light bar on the roof (behind the glass panels, z = −1.02 m) |

## Notes

- `b3_wheels.py`, `b4_win.py` and `b5_build.py` read `in/z31-src.glb`; `b5_build.py` runs `simp/simp.mjs` with Node from
  `/home/claude/node24`.
- The auditor ran `wheels0.py` again and got the `wheels0.npy` that was used.
