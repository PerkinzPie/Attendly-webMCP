import { describe, expect, it } from 'vitest'
import { createDemoEventOperationsState } from '../demo/seed'
import {
  createEventOperationsState,
  getAccountabilitySnapshot,
  getEventSnapshot,
  recordAccountabilityStatus,
  searchAttendees,
  startAccountabilitySession,
  type OperationsActor,
} from './eventOperations'

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

function startSession() {
  return startAccountabilitySession(createDemoEventOperationsState(), {
    sessionId: 'acc_riverside_001',
    activityId: 'act_accountability_started_001',
    startedAt: '2026-09-05T18:20:00+01:00',
    actor: organiser,
  })
}

describe('event operations domain', () => {
  it('calculates occupancy and near-capacity state from the underlying records', () => {
    const snapshot = getEventSnapshot(createDemoEventOperationsState())

    expect(snapshot).toEqual({
      eventId: 'evt_riverside_community_workshop',
      registeredAttendees: 16,
      occupancy: 13,
      notArrived: 3,
      capacity: 20,
      capacityRemaining: 4,
      overCapacityBy: 0,
      capacityStatus: 'near-capacity',
    })
  })

  it('clamps remaining capacity and reports an explicit over-capacity warning', () => {
    const state = createDemoEventOperationsState()
    const overCapacityState = createEventOperationsState({
      ...state,
      event: { ...state.event, capacity: 12 },
    })

    expect(getEventSnapshot(overCapacityState)).toMatchObject({
      capacityRemaining: 0,
      overCapacityBy: 4,
      capacityStatus: 'over-capacity',
    })
  })

  it('rejects contradictory check-in records for the same attendee', () => {
    const state = createDemoEventOperationsState()
    const firstCheckIn = state.checkIns[0]

    expect(() => createEventOperationsState({
      ...state,
      checkIns: [
        ...state.checkIns,
        { ...firstCheckIn, id: 'chk_duplicate_attendee' },
      ],
    })).toThrow('is checked in more than once')
  })

  it('finds an exact attendee with their check-in and registration group', () => {
    const results = searchAttendees(createDemoEventOperationsState(), ' Sarah Jenkins ')

    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({
      attendeeId: 'att_sarah_jenkins',
      name: 'Sarah Jenkins',
      registrationGroup: { id: 'reg_jenkins_family', reference: 'RIV-001' },
      checkIn: { status: 'not-arrived', checkedInAt: null },
    })
    expect(results[0].groupMembers).toEqual([
      { attendeeId: 'att_sarah_jenkins', name: 'Sarah Jenkins', checkInStatus: 'not-arrived' },
      { attendeeId: 'att_leo_jenkins', name: 'Leo Jenkins', checkInStatus: 'not-arrived' },
    ])
  })

  it('ranks partial attendee matches without changing event state', () => {
    const state = createDemoEventOperationsState()
    const before = JSON.stringify(state)

    const surnameResults = searchAttendees(state, 'jenkins')
    const prefixResults = searchAttendees(state, 'sa')

    expect(surnameResults.map((result) => result.name)).toEqual(['Sarah Jenkins', 'Leo Jenkins'])
    expect(prefixResults[0].name).toBe('Sarah Jenkins')
    expect(prefixResults.map((result) => result.name)).toEqual(['Sarah Jenkins', 'Isaac Turner'])
    expect(JSON.stringify(state)).toBe(before)
  })

  it('starts accountability with only checked-in attendees marked unconfirmed', () => {
    const initialState = createDemoEventOperationsState()
    const transition = startAccountabilitySession(initialState, {
      sessionId: 'acc_riverside_001',
      activityId: 'act_accountability_started_001',
      startedAt: '2026-09-05T18:20:00+01:00',
      actor: organiser,
    })
    const session = transition.state.accountabilitySession

    expect(initialState.accountabilitySession).toBeNull()
    expect(session).not.toBeNull()
    expect(session?.records).toHaveLength(13)
    expect(session?.records.every((record) => record.status === 'unconfirmed')).toBe(true)
    expect(session?.records.some((record) => record.attendeeId === 'att_sarah_jenkins')).toBe(false)
    expect(session?.startedAt).toBe('2026-09-05T18:20:00+01:00')
    expect(session?.startedBy).toEqual(organiser)
    expect(transition.accountabilitySnapshot).toEqual({
      sessionId: 'acc_riverside_001',
      eventId: 'evt_riverside_community_workshop',
      total: 13,
      accountedFor: 0,
      unconfirmed: 13,
      exemptNotPresent: 0,
    })
    expect(transition.activityEntry).toMatchObject({
      action: 'accountability-started',
      actor: organiser,
      occurredAt: '2026-09-05T18:20:00+01:00',
    })
  })

  it('records an accountability result and recalculates totals in one immutable transition', () => {
    const started = startSession()
    const before = JSON.stringify(started.state)
    const transition = recordAccountabilityStatus(started.state, {
      attendeeId: 'att_amina_patel',
      status: 'accounted-for',
      activityId: 'act_amina_accounted_001',
      recordedAt: '2026-09-05T18:24:00+01:00',
      actor: agent,
      note: 'Confirmed at the assembly point.',
    })
    const record = transition.state.accountabilitySession?.records
      .find((item) => item.attendeeId === 'att_amina_patel')

    expect(JSON.stringify(started.state)).toBe(before)
    expect(record).toEqual({
      attendeeId: 'att_amina_patel',
      status: 'accounted-for',
      updatedAt: '2026-09-05T18:24:00+01:00',
      updatedBy: agent,
      note: 'Confirmed at the assembly point.',
    })
    expect(transition.accountabilitySnapshot).toMatchObject({
      accountedFor: 1,
      unconfirmed: 12,
      total: 13,
    })
    expect(transition.activityEntry).toMatchObject({
      action: 'accountability-status-recorded',
      targetId: 'att_amina_patel',
      actor: agent,
    })
    expect(transition.state.activityEntries).toHaveLength(2)
  })

  it('rejects people outside the active session without changing state', () => {
    const started = startSession()
    const before = JSON.stringify(started.state)

    expect(() => recordAccountabilityStatus(started.state, {
      attendeeId: 'att_sarah_jenkins',
      status: 'accounted-for',
      activityId: 'act_invalid_sarah_001',
      recordedAt: '2026-09-05T18:25:00+01:00',
      actor: organiser,
    })).toThrow('Attendee is not part of the active accountability session')
    expect(JSON.stringify(started.state)).toBe(before)
  })

  it('exposes only non-certifying accountability terminology', () => {
    const started = startSession()
    const snapshot = getAccountabilitySnapshot(started.state)
    const publicAccountabilityState = JSON.stringify({
      snapshot,
      records: started.state.accountabilitySession?.records,
    }).toLocaleLowerCase('en-GB')

    expect(publicAccountabilityState).toContain('unconfirmed')
    expect(publicAccountabilityState).not.toMatch(/\b(safe|missing|inside)\b/)
  })
})
