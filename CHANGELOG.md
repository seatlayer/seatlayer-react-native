# Changelog

## 0.1.2

- Updated the vendored buyer runtime to `seatlayer-js@0.48.1` (sha256
  `b459b0b6…`) for the current responsive picker, access-token, checkout, and
  duplicate-title behavior.
- Corrected the runtime SDK version constant to match the package version.

## 0.1.1

- Re-vendored the buyer bundle at `seatlayer-js@0.35.0`
  (sha256 `814657ba…`), up from 0.30.1. 0.1.0 shipped a renderer five
  releases behind the published web SDK.

## 0.1.0

- Initial React Native public preview.
- Typed iOS and Android WebView component.
- Version-negotiated SeatLayer bridge with correlation, timeout and stale-event
  protection.
- Selection, holds, best available, general admission, floors, zoom,
  accessibility controls and typed events.
- Expo-compatible example and vendored `seatlayer-js@0.30.1` buyer bundle.
