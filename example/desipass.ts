import {
  seatLayerMobileOrigin,
  type BuyerAccessTokenProvider,
} from '@seatlayer/react-native';

const desiPassGraphqlUrl =
  process.env.EXPO_PUBLIC_DESIPASS_GRAPHQL_URL?.trim()
  || 'https://desipass-dev.flutterscript.com/v1/graphql';

const desiPassApiKey =
  process.env.EXPO_PUBLIC_DESIPASS_API_KEY?.trim() || '';

const eventListQuery = `
  query getUserEventList(
    $filterType: FilterType!
    $page: Int
    $limit: Int
    $upcomingFilterType: UpcomingFilterType!
  ) {
    getUserEventList(
      filterType: $filterType
      page: $page
      limit: $limit
      upcomingFilterType: $upcomingFilterType
    ) {
      events {
        id
        slug
        title
        isSeatEvent
        cityName
        eventStartDate
        eventStartTime
        eventImageUrl
        venueDetail { venueName venueAddress locationName }
        eventTickets { ticketPrice ticketType title }
      }
    }
  }
`;

const eventDetailQuery = `
  query getUserEvent($eventId: String!) {
    getUserEvent(eventId: $eventId) {
      eventDetail {
        id
        slug
        title
        isSeatEvent
        seatEngine
        seatEventKey
        currency
        cityName
        eventStartDate
        eventStartTime
        eventImageUrl
        venueDetail { venueName venueAddress locationName }
        eventTickets {
          ticketPrice
          ticketType
          title
          remainingTicket
        }
      }
    }
  }
`;

const buyerAccessMutation = `
  mutation createSeatLayerBuyerAccessSession($eventId: String!) {
    createSeatLayerBuyerAccessSession(eventId: $eventId) {
      token
      expiresAt
      apiBase
    }
  }
`;

export interface DesiPassTicket {
  readonly ticketPrice?: number | null;
  readonly ticketType?: string | null;
  readonly title?: string | null;
  readonly remainingTicket?: number | null;
}

export interface DesiPassVenue {
  readonly venueName?: string | null;
  readonly venueAddress?: string | null;
  readonly locationName?: string | null;
}

export interface DesiPassEventSummary {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly isSeatEvent: boolean;
  readonly seatEngine?: string | null;
  readonly cityName?: string | null;
  readonly eventStartDate: string;
  readonly eventStartTime: string;
  readonly eventImageUrl?: string | null;
  readonly venueDetail?: DesiPassVenue | null;
  readonly eventTickets?: readonly DesiPassTicket[] | null;
}

export interface DesiPassEventDetail extends DesiPassEventSummary {
  readonly seatEventKey: string;
  readonly currency?: string | null;
}

interface GraphqlError {
  readonly message?: string;
}

interface GraphqlEnvelope<T> {
  readonly data?: T;
  readonly errors?: readonly GraphqlError[];
}

interface EventListData {
  readonly getUserEventList?: {
    readonly events?: readonly DesiPassEventSummary[];
  };
}

interface EventDetailData {
  readonly getUserEvent?: {
    readonly eventDetail?: DesiPassEventDetail | null;
  };
}

interface BuyerAccessData {
  readonly createSeatLayerBuyerAccessSession?: {
    readonly token?: string;
    readonly expiresAt?: string;
    readonly apiBase?: string;
  } | null;
}

interface BuyerAccess {
  readonly token: string;
  readonly expiresAt: number;
  readonly apiBase: string;
}

export interface DesiPassSeatLayerAccess {
  readonly apiBase: string;
  readonly provider: BuyerAccessTokenProvider;
}

export function hasDesiPassApiKey(): boolean {
  return desiPassApiKey.length > 0;
}

async function request<T>(
  query: string,
  variables: Readonly<Record<string, unknown>>,
  headers?: Readonly<Record<string, string>>,
): Promise<T> {
  if (!desiPassApiKey) {
    throw new Error('EXPO_PUBLIC_DESIPASS_API_KEY is required.');
  }
  const response = await fetch(desiPassGraphqlUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': desiPassApiKey,
      ...headers,
    },
    body: JSON.stringify({ query, variables }),
  });
  const payload = await response.json() as GraphqlEnvelope<T>;
  const graphqlMessage = payload.errors?.[0]?.message;
  if (!response.ok || graphqlMessage || !payload.data) {
    throw new Error(graphqlMessage || `DesiPass request failed (${response.status}).`);
  }
  return payload.data;
}

export async function fetchDemoEvents(): Promise<readonly DesiPassEventSummary[]> {
  const data = await request<EventListData>(eventListQuery, {
    filterType: 'UPCOMING',
    page: 1,
    // Development events are mixed with ordinary inventory; a wider first
    // page ensures the small validation list can find assigned-seat events.
    limit: 50,
    upcomingFilterType: 'ALL',
  });
  // The event-list projection only exposes whether an event uses assigned
  // seating. The concrete seat engine is available on the event-detail type
  // and is verified before the picker route can open.
  const seatLayerEvents = (data.getUserEventList?.events ?? [])
    .filter((event) => event.isSeatEvent);
  const today = new Date().toISOString().slice(0, 10);
  const futureEvents = seatLayerEvents.filter(
    (event) => event.eventStartDate >= today,
  );
  return (futureEvents.length >= 2 ? futureEvents : seatLayerEvents).slice(0, 3);
}

export async function fetchEventDetail(eventId: string): Promise<DesiPassEventDetail> {
  const data = await request<EventDetailData>(eventDetailQuery, { eventId });
  const event = data.getUserEvent?.eventDetail;
  if (!event) throw new Error('This event is no longer available.');
  if (event.seatEngine !== 'SEATLAYER' || !event.seatEventKey?.trim()) {
    throw new Error('This event has no SeatLayer map configured.');
  }
  return event;
}

async function mintBuyerAccess(eventId: string): Promise<BuyerAccess> {
  const data = await request<BuyerAccessData>(
    buyerAccessMutation,
    { eventId },
    { Origin: seatLayerMobileOrigin },
  );
  const payload = data.createSeatLayerBuyerAccessSession;
  const token = payload?.token?.trim();
  const apiBase = payload?.apiBase?.trim();
  const expiresAt = Date.parse(payload?.expiresAt ?? '');
  if (!token || !apiBase || !Number.isFinite(expiresAt)) {
    throw new Error('The seat map could not be authorised.');
  }
  return { token, apiBase, expiresAt };
}

export async function createSeatLayerAccess(
  eventId: string,
): Promise<DesiPassSeatLayerAccess> {
  let prefetched: BuyerAccess | undefined = await mintBuyerAccess(eventId);
  const apiBase = prefetched.apiBase;
  const provider: BuyerAccessTokenProvider = async () => {
    const access = prefetched ?? await mintBuyerAccess(eventId);
    prefetched = undefined;
    return { token: access.token, expiresAt: access.expiresAt };
  };
  return { apiBase, provider };
}
