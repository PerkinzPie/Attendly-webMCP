export type OperationsActor = {
  readonly id: string
  readonly displayName: string
  readonly channel: 'human-ui' | 'webmcp'
  readonly isSynthetic: true
}

export type EventRecord = {
  readonly id: string
  readonly organisationId: string
  readonly name: string
  readonly startsAt: string
  readonly venue: string
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
  readonly email: string
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
  readonly action: 'attendee-checked-in' | 'accountability-started' | 'accountability-status-recorded' | 'accountability-closed' | 'event-created' | 'demo-reset'
  readonly targetId: string
  readonly targetLabel: string
  readonly actor: OperationsActor
  readonly occurredAt: string
  readonly outcome: 'succeeded' | 'failed'
  readonly resultSummary: string
  readonly toolName?: string
  readonly note?: string
  readonly isSynthetic: true
}

export type CreatedEvent = {
  readonly id: string
  readonly sourceDraftId: string
  readonly organisationId: string
  readonly name: string
  readonly startsAt: string
  readonly venue: string
  readonly capacity: number
  readonly createdAt: string
  readonly createdBy: OperationsActor
  readonly isSynthetic: true
}

export type EventDraftIssue = {
  readonly field: 'organisationId' | 'name' | 'startsAt' | 'venue' | 'capacity'
  readonly message: string
}

export type EventDraft = {
  readonly id: string
  readonly organisationId: string
  readonly name: string
  readonly startsAt: string
  readonly venue: string
  readonly capacity: number
  readonly preparedAt: string
  readonly errors: readonly EventDraftIssue[]
  readonly warnings: readonly EventDraftIssue[]
}

export type EventDraftInput = {
  readonly organisationId: string
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
  readonly status: 'active' | 'closed'
  readonly startedAt: string
  readonly startedBy: OperationsActor
  readonly closedAt?: string
  readonly closedBy?: OperationsActor
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
  readonly email: string
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

export type CapacityRiskAnomaly = {
  readonly id: string
  readonly eventId: string
  readonly kind: 'near-capacity' | 'over-capacity'
  readonly severity: 'warning' | 'critical'
  readonly currentOccupancy: number
  readonly registeredAttendees: number
  readonly capacity: number
  readonly remainingPlaces: number
  readonly overCapacityBy: number
  readonly warningThreshold: number
}

export type DuplicateRegistrationCandidateAnomaly = {
  readonly id: string
  readonly eventId: string
  readonly kind: 'duplicate-registration-candidate'
  readonly severity: 'warning'
  readonly reason: string
  readonly matchingEmail: string
  readonly candidates: readonly {
    readonly attendeeId: string
    readonly attendeeName: string
    readonly registrationGroupId: string
    readonly registrationReference: string
  }[]
}

export type AttendanceAnomaly = CapacityRiskAnomaly | DuplicateRegistrationCandidateAnomaly

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
  readonly toolName?: string
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
  readonly toolName?: string
}

export type RecordAccountabilityCommand = {
  readonly attendeeId: string
  readonly status: AccountabilityStatus
  readonly activityId: string
  readonly recordedAt: string
  readonly actor: OperationsActor
  readonly toolName?: string
  readonly note?: string
}

export type CloseAccountabilityCommand = {
  readonly activityId: string
  readonly closedAt: string
  readonly actor: OperationsActor
  readonly toolName?: string
}

export type PrepareEventDraftCommand = {
  readonly draftId: string
  readonly preparedAt: string
  readonly authorisedOrganisationIds: readonly string[]
}

