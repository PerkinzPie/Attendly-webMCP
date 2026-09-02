import { describe, expect, it } from 'vitest'
import { demoEvents, demoOrganisations } from '../demo/seed'
import { createPublicBookingService } from './publicBookingService'

function createService() {
  let sequence = 0
  return createPublicBookingService({
    events: demoEvents,
    organisations: demoOrganisations,
    now: () => '2026-09-02T09:00:00.000Z',
    createId: (kind) => `${kind}_${++sequence}`,
  })
}

describe('public booking service', () => {
  it('prepares a non-binding privacy-preserving free booking draft', () => {
    const service = createService()
    const result = service.createDraft({
      eventId: 'evt_autumn_fair',
      quantities: { adultTickets: 1, childTickets: 2 },
      guardian: { name: 'Alex Morgan', email: 'alex@example.test' },
    })

    expect(result).toMatchObject({
      ok: true,
      data: {
        draftId: 'draft_1',
        quantities: { adultTickets: 1, childTickets: 2, total: 3 },
        guardian: { name: 'Alex Morgan', email: 'alex@example.test' },
        price: { amountPence: 0, display: '£0.00' },
        availability: { remaining: 44 },
        expiresAt: '2026-09-02T09:10:00.000Z',
        persisted: false,
      },
    })
    expect(service.getAvailability('evt_autumn_fair')).toMatchObject({ reserved: 136, remaining: 44 })
    expect(JSON.stringify(result)).not.toMatch(/childName|dateOfBirth|health/i)
  })

  it('confirms exactly one booking and decreases availability atomically', () => {
    const service = createService()
    const draft = service.createDraft({
      eventId: 'evt_autumn_fair',
      quantities: { adultTickets: 1, childTickets: 2 },
      guardian: { name: 'Alex Morgan', email: 'alex@example.test' },
    })
    expect(draft.ok).toBe(true)
    if (!draft.ok) return

    const confirmed = service.confirmDraft({ draftId: draft.data.draftId, idempotencyKey: 'booking-attempt-1' })
    expect(confirmed).toMatchObject({
      ok: true,
      data: {
        idempotent: false,
        booking: {
          bookingReference: 'ATT-BOOKING2',
          quantities: { total: 3 },
          availability: { reserved: 139, remaining: 41 },
        },
      },
    })
    const repeated = service.confirmDraft({ draftId: draft.data.draftId, idempotencyKey: 'booking-attempt-1' })
    expect(repeated).toMatchObject({
      ok: true,
      data: { idempotent: true, booking: { bookingReference: 'ATT-BOOKING2' } },
    })
    expect(service.getAvailability('evt_autumn_fair')).toMatchObject({ reserved: 139, remaining: 41 })
  })

  it('rejects a stale draft with current availability and requires a new review', () => {
    const service = createService()
    const first = service.createDraft({
      eventId: 'evt_print_workshop',
      quantities: { adultTickets: 2, childTickets: 0 },
      guardian: { name: 'Alex Morgan', email: 'alex@example.test' },
    })
    const stale = service.createDraft({
      eventId: 'evt_print_workshop',
      quantities: { adultTickets: 1, childTickets: 1 },
      guardian: { name: 'Sam Taylor', email: 'sam@example.test' },
    })
    expect(first.ok && stale.ok).toBe(true)
    if (!first.ok || !stale.ok) return

    expect(service.confirmDraft({ draftId: first.data.draftId, idempotencyKey: 'first' })).toMatchObject({ ok: true })
    expect(service.confirmDraft({ draftId: stale.data.draftId, idempotencyKey: 'stale' })).toEqual({
      ok: false,
      error: {
        code: 'stale_booking_draft',
        message: 'Availability changed after this draft was prepared. No booking was created; prepare a new draft for review.',
        currentAvailability: { capacity: 30, reserved: 26, remaining: 4, soldOut: false },
        requiresNewDraft: true,
      },
    })
  })

  it('rejects paid events without attempting a booking', () => {
    const paidEvent = { ...demoEvents[0], id: 'evt_paid', pricePence: 500 }
    const service = createPublicBookingService({
      events: [paidEvent],
      organisations: demoOrganisations,
      now: () => '2026-09-02T09:00:00.000Z',
    })

    expect(service.createDraft({
      eventId: 'evt_paid',
      quantities: { adultTickets: 1, childTickets: 0 },
      guardian: { name: 'Alex Morgan', email: 'alex@example.test' },
    })).toEqual({
      ok: false,
      error: {
        code: 'paid_booking_not_supported',
        message: 'These demo tools only prepare free bookings. No payment or reservation was attempted.',
      },
    })
  })
})
