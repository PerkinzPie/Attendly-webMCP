import { describe, expect, it } from 'vitest'
import { createDemoEventOperationsState } from '../demo/seed'
import {
  createEventOperationsState,
  getAccountabilitySnapshot,
  getEventSnapshot,
  recordAccountabilityStatus,
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