export type ConfirmEventDraftCommand = {
  readonly eventId: string
  readonly activityId: string
  readonly createdAt: string
  readonly actor: OperationsActor
  readonly toolName?: string
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
  invariant(state.event.organisationId.length > 0, 'Event organisation must be identified')
  invariant(state.event.venue.length > 0, 'Event venue must be identified')
  invariant(state.event.capacity > 0, 'Event capacity must be greater than zero')
  invariant(!Number.isNaN(Date.parse(state.event.startsAt)), 'Event start time must be valid')
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
    invariant(attendee.email.length > 0, `Attendee ${attendee.id} must have an email address`)
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
    invariant(event.organisationId.length > 0, `Created event ${event.id} must belong to an organisation`)
    invariant(event.name.length > 0, `Created event ${event.id} must have a name`)
    invariant(event.venue.length > 0, `Created event ${event.id} must have a venue`)
    invariant(!Number.isNaN(Date.parse(event.startsAt)), `Created event ${event.id} must have a valid start time`)
    invariant(event.capacity > 0, `Created event ${event.id} must have a positive capacity`)
    invariant(!sourceDraftIds.has(event.sourceDraftId), `Draft ${event.sourceDraftId} created more than one event`)
    sourceDraftIds.add(event.sourceDraftId)
  }

  for (const entry of state.activityEntries) {
    invariant(eventIds.has(entry.eventId), `Activity entry ${entry.id} belongs to another event`)
    invariant(entry.targetLabel.length > 0, `Activity entry ${entry.id} must identify its target`)
    invariant(entry.resultSummary.length > 0, `Activity entry ${entry.id} must summarise its result`)
    invariant(!Number.isNaN(Date.parse(entry.occurredAt)), `Activity entry ${entry.id} must have a valid timestamp`)
  }

  const session = state.accountabilitySession
  if (!session) return

  invariant(session.eventId === state.event.id, 'Accountability session belongs to another event')
  invariant(!Number.isNaN(Date.parse(session.startedAt)), 'Accountability session start time must be valid')
  if (session.status === 'closed') {
    invariant(session.closedAt && !Number.isNaN(Date.parse(session.closedAt)), 'Accountability session close time must be valid')
    invariant(session.closedBy, 'A closed accountability session must identify who closed it')
  } else {
    invariant(!session.closedAt && !session.closedBy, 'An active accountability session cannot have closure details')
  }
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
      ...(input.accountabilitySession.closedBy
        ? { closedBy: cloneActor(input.accountabilitySession.closedBy) }
        : {}),
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

export function calculateAttendanceAnomalies(state: EventOperationsState): readonly AttendanceAnomaly[] {
  const anomalies: AttendanceAnomaly[] = []
  const currentOccupancy = new Set(state.checkIns.map((checkIn) => checkIn.attendeeId)).size
  const registeredAttendees = state.attendees.length
  const rawRemainingPlaces = state.event.capacity - registeredAttendees
  const overCapacityBy = Math.max(0, -rawRemainingPlaces)
  const remainingPlaces = Math.max(0, rawRemainingPlaces)

  if (overCapacityBy > 0) {
    anomalies.push({
      id: `anomaly:${state.event.id}:over-capacity`,
      eventId: state.event.id,
      kind: 'over-capacity',
      severity: 'critical',
      currentOccupancy,
      registeredAttendees,
      capacity: state.event.capacity,
      remainingPlaces,
      overCapacityBy,
      warningThreshold: state.capacityRule.warningThreshold,
    })
  } else if (remainingPlaces <= state.capacityRule.warningThreshold) {
    anomalies.push({
      id: `anomaly:${state.event.id}:near-capacity`,
      eventId: state.event.id,
      kind: 'near-capacity',
      severity: 'warning',
      currentOccupancy,
      registeredAttendees,
      capacity: state.event.capacity,
      remainingPlaces,
      overCapacityBy,
      warningThreshold: state.capacityRule.warningThreshold,
    })
  }

  const registrationGroupsById = new Map(state.registrationGroups.map((group) => [group.id, group]))
  const attendeesByEmail = new Map<string, Attendee[]>()
  for (const attendee of state.attendees) {
    const normalisedEmail = attendee.email.trim().toLocaleLowerCase('en-GB')
    const matches = attendeesByEmail.get(normalisedEmail) ?? []
    matches.push(attendee)
    attendeesByEmail.set(normalisedEmail, matches)
  }

  for (const [matchingEmail, attendees] of attendeesByEmail) {
    if (new Set(attendees.map((attendee) => attendee.registrationGroupId)).size < 2) continue
    const candidates = attendees.map((attendee) => {
      const group = registrationGroupsById.get(attendee.registrationGroupId)
      invariant(group, `Attendee ${attendee.id} has no registration group`)
      return {
        attendeeId: attendee.id,
        attendeeName: attendee.name,
        registrationGroupId: group.id,
        registrationReference: group.reference,
      }
    })
    anomalies.push({
      id: `anomaly:${state.event.id}:duplicate-registration:${candidates.map((candidate) => candidate.attendeeId).join(':')}`,
      eventId: state.event.id,
      kind: 'duplicate-registration-candidate',
      severity: 'warning',
      reason: 'The same email address appears on separate registrations.',
      matchingEmail,
      candidates,
    })
  }

  return anomalies
}

