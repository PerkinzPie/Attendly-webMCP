import type { DemoEvent, DemoOrganisation } from '../demo/seed'
import {
  ConfirmedBookingRepositoryError,
  type BookingActorChannel,
  type ConfirmedBookingRepository,
  type PersistedFreeBooking,
} from './confirmedBookingRepository'
import type { PublicEventAvailability } from './publicEventCatalogue'

export type FreeBookingQuantities = {
  readonly adultTickets: number
  readonly childTickets: number
}

export type SyntheticGuardianContact = {
  readonly name: string
  readonly email: string
}

export type FreeBookingDraft = {
  readonly draftId: string
  readonly event: {
    readonly eventId: string
    readonly name: string
    readonly organisationId: string
    readonly organisationName: string
    readonly startsAt: string
  }
  readonly quantities: FreeBookingQuantities & { readonly total: number }
  readonly guardian: SyntheticGuardianContact
  readonly price: {
    readonly amountPence: 0
    readonly currency: 'GBP'
    readonly display: '£0.00'
  }
  readonly availability: PublicEventAvailability
  readonly createdAt: string
  readonly expiresAt: string
  readonly persisted: false
  readonly availabilityRevision: number
}

export type ConfirmedFreeBooking = {
  readonly id: string
  readonly bookingReference: string
  readonly event: FreeBookingDraft['event']
  readonly quantities: FreeBookingDraft['quantities']
  readonly guardian: SyntheticGuardianContact
  readonly price: FreeBookingDraft['price']
  readonly confirmedAt: string
  readonly confirmedVia: BookingActorChannel
  readonly idempotencyKey: string
  readonly availability: PublicEventAvailability
  readonly persisted: boolean
}

export type PublicBookingError = {
  readonly code:
    | 'adult_ticket_required'
    | 'booking_store_unavailable'
    | 'child_tickets_unavailable'
    | 'draft_expired'
    | 'draft_not_found'
    | 'event_not_found'
    | 'insufficient_availability'
    | 'invalid_contact'
    | 'invalid_idempotency_key'
    | 'invalid_quantities'
    | 'paid_booking_not_supported'
    | 'stale_booking_draft'
  readonly message: string
  readonly currentAvailability?: PublicEventAvailability
  readonly requiresNewDraft?: true
}

export type PublicBookingResult<T> =
  | { readonly ok: true, readonly data: T }
  | { readonly ok: false, readonly error: PublicBookingError }

export type ConfirmFreeBookingResult = {
  readonly booking: ConfirmedFreeBooking
  readonly idempotent: boolean
}

export type PublicBookingService = {
  createDraft(input: {
    readonly eventId: string
    readonly quantities: FreeBookingQuantities
    readonly guardian: SyntheticGuardianContact
  }): PublicBookingResult<FreeBookingDraft>
  confirmDraft(input: {
    readonly draftId: string
    readonly idempotencyKey: string
    readonly actorChannel?: BookingActorChannel
  }): Promise<PublicBookingResult<ConfirmFreeBookingResult>>
  getAvailability(eventId: string): PublicEventAvailability | null
  getReservedTickets(eventId: string): number | null
  getConfirmedBookings(eventId?: string): readonly ConfirmedFreeBooking[]
  syncBookings(bookings: readonly PersistedFreeBooking[]): void
  subscribe(listener: (bookings: readonly ConfirmedFreeBooking[]) => void): () => void
  reset(): void
}

export type ValidatedFreeBookingRequest = {
  readonly event: DemoEvent
  readonly organisation: DemoOrganisation
  readonly quantities: FreeBookingQuantities & { readonly total: number }
  readonly guardian: SyntheticGuardianContact
}

export const maximumTicketsPerBooking = 6

export function availabilityFor(capacity: number, reserved: number): PublicEventAvailability {
  const remaining = Math.max(0, capacity - reserved)
  return { capacity, reserved, remaining, soldOut: remaining === 0 }
}

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

/**
 * Shared free-booking rules used by the browser service and the shared
 * booking API, so a booking is validated identically wherever it is made.
 */
