# Changelog

## 0.4.0

The hosted runtime moves to `seatlayer-js@0.80.3`, and the phone picker is
rebuilt against the shared picker specification widget by widget. The
specification, its design tokens and its locale strings now live in `design/`
and are locked by content hash, so the generated `tokens.g.ts` and
`strings.g.ts` can no longer drift from the reference the other SDKs draw
from. Every number and every English word below is read from that source
rather than transcribed.

**The map**

- The picker's own header stands on the picker's ground with the venue name,
  the close ring and one clock: the hold countdown is drawn for as long as a
  live hold exists, whoever owns it. The collapsed cart's `Continue` pill no
  longer carries a second one.
- The price rail is a band of its own between the header and the map, at
  `size.topRailHeight`, leading with an `All prices` chip that clears the
  filter — and clears it to the whole venue, not to the section the buyer is
  standing in. A category the runtime counts prints what is left of it and
  strikes through when it is gone; a category it does not count says nothing
  rather than zero.
- The test-event badge is a sentence-case `Test mode` pill with a status dot,
  standing flat on the map's own top line, with its ink chosen against its own
  wash rather than against the page.
- The phone's corner zoom control is one slot carrying both directions: `+` at
  the whole venue, `−` once a section is framed. It is never dimmed, never
  moved and never withdrawn. There is no section dock on a phone — the pinch
  and that one control are the way back out — though a host that asks for the
  dock explicitly still gets it.
- The floor rail draws to its own chips, rail and info tokens, and the section
  dock says how many of the seats left where the buyer is standing match their
  accessibility filter.

**The seat card**

- The card is a fixed bottom sheet asking about one seat: section, row and
  seat as three equal cells, the category band in the category's own colour
  with its ink chosen for contrast, the price kept clear of the card's
  trailing edge, `See it in 3D`, and `Cancel` beside `Add seat` — which
  answers the press with a sweep, a tick and `Added`, the seat counting on the
  press rather than on the server.
- The tapped seat is painted as the candidate the card is asking about, and
  the paint clears with the card (`picker.setSelectionFocus`).
- The map pans — never zooms — out from under the card, so the seat rests at a
  constant fraction of the band the card leaves clear, and is put back when the
  card goes unless the buyer moved the map in between (`picker.frameSeat`). On
  a runtime that can pan, the card's band is no longer reported as a viewport
  inset; an older runtime keeps the inset and its re-frame.
- Behind the card the map goes under glass: a veil at `opacity.confirmScrim`
  cleared to a feathered hole around the tapped seat, so the buyer can still
  see the seat they are being asked about. Reduced transparency drops the blur
  and deepens the veil instead.
- A second tap on a seat already in the cart raises the same card in its
  **Remove** state — failure colour, a cross rather than a tick — instead of
  dropping the seat in silence. Cancel, the tap outside, the downward drag and
  the platform's back gesture all keep the seat; only the button takes it. A
  seat already under a hold is asked about too (`seat.retap`).
- Where the runtime names an authored view for the seat, the card draws the
  seat's own photograph with the distance to the stage riding it as a pill, or
  as a muted caption where there is none. The image is fetched by the SDK over
  the buyer's own bearer, validated against the event before any request,
  cached for the session, and every failure collapses the strip into the plain
  rail rather than telling the buyer anything. Inside the 3D venue a seat
  carrying confidence evidence gets a teaser, which is a button only where a
  host takes `onSeatConfidence` and a static information row otherwise.

**The tray**

- The collapsed bar is exactly its head — one number, so nothing can clip the
  surface shorter than the row inside it — and the expanded cart is a real
  bottom sheet with peek, content and full detents that tracks the finger,
  rubber-bands and settles on a spring.
- Cart rows are dense 44-point rows on one plate, with the held wash, a drawn
  lock, a folded `+N more` row and a swipe to remove. A press on a row's × is
  answered by the row in the same frame: it fades, the × goes inert, and the
  mark is dropped by the first snapshot that no longer carries the line. A
  failed removal restores the row and states itself. Nothing is announced —
  the line has gone, the total has moved and the checkout action has recounted,
  and re-picking the seat is the same gesture that chose it.
- The best-seats form is one track: a stepper and a ticket type, a zone row
  only where the venue has zones, and a full-width button.
- The checkout call to action says why it is waiting, through one resolver
  shared by the collapsed pill, the sheet's button and the wide bar.
- The picker carries its own toast layer rather than borrowing the host's, so
  a seat taken, a hold expired or lapsed, and a closed sale dismiss on the
  picker's own dwell on every host, with a fixed 44-point action.

