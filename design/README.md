# SeatLayer picker design source

`tokens.json`, `locale_strings.json`, `components.md` and `picker-spec.md` are
copied verbatim from the SeatLayer picker's reference design source and are
never hand-edited here: change them at the source, then copy them across.
`source-lock.json` pins the SHA-256 of the two machine-read inputs so a stale or
locally-modified copy fails the test suite instead of drifting silently.

- **`tokens.json`** — every colour, size, radius, elevation, opacity, type step,
  motion duration, curve, physics constant, haptic cue and default string, in a
  platform-neutral form. Colours are hex strings, durations are milliseconds,
  curves are named cubic béziers.
- **`locale_strings.json`** — the translated buyer-facing strings, per locale.
- **`components.md`** — the component catalogue: for each surface, its snapshot
  inputs, states, anatomy in terms of the tokens above, style slots, callbacks
  and the bridge commands it issues.
- **`picker-spec.md`** — the behavioural specification the chrome is built to.

## The package generates its defaults from these files

`src/picker/tokens.g.ts` and `src/picker/strings.g.ts` are generated. Do not
edit them.

```bash
pnpm picker:design          # regenerate after copying new design source
pnpm picker:design:check    # fail if the generated output is stale
```

`test/design-source-lock.test.ts` re-hashes the inputs against
`source-lock.json`, and `pnpm validate` runs both that test and the `--check`
guard, so the copies and the generated output cannot drift.

## One source for every mobile SDK

`tokens.json` is the design source for all the SeatLayer mobile SDKs, not for
this one alone. Keep it free of any key only one platform could consume.
