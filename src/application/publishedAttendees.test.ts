import { describe, expect, it } from 'vitest'
import { listPublishedEventAttendees } from './publishedAttendees'
import type { ConfirmedFreeBooking } from './publicBookingService'

function booking(overrides: Partial<ConfirmedFreeBooking> & { bookingReference: string, confirmedAt: string }): ConfirmedFreeBooking {
  return {
    id: overrides.bookingReference.toLowerCase(),
    event: {
      eventId: 'evt_autumn_fair',
      name: 'Willowbrook Autumn Fair',
      organisationId: 'org_westbrook_school',
      organisationName: 'Willowbrook Primary School',
      startsAt: '2026-09-19T11:00:00.000Z',
    },
    quantities: { adultTickets: 1, childTickets: 2, total: 3 },
    guardian: { name: 'Alex Morgan', email: 'alex@example.test' },
    price: { amountPence: 0, currency: 'GBP', display: '£0.00' },
    confirmedVia: 'webmcp',
    idempotencyKey: overrides.bookingReference,
    availability: { capacity: 180, reserved: 139, remaining: 41, soldOut: false },
    persisted: true,
    ...overrides,
  }
}

describe('published event attendees', () => {
  it('lists confirmed bookings for the event ahead of the seeded registrations', () => {
    const attendees = listPublishedEventAttendees('evt_autumn_fair', [
      booking({ bookingReference: 'ATT-OLDER', confirmedAt: '2026-09-03T10:00:00.000Z' }),
      booking({
        bookingReference: 'ATT-NEWER',
        confirmedAt: '2026-09-03T11:00:00.000Z',
        guardian: { name: 'Sam Reyes', email: 'sam@example.test' },
        quantities: { adultTickets: 2, childTickets: 0, total: 2 },
      }),
      booking({
        bookingReference: 'ATT-OTHER',
        confirmedAt: '2026-09-03T12:00:00.000Z',
        event: {
          eventId: 'evt_online_safety',
          name: 'Online Safety for Families',
          organisationId: 'org_westbrook_school',
          organisationName: 'Willowbrook Primary School',
          startsAt: '2026-10-22T18:00:00.000Z',
        },
      }),
    ])

    expect(attendees).toHaveLength(138)
    expect(attendees.slice(0, 2)).toMatchObject([
      { name: 'Sam Reyes', registrationReference: 'ATT-NEWER', places: 2, source: 'booking', bookedVia: 'webmcp' },
      { name: 'Alex Morgan', registrationReference: 'ATT-OLDER', places: 3, source: 'booking' },
    ])
    expect(attendees[2]).toMatchObject({ registrationReference: 'AUT-001', places: 1, source: 'seeded' })
  })

  it('shows only bookings for events without seeded registrations', () => {
    const attendees = listPublishedEventAttendees('evt_harvest_lunch', [
      booking({
        bookingReference: 'ATT-LUNCH',
        confirmedAt: '2026-09-03T10:00:00.000Z',
        event: {
          eventId: 'evt_harvest_lunch',
          name: 'Community Harvest Lunch',
          organisationId: 'org_st_lukes',
          organisationName: 'St Luke’s Church',
          startsAt: '2026-09-27T12:00:00.000Z',
        },
      }),
    ])
    expect(attendees).toEqual([expect.objectContaining({ registrationReference: 'ATT-LUNCH', source: 'booking' })])
    expect(listPublishedEventAttendees('evt_harvest_lunch', [])).toEqual([])
  })
})
