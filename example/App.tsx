import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  I18nManager,
  Image,
  LogBox,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  SeatLayerPicker,
  type SeatLayerConfiguration,
  type SeatLayerPickerCallbacks,
  type SeatLayerPickerCheckoutHandoff,
} from '@seatlayer/react-native';

import {
  createSeatLayerAccess,
  fetchDemoEvents,
  fetchEventDetail,
  hasDesiPassApiKey,
  type DesiPassEventDetail,
  type DesiPassEventSummary,
  type DesiPassSeatLayerAccess,
} from './desipass';
import {
  parseSeatLayerVisualFixture,
  SeatLayerPickerVisualFixture,
} from './visual-fixtures/PickerVisualFixture';

const visualFixture = parseSeatLayerVisualFixture(
  process.env.EXPO_PUBLIC_SEATLAYER_VISUAL_FIXTURE,
);

// The validation shell still uses React Native's built-in safe-area wrapper;
// keep its framework deprecation notice from covering the picker under test.
LogBox.ignoreLogs(['SafeAreaView has been deprecated']);

if (visualFixture) {
  LogBox.ignoreLogs(['Packager status check returned unexpected result']);
}

// React Native resolves start/end direction only at process startup. A visual
// fixture requests its native direction once; the harness restarts its
// dedicated simulator before capture so mirroring is never faked with styles.
if (visualFixture && I18nManager.isRTL !== (visualFixture.scenario === 'rtl')) {
  I18nManager.allowRTL(true);
  I18nManager.swapLeftAndRightInRTL(true);
  I18nManager.forceRTL(visualFixture.scenario === 'rtl');
}

type DemoRoute = 'list' | 'details' | 'picker' | 'checkout';

const desiPassRed = '#E54558';
const desiPassInk = '#3B2D4C';

export default function App() {
  if (visualFixture) return <SeatLayerPickerVisualFixture {...visualFixture} />;
  return <DesiPassDemo />;
}

