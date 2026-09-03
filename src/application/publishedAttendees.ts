import { getPublishedEventAttendees } from '../demo/seed'
import type { BookingActorChannel } from './confirmedBookingRepository'
import type { ConfirmedFreeBooking } from './publicBookingService'

export type PublishedEventAttendee = {
  readonly id: string
  readonly eventId: string
  readonly name: string
  readonly email: string
  readonly registrationReference: string
  readonly places: number
  readonly status: 'registered'
  readonly source: 'seeded' | 'booking'
  readonly bookedAt?: string
  readonly bookedVia?: BookingActorChannel
  readonly isSynthetic: true
}

/**
 * Attendees visible on a published event before check-in opens: confirmed
 * free bookings first (newest at the top), then the seeded registrations.
 */
export function listPublishedEventAttendees(
  eventId: string,
  bookings: readonly ConfirmedFreeBooking[],
): readonly PublishedEventAttendee[] {
  const booked = bookings
    .filter((booking) => booking.event.eventId === eventId)
    .toSorted((left, right) => (
      Date.parse(right.confirmedAt) - Date.parse(left.confirmedAt)
      || left.bookingReference.localeCompare(right.bookingReference, 'en-GB')
    ))
    .map((booking): PublishedEventAttendee => ({
      id: `booked_${booking.bookingReference}`,
      eventId,
      name: booking.guardian.name,
      email: booking.guardian.email,
      registrationReference: booking.bookingReference,
      places: booking.quantities.total,
      status: 'registered',
      source: 'booking',
      bookedAt: booking.confirmedAt,
      bookedVia: booking.confirmedVia,
      isSynthetic: true,
    }))

  const seeded = getPublishedEventAttendees(eventId).map((attendee): PublishedEventAttendee => ({
    id: attendee.id,
    eventId: attendee.eventId,
    name: attendee.name,
    email: attendee.email,
    registrationReference: attendee.registrationReference,
    places: 1,
    status: 'registered',
    source: 'seeded',
    isSynthetic: true,
  }))

  return [...booked, ...seeded]
}
