import { describe, expect, it, vi } from 'vitest'
import {
  ConfirmedBookingRepositoryError,
  createHttpConfirmedBookingRepository,
  type PersistedFreeBooking,
} from './confirmedBookingRepository'

const booking: PersistedFreeBooking = {
  id: 'booking_shared_1',
  bookingReference: 'ATT-1A2B3C4D',
  idempotencyKey: 'booking-attempt-1',
  eventId: 'evt_autumn_fair',
  organisationId: 'org_westbrook_school',
  guardian: { name: 'Alex Morgan', email: 'alex@example.test' },
  quantities: { adultTickets: 1, childTickets: 2, total: 3 },
  confirmedAt: '2026-09-03T10:00:00.000Z',
  confirmedVia: 'webmcp',
  isSynthetic: true,
}

const availability = { capacity: 180, reserved: 139, remaining: 41, soldOut: false }

describe('HTTP confirmed booking repository', () => {
  it('loads shared bookings and deduplicates simultaneous list requests', async () => {
    let resolveResponse: ((response: Response) => void) | undefined
    const fetcher = vi.fn(function (this: unknown) {
      if (this !== globalThis) throw new TypeError('Illegal invocation')
      return new Promise<Response>((resolve) => {
        resolveResponse = resolve
      })
    })
    const repository = createHttpConfirmedBookingRepository({ fetch: fetcher })

    const first = repository.list()
    const second = repository.list()
    expect(fetcher).toHaveBeenCalledTimes(1)

    resolveResponse?.(Response.json({ ok: true, bookings: [booking] }))
    await expect(first).resolves.toEqual([booking])
    await expect(second).resolves.toEqual([booking])
  })

  it('creates a shared booking from the reviewed draft details only', async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => (
      Response.json({ ok: true, booking, idempotent: false, availability })
    ))
    const repository = createHttpConfirmedBookingRepository({ fetch: fetcher })

    await expect(repository.create({
      eventId: booking.eventId,
      quantities: { adultTickets: 1, childTickets: 2 },
      guardian: booking.guardian,
      idempotencyKey: booking.idempotencyKey,
      actorChannel: 'webmcp',
    })).resolves.toEqual({ booking, idempotent: false, availability })
    const [, init] = fetcher.mock.calls[0]
    expect(init).toMatchObject({ method: 'POST', cache: 'no-store' })
    expect(JSON.parse(String(init?.body))).toEqual({
      booking: {
        eventId: 'evt_autumn_fair',
        adultTickets: 1,
        childTickets: 2,
        guardianName: 'Alex Morgan',
        guardianEmail: 'alex@example.test',
      },
      idempotencyKey: 'booking-attempt-1',
      actorChannel: 'webmcp',
    })
  })

  it('surfaces server rejections with their current availability', async () => {
    const rejected = createHttpConfirmedBookingRepository({
      fetch: async () => Response.json({
        ok: false,
        error: {
          code: 'insufficient_availability',
          message: 'Only 0 tickets are currently available. No booking was created.',
          currentAvailability: { ...availability, reserved: 180, remaining: 0, soldOut: true },
        },
      }, { status: 409 }),
    })
    await expect(rejected.create({
      eventId: booking.eventId,
      quantities: { adultTickets: 1, childTickets: 0 },
      guardian: booking.guardian,
      idempotencyKey: 'full',
      actorChannel: 'human-ui',
    })).rejects.toEqual(expect.objectContaining({
      code: 'rejected',
      rejection: {
        code: 'insufficient_availability',
        message: 'Only 0 tickets are currently available. No booking was created.',
        currentAvailability: { capacity: 180, reserved: 180, remaining: 0, soldOut: true },
      },
    }))

    const invalid = createHttpConfirmedBookingRepository({
      fetch: async () => Response.json({ ok: true, bookings: [{ id: 123 }] }),
    })
    await expect(invalid.list()).rejects.toBeInstanceOf(ConfirmedBookingRepositoryError)
  })
})
