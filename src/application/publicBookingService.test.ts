import { describe, expect, it, vi } from 'vitest'
import { demoEvents, demoOrganisations } from '../demo/seed'
import {
  ConfirmedBookingRepositoryError,
  type ConfirmedBookingRepository,
  type PersistedFreeBooking,
} from './confirmedBookingRepository'
import { createPublicBookingService } from './publicBookingService'

function createService(repository?: ConfirmedBookingRepository) {
  let sequence = 0
  return createPublicBookingService({
    events: demoEvents,
    organisations: demoOrganisations,
    repository,
    now: () => '2026-09-02T09:00:00.000Z',
    createId: (kind) => `${kind}_${++sequence}`,
  })
}

function sharedBooking(overrides: Partial<PersistedFreeBooking> = {}): PersistedFreeBooking {
  return {
    id: 'booking_shared_1',
    bookingReference: 'ATT-SHARED1',
    idempotencyKey: 'shared-1',
    eventId: 'evt_autumn_fair',
    organisationId: 'org_westbrook_school',
    guardian: { name: 'Priya Shah', email: 'priya@example.test' },
    quantities: { adultTickets: 2, childTickets: 0, total: 2 },
    confirmedAt: '2026-09-01T12:00:00.000Z',
    confirmedVia: 'webmcp',
    isSynthetic: true,
    ...overrides,
  }
}

function createTestRepository(initial: readonly PersistedFreeBooking[] = []) {
  const bookings = [...initial]
  const reservedFor = (eventId: string) => {
    const event = demoEvents.find((item) => item.id === eventId)
    return (event?.reservedTickets ?? 0) + bookings
      .filter((booking) => booking.eventId === eventId)
      .reduce((total, booking) => total + booking.quantities.total, 0)
  }
  const repository: ConfirmedBookingRepository = {
    list: vi.fn(async () => [...bookings]),
    create: vi.fn(async (input) => {
      const event = demoEvents.find((item) => item.id === input.eventId)
      if (!event) throw new Error('Unknown event')
      const total = input.quantities.adultTickets + input.quantities.childTickets
      if (reservedFor(event.id) + total > event.capacity) {
        const reserved = reservedFor(event.id)
        throw new ConfirmedBookingRepositoryError('rejected', 'Sold out.', {
          rejection: {
            code: 'insufficient_availability',
            message: 'Sold out.',
            currentAvailability: { capacity: event.capacity, reserved, remaining: event.capacity - reserved, soldOut: true },
          },
        })
      }
      const booking = sharedBooking({
        id: `booking_shared_${bookings.length + 1}`,
        bookingReference: `ATT-SHARED${bookings.length + 1}`,
        idempotencyKey: input.idempotencyKey,
        eventId: event.id,
        organisationId: event.organisationId,
        guardian: input.guardian,
        quantities: { ...input.quantities, total },
        confirmedAt: '2026-09-02T09:05:00.000Z',
        confirmedVia: input.actorChannel,
      })
      bookings.push(booking)
      const reserved = reservedFor(event.id)
      return {
        booking,
        idempotent: false,
        availability: { capacity: event.capacity, reserved, remaining: event.capacity - reserved, soldOut: false },
      }
    }),
  }
  return { repository, bookings }
}

