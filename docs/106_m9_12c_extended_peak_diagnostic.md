# SUPER OUTRIDE — M9.12C Extended PEAK Diagnostic

## Status

Current scoped DEV browser calibration-range authority for PEAK exploration.

This document does not change the M9.10 tire constitutive law, M9.11 steering law, vehicle state,
wheel solve, production-profile mechanics, or the M9.12 GRIP/PEAK/SLIDE ownership model.

## Observation that motivated this tranche

Hands-on handling evaluation found that, at `GRIP=2.00`, increasing `PEAK` through the previous
upper limit improved controllability, with `PEAK=30%` preferred to lower values.

The relevant M9.12 relationship is conceptually:

```text
initial tire force slope ~ GRIP / PEAK
```

Therefore, at fixed `GRIP=2.00`:

```text
P20: 2.00 / 0.20 = 10.00
P30: 2.00 / 0.30 =  6.67
P40: 2.00 / 0.40 =  5.00
```

So the preference for P30 over P20 is not evidence that more peak force is required. Peak force is
held fixed by GRIP. It is evidence that a substantially lower initial tire-force slope and a wider
usable slip domain are preferred in the current reduced vehicle model.

Relative to P20, P30 lowers the initial slope by about one third. P40 would lower it by one half.

## Diagnostic interpretation

This is a falsification probe, not a claim that a real road tire should have 30–40% common peak
slip. The current one-k model uses one common normalized PEAK for longitudinal and lateral demand.
For lateral interpretation only:

```text
P30 -> atan(0.30) = 16.7 deg
P40 -> atan(0.40) = 21.8 deg
```

The same common value also means 30–40% longitudinal slip at the model peak, which is intentionally
allowed here as a diagnostic extension rather than a realism target.

If handling continues to improve monotonically toward P40, the strongest interpretation is that
PEAK is compensating for omitted or compressed lateral transient/compliance behavior rather than
identifying a literal production-tire parameter. Candidate omitted effects include tire relaxation,
body-roll transient/compliance, and left/right load-transfer dynamics. No such state is added by
this milestone.

The M9.11 steering transform may amplify the same observation because Driver offset D directly
creates front-wheel angle relative to travel direction. Lower tire stiffness converts that angle
into force/yaw more gradually without reducing the GRIP ceiling.

## Current DEV selector domain

M9.12C keeps the M9.12B GRIP and SLIDE domains and extends only PEAK:

```text
GRIP  = 2.00 / 2.20 / 2.40 / 2.60 / 2.80 / 3.00
PEAK  = 20 / 22 / 24 / 26 / 28 / 30 / 32 / 34 / 36 / 38 / 40 %
SLIDE = 70 / 75 / 80 / 85 / 90 %
```

Browser defaults remain:

```text
GRIP  = 2.00
PEAK  = 20%
SLIDE = 80%
```

The default is retained as a stable A/B reference. The user-selected working point is not promoted
to production authority while handling remains `DEV_UNCALIBRATED`.

With 6 GRIP choices, 11 PEAK choices and 5 SLIDE choices, the exposed tire-calibration product is
330 combinations. The regression suite must keep every combination finite in the retained scalar
implicit wheel solve.

## Scope supersession

This document supersedes document 105 only for the browser PEAK selector upper range. M9.12B's
GRIP domain, M9.12's independent calibration-axis semantics, M9.10 tire law, and M9.11 steering law
remain unchanged.