export function getEventLastUpdatedAt(state: EventOperationsState): string | null {
  const timestamps = [
    ...state.checkIns.map((checkIn) => checkIn.checkedInAt),
    ...state.activityEntries
      .filter((entry) => entry.eventId === state.event.id)
      .map((entry) => entry.occurredAt),
    ...(state.accountabilitySession ? [
      state.accountabilitySession.startedAt,
      ...(state.accountabilitySession.closedAt ? [state.accountabilitySession.closedAt] : []),
      ...state.accountabilitySession.records.map((record) => record.updatedAt),
    ] : []),
  ]

  return timestamps.reduce<string | null>((latest, timestamp) => {
    if (!latest || Date.parse(timestamp) > Date.parse(latest)) return timestamp
    return latest
  }, null)
}

export function listActivityTimeline(
  state: EventOperationsState,
  additionalEntries: readonly ActivityEntry[] = [],
): readonly ActivityEntry[] {
  return [...state.activityEntries, ...additionalEntries]
    .map((entry) => ({ ...entry, actor: cloneActor(entry.actor) }))
    .sort((left, right) => (
      Date.parse(right.occurredAt) - Date.parse(left.occurredAt)
      || right.id.localeCompare(left.id, 'en-GB')
    ))
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

const eventTimeZone = 'Europe/London'
const wallClockPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/

function timeZoneOffsetMinutes(at: Date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: eventTimeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at)
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((item) => item.type === type)?.value)
  const local = Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute'), part('second'))
  return (local - at.getTime()) / 60_000
}

/**
 * Event start times entered without an offset (for example from a
 * datetime-local input or an agent) are UK wall-clock times. Interpreting
 * them in Europe/London keeps stored instants identical regardless of the
 * organiser's device or the server's time zone.
 */
export function parseEventStart(value: string) {
  if (!wallClockPattern.test(value)) return new Date(value)
  const guess = new Date(`${value}Z`)
  if (Number.isNaN(guess.getTime())) return guess
  const firstPass = new Date(guess.getTime() - timeZoneOffsetMinutes(guess) * 60_000)
  return new Date(guess.getTime() - timeZoneOffsetMinutes(firstPass) * 60_000)
}