describe('public booking service', () => {
  it('prepares a non-binding privacy-preserving free booking draft', async () => {
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

  it('confirms exactly one booking and decreases availability atomically', async () => {
    const service = createService()
    const draft = service.createDraft({
      eventId: 'evt_autumn_fair',
      quantities: { adultTickets: 1, childTickets: 2 },
      guardian: { name: 'Alex Morgan', email: 'alex@example.test' },
    })
    expect(draft.ok).toBe(true)
    if (!draft.ok) return

    const confirmed = await service.confirmDraft({ draftId: draft.data.draftId, idempotencyKey: 'booking-attempt-1' })
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
    const repeated = await service.confirmDraft({ draftId: draft.data.draftId, idempotencyKey: 'booking-attempt-1' })
    expect(repeated).toMatchObject({
      ok: true,
      data: { idempotent: true, booking: { bookingReference: 'ATT-BOOKING2' } },
    })
    expect(service.getAvailability('evt_autumn_fair')).toMatchObject({ reserved: 139, remaining: 41 })
  })

  it('rejects a stale draft with current availability and requires a new review', async () => {
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

    expect(await service.confirmDraft({ draftId: first.data.draftId, idempotencyKey: 'first' })).toMatchObject({ ok: true })
    expect(await service.confirmDraft({ draftId: stale.data.draftId, idempotencyKey: 'stale' })).toEqual({
      ok: false,
      error: {
        code: 'stale_booking_draft',
        message: 'Availability changed after this draft was prepared. No booking was created; prepare a new draft for review.',
        currentAvailability: { capacity: 30, reserved: 26, remaining: 4, soldOut: false },
        requiresNewDraft: true,
      },
    })
  })

  it('rejects paid events without attempting a booking', async () => {
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

  it('persists confirmations through the shared store and reflects bookings made elsewhere', async () => {
    const { repository } = createTestRepository([sharedBooking()])
    const service = createService(repository)
    const listener = vi.fn()
    service.subscribe(listener)

    service.syncBookings(await repository.list())
    expect(service.getAvailability('evt_autumn_fair')).toMatchObject({ reserved: 138, remaining: 42 })
    expect(service.getConfirmedBookings('evt_autumn_fair')).toMatchObject([
      { bookingReference: 'ATT-SHARED1', guardian: { name: 'Priya Shah' }, persisted: true, confirmedVia: 'webmcp' },
    ])

    const draft = service.createDraft({
      eventId: 'evt_autumn_fair',
      quantities: { adultTickets: 1, childTickets: 2 },
      guardian: { name: 'Alex Morgan', email: 'alex@example.test' },
    })
    expect(draft.ok).toBe(true)
    if (!draft.ok) return

    const confirmed = await service.confirmDraft({
      draftId: draft.data.draftId,
      idempotencyKey: 'booking-attempt-1',
      actorChannel: 'human-ui',
    })
    expect(repository.create).toHaveBeenCalledWith({
      eventId: 'evt_autumn_fair',
      quantities: { adultTickets: 1, childTickets: 2 },
      guardian: { name: 'Alex Morgan', email: 'alex@example.test' },
      idempotencyKey: 'booking-attempt-1',
      actorChannel: 'human-ui',
    })
    expect(confirmed).toMatchObject({
      ok: true,
      data: {
        idempotent: false,
        booking: {
          bookingReference: 'ATT-SHARED2',
          confirmedAt: '2026-09-02T09:05:00.000Z',
          confirmedVia: 'human-ui',
          persisted: true,
          availability: { reserved: 141, remaining: 39 },
        },
      },
    })
    expect(service.getConfirmedBookings('evt_autumn_fair').map((booking) => booking.bookingReference))
      .toEqual(['ATT-SHARED2', 'ATT-SHARED1'])
    expect(listener).toHaveBeenLastCalledWith(expect.arrayContaining([
      expect.objectContaining({ bookingReference: 'ATT-SHARED2' }),
    ]))

    const repeated = await service.confirmDraft({ draftId: draft.data.draftId, idempotencyKey: 'booking-attempt-1' })
    expect(repeated).toMatchObject({ ok: true, data: { idempotent: true, booking: { bookingReference: 'ATT-SHARED2' } } })
    expect(repository.create).toHaveBeenCalledTimes(1)

    service.reset()
    expect(service.getConfirmedBookings('evt_autumn_fair')).toHaveLength(2)
    expect(service.getAvailability('evt_autumn_fair')).toMatchObject({ reserved: 141 })
  })

  it('does not replay a shared booking whose idempotency key matches a new local confirmation', async () => {
    const { repository } = createTestRepository([sharedBooking({ idempotencyKey: 'human-draft_1' })])
    const service = createService(repository)
    service.syncBookings(await repository.list())

    const draft = service.createDraft({
      eventId: 'evt_autumn_fair',
      quantities: { adultTickets: 1, childTickets: 0 },
      guardian: { name: 'Casey Lin', email: 'casey@example.test' },
    })
    expect(draft.ok).toBe(true)
    if (!draft.ok) return
    expect(draft.data.draftId).toBe('draft_1')

    const confirmed = await service.confirmDraft({ draftId: draft.data.draftId, idempotencyKey: 'human-draft_1' })
    expect(repository.create).toHaveBeenCalledTimes(1)
    expect(confirmed).toMatchObject({
      ok: true,
      data: { idempotent: false, booking: { guardian: { name: 'Casey Lin' }, bookingReference: 'ATT-SHARED2' } },
    })
  })

  it('invalidates an open draft when a sync shows availability changed elsewhere', async () => {
    const { repository } = createTestRepository()
    const service = createService(repository)
    const draft = service.createDraft({
      eventId: 'evt_autumn_fair',
      quantities: { adultTickets: 1, childTickets: 0 },
      guardian: { name: 'Alex Morgan', email: 'alex@example.test' },
    })
    expect(draft.ok).toBe(true)
    if (!draft.ok) return

    service.syncBookings([sharedBooking()])
    await expect(service.confirmDraft({ draftId: draft.data.draftId, idempotencyKey: 'late' })).resolves.toMatchObject({
      ok: false,
      error: { code: 'stale_booking_draft', currentAvailability: { reserved: 138 }, requiresNewDraft: true },
    })
    expect(repository.create).not.toHaveBeenCalled()
  })

  it('reports shared-store rejections without inventing a booking', async () => {
    const { repository } = createTestRepository([
      sharedBooking({ eventId: 'evt_print_workshop', organisationId: 'org_lantern_rooms', quantities: { adultTickets: 5, childTickets: 0, total: 5 } }),
    ])
    const service = createService(repository)
    const draft = service.createDraft({
      eventId: 'evt_print_workshop',
      quantities: { adultTickets: 2, childTickets: 0 },
      guardian: { name: 'Alex Morgan', email: 'alex@example.test' },
    })
    expect(draft.ok).toBe(true)
    if (!draft.ok) return

    await expect(service.confirmDraft({ draftId: draft.data.draftId, idempotencyKey: 'full' })).resolves.toEqual({
      ok: false,
      error: {
        code: 'insufficient_availability',
        message: 'Only 1 tickets are currently available. No booking was created.',
        currentAvailability: { capacity: 30, reserved: 29, remaining: 1, soldOut: false },
        requiresNewDraft: true,
      },
    })
    expect(service.getConfirmedBookings()).toEqual([])

    const offline = createService({
      list: async () => [],
      create: async () => {
        throw new ConfirmedBookingRepositoryError('unavailable', 'The shared booking store is unavailable.')
      },
    })
    const retryable = offline.createDraft({
      eventId: 'evt_autumn_fair',
      quantities: { adultTickets: 1, childTickets: 0 },
      guardian: { name: 'Alex Morgan', email: 'alex@example.test' },
    })
    expect(retryable.ok).toBe(true)
    if (!retryable.ok) return
    await expect(offline.confirmDraft({ draftId: retryable.data.draftId, idempotencyKey: 'offline' })).resolves.toEqual({
      ok: false,
      error: {
        code: 'booking_store_unavailable',
        message: 'The booking could not be saved to shared storage. Check your connection and confirm the booking again.',
      },
    })
    expect(offline.getAvailability('evt_autumn_fair')).toMatchObject({ reserved: 136 })
  })
})
