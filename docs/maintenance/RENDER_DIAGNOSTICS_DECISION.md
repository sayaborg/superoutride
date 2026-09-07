# Opt-in renderer diagnostics

Implementation gate under retained M5.8/M5.9 observational-workload authority:

1. Renderer owns optional observation; compiler budgets consume complete observations.
2. Reuse the same Painter and optional sprite scanline observer, not a second renderer.
3. Allocate row/histogram arrays only when requested; absent diagnostics are absent, not fake zeros.
4. No course, mode, vehicle or topology branch is introduced.
5. Browser roots request ordinary presentation results; validation explicitly requests diagnostics.
6. Preserve every generated required terrain line, Painter order, pixels, chainage depth, metric,
   sprite transparency and GroundMap LOD. Single-loop road-view filtering preserves line order.
7. Compare diagnostic on/off pixels and common output across stress frames; retain exact workload
   baselines and full regression suite. Browser CPU acceptance is a separate measured claim.

No numerical/rendering authority changes. PR exact-head CI is sufficient; no standalone historical
validation record is required. Historical M5.8/M5.9 documents remain unchanged.

## Browser probe, 2026-09-08 JST

Serve the built repository locally and open `tools/browser-performance.html`. This diagnostic is
not imported by product entry points. It performs 120 fixed 60 Hz ticks per trial, ordinary full
vehicle updates, camera/Painter and canvas upload; two warmups, three alternating-order paired
trials. Default catalog car/policy and browser tire calibration are unchanged. Actors include the
player. No AI, HUD, route transition or requestAnimationFrame frame-budget certification.

Observed Codex in-app browser UA: Chrome/152.0.0.0, Macintosh (UA platform string). Milliseconds
per simulated frame, median of three trial means, diagnostics off:

| Actors | Physics | Camera + sprites + Painter | Canvas upload |
|---:|---:|---:|---:|
| 1 | 0.125 | 1.978 | 0.006 |
| 4 | 0.454 | 1.969 | 0.004 |
| 8 | 0.887 | 1.952 | 0.007 |
| 17 | 1.896 | 1.948 | 0.009 |

Diagnostics-on render means: 1.977 / 1.978 / 1.972 / 1.966 ms. The small differences do not
establish a material CPU speedup; the proven change is removing five unused diagnostic arrays,
their scanline writes/reduction and the intermediate road-view map array. Every paired final
physical state and framebuffer checksum matched (1737714081 / 1274539727 / 3137263891 / 3270124821).
Timing is environmental evidence, not a CI threshold or all-course/target-device acceptance.
