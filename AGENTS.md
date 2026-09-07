# SeatLayer React Native agent guide

This repository is the public React Native SDK. The private SeatLayer platform
repository is not a dependency and must never be referenced from public docs,
metadata or release manifests.

## Public-repository hygiene — hard rule

- Commit only product source, tests, build/release automation, public examples,
  package metadata, and customer-facing integration, API, migration, or
  security documentation.
- Never commit planning documents, handovers, implementation audits or reviews,
  cross-SDK comparison matrices, manual QA journals, evidence bundles, dated
  progress reports, before/rejected captures, credentials, non-public hosts,
  private repository references, or developer-machine paths.
- Public product media belongs in `docs/media/`; regression images and fixture
  code belong only in automated test-fixture locations. Do not use the Git
  repository as an evidence archive.
- Record verification in CI and release checks, not in tracked screenshots or
  narrative proof documents.
- Run `pnpm check:public-hygiene` before committing or pushing.

## The picker's design source is copied, not authored

`design/tokens.json`, `design/locale_strings.json`, `design/components.md` and
`design/picker-spec.md` are copied verbatim from the picker's reference design
source and are never hand-edited here — change them at the source and copy them
across. `design/source-lock.json` pins the SHA-256 of the two machine-read
inputs, and `src/picker/tokens.g.ts` and `src/picker/strings.g.ts` are
generated from them (`pnpm picker:design`, checked by `pnpm
picker:design:check`). Never transcribe a token value into a component: read it
through `tokens.g.ts`, so the number the specification states is the number the
picker draws. See `design/README.md`.

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
