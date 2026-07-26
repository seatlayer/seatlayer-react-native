# Contributing

1. Install Node.js 20.19.4 or newer and pnpm 11.10.
2. Run `pnpm install`.
3. Make focused changes with tests.
4. Run `pnpm validate`.
5. Open a pull request describing behavior, compatibility and verification.

The WebView bridge is shared across SeatLayer mobile SDKs. Preserve envelope
versioning, protocol negotiation, command correlation, per-event ordering,
unknown-field tolerance and the server-side booking boundary.
