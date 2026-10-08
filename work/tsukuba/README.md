# Tsukuba working files (work-only; remove before main)

Scratch inputs and scripts behind `content/courses/tsukuba.course.json`. Not part of the product or its tools.

- `chain.npy`: the survey drawing's dashed centreline, traced in drawing pixels (one lap, in driving order).
- `fit.py` / `fit.json`: straights and arcs fitted to it; `k` is metres per drawing pixel for a 2,045 m lap.
- `gen.py` / `plan.json`: whole-metre radii, lengths refitted, lap closed by the last arc and two straights.
- `profile_sz.npy`: lap station (m) and elevation (m) from the drawing's longitudinal section, scaled against
  24 GSI 5 m elevation samples (correlation 0.996, 0.10 m RMS).
- `reg.npy`, `geo.py`: the drawing registered onto an aerial screenshot (rotation, scale, translation).
- `gen2.py`: writes the course document (Sections at the timing sectors, profile PVIs, station widths, verges).
  Run `python3 gen2.py content/courses/tsukuba.course.json`, then `npm run course -- normalize`.

Station widths (m) read from the drawing: START 17.03, 1 19.75, 2 15.05, 3 13.10, 4 10.10, 5 10.10, 6 10.45,
7 10.25, 8 10.35, 9 10.35, 10 13.25, 11 10.30, 12 10.25, 13 13.40, 14 13.15, 17 14.25, 18 10.50, 19 10.25,
20 10.25, 21 10.25, 22 13.00, 23 11.90, 24 10.40, 25 10.30, 26 10.26, 27 10.95, 28 17.20 (15 and 16 lie on the
motorcycle course). Crossfall (%) at the same stations: 1.4, 1.3, 2.9, 4.6, 1.6, 2.1, 2.3, 4.8, 4.1, 7.2, 8.8,
7.3, 3.5, 3.7, 2.2, 0, 1.6, 1.4, 1.3, 8.5, 9.7, 9.4, 1.6, 1.5, 2.2, 4.7, 3.1; the course is authored without cant.
