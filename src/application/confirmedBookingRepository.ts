import type { PublicEventAvailability } from './publicEventCatalogue'

export type BookingActorChannel = 'human-ui' | 'webmcp'

export type PersistedFreeBooking = {
  readonly id: string
  readonly bookingReference: string
  readonly idempotencyKey: string
  readonly eventId: string
  readonly organisationId: string
  readonly guardian: {
    readonly name: string
    readonly email: string
  }
  readonly quantities: {
    readonly adultTickets: number
    readonly childTickets: number
    readonly total: number
  }
  readonly confirmedAt: string
  readonly confirmedVia: BookingActorChannel
  readonly isSynthetic: true
}

export type CreatePersistedBookingInput = {
  readonly eventId: string
  readonly quantities: {
    readonly adultTickets: number
    readonly childTickets: number
  }
  readonly guardian: {
    readonly name: string
    readonly email: string
  }
  readonly idempotencyKey: string
  readonly actorChannel: BookingActorChannel
}

export type CreatePersistedBookingResult = {
  readonly booking: PersistedFreeBooking
  readonly idempotent: boolean
  readonly availability: PublicEventAvailability
}

export type ConfirmedBookingRepository = {
  list(): Promise<readonly PersistedFreeBooking[]>
  create(input: CreatePersistedBookingInput): Promise<CreatePersistedBookingResult>
}

export type BookingRejection = {
  readonly code: string
  readonly message: string
  readonly currentAvailability?: PublicEventAvailability
}

export class ConfirmedBookingRepositoryError extends Error {
  readonly code: 'unavailable' | 'rejected' | 'invalid-response'
  readonly rejection: BookingRejection | null

  constructor(
    code: 'unavailable' | 'rejected' | 'invalid-response',
    message: string,
    options: { cause?: unknown, rejection?: BookingRejection } = {},
  ) {
    super(message, { cause: options.cause })
    this.name = 'ConfirmedBookingRepositoryError'
    this.code = code
    this.rejection = options.rejection ?? null
  }
}