export function prepareEventDraft(
  input: EventDraftInput,
  command: PrepareEventDraftCommand,
): EventDraft {
  const organisationId = input.organisationId.trim()
  const name = normaliseText(input.name)
  const venue = normaliseText(input.venue)
  const parsedStartsAt = parseEventStart(input.startsAt)
  const startsAt = Number.isNaN(parsedStartsAt.getTime()) ? '' : parsedStartsAt.toISOString()
  const errors: EventDraftIssue[] = []
  const warnings: EventDraftIssue[] = []

  if (!organisationId) {
    errors.push({ field: 'organisationId', message: 'Select an organisation.' })
  } else if (!command.authorisedOrganisationIds.includes(organisationId)) {
    errors.push({ field: 'organisationId', message: 'Select an organisation you can manage.' })
  }
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
    organisationId,
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
    organisationId: draft.organisationId,
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
    targetLabel: event.name,
    actor: cloneActor(command.actor),
    occurredAt: command.createdAt,
    outcome: 'succeeded',
    resultSummary: `Created with capacity ${event.capacity}.`,
    ...(command.toolName ? { toolName: command.toolName } : {}),
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
      email: attendee.email,
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

  const matchRank = (name: string, email: string) => {
    const normalisedName = name.toLocaleLowerCase('en-GB')
    const normalisedEmail = email.toLocaleLowerCase('en-GB')
    if (normalisedName === query) return 0
    if (query.includes('@') && normalisedEmail === query) return 0
    if (normalisedName.startsWith(query)) return 1
    if (normalisedName.split(/\s+/).some((part) => part.startsWith(query))) return 2
    if (normalisedName.includes(query) || (query.includes('@') && normalisedEmail.includes(query))) return 3
    return null
  }

  return listAttendees(state)
    .map((attendee, index) => ({ attendee, index, rank: matchRank(attendee.name, attendee.email) }))
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
  const attendee = state.attendees.find((item) => item.id === command.attendeeId)
  invariant(attendee, 'Attendee does not exist')
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
    targetLabel: attendee.name,
    actor: cloneActor(command.actor),
    occurredAt: command.checkedInAt,
    outcome: 'succeeded',
    resultSummary: `Checked in · ${getEventSnapshot(state).occupancy + 1} of ${state.event.capacity}.`,
    ...(command.toolName ? { toolName: command.toolName } : {}),
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
    targetLabel: 'Evacuation accountability',
    actor: cloneActor(command.actor),
    occurredAt: command.startedAt,
    outcome: 'succeeded',
    resultSummary: `Started for ${session.records.length} checked-in attendees.`,
    ...(command.toolName ? { toolName: command.toolName } : {}),
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
  invariant(session.status === 'active', 'The accountability session is closed')
  invariant(session.records.some((record) => record.attendeeId === command.attendeeId), 'Attendee is not part of the active accountability session')

  const records = session.records.map((record): AccountabilityRecord => record.attendeeId === command.attendeeId ? {
    attendeeId: record.attendeeId,
    status: command.status,
    updatedAt: command.recordedAt,
    updatedBy: cloneActor(command.actor),
    ...(command.note ? { note: command.note } : {}),
  } : record)
  const attendee = state.attendees.find((item) => item.id === command.attendeeId)
  invariant(attendee, 'Attendee does not exist')
  const accountedFor = records.filter((record) => record.status === 'accounted-for').length
  const statusLabel = command.status === 'accounted-for'
    ? 'Accounted for'
    : command.status === 'exempt-not-present'
      ? 'Exempt — not present'
      : 'Unconfirmed'
  const activityEntry: ActivityEntry = {
    id: command.activityId,
    eventId: state.event.id,
    action: 'accountability-status-recorded',
    targetId: command.attendeeId,
    targetLabel: attendee.name,
    actor: cloneActor(command.actor),
    occurredAt: command.recordedAt,
    outcome: 'succeeded',
    resultSummary: `${statusLabel} · ${accountedFor} of ${records.length} accounted for.`,
    ...(command.toolName ? { toolName: command.toolName } : {}),
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

export function closeAccountabilitySession(
  state: EventOperationsState,
  command: CloseAccountabilityCommand,
): OperationsTransition {
  const session = state.accountabilitySession
  invariant(session, 'No accountability session is active')
  invariant(session.status === 'active', 'The accountability session is already closed')

  const accountabilitySnapshot = getAccountabilitySnapshot(state)
  invariant(accountabilitySnapshot, 'Accountability totals are unavailable')
  const activityEntry: ActivityEntry = {
    id: command.activityId,
    eventId: state.event.id,
    action: 'accountability-closed',
    targetId: session.id,
    targetLabel: 'Evacuation accountability',
    actor: cloneActor(command.actor),
    occurredAt: command.closedAt,
    outcome: 'succeeded',
    resultSummary: `Closed · ${accountabilitySnapshot.unconfirmed} unconfirmed.`,
    ...(command.toolName ? { toolName: command.toolName } : {}),
    isSynthetic: true,
  }
  const nextState = createEventOperationsState({
    ...state,
    activityEntries: [...state.activityEntries, activityEntry],
    accountabilitySession: {
      ...session,
      status: 'closed',
      closedAt: command.closedAt,
      closedBy: cloneActor(command.actor),
    },
  })

  return {
    state: nextState,
    eventSnapshot: getEventSnapshot(nextState),
    accountabilitySnapshot,
    activityEntry,
  }
}
