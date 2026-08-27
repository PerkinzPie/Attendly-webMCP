export type OperationsActor = {
  readonly id: string
  readonly displayName: string
  readonly channel: 'human-ui' | 'webmcp'
  readonly isSynthetic: true
}

export type EventRecord = {
  readonly id: string
  readonly name: string
  readonly capacity: number
  readonly isSynthetic: true
}

export type RegistrationGroup = {
  readonly id: string
  readonly eventId: string
  readonly reference: string
  readonly attendeeIds: readonly string[]
  readonly isSynthetic: true
}

export type Attendee = {
  readonly id: string
  readonly eventId: string
  readonly registrationGroupId: string
  readonly name: string
  readonly assistanceRequirement?: string
  readonly isSynthetic: true
}

export type CheckIn = {
  readonly id: string
  readonly eventId: string
  readonly attendeeId: string
  readonly checkedInAt: string
  readonly method: 'ticket-code' | 'manual'
  readonly actor: OperationsActor
  readonly isSynthetic: true
}

export type CapacityRule = {
  readonly warningThreshold: number
}

export type ActivityEntry = {
  readonly id: string
  readonly eventId: string
  readonly action: 'accountability-started' | 'accountability-status-recorded'
  readonly targetId: string
  readonly actor: OperationsActor
  readonly occurredAt: string
  readonly note?: string
  readonly isSynthetic: true
}

export type AccountabilityStatus = 'unconfirmed' | 'accounted-for' | 'exempt-not-present'

export type AccountabilityRecord = {
  readonly attendeeId: string
  readonly status: AccountabilityStatus
  readonly updatedAt: string
  readonly updatedBy: OperationsActor
  readonly note?: string
}

export type AccountabilitySession = {
  readonly id: string
  readonly eventId: string
  readonly status: 'active'
  readonly startedAt: string
  readonly startedBy: OperationsActor
  readonly records: readonly AccountabilityRecord[]
  readonly isSynthetic: true
}

export type EventOperationsState = {
  readonly event: EventRecord
  readonly registrationGroups: readonly RegistrationGroup[]
  readonly attendees: readonly Attendee[]
  readonly checkIns: readonly CheckIn[]
  readonly capacityRule: CapacityRule
  readonly activityEntries: readonly ActivityEntry[]
  readonly accountabilitySession: AccountabilitySession | null
}

export type EventSnapshot = {
  readonly eventId: string
  readonly registeredAttendees: number
  readonly occupancy: number
  readonly notArrived: number
  readonly capacity: number
  readonly capacityRemaining: number
  readonly overCapacityBy: number
  readonly capacityStatus: 'available' | 'near-capacity' | 'over-capacity'
}

export type AccountabilitySnapshot = {
  readonly sessionId: string
  readonly eventId: string
  readonly total: number
  readonly accountedFor: number
  readonly unconfirmed: number
  readonly exemptNotPresent: number
}

export type OperationsTransition = {
  readonly state: EventOperationsState
  readonly eventSnapshot: EventSnapshot
  readonly accountabilitySnapshot: AccountabilitySnapshot
  readonly activityEntry: ActivityEntry
}

type EventOperationsStateInput = Omit<EventOperationsState, 'activityEntries' | 'accountabilitySession'> & {
  readonly activityEntries?: readonly ActivityEntry[]
  readonly accountabilitySession?: AccountabilitySession | null
}

type StartAccountabilityCommand = {
  readonly sessionId: string
  readonly activityId: string
  readonly startedAt: string
  readonly actor: OperationsActor
}

type RecordAccountabilityCommand = {
  readonly attendeeId: string
  readonly status: AccountabilityStatus
  readonly activityId: string
  readonly recordedAt: string
  readonly actor: OperationsActor
  readonly note?: string
}

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function assertUniqueIds(label: string, records: readonly { id: string }[]) {
  invariant(new Set(records.map((record) => record.id)).size === records.length, `${label} identifiers must be unique`)
}

function cloneActor(actor: OperationsActor): OperationsActor {
  return { ...actor }
}