type HttpConfirmedBookingRepositoryOptions = {
  readonly fetch: typeof globalThis.fetch
  readonly endpoint?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function readAvailability(value: unknown): PublicEventAvailability | null {
  if (!isRecord(value)) return null
  if (
    !Number.isInteger(value.capacity)
    || !Number.isInteger(value.reserved)
    || !Number.isInteger(value.remaining)
    || typeof value.soldOut !== 'boolean'
  ) return null
  return {
    capacity: Number(value.capacity),
    reserved: Number(value.reserved),
    remaining: Number(value.remaining),
    soldOut: value.soldOut,
  }
}

export function readPersistedBooking(value: unknown): PersistedFreeBooking | null {
  if (!isRecord(value) || !isRecord(value.guardian) || !isRecord(value.quantities)) return null
  const { guardian, quantities } = value
  if (
    typeof value.id !== 'string'
    || typeof value.bookingReference !== 'string'
    || typeof value.idempotencyKey !== 'string'
    || typeof value.eventId !== 'string'
    || typeof value.organisationId !== 'string'
    || typeof guardian.name !== 'string'
    || typeof guardian.email !== 'string'
    || !Number.isInteger(quantities.adultTickets)
    || !Number.isInteger(quantities.childTickets)
    || !Number.isInteger(quantities.total)
    || Number(quantities.adultTickets) < 0
    || Number(quantities.childTickets) < 0
    || Number(quantities.total) !== Number(quantities.adultTickets) + Number(quantities.childTickets)
    || Number(quantities.total) < 1
    || typeof value.confirmedAt !== 'string'
    || Number.isNaN(Date.parse(value.confirmedAt))
    || (value.confirmedVia !== 'human-ui' && value.confirmedVia !== 'webmcp')
    || value.isSynthetic !== true
  ) return null

  return {
    id: value.id,
    bookingReference: value.bookingReference,
    idempotencyKey: value.idempotencyKey,
    eventId: value.eventId,
    organisationId: value.organisationId,
    guardian: { name: guardian.name, email: guardian.email },
    quantities: {
      adultTickets: Number(quantities.adultTickets),
      childTickets: Number(quantities.childTickets),
      total: Number(quantities.total),
    },
    confirmedAt: value.confirmedAt,
    confirmedVia: value.confirmedVia,
    isSynthetic: true,
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch (error) {
    throw new ConfirmedBookingRepositoryError(
      'invalid-response',
      'The shared booking store returned an invalid response.',
      { cause: error },
    )
  }
}

function rejectionFor(payload: unknown): BookingRejection {
  if (!isRecord(payload) || !isRecord(payload.error)) {
    return { code: 'rejected', message: 'The shared booking store rejected the request.' }
  }
  const availability = readAvailability(payload.error.currentAvailability)
  return {
    code: typeof payload.error.code === 'string' ? payload.error.code : 'rejected',
    message: typeof payload.error.message === 'string'
      ? payload.error.message
      : 'The shared booking store rejected the request.',
    ...(availability ? { currentAvailability: availability } : {}),
  }
}

export function createHttpConfirmedBookingRepository(
  options: HttpConfirmedBookingRepositoryOptions = { fetch: globalThis.fetch },
): ConfirmedBookingRepository {
  const endpoint = options.endpoint ?? '/api/bookings'
  let activeListRequest: Promise<readonly PersistedFreeBooking[]> | null = null

  async function request(init?: RequestInit) {
    try {
      return await options.fetch.call(globalThis, endpoint, {
        cache: 'no-store',
        ...init,
        headers: {
          Accept: 'application/json',
          ...init?.headers,
        },
      })
    } catch (error) {
      throw new ConfirmedBookingRepositoryError(
        'unavailable',
        'The shared booking store is unavailable.',
        { cause: error },
      )
    }
  }

  return {
    list() {
      if (activeListRequest) return activeListRequest
      activeListRequest = (async () => {
        const response = await request()
        const payload = await readJson(response)
        if (!response.ok) {
          const rejection = rejectionFor(payload)
          throw new ConfirmedBookingRepositoryError('rejected', rejection.message, { rejection })
        }
        if (!isRecord(payload) || !Array.isArray(payload.bookings)) {
          throw new ConfirmedBookingRepositoryError('invalid-response', 'The shared booking list is invalid.')
        }
        const bookings = payload.bookings.map(readPersistedBooking)
        if (bookings.some((booking) => booking === null)) {
          throw new ConfirmedBookingRepositoryError('invalid-response', 'The shared booking list contains invalid data.')
        }
        return bookings.filter((booking): booking is PersistedFreeBooking => booking !== null)
      })().finally(() => {
        activeListRequest = null
      })
      return activeListRequest
    },
    async create(input) {
      const response = await request({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          booking: {
            eventId: input.eventId,
            adultTickets: input.quantities.adultTickets,
            childTickets: input.quantities.childTickets,
            guardianName: input.guardian.name,
            guardianEmail: input.guardian.email,
          },
          idempotencyKey: input.idempotencyKey,
          actorChannel: input.actorChannel,
        }),
      })
      const payload = await readJson(response)
      if (!response.ok) {
        const rejection = rejectionFor(payload)
        throw new ConfirmedBookingRepositoryError('rejected', rejection.message, { rejection })
      }
      if (!isRecord(payload)) {
        throw new ConfirmedBookingRepositoryError('invalid-response', 'The saved booking response is invalid.')
      }
      const booking = readPersistedBooking(payload.booking)
      const availability = readAvailability(payload.availability)
      if (!booking || !availability || typeof payload.idempotent !== 'boolean') {
        throw new ConfirmedBookingRepositoryError('invalid-response', 'The saved booking response is invalid.')
      }
      return { booking, idempotent: payload.idempotent, availability }
    },
  }
}
