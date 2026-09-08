# M9.23 — LP-only matched-input falsification

Evidence date: 2026-09-08. Node24.18.0; 120Hz production integration, 10Hz telemetry.
Base main: `d5fc817f3be6301a0328d8621e8c1197bfe035c3`. This is experiment evidence,
not a human handling certificate or authority to promote another default.

## Fixed conditions and reproduction

Testarossa; browser GX2.50/PX8%/GY2.20/PY10%/KN.74; ENG1; D12/M60/ACT.25;
ROAD independent TCS/ABS on. Only LP changes between2,3,4,6,8. Every run starts
from the same authored world state. Flat scenarios use published piecewise inputs in
`tools/combined-slip-probe.mjs`; course runs capture ordinary rival inputs once at p=2
and replay that exact120Hz sequence at every LP, with no new feedback or recovery.
Initial speeds: flat acceleration15m/s; braking/coast/power/trail45m/s; drift scenarios
200km/h; courses45m/s at s95,l0. Scenario labels describe input intent, not achieved drift.

After `npm ci` and `npm run build`, run `node tools/combined-slip-probe.mjs /tmp/lp`.
The command writes full-precision compressed JSON (including input traces and every10Hz
observation) and CSV. Retained artifacts: [summary](M9_23_COMBINED_SLIP_120HZ.csv),
[full traces](M9_23_COMBINED_SLIP_120HZ.json.gz). Gzip SHA256: `b7ebb281f00af6fbb49e841bb486c9b9646f8ab146653cadc5b20cde3c1acf8c`.

The full trace contains speed, beta, yaw rate, both station sx/sy/Fx/Fy/rho/load/wheel
speed, requested/canonical/actual pedals, delivered station drive/brake torques,
lateral acceleration, curvature, world trajectory and course coordinates. SlipPower is
positive dissipated power (the negative of signed contact slip work). Moment is still
assembled by the production wrench; the probe does not inject any force or state.

## Results

All50 runs finished their requested time without numerical exceptions or recovery.
The straight acceleration and braking full traces are exactly identical across all LPs.
Raw near-zero-speed braking beta can report180 degrees due to negligible signed residual
velocity; it is not a moving spin. The table reports max beta only for sampled speed>1m/s.
Speeds are m/s. Course lateral displacement is relative to the authored Guide.