function validateState(state: EventOperationsState) {
  invariant(state.event.capacity > 0, 'Event capacity must be greater than zero')
  invariant(state.capacityRule.warningThreshold >= 0, 'Capacity warning threshold cannot be negative')

  assertUniqueIds('Registration group', state.registrationGroups)
  assertUniqueIds('Attendee', state.attendees)
  assertUniqueIds('Check-in', state.checkIns)
  assertUniqueIds('Activity entry', state.activityEntries)

  const groupsById = new Map(state.registrationGroups.map((group) => [group.id, group]))
  const attendeesById = new Map(state.attendees.map((attendee) => [attendee.id, attendee]))

  for (const group of state.registrationGroups) {
    invariant(group.eventId === state.event.id, `Registration group ${group.id} belongs to another event`)
    invariant(new Set(group.attendeeIds).size === group.attendeeIds.length, `Registration group ${group.id} contains a duplicate attendee`)

    for (const attendeeId of group.attendeeIds) {
      const attendee = attendeesById.get(attendeeId)
      invariant(attendee, `Registration group ${group.id} contains an unknown attendee`)
      invariant(attendee.registrationGroupId === group.id, `Attendee ${attendee.id} belongs to another registration group`)
    }
  }

  for (const attendee of state.attendees) {
    const group = groupsById.get(attendee.registrationGroupId)
    invariant(attendee.eventId === state.event.id, `Attendee ${attendee.id} belongs to another event`)
    invariant(group?.attendeeIds.includes(attendee.id), `Attendee ${attendee.id} is not linked from its registration group`)
  }

  const checkedInAttendeeIds = new Set<string>()
  for (const checkIn of state.checkIns) {
    invariant(checkIn.eventId === state.event.id, `Check-in ${checkIn.id} belongs to another event`)
    invariant(attendeesById.has(checkIn.attendeeId), `Check-in ${checkIn.id} references an unknown attendee`)
    invariant(!checkedInAttendeeIds.has(checkIn.attendeeId), `Attendee ${checkIn.attendeeId} is checked in more than once`)
    checkedInAttendeeIds.add(checkIn.attendeeId)
  }

  for (const entry of state.activityEntries) {
    invariant(entry.eventId === state.event.id, `Activity entry ${entry.id} belongs to another event`)
  }

  const session = state.accountabilitySession
  if (!session) return

  invariant(session.eventId === state.event.id, 'Accountability session belongs to another event')
  invariant(new Set(session.records.map((record) => record.attendeeId)).size === session.records.length, 'Accountability attendees must be unique')
  for (const record of session.records) {
    invariant(checkedInAttendeeIds.has(record.attendeeId), `Accountability attendee ${record.attendeeId} was not checked in`)
  }
}

export function createEventOperationsState(input: EventOperationsStateInput): EventOperationsState {
  const state: EventOperationsState = {
    event: { ...input.event },
    registrationGroups: input.registrationGroups.map((group) => ({
      ...group,
      attendeeIds: [...group.attendeeIds],
    })),
    attendees: input.attendees.map((attendee) => ({ ...attendee })),
    checkIns: input.checkIns.map((checkIn) => ({
      ...checkIn,
      actor: cloneActor(checkIn.actor),
    })),
    capacityRule: { ...input.capacityRule },
    activityEntries: (input.activityEntries ?? []).map((entry) => ({
      ...entry,
      actor: cloneActor(entry.actor),
    })),
    accountabilitySession: input.accountabilitySession ? {
      ...input.accountabilitySession,
      startedBy: cloneActor(input.accountabilitySession.startedBy),
      records: input.accountabilitySession.records.map((record) => ({
        ...record,
        updatedBy: cloneActor(record.updatedBy),
      })),
    } : null,
  }

  validateState(state)
  return state
}

