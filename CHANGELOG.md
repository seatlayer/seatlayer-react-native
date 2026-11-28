# Changelog

## Unreleased

**Season tickets** (with a map page that names `season-surface-v1` and
`season-app-shell-v1`)

- `SeatLayerSeasonPicker` and `SeatLayerSeasonPickerModal` open a Season:
  packages, map and cart under the event picker's header, with the Season's
  name, the club's mark and the hold clock. `onContinue` gives your server the
  hold to book; then call `controller.markBooked({ operationId })`. On ✕ or
  system Back the page asks the buyer first, and `onClose` receives the answer
  (`closed`, `released`, `kept` with the hold's operation id, or `booked`).
- With no page up and seats held, `onClose` receives `kept` and the hold's
  operation id.
- When the system ends the page (low memory), a new one opens on the same hold
  once the app is in front. A third time within a minute the failure view
  opens, with Try again. A Season that cannot open gets the event picker's
  failure view too.
- With `safeAreaInsets`, the page's cart runs to the bottom edge when the page
  takes the inset; otherwise a band of the cart's colour keeps it clear.
- `SeatLayerSeasonController`, `SeatLayerSeasonConfiguration` and
  `SeatLayerSeasonView` are there for a layout of your own; the page leaves the
  Season's name and the hold clock to your bar. A Season hold opens again with
  `initialOperationId` only for the buyer who placed it: pass that buyer's
  token too.

**Runs** (with a map page that names `group-surface-v1` and
`group-app-shell-v1`)

- `SeatLayerRunPicker` and `SeatLayerRunPickerModal` open a run, a few
  performances sold to one buyer as one hold, under the same header.
  `onContinue` gives your server a hold without prices, to price and book.
  Close and system Back release seats that were not handed off. It stays light
  or dark as it opened. `SeatLayerRunController`, `SeatLayerRunConfiguration`
  and `SeatLayerRunView` are there for a layout of your own.
- A lost page, a run that cannot open and `safeAreaInsets` work as on the
  Season.

**When the connection goes** (with a map page that names
`connection-state-v1`, map 1.0.7 or later; with an older page nothing new is
drawn)

- **Android apps need `ACCESS_NETWORK_STATE`** (see Install). Without it the
  map's web view is never told the phone is offline, and the picker only says
  "Updating…".
- "You’re offline" on the map's top line three seconds after the page reports
  the line gone, so a blink of the network says nothing. "Updating…" while it
  comes back, and "Back online" for 2.5 seconds once the seats have been read
  again. A line that is only retrying says "Updating…" after 10 seconds.
- With seats held, a second line: "Your seats are still held.", until the
  clock reaches 0:00. While the line is down a clock at 0:00 waits in grey
  until the server has said what happened.
- The status stands after the test badge, short of the Map/3D control. When
  its words do not fit there it takes the map's whole width under that line.
  It takes no touches. "You’re offline" and "Back online" are read once.
- A press without an answer says "Check your connection and try again." in
  the small message, not the red line; the red line stays for refusals. A
  server fault while securing seats says "Couldn’t reach checkout." with "Try
  again", which runs the app's checkout again. From 10 seconds into a hold or
  a best-seats search: "This is taking longer than usual. Please wait…".
- Opening: after 8 seconds, "The seat map is taking longer to load. Please
  wait…". A page that did not load because nothing answered shows "You’re
  offline" with "Try again", and while the app is in front opens itself again
  after 10 and 20 seconds, then every 30. A page whose server failed says
  "The seat map didn’t load" without the line about the connection.
- `SeatLayerPickerController` has `getConnection()`, `getConnectionShown()`
  and `subscribeConnection()`.
- Seven new words in the 43 languages: `offline`, `backOnline`, `stillHeld`,
  `updating`, `takingLonger`, `loadingTakingLonger`, `couldNotReachCheckout`.

**The map: 1.0.5 to 1.0.6**

- On a phone the level stack no longer narrows the whole map: the venue fits
  the full width above it, or beside it when it is too tall, and the stack
  never covers seats.
- When the accessibility filter takes the map to another level, the level
  stack marks that level.
- `selectObjects` with a seat on a level that is not drawn returns that seat
  and puts it in the cart at once. A closed section and the accessibility
  filter still refuse it.
- A whole or party table's `screenPoint` is the middle of its chairs, so the
  seat card sits on the table.

**The example app**

- It needs `EXPO_PUBLIC_SEATLAYER_API_BASE` and shows setup guidance without it.
  It no longer falls back to the production API, so a test key never goes
  there.

## 0.5.0

The map moves from `seatlayer-js@0.84.1` to `seatlayer-js@1.0.5`. Public names
stay; the changes below are the ones an app or a buyer can notice.

**Upgrading from 0.4**

- A phone held sideways now keeps the phone layout: the one-row cart at the
  foot, the levels at the top of the map. The wide layout needs a window whose
  shorter side is at least 600 points. An app that wants the wide layout on a
  phone held sideways passes `options.layout: 'wide'`.
- Take a sale from your own server. After it has booked, call
  `controller.markBooked({ holdId })`; only then do `onBooked` and "You're all
  set" come.
- 3D touch changed: one finger moves, a two-finger twist turns. For the earlier
  gestures and the Rotate / Move control, pass
  `options.touchNavigation3D: 'classic'`.
- "Powered by SeatLayer" is gone. `SeatLayerPickerAttribution` draws nothing,
  and the `sheetHandle…` and `sheetHeadHeight` sizes change nothing.

**The map**

- A standing area's line in the cart reads the area's name, for example
  "Floor".
- A standing area keeps its "N left" count after a theme or language switch.
- A hold the server never answers ends after 40 seconds with "Check your
  connection and try again." What else changed on the map is in the
  [changelog](https://docs.seatlayer.io/changelog/).
- A venue with several levels opens on its lowest level.
- 3D touch: one finger moves the view, a pinch zooms, a two-finger twist turns
  the venue and a two-finger drag tilts it. The Rotate / Move control is drawn
  only with `options.touchNavigation3D: 'classic'`, which also keeps the earlier
  gestures. The same holds for `SeatLayerPicker3DNavigationModeButton`.
- The 3D venue draws a standing crowd. `options.enable3DCrowd: false` turns it
  off.
- In a seat's 3D view, a map 560 points or wider shows a small plan of where the
  seat is.
- `setViewMode('iso')` and `setViewMode('perspective')` show the flat map.
- Seats with a price of their own, and events priced by tier and time, can be
  chosen and held.

**For the app**

- `options.pricing.categories` and `options.pricing.objects` show your own prices
  by category, ticket type and seat. `controller.setPricing` changes them on the
  open map.
- `controller.markBooked({ holdId })`, after your server has booked: the map shows
  the seats booked and the hold clock stops.
- **`onBooked` and "You're all set" (behaviour change)** come only when the page
  says the hold is booked, which it does after your server has booked and you
  call `controller.markBooked`. They also came when the handed-off hold left the
  map for another reason: the page was loaded again, by `retry()` or a changed
  setting such as the language, the checkout was rejected, or the hold was lost
  on the server. The buyer then read that their tickets were confirmed, and
  nothing was booked. Take a sale from your own server, never from `onBooked`.
- `SelectedSeat.floorId` and `SelectedSeat.levelName`, on a chart with two or more
  levels.
- `SeatLayerConfiguration.telemetry: false` stops the map page sending SeatLayer
  its load and error reports.

**The picker**

- A phone held sideways keeps the phone layout. The wide layout needs a window
  whose shorter side is at least 600 points, besides the width it needed before.
  `options.layout: 'wide'` is still honoured.
- "Powered by SeatLayer" is no longer drawn, on the map or under the cart.
  `SeatLayerPickerAttribution` is deprecated and draws nothing; its style slots
  change nothing.
- On a phone the cart is one row: the arrow that opens the list, the count and
  the total with the seats under them, and the checkout button. It is 65 points
  high, or 55 over the bottom strip of a phone that has one, where it was 107 or
  132; the same held sideways. The button's words stand on up to two lines; an
  app's own `holdAndCheckout` words do too. Where they need more, at a large text
  size on a narrow phone, the button goes under the others.
  - The words open the list as the arrow does, the list is at most 240 points
    high, and a new seat closes it.
  - `layout.cartPeekMaxHeight` still caps the list; the `sheetHandle…` and
    `sheetHeadHeight` sizes change nothing now.
  - An app's own `checkoutBar` part keeps the full width, under the words.
    `SeatLayerBookButton` placed anywhere else looks as it did.
- While a seat card asks, the row is faded and takes no press.
- While the row says why an action was refused, the open cart list gives way
  before the map does: the map keeps the line its Map/3D control stands on.
- The notice that seats are already in checkout is never cut. Wherever it fits,
  it stands whole as before. Where the screen has no room left for all of it,
  only its words scroll, and "Release and change seats" stands whole under them,
  on two lines where it needs them.
- The standing and table prompts fit a short screen, as sideways or at a large
  text size: they open with the number and the buttons in sight, and the name
  is a scroll away. They ran off the top of the screen.
- On a phone held sideways the map moves the seat out from under its card, as
  it does upright. The lift waited for a second layout that never came there,
  so the card covered the seat.
- The buttons in the standing and table prompts grow with their words at a large
  text size, and the two at the foot stand the same height. The words ran out
  of a 44-point box. At the default size nothing moves.
- The spotlight on the seat a card asks about stands on the seat. On a map at
  its edge, which could not move that far, it stood up to 120 points above it.
  The card always named the right seat.
- Under the seat card the map is darkened a little more than before. An app
  that installed a blur with `setSeatLayerPickerSpotlightBlur` keeps its blur
  and the lighter veil over it.
- On a phone the map's + stays in its place and dims when there is nothing more to
  zoom in to, where it left a gap between the other two buttons. The accessibility
  button stands over the others, 4 points further in, and is pressed over 44
  points.
- On a map too short for one column of them, as sideways with the list open,
  these buttons stand beside one another, and are never over Map/3D.
- When sales close, a buyer who holds seats can still continue to checkout. With
  no seats held the row says "Sales are closed" and the event's date, and has no
  button. `snapshot.event.startsAtLabel` carries that date.
- On a sold-out event the row stays under the statement with "Select seats",
  where it offered the finder or was not drawn.
- The checkout button says "Securing your seats…" until the seats are held, and
  "Seats secured. Opening checkout…" after. `useSeatLayerCheckoutCta` takes a
  third argument for it.
- A sold-out price can be pressed, so a filter on it can be taken off with the
  chip it was put on with. Its dot is grey, it is drawn at full strength while it
  is chosen, and a screen reader hears "Sold out".
- The word on the "Test mode" badge is not cut at a large text size.
- The Map and 3D words grow with the text size until they are as tall as the
  button, and stay at that size past it, where they spilled out of the button.
- A screen reader reads the "Test mode" badge's name and no sentence after it.
- On a phone the levels of a venue stand at the top of the map as one pill, under
  the Map / 3D control, and the "Test mode" badge one line lower. The list in the
  bottom corner is drawn only with `chrome.floorStrip: false` or where an app
  draws its own `floorStrip` part. `SeatLayerFloorStrip` draws that pill
  everywhere, where each level was a chip of its own.
- On a phone held sideways the pill stands on the line of the "Test mode" badge
  and the Map / 3D control where all three fit. The pill keeps the map's margin on
  both sides, and the chosen level comes into view by itself, without a motion
  where the system asks for less of it.
- `SeatLayerMapControls` takes `topInset`, the room something else needs at the top
  of the map. The column of map buttons stays under it, and makes a second column
  where it would not fit.
- The marks beside the kinds of seat in the accessibility sheet and beside the
  notes on the seat card are drawn without `react-native-svg` too. Without it they
  were missing. An app that installs its own renderer keeps it.
- The accessibility sheet starts with the two map switches, and the kinds of
  seat stand under "SHOW SEATS FOR". The "VIEW" heading is gone, so an override
  of `viewGroupTitle` changes nothing now.
  Held sideways, all of it scrolls under the title: the list had no room left.
  The list runs to the sheet's foot, with the room for the phone's strip after its
  last row. Names wrap and are never cut; at a large text size a count stands
  under its name.
  In a right-to-left language a switch that is on keeps its knob, and on an iPhone
  the headings stand at the reading side.
  On an iPhone held sideways this sheet and the other prompts open sideways, where
  they turned the screen upright.
- In a right-to-left language the drawn marks keep their shape: the tick on "Add
  seat", the cube beside it, the fit button, the wheelchair, the arrows of the 3D
  bar and of the section bar. The back arrow points to the reading side.
  - The price chips, the section bar, the seat card's fields and buttons, the 3D
    bar and the other rows run the way the app reads, where they ran the other way.
  - The light on a chosen seat stands on that seat, where it stood on the other
    half of the map.
  - On an iPhone a text stands at the reading side: the event's name, the seat
    card's notes, the seats in the cart.
  - On a phone held sideways the room beside the camera is kept on the camera's
    side, where it was kept on the other.
  - On an Android phone a name in the accessibility sheet keeps its last word.
  - Arabic letters join in the small headings, where spacing drew them apart.
- `SeatLayerPickerModal` turns with an iPhone, in every way the app itself
  supports: an app that supports only upright stays upright. The hold, the chosen
  seats and an open list stay. In an app that supports only sideways it stopped
  the app. `supportedOrientations`, React Native's own prop, names other ways.
  Upgrading: an app that keeps its own screens upright one by one, and not as a
  whole, passes `supportedOrientations={['portrait']}` to keep the picker upright.
- On a phone held sideways `SeatLayerPickerModal` is full screen, as it is upright.
  It became a dialog when the window was 700 points wide, and the map started
  again when an Android phone was turned. `presentation: 'dialog'` is still
  honoured.
- With no close button, the hold clock and the "Sales are closed" pill stand
  eight points clear of the header's edge.
- In the 3D venue the status bar stands on the dark ground its light text is
  chosen for.
- A standing area sold as one box offers only the party sizes it is sold in, and
  with the wheelchair filter on a standing area offers its wheelchair places.
  `GAArea` carries `bookingMode`, `minOccupancy`, `maxOccupancy`,
  `wheelchairPlaces` and `wheelchairAvailable`.
- Standing places the map could not hold are refused: the buyer reads "One or
  more seats were just taken. Please pick again.", and
  `SeatLayerPickerController.holdGA` rejects with `hold_unavailable`, where it
  resolved as if they were held.
- The view from a seat shows its whole title: at a large text size on a narrow
  phone the badge goes under the words, where the title ended in "…".
- In the 3D view the seat's name takes two lines where it needs them. Where "view
  from your seat" does not fit whole it is left out, then the section's name is
  shortened; a screen reader hears the whole line. At a large text size on a
  narrow phone the worded button stands over the arrows, which went off the sides
  of the screen.
- In the 3D view "Back to venue" takes the line under the Map / 3D control where
  the two do not fit side by side; it was drawn over the control. Its label may
  take two lines.

**Words and languages**

- 43 languages (Hindi, Indonesian, Korean, Malay, Thai and Vietnamese are new)
  with the hosted map's own sentences. Counted sentences use every plural
  form their language has.
- The caption in the 3D view names the row and the seat in the buyer's language,
  where it said "Row" and "Seat" in every language. Overrides of `rowIdentity` and
  `seatNumberIdentity` are still used. In Arabic, Hebrew and Persian the line reads from
  the right when the section's name is in Latin letters.
- A refused action says why: the seats that were taken, a type that is sold out,
  a limit and its number, no connection, a pause for maintenance, a private
  event's access. An error that carries its own `buyerMessage` is still shown as
  it is, and the error itself still reaches `onError` unchanged. An
  `errorMessage` override no longer reaches refused actions; it stands under the
  title when the map did not load.
- The error line shows its whole text, scrolls when it is very long, and closes
  with a × ("Dismiss error"). It goes when the buyer tries again.
- When the map did not load, the buyer reads "The seat map didn’t load" and
  "Check your connection and try again." over a filled Try again button.
- A picker opened with no network shows that view too, with Try again, where it
  showed an access panel over an empty map. `onError` gets the failure and
  `onReady` waits for a map.
- "Securing your seats…" and "Seats secured. Opening checkout…" stand on the
  checkout button without a spinner. An `openingCheckout` override is still used
  unless `seatsSecuredOpeningCheckout` is given.
- A table prompt says "Select table", or "Update table" for one in the cart. The
  3D venue says "Show whole venue", and the seat buttons "View from this seat"
  and "See it in 3D". Overrides of `confirmTable`, `chooseTableGuests`,
  `fitVenue` and `removeSeat` no longer reach these places: use `selectTable` /
  `updateTable`, `chooseGuestsCopy`, `fitWholeVenue` and `removeWord`.

**Money**

- Amounts have the decimals of their currency and a thousands mark, in the
  picker's language: `KWD 12.625`, `KWD 12,454.500`, `₹125,000`, `1.234,50 €`.
  Whole amounts still have no decimals. `pricing.formatter` is still used first.

**Colours**

- The text on the accent colour is white wherever white can be read on it, and
  a near-black (`#1A1200`) on pale accents; it was black on many mid-tone
  accents. The event's own `accentInk` is used where it can be read, with the
  app's accent too. An app's `onAccent` is used as before.

**When the system closes the map's page (low memory)**

- The picker loads the map again by itself, when the app is in front. A hold
  handed to checkout, or given as `initialHoldId`, is taken up again. Two
  reloads within a minute are automatic; after that the buyer gets the error
  view with Try again.
- `SeatLayerView` reports an `sl_transport` error on the controller. Change
  `reloadKey` to load the map again.
- A hold paid for while the map's page was closed is not reported with
  `onBooked`: take the sale from your own checkout. The picker opens with an
  empty cart and shows the seats as taken.

**Time limits**

- The map has 45 seconds to start (`handshakeTimeoutMs`, was 30).
- A command that can place a hold waits at least 45 seconds, longer than the map
  waits for the server, so a hold that worked is not reported as failed. Other
  commands keep `commandTimeoutMs`, 15 seconds by default.

## 0.4.1

- **`onBooked` and "You're all set" (behaviour change)** no longer come. They
  came when the handed-off hold left the map for any reason: the page was loaded
  again, by `retry()` or a changed setting such as the language, the checkout
  was rejected, as for a declined payment, or the hold was lost on the server.
  The buyer then read that their tickets were confirmed, and nothing was booked.
  The map page of this version says nothing of a sale, so the picker cannot
  know. Take a sale from your own server and show the confirmation from there.

## 0.4.0

The hosted runtime moves to `seatlayer-js@0.84.1`, and the phone picker is
rebuilt against the shared picker specification widget by widget. The
specification, its design tokens and its locale strings now live in `design/`
and are locked by content hash, so the generated `tokens.g.ts` and
`strings.g.ts` can no longer drift from the reference the other SDKs draw
from. Every number and every English word below is read from that source
rather than transcribed.

**The map**

- The picker's own header stands on the picker's ground with the venue name,
  the close ring and one clock: the hold countdown is drawn for as long as a
  live hold exists, whoever owns it.
- The price rail is a band of its own between the header and the map, at
  `size.topRailHeight`, leading with an `All prices` chip that clears the
  filter — and clears it to the whole venue, not to the section the buyer is
  standing in. A category the runtime counts prints what is left of it and
  strikes through when it is gone; a category it does not count says nothing
  rather than zero. On a phone the rail carries prices alone.
- The test-event badge is a sentence-case `Test mode` pill with a status dot,
  standing flat on the map's own top line, with its ink chosen against its own
  wash rather than against the page.
- The map's controls are ONE COLUMN in the trailing corner, headed by the
  accessibility disc — it no longer stands alone in the opposite corner — with
  the section stepper riding beside it. Under it the phone draws `+` and one
  whole-venue disc, and no `−`: a pinch already steps the camera out, and a
  disc that only sometimes had a step to take read as a control that sometimes
  worked. The whole-venue disc is ALWAYS live, so a pinched camera can always
  be brought home. `+` RETIRES at the zoom ceiling and among the seats rather
  than dimming — a disc that does nothing is the broken-map reading — but it
  keeps its slot, because the column is anchored at its foot and a disc that
  left the tree moved the accessibility disc under the thumb already reaching
  for it. The whole column goes while a seat card is asking; the `Map | 3D`
  control belongs to the top rail and stays. The limits are read from the
  runtime's `atVenueFit` and `canZoomIn`, which are present-only: an older
  runtime that leaves them off is never read as a ceiling.
- The floor rail draws to its own chips, rail and info tokens.
- There is no section dock bar by default on ANY width. `showDockBar` brings
  it back, and where it is drawn it says how many of the seats left where the
  buyer is standing match their accessibility filter.

**The seat card**

- The card is a fixed bottom sheet asking about one seat: section, row and
  seat as three equal cells, the category band in the category's own colour
  with its ink chosen for contrast, the price kept clear of the card's
  trailing edge, `See it in 3D`, and `Cancel` beside `Add seat`.
- **The card says what the seat is.** Under the category band it lists every
  attribute the seat carries as full-width bands, in one fixed order:
  accommodation types, the wheelchair provision, restricted view, obstructed
  view, premium seat, then the organizer's own sentence. The bands are drawn
  from one shared glyph set — twelve accommodations, three selling marks and
  the note — so the same seat wears the same mark on the card, in the cart and
  down the accessibility sheet. The warning and premium inks come from the
  theme (`warnText`, `premiumText`) and clear 4.5:1 in both modes.
- **No card over a seat nobody can take.** A sold seat, a seat not for sale
  and a seat another buyer is holding raise no card at all.
- The tapped seat is painted as the candidate the card is asking about, and
  the paint clears with the card (`picker.setSelectionFocus`).
- The map pans — never zooms — out from under the card, so the seat rests at a
  constant fraction of the band the card leaves clear, and is put back when the
  card goes unless the buyer moved the map in between (`picker.frameSeat`). On
  a runtime that can pan, the card's band is no longer reported as a viewport
  inset; an older runtime keeps the inset and its re-frame.
- Behind the card the map goes under glass: a veil at `opacity.confirmScrim`
  cleared to a feathered hole around the tapped seat, so the buyer can still
  see the seat they are being asked about. The hole FOLLOWS THE SEAT through
  the lift rather than sitting a band below it. Reduced transparency drops the
  blur and deepens the veil instead.
- **`Add seat` is one sentence with three beats.** A chip flies from the seat
  to the foot of the sheet; the count and the total swell to 1.3× with a blink
  of the accent when it LANDS; and only then does the map come back down from
  its lift. The card's own answer — the sweep, the tick and `Added` — counts
  the seat on the press rather than on the server. The sheet's handle is
  hidden while a card is up.
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

**The cart**

- **The sheet is one surface with a handle and a foot.** A white disc straddles
  its top edge over the map, half in and half out, with nothing drawn under it;
  the chevron lives inside the disc and turns over as the sheet opens, so the
  state and the control that changes it are one thing. Collapsed, the sheet is
  the foot alone — the total line and the button — and the cards wait behind
  the handle.
- **The foot says what the cart holds.** `No seats selected` on an empty cart,
  `N tickets` and the total once there is one, and under the count a muted line
  naming the seats, which opens the cards when it is tapped. There is no
  `From €25` line any more: it stated a price and offered nothing to do about
  it, on the one line a buyer reads to find out what they are about to pay. An
  empty cart offers a full-width `Find best seats`.
- **One ticket, one card.** The dense list is gone. Each card is a bordered
  ticket carrying the place, the position, the amount, the organizer's notes as
  a footnote under a hairline, a drawn lock and a warmer edge where the server
  has already set the seat aside, an eye to the view from that seat and a ✕,
  and a swipe to remove. The open cart caps the list at three cards and a
  sliver of the fourth and then scrolls inside its own box. A seat a card is
  still asking about is not listed until the buyer adds it.
- **A tap on a card takes the map to that seat and KEEPS THE SHEET OPEN.** The
  seat is framed in the room the open sheet leaves, so checking one seat after
  another no longer costs a re-open every time. The eye and the ✕ still do
  their own jobs.
- A press on a card's ✕ is answered in the same frame: it fades, the ✕ goes
  inert, and the mark is dropped by the first snapshot that no longer carries
  the line. A failed removal restores the card and states itself. Nothing is
  announced — the card has gone, the total has moved and the checkout action
  has recounted.
- The best-seats form is one track under a `Find seats together` title, with a
  ⓘ beside it explaining itself in a sentence: a stepper and a ticket type, a
  zone row only where the venue has zones, and a full-width button.
- The checkout call to action says why it is waiting, through one resolver
  shared by the collapsed foot, the sheet's button and the wide bar.
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
- **Seats added after checkout now count.** Back from checkout with the hold
  still running, a seat the buyer adds joins the cart at once, and `Continue`
  replaces the hold with every seat rather than refusing with `Your seats are
  already in checkout`. A second hold on a picker-owned one still says `Your
  seats are already held`, and the cart card keeps its ✕ the whole time the
  host owns the hold. See the caveat below: the picker completes its own cart
  from the selection, because the runtime's snapshot does not yet list those
  seats.
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
- A cart card reads as ONE node — the place, the position, the amount and the
  seat's notes in one sentence — with the eye and the ✕ left outside it as
  their own buttons, so neither is folded away where it cannot be reached. The
  sheet's handle is the cart's one named toggle and carries its expanded state.
- An accessibility row is the switch, whole, and its ⓘ and its count-as-jump
  are offered as ACTIONS ON THE ROW as well as drawn inside it: a target nested
  inside one accessibility element is ink a buyer can see and never reach.
- A change that is news is a live region and nothing else is: what the cart
  holds and what it comes to, where the buyer has arrived and how much room is
  left there, the hold's own countdown; not the card's own sentences, which do
  not change while the card is up.
- Type grows to a ceiling declared per surface (`type.scaleClamp`) and the
  boxes grow with it, so a sheet cannot push its own buttons off screen; the
  card's answer scales down before it truncates. Every stated weight is routed
  through the platform's bold-text setting, one step up and clamped.
- Reduced motion has a routing of its own for every animation the picker
  starts — the handle's chevron, the arrival of the cards, the landing swell
  and the fading of the control column — and the haptics gate is one switch, a
  pure policy and a swallowed failure.
- The accessibility sheet is one aligned list: fixed rows of icon, name, ⓘ,
  count and switch, hairlines between them, counts in their own column held
  clear of the switch, and the two map switches under a `View` heading that
  does not scroll away. It is bounded against the screen and scrolls inside
  the bound, so a chart carrying the whole vocabulary cannot take the map away
  from the buyer filtering it. It applies as it is flipped — there is no Apply
  step — and it takes down an unanswered seat card as it opens, so one
  decision surface holds the screen at a time.
- A provision the venue has sold out of shows `0` and goes dark rather than
  disappearing; a provision the runtime never counted shows no number and
  stays live, because absent is not zero. A switch that is ON stays live at
  zero: the buyer holding the last space is the one who emptied it, and a
  filter they cannot turn off traps them on a map with nothing left to show.
- Where a provision has free spaces its count is a button that turns the
  provision on, applies the filter, closes the sheet and frames the first
  section holding one; a `♿ 2 of 6 ›` stepper then walks the rest beside the
  accessibility control. Both are withheld from a runtime that does not
  advertise `accessibility-focus-v1`.
- Every provision is named in the buyer's own language in all 37 locales, and
  every row wears the drawing that row is about rather than one wheelchair
  standing for twelve different things.

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
come through, and the warning and premium inks the seat notes read are
host-overridable alongside them.

**Wording**

English is the wording the design data carries rather than a row in the
translation table: the two disagree on seven entries, and the specification
quotes the tokens. Other locales are unchanged apart from the new strings,
which carry the runtime's own translations.

**API**

This release is BREAKING. The dense phone ticket list and the `From €X` peek
line are gone, and with them:

- `SeatLayerPeekLine`, `splitSeatLayerFromPrice`, `seatLayerCartCheapestPrice`
  and `cartSheetMaximumBodyHeight`.
- The `peekLine`, `peekStatesReason`, `fromPriceText`, `totalText` and
  `showPrices` inputs on the checkout call to action.
- The `denseLine*` style slots, replaced by `cartCard*`.
- `cartDense.ts`, which is now `cartLines.ts`, with its types renamed to match.
- `strings.applyFilters` — nothing draws that label now that the sheet applies
  live; `strings.accessNoneLeft` — a sold-out provision shows a figure, and the
  legend closes with one grey `notAvailable` key.
- `onCartUndo` — a removal says nothing; and `SeatLayerBookButtonProps.compact`
  — the collapsed foot draws one button at one size.

Added:

- Options: `showDockBar`, `showHoldPill`, `eventName`, `showBookedOverlay`.
  `chrome.dock` and `chrome.showExtendHoldPrompt` resolve off on a phone and on
  in the wide layout; `showExtendHoldPrompt` is reserved — no prompt is drawn
  on any layout yet, and the option is carried so a host that sets it does not
  have to change when the wide prompt lands.
- Callbacks: `onBooked` and `onSeatConfidence`. `SeatLayerFloorStrip` takes an
  `onFloorInfo`.
- Controller members: `setSelectionFocus`, `setBlockedRegions`, `frameSeat`,
  `focusAccessibilityFilter`, `focusNextAccessibleSection`,
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
- `installSeatLayerPickerSvgIcons` and `setSeatLayerPickerSpotlightBlur`, the
  two hooks for a drawing dependency this package will not take itself.
- New exported surfaces include the cart card, the sheet handle, the sheet foot
  and its total line, the seat-note model and its shared glyph set, the cart
  landing provider, the add choreography, the blocked-region registry and its
  React binding, the spotlight glass, the seat lift, the buyer asset loader,
  the confidence teaser, the toast queue and layer, the checkout
  call-to-action resolver, the accessible stepper, the state overlays and
  access panel, the hold-ownership notice, the loading surface, the runtime
  prewarm, and the bold-text root.

**Two things to know before you upgrade**

- **The seat marks need a vector renderer on iOS.** With no drawing dependency
  the picker hands each glyph to `Image` as an SVG data URI, and iOS has no
  decoder behind `Image` that reads SVG, so on iOS the fallback draws nothing:
  the seat-note bands and the accessibility rows keep their words and lose the
  mark beside them. A host that wants the marks adds the optional
  `react-native-svg` peer and calls `installSeatLayerPickerSvgIcons({ Svg,
  Path, Circle })` once at start-up. Nothing else changes either way.
- **Seats added after checkout are carried by the picker's own cart.** The
  runtime's snapshot lists only the held seats on that path, so the picker
  completes its cart from the selection and hands `Continue` every seat. The
  runtime-side change that lists those seats in its own snapshot is not in a
  published runtime — 0.84.1 does not carry it — so this behaviour is the
  SDK's, and it will not change when that runtime ships.

**Prewarm is transport-only here**

A host may start the runtime page ahead of time, on a short TTL, dropped under
memory pressure. React Native's map view exposes no detachable controller — a
page belongs to the component that rendered it — so this SDK warms the
*transport*: DNS, TLS, the CDN edge and the HTTP cache entry for the runtime
document and, where the host names them, its bundles. The observable shape is
the same (a claim cheaper than a cold start, a short TTL, a drop under
pressure) and strictly smaller than a warm page.

**Runtime pin**

The hosted runtime moves to `seatlayer-js@0.84.1`. Views load
`https://cdn.seatlayer.io/seatlayer-js@0.84.1/mobile.html`.

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
