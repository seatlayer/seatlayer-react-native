# React Native picker walkthrough

What the buyer sees, screen by screen, in the ready-made `SeatLayerPicker` on a
phone — and which part of the public API owns each surface. The wide layout is
the same picker with the room to keep more of it on screen at once; the
differences are called out where they matter.

Every number and every English word here is read from the picker's design
source in `design/`, which is locked to the shared picker specification by
content hash. A surface described below is drawn only where the loaded runtime
advertises the capability behind it: a capability the runtime does not
advertise is a feature this host does not offer, never a failure.

## 1. Opening

The picker fills its bounded parent. While the chart is loading it draws the
venue silhouette rather than a spinner, and that surface stays up until the
runtime reports the map framed inside the native chrome — with a short backstop
for a runtime that never answers — so the buyer's first sight of the map is at
its final size instead of a smaller one that re-fits in front of them.

A host that knows the picker is coming can warm the runtime page from the
screen before with `SeatLayerRuntimePrewarm`; a picker that finds nothing warm
starts cold with no other difference.

Set `eventName` to name the event in the header before the runtime reports it,
so the title does not swap a second after opening.

## 2. Header

The picker's own header stands on the picker's ground: the event name, the
close ring, and one clock. The hold countdown is drawn there for as long as a
live hold exists, whoever owns it — the collapsed cart carries no second one.
`showHoldPill` turns it off for a host drawing its own; `chrome.header` removes
the header entirely.

While the sale is closed, or a hold is running, the header states it in a pill
rather than in a message the buyer has to dismiss.

## 3. Price rail

Below the header, a band of its own at `size.topRailHeight`, on the map
chrome's surface. It leads with a pinned `All prices` chip that clears the
filter — and clears it to the whole venue, not to the section the buyer is
standing in — followed by one chip per category with its colour, its name and
its price. Where the runtime counts a category, the chip says how many are
left and strikes through when there are none; where it does not count, the chip
says nothing rather than zero. The band takes the map chrome's palette and
darkens with the 3D scene. `chrome.priceLegend` removes it.

## 4. The map

The chart itself owns pan and pinch. Around it:

- **`Map | 3D`** on the map's top-right corner, on the line below the rail, so
  the last price chip is never clipped under it and no seat number reads
  through the gaps.
- **The test badge** — a sentence-case `Test mode` pill with a status dot,
  standing flat on the map's top line, with its ink chosen against its own wash
  rather than against the page. It steps down only while the 3D scene's own
  return pill is drawn.
- **One corner disc** in the bottom right, carrying both camera directions in a
  single slot: `+` at the whole venue, `−` once a section is framed. It is
  never dimmed, never moved and never withdrawn. The wide layout gets the full
  set — overview, a zoom pair, fit — instead.
- **The accessibility control**, and beside it a `♿ 2 of 6 ›` stepper while an
  accessibility filter is on and the runtime offers the tour.
- **The floor rail** where the venue has floors, as chips on their own rail.

There is no section dock on a phone: the pinch and the one corner control are
the way back out to the venue. The wide layout keeps the dock, which names the
section the buyer is in, steps to its neighbours, and says how many of the
seats left there match the buyer's accessibility filter. A host can ask for the
dock on a phone with `chrome.dock`.

Every control drawn over the map reports its own rectangle to the runtime, so a
tap on a control is not also a tap on the seat underneath it, and a rectangle
keeps guarding for 600 ms after its control has gone.

## 5. Tapping a seat

The tapped seat becomes the candidate: the runtime paints it the way the web
paints it, and the paint clears with the card.

The map then goes behind glass — a veil, cleared to a feathered hole around
that seat — and pans, never zooms, so the seat rests at a constant fraction of
the band the card leaves clear. When the card goes the map is put back, unless
the buyer moved it in between. Install a blur module with
`setSeatLayerPickerSpotlightBlur` and the glass gains its blur; without one it
is the plain veil, which is a correct state. Reduced transparency drops the
blur and deepens the veil by itself.

The card is a fixed bottom sheet asking one question:

- section, row and seat as three equal labelled cells;
- a category band in the category's own colour, with its ink chosen for
  contrast and the price kept clear of the card's trailing edge;
- the seat's own photograph where the runtime names an authored view, with the
  distance to the stage riding it as a pill — or that distance as a muted
  caption where there is no photograph. The image is fetched over the buyer's
  own bearer, validated against the event first, cached for the session, and
  every failure collapses the strip into the plain rail rather than telling the
  buyer anything;
- `See it in 3D`, then `Cancel` beside `Add seat`.

