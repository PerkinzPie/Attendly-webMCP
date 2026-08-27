import { describe, expect, it } from 'vitest'
import { createDemoEventOperationsState } from '../demo/seed'
import type { OperationsActor } from '../domain/eventOperations'
import {
  createEventOperationsService,
  type EventOperation,
  type EventOperationsService,
} from './eventOperationsService'
import {
  createPersistentEventOperationsStore,
  type EventOperationsStorage,
  type EventOperationsStore,
} from './eventOperationsStore'

const organiser: OperationsActor = {
  id: 'actor_demo_organiser',
  displayName: 'Synthetic demo organiser',
  channel: 'human-ui',
  isSynthetic: true,
}

const agent: OperationsActor = {
  id: 'actor_demo_agent',
  displayName: 'Synthetic demo agent',
  channel: 'webmcp',
  isSynthetic: true,
}

function createMemoryStorage() {
  const values = new Map<string, string>()
  let failNextWrite = false
  const storage: EventOperationsStorage = {
    getItem(key) {
      return values.get(key) ?? null
    },
    setItem(key, value) {
      if (failNextWrite) {
        failNextWrite = false
        throw new Error('Synthetic storage failure')
      }
      values.set(key, value)
    },
  }

  return {
    storage,
    failNextWrite() {
      failNextWrite = true
    },
  }
}

function createStore(storage: EventOperationsStorage): EventOperationsStore {
  return createPersistentEventOperationsStore({
    storage,
    initialState: createDemoEventOperationsState(),
    key: 'test:event-operations',
  })
}

function createService(
  store: EventOperationsStore,
  authorise: (actor: OperationsActor, operation: EventOperation) => boolean = () => true,
): EventOperationsService {
  const counters = new Map<string, number>()

  return createEventOperationsService({
    store,
    authorise,
    now: () => '2026-09-05T18:20:00+01:00',
    createId: (kind) => {
      const sequence = (counters.get(kind) ?? 0) + 1
      counters.set(kind, sequence)
      return `${kind}_${sequence}`
    },
    resetState: createDemoEventOperationsState,
  })
}