**States**

- Every buyer-facing state the reference draws exists natively and is designed
  rather than improvised: the sold-out overlay, the booked overlay with the
  seat list and a way back, the access panel with its own retry, the closed
  statement in the tray, and the hold and closed pills in the header. The
  picker is veiled only for an unavailable or expired buyer session.
- "You're all set" waits for the sale. It appears when the handed-off hold
  settles to booked, not when the hold was handed over — a buyer who came back
  from checkout without paying is no longer congratulated over a running hold.
- A buyer back from checkout who tries to change their seats is told `Your
  seats are already in checkout` and offered `Release and change seats`, which
  gives the hold back so the seats go on sale again; a second hold on a
  picker-owned one says `Your seats are already held`. The cart line keeps its
  × the whole time the host owns the hold.
- The runtime page can be warmed ahead of the picker, the warm page is adopted
  only after the picker has been laid out, and the loading surface — the venue
  silhouette, not a spinner — stays up until the map has been framed inside
  the native chrome, with a short backstop for a runtime that never answers.

**Chrome over the map is guarded by the runtime**

Every control drawn over the map, the raised card, and any sheet or dialog
over the page reports its rectangle (`picker.setBlockedRegions`); the runtime
swallows a touch that starts inside one, and a rectangle keeps guarding for
600 ms after its control has gone. Rectangles are measured against the map
surface itself, so a control keeps its guard wherever the surrounding chrome
puts it.

**Accessibility**

- The picker declares one reading order — event, prices, map, then the tray —
  rather than the order the views are painted in, with each rung able to carry
  more than one surface. On iOS that order is honoured only where the app
  turns React Native's accessibility-order feature flag on; the README says
  which flag and where, and the fallback is the paint order rather than a
  broken screen.
- The map is one named region with a hint naming the controls around it, the
  page is hidden under a decision surface, the seat card is a dialog with
  custom actions, and focus is handed back to the map when a card or a toast's
  action is done with it.
- A change that is news is a live region and nothing else is: where the buyer
  has arrived and how much room is left there, the hold's own countdown; not
  the card's own sentences, which do not change while the card is up.
- Type grows to a ceiling declared per surface (`type.scaleClamp`) and the
  boxes grow with it, so a sheet cannot push its own buttons off screen; the
  card's answer scales down before it truncates. Every stated weight is routed
  through the platform's bold-text setting, one step up and clamped.
- Reduced motion has a routing of its own for both settle springs, and the
  haptics gate is one switch, a pure policy and a swallowed failure.
- The accessibility sheet applies as it is flipped — there is no Apply step —
  and it takes down an unanswered seat card as it opens, so one decision
  surface holds the screen at a time. Where a provision has free spaces its
  count is a button that turns the provision on, applies the filter, closes
  the sheet and frames the first section holding one; a `♿ 2 of 6 ›` stepper
  then walks the rest beside the accessibility control, where the map is
  visible. Both are withheld from a runtime that does not advertise
  `accessibility-focus-v1`.
- Only a row that names an access need wears the wheelchair mark.

**Immersive chrome**

The 3D venue and the seat view wear one dark glass, mixed in a single place,
so the two scenes cannot drift apart; the credit mark keeps its one size and
its own two colours on it.

**Theme layering**

A resolved mode owns the ground and the organizer only tints it. The ground
roles now resolve host, then the selected brand, then the mode's preset, and
only then the organizer, so a chart saved against a dark canvas can no longer
paint the picker's own chips and plates with its map colours. The brand roles
— the accent, its ink, the radius and the typeface — are unaffected and still
come through.

**Wording**

English is the wording the design data carries rather than a row in the
translation table: the two disagree on seven entries, and the specification
quotes the tokens. Other locales are unchanged.

**API**

- New options: `showBookedOverlay`, `eventName`, `showHoldPill`. `chrome.dock`
  and `chrome.showExtendHoldPrompt` now resolve off on a phone and on in the
  wide layout; `showExtendHoldPrompt` is reserved — no prompt is drawn on any
  layout yet, and the option is carried so a host that sets it does not have to
  change when the wide prompt lands.
- New callbacks: `onBooked` and `onSeatConfidence`. `SeatLayerFloorStrip` takes
  an `onFloorInfo`.