`Add seat` invites once and breathes until the buyer touches the card; on the
press it sweeps, ticks and says `Added`, and the seat counts on the press
rather than on the server. A swipe down, a tap on the map and the platform's
back gesture all give the seat back. Nothing moves under reduced motion, and a
host that turned haptics off feels none of it.

Inside the 3D venue the same card appears, with `View from this seat`; a seat
carrying confidence evidence gets a teaser, which is a chip where the host
takes `onSeatConfidence` and a static information row otherwise.

## 6. Tapping a carted seat again

The same card comes up in its **Remove** state — failure colour, a cross rather
than a tick — over the seat that is still selected. Cancel, the tap outside,
the downward drag and the platform's back gesture all keep the seat; only the
button takes it, down the same path the cart row uses. The seat keeps its
ticket, its line and its money the whole time the card is asking. A seat
already under a hold is asked about too, rather than released in silence.

## 7. The cart

Collapsed, the bar is exactly its head — one number, so nothing can clip the
surface shorter than the row inside it. It carries the ticket count, the
summary, and one button: `Continue` with the total, or `✦ Find seats` on an
empty cart, which opens the sheet on the best-seats form. The whole head is the
tap and the swipe.

Open, it is a real bottom sheet with peek, content and full detents that tracks
the finger, rubber-bands and settles on a spring. Inside it:

- dense rows on one plate, each named by its section — else by its ticket type
  — with the held wash and a drawn lock on a held line, runs folded into one
  row, and a `+N more` row where the list is longer than the sheet;
- a swipe, or the row's `×`, to remove. The press is answered by the row in the
  same frame: it fades, its `×` goes inert, and the mark is dropped by the
  first snapshot that no longer carries the line. A failed removal restores the
  row and says so inline. Nothing else is announced — the line has gone, the
  total has moved, and re-picking the seat is the same gesture that chose it;
- the best-seats form as one track: a stepper and a ticket type, a zone row
  only where the venue has zones, and a full-width button;
- the checkout button, which says why it is waiting rather than only greying
  out — sales closed, a seat still to confirm or cancel, seats being secured,
  checkout opening, or what would fix a rejected selection;
- the `Powered by SeatLayer` credit, centred at the foot where a phone's
  rounded corner cannot clip it. Server branding is authoritative: a
  white-label entitlement hides it with no host-side switch.

## 8. Notices and states

The picker carries its own toast layer rather than borrowing the host app's, so
a seat taken, a hold expired or lapsed, and a closed sale dismiss on the
picker's own dwell on every host, each with a fixed 44-point action.

The designed full states are:

| State | What the buyer sees |
| --- | --- |
| Sold out | An overlay saying so, over the map. |
| Sales closed | A statement in the tray, and a pill in the header — not an error and not a toast. |
| Buyer session expired or unavailable | An access panel with its own retry, over a veiled picker. |
| Hold lapsed | A counted sentence with an action, matching what the toast said. |
| Seats already in checkout | `Your seats are already in checkout`, with `Release and change seats` — which gives the hold back so the seats go on sale again and the buyer picks afresh. The cart line keeps its `×` throughout. |
| A second hold on a picker-owned one | `Your seats are already held`, with the way on to checkout. |
| Booked | `You're all set`, with the seat list and a way back — shown when the handed-off hold settles to booked, not when it was handed over. `showBookedOverlay: false` keeps it down for a host with its own confirmation screen; `onBooked` fires either way. |

## 9. Accessibility

The accessibility sheet is a list of switch rows with free counts. Each switch
applies as it is flipped — there is no Apply step — and the sheet stays open so
a buyer with more than one need can flip more than one row. Opening it takes
down an unanswered seat card, so one decision surface holds the screen at a
time; its drag handle and its scrim are the way out.

Where a provision has free spaces its count is a button: it turns that
provision on, applies the filter, closes the sheet and frames the first section
holding a matching space. The stepper on the map then walks the rest, where the
map is visible rather than under a sheet that covers it. Both are drawn only
where the runtime advertises `accessibility-focus-v1`.

A screen reader walks the picker in buyer order — event, prices, map, then the
tray. On iOS that order needs one native feature flag from the host app; the
README says which, and the fallback is the paint order rather than a broken
screen. Everything else — the map as one named region, the card as a dialog
with custom actions, focus returning to the map, live regions only where a
change is news, type ceilings per surface, bold text, reduced motion and
reduced transparency — is answered by the picker with no host wiring.

## 10. Checkout handoff

`onCheckout` — or `onContinue` — receives the typed handoff. Send only the
`holdId` and your normal checkout context to your trusted backend, which
inspects the hold and books it after payment. The app never books, and never
carries a secret key.

See [the security boundary](../README.md#security-boundary) and
[seat holds and secure server-side checkout](https://docs.seatlayer.io/buyer-sdk/holds-and-checkout/).