function DesiPassDemo() {
  const [route, setRoute] = useState<DemoRoute>('list');
  const [events, setEvents] = useState<readonly DesiPassEventSummary[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [eventsError, setEventsError] = useState<string>();
  const [selected, setSelected] = useState<DesiPassEventSummary>();
  const [detail, setDetail] = useState<DesiPassEventDetail>();
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string>();
  const [handoff, setHandoff] = useState<SeatLayerPickerCheckoutHandoff>();

  const loadEvents = useCallback(async () => {
    setEventsLoading(true);
    setEventsError(undefined);
    try {
      const result = await fetchDemoEvents();
      setEvents(result);
      if (result.length === 0) {
        setEventsError('No SeatLayer demo events are available.');
      }
    } catch (error) {
      setEventsError(messageOf(error));
    } finally {
      setEventsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  const openDetails = useCallback(async (event: DesiPassEventSummary) => {
    setSelected(event);
    setDetail(undefined);
    setDetailError(undefined);
    setDetailLoading(true);
    setRoute('details');
    try {
      setDetail(await fetchEventDetail(event.id));
    } catch (error) {
      setDetailError(messageOf(error));
    } finally {
      setDetailLoading(false);
    }
  }, []);

  if (!hasDesiPassApiKey()) return <SetupScreen />;

  if (route === 'details' && selected) {
    return (
      <EventDetailScreen
        event={detail ?? selected}
        loading={detailLoading}
        error={detailError}
        onBack={() => setRoute('list')}
        onBookNow={detail ? () => setRoute('picker') : undefined}
        onRetry={() => void openDetails(selected)}
      />
    );
  }

  if (route === 'picker' && detail) {
    return (
      <EventPickerScreen
        event={detail}
        onBack={() => setRoute('details')}
        onCheckout={(nextHandoff) => {
          setHandoff(nextHandoff);
          setRoute('checkout');
        }}
      />
    );
  }

  if (route === 'checkout' && detail && handoff) {
    return (
      <CheckoutScreen
        event={detail}
        handoff={handoff}
        onDone={() => {
          setHandoff(undefined);
          setSelected(undefined);
          setDetail(undefined);
          setRoute('list');
        }}
      />
    );
  }

  return (
    <EventListScreen
      events={events}
      loading={eventsLoading}
      error={eventsError}
      onEventPress={(event) => void openDetails(event)}
      onRetry={() => void loadEvents()}
    />
  );
}

function EventListScreen({
  events,
  loading,
  error,
  onEventPress,
  onRetry,
}: {
  readonly events: readonly DesiPassEventSummary[];
  readonly loading: boolean;
  readonly error?: string;
  readonly onEventPress: (event: DesiPassEventSummary) => void;
  readonly onRetry: () => void;
}) {
  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.pageHeader}>
        <Text style={styles.eyebrow}>DESIPASS DEV</Text>
        <Text style={styles.pageTitle}>Events</Text>
        <Text style={styles.pageSubtitle}>Choose an event to validate SeatLayer.</Text>
      </View>
      {loading && events.length === 0 ? (
        <LoadingState label="Loading events…" />
      ) : error && events.length === 0 ? (
        <ErrorState message={error} onRetry={onRetry} />
      ) : (
        <FlatList
          data={events}
          keyExtractor={(event) => event.id}
          contentContainerStyle={styles.eventList}
          ItemSeparatorComponent={() => <View style={styles.eventGap} />}
          refreshing={loading}
          onRefresh={onRetry}
          renderItem={({ item }) => (
            <EventCard event={item} onPress={() => onEventPress(item)} />
          )}
        />
      )}
    </SafeAreaView>
  );
}

function EventCard({
  event,
  onPress,
}: {
  readonly event: DesiPassEventSummary;
  readonly onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${event.title}`}
      onPress={onPress}
      style={({ pressed }) => [styles.eventCard, pressed && styles.pressed]}
    >
      <EventImage event={event} style={styles.cardImage} />
      <View style={styles.cardBody}>
        <Text style={styles.eventDate}>{formatEventDate(event)}</Text>
        <Text numberOfLines={2} style={styles.eventTitle}>{event.title}</Text>
        <View style={styles.cardMetaRow}>
          <Text numberOfLines={1} style={styles.eventMeta}>⌖ {eventLocation(event)}</Text>
          <Text style={styles.eventPrice}>{eventPrice(event)}</Text>
        </View>
      </View>
    </Pressable>
  );
}

function EventDetailScreen({
  event,
  loading,
  error,
  onBack,
  onBookNow,
  onRetry,
}: {
  readonly event: DesiPassEventSummary | DesiPassEventDetail;
  readonly loading: boolean;
  readonly error?: string;
  readonly onBack: () => void;
  readonly onBookNow?: () => void;
  readonly onRetry: () => void;
}) {
  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="dark-content" />
      <BackBar title="Event details" onBack={onBack} />
      <ScrollView contentContainerStyle={styles.detailContent}>
        <EventImage event={event} style={styles.heroImage} />
        <Text style={styles.detailDate}>{formatEventDate(event)}</Text>
        <Text style={styles.detailTitle}>{event.title}</Text>
        <View style={styles.detailBlock}>
          <Text style={styles.detailLabel}>WHEN</Text>
          <Text style={styles.detailValue}>{formatEventDate(event)}</Text>
        </View>
        <View style={styles.detailBlock}>
          <Text style={styles.detailLabel}>WHERE</Text>
          <Text style={styles.detailValue}>{eventLocation(event)}</Text>
          {event.venueDetail?.venueAddress ? (
            <Text style={styles.detailSecondary}>{event.venueDetail.venueAddress}</Text>
          ) : null}
        </View>
        {loading ? <ActivityIndicator color={desiPassRed} style={styles.inlineLoader} /> : null}
        {error ? <ErrorState compact message={error} onRetry={onRetry} /> : null}
      </ScrollView>
      <View style={styles.bookingBar}>
        <View>
          <Text style={styles.bookingPrice}>{eventPrice(event)}</Text>
          <Text style={styles.bookingCaption}>onwards</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          disabled={!onBookNow}
          onPress={onBookNow}
          style={({ pressed }) => [
            styles.bookButton,
            !onBookNow && styles.buttonDisabled,
            pressed && onBookNow && styles.pressed,
          ]}
        >
          <Text style={styles.bookButtonLabel}>{loading ? 'LOADING…' : 'BOOK NOW'}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function EventPickerScreen({
  event,
  onBack,
  onCheckout,
}: {
  readonly event: DesiPassEventDetail;
  readonly onBack: () => void;
  readonly onCheckout: (handoff: SeatLayerPickerCheckoutHandoff) => void;
}) {
  const [attempt, setAttempt] = useState(0);
  const [access, setAccess] = useState<DesiPassSeatLayerAccess>();
  const [accessError, setAccessError] = useState<string>();
  const [status, setStatus] = useState('Authorising seat map…');

  useEffect(() => {
    let active = true;
    setAccess(undefined);
    setAccessError(undefined);
    setStatus('Authorising seat map…');
    createSeatLayerAccess(event.id)
      .then((nextAccess) => {
        if (active) setAccess(nextAccess);
      })
      .catch((error) => {
        if (active) setAccessError(messageOf(error));
      });
    return () => { active = false; };
  }, [attempt, event.id]);

  const configuration = useMemo<SeatLayerConfiguration | undefined>(() => {
    if (!access) return undefined;
    return {
      event: event.seatEventKey,
      apiBase: access.apiBase,
      buyerAccessTokenProvider: access.provider,
      currency: event.currency?.trim() || 'EUR',
      locale: 'en-GB',
      maxSelection: 10,
      hostInfo: { app: 'DesiPass React Native validation' },
    };
  }, [access, event.currency, event.seatEventKey]);

  const callbacks = useMemo<SeatLayerPickerCallbacks>(() => ({
    onReady: () => setStatus('Choose your seats'),
    onError: (error) => setStatus(error.message || `Picker error: ${error.code}`),
    onAccessUnavailable: () => setStatus('Seat map authorisation expired. Try again.'),
  }), []);

  return (
    <SafeAreaView style={styles.pickerScreen}>
      <StatusBar barStyle="dark-content" />
      <BackBar title={event.title} subtitle={status} onBack={onBack} />
      <View style={styles.pickerBody}>
        {accessError ? (
          <ErrorState message={accessError} onRetry={() => setAttempt((value) => value + 1)} />
        ) : configuration ? (
          <SeatLayerPicker
            callbacks={callbacks}
            configuration={configuration}
            options={{ layout: 'adaptive', haptics: true }}
            strings={{ holdAndCheckout: 'Continue' }}
            styles={{ continueButton: { backgroundColor: desiPassRed } }}
            onCheckout={async (nextHandoff) => onCheckout(nextHandoff)}
            style={styles.picker}
          />
        ) : (
          <LoadingState label="Authorising seat map…" />
        )}
      </View>
    </SafeAreaView>
  );
}

function CheckoutScreen({
  event,
  handoff,
  onDone,
}: {
  readonly event: DesiPassEventDetail;
  readonly handoff: SeatLayerPickerCheckoutHandoff;
  readonly onDone: () => void;
}) {
  const quantity = handoff.lineItems.reduce((total, item) => total + item.quantity, 0);
  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.checkoutContent}>
        <View style={styles.successMark}><Text style={styles.successMarkLabel}>✓</Text></View>
        <Text style={styles.checkoutEyebrow}>SELECTION READY</Text>
        <Text style={styles.checkoutTitle}>{event.title}</Text>
        <Text style={styles.checkoutText}>
          {quantity} {quantity === 1 ? 'ticket' : 'tickets'} held for checkout.
        </Text>
        <View style={styles.checkoutSummary}>
          <Text style={styles.checkoutSummaryLabel}>Total</Text>
          <Text style={styles.checkoutSummaryValue}>
            {formatMoney(handoff.total, handoff.currency)}
          </Text>
        </View>
        <Text style={styles.checkoutNote}>
          This demo stops at the secure inventory handoff. DesiPass would now send the hold ID to its server.
        </Text>
      </View>
      <View style={styles.checkoutFooter}>
        <Pressable
          accessibilityRole="button"
          onPress={onDone}
          style={({ pressed }) => [styles.doneButton, pressed && styles.pressed]}
        >
          <Text style={styles.doneButtonLabel}>BACK TO EVENTS</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function BackBar({
  title,
  subtitle,
  onBack,
}: {
  readonly title: string;
  readonly subtitle?: string;
  readonly onBack: () => void;
}) {
  return (
    <View style={styles.backBar}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Go back"
        hitSlop={8}
        onPress={onBack}
        style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
      >
        <Text style={styles.backButtonLabel}>←</Text>
      </Pressable>
      <View style={styles.backTitleBlock}>
        <Text numberOfLines={1} style={styles.backTitle}>{title}</Text>
        {subtitle ? <Text numberOfLines={1} style={styles.backSubtitle}>{subtitle}</Text> : null}
      </View>
    </View>
  );
}

function EventImage({
  event,
  style,
}: {
  readonly event: DesiPassEventSummary;
  readonly style: object;
}) {
  if (!event.eventImageUrl) {
    return (
      <View style={[style, styles.imageFallback]}>
        <Text style={styles.imageFallbackLabel}>DP</Text>
      </View>
    );
  }
  return (
    <Image
      accessibilityIgnoresInvertColors
      source={{ uri: event.eventImageUrl }}
      style={style}
    />
  );
}

function LoadingState({ label }: { readonly label: string }) {
  return (
    <View style={styles.state}>
      <ActivityIndicator color={desiPassRed} size="large" />
      <Text style={styles.stateText}>{label}</Text>
    </View>
  );
}

function ErrorState({
  message,
  onRetry,
  compact = false,
}: {
  readonly message: string;
  readonly onRetry: () => void;
  readonly compact?: boolean;
}) {
  return (
    <View style={[styles.state, compact && styles.compactState]}>
      <Text style={styles.errorTitle}>Something went wrong</Text>
      <Text style={styles.stateText}>{message}</Text>
      <Pressable
        accessibilityRole="button"
        onPress={onRetry}
        style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
      >
        <Text style={styles.retryButtonLabel}>Try again</Text>
      </Pressable>
    </View>
  );
}

function SetupScreen() {
  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.state}>
        <Text style={styles.pageTitle}>DesiPass validation</Text>
        <Text style={styles.stateText}>
          Set EXPO_PUBLIC_DESIPASS_API_KEY to the same development x-api-key used by the Flutter app.
        </Text>
      </View>
    </SafeAreaView>
  );
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Please try again.';
}

function formatEventDate(event: DesiPassEventSummary): string {
  try {
    const date = new Date(`${event.eventStartDate}T${event.eventStartTime || '00:00:00'}`);
    const day = new Intl.DateTimeFormat('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(date);
    return `${day} · ${event.eventStartTime.slice(0, 5)}`;
  } catch {
    return `${event.eventStartDate} · ${event.eventStartTime.slice(0, 5)}`;
  }
}

function eventLocation(event: DesiPassEventSummary): string {
  return event.venueDetail?.venueName
    || event.venueDetail?.locationName
    || event.cityName
    || 'Venue to be announced';
}

function eventPrice(event: DesiPassEventSummary): string {
  const tickets = event.eventTickets ?? [];
  if (tickets.some((ticket) => ticket.ticketType === 'FREE')) return 'Free';
  const prices = tickets
    .map((ticket) => ticket.ticketPrice)
    .filter((price): price is number => typeof price === 'number' && Number.isFinite(price));
  return prices.length > 0 ? formatMoney(Math.min(...prices), 'EUR') : '—';
}

function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: currency || 'EUR',
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency || 'EUR'} ${amount.toFixed(2)}`;
  }
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8F7FA' },
  pickerScreen: { flex: 1, backgroundColor: '#FFFFFF' },
  pageHeader: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 16 },
  eyebrow: { color: desiPassRed, fontSize: 11, fontWeight: '800', letterSpacing: 1.4 },
  pageTitle: { color: desiPassInk, fontSize: 30, fontWeight: '800', marginTop: 4 },
  pageSubtitle: { color: '#766F7C', fontSize: 14, marginTop: 5 },
  eventList: { paddingHorizontal: 20, paddingBottom: 28 },
  eventGap: { height: 16 },
  eventCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    shadowColor: '#251B30',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
    overflow: 'hidden',
  },
  cardImage: { width: '100%', height: 172, backgroundColor: '#EEEAF1' },
  cardBody: { padding: 15 },
  eventDate: { color: desiPassRed, fontSize: 12, fontWeight: '700' },
  eventTitle: { color: '#1E1724', fontSize: 18, fontWeight: '800', lineHeight: 24, marginTop: 7 },
  cardMetaRow: { alignItems: 'flex-end', flexDirection: 'row', justifyContent: 'space-between', marginTop: 13 },
  eventMeta: { color: '#766F7C', flex: 1, fontSize: 13, marginRight: 12 },
  eventPrice: { color: desiPassInk, fontSize: 15, fontWeight: '800' },
  pressed: { opacity: 0.72 },
  backBar: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderBottomColor: '#EEEAF1',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: 58,
    paddingHorizontal: 12,
  },
  backButton: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  backButtonLabel: { color: desiPassInk, fontSize: 26, lineHeight: 30 },
  backTitleBlock: { flex: 1, marginLeft: 4, marginRight: 12 },
  backTitle: { color: desiPassInk, fontSize: 16, fontWeight: '800' },
  backSubtitle: { color: '#766F7C', fontSize: 11, marginTop: 2 },
  detailContent: { paddingBottom: 24 },
  heroImage: { width: '100%', height: 258, backgroundColor: '#EEEAF1' },
  detailDate: { color: desiPassRed, fontSize: 13, fontWeight: '800', marginHorizontal: 20, marginTop: 20 },
  detailTitle: { color: '#1E1724', fontSize: 27, fontWeight: '800', lineHeight: 34, marginHorizontal: 20, marginTop: 8 },
  detailBlock: { borderTopColor: '#EEEAF1', borderTopWidth: 1, marginHorizontal: 20, marginTop: 22, paddingTop: 18 },
  detailLabel: { color: '#918A97', fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
  detailValue: { color: desiPassInk, fontSize: 16, fontWeight: '700', marginTop: 7 },
  detailSecondary: { color: '#766F7C', fontSize: 14, lineHeight: 20, marginTop: 5 },
  inlineLoader: { marginTop: 20 },
  bookingBar: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 82,
    paddingHorizontal: 20,
    paddingVertical: 10,
    shadowColor: '#251B30',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 8,
  },
  bookingPrice: { color: desiPassInk, fontSize: 22, fontWeight: '800' },
  bookingCaption: { color: '#766F7C', fontSize: 11, marginTop: 1 },
  bookButton: {
    alignItems: 'center',
    backgroundColor: desiPassRed,
    borderRadius: 10,
    justifyContent: 'center',
    minHeight: 52,
    minWidth: 148,
    paddingHorizontal: 20,
  },
  bookButtonLabel: { color: '#FFFFFF', fontSize: 14, fontWeight: '800', letterSpacing: 0.6 },
  buttonDisabled: { backgroundColor: '#D8D3DC' },
  pickerBody: { flex: 1 },
  picker: { flex: 1 },
  state: { alignItems: 'center', flex: 1, justifyContent: 'center', paddingHorizontal: 32 },
  compactState: { flex: 0, marginTop: 22, paddingVertical: 20 },
  stateText: { color: '#766F7C', fontSize: 14, lineHeight: 21, marginTop: 12, textAlign: 'center' },
  errorTitle: { color: desiPassInk, fontSize: 18, fontWeight: '800' },
  retryButton: { borderColor: desiPassRed, borderRadius: 9, borderWidth: 1, justifyContent: 'center', marginTop: 16, minHeight: 46, paddingHorizontal: 20 },
  retryButtonLabel: { color: desiPassRed, fontSize: 14, fontWeight: '800' },
  imageFallback: { alignItems: 'center', backgroundColor: '#F2E8EC', justifyContent: 'center' },
  imageFallbackLabel: { color: desiPassRed, fontSize: 28, fontWeight: '900' },
  checkoutContent: { alignItems: 'center', flex: 1, justifyContent: 'center', paddingHorizontal: 28 },
  successMark: { alignItems: 'center', backgroundColor: '#EAF8F1', borderRadius: 36, height: 72, justifyContent: 'center', width: 72 },
  successMarkLabel: { color: '#15805D', fontSize: 34, fontWeight: '800' },
  checkoutEyebrow: { color: '#15805D', fontSize: 11, fontWeight: '900', letterSpacing: 1.4, marginTop: 22 },
  checkoutTitle: { color: desiPassInk, fontSize: 25, fontWeight: '800', lineHeight: 32, marginTop: 9, textAlign: 'center' },
  checkoutText: { color: '#766F7C', fontSize: 15, marginTop: 9, textAlign: 'center' },
  checkoutSummary: { alignItems: 'center', borderBottomColor: '#EEEAF1', borderBottomWidth: 1, borderTopColor: '#EEEAF1', borderTopWidth: 1, flexDirection: 'row', justifyContent: 'space-between', marginTop: 28, paddingVertical: 18, width: '100%' },
  checkoutSummaryLabel: { color: '#766F7C', fontSize: 15 },
  checkoutSummaryValue: { color: desiPassInk, fontSize: 22, fontWeight: '800' },
  checkoutNote: { color: '#918A97', fontSize: 12, lineHeight: 18, marginTop: 18, textAlign: 'center' },
  checkoutFooter: { paddingHorizontal: 20, paddingVertical: 14 },
  doneButton: { alignItems: 'center', backgroundColor: desiPassRed, borderRadius: 10, justifyContent: 'center', minHeight: 52 },
  doneButtonLabel: { color: '#FFFFFF', fontSize: 14, fontWeight: '800', letterSpacing: 0.6 },
});