describe('event operations application service', () => {
  it('returns a serialisable snapshot from persisted state', () => {
    const memory = createMemoryStorage()
    const service = createService(createStore(memory.storage))
    const result = service.getSnapshot()

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Expected snapshot service to succeed')

    expect(result.data).toEqual({
      revision: 0,
      event: {
        id: 'evt_riverside_community_workshop',
        name: 'Riverside Community Workshop',
      },
      registrationCount: 16,
      checkedInCount: 13,
      notArrivedCount: 3,
      capacity: 20,
      capacityRemaining: 4,
      overCapacityBy: 0,
      capacityStatus: 'near-capacity',
      activeAccountability: null,
    })
    expect(JSON.parse(JSON.stringify(result.data))).toEqual(result.data)
  })

  it('searches attendees without updating or publishing persisted state', () => {
    const memory = createMemoryStorage()
    const store = createStore(memory.storage)
    const service = createService(store)
    const before = JSON.stringify(store.read())
    let notifications = 0
    service.subscribe(() => notifications += 1)

    const result = service.searchAttendees('Jenkins')

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Expected attendee search to succeed')
    expect(result.data.map((attendee) => attendee.name)).toEqual(['Sarah Jenkins', 'Leo Jenkins'])
    expect(JSON.stringify(store.read())).toBe(before)
    expect(notifications).toBe(0)
  })

  it('commits a check-in and its activity together before notifying subscribers', () => {
    const memory = createMemoryStorage()
    const store = createStore(memory.storage)
    const service = createService(store)
    const notifications: number[] = []
    service.subscribe((snapshot) => notifications.push(snapshot.revision))

    const result = service.checkInAttendee({
      attendeeId: 'att_sarah_jenkins',
      actor: organiser,
      reason: 'Confirmed after an unrecognised ticket code.',
    })

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Expected check-in to succeed')

    const persisted = store.read()
    expect(result.data.snapshot).toMatchObject({ revision: 1, checkedInCount: 14, notArrivedCount: 2 })
    expect(result.data.activityEntry).toMatchObject({
      action: 'attendee-checked-in',
      targetId: 'att_sarah_jenkins',
      actor: organiser,
    })
    expect(persisted.state.checkIns).toHaveLength(14)
    expect(persisted.state.activityEntries).toEqual([result.data.activityEntry])
    expect(notifications).toEqual([1])
  })

  it('persists accountability changes and recalculates subscriber snapshots', () => {
    const memory = createMemoryStorage()
    const store = createStore(memory.storage)
    const service = createService(store)
    const notifications: Array<{ revision: number, unconfirmed: number | undefined }> = []
    service.subscribe((snapshot) => notifications.push({
      revision: snapshot.revision,
      unconfirmed: snapshot.activeAccountability?.unconfirmed,
    }))

    const started = service.startAccountability({ actor: organiser })
    const recorded = service.recordAccountabilityStatus({
      attendeeId: 'att_amina_patel',
      status: 'accounted-for',
      actor: agent,
      note: 'Confirmed at the assembly point.',
    })

    expect(started.ok).toBe(true)
    expect(recorded.ok).toBe(true)
    if (!recorded.ok) throw new Error('Expected accountability update to succeed')

    expect(recorded.data.snapshot).toMatchObject({
      revision: 2,
      activeAccountability: {
        total: 13,
        accountedFor: 1,
        unconfirmed: 12,
      },
    })
    expect(store.read().state.activityEntries).toHaveLength(2)
    expect(notifications).toEqual([
      { revision: 1, unconfirmed: 13 },
      { revision: 2, unconfirmed: 12 },
    ])
  })

  it('returns a stable error without persisting or publishing an invalid change', () => {
    const memory = createMemoryStorage()
    const store = createStore(memory.storage)
    const service = createService(store)
    let notifications = 0
    service.subscribe(() => notifications += 1)
    const before = JSON.stringify(store.read())

    const result = service.checkInAttendee({
      attendeeId: 'att_amina_patel',
      actor: organiser,
    })

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'attendee_already_checked_in',
        message: 'The selected attendee is already checked in.',
        remediation: 'Refresh the event snapshot before taking another action.',
      },
    })
    expect(JSON.stringify(store.read())).toBe(before)
    expect(notifications).toBe(0)
  })

  it('leaves the prior state intact when persistence fails', () => {
    const memory = createMemoryStorage()
    const store = createStore(memory.storage)
    const service = createService(store)
    let notifications = 0
    service.subscribe(() => notifications += 1)
    const before = JSON.stringify(store.read())
    memory.failNextWrite()

    const result = service.checkInAttendee({
      attendeeId: 'att_sarah_jenkins',
      actor: organiser,
    })

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'persistence_failed',
        message: 'The event operation could not be saved.',
        remediation: 'No changes were saved. Check browser storage and retry.',
      },
    })
    expect(JSON.stringify(store.read())).toBe(before)
    expect(notifications).toBe(0)
  })

  it('reloads committed state through a new service instance', () => {
    const memory = createMemoryStorage()
    const firstService = createService(createStore(memory.storage))

    expect(firstService.checkInAttendee({
      attendeeId: 'att_sarah_jenkins',
      actor: organiser,
    }).ok).toBe(true)

    const reloaded = createService(createStore(memory.storage)).getSnapshot()
    expect(reloaded).toMatchObject({
      ok: true,
      data: { revision: 1, checkedInCount: 14, notArrivedCount: 2 },
    })
  })

  it('applies equivalent state changes for human and WebMCP callers through the same service API', () => {
    const humanMemory = createMemoryStorage()
    const agentMemory = createMemoryStorage()
    const humanStore = createStore(humanMemory.storage)
    const agentStore = createStore(agentMemory.storage)

    const humanResult = createService(humanStore).checkInAttendee({
      attendeeId: 'att_sarah_jenkins',
      actor: organiser,
      reason: 'Confirmed exception.',
    })
    const agentResult = createService(agentStore).checkInAttendee({
      attendeeId: 'att_sarah_jenkins',
      actor: agent,
      reason: 'Confirmed exception.',
    })

    expect(humanResult.ok).toBe(true)
    expect(agentResult.ok).toBe(true)
    if (!humanResult.ok || !agentResult.ok) throw new Error('Expected both interfaces to succeed')

    expect(agentResult.data.snapshot).toEqual(humanResult.data.snapshot)
    expect(agentStore.read().state.checkIns.map(({ actor: _actor, ...checkIn }) => checkIn))
      .toEqual(humanStore.read().state.checkIns.map(({ actor: _actor, ...checkIn }) => checkIn))
    expect(agentStore.read().state.activityEntries.map(({ actor: _actor, ...entry }) => entry))
      .toEqual(humanStore.read().state.activityEntries.map(({ actor: _actor, ...entry }) => entry))
  })

  it('atomically restores the deterministic seed and publishes the reset state', () => {
    const memory = createMemoryStorage()
    const store = createStore(memory.storage)
    const service = createService(store)
    const notifications: number[] = []
    service.subscribe((snapshot) => notifications.push(snapshot.revision))

    expect(service.checkInAttendee({ attendeeId: 'att_sarah_jenkins', actor: organiser }).ok).toBe(true)
    expect(service.startAccountability({ actor: organiser }).ok).toBe(true)

    const result = service.resetDemo({ actor: organiser })

    expect(result).toMatchObject({
      ok: true,
      data: {
        revision: 3,
        checkedInCount: 13,
        notArrivedCount: 3,
        activeAccountability: null,
      },
    })
    const persisted = store.read()
    expect(persisted.state.checkIns).toHaveLength(13)
    expect(persisted.state.activityEntries).toEqual([])
    expect(persisted.state.accountabilitySession).toBeNull()
    expect(notifications).toEqual([1, 2, 3])
  })

  it('does not report or publish a reset when persistence fails', () => {
    const memory = createMemoryStorage()
    const store = createStore(memory.storage)
    const service = createService(store)
    let notifications = 0
    service.subscribe(() => notifications += 1)
    expect(service.checkInAttendee({ attendeeId: 'att_sarah_jenkins', actor: organiser }).ok).toBe(true)
    const before = JSON.stringify(store.read())
    notifications = 0
    memory.failNextWrite()

    const result = service.resetDemo({ actor: organiser })

    expect(result).toMatchObject({ ok: false, error: { code: 'persistence_failed' } })
    expect(JSON.stringify(store.read())).toBe(before)
    expect(notifications).toBe(0)
  })

  it('rejects an unauthorised caller before changing persisted state', () => {
    const memory = createMemoryStorage()
    const store = createStore(memory.storage)
    const service = createService(store, () => false)
    const before = JSON.stringify(store.read())

    const result = service.startAccountability({ actor: agent })

    expect(result).toMatchObject({ ok: false, error: { code: 'not_authorised' } })
    expect(JSON.stringify(store.read())).toBe(before)
  })
})