export function validateFreeBookingRequest(input: {
  readonly event: DemoEvent | undefined
  readonly organisation: DemoOrganisation | undefined
  readonly quantities: FreeBookingQuantities
  readonly guardian: SyntheticGuardianContact
}): PublicBookingResult<ValidatedFreeBookingRequest> {
  const { event, organisation } = input
  if (!event || !organisation || event.publicationStatus !== 'published') {
    return {
      ok: false,
      error: {
        code: 'event_not_found',
        message: 'Use a published event identifier from the current public events page.',
      },
    }
  }
  if (event.pricePence !== 0) {
    return {
      ok: false,
      error: {
        code: 'paid_booking_not_supported',
        message: 'These demo tools only prepare free bookings. No payment or reservation was attempted.',
      },
    }
  }

  const { adultTickets, childTickets } = input.quantities
  const total = adultTickets + childTickets
  if (
    !Number.isInteger(adultTickets)
    || !Number.isInteger(childTickets)
    || adultTickets < 0
    || childTickets < 0
    || total < 1
    || total > maximumTicketsPerBooking
  ) {
    return {
      ok: false,
      error: {
        code: 'invalid_quantities',
        message: 'Choose between one and six tickets using whole adult and child quantities.',
      },
    }
  }
  if (childTickets > 0 && adultTickets < 1) {
    return {
      ok: false,
      error: {
        code: 'adult_ticket_required',
        message: 'Include at least one adult ticket when booking child tickets.',
      },
    }
  }
  if (childTickets > 0 && !event.audiences.includes('children')) {
    return {
      ok: false,
      error: {
        code: 'child_tickets_unavailable',
        message: 'The organiser has not made child tickets available for this event.',
      },
    }
  }

  const guardian = {
    name: input.guardian.name.trim(),
    email: input.guardian.email.trim().toLocaleLowerCase('en-GB'),
  }
  if (!guardian.name || guardian.name.length > 200 || guardian.email.length > 254 || !validEmail(guardian.email)) {
    return {
      ok: false,
      error: {
        code: 'invalid_contact',
        message: 'Provide the synthetic adult or guardian name and a valid synthetic email address.',
      },
    }
  }

  return {
    ok: true,
    data: {
      event,
      organisation,
      quantities: { adultTickets, childTickets, total },
      guardian,
    },
  }
}

function insufficientAvailability(availability: PublicEventAvailability): PublicBookingError {
  return {
    code: 'insufficient_availability',
    message: `Only ${availability.remaining} tickets are currently available. No booking was created.`,
    currentAvailability: availability,
    requiresNewDraft: true,
  }
}

const storeUnavailableMessage = 'The booking could not be saved to shared storage. Check your connection and confirm the booking again.'

