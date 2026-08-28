import { describe, expect, it } from 'vitest'
import { createDemoEventOperationsState, demoOrganisations } from '../demo/seed'
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
    authorisedOrganisationIds: demoOrganisations.map((organisation) => organisation.id),
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
      lastUpdatedAt: '2026-09-05T18:14:00+01:00',
      event: {
        id: 'evt_riverside_community_workshop',
        organisationId: 'org_lantern_rooms',
        name: 'Riverside Community Workshop',
        startsAt: '2026-09-05T18:30:00+01:00',
        capacity: 20,
      },
      registrationCount: 16,
      checkedInCount: 13,
      notArrivedCount: 3,
      capacity: 20,
      capacityRemaining: 7,
      overCapacityBy: 0,
      capacityStatus: 'available',
      anomalies: [
        {
          id: 'anomaly:evt_riverside_community_workshop:near-capacity',
          eventId: 'evt_riverside_community_workshop',
          kind: 'near-capacity',
          severity: 'warning',
          currentOccupancy: 13,
          registeredAttendees: 16,
          capacity: 20,
          remainingPlaces: 4,
          overCapacityBy: 0,
          warningThreshold: 4,
        },
        {
          id: 'anomaly:evt_riverside_community_workshop:duplicate-registration:att_sarah_jenkins:att_priya_shah',
          eventId: 'evt_riverside_community_workshop',
          kind: 'duplicate-registration-candidate',
          severity: 'warning',
          reason: 'The same email address appears on separate registrations.',
          matchingEmail: 'sarah.jenkins@example.test',
          candidates: [
            {
              attendeeId: 'att_sarah_jenkins',
              attendeeName: 'Sarah Jenkins',
              registrationGroupId: 'reg_jenkins_family',
              registrationReference: 'RIV-001',
            },
            {
              attendeeId: 'att_priya_shah',
              attendeeName: 'Priya Shah',
              registrationGroupId: 'reg_priya_shah',
              registrationReference: 'RIV-014',
            },
          ],
        },
      ],
      activityTimeline: [],
      activeAccountability: null,
      createdEvents: [],
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
    expect(service.getSnapshot()).toMatchObject({ ok: true, data: { activityTimeline: [] } })
  })

  it('lists attendees that reconcile with the current snapshot', () => {
    const memory = createMemoryStorage()
    const service = createService(createStore(memory.storage))
    const attendees = service.listAttendees()
    const snapshot = service.getSnapshot()

    expect(attendees.ok).toBe(true)
    expect(snapshot.ok).toBe(true)
    if (!attendees.ok || !snapshot.ok) throw new Error('Expected snapshot and attendees')

    expect(attendees.data).toHaveLength(snapshot.data.registrationCount)
    expect(attendees.data.filter((attendee) => attendee.checkIn.status === 'checked-in'))
      .toHaveLength(snapshot.data.checkedInCount)
    expect(attendees.data.filter((attendee) => attendee.checkIn.status === 'not-arrived'))
      .toHaveLength(snapshot.data.notArrivedCount)
    expect(snapshot.data.checkedInCount + snapshot.data.capacityRemaining).toBe(snapshot.data.capacity)
  })

  it('requires a specific attendee when preparing an ambiguous check-in', () => {
    const memory = createMemoryStorage()
    const store = createStore(memory.storage)
    const service = createService(store)
    const before = JSON.stringify(store.read())

    const ambiguous = service.prepareAttendeeCheckIn({
      query: 'Jenkins',
      reason: 'Unrecognised ticket code',
    })

    expect(ambiguous).toEqual({
      ok: false,
      error: {
        code: 'attendee_selection_required',
        message: 'Select a specific attendee before checking in.',
        remediation: 'Choose one attendee from the search results.',
      },
    })
    expect(JSON.stringify(store.read())).toBe(before)
  })

  it('prepares a selected attendee check-in without persisting it', () => {
    const memory = createMemoryStorage()
    const store = createStore(memory.storage)
    const service = createService(store)
    const before = JSON.stringify(store.read())

    const result = service.prepareAttendeeCheckIn({
      query: 'Jenkins',
      attendeeId: 'att_sarah_jenkins',
      reason: 'Unrecognised ticket code',
    })

    expect(result).toEqual({
      ok: true,
      data: {
        attendeeId: 'att_sarah_jenkins',
        attendeeName: 'Sarah Jenkins',
        registrationReference: 'RIV-001',
        currentOccupancy: 13,
        projectedOccupancy: 14,
        capacity: 20,
        capacityWarning: null,
        reason: 'Unrecognised ticket code',
      },
    })
    expect(JSON.stringify(store.read())).toBe(before)
  })

  it('prepares, validates and confirms an event through one persisted transition', () => {
    const memory = createMemoryStorage()
    const store = createStore(memory.storage)
    const service = createService(store)
    const before = JSON.stringify(store.read())
    const notifications: number[] = []
    service.subscribe((snapshot) => notifications.push(snapshot.revision))

    const draftResult = service.prepareEventDraft({
      organisationId: 'org_lantern_rooms',
      name: '  Family   Games Night ',
      startsAt: '2026-10-10T18:30:00.000Z',
      venue: '  Main Hall ',
      capacity: 8,
    })

    expect(draftResult.ok).toBe(true)
    if (!draftResult.ok) throw new Error('Expected event draft to succeed')
    expect(draftResult.data).toMatchObject({
      organisationId: 'org_lantern_rooms',
      name: 'Family Games Night',
      venue: 'Main Hall',
      errors: [],
      warnings: [{ field: 'capacity' }],
    })
    expect(JSON.stringify(store.read())).toBe(before)
    expect(notifications).toEqual([])

    const confirmed = service.confirmEventDraft({ draft: draftResult.data, actor: organiser })

    expect(confirmed.ok).toBe(true)
    if (!confirmed.ok) throw new Error('Expected event creation to succeed')
    expect(confirmed.data.snapshot).toMatchObject({ revision: 1 })
    expect(confirmed.data.snapshot.createdEvents).toHaveLength(1)
    expect(confirmed.data.event).toMatchObject({
      organisationId: 'org_lantern_rooms',
      name: 'Family Games Night',
      venue: 'Main Hall',
      capacity: 8,
      createdBy: organiser,
    })
    expect(confirmed.data.activityEntry).toMatchObject({
      action: 'event-created',
      targetId: confirmed.data.event.id,
      actor: organiser,
    })
    expect(store.read().state.createdEvents).toEqual([confirmed.data.event])
    expect(notifications).toEqual([1])

    expect(service.confirmEventDraft({ draft: draftResult.data, actor: organiser }))
      .toMatchObject({ ok: false, error: { code: 'event_draft_already_confirmed' } })
    expect(store.read().state.createdEvents).toHaveLength(1)
  })

  it('attributes agent-confirmed event creation to the site tool', () => {
    const memory = createMemoryStorage()
    const service = createService(createStore(memory.storage))
    const draft = service.prepareEventDraft({
      organisationId: 'org_lantern_rooms',
      name: 'Family Games Night',
      startsAt: '2026-10-10T18:30:00.000Z',
      venue: 'Main Hall',
      capacity: 40,
    })

    expect(draft.ok).toBe(true)
    if (!draft.ok) throw new Error('Expected event draft to succeed')
    const result = service.confirmEventDraft({ draft: draft.data, actor: agent })

    expect(result).toMatchObject({
      ok: true,
      data: {
        activityEntry: {
          action: 'event-created',
          actor: { channel: 'webmcp' },
          toolName: 'confirm_event_creation',
        },
      },
    })
  })

  it('keeps invalid and cancelled event drafts out of persisted state', () => {
    const memory = createMemoryStorage()
    const store = createStore(memory.storage)
    const service = createService(store)
    const invalidDraft = service.prepareEventDraft({
      organisationId: 'org_lantern_rooms',
      name: 'Community Supper',
      startsAt: '2026-10-10T18:30:00.000Z',
      venue: 'Riverside Hall',
      capacity: 0,
    })

    expect(invalidDraft.ok).toBe(true)
    if (!invalidDraft.ok) throw new Error('Expected event draft validation result')
    expect(invalidDraft.data.errors).toEqual([
      { field: 'capacity', message: 'Capacity must be a whole number of at least 1.' },
    ])
    expect(service.confirmEventDraft({ draft: invalidDraft.data, actor: organiser }))
      .toMatchObject({ ok: false, error: { code: 'invalid_event_draft' } })
    expect(store.read().state.createdEvents).toEqual([])
  })

  it('rejects a draft whose organisation context has been changed after review', () => {
    const memory = createMemoryStorage()
    const store = createStore(memory.storage)
    const service = createService(store)
    const draft = service.prepareEventDraft({
      organisationId: 'org_lantern_rooms',
      name: 'Community Supper',
      startsAt: '2026-10-10T18:30:00.000Z',
      venue: 'Riverside Hall',
      capacity: 40,
    })

    expect(draft.ok).toBe(true)
    if (!draft.ok) throw new Error('Expected event draft to succeed')
    expect(service.confirmEventDraft({
      draft: { ...draft.data, organisationId: 'org_unknown' },
      actor: organiser,
    })).toMatchObject({ ok: false, error: { code: 'invalid_event_draft' } })
    expect(store.read().state.createdEvents).toEqual([])
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
    expect(result.data.snapshot).toMatchObject({
      revision: 1,
      lastUpdatedAt: '2026-09-05T18:20:00+01:00',
      checkedInCount: 14,
      notArrivedCount: 2,
      capacityRemaining: 6,
    })
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
    expect(service.getSnapshot()).toMatchObject({ ok: true, data: { activityTimeline: [] } })
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
    expect(notifications).toBe(1)
    expect(service.getSnapshot()).toMatchObject({
      ok: true,
      data: {
        activityTimeline: [{
          action: 'attendee-checked-in',
          targetLabel: 'Sarah Jenkins',
          outcome: 'failed',
          resultSummary: 'Check-in was not saved.',
        }],
      },
    })
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

  it('adds event organisation context when loading state saved by the previous schema shape', () => {
    const memory = createMemoryStorage()
    const firstService = createService(createStore(memory.storage))
    expect(firstService.checkInAttendee({
      attendeeId: 'att_sarah_jenkins',
      actor: organiser,
    }).ok).toBe(true)

    const stored = JSON.parse(memory.storage.getItem('test:event-operations') ?? '') as {
      state: {
        event: Record<string, unknown>
        createdEvents: Array<Record<string, unknown>>
        attendees: Array<Record<string, unknown>>
        activityEntries: Array<Record<string, unknown>>
      }
    }
    delete stored.state.event.startsAt
    delete stored.state.event.organisationId
    stored.state.createdEvents = [{
      id: 'event_legacy',
      sourceDraftId: 'draft_legacy',
      name: 'Legacy Event',
      startsAt: '2026-10-10T18:30:00.000Z',
      venue: 'Main Hall',
      capacity: 40,
      createdAt: '2026-09-01T10:05:00.000Z',
      createdBy: organiser,
      isSynthetic: true,
    }]
    stored.state.attendees.forEach((attendee) => delete attendee.email)
    stored.state.activityEntries.forEach((entry) => {
      delete entry.targetLabel
      delete entry.outcome
      delete entry.resultSummary
    })
    memory.storage.setItem('test:event-operations', JSON.stringify(stored))

    const reloaded = createService(createStore(memory.storage)).getSnapshot()

    expect(reloaded).toMatchObject({
      ok: true,
      data: {
        revision: 1,
        checkedInCount: 14,
        event: {
          organisationId: 'org_lantern_rooms',
          startsAt: '2026-09-05T18:30:00+01:00',
        },
        activityTimeline: [{
          targetLabel: 'att_sarah_jenkins',
          outcome: 'succeeded',
          resultSummary: 'Completed successfully.',
        }],
        createdEvents: [{ id: 'event_legacy', organisationId: 'org_lantern_rooms' }],
      },
    })
    expect(createService(createStore(memory.storage)).searchAttendees('sarah.jenkins@example.test'))
      .toMatchObject({ ok: true, data: [{ name: 'Sarah Jenkins' }, { name: 'Priya Shah' }] })
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

    const { activityTimeline: agentTimeline, ...agentSnapshot } = agentResult.data.snapshot
    const { activityTimeline: humanTimeline, ...humanSnapshot } = humanResult.data.snapshot
    expect(agentSnapshot).toEqual(humanSnapshot)
    expect(humanTimeline[0]).toMatchObject({
      actor: { channel: 'human-ui' },
      outcome: 'succeeded',
      targetLabel: 'Sarah Jenkins',
      resultSummary: 'Checked in · 14 of 20.',
    })
    expect(agentTimeline[0]).toMatchObject({
      actor: { channel: 'webmcp' },
      toolName: 'check_in_attendee',
      outcome: 'succeeded',
      targetLabel: 'Sarah Jenkins',
      resultSummary: 'Checked in · 14 of 20.',
    })
    expect(agentStore.read().state.checkIns.map(({ actor: _actor, ...checkIn }) => checkIn))
      .toEqual(humanStore.read().state.checkIns.map(({ actor: _actor, ...checkIn }) => checkIn))
    expect(agentStore.read().state.activityEntries.map(({ actor: _actor, toolName: _toolName, ...entry }) => entry))
      .toEqual(humanStore.read().state.activityEntries.map(({ actor: _actor, toolName: _toolName, ...entry }) => entry))
  })

  it('atomically restores the deterministic seed and publishes the reset state', () => {
    const memory = createMemoryStorage()
    const store = createStore(memory.storage)
    const service = createService(store)
    const notifications: number[] = []
    service.subscribe((snapshot) => notifications.push(snapshot.revision))

    const draft = service.prepareEventDraft({
      organisationId: 'org_lantern_rooms',
      name: 'Community Supper',
      startsAt: '2026-10-10T18:30:00.000Z',
      venue: 'Riverside Hall',
      capacity: 40,
    })
    expect(draft.ok).toBe(true)
    if (!draft.ok) throw new Error('Expected event draft to succeed')
    expect(service.confirmEventDraft({ draft: draft.data, actor: organiser }).ok).toBe(true)

    expect(service.checkInAttendee({ attendeeId: 'att_sarah_jenkins', actor: organiser }).ok).toBe(true)
    expect(service.startAccountability({ actor: organiser }).ok).toBe(true)

    const result = service.resetDemo({ actor: organiser })

    expect(result).toMatchObject({
      ok: true,
      data: {
        revision: 4,
        checkedInCount: 13,
        notArrivedCount: 3,
        activeAccountability: null,
      },
    })
    const persisted = store.read()
    expect(persisted.state.checkIns).toHaveLength(13)
    expect(persisted.state.activityEntries).toEqual([])
    expect(persisted.state.createdEvents).toEqual([])
    expect(persisted.state.accountabilitySession).toBeNull()
    expect(notifications).toEqual([1, 2, 3, 4])
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
    expect(notifications).toBe(1)
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