| Scenario | LP | Exit speed | Max moving beta (deg) | End beta (deg) | Max lateral (m) |
|---|---:|---:|---:|---:|---:|
| straight-acceleration | 2 | 41.2979 | 0.000 | 0.000 | 0.000 |
| straight-acceleration | 3 | 41.2979 | 0.000 | 0.000 | 0.000 |
| straight-acceleration | 4 | 41.2979 | 0.000 | 0.000 | 0.000 |
| straight-acceleration | 6 | 41.2979 | 0.000 | 0.000 | 0.000 |
| straight-acceleration | 8 | 41.2979 | 0.000 | 0.000 | 0.000 |
| straight-braking | 2 | 0.0000 | 0.000 | 180.000 | 0.000 |
| straight-braking | 3 | 0.0000 | 0.000 | 180.000 | 0.000 |
| straight-braking | 4 | 0.0000 | 0.000 | 180.000 | 0.000 |
| straight-braking | 6 | 0.0000 | 0.000 | 180.000 | 0.000 |
| straight-braking | 8 | 0.0000 | 0.000 | 180.000 | 0.000 |
| coasting-corner | 2 | 33.6892 | 4.249 | -2.383 | 192.233 |
| coasting-corner | 3 | 33.6892 | 4.249 | -2.383 | 192.233 |
| coasting-corner | 4 | 33.6892 | 4.249 | -2.383 | 192.233 |
| coasting-corner | 6 | 33.6892 | 4.249 | -2.383 | 192.233 |
| coasting-corner | 8 | 33.6892 | 4.249 | -2.383 | 192.233 |
| power-on-corner | 2 | 50.7939 | 3.155 | -2.729 | 278.126 |
| power-on-corner | 3 | 50.7940 | 3.148 | -2.729 | 278.127 |
| power-on-corner | 4 | 50.7940 | 3.147 | -2.729 | 278.127 |
| power-on-corner | 6 | 50.7940 | 3.147 | -2.729 | 278.127 |
| power-on-corner | 8 | 50.7940 | 3.147 | -2.729 | 278.127 |
| trail-braking | 2 | 13.1038 | 41.564 | 0.737 | 66.478 |
| trail-braking | 3 | 13.4006 | 39.473 | 0.671 | 67.710 |
| trail-braking | 4 | 13.4444 | 39.167 | 0.661 | 67.899 |
| trail-braking | 6 | 13.4526 | 39.107 | 0.659 | 67.936 |
| trail-braking | 8 | 13.4527 | 39.106 | 0.659 | 67.937 |
| drift-entry | 2 | 25.7028 | 47.945 | -3.904 | 114.611 |
| drift-entry | 3 | 25.1386 | 50.592 | -3.649 | 112.925 |
| drift-entry | 4 | 25.0151 | 51.147 | -3.582 | 112.533 |
| drift-entry | 6 | 24.9815 | 51.298 | -3.564 | 112.425 |
| drift-entry | 8 | 24.9796 | 51.307 | -3.563 | 112.419 |
| drift-sustain | 2 | 36.8635 | 47.945 | -2.835 | 180.175 |
| drift-sustain | 3 | 36.3030 | 50.592 | -2.793 | 176.407 |
| drift-sustain | 4 | 36.1788 | 51.147 | -2.784 | 175.595 |
| drift-sustain | 6 | 36.1448 | 51.298 | -2.781 | 175.374 |
| drift-sustain | 8 | 36.1429 | 51.307 | -2.781 | 175.362 |
| drift-correction-exit | 2 | 41.6599 | 47.945 | -0.000 | 381.732 |
| drift-correction-exit | 3 | 41.0391 | 50.592 | -0.000 | 379.548 |
| drift-correction-exit | 4 | 40.8939 | 51.147 | -0.000 | 379.112 |
| drift-correction-exit | 6 | 40.8538 | 51.298 | -0.000 | 378.990 |
| drift-correction-exit | 8 | 40.8515 | 51.307 | -0.000 | 378.983 |
| Tsukuba | 2 | 24.4041 | 1.481 | -0.072 | 7.323 |
| Tsukuba | 3 | 24.4008 | 1.484 | -0.072 | 7.492 |
| Tsukuba | 4 | 24.3800 | 1.484 | -0.072 | 7.533 |
| Tsukuba | 6 | 24.3760 | 1.484 | -0.071 | 7.547 |
| Tsukuba | 8 | 24.3760 | 1.485 | -0.071 | 7.548 |
| FISCO | 2 | 28.2272 | 1.736 | -0.024 | 6.277 |
| FISCO | 3 | 28.2234 | 1.731 | -0.024 | 6.231 |
| FISCO | 4 | 28.2236 | 1.731 | -0.024 | 6.226 |
| FISCO | 6 | 28.2235 | 1.731 | -0.024 | 6.226 |
| FISCO | 8 | 28.2235 | 1.731 | -0.024 | 6.226 |

## Interpretation and limits

The constitutive equal-normalized-demand plateau increases each normalized force from
0.707107(p2) to0.793701(p3),0.840896(p4),0.890899(p6),0.917004(p8); each pure-axis
maximum remains1. This is the intended capacity-geometry change. It is not energy generation.

Ordinary protected coasting/power-on cornering changes little here. Trail-braking max
beta drops from about41.6 to39.1deg, but the strong entry raises it from48.0 to51.3deg.
Sustain/correction traces inherit this entry difference: higher LP does not uniformly
preserve speed or make correction easier. The correction/exit schedule reaches small
end beta for all values, with different speed and trajectory; it is not a measured
human steering-error margin or a guarantee of staying inside a particular corner.

Tsukuba replays last88.8417s and FISCO168.2417s. All reach beyond one authored lap
(2045/4563m); fixed-duration differences in final s are not lap-time measurements.
These runs do not award race laps or claim physical checkpoint/race acceptance.
The retained route regressions own that separate contract. Both course traces are mild
slip cases: this does not replace a human high-speed entry/power-on-exit evaluation.

Decision: retain p2 default. The experiment establishes an independent diagnostic axis,
with mixed transient effects. It does not establish more independent human control of
speed/beta/path, all-nine handling improvement, all-terrain safety or a new drift goal.
Human evaluation and wider error-envelope experiments remain open; no other tuning was changed.

## Browser evidence

Codex in-app browser against the actual local page passed the repeatable
`tools/combined-slip-ui-check.html` harness at320x568,390x844,568x320,844x390,1366x768.
It checks all seven groups and label bounds, default/plus/minus wrapping, B cycling,
unchanged other axes and320x240 canvas. Manual LP plus/B operations also changed2->2.5->3.
This is local implementation verification; final public deployment identity is recorded
by exact-head CI/Pages release evidence.
