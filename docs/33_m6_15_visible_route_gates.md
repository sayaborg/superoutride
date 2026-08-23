# M6.15 — Visible Route Gates

## Purpose

M6.15 connects the visible M6.13 fork to real gameplay route authority.

The two separated asphalt roads receive distinct world-space transverse route gates. A route choice is accepted only when the authoritative vehicle world-motion segment physically crosses one legal gate in the forward direction.

## DEV mapping

At the visible split:

```text
left child road  -> S1_LEFT / corresponding stage-local left choice
right child road -> S1_RIGHT / corresponding stage-local right choice
median           -> no route choice
```

The closed stadium remains only a validation fixture. The same physical fork may be reused on a later DEV lap to exercise the second Route DAG decision; this does not make the product a lap race.

## Invariants

- steering input is not route authority
- screen X is not route authority
- road sprite overlap is not route authority
- reverse crossing never validates a choice
- ambiguous multiple-gate crossing is rejected
- recovery resync cannot manufacture a gate crossing
- terminal completion still requires its explicit physical FINISH gate

The renderer remains unaware of the Route DAG.
