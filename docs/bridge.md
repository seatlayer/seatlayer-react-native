# React Native bridge contract

SeatLayer uses one versioned envelope across React Native, Flutter, iOS and
future native Android integrations:

```json
{
  "sl": 1,
  "k": "hello | init | cmd | res | err | evt",
  "id": "rn1",
  "n": 12,
  "t": "hold",
  "p": {}
}
```

- `sl` is the envelope marker and envelope revision.
- `k` is the frame kind.
- `id` correlates `cmd` with exactly one `res` or `err`.
- `n` is a monotonic sequence on `evt` frames.
- `t` is the command or event name.
- `p` is a JSON payload whose fields are forward-compatible.

## Handshake

1. The hosted venue-map renderer sends `hello` with its protocol range, bundle
   version, commands and events.
2. React Native intersects that range with the SDK range.
3. React Native sends `init` containing its supported range, public
   configuration, host diagnostics and requested web chrome.
4. The bundle renders and sends `sys.ready`, or sends a typed incompatibility or
   rendering error.

No chart is constructed when the protocol ranges do not overlap.

## Capabilities and the command table

`hello` carries both the capability strings the renderer advertises and the
list of commands it accepts. A picker surface is drawn only where the
capability behind it is advertised, and a command is sent only where the table
lists it.

Three of the native-chrome commands — `picker.setSelectionFocus`,
`picker.setBlockedRegions` and `picker.frameSeat` — change nothing a snapshot
reports, so the contract gives them no capability string and their presence in
the command table is the whole gate. Each resolves with nothing on a renderer
that does not list it: a capability the renderer does not advertise is a
feature the host does not offer, never a failure.

## Transport

Web to React Native uses:

```js
window.ReactNativeWebView.postMessage(JSON.stringify(envelope));
```

React Native to Web uses `injectJavaScript`, but the envelope is first serialized
as JSON and then encoded again as a JavaScript string literal. Payload values are
therefore data, never executable source.

## Ordering and failures

- A command is registered before it is sent.
- A command times out after the configured deadline.
- A response for a timed-out or unknown id is dropped.
- Event ordering is tracked independently for each `t`.
- A sequence lower than the latest applied sequence for that event is dropped.
- Unknown kinds/events remain observable without crashing the chart.
