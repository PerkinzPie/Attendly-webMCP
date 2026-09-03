import {
  prepareEventDraft,
  type CreatedEvent,
  type EventDraft,
  type EventDraftInput,
  type OperationsActor,
} from '../../src/domain/eventOperations'
import { demoOrganisations } from '../../src/demo/seed'
import {
  ApiRequestError,
  errorResponse as error,
  isRecord,
  jsonResponse as json,
  readBoundedJson,
} from '../../src/application/apiRequest'

type CreatedEventRow = {
  id: string
  source_draft_id: string
  organisation_id: string
  name: string
  starts_at: string
  venue: string
  capacity: number
  created_at: string
  created_by_id: string
  created_by_display_name: string
  created_by_channel: OperationsActor['channel']
  is_synthetic: number
}

type CreateEventRequest = {
  readonly draftId: string
  readonly preparedAt: string
  readonly input: EventDraftInput
  readonly actor: OperationsActor
}

const authorisedOrganisationIds = demoOrganisations.map((organisation) => organisation.id)
const selectColumns = `
  id,
  source_draft_id,
  organisation_id,
  name,
  starts_at,
  venue,
  capacity,
  created_at,
  created_by_id,
  created_by_display_name,
  created_by_channel,
  is_synthetic
`

function actorFor(channel: OperationsActor['channel']): OperationsActor {
  return channel === 'webmcp'
    ? {
        id: 'actor_attendly_site_tool',
        displayName: 'Attendly site tool',
        channel,
        isSynthetic: true,
      }
    : {
        id: 'actor_demo_demonstrator',
        displayName: 'Event manager',
        channel,
        isSynthetic: true,
      }
}

function parseCreateRequest(value: unknown): CreateEventRequest | null {
  if (!isRecord(value) || !isRecord(value.draft)) return null
  const draft = value.draft
  if (
    typeof draft.id !== 'string'
    || typeof draft.organisationId !== 'string'
    || typeof draft.name !== 'string'
    || typeof draft.startsAt !== 'string'
    || typeof draft.venue !== 'string'
    || !Number.isInteger(draft.capacity)
    || typeof draft.preparedAt !== 'string'
    || (value.actorChannel !== 'human-ui' && value.actorChannel !== 'webmcp')
    || draft.id.length === 0
    || draft.id.length > 200
    || draft.name.length > 200
    || draft.venue.length > 300
  ) return null

  return {
    draftId: draft.id,
    preparedAt: draft.preparedAt,
    input: {
      organisationId: draft.organisationId,
      name: draft.name,
      startsAt: draft.startsAt,
      venue: draft.venue,
      capacity: Number(draft.capacity),
    },
    actor: actorFor(value.actorChannel),
  }
}

function rowToEvent(row: CreatedEventRow): CreatedEvent {
  return {
    id: row.id,
    sourceDraftId: row.source_draft_id,
    organisationId: row.organisation_id,
    name: row.name,
    startsAt: row.starts_at,
    venue: row.venue,
    capacity: row.capacity,
    createdAt: row.created_at,
    createdBy: {
      id: row.created_by_id,
      displayName: row.created_by_display_name,
      channel: row.created_by_channel,
      isSynthetic: true,
    },
    isSynthetic: true,
  }
}

async function findByDraftId(db: D1Database | D1DatabaseSession, draftId: string) {
  const row = await db.prepare(`
    SELECT ${selectColumns}
    FROM created_events
    WHERE source_draft_id = ?
  `).bind(draftId).first<CreatedEventRow>()
  return row ? rowToEvent(row) : null
}

function eventMatchesDraft(
  event: CreatedEvent,
  draft: EventDraft,
  actor: OperationsActor,
) {
  return event.organisationId === draft.organisationId
    && event.name === draft.name
    && event.startsAt === draft.startsAt
    && event.venue === draft.venue
    && event.capacity === draft.capacity
    && event.createdBy.channel === actor.channel
}

export async function listCreatedEvents(db: D1Database) {
  try {
    const result = await db.prepare(`
      SELECT ${selectColumns}
      FROM created_events
      ORDER BY starts_at, id
    `).all<CreatedEventRow>()
    return json({
      ok: true,
      events: result.results.map(rowToEvent),
    })
  } catch (caught) {
    console.error(JSON.stringify({
      message: 'created event list failed',
      error: caught instanceof Error ? caught.message : String(caught),
    }))
    return error('event_store_unavailable', 'Created events could not be loaded.', 500)
  }
}

export async function createCreatedEvent(request: Request, db: D1Database) {
  try {
    const session = db.withSession('first-primary')
    const parsed = parseCreateRequest(await readBoundedJson(request))
    if (!parsed) return error('invalid_event_draft', 'The event draft is invalid.', 400)

    const draft = prepareEventDraft(parsed.input, {
      draftId: parsed.draftId,
      preparedAt: parsed.preparedAt,
      authorisedOrganisationIds,
    })
    if (draft.errors.length > 0) {
      return json({ ok: false, error: { code: 'invalid_event_draft', message: 'The event draft is invalid.', issues: draft.errors } }, 400)
    }

    const existing = await findByDraftId(session, draft.id)
    if (existing) {
      return eventMatchesDraft(existing, draft, parsed.actor)
        ? json({ ok: true, event: existing, idempotent: true })
        : error('event_draft_conflict', 'This draft identifier was already used for another event.', 409)
    }

    const event: CreatedEvent = {
      id: `event_${crypto.randomUUID()}`,
      sourceDraftId: draft.id,
      organisationId: draft.organisationId,
      name: draft.name,
      startsAt: draft.startsAt,
      venue: draft.venue,
      capacity: draft.capacity,
      createdAt: new Date().toISOString(),
      createdBy: parsed.actor,
      isSynthetic: true,
    }

    await session.prepare(`
      INSERT OR IGNORE INTO created_events (
        id,
        source_draft_id,
        organisation_id,
        name,
        starts_at,
        venue,
        capacity,
        created_at,
        created_by_id,
        created_by_display_name,
        created_by_channel,
        is_synthetic
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).bind(
      event.id,
      event.sourceDraftId,
      event.organisationId,
      event.name,
      event.startsAt,
      event.venue,
      event.capacity,
      event.createdAt,
      event.createdBy.id,
      event.createdBy.displayName,
      event.createdBy.channel,
    ).run()

    const stored = await findByDraftId(session, draft.id)
    if (!stored) throw new Error('Created event was not returned after insertion')
    if (!eventMatchesDraft(stored, draft, parsed.actor)) {
      return error('event_draft_conflict', 'This draft identifier was already used for another event.', 409)
    }

    return json({ ok: true, event: stored, idempotent: stored.id !== event.id })
  } catch (caught) {
    if (caught instanceof ApiRequestError && caught.code === 'request_too_large') {
      return error('request_too_large', 'The event request is too large.', 413)
    }
    if (caught instanceof ApiRequestError && caught.code === 'invalid_json') {
      return error('invalid_json', 'The request body must be valid JSON.', 400)
    }
    console.error(JSON.stringify({
      message: 'created event write failed',
      error: caught instanceof Error ? caught.message : String(caught),
    }))
    return error('event_store_unavailable', 'The event could not be saved.', 500)
  }
}

export const onRequestGet: PagesFunction<Env> = ({ env }) => listCreatedEvents(env.DB)

export const onRequestPost: PagesFunction<Env> = ({ request, env }) => (
  createCreatedEvent(request, env.DB)
)
