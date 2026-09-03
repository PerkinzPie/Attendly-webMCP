import type { CreatedEvent, EventDraft } from '../domain/eventOperations'

export type PersistedEventActorChannel = 'human-ui' | 'webmcp'

export type CreatePersistedEventResult = {
  readonly event: CreatedEvent
  readonly idempotent: boolean
}

export type CreatedEventRepository = {
  list(): Promise<readonly CreatedEvent[]>
  create(draft: EventDraft, actorChannel: PersistedEventActorChannel): Promise<CreatePersistedEventResult>
}

export class CreatedEventRepositoryError extends Error {
  readonly code: 'unavailable' | 'rejected' | 'invalid-response'

  constructor(
    code: 'unavailable' | 'rejected' | 'invalid-response',
    message: string,
    cause?: unknown,
  ) {
    super(message, { cause })
    this.name = 'CreatedEventRepositoryError'
    this.code = code
  }
}

type HttpCreatedEventRepositoryOptions = {
  readonly fetch: typeof globalThis.fetch
  readonly endpoint?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function readActor(value: unknown): CreatedEvent['createdBy'] | null {
  if (!isRecord(value)) return null
  if (
    typeof value.id !== 'string'
    || typeof value.displayName !== 'string'
    || (value.channel !== 'human-ui' && value.channel !== 'webmcp')
    || value.isSynthetic !== true
  ) return null

  return {
    id: value.id,
    displayName: value.displayName,
    channel: value.channel,
    isSynthetic: true,
  }
}

export function readCreatedEvent(value: unknown): CreatedEvent | null {
  if (!isRecord(value)) return null
  const actor = readActor(value.createdBy)
  if (
    typeof value.id !== 'string'
    || typeof value.sourceDraftId !== 'string'
    || typeof value.organisationId !== 'string'
    || typeof value.name !== 'string'
    || typeof value.startsAt !== 'string'
    || typeof value.venue !== 'string'
    || !Number.isInteger(value.capacity)
    || Number(value.capacity) < 1
    || typeof value.createdAt !== 'string'
    || value.isSynthetic !== true
    || !actor
    || Number.isNaN(Date.parse(value.startsAt))
    || Number.isNaN(Date.parse(value.createdAt))
  ) return null

  return {
    id: value.id,
    sourceDraftId: value.sourceDraftId,
    organisationId: value.organisationId,
    name: value.name,
    startsAt: value.startsAt,
    venue: value.venue,
    capacity: Number(value.capacity),
    createdAt: value.createdAt,
    createdBy: actor,
    isSynthetic: true,
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch (error) {
    throw new CreatedEventRepositoryError(
      'invalid-response',
      'The shared event store returned an invalid response.',
      error,
    )
  }
}

function rejectionMessage(payload: unknown) {
  if (!isRecord(payload) || !isRecord(payload.error) || typeof payload.error.message !== 'string') {
    return 'The shared event store rejected the request.'
  }
  return payload.error.message
}

export function createHttpCreatedEventRepository(
  options: HttpCreatedEventRepositoryOptions = { fetch: globalThis.fetch },
): CreatedEventRepository {
  const endpoint = options.endpoint ?? '/api/events'
  let activeListRequest: Promise<readonly CreatedEvent[]> | null = null

  async function request(init?: RequestInit) {
    try {
      return await options.fetch.call(globalThis, endpoint, {
        cache: 'no-store',
        ...init,
        headers: {
          Accept: 'application/json',
          ...init?.headers,
        },
      })
    } catch (error) {
      throw new CreatedEventRepositoryError(
        'unavailable',
        'The shared event store is unavailable.',
        error,
      )
    }
  }

  return {
    list() {
      if (activeListRequest) return activeListRequest
      activeListRequest = (async () => {
        const response = await request()
        const payload = await readJson(response)
        if (!response.ok) {
          throw new CreatedEventRepositoryError('rejected', rejectionMessage(payload))
        }
        if (!isRecord(payload) || !Array.isArray(payload.events)) {
          throw new CreatedEventRepositoryError('invalid-response', 'The shared event list is invalid.')
        }
        const events = payload.events.map(readCreatedEvent)
        if (events.some((event) => event === null)) {
          throw new CreatedEventRepositoryError('invalid-response', 'The shared event list contains invalid data.')
        }
        return events.filter((event): event is CreatedEvent => event !== null)
      })().finally(() => {
        activeListRequest = null
      })
      return activeListRequest
    },
    async create(draft, actorChannel) {
      const response = await request({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draft: {
            id: draft.id,
            organisationId: draft.organisationId,
            name: draft.name,
            startsAt: draft.startsAt,
            venue: draft.venue,
            capacity: draft.capacity,
            preparedAt: draft.preparedAt,
          },
          actorChannel,
        }),
      })
      const payload = await readJson(response)
      if (!response.ok) {
        throw new CreatedEventRepositoryError('rejected', rejectionMessage(payload))
      }
      if (!isRecord(payload)) {
        throw new CreatedEventRepositoryError('invalid-response', 'The saved event response is invalid.')
      }
      const event = readCreatedEvent(payload.event)
      if (!event || typeof payload.idempotent !== 'boolean') {
        throw new CreatedEventRepositoryError('invalid-response', 'The saved event response is invalid.')
      }
      return { event, idempotent: payload.idempotent }
    },
  }
}
