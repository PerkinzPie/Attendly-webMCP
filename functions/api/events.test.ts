import { describe, expect, it } from 'vitest'
import { createCreatedEvent, listCreatedEvents } from './events'

type StoredRow = {
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
  created_by_channel: 'human-ui' | 'webmcp'
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
  const database = new Proxy(Object.create(null) as D1Database, {
    get(_target, property) {
      if (property === 'withSession') return () => database
      if (property !== 'prepare') return undefined
      return () => {
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
              return async () => rows.find((row) => row.source_draft_id === bindings[0]) ?? null
            }
            if (method === 'all') return async () => result(rows)
            if (method === 'run') {
              return async () => {
                if (!rows.some((row) => row.source_draft_id === bindings[1])) {
                  rows.push({
                    id: String(bindings[0]),
                    source_draft_id: String(bindings[1]),
                    organisation_id: String(bindings[2]),
                    name: String(bindings[3]),
                    starts_at: String(bindings[4]),
                    venue: String(bindings[5]),
                    capacity: Number(bindings[6]),
                    created_at: String(bindings[7]),
                    created_by_id: String(bindings[8]),
                    created_by_display_name: String(bindings[9]),
                    created_by_channel: bindings[10] === 'webmcp' ? 'webmcp' : 'human-ui',
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

function request(draftId = 'event-draft_api-test', organisationId = 'org_westbrook_school') {
  return new Request('https://example.test/api/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      draft: {
        id: draftId,
        organisationId,
        name: 'Willowbrook API Test',
        startsAt: '2026-10-22T17:00:00.000Z',
        venue: 'Willowbrook Hall',
        capacity: 60,
        preparedAt: '2026-09-03T10:55:00.000Z',
      },
      actorChannel: 'webmcp',
    }),
  })
}

describe('created event Pages Function', () => {
  it('creates, idempotently retries and lists one shared event', async () => {
    const { database, rows } = createTestDatabase()

    const created = await createCreatedEvent(request(), database)
    expect(created.status).toBe(200)
    await expect(created.json()).resolves.toMatchObject({
      ok: true,
      idempotent: false,
      event: {
        sourceDraftId: 'event-draft_api-test',
        organisationId: 'org_westbrook_school',
        name: 'Willowbrook API Test',
        createdBy: { channel: 'webmcp' },
      },
    })

    const repeated = await createCreatedEvent(request(), database)
    await expect(repeated.json()).resolves.toMatchObject({ ok: true, idempotent: true })
    expect(rows).toHaveLength(1)

    const listed = await listCreatedEvents(database)
    await expect(listed.json()).resolves.toMatchObject({
      ok: true,
      events: [{ name: 'Willowbrook API Test' }],
    })
  })

  it('rejects a draft for an organisation outside the demo boundary', async () => {
    const { database, rows } = createTestDatabase()
    const response = await createCreatedEvent(request('event-draft_invalid', 'org_private'), database)

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: { code: 'invalid_event_draft' },
    })
    expect(rows).toHaveLength(0)
  })
})
