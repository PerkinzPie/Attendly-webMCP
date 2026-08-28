import {
  createEventOperationsState,
  type EventOperationsState,
} from '../domain/eventOperations'

export type PersistedEventOperationsState = {
  readonly schemaVersion: 1
  readonly revision: number
  readonly state: EventOperationsState
}

export type StoreMutation<T> = {
  readonly state: EventOperationsState
  readonly value: T
}

export type StoreUpdate<T> = {
  readonly persisted: PersistedEventOperationsState
  readonly value: T
}

export type EventOperationsStore = {
  read(): PersistedEventOperationsState
  update<T>(mutate: (state: EventOperationsState) => StoreMutation<T>): StoreUpdate<T>
  subscribe(listener: (persisted: PersistedEventOperationsState) => void): () => void
}

export type EventOperationsStorage = Pick<Storage, 'getItem' | 'setItem'>

export type PersistentEventOperationsStoreOptions = {
  readonly storage: EventOperationsStorage
  readonly initialState: EventOperationsState
  readonly key?: string
  readonly onSubscriberError?: (error: unknown) => void
}

export class EventOperationsStoreError extends Error {
  readonly code: 'read-failed' | 'write-failed'

  constructor(code: 'read-failed' | 'write-failed', message: string, cause?: unknown) {
    super(message, { cause })
    this.name = 'EventOperationsStoreError'
    this.code = code
  }
}

const defaultStorageKey = 'attendly-webmcp:event-operations:v1'

function cloneState(state: EventOperationsState): EventOperationsState {
  return createEventOperationsState(state)
}

function clonePersisted(persisted: PersistedEventOperationsState): PersistedEventOperationsState {
  return {
    ...persisted,
    state: cloneState(persisted.state),
  }
}

function parsePersisted(raw: string, initialState: EventOperationsState): PersistedEventOperationsState {
  const parsed: unknown = JSON.parse(raw)

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Persisted event operations state must be an object')
  }

  const record = parsed as Record<string, unknown>
  if (record.schemaVersion !== 1) {
    throw new Error('Persisted event operations schema is not supported')
  }
  if (!Number.isSafeInteger(record.revision) || Number(record.revision) < 0) {
    throw new Error('Persisted event operations revision is invalid')
  }
  if (!record.state || typeof record.state !== 'object') {
    throw new Error('Persisted event operations state is missing')
  }

  const storedState = record.state as Record<string, unknown>
  const storedEvent = storedState.event
  const storedEventRecord = storedEvent && typeof storedEvent === 'object'
    ? storedEvent as Record<string, unknown>
    : null
  const isSeedEvent = storedEventRecord?.id === initialState.event.id
  const migratedEvent = storedEventRecord && isSeedEvent
    ? {
        ...storedEventRecord,
        ...(!('startsAt' in storedEventRecord) ? { startsAt: initialState.event.startsAt } : {}),
        ...(!('organisationId' in storedEventRecord) ? { organisationId: initialState.event.organisationId } : {}),
      }
    : storedEvent
  const migratedCreatedEvents = Array.isArray(storedState.createdEvents)
    ? storedState.createdEvents.map((event) => event && typeof event === 'object' && !('organisationId' in event)
      ? { ...event, organisationId: initialState.event.organisationId }
      : event)
    : storedState.createdEvents
  const initialAttendeesById = new Map(initialState.attendees.map((attendee) => [attendee.id, attendee]))
  const migratedAttendees = Array.isArray(storedState.attendees)
    ? storedState.attendees.map((attendee) => {
        if (!attendee || typeof attendee !== 'object' || 'email' in attendee) return attendee
        const initialAttendee = initialAttendeesById.get(String((attendee as Record<string, unknown>).id))
        return initialAttendee ? { ...attendee, email: initialAttendee.email } : attendee
      })
    : storedState.attendees
  const migratedActivityEntries = Array.isArray(storedState.activityEntries)
    ? storedState.activityEntries.map((entry) => {
        if (!entry || typeof entry !== 'object') return entry
        const activity = entry as Record<string, unknown>
        return {
          ...activity,
          ...(!('targetLabel' in activity) ? { targetLabel: String(activity.targetId ?? 'Event operation') } : {}),
          ...(!('outcome' in activity) ? { outcome: 'succeeded' } : {}),
          ...(!('resultSummary' in activity) ? { resultSummary: 'Completed successfully.' } : {}),
        }
      })
    : storedState.activityEntries
  const migratedState = {
    ...storedState,
    event: migratedEvent,
    createdEvents: migratedCreatedEvents,
    attendees: migratedAttendees,
    activityEntries: migratedActivityEntries,
  }

  return {
    schemaVersion: 1,
    revision: Number(record.revision),
    state: createEventOperationsState(migratedState as EventOperationsState),
  }
}

export function createPersistentEventOperationsStore(
  options: PersistentEventOperationsStoreOptions,
): EventOperationsStore {
  const key = options.key ?? defaultStorageKey
  const listeners = new Set<(persisted: PersistedEventOperationsState) => void>()

  function write(persisted: PersistedEventOperationsState) {
    try {
      options.storage.setItem(key, JSON.stringify(persisted))
    } catch (error) {
      throw new EventOperationsStoreError('write-failed', 'Event operations state could not be persisted', error)
    }
  }

  function read(): PersistedEventOperationsState {
    let raw: string | null
    try {
      raw = options.storage.getItem(key)
    } catch (error) {
      throw new EventOperationsStoreError('read-failed', 'Event operations state could not be read', error)
    }

    if (raw) {
      try {
        return clonePersisted(parsePersisted(raw, options.initialState))
      } catch (error) {
        throw new EventOperationsStoreError('read-failed', 'Persisted event operations state is invalid', error)
      }
    }

    const initial: PersistedEventOperationsState = {
      schemaVersion: 1,
      revision: 0,
      state: cloneState(options.initialState),
    }
    write(initial)
    return clonePersisted(initial)
  }

  return {
    read,
    update<T>(mutate: (state: EventOperationsState) => StoreMutation<T>): StoreUpdate<T> {
      const current = read()
      const mutation = mutate(current.state)
      const persisted: PersistedEventOperationsState = {
        schemaVersion: 1,
        revision: current.revision + 1,
        state: cloneState(mutation.state),
      }

      write(persisted)
      for (const listener of listeners) {
        try {
          listener(clonePersisted(persisted))
        } catch (error) {
          options.onSubscriberError?.(error)
        }
      }

      return {
        persisted: clonePersisted(persisted),
        value: mutation.value,
      }
    },
    subscribe(listener: (persisted: PersistedEventOperationsState) => void) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

export function createBrowserEventOperationsStore(
  initialState: EventOperationsState,
  key?: string,
): EventOperationsStore {
  return createPersistentEventOperationsStore({
    storage: globalThis.localStorage,
    initialState,
    ...(key ? { key } : {}),
  })
}
