import type { DemoEvent, DemoOrganisation } from '../demo/seed'
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
  readonly bookingReference: string
  readonly event: FreeBookingDraft['event']
  readonly quantities: FreeBookingDraft['quantities']
  readonly guardian: SyntheticGuardianContact
  readonly price: FreeBookingDraft['price']
  readonly confirmedAt: string
  readonly idempotencyKey: string
  readonly availability: PublicEventAvailability
}

export type PublicBookingError = {
  readonly code:
    | 'adult_ticket_required'
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

export type PublicBookingService = {
  createDraft(input: {
    readonly eventId: string
    readonly quantities: FreeBookingQuantities
    readonly guardian: SyntheticGuardianContact
  }): PublicBookingResult<FreeBookingDraft>
  confirmDraft(input: {
    readonly draftId: string
    readonly idempotencyKey: string
  }): PublicBookingResult<{ readonly booking: ConfirmedFreeBooking, readonly idempotent: boolean }>
  getAvailability(eventId: string): PublicEventAvailability | null
  getReservedTickets(eventId: string): number | null
  reset(): void
}

function availability(capacity: number, reserved: number): PublicEventAvailability {
  const remaining = Math.max(0, capacity - reserved)
  return { capacity, reserved, remaining, soldOut: remaining === 0 }
}

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

export function createPublicBookingService(options: {
  readonly events: readonly DemoEvent[]
  readonly organisations: readonly DemoOrganisation[]
  readonly now?: () => string
  readonly createId?: (kind: 'booking' | 'draft') => string
}): PublicBookingService {
  const eventsById = new Map(options.events.map((event) => [event.id, event]))
  const organisationsById = new Map(options.organisations.map((organisation) => [organisation.id, organisation]))
  const initialReservedTickets = new Map(options.events.map((event) => [event.id, event.reservedTickets]))
  const reservedTickets = new Map(initialReservedTickets)
  const revisions = new Map(options.events.map((event) => [event.id, 0]))
  const drafts = new Map<string, FreeBookingDraft>()
  const bookingsByIdempotencyKey = new Map<string, ConfirmedFreeBooking>()
  const now = options.now ?? (() => new Date().toISOString())
  let sequence = 0
  const createId = options.createId ?? ((kind: 'booking' | 'draft') => `${kind}_${++sequence}`)

  const currentAvailability = (event: DemoEvent) => availability(
    event.capacity,
    reservedTickets.get(event.id) ?? event.reservedTickets,
  )

  return {
    createDraft(input) {
      const event = eventsById.get(input.eventId)
      const organisation = event ? organisationsById.get(event.organisationId) : undefined
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
        || total > 6
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
      if (!guardian.name || !validEmail(guardian.email)) {
        return {
          ok: false,
          error: {
            code: 'invalid_contact',
            message: 'Provide the synthetic adult or guardian name and a valid synthetic email address.',
          },
        }
      }

      const eventAvailability = currentAvailability(event)
      if (total > eventAvailability.remaining) {
        return {
          ok: false,
          error: {
            code: 'insufficient_availability',
            message: `Only ${eventAvailability.remaining} tickets are currently available. No booking was created.`,
            currentAvailability: eventAvailability,
            requiresNewDraft: true,
          },
        }
      }

      const createdAt = now()
      const draft: FreeBookingDraft = {
        draftId: createId('draft'),
        event: {
          eventId: event.id,
          name: event.name,
          organisationId: organisation.id,
          organisationName: organisation.name,
          startsAt: event.startsAt,
        },
        quantities: { adultTickets, childTickets, total },
        guardian,
        price: { amountPence: 0, currency: 'GBP', display: '£0.00' },
        availability: eventAvailability,
        createdAt,
        expiresAt: new Date(Date.parse(createdAt) + 10 * 60 * 1000).toISOString(),
        persisted: false,
        availabilityRevision: revisions.get(event.id) ?? 0,
      }
      drafts.set(draft.draftId, draft)
      return { ok: true, data: draft }
    },

    confirmDraft(input) {
      const idempotencyKey = input.idempotencyKey.trim()
      if (!idempotencyKey) {
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
        return {
          ok: false,
          error: {
            code: 'insufficient_availability',
            message: `Only ${eventAvailability.remaining} tickets are currently available. No booking was created.`,
            currentAvailability: eventAvailability,
            requiresNewDraft: true,
          },
        }
      }

      const confirmedAt = now()
      const nextReserved = eventAvailability.reserved + draft.quantities.total
      reservedTickets.set(event.id, nextReserved)
      revisions.set(event.id, (revisions.get(event.id) ?? 0) + 1)
      const booking: ConfirmedFreeBooking = {
        bookingReference: `ATT-${createId('booking').replace(/[^a-z0-9]/gi, '').toUpperCase()}`,
        event: draft.event,
        quantities: draft.quantities,
        guardian: draft.guardian,
        price: draft.price,
        confirmedAt,
        idempotencyKey,
        availability: availability(event.capacity, nextReserved),
      }
      bookingsByIdempotencyKey.set(idempotencyKey, booking)
      drafts.delete(draft.draftId)
      return { ok: true, data: { booking, idempotent: false } }
    },

    getAvailability(eventId) {
      const event = eventsById.get(eventId)
      return event ? currentAvailability(event) : null
    },

    getReservedTickets(eventId) {
      return eventsById.has(eventId) ? reservedTickets.get(eventId) ?? null : null
    },

    reset() {
      reservedTickets.clear()
      initialReservedTickets.forEach((value, key) => reservedTickets.set(key, value))
      revisions.forEach((_value, key) => revisions.set(key, 0))
      drafts.clear()
      bookingsByIdempotencyKey.clear()
      sequence = 0
    },
  }
}
