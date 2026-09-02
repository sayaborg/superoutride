# M9.12A — Centered Handling Comparison Ranges

Status: current normative DEV browser calibration-range authority.

Vehicle handling remains `DEV_UNCALIBRATED`.

## 1. Scope

M9.12A changes only the browser-facing comparison ranges and browser starting calibration used for
ongoing handling evaluation. It does not change the M9.11 steering law, M9.10/M9.12 tire
constitutive law, combined-slip allocation, wheel solver, suspension, vehicle profiles, course,
camera or renderer architecture.

The current working point requested for evaluation is:

```text
GRIP  = 2.00
PEAK  = 20%
SLIDE = 80%
D     = 12 deg
M     = 60 deg
ACT   = 0.25 s
```

## 2. Centered browser ranges

```text
GRIP  = 1.60 / 1.80 / 2.00 / 2.20 / 2.40
PEAK  = 16 / 18 / 20 / 22 / 24 %
SLIDE = 70 / 75 / 80 / 85 / 90 %
D     = 10 / 11 / 12 / 13 / 14 deg
M     = 50 / 55 / 60 / 65 / 70 deg
ACT   = 0.20 / 0.225 / 0.25 / 0.275 / 0.30 s
```

The browser starting point is the center entry for GRIP, PEAK, D, M and ACT and the retained
M9.12 `SLIDE=80%` working value.

## 3. Ownership and defaults

The compiled nine-vehicle profile steering seeds remain historical/mechanical construction data and
are not rewritten by this calibration-range change. The browser DEV steering adapter applies the
centered comparison point to the player instance when the browser calibration UI is mounted.
Selected calibration then remains the existing vehicle-instance authority and continues to survive
recovery/profile reconstruction through the ordinary calibration path.

The browser tire default is directly authored by the existing vehicle-instance tire calibration:

```text
effective GRIP = 2.00
PEAK slip      = 0.20
SLIDE          = 0.80
```

No new physics state is added.

## 4. Architecture Decision Gate

1. Existing steering/tire calibration owners already express every requested comparison value.
2. No new state, mode, assist, vehicle branch or tire package is required.
3. Centering belongs to browser DEV calibration, not to production vehicle identity.
4. GRIP/PEAK/SLIDE remain independent displayed axes under the M9.12 transformation contract.
5. `A=M-D` remains derived only; no steering authority is duplicated.
6. Tire post-peak remains lateral-demand-driven so the scalar implicit wheel solve remains
   monotone under the retained M9.10 proof.

## 5. Supersession

M9.12A supersedes:

- document 102 only for the current browser M/D/T comparison tables and browser starting point;
- document 103 only for the current browser GRIP/PEAK comparison tables and browser starting point.

It preserves:

- M9.11 steering equations;
- M9.12 three-axis independence;
- M9.10 lateral post-peak law;
- `SLIDE=80%` as the current evaluated working point;
- all production-profile mechanical data.

## 6. Acceptance

Release requires:

1. exact selector tables above;
2. browser player starts at `GRIP=2.00 / PEAK=20% / SLIDE=80% / D=12 / M=60 / ACT=0.25`;
3. one-axis changes preserve other tire-axis characteristics as in M9.12;
4. all M/D combinations preserve `A=M-D>0`;
5. the complete GRIP x PEAK x SLIDE product remains finite in the retained wheel solve;
6. full repository CI passes on the exact feature head;
7. release is pure fast-forward to unchanged main followed by same-SHA main CI and Pages deploy.
