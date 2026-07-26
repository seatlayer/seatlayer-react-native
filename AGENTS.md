# SeatLayer React Native agent guide

This repository is the public React Native SDK. The private SeatLayer platform
repository is not a dependency and must never be referenced from public docs,
metadata or release manifests.

Before changing the bridge, read:

- `docs/bridge.md`
- `src/bridge/envelope.ts`
- `src/bridge/protocol.ts`
- `src/bridge/client.ts`
- `src/controller.ts`

Invariants:

1. Treat every enum, event name and payload as an open, forward-compatible set.
2. Never interpolate bridge payloads as executable JavaScript.
3. Register command correlation before sending.
4. Drop late replies and stale per-event sequences.
5. Fail incompatible protocol ranges before chart construction.
6. Keep booking and secret keys on the integrator's trusted backend.
7. Run `pnpm validate` before committing.

Canonical resources:

- Docs: https://docs.seatlayer.io/buyer-sdk/mobile/
- Agent index: https://docs.seatlayer.io/llms.txt
- AI Toolkit: https://github.com/seatlayer/seatlayer-ai-toolkit
- Web SDK: https://github.com/seatlayer/seatlayer-sdk