export function getEventSnapshot(state: EventOperationsState): EventSnapshot {
  const registeredAttendees = state.attendees.length
  const occupancy = new Set(state.checkIns.map((checkIn) => checkIn.attendeeId)).size
  const rawCapacityRemaining = state.event.capacity - registeredAttendees
  const overCapacityBy = Math.max(0, -rawCapacityRemaining)
  const capacityRemaining = Math.max(0, rawCapacityRemaining)
  const capacityStatus = overCapacityBy > 0
    ? 'over-capacity'
    : capacityRemaining <= state.capacityRule.warningThreshold
      ? 'near-capacity'
      : 'available'

  return {
    eventId: state.event.id,
    registeredAttendees,
    occupancy,
    notArrived: registeredAttendees - occupancy,
    capacity: state.event.capacity,
    capacityRemaining,
    overCapacityBy,
    capacityStatus,
  }
}

export function getAccountabilitySnapshot(state: EventOperationsState): AccountabilitySnapshot | null {
  const session = state.accountabilitySession
  if (!session) return null

  return {
    sessionId: session.id,
    eventId: session.eventId,
    total: session.records.length,
    accountedFor: session.records.filter((record) => record.status === 'accounted-for').length,
    unconfirmed: session.records.filter((record) => record.status === 'unconfirmed').length,
    exemptNotPresent: session.records.filter((record) => record.status === 'exempt-not-present').length,
  }
}

export function startAccountabilitySession(
  state: EventOperationsState,
  command: StartAccountabilityCommand,
): OperationsTransition {
  invariant(!state.accountabilitySession, 'An accountability session is already active')

  const checkedInAttendeeIds = new Set(state.checkIns.map((checkIn) => checkIn.attendeeId))
  const session: AccountabilitySession = {
    id: command.sessionId,
    eventId: state.event.id,
    status: 'active',
    startedAt: command.startedAt,
    startedBy: cloneActor(command.actor),
    records: state.attendees
      .filter((attendee) => checkedInAttendeeIds.has(attendee.id))
      .map((attendee) => ({
        attendeeId: attendee.id,
        status: 'unconfirmed',
        updatedAt: command.startedAt,
        updatedBy: cloneActor(command.actor),
      })),
    isSynthetic: true,
  }
  const activityEntry: ActivityEntry = {
    id: command.activityId,
    eventId: state.event.id,
    action: 'accountability-started',
    targetId: session.id,
    actor: cloneActor(command.actor),
    occurredAt: command.startedAt,
    isSynthetic: true,
  }
  const nextState = createEventOperationsState({
    ...state,
    activityEntries: [...state.activityEntries, activityEntry],
    accountabilitySession: session,
  })
  const accountabilitySnapshot = getAccountabilitySnapshot(nextState)
  invariant(accountabilitySnapshot, 'Accountability totals were not created')

  return {
    state: nextState,
    eventSnapshot: getEventSnapshot(nextState),
    accountabilitySnapshot,
    activityEntry,
  }
}

export function recordAccountabilityStatus(
  state: EventOperationsState,
  command: RecordAccountabilityCommand,
): OperationsTransition {
  const session = state.accountabilitySession
  invariant(session, 'No accountability session is active')
  invariant(session.records.some((record) => record.attendeeId === command.attendeeId), 'Attendee is not part of the active accountability session')

  const records = session.records.map((record): AccountabilityRecord => record.attendeeId === command.attendeeId ? {
    attendeeId: record.attendeeId,
    status: command.status,
    updatedAt: command.recordedAt,
    updatedBy: cloneActor(command.actor),
    ...(command.note ? { note: command.note } : {}),
  } : record)
  const activityEntry: ActivityEntry = {
    id: command.activityId,
    eventId: state.event.id,
    action: 'accountability-status-recorded',
    targetId: command.attendeeId,
    actor: cloneActor(command.actor),
    occurredAt: command.recordedAt,
    ...(command.note ? { note: command.note } : {}),
    isSynthetic: true,
  }
  const nextState = createEventOperationsState({
    ...state,
    activityEntries: [...state.activityEntries, activityEntry],
    accountabilitySession: { ...session, records },
  })
  const accountabilitySnapshot = getAccountabilitySnapshot(nextState)
  invariant(accountabilitySnapshot, 'Accountability totals were not recalculated')

  return {
    state: nextState,
    eventSnapshot: getEventSnapshot(nextState),
    accountabilitySnapshot,
    activityEntry,
  }
}
