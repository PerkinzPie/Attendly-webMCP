import { describe, expect, it, vi } from 'vitest'
import type { CreatedEvent, EventDraft } from '../domain/eventOperations'
import {
  CreatedEventRepositoryError,
  createHttpCreatedEventRepository,
} from './createdEventRepository'

const event: CreatedEvent = {
  id: 'event_shared_1',
  sourceDraftId: 'event-draft_1',
  organisationId: 'org_westbrook_school',
  name: 'Shared Demo Event',
  startsAt: '2026-10-10T17:30:00.000Z',
  venue: 'Willowbrook Hall',
  capacity: 40,
  createdAt: '2026-09-03T10:00:00.000Z',
  createdBy: {
    id: 'actor_attendly_site_tool',
    displayName: 'Attendly site tool',
    channel: 'webmcp',
    isSynthetic: true,
  },
  isSynthetic: true,
}

const draft: EventDraft = {
  id: event.sourceDraftId,
  organisationId: event.organisationId,
  name: event.name,
  startsAt: event.startsAt,
  venue: event.venue,
  capacity: event.capacity,
  preparedAt: '2026-09-03T09:59:00.000Z',
  errors: [],
  warnings: [],
}

describe('HTTP created event repository', () => {
  it('loads shared events and deduplicates simultaneous list requests', async () => {
    let resolveResponse: ((response: Response) => void) | undefined
    const fetcher = vi.fn(() => new Promise<Response>((resolve) => {
      resolveResponse = resolve
    }))
    const repository = createHttpCreatedEventRepository({ fetch: fetcher })

    const first = repository.list()
    const second = repository.list()
    expect(fetcher).toHaveBeenCalledTimes(1)

    resolveResponse?.(Response.json({ ok: true, events: [event] }))
    await expect(first).resolves.toEqual([event])
    await expect(second).resolves.toEqual([event])
  })

  it('creates a shared event from only the reviewed draft and actor channel', async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => (
      Response.json({ ok: true, event, idempotent: false })
    ))
    const repository = createHttpCreatedEventRepository({ fetch: fetcher })

    await expect(repository.create(draft, 'webmcp')).resolves.toEqual({ event, idempotent: false })
    const [, init] = fetcher.mock.calls[0]
    expect(init).toMatchObject({ method: 'POST', cache: 'no-store' })
    expect(JSON.parse(String(init?.body))).toEqual({
      draft: {
        id: draft.id,
        organisationId: draft.organisationId,
        name: draft.name,
        startsAt: draft.startsAt,
        venue: draft.venue,
        capacity: draft.capacity,
        preparedAt: draft.preparedAt,
      },
      actorChannel: 'webmcp',
    })
  })

  it('rejects invalid or unsuccessful server responses', async () => {
    const rejected = createHttpCreatedEventRepository({
      fetch: async () => Response.json({ error: { message: 'Draft rejected.' } }, { status: 400 }),
    })
    await expect(rejected.create(draft, 'human-ui')).rejects.toEqual(expect.objectContaining({
      code: 'rejected',
      message: 'Draft rejected.',
    }))

    const invalid = createHttpCreatedEventRepository({
      fetch: async () => Response.json({ ok: true, events: [{ id: 123 }] }),
    })
    await expect(invalid.list()).rejects.toBeInstanceOf(CreatedEventRepositoryError)
  })
})
