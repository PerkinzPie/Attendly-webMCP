import { describe, expect, it } from 'vitest'
import { createConfirmedBooking, listConfirmedBookings } from './bookings'

type StoredRow = {
  id: string
  booking_reference: string
  idempotency_key: string
  event_id: string
  organisation_id: string
  guardian_name: string
  guardian_email: string
  adult_tickets: number
  child_tickets: number
  confirmed_at: string
  confirmed_via: 'human-ui' | 'webmcp'
  is_synthetic: number
}

function result<T>(results: T[]): D1Result<T> {
  return {
    success: true,
    results,
    meta: {
      duration: 0,
      size_after: 0,
      rows_read: 0,
      rows_written: 0,
      last_row_id: 0,
      changed_db: false,
      changes: 0,
    },
  }
}

function createTestDatabase() {
  const rows: StoredRow[] = []
  const booked = (eventId: unknown) => rows
    .filter((row) => row.event_id === eventId)
    .reduce((total, row) => total + row.adult_tickets + row.child_tickets, 0)
  const database = new Proxy(Object.create(null) as D1Database, {
    get(_target, property) {
      if (property === 'withSession') return () => database
      if (property !== 'prepare') return undefined
      return (sql: string) => {
        let bindings: unknown[] = []
        const statement = new Proxy(Object.create(null) as D1PreparedStatement, {
          get(_statement, method) {
            if (method === 'bind') {
              return (...values: unknown[]) => {
                bindings = values
                return statement
              }
            }
            if (method === 'first') {
              return async () => {
                if (sql.includes('SUM(')) return { booked: booked(bindings[0]) }
                return rows.find((row) => row.idempotency_key === bindings[0]) ?? null
              }
            }
            if (method === 'all') return async () => result(rows)
            if (method === 'run') {
              return async () => {
                const [
                  id, reference, key, eventId, organisationId, name, email, adults, children, confirmedAt, via,
                  guardKey, guardEventId, requested, capacity,
                ] = bindings
                if (
                  !rows.some((row) => row.idempotency_key === guardKey)
                  && booked(guardEventId) + Number(requested) <= Number(capacity)
                ) {
                  rows.push({
                    id: String(id),
                    booking_reference: String(reference),
                    idempotency_key: String(key),
                    event_id: String(eventId),
                    organisation_id: String(organisationId),
                    guardian_name: String(name),
                    guardian_email: String(email),
                    adult_tickets: Number(adults),
                    child_tickets: Number(children),
                    confirmed_at: String(confirmedAt),
                    confirmed_via: via === 'webmcp' ? 'webmcp' : 'human-ui',
                    is_synthetic: 1,
                  })
                }
                return result([])
              }
            }
            return undefined
          },
        })
        return statement
      }
    },
  })
  return { database, rows }
}

function request(overrides: Record<string, unknown> = {}, idempotencyKey = 'booking-attempt-1') {
  return new Request('https://example.test/api/bookings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      booking: {
        eventId: 'evt_autumn_fair',
        adultTickets: 1,
        childTickets: 2,
        guardianName: 'Alex Morgan',
        guardianEmail: 'Alex@example.test',
        ...overrides,
      },
      idempotencyKey,
      actorChannel: 'webmcp',
    }),
  })
}

describe('confirmed booking Pages Function', () => {
  it('creates, idempotently retries and lists one shared booking', async () => {
    const { database, rows } = createTestDatabase()

    const created = await createConfirmedBooking(request(), database)
    expect(created.status).toBe(200)
    await expect(created.json()).resolves.toMatchObject({
      ok: true,
      idempotent: false,
      booking: {
        bookingReference: expect.stringMatching(/^ATT-[0-9A-F]{8}$/),
        eventId: 'evt_autumn_fair',
        organisationId: 'org_westbrook_school',
        guardian: { name: 'Alex Morgan', email: 'alex@example.test' },
        quantities: { adultTickets: 1, childTickets: 2, total: 3 },
        confirmedVia: 'webmcp',
      },
      availability: { capacity: 180, reserved: 139, remaining: 41 },
    })

    const repeated = await createConfirmedBooking(request(), database)
    await expect(repeated.json()).resolves.toMatchObject({ ok: true, idempotent: true })
    expect(rows).toHaveLength(1)

    const listed = await listConfirmedBookings(database)
    await expect(listed.json()).resolves.toMatchObject({
      ok: true,
      bookings: [{ guardian: { name: 'Alex Morgan' }, quantities: { total: 3 } }],
    })
  })

  it('rejects a reused idempotency key for a different booking', async () => {
    const { database, rows } = createTestDatabase()
    await createConfirmedBooking(request(), database)

    const conflicting = await createConfirmedBooking(request({ adultTickets: 2, childTickets: 0 }), database)
    expect(conflicting.status).toBe(409)
    await expect(conflicting.json()).resolves.toMatchObject({ ok: false, error: { code: 'booking_conflict' } })
    expect(rows).toHaveLength(1)
  })

  it('refuses bookings beyond the remaining capacity', async () => {
    const { database, rows } = createTestDatabase()
    const nearlyFull = { eventId: 'evt_print_workshop', adultTickets: 6, childTickets: 0 }
    await createConfirmedBooking(request(nearlyFull, 'first'), database)

    const rejected = await createConfirmedBooking(request({ ...nearlyFull, adultTickets: 1 }, 'second'), database)
    expect(rejected.status).toBe(409)
    await expect(rejected.json()).resolves.toMatchObject({
      ok: false,
      error: {
        code: 'insufficient_availability',
        currentAvailability: { capacity: 30, reserved: 30, remaining: 0, soldOut: true },
      },
    })
    expect(rows).toHaveLength(1)
  })

  it('applies the shared booking rules before touching storage', async () => {
    const { database, rows } = createTestDatabase()

    const paidOrUnknown = await createConfirmedBooking(request({ eventId: 'evt_unknown' }), database)
    expect(paidOrUnknown.status).toBe(400)
    await expect(paidOrUnknown.json()).resolves.toMatchObject({ ok: false, error: { code: 'event_not_found' } })

    const noAdult = await createConfirmedBooking(request({ adultTickets: 0, childTickets: 1 }), database)
    await expect(noAdult.json()).resolves.toMatchObject({ ok: false, error: { code: 'adult_ticket_required' } })

    const badEmail = await createConfirmedBooking(request({ guardianEmail: 'not-an-email' }), database)
    await expect(badEmail.json()).resolves.toMatchObject({ ok: false, error: { code: 'invalid_contact' } })
    expect(rows).toHaveLength(0)
  })
})