export function createPublicBookingService(options: {
  readonly events: readonly DemoEvent[]
  readonly organisations: readonly DemoOrganisation[]
  readonly repository?: ConfirmedBookingRepository
  readonly now?: () => string
  readonly createId?: (kind: 'booking' | 'draft') => string
}): PublicBookingService {
  const eventsById = new Map(options.events.map((event) => [event.id, event]))
  const organisationsById = new Map(options.organisations.map((organisation) => [organisation.id, organisation]))
  const seedReservedTickets = new Map(options.events.map((event) => [event.id, event.reservedTickets]))
  const reservedTickets = new Map(seedReservedTickets)
  const revisions = new Map(options.events.map((event) => [event.id, 0]))
  const drafts = new Map<string, FreeBookingDraft>()
  const bookingsByIdempotencyKey = new Map<string, ConfirmedFreeBooking>()
  const bookingsByReference = new Map<string, ConfirmedFreeBooking>()
  const listeners = new Set<(bookings: readonly ConfirmedFreeBooking[]) => void>()
  const repository = options.repository
  const now = options.now ?? (() => new Date().toISOString())
  let sequence = 0
  const createId = options.createId ?? ((kind: 'booking' | 'draft') => `${kind}_${++sequence}`)

  const currentAvailability = (event: DemoEvent) => availabilityFor(
    event.capacity,
    reservedTickets.get(event.id) ?? event.reservedTickets,
  )

  const bumpRevision = (eventId: string) => {
    revisions.set(eventId, (revisions.get(eventId) ?? 0) + 1)
  }

  const setReservedTickets = (eventId: string, reserved: number) => {
    if (reservedTickets.get(eventId) === reserved) return
    reservedTickets.set(eventId, reserved)
    bumpRevision(eventId)
  }

  const bookedTicketsFor = (eventId: string) => [...bookingsByReference.values()]
    .filter((booking) => booking.event.eventId === eventId)
    .reduce((total, booking) => total + booking.quantities.total, 0)

  const listBookings = (eventId?: string) => [...bookingsByReference.values()]
    .filter((booking) => !eventId || booking.event.eventId === eventId)
    .toSorted((left, right) => (
      Date.parse(right.confirmedAt) - Date.parse(left.confirmedAt)
      || left.bookingReference.localeCompare(right.bookingReference, 'en-GB')
    ))

  const notify = () => {
    const bookings = listBookings()
    for (const listener of listeners) listener(bookings)
  }

  // Idempotency keys are only replayed for confirmations made in this session.
  // Bookings loaded from the shared store are never matched by key locally, so a
  // key reused by another visitor is judged by the shared store instead.
  const rememberBooking = (booking: ConfirmedFreeBooking, options: { readonly replayable: boolean }) => {
    bookingsByReference.set(booking.bookingReference, booking)
    if (options.replayable) bookingsByIdempotencyKey.set(booking.idempotencyKey, booking)
  }

  const toConfirmedBooking = (
    persisted: PersistedFreeBooking,
    availability: PublicEventAvailability,
  ): ConfirmedFreeBooking | null => {
    const event = eventsById.get(persisted.eventId)
    const organisation = event ? organisationsById.get(event.organisationId) : undefined
    if (!event || !organisation) return null
    return {
      id: persisted.id,
      bookingReference: persisted.bookingReference,
      event: {
        eventId: event.id,
        name: event.name,
        organisationId: organisation.id,
        organisationName: organisation.name,
        startsAt: event.startsAt,
      },
      quantities: persisted.quantities,
      guardian: persisted.guardian,
      price: { amountPence: 0, currency: 'GBP', display: '£0.00' },
      confirmedAt: persisted.confirmedAt,
      confirmedVia: persisted.confirmedVia,
      idempotencyKey: persisted.idempotencyKey,
      availability,
      persisted: true,
    }
  }

  const recomputeReservedFromBookings = () => {
    for (const event of options.events) {
      setReservedTickets(event.id, (seedReservedTickets.get(event.id) ?? 0) + bookedTicketsFor(event.id))
    }
  }

  const forgetBookings = (predicate: (booking: ConfirmedFreeBooking) => boolean) => {
    for (const booking of [...bookingsByReference.values()]) {
      if (!predicate(booking)) continue
      bookingsByReference.delete(booking.bookingReference)
      bookingsByIdempotencyKey.delete(booking.idempotencyKey)
    }
  }

  const persistConfirmation = async (
    draft: FreeBookingDraft,
    event: DemoEvent,
    idempotencyKey: string,
    actorChannel: BookingActorChannel,
  ): Promise<PublicBookingResult<ConfirmFreeBookingResult>> => {
    if (!repository) throw new Error('No booking repository configured')
    let persisted
    try {
      persisted = await repository.create({
        eventId: event.id,
        quantities: {
          adultTickets: draft.quantities.adultTickets,
          childTickets: draft.quantities.childTickets,
        },
        guardian: draft.guardian,
        idempotencyKey,
        actorChannel,
      })
    } catch (error) {
      const rejection = error instanceof ConfirmedBookingRepositoryError ? error.rejection : null
      if (rejection?.currentAvailability) setReservedTickets(event.id, rejection.currentAvailability.reserved)
      if (rejection?.code === 'insufficient_availability') {
        drafts.delete(draft.draftId)
        return { ok: false, error: insufficientAvailability(currentAvailability(event)) }
      }
      if (rejection?.code === 'booking_conflict') {
        return {
          ok: false,
          error: {
            code: 'invalid_idempotency_key',
            message: 'This idempotency key was already used for a different booking. Use a new key for this confirmation.',
          },
        }
      }
      return {
        ok: false,
        error: {
          code: 'booking_store_unavailable',
          message: rejection?.message ?? storeUnavailableMessage,
        },
      }
    }

    const booking = toConfirmedBooking(persisted.booking, persisted.availability)
    if (!booking) {
      return { ok: false, error: { code: 'booking_store_unavailable', message: storeUnavailableMessage } }
    }
    reservedTickets.set(event.id, persisted.availability.reserved)
    bumpRevision(event.id)
    rememberBooking(booking, { replayable: true })
    drafts.delete(draft.draftId)
    notify()
    return { ok: true, data: { booking, idempotent: persisted.idempotent } }
  }

  return {
    createDraft(input) {
      const event = eventsById.get(input.eventId)
      const validated = validateFreeBookingRequest({
        event,
        organisation: event ? organisationsById.get(event.organisationId) : undefined,
        quantities: input.quantities,
        guardian: input.guardian,
      })
      if (!validated.ok) return validated

      const eventAvailability = currentAvailability(validated.data.event)
      if (validated.data.quantities.total > eventAvailability.remaining) {
        return { ok: false, error: insufficientAvailability(eventAvailability) }
      }

      const createdAt = now()
      const draft: FreeBookingDraft = {
        draftId: createId('draft'),
        event: {
          eventId: validated.data.event.id,
          name: validated.data.event.name,
          organisationId: validated.data.organisation.id,
          organisationName: validated.data.organisation.name,
          startsAt: validated.data.event.startsAt,
        },
        quantities: validated.data.quantities,
        guardian: validated.data.guardian,
        price: { amountPence: 0, currency: 'GBP', display: '£0.00' },
        availability: eventAvailability,
        createdAt,
        expiresAt: new Date(Date.parse(createdAt) + 10 * 60 * 1000).toISOString(),
        persisted: false,
        availabilityRevision: revisions.get(validated.data.event.id) ?? 0,
      }
      drafts.set(draft.draftId, draft)
      return { ok: true, data: draft }
    },

    async confirmDraft(input) {
      const idempotencyKey = input.idempotencyKey.trim()
      const actorChannel = input.actorChannel ?? 'human-ui'
      if (!idempotencyKey || idempotencyKey.length > 100) {
        return {
          ok: false,
          error: {
            code: 'invalid_idempotency_key',
            message: 'Provide a stable idempotency key for booking confirmation.',
          },
        }
      }
      const existing = bookingsByIdempotencyKey.get(idempotencyKey)
      if (existing) return { ok: true, data: { booking: existing, idempotent: true } }

      const draft = drafts.get(input.draftId)
      const event = draft ? eventsById.get(draft.event.eventId) : undefined
      if (!draft || !event) {
        return {
          ok: false,
          error: {
            code: 'draft_not_found',
            message: 'The matching booking draft is no longer active. Prepare a new draft for review.',
            requiresNewDraft: true,
          },
        }
      }

      const eventAvailability = currentAvailability(event)
      if (Date.parse(now()) > Date.parse(draft.expiresAt)) {
        return {
          ok: false,
          error: {
            code: 'draft_expired',
            message: 'Availability must be reviewed again because this booking draft expired.',
            currentAvailability: eventAvailability,
            requiresNewDraft: true,
          },
        }
      }
      if ((revisions.get(event.id) ?? 0) !== draft.availabilityRevision) {
        return {
          ok: false,
          error: {
            code: 'stale_booking_draft',
            message: 'Availability changed after this draft was prepared. No booking was created; prepare a new draft for review.',
            currentAvailability: eventAvailability,
            requiresNewDraft: true,
          },
        }
      }
      if (draft.quantities.total > eventAvailability.remaining) {
        return { ok: false, error: insufficientAvailability(eventAvailability) }
      }

      if (repository) return persistConfirmation(draft, event, idempotencyKey, actorChannel)

      const confirmedAt = now()
      const nextReserved = eventAvailability.reserved + draft.quantities.total
      reservedTickets.set(event.id, nextReserved)
      bumpRevision(event.id)
      const bookingId = createId('booking')
      const booking: ConfirmedFreeBooking = {
        id: bookingId,
        bookingReference: `ATT-${bookingId.replace(/[^a-z0-9]/gi, '').toUpperCase()}`,
        event: draft.event,
        quantities: draft.quantities,
        guardian: draft.guardian,
        price: draft.price,
        confirmedAt,
        confirmedVia: actorChannel,
        idempotencyKey,
        availability: availabilityFor(event.capacity, nextReserved),
        persisted: false,
      }
      rememberBooking(booking, { replayable: true })
      drafts.delete(draft.draftId)
      notify()
      return { ok: true, data: { booking, idempotent: false } }
    },

    getAvailability(eventId) {
      const event = eventsById.get(eventId)
      return event ? currentAvailability(event) : null
    },

    getReservedTickets(eventId) {
      return eventsById.has(eventId) ? reservedTickets.get(eventId) ?? null : null
    },

    getConfirmedBookings(eventId) {
      return listBookings(eventId)
    },

    syncBookings(persistedBookings) {
      forgetBookings((booking) => booking.persisted)
      const bookedByEvent = new Map<string, number>()
      for (const persisted of persistedBookings) {
        bookedByEvent.set(persisted.eventId, (bookedByEvent.get(persisted.eventId) ?? 0) + persisted.quantities.total)
      }
      for (const event of options.events) {
        setReservedTickets(
          event.id,
          (seedReservedTickets.get(event.id) ?? 0) + (bookedByEvent.get(event.id) ?? 0) + bookedTicketsFor(event.id),
        )
      }
      for (const persisted of persistedBookings) {
        const event = eventsById.get(persisted.eventId)
        if (!event) continue
        const booking = toConfirmedBooking(persisted, currentAvailability(event))
        if (booking) rememberBooking(booking, { replayable: false })
      }
      notify()
    },

    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },

    reset() {
      forgetBookings((booking) => !booking.persisted)
      drafts.clear()
      sequence = 0
      recomputeReservedFromBookings()
      revisions.forEach((_value, key) => revisions.set(key, 0))
      notify()
    },
  }
}
