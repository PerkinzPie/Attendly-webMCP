import { describe, expect, it } from 'vitest'
import { createDemoEventOperationsState } from '../demo/seed'
import {
  calculateAttendanceAnomalies,
  checkInAttendee,
  confirmEventDraft,
  createEventOperationsState,
  getAccountabilitySnapshot,
  getEventLastUpdatedAt,
  getEventSnapshot,
  listActivityTimeline,
  listAttendees,
  prepareAttendeeCheckIn,
  recordAccountabilityStatus,
  prepareEventDraft,
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
  it('calculates reconcilable attendance and capacity totals from the underlying records', () => {
    const snapshot = getEventSnapshot(createDemoEventOperationsState())

    expect(snapshot).toEqual({
      eventId: 'evt_riverside_community_workshop',
      registeredAttendees: 16,
      occupancy: 13,
      notArrived: 3,
      capacity: 20,
      capacityRemaining: 7,
      overCapacityBy: 0,
      capacityStatus: 'available',
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
      overCapacityBy: 1,
      capacityStatus: 'over-capacity',
    })
  })

  it('calculates near-capacity and duplicate-registration evidence without changing records', () => {
    const state = createDemoEventOperationsState()
    const before = JSON.stringify(state)

    const anomalies = calculateAttendanceAnomalies(state)

    expect(anomalies).toHaveLength(2)
    expect(anomalies[0]).toEqual({
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
    })
    expect(anomalies[1]).toMatchObject({
      kind: 'duplicate-registration-candidate',
      reason: 'The same email address appears on separate registrations.',
      matchingEmail: 'sarah.jenkins@example.test',
      candidates: [
        { attendeeId: 'att_sarah_jenkins', registrationReference: 'RIV-001' },
        { attendeeId: 'att_priya_shah', registrationReference: 'RIV-014' },
      ],
    })
    expect(JSON.stringify(state)).toBe(before)
  })

  it('reports over-capacity only when registrations exceed capacity', () => {
    const state = createDemoEventOperationsState()
    const anomalies = calculateAttendanceAnomalies(createEventOperationsState({
      ...state,
      event: { ...state.event, capacity: 15 },
    }))

    expect(anomalies[0]).toMatchObject({
      kind: 'over-capacity',
      capacity: 15,
      registeredAttendees: 16,
      remainingPlaces: 0,
      overCapacityBy: 1,
    })
  })

  it('returns an explicit empty anomaly result when all conditions are resolved', () => {
    const state = createDemoEventOperationsState()
    const resolved = createEventOperationsState({
      ...state,
      event: { ...state.event, capacity: 30 },
      attendees: state.attendees.map((attendee) => ({
        ...attendee,
        email: `${attendee.id}@example.test`,
      })),
    })

    expect(calculateAttendanceAnomalies(resolved)).toEqual([])
  })

  it('reports the latest operational update time', () => {
    expect(getEventLastUpdatedAt(createDemoEventOperationsState()))
      .toBe('2026-09-05T18:14:00+01:00')
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

  it('lists every attendee with totals that reconcile to the event snapshot', () => {
    const state = createDemoEventOperationsState()
    const attendees = listAttendees(state)
    const snapshot = getEventSnapshot(state)

    expect(attendees).toHaveLength(snapshot.registeredAttendees)
    expect(attendees.filter((attendee) => attendee.checkIn.status === 'checked-in'))
      .toHaveLength(snapshot.occupancy)
    expect(attendees.filter((attendee) => attendee.checkIn.status === 'not-arrived'))
      .toHaveLength(snapshot.notArrived)
    expect(snapshot.occupancy + snapshot.capacityRemaining).toBe(snapshot.capacity)
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

  it('prepares a check-in review with projected occupancy before changing state', () => {
    const state = createDemoEventOperationsState()
    const before = JSON.stringify(state)

    const review = prepareAttendeeCheckIn(state, {
      attendeeId: 'att_sarah_jenkins',
      reason: '  Unrecognised   ticket code ',
    })

    expect(review).toEqual({
      attendeeId: 'att_sarah_jenkins',
      attendeeName: 'Sarah Jenkins',
      registrationReference: 'RIV-001',
      currentOccupancy: 13,
      projectedOccupancy: 14,
      capacity: 20,
      capacityWarning: null,
      reason: 'Unrecognised ticket code',
    })
    expect(JSON.stringify(state)).toBe(before)
  })

  it('warns when a reviewed check-in reaches or exceeds capacity', () => {
    const state = createDemoEventOperationsState()
    const fullReview = prepareAttendeeCheckIn(createEventOperationsState({
      ...state,
      event: { ...state.event, capacity: 14 },
    }), {
      attendeeId: 'att_sarah_jenkins',
      reason: 'Unrecognised ticket code',
    })
    const overReview = prepareAttendeeCheckIn(createEventOperationsState({
      ...state,
      event: { ...state.event, capacity: 13 },
    }), {
      attendeeId: 'att_sarah_jenkins',
      reason: 'Unrecognised ticket code',
    })

    expect(fullReview.capacityWarning).toBe('This check-in will fill the event.')
    expect(overReview.capacityWarning).toBe('This check-in will put the event 1 over capacity.')
  })

  it('normalises a reviewable event draft without changing persisted state', () => {
    const state = createDemoEventOperationsState()
    const before = JSON.stringify(state)

    const draft = prepareEventDraft({
      organisationId: 'org_lantern_rooms',
      name: '  Family   Games Night ',
      startsAt: '2026-10-10T18:30:00.000Z',
      venue: '  Main   Hall ',
      capacity: 8,
    }, {
      draftId: 'draft_family_games',
      preparedAt: '2026-09-01T10:00:00.000Z',
      authorisedOrganisationIds: ['org_lantern_rooms'],
    })

    expect(draft).toMatchObject({
      id: 'draft_family_games',
      organisationId: 'org_lantern_rooms',
      name: 'Family Games Night',
      startsAt: '2026-10-10T18:30:00.000Z',
      venue: 'Main Hall',
      capacity: 8,
      errors: [],
      warnings: [{ field: 'capacity', message: 'Capacity is low; check it before creating the event.' }],
    })
    expect(JSON.stringify(state)).toBe(before)
  })

  it('prevents an invalid event draft from being confirmed', () => {
    const state = createDemoEventOperationsState()
    const draft = prepareEventDraft({
      organisationId: 'org_lantern_rooms',
      name: 'Community Supper',
      startsAt: '2026-10-10T18:30:00.000Z',
      venue: 'Riverside Hall',
      capacity: 0,
    }, {
      draftId: 'draft_invalid_capacity',
      preparedAt: '2026-09-01T10:00:00.000Z',
      authorisedOrganisationIds: ['org_lantern_rooms'],
    })

    expect(draft.errors).toEqual([
      { field: 'capacity', message: 'Capacity must be a whole number of at least 1.' },
    ])
    expect(() => confirmEventDraft(state, draft, {
      eventId: 'evt_community_supper',
      activityId: 'act_community_supper_created',
      createdAt: '2026-09-01T10:05:00.000Z',
      actor: organiser,
    })).toThrow('Event draft contains validation errors')
  })

  it('requires an explicitly authorised organisation for an event draft', () => {
    const draft = prepareEventDraft({
      organisationId: 'org_unknown',
      name: 'Community Supper',
      startsAt: '2026-10-10T18:30:00.000Z',
      venue: 'Riverside Hall',
      capacity: 40,
    }, {
      draftId: 'draft_wrong_organisation',
      preparedAt: '2026-09-01T10:00:00.000Z',
      authorisedOrganisationIds: ['org_lantern_rooms'],
    })

    expect(draft.errors).toEqual([
      { field: 'organisationId', message: 'Select an organisation you can manage.' },
    ])
  })

  it('confirms one event and records its creation activity', () => {
    const state = createDemoEventOperationsState()
    const draft = prepareEventDraft({
      organisationId: 'org_lantern_rooms',
      name: 'Community Supper',
      startsAt: '2026-10-10T18:30:00.000Z',
      venue: 'Riverside Hall',
      capacity: 40,
    }, {
      draftId: 'draft_community_supper',
      preparedAt: '2026-09-01T10:00:00.000Z',
      authorisedOrganisationIds: ['org_lantern_rooms'],
    })
    const transition = confirmEventDraft(state, draft, {
      eventId: 'evt_community_supper',
      activityId: 'act_community_supper_created',
      createdAt: '2026-09-01T10:05:00.000Z',
      actor: organiser,
    })

    expect(state.createdEvents).toEqual([])
    expect(transition.state.createdEvents).toEqual([transition.event])
    expect(transition.event).toMatchObject({
      id: 'evt_community_supper',
      organisationId: 'org_lantern_rooms',
      sourceDraftId: 'draft_community_supper',
      name: 'Community Supper',
      createdBy: organiser,
    })
    expect(transition.activityEntry).toMatchObject({
      action: 'event-created',
      eventId: 'evt_community_supper',
      targetId: 'evt_community_supper',
      targetLabel: 'Community Supper',
      actor: organiser,
      outcome: 'succeeded',
      resultSummary: 'Created with capacity 40.',
    })
    expect(() => confirmEventDraft(transition.state, draft, {
      eventId: 'evt_duplicate',
      activityId: 'act_duplicate',
      createdAt: '2026-09-01T10:06:00.000Z',
      actor: organiser,
    })).toThrow('Event draft has already been confirmed')
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
      targetLabel: 'Evacuation accountability',
      actor: organiser,
      occurredAt: '2026-09-05T18:20:00+01:00',
      outcome: 'succeeded',
      resultSummary: 'Started for 13 checked-in attendees.',
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
      targetLabel: 'Amina Patel',
      actor: agent,
      outcome: 'succeeded',
      resultSummary: 'Accounted for · 1 of 13 accounted for.',
    })
    expect(transition.state.activityEntries).toHaveLength(2)
  })

  it('returns an immutable activity timeline in deterministic reverse chronological order', () => {
    const checkedIn = checkInAttendee(createDemoEventOperationsState(), {
      checkInId: 'check_in_sarah',
      activityId: 'activity_a',
      attendeeId: 'att_sarah_jenkins',
      checkedInAt: '2026-09-05T18:30:00+01:00',
      actor: organiser,
    })
    const additionalEntry = {
      ...checkedIn.activityEntry,
      id: 'activity_z',
      outcome: 'failed' as const,
      resultSummary: 'Check-in was not saved.',
    }
    const before = JSON.stringify(checkedIn.state.activityEntries)

    const timeline = listActivityTimeline(checkedIn.state, [additionalEntry])

    expect(timeline.map((entry) => entry.id)).toEqual(['activity_z', 'activity_a'])
    expect(timeline.map((entry) => entry.outcome)).toEqual(['failed', 'succeeded'])
    expect(JSON.stringify(checkedIn.state.activityEntries)).toBe(before)
    expect(timeline[0].actor).not.toBe(additionalEntry.actor)
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
