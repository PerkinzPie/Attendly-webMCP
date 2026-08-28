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
  readonly action: 'attendee-checked-in' | 'accountability-started' | 'accountability-status-recorded' | 'event-created'
  readonly targetId: string
  readonly actor: OperationsActor
  readonly occurredAt: string
  readonly note?: string
  readonly isSynthetic: true
}

export type CreatedEvent = {
  readonly id: string
  readonly sourceDraftId: string
  readonly name: string
  readonly startsAt: string
  readonly venue: string
  readonly capacity: number
  readonly createdAt: string
  readonly createdBy: OperationsActor
  readonly isSynthetic: true
}

export type EventDraftIssue = {
  readonly field: 'name' | 'startsAt' | 'venue' | 'capacity'
  readonly message: string
}

export type EventDraft = {
  readonly id: string
  readonly name: string
  readonly startsAt: string
  readonly venue: string
  readonly capacity: number
  readonly preparedAt: string
  readonly errors: readonly EventDraftIssue[]
  readonly warnings: readonly EventDraftIssue[]
}

export type EventDraftInput = {
  readonly name: string
  readonly startsAt: string
  readonly venue: string
  readonly capacity: number
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
  readonly createdEvents: readonly CreatedEvent[]
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

export type AttendeeSearchResult = {
  readonly attendeeId: string
  readonly name: string
  readonly registrationGroup: {
    readonly id: string
    readonly reference: string
  }
  readonly checkIn: {
    readonly status: 'checked-in' | 'not-arrived'
    readonly checkedInAt: string | null
  }
  readonly groupMembers: readonly {
    readonly attendeeId: string
    readonly name: string
    readonly checkInStatus: 'checked-in' | 'not-arrived'
  }[]
}

export type AttendeeCheckInReview = {
  readonly attendeeId: string
  readonly attendeeName: string
  readonly registrationReference: string
  readonly currentOccupancy: number
  readonly projectedOccupancy: number
  readonly capacity: number
  readonly capacityWarning: string | null
  readonly reason: string
}

export type OperationsTransition = {
  readonly state: EventOperationsState
  readonly eventSnapshot: EventSnapshot
  readonly accountabilitySnapshot: AccountabilitySnapshot
  readonly activityEntry: ActivityEntry
}

export type EventCreationTransition = {
  readonly state: EventOperationsState
  readonly event: CreatedEvent
  readonly activityEntry: ActivityEntry
}

export type CheckInTransition = {
  readonly state: EventOperationsState
  readonly eventSnapshot: EventSnapshot
  readonly activityEntry: ActivityEntry
}

type EventOperationsStateInput = Omit<EventOperationsState, 'activityEntries' | 'accountabilitySession' | 'createdEvents'> & {
  readonly activityEntries?: readonly ActivityEntry[]
  readonly accountabilitySession?: AccountabilitySession | null
  readonly createdEvents?: readonly CreatedEvent[]
}

export type CheckInAttendeeCommand = {
  readonly checkInId: string
  readonly activityId: string
  readonly attendeeId: string
  readonly checkedInAt: string
  readonly actor: OperationsActor
  readonly reason?: string
}

export type PrepareAttendeeCheckInCommand = {
  readonly attendeeId: string
  readonly reason: string
}

export type StartAccountabilityCommand = {
  readonly sessionId: string
  readonly activityId: string
  readonly startedAt: string
  readonly actor: OperationsActor
}

export type RecordAccountabilityCommand = {
  readonly attendeeId: string
  readonly status: AccountabilityStatus
  readonly activityId: string
  readonly recordedAt: string
  readonly actor: OperationsActor
  readonly note?: string
}

export type PrepareEventDraftCommand = {
  readonly draftId: string
  readonly preparedAt: string
}

export type ConfirmEventDraftCommand = {
  readonly eventId: string
  readonly activityId: string
  readonly createdAt: string
  readonly actor: OperationsActor
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
  assertUniqueIds('Created event', state.createdEvents)

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

  const eventIds = new Set([state.event.id, ...state.createdEvents.map((event) => event.id)])
  const sourceDraftIds = new Set<string>()
  for (const event of state.createdEvents) {
    invariant(event.name.length > 0, `Created event ${event.id} must have a name`)
    invariant(event.venue.length > 0, `Created event ${event.id} must have a venue`)
    invariant(!Number.isNaN(Date.parse(event.startsAt)), `Created event ${event.id} must have a valid start time`)
    invariant(event.capacity > 0, `Created event ${event.id} must have a positive capacity`)
    invariant(!sourceDraftIds.has(event.sourceDraftId), `Draft ${event.sourceDraftId} created more than one event`)
    sourceDraftIds.add(event.sourceDraftId)
  }

  for (const entry of state.activityEntries) {
    invariant(eventIds.has(entry.eventId), `Activity entry ${entry.id} belongs to another event`)
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
    createdEvents: (input.createdEvents ?? []).map((event) => ({
      ...event,
      createdBy: cloneActor(event.createdBy),
    })),
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
  const rawCapacityRemaining = state.event.capacity - occupancy
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

export function getEventLastUpdatedAt(state: EventOperationsState): string | null {
  const timestamps = [
    ...state.checkIns.map((checkIn) => checkIn.checkedInAt),
    ...state.activityEntries
      .filter((entry) => entry.eventId === state.event.id)
      .map((entry) => entry.occurredAt),
    ...(state.accountabilitySession ? [
      state.accountabilitySession.startedAt,
      ...state.accountabilitySession.records.map((record) => record.updatedAt),
    ] : []),
  ]

  return timestamps.reduce<string | null>((latest, timestamp) => {
    if (!latest || Date.parse(timestamp) > Date.parse(latest)) return timestamp
    return latest
  }, null)
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

function normaliseText(value: string) {
  return value.trim().replace(/\s+/g, ' ')
}

export function prepareEventDraft(
  input: EventDraftInput,
  command: PrepareEventDraftCommand,
): EventDraft {
  const name = normaliseText(input.name)
  const venue = normaliseText(input.venue)
  const parsedStartsAt = new Date(input.startsAt)
  const startsAt = Number.isNaN(parsedStartsAt.getTime()) ? '' : parsedStartsAt.toISOString()
  const errors: EventDraftIssue[] = []
  const warnings: EventDraftIssue[] = []

  if (!name) errors.push({ field: 'name', message: 'Enter an event name.' })
  if (!startsAt) errors.push({ field: 'startsAt', message: 'Enter a valid date and time.' })
  if (!venue) errors.push({ field: 'venue', message: 'Enter a venue.' })
  if (!Number.isInteger(input.capacity) || input.capacity < 1) {
    errors.push({ field: 'capacity', message: 'Capacity must be a whole number of at least 1.' })
  } else if (input.capacity < 10) {
    warnings.push({ field: 'capacity', message: 'Capacity is low; check it before creating the event.' })
  }

  return {
    id: command.draftId,
    name,
    startsAt,
    venue,
    capacity: input.capacity,
    preparedAt: command.preparedAt,
    errors,
    warnings,
  }
}

export function confirmEventDraft(
  state: EventOperationsState,
  draft: EventDraft,
  command: ConfirmEventDraftCommand,
): EventCreationTransition {
  invariant(draft.errors.length === 0, 'Event draft contains validation errors')
  invariant(
    !state.createdEvents.some((event) => event.sourceDraftId === draft.id),
    'Event draft has already been confirmed',
  )

  const event: CreatedEvent = {
    id: command.eventId,
    sourceDraftId: draft.id,
    name: draft.name,
    startsAt: draft.startsAt,
    venue: draft.venue,
    capacity: draft.capacity,
    createdAt: command.createdAt,
    createdBy: cloneActor(command.actor),
    isSynthetic: true,
  }
  const activityEntry: ActivityEntry = {
    id: command.activityId,
    eventId: event.id,
    action: 'event-created',
    targetId: event.id,
    actor: cloneActor(command.actor),
    occurredAt: command.createdAt,
    isSynthetic: true,
  }
  const nextState = createEventOperationsState({
    ...state,
    createdEvents: [...state.createdEvents, event],
    activityEntries: [...state.activityEntries, activityEntry],
  })

  return { state: nextState, event, activityEntry }
}

export function listAttendees(state: EventOperationsState): readonly AttendeeSearchResult[] {
  const groupsById = new Map(state.registrationGroups.map((group) => [group.id, group]))
  const attendeesById = new Map(state.attendees.map((attendee) => [attendee.id, attendee]))
  const checkInsByAttendeeId = new Map(state.checkIns.map((checkIn) => [checkIn.attendeeId, checkIn]))

  return state.attendees.map((attendee) => {
    const group = groupsById.get(attendee.registrationGroupId)
    invariant(group, `Attendee ${attendee.id} has no registration group`)
    const checkIn = checkInsByAttendeeId.get(attendee.id)

    return {
      attendeeId: attendee.id,
      name: attendee.name,
      registrationGroup: {
        id: group.id,
        reference: group.reference,
      },
      checkIn: {
        status: checkIn ? 'checked-in' : 'not-arrived',
        checkedInAt: checkIn?.checkedInAt ?? null,
      },
      groupMembers: group.attendeeIds.map((attendeeId) => {
        const member = attendeesById.get(attendeeId)
        invariant(member, `Registration group ${group.id} contains an unknown attendee`)
        return {
          attendeeId: member.id,
          name: member.name,
          checkInStatus: checkInsByAttendeeId.has(member.id) ? 'checked-in' : 'not-arrived',
        }
      }),
    }
  })
}

export function searchAttendees(
  state: EventOperationsState,
  rawQuery: string,
): readonly AttendeeSearchResult[] {
  const query = rawQuery.trim().toLocaleLowerCase('en-GB')
  if (!query) return []

  const matchRank = (name: string) => {
    const normalisedName = name.toLocaleLowerCase('en-GB')
    if (normalisedName === query) return 0
    if (normalisedName.startsWith(query)) return 1
    if (normalisedName.split(/\s+/).some((part) => part.startsWith(query))) return 2
    if (normalisedName.includes(query)) return 3
    return null
  }

  return listAttendees(state)
    .map((attendee, index) => ({ attendee, index, rank: matchRank(attendee.name) }))
    .filter((match): match is typeof match & { rank: number } => match.rank !== null)
    .sort((left, right) => left.rank - right.rank || left.index - right.index)
    .map(({ attendee }) => attendee)
}

export function prepareAttendeeCheckIn(
  state: EventOperationsState,
  command: PrepareAttendeeCheckInCommand,
): AttendeeCheckInReview {
  const attendee = state.attendees.find((item) => item.id === command.attendeeId)
  invariant(attendee, 'Attendee does not exist')
  invariant(
    !state.checkIns.some((checkIn) => checkIn.attendeeId === command.attendeeId),
    'Attendee is already checked in',
  )
  const group = state.registrationGroups.find((item) => item.id === attendee.registrationGroupId)
  invariant(group, `Attendee ${attendee.id} has no registration group`)

  const currentOccupancy = getEventSnapshot(state).occupancy
  const projectedOccupancy = currentOccupancy + 1
  const capacityWarning = projectedOccupancy > state.event.capacity
    ? `This check-in will put the event ${projectedOccupancy - state.event.capacity} over capacity.`
    : projectedOccupancy === state.event.capacity
      ? 'This check-in will fill the event.'
      : null

  return {
    attendeeId: attendee.id,
    attendeeName: attendee.name,
    registrationReference: group.reference,
    currentOccupancy,
    projectedOccupancy,
    capacity: state.event.capacity,
    capacityWarning,
    reason: normaliseText(command.reason),
  }
}

export function checkInAttendee(
  state: EventOperationsState,
  command: CheckInAttendeeCommand,
): CheckInTransition {
  invariant(state.attendees.some((attendee) => attendee.id === command.attendeeId), 'Attendee does not exist')
  invariant(
    !state.checkIns.some((checkIn) => checkIn.attendeeId === command.attendeeId),
    'Attendee is already checked in',
  )

  const checkIn: CheckIn = {
    id: command.checkInId,
    eventId: state.event.id,
    attendeeId: command.attendeeId,
    checkedInAt: command.checkedInAt,
    method: 'manual',
    actor: cloneActor(command.actor),
    isSynthetic: true,
  }
  const activityEntry: ActivityEntry = {
    id: command.activityId,
    eventId: state.event.id,
    action: 'attendee-checked-in',
    targetId: command.attendeeId,
    actor: cloneActor(command.actor),
    occurredAt: command.checkedInAt,
    ...(command.reason ? { note: command.reason } : {}),
    isSynthetic: true,
  }
  const nextState = createEventOperationsState({
    ...state,
    checkIns: [...state.checkIns, checkIn],
    activityEntries: [...state.activityEntries, activityEntry],
  })

  return {
    state: nextState,
    eventSnapshot: getEventSnapshot(nextState),
    activityEntry,
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
