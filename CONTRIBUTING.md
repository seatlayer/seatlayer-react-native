# Contributing

1. Install Node.js 20.19.4 or newer and pnpm 11.10.
2. Run `pnpm install`.
3. Make focused changes with tests.
4. Run `pnpm validate`.
5. Open a pull request describing behavior, compatibility and verification.

This is a public SDK repository. Do not add internal plans, handovers, audit or
comparison notes, manual evidence captures, customer-specific development
hosts, credentials, or developer-machine paths. Customer-facing media belongs
in `docs/media/`; deterministic regression fixtures belong under `test/`.
`pnpm check:public-hygiene` enforces these boundaries in CI and releases.

The picker's design tokens, locale strings and specification under `design/`
are a copy of the shared source for every SeatLayer mobile SDK. Do not edit them
here, and do not edit the files they generate (`src/picker/tokens.g.ts`,
`src/picker/strings.g.ts`); run `pnpm picker:design` after copying a new source
across. `design/README.md` has the detail.

The venue-map bridge is shared across SeatLayer mobile SDKs. Preserve envelope
versioning, protocol negotiation, command correlation, per-event ordering,
unknown-field tolerance and the server-side booking boundary.
