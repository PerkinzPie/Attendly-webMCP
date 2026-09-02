import type {
  DemoEvent,
  DemoOrganisation,
  PublicEventAudience,
} from '../demo/seed'

export type PublicEventSearchInput = {
  readonly fromDate: string
  readonly toDate: string
  readonly audience?: PublicEventAudience
  readonly age?: number
  readonly organisationId?: string
}

export type PublicEventAvailability = {
  readonly capacity: number
  readonly reserved: number
  readonly remaining: number
  readonly soldOut: boolean
}

export type PublicEventSummary = {
  readonly eventId: string
  readonly organisation: {
    readonly id: string
    readonly name: string
    readonly location: string
  }
  readonly name: string
  readonly schedule: {
    readonly startsAt: string
    readonly date: string
    readonly time: string
  }
  readonly venue: string
  readonly category: string
  readonly ticketing: {
    readonly isFree: boolean
    readonly pricePence: number
    readonly currency: 'GBP'
  }
  readonly suitability: {
    readonly audiences: readonly PublicEventAudience[]
    readonly ageGuidance: {
      readonly label: string
      readonly minAge?: number
      readonly maxAge?: number
    }
    readonly evidence: 'organiser-authored event metadata'
  }
  readonly availability: PublicEventAvailability
}

export type PublicEventDetails = PublicEventSummary & {
  readonly summary: string
  readonly description: string
  readonly publicationStatus: 'published'
  readonly bookingRules: {
    readonly freeBookingOnly: true
    readonly maximumTicketsPerBooking: 6
    readonly explicitConfirmationRequired: true
    readonly closes: string
  }
}

export type PublicEventCatalogueError = {
  readonly code:
    | 'date_range_too_large'
    | 'event_not_found'
    | 'invalid_age'
    | 'invalid_date'
    | 'invalid_date_range'
    | 'unknown_organisation'
  readonly message: string
}

export type PublicEventCatalogueResult<T> =
  | { readonly ok: true, readonly data: T }
  | { readonly ok: false, readonly error: PublicEventCatalogueError }

export type PublicEventCatalogue = {
  search(input: PublicEventSearchInput): PublicEventCatalogueResult<readonly PublicEventSummary[]>
  getDetails(eventId: string, organisationId?: string): PublicEventCatalogueResult<PublicEventDetails>
}

const publicEventAudiences: readonly PublicEventAudience[] = [
  'adults',
  'all-ages',
  'children',
  'families',
]

function parseDateOnly(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value
    ? null
    : date
}

function sixMonthsAfter(date: Date) {
  const result = new Date(date)
  result.setUTCMonth(result.getUTCMonth() + 6)
  return result
}

function availabilityFor(event: DemoEvent, reservedTickets: number): PublicEventAvailability {
  const remaining = Math.max(0, event.capacity - reservedTickets)
  return {
    capacity: event.capacity,
    reserved: reservedTickets,
    remaining,
    soldOut: remaining === 0,
  }
}

function summaryFor(
  event: DemoEvent,
  organisation: DemoOrganisation,
  reservedTickets: number,
): PublicEventSummary {
  return {
    eventId: event.id,
    organisation: {
      id: organisation.id,
      name: organisation.name,
      location: organisation.location,
    },
    name: event.name,
    schedule: {
      startsAt: event.startsAt,
      date: event.dateLabel,
      time: event.timeLabel,
    },
    venue: event.venue,
    category: event.category,
    ticketing: {
      isFree: event.pricePence === 0,
      pricePence: event.pricePence,
      currency: 'GBP',
    },
    suitability: {
      audiences: event.audiences,
      ageGuidance: event.ageGuidance,
      evidence: 'organiser-authored event metadata',
    },
    availability: availabilityFor(event, reservedTickets),
  }
}

export function createPublicEventCatalogue(
  events: readonly DemoEvent[],
  organisations: readonly DemoOrganisation[],
  options: { readonly getReservedTickets?: (eventId: string) => number | null } = {},
): PublicEventCatalogue {
  const organisationsById = new Map(organisations.map((organisation) => [organisation.id, organisation]))
  const eventsById = new Map(events.map((event) => [event.id, event]))
  const reservedTicketsFor = (event: DemoEvent) => options.getReservedTickets?.(event.id) ?? event.reservedTickets

  return {
    search(input) {
      const fromDate = parseDateOnly(input.fromDate)
      const toDate = parseDateOnly(input.toDate)
      if (!fromDate || !toDate) {
        return {
          ok: false,
          error: {
            code: 'invalid_date',
            message: 'Use valid calendar dates in YYYY-MM-DD format.',
          },
        }
      }
      if (toDate < fromDate) {
        return {
          ok: false,
          error: {
            code: 'invalid_date_range',
            message: 'The end date must be on or after the start date.',
          },
        }
      }
      if (toDate > sixMonthsAfter(fromDate)) {
        return {
          ok: false,
          error: {
            code: 'date_range_too_large',
            message: 'Public event searches are limited to six calendar months. Narrow the date range and retry.',
          },
        }
      }
      if (input.organisationId && !organisationsById.has(input.organisationId)) {
        return {
          ok: false,
          error: {
            code: 'unknown_organisation',
            message: 'Select a published organisation from the current public events page.',
          },
        }
      }
      if (input.audience && !publicEventAudiences.includes(input.audience)) {
        return {
          ok: false,
          error: {
            code: 'invalid_age',
            message: 'Use one of the supported organiser-authored audience filters.',
          },
        }
      }
      if (input.age !== undefined && (!Number.isInteger(input.age) || input.age < 0 || input.age > 17)) {
        return {
          ok: false,
          error: {
            code: 'invalid_age',
            message: 'Age filters must be a whole number from 0 to 17.',
          },
        }
      }

      const matches = events
        .filter((event) => {
          if (event.publicationStatus !== 'published') return false
          if (input.organisationId && event.organisationId !== input.organisationId) return false
          const eventDate = event.startsAt.slice(0, 10)
          if (eventDate < input.fromDate || eventDate > input.toDate) return false
          if (input.audience && !event.audiences.includes(input.audience)) return false
          if (input.age !== undefined) {
            if (event.ageGuidance.minAge === undefined || event.ageGuidance.maxAge === undefined) return false
            if (input.age < event.ageGuidance.minAge || input.age > event.ageGuidance.maxAge) return false
          }
          return true
        })
        .toSorted((left, right) => Date.parse(left.startsAt) - Date.parse(right.startsAt))
        .flatMap((event) => {
          const organisation = organisationsById.get(event.organisationId)
          return organisation ? [summaryFor(event, organisation, reservedTicketsFor(event))] : []
        })

      return { ok: true, data: matches }
    },

    getDetails(eventId, organisationId) {
      const event = eventsById.get(eventId)
      const organisation = event ? organisationsById.get(event.organisationId) : undefined
      if (
        !event
        || !organisation
        || event.publicationStatus !== 'published'
        || (organisationId && event.organisationId !== organisationId)
      ) {
        return {
          ok: false,
          error: {
            code: 'event_not_found',
            message: 'Use a published event identifier returned by search_public_events on the current page.',
          },
        }
      }

      return {
        ok: true,
        data: {
          ...summaryFor(event, organisation, reservedTicketsFor(event)),
          summary: event.summary,
          description: event.description,
          publicationStatus: event.publicationStatus,
          bookingRules: {
            freeBookingOnly: true,
            maximumTicketsPerBooking: 6,
            explicitConfirmationRequired: true,
            closes: event.bookingClosesLabel,
          },
        },
      }
    },
  }
}
