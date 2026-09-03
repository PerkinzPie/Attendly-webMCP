import {
  ApiRequestError,
  errorResponse as error,
  isRecord,
  jsonResponse as json,
  readBoundedJson,
} from '../../src/application/apiRequest'
import type { BookingActorChannel, PersistedFreeBooking } from '../../src/application/confirmedBookingRepository'
import {
  availabilityFor,
  validateFreeBookingRequest,
  type ValidatedFreeBookingRequest,
} from '../../src/application/publicBookingService'
import { demoEvents, demoOrganisations, type DemoEvent } from '../../src/demo/seed'

type ConfirmedBookingRow = {
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
  confirmed_via: BookingActorChannel
  is_synthetic: number
}

type CreateBookingRequest = {
  readonly request: ValidatedFreeBookingRequest
  readonly idempotencyKey: string
  readonly actorChannel: BookingActorChannel
}

const eventsById = new Map(demoEvents.map((event) => [event.id, event]))
const organisationsById = new Map(demoOrganisations.map((organisation) => [organisation.id, organisation]))
const selectColumns = `
  id,
  booking_reference,
  idempotency_key,
  event_id,
  organisation_id,
  guardian_name,
  guardian_email,
  adult_tickets,
  child_tickets,
  confirmed_at,
  confirmed_via,
  is_synthetic
`

function parseCreateRequest(value: unknown): CreateBookingRequest | { readonly invalid: string, readonly message: string } {
  if (!isRecord(value) || !isRecord(value.booking)) {
    return { invalid: 'invalid_booking_request', message: 'The booking request is invalid.' }
  }
  const booking = value.booking
  if (
    typeof booking.eventId !== 'string'
    || typeof booking.adultTickets !== 'number'
    || typeof booking.childTickets !== 'number'
    || typeof booking.guardianName !== 'string'
    || typeof booking.guardianEmail !== 'string'
    || typeof value.idempotencyKey !== 'string'
    || value.idempotencyKey.trim().length === 0
    || value.idempotencyKey.length > 100
    || (value.actorChannel !== 'human-ui' && value.actorChannel !== 'webmcp')
    || booking.guardianName.length > 200
    || booking.guardianEmail.length > 254
  ) {
    return { invalid: 'invalid_booking_request', message: 'The booking request is invalid.' }
  }

  const event = eventsById.get(booking.eventId)
  const validated = validateFreeBookingRequest({
    event,
    organisation: event ? organisationsById.get(event.organisationId) : undefined,
    quantities: { adultTickets: booking.adultTickets, childTickets: booking.childTickets },
    guardian: { name: booking.guardianName, email: booking.guardianEmail },
  })
  if (!validated.ok) return { invalid: validated.error.code, message: validated.error.message }

  return {
    request: validated.data,
    idempotencyKey: value.idempotencyKey.trim(),
    actorChannel: value.actorChannel,
  }
}

function rowToBooking(row: ConfirmedBookingRow): PersistedFreeBooking {
  return {
    id: row.id,
    bookingReference: row.booking_reference,
    idempotencyKey: row.idempotency_key,
    eventId: row.event_id,
    organisationId: row.organisation_id,
    guardian: { name: row.guardian_name, email: row.guardian_email },
    quantities: {
      adultTickets: row.adult_tickets,
      childTickets: row.child_tickets,
      total: row.adult_tickets + row.child_tickets,
    },
    confirmedAt: row.confirmed_at,
    confirmedVia: row.confirmed_via,
    isSynthetic: true,
  }
}

async function findByIdempotencyKey(db: D1Database | D1DatabaseSession, idempotencyKey: string) {
  const row = await db.prepare(`
    SELECT ${selectColumns}
    FROM confirmed_bookings
    WHERE idempotency_key = ?
  `).bind(idempotencyKey).first<ConfirmedBookingRow>()
  return row ? rowToBooking(row) : null
}

async function availabilityOf(db: D1Database | D1DatabaseSession, event: DemoEvent) {
  const row = await db.prepare(`
    SELECT COALESCE(SUM(adult_tickets + child_tickets), 0) AS booked
    FROM confirmed_bookings
    WHERE event_id = ?
  `).bind(event.id).first<{ booked: number }>()
  return availabilityFor(event.capacity, event.reservedTickets + Number(row?.booked ?? 0))
}

