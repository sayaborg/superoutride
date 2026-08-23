# M6.1 — Bounded Continuous Race Progress

## 1. Purpose

M6.0 established the hard gameplay authority boundary:

```text
physical ordered race gates -> validated race state
raw s_car                  -> geometry only
```

That is safe for lap validation but a gate-quantized `s_progress` is too coarse for ranking two vehicles within the same sector.

M6.1 therefore makes `s_progress` continuous **without restoring raw chainage as race authority**.

The rule is:

> Raw geometric chainage may interpolate only inside the sector already authorized by the physical checkpoint sequence.

---

## 2. Two progress values

Race state now keeps two distinct values:

```text
validatedProgressFloor
    last physically accepted checkpoint/finish in cumulative race meters

sProgress
    continuous ranking progress, bounded by the currently validated sector
```

The current legal window is:

```text
floor   = validatedProgressFloor
ceiling = cumulative position of next required gate
```

Therefore always:

```text
floor <= sProgress <= ceiling
```

The ceiling cannot move to the next sector until the required physical gate is actually accepted.

---

## 3. Continuous interpolation

For two consecutive geometry samples:

```text
previous.sLocal
current.sLocal
```

M6.1 computes the signed cyclic chainage delta:

```text
deltaS = wrapSigned(current.sLocal - previous.sLocal, L)
```

But `deltaS` is not trusted by itself.

The actual world movement vector is projected onto the Guide tangent to classify motion as:

```text
FORWARD
REVERSE
STATIONARY
```

Interpolation then uses:

```text
FORWARD    -> max(0, deltaS)
REVERSE    -> min(0, deltaS)
STATIONARY -> 0
```

This means a world→course projection jump with no corresponding world motion cannot advance race progress.

Finally:

```text
sProgress = clamp(sProgress + interpolationDelta, floor, ceiling)
```

So even a bad geometric projection cannot cross an unvalidated checkpoint boundary.

---

## 4. Physical gate authority remains unchanged

M6.1 does not weaken M6.0 gate rules.

A checkpoint/lap transition still requires:

1. actual previous→current world movement segment;
2. physical intersection with the transverse gate plane;
3. intersection inside the Guide lateral envelope;
4. forward crossing;
5. correct authored checkpoint order.

Reverse crossings do not validate.

Out-of-order forward crossings remain shortcut violations.

At most one forward gate may be accepted per physics update.

---

## 5. Crossing a valid gate

When the expected gate is physically accepted, `validatedProgressFloor` moves to that gate.

A physics step may cross the gate partway through the step. If the segment/gate intersection occurs at parameter `u`, only the post-gate fraction of the interpolation delta is carried into the newly opened sector:

```text
residual = max(0, interpolationDelta * (1-u))

sProgress = clamp(
    validatedProgressFloor + residual,
    newFloor,
    newCeiling
)
```

This avoids a one-tick ranking stall while preserving the exact gate as the authority transition.

---

## 6. Reverse motion

Inside an already validated sector, reverse world motion may lower continuous ranking progress.

However:

```text
sProgress >= validatedProgressFloor
```

always holds.

Thus reversing cannot undo an already validated checkpoint sequence, and it cannot manufacture a previous-lap state.

Reverse physical gate crossings are still counted diagnostically but never award progress.

---

## 7. Shortcut behavior

Suppose CP1 is the next required gate.

If geometry projects the car beyond CP1 without a valid physical CP1 crossing:

```text
sProgress -> saturates at CP1 ceiling
nextGate  -> remains CP1
floor     -> remains previous validated floor
```

The same rule applies to every later checkpoint and FINISH.

Therefore continuous ranking is smooth during valid travel but cannot turn a shortcut into validated race progress.

---

## 8. Recovery / teleport

Recovery uses explicit observation resynchronization.

It changes:

```text
previous world/race sample
```

but does not change:

```text
validatedProgressFloor
sProgress
nextGateIndex
lapIndex
```

Thus recovery neither awards nor erases race position.

---

## 9. Initial spawn

The current DEV vehicle starts at approximately `s=45m`, already inside sector 0 before CP1.

M6.1 allows the initial `sProgress` to seed from geometric `sLocal` only when that initial point is inside sector 0:

```text
0 <= initial sLocal <= CP1
```

This avoids displaying zero progress at a legitimate non-zero starting location while still leaving:

```text
validatedProgressFloor = 0
nextGate = CP1
```

No checkpoint is falsely validated by initialization.

---

## 10. HUD

The runtime debug HUD now shows:

```text
RACE L# <continuous sProgress>m NEXT <gate> <direction>
WIN <floor>..<ceiling> GEO <raw sLocal> CUT <violations>
```

This makes the authority separation observable during live driving.

The renderer remains unaware of race progress.

---

## 11. Validation

Validated feature head:

```text
27bf4c94823fe6e052f4090885db71377dea6123
```

GitHub Actions:

```text
run 32613807085
job 97131005528
```

Result:

```text
123 tests
123 pass
0 fail
```

M6.1-specific proofs include:

- initial sector-0 smooth progress seed without checkpoint validation;
- forward continuous interpolation;
- stationary world motion blocks raw chainage jump progress;
- interpolation saturates at the next unvalidated checkpoint;
- reverse interpolation cannot fall below the last validated gate;
- after CP1, the legal ceiling moves to CP2 only because CP1 was physically accepted.

---

## 12. Next

With race position now both secure and continuous, the next gameplay layer can consume `sProgress` for race timing/ranking without touching renderer geometry.