- New controller members: `setSelectionFocus`, `setBlockedRegions`,
  `frameSeat`, `focusAccessibilityFilter`, `focusNextAccessibleSection`,
  `subscribeSeatRetap`, `subscribeBooked`, `getCheckoutHandoff`,
  `getBookedHandoff`, `releaseHandoffAndChangeSeats`, and the capability
  getters `supportsSelectionFocus`, `supportsBlockedRegions`,
  `supportsFrameSeat`, `supportsAccessibilityFocus`,
  `supportsAccessibleSectionTour`, `supportsHandoffReject`.
  `setSelectionFocus`, `setBlockedRegions` and `frameSeat` change nothing a
  snapshot reports, so the contract gives them no capability string and their
  presence in the runtime's `hello` command table is the whole gate. Each
  answers with nothing on a runtime that does not list it: a capability the
  runtime does not advertise is a feature this host does not offer, never a
  failure.
- New exported surfaces include the blocked-region registry and its React
  binding, the spotlight glass, the seat lift, the buyer asset loader, the
  confidence teaser, the toast queue and layer, the checkout call-to-action
  resolver, the accessible stepper, the state overlays and access panel, the
  hold-ownership notice, the loading surface, the runtime prewarm, and the
  bold-text root.
- Removed: `strings.applyFilters` — nothing draws that label now that the
  sheet applies live; `onCartUndo` — a removal says nothing; and
  `SeatLayerBookButtonProps.compact` — the collapsed bar draws one button at
  one size.

**Prewarm is transport-only here**

A host may start the runtime page ahead of time, on a short TTL, dropped under
memory pressure. React Native's map view exposes no detachable controller — a
page belongs to the component that rendered it — so this SDK warms the
*transport*: DNS, TLS, the CDN edge and the HTTP cache entry for the runtime
document and, where the host names them, its bundles. The observable shape is
the same (a claim cheaper than a cold start, a short TTL, a drop under
pressure) and strictly smaller than a warm page.

**Runtime pin**

The hosted runtime moves to `seatlayer-js@0.80.3`. Views load
`https://cdn.seatlayer.io/seatlayer-js@0.80.3/mobile.html`.

## 0.3.4

- Adds the protocol-2 native picker with ready-made, customisable and
  custom-layout integrations, generated themes and locale strings, standalone
  scoped chrome, adaptive modal presentation, and capability-gated actions.
- Preserves the protocol-1 raw venue-map surface and its existing public API.
- Moves the immutable hosted runtime pin to `seatlayer-js@0.71.5`, matching the
  reference picker contract and its availability-refresh, access-needs and
  hold-lapse recovery capabilities.
- Documents and wires the example's supported publishable-key bootstrap while
  keeping private inventory on the buyer-token provider path.
- Adds deterministic light/dark fixture coverage, the expanded Expo example,
  and package, generated-file, source-size and public-copy validation gates.
- Keeps API-required `Powered by SeatLayer` attribution at the bottom-right of
  compact and wide picker chrome, while server white-label entitlement remains
  the only switch that hides it.
- Replaces the customer-specific development example with a generic public-key
  integration and adds a repository-wide public hygiene gate.

## 0.2.1

- Documentation only. Refreshes the README and adds frequently asked
  questions. No API or behaviour changes.

## 0.2.0

- Uses the pinned hosted `seatlayer-js@0.66.0/mobile.html` document at
  `https://cdn.seatlayer.io`; buyer access tokens must be minted for that exact
  allowed origin. Private configuration fails closed unless the bridge advertises
  `native-access-provider`.
- Adds programmatic selection/category controls, exact-count validators, typed
  validity/access events, selected-object unavailability, and view-mode parity.
- Reloads the hosted venue-map renderer when configuration identity changes
  without serializing credentials into React keys; callback-only rerenders no
  longer restart the handshake.
- Removes the unused legacy inline-document generation pipeline and reports the
  production dependency as `seatLayerHostedWebVersion`.

## 0.1.3

- Updated the vendored buyer runtime to `seatlayer-js@0.59.0` (sha256
  `89bc29fb…`), pulled from the production CDN and byte-verified against the
  published release. Brings the mobile buyer round — an always-visible price
  rail, a locator that survives a filling cart, a venue overview that no longer
  covers the seats, accessibility filters that cannot be missed — plus the
  engine fixes that reach every surface: section focus frames the section
  rather than its whole zone, the price filter dims section blocks and not only
  seats, and map type is sized for the device.

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
- Typed iOS and Android venue-map component.
- Version-negotiated SeatLayer bridge with correlation, timeout and stale-event
  protection.
- Selection, holds, best available, general admission, floors, zoom,
  accessibility controls and typed events.
- Expo-compatible example and vendored `seatlayer-js@0.30.1` buyer bundle.