function bookingMatchesRequest(booking: PersistedFreeBooking, request: ValidatedFreeBookingRequest) {
  return booking.eventId === request.event.id
    && booking.quantities.adultTickets === request.quantities.adultTickets
    && booking.quantities.childTickets === request.quantities.childTickets
    && booking.guardian.email === request.guardian.email
}

function createBookingReference() {
  return `ATT-${crypto.randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase()}`
}

export async function listConfirmedBookings(db: D1Database) {
  try {
    const result = await db.prepare(`
      SELECT ${selectColumns}
      FROM confirmed_bookings
      ORDER BY confirmed_at, id
    `).all<ConfirmedBookingRow>()
    return json({
      ok: true,
      bookings: result.results.map(rowToBooking),
    })
  } catch (caught) {
    console.error(JSON.stringify({
      message: 'confirmed booking list failed',
      error: caught instanceof Error ? caught.message : String(caught),
    }))
    return error('booking_store_unavailable', 'Confirmed bookings could not be loaded.', 500)
  }
}

export async function createConfirmedBooking(request: Request, db: D1Database) {
  try {
    const session = db.withSession('first-primary')
    const parsed = parseCreateRequest(await readBoundedJson(request))
    if ('invalid' in parsed) return error(parsed.invalid, parsed.message, 400)

    const { request: validated, idempotencyKey, actorChannel } = parsed
    const { event } = validated

    const existing = await findByIdempotencyKey(session, idempotencyKey)
    if (existing) {
      return bookingMatchesRequest(existing, validated)
        ? json({ ok: true, booking: existing, idempotent: true, availability: await availabilityOf(session, event) })
        : error('booking_conflict', 'This idempotency key was already used for a different booking.', 409)
    }

    const id = `booking_${crypto.randomUUID()}`
    const confirmedAt = new Date().toISOString()
    // The capacity guard runs inside the insert itself so two simultaneous
    // confirmations cannot both succeed once the final places are gone.
    await session.prepare(`
      INSERT INTO confirmed_bookings (
        id,
        booking_reference,
        idempotency_key,
        event_id,
        organisation_id,
        guardian_name,
        guardian_email,
        adult_tickets,
        child_tickets,
        confirmed_at,
        confirmed_via,
        is_synthetic
      )
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1
      WHERE NOT EXISTS (
        SELECT 1 FROM confirmed_bookings WHERE idempotency_key = ?
      )
      AND (
        SELECT COALESCE(SUM(adult_tickets + child_tickets), 0)
        FROM confirmed_bookings
        WHERE event_id = ?
      ) + ? <= ?
    `).bind(
      id,
      createBookingReference(),
      idempotencyKey,
      event.id,
      validated.organisation.id,
      validated.guardian.name,
      validated.guardian.email,
      validated.quantities.adultTickets,
      validated.quantities.childTickets,
      confirmedAt,
      actorChannel,
      idempotencyKey,
      event.id,
      event.reservedTickets + validated.quantities.total,
      event.capacity,
    ).run()

    const stored = await findByIdempotencyKey(session, idempotencyKey)
    const availability = await availabilityOf(session, event)
    if (!stored) {
      return error(
        'insufficient_availability',
        `Only ${availability.remaining} tickets are currently available. No booking was created.`,
        409,
        { currentAvailability: availability },
      )
    }
    if (!bookingMatchesRequest(stored, validated)) {
      return error('booking_conflict', 'This idempotency key was already used for a different booking.', 409)
    }

    return json({ ok: true, booking: stored, idempotent: stored.id !== id, availability })
  } catch (caught) {
    if (caught instanceof ApiRequestError && caught.code === 'request_too_large') {
      return error('request_too_large', 'The booking request is too large.', 413)
    }
    if (caught instanceof ApiRequestError && caught.code === 'invalid_json') {
      return error('invalid_json', 'The request body must be valid JSON.', 400)
    }
    console.error(JSON.stringify({
      message: 'confirmed booking write failed',
      error: caught instanceof Error ? caught.message : String(caught),
    }))
    return error('booking_store_unavailable', 'The booking could not be saved.', 500)
  }
}

export const onRequestGet: PagesFunction<Env> = ({ env }) => listConfirmedBookings(env.DB)

export const onRequestPost: PagesFunction<Env> = ({ request, env }) => (
  createConfirmedBooking(request, env.DB)
)
